#!/usr/bin/env node

require('./lib/safe-logger').installSafeConsole();

/**
 * Windows B站礼物发送监听服务
 * 轮询Render服务器，并通过本机受保护的 provider-confirmed HTTP sender 处理礼物任务。
 */

const { spawn } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const {
    SIGNATURE_VERSION,
    signRequest
} = require('./lib/request-signature');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { version: workerVersion } = require('./package.json');
const { BoundedSemaphore } = require('./lib/bounded-semaphore');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { validateWorkerEnvironment } = require('./lib/config-validation');

const CHILD_ENV_KEYS = [
    'SystemRoot', 'WINDIR', 'PATH', 'Path', 'PATHEXT', 'TEMP', 'TMP',
    'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'LANG', 'TZ',
    'PYTHONHOME', 'PYTHONPATH', 'PYTHONUTF8', 'PYTHONIOENCODING',
    'PLAYWRIGHT_BROWSERS_PATH', 'THREESERVER_BACKEND', 'BILI_COOKIE_PATH',
    'BALANCE_CHECK_ENABLED', 'BALANCE_AUTO_REFRESH_INTERVAL',
    'BILI_USER_AGENT', 'BILI_BAG_CACHE_TTL', 'BILI_GIFTSEND_PREFER_BAG',
    'GIFT_CLICK_DELAY_MS', 'GIFT_TRY_BULK_SEND', 'GIFT_FALLBACK_SCROLL',
    'DANMAKU_POST_DELAY_MS'
];

function createChildEnvironment(overrides = {}) {
    const env = {};
    for (const name of CHILD_ENV_KEYS) {
        if (process.env[name] !== undefined) env[name] = process.env[name];
    }
    return { ...env, ...overrides };
}

function loadAllowedGiftIds() {
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'gift-codes.json'), 'utf8'));
    const ids = new Set(Object.keys(config['礼物池配置'] || {}));
    for (const gift of Object.values(config['礼物映射'] || {})) {
        if (/^\d+$/.test(String(gift?.bilibili_id || ''))) ids.add(String(gift.bilibili_id));
    }
    if (ids.size === 0) throw new Error('礼物允许列表为空');
    return [...ids].sort();
}

function transportErrorCode(error) {
    const status = Number(error?.response?.status);
    if (Number.isInteger(status)) return `http_${status}`;
    const code = String(error?.code || 'transport_error').toLowerCase();
    return /^[a-z0-9_]{1,40}$/.test(code) ? code : 'transport_error';
}

function isWorkerLeaseError(error) {
    return ['WORKER_LEASE_HELD', 'WORKER_LEASE_NOT_HELD']
        .includes(error?.response?.data?.code);
}

function collectProviderTransactionIds(payload) {
    const found = new Set();
    const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        for (const key of ['provider_transaction_id', 'transaction_id']) {
            const id = value[key];
            if ((typeof id === 'string' || Number.isSafeInteger(id))
                && String(id).length <= 200) found.add(String(id));
        }
        if (Array.isArray(value.provider_transaction_ids)) {
            for (const id of value.provider_transaction_ids) {
                if ((typeof id === 'string' || Number.isSafeInteger(id))
                    && String(id).length <= 200) found.add(String(id));
            }
        }
        if (Array.isArray(value.results)) value.results.forEach(visit);
        if (Array.isArray(value.parts)) value.parts.forEach(visit);
    };
    visit(payload);
    return [...found];
}

function createWorkerInstanceId(configuredBase, hostname = os.hostname(), suffix = null) {
    const rawBase = String(configuredBase || `windows-${hostname}`);
    const normalizedBase = rawBase
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 75) || 'windows-worker';
    const instanceSuffix = suffix || crypto.randomBytes(12).toString('hex');
    if (!/^[A-Fa-f0-9]{16,24}$/.test(instanceSuffix)) {
        throw new Error('Invalid worker instance suffix');
    }
    return `${normalizedBase}:${instanceSuffix}`;
}

function waitForChildSpawn(child, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
            clearTimeout(timer);
            child.removeListener('spawn', handleSpawn);
            child.removeListener('error', handleError);
            child.removeListener('close', handleEarlyClose);
        };
        const settle = (callback, value) => {
            if (settled) return;
            settled = true;
            cleanup();
            callback(value);
        };
        const handleSpawn = () => settle(resolve);
        const handleError = (error) => settle(reject, error);
        const handleEarlyClose = () => settle(reject, new Error('Child process closed before spawn confirmation'));
        const timer = setTimeout(() => {
            settle(reject, new Error('Child process spawn confirmation timed out'));
        }, timeoutMs);

        child.once('spawn', handleSpawn);
        child.once('error', handleError);
        child.once('close', handleEarlyClose);
    });
}

class WindowsGiftListener {
    constructor() {
        // 配置服务器URL（根据实际部署地址修改）
        this.serverUrl = process.env.SERVER_URL || 'https://minimal-games-site.onrender.com';  // 或者你的实际Render URL
        this.apiKey = process.env.WORKER_API_KEY || '';
        this.hmacSecret = process.env.WORKER_HMAC_SECRET || '';
        this.workerId = process.env.WORKER_CREDENTIAL_ID || '';
        this.pollInterval = 2000; // 2秒轮询一次
        this.isPollingGifts = false;
        this.isPollingPk = false;
        this.threeServerUrl = null;
        this.threeServerToken = crypto.randomBytes(32).toString('hex');
        this.allowedGiftIds = loadAllowedGiftIds();
        this.threeServerRoomId = null;
        this.threeServerScript = this.resolveVersionedScript('THREESERVER_SCRIPT', 'threeserver.py', [
            'cookie_store.py'
        ]);
        this.threeServerPythonPath = process.env.THREESERVER_PYTHON || 'python';
        this.threeServerProcess = null;
        this.threeServerProcessRoomId = null;
        this.pkThreeServers = new Map();
        this.pkScript = this.resolveVersionedScript('BILIPK_SCRIPT', 'checkpk.py', [
            'normalpk.py',
            'shousheng.py'
        ]);
        this.pkPythonPath = process.env.BILIPK_PYTHON || 'python';
        this.pkConfigPath = process.env.BILIPK_CONFIG || 'C:/Users/user/Desktop/jiaobenbili/config_gift_only.json';
        this.pkProcesses = new Map();
        this.maxPkRunners = Math.min(16, Math.max(
            1,
            Number.parseInt(process.env.PK_MAX_RUNNERS, 10) || 4
        ));
        // All gift and PK sends share one third-party account and Cookie jar.
        this.externalSendSemaphore = new BoundedSemaphore(1);
        this.lastPkLeaseRefreshAt = 0;
        this.pollTimer = null;
        this.currentGiftPoll = null;
        this.currentPkPoll = null;
        this.activeGiftTask = null;
        this.activePkTask = null;
        this.lastHeartbeatAt = 0;
        this.heartbeatPromise = null;
        this.pkReportSpoolDirectory = this.resolvePkReportSpoolDirectory();
        this.activePkReportIds = new Set();
        this.pkReportFlushPromise = null;
        this.lastPkReportFlushAt = 0;
        this.shuttingDown = false;
        this.shutdownPromise = null;
    }

    resolvePkReportSpoolDirectory() {
        const configured = String(process.env.PK_REPORT_SPOOL_DIR || '').trim();
        const directory = path.resolve(
            configured || path.join(__dirname, 'private', 'worker-spool', 'pk-reports')
        );
        fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
        const stat = fs.lstatSync(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink()) {
            throw new Error('PK_REPORT_SPOOL_DIR必须是普通目录');
        }
        return directory;
    }

    resolveVersionedScript(environmentName, filename, siblingFiles = []) {
        const bundledPath = path.join(__dirname, 'workers', 'bilibili', filename);
        const configuredPath = String(process.env[environmentName] || '').trim();
        const selectedPath = configuredPath ? path.resolve(configuredPath) : bundledPath;
        const selectedDirectory = path.dirname(selectedPath);
        const bundledDirectory = path.dirname(bundledPath);
        const files = [filename, ...siblingFiles];

        for (const file of files) {
            const selectedFile = file === filename ? selectedPath : path.join(selectedDirectory, file);
            const bundledFile = path.join(bundledDirectory, file);
            const selectedStat = fs.lstatSync(selectedFile);
            const bundledStat = fs.lstatSync(bundledFile);
            if (!selectedStat.isFile() || selectedStat.isSymbolicLink()
                || !bundledStat.isFile() || bundledStat.isSymbolicLink()) {
                throw new Error(`${environmentName}必须指向普通文件`);
            }
            const selectedDigest = crypto.createHash('sha256').update(fs.readFileSync(selectedFile)).digest();
            const bundledDigest = crypto.createHash('sha256').update(fs.readFileSync(bundledFile)).digest();
            if (!crypto.timingSafeEqual(selectedDigest, bundledDigest)) {
                throw new Error(`${environmentName}与当前发布版本不一致，拒绝启动`);
            }
        }
        return selectedPath;
    }

    // 启动监听服务
    async start() {
        if (!this.hmacSecret) {
            throw new Error('缺少WORKER_HMAC_SECRET环境变量，无法进行签名请求');
        }
        if (!this.apiKey || this.apiKey.length < 32) {
            throw new Error('缺少有效的WORKER_API_KEY环境变量');
        }
        if (this.pollTimer) return;
        await this.refreshHeartbeat(true);
        console.log(`Windows礼物工作器已启动，轮询间隔 ${this.pollInterval}ms`);
        await this.flushPendingPkReports();
        this.triggerPolls();
        this.pollTimer = setInterval(() => this.triggerPolls(), this.pollInterval);
    }

    triggerPolls() {
        if (this.shuttingDown) return;
        this.refreshHeartbeat().catch((error) => {
            if (isWorkerLeaseError(error)) {
                console.error('工作器活动租约已失效，正在停止本地任务');
                this.shutdown().catch(() => {});
            } else {
                console.error('工作器心跳失败', { errorCode: transportErrorCode(error) });
            }
        });
        this.schedulePkReportFlush();
        if (!this.currentGiftPoll) {
            const poll = this.pollForTasks();
            const trackedPoll = poll.finally(() => {
                if (this.currentGiftPoll === trackedPoll) this.currentGiftPoll = null;
            });
            this.currentGiftPoll = trackedPoll;
        }
        if (!this.currentPkPoll) {
            const poll = this.pollForPkTasks();
            const trackedPoll = poll.finally(() => {
                if (this.currentPkPoll === trackedPoll) this.currentPkPoll = null;
            });
            this.currentPkPoll = trackedPoll;
        }
    }

    refreshHeartbeat(force = false) {
        if (this.shuttingDown) return Promise.resolve(false);
        if (this.heartbeatPromise) return this.heartbeatPromise;
        if (!force && Date.now() - this.lastHeartbeatAt < 30000) {
            return Promise.resolve(true);
        }
        const payload = {
            workerType: 'gift-pk',
            version: workerVersion,
            protocolVersion: 4,
            capabilities: ['gift-two-phase', 'pk-send-start', 'pk-preauthorization', 'graceful-drain']
        };
        const heartbeat = this.postSignedWorkerRequest(
            '/api/workers/heartbeat', payload, 5000, 2
        ).then((response) => {
            this.lastHeartbeatAt = Date.now();
            return response.data?.success === true;
        });
        const trackedHeartbeat = heartbeat.finally(() => {
            if (this.heartbeatPromise === trackedHeartbeat) this.heartbeatPromise = null;
        });
        this.heartbeatPromise = trackedHeartbeat;
        return trackedHeartbeat;
    }

    schedulePkReportFlush() {
        if (this.shuttingDown || this.pkReportFlushPromise
            || Date.now() - this.lastPkReportFlushAt < 5000) return;
        this.pkReportFlushPromise = this.flushPendingPkReports()
            .catch(() => {})
            .finally(() => {
                this.lastPkReportFlushAt = Date.now();
                this.pkReportFlushPromise = null;
            });
    }

    async pollForPkTasks() {
        if (this.shuttingDown || this.isPollingPk) return;
        this.isPollingPk = true;
        try {
            await this.refreshPkRunnerLeases();
            const path = '/api/pk-tasks/claim';
            const payload = {};
            const headers = this.buildSignedHeaders('POST', path, payload);
            const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                timeout: 10000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (response.data.success && response.data.tasks.length > 0) {
                for (const task of response.data.tasks.slice(0, 1)) {
                    await this.processPkTask(task);
                }
            }
        } catch (error) {
            if (error.response?.status === 401) {
                console.error('❌ PK任务鉴权失败，请检查密钥/签名设置');
            }
        } finally {
            this.isPollingPk = false;
        }
    }

    async processPkTask(task) {
        const started = await this.startPkTask(
            task.id,
            task.claim_token,
            task.claim_generation,
            task.command_generation
        );
        if (!started) return;
        this.activePkTask = task;
        try {
            if (task.action === 'start') {
                await this.startPkProcess(task.username, task.room_id, task.command_generation);
            } else if (task.action === 'stop') {
                await this.stopPkProcess(task.username, task.command_generation);
            } else {
                await this.markPkTaskFailed(
                    task.id, task.claim_token, task.claim_generation,
                    task.command_generation, '未知动作'
                );
                return;
            }
        } catch (error) {
            console.error('PK任务处理失败', { taskId: task.id });
            await this.markPkTaskFailed(
                task.id, task.claim_token, task.claim_generation,
                task.command_generation, 'worker_execution_failed'
            );
            return;
        } finally {
            if (this.activePkTask === task) this.activePkTask = null;
        }

        const confirmed = await this.markPkTaskComplete(
            task.id, task.claim_token, task.claim_generation, task.command_generation
        );
        if (!confirmed) {
            console.error('PK任务已执行但回执未确认', { taskId: task.id });
        }
    }

    async startPkProcess(username, roomId, commandGeneration) {
        if (this.shuttingDown) throw new Error('工作器正在关机');
        if (this.pkProcesses.has(username)) {
            const existing = this.pkProcesses.get(username);
            if (String(existing?.roomId || '') === String(roomId || '')) {
                if (!await this.updatePkRunnerState(
                    username, true, roomId, existing?.pid || null,
                    existing.generationId, commandGeneration
                )) {
                    throw new Error('PK进程正在运行，但运行状态上报失败');
                }
                existing.commandGeneration = commandGeneration;
                return;
            }
            await this.stopPkProcess(username, commandGeneration, false);
        }
        if (this.pkProcesses.size >= this.maxPkRunners) {
            throw new Error('PK运行器已达本机并发上限');
        }
        const generationId = crypto.randomBytes(20).toString('hex');
        const pkConfigPath = await this.ensureRoomConfig(roomId);
        const pkThreeServerUrl = await this.ensurePkThreeServer(username, roomId, generationId);
        if (this.shuttingDown) {
            await this.stopPkThreeServer(username);
            throw new Error('工作器正在关机');
        }
        if (!await this.updatePkRunnerState(
            username, true, roomId, null, generationId, commandGeneration
        )) {
            await this.stopPkThreeServer(username);
            throw new Error('无法建立PK预授权运行状态');
        }
        console.log('PK进程启动中');
        const child = this.launchPkProcess({
            roomId,
            configPath: pkConfigPath,
            threeServerUrl: pkThreeServerUrl
        });
        const entry = {
            process: child,
            pid: child.pid || null,
            roomId: String(roomId),
            generationId,
            commandGeneration
        };
        this.pkProcesses.set(username, entry);
        child.once('close', () => {
            if (this.pkProcesses.get(username) === entry) {
                this.pkProcesses.delete(username);
                this.stopPkThreeServer(username).catch(() => {});
                this.updatePkRunnerState(
                    username, false, null, null, generationId, commandGeneration, true
                ).catch(() => {});
            }
        });
        child.once('error', (error) => {
            console.error('PK进程启动失败');
        });

        try {
            await waitForChildSpawn(child);
        } catch (error) {
            if (this.pkProcesses.get(username) === entry) {
                this.pkProcesses.delete(username);
            }
            await this.terminateProcessTree(child.pid);
            await this.stopPkThreeServer(username);
            await this.updatePkRunnerState(
                username, false, null, null, generationId, commandGeneration, true
            ).catch(() => false);
            throw new Error('PK进程启动失败');
        }
        entry.pid = child.pid || null;
        if (this.pkProcesses.get(username) !== entry
            || child.exitCode !== null || child.signalCode !== null) {
            if (this.pkProcesses.get(username) === entry) {
                this.pkProcesses.delete(username);
            }
            await this.terminateProcessTree(child.pid);
            await this.stopPkThreeServer(username);
            await this.updatePkRunnerState(
                username, false, null, null, generationId, commandGeneration, true
            ).catch(() => false);
            throw new Error('PK进程在启动确认后立即退出');
        }

        if (!await this.updatePkRunnerState(
            username, true, roomId, child.pid || null, generationId, commandGeneration
        )) {
            if (this.pkProcesses.get(username) === entry) {
                this.pkProcesses.delete(username);
            }
            await this.terminateProcessTree(child.pid);
            await this.stopPkThreeServer(username);
            await this.updatePkRunnerState(
                username, false, null, null, generationId, commandGeneration, true
            ).catch(() => false);
            throw new Error('PK进程已启动，但运行状态上报失败');
        }
    }

    async stopPkProcess(username, commandGeneration, reportState = true) {
        const entry = this.pkProcesses.get(username);
        if (!entry) {
            await this.stopPkThreeServer(username);
            if (reportState && !await this.updatePkRunnerState(
                username, false, null, null, null, commandGeneration
            )) {
                throw new Error('无法确认PK进程停止状态');
            }
            return;
        }
        this.pkProcesses.delete(username);
        await this.terminateProcessTree(entry.pid);
        await this.stopPkThreeServer(username);
        if (reportState && !await this.updatePkRunnerState(
            username, false, null, null, entry.generationId, commandGeneration
        )) {
            throw new Error('PK进程已停止，但运行状态上报失败');
        }
    }

    async updatePkRunnerState(
        username,
        running,
        roomId,
        pid,
        generationId,
        commandGeneration,
        unexpectedExit = false
    ) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = '/api/pk/runner/update';
                const payload = {
                    username,
                    running: !!running,
                    roomId: roomId ? String(roomId) : null,
                    pid: pid || null,
                    generationId,
                    commandGeneration,
                    unexpectedExit: unexpectedExit === true
                };
                const headers = this.buildSignedHeaders('POST', path, payload);
                const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                    timeout: 5000,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    }
                });
                return response.status === 200 && response.data.success;
            } catch (error) {
                console.error('PK运行状态上报失败', {
                    attempt,
                    errorCode: transportErrorCode(error)
                });
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async refreshPkRunnerLeases() {
        const now = Date.now();
        if (now - this.lastPkLeaseRefreshAt < 30000) return;
        this.lastPkLeaseRefreshAt = now;
        for (const [username, entry] of this.pkProcesses.entries()) {
            const refreshed = await this.updatePkRunnerState(
                username, true, entry.roomId, entry.pid,
                entry.generationId, entry.commandGeneration
            );
            if (!refreshed && this.pkProcesses.get(username) === entry) {
                this.pkProcesses.delete(username);
                await this.terminateProcessTree(entry.pid);
                await this.stopPkThreeServer(username);
                console.error('PK运行租约续期失败，已停止本地进程');
            }
        }
    }

    async startPkTask(taskId, claimToken, claimGeneration, commandGeneration) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const requestPath = `/api/pk-tasks/${taskId}/start`;
                const payload = { claimToken, claimGeneration, commandGeneration };
                const headers = this.buildSignedHeaders('POST', requestPath, payload);
                const response = await axios.post(`${this.serverUrl}${requestPath}`, payload, {
                    timeout: 5000,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
                return response.status === 200 && response.data.success === true;
            } catch (error) {
                if (error.response?.status && error.response.status < 500) return false;
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async markPkTaskComplete(taskId, claimToken, claimGeneration, commandGeneration) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = `/api/pk-tasks/${taskId}/complete`;
                const payload = { claimToken, claimGeneration, commandGeneration };
                const headers = this.buildSignedHeaders('POST', path, payload);
                const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                    timeout: 5000,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    }
                });
                return response.status === 200 && response.data.success;
            } catch (error) {
                console.error('PK任务完成回执失败', {
                    taskId,
                    attempt,
                    errorCode: transportErrorCode(error)
                });
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async markPkTaskFailed(taskId, claimToken, claimGeneration, commandGeneration, errorMessage) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = `/api/pk-tasks/${taskId}/fail`;
                const payload = { claimToken, claimGeneration, commandGeneration, error: errorMessage };
                const headers = this.buildSignedHeaders('POST', path, payload);
                const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                    timeout: 5000,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    }
                });
                return response.status === 200 && response.data.success;
            } catch (error) {
                console.error('PK任务失败回执失败', {
                    taskId,
                    attempt,
                    errorCode: transportErrorCode(error)
                });
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    // 轮询服务器获取任务
    async pollForTasks() {
        if (this.shuttingDown || this.isPollingGifts) return;
        this.isPollingGifts = true;

        try {
            const path = '/api/gift-tasks/claim';
            const payload = {};
            const headers = this.buildSignedHeaders('POST', path, payload);
            const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                timeout: 10000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (response.data.success && response.data.tasks.length > 0) {
                // A single third-party account and Cookie jar must be serialized.
                for (const task of response.data.tasks.slice(0, 1)) {
                    await this.processTask(task);
                }
            }

        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                console.log('🔍 正在等待服务器连接...');
            } else if (error.response?.status === 404) {
                console.log('📭 暂无待处理任务');
            } else if (error.response?.status === 401) {
                console.error('❌ API鉴权失败，请检查密钥/签名设置');
            } else {
                console.error('礼物任务轮询失败', { errorCode: transportErrorCode(error) });
            }
        } finally {
            this.isPollingGifts = false;
        }
    }

    // 处理单个任务
    async processTask(task) {
        let externalSendStarted = false;
        let releaseExternalSend = null;
        const activeTask = {
            id: task.id,
            claimToken: task.claimToken,
            claimGeneration: task.claimGeneration,
            externalSendStarted: false
        };
        this.activeGiftTask = activeTask;
        try {
            const quantity = Number(task.quantity);
            const roomId = task.roomId ? String(task.roomId) : '';
            const giftId = String(task.giftId || '');
            if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000
                || !/^\d{1,12}$/.test(roomId)
                || !/^\d+$/.test(giftId)
                || !this.allowedGiftIds.includes(giftId)
                || !Number.isSafeInteger(Number(task.claimGeneration))) {
                await this.markTaskFailed(
                    task.id, task.claimToken, task.claimGeneration, 'invalid_task_parameters'
                );
                return;
            }
            releaseExternalSend = await this.externalSendSemaphore.acquire(15000);

            // Local sender startup is preflight work. Keep the remote task in
            // `claimed` until the room-specific, token-protected HTTP sender
            // confirms its room, so a startup failure remains safely refundable.
            const threeServerUrl = await this.ensureGiftThreeServer(roomId);
            const started = await this.startGiftTask(task.id, task.claimToken, task.claimGeneration);
            if (!started) {
                console.error('礼物任务租约无法确认，未执行外部发送', { taskId: task.id });
                return;
            }

            // This is the irreversible boundary: the following POST may reach
            // the provider even if the local HTTP response is later lost.
            externalSendStarted = true;
            activeTask.externalSendStarted = true;
            const sendResult = await this.sendToThreeServer(
                giftId,
                quantity,
                threeServerUrl,
                this.threeServerToken
            );
            if (sendResult.success) {
                const markResult = await this.markTaskComplete(task.id, task.claimToken, task.claimGeneration, {
                    actualQuantity: quantity,
                    requestedQuantity: quantity,
                    partialSuccess: false,
                    providerTransactionId: sendResult.providerTransactionId
                });
                if (markResult) {
                    console.log('礼物任务已完成', { taskId: task.id, quantity });
                } else {
                    await this.markTaskUncertain(
                        task.id,
                        task.claimToken,
                        task.claimGeneration,
                        'threeserver_ack_unconfirmed'
                    );
                    console.warn('礼物已发送但回执未确认', { taskId: task.id });
                }
                return;
            }

            const failureReason = sendResult.balance_insufficient
                ? 'provider_balance_insufficient'
                : sendResult.error === 'provider_receipt_missing'
                    ? 'provider_receipt_missing'
                    : sendResult.error === 'provider_receipt_ambiguous'
                        ? 'provider_receipt_ambiguous'
                        : 'threeserver_result_uncertain';
            // Never fall back to the browser sender after this POST boundary.
            await this.markTaskUncertain(task.id, task.claimToken, task.claimGeneration, failureReason);
            console.warn('礼物外部发送结果需要对账', { taskId: task.id });

        } catch (error) {
            console.error('处理礼物任务时发生异常', {
                taskId: task.id,
                errorCode: transportErrorCode(error)
            });
            if (externalSendStarted) {
                await this.markTaskUncertain(
                    task.id, task.claimToken, task.claimGeneration, 'worker_exception_after_send_started'
                );
            } else {
                await this.markTaskFailed(
                    task.id, task.claimToken, task.claimGeneration, 'worker_preflight_failed'
                );
            }
        } finally {
            releaseExternalSend?.();
            if (this.activeGiftTask === activeTask) this.activeGiftTask = null;
        }
    }

    async sendToThreeServer(
        giftId,
        quantity,
        serverUrl = this.threeServerUrl,
        token = this.threeServerToken
    ) {
        const gifts = [{ id: String(giftId), count: quantity }];
        try {
            // Ask threeserver to wait for the provider API result. Its API
            // confirmation window is 20 seconds, so keep the local transport
            // alive slightly longer instead of manufacturing an early timeout.
            const response = await axios.post(`${serverUrl}/send`, {
                gifts,
                wait: true,
                confirm: 'api'
            }, {
                timeout: 25000,
                headers: { 'X-Local-Sender-Token': token }
            });
            if (response.data?.success === true || response.data?.status === 'ok') {
                const providerTransactionIds = collectProviderTransactionIds(response.data);
                if (providerTransactionIds.length !== 1) {
                    return {
                        success: false,
                        reachable: true,
                        error: providerTransactionIds.length === 0
                            ? 'provider_receipt_missing'
                            : 'provider_receipt_ambiguous'
                    };
                }
                return {
                    success: true,
                    reachable: true,
                    results: response.data.results,
                    providerTransactionId: providerTransactionIds[0]
                };
            }
            return {
                success: false,
                reachable: true,
                balance_insufficient: response.data?.balance_insufficient === true,
                error: 'threeserver_rejected'
            };
        } catch (error) {
            return {
                success: false,
                reachable: Boolean(error.response),
                balance_insufficient: error.response?.status === 402 || error.response?.data?.balance_insufficient === true,
                error: transportErrorCode(error)
            };
        }
    }

    getAppDataDir() {
        return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    }

    async ensureRoomConfig(roomId) {
        const appDataDir = this.getAppDataDir();
        const configDir = path.join(appDataDir, 'BiliPKTool');
        const targetPath = path.join(configDir, `config_gift_only.room_${roomId}.json`);
        if (fs.existsSync(targetPath)) {
            return targetPath;
        }
        if (!fs.existsSync(this.pkConfigPath)) {
            throw new Error(`找不到基础配置文件: ${this.pkConfigPath}`);
        }
        const raw = fs.readFileSync(this.pkConfigPath, 'utf8');
        const config = JSON.parse(raw);
        config['房间配置'] = config['房间配置'] || {};
        config['房间配置']['房间号列表'] = [String(roomId)];
        config['送礼房间配置'] = config['送礼房间配置'] || {};
        config['送礼房间配置']['送礼房间'] = String(roomId);
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf8');
        return targetPath;
    }

    launchGiftThreeServer({ configPath, backendPort, backendToken }) {
        const child = spawn(this.threeServerPythonPath, [this.threeServerScript], {
            cwd: path.dirname(this.threeServerScript),
            env: createChildEnvironment({
                BILIPK_CONFIG: configPath,
                THREESERVER_PORT: String(backendPort),
                THREESERVER_LOCAL_TOKEN: backendToken,
                THREESERVER_ALLOWED_GIFT_IDS: this.allowedGiftIds.join(','),
                THREESERVER_BACKEND: 'http'
            }),
            windowsHide: true
        });
        child.stdout?.resume();
        child.stderr?.resume();
        return child;
    }

    async ensureGiftThreeServer(roomId) {
        if (this.shuttingDown) throw new Error('工作器正在关机');
        const desiredRoomId = String(roomId || '');
        if (!/^\d{1,12}$/.test(desiredRoomId)) {
            throw new Error('礼物目标房间无效');
        }

        const existing = this.threeServerProcess;
        if (existing && this.threeServerProcessRoomId === desiredRoomId
            && existing.exitCode === null && existing.signalCode === null
            && this.threeServerUrl) {
            const confirmed = await this.waitForThreeServerRoom(
                desiredRoomId,
                3000,
                this.threeServerUrl,
                this.threeServerToken
            );
            if (confirmed) return this.threeServerUrl;
        }
        if (existing) await this.stopThreeServerProcess();

        const backendPort = await this.getFreePort();
        const backendUrl = `http://127.0.0.1:${backendPort}`;
        const backendToken = crypto.randomBytes(32).toString('hex');
        const configPath = await this.ensureRoomConfig(desiredRoomId);
        if (this.shuttingDown) throw new Error('工作器正在关机');

        const child = this.launchGiftThreeServer({
            configPath,
            backendPort,
            backendToken
        });
        this.threeServerProcess = child;
        this.threeServerProcessRoomId = desiredRoomId;
        this.threeServerUrl = backendUrl;
        this.threeServerToken = backendToken;
        this.threeServerRoomId = null;

        const clearProcessState = () => {
            if (this.threeServerProcess !== child) return;
            this.threeServerProcess = null;
            this.threeServerProcessRoomId = null;
            this.threeServerUrl = null;
            this.threeServerRoomId = null;
        };
        child.once('close', clearProcessState);
        child.once('error', clearProcessState);

        try {
            await waitForChildSpawn(child);
            if (this.threeServerProcess !== child
                || child.exitCode !== null || child.signalCode !== null) {
                throw new Error('threeserver在启动确认后立即退出');
            }
            const ready = await this.waitForThreeServerRoom(
                desiredRoomId,
                20000,
                backendUrl,
                backendToken
            );
            if (!ready) throw new Error('threeserver未能确认目标房间');
            if (this.threeServerProcess !== child || this.shuttingDown) {
                throw new Error('threeserver启动期间工作器状态已变化');
            }
            this.threeServerRoomId = desiredRoomId;
            return backendUrl;
        } catch (error) {
            if (this.threeServerProcess === child) {
                await this.stopThreeServerProcess();
            } else {
                await this.terminateProcessTree(child.pid);
            }
            throw new Error('普通礼物threeserver启动或房间确认失败', { cause: error });
        }
    }

    async stopThreeServerProcess() {
        const child = this.threeServerProcess;
        if (!child) return;
        this.threeServerProcess = null;
        this.threeServerProcessRoomId = null;
        this.threeServerUrl = null;
        this.threeServerRoomId = null;
        try {
            await this.terminateProcessTree(child.pid);
        } catch (error) {
            console.error('threeserver停止失败', { errorCode: transportErrorCode(error) });
        }
    }

    async waitForThreeServerRoom(
        roomId,
        timeoutMs = 10000,
        serverUrl = this.threeServerUrl,
        token = this.threeServerToken
    ) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const current = await this.fetchThreeServerRoomId(serverUrl, token);
            if (current && String(current) === String(roomId)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
    }

    async fetchThreeServerRoomId(serverUrl, token = this.threeServerToken) {
        try {
            const response = await axios.get(`${serverUrl}/`, {
                timeout: 1000,
                headers: { 'X-Local-Sender-Token': token }
            });
            return response.data?.room_id ? String(response.data.room_id) : null;
        } catch (error) {
            return null;
        }
    }

    async getFreePort() {
        return new Promise((resolve, reject) => {
            const server = net.createServer();
            server.unref();
            server.on('error', reject);
            server.listen(0, '127.0.0.1', () => {
                const { port } = server.address();
                server.close(() => resolve(port));
            });
        });
    }

    async ensurePkThreeServer(username, roomId, generationId) {
        if (this.shuttingDown) throw new Error('工作器正在关机');
        const desiredRoomId = String(roomId);
        const existing = this.pkThreeServers.get(username);
        if (existing && existing.roomId === desiredRoomId
            && existing.generationId === generationId) {
            return existing.url;
        }
        if (existing) {
            await this.stopPkThreeServer(username);
        }

        const backendPort = await this.getFreePort();
        const backendUrl = `http://127.0.0.1:${backendPort}`;
        const backendToken = crypto.randomBytes(32).toString('hex');
        const configPath = await this.ensureRoomConfig(desiredRoomId);
        if (this.shuttingDown) throw new Error('工作器正在关机');
        const child = spawn(this.threeServerPythonPath, [this.threeServerScript], {
            cwd: path.dirname(this.threeServerScript),
            env: createChildEnvironment({
                BILIPK_CONFIG: configPath,
                THREESERVER_PORT: String(backendPort),
                THREESERVER_LOCAL_TOKEN: backendToken,
                THREESERVER_ALLOWED_GIFT_IDS: this.allowedGiftIds.join(',')
            }),
            windowsHide: true
        });

        const entry = {
            process: child,
            backendPort,
            backendUrl,
            backendToken,
            roomId: desiredRoomId,
            generationId,
            proxyServer: null,
            url: null
        };
        this.pkThreeServers.set(username, entry);

        child.stdout.resume();
        child.stderr.resume();
        child.on('close', () => {
            if (this.pkThreeServers.get(username) === entry) {
                entry.proxyServer?.close();
                this.pkThreeServers.delete(username);
            }
        });
        child.on('error', () => {
            if (this.pkThreeServers.get(username) === entry) {
                entry.proxyServer?.close();
                this.pkThreeServers.delete(username);
            }
        });

        const ready = await this.waitForThreeServerRoom(
            desiredRoomId,
            20000,
            backendUrl,
            backendToken
        );
        if (!ready) {
            await this.stopPkThreeServer(username);
            throw new Error('threeserver未能确认目标房间');
        }
        const proxySecret = crypto.randomBytes(24).toString('hex');
        const proxy = await this.startPkAuthorizationProxy({
            username, roomId: desiredRoomId, generationId, backendUrl, backendToken, proxySecret
        });
        entry.proxyServer = proxy.server;
        entry.url = proxy.url;
        return entry.url;
    }

    async stopPkThreeServer(username) {
        const entry = this.pkThreeServers.get(username);
        if (!entry) {
            return;
        }
        if (entry.proxyServer) {
            await new Promise((resolve) => entry.proxyServer.close(resolve));
        }
        try {
            entry.process.kill('SIGTERM');
        } catch (error) {
            console.error('PK threeserver 停止失败');
        }
        this.pkThreeServers.delete(username);
    }

    async startPkAuthorizationProxy({
        username, roomId, generationId, backendUrl, backendToken = '', proxySecret
    }) {
        const server = http.createServer((req, res) => {
            this.handlePkProxyRequest({
                req, res, username, roomId, generationId, backendUrl, backendToken, proxySecret
            }).catch((error) => {
                console.error('PK本地预授权代理错误');
                if (!res.headersSent) {
                    this.sendLocalJson(res, 500, { success: false, error: 'local_proxy_error' });
                }
            });
        });
        server.requestTimeout = 15000;
        server.headersTimeout = 17000;
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        return { server, url: `http://127.0.0.1:${address.port}/${proxySecret}` };
    }

    spoolPkReport(payload, phase = 'final') {
        const reportId = String(payload?.reportId || '');
        if (!/^[A-Fa-f0-9]{40}$/.test(reportId)) {
            throw new Error('Invalid PK report identifier');
        }
        if (!['intent', 'final'].includes(phase)) {
            throw new Error('Invalid PK report spool phase');
        }
        const suffix = phase === 'intent' ? '.intent.json' : '.json';
        const target = path.join(this.pkReportSpoolDirectory, `${reportId}${suffix}`);
        if (fs.existsSync(target)) {
            const existing = JSON.parse(fs.readFileSync(target, 'utf8'));
            if (existing.reportId !== reportId
                || existing.authorizationId !== payload.authorizationId
                || existing.username !== payload.username
                || existing.runnerGeneration !== payload.runnerGeneration) {
                throw new Error('PK report spool identifier collision');
            }
            return target;
        }
        const temporary = path.join(
            this.pkReportSpoolDirectory,
            `${reportId}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
        );
        let descriptor;
        try {
            descriptor = fs.openSync(temporary, 'wx', 0o600);
            fs.writeFileSync(descriptor, JSON.stringify(payload), 'utf8');
            fs.fsyncSync(descriptor);
            fs.closeSync(descriptor);
            descriptor = undefined;
            fs.renameSync(temporary, target);
            return target;
        } finally {
            if (descriptor !== undefined) {
                try { fs.closeSync(descriptor); } catch (error) { /* already closed */ }
            }
            if (fs.existsSync(temporary)) {
                try { fs.unlinkSync(temporary); } catch (error) { /* retained for inspection */ }
            }
        }
    }

    pkReportPaths(reportId) {
        return [
            path.join(this.pkReportSpoolDirectory, `${reportId}.json`),
            path.join(this.pkReportSpoolDirectory, `${reportId}.intent.json`)
        ];
    }

    removeSpooledPkReport(reportId) {
        if (!reportId) return;
        for (const spoolPath of this.pkReportPaths(reportId)) {
            try {
                fs.unlinkSync(spoolPath);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }

    quarantineSpooledPkReport(reportId, suffix = 'dead-letter') {
        if (!reportId) return;
        for (const spoolPath of this.pkReportPaths(reportId)) {
            if (!fs.existsSync(spoolPath)) continue;
            const target = `${spoolPath}.${suffix}`;
            try {
                fs.renameSync(spoolPath, target);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
        }
    }

    async flushPendingPkReports(limit = 20) {
        const reports = new Map();
        for (const name of fs.readdirSync(this.pkReportSpoolDirectory).sort()) {
            const match = /^([A-Fa-f0-9]{40})(\.intent)?\.json$/.exec(name);
            if (!match || this.activePkReportIds.has(match[1])) continue;
            const existing = reports.get(match[1]);
            if (!existing || !match[2]) reports.set(match[1], name);
        }
        for (const [reportId, filename] of [...reports.entries()].slice(0, limit)) {
            const spoolPath = path.join(this.pkReportSpoolDirectory, filename);
            let payload;
            try {
                payload = JSON.parse(fs.readFileSync(spoolPath, 'utf8'));
                if (payload?.reportId !== reportId) {
                    throw new Error('PK report spool content mismatch');
                }
            } catch (error) {
                this.quarantineSpooledPkReport(reportId, 'invalid');
                continue;
            }
            try {
                await this.postSignedWorkerRequest('/api/pk/report', payload, 5000, 4);
                this.removeSpooledPkReport(reportId);
            } catch (error) {
                if (isWorkerLeaseError(error)) break;
                if (error.response?.status === 409 || error.response?.status === 404) {
                    this.quarantineSpooledPkReport(reportId);
                    continue;
                }
                break;
            }
        }
    }

    async handlePkProxyRequest({
        req, res, username, roomId, generationId, backendUrl, backendToken = '', proxySecret
    }) {
        const requestUrl = new URL(req.url, 'http://127.0.0.1');
        const proxyRoot = `/${proxySecret}`;
        if (req.method === 'GET'
            && (requestUrl.pathname === proxyRoot || requestUrl.pathname === `${proxyRoot}/`)) {
            const response = await axios.get(`${backendUrl}/`, {
                timeout: 1500,
                headers: { 'X-Local-Sender-Token': backendToken },
                validateStatus: () => true
            });
            return this.sendLocalJson(res, response.status, response.data);
        }
        if (req.method !== 'POST' || requestUrl.pathname !== `${proxyRoot}/send`) {
            return this.sendLocalJson(res, 404, { success: false, error: 'not_found' });
        }

        const body = await this.readLocalJson(req, 1024 * 1024);
        const gifts = body?.gifts;
        const operationId = String(body?.operationId || '');
        if (!Array.isArray(gifts) || gifts.length < 1 || gifts.length > 1000
            || !/^[A-Fa-f0-9]{64}$/.test(operationId)) {
            return this.sendLocalJson(res, 400, { success: false, error: 'invalid_gifts' });
        }
        let releaseExternalSend;
        try {
            releaseExternalSend = await this.externalSendSemaphore.acquire(15000);
        } catch (error) {
            return this.sendLocalJson(res, 503, { success: false, error: 'sender_busy' });
        }
        try {
        const authorizationId = crypto.createHash('sha256')
            .update('pk-authorization\0')
            .update(username)
            .update('\0')
            .update(roomId)
            .update('\0')
            .update(operationId)
            .digest('hex')
            .slice(0, 40);
        const reportId = crypto.createHash('sha256')
            .update('pk-report\0')
            .update(authorizationId)
            .digest('hex')
            .slice(0, 40);
        const authorizationPayload = {
            authorizationId,
            username,
            roomId,
            runnerGeneration: generationId,
            giftIds: gifts
        };
        const intentPayload = {
            ...authorizationPayload,
            reportId,
            script: 'pk-local-proxy',
            success: false,
            reason: 'external_send_not_confirmed_started'
        };
        this.activePkReportIds.add(reportId);
        try {
            try {
                this.spoolPkReport(intentPayload, 'intent');
            } catch (error) {
                console.error('PK发送意图无法写入本地耐久队列，拒绝预扣和发送');
                return this.sendLocalJson(res, 503, { success: false, error: 'durable_intent_unavailable' });
            }

            try {
                const authorizationResponse = await this.postSignedWorkerRequest(
                    '/api/pk/authorize',
                    authorizationPayload,
                    5000
                );
                if (authorizationResponse.data?.replayed === true) {
                    try {
                        await this.postSignedWorkerRequest('/api/pk/report', intentPayload, 5000, 4);
                        this.removeSpooledPkReport(reportId);
                    } catch (reportError) {
                        if (!isWorkerLeaseError(reportError)
                            && [404, 409].includes(reportError.response?.status)) {
                            this.quarantineSpooledPkReport(reportId);
                        }
                    }
                    return this.sendLocalJson(res, 409, {
                        success: false,
                        error: 'duplicate_send_blocked'
                    });
                }
            } catch (error) {
                const responseStatus = Number(error.response?.status);
                if (responseStatus >= 400 && responseStatus < 500) {
                    this.removeSpooledPkReport(reportId);
                    const status = responseStatus === 402 ? 402 : 409;
                    return this.sendLocalJson(res, status, {
                        success: false,
                        error: status === 402 ? 'insufficient_balance' : 'authorization_blocked'
                    });
                }
                try {
                    await this.postSignedWorkerRequest('/api/pk/report', intentPayload, 5000, 4);
                    this.removeSpooledPkReport(reportId);
                } catch (reportError) {
                    if (reportError.response?.status === 404) {
                        this.removeSpooledPkReport(reportId);
                    } else if (!isWorkerLeaseError(reportError)
                        && reportError.response?.status === 409) {
                        this.quarantineSpooledPkReport(reportId);
                    }
                }
                return this.sendLocalJson(res, 503, {
                    success: false,
                    error: 'authorization_unavailable'
                });
            }

            try {
                await this.postSignedWorkerRequest(
                    '/api/pk/send-start',
                    { authorizationId },
                    5000,
                    4
                );
            } catch (error) {
                try {
                    await this.postSignedWorkerRequest('/api/pk/report', intentPayload, 5000, 4);
                    this.removeSpooledPkReport(reportId);
                } catch (reportError) {
                    if (!isWorkerLeaseError(reportError)
                        && reportError.response?.status === 409) {
                        this.quarantineSpooledPkReport(reportId);
                    }
                }
                return this.sendLocalJson(res, 503, {
                    success: false,
                    error: 'send_start_unconfirmed'
                });
            }

            let backendResponse;
            let reportSuccess = false;
            let outcomeReason = 'send_result_uncertain';
            try {
                backendResponse = await axios.post(`${backendUrl}/send`, { gifts }, {
                    timeout: 10000,
                    headers: { 'X-Local-Sender-Token': backendToken },
                    validateStatus: () => true
                });
                reportSuccess = backendResponse.status >= 200 && backendResponse.status < 300
                    && (backendResponse.data?.success === true || backendResponse.data?.status === 'ok');
                outcomeReason = reportSuccess
                    ? 'sent'
                    : backendResponse.status === 402
                        ? 'upstream_insufficient_balance'
                        : `upstream_http_${backendResponse.status}`;
            } catch (error) {
                outcomeReason = error.code === 'ECONNABORTED'
                    ? 'upstream_timeout'
                    : 'upstream_network_error';
            }

            const reportPayload = {
                ...authorizationPayload,
                reportId,
                script: 'pk-local-proxy',
                success: reportSuccess,
                reason: outcomeReason,
                providerTransactionIds: collectProviderTransactionIds(backendResponse?.data)
            };
            try {
                this.spoolPkReport(reportPayload, 'final');
            } catch (error) {
                // The earlier durable intent remains and will conservatively
                // reconcile this attempt as uncertain after a crash.
                console.error('PK最终回报无法写入本地耐久队列');
            }
            try {
                await this.postSignedWorkerRequest('/api/pk/report', reportPayload, 5000, 4);
                this.removeSpooledPkReport(reportId);
            } catch (error) {
                if (!isWorkerLeaseError(error)
                    && (error.response?.status === 409 || error.response?.status === 404)) {
                    this.quarantineSpooledPkReport(reportId);
                }
                console.error('PK结算回报失败，预扣资金保持冻结');
            }

            if (!backendResponse) {
                return this.sendLocalJson(res, 502, { success: false, error: outcomeReason });
            }
            if (!reportSuccess && backendResponse.status >= 200 && backendResponse.status < 300) {
                return this.sendLocalJson(res, 409, {
                    success: false,
                    error: 'send_result_uncertain'
                });
            }
            return this.sendLocalJson(res, backendResponse.status, backendResponse.data);
        } finally {
            this.activePkReportIds.delete(reportId);
        }
        } finally {
            releaseExternalSend();
        }
    }

    async postSignedWorkerRequest(pathname, payload, timeout, attempts = 1) {
        let lastError;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                const headers = this.buildSignedHeaders('POST', pathname, payload);
                return await axios.post(`${this.serverUrl}${pathname}`, payload, {
                    timeout,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
            } catch (error) {
                lastError = error;
                if (error.response?.status && error.response.status < 500) throw error;
                if (attempt < attempts) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
                }
            }
        }
        throw lastError;
    }

    readLocalJson(req, maxBytes) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            let size = 0;
            req.on('data', (chunk) => {
                size += chunk.length;
                if (size > maxBytes) {
                    reject(new Error('request_too_large'));
                    req.destroy();
                    return;
                }
                chunks.push(chunk);
            });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
                } catch (error) {
                    reject(new Error('invalid_json'));
                }
            });
            req.on('error', reject);
        });
    }

    sendLocalJson(res, status, body) {
        const payload = JSON.stringify(body ?? {});
        res.writeHead(status, {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(payload),
            'Cache-Control': 'no-store'
        });
        res.end(payload);
    }

    launchPkProcess({ roomId, configPath, threeServerUrl }) {
        const env = createChildEnvironment({
            BILIPK_CONFIG: configPath,
            THREESERVER_URL: threeServerUrl,
            PK_REPORT_URL: '',
            PK_REPORT_KEY: '',
            PK_REPORT_USERNAME: ''
        });
        const child = spawn(this.pkPythonPath, [this.pkScript, String(roomId)], {
            cwd: path.dirname(this.pkScript),
            env,
            windowsHide: true
        });
        child.stdout?.resume();
        child.stderr?.resume();
        return child;
    }

    terminateProcessTree(pid) {
        if (!pid) return Promise.resolve();
        if (process.platform !== 'win32') {
            try { process.kill(pid, 'SIGTERM'); } catch (error) { /* already stopped */ }
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
            child.once('close', resolve);
            child.once('error', resolve);
        });
    }

    async startGiftTask(taskId, claimToken, claimGeneration) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const requestPath = `/api/gift-tasks/${taskId}/start`;
                const payload = { claimToken, claimGeneration };
                const headers = this.buildSignedHeaders('POST', requestPath, payload);
                const response = await axios.post(`${this.serverUrl}${requestPath}`, payload, {
                    timeout: 5000,
                    headers: { ...headers, 'Content-Type': 'application/json' }
                });
                return response.status === 200 && response.data.success === true;
            } catch (error) {
                if (error.response?.status && error.response.status < 500) return false;
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    // 标记任务完成
    async markTaskComplete(taskId, claimToken, claimGeneration, resultData = {}) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
            const path = `/api/gift-tasks/${taskId}/complete`;
            // ✅ 修复：清理 undefined 值，确保签名计算和 HTTP body 一致
            const payload = cleanPayload({
                claimToken,
                claimGeneration,
                actual_quantity: resultData.actualQuantity,
                requested_quantity: resultData.requestedQuantity,
                partial_success: resultData.partialSuccess,
                providerTransactionId: resultData.providerTransactionId
            });
            const headers = this.buildSignedHeaders('POST', path, payload);
            const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                timeout: 5000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
            return response.status === 200 && response.data.success;
            } catch (error) {
                console.error('标记礼物任务完成失败', {
                    taskId,
                    attempt,
                    errorCode: transportErrorCode(error)
                });
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    // 标记任务失败
    async markTaskFailed(taskId, claimToken, claimGeneration, errorMessage) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
            const path = `/api/gift-tasks/${taskId}/fail`;
            // ✅ 修复：清理 undefined 值，确保签名计算和 HTTP body 一致
            const payload = cleanPayload({
                claimToken,
                claimGeneration,
                error: errorMessage
            });
            const headers = this.buildSignedHeaders('POST', path, payload);
            const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                timeout: 5000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });
            return response.status === 200 && response.data.success;
            } catch (error) {
                console.error('标记礼物任务失败回执失败', {
                    taskId,
                    attempt,
                    errorCode: transportErrorCode(error)
                });
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async markTaskUncertain(taskId, claimToken, claimGeneration, reason) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = `/api/gift-tasks/${taskId}/uncertain`;
                const payload = {
                    claimToken,
                    claimGeneration,
                    reason: String(reason || '发送结果无法确认').slice(0, 1000)
                };
                const headers = this.buildSignedHeaders('POST', path, payload);
                const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                    timeout: 5000,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    }
                });
                return response.status === 200 && response.data.success;
            } catch (error) {
                console.error('标记礼物任务待确认失败', {
                    taskId,
                    attempt,
                    errorCode: transportErrorCode(error)
                });
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    buildSignedHeaders(method, path, body) {
        const timestamp = Date.now().toString();
        const nonce = crypto.randomBytes(8).toString('hex');
        const signature = signRequest(this.hmacSecret, {
            timestamp,
            nonce,
            workerId: this.workerId,
            method,
            path,
            body
        });

        return {
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'X-Worker-Id': this.workerId,
            'X-Signature-Version': SIGNATURE_VERSION,
            'X-Signature': signature
        };
    }

    async shutdown() {
        if (this.shutdownPromise) return this.shutdownPromise;
        this.shutdownPromise = this.performShutdown();
        return this.shutdownPromise;
    }

    async performShutdown() {
        this.shuttingDown = true;
        this.externalSendSemaphore.close();
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }

        const waitForPolls = Promise.allSettled([
            this.currentGiftPoll,
            this.currentPkPoll
        ].filter(Boolean));
        await Promise.race([
            waitForPolls,
            new Promise((resolve) => setTimeout(resolve, 15000))
        ]);

        const activeGiftTask = this.activeGiftTask;
        if (activeGiftTask?.externalSendStarted) {
            await this.markTaskUncertain(
                activeGiftTask.id,
                activeGiftTask.claimToken,
                activeGiftTask.claimGeneration,
                '工作器关机，外部发送结果需要对账'
            ).catch(() => {});
        }

        for (const [username, entry] of [...this.pkProcesses.entries()]) {
            this.pkProcesses.delete(username);
            await this.terminateProcessTree(entry.pid);
        }
        for (const username of [...this.pkThreeServers.keys()]) {
            await this.stopPkThreeServer(username);
        }
        await this.stopThreeServerProcess();

        await this.pkReportFlushPromise?.catch(() => {});
        await this.flushPendingPkReports().catch(() => {});

        await this.postSignedWorkerRequest('/api/workers/drain', {}, 5000, 3).catch(() => {});
        console.log('Windows礼物工作器已停止');
    }
}

// ✅ 清理对象中的 undefined/null 值，避免签名不匹配
function cleanPayload(obj) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== undefined && value !== null) {
            cleaned[key] = value;
        }
    }
    return cleaned;
}


if (require.main === module) {
    validateWorkerEnvironment();
    const listener = new WindowsGiftListener();
    listener.start().catch(() => {
        console.error('Windows礼物工作器启动失败');
        process.exitCode = 1;
    });

    const handleShutdown = () => {
        listener.shutdown()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    };
    process.once('SIGINT', handleShutdown);
    process.once('SIGTERM', handleShutdown);
}

module.exports = {
    WindowsGiftListener,
    cleanPayload,
    createChildEnvironment,
    createWorkerInstanceId,
    isWorkerLeaseError,
    waitForChildSpawn
};
