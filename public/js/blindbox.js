(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const translateServerMessage = window.translateServerMessage || ((message) => message);

    const { csrfToken } = document.body.dataset;
    const tierGrid = document.getElementById('tierGrid');
    const countGroup = document.getElementById('countGroup');
    const openBtn = document.getElementById('openBtn');
    const rateBtn = document.getElementById('rateBtn');
    const rateModal = document.getElementById('rateModal');
    const rateContent = document.getElementById('rateContent');
    const rateClose = document.getElementById('rateClose');
    const summaryText = document.getElementById('summaryText');
    const balanceEl = document.getElementById('current-balance');
    const resultPanel = document.getElementById('resultPanel');
    const resultList = document.getElementById('resultList');
    const noticeText = document.getElementById('noticeText');

    let selectedTier = tierGrid.querySelector('.tier-card')?.dataset.tier || '';
    let selectedCost = Number(tierGrid.querySelector('.tier-card')?.dataset.cost || 0);
    let selectedCount = Number(countGroup.querySelector('.count-btn.active')?.dataset.count || 1);

    function updateSummary() {
        const totalCost = selectedCost * selectedCount;
        summaryText.textContent = t(`本次消耗 ${totalCost} 电币`, `Cost ${totalCost} coins`);
    }

    function updateActiveTier(card) {
        tierGrid.querySelectorAll('.tier-card').forEach((item) => item.classList.remove('active'));
        card.classList.add('active');
        selectedTier = card.dataset.tier;
        selectedCost = Number(card.dataset.cost || 0);
        updateSummary();
    }

    function updateActiveCount(button) {
        countGroup.querySelectorAll('.count-btn').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        selectedCount = Number(button.dataset.count || 1);
        updateSummary();
    }

    function parseBalance() {
        const raw = balanceEl?.textContent || '';
        const num = Number(raw.replace(/[^\d.-]/g, ''));
        return Number.isFinite(num) ? num : null;
    }

    tierGrid.addEventListener('click', (event) => {
        const card = event.target.closest('.tier-card');
        if (card) {
            updateActiveTier(card);
        }
    });

    countGroup.addEventListener('click', (event) => {
        const button = event.target.closest('.count-btn');
        if (button) {
            updateActiveCount(button);
        }
    });

    openBtn.addEventListener('click', async () => {
        if (!selectedTier || !selectedCost || !selectedCount) {
            return;
        }

        const totalCost = selectedCost * selectedCount;
        const currentBalance = parseBalance();
        if (currentBalance !== null && currentBalance < totalCost) {
            summaryText.textContent = t('电币不足，无法开启', 'Insufficient coins');
            return;
        }

        openBtn.disabled = true;
        summaryText.textContent = t('开启中...', 'Opening...');

        if (currentBalance !== null) {
            balanceEl.textContent = currentBalance - totalCost;
        }

        try {
            const response = await fetch('/api/blindbox/open', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken || ''
                },
                body: JSON.stringify({
                    tier: selectedTier,
                    count: selectedCount
                })
            });

            const result = await response.json();
            if (!result.success) {
                summaryText.textContent = translateServerMessage(result.message) || t('开启失败', 'Open failed');
                if (Number.isFinite(result.balanceAfter)) {
                    balanceEl.textContent = result.balanceAfter;
                } else if (currentBalance !== null) {
                    balanceEl.textContent = currentBalance;
                }
                return;
            }

            if (Number.isFinite(result.balanceAfter)) {
                balanceEl.textContent = result.balanceAfter;
            }

            resultPanel.style.display = 'block';
            resultList.innerHTML = '';
            result.rewards.forEach((item) => {
                const div = document.createElement('div');
                div.className = 'result-item';
                div.innerHTML = `
                    <strong>${item.name}</strong>
                    <span>${t('价值', 'Value')}: ${item.value} ${t('电币', 'coins')}</span>
                `;
                resultList.appendChild(div);
            });

            if (result.queued) {
                noticeText.textContent = t(
                    '奖励已按价值从高到低加入送礼队列，余额不足会自动停止并回退其余礼物。',
                    'Rewards are queued from highest to lowest. If balance is insufficient, sending stops and remaining gifts return to your backpack.'
                );
            } else if (result.enqueueMessage) {
                noticeText.textContent = translateServerMessage(result.enqueueMessage);
            } else {
                noticeText.textContent = t(
                    '奖励已存入背包，绑定房间号后可自动送出。',
                    'Rewards are stored in your backpack. Bind a room ID to send them automatically.'
                );
            }

            summaryText.textContent = t('开启成功', 'Opened');
        } catch (error) {
            console.error('Blindbox error:', error);
            summaryText.textContent = t('开启失败，请稍后重试', 'Open failed, try later');
            if (currentBalance !== null) {
                balanceEl.textContent = currentBalance;
            }
        } finally {
            openBtn.disabled = false;
        }
    });

    function formatPercent(value) {
        const percent = Number(value) * 100;
        if (!Number.isFinite(percent)) {
            return '--';
        }
        if (percent >= 1) {
            return `${percent.toFixed(2)}%`;
        }
        return `${percent.toFixed(3)}%`;
    }

    function renderRates() {
        if (!rateContent) return;
        const config = window.__blindboxRates || {};
        const tierTitles = {
            starmoon: t('星月盲盒', 'Star Moon Box'),
            heart: t('心动盲盒', 'Heart Box'),
            supreme: t('至尊盲盒', 'Supreme Box')
        };
        const sections = Object.keys(config).map((key) => {
            const tier = config[key];
            if (!tier || !Array.isArray(tier.items)) return '';
            const rows = tier.items.map((item) => `
                <tr>
                    <td>${item.name || item.giftId}</td>
                    <td>${formatPercent(item.weight)}</td>
                </tr>
            `).join('');
            return `
                <div class="rate-section">
                    <h4>${tierTitles[key] || key}</h4>
                    <table class="rate-table">
                        <thead>
                            <tr>
                                <th>${t('礼物', 'Gift')}</th>
                                <th>${t('概率', 'Rate')}</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            `;
        }).join('');
        rateContent.innerHTML = sections || `<p>${t('暂无概率信息', 'No rate data')}</p>`;
    }

    if (rateBtn && rateModal) {
        rateBtn.addEventListener('click', () => {
            renderRates();
            rateModal.classList.add('active');
        });
    }
    if (rateClose && rateModal) {
        rateClose.addEventListener('click', () => {
            rateModal.classList.remove('active');
        });
    }
    if (rateModal) {
        rateModal.addEventListener('click', (event) => {
            if (event.target === rateModal) {
                rateModal.classList.remove('active');
            }
        });
    }

    updateSummary();
})();
