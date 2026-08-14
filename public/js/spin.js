const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
const t = (zh, en) => (lang === 'zh' ? zh : en);
const translateServerMessage = window.translateServerMessage || ((message) => message);
const { username, csrfToken } = document.body.dataset;

        let countdownInterval = null;
        let countdownEndTime = null;

        let spinConfig = { challenges: [] };
        try {
            spinConfig = JSON.parse(decodeURIComponent(document.body.dataset.spinConfig || ''));
        } catch (error) {
            console.error('Spin configuration parse error:', error);
        }
        const challengeEntries = Array.isArray(spinConfig.challenges)
            ? spinConfig.challenges
            : [];
        const challengeById = new Map(challengeEntries.map((challenge) => [challenge.id, challenge]));
        const challenges = challengeEntries.map((challenge) => (
            lang === 'zh' ? challenge.labelZh : challenge.labelEn
        ));
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
            const bytes = crypto.getRandomValues(new Uint8Array(length));
            return Array.from(bytes, (value) => chars[value % chars.length]).join('');
        }
        
        async function spin() {
            const button = document.getElementById('spinButton');
            const resultDiv = document.getElementById('result');
            
            
            hideCountdown();
            
            
            button.disabled = true;
            resultDiv.textContent = t('转动中，请稍候...', 'Spinning, please wait...');
            
            const timestamp = Math.floor(Date.now() / 1000);
            const nonce = generateNonce();
            
            try {
                const response = await window.idempotentFetch('/api/spin', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken || ''
                    },
                    body: JSON.stringify({ username, timestamp, nonce })
                });
                
                const data = await response.json();
                
                if (!data.success) {
                    resultDiv.textContent = translateServerMessage(data.message);
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
                        const selectedChallenge = challengeById.get(data.prizeId);
                        const displayPrize = selectedChallenge
                            ? (lang === 'zh' ? selectedChallenge.labelZh : selectedChallenge.labelEn)
                            : String(data.prize || '');
                        const details = selectedChallenge
                            ? [lang === 'zh' ? selectedChallenge.detailZh : selectedChallenge.detailEn]
                            : [];

                        const prize = document.createElement('div');
                        prize.className = 'spin-result-prize';
                        prize.textContent = String(displayPrize || '');
                        const detailNodes = details.map((detail) => {
                            const node = document.createElement('div');
                            node.className = 'spin-result-detail';
                            node.textContent = detail;
                            return node;
                        });
                        resultDiv.replaceChildren(prize, ...detailNodes);
                        button.disabled = false;
                        
                        
                        const countdownSeconds = Number(selectedChallenge?.countdownSeconds);
                        if (Number.isSafeInteger(countdownSeconds) && countdownSeconds > 0) {
                            startCountdown(countdownSeconds);
                        }
                    }
                }
                
                requestAnimationFrame(animate);
                
            } catch (error) {
                resultDiv.textContent = t('网络错误，请重试', 'Network error, please retry');
                button.disabled = false;
                console.error('Error:', error);
            }
        }

        document.getElementById('spinButton').addEventListener('click', spin);
        
        
        function startCountdown(durationSeconds) {
            const timerDiv = document.getElementById('countdown-timer');
            const displayDiv = document.getElementById('countdown-display');
            
            if (countdownInterval) clearInterval(countdownInterval);
            timerDiv.hidden = false;
            displayDiv.classList.remove('is-urgent');
            countdownEndTime = Date.now() + durationSeconds * 1000;
            
            countdownInterval = setInterval(() => {
                const remaining = Math.max(0, countdownEndTime - Date.now());
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                
                displayDiv.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                
                if (remaining <= 0) {
                    hideCountdown();
                }
                
                
                if (remaining <= 30000) {
                    displayDiv.classList.add('is-urgent');
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
            
            timerDiv.hidden = true;
            displayDiv.classList.remove('is-urgent');
        }
