(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);
    const { username } = document.body.dataset;
    let csrf = document.body.dataset.csrfToken || '';
    let currentQuestions = [];
    let currentAnswers = [];
    let questionRequests = new Map();
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

        document.getElementById('user-section').hidden = true;
        document.getElementById('quiz').hidden = false;
        document.getElementById('result').hidden = true;

        currentQuestions = [];
        currentAnswers = [];
        questionRequests = new Map();
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
        options.replaceChildren();

        setTimeout(() => {
            timerEl.textContent = t('游戏开始！', 'Game start!');
        }, 1000);
    }

    async function fetchQuestionAt(index) {
        const existing = currentQuestions.find((item) => item.questionIndex === index);
        if (existing) return existing;
        if (questionRequests.has(index)) return questionRequests.get(index);

        const request = (async () => {
            const response = await window.idempotentFetch('/api/quiz/next', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    username,
                    questionIndex: index
                })
            });

            const data = await response.json();
            if (!response.ok || data.success !== true || !data.question || !data.token) {
                const error = new Error(data.message || `Question request failed (${response.status})`);
                error.serverMessage = data.message;
                throw error;
            }

            const issued = {
                id: data.question.id,
                question: data.question,
                token: data.token,
                questionIndex: index
            };
            currentQuestions.push(issued);
            return issued;
        })();
        questionRequests.set(index, request);
        try {
            return await request;
        } finally {
            questionRequests.delete(index);
        }
    }

    async function nextQuestion() {
        if (questionIndex >= totalQuestions) {
            submitQuiz();
            return;
        }

        try {
            const issued = await fetchQuestionAt(questionIndex);
            if (submitInFlight) return;
            displayQuestion(issued.question, issued.token);
            document.getElementById('progress').textContent = t(
                `题目 ${questionIndex + 1}/${totalQuestions}`,
                `Question ${questionIndex + 1}/${totalQuestions}`
            );
        } catch (error) {
            console.error('Error:', error);
            const message = translateServerMessage(error.serverMessage)
                || t('网络错误，请稍后重试', 'Network error, please try again');
            alert(t('获取题目失败: ', 'Failed to get question: ') + message);
        }
    }

    function displayQuestion(question, token) {
        questionLocked = false;
        document.getElementById('question').textContent = question.question;

        const optionsDiv = document.getElementById('options');
        optionsDiv.replaceChildren();

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
            opt.setAttribute('aria-disabled', 'true');
            opt.tabIndex = -1;
        });

        optionElement.classList.add('selected');
        currentAnswers.push({
            token,
            answerIndex,
            questionIndex
        });

        questionIndex += 1;
        nextQuestion();
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

    async function buildSettlementAnswers() {
        const answersByToken = new Map(currentAnswers.map((answer) => [answer.token, answer]));
        for (let index = 0; index < totalQuestions; index += 1) {
            const issued = await fetchQuestionAt(index);
            if (!answersByToken.has(issued.token)) {
                answersByToken.set(issued.token, {
                    token: issued.token,
                    answerIndex: -1,
                    questionIndex: index
                });
            }
        }
        return Array.from(answersByToken.values())
            .sort((left, right) => left.questionIndex - right.questionIndex)
            .map(({ token, answerIndex }) => ({ token, answerIndex }));
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
            option.setAttribute('aria-disabled', 'true');
            option.tabIndex = -1;
        });

        try {
            const settlementAnswers = await buildSettlementAnswers();
            const response = await window.idempotentFetch('/api/quiz/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    username,
                    answers: settlementAnswers
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
        resultDiv.hidden = false;
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
        document.getElementById('quiz').hidden = true;
        resultDiv.hidden = false;
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

        resultDiv.replaceChildren();
        const title = document.createElement('h2');
        title.textContent = t('答题完成！', 'Quiz Complete!');
        const scoreLine = document.createElement('div');
        scoreLine.className = 'quiz-result-score';
        scoreLine.textContent = `${score}/${total} ${t('分', 'pts')} (${percentage}%)`;
        const rewardLine = document.createElement('div');
        rewardLine.className = 'quiz-result-reward';
        rewardLine.textContent = `${t('获得奖励', 'Reward')}: ${reward || 0} ${t('积分', 'points')}`;
        const balanceLine = document.createElement('div');
        balanceLine.className = 'quiz-result-balance';
        balanceLine.textContent = `${t('当前余额', 'Balance')}: ${newBalance || 0} ${t('积分', 'points')}`;
        const timeLine = document.createElement('p');
        timeLine.textContent = `${t('用时', 'Time')}: ${timeTaken} ${t('秒', 's')}`;
        resultDiv.append(title, scoreLine, rewardLine, balanceLine, timeLine);

        if (newBalance !== undefined) {
            document.getElementById('current-balance').textContent = newBalance;
        }

        if (percentage >= 80) {
            resultDiv.dataset.grade = 'excellent';
        } else if (percentage >= 60) {
            resultDiv.dataset.grade = 'good';
        } else {
            resultDiv.dataset.grade = 'practice';
        }
        const gradeLine = document.createElement('p');
        gradeLine.className = 'quiz-result-grade';
        gradeLine.textContent = percentage >= 80
            ? t('优秀！知识渊博！', 'Excellent! Great knowledge!')
            : percentage >= 60
                ? t('不错！继续努力！', 'Nice! Keep going!')
                : t('加油！多学习多练习！', 'Keep it up! Practice more!');
        const actions = document.createElement('div');
        actions.className = 'quiz-result-actions';
        const restartBtn = document.createElement('button');
        restartBtn.type = 'button';
        restartBtn.className = 'result-action-btn result-action-restart';
        restartBtn.textContent = t('再来一次 (消耗10积分)', 'Play Again (Cost 10 points)');
        restartBtn.addEventListener('click', restartQuiz);
        const homeBtn = document.createElement('button');
        homeBtn.type = 'button';
        homeBtn.className = 'result-action-btn result-action-home';
        homeBtn.textContent = t('返回首页', 'Back to Home');
        homeBtn.addEventListener('click', backToHome);
        actions.append(restartBtn, homeBtn);
        resultDiv.append(gradeLine, actions);

        setTimeout(() => {
            document.getElementById('current-game-result').hidden = false;
            document.getElementById('current-score').textContent = t(
                `本局得分：${score}/${total} 分 (${percentage}%)`,
                `Score: ${score}/${total} pts (${percentage}%)`
            );
            document.getElementById('current-reward').textContent = t(
                `获得积分：${reward} 积分`,
                `Points Earned: ${reward} points`
            );

            document.getElementById('leaderboard').hidden = false;
            loadLeaderboard();
        }, 1000);
    }

    function restartQuiz() {
        document.getElementById('result').hidden = true;
        document.getElementById('leaderboard').hidden = true;
        document.getElementById('current-game-result').hidden = true;
        document.getElementById('user-section').hidden = false;
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

            if (!response.ok || data.success !== true) {
                throw new Error(data.message || `Leaderboard request failed (${response.status})`);
            }

            if (Array.isArray(data.leaderboard) && data.leaderboard.length > 0) {
                tbody.replaceChildren();
                data.leaderboard.forEach((record, index) => {
                    const row = document.createElement('tr');
                    const values = [
                        index + 1,
                        record.username,
                        record.score,
                        new Date(record.submitted_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
                            timeZone: 'Asia/Shanghai',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false
                        })
                    ];
                    for (const value of values) {
                        const cell = document.createElement('td');
                        cell.textContent = String(value ?? '');
                        row.appendChild(cell);
                    }
                    tbody.appendChild(row);
                });
            } else {
                showLeaderboardMessage(tbody, t('暂无排行榜数据', 'No leaderboard data'));
            }
        } catch (error) {
            console.error(t('加载排行榜失败:', 'Failed to load leaderboard:'), error);
            showLeaderboardMessage(
                document.getElementById('leaderboard-body'),
                t('加载排行榜失败', 'Failed to load leaderboard')
            );
        }
    }

    function showLeaderboardMessage(tbody, message) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 4;
        cell.textContent = message;
        row.appendChild(cell);
        tbody.replaceChildren(row);
    }
})();
