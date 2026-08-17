'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const { validateProgressEvent } = require('../domain/quests/objectives');
const {
    collectEligibilityRequirements,
    evaluateRule,
    validateEligibilityRule,
    validateRule
} = require('../domain/quests/v2/rules');
const { validateEvidence } = require('../domain/quests/v2/evidence');
const { assertTransition } = require('../domain/quests/v2/transitions');
const {
    QuestStepGraphError,
    validateVerificationPlan
} = require('../domain/quests/v2/dependencies');
const { QuestV2CatalogRepository } = require('../repositories/quest-v2-catalog-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const { sourceGrantForEvent } = require('../domain/rewards/source-grant-policy');
const pack = require('../content/streamer-world/quests');

const ACTIVE = new Set(['offered', 'accepted', 'active', 'submitted', 'under_review', 'returned']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REGISTERED_TRUSTED_EVENTS = new Set([
    'adventure.chapter.completed', 'quiz.round.completed', 'doudizhu.match.won',
    'story.choice.committed', 'story.episode.completed', 'game.run.completed'
]);
// Trusted producers run on the server side, but a small amount of clock skew is
// tolerated for multi-instance deployments. Events further ahead are rejected
// before they can enter durable history or influence an assignment.
const MAX_TRUSTED_EVENT_FUTURE_MS = 5 * 60 * 1000;

class QuestV2ServiceError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'QuestV2ServiceError';
        this.code = code;
        this.status = status;
    }
}

function positiveId(value, field = 'id') {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) throw new QuestV2ServiceError('INVALID_ID', 400, `Invalid ${field}`);
    return number;
}

function boundedText(value, maximum, field, required = false) {
    const text = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    if ((required && !text) || text.length > maximum || /[\u0000-\u001f\u007f]/u.test(text)) {
        throw new QuestV2ServiceError('INVALID_INPUT', 400, `Invalid ${field}`);
    }
    return text;
}

function oneOf(value, allowed, field) {
    if (!allowed.includes(value)) throw new QuestV2ServiceError('INVALID_INPUT', 400, `Invalid ${field}`);
    return value;
}

function boundedInteger(value, minimum, maximum, field) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
        throw new QuestV2ServiceError('INVALID_INPUT', 400, `Invalid ${field}`);
    }
    return number;
}

function uuidFor(...parts) {
    const hex = crypto.createHash('sha256').update(parts.join(':')).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function sameEvent(row, event) {
    return row.source_type === event.sourceType
        && row.dedupe_key === event.dedupeKey
        && row.event_type === event.eventType
        && Number(row.actor_user_id) === event.actorUserId
        && Number(row.subject_user_id) === event.subjectUserId
        && new Date(row.occurred_at).toISOString() === event.occurredAt
        && row.correlation_id === event.correlationId
        && stableStringify(row.payload) === stableStringify(event.payload);
}

function collectRuleEvents(rule, found = new Set()) {
    if (rule.event) found.add(rule.event);
    if (Array.isArray(rule.events)) rule.events.forEach((event) => found.add(event));
    if (Array.isArray(rule.rules)) rule.rules.forEach((child) => collectRuleEvents(child, found));
    if (rule.rule) collectRuleEvents(rule.rule, found);
    return found;
}

function validateRegisteredRule(rule) {
    const normalized = validateRule(rule);
    for (const event of collectRuleEvents(normalized)) {
        if (!REGISTERED_TRUSTED_EVENTS.has(event)) {
            throw new QuestV2ServiceError('UNREGISTERED_TRUSTED_EVENT', 400, 'Quest rule references an unregistered trusted event');
        }
    }
    return normalized;
}

function validateInternalStoryEvent(raw) {
    if (!raw || raw.sourceType !== 'story' || !['story.choice.committed', 'story.episode.completed'].includes(raw.eventType)) {
        throw new QuestV2ServiceError('INVALID_TRUSTED_EVENT', 400, 'Invalid internal story event');
    }
    if (Object.keys(raw).some((key) => !['sourceType', 'sourceEventId', 'username', 'eventType', 'occurredAt', 'payload'].includes(key))) {
        throw new QuestV2ServiceError('INVALID_TRUSTED_EVENT', 400, 'Internal story event contains unsupported fields');
    }
    const keys = Object.keys(raw.payload || {}).sort();
    const expected = raw.eventType === 'story.choice.committed'
        ? ['choiceId', 'contentVersion', 'episodeSlug', 'runId'] : ['contentVersion', 'episodeSlug', 'runId'];
    if (stableStringify(keys) !== stableStringify(expected.sort())
        || !Number.isSafeInteger(raw.payload.runId) || raw.payload.runId < 1
        || !Number.isSafeInteger(raw.payload.contentVersion) || raw.payload.contentVersion < 1
        || !/^[a-z][a-z0-9.-]{2,119}$/.test(raw.payload.episodeSlug)
        || (raw.payload.choiceId !== undefined && !/^[a-z][a-z0-9.-]{2,119}$/.test(raw.payload.choiceId))
        || !/^story-(event|episode):[A-Za-z0-9:.-]{8,170}$/.test(raw.sourceEventId || '')
        || !raw.username || !Number.isFinite(Date.parse(raw.occurredAt))) {
        throw new QuestV2ServiceError('INVALID_TRUSTED_EVENT', 400, 'Malformed internal story event');
    }
    return { sourceType: 'story', sourceEventId: raw.sourceEventId, username: raw.username,
        eventType: raw.eventType, occurredAt: new Date(raw.occurredAt).toISOString(), payload: { ...raw.payload } };
}

function validateInternalGameEvent(raw) {
    if (!raw || raw.sourceType !== 'streamer_game' || raw.eventType !== 'game.run.completed') {
        throw new QuestV2ServiceError('INVALID_TRUSTED_EVENT', 400, 'Invalid internal game event');
    }
    if (Object.keys(raw).some(key => !['sourceType', 'sourceEventId', 'username', 'eventType', 'occurredAt', 'payload'].includes(key))) {
        throw new QuestV2ServiceError('INVALID_TRUSTED_EVENT', 400, 'Internal game event contains unsupported fields');
    }
    const payload = raw.payload || {};
    const keys = Object.keys(payload).sort();
    const expected = ['challengeId', 'configVersion', 'difficulty', 'gameId', 'mode', 'runId', 'score'].sort();
    if (stableStringify(keys) !== stableStringify(expected)
        || !UUID_PATTERN.test(payload.runId || '')
        || !/^[a-z][a-z0-9-]{2,39}$/.test(payload.gameId || '')
        || !/^[a-z][a-z0-9-]{2,79}$/.test(payload.challengeId || '')
        || !/^[A-Za-z0-9._-]{3,64}$/.test(payload.configVersion || '')
        || !['gentle', 'standard', 'expert'].includes(payload.difficulty)
        || !['solo', 'coop'].includes(payload.mode)
        || !Number.isSafeInteger(payload.score) || payload.score < 0 || payload.score > 100000000
        || raw.sourceEventId !== `game-run:${payload.runId}`
        || typeof raw.username !== 'string' || raw.username.length < 1 || raw.username.length > 64
        || /[\u0000-\u001f\u007f]/u.test(raw.username)
        || !Number.isFinite(Date.parse(raw.occurredAt))) {
        throw new QuestV2ServiceError('INVALID_TRUSTED_EVENT', 400, 'Malformed internal game event');
    }
    return { sourceType: raw.sourceType, sourceEventId: raw.sourceEventId, username: raw.username,
        eventType: raw.eventType, occurredAt: new Date(raw.occurredAt).toISOString(), payload: { ...payload } };
}

class QuestV2Service {
    constructor({
        pool,
        BalanceLogger,
        catalogRepositoryFactory,
        runtimeRepositoryFactory,
        achievementService = null,
        rewardGrantIntentWriter = null,
        ownerUsername = null,
        clock = () => new Date()
    }) {
        if (!pool?.connect || !BalanceLogger?.updateBalance) throw new TypeError('Quest V2 service requires pool and BalanceLogger');
        if (typeof clock !== 'function') throw new TypeError('Quest V2 service requires a clock function');
        this.pool = pool;
        this.BalanceLogger = BalanceLogger;
        this.catalogRepositoryFactory = catalogRepositoryFactory || ((client) => new QuestV2CatalogRepository(client));
        this.runtimeRepositoryFactory = runtimeRepositoryFactory || ((client) => new QuestV2RuntimeRepository(client));
        this.achievementService = achievementService;
        this.rewardGrantIntentWriter = rewardGrantIntentWriter;
        this.ownerUsername = typeof ownerUsername === 'string' && ownerUsername.trim()
            ? ownerUsername.trim() : null;
        this.clock = clock;
    }

    async transaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async seed(client) {
        for (const quest of pack.quests) {
            const eligibilityRule = validateEligibilityRule(quest.eligibilityRule);
            collectEligibilityRequirements(eligibilityRule);
            validateRegisteredRule(quest.completionRule);
        }
        await this.catalogRepositoryFactory(client).seedBuiltInContent(pack);
    }

    async initialize() {
        return this.transaction(async (client) => {
            await this.seed(client);
            const catalog = this.catalogRepositoryFactory(client);
            return this._materializeWeeklyBoards(catalog, { horizonWeeks: 12 });
        });
    }

    async finalize(context, client, status, body) {
        if (typeof context?.finalizeIdempotency === 'function') {
            await context.finalizeIdempotency(client, status, body);
        }
    }

    async emitAssignmentCompletedAchievement(client, assignment, values, context = {}) {
        if (!this.achievementService?.recordTrustedEvent) return null;
        const event = {
            sourceType: 'quest',
            sourceEventId: values.sourceEventId,
            eventType: 'quest.assignment.completed',
            occurredAt: values.occurredAt,
            payload: {
                assignmentId: Number(assignment.id),
                questSlug: assignment.slug,
                category: assignment.category,
                verification: values.verification,
                rewardPoints: Number(assignment.reward_points),
                board: Boolean(assignment.board_id),
                resubmitted: values.resubmitted === true,
                chainNode: assignment.chain_node_key || ''
            }
        };
        return this.achievementService.recordTrustedEvent(
            client, values.username || assignment.username, event, context
        );
    }

    async emitLifecycleAchievement(client, username, assignment, eventType, sourceEventId,
        context = {}) {
        if (!this.achievementService?.recordTrustedEvent) return null;
        return this.achievementService.recordTrustedEvent(client, username, {
            sourceType: 'quest',
            sourceEventId,
            eventType,
            occurredAt: new Date(this.clock()).toISOString(),
            payload: {
                assignmentId: Number(assignment.id),
                questSlug: assignment.slug
            }
        }, context);
    }

    async emitChainCompletedAchievement(client, runtime, assignment, username, context = {}) {
        if (!assignment.chain_id
            || (!this.achievementService?.recordTrustedEvent
                && !this.rewardGrantIntentWriter?.enqueue)) return null;
        const sourceEventId = `quest-chain:${Number(assignment.user_id)}:${Number(assignment.chain_id)}`;
        const completion = await runtime.recordChainCompletion({
            id: crypto.randomUUID(),
            userId: Number(assignment.user_id),
            chainId: Number(assignment.chain_id),
            assignmentId: Number(assignment.id),
            sourceEventId
        });
        if (!completion) return null;
        const event = {
            sourceType: 'quest',
            sourceEventId: completion.source_event_id,
            eventType: 'quest.chain.completed',
            occurredAt: new Date(completion.created_at).toISOString(),
            payload: {
                chain: completion.chain_slug,
                assignmentId: Number(completion.trigger_assignment_id)
            }
        };
        if (this.achievementService?.recordTrustedEvent) {
            await this.achievementService.recordTrustedEvent(client, username, event, context);
        }
        const reward = sourceGrantForEvent('quest', event);
        if (reward && this.rewardGrantIntentWriter?.enqueue) {
            await this.rewardGrantIntentWriter.enqueue(client, {
                ...reward,
                userId: Number(assignment.user_id)
            });
        }
        return completion;
    }

    async _materializeWeeklyBoards(catalog, {
        horizonWeeks = 12,
        timezones = null,
        asOf = null
    } = {}) {
        if (!Number.isSafeInteger(horizonWeeks) || horizonWeeks < 1 || horizonWeeks > 26) {
            throw new QuestV2ServiceError('INVALID_SCHEDULE_HORIZON', 400,
                'Weekly board horizon must be between one and twenty-six weeks');
        }
        if (typeof catalog?.materializeWeeklyBoards !== 'function') {
            return { timezones: 0, inserted: 0, current: 0, future: 0 };
        }
        const requested = timezones || (typeof catalog.listCreatorTimezones === 'function'
            ? await catalog.listCreatorTimezones() : ['UTC']);
        const unique = [...new Set(requested)];
        if (unique.length < 1 || unique.length > 100
            || unique.some((timezone) => typeof timezone !== 'string'
                || timezone.length < 1 || timezone.length > 80
                || /[\u0000-\u001f\u007f]/u.test(timezone))) {
            throw new Error('Quest weekly materialization received an invalid creator timezone');
        }
        const totals = { timezones: unique.length, inserted: 0, current: 0, future: 0 };
        for (const timezone of unique) {
            const result = await catalog.materializeWeeklyBoards({
                timezone, horizonWeeks, asOf
            });
            totals.inserted += Number(result.inserted || 0);
            totals.current += Number(result.current || 0);
            totals.future += Number(result.future || 0);
        }
        return totals;
    }

    async materializeWeeklyBoards(options = {}) {
        return this.transaction((client) => this._materializeWeeklyBoards(
            this.catalogRepositoryFactory(client), options
        ));
    }

    async journal(username) {
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const catalog = this.catalogRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            if (!creator) throw new QuestV2ServiceError('CREATOR_PROFILE_REQUIRED', 409, 'Creator profile required');
            await this._materializeWeeklyBoards(catalog, {
                horizonWeeks: 12,
                timezones: [creator.timezone]
            });
            const blocked = new Set(await catalog.listBlockedCategories(creator.id));
            const assignments = await runtime.listAssignments(creator.id);
            const steps = await runtime.listAssignmentSteps(creator.id, assignments.map((item) => item.id));
            return {
                assignments: assignments.map((item) => ({ ...item, steps: steps.filter((step) => step.assignment_id === item.id) })),
                appeals: typeof runtime.listAppeals === 'function'
                    ? await runtime.listAppeals(creator.id) : [],
                boards: (await catalog.listBoards(creator.id)).filter((item) => !blocked.has(item.category)),
                chains: (await catalog.listChains(creator.id)).filter((item) => !blocked.has(item.category)),
                legacy: await catalog.listLegacyTaskCards(username)
            };
        });
    }

    async offer(username, input, context = {}) {
        const versionId = positiveId(input?.versionId, 'versionId');
        const boardId = input?.boardId == null ? null : positiveId(input.boardId, 'boardId');
        const chainId = input?.chainId == null ? null : positiveId(input.chainId, 'chainId');
        if ((boardId === null) === (chainId === null)) throw new QuestV2ServiceError('INVALID_SOURCE', 400, 'Choose one assignment source');
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const catalog = this.catalogRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            if (!creator) throw new QuestV2ServiceError('CREATOR_PROFILE_REQUIRED', 409, 'Creator profile required');
            await this._materializeWeeklyBoards(catalog, {
                horizonWeeks: 12,
                timezones: [creator.timezone]
            });
            const candidate = await catalog.loadOfferCandidate(creator.id, versionId, boardId, chainId);
            const blocked = new Set(await catalog.listBlockedCategories(creator.id));
            if (!candidate || blocked.has(candidate.category)) {
                throw new QuestV2ServiceError('QUEST_NOT_ELIGIBLE', 403, 'Quest is unavailable');
            }
            const eligibilityRule = validateEligibilityRule(candidate.eligibility_rule);
            const requirements = collectEligibilityRequirements(eligibilityRule);
            const facts = await runtime.loadEligibilityFacts(creator.id, requirements);
            if (!evaluateRule(eligibilityRule, {
                relationshipLevel: creator.relationship_level,
                achievements: facts.achievements,
                storyFlags: facts.storyFlags,
                collectionItems: facts.collectionItems
            })) {
                throw new QuestV2ServiceError('QUEST_NOT_ELIGIBLE', 403, 'Quest is unavailable');
            }
            const source = boardId ? 'board' : 'chain';
            const offered = await catalog.offerAssignment({
                userId: creator.id, versionId, boardId, chainId, source,
                assignmentKey: `${source}:${boardId || chainId}:user:${creator.id}:version:${versionId}`
            });
            if (!offered) throw new QuestV2ServiceError('QUEST_ALREADY_ACTIVE_OR_COOLDOWN', 409, 'Quest is active or cooling down');
            const body = { success: true, assignmentId: Number(offered.id), status: 'offered' };
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(offered.id, 'offer', context.requestId || `${source}:${versionId}`),
                assignmentId: offered.id, actorType: 'system', actorUsername: null,
                eventType: 'quest.offered', fromStatus: null, toStatus: 'offered',
                dedupeKey: context.requestId || `offer:${source}:${versionId}`,
                payload: { source, boardId, chainId }, requestId: context.requestId
            });
            await runtime.insertAudit({ assignmentId: offered.id, actorType: 'creator', actorUsername: username, action: 'quest.offered', details: { source }, requestId: context.requestId });
            await this.finalize(context, client, 201, body);
            return body;
        });
    }

    async transition(username, input, action, context = {}) {
        const assignmentId = positiveId(input?.assignmentId, 'assignmentId');
        const expectedRevision = Number(input?.expectedRevision);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new QuestV2ServiceError('INVALID_REVISION', 400, 'Invalid revision');
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            if (!creator) throw new QuestV2ServiceError('CREATOR_PROFILE_REQUIRED', 409, 'Creator profile required');
            const assignment = await runtime.lockAssignment(creator.id, assignmentId);
            if (!assignment) throw new QuestV2ServiceError('QUEST_NOT_FOUND', 404, 'Quest not found');
            if (assignment.overdue === true && ['accept', 'submit'].includes(action)) {
                throw new QuestV2ServiceError('QUEST_ASSIGNMENT_EXPIRED', 410,
                    'Quest deadline has passed');
            }
            let next;
            if (action === 'accept') next = 'accepted';
            else if (action === 'decline') next = 'declined';
            else if (action === 'submit') next = 'submitted';
            else throw new QuestV2ServiceError('INVALID_ACTION', 400, 'Invalid action');
            assertTransition(assignment.status, next);
            if (next === 'submitted') {
                if (assignment.review_policy === 'none') {
                    throw new QuestV2ServiceError('QUEST_REVIEW_NOT_REQUIRED', 409,
                        'This quest does not use human review');
                }
                const readiness = await runtime.assignmentSubmissionReadiness(assignmentId);
                const submitted = readiness.submitted === undefined
                    ? (readiness.ready === readiness.required ? readiness.ready : 0)
                    : readiness.submitted;
                const pendingReviewable = readiness.pendingReviewable === undefined
                    ? (readiness.ready === readiness.required ? 0 : 1)
                    : readiness.pendingReviewable;
                if (submitted < 1 || pendingReviewable > 0) {
                    throw new QuestV2ServiceError('EVIDENCE_REQUIRED', 409, 'Required evidence is incomplete');
                }
            }
            let changed = await runtime.transitionAssignment(assignmentId, expectedRevision, [assignment.status], next);
            if (!changed) throw new QuestV2ServiceError('QUEST_VERSION_CONFLICT', 409, 'Quest changed concurrently');
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignmentId, action, context.requestId || expectedRevision), assignmentId,
                actorType: 'creator', actorUsername: username, eventType: `quest.${action}`,
                fromStatus: assignment.status, toStatus: next,
                dedupeKey: context.requestId || `${action}:${expectedRevision}`, payload: {}, requestId: context.requestId
            });
            if (next === 'declined') {
                await this.emitLifecycleAchievement(client, username, assignment,
                    'quest.assignment.declined',
                    `achievement-quest-declined:${assignmentId}:${changed.revision}`, context);
            }
            if (next === 'accepted') {
                await runtime.initializeSteps(assignmentId, assignment.version_id);
                const accepted = changed;
                changed = await runtime.transitionAssignment(assignmentId, changed.revision, ['accepted'], 'active');
                if (!changed) throw new Error('Quest activation raced');
                await runtime.insertAssignmentEvent({
                    eventId: uuidFor(assignmentId, 'activate', context.requestId || expectedRevision), assignmentId,
                    actorType: 'system', actorUsername: null, eventType: 'quest.activated',
                    fromStatus: accepted.status, toStatus: 'active',
                    dedupeKey: `${context.requestId || `accept:${expectedRevision}`}:activate`, payload: {}, requestId: context.requestId
                });
            }
            if (next === 'submitted') {
                const submitted = changed;
                changed = await runtime.transitionAssignment(assignmentId, changed.revision, ['submitted'], 'under_review');
                if (!changed) throw new Error('Quest review queue transition raced');
                await runtime.insertAssignmentEvent({
                    eventId: uuidFor(assignmentId, 'review-queue', context.requestId || expectedRevision), assignmentId,
                    actorType: 'system', actorUsername: null, eventType: 'quest.under_review',
                    fromStatus: submitted.status, toStatus: 'under_review',
                    dedupeKey: `${context.requestId || `submit:${expectedRevision}`}:review`, payload: {}, requestId: context.requestId
                });
            }
            const body = { success: true, assignmentId, status: changed.status, revision: Number(changed.revision) };
            await runtime.insertAudit({ assignmentId, actorType: 'creator', actorUsername: username, action: `quest.${action}`, details: { from: assignment.status, to: changed.status }, requestId: context.requestId });
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async postpone(username, input, context = {}) {
        const assignmentId = positiveId(input?.assignmentId, 'assignmentId');
        const expectedRevision = Number(input?.expectedRevision);
        const hours = Number(input?.hours);
        if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
            || !Number.isSafeInteger(hours) || hours < 1) {
            throw new QuestV2ServiceError('INVALID_POSTPONE', 400, 'Invalid postpone request');
        }
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            const assignment = creator && await runtime.lockAssignment(creator.id, assignmentId);
            const maximum = Number(assignment?.postpone_policy?.maxHours || 0);
            if (!assignment || assignment.postpone_policy?.allowed !== true
                || !['offered', 'active', 'returned'].includes(assignment.status)
                || !Number.isSafeInteger(maximum) || maximum < 1
                || hours > maximum
                || Number(assignment.postponed_hours || 0) + hours > maximum
                || !assignment.due_at
                || new Date(assignment.due_at).getTime() <= new Date(this.clock()).getTime()) {
                throw new QuestV2ServiceError('POSTPONE_UNAVAILABLE', 409, 'Postpone is unavailable');
            }
            const changed = await runtime.postponeAssignment(
                assignmentId, expectedRevision, hours, maximum
            );
            if (!changed) throw new QuestV2ServiceError('QUEST_VERSION_CONFLICT', 409, 'Quest changed concurrently');
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignmentId, 'postpone', context.requestId || expectedRevision),
                assignmentId, actorType: 'creator', actorUsername: username,
                eventType: 'quest.assignment.postponed',
                fromStatus: assignment.status, toStatus: assignment.status,
                dedupeKey: context.requestId || `postpone:${expectedRevision}`,
                payload: {
                    hours,
                    dueAtBefore: assignment.due_at,
                    dueAtAfter: changed.due_at,
                    postponedHours: Number(changed.postponed_hours)
                },
                requestId: context.requestId
            });
            await this.emitLifecycleAchievement(client, username, assignment,
                'quest.assignment.postponed',
                `achievement-quest-postponed:${assignmentId}:${changed.revision}`, context);
            const body = {
                success: true,
                assignmentId,
                revision: Number(changed.revision),
                postponeUntil: changed.postpone_until,
                dueAt: changed.due_at,
                postponedHours: Number(changed.postponed_hours)
            };
            await runtime.insertAudit({ assignmentId, actorType: 'creator', actorUsername: username,
                action: 'quest.assignment.postponed', details: {
                    hours,
                    dueAtBefore: assignment.due_at,
                    dueAtAfter: changed.due_at,
                    postponedHours: Number(changed.postponed_hours)
                }, requestId: context.requestId });
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async expireDueAssignments({ limit = 100 } = {}) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new QuestV2ServiceError('INVALID_EXPIRY_LIMIT', 400,
                'Quest expiry batch limit must be between one and one hundred');
        }
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const due = await runtime.lockDueAssignments(limit);
            const assignmentIds = [];
            for (const assignment of due) {
                const changed = await runtime.expireAssignment(
                    Number(assignment.id), Number(assignment.revision)
                );
                if (!changed) continue;
                const dedupe = `expiry:${new Date(assignment.due_at).toISOString()}`;
                await runtime.insertAssignmentEvent({
                    eventId: uuidFor(assignment.id, 'expiry', dedupe),
                    assignmentId: assignment.id,
                    actorType: 'system', actorUsername: null,
                    eventType: 'quest.assignment.expired',
                    fromStatus: assignment.status, toStatus: 'expired',
                    dedupeKey: dedupe,
                    payload: { dueAt: assignment.due_at, occurrence: Number(assignment.occurrence || 1) }
                });
                await runtime.insertAudit({
                    assignmentId: assignment.id,
                    actorType: 'system',
                    action: 'quest.assignment.expired',
                    details: {
                        dueAt: assignment.due_at,
                        fromStatus: assignment.status,
                        occurrence: Number(assignment.occurrence || 1)
                    }
                });
                assignmentIds.push(Number(assignment.id));
            }
            return { processed: assignmentIds.length, assignmentIds };
        });
    }

    async submitEvidence(username, input, context = {}) {
        const assignmentId = positiveId(input?.assignmentId, 'assignmentId');
        const stepId = positiveId(input?.stepId, 'stepId');
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            const step = creator && await runtime.lockEvidenceStep(creator.id, assignmentId, stepId);
            if (!step || !['active', 'returned'].includes(step.assignment_status)
                || !['active', 'returned'].includes(step.step_status)
                || step.overdue === true) {
                throw new QuestV2ServiceError('STEP_UNAVAILABLE', 409, 'Quest step unavailable');
            }
            const evidence = await validateEvidence(input?.evidence, { expectedKind: step.evidence_kind });
            const quota = await runtime.evidenceQuota(creator.id, assignmentId, stepId);
            const newBytes = evidence.media?.byteCount || Buffer.byteLength(stableStringify(evidence.content), 'utf8');
            if (quota.retainedBytes + newBytes > 5 * 1024 * 1024) {
                throw new QuestV2ServiceError('EVIDENCE_STORAGE_LIMIT', 413, 'Evidence storage limit reached');
            }
            if (quota.recentCount >= 50 || quota.stepVersions >= 5) {
                throw new QuestV2ServiceError('EVIDENCE_RATE_LIMIT', 429, 'Evidence submission limit reached');
            }
            const evidenceId = uuidFor('evidence', assignmentId, stepId, context.requestId || input?.commandId || 'missing');
            const retentionDays = Object.freeze({ minimum: 7, standard: 30, extended: 90 })[creator.evidence_retention];
            if (!retentionDays) throw new Error('Unknown evidence retention policy');
            const inserted = await runtime.insertEvidence({
                id: evidenceId, assignmentId, stepId, userId: creator.id, kind: evidence.kind,
                content: evidence.content,
                contentSha256: crypto.createHash('sha256').update(stableStringify(evidence.content)).digest('hex'),
                media: evidence.media,
                retentionUntil: new Date(Date.now() + retentionDays * 86400000).toISOString()
            });
            if (!inserted) throw new QuestV2ServiceError('EVIDENCE_REPLAY_CONFLICT', 409, 'Evidence command already used');
            const changed = await runtime.markStepSubmitted(assignmentId, stepId, Number(step.step_revision), evidenceId);
            if (!changed) throw new QuestV2ServiceError('STEP_VERSION_CONFLICT', 409, 'Quest step changed concurrently');
            const body = { success: true, assignmentId, stepId, evidenceId, reviewRequired: true };
            await runtime.insertAudit({ assignmentId, actorType: 'creator', actorUsername: username, action: 'quest.evidence.submitted', details: { stepId, kind: evidence.kind, sha256: evidence.media?.sha256 || null }, requestId: context.requestId });
            await this.finalize(context, client, 201, body);
            return body;
        });
    }

    async settle(runtime, assignment, actor, context) {
        const key = `quest-v2:${assignment.id}:completion:${assignment.reward_policy_version}`;
        const inserted = await runtime.insertSettlement({ key, assignmentId: assignment.id, userId: assignment.user_id, rewardPolicyVersion: assignment.reward_policy_version, rewardPoints: Number(assignment.reward_points) });
        if (!inserted) throw new Error('Quest settlement already exists for active assignment');
        let balance = null;
        if (Number(assignment.reward_points) > 0) {
            const result = await this.BalanceLogger.updateBalance({
                username: assignment.username || actor, amount: Number(assignment.reward_points),
                operationType: 'quest_auto_reward', description: `完成任务：${assignment.slug}`,
                gameData: { settlementKey: key, assignmentId: Number(assignment.id), verification: assignment.verification_mode },
                ipAddress: context.ipAddress || null, userAgent: context.userAgent || null,
                requestId: context.requestId || null, requireSufficientBalance: false,
                client: runtime.client, managedTransaction: true
            });
            if (!result.success) throw new Error('Quest reward ledger update failed');
            await runtime.markSettlementPosted(key, result.balanceBefore, result.balance);
            balance = result.balance;
        }
        return { settlementKey: key, rewardEarned: Number(assignment.reward_points), balance };
    }

    async unlockDependentSteps(runtime, assignment, {
        actorType = 'system',
        actorUsername = null,
        requestId = null
    } = {}) {
        if (typeof runtime.unlockEligibleSteps !== 'function') return [];
        const unlocked = await runtime.unlockEligibleSteps(Number(assignment.id));
        for (const step of unlocked) {
            const stepId = Number(step.step_definition_id);
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignment.id, 'step-unlocked', stepId),
                assignmentId: assignment.id,
                actorType,
                actorUsername,
                eventType: 'quest.step.unlocked',
                fromStatus: null,
                toStatus: null,
                dedupeKey: `step-unlocked:${stepId}`,
                payload: { stepId, stepKey: step.step_key },
                requestId
            });
            await runtime.insertAudit({
                assignmentId: assignment.id,
                actorType,
                actorUsername,
                action: 'quest.step.unlocked',
                details: { stepId, stepKey: step.step_key },
                requestId
            });
        }
        return unlocked;
    }

    async review(adminUsername, input, context = {}) {
        const assignmentId = positiveId(input?.assignmentId, 'assignmentId');
        const decision = input?.decision;
        if (!['approved', 'returned', 'rejected'].includes(decision)) throw new QuestV2ServiceError('INVALID_REVIEW', 400, 'Invalid review decision');
        const note = boundedText(input?.note, 1000, 'note', decision !== 'approved');
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const subjectUserId = await runtime.readAssignmentSubjectId(assignmentId);
            if (!subjectUserId) {
                throw new QuestV2ServiceError('QUEST_NOT_REVIEWABLE', 409,
                    'Quest is not reviewable');
            }
            const actors = await runtime.lockReviewerAndSubject(adminUsername, subjectUserId);
            const reviewer = actors.reviewer;
            if (!reviewer?.is_admin) {
                throw new QuestV2ServiceError('QUEST_REVIEW_FORBIDDEN', 403,
                    'Reviewer is not authorized by this quest policy');
            }
            if (!actors.subject) {
                throw new QuestV2ServiceError('QUEST_SUBJECT_UNAVAILABLE', 423,
                    'Quest creator account is locked or unavailable');
            }
            const assignment = await runtime.lockAssignmentForReview(assignmentId);
            if (!assignment || Number(assignment.user_id) !== Number(actors.subject.id)
                || assignment.username !== actors.subject.username
                || assignment.status !== 'under_review') {
                throw new QuestV2ServiceError('QUEST_NOT_REVIEWABLE', 409,
                    'Quest is not reviewable');
            }
            const configuredOwner = this.ownerUsername;
            const independentReviewRequired = assignment.review_policy === 'admin'
                || assignment.safety_class === 'sensitive';
            const ownerReview = !independentReviewRequired
                && assignment.review_policy === 'owner'
                && configuredOwner !== null && reviewer?.username === configuredOwner;
            const independentAdminReview = independentReviewRequired
                && reviewer?.is_admin === true
                && (configuredOwner === null || reviewer.username !== configuredOwner);
            if (!ownerReview && !independentAdminReview) {
                throw new QuestV2ServiceError('QUEST_REVIEW_FORBIDDEN', 403,
                    'Reviewer is not authorized by this quest policy');
            }
            const evidence = await runtime.lockLatestEvidence(assignmentId);
            if (evidence.length === 0) throw new QuestV2ServiceError('EVIDENCE_REQUIRED', 409, 'Evidence is required');
            for (const item of evidence) await runtime.insertEvidenceReview({ evidenceId: item.id, assignmentId, reviewerUsername: adminUsername, decision, note, requestId: context.requestId });
            const reviewedSteps = await runtime.markStepsReviewed(assignmentId, decision);
            if (!Array.isArray(reviewedSteps) || reviewedSteps.length < 1) {
                throw new Error('Quest review did not transition submitted evidence steps');
            }
            const actorType = ownerReview ? 'owner' : 'admin';
            const unlocked = decision === 'approved'
                ? await this.unlockDependentSteps(runtime, assignment, {
                    actorType, actorUsername: adminUsername, requestId: context.requestId
                }) : [];
            let settlement = { rewardEarned: 0, balance: null, settlementKey: null };
            let target;
            if (decision === 'approved') {
                const complete = await runtime.assignmentCompletionReadiness(assignmentId);
                target = complete ? 'completed' : 'active';
                if (complete) settlement = await this.settle(runtime, assignment, adminUsername, context);
            } else {
                target = decision === 'returned' ? 'returned' : 'rejected';
            }
            assertTransition(assignment.status, target);
            const changed = await runtime.transitionAssignment(assignmentId, Number(assignment.revision), [assignment.status], target);
            if (!changed) throw new QuestV2ServiceError('QUEST_VERSION_CONFLICT', 409, 'Quest changed concurrently');
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignmentId, `review-${decision}`, context.requestId || assignment.revision), assignmentId,
                actorType, actorUsername: adminUsername, eventType: `quest.review.${decision}`,
                fromStatus: assignment.status, toStatus: target,
                dedupeKey: context.requestId || `review:${decision}:${assignment.revision}`,
                payload: {
                    evidenceIds: evidence.map((item) => item.id),
                    reviewedStepIds: reviewedSteps.map((item) => Number(item.step_definition_id)),
                    unlockedStepIds: unlocked.map((item) => Number(item.step_definition_id)),
                    reviewPolicy: assignment.review_policy,
                    independentReviewRequired
                }, requestId: context.requestId
            });
            await runtime.insertAudit({ assignmentId, actorType, actorUsername: adminUsername,
                action: `quest.review.${decision}`, details: {
                    note,
                    target,
                    reviewPolicy: assignment.review_policy,
                    independentReviewRequired,
                    evidenceIds: evidence.map((item) => item.id),
                    reviewedStepIds: reviewedSteps.map((item) => Number(item.step_definition_id)),
                    unlockedStepIds: unlocked.map((item) => Number(item.step_definition_id)),
                    ...settlement
                }, requestId: context.requestId });
            if (target === 'completed') {
                await this.emitAssignmentCompletedAchievement(client, assignment, {
                    username: assignment.username,
                    sourceEventId: `achievement-quest-review:${assignmentId}:${changed.revision}`,
                    verification: assignment.verification_mode,
                    resubmitted: evidence.some(item => Number(item.submission_ordinal) > 1),
                    occurredAt: new Date(this.clock()).toISOString()
                }, context);
                await this.emitChainCompletedAchievement(
                    client, runtime, assignment, assignment.username, context
                );
            }
            const body = { success: true, assignmentId, status: target, ...settlement };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async recordTrustedEvent(client, rawEvent, context = {}) {
        const old = validateProgressEvent(rawEvent);
        return this._recordValidatedTrustedEvent(client, old, context);
    }

    async recordInternalTrustedEvent(client, rawEvent, context = {}) {
        const event = rawEvent?.sourceType === 'streamer_game'
            ? validateInternalGameEvent(rawEvent)
            : validateInternalStoryEvent(rawEvent);
        return this._recordValidatedTrustedEvent(client, event, context);
    }

    async _recordValidatedTrustedEvent(client, old, context = {}) {
        const receivedAtMs = new Date(this.clock()).getTime();
        if (!Number.isFinite(receivedAtMs)) throw new Error('Quest V2 clock returned an invalid time');
        if (new Date(old.occurredAt).getTime() > receivedAtMs + MAX_TRUSTED_EVENT_FUTURE_MS) {
            throw new QuestV2ServiceError('TRUSTED_EVENT_FUTURE_TIMESTAMP', 400,
                'Trusted event timestamp exceeds the allowed source clock skew');
        }
        const runtime = this.runtimeRepositoryFactory(client);
        const creator = await runtime.lockCreator(old.username);
        if (!creator) return { enabled: false, matches: [], rewardEarned: 0 };
        const event = {
            eventId: uuidFor('trusted', old.sourceType, old.sourceEventId), sourceType: old.sourceType,
            dedupeKey: old.sourceEventId, eventType: old.eventType, actorUserId: creator.id,
            subjectUserId: creator.id, occurredAt: old.occurredAt,
            correlationId: uuidFor('correlation', old.sourceType, old.sourceEventId), payload: old.payload
        };
        const inserted = await runtime.insertTrustedEvent(event);
        if (!inserted) {
            const persisted = await runtime.loadTrustedEvent(event.sourceType, event.dedupeKey);
            if (!persisted || !sameEvent(persisted, event) || !persisted.result) throw new Error('Trusted quest event identity collision or unfinished replay');
            return persisted.result;
        }
        const matches = [];
        let rewardEarned = 0;
        for (const assignment of await runtime.listTrustedCandidates(creator.id)) {
            // The repository owns the authoritative accepted/due/terminal
            // window and excludes events consumed by an earlier occurrence.
            // Never evaluate a creator-global history collection here.
            const history = await runtime.listAssignmentTrustedHistory(assignment.id);
            const steps = await runtime.listTrustedSteps(assignment.id);
            const relevantTypes = collectRuleEvents(assignment.completion_rule);
            for (const step of steps.filter((item) => item.status === 'active')) {
                collectRuleEvents(step.completion_rule, relevantTypes);
            }
            const consumedEventIds = [...new Set(history
                .filter((item) => relevantTypes.has(item.eventType))
                .map((item) => Number(item.trustedEventId))
                .filter(Number.isSafeInteger))];
            if (consumedEventIds.length > 0) {
                const consumed = await runtime.consumeTrustedEvents(assignment.id, consumedEventIds);
                if (new Set(consumed).size !== consumedEventIds.length) {
                    throw new Error('Trusted quest event consumption raced or violated its assignment window');
                }
            }
            const completedSteps = [];
            for (const step of steps.filter((item) => item.status === 'active')) {
                if (!evaluateRule(step.completion_rule, { events: history })) continue;
                const completed = await runtime.markTrustedStepCompleted(assignment.id, step.id, {
                    eventId: event.eventId,
                    trustedEventIds: consumedEventIds
                });
                if (completed !== null && completed !== false) completedSteps.push(Number(step.id));
            }
            const unlocked = completedSteps.length > 0
                ? await this.unlockDependentSteps(runtime, assignment, {
                    actorType: 'trusted_event', requestId: context.requestId
                }) : [];
            if (completedSteps.length === 0
                || !await runtime.assignmentCompletionReadiness(assignment.id)
                || (assignment.verification_mode !== 'hybrid'
                    && !evaluateRule(assignment.completion_rule, { events: history }))) continue;
            const settlement = await this.settle(runtime, { ...assignment, username: old.username }, old.username, context);
            const changed = await runtime.transitionAssignment(assignment.id, Number(assignment.revision), ['active'], 'completed');
            if (!changed) throw new Error('Trusted quest completion raced');
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignment.id, 'trusted-complete', event.eventId), assignmentId: assignment.id,
                actorType: 'trusted_event', actorUsername: null, eventType: 'quest.trusted.completed',
                fromStatus: 'active', toStatus: 'completed', dedupeKey: event.eventId,
                payload: {
                    completedSteps,
                    unlockedStepIds: unlocked.map((item) => Number(item.step_definition_id))
                }, requestId: context.requestId
            });
            await runtime.insertAudit({ assignmentId: assignment.id, actorType: 'trusted_event', action: 'quest.trusted.completed', details: {
                trustedEventId: event.eventId,
                consumedTrustedEventIds: consumedEventIds,
                eventWindow: {
                    acceptedAt: assignment.accepted_at,
                    dueAt: assignment.due_at || null,
                    terminalBefore: assignment.completed_at || assignment.resolved_at || null
                },
                completedSteps,
                unlockedStepIds: unlocked.map((item) => Number(item.step_definition_id)),
                ...settlement
            }, requestId: context.requestId });
            await this.emitAssignmentCompletedAchievement(client, assignment, {
                username: old.username,
                sourceEventId: `achievement-quest-trusted:${event.eventId}:${assignment.id}`,
                verification: 'automatic',
                resubmitted: false,
                occurredAt: event.occurredAt
            }, context);
            await this.emitChainCompletedAchievement(
                client, runtime, assignment, old.username, context
            );
            rewardEarned += settlement.rewardEarned;
            matches.push({ assignmentId: Number(assignment.id), status: 'completed', completedSteps, ...settlement });
        }
        const result = { enabled: true, eventId: event.eventId, eventType: event.eventType, matches, rewardEarned };
        await runtime.finalizeTrustedEvent(inserted.id, result);
        return result;
    }

    async importLegacy(username, input, context = {}) {
        const taskCardAssignmentId = positiveId(input?.taskCardAssignmentId, 'taskCardAssignmentId');
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            const card = creator && await runtime.loadLegacyCardForImport(creator.id, taskCardAssignmentId);
            if (!card) throw new QuestV2ServiceError('LEGACY_TASK_NOT_FOUND', 404, 'Legacy task card not found');
            const imported = await runtime.importLegacyCard(creator.id, card);
            const body = { success: true, ...imported, rewardEarned: 0, readOnly: true };
            await runtime.insertAudit({ assignmentId: imported.assignmentId, actorType: 'creator', actorUsername: username, action: 'quest.legacy.imported', details: { taskCardAssignmentId, originalRewardPoints: Number(card.reward_points), rewarded: false }, requestId: context.requestId });
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async studio(adminUsername) {
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const reviewer = adminUsername && typeof runtime.lockReviewer === 'function'
                ? await runtime.lockReviewer(adminUsername) : null;
            const reviewQueue = reviewer
                ? (await runtime.listReviewQueue(100)).filter((item) => (
                    (item.review_policy === 'owner'
                        && item.safety_class !== 'sensitive'
                        && this.ownerUsername !== null
                        && reviewer.username === this.ownerUsername)
                    || ((item.review_policy === 'admin' || item.safety_class === 'sensitive')
                        && (this.ownerUsername === null
                            || reviewer.username !== this.ownerUsername))
                )) : [];
            return {
                versions: await this.catalogRepositoryFactory(client).listStudioVersions({ limit: 100 }),
                reviewQueue,
                appeals: reviewer && typeof runtime.listPendingAppeals === 'function'
                    ? await runtime.listPendingAppeals(100) : []
            };
        });
    }

    async submitAppeal(username, input, context = {}) {
        const assignmentId = positiveId(input?.assignmentId, 'assignmentId');
        if (!UUID_PATTERN.test(input?.commandId || '')) {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid appeal command identity');
        }
        const reason = boundedText(input?.reason, 1000, 'reason', true);
        if (reason.length < 8) throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Appeal reason is too short');
        const semanticHash = crypto.createHash('sha256').update(stableStringify({
            action: 'quest.appeal.submit', username, assignmentId, reason
        })).digest('hex');
        return this.transaction(async client => {
            const runtime = this.runtimeRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            const assignment = creator && await runtime.lockAssignment(creator.id, assignmentId);
            if (!assignment || assignment.status !== 'rejected') {
                throw new QuestV2ServiceError('QUEST_APPEAL_UNAVAILABLE', 409,
                    'Only a rejected quest can be appealed');
            }
            const existing = await runtime.findAppealForAssignment(creator.id, assignmentId);
            if (existing) {
                if (existing.command_id !== input.commandId || existing.semantic_hash !== semanticHash) {
                    throw new QuestV2ServiceError('QUEST_APPEAL_EXISTS', 409,
                        'This assignment already has an appeal');
                }
                const body = { success: true, replayed: true, appealId: existing.id,
                    assignmentId, status: existing.status };
                await this.finalize(context, client, 200, body);
                return body;
            }
            const appeal = await runtime.insertAppeal({
                id: crypto.randomUUID(), assignmentId, userId: Number(creator.id),
                commandId: input.commandId, semanticHash, reason
            });
            if (!appeal) throw new Error('Quest appeal insertion failed');
            await runtime.insertAudit({ assignmentId, actorType: 'creator', actorUsername: username,
                action: 'quest.appeal.submitted', details: { appealId: appeal.id },
                requestId: context.requestId });
            const body = { success: true, replayed: false, appealId: appeal.id,
                assignmentId, status: appeal.status };
            await this.finalize(context, client, 201, body);
            return body;
        });
    }

    async resolveAppeal(adminUsername, input, context = {}) {
        if (!UUID_PATTERN.test(input?.appealId || '') || !UUID_PATTERN.test(input?.commandId || '')) {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid appeal resolution identity');
        }
        const decision = oneOf(input?.decision, ['accepted', 'dismissed'], 'decision');
        const note = boundedText(input?.note, 1000, 'note', true);
        if (note.length < 8) throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Appeal resolution is too short');
        const semanticHash = crypto.createHash('sha256').update(stableStringify({
            action: 'quest.appeal.resolve', adminUsername, appealId: input.appealId,
            commandId: input.commandId, decision, note
        })).digest('hex');
        return this.transaction(async client => {
            const runtime = this.runtimeRepositoryFactory(client);
            const subjectUserId = await runtime.readAppealSubjectId(input.appealId);
            if (!subjectUserId) {
                throw new QuestV2ServiceError('QUEST_APPEAL_NOT_FOUND', 404, 'Appeal not found');
            }
            const actors = await runtime.lockReviewerAndSubject(adminUsername, subjectUserId);
            const reviewer = actors.reviewer;
            if (!reviewer?.is_admin) {
                throw new QuestV2ServiceError('QUEST_REVIEW_FORBIDDEN', 403,
                    'Active administrator required');
            }
            if (!actors.subject) {
                throw new QuestV2ServiceError('QUEST_SUBJECT_UNAVAILABLE', 423,
                    'Quest creator account is locked or unavailable');
            }
            const appeal = await runtime.lockAppeal(input.appealId);
            if (!appeal || Number(appeal.user_id) !== Number(actors.subject.id)
                || appeal.username !== actors.subject.username) {
                throw new QuestV2ServiceError('QUEST_APPEAL_NOT_FOUND', 404, 'Appeal not found');
            }
            if (appeal.status === 'resolved') {
                if (appeal.resolution_command_id !== input.commandId
                    || appeal.resolution_semantic_hash !== semanticHash) {
                    throw new QuestV2ServiceError('QUEST_APPEAL_ALREADY_RESOLVED', 409,
                        'Appeal was already resolved');
                }
                const body = { success: true, replayed: true, appealId: appeal.id,
                    assignmentId: Number(appeal.assignment_id), status: appeal.status,
                    decision: appeal.decision };
                await this.finalize(context, client, 200, body);
                return body;
            }
            const resolved = await runtime.resolveAppeal(appeal.id, Number(reviewer.id), {
                commandId: input.commandId, semanticHash, decision, note
            });
            if (!resolved) throw new QuestV2ServiceError('QUEST_APPEAL_VERSION_CONFLICT', 409,
                'Appeal changed concurrently');
            if (this.achievementService?.recordTrustedEvent) {
                await this.achievementService.recordTrustedEvent(client, appeal.username, {
                    sourceType: 'quest',
                    sourceEventId: `achievement-quest-appeal:${appeal.assignment_id}:${appeal.id}`,
                    eventType: 'quest.appeal.resolved',
                    occurredAt: new Date(this.clock()).toISOString(),
                    payload: {
                        assignmentId: Number(appeal.assignment_id),
                        appealId: appeal.id
                    }
                }, context);
            }
            await runtime.insertAudit({ assignmentId: appeal.assignment_id, actorType: 'admin',
                actorUsername: adminUsername, action: 'quest.appeal.resolved',
                details: { appealId: appeal.id, decision }, requestId: context.requestId });
            const body = { success: true, replayed: false, appealId: appeal.id,
                assignmentId: Number(appeal.assignment_id), status: resolved.status, decision };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }

    async redactExpiredEvidence() {
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const redacted = await runtime.redactExpiredEvidenceBatch(100);
            for (const item of redacted) {
                let achievementSkippedReason = null;
                if (item.username && this.achievementService?.recordTrustedEvent) {
                    if (item.achievement_eligible === false) {
                        achievementSkippedReason = 'account_unavailable';
                    } else {
                        await this.achievementService.recordTrustedEvent(client, item.username, {
                            sourceType: 'quest',
                            sourceEventId: `achievement-quest-evidence-redacted:${item.id}`,
                            eventType: 'quest.evidence.redacted',
                            occurredAt: new Date(this.clock()).toISOString(),
                            payload: {
                                assignmentId: Number(item.assignment_id),
                                evidenceId: item.id
                            }
                        });
                    }
                }
                await runtime.insertAudit({
                    assignmentId: item.assignment_id, actorType: 'system',
                    action: 'quest.evidence.retention_redacted',
                    details: {
                        evidenceId: item.id,
                        tombstoneRetained: true,
                        ...(achievementSkippedReason ? { achievementSkippedReason } : {})
                    }
                });
            }
            return redacted.length;
        });
    }

    async createDraft(adminUsername, input, context = {}) {
        const completionRule = validateRegisteredRule(input?.completionRule);
        const eligibilityRule = validateEligibilityRule(
            input?.eligibilityRule || { op: 'relationship_level', minimum: 1 }
        );
        collectEligibilityRequirements(eligibilityRule);
        const slug = boundedText(input?.slug, 120, 'slug', true);
        if (!/^[a-z][a-z0-9-]{2,119}$/.test(slug)) throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid slug');
        if (!Array.isArray(input?.tags) || input.tags.length < 1 || input.tags.length > 12
            || input.tags.some((tag) => typeof tag !== 'string' || !/^[a-z][a-z0-9_-]{1,39}$/.test(tag))) {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid tags');
        }
        const verificationMode = oneOf(input?.verificationMode, ['automatic', 'manual', 'hybrid'], 'verificationMode');
        const reviewPolicy = oneOf(input?.reviewPolicy, ['none','owner','admin'], 'reviewPolicy');
        const safetyClass = oneOf(input?.safetyClass || 'standard',
            ['standard','sensitive','wellbeing'], 'safetyClass');
        if (input?.allowEventReuse !== undefined && typeof input.allowEventReuse !== 'boolean') {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid allowEventReuse');
        }
        const titleZh = boundedText(input?.titleZh, 240, 'titleZh', true);
        const titleEn = boundedText(input?.titleEn, 240, 'titleEn', true);
        const descriptionZh = boundedText(input?.descriptionZh, 1200, 'descriptionZh', true);
        const descriptionEn = boundedText(input?.descriptionEn, 1200, 'descriptionEn', true);
        const rawSteps = input?.steps === undefined ? [{
            stepKey: 'complete', ordinal: 1, titleZh, titleEn,
            instructionsZh: descriptionZh, instructionsEn: descriptionEn,
            evidenceKind: input?.evidenceKind,
            dependsOnKeys: [], completionRule, required: true
        }] : input.steps;
        if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 100) {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid quest steps');
        }
        const steps = rawSteps.map((step, index) => {
            const stepKey = boundedText(step?.stepKey, 80, `steps[${index}].stepKey`, true);
            if (!/^[a-z][a-z0-9_-]{1,79}$/.test(stepKey)) {
                throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid quest step key');
            }
            const dependsOnKeys = step?.dependsOnKeys || [];
            if (!Array.isArray(dependsOnKeys)) {
                throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid quest step dependencies');
            }
            return {
                step_key: stepKey,
                ordinal: boundedInteger(step?.ordinal ?? index + 1, 1, 100, `steps[${index}].ordinal`),
                title_zh: boundedText(step?.titleZh ?? titleZh, 240, `steps[${index}].titleZh`, true),
                title_en: boundedText(step?.titleEn ?? titleEn, 240, `steps[${index}].titleEn`, true),
                instructions_zh: boundedText(step?.instructionsZh ?? descriptionZh, 1200, `steps[${index}].instructionsZh`, true),
                instructions_en: boundedText(step?.instructionsEn ?? descriptionEn, 1200, `steps[${index}].instructionsEn`, true),
                evidence_kind: oneOf(step?.evidenceKind,
                    ['text', 'checklist', 'png', 'trusted_event'], `steps[${index}].evidenceKind`),
                parallel_group: step?.parallelGroup == null ? null
                    : boundedInteger(step.parallelGroup, 1, 20, `steps[${index}].parallelGroup`),
                depends_on_keys: dependsOnKeys.map((dependency) => boundedText(
                    dependency, 80, `steps[${index}].dependsOnKeys`, true
                )),
                completion_rule: validateRegisteredRule(step?.completionRule),
                required: step?.required !== false
            };
        });
        try {
            validateVerificationPlan({
                verification_mode: verificationMode,
                review_policy: reviewPolicy,
                safety_class: safetyClass
            }, steps);
        } catch (error) {
            if (error instanceof QuestStepGraphError) {
                throw new QuestV2ServiceError(error.code, 400, error.message);
            }
            throw error;
        }
        const draft = {
            slug, version: boundedInteger(input?.version, 1, 1000000, 'version'),
            category: oneOf(input?.category, ['exploration','game_mastery','story','creativity','streaming_practice','coop','community','collection','wellbeing'], 'category'),
            tags: [...input.tags], difficulty: oneOf(input?.difficulty, ['relaxed','guided','balanced','challenging'], 'difficulty'),
            estimatedMinutes: boundedInteger(input?.estimatedMinutes, 1, 480, 'estimatedMinutes'),
            safetyClass, titleZh,
            titleEn, descriptionZh,
            descriptionEn, hintZh: boundedText(input?.hintZh, 800, 'hintZh', true),
            hintEn: boundedText(input?.hintEn, 800, 'hintEn', true), completionZh: boundedText(input?.completionZh, 500, 'completionZh', true),
            completionEn: boundedText(input?.completionEn, 500, 'completionEn', true), verificationMode,
            eligibilityRule, completionRule, rewardPoints: boundedInteger(input?.rewardPoints, 0, 100000000, 'rewardPoints'),
            reviewPolicy,
            cooldownHours: boundedInteger(input?.cooldownHours || 0, 0, 8760, 'cooldownHours'),
            allowEventReuse: input?.allowEventReuse === true,
            steps
        };
        if (draft.category === 'wellbeing' && draft.rewardPoints !== 0) throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Wellbeing quests cannot award points');
        return this.transaction(async (client) => {
            const created = await this.catalogRepositoryFactory(client).createStudioDraft(draft, adminUsername);
            const runtime = this.runtimeRepositoryFactory(client);
            await runtime.insertAudit({ actorType: 'admin', actorUsername: adminUsername, action: 'quest.studio.draft_created', details: created, requestId: context.requestId });
            const body = { success: true, ...created };
            await this.finalize(context, client, 201, body);
            return body;
        });
    }

    async publish(adminUsername, input, context = {}) {
        const versionId = positiveId(input?.versionId, 'versionId');
        return this.transaction(async (client) => {
            const catalog = this.catalogRepositoryFactory(client);
            const versions = await catalog.listStudioVersions({ limit: 1000 });
            const version = versions.find((item) => Number(item.id) === versionId);
            if (!version) throw new QuestV2ServiceError('QUEST_VERSION_NOT_FOUND', 404, 'Quest version not found');
            const steps = typeof catalog.listVersionSteps === 'function'
                ? await catalog.listVersionSteps(versionId) : [];
            try {
                const eligibilityRule = validateEligibilityRule(version.eligibility_rule);
                collectEligibilityRequirements(eligibilityRule);
                validateRegisteredRule(version.completion_rule);
                for (const step of steps) validateRegisteredRule(step.completion_rule);
                validateVerificationPlan(version, steps);
            } catch (error) {
                if (error instanceof QuestStepGraphError) {
                    throw new QuestV2ServiceError(error.code, 400, error.message);
                }
                throw error;
            }
            if (!await catalog.publishStudioVersion(versionId)) throw new QuestV2ServiceError('QUEST_PUBLISH_CONFLICT', 409, 'Quest cannot be published');
            const runtime = this.runtimeRepositoryFactory(client);
            await runtime.insertAudit({ actorType: 'admin', actorUsername: adminUsername, action: 'quest.studio.published', details: { versionId }, requestId: context.requestId });
            const body = { success: true, versionId, lifecycle: 'active' };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }
}

module.exports = { QuestV2Service, QuestV2ServiceError, REGISTERED_TRUSTED_EVENTS,
    MAX_TRUSTED_EVENT_FUTURE_MS, validateInternalGameEvent, validateInternalStoryEvent,
    validateRegisteredRule };
