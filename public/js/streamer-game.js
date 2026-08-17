'use strict';
(() => {
    const body = document.body;
    const lang = body.dataset.lang === 'zh' ? 'zh' : 'en';
    const gameId = body.dataset.gameId;
    const bootstrap = JSON.parse(document.getElementById('sg-bootstrap').textContent);
    let model = bootstrap.state;
    const busyGate = window.StreamerGameUIState.createBusyGate();
    let signalTimer = null;
    let socket = null;
    const pending = new Map();
    const challenge = document.getElementById('sg-challenge');
    const content = document.getElementById('sg-content');
    const actions = document.getElementById('sg-actions');
    const status = document.getElementById('sg-status');
    const message = document.getElementById('sg-message');
    const text = (zh, en) => lang === 'zh' ? zh : en;
    const localized = (value, key) => value?.[`${key}${lang === 'zh' ? 'Zh' : 'En'}`] || '';
    const commandId = () => globalThis.crypto.randomUUID();

    for (const item of bootstrap.pack.challenges) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = localized(item, 'title');
        challenge.append(option);
    }

    async function post(path, payload, signature) {
        let command = pending.get(signature);
        if (!command) {
            command = { ...payload, commandId: commandId(), gameId };
            pending.set(signature, command);
        }
        const response = await window.idempotentFetch(path, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': body.dataset.csrfToken },
            body: JSON.stringify(command)
        });
        const result = await response.json();
        if (response.ok || response.status < 500) pending.delete(signature);
        if (!response.ok) throw Object.assign(new Error(result.message || text('请求失败', 'Request failed')),
            { code: result.code, status: response.status });
        return result;
    }

    function node(tag, className, value) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (value !== undefined) element.textContent = value;
        return element;
    }

    function actionButton(label, data) {
        const button = node('button', '', label);
        button.type = 'button';
        Object.entries(data).forEach(([key, value]) => button.dataset[key] = String(value));
        return button;
    }

    function renderConstellation(state) {
        const grid = node('div', 'sg-grid');
        grid.style.gridTemplateColumns = `repeat(${state.width},1fr)`;
        const placed = new Set(state.placements.map(cell => `${cell.x}:${cell.y}`));
        const blocked = new Set(state.privateClue.blockedCells || []);
        for (let y = 0; y < state.height; y += 1) for (let x = 0; x < state.width; x += 1) {
            const key = `${x}:${y}`;
            const button = actionButton(`${x + 1},${y + 1}`, { type: 'place', x, y });
            button.className = `sg-cell${placed.has(key) ? ' placed' : ''}${blocked.has(key) ? ' blocked' : ''}`;
            button.disabled = !state.yourTurn || placed.has(key) || blocked.has(key);
            button.setAttribute('aria-label', text(`星格 ${x + 1},${y + 1}`, `Star cell ${x + 1},${y + 1}`));
            grid.append(button);
        }
        content.append(node('p', 'sg-meta', text(`私人线索：${JSON.stringify(state.privateClue)}`, `Private clue: ${JSON.stringify(state.privateClue)}`)));
        actions.append(grid);
    }

    function renderSignal(state) {
        const beats = node('div', 'sg-beats');
        for (const beat of state.visibleBeats) beats.append(node('span', `sg-beat ${beat.completed ? 'done' : ''} ${beat.accent}`, String(beat.index + 1)));
        content.append(node('p', 'sg-meta', text(`速度 ${state.bpm} BPM · 判定窗 ${state.timingWindowMs}ms`, `${state.bpm} BPM · ${state.timingWindowMs}ms window`)), beats);
        const countdown = node('p', 'sg-card', ''); countdown.id = 'sg-countdown'; content.append(countdown);
        clearInterval(signalTimer);
        const clientTarget = Date.now() + Math.max(0, state.nextBeatAtMs - state.serverNowMs);
        const update = () => {
            const remaining = window.StreamerGameUIState.countdownRemaining(clientTarget, Date.now(), 0);
            countdown.textContent = remaining > 0
                ? text(`下一拍 ${Math.ceil(remaining / 100) / 10} 秒`, `Next beat in ${Math.ceil(remaining / 100) / 10}s`)
                : text('现在击打', 'Tap now');
        };
        update(); signalTimer = setInterval(update, 100);
        if (state.yourTurn) actions.append(actionButton(text('击打当前信号（空格）', 'Tap current signal (Space)'), { type: 'tap', beatIndex: state.completedBeats }));
    }

    function renderMystery(state) {
        for (const clue of state.evidence) content.append(node('article', 'sg-clue', localized(clue, 'text')));
        const selectA = node('select');
        const selectB = node('select');
        for (const clue of state.evidence) for (const select of [selectA, selectB]) {
            const option = node('option', '', clue.id); option.value = clue.id; select.append(option);
        }
        selectA.id = 'sg-left'; selectB.id = 'sg-right'; actions.append(selectA, selectB,
            actionButton(text('连接证据', 'Link evidence'), { type: 'link-select' }));
        state.suspects.forEach((suspect, index) => actions.append(actionButton(text(`结论：${suspect.nameZh}`, `Conclude: ${suspect.nameEn}`), { type: 'accuse', suspectIndex: index })));
        for (const link of state.links) {
            const [left, right] = link.split(':');
            actions.append(actionButton(text(`移除 ${left} ↔ ${right}`, `Remove ${left} ↔ ${right}`),
                { type: 'unlink', left, right }));
        }
        if (state.contradictionHint) content.append(node('p', 'sg-meta', text(`矛盾提示：${state.contradictionHint}`, `Contradiction hint: ${state.contradictionHint}`)));
    }

    function renderWeaver(state) {
        for (const passage of state.passages) content.append(node('p', 'sg-passage', lang === 'zh' ? passage.textZh : passage.textEn));
        state.hand.forEach((card, index) => actions.append(actionButton(localized(card, '' ) || (lang === 'zh' ? card.zh : card.en), { type: 'choose', cardIndex: index })));
    }

    function renderCrafting(state) {
        content.append(node('div', 'sg-recipe', text(`配方：${JSON.stringify(state.recipe)} · 材料：${JSON.stringify(state.materials)}`, `Recipe: ${JSON.stringify(state.recipe)} · Materials: ${JSON.stringify(state.materials)}`)));
        if (!state.crafted.includes(state.challengeId)) {
            for (const material of Object.keys(state.recipe)) {
                const button = actionButton(text(`收集 ${state.materialLabels[material]}`, `Gather ${material}`), { type: 'gather', material });
                button.disabled = material !== state.nextMaterial;
                actions.append(button);
            }
            const craft = actionButton(text('制作摆件', 'Craft decoration'), { type: 'craft' });
            craft.disabled = !Object.entries(state.recipe)
                .every(([material, amount]) => Number(state.materials[material] || 0) >= Number(amount));
            actions.append(craft);
        } else for (let slot = 0; slot < 6; slot += 1) actions.append(actionButton(text(`放到位置 ${slot + 1}`, `Place in slot ${slot + 1}`), { type: 'place', slot }));
    }

    function render() {
        content.replaceChildren(); actions.replaceChildren(); status.replaceChildren(); message.textContent = '';
        const run = model.run;
        const history = document.getElementById('sg-history'); history.replaceChildren();
        for (const item of model.history || []) history.append(node('li', '', `${item.status} · ${item.difficulty} · ${item.score}`));
        const tutorial = document.getElementById('sg-tutorial'); tutorial.replaceChildren();
        [text('选择关卡、难度与模式。', 'Choose a challenge, difficulty, and mode.'),
            text('按屏幕控件操作；所有动作也可用 Tab 聚焦与 Enter 确认。', 'Use the controls; every action supports Tab and Enter.'),
            text('刷新页面后从数据库快照继续。', 'Refresh to resume from the database snapshot.')]
            .forEach(line => tutorial.append(node('li', '', line)));
        if (!run) { content.append(node('p', 'sg-meta', text('选择挑战开始。', 'Choose a challenge to begin.'))); return; }
        const state = run.state;
        status.append(node('span', 'sg-chip', run.status), node('span', 'sg-chip', `${text('修订', 'rev')} ${run.revision}`),
            node('span', 'sg-chip', `${text('分数', 'score')} ${run.score}`), node('span', 'sg-chip', run.actorRole));
        content.append(node('h2', '', localized(state, 'title')), node('p', 'sg-meta', localized(state, 'brief')));
        if (gameId === 'constellation-repair') renderConstellation(state);
        else if (gameId === 'signal-duet') renderSignal(state);
        else if (gameId === 'mystery-board') renderMystery(state);
        else if (gameId === 'story-weaver') renderWeaver(state);
        else renderCrafting(state);
        if (run.status === 'active' && run.actorRole === 'creator') {
            actions.append(actionButton(text('结束当前对局', 'End active run'), { type: 'abandon' }));
        }
        if (run.status !== 'active') actions.replaceChildren();
        if (model.collection) {
            const collection = document.getElementById('sg-collection'); collection.replaceChildren(node('h3', '', text('收藏房间', 'Collection room')));
            collection.append(node('p', 'sg-meta', text(`已收藏：${model.collection.items.map(item => item.itemKey).join('、') || '暂无'}`,
                `Owned: ${model.collection.items.map(item => item.itemKey).join(', ') || 'none'}`)));
            const bySlot = new Map(model.collection.slots.map(slot => [slot.slot, slot.itemKey]));
            for (let slot = 0; slot < 6; slot += 1) collection.append(node('p', 'sg-meta',
                `${slot + 1}: ${bySlot.get(slot) || text('空位', 'empty')}`));
        }
    }

    async function refresh(runId) {
        const response = await fetch(`/api/${gameId}/state?runId=${encodeURIComponent(runId || model.run?.id || '')}`, { credentials: 'same-origin' });
        if (response.ok) model = await response.json();
        render();
    }

    async function commit(action) {
        const run = model.run;
        if (!run || !busyGate.begin()) return;
        actions.querySelectorAll('button,select').forEach(control => { control.disabled = true; });
        const signature = `${run.id}:${run.revision}:${JSON.stringify(action)}`;
        try {
            const result = await post(`/api/${gameId}/action`, { runId: run.id, expectedRevision: run.revision, action }, signature);
            model.run = result.run;
            model.history = [{ status: result.run.status, difficulty: result.run.difficulty, score: result.run.score }, ...(model.history || [])];
            if (gameId === 'studio-crafting' && result.run.status === 'completed') await refresh(result.run.id);
            else render();
        } finally {
            busyGate.end();
            render();
        }
    }

    document.getElementById('sg-start').addEventListener('click', async event => {
        event.currentTarget.disabled = true;
        try {
            const mode = document.querySelector('input[name=sg-mode]:checked').value;
            const result = await post(`/api/${gameId}/start`, { challengeId: challenge.value,
                difficulty: document.getElementById('sg-difficulty').value, mode }, `start:${gameId}:${challenge.value}:${mode}`);
            model.run = result.run; render();
        } catch (error) {
            if (error.code === 'GAME_ACTIVE_RUN_EXISTS') await refresh();
            message.textContent = error.code === 'GAME_ACTIVE_RUN_EXISTS'
                ? text('已恢复尚未完成的对局。', 'Resumed your active run.') : error.message;
        }
        finally { event.currentTarget.disabled = false; }
    });
    actions.addEventListener('click', async event => {
        const button = event.target.closest('button[data-type]'); if (!button) return;
        let action = { type: button.dataset.type };
        for (const key of ['x', 'y', 'beatIndex', 'cardIndex', 'suspectIndex', 'slot']) if (button.dataset[key] !== undefined) action[key] = Number(button.dataset[key]);
        if (button.dataset.left) action.left = button.dataset.left;
        if (button.dataset.right) action.right = button.dataset.right;
        if (action.type === 'link-select') action = { type: 'link', left: document.getElementById('sg-left').value, right: document.getElementById('sg-right').value };
        if (button.dataset.material) action.material = button.dataset.material;
        button.disabled = true;
        try { await commit(action); } catch (error) { message.textContent = error.message; button.disabled = false; }
    });
    document.addEventListener('keydown', event => {
        const action = window.StreamerGameUIState.keyboardAction(gameId, model.run?.state, event.code);
        if (action) {
            event.preventDefault(); commit({ type: 'tap', beatIndex: model.run.state.completedBeats }).catch(error => { message.textContent = error.message; });
        }
    });
    window.addEventListener('focus', () => model.run && refresh(model.run.id));
    if (typeof window.io === 'function') {
        socket = window.io({ transports: ['websocket', 'polling'] });
        const subscribe = () => {
            const run = model.run;
            if (run?.mode === 'coop' && run.relayInteractionId) socket.emit('live:subscribe', {
                interactionId: run.relayInteractionId,
                afterSequence: 0,
                limit: 30
            });
        };
        socket.on('connect', subscribe);
        socket.on('live:event', event => {
            if (event?.eventType === 'interaction.game_state_changed'
                && event.payload?.gameId === gameId
                && (!model.run || event.payload.runId === model.run.id)) {
                refresh(event.payload.runId);
            }
        });
        subscribe();
    }
    setInterval(() => {
        if (model.run?.mode === 'coop' && model.run.status === 'active' && !busyGate.active()) refresh(model.run.id);
    }, 5000);
    render();
})();
