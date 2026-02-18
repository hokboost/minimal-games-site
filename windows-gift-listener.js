#!/usr/bin/env node

/**
 * Windows B站礼物发送监听服务
 * 轮询Render服务器，获取待处理的礼物发送任务，调用Python Playwright脚本处理
 */

const { spawn } = require('child_process');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

class WindowsGiftListener {
    constructor() {
        // 配置服务器URL（根据实际部署地址修改）
        this.serverUrl = 'https://minimal-games-site.onrender.com';  // 或者你的实际Render URL
        this.apiKey = process.env.WINDOWS_API_KEY || 'bilibili-gift-service-secret-key-2024-secure'; // API密钥
        this.hmacSecret = process.env.GIFT_TASKS_HMAC_SECRET || ''; // 签名密钥
        this.pollInterval = 2000; // 2秒轮询一次
        this.isProcessing = false;
        this.pythonScript = 'C:/Users/user/minimal-games-site/bilibili_gift_sender.py';
        this.pythonPath = 'python'; // 直接用python命令
        this.threeServerUrl = 'http://127.0.0.1:9876';
        this.threeServerRoomId = null;
        this.threeServerLastCheck = 0;
        this.threeServerCheckTtl = 5000;
    }

    // 启动监听服务
    async start() {
        if (!this.hmacSecret) {
            throw new Error('缺少GIFT_TASKS_HMAC_SECRET环境变量，无法进行签名请求');
        }
        console.log('🚀 Windows B站礼物发送监听服务已启动');
        console.log(`📡 监听服务器: ${this.serverUrl}`);
        console.log(`⏰ 轮询间隔: ${this.pollInterval}ms`);
        console.log(`⚡ threeserver: ${this.threeServerUrl}`);
        console.log(`🐍 Python路径: ${this.pythonPath}`);
        console.log(`📜 脚本路径: ${this.pythonScript}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // 启动时重置卡住的任务
        await this.resetStuckTasks();
        
        this.pollForTasks();
        
        // 设置定时轮询
        setInterval(() => {
            this.pollForTasks();
        }, this.pollInterval);
    }

    // 轮询服务器获取任务
    async pollForTasks() {
        // 移除isProcessing限制，允许查询新任务（但不重复处理相同任务）

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
                        console.log(`❌ 任务 ${task.id} 处理成功但标记失败，将在下次轮询重试`);
                    }
                    return;
                }

                if (sendResult.reachable) {
                    const markResult = await this.markTaskFailed(task.id, sendResult.error || 'threeserver发送失败', sendResult);
                    if (markResult) {
                        console.log(`❌ 任务 ${task.id} 失败: ${sendResult.error || 'threeserver发送失败'}`);
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
                    console.log(`❌ 任务 ${task.id} 处理成功但标记失败，将在下次轮询重试`);
                }
            } else {
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
            if (response.data?.success === true) {
                return { success: true, reachable: true, results: response.data.results };
            }
            return {
                success: false,
                reachable: true,
                error: response.data?.error || 'threeserver响应异常',
                results: response.data?.results || []
            };
        } catch (error) {
            return {
                success: false,
                reachable: Boolean(error.response),
                error: error.response?.data?.error || error.message || 'threeserver请求失败'
            };
        }
    }

    async getThreeServerRoomId() {
        const now = Date.now();
        if (this.threeServerRoomId && now - this.threeServerLastCheck < this.threeServerCheckTtl) {
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
                                resolve(result);
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
                    
                    resolve({
                        success: false,
                        giftId: giftId,
                        roomId: roomId,
                        error: `Python脚本未返回有效JSON结果 (exit code: ${code})`
                    });
                    
                } catch (parseError) {
                    console.error(`💥 解析过程异常: ${parseError.message}`);
                    resolve({
                        success: false,
                        giftId: giftId,
                        roomId: roomId,
                        error: `Python脚本输出解析失败: ${parseError.message}`
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                resolve({
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
            console.error(`❌ 标记任务完成失败 (${taskId}):`, error.message);
            return false;
        }
    }

    // 标记任务失败
    async markTaskFailed(taskId, errorMessage, result = {}) {
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
            console.error(`❌ 标记任务失败失败 (${taskId}):`, error.message);
            return false;
        }
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
