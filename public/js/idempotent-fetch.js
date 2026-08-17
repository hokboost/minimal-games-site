(() => {
    'use strict';

    // Some legacy pages include the shared shell more than once. Keep loading
    // this dependency harmless while preserving one in-memory request-key map.
    if (typeof window.idempotentFetch === 'function') return;

    const IDEMPOTENCY_STORAGE_KEY = 'minimal-games-pending-idempotency-v1';
    const IDEMPOTENCY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
    const pendingIdempotencyKeys = new Map();
    const persistPendingKeys = () => {
        try {
            sessionStorage.setItem(
                IDEMPOTENCY_STORAGE_KEY,
                JSON.stringify(Array.from(pendingIdempotencyKeys.entries()))
            );
        } catch (error) {
            // Storage can be disabled; in-memory replay still works for this page.
        }
    };
    const prunePendingKeys = () => {
        const now = Date.now();
        for (const [signature, entry] of pendingIdempotencyKeys.entries()) {
            if (!entry || now - Number(entry.createdAt) > IDEMPOTENCY_MAX_AGE_MS) {
                pendingIdempotencyKeys.delete(signature);
            }
        }
        persistPendingKeys();
    };
    try {
        const storedEntries = JSON.parse(sessionStorage.getItem(IDEMPOTENCY_STORAGE_KEY) || '[]');
        if (Array.isArray(storedEntries)) {
            for (const [signature, entry] of storedEntries) {
                if (typeof signature === 'string' && signature.length <= 20000
                    && entry && /^[A-Za-z0-9._:-]{8,100}$/.test(entry.key)) {
                    pendingIdempotencyKeys.set(signature, entry);
                }
            }
        }
    } catch (error) {
        // Ignore malformed or unavailable session storage.
    }
    prunePendingKeys();

    const newIdempotencyKey = () => {
        if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    };

    window.idempotentFetch = async (url, options = {}) => {
        const method = String(options.method || 'GET').toUpperCase();
        const signature = `${method}:${url}:${String(options.body || '')}`;
        const existing = pendingIdempotencyKeys.get(signature);
        const key = existing?.key || newIdempotencyKey();
        pendingIdempotencyKeys.set(signature, { key, createdAt: Date.now() });
        persistPendingKeys();

        const headers = new Headers(options.headers || {});
        headers.set('Idempotency-Key', key);
        try {
            const response = await fetch(url, { ...options, headers });
            const idempotencyStatus = response.headers.get('Idempotency-Status');
            if (!['pending', 'indeterminate'].includes(idempotencyStatus)) {
                pendingIdempotencyKeys.delete(signature);
                persistPendingKeys();
            }
            return response;
        } catch (error) {
            prunePendingKeys();
            throw error;
        }
    };
})();
