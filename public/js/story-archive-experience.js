'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.body.dataset.lang === 'zh' ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const stage = document.getElementById('story-stage');
    const axes = document.getElementById('story-axes');
    const unlocks = document.getElementById('story-unlocks');
    const message = document.getElementById('story-message');
    const bootstrap = JSON.parse(document.getElementById('story-bootstrap')?.textContent || '{}');
    const history = [];
    let lastSignature = '';

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function installNavigation() {
        const shellRoot = document.querySelector('.story-shell');
        const progress = document.querySelector('.story-progress');
        if (!shellRoot || !progress || document.getElementById('story-access-tabs')) return;
        const section = create('section', 'story-access-panel');
        section.id = 'story-access-tabs';
        const heading = create('h2', '', t('故事导航', 'Story navigation'));
        const tabs = create('div', 'creator-tablist');
        tabs.setAttribute('role', 'tablist');
        tabs.setAttribute('aria-label', t('故事信息面板', 'Story information panels'));
        const panel = create('div', 'creator-tabpanel');
        panel.id = 'story-access-panel';
        panel.setAttribute('role', 'tabpanel');
        const definitions = [
            ['timeline', t('时间线', 'Timeline')],
            ['memory', t('记忆与解锁', 'Memories and unlocks')],
            ['recovery', t('恢复说明', 'Recovery help')]
        ];

        function select(id) {
            for (const button of tabs.querySelectorAll('[data-story-tab]')) {
                const selected = button.dataset.storyTab === id;
                button.setAttribute('aria-selected', String(selected));
                button.tabIndex = selected ? 0 : -1;
            }
            panel.replaceChildren();
            panel.setAttribute('aria-labelledby', `story-tab-${id}`);
            if (id === 'timeline') renderTimeline(panel);
            if (id === 'memory') renderMemory(panel);
            if (id === 'recovery') renderRecovery(panel);
        }

        definitions.forEach(([id, label], index) => {
            const button = create('button', 'creator-tab', label);
            button.type = 'button';
            button.id = `story-tab-${id}`;
            button.dataset.storyTab = id;
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', panel.id);
            button.setAttribute('aria-selected', String(index === 0));
            button.tabIndex = index === 0 ? 0 : -1;
            button.addEventListener('click', () => select(id));
            button.addEventListener('keydown', event => {
                const current = definitions.findIndex(([key]) => key === id);
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                let target = current;
                if (event.key === 'ArrowLeft') target = (current + definitions.length - 1) % definitions.length;
                if (event.key === 'ArrowRight') target = (current + 1) % definitions.length;
                if (event.key === 'Home') target = 0;
                if (event.key === 'End') target = definitions.length - 1;
                select(definitions[target][0]);
                document.getElementById(`story-tab-${definitions[target][0]}`)?.focus();
            });
            tabs.append(button);
        });
        section.append(heading, tabs, panel);
        progress.after(section);
        select('timeline');
    }

    function renderTimeline(target) {
        if (!history.length) {
            target.append(shell.createStatePanel('empty', t('尚无本页时间线', 'No page timeline yet'),
                t('开始一季或推进节点后，这里会记录不含隐藏效果的可见摘要。',
                    'Start a season or advance a node to record visible summaries without hidden effects.')));
            return;
        }
        const list = create('ol', 'story-safe-timeline');
        for (const entry of history.slice(0, 30)) {
            const item = create('li', 'story-safe-timeline-entry');
            const time = document.createElement('time');
            time.dateTime = entry.at;
            time.textContent = new Date(entry.at).toLocaleTimeString();
            const copy = create('span', '', entry.summary);
            item.append(time, copy);
            list.append(item);
        }
        target.append(list);
    }

    function renderMemory(target) {
        const title = create('h3', '', t('持久后果投影', 'Persistent consequence projection'));
        const explanation = create('p', '', t(
            '这里只复述页面已经公开的关系轴和解锁键；未触发记忆、隐藏条件与结局评分不会提前出现。',
            'This repeats only already revealed axes and unlock keys; dormant memories, hidden conditions, and ending scores remain private.'
        ));
        const axisCopy = axes?.cloneNode(true) || create('p', '', t('尚无关系轴。', 'No relationship axes yet.'));
        const unlockCopy = unlocks?.cloneNode(true) || create('ul');
        axisCopy.removeAttribute?.('id');
        unlockCopy.removeAttribute?.('id');
        target.append(title, explanation, axisCopy, unlockCopy);
    }

    function renderRecovery(target) {
        const title = create('h3', '', navigator.onLine === false ? t('离线保护中', 'Offline protection active') : t('可恢复命令', 'Recoverable commands'));
        const list = create('ol', 'story-recovery-steps');
        const steps = [
            t('选择预览不会改变 run、revision、flag 或事件。', 'Choice preview changes no run, revision, flag, or event.'),
            t('确认后同一命令身份可安全重放；不同语义使用相同身份会失败关闭。',
                'After confirmation the same command identity replays safely; changed semantics with that identity fail closed.'),
            t('409 表示页面修订过期；重新加载权威节点后再选择。', 'A 409 means the page revision is stale; reload the authoritative node before choosing.'),
            t('检查点恢复会回退普通 flag 与轴，但已获记忆、解锁和首次通关保持单调。',
                'Checkpoint recovery reconciles ordinary flags and axes while earned memories, unlocks, and first clears remain monotonic.')
        ];
        for (const step of steps) list.append(create('li', '', step));
        target.append(title, list);
    }

    function observeStage() {
        if (!stage) return;
        new MutationObserver(() => {
            const heading = stage.querySelector('h2')?.textContent.trim() || '';
            const prose = stage.querySelector('p')?.textContent.trim() || '';
            const signature = `${heading}\u0000${prose}`;
            if (!prose || signature === lastSignature) return;
            lastSignature = signature;
            history.unshift({
                at: new Date().toISOString(),
                summary: heading ? `${heading} · ${prose}` : prose
            });
            if (history.length > 50) history.length = 50;
            const selected = document.querySelector('[data-story-tab][aria-selected="true"]')?.dataset.storyTab;
            if (selected === 'timeline') renderSelectedTimeline();
            shell.announce(t('故事节点已更新。', 'Story node updated.'), 'success');
        }).observe(stage, { childList: true, subtree: true, characterData: true });
        const initialHeading = stage.querySelector('h2')?.textContent.trim() || '';
        const initialProse = stage.querySelector('p')?.textContent.trim() || '';
        if (initialProse) {
            lastSignature = `${initialHeading}\u0000${initialProse}`;
            history.push({ at: new Date().toISOString(), summary: initialHeading ? `${initialHeading} · ${initialProse}` : initialProse });
        }
    }

    function renderSelectedTimeline() {
        const target = document.getElementById('story-access-panel');
        if (!target) return;
        target.replaceChildren();
        renderTimeline(target);
    }

    function guardOffline() {
        stage?.addEventListener('click', event => {
            const button = event.target.closest('button[data-action]');
            if (!button || navigator.onLine !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            shell.announce(t('当前离线，故事没有改变。恢复连接后可继续同一节点。',
                'You are offline; the story did not change. Continue the same node after reconnect.'), 'error');
        }, true);
    }

    observeStage();
    installNavigation();
    guardOffline();
    if (message) new MutationObserver(() => {
        if (message.textContent.trim()) shell.announce(message.textContent.trim());
    }).observe(message, { childList: true, subtree: true, characterData: true });
    window.StoryArchiveExperience = Object.freeze({ history: () => history.slice(), bootstrap });
})();
