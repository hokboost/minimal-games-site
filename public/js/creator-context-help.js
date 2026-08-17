'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const path = location.pathname;

    const common = Object.freeze({
        safety: {
            zh: '页面只显示当前账号有权查看的投影；服务器状态、审计与版本快照才是权威来源。',
            en: 'The page shows only the current account projection; server state, audit, and version snapshot are authoritative.'
        },
        recovery: {
            zh: '网络失败时先保留页面，不要重复点击。幂等命令可安全重试，409 需要重新读取最新修订。',
            en: 'After network failure keep the page open and avoid repeat clicks. Idempotent commands retry safely; a 409 requires the latest revision.'
        },
        keyboard: {
            zh: '使用 Tab 和 Shift+Tab 浏览控件，回车或空格确认。按 Escape 关闭本帮助。',
            en: 'Use Tab and Shift+Tab to navigate, then Enter or Space to confirm. Press Escape to close this help.'
        }
    });

    const contexts = Object.freeze([
        {
            match: value => /^\/creator\/?$/.test(value),
            title: { zh: '主播世界首页帮助', en: 'Creator World home help' },
            purpose: {
                zh: '查看关系里程碑、共享记忆和持久收件箱。关系进度与积分、礼物资格相互独立。',
                en: 'Review relationship milestones, shared memories, and durable inbox. Relationship progress is separate from points and gift eligibility.'
            },
            actions: [
                { zh: '搜索、筛选、分页查看记忆与消息。', en: 'Search, filter, and paginate memories and messages.' },
                { zh: '置顶、归档或隐藏只改变你的投影，不删除来源历史。', en: 'Pin, archive, or hide changes your projection without deleting provenance.' },
                { zh: '数据导出只包含当前用户范围内的资料。', en: 'Data export includes only records scoped to the current user.' }
            ]
        },
        {
            match: value => value === '/creator/profile',
            title: { zh: '互动偏好帮助', en: 'Interaction preferences help' },
            purpose: {
                zh: '设置资料、硬边界、安静时间和偏好互动窗口；所有边界都可撤回。',
                en: 'Set profile, hard boundaries, quiet hours, and preferred windows; every boundary is reversible.'
            },
            actions: [
                { zh: '“屏蔽”是硬边界，后续任务和邀请不能越过。', en: 'Block is a hard boundary future quests and invitations cannot cross.' },
                { zh: '安静时间优先于偏好互动窗口，跨午夜时间也受支持。', en: 'Quiet hours override preferred windows and may cross midnight.' },
                { zh: '房间申请不会直接绑定，仍需原管理流程核验。', en: 'A room request never binds directly and still requires the original admin verification.' }
            ]
        },
        {
            match: value => value === '/quests',
            title: { zh: '任务日志帮助', en: 'Quest Journal help' },
            purpose: {
                zh: '自愿领取任务、提交有界证据，并跟踪可信事件或人工审核进度。',
                en: 'Opt into quests, submit bounded evidence, and track trusted-event or manual-review progress.'
            },
            actions: [
                { zh: '拒绝、延后或退出不扣关系进度，也不影响礼物资格。', en: 'Decline, postpone, or leave without relationship or gift-eligibility penalty.' },
                { zh: '浏览器证据从不直接发放积分。', en: 'Browser evidence never awards points directly.' },
                { zh: 'PNG 最大 768KB；过期后会保留哈希墓碑而清除原内容。', en: 'PNG is capped at 768KB; retention expiry keeps a hash tombstone while clearing original content.' }
            ]
        },
        {
            match: value => value === '/story',
            title: { zh: '分支故事帮助', en: 'Branching Story help' },
            purpose: {
                zh: '跨五季推进持久选择、关系轴、共享记忆与路线结论。旧版 run 始终绑定自己的内容快照。',
                en: 'Advance persistent choices, relationship axes, memories, and conclusions across five seasons. Old runs stay bound to their content snapshots.'
            },
            actions: [
                { zh: '先预览手写结果，再明确确认；预览不写入任何状态。', en: 'Preview the authored outcome, then explicitly confirm; preview writes no state.' },
                { zh: '恢复检查点不会撤销已得记忆、解锁或首次通关。', en: 'Checkpoint recovery never revokes earned memories, unlocks, or first clears.' },
                { zh: '重玩不重复发放任务、成就或有价值奖励。', en: 'Replay does not repeat quests, achievements, or valuable rewards.' }
            ]
        },
        {
            match: value => value === '/live-room',
            title: { zh: '实时联络帮助', en: 'Live Relay help' },
            purpose: {
                zh: '通过持久序号、确认与补拉阅读结构化邀请；实时连接只是通知层。',
                en: 'Read structured invitations through durable sequence, acknowledgement, and catch-up; realtime is notification only.'
            },
            actions: [
                { zh: '拒绝、静音、离开或举报不会扣关系进度。', en: 'Decline, mute, leave, or report without relationship penalty.' },
                { zh: '安静时间仍可阅读收件箱，但不会触发 presence push。', en: 'Quiet hours keep inbox readable without presence push.' },
                { zh: '举报关闭房间；审核完成后仍需主播主动重新同意。', en: 'A report closes the room; creator reconsent is still required after moderation.' }
            ]
        },
        {
            match: value => value === '/creator-rewards',
            title: { zh: '奖励与收藏帮助', en: 'Rewards and collection help' },
            purpose: {
                zh: '查看预算受限的奖励目录、订单、收藏与背包权益。兑换与礼物发送是两个独立动作。',
                en: 'Review budgeted catalog, orders, collection, and backpack entitlements. Redemption and gift sending are separate actions.'
            },
            actions: [
                { zh: '需要审批的订单在批准时重新检查库存、预算、冷却与余额。', en: 'Approval rechecks stock, budget, cooldown, and balance.' },
                { zh: '领取礼物权益只进入现有背包，不自动跨越发送边界。', en: 'Claimed gift entitlement enters the existing backpack without crossing the send boundary.' },
                { zh: 'uncertain 状态不会自动补发或退款。', en: 'An uncertain state is never automatically resent or refunded.' }
            ]
        },
        {
            match: value => value === '/creator-achievements',
            title: { zh: '成就与赛季归档帮助', en: 'Achievements and season archive help' },
            purpose: {
                zh: '浏览可信事件推进的成就、永久收藏与内容版本绑定的赛季归档。',
                en: 'Browse achievements driven by trusted events, permanent collection, and content-version-bound season archives.'
            },
            actions: [
                { zh: '隐藏成就在解锁前不显示名称、条件或进度。', en: 'Hidden achievements reveal no name, condition, or progress before unlock.' },
                { zh: '相同来源事件只推进一次，语义碰撞会失败关闭。', en: 'The same source event advances once; semantic collision fails closed.' },
                { zh: '已经获得的收藏不会因赛季归档、退休或功能关闭而撤销。', en: 'Earned collection is not revoked by archive, retirement, or feature disablement.' }
            ]
        },
        {
            match: value => /^\/(constellation-repair|signal-duet|mystery-board|story-weaver|studio-crafting|meteor-defense|dream-maze|broadcast-bingo|echo-memory|keeper-prediction)$/.test(value),
            title: { zh: '主播协作玩法帮助', en: 'Streamer game help' },
            purpose: {
                zh: '运行版本化纯规则玩法；数据库快照权威，协作实时事件只提示重新读取。',
                en: 'Play versioned pure-rule games; the database snapshot is authoritative and co-op realtime events only request a refresh.'
            },
            actions: [
                { zh: '页面右侧包含该玩法专属步骤、隐藏信息边界、历史和恢复页。', en: 'The side panel contains game-specific steps, hidden-state boundary, history, and recovery.' },
                { zh: '手机控件保持至少 44px，键盘行为仅使用帮助中列出的按键。', en: 'Mobile controls remain at least 44px and keyboard behavior uses only documented keys.' },
                { zh: '新玩法只写安全 hook intent，不直接调用余额或礼物发送。', en: 'New games write safe hook intents and never call balance or gift delivery directly.' }
            ]
        },
        {
            match: value => value === '/admin/quest-studio',
            title: { zh: '任务工作室帮助', en: 'Quest Studio help' },
            purpose: {
                zh: '创建受限草稿、审核证据并发布不可变任务版本。',
                en: 'Create constrained drafts, review evidence, and publish immutable quest versions.'
            },
            actions: [
                { zh: '自动规则只能选择注册可信事件和关闭 AST。', en: 'Automatic rules select only registered trusted events and the closed AST.' },
                { zh: '证据摘要经过转义；原始 PNG 字节从不渲染到管理表。', en: 'Evidence summaries are escaped; raw PNG bytes never render in the admin table.' },
                { zh: '批准、积分总账、任务结算、事件和审计在同一事务。', en: 'Approval, points ledger, settlement, event, and audit share one transaction.' }
            ]
        },
        {
            match: value => value === '/admin/creator-director',
            title: { zh: '主播互动导演台帮助', en: 'Creator Director help' },
            purpose: {
                zh: '保留基础主播摘要，同时为配置站主提供结构化互动与举报审核。',
                en: 'Preserve foundation creator summaries while giving the configured owner structured interactions and report review.'
            },
            actions: [
                { zh: '非配置站主管理员只能看到基础安全摘要，不能读取 owner-only 上下文。', en: 'Non-owner admins see only the foundation safe summary, never owner-only context.' },
                { zh: '模板、剧情节点、任务和游戏引用均由服务端 allowlist 验证。', en: 'Templates, story nodes, quest, and game references are server allowlisted.' },
                { zh: '所有发送先持久保存，再通过现有事件总线通知。', en: 'Every send persists first, then notifies through the existing event bus.' }
            ]
        }
    ]);

    function currentContext() {
        return contexts.find(context => context.match(path)) || {
            title: { zh: '主播世界帮助', en: 'Creator World help' },
            purpose: common.safety,
            actions: []
        };
    }

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function install() {
        if (document.getElementById('creator-context-help')) return;
        const context = currentContext();
        const button = create('button', 'creator-help-launcher', t('帮助', 'Help'));
        button.type = 'button';
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-keyshortcuts', 'Shift+?');
        const dialog = create('dialog', 'creator-help-dialog');
        dialog.id = 'creator-context-help';
        dialog.setAttribute('aria-labelledby', 'creator-context-help-title');
        const header = create('header', 'creator-help-header');
        const title = create('h2', '', language === 'zh' ? context.title.zh : context.title.en);
        title.id = 'creator-context-help-title';
        const close = create('button', 'creator-help-close', t('关闭', 'Close'));
        close.type = 'button';
        header.append(title, close);
        const purpose = create('p', 'creator-help-purpose', language === 'zh' ? context.purpose.zh : context.purpose.en);
        const heading = create('h3', '', t('在此页可以做什么', 'What you can do here'));
        const actions = create('ul', 'creator-help-actions');
        for (const action of context.actions) actions.append(create('li', '', language === 'zh' ? action.zh : action.en));
        const boundariesHeading = create('h3', '', t('安全与恢复', 'Safety and recovery'));
        const boundaries = create('ul', 'creator-help-actions');
        boundaries.append(
            create('li', '', language === 'zh' ? common.safety.zh : common.safety.en),
            create('li', '', language === 'zh' ? common.recovery.zh : common.recovery.en),
            create('li', '', language === 'zh' ? common.keyboard.zh : common.keyboard.en)
        );
        dialog.append(header, purpose, heading, actions, boundariesHeading, boundaries);
        document.body.append(button, dialog);

        function open() {
            if (typeof dialog.showModal === 'function') dialog.showModal();
            else dialog.setAttribute('open', '');
            shell.trapDialog(dialog);
            close.focus();
        }

        function closeDialog() {
            if (typeof dialog.close === 'function') dialog.close();
            else dialog.removeAttribute('open');
            button.focus();
        }
        button.addEventListener('click', open);
        close.addEventListener('click', closeDialog);
        document.addEventListener('keydown', event => {
            if (event.key === '?' && event.shiftKey) {
                event.preventDefault();
                open();
            }
        });
    }

    install();
    window.CreatorContextHelp = Object.freeze({ currentContext });
})();
