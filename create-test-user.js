// 创建测试用户
const bcrypt = require('bcryptjs');
const pool = require('./db');

async function createTestUser() {
    console.log('👤 创建测试用户...');

    try {
        // 检查用户是否已存在
        const existingUser = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            ['老六']
        );

        if (existingUser.rows.length > 0) {
            console.log('👤 用户"老六"已存在，更新密码...');
            
            const hashedPassword = await bcrypt.hash('111111', 10);
            
            await pool.query(`
                UPDATE users 
                SET password_hash = $1, authorized = true, balance = 1000
                WHERE username = $2
            `, [hashedPassword, '老六']);
            
            console.log('✅ 用户"老六"密码已更新为: 111111');
        } else {
            console.log('👤 创建新用户"老六"...');
            
            const hashedPassword = await bcrypt.hash('111111', 10);
            
            await pool.query(`
                INSERT INTO users (username, password_hash, authorized, is_admin, balance, created_at)
                VALUES ($1, $2, true, false, 1000, NOW())
            `, ['老六', hashedPassword]);
            
            console.log('✅ 新用户"老六"创建成功，密码: 111111');
        }

        // 验证用户
        const user = await pool.query(
            'SELECT username, authorized, balance FROM users WHERE username = $1',
            ['老六']
        );

        if (user.rows.length > 0) {
            const userInfo = user.rows[0];
            console.log('📋 用户信息确认:');
            console.log(`   用户名: ${userInfo.username}`);
            console.log(`   已授权: ${userInfo.authorized}`);
            console.log(`   电币余额: ${userInfo.balance}`);
        }

        // 清理旧会话
        await pool.query('DELETE FROM active_sessions WHERE username = $1', ['老六']);
        console.log('🧹 已清理旧会话');

        console.log('\n💡 现在可以使用以下信息登录测试:');
        console.log('   用户名: 老六');
        console.log('   密码: 111111');
        console.log('   网址: http://localhost:3000');

    } catch (error) {
        console.error('❌ 创建用户失败:', error);
    }
}

createTestUser();