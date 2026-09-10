(() => {
    'use strict';
    const $ = id => document.getElementById(id);
    if (!$('doorbell-app')) return;
    let state = JSON.parse($('doorbell-state').textContent);
    let busy = false;
    let pending = null;
    const storageKey = 'minimal-games:doorbell:pending';
    const audio = $('game-audio');
    const fmt = value => Number(value).toLocaleString('zh-CN');
    const csrf = document.querySelector('meta[name="csrf-token"]').content;
    const terminal = run => run && ['failed', 'won', 'cashed_out'].includes(run.status);
    const uuid = () => crypto.randomUUID();
    try { pending = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); } catch { /* private browsing */ }

    function savePending(value) {
        pending = value;
        try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* Commands also persist on the server. */ }
    }
    function message(text, retry = false, refresh = false) {
        $('notice').textContent = text;
        $('retry').hidden = !retry;
        $('refresh').hidden = !refresh;
    }
    function stopAudio() { audio.pause(); }
    async function play(url, label = '演唱副歌') {
        if (!url) return;
        // Keep the same audio element so browsers can retain the user's playback permission.
        document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); });
        audio.src = url;
        audio.currentTime = 0;
        $('audio-player').hidden = false;
        $('audio-status').textContent = `正在播放${label}`;
        try { await audio.play(); }
        catch { message('浏览器暂停了自动播放，请点击播放器或“重播副歌”。'); }
    }
    audio.addEventListener('error', () => message('音频未加载成功，请点击播放按钮重试；本轮进度已保留。'));
    audio.addEventListener('ended', () => { $('audio-status').textContent = '播放完毕，可以重播'; });

    function render() {
        const run = state.run;
        const playing = run?.status === 'playing';
        const revealed = run?.status === 'revealed';
        $('pot').textContent = fmt(run?.pot || 0);
        $('account-balance').textContent = fmt(state.balance);
        const headerBalance = document.querySelector('.balance-chip strong');
        if (headerBalance) headerBalance.textContent = fmt(state.balance);
        $('stage-label').textContent = !run ? '准备登场' : terminal(run) ? `本轮结束 · 成功 ${run.completed} 扇门` : `第 ${run.door} 扇门 / 8`;
        $('doors').replaceChildren();
        state.prizes.forEach((amount, i) => {
            const result = run?.results.find(item => item.door === i + 1);
            const li = document.createElement('li');
            li.className = `doorbell-door${result?.correct ? ' is-open' : result ? ' is-failed' : playing && run.door === i + 1 ? ' is-current' : ''}`;
            li.setAttribute('aria-label', `第 ${i + 1} 扇门，${amount} 电币${result ? result.correct ? '，已打开' : '，未打开' : ''}`);
            if (playing && run.door === i + 1) li.setAttribute('aria-current', 'step');
            const n = document.createElement('span'); n.className = 'doorbell-door-number'; n.textContent = String(i + 1).padStart(2, '0');
            const face = document.createElement('div'); face.className = 'doorbell-door-face'; face.textContent = result?.correct ? '♫' : result ? '×' : '♪';
            const reward = document.createElement('strong'); reward.textContent = fmt(amount);
            const unit = document.createElement('small'); unit.textContent = result?.correct ? '已打开' : result ? '未打开' : '电币';
            li.append(n, face, reward, unit); $('doors').append(li);
        });
        $('welcome').hidden = Boolean(run);
        $('question').hidden = !playing;
        $('result').hidden = !run || playing;
        $('cashout').hidden = !run || terminal(run);
        $('cashout').textContent = run?.pot ? `收下 ${fmt(run.pot)} 电币，结束本轮` : '结束本轮（尚未获得电币）';
        if (playing) {
            $('help-original').disabled = busy || Boolean(pending) || run.help.originalUsed;
            $('help-hint').disabled = busy || Boolean(pending) || run.help.hintUsed;
            $('help-original').querySelector('small').textContent = run.help.originalUsed ? '本轮已用' : '本轮 1 次';
            $('help-hint').querySelector('small').textContent = run.help.hintUsed ? '本轮已用' : '本轮 1 次';
            $('replay-help').hidden = !run.current.originalUrl;
            $('hint').hidden = !run.current.hint;
            $('hint').replaceChildren();
            if (run.current.hint) {
                const hint = run.current.hint;
                const label = document.createElement('span'); label.textContent = `歌名共 ${hint.length} 个字：`;
                $('hint').append(label);
                for (let i = 0; i < hint.length; i++) {
                    const cell = document.createElement('b'); cell.textContent = i === hint.index ? hint.character : '＿'; $('hint').append(cell);
                }
            }
        }
        if (run && !playing) {
            const last = run.results.at(-1);
            $('result-badge').textContent = revealed ? '开门成功' : run.status === 'won' ? '八门全开！' : run.status === 'failed' ? '这次没猜中，奖励依然留下' : '本轮已结算';
            $('result-title').textContent = last ? last.title : '下一次，再来听见好运';
            $('result-credit').textContent = last ? `${last.credit}：${last.artist}` : '';
            $('result-message').textContent = terminal(run) ? `成功通过 ${run.completed} 扇门，${fmt(run.settledAmount)} 电币已结算到账。` : `已锁定 ${fmt(run.pot)} 电币，下一扇门冲击 ${fmt(state.prizes[run.completed])} 电币。`;
            $('next').hidden = !revealed;
            $('restart').hidden = !terminal(run);
            $('replay-result').hidden = !last;
        }
        $('history').hidden = !run?.results.length;
        $('history-list').replaceChildren();
        (run?.results || []).forEach(item => {
            const row = document.createElement('div'); row.className = 'doorbell-history-item';
            const label = document.createElement('span'); label.textContent = `${String(item.door).padStart(2, '0')} · ${item.title}`;
            const artist = document.createElement('small'); artist.textContent = `${item.credit}：${item.artist}`;
            const replay = document.createElement('button'); replay.type = 'button'; replay.textContent = '▶ 副歌';
            replay.setAttribute('aria-label', `重播${item.title}副歌`);
            replay.addEventListener('click', () => play(item.originalUrl));
            row.append(label, artist, replay); $('history-list').append(row);
        });
        for (const id of ['start', 'restart', 'submit-answer', 'next', 'cashout']) $(id).disabled = busy || Boolean(pending);
        $('song-answer').disabled = busy || Boolean(pending);
    }

    async function request(path, body) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
                signal: controller.signal, headers: body ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {},
                ...(body ? { body: JSON.stringify(body) } : {}) });
            const result = await response.json();
            if (!response.ok || !result.success) {
                const error = new Error(result.message || '请求失败'); error.status = response.status; throw error;
            }
            return result;
        } finally { clearTimeout(timeout); }
    }

    async function execute(command) {
        if (busy) return;
        busy = true;
        savePending(command);
        message(''); stopAudio(); render();
        const answer = command.body.type === 'answer';
        let suspense;
        if (answer) {
            $('opening').hidden = false;
            $('opening').classList.remove('is-opening');
            void $('opening').offsetWidth;
            $('opening').classList.add('is-opening');
            suspense = new Promise(resolve => setTimeout(resolve, matchMedia('(prefers-reduced-motion: reduce)').matches ? 400 : 2400));
        }
        try {
            const result = await request(command.path, command.body);
            if (suspense) await suspense;
            state = result;
            savePending(null);
            if (answer || command.path.endsWith('/start') || command.body.type === 'next') $('song-answer').value = '';
            $('opening').hidden = true;
            busy = false; render();
            if (answer) {
                $('result-title').tabIndex = -1; $('result-title').focus();
                await play(state.run.results.at(-1).originalUrl);
            } else if (command.body.type === 'original') await play(state.run.current.originalUrl);
            else if (state.run?.status === 'playing' && (command.path.endsWith('/start') || command.body.type === 'next')) {
                $('song-answer').focus();
                await play(state.run.current.bellUrl, '门铃');
            }
        } catch (error) {
            if (suspense) await suspense;
            if (error.status && error.status < 500) {
                savePending(null);
                message(error.message, false, true);
            } else message('网络暂时没有返回结果。请重试刚才的操作，或刷新本轮进度；奖励不会重复发放。', true, true);
        } finally {
            busy = false; $('opening').hidden = true; render();
        }
    }
    function action(type, answer) {
        if (busy || pending || !state.run) return;
        execute({ path: '/api/doorbell/action', body: { commandId: uuid(), runId: state.run.id, revision: state.run.revision, type,
            ...(answer !== undefined ? { answer } : {}) } });
    }
    const start = () => { if (!busy && !pending) execute({ path: '/api/doorbell/start', body: { commandId: uuid() } }); };
    $('start').addEventListener('click', start);
    $('restart').addEventListener('click', start);
    $('play-bell').addEventListener('click', () => play(state.run.current.bellUrl, '门铃'));
    $('answer-form').addEventListener('submit', event => { event.preventDefault(); if ($('answer-form').reportValidity()) action('answer', $('song-answer').value); });
    $('help-original').addEventListener('click', () => action('original'));
    $('help-hint').addEventListener('click', () => action('hint'));
    $('next').addEventListener('click', () => action('next'));
    $('cashout').addEventListener('click', () => action('cashout'));
    $('replay-help').addEventListener('click', () => play(state.run.current.originalUrl));
    $('replay-result').addEventListener('click', () => play(state.run.results.at(-1)?.originalUrl));
    $('retry').addEventListener('click', () => { if (pending) execute(pending); });
    $('refresh').addEventListener('click', async () => {
        if (busy) return;
        busy = true; stopAudio(); render();
        try { state = await request('/api/doorbell/state'); savePending(null); message('已恢复服务器保存的进度。'); }
        catch (error) { message(error.message || '暂时无法刷新，请稍后重试', Boolean(pending), true); }
        finally { busy = false; render(); }
    });
    if (pending) message('有一次操作尚未确认结果，可以重试或刷新服务器保存的进度。', true, true);
    render();
})();
