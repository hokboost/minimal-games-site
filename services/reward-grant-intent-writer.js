'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../lib/idempotency');

const SOURCES = new Set(['quest', 'story', 'game', 'achievement', 'season']);

class RewardGrantIntentError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'RewardGrantIntentError';
        this.code = code;
    }
}

function validateIntent(raw) {
    if (!raw || !SOURCES.has(raw.sourceType)
        || typeof raw.sourceEventId !== 'string'
        || !/^[A-Za-z0-9:_.-]{8,120}$/.test(raw.sourceEventId)
        || !Number.isSafeInteger(Number(raw.userId)) || Number(raw.userId) < 1
        || typeof raw.catalogSlug !== 'string'
        || !/^[a-z][a-z0-9._-]{1,119}$/.test(raw.catalogSlug)
        || !raw.payload || typeof raw.payload !== 'object' || Array.isArray(raw.payload)
        || Buffer.byteLength(stableStringify(raw.payload), 'utf8') > 4096) {
        throw new RewardGrantIntentError('REWARD_GRANT_INTENT_INVALID', 'Invalid trusted reward grant intent');
    }
    return Object.freeze({ sourceType: raw.sourceType, sourceEventId: raw.sourceEventId,
        userId: Number(raw.userId), catalogSlug: raw.catalogSlug,
        payload: Object.freeze({ ...raw.payload }) });
}

function intentSemanticHash(intent) {
    return crypto.createHash('sha256').update(stableStringify({
        sourceType: intent.sourceType,
        sourceEventId: intent.sourceEventId,
        userId: intent.userId,
        catalogSlug: intent.catalogSlug,
        payload: intent.payload
    })).digest('hex');
}

class RewardGrantIntentWriter {
    async enqueue(client, raw) {
        if (!client?.query) throw new TypeError('Reward grant intent writer requires a transaction client');
        const intent = validateIntent(raw);
        const semanticHash = intentSemanticHash(intent);
        const id = crypto.randomUUID();
        const inserted = await client.query(`INSERT INTO reward_grant_intents(
            id,source_type,source_event_id,user_id,catalog_slug,semantic_hash,payload)
            VALUES($1,$2,$3,$4,$5,$6,$7::JSONB)
            ON CONFLICT(source_type,source_event_id) DO NOTHING RETURNING *`,
        [id, intent.sourceType, intent.sourceEventId, intent.userId, intent.catalogSlug,
            semanticHash, JSON.stringify(intent.payload)]);
        let row = inserted.rows[0];
        if (!row) {
            row = (await client.query(`SELECT * FROM reward_grant_intents
                WHERE source_type=$1 AND source_event_id=$2`,
            [intent.sourceType, intent.sourceEventId])).rows[0];
            if (!row || row.semantic_hash !== semanticHash || Number(row.user_id) !== intent.userId
                || row.catalog_slug !== intent.catalogSlug) {
                throw new RewardGrantIntentError('REWARD_GRANT_INTENT_COLLISION',
                    'Trusted reward source identity changed semantics');
            }
            return { inserted: false, intent: row };
        }
        await client.query(`INSERT INTO reward_grant_intent_events(
            event_id,intent_id,sequence,event_type,details)
            VALUES($1,$2,1,'intent_created',$3::JSONB)`, [crypto.randomUUID(), row.id,
            JSON.stringify({ sourceType: intent.sourceType, sourceEventId: intent.sourceEventId,
                catalogSlug: intent.catalogSlug })]);
        return { inserted: true, intent: row };
    }
}

module.exports = { RewardGrantIntentError, RewardGrantIntentWriter, SOURCES,
    intentSemanticHash, validateIntent };
