(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);
    const escapeHTML = window.escapeHTML || ((value) => String(value ?? ''));

    const { username } = document.body.dataset;
    let csrf = document.body.dataset.csrfToken || '';
    let currentQuestions = [];
    let currentAnswers = [];
    let questionIndex = 0;
    let timer;
    let submitInFlight = false;
    let questionLocked = false;
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

    async function refreshCsrf() {
        try {
            const resp = await fetch('/quiz', { credentials: 'same-origin' });
            const html = await resp.text();
            const match = html.match(/data-csrf-token="([^"]+)"/);
            if (match && match[1]) {
                csrf = match[1];
            }
        } catch (e) {
            console.error(t('刷新CSRF失败:', 'Failed to refresh CSRF:'), e);
        }
    }

    async function safeFetch(url, options = {}) {
        const resp = await fetch(url, options);
        if (resp.status === 401 || resp.status === 403) {
            await refreshCsrf();
        }
        return resp;
    }

    async function startQuiz() {
        const currentBalance = parseInt(document.getElementById('current-balance').textContent, 10);
        if (currentBalance < 10) {
            alert(t(
                '积分不足！需要10积分才能开始答题。仅供娱乐，虚拟积分不可兑换真实货币。',
                'Insufficient points! You need 10 points to start. For entertainment only, virtual points cannot be exchanged for real money.'
            ));
            return;
        }

        try {
            const response = await window.idempotentFetch('/api/quiz/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({ username })
            });

            const data = await response.json();
            if (!data.success) {
                alert(t('开始游戏失败：', 'Failed to start game: ') + translateServerMessage(data.message));
                return;
            }

            document.getElementById('current-balance').textContent = data.newBalance;
        } catch (error) {
            console.error('Start quiz error:', error);
            alert(t('网络错误，请稍后重试', 'Network error, please try again'));
            return;
        }

        document.getElementById('user-section').style.display = 'none';
        document.getElementById('quiz').style.display = 'block';
        document.getElementById('result').style.display = 'none';

        currentQuestions = [];
        currentAnswers = [];
        questionIndex = 0;
        timeLeft = totalTime;
        submitInFlight = false;
        questionLocked = false;
        startTime = new Date();

        showWarmupMessage();
        nextQuestion();
        startTotalTimer();
    }

    function showWarmupMessage() {
        const timerEl = document.getElementById('timer');
        const question = document.getElementById('question');
        const options = document.getElementById('options');

        timerEl.textContent = t('服务器预热中...', 'Warming up server...');
        question.textContent = t('正在准备题目，请稍候...', 'Preparing questions, please wait...');
        options.innerHTML = '';

        setTimeout(() => {
            timerEl.textContent = t('游戏开始！', 'Game start!');
        }, 1000);
    }

    async function nextQuestion() {
        if (questionIndex >= totalQuestions) {
            submitQuiz();
            return;
        }

        try {
            const response = await window.idempotentFetch('/api/quiz/next', {
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
                document.getElementById('progress').textContent = t(
                    `题目 ${questionIndex + 1}/${totalQuestions}`,
                    `Question ${questionIndex + 1}/${totalQuestions}`
                );
            } else {
                alert(t('获取题目失败: ', 'Failed to get question: ') + translateServerMessage(data.message));
                if (data.message && data.message.includes('先开始')) {
                    await startQuiz();
                }
            }
        } catch (error) {
            console.error('Error:', error);
            alert(t('网络错误，请稍后重试', 'Network error, please try again'));
        }
    }

    function displayQuestion(question, token) {
        questionLocked = false;
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
        if (questionLocked || submitInFlight) {
            return;
        }
        questionLocked = true;

        const options = document.querySelectorAll('.option');
        options.forEach((opt) => {
            opt.classList.add('locked');
            opt.style.pointerEvents = 'none';
            opt.setAttribute('aria-disabled', 'true');
            opt.tabIndex = -1;
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
        stopTotalTimer();
        document.getElementById('timer').textContent = t(
            `剩余时间: ${timeLeft}s`,
            `Time left: ${timeLeft}s`
        );

        timer = setInterval(() => {
            timeLeft -= 1;
            document.getElementById('timer').textContent = t(
                `剩余时间: ${timeLeft}s`,
                `Time left: ${timeLeft}s`
            );

            if (timeLeft <= 0) {
                clearInterval(timer);
                submitQuiz();
            }
        }, 1000);
    }

    function stopTotalTimer() {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
    }

    async function submitQuiz() {
        if (submitInFlight) {
            return;
        }
        submitInFlight = true;
        stopTotalTimer();
        questionLocked = true;
        document.querySelectorAll('.option').forEach((option) => {
            option.classList.add('locked');
            option.style.pointerEvents = 'none';
            option.setAttribute('aria-disabled', 'true');
            option.tabIndex = -1;
        });

        try {
            const response = await window.idempotentFetch('/api/quiz/submit', {
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
                const message = translateServerMessage(data.message) || t('提交失败', 'Submission failed');
                if (data.message && data.message.includes('请先开始')) {
                    alert(t('提交失败: ', 'Submit failed: ') + message);
                    await startQuiz();
                } else {
                    showSubmissionRecovery(message, false);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            showSubmissionRecovery(t('网络异常，请检查连接后重试。', 'Network error. Check your connection and try again.'), true);
        } finally {
            submitInFlight = false;
        }
    }

    function showSubmissionRecovery(message, canRetry) {
        resultDiv.className = 'result-section show submission-error';
        resultDiv.replaceChildren();

        const title = document.createElement('h2');
        title.textContent = t('成绩提交未完成', 'Score not submitted');
        const detail = document.createElement('p');
        detail.textContent = message;
        resultDiv.append(title, detail);

        if (canRetry) {
            const retryButton = document.createElement('button');
            retryButton.type = 'button';
            retryButton.textContent = t('重新提交', 'Retry submission');
            retryButton.addEventListener('click', () => {
                resultDiv.replaceChildren();
                submitQuiz();
            }, { once: true });
            resultDiv.append(retryButton);
            return;
        }

        const profileLink = document.createElement('a');
        profileLink.href = '/profile';
        profileLink.className = 'submission-records-link';
        profileLink.textContent = t('查看个人记录', 'View personal records');
        resultDiv.append(profileLink);
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
            <h2>${t('答题完成！', 'Quiz Complete!')}</h2>
            <div style="font-size: 2rem; margin: 1rem 0; color: #00c853;">
                ${score}/${total} ${t('分', 'pts')} (${percentage}%)
            </div>
            <div style="font-size: 1.5rem; margin: 1rem 0; color: #ffeb3b;">
                ${t('获得奖励', 'Reward')}: ${reward || 0} ${t('积分', 'points')}
            </div>
            <div style="font-size: 1.2rem; margin: 1rem 0; color: #ffeb3b;">
                ${t('当前余额', 'Balance')}: ${newBalance || 0} ${t('积分', 'points')}
            </div>
            <p>${t('用时', 'Time')}: ${timeTaken} ${t('秒', 's')}</p>
        `;

        if (newBalance !== undefined) {
            document.getElementById('current-balance').textContent = newBalance;
        }

        if (percentage >= 80) {
            resultHTML += `<p style="color: #4caf50;">${t('优秀！知识渊博！', 'Excellent! Great knowledge!')}</p>`;
        } else if (percentage >= 60) {
            resultHTML += `<p style="color: #ff9800;">${t('不错！继续努力！', 'Nice! Keep going!')}</p>`;
        } else {
            resultHTML += `<p style="color: #f44336;">${t('加油！多学习多练习！', 'Keep it up! Practice more!')}</p>`;
        }

        resultHTML += `
            <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap;">
                <button class="result-action-btn" data-action="restart" style="
                    background: #087f73;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 25px;
                    cursor: pointer;
                ">${t('再来一次 (消耗10积分)', 'Play Again (Cost 10 points)')}</button>

                <button class="result-action-btn" data-action="home" style="
                    background: #326fad;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 25px;
                    cursor: pointer;
                ">${t('返回首页', 'Back to Home')}</button>
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
            document.getElementById('current-score').textContent = t(
                `本局得分：${score}/${total} 分 (${percentage}%)`,
                `Score: ${score}/${total} pts (${percentage}%)`
            );
            document.getElementById('current-reward').textContent = t(
                `获得积分：${reward} 积分`,
                `Points Earned: ${reward} points`
            );

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
                        <td>${escapeHTML(record.username)}</td>
                        <td>${escapeHTML(record.score)}</td>
                        <td>${new Date(record.submitted_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
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
                tbody.innerHTML = `<tr><td colspan="4">${t('暂无排行榜数据', 'No leaderboard data')}</td></tr>`;
            }
        } catch (error) {
            console.error(t('加载排行榜失败:', 'Failed to load leaderboard:'), error);
            document.getElementById('leaderboard-body').innerHTML = `<tr><td colspan="4">${t('加载排行榜失败', 'Failed to load leaderboard')}</td></tr>`;
        }
    }
})();
