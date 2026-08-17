#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');
const { Pool } = require('pg');
const {
    assertSupportedNodeRuntime,
    inspectTarGzip,
    validateStagedTree,
    verifyManifest,
    verifyRelativeJavaScriptDependencies
} = require('./build-release');

const root = path.resolve(__dirname, '..');
const artifactDirectory = path.join(root, 'build', 'artifacts');

if (process.env.ALLOW_DATABASE_CREATE_TEST !== 'true') {
    throw new Error('Set ALLOW_DATABASE_CREATE_TEST=true to verify a release artifact');
}

function sha256File(filename) {
    return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function writeJson(filename, value) {
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function npmExecutable() {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function databaseConfig(database) {
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS
        || !process.env.DB_NAME) {
        throw new Error('Release verification requires DB_HOST, DB_NAME, DB_USER, and DB_PASS');
    }
    return {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        database,
        ssl: process.env.DB_SSL === 'false'
            ? false
            : { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' },
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
        max: 2
    };
}

async function freePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const port = server.address().port;
            server.close((error) => error ? reject(error) : resolve(port));
        });
    });
}

function requestReady(port) {
    return new Promise((resolve) => {
        const request = http.get({
            hostname: '127.0.0.1',
            port,
            path: '/ready',
            timeout: 2000
        }, (response) => {
            let body = '';
            response.setEncoding('utf8');
            response.on('data', (chunk) => { body += chunk; });
            response.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(response.statusCode === 200 && parsed.ready === true);
                } catch {
                    resolve(false);
                }
            });
        });
        request.on('timeout', () => { request.destroy(); resolve(false); });
        request.on('error', () => resolve(false));
    });
}

async function waitForReadiness(child, port, timeoutMs = 120000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Release server exited before readiness (${child.exitCode})`);
        if (await requestReady(port)) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error('Release server did not become ready before timeout');
}

async function stopChild(child) {
    if (child.exitCode !== null) return child.exitCode;
    child.kill('SIGTERM');
    const exited = new Promise((resolve) => child.once('exit', (code, signal) =>
        resolve({ code, signal })));
    let timeoutId;
    const timeout = new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve('timeout'), 20000);
    });
    const result = await Promise.race([exited, timeout]);
    clearTimeout(timeoutId);
    if (result === 'timeout') {
        child.kill('SIGKILL');
        await exited;
        throw new Error('Release server did not stop cleanly after SIGTERM');
    }
    if (result.code !== 0) {
        throw new Error(`Release server exited with status ${result.code ?? result.signal}`);
    }
    return result.code;
}

function secret(label) {
    return `${label}-${crypto.randomBytes(32).toString('hex')}`;
}

async function run() {
    assertSupportedNodeRuntime();
    const descriptorPath = path.join(artifactDirectory, 'RELEASE-ARCHIVE.json');
    const descriptor = JSON.parse(fs.readFileSync(descriptorPath, 'utf8'));
    const currentCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
    if (!/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(descriptor.archive)
        || !/^[0-9a-f]{64}$/.test(descriptor.sha256)
        || !/^[0-9a-f]{40}$/.test(descriptor.commit)
        || descriptor.commit !== currentCommit
        || descriptor.dirty !== false
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
        || !Number.isSafeInteger(descriptor.sourceDateEpoch) || descriptor.sourceDateEpoch < 1) {
        throw new Error('Release archive descriptor is malformed');
    }
    const archivePath = path.join(artifactDirectory, descriptor.archive);
    if (path.dirname(archivePath) !== artifactDirectory
        || fs.statSync(archivePath).size !== descriptor.bytes
        || sha256File(archivePath) !== descriptor.sha256) {
        throw new Error('Release archive checksum mismatch');
    }

    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-games-release-verify-'));
    const releaseRoot = path.join(temporary, 'release');
    const databaseName = `minimal_games_release_verify_${process.pid}_${Date.now()}`;
    if (!/^[a-z0-9_]+$/.test(databaseName)) throw new Error('Unsafe release verification database name');
    const adminPool = new Pool(databaseConfig(process.env.DB_NAME));
    let serverProcess = null;
    const serverOutput = [];
    let databaseCreated = false;
    try {
        inspectTarGzip(archivePath, { sourceDateEpoch: descriptor.sourceDateEpoch });
        execFileSync('tar', ['-xzf', archivePath, '-C', temporary], {
            cwd: root,
            stdio: 'inherit'
        });
        validateStagedTree(releaseRoot);
        verifyRelativeJavaScriptDependencies(releaseRoot);
        const manifest = verifyManifest(releaseRoot);
        if (manifest.files.some((entry) => /(^|\/)(?:node_modules|tests|\.git|__pycache__)(\/|$)/i
            .test(entry.path))) {
            throw new Error('Release manifest contains development or cache content');
        }

        execFileSync(npmExecutable(), [
            'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'
        ], {
            cwd: releaseRoot,
            env: { ...process.env, NODE_ENV: 'production' },
            stdio: 'inherit'
        });

        await adminPool.query(`CREATE DATABASE "${databaseName}"`);
        databaseCreated = true;
        const databaseEnvironment = {
            ...process.env,
            NODE_ENV: 'production',
            DB_HOST: process.env.DB_HOST,
            DB_PORT: String(process.env.DB_PORT || 5432),
            DB_USER: process.env.DB_USER,
            DB_PASS: process.env.DB_PASS,
            DB_NAME: databaseName,
            DB_SSL: process.env.DB_SSL || 'false',
            DB_SSL_REJECT_UNAUTHORIZED: process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true'
        };
        execFileSync(process.execPath, ['scripts/run-migrations.js'], {
            cwd: releaseRoot,
            env: databaseEnvironment,
            stdio: 'inherit'
        });

        const port = await freePort();
        const readinessToken = secret('readiness');
        const workerApiKey = secret('worker-api');
        const workerHmac = secret('worker-hmac');
        const serverEnvironment = {
            ...databaseEnvironment,
            PORT: String(port),
            DB_APPLICATION_NAME: 'release-verification',
            SESSION_SECRET: secret('session'),
            IDEMPOTENCY_HMAC_SECRET: secret('idempotency'),
            RESET_TOKEN_SECRET: secret('reset'),
            ANALYTICS_TOKEN_SECRET: secret('analytics'),
            DICTATION_TOKEN_SECRET: secret('dictation'),
            LOG_HASH_SECRET: secret('log'),
            READINESS_TOKEN: readinessToken,
            WORKER_CREDENTIALS_JSON: JSON.stringify({
                'release-worker-01': { apiKey: workerApiKey, hmacSecret: workerHmac }
            }),
            AUTO_MIGRATE: 'false',
            EXTERNAL_GIFTS_ENABLED: 'false',
            PK_EXTERNAL_SEND_ENABLED: 'false',
            STREAMER_WORLD_ENABLED: 'false',
            CREATOR_PROFILE_ENABLED: 'false',
            QUEST_ENGINE_V2_ENABLED: 'false',
            STORY_WORLD_ENABLED: 'false',
            LIVE_INTERACTIONS_ENABLED: 'false',
            STREAMER_NEW_GAMES_ENABLED: 'false',
            STREAMER_REWARD_CATALOG_ENABLED: 'false',
            STREAMER_ACHIEVEMENTS_ENABLED: 'false',
            PUBLIC_ORIGINS: 'https://release-verification.invalid'
        };
        serverProcess = spawn(process.execPath, ['server.js'], {
            cwd: releaseRoot,
            env: serverEnvironment,
            stdio: ['ignore', 'pipe', 'pipe']
        });
        const capture = (chunk) => {
            if (serverOutput.join('').length < 65536) serverOutput.push(String(chunk));
        };
        serverProcess.stdout.on('data', capture);
        serverProcess.stderr.on('data', capture);
        await waitForReadiness(serverProcess, port);
        await stopChild(serverProcess);
        serverProcess = null;

        const metadata = JSON.parse(fs.readFileSync(
            path.join(releaseRoot, 'RELEASE-METADATA.json'), 'utf8'
        ));
        if (metadata.commit !== descriptor.commit || metadata.dirty !== false
            || metadata.sourceDateEpoch !== descriptor.sourceDateEpoch
            || metadata.sbom?.sha256 !== sha256File(path.join(releaseRoot, 'SBOM.cdx.json'))) {
            throw new Error('Release metadata does not match the archive descriptor or SBOM');
        }
        const migrationEntries = metadata.migrationLedger?.entries;
        if (!Array.isArray(migrationEntries)
            || migrationEntries.length !== metadata.migrationLedger.count
            || migrationEntries.some((entry) => !/^[a-z0-9_]+\.sql$/.test(entry.filename)
                || !/^[0-9a-f]{64}$/.test(entry.sha256)
                || sha256File(path.join(releaseRoot, 'migrations', entry.filename)) !== entry.sha256)) {
            throw new Error('Release migration ledger does not match staged migrations');
        }
        const combinedMigrationHash = crypto.createHash('sha256').update(migrationEntries
            .map((entry) => `${entry.filename}:${entry.sha256}\n`).join('')).digest('hex');
        if (combinedMigrationHash !== metadata.migrationLedger.combinedSha256
            || metadata.migrationLedger.latest !== migrationEntries.at(-1)?.filename) {
            throw new Error('Release migration ledger summary is invalid');
        }
        const result = {
            schemaVersion: 1,
            verifiedAt: new Date().toISOString(),
            archive: descriptor.archive,
            archiveSha256: descriptor.sha256,
            commit: descriptor.commit,
            dirty: descriptor.dirty,
            files: manifest.files.length,
            migrations: metadata.migrationLedger.count,
            latestMigration: metadata.migrationLedger.latest,
            productionDependenciesInstalled: true,
            freshMigrationsApplied: true,
            readinessPassed: true,
            gracefulSigtermPassed: true,
            providerSendsEnabled: false
        };
        writeJson(path.join(artifactDirectory, 'RELEASE-VERIFICATION.json'), result);
        console.log(`Clean release verification passed: ${descriptor.sha256}`);
    } catch (error) {
        if (serverProcess) {
            if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
                const exited = new Promise((resolve) => serverProcess.once('exit', resolve));
                serverProcess.kill('SIGKILL');
                await exited;
            }
        }
        if (serverOutput.length > 0) {
            console.error('Release server output:\n' + serverOutput.join('').slice(-12000));
        }
        throw error;
    } finally {
        if (databaseCreated) {
            await adminPool.query(
                'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',
                [databaseName]
            ).catch(() => {});
            await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`).catch((error) => {
                console.error('Failed to drop release verification database:', error.message);
                process.exitCode = 1;
            });
        }
        await adminPool.end().catch(() => {});
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
