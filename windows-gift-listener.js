#!/usr/bin/env node

/**
 * Windows B站礼物发送监听服务
 * 轮询Render服务器，获取待处理的礼物发送任务，调用Python Playwright脚本处理
 */

const { spawn } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

class WindowsGiftListener {
    constructor() {
        // 配置服务器URL（根据实际部署地址修改）
        this.serverUrl = process.env.SERVER_URL || 'https://minimal-games-site.onrender.com';  // 或者你的实际Render URL
        this.apiKey = process.env.WINDOWS_API_KEY || '';
        this.hmacSecret = process.env.GIFT_TASKS_HMAC_SECRET || ''; // 签名密钥
        this.pollInterval = 2000; // 2秒轮询一次
        this.isPollingGifts = false;
        this.isPollingPk = false;
        this.pythonScript = process.env.GIFT_SENDER_SCRIPT || 'C:/Users/user/minimal-games-site/bilibili_gift_sender.py';
        this.pythonPath = process.env.GIFT_SENDER_PYTHON || 'python';
        this.threeServerUrl = 'http://127.0.0.1:9876';
        this.threeServerRoomId = null;
        this.threeServerLastCheck = 0;
        this.threeServerCheckTtl = 5000;
        this.threeServerScript = process.env.THREESERVER_SCRIPT || 'C:/Users/user/Desktop/jiaobenbili/threeserver.py';
        this.threeServerPythonPath = process.env.THREESERVER_PYTHON || 'python';
        this.threeServerProcess = null;
        this.threeServerProcessRoomId = null;
        this.pkThreeServers = new Map();
        this.pkScript = process.env.BILIPK_SCRIPT || 'C:/Users/user/Desktop/jiaobenbili/checkpk.py';
        this.pkPythonPath = process.env.BILIPK_PYTHON || 'python';
        this.pkConfigPath = process.env.BILIPK_CONFIG || 'C:/Users/user/Desktop/jiaobenbili/config_gift_only.json';
        this.pkProcesses = new Map();
    }

    // 启动监听服务
    async start() {
        if (!this.hmacSecret) {
            throw new Error('缺少GIFT_TASKS_HMAC_SECRET环境变量，无法进行签名请求');
        }
        if (!this.apiKey || this.apiKey.length < 32) {
            throw new Error('缺少有效的WINDOWS_API_KEY环境变量');
        }
        console.log('🚀 Windows B站礼物发送监听服务已启动');
        console.log(`📡 监听服务器: ${this.serverUrl}`);
        console.log(`⏰ 轮询间隔: ${this.pollInterval}ms`);
        console.log(`⚡ threeserver: ${this.threeServerUrl}`);
        console.log(`🧠 threeserver脚本: ${this.threeServerScript}`);
        console.log(`🐍 Python路径: ${this.pythonPath}`);
        console.log(`📜 脚本路径: ${this.pythonScript}`);
        console.log(`🗡️ PK脚本: ${this.pkScript}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // 启动时重置卡住的任务
        await this.resetStuckTasks();
        
        this.pollForTasks();
        this.pollForPkTasks();
        
        // 设置定时轮询
        setInterval(() => {
            this.pollForTasks();
            this.pollForPkTasks();
        }, this.pollInterval);
    }

    async pollForPkTasks() {
        if (this.isPollingPk) return;
        this.isPollingPk = true;
        try {
            const path = '/api/pk-tasks';
            const headers = this.buildSignedHeaders('GET', path, null);
            const response = await axios.get(`${this.serverUrl}${path}`, {
                timeout: 10000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (response.data.success && response.data.tasks.length > 0) {
                const taskPromises = response.data.tasks.map(task => this.processPkTask(task));
                await Promise.all(taskPromises);
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
        try {
            if (task.action === 'start') {
                await this.startPkProcess(task.username, task.room_id);
            } else if (task.action === 'stop') {
                await this.stopPkProcess(task.username);
            } else {
                await this.markPkTaskFailed(task.id, '未知动作');
                return;
            }
        } catch (error) {
            console.error(`❌ PK任务处理失败 (${task.id}):`, error.message);
            await this.markPkTaskFailed(task.id, error.message || '执行失败');
            return;
        }

        const confirmed = await this.markPkTaskComplete(task.id);
        if (!confirmed) {
            console.error(`❌ PK任务 ${task.id} 已执行，但服务器未确认结果；不会错误标记为执行失败`);
        }
    }

    async startPkProcess(username, roomId) {
        if (this.pkProcesses.has(username)) {
            const existing = this.pkProcesses.get(username);
            if (String(existing?.roomId || '') === String(roomId || '')) {
                if (!await this.updatePkRunnerState(username, true, roomId, existing?.pid || null)) {
                    throw new Error('PK进程正在运行，但运行状态上报失败');
                }
                return;
            }
            await this.stopPkProcess(username);
        }
        const pkConfigPath = await this.ensureRoomConfig(roomId);
        const pkThreeServerUrl = await this.ensurePkThreeServer(username, roomId);
        console.log(`[PK:${username}] 启动checkpk窗口，房间=${roomId}, threeserver=${pkThreeServerUrl}`);
        const cmd = this.buildPkCommand({
            roomId,
            configPath: pkConfigPath,
            threeServerUrl: pkThreeServerUrl,
            reportUrl: `${this.serverUrl}/api/pk/report`,
            reportKey: this.apiKey,
            reportUsername: username
        });
        const windowTitle = `checkpk-${username}-${Date.now()}`;
        const pid = await this.launchPkWindow(cmd, windowTitle);
        this.pkProcesses.set(username, {
            pid,
            roomId: String(roomId),
            windowTitle
        });

        if (!await this.updatePkRunnerState(username, true, roomId, pid || null)) {
            throw new Error('PK进程已启动，但运行状态上报失败');
        }
    }

    async stopPkProcess(username) {
        const entry = this.pkProcesses.get(username);
        if (!entry) {
            if (!await this.updatePkRunnerState(username, false, null, null)) {
                throw new Error('PK进程未运行，但停止状态上报失败');
            }
            this.stopPkThreeServer(username);
            return;
        }
        if (entry.windowTitle) {
            await this.closeWindowByTitle(entry.windowTitle);
        }
        this.pkProcesses.delete(username);
        this.stopPkThreeServer(username);
        if (!await this.updatePkRunnerState(username, false, null, null)) {
            throw new Error('PK进程已停止，但运行状态上报失败');
        }
    }

    async updatePkRunnerState(username, running, roomId, pid) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = '/api/pk/runner/update';
                const payload = {
                    username,
                    running: !!running,
                    roomId: roomId ? String(roomId) : null,
                    pid: pid || null
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
                console.error(`PK runner update error (${attempt}/4):`, error.message);
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async markPkTaskComplete(taskId) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = `/api/pk-tasks/${taskId}/complete`;
                const payload = {};
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
                console.error(`PK任务完成回执失败 (${taskId}, ${attempt}/4):`, error.message);
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async markPkTaskFailed(taskId, errorMessage) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = `/api/pk-tasks/${taskId}/fail`;
                const payload = { error: errorMessage };
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
                console.error(`PK任务失败回执失败 (${taskId}, ${attempt}/4):`, error.message);
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    // 轮询服务器获取任务
    async pollForTasks() {
        if (this.isPollingGifts) return;
        this.isPollingGifts = true;

        try {
            console.log(`🔄 轮询任务... ${new Date().toLocaleTimeString()}`);
            const path = '/api/gift-tasks';
            const headers = this.buildSignedHeaders('GET', path, null);
            const response = await axios.get(`${this.serverUrl}${path}`, {
                timeout: 10000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            console.log(`📡 API响应状态: ${response.status}`);
            console.log(`📊 API响应数据:`, response.data);

            if (response.data.success && response.data.tasks.length > 0) {
                console.log(`📦 获取到 ${response.data.tasks.length} 个待处理任务`);
                
                // 并行处理任务，避免阻塞（每个playwright进程独立）
                const taskPromises = response.data.tasks.map(task => this.processTask(task));
                await Promise.all(taskPromises);
            } else if (response.data.success && response.data.tasks.length === 0) {
                console.log(`📭 暂无待处理任务 (${new Date().toLocaleTimeString()})`);
            }

        } catch (error) {
            if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
                console.log('🔍 正在等待服务器连接...');
            } else if (error.response?.status === 404) {
                console.log('📭 暂无待处理任务');
            } else if (error.response?.status === 401) {
                console.error('❌ API鉴权失败，请检查密钥/签名设置');
            } else {
                console.error('❌ 轮询任务失败:', {
                    message: error.message,
                    status: error.response?.status,
                    data: error.response?.data
                });
            }
        } finally {
            this.isPollingGifts = false;
        }
    }

    // 处理单个任务
    async processTask(task) {
        console.log(`🎁 开始处理任务 ${task.id}: ${task.username} 兑换 ${task.giftName} 到房间 ${task.roomId}`);

        try {
            // 🛡️ 安全修复：任务已在获取时通过原子操作标记为processing，无需再次标记
            console.log(`🔄 任务 ${task.id} 已通过原子操作获取，开始执行...`);
            
            const quantity = Number(task.quantity) > 0 ? Number(task.quantity) : 1;
            const roomId = task.roomId ? String(task.roomId) : '';
            const threeServerRoomId = await this.getThreeServerRoomId();
            const canUseThreeServer = roomId && threeServerRoomId && roomId === threeServerRoomId;

            if (canUseThreeServer) {
                const sendResult = await this.sendToThreeServer(task.giftId, quantity);
                if (sendResult.success) {
                    const markResult = await this.markTaskComplete(task.id, {
                        actualQuantity: quantity,
                        requestedQuantity: quantity,
                        partialSuccess: false
                    });
                    if (markResult) {
                        console.log(`✅ 任务 ${task.id} 已提交到threeserver: ${task.giftName} x${quantity}`);
                    } else {
                        await this.markTaskUncertain(task.id, 'threeserver已发送，但完成回执未确认');
                        console.log(`❌ 任务 ${task.id} 已发送但完成回执未确认`);
                    }
                    return;
                }

                if (sendResult.reachable) {
                    const failureReason = sendResult.balance_insufficient ? '余额不足' : (sendResult.error || 'threeserver发送失败');
                    const markResult = await this.markTaskFailed(task.id, failureReason, sendResult);
                    if (markResult) {
                        console.log(`❌ 任务 ${task.id} 失败: ${failureReason}`);
                    } else {
                        console.log(`❌ 任务 ${task.id} 失败且标记失败，将在下次轮询重试`);
                    }
                    return;
                }

                console.log(`⚠️ threeserver不可达，回退Python发送: ${sendResult.error || '未知错误'}`);
            }

            const result = await this.callPythonScript(task.giftId, task.roomId, quantity);
            if (result.success || result.partial_success) {
                const markResult = await this.markTaskComplete(task.id, {
                    actualQuantity: result.actual_quantity,
                    requestedQuantity: result.requested_quantity,
                    partialSuccess: result.partial_success
                });
                if (markResult) {
                    if (result.partial_success) {
                        console.log(`⚠️ 任务 ${task.id} 部分完成: ${task.giftName} ${result.actual_quantity}/${result.requested_quantity} 已发送到房间 ${task.roomId}`);
                    } else {
                        console.log(`✅ 任务 ${task.id} 完成: ${task.giftName} ${result.actual_quantity}/${result.requested_quantity} 已发送到房间 ${task.roomId}`);
                    }
                } else {
                    await this.markTaskUncertain(task.id, 'Python发送已完成，但完成回执未确认');
                    console.log(`❌ 任务 ${task.id} 已发送但完成回执未确认`);
                }
            } else {
                if (result.outcome_uncertain) {
                    await this.markTaskUncertain(task.id, result.error || 'Python发送结果无法确认');
                    console.log(`⚠️ 任务 ${task.id} 发送结果待确认: ${result.error || '未知原因'}`);
                    return;
                }
                if (result.balance_insufficient) {
                    console.log(`🚫 任务 ${task.id} 失败: 余额不足！请充值后再试。`);
                    console.log(`⚠️  建议暂停送礼服务直到充值完成`);
                }
                const markResult = await this.markTaskFailed(task.id, result.error, result);
                if (markResult) {
                    console.log(`❌ 任务 ${task.id} 失败: ${result.error}`);
                } else {
                    console.log(`❌ 任务 ${task.id} 失败且标记失败，将在下次轮询重试`);
                }
            }

        } catch (error) {
            console.error(`💥 处理任务 ${task.id} 时发生异常:`, error.message);
            await this.markTaskFailed(task.id, error.message);
        }
    }

    async sendToThreeServer(giftId, quantity) {
        const gifts = Array.from({ length: quantity }, () => String(giftId));
        try {
            const response = await axios.post(`${this.threeServerUrl}/send`, { gifts }, { timeout: 3000 });
            if (response.data?.success === true || response.data?.status === 'ok') {
                return { success: true, reachable: true, results: response.data.results };
            }
            return {
                success: false,
                reachable: true,
                balance_insufficient: response.data?.balance_insufficient === true,
                error: response.data?.error || 'threeserver响应异常',
                results: response.data?.results || []
            };
        } catch (error) {
            return {
                success: false,
                reachable: Boolean(error.response),
                balance_insufficient: error.response?.status === 402 || error.response?.data?.balance_insufficient === true,
                error: error.response?.data?.error || error.message || 'threeserver请求失败'
            };
        }
    }

    async getThreeServerRoomId(force = false) {
        const now = Date.now();
        if (!force && this.threeServerRoomId && now - this.threeServerLastCheck < this.threeServerCheckTtl) {
            return this.threeServerRoomId;
        }
        try {
            const response = await axios.get(`${this.threeServerUrl}/`, { timeout: 1000 });
            const roomId = response.data?.room_id ? String(response.data.room_id) : null;
            if (roomId) {
                this.threeServerRoomId = roomId;
                this.threeServerLastCheck = now;
                return roomId;
            }
            return null;
        } catch (error) {
            return null;
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

    async stopThreeServerProcess() {
        const child = this.threeServerProcess;
        if (!child) {
            return;
        }
        try {
            child.kill('SIGTERM');
        } catch (error) {
            console.error('threeserver stop error:', error.message);
        }
        this.threeServerProcess = null;
        this.threeServerProcessRoomId = null;
        this.threeServerRoomId = null;
    }

    async waitForThreeServerRoom(roomId, timeoutMs = 10000, serverUrl = this.threeServerUrl) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            const current = await this.fetchThreeServerRoomId(serverUrl);
            if (current && String(current) === String(roomId)) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
    }

    async fetchThreeServerRoomId(serverUrl) {
        try {
            const response = await axios.get(`${serverUrl}/`, { timeout: 1000 });
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

    async ensurePkThreeServer(username, roomId) {
        const desiredRoomId = String(roomId);
        const existing = this.pkThreeServers.get(username);
        if (existing && existing.roomId === desiredRoomId) {
            return existing.url;
        }
        if (existing) {
            await this.stopPkThreeServer(username);
        }

        const port = await this.getFreePort();
        const url = `http://127.0.0.1:${port}`;
        const configPath = await this.ensureRoomConfig(desiredRoomId);
        const child = spawn(this.threeServerPythonPath, [this.threeServerScript], {
            cwd: path.dirname(this.threeServerScript),
            env: {
                ...process.env,
                BILIPK_CONFIG: configPath,
                THREESERVER_PORT: String(port)
            },
            windowsHide: true
        });

        this.pkThreeServers.set(username, {
            process: child,
            port,
            url,
            roomId: desiredRoomId
        });

        child.stdout.on('data', (data) => {
            console.log(`[threeserver:${username}] ${data.toString().trim()}`);
        });
        child.stderr.on('data', (data) => {
            console.error(`[threeserver:${username}][ERR] ${data.toString().trim()}`);
        });
        child.on('close', () => {
            this.pkThreeServers.delete(username);
        });
        child.on('error', () => {
            this.pkThreeServers.delete(username);
        });

        const ready = await this.waitForThreeServerRoom(desiredRoomId, 20000, url);
        if (!ready) {
            console.log(`⚠️ threeserver(${username})未在超时内确认房间，先继续执行PK`);
        }
        return url;
    }

    async stopPkThreeServer(username) {
        const entry = this.pkThreeServers.get(username);
        if (!entry) {
            return;
        }
        try {
            entry.process.kill('SIGTERM');
        } catch (error) {
            console.error(`[threeserver:${username}] stop error:`, error.message);
        }
        this.pkThreeServers.delete(username);
    }

    buildPkCommand({ roomId, configPath, threeServerUrl, reportUrl, reportKey, reportUsername }) {
        const parts = [
            `set BILIPK_CONFIG=${configPath}`,
            `set THREESERVER_URL=${threeServerUrl}`,
            `set PK_REPORT_URL=${reportUrl}`,
            `set PK_REPORT_KEY=${reportKey}`,
            `set PK_REPORT_USERNAME=${reportUsername}`,
            `"${this.pkPythonPath}" "${this.pkScript}" "${roomId}"`
        ];
        return parts.join(' && ');
    }

    async launchPkWindow(cmd, windowTitle) {
        const escapedTitle = this.escapePowerShellSingleQuote(`title ${windowTitle} && ${cmd}`);
        const psCommand = [
            `$p=Start-Process -FilePath 'cmd.exe' -ArgumentList @('/k','${escapedTitle}') -PassThru;`,
            'Write-Output $p.Id'
        ].join(' ');

        return new Promise((resolve) => {
            const child = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], {
                windowsHide: true
            });
            let output = '';
            child.stdout.on('data', (data) => {
                output += data.toString();
            });
            child.on('close', () => {
                const pid = Number(output.trim());
                resolve(Number.isFinite(pid) ? pid : null);
            });
            child.on('error', () => resolve(null));
        });
    }

    escapePowerShellSingleQuote(value) {
        return String(value).replace(/'/g, "''");
    }

    async closeWindowByTitle(windowTitle) {
        const escaped = this.escapePowerShellSingleQuote(windowTitle);
        const psCommand = [
            `$t='${escaped}';`,
            "$procs=Get-Process | Where-Object { $_.MainWindowTitle -like ('*' + $t + '*') };",
            "$procs | ForEach-Object { $_.CloseMainWindow() | Out-Null }"
        ].join(' ');

        return new Promise((resolve) => {
            const killer = spawn('powershell.exe', ['-NoProfile', '-Command', psCommand], { windowsHide: true });
            killer.on('close', () => resolve());
            killer.on('error', () => resolve());
        });
    }

    // 调用Python Playwright脚本
    async callPythonScript(giftId, roomId, quantity = 1) {
        return new Promise((resolve) => {
            console.log(`🐍 调用Python脚本: ${this.pythonPath} ${this.pythonScript} ${giftId} ${roomId} ${quantity}`);
            
            const pythonProcess = spawn(this.pythonPath, [this.pythonScript, giftId, roomId, quantity], {
                stdio: ['pipe', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    BILI_COOKIE_PATH: process.env.BILI_COOKIE_PATH || 'C:/Users/user/Desktop/jiaobenbili/cookie.txt'
                }
            });

            let output = '';
            let errorOutput = '';
            let settled = false;
            const finish = (result) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                resolve(result);
            };
            const timeout = setTimeout(() => {
                try {
                    pythonProcess.kill('SIGTERM');
                } catch (error) {
                    console.error(`终止超时Python进程失败: ${error.message}`);
                }
                finish({
                    success: false,
                    giftId,
                    roomId,
                    outcome_uncertain: true,
                    error: 'Python送礼进程超时，结果无法确认'
                });
            }, 3 * 60 * 1000);
            timeout.unref?.();

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log(`🐍 Python输出: ${data.toString().trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.log(`🐍 Python调试: ${data.toString().trim()}`);
            });

            pythonProcess.on('close', (code) => {
                // 🛡️ 修复：不管exit code，始终解析JSON结果
                try {
                    // 修复JSON解析：使用正确的换行符分割
                    const lines = output.trim().split('\n'); // 修复：使用单个\n而不是\\n
                    console.log(`🔍 Python输出调试: 总共 ${lines.length} 行，最后几行:`);
                    lines.slice(-3).forEach((line, i) => {
                        console.log(`  ${lines.length - 3 + i}: "${line}"`);
                    });
                    
                    // 从后往前查找JSON结果（Python脚本最后输出JSON）
                    for (const line of lines.reverse()) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                            try {
                                const result = JSON.parse(trimmed);
                                console.log(`📋 解析Python结果成功: success=${result.success}, error=${result.error || 'N/A'}`);
                                finish(result);
                                return;
                            } catch (jsonError) {
                                console.log(`⚠️ JSON解析失败: "${trimmed}" - ${jsonError.message}`);
                                continue; // 继续尝试其他行
                            }
                        }
                    }
                    
                    // 没有找到有效JSON输出，这是异常情况
                    console.log(`❌ 未找到有效JSON输出，Python脚本输出:`);
                    console.log(`stdout: "${output}"`);
                    console.log(`stderr: "${errorOutput}"`);
                    
                    finish({
                        success: false,
                        giftId: giftId,
                        roomId: roomId,
                        outcome_uncertain: true,
                        error: `Python脚本未返回有效JSON结果 (exit code: ${code})`
                    });
                    
                } catch (parseError) {
                    console.error(`💥 解析过程异常: ${parseError.message}`);
                    finish({
                        success: false,
                        giftId: giftId,
                        roomId: roomId,
                        outcome_uncertain: true,
                        error: `Python脚本输出解析失败: ${parseError.message}`
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                finish({
                    success: false,
                    giftId: giftId,
                    roomId: roomId,
                    error: `启动Python进程失败: ${error.message}`
                });
            });
        });
    }

    // 重置卡住的任务
    async resetStuckTasks() {
        try {
            console.log('🔄 检查并重置卡住的任务...');
            const path = '/api/gift-tasks/reset-stuck';
            const payload = {};
            const headers = this.buildSignedHeaders('POST', path, payload);
            const response = await axios.post(`${this.serverUrl}${path}`, payload, {
                timeout: 10000,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.success) {
                if (response.data.resetTasks.length > 0) {
                    console.log(`✅ 重置了 ${response.data.resetTasks.length} 个卡住的任务`);
                    response.data.resetTasks.forEach(task => {
                        console.log(`   - 任务 ${task.id}: ${task.username} 的 ${task.gift_name}`);
                    });
                } else {
                    console.log('✅ 没有发现卡住的任务');
                }
            }
        } catch (error) {
            console.error('❌ 重置卡住任务失败:', error.message);
        }
    }

    // 标记任务开始处理
    async markTaskStart(taskId) {
        try {
            const path = `/api/gift-tasks/${taskId}/start`;
            const payload = {};
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
            if (error.response?.status === 404) {
                // 任务已被其他进程处理
                return false;
            }
            console.error(`❌ 标记任务开始失败 (${taskId}):`, error.message);
            return false;
        }
    }

    // 标记任务完成
    async markTaskComplete(taskId, resultData = {}) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
            const path = `/api/gift-tasks/${taskId}/complete`;
            // ✅ 修复：清理 undefined 值，确保签名计算和 HTTP body 一致
            const payload = cleanPayload({
                actual_quantity: resultData.actualQuantity,
                requested_quantity: resultData.requestedQuantity,
                partial_success: resultData.partialSuccess
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
                console.error(`❌ 标记任务完成失败 (${taskId}, ${attempt}/4):`, error.message);
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    // 标记任务失败
    async markTaskFailed(taskId, errorMessage, result = {}) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
            const path = `/api/gift-tasks/${taskId}/fail`;
            // ✅ 修复：清理 undefined 值，确保签名计算和 HTTP body 一致
            const payload = cleanPayload({
                error: errorMessage,
                actual_quantity: result.actual_quantity,
                requested_quantity: result.requested_quantity,
                partial_success: result.partial_success
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
                console.error(`❌ 标记任务失败失败 (${taskId}, ${attempt}/4):`, error.message);
                if (attempt < 4) {
                    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
                }
            }
        }
        return false;
    }

    async markTaskUncertain(taskId, reason) {
        for (let attempt = 1; attempt <= 4; attempt += 1) {
            try {
                const path = `/api/gift-tasks/${taskId}/uncertain`;
                const payload = { reason: String(reason || '发送结果无法确认').slice(0, 1000) };
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
                console.error(`标记任务待确认失败 (${taskId}, ${attempt}/4):`, error.message);
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
        const canonicalBody = stableStringifyBody(body);
        const payload = `${timestamp}.${method.toUpperCase()}.${path}.${canonicalBody}`;
        const signature = crypto.createHmac('sha256', this.hmacSecret).update(payload).digest('hex');

        return {
            'X-API-Key': this.apiKey,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'X-Signature': signature
        };
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

function stableStringifyBody(body) {
    if (!body || typeof body !== 'object' || (Array.isArray(body) && body.length === 0)) {
        return '';
    }
    if (Object.keys(body).length === 0) {
        return '';
    }
    return stableStringify(body);
}

function stableStringify(value) {
    if (value === undefined || typeof value === 'function') {
        return 'null';
    }
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}


// 启动服务
console.log('🔥 Windows B站礼物发送监听服务');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const listener = new WindowsGiftListener();
listener.start().catch(console.error);

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\\n🛑 收到停止信号，正在关闭监听服务...');
    console.log('✅ 服务已停止');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('🛑 收到终止信号，正在关闭监听服务...');
    process.exit(0);
});
