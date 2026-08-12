const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
const t = (zh, en) => (lang === 'zh' ? zh : en);
const translateServerMessage = window.translateServerMessage || ((message) => message);
const giftNameMap = {
    deepsea_singer: { zh: '梦幻游乐园', en: 'Dreamland Park' },
    sky_throne: { zh: '飞天转椅', en: 'Sky Throne' },
    proposal: { zh: '原地求婚', en: 'On-the-Spot Proposal' },
    wonderland: { zh: '梦游仙境', en: 'Wonderland Dream' },
    white_bride: { zh: '纯白花嫁', en: 'Pure White Bride' },
    crystal_ball: { zh: '水晶球', en: 'Crystal Ball' },
    bobo: { zh: '啵啵', en: 'Bubbles' }
};
const giftNameByZh = Object.fromEntries(
    Object.values(giftNameMap).map(({ zh, en }) => [zh, en])
);
const getWishGiftName = (giftType, giftName) => {
    if (lang === 'zh') {
        return giftName || giftNameMap[giftType]?.zh || giftType || '';
    }
    return giftNameMap[giftType]?.en || giftNameByZh[giftName] || giftName || giftType || '';
};
const formatScratchResult = (result) => {
    if (!result || lang === 'zh') {
        return result || '';
    }
    let formatted = result;
    formatted = formatted.replace('未中奖', 'No Win');
    formatted = formatted.replace('中奖', 'Win');
    formatted = formatted.replace('积分', 'points');
    return formatted;
};

    let toastTimer = null;

    function showToast(message, type = 'info') {
        const toast = document.getElementById('messageToast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.hidden = false;
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            toast.hidden = true;
            toastTimer = null;
        }, 3000);
    }

    document.querySelectorAll('.view-records-btn[data-records]').forEach((button) => {
        button.addEventListener('click', () => {
            viewGameRecords(button.dataset.records);
        });
    });

    const refreshBackpackBtn = document.getElementById('refresh-backpack');
    if (refreshBackpackBtn) {
        refreshBackpackBtn.addEventListener('click', () => {
            loadWishBackpack(true);
        });
    }

    const closeRecordsBtn = document.getElementById('close-records');
    if (closeRecordsBtn) {
        closeRecordsBtn.addEventListener('click', closeGameRecordsModal);
    }

    const openChangePasswordBtn = document.getElementById('open-change-password');
    if (openChangePasswordBtn) {
        openChangePasswordBtn.addEventListener('click', showChangePasswordModal);
    }

    const closeChangePasswordBtn = document.getElementById('close-change-password');
    if (closeChangePasswordBtn) {
        closeChangePasswordBtn.addEventListener('click', closeChangePasswordModal);
    }

    const cancelChangePasswordBtn = document.getElementById('cancel-change-password');
    if (cancelChangePasswordBtn) {
        cancelChangePasswordBtn.addEventListener('click', closeChangePasswordModal);
    }

    const exportDataBtn = document.getElementById('export-data');
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', exportData);
    }

    const recordsPaginationEl = document.getElementById('recordsPagination');
    if (recordsPaginationEl) {
        recordsPaginationEl.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-page]');
            if (!button) return;
            const page = Number(button.dataset.page);
            if (!Number.isFinite(page)) return;
            changePage(page);
        });
    }

    const backpackContentEl = document.getElementById('backpackContent');
    if (backpackContentEl) {
        backpackContentEl.addEventListener('click', (event) => {
            const button = event.target.closest('button[data-backpack-id]');
            if (!button) return;
            const id = Number(button.dataset.backpackId);
            if (!Number.isFinite(id)) return;
            sendBackpackItem(id);
        });
    }

    
    function showChangePasswordModal() {
        document.getElementById('changePasswordModal').hidden = false;
        document.getElementById('changePasswordForm').reset();
    }

    
    function closeChangePasswordModal() {
        document.getElementById('changePasswordModal').hidden = true;
    }

    
    document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            showToast(t('请填写所有字段', 'Please fill in all fields'), 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showToast(t('新密码和确认密码不匹配', 'Passwords do not match'), 'error');
            return;
        }
        
        if (newPassword.length < 12 || newPassword.length > 128 || !/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) {
            showToast(t('新密码须为12-128位，并同时包含字母和数字', 'Password must be 12-128 characters with letters and numbers'), 'error');
            return;
        }
        
        try {
            const response = await window.idempotentFetch('/api/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': profileCsrfToken
                },
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showToast(translateServerMessage(result.message), 'success');
                closeChangePasswordModal();
                document.getElementById('changePasswordForm').reset();
            } else {
                showToast(translateServerMessage(result.message), 'error');
            }
        } catch (error) {
            console.error(t('修改密码失败:', 'Failed to change password:'), error);
            showToast(t('网络错误，请稍后重试', 'Network error, please try again'), 'error');
        }
    });


    
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeChangePasswordModal();
            closeGameRecordsModal();
        }
    });

    function exportData() {
        showToast(t('数据导出功能开发中...', 'Data export is under development...'), 'info');
    }

    
    let currentGameType = null;
    let currentPage = 1;

    function viewGameRecords(gameType) {
        currentGameType = gameType;
        currentPage = 1;
        
        const titles = {
            quiz: t('知识问答记录', 'Quiz Records'),
            slot: t('老虎机记录', 'Slot Records'),
            scratch: t('刮刮乐记录', 'Scratch Records'),
            wish: t('祈愿记录', 'Wish Records'),
            blindbox: t('盲盒记录', 'Blind Box Records'),
            stone: t('合石头记录', 'Stone Match Records'),
            flip: t('翻卡牌记录', 'Card Flip Records'),
            duel: t('决斗挑战记录', 'Duel Records')
        };
        
        document.getElementById('recordsTitle').textContent = titles[gameType];
        document.getElementById('gameRecordsModal').hidden = false;
        
        loadGameRecords(gameType, currentPage);
    }

    function closeGameRecordsModal() {
        document.getElementById('gameRecordsModal').hidden = true;
    }

    function showContainerMessage(container, message) {
        const messageElement = document.createElement('div');
        messageElement.className = 'loading';
        messageElement.textContent = String(message || '');
        container.replaceChildren(messageElement);
    }

    function createRecordsTable(headers) {
        const table = document.createElement('table');
        table.className = 'records-table';
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        for (const header of headers) {
            const th = document.createElement('th');
            th.textContent = header;
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        const tbody = document.createElement('tbody');
        table.append(thead, tbody);
        return { table, tbody };
    }

    function appendRecordRow(tbody, values) {
        const row = document.createElement('tr');
        for (const value of values) {
            const cell = document.createElement('td');
            if (value instanceof Node) cell.appendChild(value);
            else cell.textContent = String(value ?? '');
            row.appendChild(cell);
        }
        tbody.appendChild(row);
    }

    async function loadGameRecords(gameType, page = 1) {
        const recordsContent = document.getElementById('recordsContent');
        const recordsPagination = document.getElementById('recordsPagination');
        
        showContainerMessage(recordsContent, t('加载中...', 'Loading...'));
        recordsPagination.replaceChildren();
        
        try {
            const response = await fetch(`/api/game-records/${gameType}?page=${page}&limit=10`);
            const data = await response.json();
            
            if (data.success) {
                renderGameRecords(data.records, gameType);
                renderPagination(data.pagination, gameType);
            } else {
                showContainerMessage(
                    recordsContent,
                    `${t('加载失败', 'Load failed')}: ${translateServerMessage(data.message) || ''}`
                );
            }
        } catch (error) {
            console.error(t('加载游戏记录失败:', 'Failed to load game records:'), error);
            showContainerMessage(recordsContent, t('网络错误，请稍后重试', 'Network error, please try again'));
        }
    }

    const backpackFailureCache = new Map();

    async function loadWishBackpack(showAlerts = false) {
        const container = document.getElementById('backpackContent');
        showContainerMessage(container, t('加载中...', 'Loading...'));
        
        try {
            const response = await fetch('/api/wish/backpack');
            const data = await response.json();
            
            if (!data.success) {
                showContainerMessage(
                    container,
                    `${t('加载失败', 'Load failed')}: ${translateServerMessage(data.message) || ''}`
                );
                return;
            }

            if (!data.items || data.items.length === 0) {
                showContainerMessage(container, t('背包暂无礼物', 'No gifts in backpack'));
                return;
            }

            const { table, tbody } = createRecordsTable([
                t('获得时间', 'Received'),
                t('礼物', 'Gift'),
                t('到期时间', 'Expires'),
                t('状态', 'Status'),
                t('操作', 'Action')
            ]);

            data.items.forEach(item => {
                if (showAlerts && item.last_failure_reason) {
                    const cachedReason = backpackFailureCache.get(item.id);
                    if (cachedReason !== item.last_failure_reason) {
                        const reason = item.last_failure_reason.toLowerCase();
                        if (reason.includes('余额') || reason.includes('balance') || reason.includes('insufficient')) {
                            showToast(t('B站账号余额不足，礼物送出失败。', 'Bilibili balance is insufficient. Gift failed to send.'), 'error');
                        } else {
                            showToast(t('送出失败：', 'Send failed: ') + item.last_failure_reason, 'error');
                        }
                        backpackFailureCache.set(item.id, item.last_failure_reason);
                    }
                }
                const createdAt = item.created_at || '';
                const expiresAt = item.expires_note || item.expires_at || '-';
                const statusText = formatBackpackStatus(item.status, item.expires_at, item.delivery_status);
                const canSend = item.status === 'stored';
                let action = '-';
                if (canSend && Number.isSafeInteger(Number(item.id))) {
                    const button = document.createElement('button');
                    button.className = 'view-records-btn';
                    button.dataset.backpackId = String(Number(item.id));
                    button.textContent = t('送出', 'Send');
                    action = button;
                }
                appendRecordRow(tbody, [
                    createdAt,
                    getWishGiftName(item.gift_type, item.gift_name),
                    expiresAt,
                    statusText,
                    action
                ]);
            });

            container.replaceChildren(table);
        } catch (error) {
            console.error(t('加载背包失败:', 'Failed to load backpack:'), error);
            showContainerMessage(container, t('网络错误，请稍后重试', 'Network error, please try again'));
        }
    }

    function formatBackpackStatus(status, expiresAt, deliveryStatus) {
        if (status === 'stored') {
            if (!expiresAt) {
                return t('待发送', 'Pending');
            }
            const now = new Date();
            const expireTime = new Date(expiresAt);
            if (expireTime <= now) {
                return t('到期自动送出中', 'Auto-sending');
            }
            return t('待发送', 'Pending');
        }
        if (status === 'queued' && deliveryStatus === 'uncertain') {
            return t('结果待确认', 'Awaiting confirmation');
        }
        if (status === 'queued') return t('发送中', 'Sending');
        if (status === 'sent') return t('已发送', 'Sent');
        if (status === 'failed') return t('发送失败', 'Failed');
        if (status === 'expired') return t('已过期', 'Expired');
        return status;
    }

    const profileCsrfToken = document.body.dataset.csrfToken || '';

    async function sendBackpackItem(id) {
        try {
            const response = await window.idempotentFetch('/api/wish/backpack/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': profileCsrfToken
                },
                body: JSON.stringify({ inventoryId: id })
            });

            const result = await response.json();
            if (result.success) {
                showToast(t('礼物已加入发送队列', 'Gift added to send queue'), 'success');
                loadWishBackpack();
            } else {
                showToast(translateServerMessage(result.message) || t('送出失败', 'Send failed'), 'error');
            }
        } catch (error) {
            console.error(t('送出失败:', 'Send failed:'), error);
            showToast(t('网络错误，请稍后重试', 'Network error, please try again'), 'error');
        }
    }

    function renderGameRecords(records, gameType) {
        const recordsContent = document.getElementById('recordsContent');
        
        if (records.length === 0) {
            showContainerMessage(recordsContent, t('暂无游戏记录', 'No game records'));
            return;
        }
        const headersByGame = {
            quiz: [t('游戏时间', 'Time'), t('得分', 'Score')],
            slot: [t('游戏时间', 'Time'), t('结果', 'Result'), t('获得积分', 'Points Earned'), t('转动结果', 'Reels')],
            scratch: [t('游戏时间', 'Time'), t('结果', 'Result'), t('档位', 'Tier'), t('匹配数', 'Matches')],
            wish: [t('祈愿时间', 'Wish Time'), t('次数', 'Count'), t('消耗积分', 'Cost'), t('结果', 'Result')],
            blindbox: [t('抽取时间', 'Time'), t('档位', 'Tier'), t('数量', 'Count'), t('消耗积分', 'Cost'), t('总价值', 'Total Value')],
            stone: [t('操作时间', 'Time'), t('操作', 'Action'), t('花费', 'Cost'), t('变化', 'Change')],
            flip: [t('操作时间', 'Time'), t('动作', 'Action'), t('成本/奖励', 'Cost/Reward'), t('结果', 'Result')],
            duel: [t('挑战时间', 'Challenge Time'), t('礼物', 'Gift'), t('功力', 'Power'), t('消耗', 'Cost'), t('结果', 'Result')]
        };
        const headers = headersByGame[gameType];
        if (!headers) {
            showContainerMessage(recordsContent, t('记录类型无效', 'Invalid record type'));
            return;
        }
        const { table, tbody } = createRecordsTable(headers);

        records.forEach(record => {
            const playedAt = record.played_at || '';
            let values = [];
            if (gameType === 'quiz') {
                values = [playedAt, `${record.score ?? 0} ${t('分', 'pts')}`];
            } else if (gameType === 'slot') {
                let amounts = [];
                try {
                    const parsed = typeof record.amounts === 'string'
                        ? JSON.parse(record.amounts || '[]')
                        : record.amounts;
                    amounts = Array.isArray(parsed) ? parsed.slice(0, 20) : [];
                } catch {
                    amounts = [];
                }
                values = [
                    playedAt,
                    record.result === 'lost' ? t('未中奖', 'No Win') : t('中奖', 'Win'),
                    `${record.payout || 0} ${t('积分', 'points')}`,
                    `[${amounts.join(', ')}]`
                ];
            } else if (gameType === 'scratch') {
                values = [
                    playedAt,
                    formatScratchResult(record.result),
                    `${record.tier_cost ?? 0} ${t('积分', 'points')}`,
                    `${record.matches_count ?? 0} ${t('个', '')}`
                ];
            } else if (gameType === 'wish') {
                const successCount = Number(record.success_count || 0);
                const wishGiftName = getWishGiftName(record.gift_type, record.gift_name) || t('礼物', 'Gift');
                const resultText = successCount > 0
                    ? `${wishGiftName} x${successCount}`
                    : t('未中奖', 'No Win');
                values = [playedAt, record.batch_count ?? 0, `${record.total_cost ?? 0} ${t('积分', 'points')}`, resultText];
            } else if (gameType === 'blindbox') {
                values = [
                    playedAt,
                    record.tier_name || '',
                    record.box_count ?? 0,
                    `${record.total_cost ?? 0} ${t('积分', 'points')}`,
                    `${record.total_reward_value ?? 0} ${t('积分', 'points')}`
                ];
            } else if (gameType === 'stone') {
                const beforeSlots = formatStoneSlots(record.before_slots);
                const afterSlots = formatStoneSlots(record.after_slots);
                const costText = record.cost > 0 ? `-${record.cost}` : (record.reward > 0 ? `+${record.reward}` : '0');
                values = [playedAt, formatStoneAction(record.action_type), `${costText} ${t('积分', 'points')}`, `${beforeSlots} → ${afterSlots}`];
            } else if (gameType === 'flip') {
                const actionText = formatFlipAction(record.action_type);
                const amountText = record.reward > 0 ? `+${record.reward}` : '0';
                const resultText = t(
                    `好牌${record.good_count || 0}，坏牌${record.bad_count || 0}`,
                    `Good ${record.good_count || 0}, Bad ${record.bad_count || 0}`
                );
                values = [playedAt, actionText, `${amountText} ${t('积分', 'points')}`, resultText];
            } else if (gameType === 'duel') {
                const giftName = formatDuelGift(record.gift_type);
                const resultText = record.success
                    ? t(`成功 +${record.reward}`, `Success +${record.reward}`)
                    : t('失败', 'Failed');
                values = [playedAt, giftName, `${record.power ?? 0}%`, `-${record.cost ?? 0}`, resultText];
            }
            appendRecordRow(tbody, values);
        });
        recordsContent.replaceChildren(table);
    }

    function renderPagination(pagination, gameType) {
        const recordsPagination = document.getElementById('recordsPagination');
        
        if (pagination.total <= 1) {
            return;
        }
        
        const total = pagination.total;
        const current = pagination.current;
        const windowSize = 2;
        const pages = new Set([1, total]);
        for (let i = current - windowSize; i <= current + windowSize; i++) {
            if (i >= 1 && i <= total) {
                pages.add(i);
            }
        }
        const pageList = Array.from(pages).sort((a, b) => a - b);
        
        
        if (pagination.hasPrev) {
            const button = document.createElement('button');
            button.dataset.page = String(pagination.current - 1);
            button.textContent = t('上一页', 'Prev');
            recordsPagination.appendChild(button);
        }
        
        
        for (let i = 0; i < pageList.length; i++) {
            const page = pageList[i];
            if (i > 0 && pageList[i - 1] !== page - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                recordsPagination.appendChild(ellipsis);
            }
            const button = document.createElement('button');
            if (page === current) button.className = 'active';
            button.dataset.page = String(page);
            button.textContent = String(page);
            recordsPagination.appendChild(button);
        }
        
        
        if (pagination.hasNext) {
            const button = document.createElement('button');
            button.dataset.page = String(pagination.current + 1);
            button.textContent = t('下一页', 'Next');
            recordsPagination.appendChild(button);
        }
    }

    function formatStoneAction(actionType) {
        const map = {
            add: t('放入', 'Add'),
            fill: t('一键放满', 'Fill'),
            replace: t('更换', 'Replace'),
            redeem: t('兑换', 'Redeem')
        };
        return map[actionType] || actionType;
    }

    function formatStoneSlots(rawSlots) {
        let slots = [];
        try {
            slots = typeof rawSlots === 'string' ? JSON.parse(rawSlots) : rawSlots;
        } catch (error) {
            slots = [];
        }
        const colors = {
            red: t('红', 'Red'),
            orange: t('橙', 'Orange'),
            yellow: t('黄', 'Yellow'),
            green: t('绿', 'Green'),
            cyan: t('青', 'Cyan'),
            blue: t('蓝', 'Blue'),
            purple: t('紫', 'Purple')
        };
        return (slots || []).map(color => colors[color] || t('空', 'Empty')).join('');
    }

    function formatFlipAction(actionType) {
        const map = {
            end: t('本局结果', 'Result')
        };
        return map[actionType] || actionType;
    }

    function formatDuelGift(giftType) {
        const map = {
            crown: t('至尊奖 30000', 'Crown Prize 30000'),
            dragon: t('龙魂奖 13140', 'Dragon Prize 13140'),
            phoenix: t('凤羽奖 5000', 'Phoenix Prize 5000'),
            jade: t('玉阶奖 1000', 'Jade Prize 1000'),
            bronze: t('青铜奖 500', 'Bronze Prize 500'),
            iron: t('铁心奖 200', 'Iron Prize 200')
        };
        return map[giftType] || giftType;
    }

    function changePage(page) {
        currentPage = page;
        loadGameRecords(currentGameType, page);
    }

    
    window.addEventListener('click', function(event) {
        const changePasswordModal = document.getElementById('changePasswordModal');
        const gameRecordsModal = document.getElementById('gameRecordsModal');
        
        if (event.target === changePasswordModal) {
            closeChangePasswordModal();
        }
        if (event.target === gameRecordsModal) {
            closeGameRecordsModal();
        }
    });

    
    loadWishBackpack(false);
    if (backpackContentEl) {
        setInterval(() => loadWishBackpack(true), 10000);
    }
