'use strict';

const { MUTATING_ADMIN_PATHS } = require('../routes/manifest');
const { normalizeIp } = require('./client-ip');

function scopedAuditRequestId(actor, requestId) {
    if (!requestId) return null;
    return `${actor}:${requestId}`.slice(0, 200);
}

function createAdminFailureAuditMiddleware(pool) {
    return function captureAdminFailure(req, res, next) {
        if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
            || !MUTATING_ADMIN_PATHS.has(req.path)) {
            return next();
        }

        let captured = false;
        const capture = (aborted = false) => {
            if (captured) return;
            captured = true;
            const status = aborted && !res.writableFinished ? 499 : res.statusCode;
            if (status < 400) return;
            const actor = String(req.session?.user?.username || 'anonymous').slice(0, 50);
            const requestId = scopedAuditRequestId(actor, req.idempotencyKey || req.requestId);
            const action = `failed_${req.method.toLowerCase()}_${req.path
                .replace(/[^a-z0-9]+/gi, '_')}`.slice(0, 100);
            const details = JSON.stringify({
                result: aborted ? 'aborted' : 'rejected',
                status,
                method: req.method,
                path: req.path
            });
            pool.query(`
                INSERT INTO admin_audit_log (
                    request_id, admin_username, action, details, ip_address
                )
                SELECT $1::varchar(200), $2, $3, $4::jsonb, $5
                WHERE NOT EXISTS (
                    SELECT 1 FROM admin_audit_log WHERE request_id = $1::varchar(200)
                )
                ON CONFLICT DO NOTHING
            `, [requestId, actor, action, details, normalizeIp(req.clientIP)]).catch((error) => {
                const code = typeof error?.code === 'string' && /^[A-Z0-9_]{1,30}$/i.test(error.code)
                    ? error.code
                    : 'unknown';
                console.error('管理员失败操作审计写入失败', { code });
            });
        };
        res.once('finish', () => capture(false));
        res.once('close', () => capture(true));
        return next();
    };
}

module.exports = {
    MUTATING_ADMIN_PATHS,
    createAdminFailureAuditMiddleware,
    scopedAuditRequestId
};
