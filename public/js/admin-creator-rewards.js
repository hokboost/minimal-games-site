'use strict';

(() => {
    const root = document.body;
    const message = document.getElementById('reward-message');
    let busy = false;
    const pendingCommands = new Map();

    async function mutate(path, body) {
        if (typeof window.idempotentFetch !== 'function') throw new Error('Request helper unavailable');
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
        document.querySelectorAll('#reward-grant-form button,[data-review]').forEach(button => { button.disabled = value; });
    }

    document.getElementById('reward-grant-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const data = new FormData(event.currentTarget);
        setBusy(true);
        try {
            await mutate('/api/admin/creator-director/reward-grants/create', {
                creatorUsername: data.get('creatorUsername'),
                catalogVersionId: Number(data.get('catalogVersionId')),
                templateKey: data.get('templateKey')
            });
            location.reload();
        } catch (error) { message.textContent = error.message; setBusy(false); }
    });
    document.addEventListener('click', async event => {
        const button = event.target.closest?.('[data-review]');
        if (!button || busy) return;
        setBusy(true);
        try {
            await mutate('/api/admin/creator-rewards/reviews/decide', {
                orderId: button.closest('[data-order-id]').dataset.orderId,
                decision: button.dataset.review
            });
            location.reload();
        } catch (error) { message.textContent = error.message; setBusy(false); }
    });

    window.AdminCreatorRewardsUI = Object.freeze({ mutate, setBusy });
})();
