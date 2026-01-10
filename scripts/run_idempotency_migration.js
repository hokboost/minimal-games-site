const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Use the verified connection string directly
const connectionString = 'postgres://quiz_db_i6kg_user:bc6GYvT7jjfbtyEyOnZzfU04lvfdLO4S@dpg-d16r57fdiees73dgmkj0-a.oregon-postgres.render.com/quiz_db_i6kg';

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

async function runMigration() {
    console.log('Starting migration script...');

    try {
        const sqlPath = path.join(__dirname, '..', 'migrations', 'add_idempotency_key.sql');
        console.log('Checking SQL file at:', sqlPath);

        if (!fs.existsSync(sqlPath)) {
            console.error('ERROR: SQL file not found!');
            process.exit(1);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('SQL loaded, length:', sql.length);

        console.log('Connecting to database...');
        const client = await pool.connect();
        console.log('Connected successfully. Running query...');

        try {
            await client.query(sql);
            console.log('Migration completed successfully.');
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await pool.end();
    }
}

runMigration();
