const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
const t = (zh, en) => (lang === 'zh' ? zh : en);
const translateServerMessage = window.translateServerMessage || ((message) => message);
const escapeHTML = window.escapeHTML || ((value) => String(value ?? ''));
const csrfToken = document.body.dataset.csrfToken || '';

function adminFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET') {
        options.headers = {
            ...(options.headers || {}),
            'X-CSRF-Token': csrfToken
        };
    }
    return method === 'GET' ? fetch(url, options) : window.idempotentFetch(url, options);
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
    if (event.target.closest('#refresh-cookies')) {
        return refreshCookies();
    }
    if (event.target.closest('#bind-room')) {
        return bindUserRoom();
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

function addElectricCoin(username, btn) {
        const amount = prompt(t(
            `为用户 "${username}" 添加积分:\\n\\n请输入要添加的积分数量:`,
            `Add points for "${username}":\\n\\nEnter point amount:`
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
                `成功为用户 "${username}" 添加 ${coinAmount} 积分！\\n新余额: ${data.newBalance} 积分`,
                `Added ${coinAmount} points to "${username}".\\nNew balance: ${data.newBalance} points`
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
            `确定要重置用户 "${username}" 的密码吗？系统会生成一次性临时密码。`,
            `Reset password for "${username}"? A one-time temporary password will be generated.`
        ));
        
        if (!confirmReset) return;
        
        const doubleConfirm = confirm(t(
            `警告：此操作不可撤销！\\n\\n用户: ${username}\\n\\n确定继续吗？`,
            `Warning: This cannot be undone!\\n\\nUser: ${username}\\n\\nContinue?`
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
                `密码重置成功！\\n\\n用户: ${username}\\n临时密码: ${data.temporaryPassword}\\n\\n该密码只显示一次，请安全交给用户并要求立即修改。`,
                `Password reset successful!\\n\\nUser: ${username}\\nTemporary password: ${data.temporaryPassword}\\n\\nThis is shown once. Share it securely and require an immediate change.`
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
            `危险操作！\\n\\n确定要永久注销用户 "${username}" 的账号吗？\\n\\n此操作将删除：\\n- 用户账号信息\\n- 所有游戏记录\\n- 无法恢复！`,
            `Dangerous action!\\n\\nPermanently delete "${username}"?\\n\\nThis will remove:\\n- User account\\n- All game records\\n- Cannot be undone`
        ));
        
        if (!confirmDelete) return;
        
        const typeUsername = prompt(t(
            `请输入要删除的用户名以确认操作：\\n\\n输入 "${username}" 确认删除`,
            `Type the username to confirm deletion:\\n\\nType "${username}" to confirm`
        ));
        
        if (typeUsername !== username) {
            if (typeUsername !== null) {
                alert(t('用户名不匹配，操作取消！', 'Username mismatch, canceled.'));
            }
            return;
        }
        
        const finalConfirm = confirm(t(
            `最后确认！\\n\\n用户: ${username}\\n操作: 永久删除账号\\n结果: 无法恢复\\n\\n确定执行吗？`,
            `Final confirmation!\\n\\nUser: ${username}\\nAction: Delete account\\nResult: Irreversible\\n\\nProceed?`
        ));
        
        if (!finalConfirm) return;
        
        btn.disabled = true;
        btn.textContent = t('删除中...', 'Deleting...');
        btn.style.background = '#6c757d';
        
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
            
            alert(t(
                `账号注销成功！\\n\\n用户 "${username}" 及其所有数据已永久删除。`,
                `Account deleted.\\n\\n"${username}" and all data removed.`
            ));
            
            const row = btn.closest('tr');
            row.style.background = '#ffebee';
            row.style.transition = 'all 0.5s ease';
            
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
            btn.style.background = '#dc3545';
        });
    }

    function unlockAccount(username, btn) {
        const confirmUnlock = confirm(t(
            `确定要解锁用户 "${username}" 的账号吗？\\n\\n这将清除所有登录失败记录。`,
            `Unlock account for "${username}"?\\n\\nThis clears all login failure records.`
        ));
        
        if (!confirmUnlock) return;
        
        btn.disabled = true;
        btn.textContent = t('解锁中...', 'Unlocking...');
        btn.style.background = '#6c757d';
        
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
                `账号解锁成功！\\n\\n用户 "${username}" 现在可以正常登录了。`,
                `Account unlocked.\\n\\n"${username}" can login now.`
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
            btn.style.background = '#ffc107';
        });
    }

    function clearFailures(username, btn) {
        const confirmClear = confirm(t(
            `确定要清除用户 "${username}" 的登录失败记录吗？`,
            `Clear login failure records for "${username}"?`
        ));
        
        if (!confirmClear) return;
        
        btn.disabled = true;
        btn.textContent = t('清除中...', 'Clearing...');
        btn.style.background = '#6c757d';
        
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
                `失败记录清除成功！\\n\\n用户 "${username}" 的登录失败计数已重置。`,
                `Failures cleared.\\n\\n"${username}" failure count reset.`
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
            btn.style.background = '#17a2b8';
        });
    }

    function editBalance(username, currentBalance) {
        const newBalance = prompt(t(
            `修改用户 "${username}" 的积分余额:\\n\\n当前余额: ${currentBalance} 积分\\n\\n请输入新的积分数量:`,
            `Update balance for "${username}":\\n\\nCurrent: ${currentBalance} points\\n\\nEnter new balance:`
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
            `确认修改积分余额？\\n\\n用户: ${username}\\n当前余额: ${currentBalance} 积分\\n新余额: ${balance} 积分`,
            `Confirm balance update?\\n\\nUser: ${username}\\nCurrent: ${currentBalance} points\\nNew: ${balance} points`
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
            '请输入新密码:\\n\\n要求: 12-128位，并同时包含字母和数字',
            'Enter new password:\\n\\nRequired: 12-128 characters with letters and numbers'
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
            `确认修改密码？\\n\\n旧密码: ${'*'.repeat(oldPassword.length)}\\n新密码: ${'*'.repeat(newPassword.length)}`,
            `Confirm password change?\\n\\nOld: ${'*'.repeat(oldPassword.length)}\\nNew: ${'*'.repeat(newPassword.length)}`
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
                    '密码修改成功！\\n\\n请使用新密码重新登录。',
                    'Password changed.\\n\\nPlease login again with the new password.'
                ));
                window.location.href = '/logout';
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
                if (result.expired) {
                    statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
                    statusDiv.style.color = 'white';
                    statusDiv.innerHTML = t('Cookie已过期', 'Cookie expired');
                    
                    let reasonText = '';
                    switch(result.reason) {
                        case 'no_cookies': reasonText = t('未找到cookie文件', 'Cookie file not found'); break;
                        case 'missing_key_cookies': reasonText = t('缺少关键cookie', 'Missing key cookies'); break;
                        case 'login_required': reasonText = t('需要重新登录', 'Re-login required'); break;
                        default: reasonText = result.reason || t('未知原因', 'Unknown reason');
                    }
                    
                    detailsDiv.innerHTML = `
                        <div style="color: #f44336;">${t('Cookie状态', 'Cookie Status')}: ${t('已过期', 'Expired')}</div>
                        <div style="margin-top: 0.5rem;">${t('原因', 'Reason')}: ${reasonText}</div>
                        <div style="margin-top: 0.5rem;">${t('建议', 'Suggestion')}: ${t('点击"刷新Cookie"按钮重新获取', 'Click "Refresh Cookie" to re-login')}</div>
                    `;
                } else {
                    statusDiv.style.background = 'rgba(76, 175, 80, 0.8)';
                    statusDiv.style.color = 'white';
                    statusDiv.innerHTML = t('Cookie有效', 'Cookie valid');
                    
                    const lastCheck = new Date(result.lastCheck).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' });
                    const nextCheck = new Date(result.nextCheck).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' });
                    
                    detailsDiv.innerHTML = `
                        <div style="color: #4caf50;">${t('Cookie状态', 'Cookie Status')}: ${t('有效', 'Valid')}</div>
                        <div style="margin-top: 0.5rem;">${t('上次检查', 'Last check')}: ${result.lastCheck ? lastCheck : t('未检查', 'Never')}</div>
                        <div style="margin-top: 0.5rem;">${t('下次检查', 'Next check')}: ${nextCheck}</div>
                        <div style="margin-top: 0.5rem;">${t('检查间隔', 'Interval')}: ${Math.round(result.checkInterval / 60000)} ${t('分钟', 'min')}</div>
                    `;
                }
            } else {
                statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
                statusDiv.style.color = 'white';
                statusDiv.innerHTML = t('检查失败', 'Check failed');
                detailsDiv.innerHTML = `<div style="color: #f44336;">${t('错误', 'Error')}: ${escapeHTML(translateServerMessage(result.message))}</div>`;
            }
            
        } catch (error) {
            console.error(t('检查Cookie状态失败:', 'Failed to check cookie status:'), error);
            showMessage(t('检查Cookie状态失败: ', 'Check failed: ') + error.message, 'error');
        }
    }

    
    async function refreshCookies() {
        try {
            if (!confirm(t(
                '确定要刷新B站Cookie吗？\\n\\n这将打开浏览器窗口，请在浏览器中完成登录操作。',
                'Refresh Bilibili cookie?\\n\\nA browser window will open for login.'
            ))) {
                return;
            }
            
            showMessage(t('正在刷新Cookie，请在弹出的浏览器中完成登录...', 'Refreshing cookie, please login in the browser...'), 'info');
            
            const statusDiv = document.getElementById('cookieStatus');
            statusDiv.style.background = 'rgba(255, 193, 7, 0.8)';
            statusDiv.style.color = 'white';
            statusDiv.innerHTML = t('正在刷新...', 'Refreshing...');
            
            const response = await adminFetch('/api/bilibili/cookies/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showMessage(t('Cookie刷新成功！', 'Cookie refreshed successfully.'), 'success');
                checkCookieStatus(); 
            } else {
                showMessage(t('Cookie刷新失败: ', 'Refresh failed: ') + translateServerMessage(result.message), 'error');
                statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
                statusDiv.innerHTML = t('刷新失败', 'Refresh failed');
            }
            
        } catch (error) {
            console.error(t('刷新Cookie失败:', 'Refresh cookie failed:'), error);
            showMessage(t('刷新Cookie失败: ', 'Refresh failed: ') + error.message, 'error');
        }
    }

    // ==========================================
    
    // ==========================================
    
    
    async function bindUserRoom() {
        try {
            const username = document.getElementById('bindUsername').value.trim();
            const roomId = document.getElementById('bindRoomId').value.trim();
            
            if (!username) {
                showMessage(t('请输入用户名', 'Please enter username'), 'error');
                return;
            }
            
            if (!roomId) {
                showMessage(t('请输入房间号', 'Please enter room ID'), 'error');
                return;
            }
            
            if (!/^\d{6,12}$/.test(roomId)) {
                showMessage(t('房间号格式不正确，应为6-12位数字', 'Room ID should be 6-12 digits'), 'error');
                return;
            }
            
            if (!confirm(t(
                `确定要为用户 "${username}" 绑定房间号 "${roomId}" 吗？`,
                `Bind room "${roomId}" for "${username}"?`
            ))) {
                return;
            }
            
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
            
            const result = await response.json();
            
            if (result.success) {
                showMessage(translateServerMessage(result.message), 'success');
                
                document.getElementById('bindUsername').value = '';
                document.getElementById('bindRoomId').value = '';
                
                loadRoomBindings();
            } else {
                showMessage(translateServerMessage(result.message) || t('绑定失败', 'Bind failed'), 'error');
            }
            
        } catch (error) {
            console.error(t('绑定房间失败:', 'Bind room failed:'), error);
            showMessage(t('网络错误，请稍后重试', 'Network error, please try again'), 'error');
        }
    }

    
    async function unbindUserRoom() {
        try {
            const username = document.getElementById('unbindUsername').value.trim();
            
            if (!username) {
                showMessage(t('请输入用户名', 'Please enter username'), 'error');
                return;
            }
            
            if (!confirm(t(
                `确定要为用户 "${username}" 解除房间绑定吗？\\n\\n解除后该用户无法自动发送礼物。`,
                `Unbind room for "${username}"?\\n\\nAuto sending will be disabled.`
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
            
            if (result.success && result.isAdminView && result.allBindings) {
                if (result.allBindings.length > 0) {
                    bindingsDiv.innerHTML = result.allBindings.map(binding => `
                        <div style="
                            display: flex; justify-content: space-between; align-items: center;
                            padding: 0.8rem; margin-bottom: 0.5rem;
                            background: rgba(76, 175, 80, 0.1); border-radius: 8px;
                            border-left: 4px solid #4caf50;
                        ">
                            <div>
                                <strong style="color: #4caf50;">${t('用户', 'User')}: ${escapeHTML(binding.username)}</strong>
                                <span style="margin: 0 1rem; color: #ccc;">/</span>
                                <strong style="color: #ff9800;">${t('房间', 'Room')}: ${escapeHTML(binding.roomId)}</strong>
                            </div>
                            <div style="font-size: 0.8rem; color: #999;">
                                ${new Date(binding.bindTime).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { timeZone: 'Asia/Shanghai' })}
                            </div>
                        </div>
                    `).join('');
                } else {
                    bindingsDiv.innerHTML = `
                        <div style="text-align: center; color: #999; padding: 2rem;">
                            ${t('暂无用户绑定直播间', 'No bindings found')}
                        </div>
                    `;
                }
            } else {
                bindingsDiv.innerHTML = `
                    <div style="text-align: center; color: #f44336; padding: 2rem;">
                        ${t('加载绑定信息失败', 'Failed to load bindings')}
                    </div>
                `;
            }
            
        } catch (error) {
            console.error(t('加载房间绑定失败:', 'Failed to load bindings:'), error);
            const bindingsDiv = document.getElementById('currentBindings');
            bindingsDiv.innerHTML = `
                <div style="text-align: center; color: #f44336; padding: 2rem;">
                    ${t('网络错误，无法加载绑定信息', 'Network error, unable to load bindings')}
                </div>
            `;
        }
    }

    
    function showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'admin-toast';
        messageDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem;
            border-radius: 8px; color: white; font-weight: bold; z-index: 1001;
            animation: slideIn 0.3s ease; max-width: 400px;
        `;
        
        const colors = {
            success: '#23835a',
            error: '#c84b44',
            info: '#326fad'
        };
        
        messageDiv.style.background = colors[type] || colors.info;
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
