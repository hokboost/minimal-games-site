'use strict';

const PostgresQuestRepository = require('./postgres-repository');
const { evaluateObjective, validateObjective, validateProgressEvent } = require('./objectives');

const OPERATION_TYPE = 'quest_auto_reward';

function asSafeInteger(value, label, minimum = 0) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < minimum) throw new TypeError(`Invalid ${label}`);
    return number;
}

function asJsonObject(value, label) {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError(`Invalid ${label}`);
    return parsed;
}

function canonicalJson(value) {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function samePersistedEvent(row, event) {
    const payload = asJsonObject(row.payload, 'persisted quest event payload');
    return row.source_type === event.sourceType
        && row.source_event_id === event.sourceEventId
        && row.username === event.username
        && row.event_type === event.eventType
        && Number(row.event_version) === event.eventVersion
        && new Date(row.occurred_at).toISOString() === event.occurredAt
        && canonicalJson(payload) === canonicalJson(event.payload);
}

class QuestService {
    constructor({ BalanceLogger, repositoryFactory = (client) => new PostgresQuestRepository(client) }) {
        if (!BalanceLogger || typeof BalanceLogger.updateBalance !== 'function') {
            throw new TypeError('Quest service requires BalanceLogger');
        }
        if (typeof repositoryFactory !== 'function') throw new TypeError('Quest service requires a repository factory');
        this.BalanceLogger = BalanceLogger;
        this.repositoryFactory = repositoryFactory;
    }

    async ensurePilotAssignments(client, username, eligible) {
        if (!eligible) return [];
        const repository = this.repositoryFactory(client);
        const definitions = await repository.listPublishedDefinitions();
        const created = [];
        for (const definition of definitions) {
            if (definition.verification_mode !== 'automatic') continue;
            const objective = validateObjective(definition.objective, Number(definition.objective_version));
            const assignment = await repository.createAssignment(username, definition, objective.target);
            if (assignment) created.push(Number(assignment.id));
        }
        return created;
    }

    async listUserQuests(client, username, lang, eligible) {
        await this.ensurePilotAssignments(client, username, eligible);
        if (!eligible) return [];
        const rows = await this.repositoryFactory(client).listUserAssignments(username);
        return rows.map((row) => ({
            id: Number(row.id),
            slug: row.slug,
            definitionVersion: Number(row.version),
            status: row.status,
            title: row[lang === 'zh' ? 'title_zh' : 'title_en'],
            description: row[lang === 'zh' ? 'description_zh' : 'description_en'],
            verificationMode: row.verification_mode,
            rewardPoints: asSafeInteger(row.reward_points, 'quest reward', 1),
            progress: asSafeInteger(row.progress_value, 'quest progress'),
            target: asSafeInteger(row.target_value, 'quest target', 1),
            assignedAt: row.assigned_at,
            dueAt: row.due_at,
            completedAt: row.completed_at,
            rewardPostingId: row.reward_posting_id || null
        }));
    }

    async recordProgressEvent(client, rawEvent, context = {}) {
        const event = validateProgressEvent(rawEvent);
        const repository = this.repositoryFactory(client);
        const inserted = await repository.insertProgressEvent(event);
        if (!inserted) {
            const replay = await repository.loadProgressEvent(event.sourceType, event.sourceEventId);
            if (!replay || !samePersistedEvent(replay, event) || !replay.result) {
                throw new Error('Quest event identity collision or unfinished replay');
            }
            return asJsonObject(replay.result, 'persisted quest event result');
        }

        const matches = [];
        let rewardEarned = 0;
        let balance = null;
        const assignments = await repository.listCandidateAssignments(event.username, event.eventType);
        for (const assignment of assignments) {
            const evaluation = evaluateObjective(
                assignment.objective_snapshot,
                event,
                Number(assignment.objective_version)
            );
            if (!evaluation.matched) continue;
            const currentProgress = asSafeInteger(assignment.progress_value, 'assignment progress');
            const target = asSafeInteger(assignment.target_value, 'assignment target', 1);
            const nextProgress = Math.min(target, currentProgress + evaluation.increment);
            const currentRevision = asSafeInteger(assignment.revision, 'assignment revision');
            if (nextProgress < target) {
                const changed = await repository.updateProgress(assignment.id, currentRevision, nextProgress);
                if (!changed) throw new Error('Quest assignment progress raced');
                await repository.insertAudit({
                    assignmentId: assignment.id,
                    progressEventId: Number(inserted.id),
                    username: event.username,
                    action: 'automatic_progress',
                    verificationMode: 'automatic',
                    details: { eventType: event.eventType, sourceType: event.sourceType, progress: nextProgress, target },
                    requestId: context.requestId
                });
                matches.push({ assignmentId: Number(assignment.id), status: 'active', progress: nextProgress, target, rewardEarned: 0 });
                continue;
            }

            const postingId = `quest:${assignment.id}:completion:1`;
            const rewardPoints = asSafeInteger(assignment.reward_points, 'assignment reward', 1);
            const posting = await repository.insertRewardPosting({
                postingId,
                assignmentId: assignment.id,
                progressEventId: Number(inserted.id),
                username: event.username,
                rewardPoints,
                operationType: OPERATION_TYPE
            });
            if (!posting) throw new Error('Quest reward posting already exists for an active assignment');
            const balanceResult = await this.BalanceLogger.updateBalance({
                username: event.username,
                amount: rewardPoints,
                operationType: OPERATION_TYPE,
                description: `自动完成任务：${assignment.slug}@${assignment.version}`,
                gameData: {
                    postingId,
                    assignmentId: Number(assignment.id),
                    definitionSlug: assignment.slug,
                    definitionVersion: Number(assignment.version),
                    progressEventId: Number(inserted.id),
                    verification: 'automatic'
                },
                ipAddress: context.ipAddress || null,
                userAgent: context.userAgent || null,
                requestId: context.requestId || null,
                requireSufficientBalance: false,
                client,
                managedTransaction: true
            });
            if (!balanceResult.success) throw new Error('Quest reward ledger update failed');
            await repository.markPostingPosted(postingId, balanceResult.balanceBefore, balanceResult.balance);
            await repository.completeAssignment(assignment.id, currentRevision, nextProgress, postingId);
            await repository.insertAudit({
                assignmentId: assignment.id,
                progressEventId: Number(inserted.id),
                postingId,
                username: event.username,
                action: 'automatic_completion_rewarded',
                verificationMode: 'automatic',
                details: {
                    eventType: event.eventType,
                    sourceType: event.sourceType,
                    progress: nextProgress,
                    target,
                    rewardPoints,
                    postingId
                },
                requestId: context.requestId
            });
            rewardEarned += rewardPoints;
            balance = balanceResult.balance;
            matches.push({ assignmentId: Number(assignment.id), status: 'completed', progress: nextProgress, target, rewardEarned: rewardPoints, postingId });
        }

        const resultBody = {
            eventId: Number(inserted.id),
            eventType: event.eventType,
            matches,
            rewardEarned,
            balance
        };
        await repository.finalizeProgressEvent(inserted.id, matches.length > 0 ? 'processed' : 'ignored', resultBody);
        return resultBody;
    }
}

module.exports = { OPERATION_TYPE, QuestService };
