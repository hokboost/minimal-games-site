(() => {
    const { username, csrfToken } = document.body.dataset;
    const csrf = csrfToken || '';
    let currentQuestions = [];
    let currentAnswers = [];
    let questionIndex = 0;
    let timer;
    let startTime;
    const totalQuestions = 15;
    const totalTime = 30;
    let timeLeft = totalTime;

    const startBtn = document.getElementById('start-quiz-btn');
    const refreshBtn = document.getElementById('refresh-leaderboard-btn');
    const resultDiv = document.getElementById('result');

    if (startBtn) {
        startBtn.addEventListener('click', startQuiz);
    }
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadLeaderboard);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadLeaderboard();
    });

    async function startQuiz() {
        const currentBalance = parseInt(document.getElementById('current-balance').textContent, 10);
        if (currentBalance < 10) {
            alert('⚡ 电币不足！需要10电币才能开始答题。仅供娱乐，虚拟电币不可兑换真实货币。');
            return;
        }

        try {
            const response = await fetch('/api/quiz/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({ username })
            });

            const data = await response.json();
            if (!data.success) {
                alert('开始游戏失败：' + data.message);
                return;
            }

            document.getElementById('current-balance').textContent = data.newBalance;
        } catch (error) {
            console.error('Start quiz error:', error);
            alert('网络错误，请稍后重试');
            return;
        }

        document.getElementById('user-section').style.display = 'none';
        document.getElementById('quiz').style.display = 'block';
        document.getElementById('result').style.display = 'none';

        currentQuestions = [];
        currentAnswers = [];
        questionIndex = 0;
        timeLeft = totalTime;
        startTime = new Date();

        showWarmupMessage();
        nextQuestion();
        startTotalTimer();
    }

    function showWarmupMessage() {
        const timerEl = document.getElementById('timer');
        const question = document.getElementById('question');
        const options = document.getElementById('options');

        timerEl.textContent = '服务器预热中...';
        question.textContent = '正在准备题目，请稍候...';
        options.innerHTML = '';

        setTimeout(() => {
            timerEl.textContent = '游戏开始！';
        }, 1000);
    }

    async function nextQuestion() {
        if (questionIndex >= totalQuestions) {
            submitQuiz();
            return;
        }

        try {
            const response = await fetch('/api/quiz/next', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    username,
                    seen: currentQuestions.map((q) => q.id),
                    questionIndex
                })
            });

            const data = await response.json();
            if (data.success) {
                currentQuestions.push({
                    id: data.question.id,
                    token: data.token,
                    signature: data.signature
                });

                displayQuestion(data.question, data.token);
                document.getElementById('progress').textContent = `题目 ${questionIndex + 1}/${totalQuestions}`;
            } else {
                alert('获取题目失败: ' + data.message);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('网络错误，请稍后重试');
        }
    }

    function displayQuestion(question, token) {
        document.getElementById('question').textContent = question.question;

        const optionsDiv = document.getElementById('options');
        optionsDiv.innerHTML = '';

        question.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = 'option';
            optionDiv.textContent = option;
            optionDiv.addEventListener('click', () => selectOption(index, token, optionDiv));
            optionsDiv.appendChild(optionDiv);
        });
    }

    function selectOption(answerIndex, token, optionElement) {
        const options = document.querySelectorAll('.option');
        options.forEach((opt) => {
            opt.classList.add('locked');
            opt.style.pointerEvents = 'none';
        });

        optionElement.classList.add('selected');
        currentAnswers.push({
            token,
            answerIndex
        });

        setTimeout(() => {
            questionIndex += 1;
            nextQuestion();
        }, 800);
    }

    function startTotalTimer() {
        document.getElementById('timer').textContent = `剩余时间: ${timeLeft}s`;

        timer = setInterval(() => {
            timeLeft -= 1;
            document.getElementById('timer').textContent = `剩余时间: ${timeLeft}s`;

            if (timeLeft <= 0) {
                clearInterval(timer);
                submitQuiz();
            }
        }, 1000);
    }

    async function submitQuiz() {
        try {
            const response = await fetch('/api/quiz/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    username,
                    answers: currentAnswers
                })
            });

            const data = await response.json();
            if (data.success) {
                showResult(data.score, data.total, data.reward, data.newBalance);
            } else {
                alert('提交失败: ' + data.message);
            }
        } catch (error) {
            console.error('Error:', error);
            alert('提交失败，请稍后重试');
        }
    }

    function showResult(score, total, reward, newBalance) {
        document.getElementById('quiz').style.display = 'none';
        resultDiv.className = 'result-section show';

        window.lastGameResult = {
            score,
            total,
            reward,
            newBalance
        };

        const percentage = Math.round((score / total) * 100);
        const endTime = new Date();
        const timeTaken = Math.round((endTime - startTime) / 1000);

        let resultHTML = `
            <h2>🎉 答题完成！</h2>
            <div style="font-size: 2rem; margin: 1rem 0; color: #00c853;">
                ${score}/${total} 分 (${percentage}%)
            </div>
            <div style="font-size: 1.5rem; margin: 1rem 0; color: #ffeb3b;">
                ⚡ 获得奖励: ${reward || 0} 电币
            </div>
            <div style="font-size: 1.2rem; margin: 1rem 0; color: #ffeb3b;">
                💰 当前余额: ${newBalance || 0} 电币
            </div>
            <p>用时: ${timeTaken} 秒</p>
        `;

        if (newBalance !== undefined) {
            document.getElementById('current-balance').textContent = newBalance;
        }

        if (percentage >= 80) {
            resultHTML += `<p style="color: #4caf50;">🌟 优秀！知识渊博！</p>`;
        } else if (percentage >= 60) {
            resultHTML += `<p style="color: #ff9800;">👍 不错！继续努力！</p>`;
        } else {
            resultHTML += `<p style="color: #f44336;">💪 加油！多学习多练习！</p>`;
        }

        resultHTML += `
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap;">
                <button class="result-action-btn" data-action="restart" style="
                    background: linear-gradient(45deg, #00c853, #00bfa5);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 25px;
                    cursor: pointer;
                ">🔄 再来一次 (消耗10电币)</button>

                <button class="result-action-btn" data-action="home" style="
                    background: linear-gradient(45deg, #2196f3, #1976d2);
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 25px;
                    cursor: pointer;
                ">🏠 返回首页</button>
            </div>
        `;

        resultDiv.innerHTML = resultHTML;

        const restartBtn = resultDiv.querySelector('[data-action="restart"]');
        const homeBtn = resultDiv.querySelector('[data-action="home"]');
        if (restartBtn) {
            restartBtn.addEventListener('click', restartQuiz);
        }
        if (homeBtn) {
            homeBtn.addEventListener('click', backToHome);
        }

        setTimeout(() => {
            document.getElementById('current-game-result').style.display = 'block';
            document.getElementById('current-score').textContent = `本局得分：${score}/${total} 分 (${percentage}%)`;
            document.getElementById('current-reward').textContent = `获得电币：${reward} 电币`;

            document.getElementById('leaderboard').style.display = 'block';
            loadLeaderboard();
        }, 1000);
    }

    function restartQuiz() {
        document.getElementById('result').style.display = 'none';
        document.getElementById('leaderboard').style.display = 'none';
        document.getElementById('current-game-result').style.display = 'none';
        document.getElementById('user-section').style.display = 'block';
        window.lastGameResult = null;
    }

    function backToHome() {
        window.location.href = '/';
    }

    async function loadLeaderboard() {
        try {
            const response = await fetch('/api/quiz/leaderboard');
            const data = await response.json();
            const tbody = document.getElementById('leaderboard-body');

            if (data.success && Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
                tbody.innerHTML = '';
                data.leaderboard.forEach((record, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${record.username}</td>
                        <td>${record.score}</td>
                        <td>${new Date(record.submitted_at).toLocaleString('zh-CN', {
                            timeZone: 'Asia/Shanghai',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        })}</td>
                    `;
                    tbody.appendChild(row);
                });
            } else {
                tbody.innerHTML = '<tr><td colspan="4">暂无排行榜数据</td></tr>';
            }
        } catch (error) {
            console.error('加载排行榜失败:', error);
            document.getElementById('leaderboard-body').innerHTML = '<tr><td colspan="4">加载排行榜失败</td></tr>';
        }
    }
})();
