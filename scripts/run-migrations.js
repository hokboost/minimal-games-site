#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { validateServerEnvironment } = require('../lib/config-validation');
const { applyDatabaseMigrations } = require('../lib/database-migrations');
const pool = require('../db');

async function main() {
    validateServerEnvironment();
    await applyDatabaseMigrations(pool, {
        onMigration: (filename) => console.log(`Applying ${filename}`)
    });
    console.log('Database migrations completed');
}

main()
    .catch(() => {
        console.error('Database migration failed');
        process.exitCode = 1;
    })
    .finally(() => pool.end());
