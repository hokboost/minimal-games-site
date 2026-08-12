(() => {
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => (lang === 'zh' ? zh : en);
    const { authorized, username } = document.body.dataset;
    if (authorized !== 'true') {
        return;
    }
    if (!window.io) {
        return;
    }

    const socket = io();

    socket.on('connect', () => {
        socket.emit('register', username || '');
    });

    socket.on('notification', (notification) => {
        showNotification(notification);
    });

    socket.on('security-alert', (event) => {
        if (event.type === 'device_logout') {
            return;
        }
        showSecurityAlert(event);
    });

    function showNotification(notification) {
        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'notification';
        const content = document.createElement('div');
        content.className = 'notification-content';
        const header = document.createElement('div');
        header.className = 'notification-header';
        const title = document.createElement('strong');
        title.textContent = String(notification?.title || t('系统通知', 'System Notification'));
        const close = createCloseButton('notification-close');
        const body = document.createElement('div');
        body.className = 'notification-body';
        body.textContent = String(notification?.message || '');
        header.append(title, close);
        content.append(header, body);
        notificationDiv.appendChild(content);

        document.body.appendChild(notificationDiv);

        setTimeout(() => {
            notificationDiv.classList.add('notification-exit');
            setTimeout(() => notificationDiv.remove(), 300);
        }, 5000);

        close.addEventListener('click', () => notificationDiv.remove());
    }

    function showSecurityAlert(event) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'security-alert';

        let alertLabel = '';
        let levelClass = 'notice';

        switch (event.level) {
            case 'warning':
                levelClass = 'warning';
                alertLabel = t('警告', 'Warning');
                break;
            case 'danger':
                levelClass = 'danger';
                alertLabel = t('严重警告', 'Critical');
                break;
            default:
                alertLabel = t('提示', 'Notice');
        }
        alertDiv.classList.add(`security-alert-${levelClass}`);
        const content = document.createElement('div');
        content.className = 'alert-content';
        const header = document.createElement('div');
        header.className = 'alert-header';
        const label = document.createElement('span');
        label.className = 'alert-level';
        label.textContent = alertLabel;
        const title = document.createElement('strong');
        title.textContent = String(event?.title || '');
        const close = createCloseButton('alert-close');
        header.append(label, title, close);
        const body = document.createElement('div');
        body.className = 'alert-body';
        body.textContent = String(event?.message || '');
        if (event?.details?.kickedDevices !== undefined) {
            const details = document.createElement('div');
            details.className = 'alert-details';
            details.textContent = `${t('设备数量', 'Devices')}: ${String(event.details.kickedDevices)}`;
            body.appendChild(details);
        }
        content.append(header, body);
        alertDiv.appendChild(content);

        document.body.appendChild(alertDiv);

        close.addEventListener('click', () => alertDiv.remove());
    }

    function createCloseButton(className) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.setAttribute('aria-label', t('关闭', 'Close'));
        button.textContent = '×';
        return button;
    }
})();
