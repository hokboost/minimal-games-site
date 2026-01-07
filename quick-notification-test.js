// 在浏览器控制台直接运行这个代码进行测试
console.log('🧪 开始WebSocket通知测试...');

// 检查Socket.IO是否加载
if (typeof io === 'undefined') {
    console.error('❌ Socket.IO未加载！请检查页面是否正确引入socket.io.js');
} else {
    console.log('✅ Socket.IO已加载');
}

// 创建WebSocket连接
const testSocket = io();

testSocket.on('connect', () => {
    console.log('✅ WebSocket连接成功:', testSocket.id);
    
    // 注册用户（使用当前登录的用户名）
    const username = document.querySelector('span')?.textContent?.match(/欢迎，(.+?)!/)?.[1] || '老六';
    testSocket.emit('register', username);
    console.log('👤 注册用户:', username);
    
    // 2秒后发送测试通知
    setTimeout(() => {
        fetch('/api/test/security-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        }).then(response => response.json())
        .then(result => {
            console.log('📤 测试通知发送:', result.message);
        }).catch(error => {
            console.error('❌ 发送失败:', error);
        });
    }, 2000);
});

testSocket.on('security-alert', (event) => {
    console.log('🚨 收到安全警告:', event);
    
    // 手动创建弹窗测试
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        color: #856404;
        padding: 15px;
        border-radius: 8px;
        z-index: 10000;
        max-width: 300px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    `;
    
    alertDiv.innerHTML = `
        <strong>⚠️ ${event.title}</strong><br>
        ${event.message}<br>
        <button onclick="this.parentElement.remove()" style="margin-top: 10px;">关闭</button>
    `;
    
    document.body.appendChild(alertDiv);
    console.log('✅ 手动弹窗已显示');
    
    // 5秒后自动关闭
    setTimeout(() => {
        if (alertDiv.parentElement) {
            alertDiv.remove();
        }
    }, 5000);
});

testSocket.on('disconnect', () => {
    console.log('❌ WebSocket连接断开');
});

console.log('📋 测试步骤：');
console.log('1. 等待WebSocket连接建立');
console.log('2. 用户自动注册到WebSocket');
console.log('3. 2秒后自动发送测试通知');
console.log('4. 观察是否出现弹窗');