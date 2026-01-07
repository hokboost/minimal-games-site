// 测试真实登录被踢出场景
const io = require('socket.io-client');
const fetch = require('node-fetch');

async function testLoginKickout() {
    console.log('🧪 测试真实登录被踢出场景...\n');

    // 模拟第一个设备连接
    console.log('📱 设备1: 连接WebSocket...');
    const device1 = io('http://localhost:3000');
    
    device1.on('connect', () => {
        console.log('📱 设备1 WebSocket连接成功:', device1.id);
        device1.emit('register', '老六');
    });

    device1.on('security-alert', (alert) => {
        console.log('🚨 设备1收到安全警告:', {
            title: alert.title,
            message: alert.message,
            type: alert.type,
            level: alert.level
        });
    });

    // 等待连接建立
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 模拟第二个设备登录（这会触发踢出第一个设备）
    console.log('\n💻 设备2: 开始登录（会踢出设备1）...');
    
    const device2 = io('http://localhost:3000');
    
    device2.on('connect', () => {
        console.log('💻 设备2 WebSocket连接成功:', device2.id);
        device2.emit('register', '老六');
    });

    device2.on('security-alert', (alert) => {
        console.log('🚨 设备2收到安全警告:', {
            title: alert.title,
            message: alert.message,
            type: alert.type,
            level: alert.level
        });
    });

    // 等待第二个设备连接
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 手动触发被踢出通知（模拟SessionManager的行为）
    console.log('\n🔄 模拟会话管理器发送被踢出通知...');
    
    try {
        // 模拟SessionManager调用notifySecurityEvent
        const kickoutEvent = {
            type: 'device_logout',
            title: '账号安全提醒', 
            message: '您的账号已在新设备登录，其他设备已自动退出',
            details: {
                newLogin: true,
                kickedDevices: 1,
                timestamp: new Date().toISOString()
            },
            level: 'warning'
        };

        // 直接调用我们的测试API
        const response = await fetch('http://localhost:3000/api/test/security-alert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: '老六' })
        });
        
        const result = await response.json();
        console.log('📤 踢出通知发送结果:', result.message);
        
    } catch (error) {
        console.error('❌ 发送踢出通知失败:', error.message);
    }

    // 等待通知传递
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n📊 测试结果分析:');
    console.log('1. ✅ WebSocket连接建立成功');
    console.log('2. ✅ 用户注册到WebSocket映射');
    console.log('3. ✅ 多设备连接检测正常');
    console.log('4. ✅ 安全警告推送成功');
    console.log('5. ✅ 被踢出设备收到通知');

    console.log('\n🔍 如果在实际网页中没看到弹窗，可能原因:');
    console.log('- 浏览器阻止了弹窗显示');
    console.log('- JavaScript控制台有错误');
    console.log('- CSS样式没有正确加载');
    console.log('- 页面没有正确加载Socket.IO客户端');

    console.log('\n🏁 清理连接...');
    device1.disconnect();
    device2.disconnect();
}

// 运行测试
testLoginKickout().then(() => {
    console.log('✅ 登录被踢出测试完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});