(() => {
    if (!window.io) {
        return;
    }

    if (window.__securityAlertSocket) {
        return;
    }

    const socket = io();
    window.__securityAlertSocket = socket;

    const ensureStyles = () => {
        if (document.getElementById('security-alert-styles')) {
            return;
        }
        const style = document.createElement('style');
        style.id = 'security-alert-styles';
        style.textContent = `
            .security-alert-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.65);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            }
            .security-alert-box {
                background: rgba(255, 68, 68, 0.95);
                color: #fff;
                padding: 2rem;
                border-radius: 12px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                font-size: 1.1rem;
                font-weight: bold;
                max-width: 360px;
            }
            .security-alert-box small {
                display: block;
                margin-top: 0.8rem;
                font-size: 0.9rem;
                font-weight: normal;
            }
        `;
        document.head.appendChild(style);
    };

    const showDeviceLogout = () => {
        ensureStyles();
        const overlay = document.createElement('div');
        overlay.className = 'security-alert-overlay';
        overlay.innerHTML = `
            <div class="security-alert-box">
                ⚠️ 账号安全提醒
                <small>您的账号已在其他设备登录</small>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => {
            window.location.href = '/logout';
        }, 2500);
    };

    socket.on('security-alert', (event) => {
        if (event && event.type === 'device_logout') {
            showDeviceLogout();
        }
    });
})();
