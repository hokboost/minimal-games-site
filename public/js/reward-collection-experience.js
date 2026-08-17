'use strict';
(() => {
    const shell = window.CreatorShell;
    const explorer = window.CreatorExplorer;
    const root = document.body;
    const language = root.dataset.lang === 'zh' ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const message = document.getElementById('reward-message');
    const controllers = [];

    function mountCatalog() {
        if (!explorer) return;
        controllers.push(explorer.mount({
            id: 'reward-catalog',
            root: '#reward-catalog-panel',
            collection: '.reward-grid',
            item: '.reward-card',
            pageSize: 9,
            searchPlaceholder: t('搜索奖励标题或说明', 'Search reward title or description'),
            filters: [
                {
                    key: 'kind',
                    label: t('奖励类型', 'Reward type'),
                    field: 'data.kind',
                    options: [
                        { value: 'points', label: t('积分权益', 'Points entitlement') },
                        { value: 'unlock', label: t('非货币解锁', 'Non-monetary unlock') },
                        { value: 'inventory', label: t('背包权益', 'Backpack entitlement') },
                        { value: 'collection', label: t('收藏品', 'Collection item') }
                    ]
                },
                {
                    key: 'eligibility',
                    label: t('可用状态', 'Availability'),
                    field: 'data.eligibility',
                    options: [
                        { value: 'eligible', label: t('现在可用', 'Available now') },
                        { value: 'locked', label: t('暂不可用', 'Currently locked') }
                    ]
                }
            ],
            sorts: [
                { key: 'title', label: t('标题', 'Title'), field: 'h3' },
                { key: 'price-low', label: t('所需积分从低到高', 'Price: low to high'), field: 'data.points', numeric: true },
                { key: 'price-high', label: t('所需积分从高到低', 'Price: high to low'), field: 'data.points', numeric: true, direction: 'desc' }
            ]
        }));
    }

    function mountOrders() {
        if (!explorer) return;
        const statuses = Array.from(document.querySelectorAll('#reward-order-panel [data-status]'))
            .map(card => card.dataset.status)
            .filter((status, index, list) => list.indexOf(status) === index)
            .map(status => ({ value: status, label: status.replaceAll('_', ' ') }));
        controllers.push(explorer.mount({
            id: 'reward-orders',
            root: '#reward-order-panel',
            collection: '#reward-orders',
            item: '.reward-card',
            pageSize: 10,
            searchPlaceholder: t('搜索订单标题或交付状态', 'Search order title or delivery status'),
            filters: [{
                key: 'status',
                label: t('订单状态', 'Order status'),
                field: 'data.status',
                options: statuses
            }],
            sorts: [
                { key: 'title', label: t('标题', 'Title'), field: 'h3' },
                { key: 'status', label: t('状态', 'Status'), field: 'data.status' }
            ],
            emptyTitle: t('没有匹配订单', 'No matching orders'),
            emptyBody: t('更改状态筛选；历史订单不会因赛季轮换消失。',
                'Change the status filter; historical orders never disappear with season rotation.')
        }));
    }

    function addBoundaryDisclosure() {
        const panel = document.getElementById('reward-order-panel');
        if (!panel) return;
        const disclosure = document.createElement('details');
        disclosure.className = 'creator-boundary-disclosure';
        const summary = document.createElement('summary');
        summary.textContent = t('了解背包与发送边界', 'Understand backpack and delivery boundaries');
        const list = document.createElement('ol');
        for (const line of [
            t('兑换成功只会创建订单或把权益放入已有背包。', 'A successful redemption creates an order or stores an entitlement in the existing backpack.'),
            t('背包里的“发送”是另一个明确动作，继续使用原有 outbox 与 worker。', 'Backpack “send” is a separate explicit action using the existing outbox and worker.'),
            t('交付状态为 uncertain 时不会自动补发、退款或再次扣款。', 'An uncertain delivery is never automatically resent, refunded, or charged again.'),
            t('页面不显示 provider 标识、原始回执或房间凭据。', 'The page exposes no provider identifier, raw receipt, or room credential.')
        ]) {
            const item = document.createElement('li');
            item.textContent = line;
            list.append(item);
        }
        disclosure.append(summary, list);
        panel.querySelector('h2')?.after(disclosure);
    }

    function guardActions() {
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-reward-action]');
            if (!button) return;
            if (navigator.onLine === false) {
                event.preventDefault();
                event.stopImmediatePropagation();
                shell.announce(t('当前离线，订单没有改变。请恢复连接后重试。',
                    'You are offline; the order was not changed. Retry after reconnect.'), 'error');
                return;
            }
            shell.announce(t('正在保存奖励命令，请勿重复点击。', 'Saving reward command; do not repeat the click.'));
        }, true);
        if (!message) return;
        new MutationObserver(() => {
            const value = message.textContent.trim();
            if (value) shell.announce(value, /失败|error|failed/i.test(value) ? 'error' : 'success');
        }).observe(message, { childList: true, characterData: true, subtree: true });
    }

    mountCatalog();
    mountOrders();
    addBoundaryDisclosure();
    guardActions();
    window.RewardCollectionExperience = Object.freeze({ controllers });
})();
