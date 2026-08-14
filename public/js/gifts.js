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
            showMessage(t('积分余额不足！', 'Insufficient point balance.'), 'error');
            return;
        }

        if (!confirm(t(
            `确定要花费 ${totalCost} 积分兑换 ${quantity} 个礼物吗？`,
            `Exchange ${quantity} gift(s) for ${totalCost} points?`
        ))) {
            return;
        }

        try {
            showMessage(t('正在处理兑换...', 'Processing exchange...'), 'info');
            
            const response = await window.idempotentFetch('/api/gifts/exchange', {
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
            showMessage(t('积分余额不足！', 'Insufficient point balance.'), 'error');
            return;
        }

        if (!confirm(t(
            `确定要花费 ${cost} 积分兑换这个礼物吗？`,
            `Exchange this gift for ${cost} points?`
        ))) {
            return;
        }

        try {
            showMessage(t('正在处理兑换...', 'Processing exchange...'), 'info');
            
            const response = await window.idempotentFetch('/api/gifts/exchange', {
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
                
                const rows = result.history.map((item) => {
                    const row = document.createElement('div');
                    row.className = 'history-item';
                    const gift = document.createElement('div');
                    gift.className = 'history-gift';
                    const icon = document.createElement('span');
                    icon.textContent = getGiftIcon(item.gift_type);
                    const name = document.createElement('span');
                    const quantity = Number(item.quantity);
                    name.textContent = `${getGiftName(item.gift_type)}${quantity > 1 ? ` x${quantity}` : ''}`;
                    const cost = document.createElement('span');
                    cost.className = 'history-cost';
                    cost.textContent = `(-${String(item.cost ?? '')} ${t('积分', 'points')})`;
                    const time = document.createElement('div');
                    time.className = 'history-time';
                    time.textContent = formatTime(item.created_at);
                    gift.append(icon, name, cost, getDeliveryStatusBadge(item));
                    row.append(gift, time);
                    return row;
                });
                historyDiv.replaceChildren(...rows);
            } else {
                showHistoryMessage(historyDiv, t('暂无兑换记录', 'No exchange history'));
            }
        } catch (error) {
            console.error('加载兑换记录失败:', error);
            showHistoryMessage(
                document.getElementById('exchangeHistory'),
                t('加载失败，请刷新重试', 'Load failed, please refresh and retry')
            );
        }
    }

    function showHistoryMessage(container, message) {
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.textContent = message;
        container.replaceChildren(loading);
    }

    
    function getGiftIcon(giftType) {
        const icons = {
            'heartbox': 'BOX',
            'fanlight': 'FAN',
            'tiedu_one': 'ADM',
            'deepsea_singer': 'PAR',
            'sky_throne': 'SKY',
            'proposal': 'PRP',
            'wonderland': 'WON',
            'white_bride': 'WB',
            'crystal_ball': 'ORB',
            'bobo': 'BB'
        };
        return icons[giftType] || 'GFT';
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
        const statusTexts = {
            'pending': t('等待发送', 'Pending'),
            'processing': t('发送中', 'Sending'),
            'success': t('发送成功', 'Sent'),
            'partial_success': t('部分成功', 'Partial'),
            'failed': t('发送失败', 'Failed'),
            'timeout': t('排队超时，已退款', 'Queue timed out, refunded'),
            'uncertain': t('结果待确认', 'Awaiting confirmation'),
            'no_room': t('无房间号', 'No Room')
        };
        
        const text = statusTexts[status] || t('未知状态', 'Unknown');
        const allowedStatus = Object.prototype.hasOwnProperty.call(statusTexts, status) ? status : 'unknown';
        const badge = document.createElement('span');
        badge.className = `delivery-status delivery-status-${allowedStatus}`;
        badge.textContent = text;
        return badge;
    }

    
    let lastHistory = [];
    
    
    function checkStatusChanges(newHistory) {
        if (lastHistory.length === 0) {
            lastHistory = [...newHistory];
            return;
        }
        
        
        for (const newItem of newHistory) {
            const oldItem = lastHistory.find(item => item.id === newItem.id);
            
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
                            `礼物${getGiftName(newItem.gift_type)}发送失败，已退还积分。`,
                            `Gift ${getGiftName(newItem.gift_type)} failed to send. Points refunded.`
                        ), 'error');
                    }
                } else if (newItem.delivery_status === 'timeout') {
                    showMessage(t(
                        `礼物${getGiftName(newItem.gift_type)}排队超时，积分已退还。`,
                        `Gift ${getGiftName(newItem.gift_type)} timed out in queue. Points were refunded.`
                    ), 'error');
                } else if (newItem.delivery_status === 'uncertain') {
                    showMessage(t(
                        `礼物${getGiftName(newItem.gift_type)}已被发送服务领取，但结果尚未确认，请勿重复兑换。`,
                        `Gift ${getGiftName(newItem.gift_type)} was claimed by the sender, but the result is not confirmed. Do not exchange it again.`
                    ), 'info');
                }
            }
        }
        
        lastHistory = [...newHistory];
    }

    
    function showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        const allowedType = ['success', 'error', 'info'].includes(type) ? type : 'info';
        messageDiv.className = `gift-toast gift-toast-${allowedType}`;
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
        let pkState = { running: false, desiredRunning: false, transition: null };
        let pkStateGeneration = 0;
        let pkStatusRequestId = 0;
        let pkStatusTimer = null;

        function renderPkStatus(state) {
            if (!pkToggleBtn) return;
            const transitioning = state.transition === 'start' || state.transition === 'stop';
            const desiredRunning = transitioning
                ? state.transition === 'start'
                : typeof state.desiredRunning === 'boolean'
                    ? state.desiredRunning
                    : !!state.running;
            pkState = {
                running: !!state.running,
                desiredRunning,
                transition: transitioning ? state.transition : null
            };

            pkToggleBtn.classList.toggle('stop', desiredRunning);
            pkToggleBtn.textContent = desiredRunning
                ? t('关闭自动打PK', 'Stop Auto PK')
                : t('开启自动打PK', 'Start Auto PK');
            pkToggleBtn.disabled = transitioning;
            pkToggleBtn.setAttribute('aria-busy', String(transitioning));
            if (pkStatusText) {
                if (state.transition === 'start') {
                    pkStatusText.textContent = t('状态：启动中', 'Status: Starting');
                } else if (state.transition === 'stop') {
                    pkStatusText.textContent = t('状态：停止中', 'Status: Stopping');
                } else {
                    pkStatusText.textContent = state.running
                        ? t('状态：运行中', 'Status: Running')
                        : t('状态：未运行', 'Status: Stopped');
                }
            }
        }

        function schedulePkStatusRefresh(delay, generation = pkStateGeneration) {
            clearTimeout(pkStatusTimer);
            if (document.visibilityState === 'hidden') return;
            pkStatusTimer = setTimeout(() => updatePkStatus(generation), delay);
        }

        async function updatePkStatus(generation = pkStateGeneration) {
            if (!pkToggleBtn) return;
            const requestId = ++pkStatusRequestId;
            try {
                const response = await fetch('/api/pk/status', { cache: 'no-store' });
                const result = await response.json();
                if (generation !== pkStateGeneration || requestId !== pkStatusRequestId) return;
                if (!response.ok || result.success !== true) {
                    throw new Error(result.message || `HTTP ${response.status}`);
                }
                renderPkStatus({
                    running: !!result.running,
                    desiredRunning: typeof result.desiredRunning === 'boolean'
                        ? result.desiredRunning
                        : !!result.running,
                    transition: result.transition || null
                });
                schedulePkStatusRefresh(result.transition ? 1000 : 5000, generation);
            } catch (error) {
                if (generation !== pkStateGeneration || requestId !== pkStatusRequestId) return;
                console.error('PK status error:', error);
                schedulePkStatusRefresh(3000, generation);
            }
        }

        async function togglePk() {
            if (!pkToggleBtn) return;
            const isStopping = pkState.desiredRunning;
            const desiredRunning = !isStopping;
            const generation = ++pkStateGeneration;
            clearTimeout(pkStatusTimer);
            renderPkStatus({
                running: pkState.running,
                desiredRunning,
                transition: desiredRunning ? 'start' : 'stop'
            });
            pkToggleBtn.disabled = true;
            try {
                const path = isStopping ? '/api/pk/stop' : '/api/pk/start';
                const response = await window.idempotentFetch(path, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken || ''
                    },
                    body: JSON.stringify({})
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    showMessage(translateServerMessage(result.message) || t('操作失败', 'Action failed'), 'error');
                    await updatePkStatus(generation);
                } else {
                    schedulePkStatusRefresh(250, generation);
                }
            } catch (error) {
                console.error('PK toggle error:', error);
                showMessage(t('操作失败', 'Action failed'), 'error');
                await updatePkStatus(generation);
            }
        }

        if (pkToggleBtn) {
            pkToggleBtn.addEventListener('click', togglePk);
            updatePkStatus();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    updatePkStatus(pkStateGeneration);
                } else {
                    clearTimeout(pkStatusTimer);
                }
            });
        }

        
        document.querySelectorAll('.gift-button[data-gift][data-cost]').forEach((button) => {
            const giftType = button.dataset.gift;
            const cost = Number(button.dataset.cost);
            const quantityInput = document.getElementById(`${giftType}-quantity`);
            if (!quantityInput || !Number.isSafeInteger(cost) || cost < 0) return;

            quantityInput.addEventListener('input', () => updateGiftTotal(giftType, cost));
            quantityInput.addEventListener('change', () => {
                const minimum = Number(quantityInput.min) || 1;
                const maximum = Number(quantityInput.max) || 100;
                const value = Number.parseInt(quantityInput.value, 10);
                quantityInput.value = String(Math.min(maximum, Math.max(
                    minimum,
                    Number.isFinite(value) ? value : minimum
                )));
                updateGiftTotal(giftType, cost);
            });
        });
    });
