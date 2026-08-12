const crypto = require('crypto');

class PostgresRateLimitStore {
    constructor(pool, namespace) {
        if (!pool?.query || !/^[a-z0-9:_-]{1,80}$/i.test(namespace)) {
            throw new TypeError('A database pool and a safe rate-limit namespace are required');
        }
        this.pool = pool;
        this.namespace = namespace;
        this.windowMs = 60000;
        this.localKeys = false;
    }

    init(options) {
        const windowMs = Number(options?.windowMs);
        if (!Number.isSafeInteger(windowMs) || windowMs < 1) {
            throw new TypeError('A positive rate-limit window is required');
        }
        this.windowMs = windowMs;
    }

    hashKey(key) {
        return crypto
            .createHash('sha256')
            .update(`${this.namespace}\0${String(key)}`)
            .digest('hex');
    }

    async get(key) {
        const result = await this.pool.query(`
            SELECT total_hits, reset_time
            FROM rate_limit_counters
            WHERE namespace = $1 AND key_hash = $2 AND reset_time > NOW()
        `, [this.namespace, this.hashKey(key)]);
        if (!result.rows[0]) return undefined;
        return {
            totalHits: Number(result.rows[0].total_hits),
            resetTime: new Date(result.rows[0].reset_time)
        };
    }

    async increment(key) {
        const result = await this.pool.query(`
            INSERT INTO rate_limit_counters (
                namespace, key_hash, total_hits, reset_time, updated_at
            ) VALUES ($1, $2, 1, NOW() + ($3::bigint * INTERVAL '1 millisecond'), NOW())
            ON CONFLICT (namespace, key_hash) DO UPDATE
            SET total_hits = CASE
                    WHEN rate_limit_counters.reset_time <= NOW() THEN 1
                    ELSE rate_limit_counters.total_hits + 1
                END,
                reset_time = CASE
                    WHEN rate_limit_counters.reset_time <= NOW()
                        THEN NOW() + ($3::bigint * INTERVAL '1 millisecond')
                    ELSE rate_limit_counters.reset_time
                END,
                updated_at = NOW()
            RETURNING total_hits, reset_time
        `, [this.namespace, this.hashKey(key), this.windowMs]);
        return {
            totalHits: Number(result.rows[0].total_hits),
            resetTime: new Date(result.rows[0].reset_time)
        };
    }

    async decrement(key) {
        await this.pool.query(`
            UPDATE rate_limit_counters
            SET total_hits = GREATEST(0, total_hits - 1), updated_at = NOW()
            WHERE namespace = $1 AND key_hash = $2 AND reset_time > NOW()
        `, [this.namespace, this.hashKey(key)]);
    }

    async resetKey(key) {
        await this.pool.query(
            'DELETE FROM rate_limit_counters WHERE namespace = $1 AND key_hash = $2',
            [this.namespace, this.hashKey(key)]
        );
    }

    async resetAll() {
        await this.pool.query('DELETE FROM rate_limit_counters WHERE namespace = $1', [this.namespace]);
    }
}

module.exports = PostgresRateLimitStore;
