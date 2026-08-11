const fs = require('fs');
const path = require('path');
const pool = require('../db');

async function runMigration() {
    console.log('Starting migration script...');

    try {
        const sqlPath = path.join(__dirname, '..', 'migrations', 'add_idempotency_key.sql');
        console.log('Checking SQL file at:', sqlPath);

        if (!fs.existsSync(sqlPath)) {
            console.error('ERROR: SQL file not found!');
            process.exitCode = 1;
            return;
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
    } catch (error) {
        console.error('Migration failed:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

runMigration();
