// db.js - 数据库连接配置 (共享kingboost数据库)
require('dotenv').config();
const { Pool } = require('pg');

// 数据库配置
const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // 快速失败，避免堆积
};

// Render PostgreSQL 总是需要SSL
dbConfig.ssl = {
  rejectUnauthorized: false // Render 需要这个设置
};

console.log('数据库配置:', {
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  port: dbConfig.port,
  ssl: dbConfig.ssl ? '启用' : '禁用',
  env: process.env.NODE_ENV
});

const pool = new Pool(dbConfig);

// 连接监控和错误处理
pool.on('error', (err) => {
  console.error('数据库连接池错误:', err);
  process.exit(-1);
});

pool.on('connect', (client) => {
  client.query(`
    SET TIME ZONE 'Asia/Shanghai';
    SET statement_timeout = '12000ms';
    SET lock_timeout = '3000ms';
  `).catch((error) => {
    console.error('设置数据库会话参数失败:', error);
  });
  console.log('Minimal-Games-Site 连接到共享数据库成功');
});

module.exports = pool;
