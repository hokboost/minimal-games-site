// WebSocket客户端测试脚本
const io = require('socket.io-client');

async function testWebSocket() {
    console.log('🔗 开始WebSocket客户端测试...\n');

    // 创建两个WebSocket连接模拟不同设备
    const client1 = io('http://localhost:3000');
    const client2 = io('http://localhost:3000');

    // 设置连接事件监听
    client1.on('connect', () => {
        console.log('✅ 客户端1连接成功:', client1.id);
        client1.emit('register', '老六');
    });

    client2.on('connect', () => {
        console.log('✅ 客户端2连接成功:', client2.id);
        client2.emit('register', '老六');
    });

    // 监听通知
    client1.on('notification', (notification) => {
        console.log('📨 客户端1收到通知:', notification);
    });

    client1.on('security-alert', (alert) => {
        console.log('🚨 客户端1收到安全警告:', alert);
    });

    client2.on('notification', (notification) => {
        console.log('📨 客户端2收到通知:', notification);
    });

    client2.on('security-alert', (alert) => {
        console.log('🚨 客户端2收到安全警告:', alert);
    });

    // 等待连接建立
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试发送通知
    console.log('\n📤 测试发送通知...');
    
    const fetch = require('node-fetch');
    
    try {
        const response = await fetch('http://localhost:3000/api/test/notification', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: '老六', type: 'test' })
        });
        
        const result = await response.json();
        console.log('📮 测试通知API响应:', result);
    } catch (error) {
        console.error('❌ 发送测试通知失败:', error.message);
    }

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 测试安全警告
    console.log('\n🚨 测试发送安全警告...');
    
    try {
        const response = await fetch('http://localhost:3000/api/test/security-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: '老六' })
        });
        
        const result = await response.json();
        console.log('🔔 测试安全警告API响应:', result);
    } catch (error) {
        console.error('❌ 发送测试安全警告失败:', error.message);
    }

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('\n🏁 测试完成，断开连接...');
    client1.disconnect();
    client2.disconnect();
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获异常:', error.message);
    process.exit(1);
});

// 运行测试
testWebSocket().then(() => {
    console.log('✅ WebSocket测试完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});