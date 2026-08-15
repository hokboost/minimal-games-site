(() => {
    'use strict';

    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const body = document.body;
    const csrfToken = body.dataset.csrfToken || '';
    const username = body.dataset.username || t('玩家', 'Player');

    const elements = {
        start: document.getElementById('startDoudizhuBtn'),
        outcomeRestart: document.getElementById('outcomeRestartBtn'),
        status: document.getElementById('statusText'),
        dealNumber: document.getElementById('dealNumber'),
        humanRole: document.getElementById('humanRole'),
        contractBid: document.getElementById('contractBid'),
        multiplier: document.getElementById('multiplier'),
        opponentLeft: document.getElementById('opponentLeft'),
        opponentRight: document.getElementById('opponentRight'),
        selfSeat: document.getElementById('selfSeat'),
        bottomLabel: document.getElementById('bottomLabel'),
        bottomCards: document.getElementById('bottomCards'),
        turnIndicator: document.getElementById('turnIndicator'),
        trickLabel: document.getElementById('trickLabel'),
        lastPlay: document.getElementById('lastPlay'),
        combination: document.getElementById('combinationLabel'),
        bidControls: document.getElementById('bidControls'),
        playControls: document.getElementById('playControls'),
        hint: document.getElementById('hintBtn'),
        pass: document.getElementById('passBtn'),
        play: document.getElementById('playBtn'),
        selection: document.getElementById('selectionStatus'),
        hand: document.getElementById('humanHand'),
        outcome: document.getElementById('outcomePanel'),
        outcomeTitle: document.getElementById('outcomeTitle'),
        outcomeSummary: document.getElementById('outcomeSummary'),
        log: document.getElementById('eventLog')
    };

    const errorMessages = {
        ACTIVE_GAME_EXISTS: t('已有一局进行中，请先完成当前对局。', 'A match is already in progress.'),
        NO_ACTIVE_GAME: t('当前没有进行中的对局。', 'There is no active match.'),
        GAME_NOT_FOUND: t('找不到这局游戏，请开始新对局。', 'This match could not be found. Start a new one.'),
        GAME_NOT_ACTIVE: t('这局游戏已经结束。', 'This match is no longer active.'),
        INVALID_REQUEST: t('请求参数无效，请刷新页面后重试。', 'The request is invalid. Refresh and try again.'),
        STALE_REVISION: t('牌局已经推进，正在刷新最新状态。', 'The match advanced; refreshing the latest state.'),
        NOT_YOUR_TURN: t('现在还没轮到你。', 'It is not your turn.'),
        OUT_OF_TURN: t('现在还没轮到你。', 'It is not your turn.'),
        INVALID_BID: t('这个叫分不符合当前规则。', 'That bid is not legal now.'),
        ILLEGAL_BID: t('这个叫分不符合当前规则。', 'That bid is not legal now.'),
        INVALID_COMBINATION: t('所选牌不能组成合法牌型。', 'The selected cards do not form a legal combination.'),
        CANNOT_BEAT: t('所选牌压不过桌面牌型。', 'The selected cards cannot beat the current trick.'),
        MOVE_DOES_NOT_BEAT: t('所选牌压不过桌面牌型。', 'The selected cards cannot beat the current trick.'),
        CANNOT_PASS: t('你是本轮先手，必须出牌。', 'You are leading and cannot pass.'),
        LEADER_CANNOT_PASS: t('你是本轮先手，必须出牌。', 'You are leading and cannot pass.'),
        CARDS_NOT_OWNED: t('手牌状态已变化，请刷新后重试。', 'Your hand changed; refresh and try again.'),
        CARD_NOT_OWNED: t('手牌状态已变化，请刷新后重试。', 'Your hand changed; refresh and try again.'),
        DUPLICATE_CARD: t('同一张牌不能重复选择。', 'A card cannot be selected twice.'),
        INVALID_CARD_ID: t('手牌参数无效，请刷新后重试。', 'The selected card is invalid. Refresh and try again.'),
        INVALID_CARDS: t('请选择一组合法手牌。', 'Select a legal group of cards.'),
        WRONG_PHASE: t('当前阶段不能执行这个操作。', 'That action is unavailable in this phase.'),
        GAME_FINISHED: t('本局已经结束。', 'This match has already finished.'),
        INVALID_ACTION: t('无法执行这个操作。', 'That action is not available.'),
        AI_BUDGET_EXCEEDED: t('人机思考超时，请重试以继续牌局。', 'The bot reached its thinking limit. Retry to continue.'),
        REQUEST_IN_PROGRESS: t('上一个操作仍在处理，请稍候。', 'The previous action is still being processed.')
    };

    const combinationNames = {
        single: [ '单张', 'Single' ],
        pair: [ '对子', 'Pair' ],
        triple: [ '三张', 'Triple' ],
        triple_single: [ '三带一', 'Triple with single' ],
        triple_pair: [ '三带一对', 'Triple with pair' ],
        straight: [ '顺子', 'Straight' ],
        pair_straight: [ '连对', 'Pair chain' ],
        triple_straight: [ '飞机', 'Airplane' ],
        airplane: [ '飞机', 'Airplane' ],
        plane_single: [ '飞机带单', 'Airplane with singles' ],
        plane_pair: [ '飞机带对', 'Airplane with pairs' ],
        airplane_single: [ '飞机带单', 'Airplane with singles' ],
        airplane_pair: [ '飞机带对', 'Airplane with pairs' ],
        four_two_single: [ '四带二', 'Four with two' ],
        four_two_pair: [ '四带两对', 'Four with two pairs' ],
        bomb: [ '炸弹', 'Bomb' ],
        rocket: [ '王炸', 'Rocket' ]
    };

    let state = parseDataset('initialState', null);
    let actionInFlight = false;
    let selectedCardIds = new Set();

    function parseDataset(key, fallback) {
        try {
            const raw = body.dataset[key];
            return raw ? JSON.parse(decodeURIComponent(raw)) : fallback;
        } catch (error) {
            console.error(`Invalid ${key} payload`, error);
            return fallback;
        }
    }

    function roleLabel(role) {
        if (role === 'landlord') return t('地主', 'Landlord');
        if (role === 'farmer') return t('农民', 'Farmer');
        return t('待定', 'Pending');
    }

    function seatName(seat) {
        if (!state) return t(`座位 ${Number(seat) + 1}`, `Seat ${Number(seat) + 1}`);
        if (seat === state.humanSeat) return username;
        const botSeats = state.seats
            .filter((entry) => entry.kind === 'bot')
            .map((entry) => entry.seat)
            .sort((left, right) => left - right);
        const botIndex = Math.max(0, botSeats.indexOf(seat));
        return t(`人机 ${botIndex + 1}`, `Bot ${botIndex + 1}`);
    }

    function combinationLabel(combination) {
        if (!combination) return '–';
        const normalized = String(combination.type || '').toLowerCase().replaceAll('-', '_');
        const labels = combinationNames[normalized];
        const base = labels ? labels[lang === 'zh' ? 0 : 1] : String(combination.type || '');
        if ((combination.chainLength || 0) > 1 && !['straight', 'pair_straight'].includes(normalized)) {
            return `${base} · ${combination.chainLength}`;
        }
        return base;
    }

    function makeCard(card, { mini = false, selectable = false } = {}) {
        const node = document.createElement(selectable ? 'button' : 'span');
        if (selectable) node.type = 'button';
        node.className = `ddz-card${mini ? ' ddz-card--mini' : ''}`;
        if (card.color === 'red' || card.suit === 'heart' || card.suit === 'diamond'
            || card.suitLabel === '♥' || card.suitLabel === '♦') {
            node.classList.add('is-red');
        }
        const rank = document.createElement('span');
        rank.className = 'ddz-card-rank';
        const rankLabels = {
            LJ: t('小王', 'SJ'),
            SJ: t('小王', 'SJ'),
            BJ: t('大王', 'BJ'),
            小王: t('小王', 'SJ'),
            大王: t('大王', 'BJ')
        };
        rank.textContent = rankLabels[card.rank] || String(card.rank || card.label || '?');
        const suit = document.createElement('span');
        suit.className = 'ddz-card-suit';
        suit.textContent = ({ S: '♠', H: '♥', C: '♣', D: '♦' })[card.suit]
            || (/^[♠♥♣♦]$/.test(card.suitLabel || '') ? card.suitLabel : '');
        node.append(rank, suit);
        node.setAttribute('aria-label', String(card.label || `${card.rank || ''}${card.suitLabel || ''}`));

        if (selectable) {
            node.dataset.cardId = String(card.id);
            node.setAttribute('aria-pressed', selectedCardIds.has(String(card.id)) ? 'true' : 'false');
            node.classList.toggle('is-selected', selectedCardIds.has(String(card.id)));
            node.disabled = actionInFlight || state?.phase !== 'playing' || !state?.legal?.canAct;
            node.addEventListener('click', () => toggleCard(String(card.id)));
        }
        return node;
    }

    function renderCards(container, cards, options = {}) {
        container.replaceChildren();
        for (const card of cards || []) container.appendChild(makeCard(card, options));
    }

    function renderHand() {
        renderCards(elements.hand, [...(state?.hand || [])].reverse(), { selectable: true });
    }

    function renderSeat(container, seat) {
        if (!seat) return;
        container.dataset.seat = String(seat.seat);
        container.classList.toggle('is-active', state?.turnSeat === seat.seat && state?.phase !== 'finished');
        container.classList.toggle('is-landlord', seat.role === 'landlord');
        container.querySelector('.ddz-seat-name').textContent = seat.isViewer ? username : seatName(seat.seat);
        container.querySelector('.ddz-role').textContent = roleLabel(seat.role);
        container.querySelector('.ddz-card-count').textContent = String(seat.cardCount ?? 0);
    }

    function renderSeats() {
        const seats = Array.isArray(state?.seats) ? state.seats : [];
        const self = seats.find((seat) => seat.seat === state?.humanSeat) || null;
        const leftSeatNumber = Number.isInteger(state?.humanSeat) ? (state.humanSeat + 1) % 3 : null;
        const rightSeatNumber = Number.isInteger(state?.humanSeat) ? (state.humanSeat + 2) % 3 : null;
        renderSeat(elements.selfSeat, self);
        renderSeat(elements.opponentLeft, seats.find((seat) => seat.seat === leftSeatNumber));
        renderSeat(elements.opponentRight, seats.find((seat) => seat.seat === rightSeatNumber));
    }

    function renderBottomCards() {
        const revealed = state?.bottomCards || [];
        const cards = revealed.length > 0 ? revealed : (state?.markerCard ? [state.markerCard] : []);
        elements.bottomLabel.textContent = revealed.length > 0
            ? t('公开底牌', 'Revealed bottom cards')
            : t('叫分明牌', 'Bidding marker');
        renderCards(elements.bottomCards, cards, { mini: true });
        if (cards.length === 0) {
            for (let index = 0; index < 3; index += 1) {
                const back = document.createElement('span');
                back.className = 'ddz-card-back';
                back.setAttribute('aria-hidden', 'true');
                elements.bottomCards.appendChild(back);
            }
        }
    }

    function renderTrick() {
        const move = state?.trick?.lastMove || null;
        renderCards(elements.lastPlay, move?.cards || [], { mini: true });
        elements.combination.textContent = move ? combinationLabel(move.combination) : '–';
        elements.trickLabel.textContent = move
            ? t(`${seatName(move.seat)} 出牌`, `${seatName(move.seat)} played`)
            : t('等待本轮先手', 'Waiting for a lead');
    }

    function renderTurn() {
        const strong = elements.turnIndicator.querySelector('strong');
        if (!state) {
            strong.textContent = t('尚未开局', 'No active match');
            return;
        }
        if (state.phase === 'finished') {
            strong.textContent = t('本局已结束', 'Match complete');
            return;
        }
        const name = seatName(state.turnSeat);
        strong.textContent = state.turnSeat === state.humanSeat
            ? t('轮到你', 'Your turn')
            : t(`${name} 思考中`, `${name} is thinking`);
    }

    function renderControls() {
        const legal = state?.legal || {};
        const humanTurn = Boolean(legal.canAct && state?.turnSeat === state?.humanSeat);
        const bidding = state?.phase === 'bidding' && humanTurn;
        const playing = state?.phase === 'playing' && humanTurn;
        elements.bidControls.hidden = !bidding;
        elements.playControls.hidden = !playing;

        const legalBids = new Set(state?.bidding?.legalBids || legal.legalBids || []);
        for (const button of elements.bidControls.querySelectorAll('[data-bid]')) {
            button.disabled = actionInFlight || !legalBids.has(Number(button.dataset.bid));
        }
        elements.hint.disabled = actionInFlight || !playing;
        elements.pass.disabled = actionInFlight || !playing || !legal.canPass;
        elements.play.disabled = actionInFlight || !playing || selectedCardIds.size === 0;
        elements.start.disabled = actionInFlight;
        elements.start.textContent = state && state.phase !== 'finished'
            ? t('放弃并重新开局', 'Abandon and restart')
            : t('开始新对局', 'Start a new match');
        elements.outcomeRestart.disabled = actionInFlight;

        if (playing) {
            elements.selection.textContent = selectedCardIds.size > 0
                ? t(`已选 ${selectedCardIds.size} 张牌`, `${selectedCardIds.size} card(s) selected`)
                : (legal.mustLead
                    ? t('你是先手，请选择要出的牌。', 'You are leading. Choose cards to play.')
                    : t('选择能压过桌面的牌，或选择不出。', 'Beat the current trick or pass.'));
        } else if (bidding) {
            elements.selection.textContent = t('根据手牌选择叫分；叫 3 分会立即成为地主。', 'Choose a bid; bidding 3 makes you landlord immediately.');
        } else if (state?.phase === 'finished') {
            elements.selection.textContent = t('本局已经结束。', 'The match is complete.');
        } else {
            elements.selection.textContent = state
                ? t('正在等待人机行动。', 'Waiting for a bot action.')
                : t('开始对局后会在这里显示你的手牌。', 'Your hand will appear here after the match starts.');
        }
    }

    function eventText(event) {
        const type = String(event?.type || event?.eventType || '').toLowerCase();
        const actorSeat = Number.isInteger(event?.seat)
            ? event.seat
            : (Number.isInteger(event?.landlordSeat) ? event.landlordSeat : event?.leaderSeat);
        const actor = Number.isInteger(actorSeat) ? seatName(actorSeat) : '';
        if (type.includes('redeal')) return t('三家均不叫，重新发牌。', 'Everyone passed; the cards were redealt.');
        if (type.includes('deal')) return t(`第 ${event.dealNumber || state?.dealNumber || ''} 局发牌。`, `Deal ${event.dealNumber || state?.dealNumber || ''} started.`);
        if (type.includes('bid')) {
            return Number(event.bid) === 0
                ? t(`${actor} 不叫。`, `${actor} passed the bid.`)
                : t(`${actor} 叫 ${event.bid} 分。`, `${actor} bid ${event.bid}.`);
        }
        if (type.includes('landlord')) return t(`${actor} 成为地主。`, `${actor} became landlord.`);
        if (type.includes('pass')) return t(`${actor} 不出。`, `${actor} passed.`);
        if (type.includes('play')) {
            const count = event.cards?.length || event.cardIds?.length || event.combination?.cardCount || 0;
            return t(
                `${actor} 出 ${count} 张 · ${combinationLabel(event.combination)}。`,
                `${actor} played ${count} · ${combinationLabel(event.combination)}.`
            );
        }
        if (type.includes('finish') || type.includes('win')) {
            return t('本局决出胜负。', 'The match has a winner.');
        }
        return type ? `${actor ? `${actor} · ` : ''}${type}` : t('公开动作', 'Public action');
    }

    function renderHistory() {
        const history = Array.isArray(state?.history) ? state.history.slice(-40) : [];
        elements.log.replaceChildren();
        if (history.length === 0) {
            const item = document.createElement('li');
            item.textContent = t('暂无公开动作。', 'No public actions yet.');
            elements.log.appendChild(item);
            return;
        }
        for (const event of history) {
            const item = document.createElement('li');
            item.textContent = eventText(event);
            elements.log.appendChild(item);
        }
        elements.log.scrollTop = elements.log.scrollHeight;
    }

    function renderOutcome() {
        const outcome = state?.outcome;
        elements.outcome.hidden = !outcome;
        if (!outcome) return;
        const humanDelta = Number(outcome.score?.deltas?.[state.humanSeat] || 0);
        const humanWon = (outcome.winningTeam === 'landlord' && state.humanSeat === state.landlordSeat)
            || (outcome.winningTeam === 'farmers' && state.humanSeat !== state.landlordSeat);
        elements.outcomeTitle.textContent = humanWon
            ? t('漂亮，拿下这一局！', 'You won the match!')
            : t('这一局惜败', 'A close loss');
        const special = outcome.score?.spring
            ? t(' · 春天', ' · Spring')
            : (outcome.score?.antiSpring ? t(' · 反春', ' · Anti-spring') : '');
        elements.outcomeSummary.textContent = t(
            `身份：${roleLabel(state.seats.find((seat) => seat.isViewer)?.role)} · 本局分 ${humanDelta >= 0 ? '+' : ''}${humanDelta} · 倍数 ×${outcome.score?.multiplier || 1}${special}`,
            `Role: ${roleLabel(state.seats.find((seat) => seat.isViewer)?.role)} · Match score ${humanDelta >= 0 ? '+' : ''}${humanDelta} · ×${outcome.score?.multiplier || 1}${special}`
        );
    }

    function statusText() {
        if (!state) return t('准备好后开始新对局。', 'Start a new match when you are ready.');
        if (state.phase === 'finished') return t('本局已结束，可以立即再来一局。', 'The match is complete. You can play again now.');
        if (state.phase === 'bidding') {
            if (state.turnSeat === state.humanSeat) return t('轮到你叫分。', 'It is your turn to bid.');
            return t(`${seatName(state.turnSeat)} 正在叫分。`, `${seatName(state.turnSeat)} is bidding.`);
        }
        if (state.turnSeat === state.humanSeat) {
            return state.legal?.mustLead
                ? t('轮到你先出牌。', 'Your turn to lead.')
                : t('轮到你：压过桌面牌型，或选择不出。', 'Your turn: beat the trick or pass.');
        }
        return t(`${seatName(state.turnSeat)} 正在思考。`, `${seatName(state.turnSeat)} is thinking.`);
    }

    function render() {
        elements.status.classList.remove('is-error');
        elements.status.textContent = statusText();
        elements.dealNumber.textContent = state?.dealNumber ?? '–';
        const viewer = state?.seats?.find((seat) => seat.isViewer);
        elements.humanRole.textContent = viewer ? roleLabel(viewer.role) : '–';
        elements.contractBid.textContent = state?.contractBid || state?.bidding?.highestBid || '–';
        elements.multiplier.textContent = `×${state?.multiplier || 1}`;

        const ownedIds = new Set((state?.hand || []).map((card) => String(card.id)));
        selectedCardIds = new Set([...selectedCardIds].filter((id) => ownedIds.has(id)));
        renderSeats();
        renderBottomCards();
        renderTrick();
        renderTurn();
        renderHand();
        renderControls();
        renderHistory();
        renderOutcome();
    }

    function toggleCard(cardId) {
        if (actionInFlight || state?.phase !== 'playing' || !state?.legal?.canAct) return;
        if (!(state.hand || []).some((card) => String(card.id) === cardId)) return;
        if (selectedCardIds.has(cardId)) selectedCardIds.delete(cardId);
        else selectedCardIds.add(cardId);
        renderHand();
        renderControls();
    }

    function setBusy(busy, message = null) {
        actionInFlight = busy;
        if (message) {
            elements.status.classList.remove('is-error');
            elements.status.textContent = message;
        }
        // render() can run while a request is still marked busy. Re-render the
        // hand whenever busy changes so those freshly-created buttons do not
        // retain a stale disabled property after the request settles.
        renderHand();
        renderControls();
    }

    function showError(result, fallback) {
        const message = errorMessages[result?.code] || result?.message || fallback;
        elements.status.classList.add('is-error');
        elements.status.textContent = message;
    }

    async function readJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return { success: false, message: `${response.status} ${response.statusText}` };
        }
    }

    async function loadState() {
        const response = await fetch('/api/doudizhu/state', {
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store'
        });
        const result = await readJson(response);
        if (!response.ok || result.success !== true) throw new Error(result.message || 'State request failed');
        state = result.state || null;
        selectedCardIds.clear();
        render();
    }

    async function post(path, payload, busyMessage) {
        if (actionInFlight) return null;
        setBusy(true, busyMessage);
        try {
            const response = await window.idempotentFetch(path, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'same-origin',
                body: JSON.stringify(payload || {})
            });
            const result = await readJson(response);
            if (!response.ok || result.success !== true) {
                showError(result, t('操作失败，请重试。', 'The action failed. Please try again.'));
                if (response.status === 409 || result.code === 'STALE_REVISION') {
                    await loadState().catch((error) => console.error('Doudizhu refresh failed', error));
                }
                return null;
            }
            if (result.state !== undefined) state = result.state;
            selectedCardIds.clear();
            render();
            return result;
        } catch (error) {
            console.error('Doudizhu action failed', error);
            showError(null, t('网络异常，请重试以核对牌局状态。', 'Network error. Retry to confirm the match state.'));
            return null;
        } finally {
            setBusy(false);
        }
    }

    async function startMatch() {
        if (state && state.phase !== 'finished' && !window.confirm(t(
            '当前对局尚未结束。确定放弃并重新发牌吗？',
            'This match is still active. Abandon it and redeal?'
        ))) return;
        const result = await post(
            '/api/doudizhu/start',
            {},
            t('正在洗牌并安排座位…', 'Shuffling and assigning seats…')
        );
        if (result) elements.hand.scrollLeft = 0;
    }

    async function submitAction(type, extra = {}) {
        if (!state) return;
        await post(
            '/api/doudizhu/action',
            { gameId: state.gameId, expectedRevision: state.revision, type, ...extra },
            t('人机正在推演后续行动…', 'The bots are considering the next actions…')
        );
    }

    for (const button of elements.bidControls.querySelectorAll('[data-bid]')) {
        button.addEventListener('click', () => submitAction('bid', { bid: Number(button.dataset.bid) }));
    }
    elements.play.addEventListener('click', () => {
        if (selectedCardIds.size > 0) submitAction('play', { cardIds: [...selectedCardIds] });
    });
    elements.pass.addEventListener('click', () => submitAction('pass'));
    elements.hint.addEventListener('click', async () => {
        if (!state) return;
        const result = await post(
            '/api/doudizhu/hint',
            { gameId: state.gameId, expectedRevision: state.revision },
            t('正在分析合法出牌…', 'Analyzing legal plays…')
        );
        const hint = result?.hint?.move || result?.hint;
        const cardIds = hint?.cardIds || [];
        if (Array.isArray(cardIds) && cardIds.length > 0) {
            selectedCardIds = new Set(cardIds.map(String));
            renderHand();
            renderControls();
            elements.status.textContent = t(
                `提示：${combinationLabel(hint.combination)}，共 ${cardIds.length} 张。`,
                `Hint: ${combinationLabel(hint.combination)}, ${cardIds.length} card(s).`
            );
        } else if (Number.isInteger(hint?.bid)) {
            elements.status.textContent = t(`建议叫 ${hint.bid} 分。`, `Suggested bid: ${hint.bid}.`);
        } else if (hint?.type === 'pass') {
            elements.status.textContent = t('建议本轮不出。', 'Suggestion: pass this trick.');
        }
    });
    elements.start.addEventListener('click', startMatch);
    elements.outcomeRestart.addEventListener('click', startMatch);

    render();
    loadState().catch((error) => {
        console.error('Doudizhu initial state failed', error);
        showError(null, t('无法读取牌局状态，请刷新页面。', 'Could not load the match. Refresh the page.'));
    });
})();
