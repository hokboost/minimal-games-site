(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const messageMap = {
        'CSRF token验证失败': 'CSRF token verification failed',
        '账号已在其他设备登录': 'Account is logged in on another device',
        '请先登录': 'Please log in first',
        '未授权访问': 'Unauthorized access',
        '无权访问管理员后台': 'No permission to access admin panel',
        '尝试次数过多，请 10 分钟后再试。': 'Too many attempts. Please try again in 10 minutes.',
        '注册太频繁，请稍后再试。': 'Too many registrations. Please try again later.',
        '请填写所有字段': 'Please fill in all fields',
        '新密码和确认密码不匹配': 'New password and confirmation do not match',
        '新密码须为12-128位，并同时包含字母和数字': 'Password must be 12-128 characters with letters and numbers',
        '当前密码错误': 'Current password is incorrect',
        '密码修改成功！': 'Password updated successfully!',
        '修改密码失败，请稍后重试': 'Password update failed, please try again',
        '背包物品不存在': 'Backpack item not found',
        '该物品已处理': 'This item has already been processed',
        '未绑定房间号，暂不送出': 'No room ID bound, cannot send yet',
        '请先绑定B站房间号再送出礼物': 'Bind a Bilibili room ID before sending gifts',
        '送出失败，请稍后重试': 'Send failed, please try again',
        '服务配置错误': 'Service configuration error',
        '无效的API密钥': 'Invalid API key',
        'IP未授权': 'IP not authorized',
        '缺少签名头': 'Missing signature header',
        '无效时间戳': 'Invalid timestamp',
        '签名过期': 'Signature expired',
        '无效随机串': 'Invalid nonce',
        '请求过于频繁': 'Too many requests',
        '重复请求': 'Duplicate request',
        '签名不匹配': 'Signature mismatch',
        '听写次数不足': 'No dictation attempts remaining',
        '开始失败': 'Failed to start dictation'
    };

    const translateServerMessage = (message) => {
        const cleanMessage = typeof message === 'string'
            ? message.replace(/^(?:\u274c|\u26a0\ufe0f?)\s*/u, '')
            : message;
        if (!cleanMessage || lang === 'zh') {
            return cleanMessage;
        }
        return messageMap[cleanMessage] || cleanMessage;
    };

    window.translateServerMessage = translateServerMessage;
    window.escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[char]));

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
        if (globalThis.crypto?.randomUUID) {
            return globalThis.crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        globalThis.crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
            if (idempotencyStatus !== 'pending') {
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
