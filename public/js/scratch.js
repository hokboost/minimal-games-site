(() => {
    const { username, csrfToken } = document.body.dataset;
    const csrf = csrfToken || '';

    if (!crypto.randomUUID) {
        crypto.randomUUID = function () {
            return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
                (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
            );
        };
    }

    let hasVerified = true;
    let currentGameData = null;
    let selectedTier = null;

    const verifyBtn = document.getElementById('verify-btn');
    const backBtn = document.getElementById('back-btn');

    if (verifyBtn) {
        verifyBtn.addEventListener('click', verifyWin);
    }
    if (backBtn) {
        backBtn.addEventListener('click', backToTierSelection);
    }

    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.tier-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                const cost = parseInt(btn.dataset.cost, 10);
                const wins = parseInt(btn.dataset.wins, 10);
                selectTier(cost, wins);
            });
        });
    });

    function createCard(num, prize, isWinningArea = false) {
        const cell = document.createElement('div');
        cell.className = 'grid-item';

        const numberStyle = 'font-size: 1.8rem; font-weight: bold; color: #fff;';
        let prizeStyle;
        let bgStyle = '';

        if (isWinningArea) {
            prizeStyle = 'color: #00c853; font-weight: bold; font-size: 0.9rem;';
            bgStyle = 'background: rgba(255, 215, 0, 0.2); border: 2px solid #FFD700;';
        } else if (prize && prize.includes('电币') && !prize.includes('谢谢')) {
            prizeStyle = 'color: #00c853; font-weight: bold; font-size: 0.9rem;';
            bgStyle = 'background: rgba(0, 200, 83, 0.2); border: 2px solid #00c853;';
        } else {
            prizeStyle = 'color: #ccc; font-size: 0.8rem;';
        }

        cell.style.cssText = bgStyle;
        cell.innerHTML = `
            <div style="${numberStyle}">${num}</div>
            <div style="${prizeStyle}">${prize || ''}</div>
        `;
        return cell;
    }

    function backToTierSelection() {
        document.getElementById('game-board').style.display = 'none';
        document.querySelector('.balance-tier-section').style.display = 'block';
        hasVerified = true;
        currentGameData = null;
        selectedTier = null;
    }

    async function selectTier(cost, winCount) {
        const currentBalance = parseInt(document.getElementById('current-balance').textContent, 10);
        if (currentBalance < cost) {
            alert(`⚡ 电币不足！当前余额: ${currentBalance} 电币，需要: ${cost} 电币。仅供娱乐，虚拟电币不可兑换真实货币。`);
            return;
        }

        selectedTier = { cost, winCount };

        try {
            const response = await fetch('/api/scratch/play', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    username,
                    tier: cost,
                    winCount
                })
            });

            const data = await response.json();
            if (!data.success) {
                alert('游戏开始失败：' + data.message);
                return;
            }

            const payoutValue = data.payout ?? data.reward ?? 0;
            const outcomeText = data.outcome ?? ((payoutValue > 0) ? `中奖 ${payoutValue} 电币` : '未中奖');
            const normalized = {
                reward: data.reward ?? payoutValue,
                payout: payoutValue,
                outcome: outcomeText,
                winningNumbers: data.winningNumbers || data.winning_numbers || [],
                slots: data.slots || [],
                matchesCount: data.matchesCount ?? data.matches_count ?? 0,
                balance: data.balance ?? data.finalBalance ?? data.newBalance,
                finalBalance: data.balance ?? data.finalBalance ?? data.newBalance
            };

            currentGameData = normalized;
            if (typeof normalized.balance === 'number') {
                document.getElementById('current-balance').textContent = normalized.balance;
            }
            startScratchGame(normalized);
        } catch (error) {
            console.error('Scratch game error:', error);
            alert('网络错误，请稍后重试');
        }
    }

    async function startScratchGame(gameData) {
        hasVerified = false;
        document.querySelector('.balance-tier-section').style.display = 'none';
        document.getElementById('game-board').style.display = 'block';

        const userCount = gameData.slots.length;
        document.getElementById('current-tier-info').innerHTML = `
            <div>当前档位: ${selectedTier.cost} 电币 | 中奖号码: ${gameData.winningNumbers.length} 个 | 我的号码: ${userCount} 个</div>
            <div style="color: #ffeb3b;">🎯 刮开涂层，点击验证查看中奖结果！</div>
        `;

        const canvas = document.getElementById('scratchCanvas');
        const ctx = canvas.getContext('2d');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;

        ctx.fillStyle = '#c0c0c0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'destination-out';

        const all = [
            ...gameData.winningNumbers.map((n) => ({ num: n, prize: '中奖号码', isWinning: true })),
            ...gameData.slots.map((s) => ({
                num: s.number,
                prize: s.prize,
                isWinning: false
            }))
        ];

        const container = document.getElementById('scratchContent');
        container.innerHTML = '';
        all.forEach(({ num, prize, isWinning }) => container.appendChild(createCard(num, prize, isWinning)));

        let isDrawing = false;
        let lastX = null;
        let lastY = null;

        canvas.onmousedown = () => {
            isDrawing = true;
        };

        canvas.onmouseup = canvas.onmouseleave = () => {
            isDrawing = false;
            lastX = lastY = null;
        };

        canvas.onmousemove = (e) => {
            if (!isDrawing) return;
            const rect = canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            drawAt(x, y);
        };

        canvas.ontouchstart = (e) => {
            isDrawing = true;
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            lastX = touch.clientX - rect.left;
            lastY = touch.clientY - rect.top;
            drawAt(lastX, lastY);
        };

        canvas.ontouchmove = (e) => {
            if (!isDrawing) return;
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            drawAt(x, y);
        };

        canvas.ontouchend = () => {
            isDrawing = false;
            lastX = lastY = null;
        };

        function drawAt(x, y) {
            if (lastX !== null && lastY !== null) {
                const dx = x - lastX;
                const dy = y - lastY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const steps = Math.ceil(dist / 4);
                for (let i = 0; i <= steps; i += 1) {
                    const lerpX = lastX + (dx * i / steps);
                    const lerpY = lastY + (dy * i / steps);
                    ctx.beginPath();
                    ctx.arc(lerpX, lerpY, 20, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            lastX = x;
            lastY = y;
        }

        document.getElementById('game-result').innerHTML = '';
    }

    function verifyWin() {
        if (!currentGameData) {
            alert('请先开始游戏！');
            return;
        }

        const grid = Array.from(document.querySelectorAll('#scratchContent .grid-item'));
        const winNums = currentGameData.winningNumbers || [];
        const winCount = winNums.length;
        const userSlots = grid.slice(winCount);

        const matched = [];
        userSlots.forEach((cell) => {
            const num = parseInt(cell.children[0].textContent, 10);
            const prize = cell.children[1].textContent;
            if (winNums.includes(num)) {
                matched.push({ num, prize });
            }
        });

        const result = document.getElementById('game-result');
        let resultMessage;

        if ((currentGameData.payout || 0) === 0) {
            resultMessage = `😢 ${currentGameData.outcome}！投注: ${selectedTier.cost} 电币，未中奖`;
        } else if (currentGameData.payout === selectedTier.cost) {
            resultMessage = `🎯 ${currentGameData.outcome}！投注: ${selectedTier.cost} 电币，返还: ${currentGameData.payout} 电币`;
        } else {
            resultMessage = `🎉 ${currentGameData.outcome}！投注: ${selectedTier.cost} 电币，获得: ${currentGameData.payout} 电币`;
        }

        result.innerHTML = `
            <div style="background: rgba(255,255,255,0.1); padding: 1rem; border-radius: 8px; margin-top: 1rem;">
                <div style="color: #ffeb3b; font-size: 1.1rem; margin-bottom: 0.5rem;">${resultMessage}</div>
                <div style="color: #ccc;">匹配号码: ${matched.length} 个 | 余额: ${currentGameData.finalBalance ?? '--'} 电币</div>
            </div>
        `;

        if (typeof currentGameData.finalBalance === 'number') {
            document.getElementById('current-balance').textContent = currentGameData.finalBalance;
        }
        hasVerified = true;
    }
})();
