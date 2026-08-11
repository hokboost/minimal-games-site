(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);
    const outcomeMap = {
        '不亏不赚': 'Break Even',
        '归零': 'Bust'
    };
    const formatOutcome = (outcome) => {
        if (lang === 'zh' || !outcome) {
            return outcome;
        }
        let formatted = outcomeMap[outcome] || outcome;
        formatted = formatted.replace('中奖', 'Win');
        formatted = formatted.replace('积分', 'points');
        return formatted;
    };

    const { username, csrfToken } = document.body.dataset;
    const csrf = csrfToken || '';
    const r1 = document.getElementById('r1');
    const r2 = document.getElementById('r2');
    const r3 = document.getElementById('r3');
    const btn = document.getElementById('spinBtn');
    const result = document.getElementById('rewardResult');

    function generateSpinNumbers(betAmount) {
        const baseNumbers = [50, 100, 150, 200];
        return baseNumbers.map((num) => Math.round(num * betAmount / 100));
    }

    function animateSpin(finalReels, payout, callback) {
        const betAmount = parseInt(document.getElementById('bet-amount').value, 10) || 10;
        const spinNumbers = generateSpinNumbers(betAmount);

        let steps = 38;
        const interval = setInterval(() => {
            r1.textContent = spinNumbers[Math.floor(Math.random() * spinNumbers.length)];
            r2.textContent = spinNumbers[Math.floor(Math.random() * spinNumbers.length)];
            r3.textContent = spinNumbers[Math.floor(Math.random() * spinNumbers.length)];
            steps -= 1;
            if (steps <= 0) {
                clearInterval(interval);
                [r1.textContent, r2.textContent, r3.textContent] = finalReels;

                const [a, b, c] = finalReels;
                const isWin = a === b && b === c;
                const isClose = !isWin && (a === b || b === c || a === c);

                if (isWin && payout > 0) {
                    result.textContent = t(
                        `恭喜中奖！获得 ${payout} 积分`,
                        `You won! Earned ${payout} points`
                    );
                    result.className = 'result-text big';
                    r1.style.transform = r2.style.transform = r3.style.transform = 'scale(1.4)';
                    setTimeout(() => {
                        r1.style.transform = r2.style.transform = r3.style.transform = 'scale(1)';
                    }, 500);
                } else if (isClose) {
                    result.textContent = t('差一点点就中了！继续努力', 'So close! Try again');
                    result.className = 'result-text narrow';
                } else {
                    result.textContent = t('三个数字不同，未中奖', 'No match this time');
                    result.className = 'result-text narrow';
                }

                callback();
            }
        }, 70);
    }

    async function playSlot() {
        const betAmount = parseInt(document.getElementById('bet-amount').value, 10);
        const currentBalance = parseInt(document.getElementById('current-balance').textContent, 10);

        if (!betAmount || betAmount < 1 || betAmount > 1000) {
            alert(t('请输入有效的投注金额 (1-1000积分)', 'Enter a valid bet amount (1-1000 points)'));
            return;
        }

        if (currentBalance < betAmount) {
            alert(t(
                `积分不足！当前余额: ${currentBalance} 积分，需要: ${betAmount} 积分。仅供娱乐，虚拟积分不可兑换真实货币。`,
                `Insufficient points! Balance: ${currentBalance}, needed: ${betAmount}. For entertainment only, virtual points cannot be exchanged for real money.`
            ));
            return;
        }

        btn.disabled = true;
        result.textContent = t('游戏中...', 'Spinning...');
        result.className = 'result-text';

        try {
            const response = await window.idempotentFetch('/api/slot/play', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    username,
                    betAmount
                })
            });

            const data = await response.json();
            if (!data.success) {
                const serverMessage = translateServerMessage(data.message);
                result.textContent = t(`游戏失败：${serverMessage}`, `Game failed: ${serverMessage}`);
                return;
            }

            document.getElementById('current-balance').textContent = data.newBalance;

            const { outcome, payout, finalBalance } = data;
            const reels = Array.isArray(data.reels) && data.reels.length === 3
                ? data.reels.map((value) => value.toString())
                : generateReelsForOutcome(outcome, payout);

            animateSpin(reels, payout, () => {
                let resultMessage;
                if (outcome === '不亏不赚') {
                    resultMessage = t(
                        `${outcome}！投注: ${betAmount} 积分，返还: ${payout} 积分`,
                        `${formatOutcome(outcome)}! Bet: ${betAmount} points, returned: ${payout} points`
                    );
                } else if (outcome === '归零') {
                    resultMessage = t(
                        `${outcome}！投注: ${betAmount} 积分，损失全部投注`,
                        `${formatOutcome(outcome)}! Bet: ${betAmount} points, lost the full stake`
                    );
                } else {
                    resultMessage = t(
                        `${outcome}！投注: ${betAmount} 积分，获得: ${payout} 积分`,
                        `${formatOutcome(outcome)}! Bet: ${betAmount} points, earned: ${payout} points`
                    );
                }
                result.textContent = t(
                    `${resultMessage} | 余额: ${finalBalance} 积分`,
                    `${resultMessage} | Balance: ${finalBalance} points`
                );
                document.getElementById('current-balance').textContent = finalBalance;
            });
        } catch (error) {
            console.error('Slot play error:', error);
            result.textContent = t('网络错误，请稍后重试', 'Network error, please try again');
        } finally {
            btn.disabled = false;
        }
    }

    function generateReelsForOutcome(outcome, payout) {
        const betAmount = parseInt(document.getElementById('bet-amount').value, 10) || 10;
        const spinNumbers = generateSpinNumbers(betAmount);

        if (outcome === '不亏不赚' || outcome.includes('×') || outcome.includes('中奖')) {
            const number = Number.isFinite(payout) ? payout : spinNumbers[Math.floor(Math.random() * spinNumbers.length)];
            return [number.toString(), number.toString(), number.toString()];
        }

        const shuffled = [...spinNumbers].sort(() => Math.random() - 0.5);
        return [shuffled[0].toString(), shuffled[1].toString(), shuffled[2].toString()];
    }

    btn.addEventListener('click', playSlot);
})();
