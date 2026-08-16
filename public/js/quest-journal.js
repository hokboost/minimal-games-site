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
    if (lang === 'zh') message.textContent = '积分只会在可信事件或人工审核后结算。';
})();
