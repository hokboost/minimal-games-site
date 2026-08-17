const crypto = require('crypto');
const { setRequestId } = require('./request-context');

// gift_exchanges keeps this key in a legacy VARCHAR(100) column.
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
const FINALIZE_ATTEMPTS = 5;
const INDETERMINATE_RESPONSE = Object.freeze({
    success: false,
    message: '请求处理结果无法自动确认，请联系管理员核对账务'
});

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

function bodyForHash(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body || {};
    const sanitized = { ...body };
    delete sanitized.csrfToken;
    delete sanitized._csrf;
    return sanitized;
}

function hashRequest(req, secret = '') {
    const payload = `${req.method}:${req.path}:${stableStringify(bodyForHash(req.body))}`;
    const digest = secret
        ? crypto.createHmac('sha256', secret)
        : crypto.createHash('sha256');
    return digest
        .update(payload)
        .digest('hex');
}

function createIdempotencyMiddleware({
    pool,
    paths,
    validateExistingRequest = null,
    validateTransactionalRequest = null,
    hashSecret = ''
}) {
    const protectedPaths = new Set(paths);

    return async function requireIdempotency(req, res, next) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
            || !protectedPaths.has(req.path)) return next();

        const username = req.session?.user?.username;
        if (!username) return next();

        const key = String(req.get('Idempotency-Key') || '').trim();
        if (!KEY_PATTERN.test(key)) {
            return res.status(400).json({
                success: false,
                message: '缺少或无效的 Idempotency-Key'
            });
        }

        try {
            if (validateExistingRequest) {
                const denial = await validateExistingRequest(req);
                if (denial) {
                    return res.status(denial.status || 403).json({
                        success: false,
                        message: denial.message || '请求验证失败'
                    });
                }
            }

            const requestHash = hashRequest(req, hashSecret);
            const inserted = await pool.query(`
                INSERT INTO idempotency_keys (
                    username, idempotency_key, request_method, request_path,
                    request_hash, status, created_at, updated_at
                )
                SELECT $1, $2, $3, $4, $5, 'pending', NOW(), NOW()
                WHERE (SELECT COUNT(*) FROM idempotency_keys
                       WHERE username = $1 AND status = 'pending') < 25
                  AND (SELECT COUNT(*) FROM idempotency_keys
                       WHERE username = $1 AND created_at >= NOW() - INTERVAL '1 day') < 1000
                ON CONFLICT (username, idempotency_key) DO NOTHING
                RETURNING id
            `, [username, key, req.method, req.path, requestHash]);

            if (inserted.rows.length === 0) {
                const existingResult = await pool.query(`
                    SELECT request_hash, status, response_status, response_body, updated_at
                    FROM idempotency_keys
                    WHERE username = $1 AND idempotency_key = $2
                `, [username, key]);
                const existing = existingResult.rows[0];

                if (!existing) {
                    return res.status(429).json({
                        success: false,
                        message: '幂等请求额度已用完，请稍后重试'
                    });
                }

                if (existing.request_hash !== requestHash) {
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

                if (existing.status === 'indeterminate') {
                    res.set('Idempotency-Status', 'indeterminate');
                    return res.status(existing.response_status || 409)
                        .json(existing.response_body || INDETERMINATE_RESPONSE);
                }

                res.set('Idempotency-Status', 'pending');
                return res.status(409).json({
                    success: false,
                    message: '相同请求正在处理或状态待确认，请勿重复操作'
                });
            }

            req.idempotencyKey = key;
            setRequestId(key);
            req.finalizeIdempotency = async (client, responseStatus, responseBody) => {
                if (validateTransactionalRequest) {
                    const denial = await validateTransactionalRequest(req, client);
                    if (denial) {
                        req.idempotencyTransactionDenial = {
                            status: denial.status || 401,
                            body: {
                                success: false,
                                message: denial.message || '登录会话已失效'
                            }
                        };
                        const error = new Error('Transactional session validation failed');
                        error.code = 'TRANSACTIONAL_SESSION_INVALID';
                        throw error;
                    }
                }
                const result = await client.query(`
                    UPDATE idempotency_keys
                    SET status = 'completed', response_status = $3, response_body = $4,
                        failure_reason = NULL, updated_at = NOW()
                    WHERE username = $1 AND idempotency_key = $2 AND status = 'pending'
                    RETURNING id
                `, [username, key, responseStatus, JSON.stringify(responseBody ?? {})]);
                if (result.rows.length !== 1) {
                    throw new Error('无法在业务事务内完成幂等记录');
                }
            };
            const originalJson = res.json.bind(res);
            const originalSend = res.send?.bind(res);
            const originalEnd = res.end?.bind(res);
            let finalized = false;

            const finalizeResponse = (sender, args, body) => {
                if (finalized || res.headersSent) return sender(...args);
                finalized = true;
                const transactionDenial = req.idempotencyTransactionDenial;
                const responseStatus = transactionDenial?.status || res.statusCode || 200;
                const responseBody = transactionDenial?.body || body;
                const responseSender = transactionDenial ? originalJson : sender;
                const responseArgs = transactionDenial ? [responseBody] : args;
                if (transactionDenial) res.status(responseStatus);
                res.set('Idempotency-Status', 'created');
                const finalize = responseStatus >= 500
                    ? retryQuery(pool, `
                        UPDATE idempotency_keys
                        SET status = 'indeterminate', response_status = 409,
                            response_body = $3,
                            failure_reason = '请求返回服务端错误，业务结果需要核对',
                            updated_at = NOW()
                        WHERE username = $1 AND idempotency_key = $2 AND status = 'pending'
                        RETURNING id
                    `, [username, key, JSON.stringify(INDETERMINATE_RESPONSE)]).then(async (updated) => {
                        if (updated.rows.length > 0) return {
                            status: 'indeterminate',
                            response_status: 409,
                            response_body: INDETERMINATE_RESPONSE
                        };
                        const terminal = await retryQuery(pool, `
                            SELECT status, response_status, response_body
                            FROM idempotency_keys
                            WHERE username = $1 AND idempotency_key = $2
                              AND status IN ('completed', 'indeterminate')
                        `, [username, key]);
                        return terminal.rows[0] || null;
                    })
                    : retryQuery(pool, `
                        UPDATE idempotency_keys
                        SET status = 'completed', response_status = $3, response_body = $4,
                            updated_at = NOW()
                        WHERE username = $1 AND idempotency_key = $2 AND status = 'pending'
                        RETURNING id
                    `, [username, key, responseStatus, JSON.stringify(responseBody ?? {})]).then(async (updated) => {
                        if (updated.rows.length > 0) return null;
                        const terminal = await retryQuery(pool, `
                            SELECT status, response_status, response_body
                            FROM idempotency_keys
                            WHERE username = $1 AND idempotency_key = $2
                              AND status IN ('completed', 'indeterminate')
                        `, [username, key]);
                        return terminal.rows[0] || null;
                    });

                finalize
                    .then((committed) => {
                        if (committed) {
                            res.set(
                                'Idempotency-Status',
                                committed.status === 'indeterminate' ? 'indeterminate' : 'replayed'
                            );
                            res.status(committed.response_status
                                || (committed.status === 'indeterminate' ? 409 : 200));
                            return originalJson(committed.response_body || {});
                        }
                        return responseSender(...responseArgs);
                    })
                    .catch((error) => {
                        console.error('Idempotency finalize failed:', error);
                        res.set('Idempotency-Status', 'pending');
                        return responseSender(...responseArgs);
                    });
                return res;
            };

            res.json = function idempotentJson(body) {
                return finalizeResponse(originalJson, [body], body);
            };
            if (originalSend) {
                res.send = function idempotentSend(body) {
                    return finalizeResponse(originalSend, [body], body);
                };
            }
            if (originalEnd) {
                res.end = function idempotentEnd(...args) {
                    return finalizeResponse(originalEnd, args, null);
                };
            }

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
    stableStringify,
    bodyForHash
};
