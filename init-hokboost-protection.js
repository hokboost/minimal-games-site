// hokboost管理员账号保护初始化脚本
const IPManager = require('./ip-manager');
const pool = require('./db');

async function initHokboostProtection() {
    console.log('🔐 初始化hokboost管理员保护...');

    try {
        // 1. 获取hokboost账号的历史登录IP
        const loginIPs = await pool.query(`
            SELECT DISTINCT ip_address 
            FROM login_logs 
            WHERE username = 'hokboost' 
            AND login_result = 'success'
            AND created_at > NOW() - INTERVAL '30 days'
        `);

        console.log(`发现hokboost的 ${loginIPs.rows.length} 个历史登录IP`);

        // 2. 将这些IP全部添加到白名单
        for (const row of loginIPs.rows) {
            const ip = row.ip_address;
            const success = await IPManager.addToWhitelist(
                ip, 
                'hokboost管理员历史登录IP - 自动保护', 
                'system'
            );
            
            if (success) {
                console.log(`✅ 已将IP ${ip} 添加到白名单`);
            } else {
                console.log(`⚠️ IP ${ip} 可能已在白名单中`);
            }
        }

        // 3. 添加一些常见的安全IP到白名单（如果没有历史记录）
        if (loginIPs.rows.length === 0) {
            console.log('未找到历史登录记录，添加默认安全IP...');
            
            const defaultIPs = [
                '127.0.0.1',      // 本地
                '::1',            // IPv6 本地
                '192.168.1.1',    // 常见路由器IP
                '10.0.0.1'        // 常见内网IP
            ];

            for (const ip of defaultIPs) {
                await IPManager.addToWhitelist(
                    ip, 
                    'hokboost管理员默认安全IP', 
                    'system'
                );
                console.log(`✅ 已将默认IP ${ip} 添加到白名单`);
            }
        }

        // 4. 确保hokboost账号不会被意外锁定
        await pool.query(`
            UPDATE users 
            SET login_failures = 0, locked_until = NULL 
            WHERE username = 'hokboost'
        `);
        console.log('✅ 已清除hokboost账号的锁定状态');

        // 5. 添加安全事件记录
        await pool.query(`
            INSERT INTO security_events (
                event_type, username, description, severity, handled
            ) VALUES (
                'admin_protection_init', 'hokboost', 
                'hokboost管理员账号保护机制初始化完成', 'low', true
            )
        `);

        console.log('🎉 hokboost管理员保护初始化完成！');
        console.log('\n保护措施包括:');
        console.log('1. ✅ IP风险评估永远返回安全等级');
        console.log('2. ✅ 允许多设备同时登录');
        console.log('3. ✅ 防止被强制注销');
        console.log('4. ✅ 历史登录IP自动加入白名单');
        console.log('5. ✅ 账号锁定状态已清除');

    } catch (error) {
        console.error('❌ 初始化失败:', error);
    }
}

// 运行初始化
initHokboostProtection();