// 安全功能测试脚本
const IPManager = require('./ip-manager');
const SessionManager = require('./session-manager');

async function testSecurity() {
    console.log('=== 安全功能测试开始 ===\n');

    // 测试1: IP风险评估
    console.log('1. 测试IP风险评估...');
    try {
        const testIP = '192.168.1.100';
        const riskData = await IPManager.getIPRiskScore(testIP, 'testuser');
        console.log(`✅ IP ${testIP} 风险评估:`, {
            score: riskData.score,
            level: riskData.level,
            reasons: riskData.reasons
        });
    } catch (error) {
        console.log('❌ IP风险评估失败:', error.message);
    }

    // 测试2: IP黑白名单功能
    console.log('\n2. 测试IP黑白名单功能...');
    try {
        const testIP = '10.0.0.1';
        
        // 添加到白名单
        const whitelistSuccess = await IPManager.addToWhitelist(testIP, '测试白名单', 'system');
        if (whitelistSuccess) {
            console.log(`✅ IP ${testIP} 已添加到白名单`);
            
            // 测试白名单风险评估
            const whitelistRisk = await IPManager.getIPRiskScore(testIP);
            console.log(`✅ 白名单IP风险评估:`, whitelistRisk);
        }

        // 添加到黑名单
        const blackIP = '10.0.0.2';
        const blacklistSuccess = await IPManager.addToBlacklist(blackIP, '测试黑名单', 'system');
        if (blacklistSuccess) {
            console.log(`✅ IP ${blackIP} 已添加到黑名单`);
            
            // 测试黑名单风险评估
            const blacklistRisk = await IPManager.getIPRiskScore(blackIP);
            console.log(`✅ 黑名单IP风险评估:`, blacklistRisk);
        }
    } catch (error) {
        console.log('❌ IP黑白名单测试失败:', error.message);
    }

    // 测试3: 会话管理
    console.log('\n3. 测试会话管理功能...');
    try {
        const testUser = 'testuser';
        const sessionId1 = 'session_001';
        const sessionId2 = 'session_002';
        const testIP = '192.168.1.200';
        const userAgent = 'Test Browser 1.0';

        // 创建第一个会话
        const session1Success = await SessionManager.createSingleDeviceSession(
            testUser, sessionId1, testIP, userAgent
        );
        console.log(`✅ 创建会话1: ${session1Success ? '成功' : '失败'}`);

        // 创建第二个会话（应该踢出第一个）
        const session2Success = await SessionManager.createSingleDeviceSession(
            testUser, sessionId2, testIP, userAgent
        );
        console.log(`✅ 创建会话2: ${session2Success ? '成功' : '失败'}`);

        // 验证第一个会话已失效
        const session1Valid = await SessionManager.validateSession(sessionId1);
        console.log(`✅ 会话1验证: ${session1Valid ? '仍有效（异常）' : '已失效（正常）'}`);

        // 验证第二个会话有效
        const session2Valid = await SessionManager.validateSession(sessionId2);
        console.log(`✅ 会话2验证: ${session2Valid ? '有效（正常）' : '失效（异常）'}`);

        // 获取用户活跃会话
        const activeSessions = await SessionManager.getUserActiveSessions(testUser);
        console.log(`✅ 用户活跃会话数: ${activeSessions.length}`);

        // 清理测试会话
        await SessionManager.terminateSession(sessionId2, 'test_cleanup');
        console.log(`✅ 清理测试会话完成`);

    } catch (error) {
        console.log('❌ 会话管理测试失败:', error.message);
    }

    // 测试4: 获取统计信息
    console.log('\n4. 测试统计信息...');
    try {
        const sessionStats = await SessionManager.getSessionStats();
        console.log('✅ 会话统计:', sessionStats);

        const ipStats = await IPManager.getIPStats('192.168.1.100');
        console.log('✅ IP统计:', ipStats);
    } catch (error) {
        console.log('❌ 统计信息测试失败:', error.message);
    }

    console.log('\n=== 安全功能测试完成 ===');
    process.exit(0);
}

// 运行测试
testSecurity().catch(console.error);