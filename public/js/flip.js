(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);

    const { csrfToken } = document.body.dataset;
    const grid = document.getElementById('flipGrid');
    const nextCostEl = document.getElementById('nextCost');
    const goodCountEl = document.getElementById('goodCount');
    const cashoutRewardEl = document.getElementById('cashoutReward');
    const startBtn = document.getElementById('startBtn');
    const cashoutBtn = document.getElementById('cashoutBtn');
    const balanceEl = document.getElementById('current-balance');

    let state = null;
    let actionInFlight = false;

    function updateBalance(balance) {
        if (typeof balance === 'number') {
            balanceEl.textContent = balance;
        }
    }

    function renderBoard(board, ended) {
        grid.replaceChildren();
        board.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'flip-card';
            if (card.flipped) {
                cardEl.classList.add('flipped');
                cardEl.classList.add(card.type === 'good' ? 'good' : 'bad');
                cardEl.textContent = card.type === 'good' ? t('好', 'Good') : t('坏', 'Bad');
            } else {
                const label = document.createElement('span');
                label.className = 'card-label';
                label.textContent = t('翻开', 'Flip');
                cardEl.appendChild(label);
            }

            if (ended || card.flipped) {
                cardEl.classList.add('disabled');
            }

            cardEl.addEventListener('click', () => {
                if (card.flipped || ended) return;
                flipCard(index);
            });

            grid.appendChild(cardEl);
        });
    }

    function updateState(data) {
        state = data;
        renderBoard(data.board, data.ended || actionInFlight);
        nextCostEl.textContent = data.nextCost ? `${data.nextCost} ${t('积分', 'points')}` : '--';
        goodCountEl.textContent = data.goodCount || 0;
        cashoutRewardEl.textContent = `${data.cashoutReward || 0} ${t('积分', 'points')}`;
        startBtn.disabled = actionInFlight;
        cashoutBtn.disabled = actionInFlight || data.ended || data.goodCount === 0;
    }

    async function loadState() {
        const response = await fetch('/api/flip/state');
        const data = await response.json();
        if (!response.ok || data.success !== true) {
            throw new Error(data.message || `Flip state request failed (${response.status})`);
        }
        updateState(data);
    }

    function setActionInFlight(inFlight) {
        actionInFlight = inFlight;
        if (state) {
            updateState(state);
        } else {
            startBtn.disabled = inFlight;
            cashoutBtn.disabled = inFlight;
        }
    }

    async function postFlipAction(path, body, failureMessage) {
        if (actionInFlight) return null;
        setActionInFlight(true);
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || ''
                }
            };
            if (body !== undefined) options.body = JSON.stringify(body);
            const response = await window.idempotentFetch(path, options);
            const result = await response.json();
            if (!response.ok || result.success !== true) {
                alert(translateServerMessage(result.message) || failureMessage);
                return null;
            }
            updateBalance(result.newBalance);
            return result;
        } catch (error) {
            console.error('Flip action error:', error);
            alert(t('网络异常，操作结果请重试核对', 'Network error. Retry to confirm the result.'));
            return null;
        } finally {
            try {
                await loadState();
            } catch (error) {
                console.error('Flip state refresh error:', error);
            }
            setActionInFlight(false);
        }
    }

    async function flipCard(index) {
        const result = await postFlipAction(
            '/api/flip/flip',
            { cardIndex: index },
            t('翻牌失败', 'Flip failed')
        );

        if (result?.reward > 0) {
            alert(t(`本轮结束！获得 ${result.reward} 积分`, `Round ended! Earned ${result.reward} points`));
        }
    }

    startBtn.addEventListener('click', async () => {
        const result = await postFlipAction(
            '/api/flip/start',
            undefined,
            t('开始失败', 'Start failed')
        );
        if (result?.previousReward > 0) {
            alert(t(
                `上一轮自动结算：获得 ${result.previousReward} 积分`,
                `Previous round auto-settled: earned ${result.previousReward} points`
            ));
        }
    });

    cashoutBtn.addEventListener('click', async () => {
        const result = await postFlipAction(
            '/api/flip/cashout',
            undefined,
            t('退出失败', 'Cash out failed')
        );
        if (result) {
            alert(t(`退出成功，获得 ${result.reward} 积分`, `Cash out success, earned ${result.reward} points`));
        }
    });

    loadState().catch((error) => console.error('Flip initial state error:', error));
})();
