const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
const t = (zh, en) => (lang === 'zh' ? zh : en);
const translateServerMessage = window.translateServerMessage || ((message) => message);
const csrfToken = document.body.dataset.csrfToken || '';

function appendStatusDetail(container, label, value, tone = null) {
    const row = document.createElement('div');
    row.className = 'status-detail';
    if (tone === 'error' || tone === 'success') row.classList.add(`status-detail-${tone}`);
    row.textContent = `${label}: ${String(value ?? '-')}`;
    container.appendChild(row);
}

function setCookieStatus(status, state, message) {
    status.classList.remove('cookie-status-neutral', 'cookie-status-managed', 'cookie-status-error', 'cookie-status-success');
    status.classList.add(`cookie-status-${state}`);
    status.textContent = message;
}

function showBindingsMessage(container, message, isError = false) {
    const row = document.createElement('div');
    row.className = `binding-empty${isError ? ' binding-empty-error' : ''}`;
    row.textContent = message;
    container.replaceChildren(row);
}

async function adminFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const requestOptions = { ...options };
    if (method !== 'GET') {
        requestOptions.headers = {
            ...(requestOptions.headers || {}),
            'X-CSRF-Token': csrfToken
        };
    }
    if (method === 'GET') return fetch(url, requestOptions);
    if (typeof window.idempotentFetch !== 'function') {
        return Promise.reject(new Error('Request helper did not load'));
    }
    const execute = () => window.idempotentFetch(url, requestOptions);
    let response = await execute();
    if (response.status !== 403 || url === '/api/admin/reauthenticate') return response;

    const denial = await response.clone().json().catch(() => ({}));
    if (denial.code !== 'RECENT_AUTH_REQUIRED') return response;

    const password = prompt(t('请输入管理员密码以继续：', 'Enter your admin password to continue:'));
    if (!password) return response;

    const authResponse = await fetch('/api/admin/reauthenticate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ password })
    });
    const authResult = await authResponse.json().catch(() => ({}));
    if (!authResponse.ok || !authResult.success) {
        alert(translateServerMessage(authResult.message || t('管理员验证失败', 'Admin verification failed')));
        return response;
    }
    return execute();
}

async function readJsonResponse(response) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok && !data.message) {
        data.message = `${t('请求失败', 'Request failed')} (${response.status})`;
    }
    return data;
}

document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
        const action = actionButton.dataset.action;
        const username = actionButton.dataset.username;
        const balance = actionButton.dataset.balance;

        switch (action) {
            case 'add-point':
                return addElectricCoin(username, actionButton);
            case 'authorize':
                return authorizeUser(username, actionButton);
            case 'unauthorize':
                return unauthorizeUser(username, actionButton);
            case 'reset-password':
                return resetPassword(username, actionButton);
            case 'delete-account':
                return deleteAccount(username, actionButton);
            case 'unlock':
                return unlockAccount(username, actionButton);
            case 'permanent-lock':
                return permanentLock(username, actionButton);
            case 'permanent-unlock':
                return permanentUnlock(username, actionButton);
            case 'clear-failures':
                return clearFailures(username, actionButton);
            case 'edit-balance':
                return editBalance(username, Number(balance));
            case 'dictation-mark':
                return markDictation(actionButton);
            default:
                return;
        }
    }

    if (event.target.closest('#check-cookie-status')) {
        return checkCookieStatus();
    }
    if (event.target.closest('#unbind-room')) {
        return unbindUserRoom();
    }
    if (event.target.closest('#load-room-bindings')) {
        return loadRoomBindings();
    }
    if (event.target.closest('#change-self-password')) {
        return changeSelfPassword();
    }
});

document.addEventListener('submit', (event) => {
    if (event.target.matches('#bind-room-form')) {
        event.preventDefault();
        bindUserRoom();
    }
    if (event.target.matches('#assign-task-offers-form')) {
        event.preventDefault();
        assignTaskOffers(event.target);
    }
    if (event.target.matches('#assign-event-task-form')) {
        event.preventDefault();
        assignEventTask(event.target);
    }
    if (event.target.matches('#ip-intel-form')) {
        event.preventDefault();
        lookupIpIntelligence(event.target);
    }
});

async function lookupIpIntelligence(form) {
    const output = document.getElementById('ip-intel-result');
    const ip = form.elements.ip.value.trim();
    output.hidden = false;
    output.textContent = t('正在查询…', 'Looking up…');
    try {
        const response = await adminFetch(`/api/admin/ip/${encodeURIComponent(ip)}`);
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || t('查询失败', 'Lookup failed'));
        const rows = [
            [t('风险等级', 'Risk level'), `${data.riskData.level} (${data.riskData.score})`],
            [t('风险原因', 'Risk reasons'), (data.riskData.reasons || []).join('；') || t('无', 'None')],
            ['VPN', data.vpn.available ? (data.vpn.isVpn ? t('检测到', 'Detected') : t('未检测到', 'Not detected')) : t('暂不可用', 'Unavailable')],
            [t('代理', 'Proxy'), data.vpn.available ? String(data.vpn.isProxy) : '-'],
            ['Tor', data.vpn.available ? String(data.vpn.isTor) : '-'],
            [t('数据中心', 'Datacenter'), data.vpn.available ? String(data.vpn.isDatacenter) : '-'],
            [t('VPN 服务', 'VPN service'), data.vpn.vpnService || '-'],
            [t('网络组织', 'Network organization'), data.vpn.organization || '-'],
            [t('历史请求', 'Historical requests'), data.stats.total_requests || 0],
            [t('关联用户数', 'Associated users'), data.stats.unique_users || 0]
        ];
        output.replaceChildren(...rows.map(([label, value]) => {
            const row = document.createElement('div');
            row.className = 'status-detail';
            const strong = document.createElement('strong');
            strong.textContent = `${label}: `;
            row.append(strong, document.createTextNode(String(value)));
            return row;
        }));
    } catch (error) {
        output.textContent = String(error.message || error);
    }
}

async function loadTaskManagement() {
    const templateContainer = document.getElementById('task-template-options');
    const pendingContainer = document.getElementById('pending-task-reviews');
    if (!templateContainer || !pendingContainer) return;
    try {
        const response = await adminFetch('/api/admin/tasks');
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || t('加载失败', 'Load failed'));
        const templateNodes = data.templates.map((template) => {
            const label = document.createElement('label');
            label.className = 'admin-task-template';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'templateId';
            input.value = String(template.id);
            const text = document.createElement('span');
            text.textContent = `${lang === 'zh' ? template.title_zh : template.title_en} · ${Number(template.reward_points).toLocaleString()} ${t('积分', 'points')}`;
            label.append(input, text);
            return label;
        });
        templateContainer.replaceChildren(...templateNodes);

        const pending = [
            ...data.pendingCards.map((task) => ({ ...task, taskType: 'card', title: lang === 'zh' ? task.title_zh : task.title_en })),
            ...data.pendingEvents.map((task) => ({ ...task, taskType: 'event' }))
        ];
        if (pending.length === 0) {
            pendingContainer.textContent = t('目前没有待审核任务。', 'No task is awaiting review.');
            return;
        }
        pendingContainer.replaceChildren(...pending.map((task) => {
            const row = document.createElement('div');
            row.className = 'admin-task-review-row';
            const copy = document.createElement('div');
            const title = document.createElement('strong');
            title.textContent = `${task.username} · ${task.title}`;
            const reward = document.createElement('span');
            reward.textContent = `+${Number(task.reward_points).toLocaleString()} ${t('积分', 'points')}`;
            copy.append(title, reward);
            const actions = document.createElement('div');
            const approve = document.createElement('button');
            approve.type = 'button';
            approve.textContent = t('通过并发奖', 'Approve & reward');
            approve.addEventListener('click', () => reviewTask(task.taskType, task.id, 'approve', approve));
            const returned = document.createElement('button');
            returned.type = 'button';
            returned.className = 'btn-clear';
            returned.textContent = t('退回并延长3天', 'Return + 3 days');
            returned.addEventListener('click', () => reviewTask(task.taskType, task.id, 'return', returned));
            actions.append(approve, returned);
            row.append(copy, actions);
            return row;
        }));
    } catch (error) {
        pendingContainer.textContent = String(error.message || error);
    }
}

async function assignTaskOffers(form) {
    const templateIds = [...form.querySelectorAll('input[name="templateId"]:checked')].map((input) => Number(input.value));
    if (templateIds.length !== 3) return alert(t('请正好选择三张任务卡。', 'Select exactly three task cards.'));
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const response = await adminFetch('/api/admin/tasks/assign-offers', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: form.elements.username.value.trim(), templateIds })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || t('分配失败', 'Assignment failed'));
        alert(data.message);
        await loadTaskManagement();
    } catch (error) {
        alert(String(error.message || error));
    } finally {
        submit.disabled = false;
    }
}

async function assignEventTask(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    values.rewardPoints = Number(values.rewardPoints);
    values.days = Number(values.days);
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
        const response = await adminFetch('/api/admin/tasks/assign-event', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values)
        });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || t('分配失败', 'Assignment failed'));
        alert(data.message);
        form.reset();
        form.elements.days.value = '7';
    } catch (error) {
        alert(String(error.message || error));
    } finally {
        submit.disabled = false;
    }
}

async function reviewTask(taskType, assignmentId, decision, button) {
    const note = prompt(t('审核备注（可留空）：', 'Review note (optional):')) || '';
    button.disabled = true;
    try {
        const response = await adminFetch('/api/admin/tasks/review', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskType, assignmentId: Number(assignmentId), decision, note })
        });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.success) throw new Error(data.message || t('审核失败', 'Review failed'));
        alert(data.message);
        await loadTaskManagement();
    } catch (error) {
        alert(String(error.message || error));
        button.disabled = false;
    }
}

loadTaskManagement();

function addElectricCoin(username, btn) {
        const amount = prompt(t(
            `为用户 "${username}" 添加积分:\n\n请输入要添加的积分数量:`,
            `Add points for "${username}":\n\nEnter point amount:`
        ), '100');
        
        if (amount === null) return; 
        
        const coinAmount = Number(amount);
        
        if (!Number.isSafeInteger(coinAmount)) {
            alert(t('请输入有效的整数积分！', 'Please enter a valid whole number of points.'));
            return;
        }
        
        if (coinAmount <= 0) {
            alert(t('添加数量必须大于0！', 'Amount must be greater than 0.'));
            return;
        }
        
        if (coinAmount > 100000) {
            alert(t('单次添加不能超过100,000积分！', 'Single add cannot exceed 100,000 points.'));
            return;
        }
        
        const confirmAdd = confirm(t(
            `确认为用户 "${username}" 添加 ${coinAmount} 积分？`,
            `Confirm adding ${coinAmount} points to "${username}"?`
        ));
        
        if (!confirmAdd) return;
        
        btn.disabled = true;
        btn.textContent = t('添加中...', 'Adding...');
        
        adminFetch('/api/admin/add-electric-coin', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                },
            body: JSON.stringify({ username, amount: coinAmount })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(t('添加失败: ', 'Add failed: ') + translateServerMessage(data.message));
                return;
            }
            
            alert(t(
                `成功为用户 "${username}" 添加 ${coinAmount} 积分！\n新余额: ${data.newBalance} 积分`,
                `Added ${coinAmount} points to "${username}".\nNew balance: ${data.newBalance} points`
            ));
            location.reload(); 
        })
        .catch(err => {
            console.error('Add electric point error:', err);
            alert(t('添加请求失败，请稍后重试', 'Add request failed, please try again'));
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = t('加积分', 'Add Points');
        });
    }

    function authorizeUser(username, btn) {
        btn.disabled = true;
        adminFetch('/api/admin/authorize-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return alert(t('授权失败: ', 'Authorize failed: ') + translateServerMessage(data.message));
            location.reload();
        })
        .catch(() => alert(t('授权请求失败', 'Authorize request failed')));
    }

    function unauthorizeUser(username, btn) {
        btn.disabled = true;
        adminFetch('/api/admin/unauthorize-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) return alert(t('取消失败: ', 'Revoke failed: ') + translateServerMessage(data.message));
            location.reload();
        })
        .catch(() => alert(t('取消请求失败', 'Revoke request failed')));
    }


    function resetPassword(username, btn) {
        const confirmReset = confirm(t(
            `确定要为用户 "${username}" 生成15分钟有效的一次性重置链接吗？`,
            `Generate a one-time 15-minute reset link for "${username}"?`
        ));
        
        if (!confirmReset) return;
        
        const doubleConfirm = confirm(t(
            `警告：此操作不可撤销！\n\n用户: ${username}\n\n确定继续吗？`,
            `Warning: This cannot be undone!\n\nUser: ${username}\n\nContinue?`
        ));
        
        if (!doubleConfirm) return;
        
        btn.disabled = true;
        btn.textContent = t('重置中...', 'Resetting...');
        
        adminFetch('/api/admin/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(t('重置失败: ', 'Reset failed: ') + translateServerMessage(data.message));
                return;
            }
            
            alert(t(
                `重置链接已生成！\n\n用户: ${username}\n链接: ${location.origin}${data.resetPath}\n\n链接15分钟内有效且只能使用一次。`,
                `Reset link generated.\n\nUser: ${username}\nLink: ${location.origin}${data.resetPath}\n\nThe link expires in 15 minutes and can only be used once.`
            ));
        })
        .catch(err => {
            console.error('Reset password error:', err);
            alert(t('重置请求失败，请稍后重试', 'Reset request failed, please try again'));
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = t('重置密码', 'Reset Password');
        });
    }

    function markDictation(btn) {
        const id = btn.dataset.id;
        const status = btn.dataset.status;
        if (!id || !status) {
            return;
        }
        let message = '';
        if (status === 'wrong' || status === 'rewrite') {
            const input = prompt(
                t('请输入给用户的提示（可留空）：', 'Enter a note for the user (optional):'),
                ''
            );
            if (input === null) {
                return;
            }
            message = input.trim();
        }
        btn.disabled = true;
        adminFetch('/api/admin/dictation/mark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status, message })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(t('操作失败: ', 'Action failed: ') + translateServerMessage(data.message));
                return;
            }
            location.reload();
        })
        .catch(() => alert(t('请求失败，请稍后再试', 'Request failed, please try again')))
        .finally(() => {
            btn.disabled = false;
        });
    }

    function deleteAccount(username, btn) {
        const confirmDelete = confirm(t(
            `危险操作！\n\n确定要停用用户 "${username}" 的账号吗？\n\n用户将无法登录，但资金与安全审计记录会保留。`,
            `Dangerous action!\n\nDeactivate "${username}"?\n\nLogin will be disabled while financial and security audit records remain.`
        ));
        
        if (!confirmDelete) return;
        
        const typeUsername = prompt(t(
            `请输入要停用的用户名以确认操作：\n\n输入 "${username}" 确认停用`,
            `Type the username to confirm deactivation:\n\nType "${username}" to confirm`
        ));
        
        if (typeUsername !== username) {
            if (typeUsername !== null) {
                alert(t('用户名不匹配，操作取消！', 'Username mismatch, canceled.'));
            }
            return;
        }
        
        const finalConfirm = confirm(t(
            `最后确认！\n\n用户: ${username}\n操作: 停用账号并退出全部会话\n\n确定执行吗？`,
            `Final confirmation!\n\nUser: ${username}\nAction: Deactivate account and sign out all sessions\n\nProceed?`
        ));
        
        if (!finalConfirm) return;
        
        btn.disabled = true;
        btn.textContent = t('删除中...', 'Deleting...');
        
        adminFetch('/api/admin/delete-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: username
            })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(t('注销失败: ', 'Delete failed: ') + translateServerMessage(data.message));
                return;
            }
            
            const unresolvedCount = Number(data.unresolvedGiftCount || 0)
                + Number(data.unresolvedPkCount || 0);
            const reconciliationNotice = unresolvedCount > 0
                ? t(
                    `\n\n仍有 ${unresolvedCount} 笔外部发送结果需要人工对账，未自动退款。`,
                    `\n\n${unresolvedCount} external sends still require manual reconciliation and were not auto-refunded.`
                )
                : '';
            alert(`${translateServerMessage(data.message)}${reconciliationNotice}`);
            
            const row = btn.closest('tr');
            row.classList.add('admin-row-removing');
            
            setTimeout(() => {
                row.remove();
            }, 500);
        })
        .catch(err => {
            console.error('Delete account error:', err);
            alert(t('注销请求失败，请稍后重试', 'Delete request failed, please try again'));
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = t('注销账号', 'Delete Account');
        });
    }

    function unlockAccount(username, btn) {
        const confirmUnlock = confirm(t(
            `确定要解锁用户 "${username}" 的账号吗？\n\n这将清除所有登录失败记录。`,
            `Unlock account for "${username}"?\n\nThis clears all login failure records.`
        ));
        
        if (!confirmUnlock) return;
        
        btn.disabled = true;
        btn.textContent = t('解锁中...', 'Unlocking...');
        
        adminFetch('/api/admin/unlock-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(t('解锁失败: ', 'Unlock failed: ') + translateServerMessage(data.message));
                return;
            }
            
            alert(t(
                `账号解锁成功！\n\n用户 "${username}" 现在可以正常登录了。`,
                `Account unlocked.\n\n"${username}" can login now.`
            ));
            location.reload();
        })
        .catch(err => {
            console.error('Unlock account error:', err);
            alert(t('解锁请求失败，请稍后重试', 'Unlock request failed, please try again'));
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = t('解锁', 'Unlock');
        });
    }

    async function permanentLock(username, btn) {
        const reason = prompt(t(
            `请输入永久锁定 "${username}" 的原因（用户登录后只能看到锁定提示）：`,
            `Enter the reason for locking "${username}" (they can still sign in but only see the lock screen):`
        ));
        if (!reason?.trim()) return;
        if (!confirm(t(`确认锁定账号 "${username}"？`, `Lock account "${username}"?`))) return;
        btn.disabled = true;
        try {
            const response = await adminFetch('/api/admin/lock-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, reason: reason.trim() })
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) throw new Error(data.message || t('锁定失败', 'Lock failed'));
            alert(translateServerMessage(data.message));
            location.reload();
        } catch (error) {
            alert(String(error.message || error));
            btn.disabled = false;
        }
    }

    async function permanentUnlock(username, btn) {
        if (!confirm(t(`确认解除 "${username}" 的永久锁定？`, `Remove the permanent lock from "${username}"?`))) return;
        btn.disabled = true;
        try {
            const response = await adminFetch('/api/admin/unlock-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username })
            });
            const data = await readJsonResponse(response);
            if (!response.ok || !data.success) throw new Error(data.message || t('解除失败', 'Unlock failed'));
            alert(translateServerMessage(data.message));
            location.reload();
        } catch (error) {
            alert(String(error.message || error));
            btn.disabled = false;
        }
    }

    function clearFailures(username, btn) {
        const confirmClear = confirm(t(
            `确定要清除用户 "${username}" 的登录失败记录吗？`,
            `Clear login failure records for "${username}"?`
        ));
        
        if (!confirmClear) return;
        
        btn.disabled = true;
        btn.textContent = t('清除中...', 'Clearing...');
        
        adminFetch('/api/admin/clear-failures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert(t('清除失败: ', 'Clear failed: ') + translateServerMessage(data.message));
                return;
            }
            
            alert(t(
                `失败记录清除成功！\n\n用户 "${username}" 的登录失败计数已重置。`,
                `Failures cleared.\n\n"${username}" failure count reset.`
            ));
            location.reload();
        })
        .catch(err => {
            console.error('Clear failures error:', err);
            alert(t('清除请求失败，请稍后重试', 'Clear request failed, please try again'));
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = t('清除', 'Clear');
        });
    }

    function editBalance(username, currentBalance) {
        const newBalance = prompt(t(
            `修改用户 "${username}" 的积分余额:\n\n当前余额: ${currentBalance} 积分\n\n请输入新的积分数量:`,
            `Update balance for "${username}":\n\nCurrent: ${currentBalance} points\n\nEnter new balance:`
        ), currentBalance);
        
        if (newBalance === null) return; 
        
        const balance = Number(newBalance);
        
        if (!Number.isSafeInteger(balance)) {
            alert(t('请输入有效的整数积分！', 'Please enter a valid whole number of points.'));
            return;
        }
        
        if (balance < 0) {
            alert(t('余额不能为负数！', 'Balance cannot be negative.'));
            return;
        }
        if (balance > 100000000) {
            alert(t('余额不能超过100,000,000积分！', 'Balance cannot exceed 100,000,000 points.'));
            return;
        }
        
        const confirmChange = confirm(t(
            `确认修改积分余额？\n\n用户: ${username}\n当前余额: ${currentBalance} 积分\n新余额: ${balance} 积分`,
            `Confirm balance update?\n\nUser: ${username}\nCurrent: ${currentBalance} points\nNew: ${balance} points`
        ));
        
        if (!confirmChange) return;
        
        
        adminFetch('/api/admin/update-balance', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                },
            body: JSON.stringify({ username, balance })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(t(
                    `用户 "${username}" 的积分余额已成功修改为 ${balance} 积分`,
                    `"${username}" balance updated to ${balance} points`
                ));
                location.reload(); 
            } else {
                alert(t('修改失败: ', 'Update failed: ') + translateServerMessage(data.message));
            }
        })
        .catch(err => {
            console.error('Update balance error:', err);
            alert(t('修改请求失败，请稍后重试', 'Update request failed, please try again'));
        });
    }

    function changeSelfPassword() {
        const oldPassword = prompt(t('请输入当前密码:', 'Enter current password:'));
        
        if (!oldPassword) {
            alert(t('必须输入当前密码！', 'Current password is required.'));
            return;
        }
        
        const newPassword = prompt(t(
            '请输入新密码:\n\n要求: 12-128位，并同时包含字母和数字',
            'Enter new password:\n\nRequired: 12-128 characters with letters and numbers'
        ));
        
        if (!newPassword) {
            alert(t('新密码不能为空！', 'New password cannot be empty.'));
            return;
        }
        
        if (newPassword.length < 12 || newPassword.length > 128 || !/\p{L}/u.test(newPassword) || !/\p{N}/u.test(newPassword)) {
            alert(t('新密码须为12-128位，并同时包含字母和数字。', 'Password must be 12-128 characters with letters and numbers.'));
            return;
        }
        
        const confirmPassword = prompt(t('请再次确认新密码:', 'Confirm new password:'));
        
        if (newPassword !== confirmPassword) {
            alert(t('两次输入的密码不一致！', 'Passwords do not match.'));
            return;
        }
        
        const confirmChange = confirm(t(
            `确认修改密码？\n\n旧密码: ${'*'.repeat(oldPassword.length)}\n新密码: ${'*'.repeat(newPassword.length)}`,
            `Confirm password change?\n\nOld: ${'*'.repeat(oldPassword.length)}\nNew: ${'*'.repeat(newPassword.length)}`
        ));
        
        if (!confirmChange) return;
        
        adminFetch('/api/admin/change-self-password', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                },
            body: JSON.stringify({ 
                oldPassword: oldPassword,
                newPassword: newPassword 
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                alert(t(
                    '密码修改成功！\n\n请使用新密码重新登录。',
                    'Password changed.\n\nPlease login again with the new password.'
                ));
                fetch('/logout', {
                    method: 'POST',
                    headers: { 'X-CSRF-Token': csrfToken }
                }).finally(() => {
                    window.location.href = '/login';
                });
            } else {
                alert(t('修改失败: ', 'Update failed: ') + translateServerMessage(data.message));
            }
        })
        .catch(err => {
            console.error('Change password error:', err);
            alert(t('修改请求失败，请稍后重试', 'Update request failed, please try again'));
        });
    }

    // ==========================================
    
    // ==========================================
    
    
    async function checkCookieStatus() {
        try {
            const response = await adminFetch('/api/bilibili/cookies/status');
            const result = await response.json();
            
            const statusDiv = document.getElementById('cookieStatus');
            const detailsDiv = document.getElementById('cookieDetails');
            
            if (result.success) {
                if (result.managedExternally) {
                    setCookieStatus(statusDiv, 'managed', t('由 Windows 工作器管理', 'Managed by Windows worker'));
                    detailsDiv.replaceChildren();
                    appendStatusDetail(
                        detailsDiv,
                        t('状态', 'Status'),
                        t('请在运行工作器的电脑上检查 Cookie', 'Check the cookie on the worker host')
                    );
                    return;
                }
                if (result.expired) {
                    setCookieStatus(statusDiv, 'error', t('Cookie已过期', 'Cookie expired'));
                    
                    let reasonText = '';
                    switch(result.reason) {
                        case 'no_cookies': reasonText = t('未找到cookie文件', 'Cookie file not found'); break;
                        case 'missing_key_cookies': reasonText = t('缺少关键cookie', 'Missing key cookies'); break;
                        case 'login_required': reasonText = t('需要重新登录', 'Re-login required'); break;
                        default: reasonText = result.reason || t('未知原因', 'Unknown reason');
                    }
                    
                    detailsDiv.replaceChildren();
                    appendStatusDetail(detailsDiv, t('Cookie状态', 'Cookie Status'), t('已过期', 'Expired'), 'error');
                    appendStatusDetail(detailsDiv, t('原因', 'Reason'), reasonText);
                    appendStatusDetail(
                        detailsDiv,
                        t('建议', 'Suggestion'),
                        t('点击"刷新Cookie"按钮重新获取', 'Click "Refresh Cookie" to re-login')
                    );
                } else {
                    setCookieStatus(statusDiv, 'success', t('Cookie有效', 'Cookie valid'));
                    
                    const lastCheck = new Date(result.lastCheck).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' });
                    const nextCheck = new Date(result.nextCheck).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' });
                    
                    detailsDiv.replaceChildren();
                    appendStatusDetail(detailsDiv, t('Cookie状态', 'Cookie Status'), t('有效', 'Valid'), 'success');
                    appendStatusDetail(detailsDiv, t('上次检查', 'Last check'), result.lastCheck ? lastCheck : t('未检查', 'Never'));
                    appendStatusDetail(detailsDiv, t('下次检查', 'Next check'), nextCheck);
                    appendStatusDetail(
                        detailsDiv,
                        t('检查间隔', 'Interval'),
                        `${Math.round(Number(result.checkInterval) / 60000) || 0} ${t('分钟', 'min')}`
                    );
                }
            } else {
                setCookieStatus(statusDiv, 'error', t('检查失败', 'Check failed'));
                detailsDiv.replaceChildren();
                appendStatusDetail(detailsDiv, t('错误', 'Error'), translateServerMessage(result.message), 'error');
            }
            
        } catch (error) {
            console.error(t('检查Cookie状态失败:', 'Failed to check cookie status:'), error);
            showMessage(t('检查Cookie状态失败: ', 'Check failed: ') + error.message, 'error');
        }
    }

    
    // ==========================================
    
    // ==========================================
    
    
    async function bindUserRoom() {
        const button = document.getElementById('bind-room');
        const originalLabel = button.textContent;
        try {
            const username = document.getElementById('bindUsername').value.trim();
            const roomId = document.getElementById('bindRoomId').value.trim();
            
            if (!username) {
                setRoomBindStatus(t('请选择用户名', 'Please select a username'), 'error');
                return;
            }
            
            if (!roomId) {
                setRoomBindStatus(t('请输入房间号', 'Please enter room ID'), 'error');
                return;
            }
            
            if (!/^\d{1,12}$/.test(roomId) || Number(roomId) <= 0) {
                setRoomBindStatus(t('房间号格式不正确，应为1-12位数字', 'Room ID should be 1-12 digits'), 'error');
                return;
            }
            
            button.disabled = true;
            button.textContent = t('绑定中...', 'Binding...');
            setRoomBindStatus(t('正在保存房间绑定...', 'Saving room binding...'), 'info');
            
            const response = await adminFetch('/api/bilibili/room', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    },
                body: JSON.stringify({
                    targetUsername: username,
                    roomId: roomId
                })
            });
            
            const result = await readJsonResponse(response);
            
            if (response.ok && result.success) {
                const message = translateServerMessage(result.message);
                setRoomBindStatus(message, 'success');
                showMessage(message, 'success');
                
                document.getElementById('bindRoomId').value = '';
                
                await loadRoomBindings();
            } else {
                const message = translateServerMessage(result.message) || t('绑定失败', 'Bind failed');
                setRoomBindStatus(message, 'error');
                showMessage(message, 'error');
            }
            
        } catch (error) {
            console.error(t('绑定房间失败:', 'Bind room failed:'), error);
            const message = t('绑定请求失败，请刷新页面后重试', 'Binding failed. Refresh the page and try again.');
            setRoomBindStatus(message, 'error');
            showMessage(message, 'error');
        } finally {
            button.disabled = false;
            button.textContent = originalLabel;
        }
    }

    function setRoomBindStatus(message, type) {
        const status = document.getElementById('roomBindStatus');
        const statusType = ['success', 'error', 'info'].includes(type) ? type : 'info';
        status.hidden = false;
        status.classList.remove('room-bind-status-success', 'room-bind-status-error', 'room-bind-status-info');
        status.classList.add(`room-bind-status-${statusType}`);
        status.textContent = message;
    }

    
    async function unbindUserRoom() {
        try {
            const username = document.getElementById('unbindUsername').value.trim();
            
            if (!username) {
                showMessage(t('请输入用户名', 'Please enter username'), 'error');
                return;
            }
            
            if (!confirm(t(
                `确定要为用户 "${username}" 解除房间绑定吗？\n\n解除后该用户无法自动发送礼物。`,
                `Unbind room for "${username}"?\n\nAuto sending will be disabled.`
            ))) {
                return;
            }
            
            const response = await adminFetch('/api/bilibili/room', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    },
                body: JSON.stringify({
                    targetUsername: username
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                showMessage(translateServerMessage(result.message), 'success');
                
                document.getElementById('unbindUsername').value = '';
                
                loadRoomBindings();
            } else {
                showMessage(translateServerMessage(result.message) || t('解除绑定失败', 'Unbind failed'), 'error');
            }
            
        } catch (error) {
            console.error(t('解除绑定失败:', 'Unbind failed:'), error);
            showMessage(t('网络错误，请稍后重试', 'Network error, please try again'), 'error');
        }
    }

    
    async function loadRoomBindings() {
        try {
            const response = await adminFetch('/api/bilibili/room');
            const result = await response.json();
            
            const bindingsDiv = document.getElementById('currentBindings');
            
            if (result.success && result.isAdminView && Array.isArray(result.allBindings)) {
                if (result.allBindings.length > 0) {
                    const fragment = document.createDocumentFragment();
                    for (const binding of result.allBindings) {
                        const row = document.createElement('div');
                        row.className = 'binding-row';
                        const identity = document.createElement('div');
                        const username = document.createElement('strong');
                        username.className = 'binding-username';
                        username.textContent = `${t('用户', 'User')}: ${String(binding.username || '')}`;
                        const separator = document.createElement('span');
                        separator.className = 'binding-separator';
                        separator.textContent = '/';
                        const room = document.createElement('strong');
                        room.className = 'binding-room';
                        room.textContent = `${t('房间', 'Room')}: ${String(binding.roomId || '')}`;
                        identity.append(username, separator, room);

                        const boundAt = document.createElement('div');
                        boundAt.className = 'binding-time';
                        const date = new Date(binding.bindTime);
                        boundAt.textContent = Number.isFinite(date.getTime())
                            ? date.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' })
                            : '-';
                        row.append(identity, boundAt);
                        fragment.appendChild(row);
                    }
                    bindingsDiv.replaceChildren(fragment);
                } else {
                    showBindingsMessage(bindingsDiv, t('暂无用户绑定直播间', 'No bindings found'));
                }
            } else {
                showBindingsMessage(bindingsDiv, t('加载绑定信息失败', 'Failed to load bindings'), true);
            }
            
        } catch (error) {
            console.error(t('加载房间绑定失败:', 'Failed to load bindings:'), error);
            const bindingsDiv = document.getElementById('currentBindings');
            showBindingsMessage(bindingsDiv, t('网络错误，无法加载绑定信息', 'Network error, unable to load bindings'), true);
        }
    }

    
    function showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        const toastType = ['success', 'error', 'info'].includes(type) ? type : 'info';
        messageDiv.className = `admin-toast admin-toast-${toastType}`;
        messageDiv.textContent = message;
        
        document.body.appendChild(messageDiv);
        
        setTimeout(() => {
            messageDiv.remove();
        }, 5000);
    }

    
    document.addEventListener('DOMContentLoaded', function() {
        
        checkCookieStatus();
        
        loadRoomBindings();
    });
