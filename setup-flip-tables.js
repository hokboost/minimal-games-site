#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pool = require('./db');

async function setupFlipTables() {
    const client = await pool.connect();
    try {
        console.log('🃏 开始创建翻卡牌数据库表...');

        const sqlFile = path.join(__dirname, 'migrations', 'create_flip_tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        await client.query(sql);

        console.log('✅ 翻卡牌表创建成功！');

        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('flip_states')
        `);

        console.log('📊 创建的表:', result.rows.map(row => row.table_name));
    } catch (error) {
        console.error('❌ 创建翻卡牌表失败:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    try {
        await setupFlipTables();
        console.log('\n🧩 翻卡牌数据库已准备就绪！');
        process.exit(0);
    } catch (error) {
        console.error('设置失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { setupFlipTables };
