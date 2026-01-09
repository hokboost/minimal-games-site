(() => {
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
                    result.textContent = `🎉 恭喜中奖！获得 ${payout} 电币`;
                    result.className = 'result-text big';
                    r1.style.transform = r2.style.transform = r3.style.transform = 'scale(1.4)';
                    setTimeout(() => {
                        r1.style.transform = r2.style.transform = r3.style.transform = 'scale(1)';
                    }, 500);
                } else if (isClose) {
                    result.textContent = '😭 差一点点就中了！继续努力';
                    result.className = 'result-text narrow';
                } else {
                    result.textContent = '😅 三个数字不同，未中奖';
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
            alert('请输入有效的投注金额 (1-1000电币)');
            return;
        }

        if (currentBalance < betAmount) {
            alert(`⚡ 电币不足！当前余额: ${currentBalance} 电币，需要: ${betAmount} 电币。仅供娱乐，虚拟电币不可兑换真实货币。`);
            return;
        }

        btn.disabled = true;
        result.textContent = '🎰 游戏中...';
        result.className = 'result-text';

        try {
            const response = await fetch('/api/slot/play', {
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
                result.textContent = `❌ 游戏失败：${data.message}`;
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
                    resultMessage = `🎯 ${outcome}！投注: ${betAmount} 电币，返还: ${payout} 电币`;
                } else if (outcome === '归零') {
                    resultMessage = `💸 ${outcome}！投注: ${betAmount} 电币，损失全部投注`;
                } else {
                    resultMessage = `🎉 ${outcome}！投注: ${betAmount} 电币，获得: ${payout} 电币`;
                }
                result.textContent = `${resultMessage} | 余额: ${finalBalance} 电币`;
                document.getElementById('current-balance').textContent = finalBalance;
            });
        } catch (error) {
            console.error('Slot play error:', error);
            result.textContent = '⚠️ 网络错误，请稍后重试';
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
