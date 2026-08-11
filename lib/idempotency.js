const crypto = require('crypto');

// gift_exchanges keeps this key in a legacy VARCHAR(100) column.
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
const FINALIZE_ATTEMPTS = 3;

async function retryQuery(pool, text, values) {
    let lastError;
    for (let attempt = 1; attempt <= FINALIZE_ATTEMPTS; attempt += 1) {
        try {
            return await pool.query(text, values);
        } catch (error) {
            lastError = error;
            if (attempt < FINALIZE_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 25));
            }
        }
    }
    throw lastError;
}

function stableStringify(value) {
    if (value === undefined || typeof value === 'function') return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map((key) => (
        `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
}

function hashRequest(req) {
    return crypto.createHash('sha256')
        .update(`${req.method}:${req.path}:${stableStringify(req.body || {})}`)
        .digest('hex');
}

function createIdempotencyMiddleware({ pool, paths, validateExistingRequest = null }) {
    const protectedPaths = new Set(paths);

    return async function requireIdempotency(req, res, next) {
        if (req.method !== 'POST' || !protectedPaths.has(req.path)) return next();

        const username = req.session?.user?.username;
        if (!username) return next();

        const key = String(req.get('Idempotency-Key') || '').trim();
        if (!KEY_PATTERN.test(key)) {
            return res.status(400).json({
                success: false,
                message: '缺少或无效的 Idempotency-Key'
            });
        }

        const requestHash = hashRequest(req);
        try {
            const inserted = await pool.query(`
                INSERT INTO idempotency_keys (
                    username, idempotency_key, request_method, request_path,
                    request_hash, status, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), NOW())
                ON CONFLICT (username, idempotency_key) DO NOTHING
                RETURNING id
            `, [username, key, req.method, req.path, requestHash]);

            if (inserted.rows.length === 0) {
                if (validateExistingRequest) {
                    const denial = await validateExistingRequest(req);
                    if (denial) {
                        return res.status(denial.status || 403).json({
                            success: false,
                            message: denial.message || '请求验证失败'
                        });
                    }
                }
                const existingResult = await pool.query(`
                    SELECT request_hash, status, response_status, response_body, updated_at
                    FROM idempotency_keys
                    WHERE username = $1 AND idempotency_key = $2
                `, [username, key]);
                const existing = existingResult.rows[0];

                if (!existing || existing.request_hash !== requestHash) {
                    res.set('Idempotency-Status', 'conflict');
                    return res.status(409).json({
                        success: false,
                        message: '幂等键已用于其他请求'
                    });
                }
                if (existing.status === 'completed') {
                    res.set('Idempotency-Status', 'replayed');
                    return res.status(existing.response_status || 200).json(existing.response_body || {});
                }

                res.set('Idempotency-Status', 'pending');
                return res.status(409).json({
                    success: false,
                    message: '相同请求正在处理或状态待确认，请勿重复操作'
                });
            }

            req.idempotencyKey = key;
            const originalJson = res.json.bind(res);
            let finalized = false;

            res.json = function idempotentJson(body) {
                if (finalized || res.headersSent) return originalJson(body);
                finalized = true;
                const responseStatus = res.statusCode || 200;
                res.set('Idempotency-Status', 'created');
                const finalize = responseStatus >= 500
                    ? retryQuery(pool,
                        'DELETE FROM idempotency_keys WHERE username = $1 AND idempotency_key = $2',
                        [username, key]
                    )
                    : retryQuery(pool, `
                        UPDATE idempotency_keys
                        SET status = 'completed', response_status = $3, response_body = $4,
                            updated_at = NOW()
                        WHERE username = $1 AND idempotency_key = $2
                    `, [username, key, responseStatus, JSON.stringify(body ?? {})]);

                finalize
                    .catch((error) => console.error('Idempotency finalize failed:', error))
                    .finally(() => originalJson(body));
                return res;
            };

            return next();
        } catch (error) {
            console.error('Idempotency middleware failed:', error);
            return res.status(503).json({
                success: false,
                message: '请求去重服务暂不可用，请稍后重试'
            });
        }
    };
}

module.exports = {
    createIdempotencyMiddleware,
    hashRequest,
    retryQuery,
    stableStringify
};
