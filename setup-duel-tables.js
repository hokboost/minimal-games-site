#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const pool = require('./db');

async function setupDuelTables() {
    const client = await pool.connect();
    try {
        console.log('⚔️ 开始创建决斗挑战数据库表...');

        const sqlFile = path.join(__dirname, 'migrations', 'create_duel_tables.sql');
        const sql = fs.readFileSync(sqlFile, 'utf-8');
        await client.query(sql);

        console.log('✅ 决斗挑战表创建成功！');

        const result = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('duel_logs')
        `);

        console.log('📊 创建的表:', result.rows.map(row => row.table_name));
    } catch (error) {
        console.error('❌ 创建决斗挑战表失败:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function main() {
    try {
        await setupDuelTables();
        console.log('\n🧩 决斗挑战数据库已准备就绪！');
        process.exit(0);
    } catch (error) {
        console.error('设置失败:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { setupDuelTables };
