'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');
const { ACHIEVEMENTS } = require('../content/streamer-world/achievements/catalog');
const { progressFor, publicAchievement, validateDefinition, validateTrustedEvent } = require('../domain/achievements/rules');
const { AchievementRepository } = require('../repositories/achievement-repository');
const { sourceGrantForEvent } = require('../domain/rewards/source-grant-policy');

class AchievementServiceError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'AchievementServiceError';
        this.code = code;
        this.status = status;
    }
}

class AchievementService {
    constructor({ pool, repositoryFactory, clock = () => new Date(), rewardGrantIntentWriter = null }) {
        if (!pool?.connect) throw new TypeError('Achievement service requires a database pool');
        this.pool = pool;
        this.repositoryFactory = repositoryFactory || ((client) => new AchievementRepository(client));
        this.clock = clock;
        this.rewardGrantIntentWriter = rewardGrantIntentWriter;
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

    async initialize() {
        return this.transaction((client) => this.repositoryFactory(client).seed(ACHIEVEMENTS));
    }

    sourceMatches(event) {
        const expected = event.eventType.startsWith('story.') ? 'story'
            : event.eventType.startsWith('game.') ? 'streamer_game'
                : event.eventType.startsWith('quest.') ? 'quest' : 'live_interaction';
        if (event.sourceType !== expected) throw new AchievementServiceError('ACHIEVEMENT_SOURCE_MISMATCH', 400, 'Trusted event source does not match its schema');
    }

    async recordTrustedEvent(client, username, raw, context = {}) {
        const event = validateTrustedEvent(raw);
        this.sourceMatches(event);
        const repository = this.repositoryFactory(client);
        const user = await repository.lockUser(username);
        if (!user) throw new AchievementServiceError('ACHIEVEMENT_USER_UNAVAILABLE', 403, 'Achievement user is unavailable');
        const semanticHash = crypto.createHash('sha256').update(stableStringify({
            username, sourceType:event.sourceType, sourceEventId:event.sourceEventId,
            eventType:event.eventType, occurredAt:event.occurredAt, payload:event.payload
        })).digest('hex');
        const inserted = await repository.insertEvent({
            eventId: crypto.randomUUID(), userId:user.id, sourceType:event.sourceType,
            sourceEventId:event.sourceEventId, eventType:event.eventType,
            occurredAt:event.occurredAt, payload:event.payload, semanticHash
        });
        if (!inserted.row || inserted.row.semantic_hash !== semanticHash || Number(inserted.row.user_id) !== Number(user.id)) {
            throw new AchievementServiceError('ACHIEVEMENT_EVENT_COLLISION', 409, 'Trusted achievement event identity collision');
        }
        if (!inserted.inserted) return { success:true, replayed:true,unlocked:await repository.unlocksForEvent(inserted.row.id) };
        const unlocked = [];
        const definitions = await repository.definitions(event.eventType);
        for (const definition of definitions) {
            validateDefinition({
                slug:definition.slug,eventType:definition.event_type,target:Number(definition.target),
                filters:definition.filters,hidden:Boolean(definition.hidden),season:definition.season === null ? null : Number(definition.season),
                collectionKey:definition.collection_key
            });
            const progress = await repository.lockProgress(user.id, definition.id);
            if (progress.unlocked_at) continue;
            const decision = progressFor({ eventType:definition.event_type,filters:definition.filters }, event, progress.progress_keys || []);
            if (!decision.matched || decision.progressDelta === 0) continue;
            const next = Math.min(Number(definition.target), Number(progress.progress) + decision.progressDelta);
            const shouldUnlock = next >= Number(definition.target);
            const saved = await repository.updateProgress(progress, next, decision.keys, inserted.row.id, shouldUnlock);
            if (!saved) throw new AchievementServiceError('ACHIEVEMENT_VERSION_CONFLICT', 409, 'Achievement progress changed concurrently');
            if (shouldUnlock && await repository.insertUnlock(user.id, definition.id, inserted.row.id)) {
                await repository.insertCollection(user.id, definition.collection_key, definition.slug);
                unlocked.push(definition.slug);
                const reward = sourceGrantForEvent('achievement', event,
                    { achievementSlug: definition.slug });
                if (reward && this.rewardGrantIntentWriter?.enqueue) {
                    await this.rewardGrantIntentWriter.enqueue(client, { ...reward, userId: Number(user.id) });
                }
            }
        }
        if (event.eventType === 'story.season.completed' && await repository.archiveSeason(user.id, event)) {
            const reward = sourceGrantForEvent('season', event);
            if (reward && this.rewardGrantIntentWriter?.enqueue) {
                await this.rewardGrantIntentWriter.enqueue(client, { ...reward, userId: Number(user.id) });
            }
        }
        await repository.audit({ userId:user.id,actorUsername:username,action:'achievement.trusted_event.recorded',
            sourceEventId:event.sourceEventId,details:{ eventType:event.eventType,unlocked },requestId:context.requestId });
        return { success:true,replayed:false,unlocked };
    }

    async state(username, { language = 'zh' } = {}) {
        return this.transaction(async (client) => {
            const repository = this.repositoryFactory(client);
            const user = await repository.readUser(username);
            if (!user) throw new AchievementServiceError('ACHIEVEMENT_USER_UNAVAILABLE', 403, 'Achievement user is unavailable');
            const value = await repository.state(user.id);
            return {
                success:true,
                achievements:value.achievements.map((row) => publicAchievement(row,row,language)),
                collection:value.collection.map((row) => ({ itemKey:row.item_key,acquiredAt:row.acquired_at,archived:Boolean(row.archived_at),showcaseSlot:row.showcase_slot })),
                seasons:value.archives.map((row) => ({ slug:row.season_slug,state:row.state,conclusion:row.conclusion_key,archivedAt:row.archived_at }))
            };
        });
    }
}

module.exports = { AchievementService, AchievementServiceError };
