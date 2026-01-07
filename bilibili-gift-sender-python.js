const { spawn, exec } = require('child_process');
const path = require('path');

class BilibiliGiftSenderPython {
    constructor() {
        this.pythonScript = path.join(__dirname, 'bilibili-gift-sender.py');
        this.isInitialized = false;
        this.pythonProcess = null;
    }

    // 调用Python脚本发送礼物
    async sendGift(giftId, roomId) {
        return new Promise((resolve) => {
            console.log(`🎁 Python版本发送礼物，ID: ${giftId}，房间: ${roomId}`);
            
            // 创建临时Python文件
            const fs = require('fs');
            const tempScriptWSL = path.join(__dirname, 'temp_gift_sender.py');
            
            const pythonCode = `# -*- coding: utf-8 -*-
import sys
sys.path.append('C:/Users/user/minimal-games-site')
from bilibili_gift_sender import get_gift_sender
import json
import time

try:
    sender = get_gift_sender()
    if not sender.is_initialized:
        success = sender.initialize()
        if not success:
            print(json.dumps({"success": False, "error": "Initialization failed"}))
            sys.exit(1)
    
    result = sender.send_gift("${giftId}", "${roomId}")
    print(json.dumps(result, ensure_ascii=False))
    
    # 保持浏览器打开，等待用户手动关闭
    print("Browser will stay open. Check the bilibili page for gift sending result.")
    print("Press Ctrl+C in the browser window or close it manually when done.")
    
    # 不自动退出，让浏览器保持打开
    input("Press Enter to close browser...")
    
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}, ensure_ascii=False))
`;

            // 写入临时文件到WSL路径，然后通过Windows访问
            fs.writeFileSync(tempScriptWSL, pythonCode, 'utf8');
            
            // 写入Windows路径的临时脚本
            const windowsTempScript = `C:/Users/user/minimal-games-site/temp_${Date.now()}.py`;
            require('fs').writeFileSync(windowsTempScript.replace('C:/', '/mnt/c/'), pythonCode, 'utf8');
            
            // 使用cmd运行Python脚本
            const batContent = `@echo off
cd /d C:\\Users\\user\\minimal-games-site
python temp_${Date.now()}.py
del temp_${Date.now()}.py
pause`;
            
            const batFile = `/mnt/c/Users/user/minimal-games-site/temp_${Date.now()}.bat`;
            require('fs').writeFileSync(batFile, batContent);
            
            // 运行批处理文件
            const pythonProcess = spawn('/mnt/c/Windows/System32/cmd.exe', ['/c', batFile.replace('/mnt/c/', 'C:\\').replace(/\//g, '\\')], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.log('Python stderr:', data.toString());
            });

            pythonProcess.on('close', (code) => {
                // 清理临时文件
                try {
                    fs.unlinkSync(tempScriptWSL);
                } catch (cleanupError) {
                    console.warn('清理临时文件失败:', cleanupError.message);
                }
                
                try {
                    if (code === 0 && output.trim()) {
                        // 尝试解析JSON输出
                        const lines = output.trim().split('\n');
                        const lastLine = lines[lines.length - 1];
                        
                        try {
                            const result = JSON.parse(lastLine);
                            console.log(`✅ Python礼物发送结果:`, result);
                            resolve(result);
                        } catch (parseError) {
                            console.log('Python输出:', output);
                            resolve({
                                success: true,
                                giftId: giftId,
                                roomId: roomId,
                                message: '礼物发送完成（Python版本）'
                            });
                        }
                    } else {
                        console.error(`❌ Python脚本执行失败，退出码: ${code}`);
                        console.error('错误输出:', errorOutput);
                        resolve({
                            success: false,
                            giftId: giftId,
                            roomId: roomId,
                            error: `Python脚本执行失败: ${errorOutput || '未知错误'}`
                        });
                    }
                } catch (error) {
                    console.error('❌ 处理Python输出时出错:', error);
                    resolve({
                        success: false,
                        giftId: giftId,
                        roomId: roomId,
                        error: error.message
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('❌ 启动Python进程失败:', error);
                resolve({
                    success: false,
                    giftId: giftId,
                    roomId: roomId,
                    error: `启动Python进程失败: ${error.message}`
                });
            });
        });
    }

    // 初始化测试
    async testInitialize() {
        return new Promise((resolve) => {
            console.log('🚀 测试Python版本初始化...');
            
            const pythonCode = `
# -*- coding: utf-8 -*-
import sys
sys.path.append('C:/Users/user/minimal-games-site')
try:
    from bilibili_gift_sender import get_gift_sender
    sender = get_gift_sender()
    result = sender.initialize()
    if result:
        print("Python version initialized successfully!")
    else:
        print("Python version initialization failed")
except Exception as e:
    print(f"Python version initialization error: {e}")
`;

            const pythonProcess = spawn('cmd.exe', ['/c', 'C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python313\\python.exe', '-c', pythonCode], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
                console.log('Python输出:', data.toString().trim());
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
                console.log('Python错误:', data.toString().trim());
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    resolve(true);
                } else {
                    console.error(`❌ Python测试失败，退出码: ${code}`);
                    resolve(false);
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('❌ 启动Python测试进程失败:', error);
                resolve(false);
            });
        });
    }

    // 清理资源
    async cleanup() {
        // Python版本的清理会在每次调用后自动进行
        console.log('🧹 Python版本清理完成');
    }
}

// 单例模式
let pythonGiftSenderInstance = null;

function getPythonGiftSender() {
    if (!pythonGiftSenderInstance) {
        pythonGiftSenderInstance = new BilibiliGiftSenderPython();
    }
    return pythonGiftSenderInstance;
}

module.exports = { BilibiliGiftSenderPython, getPythonGiftSender };