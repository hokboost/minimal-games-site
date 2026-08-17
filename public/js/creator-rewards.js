'use strict';

(() => {
    const root = document.body;
    const message = document.getElementById('reward-message');
    let busy = false;
    const pendingCommands = new Map();
    const text = (zh, en) => root.dataset.lang === 'zh' ? zh : en;

    async function mutate(path, body) {
        if (typeof window.idempotentFetch !== 'function') throw new Error(text('请求组件未加载', 'Request helper unavailable'));
        const signature = `${path}:${JSON.stringify(body)}`;
        const commandId = pendingCommands.get(signature) || crypto.randomUUID();
        pendingCommands.set(signature, commandId);
        const response = await window.idempotentFetch(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': root.dataset.csrfToken },
            body: JSON.stringify({ commandId, ...body })
        });
        const payload = await response.json();
        if (!response.ok) {
            pendingCommands.delete(signature);
            throw new Error(payload.message || payload.code || 'Request failed');
        }
        pendingCommands.delete(signature);
        return payload;
    }

    function setBusy(value) {
        busy = value;
        document.querySelectorAll('[data-reward-action]').forEach(button => {
            button.disabled = value || button.dataset.ruleDisabled === 'true';
        });
    }

    document.querySelectorAll('[data-reward-action][disabled]').forEach(button => {
        button.dataset.ruleDisabled = 'true';
    });
    document.addEventListener('click', async event => {
        const button = event.target.closest?.('[data-reward-action]');
        if (!button || busy || button.disabled) return;
        const card = button.closest('[data-catalog-version-id],[data-order-id]');
        const action = button.dataset.rewardAction;
        const routes = {
            create: ['/api/creator-rewards/orders/create', { catalogVersionId: Number(card.dataset.catalogVersionId), quantity: 1 }],
            wishlist: ['/api/creator-rewards/wishlist/update', { catalogVersionId: Number(card.dataset.catalogVersionId), targetQuantity: 1, priority: 3 }],
            claim: ['/api/creator-rewards/orders/claim', { orderId: card.dataset.orderId }],
            cancel: ['/api/creator-rewards/orders/cancel', { orderId: card.dataset.orderId }]
        };
        if (!routes[action]) return;
        setBusy(true);
        try {
            await mutate(...routes[action]);
            message.textContent = text('已保存，正在刷新权威状态。', 'Saved. Refreshing authoritative state.');
            location.reload();
        } catch (error) {
            message.textContent = error.message;
            setBusy(false);
        }
    });

    window.CreatorRewardsUI = Object.freeze({ mutate, setBusy });
})();
