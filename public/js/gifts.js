    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);
    const csrfToken = document.body.dataset.csrfToken || '';

    
    async function exchangeGiftWithQuantity(giftType, unitCost) {
        const quantity = parseInt(document.getElementById(giftType + '-quantity').value);
        const totalCost = unitCost * quantity;
        
        if (quantity < 1 || quantity > 100) {
            showMessage(t('数量必须在1-100之间！', 'Quantity must be between 1 and 100.'), 'error');
            return;
        }
        
        const currentBalance = parseInt(document.getElementById('currentBalance').textContent);
        
        if (currentBalance < totalCost) {
            showMessage(t('电币余额不足！', 'Insufficient coin balance.'), 'error');
            return;
        }

        if (!confirm(t(
            `确定要花费 ${totalCost} 电币兑换 ${quantity} 个礼物吗？`,
            `Exchange ${quantity} gift(s) for ${totalCost} coins?`
        ))) {
            return;
        }

        try {
            showMessage(t('正在处理兑换...', 'Processing exchange...'), 'info');
            
            const response = await fetch('/api/gifts/exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    giftType: giftType,
                    cost: totalCost,
                    quantity: quantity
                })
            });

            const result = await response.json();
            
            if (result.success) {
                showMessage(t(`成功兑换 ${quantity} 个礼物！`, `Successfully exchanged ${quantity} gift(s)!`), 'success');
                
                
                document.getElementById('currentBalance').textContent = result.newBalance;
                
                
                document.getElementById(giftType + '-quantity').value = 1;
                updateGiftTotal(giftType, unitCost);
                
                
                loadExchangeHistory();
            } else {
                showMessage(translateServerMessage(result.message) || t('兑换失败', 'Exchange failed'), 'error');
            }
        } catch (error) {
            console.error('兑换失败:', error);
            showMessage(t('网络错误，请稍后重试', 'Network error, please try again'), 'error');
        }
    }

    
    async function exchangeGift(giftType, cost) {
        const currentBalance = parseInt(document.getElementById('currentBalance').textContent);
        
        if (currentBalance < cost) {
            showMessage(t('电币余额不足！', 'Insufficient coin balance.'), 'error');
            return;
        }

        if (!confirm(t(
            `确定要花费 ${cost} 电币兑换这个礼物吗？`,
            `Exchange this gift for ${cost} coins?`
        ))) {
            return;
        }

        try {
            showMessage(t('正在处理兑换...', 'Processing exchange...'), 'info');
            
            const response = await fetch('/api/gifts/exchange', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    giftType: giftType,
                    cost: cost
                })
            });

            const result = await response.json();
            
            if (result.success) {
                showMessage(t('兑换成功！', 'Exchange successful!'), 'success');
                
                
                document.getElementById('currentBalance').textContent = result.newBalance;
                
                
                loadExchangeHistory();
            } else {
                showMessage(translateServerMessage(result.message) || t('兑换失败', 'Exchange failed'), 'error');
            }
        } catch (error) {
            console.error('兑换失败:', error);
            showMessage(t('网络错误，请稍后重试', 'Network error, please try again'), 'error');
        }
    }

    
    async function loadExchangeHistory() {
        try {
            const response = await fetch('/api/gifts/history');
            const result = await response.json();
            
            const historyDiv = document.getElementById('exchangeHistory');
            
            if (result.success && result.history.length > 0) {
                
                checkStatusChanges(result.history);
                
                historyDiv.innerHTML = result.history.map(item => `
                    <div class="history-item">
                        <div class="history-gift">
                            <span>${getGiftIcon(item.gift_type)}</span>
                            <span>${getGiftName(item.gift_type)} ${item.quantity > 1 ? 'x' + item.quantity : ''}</span>
                            <span style="color: #ff9800;">(-${item.cost} ${t('电币', 'coins')})</span>
                            ${getDeliveryStatusBadge(item)}
                        </div>
                        <div class="history-time">${formatTime(item.created_at)}</div>
                    </div>
                `).join('');
            } else {
                historyDiv.innerHTML = `<div class="loading">${t('暂无兑换记录', 'No exchange history')}</div>`;
            }
        } catch (error) {
            console.error('加载兑换记录失败:', error);
            document.getElementById('exchangeHistory').innerHTML = 
                `<div class="loading">${t('加载失败，请刷新重试', 'Load failed, please refresh and retry')}</div>`;
        }
    }

    
    function getGiftIcon(giftType) {
        const icons = {
            'heartbox': '💝',
            'fanlight': '🏮',
            'tiedu_one': '🛳️',
            'deepsea_singer': '🎠',
            'sky_throne': '💺',
            'proposal': '💍',
            'wonderland': '🌙',
            'white_bride': '🤍',
            'crystal_ball': '🔮',
            'bobo': '🫧'
        };
        return icons[giftType] || '🎁';
    }

    
    function getGiftName(giftType) {
        const names = {
            'heartbox': t('心动盲盒', 'Mystery Gift Box'),
            'fanlight': t('粉丝团灯牌', 'Fan Light Badge'),
            'tiedu_one': t('提督一号', 'Admiral One'),
            'deepsea_singer': t('梦幻游乐园', 'Dreamland Park'),
            'sky_throne': t('飞天转椅', 'Sky Throne'),
            'proposal': t('原地求婚', 'On-the-Spot Proposal'),
            'wonderland': t('梦游仙境', 'Wonderland Dream'),
            'white_bride': t('纯白花嫁', 'Pure White Bride'),
            'crystal_ball': t('水晶球', 'Crystal Ball'),
            'bobo': t('啵啵', 'Bubbles')
        };
        return names[giftType] || t('未知礼物', 'Unknown Gift');
    }

    
    function formatTime(timestamp) {
        if (!timestamp) {
            return '';
        }
        if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
            return timestamp;
        }
        return new Date(timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }

    
    function getDeliveryStatusBadge(item) {
        const status = item.delivery_status;
        const statusColors = {
            'pending': '#ff9800',      
            'processing': '#2196f3',   
            'success': '#4caf50',      
            'partial_success': '#ff5722', 
            'failed': '#f44336',       
            'no_room': '#9e9e9e'       
        };
        
        const statusTexts = {
            'pending': t('⏳ 等待发送', '⏳ Pending'),
            'processing': t('🔄 发送中', '🔄 Sending'),
            'success': t('✅ 发送成功', '✅ Sent'),
            'partial_success': t('⚠️ 部分成功', '⚠️ Partial'),
            'failed': t('❌ 发送失败', '❌ Failed'),
            'no_room': t('📍 无房间号', '📍 No Room')
        };
        
        const color = statusColors[status] || '#9e9e9e';
        const text = statusTexts[status] || t('❓ 未知状态', '❓ Unknown');
        
        return `<span style="color: ${color}; font-size: 0.8rem; margin-left: 8px;">${text}</span>`;
    }

    
    let lastHistory = [];
    
    
    function checkStatusChanges(newHistory) {
        if (lastHistory.length === 0) {
            lastHistory = [...newHistory];
            return;
        }
        
        
        for (const newItem of newHistory) {
            const oldItem = lastHistory.find(item => 
                item.gift_type === newItem.gift_type && 
                item.created_at === newItem.created_at
            );
            
            if (oldItem && oldItem.delivery_status !== newItem.delivery_status) {
                
                if (newItem.delivery_status === 'partial_success') {
                    showMessage(t(
                        `礼物${getGiftName(newItem.gift_type)}部分发送成功！部分礼物可能因余额不足等原因发送失败。`,
                        `Gift ${getGiftName(newItem.gift_type)} partially sent. Some items may have failed due to insufficient balance.`
                    ), 'info');
                } else if (newItem.delivery_status === 'success') {
                    showMessage(t(
                        `礼物${getGiftName(newItem.gift_type)}已全部发送成功！`,
                        `Gift ${getGiftName(newItem.gift_type)} sent successfully.`
                    ), 'success');
                } else if (newItem.delivery_status === 'failed') {
                    const reason = (newItem.failure_reason || '').toLowerCase();
                    if (reason.includes('余额') || reason.includes('balance') || reason.includes('insufficient')) {
                        showMessage(t(
                            `B站账号余额不足，礼物${getGiftName(newItem.gift_type)}送出失败。`,
                            `Bilibili account balance is insufficient. Gift ${getGiftName(newItem.gift_type)} failed to send.`
                        ), 'error');
                    } else {
                        showMessage(t(
                            `礼物${getGiftName(newItem.gift_type)}发送失败，已退还电币。`,
                            `Gift ${getGiftName(newItem.gift_type)} failed to send. Coins refunded.`
                        ), 'error');
                    }
                }
            }
        }
        
        lastHistory = [...newHistory];
    }

    
    function showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem;
            border-radius: 8px; color: white; font-weight: bold; z-index: 1001;
            animation: slideIn 0.3s ease;
        `;
        
        const colors = {
            success: 'linear-gradient(135deg, #4caf50, #45a049)',
            error: 'linear-gradient(135deg, #f44336, #d32f2f)',
            info: 'linear-gradient(135deg, #2196f3, #1976d2)'
        };
        
        messageDiv.style.background = colors[type] || colors.info;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 3000);
    }

    

    
    function updateGiftTotal(giftType, unitCost) {
        const quantityInput = document.getElementById(giftType + '-quantity');
        const totalSpan = document.getElementById(giftType + '-total');
        const quantity = parseInt(quantityInput.value) || 1;
        const total = unitCost * quantity;
        totalSpan.textContent = total;
    }

    
    document.addEventListener('DOMContentLoaded', function() {
        loadExchangeHistory();
        
        
        setInterval(() => {
            loadExchangeHistory();
        }, 10000);
        
        document.querySelectorAll('.gift-button[data-gift]').forEach((button) => {
            button.addEventListener('click', () => {
                const giftType = button.dataset.gift;
                const unitCost = Number(button.dataset.cost);
                if (!giftType || !Number.isFinite(unitCost)) {
                    return;
                }
                exchangeGiftWithQuantity(giftType, unitCost);
            });
        });

        const pkToggleBtn = document.getElementById('pkToggleBtn');
        const pkStatusText = document.getElementById('pkStatusText');
        const { csrfToken } = document.body.dataset;

        async function updatePkStatus() {
            if (!pkToggleBtn) return;
            try {
                const response = await fetch('/api/pk/status');
                const result = await response.json();
                const running = !!result.running;
                pkToggleBtn.classList.toggle('stop', running);
                pkToggleBtn.textContent = running
                    ? t('关闭自动打PK', 'Stop Auto PK')
                    : t('开启自动打PK', 'Start Auto PK');
                if (pkStatusText) {
                    pkStatusText.textContent = running
                        ? t('状态：运行中', 'Status: Running')
                        : t('状态：未运行', 'Status: Stopped');
                }
            } catch (error) {
                console.error('PK status error:', error);
            }
        }

        async function togglePk() {
            if (!pkToggleBtn) return;
            const isStopping = pkToggleBtn.classList.contains('stop');
            pkToggleBtn.disabled = true;
            try {
                const path = isStopping ? '/api/pk/stop' : '/api/pk/start';
                const response = await fetch(path, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken || ''
                    },
                    body: JSON.stringify({})
                });
                const result = await response.json();
                if (!result.success) {
                    showMessage(translateServerMessage(result.message) || t('操作失败', 'Action failed'), 'error');
                } else {
                    const runningNext = !isStopping;
                    pkToggleBtn.classList.toggle('stop', runningNext);
                    pkToggleBtn.textContent = runningNext
                        ? t('关闭自动打PK', 'Stop Auto PK')
                        : t('开启自动打PK', 'Start Auto PK');
                    if (pkStatusText) {
                        pkStatusText.textContent = runningNext
                            ? t('状态：启动中', 'Status: Starting')
                            : t('状态：停止中', 'Status: Stopping');
                    }
                }
            } catch (error) {
                console.error('PK toggle error:', error);
                showMessage(t('操作失败', 'Action failed'), 'error');
            } finally {
                pkToggleBtn.disabled = false;
                setTimeout(updatePkStatus, 1200);
            }
        }

        if (pkToggleBtn) {
            pkToggleBtn.addEventListener('click', togglePk);
            updatePkStatus();
        }

        
        const heartboxQuantity = document.getElementById('heartbox-quantity');
        const fanlightQuantity = document.getElementById('fanlight-quantity');
        const tieduOneQuantity = document.getElementById('tiedu_one-quantity');
        
        heartboxQuantity.addEventListener('input', () => updateGiftTotal('heartbox', 150));
        heartboxQuantity.addEventListener('change', () => {
            const value = parseInt(heartboxQuantity.value);
            if (value < 1) heartboxQuantity.value = 1;
            if (value > 100) heartboxQuantity.value = 100;
            updateGiftTotal('heartbox', 150);
        });
        
        fanlightQuantity.addEventListener('input', () => updateGiftTotal('fanlight', 1));
        fanlightQuantity.addEventListener('change', () => {
            const value = parseInt(fanlightQuantity.value);
            if (value < 1) fanlightQuantity.value = 1;
            if (value > 100) fanlightQuantity.value = 100;
            updateGiftTotal('fanlight', 1);
        });

        tieduOneQuantity.addEventListener('input', () => updateGiftTotal('tiedu_one', 19980));
        tieduOneQuantity.addEventListener('change', () => {
            const value = parseInt(tieduOneQuantity.value);
            if (value < 1) tieduOneQuantity.value = 1;
            if (value > 100) tieduOneQuantity.value = 100;
            updateGiftTotal('tiedu_one', 19980);
        });
    });
