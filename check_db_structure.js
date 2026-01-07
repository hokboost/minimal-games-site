require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false } // 强制启用SSL
});

async function checkDatabaseStructure() {
  try {
    console.log('🔍 检查数据库用户表结构...\n');
    
    // 检查表结构 - 显示所有字段
    const columnsResult = await pool.query(`
      SELECT 
        column_name as "字段名", 
        data_type as "数据类型", 
        is_nullable as "允许NULL", 
        column_default as "默认值"
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 users 表的所有字段:');
    console.table(columnsResult.rows);
    
  } catch (error) {
    console.error('❌ 数据库查询错误:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkDatabaseStructure();