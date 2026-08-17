'use strict';

(() => {
    const root = document.body;
    const csrfToken = root.dataset.csrfToken;
    const message = document.getElementById('quest-message');
    const lang = root.dataset.lang === 'zh' ? 'zh' : 'en';
    async function post(path, body) {
        if (typeof window.idempotentFetch !== 'function') throw new Error('Request helper unavailable');
        const response = await window.idempotentFetch(path, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(body)
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'Request failed');
        return payload;
    }
    document.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.closest('form')) return;
        button.disabled = true;
        try {
            const action = button.dataset.action;
            const card = button.closest('[data-assignment-id]');
            if (action === 'claim') await post('/api/quests/v2/offers/claim', { versionId: Number(button.dataset.versionId), boardId: Number(button.dataset.boardId), chainId: button.dataset.chainId ? Number(button.dataset.chainId) : undefined });
            else if (action === 'legacy-import') await post('/api/quests/v2/legacy/import', { taskCardAssignmentId: Number(button.dataset.taskCardId) });
            else {
                const body = { assignmentId: Number(card.dataset.assignmentId), expectedRevision: Number(card.dataset.revision) };
                if (action === 'postpone') body.hours = 24;
                await post(`/api/quests/v2/assignments/${action}`, body);
            }
            location.reload();
        } catch (error) {
            message.textContent = error.message;
            button.disabled = false;
        }
    });
    document.addEventListener('submit', async (event) => {
        const appealForm = event.target.closest('.appeal-form');
        if (appealForm) {
            event.preventDefault();
            const button = appealForm.querySelector('button');
            const card = appealForm.closest('[data-assignment-id]');
            const reason = appealForm.querySelector('textarea').value.trim();
            button.disabled = true;
            try {
                if (typeof window.crypto?.randomUUID !== 'function') {
                    throw new Error('Secure command identity is unavailable');
                }
                await post('/api/quests/v2/appeals/submit', {
                    assignmentId: Number(card.dataset.assignmentId),
                    commandId: window.crypto.randomUUID(),
                    reason
                });
                location.reload();
            } catch (error) {
                message.textContent = error.message;
                button.disabled = false;
            }
            return;
        }
        const form = event.target.closest('.evidence-form');
        if (!form) return;
        event.preventDefault();
        const button = form.querySelector('button'); button.disabled = true;
        const card = form.closest('[data-assignment-id]');
        const value = form.querySelector('textarea')?.value || '';
        const kind = form.dataset.kind;
        let evidence = kind === 'checklist'
            ? { kind, items: value.split(/\n+/).filter(Boolean).slice(0, 20).map((label) => ({ label, checked: true })) }
            : { kind, text: value };
        try {
            if (kind === 'png') {
                const file = form.querySelector('input[type=file]').files[0];
                if (!file || file.type !== 'image/png' || file.size > 768 * 1024) throw new Error('Choose a PNG no larger than 768 KB');
                evidence = { imageData: await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) };
            }
            await post('/api/quests/v2/evidence/submit', { assignmentId: Number(card.dataset.assignmentId), stepId: Number(form.dataset.stepId), evidence });
            location.reload();
        } catch (error) { message.textContent = error.message; button.disabled = false; }
    });
    function updateDeadlines() {
        const now = Date.now();
        for (const element of document.querySelectorAll('[data-quest-deadline]')) {
            const deadline = Date.parse(element.dateTime);
            if (!Number.isFinite(deadline)) continue;
            const remaining = deadline - now;
            if (remaining <= 0) {
                element.textContent = lang === 'zh' ? '已到期，等待服务器归档' : 'Expired; awaiting server archive';
                element.dataset.expired = 'true';
                continue;
            }
            const days = Math.floor(remaining / 86400000);
            const hours = Math.floor((remaining % 86400000) / 3600000);
            element.textContent = lang === 'zh'
                ? `${days} 天 ${hours} 小时`
                : `${days}d ${hours}h remaining`;
        }
    }
    updateDeadlines();
    const deadlineTimer = setInterval(updateDeadlines, 60000);
    deadlineTimer?.unref?.();
    if (lang === 'zh') message.textContent = '积分只会在可信事件或人工审核后结算。';
})();
