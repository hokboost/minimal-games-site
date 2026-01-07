const pool = require('./db');
const fs = require('fs');

async function setupSecurityTables() {
    try {
        const sql = fs.readFileSync('./setup-security-tables.sql', 'utf8');
        await pool.query(sql);
        console.log('安全管理数据表创建成功');
    } catch (error) {
        console.error('创建表失败:', error);
    }
}

setupSecurityTables();