// 调试环境变量
require('dotenv').config();

console.log('=== 环境变量调试 ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_PASS:', process.env.DB_PASS ? '***设置了***' : '未设置');
console.log('DB_PORT:', process.env.DB_PORT);
console.log('SESSION_SECRET:', process.env.SESSION_SECRET ? '***设置了***' : '未设置');
console.log('=====================');