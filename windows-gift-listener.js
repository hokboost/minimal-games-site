#!/usr/bin/env node

/**
 * Windows B站礼物发送监听服务
 * 轮询Render服务器，获取待处理的礼物发送任务，调用Python Playwright脚本处理
 */

const { spawn } = require('child_process');
const axios = require('axios');

class WindowsGiftListener {
    constructor() {
        // 配置服务器URL（根据实际部署地址修改）
        this.serverUrl = 'https://minimal-games-site.onrender.com';  // 或者你的实际Render URL
        this.apiKey = 'bilibili-gift-service-secret-key-2024-secure'; // API密钥
        this.pollInterval = 2000; // 2秒轮询一次
        this.isProcessing = false;
        this.pythonScript = 'C:/Users/user/minimal-games-site/bilibili_gift_sender.py';
        this.pythonPath = 'python'; // 直接用python命令
    }

    // 启动监听服务
    async start() {
        console.log('🚀 Windows B站礼物发送监听服务已启动');
        console.log(`📡 监听服务器: ${this.serverUrl}`);
        console.log(`⏰ 轮询间隔: ${this.pollInterval}ms`);
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
            
            const response = await axios.get(`${this.serverUrl}/api/gift-tasks`, {
                timeout: 10000,
                headers: {
                    'X-API-Key': this.apiKey,
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
                console.error('❌ API密钥验证失败，请检查密钥设置');
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
            // 先标记任务为处理中，防止重复处理
            const startResult = await this.markTaskStart(task.id);
            if (!startResult) {
                console.log(`⚠️ 任务 ${task.id} 已被其他进程处理，跳过`);
                return;
            }
            
            // 调用Python脚本，传递数量参数
            const quantity = task.quantity || 1;
            const result = await this.callPythonScript(task.giftId, task.roomId, quantity);
            
            if (result.success) {
                // 任务成功，通知服务器
                const markResult = await this.markTaskComplete(task.id);
                if (markResult) {
                    console.log(`✅ 任务 ${task.id} 完成: ${task.giftName} 已发送到房间 ${task.roomId}`);
                } else {
                    console.log(`❌ 任务 ${task.id} 处理成功但标记失败，将在下次轮询重试`);
                }
            } else {
                // 检查是否是余额不足
                if (result.balance_insufficient) {
                    console.log(`🚫 任务 ${task.id} 失败: 余额不足！请充值后再试。`);
                    console.log(`⚠️  建议暂停送礼服务直到充值完成`);
                }
                
                // 任务失败，通知服务器
                const markResult = await this.markTaskFailed(task.id, result.error);
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

    // 调用Python Playwright脚本
    async callPythonScript(giftId, roomId, quantity = 1) {
        return new Promise((resolve) => {
            console.log(`🐍 调用Python脚本: ${this.pythonPath} ${this.pythonScript} ${giftId} ${roomId} ${quantity}`);
            
            const pythonProcess = spawn(this.pythonPath, [this.pythonScript, giftId, roomId, quantity], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log(`🐍 Python输出: ${data.toString().trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.log(`🐍 Python错误: ${data.toString().trim()}`);
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    // 尝试解析JSON输出
                    try {
                        const lines = output.trim().split('\\n');
                        for (const line of lines.reverse()) {
                            if (line.trim().startsWith('{')) {
                                const result = JSON.parse(line.trim());
                                resolve(result);
                                return;
                            }
                        }
                        
                        // 没有找到JSON输出，但退出码为0，认为成功
                        resolve({
                            success: true,
                            giftId: giftId,
                            roomId: roomId,
                            message: 'Python脚本执行成功'
                        });
                        
                    } catch (parseError) {
                        resolve({
                            success: true,
                            giftId: giftId,
                            roomId: roomId,
                            message: 'Python脚本执行成功（输出解析失败）'
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        giftId: giftId,
                        roomId: roomId,
                        error: `Python脚本执行失败，退出码: ${code}，错误: ${errorOutput || '未知错误'}`
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
            const response = await axios.post(`${this.serverUrl}/api/gift-tasks/reset-stuck`, {}, {
                timeout: 10000,
                headers: {
                    'X-API-Key': this.apiKey,
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
            const response = await axios.post(`${this.serverUrl}/api/gift-tasks/${taskId}/start`, {}, {
                timeout: 5000,
                headers: {
                    'X-API-Key': this.apiKey,
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
    async markTaskComplete(taskId) {
        try {
            const response = await axios.post(`${this.serverUrl}/api/gift-tasks/${taskId}/complete`, {}, {
                timeout: 5000,
                headers: {
                    'X-API-Key': this.apiKey,
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
    async markTaskFailed(taskId, errorMessage) {
        try {
            const response = await axios.post(`${this.serverUrl}/api/gift-tasks/${taskId}/fail`, {
                error: errorMessage
            }, {
                timeout: 5000,
                headers: {
                    'X-API-Key': this.apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response.status === 200 && response.data.success;
        } catch (error) {
            console.error(`❌ 标记任务失败失败 (${taskId}):`, error.message);
            return false;
        }
    }
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