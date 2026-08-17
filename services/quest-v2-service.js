'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const { validateProgressEvent } = require('../domain/quests/objectives');
const { evaluateRule, validateRule } = require('../domain/quests/v2/rules');
const { validateEvidence } = require('../domain/quests/v2/evidence');
const { assertTransition } = require('../domain/quests/v2/transitions');
const { QuestV2CatalogRepository } = require('../repositories/quest-v2-catalog-repository');
const { QuestV2RuntimeRepository } = require('../repositories/quest-v2-runtime-repository');
const pack = require('../content/streamer-world/quests/phase-2-pack');

const ACTIVE = new Set(['offered', 'accepted', 'active', 'submitted', 'under_review', 'returned']);
const REGISTERED_TRUSTED_EVENTS = new Set([
    'adventure.chapter.completed', 'quiz.round.completed', 'doudizhu.match.won',
    'story.choice.committed', 'story.episode.completed'
]);

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

class QuestV2Service {
    constructor({ pool, BalanceLogger, catalogRepositoryFactory, runtimeRepositoryFactory }) {
        if (!pool?.connect || !BalanceLogger?.updateBalance) throw new TypeError('Quest V2 service requires pool and BalanceLogger');
        this.pool = pool;
        this.BalanceLogger = BalanceLogger;
        this.catalogRepositoryFactory = catalogRepositoryFactory || ((client) => new QuestV2CatalogRepository(client));
        this.runtimeRepositoryFactory = runtimeRepositoryFactory || ((client) => new QuestV2RuntimeRepository(client));
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
        await this.catalogRepositoryFactory(client).seedBuiltInContent(pack);
    }

    async initialize() {
        return this.transaction((client) => this.seed(client));
    }

    async finalize(context, client, status, body) {
        if (typeof context?.finalizeIdempotency === 'function') {
            await context.finalizeIdempotency(client, status, body);
        }
    }

    async journal(username) {
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const catalog = this.catalogRepositoryFactory(client);
            const creator = await runtime.lockCreator(username);
            if (!creator) throw new QuestV2ServiceError('CREATOR_PROFILE_REQUIRED', 409, 'Creator profile required');
            const blocked = new Set(await catalog.listBlockedCategories(creator.id));
            const assignments = await runtime.listAssignments(creator.id);
            const steps = await runtime.listAssignmentSteps(creator.id, assignments.map((item) => item.id));
            return {
                assignments: assignments.map((item) => ({ ...item, steps: steps.filter((step) => step.assignment_id === item.id) })),
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
            const candidate = await catalog.loadOfferCandidate(creator.id, versionId, boardId, chainId);
            const blocked = new Set(await catalog.listBlockedCategories(creator.id));
            if (!candidate || blocked.has(candidate.category)
                || !evaluateRule(candidate.eligibility_rule, { relationshipLevel: creator.relationship_level })) {
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
            let next;
            if (action === 'accept') next = 'accepted';
            else if (action === 'decline') next = 'declined';
            else if (action === 'submit') next = 'submitted';
            else throw new QuestV2ServiceError('INVALID_ACTION', 400, 'Invalid action');
            assertTransition(assignment.status, next);
            if (next === 'submitted') {
                const readiness = await runtime.assignmentSubmissionReadiness(assignmentId);
                if (readiness.required === 0 || readiness.ready !== readiness.required) {
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
            if (!assignment || assignment.postpone_policy?.allowed !== true || hours > maximum) {
                throw new QuestV2ServiceError('POSTPONE_UNAVAILABLE', 409, 'Postpone is unavailable');
            }
            const changed = await runtime.postponeAssignment(assignmentId, expectedRevision, new Date(Date.now() + hours * 3600000).toISOString());
            if (!changed) throw new QuestV2ServiceError('QUEST_VERSION_CONFLICT', 409, 'Quest changed concurrently');
            const body = { success: true, assignmentId, revision: Number(changed.revision), postponeUntil: changed.postpone_until };
            await runtime.insertAudit({ assignmentId, actorType: 'creator', actorUsername: username, action: 'quest.postponed', details: { hours }, requestId: context.requestId });
            await this.finalize(context, client, 200, body);
            return body;
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
                || !['active', 'returned'].includes(step.step_status)) {
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

    async review(adminUsername, input, context = {}) {
        const assignmentId = positiveId(input?.assignmentId, 'assignmentId');
        const decision = input?.decision;
        if (!['approved', 'returned', 'rejected'].includes(decision)) throw new QuestV2ServiceError('INVALID_REVIEW', 400, 'Invalid review decision');
        const note = boundedText(input?.note, 1000, 'note', decision !== 'approved');
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const assignment = await runtime.lockAssignmentForReview(assignmentId);
            if (!assignment || assignment.status !== 'under_review') throw new QuestV2ServiceError('QUEST_NOT_REVIEWABLE', 409, 'Quest is not reviewable');
            const evidence = await runtime.lockLatestEvidence(assignmentId);
            if (evidence.length === 0) throw new QuestV2ServiceError('EVIDENCE_REQUIRED', 409, 'Evidence is required');
            for (const item of evidence) await runtime.insertEvidenceReview({ evidenceId: item.id, assignmentId, reviewerUsername: adminUsername, decision, note, requestId: context.requestId });
            await runtime.markStepsReviewed(assignmentId, decision);
            let settlement = { rewardEarned: 0, balance: null, settlementKey: null };
            const target = decision === 'approved' ? 'completed' : 'returned';
            if (decision === 'approved') settlement = await this.settle(runtime, assignment, adminUsername, context);
            const changed = await runtime.transitionAssignment(assignmentId, Number(assignment.revision), [assignment.status], target);
            if (!changed) throw new QuestV2ServiceError('QUEST_VERSION_CONFLICT', 409, 'Quest changed concurrently');
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignmentId, `review-${decision}`, context.requestId || assignment.revision), assignmentId,
                actorType: 'admin', actorUsername: adminUsername, eventType: `quest.review.${decision}`,
                fromStatus: assignment.status, toStatus: target,
                dedupeKey: context.requestId || `review:${decision}:${assignment.revision}`,
                payload: { evidenceIds: evidence.map((item) => item.id) }, requestId: context.requestId
            });
            await runtime.insertAudit({ assignmentId, actorType: 'admin', actorUsername: adminUsername, action: `quest.review.${decision}`, details: { note, evidenceIds: evidence.map((item) => item.id), ...settlement }, requestId: context.requestId });
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
        return this._recordValidatedTrustedEvent(client, validateInternalStoryEvent(rawEvent), context);
    }

    async _recordValidatedTrustedEvent(client, old, context = {}) {
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
        const history = await runtime.listTrustedHistory(creator.id, new Date(Date.now() - 366 * 86400000).toISOString());
        const matches = [];
        let rewardEarned = 0;
        for (const assignment of await runtime.listTrustedCandidates(creator.id)) {
            const steps = await runtime.listTrustedSteps(assignment.id);
            const completedSteps = [];
            for (const step of steps.filter((item) => item.status === 'active')) {
                if (!evaluateRule(step.completion_rule, { events: history })) continue;
                await runtime.markTrustedStepCompleted(assignment.id, step.id, { eventId: event.eventId });
                completedSteps.push(Number(step.id));
            }
            if (completedSteps.length === 0
                || !await runtime.assignmentCompletionReadiness(assignment.id)
                || !evaluateRule(assignment.completion_rule, { events: history })) continue;
            const settlement = await this.settle(runtime, { ...assignment, username: old.username }, old.username, context);
            const changed = await runtime.transitionAssignment(assignment.id, Number(assignment.revision), ['active'], 'completed');
            if (!changed) throw new Error('Trusted quest completion raced');
            await runtime.insertAssignmentEvent({
                eventId: uuidFor(assignment.id, 'trusted-complete', event.eventId), assignmentId: assignment.id,
                actorType: 'trusted_event', actorUsername: null, eventType: 'quest.trusted.completed',
                fromStatus: 'active', toStatus: 'completed', dedupeKey: event.eventId,
                payload: { completedSteps }, requestId: context.requestId
            });
            await runtime.insertAudit({ assignmentId: assignment.id, actorType: 'trusted_event', action: 'quest.trusted.completed', details: { trustedEventId: event.eventId, completedSteps, ...settlement }, requestId: context.requestId });
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

    async studio() {
        return this.transaction(async (client) => {
            return {
                versions: await this.catalogRepositoryFactory(client).listStudioVersions({ limit: 100 }),
                reviewQueue: await this.runtimeRepositoryFactory(client).listReviewQueue(100)
            };
        });
    }

    async redactExpiredEvidence() {
        return this.transaction(async (client) => {
            const runtime = this.runtimeRepositoryFactory(client);
            const redacted = await runtime.redactExpiredEvidenceBatch(100);
            for (const item of redacted) {
                await runtime.insertAudit({
                    assignmentId: item.assignment_id, actorType: 'system',
                    action: 'quest.evidence.retention_redacted',
                    details: { evidenceId: item.id, tombstoneRetained: true }
                });
            }
            return redacted.length;
        });
    }

    async createDraft(adminUsername, input, context = {}) {
        const completionRule = validateRegisteredRule(input?.completionRule);
        const eligibilityRule = validateRule(input?.eligibilityRule || { op: 'relationship_level', minimum: 1 });
        const slug = boundedText(input?.slug, 120, 'slug', true);
        if (!/^[a-z][a-z0-9-]{2,119}$/.test(slug)) throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid slug');
        if (!Array.isArray(input?.tags) || input.tags.length < 1 || input.tags.length > 12
            || input.tags.some((tag) => typeof tag !== 'string' || !/^[a-z][a-z0-9_-]{1,39}$/.test(tag))) {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Invalid tags');
        }
        const verificationMode = oneOf(input?.verificationMode, ['automatic', 'manual', 'hybrid'], 'verificationMode');
        const evidenceKind = oneOf(input?.evidenceKind, ['none', 'text', 'checklist', 'png', 'trusted_event'], 'evidenceKind');
        if ((verificationMode === 'automatic') !== (evidenceKind === 'trusted_event')) {
            throw new QuestV2ServiceError('INVALID_INPUT', 400, 'Automatic quests require trusted-event evidence');
        }
        const draft = {
            slug, version: boundedInteger(input?.version, 1, 1000000, 'version'),
            category: oneOf(input?.category, ['exploration','game_mastery','story','creativity','streaming_practice','coop','community','collection','wellbeing'], 'category'),
            tags: [...input.tags], difficulty: oneOf(input?.difficulty, ['relaxed','guided','balanced','challenging'], 'difficulty'),
            estimatedMinutes: boundedInteger(input?.estimatedMinutes, 1, 480, 'estimatedMinutes'),
            safetyClass: oneOf(input?.safetyClass || 'standard', ['standard','sensitive','wellbeing'], 'safetyClass'), titleZh: boundedText(input?.titleZh, 240, 'titleZh', true),
            titleEn: boundedText(input?.titleEn, 240, 'titleEn', true), descriptionZh: boundedText(input?.descriptionZh, 1200, 'descriptionZh', true),
            descriptionEn: boundedText(input?.descriptionEn, 1200, 'descriptionEn', true), hintZh: boundedText(input?.hintZh, 800, 'hintZh', true),
            hintEn: boundedText(input?.hintEn, 800, 'hintEn', true), completionZh: boundedText(input?.completionZh, 500, 'completionZh', true),
            completionEn: boundedText(input?.completionEn, 500, 'completionEn', true), verificationMode,
            eligibilityRule, completionRule, rewardPoints: boundedInteger(input?.rewardPoints, 0, 100000000, 'rewardPoints'),
            reviewPolicy: oneOf(input?.reviewPolicy, ['none','owner','admin'], 'reviewPolicy'),
            cooldownHours: boundedInteger(input?.cooldownHours || 0, 0, 8760, 'cooldownHours'), evidenceKind
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
            validateRegisteredRule(version.completion_rule);
            if (!await catalog.publishStudioVersion(versionId)) throw new QuestV2ServiceError('QUEST_PUBLISH_CONFLICT', 409, 'Quest cannot be published');
            const runtime = this.runtimeRepositoryFactory(client);
            await runtime.insertAudit({ actorType: 'admin', actorUsername: adminUsername, action: 'quest.studio.published', details: { versionId }, requestId: context.requestId });
            const body = { success: true, versionId, lifecycle: 'active' };
            await this.finalize(context, client, 200, body);
            return body;
        });
    }
}

module.exports = { QuestV2Service, QuestV2ServiceError, REGISTERED_TRUSTED_EVENTS, validateInternalStoryEvent, validateRegisteredRule };
