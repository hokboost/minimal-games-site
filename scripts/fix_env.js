'use strict';

const fs = require('fs');
const crypto = require('crypto');

if (fs.existsSync('.env')) {
    console.error('Refusing to overwrite the existing .env file. Rotate secrets in your deployment provider instead.');
    process.exit(1);
}

const required = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASS'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
}

const randomSecret = () => crypto.randomBytes(32).toString('hex');
const envContent = [
    'NODE_ENV=production',
    `DB_HOST=${process.env.DB_HOST}`,
    `DB_NAME=${process.env.DB_NAME}`,
    `DB_USER=${process.env.DB_USER}`,
    `DB_PASS=${process.env.DB_PASS}`,
    `DB_PORT=${process.env.DB_PORT || '5432'}`,
    `SESSION_SECRET=${randomSecret()}`,
    `WINDOWS_API_KEY=${randomSecret()}`,
    `GIFT_TASKS_HMAC_SECRET=${randomSecret()}`,
    `ADMIN_SIGN_SECRET=${randomSecret()}`,
    'ADMIN_SIGN_ENFORCE=true',
    'GIFT_TASKS_HMAC_ENFORCE=true',
    `GIFT_TASKS_IP_WHITELIST=${process.env.GIFT_TASKS_IP_WHITELIST || ''}`,
    ''
].join('\n');

fs.writeFileSync('.env', envContent, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
console.log('.env created with fresh random application secrets.');
