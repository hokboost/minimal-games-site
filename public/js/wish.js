        const csrfToken = document.body.dataset.csrfToken || '';
        let wishProgress = { total_wishes: 0, consecutive_fails: 0, total_spent: 0, total_rewards_value: 0 };
        const canWishTest = document.body.dataset.canTest === 'true';

        const giftConfigs = {
            deepsea_singer: { name: '深海歌姬', cost: 500, overallRateText: '1.6%', guaranteeCount: 148, rewardValue: 30000 },
            sky_throne: { name: '飞天转椅', cost: 250, overallRateText: '2.49%', guaranteeCount: 83, rewardValue: 10000 },
            proposal: { name: '原地求婚', cost: 208, overallRateText: '3.98%', guaranteeCount: 52, rewardValue: 5200 },
            wonderland: { name: '梦游仙境', cost: 150, overallRateText: '4.97%', guaranteeCount: 41, rewardValue: 3000 },
            white_bride: { name: '纯白花嫁', cost: 75, overallRateText: '5.7%', guaranteeCount: 34, rewardValue: 1314 },
            crystal_ball: { name: '水晶球', cost: 66, overallRateText: '6.58%', guaranteeCount: 32, rewardValue: 1000 },
            bobo: { name: '啵啵', cost: 50, overallRateText: '12.45%', guaranteeCount: 16, rewardValue: 399 }
        };

        let currentGiftType = 'deepsea_singer';
        
        function showModal(isSuccess, reward = null, rewardValue = 0, isGuaranteed = false) {
            const modal = document.getElementById('fullscreenModal');
            const content = document.getElementById('modalContent');
            
            if (isSuccess) {
                content.innerHTML = `
                    <div>🎉 祈愿成功！</div>
                    <div style="font-size: 2rem; margin: 15px 0;">🧜‍♀️ ${reward || '深海歌姬'}</div>
                    <div style="font-size: 1.5rem; color: #f39c12;">价值: ${rewardValue || 30000} 电币</div>
                    <div style="font-size: 1rem; color: #ccc; margin-top: 8px;">已放入背包，可在个人资料中送出</div>
                    ${isGuaranteed ? '<div style="font-size: 1rem; color: #e74c3c; margin-top: 10px;">保底出货</div>' : ''}
                `;
                content.className = 'modal-content modal-success';
            } else {
                content.textContent = '😢 祈愿失败，再接再厉！';
                content.className = 'modal-content modal-failure';
            }
            
            modal.style.display = 'flex';
            
            // 3秒后自动关闭，点击可提前关闭
            setTimeout(() => {
                if (modal.style.display === 'flex') {
                    modal.style.display = 'none';
                }
            }, 3000);
        }
        
        function setCurrentGift(giftType) {
            currentGiftType = giftType;
            const config = giftConfigs[giftType];
            if (!config) return;
        }

        async function selectGift(giftType) {
            setCurrentGift(giftType);
            await loadWishProgress();
        }

        async function makeWish(giftType, count) {
            setCurrentGift(giftType);
            const config = giftConfigs[giftType];
            const totalCost = config.cost * count;
            const currentBalance = parseInt(document.getElementById('current-balance').textContent);

            if (currentBalance < totalCost) {
                alert(`⚡ 电币不足！当前余额: ${currentBalance} 电币，需要: ${totalCost} 电币。仅供娱乐，虚拟电币不可兑换真实货币。`);
                return;
            }

            const buttons = document.querySelectorAll(`.gift-card[data-gift="${giftType}"] .gift-action-btn`);
            buttons.forEach(btn => btn.disabled = true);
            
            try {
                const response = await fetch(count === 10 ? '/api/wish-batch' : '/api/wish/play', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({
                        giftType: giftType,
                        batchCount: count === 10 ? 10 : undefined
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // 更新本地进度数据
                    wishProgress = result.progress;
                    
                    if (typeof result.newBalance === 'number') {
                        document.getElementById('current-balance').textContent = result.newBalance;
                    }
                    
                    // 显示结果
                    if (count === 10) {
                        const modal = document.getElementById('fullscreenModal');
                        const content = document.getElementById('modalContent');
                        const rate = ((result.successCount / count) * 100).toFixed(2);
                        content.textContent = `${config.name} 十连完成！成功${result.successCount}次 (${rate}%)`;
                        content.className = result.successCount > 0 ? 'modal-content modal-success' : 'modal-content modal-failure';
                        modal.style.display = 'flex';
                        setTimeout(() => {
                            modal.style.display = 'none';
                        }, 3000);
                    } else if (result.wishSuccess) {
                        showModal(true, result.reward, result.rewardValue, result.isGuaranteed);
                    } else {
                        showModal(false);
                    }
                    
                    updateDisplayNew();
                } else {
                    alert('祈愿失败：' + result.message);
                }
            } catch (error) {
                console.error('Error:', error);
                alert('网络错误，请重试');
            } finally {
                buttons.forEach(btn => btn.disabled = false);
            }
        }
        
        // 页面加载时获取祈愿进度
        async function loadWishProgress() {
            try {
                const response = await fetch(`/api/wish/progress?giftType=${currentGiftType}`);
                const result = await response.json();
                
                if (result.success) {
                    wishProgress = result.progress;
                    if (result.progress && result.progress.gift_name) {
                        setCurrentGift(currentGiftType);
                    }
                    updateDisplayNew();
                }
            } catch (error) {
                console.error('加载祈愿进度失败:', error);
            }
        }

        function updateDisplayNew() {
            updateGiftProgressDisplay(currentGiftType, wishProgress);
        }

        function updateGiftProgressDisplay(giftType, progressData) {
            const config = giftConfigs[giftType];
            if (!config) return;

            const bar = document.querySelector(`[data-progress-bar="${giftType}"]`);
            const text = document.querySelector(`[data-progress-text="${giftType}"]`);
            if (!bar || !text) return;

            if (config.guaranteeCount) {
                const percent = (progressData.consecutive_fails / config.guaranteeCount) * 100;
                bar.style.width = `${Math.min(percent, 100)}%`;
                text.textContent = `${progressData.consecutive_fails} / ${config.guaranteeCount}`;

                if (progressData.consecutive_fails >= (config.guaranteeCount - 1)) {
                    bar.style.background = 'linear-gradient(45deg, #f39c12, #e67e22)';
                } else {
                    bar.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a24)';
                }
            } else {
                bar.style.width = '0%';
                text.textContent = '无保底';
                bar.style.background = 'linear-gradient(45deg, #ff6b6b, #ee5a24)';
            }
        }

        async function loadAllGiftProgress() {
            const giftTypes = Object.keys(giftConfigs);
            await Promise.all(giftTypes.map(async (giftType) => {
                try {
                    const response = await fetch(`/api/wish/progress?giftType=${giftType}`);
                    const result = await response.json();
                    if (result.success) {
                        updateGiftProgressDisplay(giftType, result.progress);
                    }
                } catch (error) {
                    console.error('加载祈愿进度失败:', error);
                }
            }));
        }
        
        // 初始化显示
        setCurrentGift(currentGiftType);
        loadAllGiftProgress();
        
        // 飘屏管理器
        class DanmakuManager {
            constructor() {
                this.container = document.getElementById('danmaku-container');
                this.usedLanes = new Set(); // 避免重叠
                this.maxLanes = Math.floor((window.innerHeight - 200) / 50);
            }
            
            addMessage(data) {
                const message = document.createElement('div');
                message.className = 'danmaku-message';
                message.textContent = data.content;
                
                // 随机选择不重叠的轨道
                const lane = this.getAvailableLane();
                message.style.top = `${lane * 50 + 100}px`;
                
                this.container.appendChild(message);
                
                // 12秒后移除
                setTimeout(() => {
                    if (message.parentNode) {
                        message.parentNode.removeChild(message);
                    }
                    this.usedLanes.delete(lane);
                }, 12000);
                
                this.usedLanes.add(lane);
            }
            
            getAvailableLane() {
                for (let i = 0; i < this.maxLanes; i++) {
                    if (!this.usedLanes.has(i)) {
                        return i;
                    }
                }
                // 如果没有空闲轨道，随机选择一个
                return Math.floor(Math.random() * this.maxLanes);
            }
        }
        
        const danmakuManager = new DanmakuManager();
        
        // WebSocket连接
        let socket;
        
        function initSocket() {
            console.log('初始化Socket连接...');
            socket = io();
            
            socket.on('connect', () => {
                console.log('Socket连接成功！');
            });
            
            socket.on('disconnect', () => {
                console.log('Socket连接断开');
            });
            
            // 监听新飘屏消息
            socket.on('new_danmaku', (data) => {
                console.log('收到飘屏消息:', data);
                danmakuManager.addMessage(data);
            });
            
            // 接收历史消息
            socket.on('recent_messages', (messages) => {
                console.log('收到历史消息:', messages);
                // 显示最近的3条成功消息
                messages.slice(0, 3).forEach((msg, index) => {
                    setTimeout(() => {
                        danmakuManager.addMessage(msg);
                    }, index * 1000);
                });
            });
        }
        
        // 页面加载完成后初始化Socket
        document.addEventListener('DOMContentLoaded', function() {
            initSocket();
        });
        
        async function simulateWish(giftType) {
            if (!canWishTest) return;
            try {
                const response = await fetch('/api/wish/simulate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': csrfToken
                    },
                    body: JSON.stringify({
                        giftType: giftType,
                        count: 100000
                    })
                });

                const result = await response.json();
                if (!result.success) {
                    alert(result.message || '测试失败');
                    return;
                }

                const modal = document.getElementById('fullscreenModal');
                const content = document.getElementById('modalContent');
                content.textContent = `${result.giftName} 10万次测试：成功${result.successCount}次，命中率 ${result.rate}`;
                content.className = result.successCount > 0 ? 'modal-content modal-success' : 'modal-content modal-failure';
                modal.style.display = 'flex';
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 4000);
            } catch (error) {
                console.error('测试失败:', error);
                alert('网络错误，请重试');
            }
        }

        function openProbabilityModal() {
            const list = document.getElementById('probabilityList');
            const entries = Object.values(giftConfigs).map(item => {
                return `• ${item.name}：综合概率 ${item.overallRateText}`;
            }).join('<br>');
            list.innerHTML = entries;
            document.getElementById('probabilityModal').style.display = 'flex';
        }

        function closeProbabilityModal() {
            document.getElementById('probabilityModal').style.display = 'none';
        }

        // 点击弹窗直接关闭
        document.getElementById('fullscreenModal').addEventListener('click', function() {
            this.style.display = 'none';
        });

        document.getElementById('probabilityModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeProbabilityModal();
            }
        });

        // 显示管理员测试按钮
        if (canWishTest) {
            document.querySelectorAll('.admin-test-btn').forEach((btn) => {
                btn.style.display = 'inline-block';
                btn.addEventListener('click', () => simulateWish(btn.dataset.gift));
            });
        }

        document.querySelectorAll('.gift-card').forEach((card) => {
            card.addEventListener('click', (event) => {
                if (event.target.closest('button')) {
                    return;
                }
                selectGift(card.dataset.gift);
            });
        });
    

        const openProbabilityBtn = document.getElementById('open-probability');
        if (openProbabilityBtn) {
            openProbabilityBtn.addEventListener('click', openProbabilityModal);
        }
        const closeProbabilityBtn = document.getElementById('close-probability');
        if (closeProbabilityBtn) {
            closeProbabilityBtn.addEventListener('click', closeProbabilityModal);
        }

        document.querySelectorAll('.gift-action-btn[data-count]').forEach((btn) => {
            btn.addEventListener('click', (event) => {
                event.stopPropagation();
                makeWish(btn.dataset.gift, Number(btn.dataset.count));
            });
        });
