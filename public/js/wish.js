        const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
        const t = (zh, en) => (lang === 'zh' ? zh : en);
        const translateServerMessage = window.translateServerMessage || ((message) => message);
        let csrfToken = document.body.dataset.csrfToken || '';
        let wishProgress = { total_wishes: 0, consecutive_fails: 0, total_spent: 0, total_rewards_value: 0 };
        const canWishTest = document.body.dataset.canTest === 'true';

        const giftNames = {
            deepsea_singer: { zh: '深海歌姬', en: 'Deep Sea Diva' },
            sky_throne: { zh: '飞天转椅', en: 'Sky Throne' },
            proposal: { zh: '原地求婚', en: 'On-the-Spot Proposal' },
            wonderland: { zh: '梦游仙境', en: 'Wonderland Dream' },
            white_bride: { zh: '纯白花嫁', en: 'Pure White Bride' },
            crystal_ball: { zh: '水晶球', en: 'Crystal Ball' },
            bobo: { zh: '啵啵', en: 'Bubbles' }
        };

        const giftConfigs = {
            deepsea_singer: { name: giftNames.deepsea_singer[lang], cost: 500, overallRateText: '1.6%', guaranteeCount: 148, rewardValue: 30000 },
            sky_throne: { name: giftNames.sky_throne[lang], cost: 250, overallRateText: '2.49%', guaranteeCount: 83, rewardValue: 10000 },
            proposal: { name: giftNames.proposal[lang], cost: 208, overallRateText: '3.98%', guaranteeCount: 52, rewardValue: 5200 },
            wonderland: { name: giftNames.wonderland[lang], cost: 150, overallRateText: '4.97%', guaranteeCount: 41, rewardValue: 3000 },
            white_bride: { name: giftNames.white_bride[lang], cost: 75, overallRateText: '5.7%', guaranteeCount: 34, rewardValue: 1314 },
            crystal_ball: { name: giftNames.crystal_ball[lang], cost: 66, overallRateText: '6.58%', guaranteeCount: 32, rewardValue: 1000 },
            bobo: { name: giftNames.bobo[lang], cost: 50, overallRateText: '12.45%', guaranteeCount: 16, rewardValue: 399 }
        };

        let currentGiftType = 'deepsea_singer';
        
        function showModal(isSuccess, reward = null, rewardValue = 0, isGuaranteed = false) {
            const modal = document.getElementById('fullscreenModal');
            const content = document.getElementById('modalContent');
            
            if (isSuccess) {
                content.innerHTML = `
                    <div>🎉 ${t('祈愿成功！', 'Wish Success!')}</div>
                    <div style="font-size: 2rem; margin: 15px 0;">🧜‍♀️ ${reward || giftNames.deepsea_singer[lang]}</div>
                    <div style="font-size: 1.5rem; color: #f39c12;">${t('价值', 'Value')}: ${rewardValue || 30000} ${t('电币', 'coins')}</div>
                    <div style="font-size: 1rem; color: #ccc; margin-top: 8px;">${t('已放入背包，可在个人资料中送出', 'Added to backpack, can be sent from your profile')}</div>
                    ${isGuaranteed ? `<div style="font-size: 1rem; color: #e74c3c; margin-top: 10px;">${t('保底出货', 'Guaranteed drop')}</div>` : ''}
                `;
                content.className = 'modal-content modal-success';
            } else {
                content.textContent = t('😢 祈愿失败，再接再厉！', '😢 Wish failed, try again!');
                content.className = 'modal-content modal-failure';
            }
            
            modal.style.display = 'flex';
            
            
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

        async function refreshCsrf() {
            try {
                const resp = await fetch('/wish', { credentials: 'same-origin' });
                const html = await resp.text();
                const match = html.match(/data-csrf-token="([^"]+)"/);
                if (match && match[1]) {
                    csrfToken = match[1];
                }
            } catch (e) {
                console.error(t('刷新CSRF失败:', 'Failed to refresh CSRF:'), e);
            }
        }

        async function makeWish(giftType, count) {
            setCurrentGift(giftType);
            const config = giftConfigs[giftType];
            const totalCost = config.cost * count;
            const currentBalance = parseInt(document.getElementById('current-balance').textContent);

            if (currentBalance < totalCost) {
                alert(t(
                    `⚡ 电币不足！当前余额: ${currentBalance} 电币，需要: ${totalCost} 电币。仅供娱乐，虚拟电币不可兑换真实货币。`,
                    `⚡ Insufficient coins! Balance: ${currentBalance}, needed: ${totalCost}. For entertainment only, virtual coins cannot be exchanged for real money.`
                ));
                return;
            }

            const buttons = document.querySelectorAll(`.gift-card[data-gift="${giftType}"] .gift-action-btn`);
            buttons.forEach(btn => btn.disabled = true);
            
            try {
                if (!csrfToken) {
                    await refreshCsrf();
                }
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
                
                if (response.status === 401 || response.status === 403) {
                    await refreshCsrf();
                    alert(t('登录状态失效或令牌过期，请刷新后重试', 'Login expired or token invalid, please refresh and retry'));
                    return;
                }
                
                const result = await response.json();
                
                if (result.success) {
                    
                    wishProgress = result.progress;
                    
                    if (typeof result.newBalance === 'number') {
                        document.getElementById('current-balance').textContent = result.newBalance;
                    }
                    
                    
                    if (count === 10) {
                        const modal = document.getElementById('fullscreenModal');
                        const content = document.getElementById('modalContent');
                        const rate = ((result.successCount / count) * 100).toFixed(2);
                        content.textContent = t(
                            `${config.name} 十连完成！成功${result.successCount}次 (${rate}%)`,
                            `${config.name} 10x complete! Success ${result.successCount} (${rate}%)`
                        );
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
                    alert(t('祈愿失败：', 'Wish failed: ') + translateServerMessage(result.message));
                }
            } catch (error) {
                console.error('Error:', error);
                alert(t('网络错误，请重试', 'Network error, please try again'));
            } finally {
                buttons.forEach(btn => btn.disabled = false);
            }
        }
        
        
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
                console.error(t('加载祈愿进度失败:', 'Failed to load wish progress:'), error);
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
                text.textContent = t('无保底', 'No guarantee');
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
                    console.error(t('加载祈愿进度失败:', 'Failed to load wish progress:'), error);
                }
            }));
        }
        
        
        setCurrentGift(currentGiftType);
        loadAllGiftProgress();
        
        
        class DanmakuManager {
            constructor() {
                this.container = document.getElementById('danmaku-container');
                this.usedLanes = new Set(); 
                this.maxLanes = Math.floor((window.innerHeight - 200) / 50);
            }
            
            addMessage(data) {
                const message = document.createElement('div');
                message.className = 'danmaku-message';
                message.textContent = data.content;
                
                
                const lane = this.getAvailableLane();
                message.style.top = `${lane * 50 + 100}px`;
                
                this.container.appendChild(message);
                
                
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
                
                return Math.floor(Math.random() * this.maxLanes);
            }
        }
        
        const danmakuManager = new DanmakuManager();
        
        
        let socket;
        
        function initSocket() {
            console.log(t('初始化Socket连接...', 'Initializing socket connection...'));
            socket = io();
            
            socket.on('connect', () => {
                console.log(t('Socket连接成功！', 'Socket connected'));
            });
            
            socket.on('disconnect', () => {
                console.log(t('Socket连接断开', 'Socket disconnected'));
            });
            
            
            socket.on('new_danmaku', (data) => {
                console.log(t('收到飘屏消息:', 'New danmaku:'), data);
                danmakuManager.addMessage(data);
            });
            
            
            socket.on('recent_messages', (messages) => {
                console.log(t('收到历史消息:', 'Recent messages:'), messages);
                
                messages.slice(0, 3).forEach((msg, index) => {
                    setTimeout(() => {
                        danmakuManager.addMessage(msg);
                    }, index * 1000);
                });
            });
        }
        
        
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
                    alert(translateServerMessage(result.message) || t('测试失败', 'Test failed'));
                    return;
                }

                const modal = document.getElementById('fullscreenModal');
                const content = document.getElementById('modalContent');
                const giftLabelZh = giftNames[giftType]?.zh || result.giftName;
                const giftLabelEn = giftNames[giftType]?.en || result.giftName;
                content.textContent = t(
                    `${giftLabelZh} 10万次测试：成功${result.successCount}次，命中率 ${result.rate}`,
                    `${giftLabelEn} 100k test: success ${result.successCount}, hit rate ${result.rate}`
                );
                content.className = result.successCount > 0 ? 'modal-content modal-success' : 'modal-content modal-failure';
                modal.style.display = 'flex';
                setTimeout(() => {
                    modal.style.display = 'none';
                }, 4000);
            } catch (error) {
                console.error(t('测试失败:', 'Test failed:'), error);
                alert(t('网络错误，请重试', 'Network error, please try again'));
            }
        }

        function openProbabilityModal() {
            const list = document.getElementById('probabilityList');
            const entries = Object.values(giftConfigs).map(item => {
                return `• ${item.name} ${t('综合概率', 'Overall rate')}: ${item.overallRateText}`;
            }).join('<br>');
            list.innerHTML = entries;
            document.getElementById('probabilityModal').style.display = 'flex';
        }

        function closeProbabilityModal() {
            document.getElementById('probabilityModal').style.display = 'none';
        }

        
        document.getElementById('fullscreenModal').addEventListener('click', function() {
            this.style.display = 'none';
        });

        document.getElementById('probabilityModal').addEventListener('click', function(e) {
            if (e.target === this) {
                closeProbabilityModal();
            }
        });

        
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
