const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
const t = (zh, en) => (lang === 'zh' ? zh : en);
const translateServerMessage = window.translateServerMessage || ((message) => message);
const parsePageConfig = (name, fallback) => {
    try {
        return JSON.parse(decodeURIComponent(document.body.dataset[name] || ''));
    } catch {
        return fallback;
    }
};
const gameCatalog = parsePageConfig('gameCatalog', []);
const gameDefinitions = new Map(gameCatalog.map((game) => [game.id, game]));
const recordViews = parsePageConfig('recordViews', {});
const publicWishConfigs = parsePageConfig('wishConfigs', {});
const giftNameMap = Object.fromEntries(Object.entries(publicWishConfigs).map(([giftType, config]) => [
    giftType,
    { zh: config.nameZh, en: config.nameEn }
]));
const giftNameByZh = Object.fromEntries(
    Object.values(giftNameMap).map(({ zh, en }) => [zh, en])
);
const getWishGiftName = (giftType, giftName) => {
    if (lang === 'zh') {
        return giftName || giftNameMap[giftType]?.zh || giftType || '';
    }
    return giftNameMap[giftType]?.en || giftNameByZh[giftName] || giftName || giftType || '';
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
        
        const definition = gameDefinitions.get(gameType);
        document.getElementById('recordsTitle').textContent = definition
            ? `${lang === 'zh' ? definition.titleZh : definition.titleEn} · ${t('记录', 'Records')}`
            : t('游戏记录', 'Game Records');
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
            
            if (data.success && Array.isArray(data.recordRows)) {
                renderGameRecords(data.recordRows, gameType);
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

    function renderGameRecords(recordRows, gameType) {
        const recordsContent = document.getElementById('recordsContent');
        
        if (recordRows.length === 0) {
            showContainerMessage(recordsContent, t('暂无游戏记录', 'No game records'));
            return;
        }
        const view = recordViews[gameType];
        const headers = lang === 'zh' ? view?.headersZh : view?.headersEn;
        if (!headers) {
            showContainerMessage(recordsContent, t('记录类型无效', 'Invalid record type'));
            return;
        }
        const { table, tbody } = createRecordsTable(headers);

        recordRows.forEach((row) => {
            const cells = Array.isArray(row?.cells) ? row.cells : [];
            appendRecordRow(tbody, cells.map((cell) => cell?.[lang === 'zh' ? 'zh' : 'en'] ?? ''));
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
