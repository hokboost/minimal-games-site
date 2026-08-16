(() => {
    const root = document.body;
    const cardSection = document.getElementById('task-card-section');
    const cardList = document.getElementById('task-card-list');
    const cardStatus = document.getElementById('task-card-status');
    const guidance = document.getElementById('task-card-guidance');
    const eventSection = document.getElementById('event-task-section');
    const eventList = document.getElementById('event-task-list');
    const questSection = document.getElementById('quest-section');
    const questList = document.getElementById('quest-list');
    const message = document.getElementById('task-card-message');
    if (!cardSection || !cardList || !eventSection || !eventList) return;

    const zh = document.documentElement.lang.startsWith('zh');
    const t = (cn, en) => (zh ? cn : en);
    const csrfToken = root.dataset.csrfToken || '';
    let state = null;
    let busy = false;

    function decodeInitialState() {
        try {
            return root.dataset.taskState
                ? JSON.parse(decodeURIComponent(root.dataset.taskState))
                : null;
        } catch {
            return null;
        }
    }

    function countdown(dueAt) {
        const milliseconds = new Date(dueAt).getTime() - Date.now();
        if (!Number.isFinite(milliseconds) || milliseconds <= 0) return t('已到期', 'Expired');
        const totalMinutes = Math.ceil(milliseconds / 60000);
        const days = Math.floor(totalMinutes / 1440);
        const hours = Math.floor((totalMinutes % 1440) / 60);
        const minutes = totalMinutes % 60;
        return zh ? `${days}天 ${hours}小时 ${minutes}分` : `${days}d ${hours}h ${minutes}m`;
    }

    function button(label, className, action, assignmentId, disabled = false) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = className;
        element.textContent = label;
        element.disabled = busy || disabled;
        element.dataset.taskAction = action;
        element.dataset.assignmentId = String(assignmentId);
        return element;
    }

    function renderCards() {
        const cards = Array.isArray(state?.cards) ? state.cards : [];
        cardSection.hidden = !state?.featureEnabled;
        if (!state?.featureEnabled) {
            cardList.replaceChildren();
            return;
        }
        const active = cards.find((card) => card.status === 'claimed' || card.status === 'pending_approval');
        cardStatus.textContent = active?.status === 'pending_approval'
            ? t('等待管理员确认', 'Awaiting admin approval')
            : active
                ? t('任务进行中', 'Task in progress')
                : t('可以领取一张', 'Choose one card');
        guidance.textContent = active
            ? t('另外两张会为你保留，但要先完成或放弃当前任务。', 'The other two cards are saved for you until the current task is approved or abandoned.')
            : t('挑一张最想完成的任务吧。', 'Pick the task you most want to complete.');

        const nodes = cards.map((card) => {
            const article = document.createElement('article');
            article.className = `task-card task-card--${card.status}`;
            const top = document.createElement('div');
            top.className = 'task-card-top';
            const badge = document.createElement('span');
            badge.className = 'task-reward';
            badge.textContent = `+${card.rewardPoints.toLocaleString()} ${t('积分', 'points')}`;
            const status = document.createElement('span');
            status.className = 'task-card-state';
            status.textContent = card.status === 'offered'
                ? t('候选', 'Available')
                : card.status === 'claimed'
                    ? t('进行中', 'Active')
                    : t('待审核', 'Pending');
            top.append(badge, status);
            const title = document.createElement('h3');
            title.textContent = card.title;
            article.append(top, title);

            if (card.status === 'claimed') {
                const timer = document.createElement('p');
                timer.className = 'task-countdown';
                timer.dataset.dueAt = card.dueAt;
                timer.textContent = `${t('剩余', 'Time left')}: ${countdown(card.dueAt)}`;
                const actions = document.createElement('div');
                actions.className = 'task-card-actions';
                actions.append(
                    button(card.completeLabel, 'task-action task-action--complete', 'complete', card.id),
                    button(card.progressLabel, 'task-action task-action--almost', 'almost', card.id, Number(card.progressExtensions) >= 1),
                    button(card.abandonLabel, 'task-action task-action--abandon', 'abandon', card.id)
                );
                article.append(timer, actions);
            } else if (card.status === 'pending_approval') {
                const pending = document.createElement('p');
                pending.className = 'task-pending-copy';
                pending.textContent = t('已经提交啦！管理员确认后奖励会自动到账。', 'Submitted! The reward will arrive automatically after admin approval.');
                article.append(pending);
            } else {
                article.append(button(
                    t('就选这张！', 'Claim this card'),
                    'task-action task-action--claim',
                    'claim',
                    card.id,
                    !state.canClaim
                ));
            }
            return article;
        });
        cardList.replaceChildren(...nodes);
    }

    function renderEvents() {
        const events = Array.isArray(state?.eventTasks) ? state.eventTasks : [];
        eventSection.hidden = events.length === 0;
        const nodes = events.map((task) => {
            const article = document.createElement('article');
            article.className = 'event-task-banner';
            const copy = document.createElement('div');
            const eyebrow = document.createElement('span');
            eyebrow.className = 'eyebrow';
            eyebrow.textContent = t('限时活动任务', 'Limited-time event');
            const title = document.createElement('h3');
            title.textContent = task.title;
            const description = document.createElement('p');
            description.textContent = task.description;
            const timer = document.createElement('strong');
            timer.className = 'task-countdown';
            timer.dataset.dueAt = task.dueAt;
            timer.textContent = `${t('剩余', 'Time left')}: ${countdown(task.dueAt)}`;
            copy.append(eyebrow, title, description, timer);
            const side = document.createElement('div');
            side.className = 'event-task-side';
            const reward = document.createElement('span');
            reward.className = 'task-reward';
            reward.textContent = `+${task.rewardPoints.toLocaleString()} ${t('积分', 'points')}`;
            side.append(reward);
            if (task.status === 'active') {
                side.append(button(t('我完成啦！', 'I finished it!'), 'task-action task-action--complete', 'event-complete', task.id));
            } else {
                const pending = document.createElement('span');
                pending.className = 'task-status-pill';
                pending.textContent = t('等待管理员确认', 'Awaiting approval');
                side.append(pending);
            }
            article.append(copy, side);
            return article;
        });
        eventList.replaceChildren(...nodes);
    }

    function renderQuests() {
        if (!questSection || !questList) return;
        const quests = Array.isArray(state?.quests) ? state.quests : [];
        questSection.hidden = quests.length === 0;
        const nodes = quests.map((quest) => {
            const article = document.createElement('article');
            article.className = `quest-card quest-card--${quest.status}`;
            const heading = document.createElement('div');
            heading.className = 'task-card-top';
            const title = document.createElement('h3');
            title.textContent = quest.title;
            const reward = document.createElement('span');
            reward.className = 'task-reward';
            reward.textContent = `+${quest.rewardPoints.toLocaleString()} ${t('积分', 'points')}`;
            heading.append(title, reward);
            const description = document.createElement('p');
            description.textContent = quest.description;
            const progress = document.createElement('progress');
            progress.className = 'quest-progress';
            progress.max = quest.target;
            progress.value = quest.progress;
            progress.setAttribute('aria-label', t('任务进度', 'Quest progress'));
            const detail = document.createElement('div');
            detail.className = 'quest-progress-detail';
            const count = document.createElement('strong');
            count.textContent = `${quest.progress} / ${quest.target}`;
            const verification = document.createElement('span');
            verification.textContent = quest.status === 'completed'
                ? t('已自动验证，奖励已到账', 'Verified automatically — reward posted')
                : t('通关后自动记录，无需手动提交', 'Recorded after each clear — no submission needed');
            detail.append(count, verification);
            article.append(heading, description, progress, detail);
            return article;
        });
        questList.replaceChildren(...nodes);
    }

    function render() {
        renderQuests();
        renderCards();
        renderEvents();
    }

    async function load() {
        const response = await fetch('/api/tasks/state', { headers: { Accept: 'application/json' } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || t('任务卡加载失败', 'Could not load task cards'));
        state = data;
        render();
    }

    async function post(url, body) {
        if (busy) return;
        busy = true;
        message.textContent = '';
        render();
        try {
            if (typeof window.idempotentFetch !== 'function') throw new Error(t('请求组件未加载', 'Request helper did not load'));
            const response = await window.idempotentFetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(body)
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.success) throw new Error(data.message || t('操作失败', 'Action failed'));
            state = data.state;
            message.textContent = data.encouragement || data.message || t('操作成功啦！', 'Done!');
        } catch (error) {
            message.textContent = String(error.message || error);
        } finally {
            busy = false;
            render();
        }
    }

    cardSection.addEventListener('click', (event) => {
        const target = event.target.closest('[data-task-action]');
        if (!target || target.disabled) return;
        const assignmentId = Number(target.dataset.assignmentId);
        const action = target.dataset.taskAction;
        if (action === 'claim') return post('/api/tasks/claim', { assignmentId });
        return post('/api/tasks/action', { assignmentId, action });
    });
    eventSection.addEventListener('click', (event) => {
        const target = event.target.closest('[data-task-action="event-complete"]');
        if (!target || target.disabled) return;
        return post('/api/tasks/event-complete', { assignmentId: Number(target.dataset.assignmentId) });
    });

    state = decodeInitialState();
    if (state) render();
    else load().catch((error) => { message.textContent = String(error.message || error); });
    setInterval(() => {
        document.querySelectorAll('[data-due-at]').forEach((element) => {
            element.textContent = `${t('剩余', 'Time left')}: ${countdown(element.dataset.dueAt)}`;
        });
    }, 60000);
})();
