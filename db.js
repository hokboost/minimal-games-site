// db.js - 数据库连接配置 (共享kingboost数据库)
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: true,
    ca: process.env.DB_SSL_CA,
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// 连接监控和错误处理
pool.on('error', (err) => {
  console.error('数据库连接池错误:', err);
  process.exit(-1);
});

pool.on('connect', () => {
  console.log('Minimal-Games-Site 连接到共享数据库成功');
});

module.exports = pool;