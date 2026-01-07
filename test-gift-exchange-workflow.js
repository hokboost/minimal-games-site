#!/usr/bin/env node
/**
 * 完整的礼物兑换工作流程测试
 * 测试从API调用到B站礼物发送的完整流程
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 测试配置
const CONFIG = {
    baseURL: 'http://localhost:3000',
    testUser: {
        username: '老六',
        password: '111111'
    },
    testGift: {
        type: 'fanlight', // 粉丝团灯牌，成本低，适合测试
        expectedCost: 1
    },
    bilibiliRoomId: 3929738 // 测试房间
};

class GiftExchangeWorkflowTester {
    constructor() {
        this.session = null;
        this.cookies = '';
    }

    async log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        
        // 同时写入日志文件
        const logFile = path.join(__dirname, 'gift-exchange-test.log');
        fs.appendFileSync(logFile, logMessage + '\n');
    }

    // 用户登录
    async login() {
        try {
            await this.log('🔑 开始用户登录...');
            
            const response = await axios.post(`${CONFIG.baseURL}/api/login`, {
                username: CONFIG.testUser.username,
                password: CONFIG.testUser.password
            }, {
                validateStatus: () => true
            });

            if (response.status === 200 && response.data.success) {
                // 提取session cookies
                const setCookieHeader = response.headers['set-cookie'];
                if (setCookieHeader) {
                    this.cookies = setCookieHeader.map(cookie => cookie.split(';')[0]).join('; ');
                }
                
                await this.log('✅ 用户登录成功');
                return { success: true, data: response.data };
            } else {
                await this.log(`❌ 用户登录失败: ${response.data.message || '未知错误'}`);
                return { success: false, error: response.data.message };
            }
            
        } catch (error) {
            await this.log(`❌ 登录请求失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 检查用户余额
    async checkBalance() {
        try {
            await this.log('💰 检查用户余额...');
            
            const response = await axios.get(`${CONFIG.baseURL}/api/user/profile`, {
                headers: {
                    'Cookie': this.cookies
                },
                validateStatus: () => true
            });

            if (response.status === 200 && response.data.success) {
                const balance = response.data.data.balance || 0;
                await this.log(`💰 当前余额: ${balance} 电币`);
                return { success: true, balance: balance };
            } else {
                await this.log(`❌ 获取余额失败: ${response.data.message || '未知错误'}`);
                return { success: false, error: response.data.message };
            }
            
        } catch (error) {
            await this.log(`❌ 余额查询失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 确保用户有足够余额
    async ensureBalance() {
        const balanceResult = await this.checkBalance();
        if (!balanceResult.success) {
            return balanceResult;
        }

        if (balanceResult.balance < CONFIG.testGift.expectedCost) {
            await this.log(`⚠️ 余额不足，当前: ${balanceResult.balance}, 需要: ${CONFIG.testGift.expectedCost}`);
            await this.log('💳 自动添加测试余额...');
            
            // 这里可以调用添加余额的API或直接操作数据库
            // 为了测试，我们假设有管理员权限可以添加余额
            try {
                const addBalanceResponse = await axios.post(`${CONFIG.baseURL}/api/admin/add-balance`, {
                    username: CONFIG.testUser.username,
                    amount: 1000
                }, {
                    headers: {
                        'Cookie': this.cookies
                    },
                    validateStatus: () => true
                });
                
                if (addBalanceResponse.status === 200) {
                    await this.log('✅ 余额添加成功');
                } else {
                    await this.log('⚠️ 无法通过API添加余额，请手动确保测试用户有足够余额');
                }
            } catch (error) {
                await this.log('⚠️ 无法通过API添加余额，请手动确保测试用户有足够余额');
            }
        }

        return { success: true };
    }

    // 执行礼物兑换
    async exchangeGift() {
        try {
            await this.log(`🎁 开始兑换礼物: ${CONFIG.testGift.type}`);
            
            const response = await axios.post(`${CONFIG.baseURL}/api/gifts/exchange`, {
                giftType: CONFIG.testGift.type,
                cost: CONFIG.testGift.expectedCost
            }, {
                headers: {
                    'Cookie': this.cookies,
                    'Content-Type': 'application/json'
                },
                validateStatus: () => true
            });

            await this.log(`🔍 礼物兑换响应状态: ${response.status}`);
            await this.log(`🔍 礼物兑换响应内容: ${JSON.stringify(response.data, null, 2)}`);

            if (response.status === 200 && response.data.success) {
                await this.log('✅ 礼物兑换成功');
                return { 
                    success: true, 
                    exchangeId: response.data.exchangeId,
                    deliveryStatus: response.data.deliveryStatus,
                    data: response.data 
                };
            } else {
                await this.log(`❌ 礼物兑换失败: ${response.data.message || '未知错误'}`);
                return { success: false, error: response.data.message, data: response.data };
            }
            
        } catch (error) {
            await this.log(`❌ 礼物兑换请求失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 检查礼物兑换历史
    async checkExchangeHistory() {
        try {
            await this.log('📝 检查礼物兑换历史...');
            
            const response = await axios.get(`${CONFIG.baseURL}/api/gifts/history?limit=5`, {
                headers: {
                    'Cookie': this.cookies
                },
                validateStatus: () => true
            });

            if (response.status === 200 && response.data.success) {
                await this.log('✅ 兑换历史获取成功');
                await this.log(`📋 最近兑换记录: ${JSON.stringify(response.data.data, null, 2)}`);
                return { success: true, history: response.data.data };
            } else {
                await this.log(`❌ 获取兑换历史失败: ${response.data.message || '未知错误'}`);
                return { success: false, error: response.data.message };
            }
            
        } catch (error) {
            await this.log(`❌ 兑换历史查询失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 直接测试Python礼物发送器
    async testDirectPythonGiftSender() {
        try {
            await this.log('🐍 测试直接调用Python礼物发送器...');
            
            const { spawn } = require('child_process');
            return new Promise((resolve) => {
                const pythonProcess = spawn('python', [
                    'bilibili_gift_sender.py', 
                    '31164', // 粉丝团灯牌ID
                    CONFIG.bilibiliRoomId.toString()
                ], {
                    cwd: __dirname,
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let output = '';
                let errorOutput = '';

                pythonProcess.stdout.on('data', (data) => {
                    const text = data.toString().trim();
                    output += text + '\n';
                    this.log(`Python输出: ${text}`);
                });

                pythonProcess.stderr.on('data', (data) => {
                    const text = data.toString().trim();
                    errorOutput += text + '\n';
                    this.log(`Python错误: ${text}`);
                });

                pythonProcess.on('close', (code) => {
                    this.log(`🐍 Python进程结束，退出码: ${code}`);
                    
                    try {
                        // 尝试从输出中解析JSON结果
                        const lines = output.trim().split('\n');
                        for (const line of lines.reverse()) {
                            if (line.trim().startsWith('{')) {
                                const result = JSON.parse(line.trim());
                                this.log(`✅ Python礼物发送结果: ${JSON.stringify(result, null, 2)}`);
                                resolve(result);
                                return;
                            }
                        }
                        
                        // 如果没有找到JSON，返回基本信息
                        resolve({
                            success: code === 0,
                            output: output,
                            error: errorOutput,
                            exitCode: code
                        });
                        
                    } catch (parseError) {
                        this.log(`❌ 解析Python输出失败: ${parseError.message}`);
                        resolve({
                            success: false,
                            error: parseError.message,
                            output: output,
                            errorOutput: errorOutput
                        });
                    }
                });

                pythonProcess.on('error', (error) => {
                    this.log(`❌ 启动Python失败: ${error.message}`);
                    resolve({
                        success: false,
                        error: error.message
                    });
                });
            });
            
        } catch (error) {
            await this.log(`❌ Python测试失败: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    // 运行完整测试
    async runCompleteTest() {
        await this.log('🚀 开始完整的礼物兑换工作流程测试');
        await this.log('='.repeat(60));
        
        const results = {
            login: null,
            balance: null,
            exchange: null,
            history: null,
            pythonTest: null
        };

        // 1. 登录测试
        results.login = await this.login();
        if (!results.login.success) {
            await this.log('❌ 登录失败，测试终止');
            return results;
        }

        // 2. 余额检查和确保
        results.balance = await this.ensureBalance();
        if (!results.balance.success) {
            await this.log('❌ 余额检查失败，继续测试其他功能');
        }

        // 3. 礼物兑换测试
        results.exchange = await this.exchangeGift();
        
        // 4. 兑换历史查询
        results.history = await this.checkExchangeHistory();

        // 5. 直接Python测试
        await this.log('='.repeat(40));
        await this.log('🐍 现在测试直接的Python礼物发送功能（这将打开浏览器）');
        results.pythonTest = await this.testDirectPythonGiftSender();

        // 测试总结
        await this.log('='.repeat(60));
        await this.log('📊 测试结果总结:');
        await this.log(`🔑 登录: ${results.login.success ? '✅ 成功' : '❌ 失败'}`);
        await this.log(`💰 余额: ${results.balance.success ? '✅ 成功' : '❌ 失败'}`);
        await this.log(`🎁 兑换: ${results.exchange.success ? '✅ 成功' : '❌ 失败'}`);
        await this.log(`📝 历史: ${results.history.success ? '✅ 成功' : '❌ 失败'}`);
        await this.log(`🐍 Python: ${results.pythonTest.success ? '✅ 成功' : '❌ 失败'}`);

        return results;
    }
}

// 主函数
async function main() {
    const tester = new GiftExchangeWorkflowTester();
    
    try {
        // 检查服务器是否运行
        console.log('🔍 检查服务器状态...');
        await axios.get(`${CONFIG.baseURL}/`, { timeout: 5000 });
        console.log('✅ 服务器正在运行');
        
        // 运行完整测试
        const results = await tester.runCompleteTest();
        
        // 输出最终结果
        console.log('\n🏁 测试完成！');
        console.log('详细日志请查看: gift-exchange-test.log');
        
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            console.log('❌ 服务器未运行，请先启动服务器: node server.js');
        } else {
            console.log(`❌ 测试失败: ${error.message}`);
        }
    }
}

// 运行测试
if (require.main === module) {
    main().catch(console.error);
}

module.exports = GiftExchangeWorkflowTester;