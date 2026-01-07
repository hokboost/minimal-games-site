require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function checkUsers() {
  try {
    console.log('👥 查看所有用户信息...\n');
    
    // 查看所有用户
    const usersResult = await pool.query(`
      SELECT 
        id, 
        username, 
        authorized, 
        is_admin, 
        balance,
        created_at
      FROM users 
      ORDER BY id
    `);
    
    console.log('📋 当前所有用户:');
    console.table(usersResult.rows);
    
    // 检查管理员
    const adminCount = usersResult.rows.filter(user => user.is_admin).length;
    console.log(`\n👑 管理员数量: ${adminCount}`);
    
    if (adminCount === 0) {
      console.log('\n❌ 没有管理员用户！');
      console.log('💡 要设置管理员，选择一个用户名并运行:');
      console.log('node set_admin.js <用户名>');
    } else {
      const admins = usersResult.rows.filter(user => user.is_admin);
      console.log('\n✅ 管理员用户:');
      console.table(admins.map(user => ({
        用户名: user.username,
        用户ID: user.id,
        是否授权: user.authorized
      })));
    }
    
  } catch (error) {
    console.error('❌ 数据库查询错误:', error.message);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

checkUsers();