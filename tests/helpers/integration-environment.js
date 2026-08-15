'use strict';

require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { fork } = require('node:child_process');
const bcrypt = require('bcryptjs');
const fetch = require('node-fetch');
const { Pool } = require('pg');
const { applyDatabaseMigrations } = require('../../lib/database-migrations');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_PASSWORD = 'IntegrationPass123';
const secretFor = (label) => crypto.createHash('sha256')
    .update(`minimal-games-integration:${label}:${process.pid}`)
    .digest('hex');
const TEST_WORKER_CREDENTIALS = Object.freeze({
    'integration-worker-a': Object.freeze({
        apiKey: secretFor('worker-a-api-key'),
        hmacSecret: secretFor('worker-a-hmac')
    }),
    'integration-worker-b': Object.freeze({
        apiKey: secretFor('worker-b-api-key'),
        hmacSecret: secretFor('worker-b-hmac')
    })
});
const TEST_SECRETS = Object.freeze({
    session: secretFor('session'),
    log: secretFor('log'),
    idempotency: secretFor('idempotency')
});

function requireDisposableDatabaseOptIn() {
    if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
        throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to run disposable database integration tests');
    }
}

function databaseSslConfig() {
    const local = ['localhost', '127.0.0.1', '::1'].includes(process.env.DB_HOST);
    if (process.env.DB_SSL === 'false' || local) return false;
    const ssl = {
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
    };
    if (process.env.DB_SSL_CA) ssl.ca = fs.readFileSync(process.env.DB_SSL_CA, 'utf8');
    if (process.env.DB_SSL_SERVERNAME) ssl.servername = process.env.DB_SSL_SERVERNAME;
    return ssl;
}

function commonDatabaseConfig(applicationName) {
    return {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        ssl: databaseSslConfig(),
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
        application_name: applicationName,
        options: '-c timezone=UTC'
    };
}

function disposableDatabaseName(prefix = 'runtime') {
    const suffix = `${process.pid}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const name = `minimal_games_${prefix}_${suffix}`.toLowerCase();
    if (!/^[a-z0-9_]{1,63}$/.test(name)) throw new Error('Unsafe disposable database name');
    return name;
}

class DisposableDatabase {
    constructor(prefix = 'runtime') {
        requireDisposableDatabaseOptIn();
        this.name = disposableDatabaseName(prefix);
        this.adminPool = new Pool({
            ...commonDatabaseConfig(`mgs-test-admin-${process.pid}`),
            database: process.env.DB_NAME,
            max: 1
        });
        this.pool = null;
        this.created = false;
    }

    async create() {
        await this.adminPool.query(`CREATE DATABASE "${this.name}"`);
        this.created = true;
        this.pool = new Pool({
            ...commonDatabaseConfig(`mgs-test-client-${process.pid}`),
            database: this.name,
            max: 8
        });
        await applyDatabaseMigrations(this.pool);
        return this;
    }

    async createUser({
        username = `integration_${crypto.randomBytes(4).toString('hex')}`,
        password = DEFAULT_PASSWORD,
        balance = 1000000,
        isAdmin = false
    } = {}) {
        const passwordHash = await bcrypt.hash(password, 4);
        await this.pool.query(`
            INSERT INTO users (
                username, password_hash, balance, authorized, is_admin, registration_ip
            ) VALUES ($1, $2, $3, TRUE, $4, '127.0.0.1')
        `, [username, passwordHash, balance, isAdmin]);
        return { username, password, balance };
    }

    async close() {
        await this.pool?.end().catch(() => {});
        if (this.created) {
            await this.adminPool.query(
                'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
                [this.name]
            ).catch(() => {});
            await this.adminPool.query(`DROP DATABASE IF EXISTS "${this.name}"`);
        }
        await this.adminPool.end().catch(() => {});
    }
}

async function reservePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close((error) => (error ? reject(error) : resolve(port)));
        });
    });
}

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForExit(child, timeoutMs = 12000) {
    if (child.exitCode !== null || child.signalCode !== null) {
        return { code: child.exitCode, signal: child.signalCode };
    }
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Child process did not exit in time'));
        }, timeoutMs);
        const onExit = (code, signal) => {
            cleanup();
            resolve({ code, signal });
        };
        const cleanup = () => {
            clearTimeout(timer);
            child.removeListener('exit', onExit);
        };
        child.once('exit', onExit);
    });
}

function createAppEnvironment({ databaseName, port, applicationName, faultToken, poolMax = 6 }) {
    const env = {
        ...process.env,
        NODE_ENV: 'test',
        DB_NAME: databaseName,
        DB_POOL_MAX: String(poolMax),
        DB_APPLICATION_NAME: applicationName,
        DATABASE_STATEMENT_TIMEOUT_MS: '12000',
        PORT: String(port),
        PUBLIC_ORIGINS: `http://127.0.0.1:${port}`,
        SESSION_SECRET: TEST_SECRETS.session,
        LOG_HASH_SECRET: TEST_SECRETS.log,
        IDEMPOTENCY_HMAC_SECRET: TEST_SECRETS.idempotency,
        WORKER_CREDENTIALS_JSON: JSON.stringify(TEST_WORKER_CREDENTIALS),
        SERVER_URL: `http://127.0.0.1:${port}`,
        GIFT_TASKS_IP_WHITELIST: '',
        CSRF_TEST_MODE: 'false',
        CSRF_AUTO_FILL: 'false',
        ENABLE_TEST_FAULT_INJECTION: faultToken ? 'true' : 'false',
        TEST_FAULT_TOKEN: faultToken || '',
        TEST_FAULT_PAUSE_MS: '1500'
    };
    delete env.WINDOWS_API_KEY;
    delete env.GIFT_TASKS_HMAC_SECRET;
    return env;
}

async function startApp({
    databaseName,
    port,
    label = 'app',
    faultToken = null,
    poolMax = 6,
    extraEnv = {}
}) {
    const applicationName = `mgs-test-${label}-${process.pid}`.slice(0, 63);
    const child = fork(path.join(PROJECT_ROOT, 'server.js'), [], {
        cwd: PROJECT_ROOT,
        env: {
            ...createAppEnvironment({ databaseName, port, applicationName, faultToken, poolMax }),
            ...extraEnv
        },
        stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    const output = [];
    const faultEvents = [];
    const recordOutput = (chunk) => {
        output.push(String(chunk));
        if (output.length > 200) output.shift();
    };
    child.stdout.on('data', recordOutput);
    child.stderr.on('data', recordOutput);
    child.on('message', (message) => {
        if (message?.type === 'test-fault-point') faultEvents.push(message);
    });

    const baseUrl = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) {
            throw new Error(`${label} exited during startup (${child.exitCode})\n${output.join('')}`);
        }
        try {
            const response = await fetch(`${baseUrl}/ready`, { timeout: 2000 });
            const body = await response.json();
            if (response.status === 200 && body.ready === true) {
                return {
                    applicationName,
                    baseUrl,
                    child,
                    faultEvents,
                    label,
                    output,
                    async stop() {
                        if (child.exitCode !== null || child.signalCode !== null) return;
                        child.kill('SIGTERM');
                        try {
                            await waitForExit(child);
                        } catch {
                            child.kill('SIGKILL');
                            await waitForExit(child, 5000).catch(() => {});
                        }
                    }
                };
            }
        } catch (error) {
            if (child.exitCode !== null) break;
        }
        await delay(150);
    }
    child.kill('SIGKILL');
    await waitForExit(child, 5000).catch(() => {});
    throw new Error(`${label} did not become ready\n${output.join('')}`);
}

function updateCookieJar(jar, response) {
    const values = response.headers.raw()['set-cookie'] || [];
    for (const value of values) {
        const pair = value.split(';', 1)[0];
        const separator = pair.indexOf('=');
        if (separator <= 0) continue;
        jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
}

function cookieHeader(jar) {
    return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function extractCsrf(html) {
    const match = String(html).match(/data-csrf-token="([^"]+)"/)
        || String(html).match(/name="_csrf"\s+value="([^"]+)"/);
    if (!match) throw new Error('CSRF token not found in response');
    return match[1];
}

class BrowserSession {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.cookies = new Map();
        this.csrfToken = null;
        this.username = null;
    }

    async request(pathname, options = {}) {
        const headers = { ...(options.headers || {}) };
        const cookies = cookieHeader(this.cookies);
        if (cookies) headers.cookie = cookies;
        const response = await fetch(`${this.baseUrl}${pathname}`, {
            ...options,
            headers,
            redirect: options.redirect || 'manual',
            timeout: options.timeout || 10000
        });
        updateCookieJar(this.cookies, response);
        return response;
    }

    cookieHeader() {
        return cookieHeader(this.cookies);
    }

    async login({ username, password = DEFAULT_PASSWORD }) {
        const loginPage = await this.request('/login');
        assert.equal(loginPage.status, 200);
        const loginToken = extractCsrf(await loginPage.text());
        const body = new URLSearchParams({ username, password, _csrf: loginToken });
        const response = await this.request('/login', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
        assert.equal(response.status, 302, `Login failed with status ${response.status}`);
        const slotPage = await this.request('/slot');
        assert.equal(slotPage.status, 200);
        this.csrfToken = extractCsrf(await slotPage.text());
        this.username = username;
        return this;
    }

    async postJson(pathname, body, { idempotencyKey, headers = {}, timeout = 10000 } = {}) {
        const requestHeaders = {
            'content-type': 'application/json',
            'x-csrf-token': this.csrfToken,
            ...headers
        };
        if (idempotencyKey) requestHeaders['idempotency-key'] = idempotencyKey;
        return this.request(pathname, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(body || {}),
            timeout
        });
    }
}

async function expectConnectionLoss(promise) {
    try {
        const response = await promise;
        await response.text().catch(() => {});
        throw new Error(`Expected connection loss, received HTTP ${response.status}`);
    } catch (error) {
        if (/Expected connection loss/.test(error.message)) throw error;
        return error;
    }
}

module.exports = {
    BrowserSession,
    DEFAULT_PASSWORD,
    DisposableDatabase,
    TEST_SECRETS,
    TEST_WORKER_CREDENTIALS,
    commonDatabaseConfig,
    delay,
    expectConnectionLoss,
    reservePort,
    startApp,
    waitForExit
};
