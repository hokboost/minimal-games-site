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
    formatted = formatted.replace('电币', 'coins');
    return formatted;
};

    function showToast(message, type = 'info') {
        const toast = document.getElementById('messageToast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.style.display = 'block';
        
        setTimeout(() => {
            toast.style.display = 'none';
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
        document.getElementById('changePasswordModal').style.display = 'block';
        document.getElementById('changePasswordForm').reset();
    }

    
    function closeChangePasswordModal() {
        document.getElementById('changePasswordModal').style.display = 'none';
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
        
        if (newPassword.length < 6) {
            showToast(t('新密码至少需要6个字符', 'Password must be at least 6 characters'), 'error');
            return;
        }
        
        try {
            const response = await fetch('/api/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
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
            quiz: t('🧠 知识问答记录', '🧠 Quiz Records'),
            slot: t('🎰 老虎机记录', '🎰 Slot Records'),
            scratch: t('🎟️ 刮刮乐记录', '🎟️ Scratch Records'),
            wish: t('🌟 祈愿记录', '🌟 Wish Records'),
            stone: t('🪨 合石头记录', '🪨 Stone Match Records'),
            flip: t('🃏 翻卡牌记录', '🃏 Card Flip Records'),
            duel: t('⚔️ 决斗挑战记录', '⚔️ Duel Records')
        };
        
        document.getElementById('recordsTitle').textContent = titles[gameType];
        document.getElementById('gameRecordsModal').style.display = 'block';
        
        loadGameRecords(gameType, currentPage);
    }

    function closeGameRecordsModal() {
        document.getElementById('gameRecordsModal').style.display = 'none';
    }

    async function loadGameRecords(gameType, page = 1) {
        const recordsContent = document.getElementById('recordsContent');
        const recordsPagination = document.getElementById('recordsPagination');
        
        recordsContent.innerHTML = `<div class="loading">${t('加载中...', 'Loading...')}</div>`;
        recordsPagination.innerHTML = '';
        
        try {
            const response = await fetch(`/api/game-records/${gameType}?page=${page}&limit=10`);
            const data = await response.json();
            
            if (data.success) {
                renderGameRecords(data.records, gameType);
                renderPagination(data.pagination, gameType);
            } else {
                recordsContent.innerHTML = `<div class="loading">${t('加载失败', 'Load failed')}: ${translateServerMessage(data.message)}</div>`;
            }
        } catch (error) {
            console.error(t('加载游戏记录失败:', 'Failed to load game records:'), error);
            recordsContent.innerHTML = `<div class="loading">${t('网络错误，请稍后重试', 'Network error, please try again')}</div>`;
        }
    }

    const backpackFailureCache = new Map();

    async function loadWishBackpack(showAlerts = false) {
        const container = document.getElementById('backpackContent');
        container.innerHTML = `<div class="loading">${t('加载中...', 'Loading...')}</div>`;
        
        try {
            const response = await fetch('/api/wish/backpack');
            const data = await response.json();
            
            if (!data.success) {
                container.innerHTML = `<div class="loading">${t('加载失败', 'Load failed')}: ${translateServerMessage(data.message)}</div>`;
                return;
            }

            if (!data.items || data.items.length === 0) {
                container.innerHTML = `<div class="loading">${t('背包暂无礼物', 'No gifts in backpack')}</div>`;
                return;
            }

            let tableHTML = '<table class="records-table">';
            tableHTML += `<thead><tr><th>${t('获得时间', 'Received')}</th><th>${t('礼物', 'Gift')}</th><th>${t('到期时间', 'Expires')}</th><th>${t('状态', 'Status')}</th><th>${t('操作', 'Action')}</th></tr></thead>`;
            tableHTML += '<tbody>';

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
                const statusText = formatBackpackStatus(item.status, item.expires_at);
                const canSend = item.status === 'stored';
                const actionBtn = canSend
                    ? `<button class="view-records-btn" data-backpack-id="${item.id}">${t('送出', 'Send')}</button>`
                    : '-';

                tableHTML += `
                    <tr>
                        <td>${createdAt}</td>
                        <td>${getWishGiftName(item.gift_type, item.gift_name)}</td>
                        <td>${expiresAt}</td>
                        <td>${statusText}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            });

            tableHTML += '</tbody></table>';
            container.innerHTML = tableHTML;
        } catch (error) {
            console.error(t('加载背包失败:', 'Failed to load backpack:'), error);
            container.innerHTML = `<div class="loading">${t('网络错误，请稍后重试', 'Network error, please try again')}</div>`;
        }
    }

    function formatBackpackStatus(status, expiresAt) {
        if (status === 'stored') {
            if (!expiresAt) {
                return t('📦 待发送', '📦 Pending');
            }
            const now = new Date();
            const expireTime = new Date(expiresAt);
            if (expireTime <= now) {
                return t('⏳ 到期自动送出中', '⏳ Auto-sending');
            }
            return t('📦 待发送', '📦 Pending');
        }
        if (status === 'queued') return t('🚚 发送中', '🚚 Sending');
        if (status === 'sent') return t('✅ 已发送', '✅ Sent');
        if (status === 'failed') return t('❌ 发送失败', '❌ Failed');
        if (status === 'expired') return t('⌛ 已过期', '⌛ Expired');
        return status;
    }

    const profileCsrfToken = document.body.dataset.csrfToken || '';

    async function sendBackpackItem(id) {
        try {
            const response = await fetch('/api/wish/backpack/send', {
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
            recordsContent.innerHTML = `<div class="loading">${t('暂无游戏记录', 'No game records')}</div>`;
            return;
        }
        
        let tableHTML = '<table class="records-table">';
        
        
        if (gameType === 'quiz') {
            tableHTML += `<thead><tr><th>${t('游戏时间', 'Time')}</th><th>${t('得分', 'Score')}</th></tr></thead>`;
        } else if (gameType === 'slot') {
            tableHTML += `<thead><tr><th>${t('游戏时间', 'Time')}</th><th>${t('结果', 'Result')}</th><th>${t('获得电币', 'Coins Earned')}</th><th>${t('转动结果', 'Reels')}</th></tr></thead>`;
        } else if (gameType === 'scratch') {
            tableHTML += `<thead><tr><th>${t('游戏时间', 'Time')}</th><th>${t('结果', 'Result')}</th><th>${t('档位', 'Tier')}</th><th>${t('匹配数', 'Matches')}</th></tr></thead>`;
        } else if (gameType === 'wish') {
            tableHTML += `<thead><tr><th>${t('祈愿时间', 'Wish Time')}</th><th>${t('次数', 'Count')}</th><th>${t('消耗电币', 'Cost')}</th><th>${t('结果', 'Result')}</th></tr></thead>`;
        } else if (gameType === 'stone') {
            tableHTML += `<thead><tr><th>${t('操作时间', 'Time')}</th><th>${t('操作', 'Action')}</th><th>${t('花费', 'Cost')}</th><th>${t('变化', 'Change')}</th></tr></thead>`;
        } else if (gameType === 'flip') {
            tableHTML += `<thead><tr><th>${t('操作时间', 'Time')}</th><th>${t('动作', 'Action')}</th><th>${t('成本/奖励', 'Cost/Reward')}</th><th>${t('结果', 'Result')}</th></tr></thead>`;
        } else if (gameType === 'duel') {
            tableHTML += `<thead><tr><th>${t('挑战时间', 'Challenge Time')}</th><th>${t('礼物', 'Gift')}</th><th>${t('功力', 'Power')}</th><th>${t('消耗', 'Cost')}</th><th>${t('结果', 'Result')}</th></tr></thead>`;
        }
        
        tableHTML += '<tbody>';
        
        
        records.forEach(record => {
            const playedAt = record.played_at || '';
            
            if (gameType === 'quiz') {
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.score} ${t('分', 'pts')}</td>
                    </tr>
                `;
            } else if (gameType === 'slot') {
                const amounts = JSON.parse(record.amounts || '[]');
                const amountsText = amounts.join(', ');
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.result === 'lost' ? t('❌ 未中奖', '❌ No Win') : t('✅ 中奖', '✅ Win')}</td>
                        <td>${record.payout || 0} ${t('电币', 'coins')}</td>
                        <td>[${amountsText}]</td>
                    </tr>
                `;
            } else if (gameType === 'scratch') {
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${formatScratchResult(record.result)}</td>
                        <td>${record.tier_cost} ${t('电币', 'coins')}</td>
                        <td>${record.matches_count} ${t('个', '')}</td>
                    </tr>
                `;
            } else if (gameType === 'wish') {
                const successCount = Number(record.success_count || 0);
                const wishGiftName = getWishGiftName(record.gift_type, record.gift_name) || t('礼物', 'Gift');
                const resultText = successCount > 0
                    ? `✅ ${wishGiftName} x${successCount}`
                    : t('❌ 未中奖', '❌ No Win');
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.batch_count}</td>
                        <td>${record.total_cost} ${t('电币', 'coins')}</td>
                        <td>${resultText}</td>
                    </tr>
                `;
            } else if (gameType === 'stone') {
                const beforeSlots = formatStoneSlots(record.before_slots);
                const afterSlots = formatStoneSlots(record.after_slots);
                const costText = record.cost > 0 ? `-${record.cost}` : (record.reward > 0 ? `+${record.reward}` : '0');
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${formatStoneAction(record.action_type)}</td>
                        <td>${costText} ${t('电币', 'coins')}</td>
                        <td>${beforeSlots} → ${afterSlots}</td>
                    </tr>
                `;
            } else if (gameType === 'flip') {
                const actionText = formatFlipAction(record.action_type);
                const amountText = record.reward > 0 ? `+${record.reward}` : '0';
                const resultText = t(
                    `好牌${record.good_count || 0}，坏牌${record.bad_count || 0}`,
                    `Good ${record.good_count || 0}, Bad ${record.bad_count || 0}`
                );
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${actionText}</td>
                        <td>${amountText} ${t('电币', 'coins')}</td>
                        <td>${resultText}</td>
                    </tr>
                `;
            } else if (gameType === 'duel') {
                const giftName = formatDuelGift(record.gift_type);
                const resultText = record.success
                    ? t(`✅ 成功 +${record.reward}`, `✅ Success +${record.reward}`)
                    : t('❌ 失败', '❌ Failed');
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${giftName}</td>
                        <td>${record.power}%</td>
                        <td>-${record.cost}</td>
                        <td>${resultText}</td>
                    </tr>
                `;
            }
        });
        
        tableHTML += '</tbody></table>';
        recordsContent.innerHTML = tableHTML;
    }

    function renderPagination(pagination, gameType) {
        const recordsPagination = document.getElementById('recordsPagination');
        
        if (pagination.total <= 1) {
            return;
        }
        
        let paginationHTML = '';
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
            paginationHTML += `<button data-page="${pagination.current - 1}">${t('上一页', 'Prev')}</button>`;
        }
        
        
        for (let i = 0; i < pageList.length; i++) {
            const page = pageList[i];
            if (i > 0 && pageList[i - 1] !== page - 1) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
            const activeClass = page === current ? 'active' : '';
            paginationHTML += `<button class="${activeClass}" data-page="${page}">${page}</button>`;
        }
        
        
        if (pagination.hasNext) {
            paginationHTML += `<button data-page="${pagination.current + 1}">${t('下一页', 'Next')}</button>`;
        }
        
        recordsPagination.innerHTML = paginationHTML;
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

    
    window.onclick = function(event) {
        const changePasswordModal = document.getElementById('changePasswordModal');
        const gameRecordsModal = document.getElementById('gameRecordsModal');
        
        if (event.target === changePasswordModal) {
            closeChangePasswordModal();
        }
        if (event.target === gameRecordsModal) {
            closeGameRecordsModal();
        }
    }

    
    loadWishBackpack(false);
    if (backpackContentEl) {
        setInterval(() => loadWishBackpack(true), 10000);
    }
