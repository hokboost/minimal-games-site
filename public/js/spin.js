const { username, csrfToken } = document.body.dataset;
        
        
        const passerbyTasks = [
            
            
            
            
            
            
            
            
            
            
            
            
            
            '垃圾清洁工'
        ];
        
        let countdownInterval = null;
        let countdownEndTime = null;
        
        
        const challenges = [
            '2加币买吃的', 'Quiz', 'Scratch', 'Slot', '10个深蹲',
            
            '热舞1分钟', '10个俯卧撑', 
            
            
              '转盘次数+2',
             '反方向走3分钟', '负重前行', '3分钟不能说你我他', '20秒吹一瓶可乐', 
             '浏览器记录',
             '垃圾清洁工' 
        ];
        const colors = [
            "#f44336", "#4caf50", "#2196f3", "#ff9800", "#9c27b0", "#607d8b",
            "#e91e63", "#795548", "#009688", "#ff5722", "#673ab7", "#3f51b5", 
            "#ffc107", "#00bcd4", "#ff6b6b", "#4ecdc4", "#45b7d1", "#f7b731", "#5f27cd", "#e17055",
            "#6c5ce7", "#a29bfe", "#fd79a8", "#fdcb6e", "#e84393", "#00b894", "#0984e3", "#74b9ff", "#a0e7e5", "#ffbe76"
        ];
        const canvas = document.getElementById("wheel");
        const ctx = canvas.getContext("2d");
        
        
        function resizeCanvas() {
            const isMobile = window.innerWidth <= 768;
            const size = isMobile ? 250 : 300;
            const dpr = window.devicePixelRatio || 1;
            
            
            canvas.width = size * dpr;
            canvas.height = size * dpr;
            
            
            canvas.style.width = size + 'px';
            canvas.style.height = size + 'px';
            
            
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            ctx.scale(dpr, dpr);
        }
        
        window.addEventListener('resize', () => {
            resizeCanvas();
            drawWheel();
        });
        
        resizeCanvas();
        
        function drawWheel() {
            const arc = 2 * Math.PI / challenges.length;
            const isMobile = window.innerWidth <= 768;
            const size = isMobile ? 250 : 300;
            const center = size / 2;
            const radius = center - 10;
            
            
            ctx.clearRect(0, 0, size, size);
            
            for (let i = 0; i < challenges.length; i++) {
                const start = i * arc;
                ctx.beginPath();
                ctx.moveTo(center, center);
                ctx.fillStyle = colors[i];
                ctx.arc(center, center, radius, start, start + arc);
                ctx.fill();
                ctx.save();
                ctx.translate(center, center);
                ctx.rotate(start + arc / 2);
                ctx.fillStyle = "#fff";
                
                const fontSize = isMobile ? 8 : 10;
                ctx.font = `${fontSize}px Arial`;
                ctx.textAlign = "right";
                ctx.fillText(challenges[i], radius - 8, 3);
                ctx.restore();
            }
        }
        
        drawWheel();
        
        function generateNonce(length = 16) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        }
        
        async function spin() {
            const button = document.getElementById('spinButton');
            const resultDiv = document.getElementById('result');
            
            
            hideCountdown();
            
            
            button.disabled = true;
            resultDiv.textContent = "转动中，请稍候...";
            
            const timestamp = Math.floor(Date.now() / 1000);
            const nonce = generateNonce();
            
            try {
                const response = await fetch('/api/spin', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken || ''
                    },
                    body: JSON.stringify({ username, timestamp, nonce })
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    resultDiv.textContent = "❌ " + data.message;
                    button.disabled = false;
                    return;
                }
                
                
                const finalAngle = 360 * 5 + (270 - data.angle);
                const duration = 4000;
                const start = performance.now();
                
                function animate(now) {
                    const t = Math.min((now - start) / duration, 1);
                    const eased = 1 - Math.pow(1 - t, 3); 
                    const angle = finalAngle * eased;
                    
                    const isMobile = window.innerWidth <= 768;
                    const size = isMobile ? 250 : 300;
                    const center = size / 2;
                    
                    ctx.clearRect(0, 0, size, size);
                    ctx.save();
                    ctx.translate(center, center);
                    ctx.rotate((angle * Math.PI) / 180);
                    ctx.translate(-center, -center);
                    drawWheel();
                    ctx.restore();
                    
                    if (t < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        let displayContent = `
                            <div style="color: #28a745; font-weight: bold; text-align: center; font-size: 1.2rem; padding: 15px; background: #f8f9fa; border-radius: 10px; margin-top: 20px;">
                                ${data.prize}
                            </div>
                        `;
                        
                        
                        const prizeText = data.prize;
                        
                        
                        
                        //     displayContent += `
                        //         <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                        
                        //         </div>
                        //     `;
                        // }
                        
                        
                        const basicChallengeTasks = [ '找路人要吃的', '要帅哥微信', 
                                                    '美女合照', '美女要微信', '夸赞美女30秒'];
                        
                        if (basicChallengeTasks.some(task => prizeText.includes(task))) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    该任务为挑战任务
                                </div>
                            `;
                        }
                        
                        
                        const basicPunishmentTasks = ['公主抱下蹲', '俯卧撑', '热舞', '深蹲', '大声清唱', '真心话'];
                        
                        if (basicPunishmentTasks.some(task => prizeText.includes(task))) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    纯惩罚，不加减资金
                                </div>
                            `;
                        }
                        
                        
                        
                        if (prizeText.includes('和路人帅哥合照')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    用手机合照一张算成功 成功+4失败扣4
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('集体反方向走一分钟')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    纯惩罚，不加减资金
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('和路人石头剪刀布')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    三局两胜若获胜加20，输了扣20
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('让路人B站关注一个乌龟酱')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    若路人没有B站，则让路人下载并关注 成功+4失败扣4
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('找一名路人猜年龄')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    找到一名路人 猜测自己年龄 上下三岁及以内算成功 成功+4失败扣4
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('浏览器记录')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    念出自己最近一条浏览器记录 纯惩罚不加减资金
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('手拉手走一分钟')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    两名男生手拉手走一分钟 纯惩罚 不加减资金
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('垃圾清洁工')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    接下来5分钟内 走到路上看到所有垃圾都捡起来了，则挑战成功。成功加20失败扣20
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('含水对视')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    两名男生各含一口矿泉水，对视达到10秒，则视为成功 成功加20失败扣20
                                </div>
                            `;
                        }
                        
                        
                        if (prizeText.includes('背起走路')) {
                            displayContent += `
                                <div style="color: #28a745; font-size: 1.1rem; margin-top: 10px; padding: 10px; background: #d4edda; border-radius: 8px;">
                                    两名男生，一人背起一人，走1步加0.2加币，上限4加币，若小于5步则扣4加币
                                </div>
                            `;
                        }
                        
                        resultDiv.innerHTML = displayContent;
                        button.disabled = false;
                        
                        
                        const isPasserbyTask = passerbyTasks.some(task => prizeText.includes(task));
                        
                        if (isPasserbyTask) {
                            startCountdown();
                        }
                    }
                }
                
                requestAnimationFrame(animate);
                
            } catch (error) {
                resultDiv.textContent = "❌ 网络错误，请重试";
                button.disabled = false;
                console.error('Error:', error);
            }
        }

        document.getElementById('spinButton').addEventListener('click', spin);
        
        
        function startCountdown() {
            const timerDiv = document.getElementById('countdown-timer');
            const displayDiv = document.getElementById('countdown-display');
            
            timerDiv.style.display = 'block';
            countdownEndTime = Date.now() + 5 * 60 * 1000; 
            
            countdownInterval = setInterval(() => {
                const remaining = Math.max(0, countdownEndTime - Date.now());
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                
                displayDiv.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                if (remaining <= 0) {
                    hideCountdown();
                }
                
                
                if (remaining <= 30000) {
                    displayDiv.style.animation = 'blink 1s infinite';
                }
            }, 100);
        }
        
        
        function hideCountdown() {
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }
            
            const timerDiv = document.getElementById('countdown-timer');
            const displayDiv = document.getElementById('countdown-display');
            
            timerDiv.style.display = 'none';
            displayDiv.style.animation = 'none';
        }
