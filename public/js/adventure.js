(() => {
    'use strict';

    const body = document.body;
    const lang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const csrfToken = body.dataset.csrfToken || '';
    const decode = (value, fallback) => {
        try { return JSON.parse(decodeURIComponent(value || '')); } catch { return fallback; }
    };

    let state = decode(body.dataset.adventureState, { missions: [], completedChapterIds: [], active: null });
    let busy = false;
    let memorySelection = [];
    let memoryHidden = false;
    let memoryTimer = null;

    const elements = {
        board: document.getElementById('missionBoard'),
        cards: document.getElementById('missionCards'),
        active: document.getElementById('activeAdventure'),
        title: document.getElementById('active-chapter-title'),
        icon: document.getElementById('activeChapterIcon'),
        progress: document.getElementById('adventureProgressBar'),
        hearts: document.getElementById('heartCount'),
        energy: document.getElementById('energyCount'),
        insight: document.getElementById('insightCount'),
        count: document.getElementById('stageCount'),
        kind: document.getElementById('stageKind'),
        category: document.getElementById('stageCategory'),
        stageTitle: document.getElementById('stageTitle'),
        speaker: document.getElementById('stageSpeaker'),
        prompt: document.getElementById('stagePrompt'),
        controls: document.getElementById('stageControls'),
        feedback: document.getElementById('stageFeedback'),
        history: document.getElementById('adventureHistory'),
        inventory: document.getElementById('adventureInventory'),
        message: document.getElementById('adventureMessage'),
        abandon: document.getElementById('abandonAdventureBtn'),
        leaderboard: document.getElementById('leaderboardDialog'),
        leaderboardList: document.getElementById('leaderboardList')
    };

    const button = (label, className, onClick) => {
        const node = document.createElement('button');
        node.type = 'button';
        node.textContent = label;
        node.className = className || '';
        node.disabled = busy;
        node.addEventListener('click', onClick);
        return node;
    };

    function setBusy(value) {
        busy = value;
        document.querySelectorAll('.page-adventure button, .page-adventure input').forEach((control) => {
            control.disabled = value || control.dataset.unavailable === 'true';
        });
        body.classList.toggle('adventure-busy', value);
    }

    async function post(path, payload) {
        if (busy) return null;
        setBusy(true);
        elements.message.textContent = '';
        try {
            if (typeof window.idempotentFetch !== 'function') throw new Error(t('请求组件未加载', 'Request helper unavailable'));
            const response = await window.idempotentFetch(path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(payload)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) {
                if (data.state) state = data.state;
                throw new Error(data.message || t('操作失败，请重试', 'Action failed. Please try again.'));
            }
            state = data.state;
            if (data.rewardEarned > 0) {
                elements.message.textContent = t(
                    `章节首次通关，${data.rewardEarned} 积分已经到账！`,
                    `First clear complete. ${data.rewardEarned} points were awarded!`
                );
            } else if (data.completion) {
                elements.message.textContent = t('章节通关！本章的首次奖励已经领取过。', 'Chapter cleared! Its first-clear reward was already claimed.');
            } else if (data.resumed) {
                elements.message.textContent = t('已恢复上次进度。', 'Previous progress restored.');
            }
            memorySelection = [];
            render();
            return data;
        } catch (error) {
            elements.message.textContent = String(error.message || error);
            render();
            return null;
        } finally {
            setBusy(false);
        }
    }

    function renderMissions() {
        const complete = new Set(state.completedChapterIds || []);
        const activeId = state.active?.chapter?.id;
        const nodes = (state.missions || []).map((mission) => {
            const article = document.createElement('article');
            article.className = 'mission-card';
            article.style.setProperty('--mission-color', mission.color);
            if (mission.id === activeId) article.classList.add('is-active');
            if (complete.has(mission.id)) article.classList.add('is-complete');

            const top = document.createElement('div');
            top.className = 'mission-card-top';
            const icon = document.createElement('span');
            icon.className = 'mission-icon';
            icon.textContent = mission.icon;
            const badge = document.createElement('span');
            badge.className = 'mission-status';
            badge.textContent = mission.id === activeId
                ? t('进行中', 'Active')
                : (complete.has(mission.id) ? t('已通关', 'Cleared') : t(`难度 ${mission.difficulty}`, `Difficulty ${mission.difficulty}`));
            top.append(icon, badge);

            const title = document.createElement('h3');
            title.textContent = lang === 'zh' ? mission.titleZh : mission.titleEn;
            const summary = document.createElement('p');
            summary.textContent = lang === 'zh' ? mission.summaryZh : mission.summaryEn;
            const meta = document.createElement('div');
            meta.className = 'mission-meta';
            meta.append(
                document.createTextNode(t(`${mission.stageCount} 关`, `${mission.stageCount} stages`)),
                document.createTextNode(t(`首次 ${mission.reward} 积分`, `${mission.reward} first-clear points`))
            );

            let label = t('领取任务', 'Claim mission');
            if (mission.id === activeId) label = t('继续闯关', 'Continue');
            else if (complete.has(mission.id)) label = t('再次挑战', 'Replay');
            const claim = button(label, 'mission-claim', () => {
                if (mission.id === activeId) {
                    elements.active.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                }
                post('/api/adventure/start', { chapterId: mission.id });
            });
            if (activeId && mission.id !== activeId) {
                claim.disabled = true;
                claim.dataset.unavailable = 'true';
                claim.title = t('先完成或放弃当前章节', 'Complete or abandon the current chapter first');
            }
            article.append(top, title, summary, meta, claim);
            return article;
        });
        elements.cards.replaceChildren(...nodes);
    }

    const stageKindLabel = (kind) => ({
        narrative: t('剧情', 'Story'), quiz: t('知识问答', 'Trivia'), boss: t('首领挑战', 'Boss trial'),
        cipher: t('密码推理', 'Cipher'), memory: t('记忆机关', 'Memory'), choice: t('剧情选择', 'Story choice'),
        resource: t('资源策略', 'Resource strategy')
    }[kind] || kind);

    function actionPayload(action) {
        return {
            gameId: state.active.gameId,
            expectedRevision: state.active.revision,
            action
        };
    }

    function renderNarrative(stage) {
        elements.controls.append(button(t('继续前进', 'Continue'), 'stage-primary', () => (
            post('/api/adventure/action', actionPayload({ type: 'continue' }))
        )));
    }

    function renderQuiz(stage) {
        const grid = document.createElement('div');
        grid.className = 'stage-option-grid';
        stage.options.forEach((option, answer) => {
            const choice = button(option, 'stage-option', () => (
                post('/api/adventure/action', actionPayload({ type: 'answer', answer }))
            ));
            const mark = document.createElement('span');
            mark.textContent = String.fromCharCode(65 + answer);
            choice.prepend(mark);
            grid.append(choice);
        });
        elements.controls.append(grid);
    }

    function renderCipher(stage) {
        const form = document.createElement('form');
        form.className = 'cipher-form';
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 160;
        input.autocomplete = 'off';
        input.placeholder = t('输入密码', 'Enter code');
        input.setAttribute('aria-label', input.placeholder);
        const submit = button(t('解锁', 'Unlock'), 'stage-primary');
        submit.type = 'submit';
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!input.value.trim()) return input.focus();
            post('/api/adventure/action', actionPayload({ type: 'code', code: input.value }));
        });
        const hint = document.createElement('small');
        hint.textContent = `${t('提示', 'Hint')}：${stage.hint}`;
        form.append(input, submit, hint);
        elements.controls.append(form);
        input.focus();
    }

    function renderMemory(stage) {
        clearTimeout(memoryTimer);
        const preview = document.createElement('div');
        preview.className = 'memory-preview';
        const renderPreview = () => {
            preview.replaceChildren(...stage.preview.map((id, index) => {
                const tile = stage.tiles.find((entry) => entry.id === id);
                const node = document.createElement('span');
                node.textContent = `${index + 1}. ${tile?.label || id}`;
                return node;
            }));
            memoryHidden = false;
            memoryTimer = setTimeout(() => {
                memoryHidden = true;
                preview.replaceChildren(document.createTextNode(t('顺序已隐藏，请开始作答。', 'Sequence hidden. Rebuild it now.')));
            }, stage.previewSeconds * 1000);
        };
        renderPreview();
        const selected = document.createElement('p');
        selected.className = 'memory-selected';
        const tileGrid = document.createElement('div');
        tileGrid.className = 'memory-tiles';
        const update = () => {
            selected.textContent = memorySelection.length
                ? `${t('你的顺序', 'Your sequence')}：${memorySelection.map((id) => stage.tiles.find((tile) => tile.id === id)?.label || id).join(' → ')}`
                : t('灯光熄灭后，依次点击图块。', 'After the lights fade, select the tiles in order.');
        };
        stage.tiles.forEach((tile) => tileGrid.append(button(tile.label, 'memory-tile', () => {
            if (!memoryHidden) return;
            if (memorySelection.length < stage.preview.length) memorySelection.push(tile.id);
            update();
        })));
        const actions = document.createElement('div');
        actions.className = 'memory-actions';
        actions.append(
            button(t('重新观看', 'Replay'), 'adventure-ghost', () => { memorySelection = []; update(); renderPreview(); }),
            button(t('清空', 'Clear'), 'adventure-ghost', () => { memorySelection = []; update(); }),
            button(t('提交顺序', 'Submit'), 'stage-primary', () => {
                if (memorySelection.length !== stage.preview.length) {
                    elements.feedback.textContent = t('请先选满完整顺序。', 'Complete the full sequence first.');
                    return;
                }
                post('/api/adventure/action', actionPayload({ type: 'sequence', sequence: memorySelection }));
            })
        );
        update();
        elements.controls.append(preview, selected, tileGrid, actions);
    }

    function renderChoices(stage) {
        const list = document.createElement('div');
        list.className = 'choice-list';
        stage.choices.forEach((choice) => {
            const node = button(choice.label, 'story-choice', () => (
                post('/api/adventure/action', actionPayload({ type: 'choose', choiceId: choice.id }))
            ));
            if (choice.disabled) {
                node.disabled = true;
                node.dataset.unavailable = 'true';
            }
            const detail = document.createElement('small');
            detail.textContent = choice.requirement || t('选择会改变本次旅程', 'This choice shapes the current run');
            node.append(detail);
            list.append(node);
        });
        elements.controls.append(list);
    }

    function renderRun() {
        const run = state.active;
        elements.active.hidden = !run;
        elements.board.classList.toggle('has-active-run', Boolean(run));
        if (!run) return;
        const stage = run.stage;
        elements.title.textContent = lang === 'zh' ? run.chapter.titleZh : run.chapter.titleEn;
        elements.icon.textContent = run.chapter.icon;
        elements.progress.style.width = `${run.progress}%`;
        elements.hearts.textContent = `${run.hearts}/${run.maximumHearts}`;
        elements.energy.textContent = run.energy;
        elements.insight.textContent = run.insight;
        elements.count.textContent = `${Math.min(run.stageIndex + 1, run.chapter.stageCount)}/${run.chapter.stageCount}`;
        elements.kind.textContent = stageKindLabel(stage.kind);
        elements.category.textContent = stage.category || '';
        elements.stageTitle.textContent = stage.title;
        elements.speaker.textContent = stage.speaker || '';
        elements.speaker.hidden = !stage.speaker;
        elements.prompt.textContent = stage.text || stage.prompt || '';
        elements.controls.replaceChildren();
        elements.feedback.textContent = run.feedback?.text || '';
        elements.feedback.dataset.tone = run.feedback?.tone || '';
        memorySelection = [];
        if (stage.kind === 'narrative') renderNarrative(stage);
        else if (stage.kind === 'quiz' || stage.kind === 'boss') renderQuiz(stage);
        else if (stage.kind === 'cipher') renderCipher(stage);
        else if (stage.kind === 'memory') renderMemory(stage);
        else renderChoices(stage);

        const history = (run.history || []).slice().reverse().map((entry) => {
            const item = document.createElement('li');
            const strong = document.createElement('strong');
            strong.textContent = entry.stageId.replaceAll('-', ' ');
            const span = document.createElement('span');
            span.textContent = entry.detail;
            item.append(strong, span);
            return item;
        });
        elements.history.replaceChildren(...history);
        const inventory = run.inventory.length
            ? run.inventory.map((item) => {
                const chip = document.createElement('span');
                chip.textContent = item.replaceAll('-', ' ');
                return chip;
            })
            : [document.createTextNode(t('还没有收集品', 'No collected items yet'))];
        elements.inventory.replaceChildren(...inventory);
    }

    function render() {
        renderMissions();
        renderRun();
        setBusy(busy);
    }

    elements.abandon.addEventListener('click', () => {
        if (!state.active || busy) return;
        if (!window.confirm(t('确定放弃当前章节吗？本次进度会消失。', 'Abandon this chapter? This run will be lost.'))) return;
        post('/api/adventure/abandon', {
            gameId: state.active.gameId,
            expectedRevision: state.active.revision
        });
    });

    document.getElementById('leaderboardBtn').addEventListener('click', async () => {
        elements.leaderboardList.textContent = t('正在读取…', 'Loading…');
        elements.leaderboard.showModal();
        try {
            const response = await fetch('/api/adventure/leaderboard', { headers: { Accept: 'application/json' } });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || t('读取失败', 'Could not load'));
            const rows = data.players.map((player, index) => {
                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.append(
                    document.createTextNode(`#${index + 1}`),
                    document.createTextNode(player.username),
                    document.createTextNode(t(`${player.chapters} 章 · ${player.insight} 星光`, `${player.chapters} chapters · ${player.insight} insight`))
                );
                return row;
            });
            elements.leaderboardList.replaceChildren(...(rows.length ? rows : [document.createTextNode(t('还没有通关记录。', 'No clears yet.'))]));
        } catch (error) {
            elements.leaderboardList.textContent = String(error.message || error);
        }
    });
    document.getElementById('closeLeaderboardBtn').addEventListener('click', () => elements.leaderboard.close());

    render();
})();
