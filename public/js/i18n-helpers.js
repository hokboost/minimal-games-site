(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const messageMap = {
        'CSRF token验证失败': 'CSRF token verification failed',
        '账号已在其他设备登录': 'Account is logged in on another device',
        '请先登录': 'Please log in first',
        '未授权访问': 'Unauthorized access',
        '无权访问管理员后台': 'No permission to access admin panel',
        '❌ 尝试次数过多，请 10 分钟后再试。': '❌ Too many attempts. Please try again in 10 minutes.',
        '⚠️ 注册太频繁，请稍后再试。': '⚠️ Too many registrations. Please try again later.',
        '请填写所有字段': 'Please fill in all fields',
        '新密码和确认密码不匹配': 'New password and confirmation do not match',
        '新密码至少需要6个字符': 'New password must be at least 6 characters',
        '当前密码错误': 'Current password is incorrect',
        '密码修改成功！': 'Password updated successfully!',
        '修改密码失败，请稍后重试': 'Password update failed, please try again',
        '背包物品不存在': 'Backpack item not found',
        '该物品已处理': 'This item has already been processed',
        '未绑定房间号，暂不送出': 'No room ID bound, cannot send yet',
        '请先绑定B站房间号再送出礼物': 'Bind a Bilibili room ID before sending gifts',
        '送出失败，请稍后重试': 'Send failed, please try again',
        '服务配置错误': 'Service configuration error',
        '无效的API密钥': 'Invalid API key',
        'IP未授权': 'IP not authorized',
        '缺少签名头': 'Missing signature header',
        '无效时间戳': 'Invalid timestamp',
        '签名过期': 'Signature expired',
        '无效随机串': 'Invalid nonce',
        '请求过于频繁': 'Too many requests',
        '重复请求': 'Duplicate request',
        '签名不匹配': 'Signature mismatch'
    };

    const translateServerMessage = (message) => {
        if (!message || lang === 'zh') {
            return message;
        }
        return messageMap[message] || message;
    };

    window.translateServerMessage = translateServerMessage;
})();
