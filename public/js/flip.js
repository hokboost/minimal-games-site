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

    function updateBalance(balance) {
        if (typeof balance === 'number') {
            balanceEl.textContent = balance;
        }
    }

    function renderBoard(board, ended) {
        grid.innerHTML = '';
        board.forEach((card, index) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'flip-card';
            if (card.flipped) {
                cardEl.classList.add('flipped');
                cardEl.classList.add(card.type === 'good' ? 'good' : 'bad');
                cardEl.textContent = card.type === 'good' ? t('好', 'Good') : t('坏', 'Bad');
            } else {
                cardEl.innerHTML = `<span class="card-label">${t('翻开', 'Flip')}</span>`;
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
        renderBoard(data.board, data.ended);
        nextCostEl.textContent = data.nextCost ? `${data.nextCost} ${t('电币', 'coins')}` : '--';
        goodCountEl.textContent = data.goodCount || 0;
        cashoutRewardEl.textContent = `${data.cashoutReward || 0} ${t('电币', 'coins')}`;
        cashoutBtn.disabled = data.ended || data.goodCount === 0;
    }

    async function loadState() {
        const response = await fetch('/api/flip/state');
        const data = await response.json();
        if (data.success) {
            updateState(data);
        }
    }

    async function flipCard(index) {
        const response = await fetch('/api/flip/flip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || ''
            },
            body: JSON.stringify({ cardIndex: index })
        });
        const result = await response.json();
        if (!result.success) {
            alert(translateServerMessage(result.message) || t('翻牌失败', 'Flip failed'));
            return;
        }
        updateBalance(result.newBalance);
        await loadState();

        if (result.reward > 0) {
            alert(t(`本轮结束！获得 ${result.reward} 电币`, `Round ended! Earned ${result.reward} coins`));
        }
    }

    startBtn.addEventListener('click', async () => {
        const response = await fetch('/api/flip/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || ''
            }
        });
        const result = await response.json();
        if (!result.success) {
            alert(translateServerMessage(result.message) || t('开始失败', 'Start failed'));
            return;
        }
        if (typeof result.newBalance === 'number') {
            updateBalance(result.newBalance);
        }
        if (result.previousReward > 0) {
            alert(t(
                `上一轮自动结算：获得 ${result.previousReward} 电币`,
                `Previous round auto-settled: earned ${result.previousReward} coins`
            ));
        }
        await loadState();
    });

    cashoutBtn.addEventListener('click', async () => {
        const response = await fetch('/api/flip/cashout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken || ''
            }
        });
        const result = await response.json();
        if (!result.success) {
            alert(translateServerMessage(result.message) || t('退出失败', 'Cash out failed'));
            return;
        }
        updateBalance(result.newBalance);
        await loadState();
        alert(t(`退出成功，获得 ${result.reward} 电币`, `Cash out success, earned ${result.reward} coins`));
    });

    loadState();
})();
