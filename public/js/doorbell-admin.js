(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    if (!$('doorbell-admin')) return;
    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    const storageKey = 'doorbell:admin:pending';
    let busy = false, pending = null;
    try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* storage optional */ }
    function remember(value) {
        pending = value;
        try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* server also deduplicates */ }
    }
    function controls() {
        for (const id of ['attempt-add', 'attempt-remove', 'attempt-amount', 'attempt-reason']) $(id).disabled = busy || Boolean(pending);
        $('attempt-retry').hidden = !pending; $('attempt-retry').disabled = busy; $('attempt-refresh').disabled = busy;
    }
    function render(data) {
        $('attempt-count').textContent = data.remaining;
        $('attempt-user').textContent = data.username;
        $('attempt-history').replaceChildren();
        for (const log of data.logs) {
            const row = document.createElement('div'); row.className = 'doorbell-history-item';
            const title = document.createElement('span'); title.textContent = `${log.amount > 0 ? '+' : ''}${log.amount} 次 · 剩余 ${log.remaining_after} 次`;
            const note = document.createElement('small'); note.textContent = `${log.reason} · ${log.actor} · ${new Date(log.created_at).toLocaleString('zh-CN')}`;
            row.append(title, note); $('attempt-history').append(row);
        }
    }
    async function request(body) {
        const response = await fetch('/api/admin/doorbell/attempts', { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
            signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, ...(body ? { body: JSON.stringify(body) } : {}) });
        const data = await response.json();
        if (!response.ok || !data.success) { const error = new Error(data.message || '调整失败'); error.status = response.status; throw error; }
        return data;
    }
    async function adjust(body) {
        if (busy) return;
        busy = true; remember(body); controls(); $('attempt-status').textContent = '正在保存…';
        try {
            await request(body); remember(null);
            render(await request()); $('attempt-status').textContent = '次数已更新。';
        } catch (error) {
            if (error.status && error.status < 500) remember(null);
            $('attempt-status').textContent = error.message || '没有收到结果，可重试刚才的调整，不会重复加减。';
        } finally { busy = false; controls(); }
    }
    $('attempt-form').addEventListener('submit', event => {
        event.preventDefault();
        if (busy || pending || !$('attempt-form').reportValidity()) return;
        const direction = Number(event.submitter?.dataset.direction);
        if (![1, -1].includes(direction)) return;
        adjust({ commandId: crypto.randomUUID(), delta: direction * Number($('attempt-amount').value), reason: $('attempt-reason').value });
    });
    $('attempt-retry').addEventListener('click', () => { if (pending) adjust(pending); });
    $('attempt-refresh').addEventListener('click', async () => {
        if (busy) return; busy = true; controls();
        try { render(await request()); $('attempt-status').textContent = pending ? '当前次数已刷新；刚才的调整仍可通过原编号重试确认。' : '已刷新。'; }
        catch (error) { $('attempt-status').textContent = error.message; }
        finally { busy = false; controls(); }
    });
    render(JSON.parse($('attempt-state').textContent)); controls();
    if (pending) $('attempt-status').textContent = '有一笔调整尚未确认，请重试确认结果。';
})();
