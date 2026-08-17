'use strict';
(() => {
    const root = document.body,
        lang = root.dataset.lang === 'zh' ? 'zh' : 'en',
        stateEl = document.getElementById('live-room-state'),
        actionsEl = document.getElementById('live-room-actions'),
        itemsEl = document.getElementById('live-items'),
        eventsEl = document.getElementById('live-events'),
        messageEl = document.getElementById('live-message'),
        connectionEl = document.getElementById('live-connection');
    let model = JSON.parse(document.getElementById('live-bootstrap').textContent);
    const replay = model.interaction ? window.LiveReplayState.create({
        interactionId: model.interaction.id,
        lastSequence: model.interaction.lastSequence,
        recent: model.recent || []
    }) : null;
    let catchUpPromise = null;
    const pending = new Map();
    const t = (zh, en) => lang === 'zh' ? zh : en;
    const commandId = () => globalThis.crypto.randomUUID();

    function button(label, action, data = {}) {
        const node = document.createElement('button');
        node.type = 'button';
        node.className = `live-button${action==='report'?' danger':''}`;
        node.textContent = label;
        node.dataset.action = action;
        Object.entries(data).forEach(([key, value]) => node.dataset[key] = String(value));
        return node;
    }
    async function post(path, body, signature) {
        if (typeof window.idempotentFetch !== 'function') throw new Error(t('请求组件不可用',
            'Request helper unavailable'));
        let saved = pending.get(signature);
        if (!saved) {
            saved = {
                ...body,
                commandId: commandId()
            };
            pending.set(signature, saved);
        }
        const response = await window.idempotentFetch(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': root.dataset.csrfToken
            },
            body: JSON.stringify(saved)
        });
        const payload = await response.json();
        if (response.ok || response.status < 500) pending.delete(signature);
        if (!response.ok) throw new Error(payload.message || 'Request failed');
        return payload;
    }

    function local(item, key) {
        return item[`${key}${lang==='zh'?'Zh':'En'}`] || '';
    }

    function render() {
        stateEl.replaceChildren();
        actionsEl.replaceChildren();
        itemsEl.replaceChildren();
        eventsEl.replaceChildren();
        const room = model.interaction;
        if (!room) {
            const empty = document.createElement('p');
            empty.className = 'live-empty';
            empty.textContent = t('目前没有联络室。只有你明确开启实时互动后，配置的站主账号才能发出邀请。',
                'There is no relay room yet. Only the configured owner can invite you after explicit live opt-in.'
                );
            stateEl.append(empty);
            return;
        }
        const status = document.createElement('span');
        status.className = 'live-status';
        status.textContent = `${room.status} · rev ${room.revision} · seq ${room.lastSequence}`;
        const presence = document.createElement('p');
        presence.textContent = t(`你的可见状态：${room.presence}`, `Your visible status: ${room.presence}`);
        const boundary = document.createElement('p');
        boundary.className = 'live-meta';
        boundary.textContent = room.quiet ? t('当前为安静时段；持久收件箱仍可查看，但不会实时推送。',
            'Quiet hours are active. Durable inbox items remain visible without live push.') : t(
            '实时推送遵循你的互动同意、静音与偏好窗口。', 'Live push follows your consent, mute, and preferred windows.');
        stateEl.append(status, presence, boundary);
        if (room.status === 'active') {
            actionsEl.append(button(t('在线', 'Available'), 'availability', {
                    value: 'available'
                }), button(t('忙碌', 'Busy'), 'availability', {
                    value: 'busy'
                }), button(t('离线', 'Offline'), 'availability', {
                    value: 'offline'
                }), button(t('静音 1 小时', 'Mute 1 hour'), 'mute'), button(t('离开房间', 'Leave room'), 'leave'),
                button(t('举报互动', 'Report interaction'), 'report'));
        } else if (room.status === 'closed' && model.report && ['resolved', 'dismissed'].includes(model.report
                .status) && !model.report.reconsented) {
            actionsEl.append(button(t('我愿意重新允许这位站主发起新联络', 'I choose to allow a new relay from this owner'),
                'reconsent', {
                    reportId: model.report.id
                }));
        }
        for (const item of model.items || []) {
            const card = document.createElement('article');
            card.className = 'live-item';
            card.dataset.state = item.status;
            const head = document.createElement('div');
            head.className = 'live-item-head';
            const title = document.createElement('h3');
            title.textContent = local(item.payload, 'title');
            const itemStatus = document.createElement('span');
            itemStatus.className = 'live-status';
            itemStatus.textContent = item.status;
            head.append(title, itemStatus);
            const body = document.createElement('p');
            body.textContent = local(item.payload, 'body');
            const meta = document.createElement('p');
            meta.className = 'live-meta';
            meta.textContent = `${item.itemType} · ${item.templateKey}`;
            card.append(head, body, meta);
            if (item.status === 'delivered' && room.status === 'active') {
                const row = document.createElement('div');
                row.className = 'live-actions';
                if (item.itemType === 'poll') {
                    const poll = document.createElement('div');
                    poll.className = 'live-poll';
                    (item.payload.pollOptions || []).forEach((option, index) => poll.append(button(option, 'vote', {
                        itemId: item.id,
                        optionIndex: index
                    })));
                    row.append(poll);
                } else row.append(button(t('接受', 'Accept'), 'accept', {
                    itemId: item.id
                }));
                row.append(button(t('拒绝', 'Decline'), 'decline', {
                    itemId: item.id
                }), button(t('举报这条内容', 'Report item'), 'report', {
                    itemId: item.id
                }));
                card.append(row);
            }
            if (item.status === 'accepted' && item.payload.actionPath) {
                const link = document.createElement('a');
                link.className = 'live-button';
                link.href = item.payload.actionPath;
                link.textContent = item.itemType === 'quest_invite' ? t('前往任务日志', 'Open Quest Journal') : t('打开游戏',
                    'Open game');
                card.append(link);
            }
            itemsEl.append(card);
        }
        if (!(model.items || []).length) {
            const empty = document.createElement('p');
            empty.className = 'live-empty';
            empty.textContent = t('暂无邀请或留言。', 'No invitations or notes yet.');
            itemsEl.append(empty);
        }
        for (const event of model.recent || []) {
            const line = document.createElement('li');
            line.textContent = `#${event.sequence} · ${event.eventType}`;
            eventsEl.append(line);
        }
    }
    async function refresh() {
        const response = await fetch(
            `/api/live/state?interactionId=${encodeURIComponent(model.interaction?.id||'')}`, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json'
                }
            });
        if (response.ok) {
            model = await response.json();
            replay?.synchronize(model.interaction?.lastSequence || 0, model.recent || []);
        }
        render();
    }
    async function act(target) {
        const room = model.interaction;
        if (!room) return;
        const action = target.dataset.action;
        let path, body = {
            interactionId: room.id,
            expectedRevision: room.revision
        };
        if (action === 'accept' || action === 'decline') {
            path = `/api/live/items/${action}`;
            body.itemId = Number(target.dataset.itemId);
        } else if (action === 'vote') {
            path = '/api/live/polls/vote';
            body.itemId = Number(target.dataset.itemId);
            body.optionIndex = Number(target.dataset.optionIndex);
        } else if (action === 'availability') {
            path = '/api/live/presence';
            body.availability = target.dataset.value;
        } else if (action === 'mute') {
            path = '/api/live/mute';
            body.minutes = 60;
        } else if (action === 'leave') {
            if (!confirm(t('确认离开联络室？历史仍可只读查看。', 'Leave the relay room? History remains available read-only.')))
                return;
            path = '/api/live/leave';
        } else if (action === 'report') {
            const detail = prompt(t('可选：用不超过 500 字说明原因。',
                'Optional: describe the concern in at most 500 characters.'), '');
            if (detail === null) return;
            path = '/api/live/report';
            body.itemId = target.dataset.itemId ? Number(target.dataset.itemId) : null;
            body.reasonCode = 'unwanted_contact';
            body.detail = detail;
        } else if (action === 'reconsent') {
            path = '/api/live/reconsent';
            body.reportId = Number(target.dataset.reportId);
        } else return;
        target.disabled = true;
        messageEl.textContent = '';
        try {
            await post(path, body, `${action}:${body.itemId||''}:${body.optionIndex??''}:${room.revision}`);
            await refresh();
        } catch (error) {
            messageEl.textContent = error.message;
            await refresh().catch(() => {});
            target.disabled = false;
        }
    }
    document.addEventListener('click', event => {
        const target = event.target.closest('button[data-action]');
        if (target) act(target);
    });

    function applyEvent(event) {
        if (!replay) return;
        const outcome = replay.apply(event);
        if (outcome.kind === 'duplicate') {
            ack(outcome.ack);
            return;
        }
        if (outcome.kind === 'gap') {
            catchUp();
            return;
        }
        if (outcome.kind !== 'applied') return;
        model.interaction.lastSequence = replay.lastSequence;
        model.interaction.revision = Math.max(model.interaction.revision, event.stateRevision);
        model.recent = [...replay.recent];
        render();
        ack(outcome.ack);
        if (event.eventType.startsWith('interaction.') && !['interaction.availability_changed'].includes(event
                .eventType)) refresh();
    }
    async function runCatchUp() {
        if (!model.interaction) return;
        let after = model.interaction.lastSequence,
            more = true;
        while (more) {
            const response = await fetch(
                `/api/live/events?interactionId=${model.interaction.id}&afterSequence=${after}&limit=100`, {
                    credentials: 'same-origin'
                });
            if (!response.ok) return;
            const payload = await response.json();
            for (const event of payload.events) applyEvent(event);
            after = payload.nextAfter;
            more = payload.hasMore;
        }
    }

    function catchUp() {
        if (!catchUpPromise) catchUpPromise = runCatchUp().finally(() => {
            catchUpPromise = null;
        });
        return catchUpPromise;
    }
    async function ack(sequence) {
        if (!model.interaction) return;
        try {
            await fetch('/api/live/ack', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': root.dataset.csrfToken
                },
                body: JSON.stringify({
                    interactionId: model.interaction.id,
                    sequence
                })
            });
        } catch {
            /* reconnect catch-up retries */ }
    }
    if (globalThis.io && model.interaction) {
        const socket = globalThis.io({
            withCredentials: true
        });
        socket.on('connect', () => {
            connectionEl.textContent = t('已连接', 'Connected');
            ack(model.interaction.lastSequence);
            socket.emit('live:subscribe', {
                interactionId: model.interaction.id,
                afterSequence: model.interaction.lastSequence,
                limit: 100
            }, reply => {
                if (!reply?.success) connectionEl.textContent = t('使用 REST 补拉',
                    'Using REST catch-up');
            });
        });
        socket.on('disconnect', () => {
            connectionEl.textContent = t('已断开，正在等待重连', 'Disconnected; waiting to reconnect');
        });
        socket.on('live:event', applyEvent);
        socket.on('live:events', batch => (batch.events || []).forEach(applyEvent));
    } else connectionEl.textContent = t('离线只读', 'Offline read-only');
    render();
})();