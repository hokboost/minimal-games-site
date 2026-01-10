const fs = require('fs');

const envContent = `ADMIN_IP_WHITELIST=142.122.111.63
ADMIN_PASSWORD=your-admin-password
ADMIN_SIGN_SECRET=725b9a3501674b5998ec0101fe317e07d67143d6911a0d4c55a3b58e772deab7
DB_HOST=dpg-d16r57fdiees73dgmkj0-a.oregon-postgres.render.com
DB_NAME=quiz_db_i6kg
DB_PASS=bc6GYvT7jjfbtyEyOnZzfU04lvfdLO4S
DB_PORT=5432
DB_USER=quiz_db_i6kg_user
GIFT_TASKS_HMAC_SECRET=932be5abbb5e542af914e5f4ce779d14fd98a09638f8d7cb37f55024e5a944c3
NODE_ENV=production
SESSION_SECRET=your-super-secret-key
WINDOWS_API_KEY=bilibili-gift-service-secret-key-2024-secure`;

fs.writeFileSync('.env', envContent, 'utf8');
console.log('.env file written successfully (clean UTF-8).');
