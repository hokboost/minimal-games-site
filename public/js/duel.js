(() => {
        const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
        const t = (zh, en) => (lang === 'zh' ? zh : en);
        const translateServerMessage = window.translateServerMessage || ((message) => message);

    const { csrfToken } = document.body.dataset;
    const rewardList = document.getElementById('rewardList');
    const powerRange = document.getElementById('powerRange');
    const powerInput = document.getElementById('powerInput');
    const costValueEl = document.getElementById('costValue');
    const duelBtn = document.getElementById('duelBtn');
    const resultBox = document.getElementById('resultBox');
    const balanceEl = document.getElementById('current-balance');
    let duelConfig;
    try {
        duelConfig = JSON.parse(decodeURIComponent(document.body.dataset.duelConfig || ''));
    } catch (error) {
        console.error('Invalid duel configuration payload', error);
        return;
    }
    const rewards = Object.entries(duelConfig.rewards || {}).map(([key, reward]) => ({
        key,
        ...reward,
        name: lang === 'zh' ? reward.nameZh : reward.nameEn
    }));
    if (rewards.length === 0) return;

    let activeReward = rewards[0];
    let duelInFlight = false;

    function renderRewards() {
        rewardList.replaceChildren();
        rewards.forEach((reward) => {
            const item = document.createElement('div');
            item.className = 'reward-item' + (reward.key === activeReward.key ? ' active' : '');
            const name = document.createElement('span');
            name.textContent = reward.name;
            const value = document.createElement('strong');
            value.textContent = `${reward.reward} ${t('积分', 'points')} · ${t('最低功力', 'min power')} ${reward.minimumPower}%`;
            item.append(name, value);
            item.addEventListener('click', () => {
                if (duelInFlight) return;
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
        const minimum = Number(activeReward.minimumPower) || 1;
        const maximum = Number(duelConfig.maximumPower) || 80;
        const power = Math.min(maximum, Math.max(minimum, Number(value)));
        powerRange.min = minimum;
        powerInput.min = minimum;
        powerRange.max = maximum;
        powerInput.max = maximum;
        powerRange.value = power;
        powerInput.value = power;
        document.getElementById('powerValue').textContent = `${power}%`;
        costValueEl.textContent = calculateCost(power);
    }

    function calculateCost(power) {
        const cost = Number(activeReward.costs?.[power]);
        return Number.isSafeInteger(cost) && cost > 0 ? cost : null;
    }

    powerRange.addEventListener('input', (event) => updatePower(event.target.value));
    powerInput.addEventListener('input', (event) => updatePower(event.target.value));

    function setDuelInFlight(inFlight) {
        duelInFlight = inFlight;
        duelBtn.disabled = inFlight;
        powerRange.disabled = inFlight;
        powerInput.disabled = inFlight;
        rewardList.classList.toggle('disabled', inFlight);
    }

    duelBtn.addEventListener('click', async () => {
        if (duelInFlight) return;
        const selectedReward = activeReward;
        const power = Number(powerInput.value);
        const cost = calculateCost(power);
        if (!Number.isSafeInteger(cost)) {
            resultBox.textContent = t('请选择该奖品允许的功力', 'Choose a power allowed for this tier');
            return;
        }
        const currentBalance = parseBalance(balanceEl.textContent);
        if (currentBalance !== null && currentBalance < cost) {
            resultBox.textContent = t('积分不足，无法挑战', 'Insufficient points');
            return;
        }
        setDuelInFlight(true);
        resultBox.textContent = t('挑战中...', 'Challenging...');
        try {
            const response = await window.idempotentFetch('/api/duel/play', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || ''
                },
                body: JSON.stringify({
                    giftType: selectedReward.key,
                    power
                })
            });

            const result = await response.json();
            if (!result.success) {
                resultBox.textContent = translateServerMessage(result.message) || t('挑战失败', 'Challenge failed');
                return;
            }

            const balanceAfterReward = parseBalance(result.balanceAfterReward);
            const balanceAfterBet = parseBalance(result.balanceAfterBet);
            const newBalance = parseBalance(result.newBalance);
            if (newBalance !== null) {
                balanceEl.textContent = newBalance;
            } else if (result.reward > 0 && balanceAfterReward !== null) {
                balanceEl.textContent = balanceAfterReward;
            } else if (balanceAfterBet !== null) {
                balanceEl.textContent = balanceAfterBet;
            }
            if (result.duelSuccess) {
                resultBox.textContent = t(
                    `挑战成功！获得 ${result.reward} 积分`,
                    `Success! Earned ${result.reward} points`
                );
            } else {
                resultBox.textContent = t('挑战失败，再接再厉', 'Challenge failed, try again');
            }
        } catch (error) {
            console.error('Duel error:', error);
            resultBox.textContent = t('网络错误，请稍后重试', 'Network error, please try again');
        } finally {
            setDuelInFlight(false);
        }
    });

    renderRewards();
    updatePower(powerRange.value);
})();
