(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);

    if (!window.io) {
        return;
    }

    if (window.__securityAlertSocket) {
        return;
    }

    const socket = io();
    window.__securityAlertSocket = socket;

    const showDeviceLogout = () => {
        const overlay = document.createElement('div');
        overlay.className = 'security-alert-overlay';
        const box = document.createElement('div');
        box.className = 'security-alert-box';
        const title = document.createElement('strong');
        title.textContent = t('账号安全提醒', 'Security Alert');
        const detail = document.createElement('small');
        detail.textContent = t(
            '您的账号已在其他设备登录',
            'Your account has been logged in on another device'
        );
        box.append(title, detail);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        setTimeout(() => {
            window.location.href = '/login?kicked=true';
        }, 2500);
    };

    socket.on('security-alert', (event) => {
        if (event && event.type === 'device_logout') {
            showDeviceLogout();
        }
    });
})();
