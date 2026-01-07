require('dotenv').config();
const pool = require('./db');

async function checkDatabase() {
  try {
    console.log('🔍 检查数据库用户表结构...\n');
    
    // 检查表结构
    const columnsResult = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    
    console.log('📋 用户表字段结构:');
    console.table(columnsResult.rows);
    
    // 检查所有用户
    const usersResult = await pool.query(`
      SELECT username, authorized, is_admin, balance, created_at 
      FROM users 
      ORDER BY username
    `);
    
    console.log('\n👥 当前用户列表:');
    console.table(usersResult.rows);
    
    // 检查管理员用户
    const adminResult = await pool.query(`
      SELECT username, authorized, is_admin, balance 
      FROM users 
      WHERE is_admin = true
    `);
    
    console.log('\n👑 管理员用户:');
    if (adminResult.rows.length > 0) {
      console.table(adminResult.rows);
    } else {
      console.log('❌ 没有找到管理员用户！');
      console.log('\n💡 要设置管理员，请运行以下SQL命令:');
      console.log('UPDATE users SET is_admin = true WHERE username = \'你的用户名\';');
    }
    
  } catch (error) {
    console.error('❌ 数据库查询错误:', error);
  } finally {
    await pool.end();
  }
}

checkDatabase();