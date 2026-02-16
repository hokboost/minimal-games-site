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
    const clearGridBtn = document.getElementById('clear-grid-btn');
    const eraserBtn = document.getElementById('eraser-btn');
    const zoomModal = document.getElementById('dictation-zoom');
    const zoomCanvas = document.getElementById('dictation-zoom-canvas');
    const zoomCloseBtn = document.getElementById('zoom-close-btn');
    const zoomSaveBtn = document.getElementById('zoom-save-btn');
    const zoomClearBtn = document.getElementById('zoom-clear-btn');
    const zoomEraserBtn = document.getElementById('zoom-eraser-btn');

    let csrf = document.body.dataset.csrfToken || '';
    let words = [];
    let currentIndex = -1;
    let currentWord = null;
    let currentLevel = 1;
    let submitted = false;
    let voice = null;
    let startInProgress = false;
    const drawState = new Map();
    let isEraser = false;
    let activeCellIndex = null;
    let zoomState = null;

    const dataUrl = '/api/dictation/words';

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
    if (clearGridBtn) {
        clearGridBtn.addEventListener('click', clearCells);
    }
    if (eraserBtn) {
        eraserBtn.addEventListener('click', () => toggleEraser());
    }
    if (zoomCloseBtn) {
        zoomCloseBtn.addEventListener('click', () => closeZoom(false));
    }
    if (zoomSaveBtn) {
        zoomSaveBtn.addEventListener('click', () => closeZoom(true));
    }
    if (zoomClearBtn) {
        zoomClearBtn.addEventListener('click', () => clearZoomCanvas());
    }
    if (zoomEraserBtn) {
        zoomEraserBtn.addEventListener('click', () => toggleEraser(true));
    }
    if (zoomModal) {
        zoomModal.hidden = true;
        zoomModal.style.display = 'none';
    }
    cells.forEach((cell, index) => {
        setupCanvas(cell, index);
    });

    if ('speechSynthesis' in window) {
        const updateVoice = () => {
            const voices = window.speechSynthesis.getVoices();
            const zhVoices = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('zh'));
            voice = zhVoices.find((v) => v.lang.toLowerCase().includes('zh-cn'))
                || zhVoices.find((v) => /mandarin|chinese|putonghua/i.test(v.name))
                || zhVoices[0]
                || null;
        };
        updateVoice();
        window.speechSynthesis.addEventListener('voiceschanged', updateVoice);
    }

    let reviewTimer = null;

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
        const payload = await resp.json();
        const data = Array.isArray(payload) ? payload : payload.words;
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
        confirmModal.style.display = show ? 'flex' : 'none';
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
            await startRound(Number(data.level) || 1);
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

    async function startRound(level) {
        try {
            if (!words.length) {
                await loadWords();
            }
            currentLevel = Math.min(Math.max(level, 1), 5);
            const picked = pickWordByLevel(currentLevel);
            if (!picked) {
                throw new Error('No dictation word found for level');
            }
            currentWord = picked.word;
            currentIndex = picked.index;
            updateWord();
            setStatus(t('已开始听写，请输入答案并提交', 'Dictation started. Please enter your answer.'));
        } catch (error) {
            console.error('Load dictation words error:', error);
            setStatus(t('加载听写词语失败，请检查词库文件', 'Failed to load dictation words.'), 'error');
        }
    }

    function pickWordByLevel(level) {
        if (!words.length) {
            return null;
        }
        const index = level - 1;
        if (words[index]) {
            return { word: words[index], index };
        }
        const fallbackIndex = Math.floor(Math.random() * words.length);
        return { word: words[fallbackIndex], index: fallbackIndex };
    }

    function updateWord() {
        if (!currentWord) {
            return;
        }
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
        progressEl.textContent = t(`第 ${currentLevel} 关 / 5`, `Level ${currentLevel} / 5`);
    }

    function updateControls() {
        const active = currentWord !== null;
        if (playBtn) {
            playBtn.disabled = !active;
        }
        if (submitBtn) {
            submitBtn.disabled = !active || submitted;
        }
        if (clearGridBtn) {
            clearGridBtn.disabled = !active || submitted;
        }
        if (eraserBtn) {
            eraserBtn.disabled = !active || submitted;
        }
    }

    function setInputsDisabled(disabled) {
        if (gridEl) {
            gridEl.classList.toggle('dictation-grid-disabled', disabled);
        }
    }

    function clearCells() {
        cells.forEach((cell) => {
            const ctx = cell.getContext('2d');
            const { width, height } = cell;
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(0, 0, 0, 0)';
            ctx.fillRect(0, 0, width, height);
            const prev = drawState.get(cell);
            const ratio = prev?.ratio || window.devicePixelRatio || 1;
            drawState.set(cell, { drawing: false, hasInk: false, lastX: 0, lastY: 0, moved: false, justDrew: false, ratio });
        });
    }

    function setupCanvas(canvas, index) {
        const resize = () => {
            const ratio = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.floor(rect.width * ratio));
            canvas.height = Math.max(1, Math.floor(rect.height * ratio));
            const ctx = canvas.getContext('2d');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 6 * ratio;
            ctx.strokeStyle = '#ffffff';
            drawState.set(canvas, { drawing: false, hasInk: false, lastX: 0, lastY: 0, moved: false, justDrew: false, ratio });
        };
        resize();
        window.addEventListener('resize', resize);
        canvas.style.touchAction = 'none';

        const pointerDown = (event) => {
            event.preventDefault();
            const state = drawState.get(canvas);
            if (!state) return;
            state.moved = false;
            const { x, y } = getCanvasPoint(canvas, event);
            state.drawing = true;
            state.lastX = x;
            state.lastY = y;
            if (event.pointerId !== undefined) {
                canvas.setPointerCapture(event.pointerId);
            }
            const ctx = canvas.getContext('2d');
            applyBrush(ctx, state.ratio);
            ctx.beginPath();
            ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : '#ffffff';
            if (isEraser) {
                ctx.globalCompositeOperation = 'destination-out';
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.fill();
            state.hasInk = true;
        };
        const pointerMove = (event) => {
            const state = drawState.get(canvas);
            if (!state || !state.drawing) return;
            event.preventDefault();
            const ctx = canvas.getContext('2d');
            applyBrush(ctx, state.ratio);
            const { x, y } = getCanvasPoint(canvas, event);
            ctx.beginPath();
            ctx.moveTo(state.lastX, state.lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
            state.lastX = x;
            state.lastY = y;
            state.hasInk = true;
            state.moved = true;
        };
        const pointerUp = (event) => {
            const state = drawState.get(canvas);
            if (!state) return;
            event.preventDefault();
            state.drawing = false;
            state.justDrew = state.moved;
            if (event.pointerId !== undefined) {
                canvas.releasePointerCapture(event.pointerId);
            }
            if (!state.moved && !submitted && currentWord) {
                openZoom(index);
            }
        };

        canvas.addEventListener('pointerdown', pointerDown);
        canvas.addEventListener('pointermove', pointerMove);
        canvas.addEventListener('pointerup', pointerUp);
        canvas.addEventListener('pointerleave', pointerUp);
        canvas.addEventListener('pointercancel', pointerUp);
        canvas.addEventListener('click', () => {
            // no-op: zoom is triggered by tap (pointerup) to avoid auto-open on draw.
        });
    }

    function setupZoomCanvas() {
        if (!zoomCanvas) {
            return;
        }
        const resize = () => {
            const ratio = window.devicePixelRatio || 1;
            const rect = zoomCanvas.getBoundingClientRect();
            zoomCanvas.width = Math.max(1, Math.floor(rect.width * ratio));
            zoomCanvas.height = Math.max(1, Math.floor(rect.height * ratio));
            const ctx = zoomCanvas.getContext('2d');
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 8 * ratio;
            ctx.strokeStyle = '#ffffff';
            zoomState = { drawing: false, hasInk: false, lastX: 0, lastY: 0, ratio };
        };
        resize();
        window.addEventListener('resize', resize);
        zoomCanvas.style.touchAction = 'none';

        const pointerDown = (event) => {
            event.preventDefault();
            if (!zoomState) return;
            const { x, y } = getCanvasPoint(zoomCanvas, event);
            zoomState.drawing = true;
            zoomState.lastX = x;
            zoomState.lastY = y;
            if (event.pointerId !== undefined) {
                zoomCanvas.setPointerCapture(event.pointerId);
            }
            const ctx = zoomCanvas.getContext('2d');
            applyBrush(ctx, zoomState.ratio, true);
            ctx.beginPath();
            ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fillStyle = isEraser ? 'rgba(0,0,0,1)' : '#ffffff';
            if (isEraser) {
                ctx.globalCompositeOperation = 'destination-out';
            } else {
                ctx.globalCompositeOperation = 'source-over';
            }
            ctx.fill();
            zoomState.hasInk = true;
        };
        const pointerMove = (event) => {
            if (!zoomState || !zoomState.drawing) return;
            event.preventDefault();
            const ctx = zoomCanvas.getContext('2d');
            applyBrush(ctx, zoomState.ratio, true);
            const { x, y } = getCanvasPoint(zoomCanvas, event);
            ctx.beginPath();
            ctx.moveTo(zoomState.lastX, zoomState.lastY);
            ctx.lineTo(x, y);
            ctx.stroke();
            zoomState.lastX = x;
            zoomState.lastY = y;
            zoomState.hasInk = true;
        };
        const pointerUp = (event) => {
            if (!zoomState) return;
            event.preventDefault();
            zoomState.drawing = false;
            if (event.pointerId !== undefined) {
                zoomCanvas.releasePointerCapture(event.pointerId);
            }
        };

        zoomCanvas.addEventListener('pointerdown', pointerDown);
        zoomCanvas.addEventListener('pointermove', pointerMove);
        zoomCanvas.addEventListener('pointerup', pointerUp);
        zoomCanvas.addEventListener('pointerleave', pointerUp);
        zoomCanvas.addEventListener('pointercancel', pointerUp);
    }

    function openZoom(index) {
        if (!zoomModal || !zoomCanvas) {
            return;
        }
        activeCellIndex = index;
        zoomModal.hidden = false;
        zoomModal.style.display = 'flex';
        requestAnimationFrame(() => {
            setupZoomCanvas();
            const cell = cells[index];
            const ctx = zoomCanvas.getContext('2d');
            ctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
            if (cell) {
                ctx.drawImage(cell, 0, 0, zoomCanvas.width, zoomCanvas.height);
            }
        });
    }

    function closeZoom(save) {
        if (!zoomModal || !zoomCanvas) {
            return;
        }
        if (save && activeCellIndex !== null) {
            const cell = cells[activeCellIndex];
            if (cell) {
                const ctx = cell.getContext('2d');
                ctx.clearRect(0, 0, cell.width, cell.height);
                ctx.drawImage(zoomCanvas, 0, 0, cell.width, cell.height);
                const state = drawState.get(cell);
                if (state) {
                    state.hasInk = true;
                }
            }
        }
        zoomModal.hidden = true;
        zoomModal.style.display = 'none';
        activeCellIndex = null;
    }

    function clearZoomCanvas() {
        if (!zoomCanvas) {
            return;
        }
        const ctx = zoomCanvas.getContext('2d');
        ctx.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);
    }

    function toggleEraser(fromZoom = false) {
        isEraser = !isEraser;
        if (eraserBtn) {
            eraserBtn.classList.toggle('active', isEraser);
            eraserBtn.textContent = isEraser ? t('画笔', 'Pen') : t('橡皮擦', 'Eraser');
        }
        if (zoomEraserBtn || fromZoom) {
            if (zoomEraserBtn) {
                zoomEraserBtn.classList.toggle('active', isEraser);
                zoomEraserBtn.textContent = isEraser ? t('画笔', 'Pen') : t('橡皮擦', 'Eraser');
            }
        }
    }

    function applyBrush(ctx, ratio, isZoom = false) {
        if (isEraser) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0, 0, 0, 1)';
            ctx.lineWidth = (isZoom ? 20 : 16) * ratio;
        } else {
            ctx.globalCompositeOperation = 'source-over';
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = (isZoom ? 10 : 6) * ratio;
        }
    }

    function getCanvasPoint(canvas, event) {
        const rect = canvas.getBoundingClientRect();
        const ratioX = canvas.width / rect.width;
        const ratioY = canvas.height / rect.height;
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        return {
            x: (clientX - rect.left) * ratioX,
            y: (clientY - rect.top) * ratioY
        };
    }

    function hasAnyInk() {
        return cells.some((cell) => {
            const state = drawState.get(cell);
            return state && state.hasInk;
        });
    }

    function buildCompositeImage() {
        const ratio = window.devicePixelRatio || 1;
        const cellWidth = cells[0]?.width || 200;
        const cellHeight = cells[0]?.height || 200;
        const gap = Math.floor(12 * ratio);
        const cols = 2;
        const rows = 2;
        const width = cols * cellWidth + (cols - 1) * gap;
        const height = rows * cellHeight + (rows - 1) * gap;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        cells.forEach((cell, idx) => {
            const row = Math.floor(idx / cols);
            const col = idx % cols;
            const x = col * (cellWidth + gap);
            const y = row * (cellHeight + gap);
            ctx.drawImage(cell, x, y);
        });
        return canvas.toDataURL('image/png');
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
        utterance.rate = 0.85;
        utterance.pitch = 1;
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
        if (!hasAnyInk()) {
            setStatus(t('请先手写内容', 'Please write your answer.'), 'error');
            return;
        }
        const imageData = buildCompositeImage();

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
                    input: '',
                    imageData
                })
            });

            const data = await response.json();
            if (!data.success) {
                submitBtn.disabled = false;
                setStatus(t('提交失败：', 'Submit failed: ') + translateServerMessage(data.message), 'error');
                return;
            }

            submitted = true;
            setStatus(t('提交成功，等待人工审核', 'Submitted successfully, waiting for review.'), 'success');
            setInputsDisabled(true);
            updateControls();
            startReviewPolling();
        } catch (error) {
            console.error('Dictation submit error:', error);
            submitBtn.disabled = false;
            setStatus(t('网络错误，请稍后重试', 'Network error, please try again.'), 'error');
        }
    }

    function startReviewPolling() {
        stopReviewPolling();
        reviewTimer = setInterval(checkReviewStatus, 4000);
    }

    function stopReviewPolling() {
        if (reviewTimer) {
            clearInterval(reviewTimer);
            reviewTimer = null;
        }
    }

    async function checkReviewStatus() {
        try {
            const resp = await safeFetch('/api/dictation/latest-status', { cache: 'no-store' });
            const data = await resp.json();
            if (!data.success || !data.status) {
                return;
            }
            if (data.status === 'correct') {
                stopReviewPolling();
                setStatus(t('审核通过，进入下一关', 'Approved. Moving to next level.'), 'success');
                await autoAdvance();
            } else if (data.status === 'wrong') {
                stopReviewPolling();
                currentWord = null;
                submitted = false;
                setInputsDisabled(true);
                updateControls();
                setStatus(t('审核未通过，已回到第一关，请重新开始', 'Incorrect. Back to level 1, please start again.'), 'error');
            } else if (data.status === 'rewrite') {
                stopReviewPolling();
                setStatus(t('请重新书写本关', 'Please rewrite this level.'), 'error');
                await retryLevel();
            }
        } catch (error) {
            console.error('Review status error:', error);
        }
    }

    async function autoAdvance() {
        const resp = await safeFetch('/api/dictation/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            body: JSON.stringify({})
        });
        const data = await resp.json();
        if (!data.success) {
            setStatus(t('开始失败：', 'Start failed: ') + translateServerMessage(data.message), 'error');
            return;
        }
        await startRound(Number(data.level) || 1);
    }

    async function retryLevel() {
        const resp = await safeFetch('/api/dictation/retry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrf
            },
            body: JSON.stringify({})
        });
        const data = await resp.json();
        if (!data.success) {
            setStatus(t('开始失败：', 'Start failed: ') + translateServerMessage(data.message), 'error');
            return;
        }
        await startRound(Number(data.level) || 1);
    }
})();
