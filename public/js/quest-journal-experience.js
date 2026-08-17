'use strict';
(() => {
    const shell = window.CreatorShell;
    const explorer = window.CreatorExplorer;
    const language = document.body.dataset.lang === 'zh' ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const activePanel = document.getElementById('quest-active-panel');
    const boardPanel = document.getElementById('quest-board-panel');
    const chainPanel = document.getElementById('quest-chain-panel');
    const message = document.getElementById('quest-message');
    const controllers = [];

    function addStatusSummary() {
        if (!activePanel) return;
        const cards = Array.from(activePanel.querySelectorAll('[data-assignment-id]'));
        const summary = document.createElement('dl');
        summary.className = 'creator-summary-strip';
        const values = new Map();
        for (const card of cards) {
            const status = card.textContent.match(/\b(offered|accepted|active|submitted|under_review|returned)\b/)?.[1] || 'active';
            card.dataset.assignmentStatus = status;
            values.set(status, (values.get(status) || 0) + 1);
        }
        for (const [status, count] of values) {
            const term = document.createElement('dt');
            const value = document.createElement('dd');
            term.textContent = status.replace('_', ' ');
            value.textContent = String(count);
            summary.append(term, value);
        }
        if (!cards.length) {
            const term = document.createElement('dt');
            const value = document.createElement('dd');
            term.textContent = t('进行中', 'Active');
            value.textContent = '0';
            summary.append(term, value);
        }
        activePanel.querySelector('h2')?.after(summary);
    }

    function mountExplorers() {
        if (!explorer) return;
        controllers.push(explorer.mount({
            id: 'active-quests',
            root: '#quest-active-panel',
            collection: '.quest-grid',
            item: '.quest-card',
            pageSize: 8,
            label: t('进行中任务筛选', 'Active quest filters'),
            searchPlaceholder: t('搜索任务、类别或步骤', 'Search quest, category, or step'),
            filters: [{
                key: 'status',
                label: t('状态', 'Status'),
                field: 'data.assignmentStatus',
                options: [
                    { value: 'offered', label: t('待决定', 'Offered') },
                    { value: 'active', label: t('进行中', 'Active') },
                    { value: 'submitted', label: t('已提交', 'Submitted') },
                    { value: 'under_review', label: t('审核中', 'Under review') },
                    { value: 'returned', label: t('已退回', 'Returned') }
                ]
            }],
            sorts: [
                { key: 'title', label: t('标题', 'Title'), field: 'h3' },
                { key: 'status', label: t('状态', 'Status'), field: 'data.assignmentStatus' }
            ]
        }));
        controllers.push(explorer.mount({
            id: 'weekly-board',
            root: '#quest-board-panel',
            collection: '.quest-grid',
            item: '.quest-card',
            pageSize: 12,
            label: t('每周任务筛选', 'Weekly quest filters'),
            searchPlaceholder: t('搜索本周任务', 'Search weekly quests'),
            filters: [{
                key: 'verification',
                label: t('验证方式', 'Verification'),
                field: 'data.kind',
                options: [
                    { value: 'trusted_event', label: t('可信事件', 'Trusted event') },
                    { value: 'evidence_review', label: t('证据审核', 'Evidence review') },
                    { value: 'hybrid', label: t('混合', 'Hybrid') }
                ]
            }],
            sorts: [
                { key: 'title', label: t('标题', 'Title'), field: 'h3' },
                { key: 'points-low', label: t('积分从低到高', 'Points: low to high'), field: 'data.points', numeric: true },
                { key: 'points-high', label: t('积分从高到低', 'Points: high to low'), field: 'data.points', numeric: true, direction: 'desc' }
            ]
        }));
        controllers.push(explorer.mount({
            id: 'quest-chains',
            root: '#quest-chain-panel',
            collection: '.quest-grid',
            item: '.quest-card',
            pageSize: 10,
            label: t('任务链筛选', 'Quest chain filters'),
            searchPlaceholder: t('搜索任务链或节点', 'Search chain or node'),
            filters: [{
                key: 'chain-status',
                label: t('领取状态', 'Claim status'),
                field: 'data.chainStatus',
                options: [
                    { value: 'available', label: t('可领取', 'Available') },
                    { value: 'active', label: t('进行中', 'Active') },
                    { value: 'completed', label: t('已完成', 'Completed') }
                ]
            }],
            sorts: [
                { key: 'sequence', label: t('链顺序', 'Chain sequence'), field: 'data.chainNumber', numeric: true },
                { key: 'title', label: t('标题', 'Title'), field: 'h3' }
            ]
        }));
    }

    function enhanceEvidenceForms() {
        for (const form of document.querySelectorAll('.evidence-form')) {
            const input = form.querySelector('input[type=file],textarea');
            const counter = document.createElement('small');
            counter.className = 'creator-input-counter';
            counter.setAttribute('aria-live', 'polite');
            input?.insertAdjacentElement('afterend', counter);
            const update = () => {
                if (input instanceof HTMLTextAreaElement) {
                    counter.textContent = t(`${input.value.length}/2000 字`, `${input.value.length}/2000 characters`);
                    return;
                }
                const file = input?.files?.[0];
                if (!file) {
                    counter.textContent = t('尚未选择文件', 'No file selected');
                    return;
                }
                counter.textContent = t(
                    `${file.name} · ${Math.ceil(file.size / 1024)} KB`,
                    `${file.name} · ${Math.ceil(file.size / 1024)} KB`
                );
                if (file.type !== 'image/png' || file.size > 768 * 1024) counter.dataset.invalid = 'true';
                else delete counter.dataset.invalid;
            };
            input?.addEventListener('input', update);
            input?.addEventListener('change', update);
            update();
        }
    }

    function announceMutations() {
        document.addEventListener('click', event => {
            const action = event.target.closest('[data-action]')?.dataset.action;
            if (!action) return;
            const labels = {
                accept: t('正在接受任务。', 'Accepting quest.'),
                decline: t('正在保存无惩罚退出。', 'Saving penalty-free decline.'),
                postpone: t('正在延后任务。', 'Postponing quest.'),
                claim: t('正在加入任务日志。', 'Adding quest to journal.'),
                submit: t('正在提交审核。', 'Submitting for review.')
            };
            if (labels[action]) shell.announce(labels[action]);
        });
        const observer = new MutationObserver(() => {
            if (!message?.textContent.trim()) return;
            shell.announce(message.textContent.trim(), message.textContent.includes('失败') ? 'error' : 'status');
        });
        if (message) observer.observe(message, { childList: true, characterData: true, subtree: true });
    }

    function guardOfflineMutation() {
        document.addEventListener('click', event => {
            const button = event.target.closest('button[data-action]');
            if (!button || navigator.onLine !== false) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            shell.announce(t('当前离线，任务状态未改变。恢复连接后再试。',
                'You are offline; quest state was not changed. Retry after reconnect.'), 'error');
        }, true);
    }

    addStatusSummary();
    mountExplorers();
    enhanceEvidenceForms();
    announceMutations();
    guardOfflineMutation();
    window.QuestJournalExperience = Object.freeze({ controllers });
})();
