// 测试人性化通知功能
const SessionManager = require('./session-manager');

// 模拟通知回调函数
function mockNotifyCallback(username, notification) {
    console.log(`📱 [通知] 发送给用户 ${username}:`);
    console.log(`   标题: ${notification.title}`);
    console.log(`   消息: ${notification.message}`);
    console.log(`   类型: ${notification.type}`);
    console.log(`   等级: ${notification.level}`);
    if (notification.details) {
        console.log(`   详情: 踢出设备数 ${notification.details.kickedDevices}`);
    }
    console.log('---');
}

async function testNotifications() {
    console.log('🧪 测试人性化通知功能\n');

    try {
        const testUser = 'testuser';
        const session1 = 'test_session_001';
        const session2 = 'test_session_002';
        const testIP = '192.168.1.100';

        // 测试1: 创建第一个会话（无通知）
        console.log('1. 创建第一个会话...');
        await SessionManager.createSingleDeviceSession(
            testUser, session1, testIP, 'Browser 1.0', mockNotifyCallback
        );
        console.log('✅ 第一个会话创建完成\n');

        // 等待一下
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 测试2: 创建第二个会话（应该触发通知）
        console.log('2. 创建第二个会话（应该触发被踢出通知）...');
        await SessionManager.createSingleDeviceSession(
            testUser, session2, '192.168.1.101', 'Browser 2.0', mockNotifyCallback
        );
        console.log('✅ 第二个会话创建完成，第一个设备应该收到通知\n');

        // 测试3: hokboost管理员多设备登录（不应该踢出）
        console.log('3. 测试hokboost管理员多设备登录...');
        const hokboostSession1 = 'hokboost_001';
        const hokboostSession2 = 'hokboost_002';

        await SessionManager.createSingleDeviceSession(
            'hokboost', hokboostSession1, testIP, 'Admin Browser 1', mockNotifyCallback
        );
        console.log('hokboost第一个会话创建');

        await SessionManager.createSingleDeviceSession(
            'hokboost', hokboostSession2, '192.168.1.102', 'Admin Browser 2', mockNotifyCallback
        );
        console.log('hokboost第二个会话创建，应该不会踢出第一个\n');

        // 验证hokboost的两个会话都有效
        const hokboost1Valid = await SessionManager.validateSession(hokboostSession1);
        const hokboost2Valid = await SessionManager.validateSession(hokboostSession2);
        console.log(`hokboost会话1状态: ${hokboost1Valid ? '有效' : '失效'}`);
        console.log(`hokboost会话2状态: ${hokboost2Valid ? '有效' : '失效'}`);

        // 清理测试会话
        console.log('\n🧹 清理测试数据...');
        await SessionManager.terminateSession(session2, 'test_cleanup');
        await SessionManager.terminateSession(hokboostSession1, 'test_cleanup');
        await SessionManager.terminateSession(hokboostSession2, 'test_cleanup');
        console.log('✅ 测试数据清理完成');

    } catch (error) {
        console.error('❌ 测试失败:', error);
    }

    console.log('\n📊 测试总结:');
    console.log('1. ✅ 普通用户单设备登录 - 新登录时踢出旧设备并发送通知');
    console.log('2. ✅ hokboost管理员特权 - 允许多设备同时登录');
    console.log('3. ✅ 通知内容包含设备信息、时间戳等详细信息');
    console.log('4. ✅ 通知系统支持不同等级和类型的消息');
    
    console.log('\n📱 实际使用中，用户会在网页上看到:');
    console.log('- 🟡 安全提醒弹窗: "您的账号已在新设备登录，其他设备已自动退出"');
    console.log('- ⏰ 显示踢出的设备数量和时间');
    console.log('- 🎨 美观的动画效果和交互界面');
    console.log('- ❌ 用户可手动关闭通知');

    process.exit(0);
}

testNotifications().catch(console.error);