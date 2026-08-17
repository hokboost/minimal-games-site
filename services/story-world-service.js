'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const { createStoryRun, recoverStoryRun, StoryTransitionError, transitionStory } = require('../domain/story/engine');
const { publicStoryProjection } = require('../domain/story/projection');
const { hydrateCompiledContent } = require('../domain/story/compiler');
const { StoryWorldRepository } = require('../repositories/story-world-repository');
const seasonOne = require('../content/streamer-world/story/season-one');

class StoryWorldServiceError extends Error {
    constructor(code, status, message) {
        super(message); this.name = 'StoryWorldServiceError'; this.code = code; this.status = status;
    }
}

function positiveId(value, field) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 1) throw new StoryWorldServiceError('STORY_INVALID_INPUT', 400, `Invalid ${field}`);
    return number;
}
function requestId(value) {
    const id = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
    if (!/^[A-Za-z0-9._:-]{8,180}$/.test(id)) throw new StoryWorldServiceError('STORY_COMMAND_REQUIRED', 400, 'A stable command id is required');
    return id;
}
function exactInput(input, allowed) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !allowed.includes(key))) {
        throw new StoryWorldServiceError('STORY_INVALID_INPUT', 400, 'Story request contains unsupported fields');
    }
    return input;
}
function stateHash(state) { return crypto.createHash('sha256').update(stableStringify(state)).digest('hex'); }
function validateActionInput(input) {
    const common = ['runId', 'action', 'expectedRevision', 'language'];
    if (input.action === 'choose') exactInput(input, [...common, 'choiceId']);
    else if (input.action === 'answer') exactInput(input, [...common, 'answerKey']);
    else if (['advance', 'finish'].includes(input.action)) exactInput(input, common);
    else throw new StoryWorldServiceError('STORY_INVALID_INPUT', 400, 'Invalid story action');
}
function databaseRun(row) {
    return {
        status: row.status, currentNodeId: row.current_node_id, currentEpisode: row.current_episode,
        revision: Number(row.revision), replayMode: Boolean(row.replay_mode), state: row.state_snapshot,
        checkpoint: row.checkpoint_snapshot
    };
}
function isQuietNow(timezone, rows, date = new Date()) {
    if (!rows.length) return false;
    let parts;
    try {
        parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map((part) => [part.type, part.value]));
    } catch { parts = { weekday: 'Sun', hour: '00', minute: '00' }; }
    const weekday = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday);
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    return rows.some((row) => {
        if (Number(row.weekday) !== weekday) return false;
        const start = Number(row.start_minute), end = Number(row.end_minute);
        return start < end ? minute >= start && minute < end : minute >= start || minute < end;
    });
}

class StoryWorldService {
    constructor({ pool, repositoryFactory, questV2Service = null, questIntegrationEnabled = false, content = seasonOne, clock = () => new Date() }) {
        if (!pool?.connect) throw new TypeError('Story service requires a database pool');
        this.pool = pool; this.repositoryFactory = repositoryFactory || ((client) => new StoryWorldRepository(client));
        this.questV2Service = questV2Service; this.questIntegrationEnabled = Boolean(questIntegrationEnabled);
        this.content = content; this.clock = clock; this.catalog = null; this.contentCache = new Map();
    }
    async transaction(work) {
        const client = await this.pool.connect();
        try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
        catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
    }
    async initialize() {
        this.catalog = await this.transaction((client) => this.repositoryFactory(client).seedContent(this.content));
        this.contentCache.set(Number(this.catalog.version.id), this.content);
        return this.catalog;
    }
    async ensureCatalog(repository) {
        const identity = this.catalog || await repository.loadCatalogIdentity(this.content.slug, this.content.version);
        if (!identity) throw new StoryWorldServiceError('STORY_NOT_READY', 503, 'Story catalog is not initialized');
        return identity.campaign ? { campaignId: Number(identity.campaign.id), contentVersionId: Number(identity.version.id) }
            : { campaignId: Number(identity.campaign_id), contentVersionId: Number(identity.content_version_id) };
    }
    async creatorContext(repository, username, { lock = true } = {}) {
        const creator = await repository[lock ? 'lockCreator' : 'readCreator'](username);
        if (!creator || !creator.timezone) throw new StoryWorldServiceError('CREATOR_PROFILE_REQUIRED', 409, 'Create a creator profile before entering the story');
        const boundaries = await repository.loadBoundaries(creator.id);
        const blocked = boundaries.preferences.some((item) => item.preference_type === 'quest_category' && item.preference_key === 'story' && item.preference_value === 'block');
        if (blocked) throw new StoryWorldServiceError('STORY_CONSENT_BLOCKED', 403, 'Story interactions are blocked in creator preferences');
        const ownerMessagesBlocked = boundaries.preferences.some((item) => item.preference_type === 'communication'
            && ['all_messages', 'owner_notes'].includes(item.preference_key) && item.preference_value === 'block');
        return { creator, boundaries, ownerMessagesBlocked, quiet: isQuietNow(creator.timezone, boundaries.quietHours, this.clock()) };
    }
    async resolveContent(repository, contentVersionId) {
        const id = Number(contentVersionId); if (this.contentCache.has(id)) return this.contentCache.get(id);
        const row = await repository.loadContentVersion(id); if (!row) throw new StoryWorldServiceError('STORY_CONTENT_MISSING', 503, 'Bound story content is unavailable');
        const hash = crypto.createHash('sha256').update(stableStringify(row.content_snapshot)).digest('hex');
        if (hash !== row.content_hash) throw new StoryWorldServiceError('STORY_CONTENT_CORRUPT', 503, 'Bound story content failed verification');
        const hydrated = hydrateCompiledContent(row.content_snapshot, hash);
        this.contentCache.set(id, hydrated); return hydrated;
    }
    projection(content, run, quiet, language, ownerMessagesBlocked = false) {
        return publicStoryProjection(content, run, { language, ownerMessagesBlocked, ownerPresence: quiet ? 'deferred_for_quiet_hours' : 'asynchronous' });
    }
    async state(username, { language = 'zh' } = {}) {
        return this.transaction(async (client) => {
            const repository = this.repositoryFactory(client); const { creator, quiet, ownerMessagesBlocked } = await this.creatorContext(repository, username, { lock: false });
            const ids = await this.ensureCatalog(repository); const row = await repository.latestRun(creator.id, ids.campaignId);
            const content = row ? await this.resolveContent(repository, row.content_version_id) : this.content;
            return { success: true, available: true, hasRun: Boolean(row), runId: row ? Number(row.id) : null, story: row ? this.projection(content, databaseRun(row), quiet, language, ownerMessagesBlocked) : null };
        });
    }
    async start(username, input = {}, context = {}) {
        exactInput(input, ['replay', 'language']);
        if (input.replay !== undefined && typeof input.replay !== 'boolean') throw new StoryWorldServiceError('STORY_INVALID_INPUT', 400, 'Invalid replay mode');
        const commandId = requestId(context.requestId); const replayMode = input.replay === true;
        return this.transaction(async (client) => {
            const repository = this.repositoryFactory(client); const { creator, quiet, ownerMessagesBlocked } = await this.creatorContext(repository, username);
            const ids = await this.ensureCatalog(repository); const active = await repository.lockActiveRun(creator.id, ids.campaignId);
            if (active) { const bound = await this.resolveContent(repository, active.content_version_id); return { success: true, resumed: true, runId: Number(active.id), story: this.projection(bound, databaseRun(active), quiet, input.language, ownerMessagesBlocked) }; }
            const previous = await repository.latestRun(creator.id, ids.campaignId, ids.contentVersionId);
            if (previous && !replayMode) throw new StoryWorldServiceError('STORY_REPLAY_REQUIRED', 409, 'Season already completed; start explicitly in replay mode');
            if (!previous && replayMode) throw new StoryWorldServiceError('STORY_FIRST_RUN_REQUIRED', 409, 'Complete a first run before replaying');
            const run = createStoryRun(this.content, { replayMode });
            const row = await repository.createRun({ userId: creator.id, ...ids, run });
            const response = { success: true, resumed: false, runId: Number(row.id), story: this.projection(this.content, run, quiet, input.language, ownerMessagesBlocked) };
            const semanticHash = crypto.createHash('sha256').update(stableStringify({ replayMode, username })).digest('hex');
            const inserted = await repository.appendEvent({ eventId: crypto.randomUUID(), runId: row.id, commandId, semanticHash,
                actorUsername: username, action: replayMode ? 'replay' : 'start', fromNodeId: null, toNodeId: run.currentNodeId,
                selectedChoice: null, answerCorrect: null, fromRevision: 0, toRevision: 0, effectsDigest: { beforeStateHash: null, afterStateHash: stateHash(run.state), effects: [] }, response });
            if (!inserted) throw new StoryWorldServiceError('STORY_COMMAND_COLLISION', 409, 'Story command identity collision');
            await repository.insertAudit({ runId: row.id, userId: creator.id, username, action: replayMode ? 'story.run.replay' : 'story.run.started', details: { contentVersion: this.content.version }, requestId: commandId });
            await context.finalizeIdempotency?.(client, 201, response); return response;
        });
    }
    async commit(username, input = {}, context = {}) {
        validateActionInput(input);
        const runId = positiveId(input.runId, 'runId'); const commandId = requestId(context.requestId);
        const command = { action: input.action, expectedRevision: input.expectedRevision, choiceId: input.choiceId, answerKey: input.answerKey };
        const semanticHash = crypto.createHash('sha256').update(stableStringify({ username, runId, command })).digest('hex');
        return this.transaction(async (client) => {
            const repository = this.repositoryFactory(client); const { creator, quiet, ownerMessagesBlocked } = await this.creatorContext(repository, username);
            await this.ensureCatalog(repository); const row = await repository.lockRun(creator.id, runId);
            if (!row) throw new StoryWorldServiceError('STORY_RUN_NOT_FOUND', 404, 'Story run was not found');
            const replay = await repository.loadEvent(runId, commandId);
            if (replay) {
                if (replay.semantic_hash !== semanticHash) throw new StoryWorldServiceError('STORY_COMMAND_COLLISION', 409, 'Story command identity collision');
                return replay.response_snapshot;
            }
            const boundContent = await this.resolveContent(repository, row.content_version_id);
            const before = databaseRun(row); const choiceAlreadyCommitted = command.action === 'choose' && await repository.hasCommittedChoice(runId, before.currentNodeId, command.choiceId);
            const result = transitionStory(boundContent, before, command, { now: this.clock });
            const saved = await repository.updateRun(runId, before.revision, result.run);
            if (!saved) throw new StoryWorldServiceError('STORY_VERSION_CONFLICT', 409, 'Story changed concurrently');
            const response = { success: true, runId, story: this.projection(boundContent, result.run, quiet, input.language, ownerMessagesBlocked), outcome: result.event.selectedChoice ? this.choiceOutcome(boundContent, result.event.fromNodeId, result.event.selectedChoice, input.language) : null };
            const eventId = crypto.randomUUID();
            const inserted = await repository.appendEvent({ eventId, runId, commandId, semanticHash, actorUsername: username,
                action: result.event.action, fromNodeId: result.event.fromNodeId, toNodeId: result.event.toNodeId,
                selectedChoice: result.event.selectedChoice, answerCorrect: result.event.answerCorrect,
                fromRevision: before.revision, toRevision: result.run.revision,
                effectsDigest: { beforeStateHash: stateHash(before.state), afterStateHash: stateHash(result.run.state), effects: result.event.effectSummary }, response });
            if (!inserted) throw new StoryWorldServiceError('STORY_COMMAND_COLLISION', 409, 'Story command identity collision');
            await repository.syncState(runId, eventId, result.run.state);
            if (!result.run.replayMode) await this.persistValue(repository, { creator, contentVersionId: Number(row.content_version_id), runId, eventId, result, username, client, commandId, content: boundContent, choiceAlreadyCommitted, ownerMessagesBlocked });
            await repository.insertAudit({ runId, userId: creator.id, username, action: `story.${result.event.action}.committed`, details: { fromNodeId: result.event.fromNodeId, toNodeId: result.event.toNodeId, selectedChoice: result.event.selectedChoice, revision: result.run.revision, replayMode: result.run.replayMode }, requestId: commandId });
            await context.finalizeIdempotency?.(client, 200, response); return response;
        });
    }
    choiceOutcome(content, nodeId, choiceId, language) {
        const option = content.nodesById.get(nodeId)?.options?.find((item) => item.id === choiceId);
        return option ? (language === 'en' ? option.outcome.en : option.outcome.zh) : null;
    }
    async persistValue(repository, args) {
        const { creator, contentVersionId, runId, eventId, result, username, client, commandId, content, choiceAlreadyCommitted, ownerMessagesBlocked } = args;
        for (const effect of result.emitted) {
            if (effect.type === 'unlock_memory') await repository.insertMemory({ userId: creator.id, contentVersionId, runId, eventId, key: effect.key, memory: content.memories[effect.key] });
            if (effect.type === 'unlock') await repository.insertUnlock({ userId: creator.id, contentVersionId, eventId, unlockType: effect.unlockType, key: effect.key });
            if (effect.type === 'deliver_message' && !ownerMessagesBlocked) await repository.insertMessage({ userId: creator.id, key: effect.key, message: content.messages[effect.key], runId });
        }
        if (result.event.selectedChoice && !choiceAlreadyCommitted && this.questIntegrationEnabled && this.questV2Service?.recordInternalTrustedEvent) await this.questV2Service.recordInternalTrustedEvent(client, {
            sourceType: 'story', sourceEventId: `story-event:${eventId}`, username, eventType: 'story.choice.committed', occurredAt: this.clock().toISOString(),
            payload: { runId, episodeSlug: result.run.currentEpisode, choiceId: result.event.selectedChoice, contentVersion: content.version }
        }, { requestId: commandId });
        for (const episode of result.event.newlyCompletedEpisodes) {
            const first = await repository.insertFirstClear({ userId: creator.id, contentVersionId, episode, runId, eventId });
            if (first) await repository.appendRelationshipFirstClear({ userId: creator.id, episode, runId, eventId });
            if (first && this.questIntegrationEnabled && this.questV2Service?.recordInternalTrustedEvent) await this.questV2Service.recordInternalTrustedEvent(client, {
                sourceType: 'story', sourceEventId: `story-episode:${eventId}:${episode}`, username, eventType: 'story.episode.completed', occurredAt: this.clock().toISOString(),
                payload: { runId, episodeSlug: episode, contentVersion: content.version }
            }, { requestId: commandId });
        }
    }
    async preview(username, input = {}) {
        exactInput(input, ['runId', 'action', 'expectedRevision', 'choiceId', 'language']);
        if (input.action !== 'choose') throw new StoryWorldServiceError('STORY_PREVIEW_CHOICE_ONLY', 400, 'Only visible choices can be previewed');
        const runId = positiveId(input.runId, 'runId');
        return this.transaction(async (client) => {
            const repository = this.repositoryFactory(client); const { creator } = await this.creatorContext(repository, username, { lock: false });
            const row = await repository.loadRun(creator.id, runId); if (!row) throw new StoryWorldServiceError('STORY_RUN_NOT_FOUND', 404, 'Story run was not found');
            const content = await this.resolveContent(repository, row.content_version_id);
            const result = transitionStory(content, databaseRun(row), { action: input.action, expectedRevision: input.expectedRevision, choiceId: input.choiceId }, { now: this.clock });
            const target = content.nodesById.get(result.event.toNodeId);
            return { success: true, preview: true, revision: Number(row.revision), outcome: result.event.selectedChoice ? this.choiceOutcome(content, result.event.fromNodeId, result.event.selectedChoice, input.language) : null,
                next: { type: target.type, speaker: target.speaker || null, text: input.language === 'en' ? target.text.en : target.text.zh } };
        });
    }
    async recover(username, input = {}, context = {}) {
        exactInput(input, ['runId', 'expectedRevision', 'language']);
        const runId = positiveId(input.runId, 'runId'), commandId = requestId(context.requestId);
        const expectedRevision = Number(input.expectedRevision); const semanticHash = crypto.createHash('sha256').update(stableStringify({ username, runId, expectedRevision, action: 'recover' })).digest('hex');
        return this.transaction(async (client) => {
            const repository = this.repositoryFactory(client); const { creator, quiet, ownerMessagesBlocked } = await this.creatorContext(repository, username);
            const row = await repository.lockRun(creator.id, runId); if (!row) throw new StoryWorldServiceError('STORY_RUN_NOT_FOUND', 404, 'Story run was not found');
            const replay = await repository.loadEvent(runId, commandId); if (replay) { if (replay.semantic_hash !== semanticHash) throw new StoryWorldServiceError('STORY_COMMAND_COLLISION', 409, 'Story command identity collision'); return replay.response_snapshot; }
            const content = await this.resolveContent(repository, row.content_version_id); const before = databaseRun(row); const result = recoverStoryRun(content, before, expectedRevision);
            if (!await repository.updateRun(runId, before.revision, result.run)) throw new StoryWorldServiceError('STORY_VERSION_CONFLICT', 409, 'Story changed concurrently');
            const response = { success: true, recovered: true, runId, story: this.projection(content, result.run, quiet, input.language, ownerMessagesBlocked) }; const eventId = crypto.randomUUID();
            if (!await repository.appendEvent({ eventId,runId,commandId,semanticHash,actorUsername:username,action:'recover',fromNodeId:result.event.fromNodeId,toNodeId:result.event.toNodeId,selectedChoice:null,answerCorrect:null,fromRevision:before.revision,toRevision:result.run.revision,effectsDigest:{ beforeStateHash:stateHash(before.state),afterStateHash:stateHash(result.run.state),effects:result.event.effectSummary },response })) throw new StoryWorldServiceError('STORY_COMMAND_COLLISION',409,'Story command identity collision');
            await repository.syncState(runId,eventId,result.run.state); await repository.insertAudit({runId,userId:creator.id,username,action:'story.checkpoint.recovered',details:{fromNodeId:result.event.fromNodeId,toNodeId:result.event.toNodeId,revision:result.run.revision},requestId:commandId});
            await context.finalizeIdempotency?.(client,200,response); return response;
        });
    }
    async audit() { return this.transaction(async (client) => ({ events: await this.repositoryFactory(client).listAdminAudit(100) })); }
}

module.exports = { StoryTransitionError, StoryWorldService, StoryWorldServiceError, databaseRun, isQuietNow };
