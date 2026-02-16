(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);

    const startBtn = document.getElementById('start-btn');
    const playBtn = document.getElementById('play-btn');
    const submitBtn = document.getElementById('submit-btn');
    const statusEl = document.getElementById('dictation-status');
    const progressEl = document.getElementById('dictation-progress');
    const gridEl = document.getElementById('dictation-grid');
    const cells = gridEl ? Array.from(gridEl.querySelectorAll('.dictation-cell')) : [];
    const confirmModal = document.getElementById('dictation-confirm');
    const confirmStartBtn = document.getElementById('confirm-start-btn');
    const cancelStartBtn = document.getElementById('cancel-start-btn');

    let csrf = document.body.dataset.csrfToken || '';
    let words = [];
    let currentIndex = -1;
    let currentWord = null;
    let submitted = false;
    let voice = null;
    let startInProgress = false;

    const dataUrl = '/dictation/words.json';

    if (startBtn) {
        startBtn.addEventListener('click', startDictation);
    }
    if (playBtn) {
        playBtn.addEventListener('click', () => speakCurrent(true));
    }
    if (submitBtn) {
        submitBtn.addEventListener('click', submitAnswer);
    }
    if (confirmStartBtn) {
        confirmStartBtn.addEventListener('click', confirmStart);
    }
    if (cancelStartBtn) {
        cancelStartBtn.addEventListener('click', () => toggleConfirm(false));
    }
    cells.forEach((cell, index) => {
        cell.addEventListener('input', () => handleCellInput(index));
        cell.addEventListener('keydown', (event) => handleCellKeydown(event, index));
    });

    if ('speechSynthesis' in window) {
        const updateVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            voice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('zh')) || null;
        };
        updateVoice();
        window.speechSynthesis.addEventListener('voiceschanged', updateVoice);
    }

    function setStatus(message, type = 'info') {
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message || '';
        if (type === 'error') {
            statusEl.style.color = '#ff7675';
        } else if (type === 'success') {
            statusEl.style.color = '#1de9b6';
        } else {
            statusEl.style.color = '#ffeb3b';
        }
    }

    async function refreshCsrf() {
        try {
            const resp = await fetch('/dictation', { credentials: 'same-origin' });
            const html = await resp.text();
            const match = html.match(/data-csrf-token="([^"]+)"/);
            if (match && match[1]) {
                csrf = match[1];
            }
        } catch (error) {
            console.error('CSRF refresh failed:', error);
        }
    }

    async function safeFetch(url, options = {}) {
        const resp = await fetch(url, options);
        if (resp.status === 401 || resp.status === 403) {
            await refreshCsrf();
        }
        return resp;
    }

    async function loadWords() {
        const resp = await fetch(dataUrl, { cache: 'no-store' });
        if (!resp.ok) {
            throw new Error('Failed to load dictation words');
        }
        const data = await resp.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('No dictation words found');
        }
        words = data.map((item, index) => ({
            id: String(item.id || index + 1),
            word: typeof item.word === 'string' ? item.word.trim() : '',
            pronunciation: typeof item.pronunciation === 'string' ? item.pronunciation.trim() : '',
            definition: typeof item.definition === 'string' ? item.definition.trim() : ''
        }));
    }

    function toggleConfirm(show) {
        if (!confirmModal) {
            return;
        }
        confirmModal.hidden = !show;
    }

    function startDictation() {
        toggleConfirm(true);
    }

    async function confirmStart() {
        if (startInProgress) {
            return;
        }
        startInProgress = true;
        if (confirmStartBtn) {
            confirmStartBtn.disabled = true;
        }
        toggleConfirm(false);
        try {
            const response = await safeFetch('/api/dictation/start', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({})
            });
            const data = await response.json();
            if (!data.success) {
                setStatus(t('开始失败：', 'Start failed: ') + translateServerMessage(data.message), 'error');
                toggleConfirm(true);
                return;
            }
            await startRound();
        } catch (error) {
            console.error('Dictation start error:', error);
            setStatus(t('网络错误，请稍后重试', 'Network error, please try again.'), 'error');
            toggleConfirm(true);
        } finally {
            startInProgress = false;
            if (confirmStartBtn) {
                confirmStartBtn.disabled = false;
            }
        }
    }

    async function startRound() {
        try {
            if (!words.length) {
                await loadWords();
            }
            currentIndex = Math.floor(Math.random() * words.length);
            updateWord();
            setStatus(t('已开始听写，请输入答案并提交', 'Dictation started. Please enter your answer.'));
        } catch (error) {
            console.error('Load dictation words error:', error);
            setStatus(t('加载听写词语失败，请检查词库文件', 'Failed to load dictation words.'), 'error');
        }
    }

    function updateWord() {
        if (!words.length || currentIndex < 0 || currentIndex >= words.length) {
            return;
        }
        currentWord = words[currentIndex];
        submitted = false;
        clearCells();
        setInputsDisabled(false);
        updateProgress();
        updateControls();
        speakCurrent(false);
    }

    function updateProgress() {
        if (!progressEl || !words.length) {
            return;
        }
        progressEl.textContent = t('本次听写', 'Current dictation');
    }

    function updateControls() {
        const active = currentWord !== null;
        if (playBtn) {
            playBtn.disabled = !active;
        }
        if (submitBtn) {
            submitBtn.disabled = !active || submitted;
        }
    }

    function setInputsDisabled(disabled) {
        cells.forEach((cell) => {
            cell.disabled = disabled;
        });
    }

    function clearCells() {
        cells.forEach((cell) => {
            cell.value = '';
        });
        if (cells[0]) {
            cells[0].focus();
        }
    }

    function handleCellInput(index) {
        const cell = cells[index];
        if (!cell) {
            return;
        }
        const value = cell.value.trim();
        if (value.length > 1) {
            cell.value = value.charAt(0);
        }
        if (value && cells[index + 1]) {
            cells[index + 1].focus();
        }
    }

    function handleCellKeydown(event, index) {
        if (event.key === 'Backspace' && !cells[index].value && cells[index - 1]) {
            cells[index - 1].focus();
        }
        if (event.key === 'Enter') {
            event.preventDefault();
            submitAnswer();
        }
    }

    function collectInput() {
        return cells.map((cell) => cell.value.trim()).join('').trim();
    }

    function speakCurrent(force = false) {
        if (!currentWord) {
            return;
        }
        if (!('speechSynthesis' in window)) {
            setStatus(t('当前浏览器不支持语音朗读', 'Speech synthesis not supported.'), 'error');
            return;
        }
        const textParts = [];
        if (currentWord.word) {
            textParts.push(currentWord.word);
        } else if (currentWord.pronunciation) {
            textParts.push(currentWord.pronunciation);
        }
        if (currentWord.definition) {
            textParts.push(currentWord.definition);
        }
        const text = textParts.join('。');
        if (!text) {
            setStatus(t('当前词条没有读音信息', 'No pronunciation available.'), 'error');
            return;
        }
        if (force) {
            window.speechSynthesis.cancel();
        }
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        if (voice) {
            utterance.voice = voice;
        }
        utterance.onstart = () => setStatus(t('正在朗读...', 'Speaking...'));
        utterance.onend = () => setStatus('');
        utterance.onerror = () => setStatus(t('朗读失败，请重试', 'Speech failed, please retry.'), 'error');
        window.speechSynthesis.speak(utterance);
    }

    async function submitAnswer() {
        if (!currentWord || submitted) {
            return;
        }
        const input = collectInput();
        if (!input) {
            setStatus(t('请先输入听写内容', 'Please enter your answer.'), 'error');
            return;
        }

        submitBtn.disabled = true;
        setStatus(t('提交中...', 'Submitting...'));

        try {
            const response = await safeFetch('/api/dictation/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf
                },
                body: JSON.stringify({
                    wordId: currentWord.id,
                    word: currentWord.word,
                    pronunciation: currentWord.pronunciation,
                    definition: currentWord.definition,
                    input
                })
            });

            const data = await response.json();
            if (!data.success) {
                submitBtn.disabled = false;
                setStatus(t('提交失败：', 'Submit failed: ') + translateServerMessage(data.message), 'error');
                return;
            }

            submitted = true;
            hasActiveRound = false;
            setStatus(t('提交成功，等待人工审核', 'Submitted successfully, waiting for review.'), 'success');
            setInputsDisabled(true);
            updateControls();
        } catch (error) {
            console.error('Dictation submit error:', error);
            submitBtn.disabled = false;
            setStatus(t('网络错误，请稍后重试', 'Network error, please try again.'), 'error');
        }
    }
})();
