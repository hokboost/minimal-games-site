// 测试数据库连接和表结构
require('dotenv').config();
const pool = require('./db');

async function testDatabase() {
    try {
        console.log('🔄 测试数据库连接...');
        
        // 测试基本连接
        const result = await pool.query('SELECT NOW() as current_time');
        console.log('✅ 数据库连接成功:', result.rows[0].current_time);
        
        // 检查用户表是否存在
        const tablesResult = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('users', 'user_sessions')
        `);
        
        console.log('📋 现有表:', tablesResult.rows.map(row => row.table_name));
        
        // 检查用户表结构
        if (tablesResult.rows.some(row => row.table_name === 'users')) {
            const columnsResult = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                ORDER BY ordinal_position
            `);
            
            console.log('👥 users 表结构:');
            columnsResult.rows.forEach(col => {
                console.log(`  - ${col.column_name}: ${col.data_type} (${col.is_nullable === 'YES' ? 'nullable' : 'not null'})`);
            });
        } else {
            console.log('⚠️  users 表不存在，需要创建');
        }
        
        // 检查会话表
        if (tablesResult.rows.some(row => row.table_name === 'user_sessions')) {
            console.log('✅ user_sessions 表存在');
        } else {
            console.log('⚠️  user_sessions 表不存在，需要创建');
        }
        
        // 检查现有用户
        if (tablesResult.rows.some(row => row.table_name === 'users')) {
            const usersResult = await pool.query('SELECT username, authorized, is_admin FROM users LIMIT 5');
            console.log('👤 现有用户 (前5个):');
            usersResult.rows.forEach(user => {
                console.log(`  - ${user.username} (授权: ${user.authorized ? '是' : '否'}, 管理员: ${user.is_admin ? '是' : '否'})`);
            });
        }
        
    } catch (error) {
        console.error('❌ 数据库测试失败:', error.message);
        console.error('详细信息:', error);
    } finally {
        await pool.end();
    }
}

testDatabase();