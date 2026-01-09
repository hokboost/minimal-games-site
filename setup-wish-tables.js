#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// 使用现有的数据库配置
const pool = require('./db');

async function setupWishTables() {
    const client = await pool.connect();
    
    try {
        console.log('🎯 开始创建祈愿功能数据库表...');
        
        // 读取SQL文件
        const sqlFile = path.join(__dirname, 'migrations', 'create_wish_tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        
        // 执行SQL
        await client.query(sql);
        
        console.log('✅ 祈愿表创建成功！');
        
        // 验证表是否创建成功
        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('wish_results', 'wish_progress', 'wish_sessions', 'wish_inventory')
        `);
        
        console.log('📊 创建的表:', result.rows.map(row => row.table_name));
        
        // 检查现有用户数量
        const userCount = await client.query('SELECT COUNT(*) FROM users');
        console.log(`👤 现有用户数量: ${userCount.rows[0].count}`);
        
        // 检查祈愿进度表数据
        const progressCount = await client.query('SELECT COUNT(*) FROM wish_progress');
        console.log(`🎯 祈愿进度记录数: ${progressCount.rows[0].count}`);
        
        console.log('🎉 祈愿功能数据库设置完成！');
        
    } catch (error) {
        console.error('❌ 创建祈愿表失败:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    try {
        await setupWishTables();
        console.log('\n🚀 祈愿功能已准备就绪！');
        console.log('   - 祈愿价格: 500电币/次');
        console.log('   - 成功率: 1.4%');
        console.log('   - 保底机制: 147次失败后第148次必出');
        console.log('   - 奖励: 深海歌姬 (30000电币)');
        
        process.exit(0);
    } catch (error) {
        console.error('设置失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { setupWishTables };
