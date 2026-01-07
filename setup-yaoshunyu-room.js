const pool = require('./db');

async function setupYaoShunYuRoom() {
    try {
        console.log('开始设置尧顺宇的房间号...');
        
        // 首先添加bilibili_room_id字段（如果不存在）
        console.log('添加bilibili_room_id字段...');
        await pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS bilibili_room_id VARCHAR(20)
        `);
        
        // 添加索引
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_users_bilibili_room_id ON users(bilibili_room_id)
        `);
        
        // 检查用户表结构
        const tableInfo = await pool.query(`
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'users' 
            ORDER BY ordinal_position
        `);
        
        console.log('用户表结构:');
        tableInfo.rows.forEach(col => {
            console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(可空)' : '(不可空)'}`);
        });
        
        // 检查尧顺宇用户是否存在
        const userCheck = await pool.query(`
            SELECT username FROM users WHERE username = $1
        `, ['尧顺宇']);
        
        if (userCheck.rows.length === 0) {
            console.log('用户尧顺宇不存在，正在创建...');
            // 创建用户（密码yaoshunyu，需要hash）
            const bcrypt = require('bcryptjs');
            const hashedPassword = await bcrypt.hash('yaoshunyu', 12);
            
            await pool.query(`
                INSERT INTO users (username, password, authorized, is_admin, balance, bilibili_room_id, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
            `, ['尧顺宇', hashedPassword, true, false, 1000, '3929738']);
            
            console.log('✅ 用户尧顺宇创建成功，房间号: 3929738，初始余额: 1000电币');
        } else {
            // 更新现有用户的房间号和授权状态
            await pool.query(`
                UPDATE users 
                SET bilibili_room_id = $1, authorized = $2
                WHERE username = $3
            `, ['3929738', true, '尧顺宇']);
            
            console.log('✅ 用户尧顺宇房间号更新成功: 3929738，已设置为授权状态');
        }
        
        // 确认设置
        const result = await pool.query(`
            SELECT username, bilibili_room_id, balance, authorized 
            FROM users WHERE username = $1
        `, ['尧顺宇']);
        
        if (result.rows.length > 0) {
            const user = result.rows[0];
            console.log('✅ 设置完成:');
            console.log(`   用户名: ${user.username}`);
            console.log(`   房间号: ${user.bilibili_room_id}`);
            console.log(`   余额: ${user.balance} 电币`);
            console.log(`   授权状态: ${user.authorized ? '已授权' : '未授权'}`);
        }
        
    } catch (error) {
        console.error('❌ 设置失败:', error);
    } finally {
        await pool.end();
    }
}

setupYaoShunYuRoom();