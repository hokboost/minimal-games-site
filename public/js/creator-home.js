(() => {
    'use strict';

    const csrfToken = document.body.dataset.csrfToken || '';
    const message = document.getElementById('creator-message');
    const chinese = document.documentElement.lang.startsWith('zh');

    function show(text, failed = false) {
        if (!message) return;
        message.textContent = text;
        message.classList.toggle('is-error', failed);
    }

    async function mutate(url, method, body) {
        show(chinese ? '正在保存…' : 'Saving…');
        try {
            const response = await window.idempotentFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(body)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || (chinese ? '保存失败' : 'Save failed'));
            window.location.reload();
        } catch (error) {
            show(error.message, true);
        }
    }

    document.addEventListener('click', (event) => {
        const memoryButton = event.target.closest('[data-memory-id]');
        if (memoryButton) {
            mutate('/api/creator/memories', 'PATCH', {
                memoryId: Number(memoryButton.dataset.memoryId),
                pinned: memoryButton.dataset.pinned === 'true',
                archived: memoryButton.dataset.archived === 'true',
                hidden: memoryButton.dataset.hidden === 'true',
                visibility: memoryButton.dataset.visibility
            });
            return;
        }
        const inboxButton = event.target.closest('[data-inbox-id]');
        if (inboxButton) {
            mutate(`/api/creator/inbox/${inboxButton.dataset.inboxAction}`, 'POST', {
                messageId: Number(inboxButton.dataset.inboxId)
            });
        }
    });
})();
