// 显示消息提示
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
        refreshBackpackBtn.addEventListener('click', loadWishBackpack);
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

    // 显示修改密码模态框
    function showChangePasswordModal() {
        document.getElementById('changePasswordModal').style.display = 'block';
        document.getElementById('changePasswordForm').reset();
    }

    // 关闭修改密码模态框
    function closeChangePasswordModal() {
        document.getElementById('changePasswordModal').style.display = 'none';
    }

    // 处理修改密码表单提交
    document.getElementById('changePasswordForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // 客户端验证
        if (!currentPassword || !newPassword || !confirmPassword) {
            showToast('请填写所有字段', 'error');
            return;
        }
        
        if (newPassword !== confirmPassword) {
            showToast('新密码和确认密码不匹配', 'error');
            return;
        }
        
        if (newPassword.length < 6) {
            showToast('新密码至少需要6个字符', 'error');
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
                showToast(result.message, 'success');
                closeChangePasswordModal();
                document.getElementById('changePasswordForm').reset();
            } else {
                showToast(result.message, 'error');
            }
        } catch (error) {
            console.error('修改密码失败:', error);
            showToast('网络错误，请稍后重试', 'error');
        }
    });


    // ESC键关闭模态框
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            closeChangePasswordModal();
        }
    });

    function exportData() {
        showToast('数据导出功能开发中...', 'info');
    }

    // 游戏记录相关功能
    let currentGameType = null;
    let currentPage = 1;

    function viewGameRecords(gameType) {
        currentGameType = gameType;
        currentPage = 1;
        
        const titles = {
            quiz: '🧠 知识问答记录',
            slot: '🎰 老虎机记录',
            scratch: '🎟️ 刮刮乐记录',
            wish: '🌟 祈愿记录',
            stone: '🪨 合石头记录',
            flip: '🃏 翻卡牌记录',
            duel: '⚔️ 决斗挑战记录'
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
        
        recordsContent.innerHTML = '<div class="loading">加载中...</div>';
        recordsPagination.innerHTML = '';
        
        try {
            const response = await fetch(`/api/game-records/${gameType}?page=${page}&limit=10`);
            const data = await response.json();
            
            if (data.success) {
                renderGameRecords(data.records, gameType);
                renderPagination(data.pagination, gameType);
            } else {
                recordsContent.innerHTML = `<div class="loading">加载失败: ${data.message}</div>`;
            }
        } catch (error) {
            console.error('加载游戏记录失败:', error);
            recordsContent.innerHTML = '<div class="loading">网络错误，请稍后重试</div>';
        }
    }

    const backpackFailureCache = new Map();

    async function loadWishBackpack() {
        const container = document.getElementById('backpackContent');
        container.innerHTML = '<div class="loading">加载中...</div>';
        
        try {
            const response = await fetch('/api/wish/backpack');
            const data = await response.json();
            
            if (!data.success) {
                container.innerHTML = `<div class="loading">加载失败: ${data.message}</div>`;
                return;
            }

            if (!data.items || data.items.length === 0) {
                container.innerHTML = '<div class="loading">背包暂无礼物</div>';
                return;
            }

            let tableHTML = '<table class="records-table">';
            tableHTML += '<thead><tr><th>获得时间</th><th>礼物</th><th>到期时间</th><th>状态</th><th>操作</th></tr></thead>';
            tableHTML += '<tbody>';

            data.items.forEach(item => {
                if (item.last_failure_reason) {
                    const cachedReason = backpackFailureCache.get(item.id);
                    if (cachedReason !== item.last_failure_reason) {
                        const reason = item.last_failure_reason.toLowerCase();
                        if (reason.includes('余额') || reason.includes('balance') || reason.includes('insufficient')) {
                            showToast('B站账号余额不足，礼物送出失败。', 'error');
                        } else {
                            showToast(`送出失败：${item.last_failure_reason}`, 'error');
                        }
                        backpackFailureCache.set(item.id, item.last_failure_reason);
                    }
                }
                const createdAt = item.created_at || '';
                const expiresAt = item.expires_note || item.expires_at || '-';
                const statusText = formatBackpackStatus(item.status, item.expires_at);
                const canSend = item.status === 'stored';
                const actionBtn = canSend
                    ? `<button class="view-records-btn" data-backpack-id="${item.id}">送出</button>`
                    : '-';

                tableHTML += `
                    <tr>
                        <td>${createdAt}</td>
                        <td>${item.gift_name}</td>
                        <td>${expiresAt}</td>
                        <td>${statusText}</td>
                        <td>${actionBtn}</td>
                    </tr>
                `;
            });

            tableHTML += '</tbody></table>';
            container.innerHTML = tableHTML;
        } catch (error) {
            console.error('加载背包失败:', error);
            container.innerHTML = '<div class="loading">网络错误，请稍后重试</div>';
        }
    }

    function formatBackpackStatus(status, expiresAt) {
        if (status === 'stored') {
            if (!expiresAt) {
                return '📦 待发送';
            }
            const now = new Date();
            const expireTime = new Date(expiresAt);
            if (expireTime <= now) {
                return '⏳ 到期自动送出中';
            }
            return '📦 待发送';
        }
        if (status === 'queued') return '🚚 发送中';
        if (status === 'sent') return '✅ 已发送';
        if (status === 'failed') return '❌ 发送失败';
        if (status === 'expired') return '⌛ 已过期';
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
                showToast('礼物已加入发送队列', 'success');
                loadWishBackpack();
            } else {
                showToast(result.message || '送出失败', 'error');
            }
        } catch (error) {
            console.error('送出失败:', error);
            showToast('网络错误，请稍后重试', 'error');
        }
    }

    function renderGameRecords(records, gameType) {
        const recordsContent = document.getElementById('recordsContent');
        
        if (records.length === 0) {
            recordsContent.innerHTML = '<div class="loading">暂无游戏记录</div>';
            return;
        }
        
        let tableHTML = '<table class="records-table">';
        
        // 表头
        if (gameType === 'quiz') {
            tableHTML += '<thead><tr><th>游戏时间</th><th>得分</th></tr></thead>';
        } else if (gameType === 'slot') {
            tableHTML += '<thead><tr><th>游戏时间</th><th>结果</th><th>获得电币</th><th>转动结果</th></tr></thead>';
        } else if (gameType === 'scratch') {
            tableHTML += '<thead><tr><th>游戏时间</th><th>结果</th><th>档位</th><th>匹配数</th></tr></thead>';
        } else if (gameType === 'wish') {
            tableHTML += '<thead><tr><th>祈愿时间</th><th>次数</th><th>消耗电币</th><th>结果</th></tr></thead>';
        } else if (gameType === 'stone') {
            tableHTML += '<thead><tr><th>操作时间</th><th>操作</th><th>花费</th><th>变化</th></tr></thead>';
        } else if (gameType === 'flip') {
            tableHTML += '<thead><tr><th>操作时间</th><th>动作</th><th>成本/奖励</th><th>结果</th></tr></thead>';
        } else if (gameType === 'duel') {
            tableHTML += '<thead><tr><th>挑战时间</th><th>礼物</th><th>功力</th><th>消耗</th><th>结果</th></tr></thead>';
        }
        
        tableHTML += '<tbody>';
        
        // 表内容
        records.forEach(record => {
            const playedAt = record.played_at || '';
            
            if (gameType === 'quiz') {
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.score} 分</td>
                    </tr>
                `;
            } else if (gameType === 'slot') {
                const amounts = JSON.parse(record.amounts || '[]');
                const amountsText = amounts.join(', ');
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.result === 'lost' ? '❌ 未中奖' : '✅ 中奖'}</td>
                        <td>${record.payout || 0} 电币</td>
                        <td>[${amountsText}]</td>
                    </tr>
                `;
            } else if (gameType === 'scratch') {
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.result}</td>
                        <td>${record.tier_cost} 电币</td>
                        <td>${record.matches_count} 个</td>
                    </tr>
                `;
            } else if (gameType === 'wish') {
                const successCount = Number(record.success_count || 0);
                const resultText = successCount > 0
                    ? `✅ ${record.gift_name || '礼物'} x${successCount}`
                    : '❌ 未中奖';
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${record.batch_count}</td>
                        <td>${record.total_cost} 电币</td>
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
                        <td>${costText} 电币</td>
                        <td>${beforeSlots} → ${afterSlots}</td>
                    </tr>
                `;
            } else if (gameType === 'flip') {
                const actionText = formatFlipAction(record.action_type);
                const amountText = record.reward > 0 ? `+${record.reward}` : '0';
                const resultText = `好牌${record.good_count || 0}，坏牌${record.bad_count || 0}`;
                tableHTML += `
                    <tr>
                        <td>${playedAt}</td>
                        <td>${actionText}</td>
                        <td>${amountText} 电币</td>
                        <td>${resultText}</td>
                    </tr>
                `;
            } else if (gameType === 'duel') {
                const giftName = formatDuelGift(record.gift_type);
                const resultText = record.success ? `✅ 成功 +${record.reward}` : '❌ 失败';
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
        
        // 上一页
        if (pagination.hasPrev) {
            paginationHTML += `<button data-page="${pagination.current - 1}">上一页</button>`;
        }
        
        // 页码
        for (let i = 0; i < pageList.length; i++) {
            const page = pageList[i];
            if (i > 0 && pageList[i - 1] !== page - 1) {
                paginationHTML += `<span class="pagination-ellipsis">...</span>`;
            }
            const activeClass = page === current ? 'active' : '';
            paginationHTML += `<button class="${activeClass}" data-page="${page}">${page}</button>`;
        }
        
        // 下一页
        if (pagination.hasNext) {
            paginationHTML += `<button data-page="${pagination.current + 1}">下一页</button>`;
        }
        
        recordsPagination.innerHTML = paginationHTML;
    }

    function formatStoneAction(actionType) {
        const map = {
            add: '放入',
            fill: '一键放满',
            replace: '更换',
            redeem: '兑换'
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
            red: '红',
            orange: '橙',
            yellow: '黄',
            green: '绿',
            cyan: '青',
            blue: '蓝',
            purple: '紫'
        };
        return (slots || []).map(color => colors[color] || '空').join('');
    }

    function formatFlipAction(actionType) {
        const map = {
            end: '本局结果'
        };
        return map[actionType] || actionType;
    }

    function formatDuelGift(giftType) {
        const map = {
            crown: '至尊奖 30000',
            dragon: '龙魂奖 13140',
            phoenix: '凤羽奖 5000',
            jade: '玉阶奖 1000',
            bronze: '青铜奖 500',
            iron: '铁心奖 200'
        };
        return map[giftType] || giftType;
    }

    function changePage(page) {
        currentPage = page;
        loadGameRecords(currentGameType, page);
    }

    // 点击模态框外部关闭
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

    // 初始化背包
    loadWishBackpack();
    if (backpackContentEl) {
        setInterval(loadWishBackpack, 10000);
    }
