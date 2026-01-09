(() => {
    const { csrfToken } = document.body.dataset;
    const rewardList = document.getElementById('rewardList');
    const powerRange = document.getElementById('powerRange');
    const powerInput = document.getElementById('powerInput');
    const costValueEl = document.getElementById('costValue');
    const duelBtn = document.getElementById('duelBtn');
    const resultBox = document.getElementById('resultBox');
    const balanceEl = document.getElementById('current-balance');

    const rewards = [
        { key: 'crown', name: '至尊奖', reward: 30000 },
        { key: 'dragon', name: '龙魂奖', reward: 13140 },
        { key: 'phoenix', name: '凤羽奖', reward: 5000 },
        { key: 'jade', name: '玉阶奖', reward: 1000 },
        { key: 'bronze', name: '青铜奖', reward: 500 },
        { key: 'iron', name: '铁心奖', reward: 200 }
    ];

    let activeReward = rewards[0];

    function renderRewards() {
        rewardList.innerHTML = '';
        rewards.forEach((reward) => {
            const item = document.createElement('div');
            item.className = 'reward-item' + (reward.key === activeReward.key ? ' active' : '');
            item.innerHTML = `<span>${reward.name}</span><strong>${reward.reward} 电币</strong>`;
            item.addEventListener('click', () => {
                activeReward = reward;
                renderRewards();
                updatePower(powerInput.value);
            });
            rewardList.appendChild(item);
        });
    }

    function parseBalance(value) {
        if (typeof value === 'number') {
            return value;
        }
        if (typeof value === 'string') {
            const cleaned = value.replace(/[^\d.-]/g, '');
            const num = Number(cleaned);
            return Number.isFinite(num) ? num : null;
        }
        return null;
    }

    function updatePower(value) {
        const power = Math.min(80, Math.max(1, Number(value)));
        powerRange.value = power;
        powerInput.value = power;
        document.getElementById('powerValue').textContent = `${power}%`;
        costValueEl.textContent = calculateCost(power);
    }

    function calculateCost(power) {
        if (activeReward.key === 'crown') {
            return Math.round(310 * power + 1);
        }
        const ratio = activeReward.reward / 30000;
        return Math.round(310 * ratio * power + 1);
    }

    powerRange.addEventListener('input', (event) => updatePower(event.target.value));
    powerInput.addEventListener('input', (event) => updatePower(event.target.value));

    duelBtn.addEventListener('click', async () => {
        duelBtn.disabled = true;
        resultBox.textContent = '挑战中...';
        const power = Number(powerInput.value);
        const cost = calculateCost(power);
        const currentBalance = parseBalance(balanceEl.textContent);
        if (currentBalance !== null && currentBalance < cost) {
            resultBox.textContent = '电币不足，无法挑战';
            duelBtn.disabled = false;
            return;
        }
        if (currentBalance !== null && Number.isFinite(cost)) {
            balanceEl.textContent = currentBalance - cost;
        }
        try {
            const response = await fetch('/api/duel/play', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || ''
                },
                body: JSON.stringify({
                    giftType: activeReward.key,
                    power
                })
            });

            const result = await response.json();
            if (!result.success) {
                resultBox.textContent = result.message || '挑战失败';
                if (Number.isFinite(currentBalance)) {
                    balanceEl.textContent = currentBalance;
                }
                return;
            }

            const balanceAfterReward = parseBalance(result.balanceAfterReward);
            const balanceAfterBet = parseBalance(result.balanceAfterBet);
            const newBalance = parseBalance(result.newBalance);
            if (result.reward > 0 && balanceAfterReward !== null) {
                balanceEl.textContent = balanceAfterReward;
            } else if (balanceAfterBet !== null) {
                balanceEl.textContent = balanceAfterBet;
            } else if (newBalance !== null) {
                balanceEl.textContent = newBalance;
            }
            if (result.reward > 0) {
                resultBox.textContent = `🎉 挑战成功！获得 ${activeReward.reward} 电币`;
            } else {
                resultBox.textContent = '😢 挑战失败，再接再厉';
            }
        } catch (error) {
            console.error('Duel error:', error);
            resultBox.textContent = '网络错误，请稍后重试';
        } finally {
            duelBtn.disabled = false;
        }
    });

    renderRewards();
    updatePower(powerRange.value);
})();
