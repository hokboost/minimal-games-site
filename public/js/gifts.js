    const csrfToken = document.body.dataset.csrfToken || '';

    
    async function exchangeGiftWithQuantity(giftType, unitCost) {
        const quantity = parseInt(document.getElementById(giftType + '-quantity').value);
        const totalCost = unitCost * quantity;
        
        if (quantity < 1 || quantity > 100) {
            showMessage('数量必须在1-100之间！', 'error');
            return;
        }
        
        const currentBalance = parseInt(document.getElementById('currentBalance').textContent);
        
        if (currentBalance < totalCost) {
            showMessage('电币余额不足！', 'error');
            return;
        }

        if (!confirm(`确定要花费 ${totalCost} 电币兑换 ${quantity} 个礼物吗？`)) {
            return;
        }

        try {
            showMessage('正在处理兑换...', 'info');
            
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
                showMessage(`成功兑换 ${quantity} 个礼物！`, 'success');
                
                
                document.getElementById('currentBalance').textContent = result.newBalance;
                
                
                document.getElementById(giftType + '-quantity').value = 1;
                updateGiftTotal(giftType, unitCost);
                
                
                loadExchangeHistory();
            } else {
                showMessage(result.message || '兑换失败', 'error');
            }
        } catch (error) {
            console.error('兑换失败:', error);
            showMessage('网络错误，请稍后重试', 'error');
        }
    }

    
    async function exchangeGift(giftType, cost) {
        const currentBalance = parseInt(document.getElementById('currentBalance').textContent);
        
        if (currentBalance < cost) {
            showMessage('电币余额不足！', 'error');
            return;
        }

        if (!confirm(`确定要花费 ${cost} 电币兑换这个礼物吗？`)) {
            return;
        }

        try {
            showMessage('正在处理兑换...', 'info');
            
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
                showMessage('兑换成功！', 'success');
                
                
                document.getElementById('currentBalance').textContent = result.newBalance;
                
                
                loadExchangeHistory();
            } else {
                showMessage(result.message || '兑换失败', 'error');
            }
        } catch (error) {
            console.error('兑换失败:', error);
            showMessage('网络错误，请稍后重试', 'error');
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
                            <span style="color: #ff9800;">(-${item.cost} 电币)</span>
                            ${getDeliveryStatusBadge(item)}
                        </div>
                        <div class="history-time">${formatTime(item.created_at)}</div>
                    </div>
                `).join('');
            } else {
                historyDiv.innerHTML = '<div class="loading">暂无兑换记录</div>';
            }
        } catch (error) {
            console.error('加载兑换记录失败:', error);
            document.getElementById('exchangeHistory').innerHTML = 
                '<div class="loading">加载失败，请刷新重试</div>';
        }
    }

    
    function getGiftIcon(giftType) {
        const icons = {
            'heartbox': '💝',
            'fanlight': '🏮'
        };
        return icons[giftType] || '🎁';
    }

    
    function getGiftName(giftType) {
        const names = {
            'heartbox': '心动盲盒',
            'fanlight': '粉丝团灯牌'
        };
        return names[giftType] || '未知礼物';
    }

    
    function formatTime(timestamp) {
        if (!timestamp) {
            return '';
        }
        if (typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(timestamp)) {
            return timestamp;
        }
        return new Date(timestamp).toLocaleString('zh-CN', {
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
            'pending': '⏳ 等待发送',
            'processing': '🔄 发送中',
            'success': '✅ 发送成功',
            'partial_success': '⚠️ 部分成功',
            'failed': '❌ 发送失败', 
            'no_room': '📍 无房间号'
        };
        
        const color = statusColors[status] || '#9e9e9e';
        const text = statusTexts[status] || '❓ 未知状态';
        
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
                    showMessage(`礼物${getGiftName(newItem.gift_type)}部分发送成功！部分礼物可能因余额不足等原因发送失败。`, 'info');
                } else if (newItem.delivery_status === 'success') {
                    showMessage(`礼物${getGiftName(newItem.gift_type)}已全部发送成功！`, 'success');
                } else if (newItem.delivery_status === 'failed') {
                    const reason = (newItem.failure_reason || '').toLowerCase();
                    if (reason.includes('余额') || reason.includes('balance') || reason.includes('insufficient')) {
                        showMessage(`B站账号余额不足，礼物${getGiftName(newItem.gift_type)}送出失败。`, 'error');
                    } else {
                        showMessage(`礼物${getGiftName(newItem.gift_type)}发送失败，已退还电币。`, 'error');
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

        
        const heartboxQuantity = document.getElementById('heartbox-quantity');
        const fanlightQuantity = document.getElementById('fanlight-quantity');
        
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
    });
