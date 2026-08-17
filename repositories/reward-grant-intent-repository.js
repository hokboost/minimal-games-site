'use strict';

const crypto = require('node:crypto');

function safeLimit(value, fallback = 20) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 1 && number <= 100 ? number : fallback;
}

function errorCode(error) {
    const value = String(error?.code || error?.name || 'REWARD_DISPATCH_FAILED');
    return /^[A-Za-z0-9_.-]{3,100}$/.test(value) ? value : 'REWARD_DISPATCH_FAILED';
}

class RewardGrantIntentRepository {
    constructor({ pool, clock = () => new Date(), maxAttempts = 5 }) {
        if (!pool?.connect || !pool?.query) throw new TypeError('Reward grant intent repository requires pool');
        this.pool = pool;
        this.clock = clock;
        this.maxAttempts = maxAttempts;
    }

    async transaction(work) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await work(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async appendEvent(client, intentId, eventType, workerId = null, details = {}) {
        const sequence = Number((await client.query(`SELECT COALESCE(MAX(sequence),0)+1 AS sequence
            FROM reward_grant_intent_events WHERE intent_id=$1`, [intentId])).rows[0].sequence);
        await client.query(`INSERT INTO reward_grant_intent_events(
            event_id,intent_id,sequence,event_type,worker_id,details)
            VALUES($1,$2,$3,$4,$5,$6::JSONB)`, [crypto.randomUUID(), intentId, sequence,
            eventType, workerId, JSON.stringify(details)]);
    }

    async recoverExpiredLeases(client) {
        const recovered = await client.query(`UPDATE reward_grant_intents
            SET status='pending',available_at=NOW(),lease_owner=NULL,lease_expires_at=NULL,
                last_error_code='REWARD_DISPATCH_LEASE_EXPIRED',
                last_error_detail='Dispatcher lease expired before transactional settlement',updated_at=NOW()
            WHERE status='processing' AND lease_expires_at<=NOW()
            RETURNING id,attempts`);
        for (const row of recovered.rows) await this.appendEvent(client, row.id, 'lease_recovered', null,
            { attempts: Number(row.attempts) });
        return recovered.rowCount;
    }

    async claimBatch(workerId, { limit = 20, leaseSeconds = 60 } = {}) {
        if (typeof workerId !== 'string' || !/^[A-Za-z0-9._:-]{8,120}$/.test(workerId)) {
            throw new TypeError('Invalid reward dispatcher worker identity');
        }
        const boundedLimit = safeLimit(limit);
        const boundedLease = Number.isSafeInteger(Number(leaseSeconds))
            ? Math.max(10, Math.min(600, Number(leaseSeconds))) : 60;
        return this.transaction(async client => {
            await this.recoverExpiredLeases(client);
            const claimed = await client.query(`WITH candidate AS (
                SELECT id FROM reward_grant_intents
                WHERE status='pending' AND available_at<=NOW()
                ORDER BY available_at,created_at,id
                FOR UPDATE SKIP LOCKED LIMIT $1
            )
            UPDATE reward_grant_intents intent
            SET status='processing',attempts=intent.attempts+1,lease_owner=$2,
                lease_expires_at=NOW()+make_interval(secs=>$3),updated_at=NOW()
            FROM candidate WHERE intent.id=candidate.id
            RETURNING intent.*`, [boundedLimit, workerId, boundedLease]);
            for (const row of claimed.rows) await this.appendEvent(client, row.id, 'intent_claimed', workerId,
                { attempt: Number(row.attempts), leaseSeconds: boundedLease });
            return claimed.rows;
        });
    }

    async lockClaim(client, intentId, workerId) {
        return (await client.query(`SELECT intent.*,account.username
            FROM reward_grant_intents intent JOIN users account ON account.id=intent.user_id
            WHERE intent.id=$1 AND intent.status='processing' AND intent.lease_owner=$2
              AND intent.lease_expires_at>NOW() FOR UPDATE OF intent`, [intentId, workerId])).rows[0] || null;
    }

    async completeClaim(client, intent, workerId, orderId, response) {
        const completed = await client.query(`UPDATE reward_grant_intents
            SET status='completed',order_id=$3,response_snapshot=$4::JSONB,
                lease_owner=NULL,lease_expires_at=NULL,completed_at=NOW(),updated_at=NOW()
            WHERE id=$1 AND status='processing' AND lease_owner=$2 RETURNING *`,
        [intent.id, workerId, orderId, JSON.stringify(response)]);
        if (completed.rowCount !== 1) throw new Error('Reward grant intent lease changed during settlement');
        await this.appendEvent(client, intent.id, 'dispatch_completed', workerId,
            { orderId, replayedOrder: response.replayed === true });
        return completed.rows[0];
    }

    async failClaim(intent, workerId, error) {
        return this.transaction(async client => {
            const row = (await client.query(`SELECT * FROM reward_grant_intents
                WHERE id=$1 FOR UPDATE`, [intent.id])).rows[0];
            if (!row || row.status === 'completed' || row.status === 'dead_letter') return row || null;
            if (row.status !== 'processing' || row.lease_owner !== workerId) return row;
            const terminal = Number(row.attempts) >= this.maxAttempts;
            const code = errorCode(error);
            const detail = String(error?.message || 'Reward dispatch failed').slice(0, 500);
            const next = await client.query(`UPDATE reward_grant_intents
                SET status=$3::VARCHAR(20),available_at=CASE WHEN $3='pending'
                      THEN NOW()+make_interval(secs=>LEAST(300,attempts*attempts*5)) ELSE available_at END,
                    lease_owner=NULL,lease_expires_at=NULL,last_error_code=$4,last_error_detail=$5,
                    dead_lettered_at=CASE WHEN $3='dead_letter' THEN NOW() ELSE NULL END,updated_at=NOW()
                WHERE id=$1 AND status='processing' AND lease_owner=$2 RETURNING *`,
            [row.id, workerId, terminal ? 'dead_letter' : 'pending', code, detail]);
            await this.appendEvent(client, row.id,
                terminal ? 'dispatch_dead_lettered' : 'dispatch_retry', workerId,
                { attempt: Number(row.attempts), errorCode: code });
            return next.rows[0];
        });
    }

    async listDeadLetters(limit = 50) {
        return (await this.pool.query(`SELECT intent.id,intent.source_type,intent.source_event_id,
            intent.catalog_slug,intent.attempts,intent.last_error_code,intent.last_error_detail,
            intent.dead_lettered_at,account.username
            FROM reward_grant_intents intent JOIN users account ON account.id=intent.user_id
            WHERE intent.status='dead_letter' ORDER BY intent.dead_lettered_at DESC,intent.id LIMIT $1`,
        [safeLimit(limit, 50)])).rows;
    }
}

module.exports = { RewardGrantIntentRepository, errorCode, safeLimit };
