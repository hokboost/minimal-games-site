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
        notificationDiv.innerHTML = `
            <div class="notification-content">
                <div class="notification-header">
                    <strong>${notification.title || t('系统通知', 'System Notification')}</strong>
                    <span class="notification-close">&times;</span>
                </div>
                <div class="notification-body">
                    ${notification.message}
                </div>
            </div>
        `;

        notificationDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            max-width: 350px;
            animation: slideIn 0.3s ease;
        `;

        document.body.appendChild(notificationDiv);

        setTimeout(() => {
            notificationDiv.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notificationDiv.remove(), 300);
        }, 5000);

        notificationDiv.querySelector('.notification-close').addEventListener('click', () => {
            notificationDiv.remove();
        });
    }

    function showSecurityAlert(event) {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'security-alert';

        let alertStyle = '';
        let alertIcon = '';

        switch (event.level) {
            case 'warning':
                alertStyle = 'background: #fff3cd; border-color: #ffeaa7; color: #856404;';
                alertIcon = '⚠️';
                break;
            case 'danger':
                alertStyle = 'background: #f8d7da; border-color: #f5c6cb; color: #721c24;';
                alertIcon = '🚨';
                break;
            default:
                alertStyle = 'background: #d4edda; border-color: #c3e6cb; color: #155724;';
                alertIcon = 'ℹ️';
        }

        alertDiv.innerHTML = `
            <div class="alert-content">
                <div class="alert-header">
                    ${alertIcon} <strong>${event.title}</strong>
                    <span class="alert-close">&times;</span>
                </div>
                <div class="alert-body">
                    ${event.message}
                    ${event.details ? `<div class="alert-details">${t('设备数量', 'Devices')}: ${event.details.kickedDevices}</div>` : ''}
                </div>
            </div>
        `;

        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            border: 1px solid;
            border-radius: 8px;
            padding: 15px;
            z-index: 10001;
            max-width: 400px;
            animation: slideIn 0.3s ease;
            ${alertStyle}
        `;

        document.body.appendChild(alertDiv);

        alertDiv.querySelector('.alert-close').addEventListener('click', () => {
            alertDiv.remove();
        });
    }

    if (!document.querySelector('#notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
            .notification-content, .alert-content {
                padding: 12px;
            }
            .notification-header, .alert-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 8px;
            }
            .notification-close, .alert-close {
                cursor: pointer;
                font-size: 18px;
                line-height: 1;
                opacity: 0.6;
            }
            .notification-close:hover, .alert-close:hover {
                opacity: 1;
            }
            .alert-details {
                margin-top: 8px;
                font-size: 0.9em;
                opacity: 0.8;
            }
        `;
        document.head.appendChild(style);
    }
})();
