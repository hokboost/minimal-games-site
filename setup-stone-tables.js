#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pool = require('./db');

async function setupStoneTables() {
    const client = await pool.connect();
    try {
        console.log('🪨 开始创建合石头数据库表...');

        const sqlFile = path.join(__dirname, 'migrations', 'create_stone_tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        await client.query(sql);

        console.log('✅ 合石头表创建成功！');

        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('stone_states', 'stone_logs')
        `);

        console.log('📊 创建的表:', result.rows.map(row => row.table_name));
    } catch (error) {
        console.error('❌ 创建合石头表失败:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    try {
        await setupStoneTables();
        console.log('\n🧩 合石头数据库已准备就绪！');
        process.exit(0);
    } catch (error) {
        console.error('设置失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { setupStoneTables };
