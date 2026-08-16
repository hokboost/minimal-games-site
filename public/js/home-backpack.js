(() => {
    const container = document.getElementById('home-backpack-list');
    if (!container) return;
    const zh = document.documentElement.lang.startsWith('zh');
    const t = (cn, en) => (zh ? cn : en);
    const csrfToken = document.body.dataset.csrfToken || '';
    let busyId = null;

    function statusText(item) {
        const values = {
            stored: t('可以送出', 'Ready to send'),
            queued: t('发送中', 'Sending'),
            sent: t('已发送', 'Sent'),
            failed: t('发送失败', 'Failed'),
            expired: t('已过期', 'Expired')
        };
        return values[item.status] || String(item.status || '-');
    }

    function render(items) {
        if (!items.length) {
            const empty = document.createElement('p');
            empty.className = 'home-backpack-empty';
            empty.textContent = t('背包还是空空的，祈愿中奖后礼物会出现在这里。', 'Your backpack is empty. Gifts won from wishes will appear here.');
            container.replaceChildren(empty);
            return;
        }
        container.replaceChildren(...items.slice(0, 6).map((item) => {
            const card = document.createElement('article');
            card.className = 'home-backpack-item';
            const icon = document.createElement('span');
            icon.className = 'home-backpack-icon';
            icon.textContent = '🎁';
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = String(item.gift_name || t('礼物', 'Gift'));
            const status = document.createElement('span');
            status.textContent = statusText(item);
            copy.append(title, status);
            card.append(icon, copy);
            if (item.status === 'stored') {
                const send = document.createElement('button');
                send.type = 'button';
                send.textContent = busyId === Number(item.id) ? t('加入中…', 'Queuing…') : t('立即送出', 'Send now');
                send.disabled = busyId !== null;
                send.addEventListener('click', () => sendItem(Number(item.id)));
                card.append(send);
            }
            return card;
        }));
    }

    async function load() {
        const response = await fetch('/api/wish/backpack?limit=6', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || t('背包加载失败', 'Could not load backpack'));
        render(Array.isArray(data.items) ? data.items : []);
    }

    async function sendItem(inventoryId) {
        if (busyId !== null || !Number.isSafeInteger(inventoryId)) return;
        busyId = inventoryId;
        try {
            if (typeof window.idempotentFetch !== 'function') throw new Error(t('请求组件未加载', 'Request helper unavailable'));
            const response = await window.idempotentFetch('/api/wish/backpack/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify({ inventoryId })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || t('送出失败', 'Could not send gift'));
            await load();
        } catch (error) {
            container.textContent = String(error.message || error);
        } finally {
            busyId = null;
        }
    }

    load().catch((error) => { container.textContent = String(error.message || error); });
})();
