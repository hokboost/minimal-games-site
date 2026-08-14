// db.js - 数据库连接配置 (共享kingboost数据库)
require('dotenv').config();
require('./lib/safe-logger').installSafeConsole();
const fs = require('fs');
const { Pool } = require('pg');

// 数据库配置
const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT || 5432,
  max: Math.min(50, Math.max(2, Number.parseInt(process.env.DB_POOL_MAX, 10) || 20)),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // 快速失败，避免堆积
  statement_timeout: Math.min(60000, Math.max(1000, Number.parseInt(process.env.DATABASE_STATEMENT_TIMEOUT_MS, 10) || 12000)),
  application_name: process.env.DB_APPLICATION_NAME || 'minimal-games-site',
  options: '-c timezone=UTC',
};

const isLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(dbConfig.host);
const sslDisabled = process.env.DB_SSL === 'false' || isLocalDatabase;
if (process.env.NODE_ENV === 'production' && !isLocalDatabase && sslDisabled) {
  throw new Error('Remote database TLS cannot be disabled in production');
}
if (!sslDisabled) {
  if (process.env.NODE_ENV === 'production' && process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false') {
    throw new Error('Remote database TLS verification cannot be disabled in production');
  }
  dbConfig.ssl = {
    rejectUnauthorized: true,
    servername: process.env.DB_SSL_SERVERNAME || dbConfig.host
  };
  if (process.env.DB_SSL_CA) {
    dbConfig.ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
  }
}

const pool = new Pool(dbConfig);

// 连接监控和错误处理
pool.on('error', (err) => {
  console.error('数据库连接池发生后台错误');
});

module.exports = pool;
