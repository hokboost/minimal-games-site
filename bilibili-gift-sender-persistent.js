const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');

class BilibiliGiftSenderPersistent {
    constructor() {
        this.apiUrl = 'http://127.0.0.1:5001';
        this.pythonService = null;
        this.isServiceRunning = false;
    }

    // 启动持久Python服务
    async startService() {
        return new Promise((resolve) => {
            if (this.isServiceRunning) {
                resolve(true);
                return;
            }

            console.log('🚀 启动持久B站礼物发送服务...');
            
            // 启动Python服务
            this.pythonService = spawn('cmd.exe', ['/c', 'cd', '/d', 'C:\\Users\\user\\minimal-games-site', '&&', 'python', 'bilibili_persistent_sender.py'], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let serviceReady = false;

            this.pythonService.stdout.on('data', (data) => {
                output += data.toString();
                console.log('Python输出:', data.toString().trim());
                
                // 检查服务是否启动完成
                if ((data.toString().includes('服务启动完成') || 
                     data.toString().includes('Running on http://127.0.0.1:5001')) && 
                    !serviceReady) {
                    serviceReady = true;
                    this.isServiceRunning = true;
                    console.log('✅ 持久服务启动成功');
                    setTimeout(() => resolve(true), 2000); // 等待2秒确保服务完全就绪
                }
            });

            this.pythonService.stderr.on('data', (data) => {
                console.log('Python错误:', data.toString().trim());
            });

            this.pythonService.on('close', (code) => {
                console.log(`❌ Python服务退出，退出码: ${code}`);
                this.isServiceRunning = false;
                if (!serviceReady) {
                    resolve(false);
                }
            });

            this.pythonService.on('error', (error) => {
                console.error('❌ 启动Python服务失败:', error);
                resolve(false);
            });

            // 60秒超时
            setTimeout(() => {
                if (!serviceReady) {
                    console.log('⏰ 服务启动超时，但继续尝试连接...');
                    // 即使超时也返回true，让后续的连接测试来判断
                    this.isServiceRunning = true;
                    resolve(true);
                }
            }, 15000);
        });
    }

    // 检查服务状态
    async checkServiceStatus() {
        try {
            const response = await axios.get(`${this.apiUrl}/status`, { timeout: 5000 });
            return response.data.initialized;
        } catch (error) {
            return false;
        }
    }

    // 确保服务运行
    async ensureServiceRunning() {
        // 先检查服务是否已经运行
        const isRunning = await this.checkServiceStatus();
        if (isRunning) {
            this.isServiceRunning = true;
            return true;
        }

        // 如果没有运行，启动服务
        return await this.startService();
    }

    // 发送礼物
    async sendGift(giftId, roomId) {
        try {
            console.log(`🎁 持久服务发送礼物，ID: ${giftId}，房间: ${roomId}`);
            
            // 确保服务运行
            const serviceOk = await this.ensureServiceRunning();
            if (!serviceOk) {
                return {
                    success: false,
                    error: '无法启动持久服务'
                };
            }

            // 发送API请求
            const response = await axios.post(`${this.apiUrl}/send_gift`, {
                gift_id: giftId,
                room_id: roomId
            }, {
                timeout: 60000 // 60秒超时
            });

            console.log('✅ 持久服务发送结果:', response.data);
            return response.data;

        } catch (error) {
            console.error('❌ 持久服务发送礼物失败:', error.message);
            return {
                success: false,
                error: error.message,
                giftId: giftId,
                roomId: roomId
            };
        }
    }

    // 进入房间
    async enterRoom(roomId) {
        try {
            console.log(`🏠 持久服务进入房间: ${roomId}`);
            
            // 确保服务运行
            const serviceOk = await this.ensureServiceRunning();
            if (!serviceOk) {
                return {
                    success: false,
                    error: '无法启动持久服务'
                };
            }

            // 发送API请求
            const response = await axios.post(`${this.apiUrl}/enter_room`, {
                room_id: roomId
            }, {
                timeout: 30000
            });

            console.log('✅ 持久服务进入房间结果:', response.data);
            return response.data;

        } catch (error) {
            console.error('❌ 持久服务进入房间失败:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // 停止服务
    async stopService() {
        if (this.pythonService) {
            console.log('🛑 停止持久服务...');
            this.pythonService.kill();
            this.isServiceRunning = false;
        }
    }

    // 清理资源
    async cleanup() {
        await this.stopService();
    }
}

// 单例模式
let persistentGiftSenderInstance = null;

function getPersistentGiftSender() {
    if (!persistentGiftSenderInstance) {
        persistentGiftSenderInstance = new BilibiliGiftSenderPersistent();
    }
    return persistentGiftSenderInstance;
}

module.exports = { BilibiliGiftSenderPersistent, getPersistentGiftSender };