const csrfToken = document.body.dataset.csrfToken || '';

function adminFetch(url, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET') {
        options.headers = {
            ...(options.headers || {}),
            'X-CSRF-Token': csrfToken
        };
    }
    return fetch(url, options);
}

document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (actionButton) {
        const action = actionButton.dataset.action;
        const username = actionButton.dataset.username;
        const balance = actionButton.dataset.balance;

        switch (action) {
            case 'add-coin':
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
        const amount = prompt(`为用户 "${username}" 添加电币:\\n\\n请输入要添加的电币数量:`, '100');
        
        if (amount === null) return; 
        
        const coinAmount = parseFloat(amount);
        
        if (isNaN(coinAmount)) {
            alert('请输入有效的数字金额！');
            return;
        }
        
        if (coinAmount <= 0) {
            alert('添加数量必须大于0！');
            return;
        }
        
        if (coinAmount > 100000) {
            alert('单次添加不能超过100,000电币！');
            return;
        }
        
        const confirmAdd = confirm(`确认为用户 "${username}" 添加 ${coinAmount} 电币？`);
        
        if (!confirmAdd) return;
        
        btn.disabled = true;
        btn.textContent = '添加中...';
        
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
                alert('添加失败: ' + data.message);
                return;
            }
            
            alert(`✅ 成功为用户 "${username}" 添加 ${coinAmount} 电币！\\n新余额: ${data.newBalance} 电币`);
            location.reload(); 
        })
        .catch(err => {
            console.error('Add electric coin error:', err);
            alert('添加请求失败，请稍后重试');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '⚡ 加电币';
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
            if (!data.success) return alert('授权失败: ' + data.message);
            location.reload();
        })
        .catch(() => alert('授权请求失败'));
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
            if (!data.success) return alert('取消失败: ' + data.message);
            location.reload();
        })
        .catch(() => alert('取消请求失败'));
    }

    function resetPassword(username, btn) {
        const confirmReset = confirm('确定要重置用户 "' + username + '" 的密码吗？\\n\\n新密码将设置为: 123456');
        
        if (!confirmReset) return;
        
        const doubleConfirm = confirm('⚠️ 警告：此操作不可撤销！\\n\\n用户: ' + username + '\\n新密码: 123456\\n\\n确定继续吗？');
        
        if (!doubleConfirm) return;
        
        btn.disabled = true;
        btn.textContent = '重置中...';
        
        adminFetch('/api/admin/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: username,
                newPassword: '123456'
            })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert('重置失败: ' + data.message);
                return;
            }
            
            alert('✅ 密码重置成功！\\n\\n用户: ' + username + '\\n新密码: 123456\\n\\n请通知用户尽快登录并修改密码！');
        })
        .catch(err => {
            console.error('Reset password error:', err);
            alert('重置请求失败，请稍后重试');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '🔑 重置密码';
        });
    }

    function deleteAccount(username, btn) {
        const confirmDelete = confirm('⚠️ 危险操作！\\n\\n确定要永久注销用户 "' + username + '" 的账号吗？\\n\\n此操作将删除：\\n- 用户账号信息\\n- 所有游戏记录\\n- 无法恢复！');
        
        if (!confirmDelete) return;
        
        const typeUsername = prompt('请输入要删除的用户名以确认操作：\\n\\n输入 "' + username + '" 确认删除');
        
        if (typeUsername !== username) {
            if (typeUsername !== null) {
                alert('用户名不匹配，操作取消！');
            }
            return;
        }
        
        const finalConfirm = confirm('🚨 最后确认！🚨\\n\\n用户: ' + username + '\\n操作: 永久删除账号\\n结果: 无法恢复\\n\\n确定执行吗？');
        
        if (!finalConfirm) return;
        
        btn.disabled = true;
        btn.textContent = '删除中...';
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
                alert('注销失败: ' + data.message);
                return;
            }
            
            alert('✅ 账号注销成功！\\n\\n用户 "' + username + '" 及其所有数据已永久删除。');
            
            const row = btn.closest('tr');
            row.style.background = '#ffebee';
            row.style.transition = 'all 0.5s ease';
            
            setTimeout(() => {
                row.remove();
            }, 500);
        })
        .catch(err => {
            console.error('Delete account error:', err);
            alert('注销请求失败，请稍后重试');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '🗑️ 注销账号';
            btn.style.background = '#dc3545';
        });
    }

    function unlockAccount(username, btn) {
        const confirmUnlock = confirm('确定要解锁用户 "' + username + '" 的账号吗？\\n\\n这将清除所有登录失败记录。');
        
        if (!confirmUnlock) return;
        
        btn.disabled = true;
        btn.textContent = '解锁中...';
        btn.style.background = '#6c757d';
        
        adminFetch('/api/admin/unlock-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert('解锁失败: ' + data.message);
                return;
            }
            
            alert('✅ 账号解锁成功！\\n\\n用户 "' + username + '" 现在可以正常登录了。');
            location.reload();
        })
        .catch(err => {
            console.error('Unlock account error:', err);
            alert('解锁请求失败，请稍后重试');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '解锁';
            btn.style.background = '#ffc107';
        });
    }

    function clearFailures(username, btn) {
        const confirmClear = confirm('确定要清除用户 "' + username + '" 的登录失败记录吗？');
        
        if (!confirmClear) return;
        
        btn.disabled = true;
        btn.textContent = '清除中...';
        btn.style.background = '#6c757d';
        
        adminFetch('/api/admin/clear-failures', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username })
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                alert('清除失败: ' + data.message);
                return;
            }
            
            alert('✅ 失败记录清除成功！\\n\\n用户 "' + username + '" 的登录失败计数已重置。');
            location.reload();
        })
        .catch(err => {
            console.error('Clear failures error:', err);
            alert('清除请求失败，请稍后重试');
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = '清除';
            btn.style.background = '#17a2b8';
        });
    }

    function editBalance(username, currentBalance) {
        const newBalance = prompt(`修改用户 "${username}" 的电币余额:\\n\\n当前余额: ${currentBalance} 电币\\n\\n请输入新的电币数量:`, currentBalance);
        
        if (newBalance === null) return; 
        
        const balance = parseFloat(newBalance);
        
        if (isNaN(balance)) {
            alert('请输入有效的数字金额！');
            return;
        }
        
        if (balance < 0) {
            alert('余额不能为负数！');
            return;
        }
        
        const confirmChange = confirm(`确认修改电币余额？\\n\\n用户: ${username}\\n当前余额: ${currentBalance} 电币\\n新余额: ${balance} 电币`);
        
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
                alert(`✅ 用户 "${username}" 的电币余额已成功修改为 ${balance} 电币`);
                location.reload(); 
            } else {
                alert('修改失败: ' + data.message);
            }
        })
        .catch(err => {
            console.error('Update balance error:', err);
            alert('修改请求失败，请稍后重试');
        });
    }

    function changeSelfPassword() {
        const oldPassword = prompt('请输入当前密码:');
        
        if (!oldPassword) {
            alert('必须输入当前密码！');
            return;
        }
        
        const newPassword = prompt('请输入新密码:\\n\\n注意: 新密码长度至少6位');
        
        if (!newPassword) {
            alert('新密码不能为空！');
            return;
        }
        
        if (newPassword.length < 6) {
            alert('新密码长度至少需要6位！');
            return;
        }
        
        const confirmPassword = prompt('请再次确认新密码:');
        
        if (newPassword !== confirmPassword) {
            alert('两次输入的密码不一致！');
            return;
        }
        
        const confirmChange = confirm(`确认修改密码？\\n\\n旧密码: ${'*'.repeat(oldPassword.length)}\\n新密码: ${'*'.repeat(newPassword.length)}`);
        
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
                alert('✅ 密码修改成功！\\n\\n请使用新密码重新登录。');
                window.location.href = '/logout';
            } else {
                alert('修改失败: ' + data.message);
            }
        })
        .catch(err => {
            console.error('Change password error:', err);
            alert('修改请求失败，请稍后重试');
        });
    }

    // ==========================================
    
    // ==========================================
    
    
    async function checkCookieStatus() {
        try {
            showMessage('正在检查Cookie状态...', 'info');
            
            const response = await adminFetch('/api/bilibili/cookies/status');
            const result = await response.json();
            
            const statusDiv = document.getElementById('cookieStatus');
            const detailsDiv = document.getElementById('cookieDetails');
            
            if (result.success) {
                if (result.expired) {
                    statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
                    statusDiv.style.color = 'white';
                    statusDiv.innerHTML = '❌ Cookie已过期';
                    
                    let reasonText = '';
                    switch(result.reason) {
                        case 'no_cookies': reasonText = '未找到cookie文件'; break;
                        case 'missing_key_cookies': reasonText = '缺少关键cookie'; break;
                        case 'login_required': reasonText = '需要重新登录'; break;
                        default: reasonText = result.reason || '未知原因';
                    }
                    
                    detailsDiv.innerHTML = `
                        <div style="color: #f44336;">🚨 Cookie状态: 已过期</div>
                        <div style="margin-top: 0.5rem;">原因: ${reasonText}</div>
                        <div style="margin-top: 0.5rem;">建议: 点击"刷新Cookie"按钮重新获取</div>
                    `;
                } else {
                    statusDiv.style.background = 'rgba(76, 175, 80, 0.8)';
                    statusDiv.style.color = 'white';
                    statusDiv.innerHTML = '✅ Cookie有效';
                    
                    const lastCheck = new Date(result.lastCheck).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    const nextCheck = new Date(result.nextCheck).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
                    
                    detailsDiv.innerHTML = `
                        <div style="color: #4caf50;">✅ Cookie状态: 有效</div>
                        <div style="margin-top: 0.5rem;">上次检查: ${result.lastCheck ? lastCheck : '未检查'}</div>
                        <div style="margin-top: 0.5rem;">下次检查: ${nextCheck}</div>
                        <div style="margin-top: 0.5rem;">检查间隔: ${Math.round(result.checkInterval / 60000)} 分钟</div>
                    `;
                }
            } else {
                statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
                statusDiv.style.color = 'white';
                statusDiv.innerHTML = '❌ 检查失败';
                detailsDiv.innerHTML = `<div style="color: #f44336;">错误: ${result.message}</div>`;
            }
            
        } catch (error) {
            console.error('检查Cookie状态失败:', error);
            showMessage('检查Cookie状态失败: ' + error.message, 'error');
        }
    }

    
    async function refreshCookies() {
        try {
            if (!confirm('确定要刷新B站Cookie吗？\\n\\n这将打开浏览器窗口，请在浏览器中完成登录操作。')) {
                return;
            }
            
            showMessage('正在刷新Cookie，请在弹出的浏览器中完成登录...', 'info');
            
            const statusDiv = document.getElementById('cookieStatus');
            statusDiv.style.background = 'rgba(255, 193, 7, 0.8)';
            statusDiv.style.color = 'white';
            statusDiv.innerHTML = '🔄 正在刷新...';
            
            const response = await adminFetch('/api/bilibili/cookies/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    }
            });
            
            const result = await response.json();
            
            if (result.success) {
                showMessage('Cookie刷新成功！', 'success');
                checkCookieStatus(); 
            } else {
                showMessage('Cookie刷新失败: ' + result.message, 'error');
                statusDiv.style.background = 'rgba(244, 67, 54, 0.8)';
                statusDiv.innerHTML = '❌ 刷新失败';
            }
            
        } catch (error) {
            console.error('刷新Cookie失败:', error);
            showMessage('刷新Cookie失败: ' + error.message, 'error');
        }
    }

    // ==========================================
    
    // ==========================================
    
    
    async function bindUserRoom() {
        try {
            const username = document.getElementById('bindUsername').value.trim();
            const roomId = document.getElementById('bindRoomId').value.trim();
            
            if (!username) {
                showMessage('请输入用户名', 'error');
                return;
            }
            
            if (!roomId) {
                showMessage('请输入房间号', 'error');
                return;
            }
            
            if (!/^\d{6,12}$/.test(roomId)) {
                showMessage('房间号格式不正确，应为6-12位数字', 'error');
                return;
            }
            
            if (!confirm(`确定要为用户 "${username}" 绑定房间号 "${roomId}" 吗？`)) {
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
                showMessage(result.message, 'success');
                
                document.getElementById('bindUsername').value = '';
                document.getElementById('bindRoomId').value = '';
                
                loadRoomBindings();
            } else {
                showMessage(result.message || '绑定失败', 'error');
            }
            
        } catch (error) {
            console.error('绑定房间失败:', error);
            showMessage('网络错误，请稍后重试', 'error');
        }
    }

    
    async function unbindUserRoom() {
        try {
            const username = document.getElementById('unbindUsername').value.trim();
            
            if (!username) {
                showMessage('请输入用户名', 'error');
                return;
            }
            
            if (!confirm(`确定要为用户 "${username}" 解除房间绑定吗？\\n\\n解除后该用户无法自动发送礼物。`)) {
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
                showMessage(result.message, 'success');
                
                document.getElementById('unbindUsername').value = '';
                
                loadRoomBindings();
            } else {
                showMessage(result.message || '解除绑定失败', 'error');
            }
            
        } catch (error) {
            console.error('解除绑定失败:', error);
            showMessage('网络错误，请稍后重试', 'error');
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
                                <strong style="color: #4caf50;">👤 ${binding.username}</strong>
                                <span style="margin: 0 1rem; color: #ccc;">→</span>
                                <strong style="color: #ff9800;">📺 ${binding.roomId}</strong>
                            </div>
                            <div style="font-size: 0.8rem; color: #999;">
                                ${new Date(binding.bindTime).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
                            </div>
                        </div>
                    `).join('');
                } else {
                    bindingsDiv.innerHTML = `
                        <div style="text-align: center; color: #999; padding: 2rem;">
                            📭 暂无用户绑定直播间
                        </div>
                    `;
                }
            } else {
                bindingsDiv.innerHTML = `
                    <div style="text-align: center; color: #f44336; padding: 2rem;">
                        ❌ 加载绑定信息失败
                    </div>
                `;
            }
            
        } catch (error) {
            console.error('加载房间绑定失败:', error);
            const bindingsDiv = document.getElementById('currentBindings');
            bindingsDiv.innerHTML = `
                <div style="text-align: center; color: #f44336; padding: 2rem;">
                    ❌ 网络错误，无法加载绑定信息
                </div>
            `;
        }
    }

    
    function showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = `
            position: fixed; top: 20px; right: 20px; padding: 1rem 1.5rem;
            border-radius: 8px; color: white; font-weight: bold; z-index: 1001;
            animation: slideIn 0.3s ease; max-width: 400px;
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
        }, 5000);
    }

    
    document.addEventListener('DOMContentLoaded', function() {
        
        checkCookieStatus();
        
        loadRoomBindings();
    });
