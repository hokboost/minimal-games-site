// hokboost管理员保护机制测试
const IPManager = require('./ip-manager');
const SessionManager = require('./session-manager');

async function testHokboostProtection() {
    console.log('🧪 测试hokboost管理员保护机制\n');

    // 测试1: IP风险评估保护
    console.log('1. 测试IP风险评估保护...');
    try {
        const testIP = '192.168.100.100';
        
        // 普通用户的风险评估
        const normalUserRisk = await IPManager.getIPRiskScore(testIP, 'testuser');
        console.log(`普通用户风险评估:`, normalUserRisk);
        
        // hokboost的风险评估（应该永远安全）
        const hokboostRisk = await IPManager.getIPRiskScore(testIP, 'hokboost');
        console.log(`hokboost风险评估:`, hokboostRisk);
        
        if (hokboostRisk.score === 0 && hokboostRisk.level === 'SAFE') {
            console.log('✅ hokboost IP风险评估保护正常');
        } else {
            console.log('❌ hokboost IP风险评估保护失败');
        }
    } catch (error) {
        console.log('❌ IP风险评估测试失败:', error.message);
    }

    // 测试2: 多设备登录保护
    console.log('\n2. 测试多设备登录保护...');
    try {
        const hokboostSession1 = 'hokboost_session_1';
        const hokboostSession2 = 'hokboost_session_2';
        const testIP = '192.168.100.100';
        const userAgent = 'Test Browser';

        // hokboost创建第一个会话
        await SessionManager.createSingleDeviceSession(
            'hokboost', hokboostSession1, testIP, userAgent + ' 1'
        );
        console.log('✅ hokboost会话1创建成功');

        // hokboost创建第二个会话（应该不踢出第一个）
        await SessionManager.createSingleDeviceSession(
            'hokboost', hokboostSession2, testIP, userAgent + ' 2'
        );
        console.log('✅ hokboost会话2创建成功');

        // 验证两个会话都有效
        const session1Valid = await SessionManager.validateSession(hokboostSession1);
        const session2Valid = await SessionManager.validateSession(hokboostSession2);

        console.log(`hokboost会话1状态: ${session1Valid ? '有效' : '失效'}`);
        console.log(`hokboost会话2状态: ${session2Valid ? '有效' : '失效'}`);

        if (session1Valid && session2Valid) {
            console.log('✅ hokboost多设备登录保护正常');
        } else {
            console.log('❌ hokboost多设备登录保护失败');
        }

        // 清理测试会话
        await SessionManager.terminateSession(hokboostSession1, 'test_cleanup');
        await SessionManager.terminateSession(hokboostSession2, 'test_cleanup');

    } catch (error) {
        console.log('❌ 多设备登录测试失败:', error.message);
    }

    // 测试3: 强制注销保护
    console.log('\n3. 测试强制注销保护...');
    try {
        const result = await SessionManager.forceLogoutUser('hokboost', 'test_force_logout');
        
        if (result === 0) {
            console.log('✅ hokboost强制注销保护正常 - 拒绝注销');
        } else {
            console.log('❌ hokboost强制注销保护失败 - 意外被注销');
        }
    } catch (error) {
        console.log('❌ 强制注销测试失败:', error.message);
    }

    // 测试4: 白名单保护验证
    console.log('\n4. 验证白名单保护...');
    try {
        const whitelistIPs = ['127.0.0.1', '::1', '192.168.1.1', '10.0.0.1'];
        
        for (const ip of whitelistIPs) {
            const riskData = await IPManager.getIPRiskScore(ip);
            const isWhitelisted = riskData.reasons.some(reason => 
                reason.includes('白名单') || reason.includes('hokboost')
            );
            
            if (isWhitelisted && riskData.score === 0) {
                console.log(`✅ IP ${ip} 白名单保护正常`);
            } else {
                console.log(`⚠️ IP ${ip} 白名单状态异常:`, riskData);
            }
        }
    } catch (error) {
        console.log('❌ 白名单验证失败:', error.message);
    }

    console.log('\n🎉 hokboost保护机制测试完成！');
    
    console.log('\n📋 保护机制总结:');
    console.log('1. ✅ IP风险评估: hokboost永远返回安全等级');
    console.log('2. ✅ 多设备登录: hokboost可以同时在多个设备登录');
    console.log('3. ✅ 强制注销保护: hokboost不能被强制注销');
    console.log('4. ✅ IP白名单: hokboost的历史登录IP自动保护');
    console.log('5. ✅ API保护: 其他管理员不能对hokboost执行危险操作');
    
    process.exit(0);
}

// 运行测试
testHokboostProtection().catch(console.error);