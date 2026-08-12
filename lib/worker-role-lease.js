'use strict';

const { parseInteger } = require('./integer-money');

const ROLE_PATTERN = /^[a-z0-9_-]{2,50}$/i;
const WORKER_ID_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;

function validateLeaseIdentity(role, workerId) {
    if (!ROLE_PATTERN.test(String(role || ''))
        || !WORKER_ID_PATTERN.test(String(workerId || ''))) {
        throw new Error('Invalid worker lease identity');
    }
}

async function acquireWorkerRoleLease(client, {
    role,
    workerId,
    ttlSeconds = 90
}) {
    validateLeaseIdentity(role, workerId);
    const ttl = parseInteger(ttlSeconds, 'worker lease TTL', { min: 30, max: 300 });
    const result = await client.query(`
        INSERT INTO worker_role_leases (
            role, worker_id, lease_generation, lease_expires_at, updated_at
        ) VALUES (
            $1, $2, 1, NOW() + make_interval(secs => $3), NOW()
        )
        ON CONFLICT (role) DO UPDATE
        SET worker_id = EXCLUDED.worker_id,
            lease_generation = CASE
                WHEN worker_role_leases.worker_id = EXCLUDED.worker_id
                    THEN worker_role_leases.lease_generation
                ELSE worker_role_leases.lease_generation + 1
            END,
            lease_expires_at = EXCLUDED.lease_expires_at,
            updated_at = NOW()
        WHERE worker_role_leases.worker_id = EXCLUDED.worker_id
           OR worker_role_leases.lease_expires_at <= NOW()
        RETURNING role, worker_id, lease_generation, lease_expires_at
    `, [role, workerId, ttl]);
    return result.rows[0] || null;
}

async function hasActiveWorkerRoleLease(executor, { role, workerId }) {
    validateLeaseIdentity(role, workerId);
    const result = await executor.query(`
        SELECT 1
        FROM worker_role_leases
        WHERE role = $1
          AND worker_id = $2
          AND lease_expires_at > NOW()
    `, [role, workerId]);
    return result.rowCount === 1;
}

async function releaseWorkerRoleLease(client, { role, workerId }) {
    validateLeaseIdentity(role, workerId);
    const result = await client.query(`
        UPDATE worker_role_leases
        SET lease_expires_at = NOW(), updated_at = NOW()
        WHERE role = $1 AND worker_id = $2
        RETURNING role
    `, [role, workerId]);
    return result.rowCount === 1;
}

module.exports = {
    acquireWorkerRoleLease,
    hasActiveWorkerRoleLease,
    releaseWorkerRoleLease
};
