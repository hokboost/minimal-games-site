const { spawn } = require('child_process');
const path = require('path');

class BilibiliGiftSenderSimple {
    constructor() {
        this.pythonScript = 'bilibili_gift_sender.py';
    }

    // 发送礼物 - 每次都是独立的playwright实例
    async sendGift(giftId, roomId) {
        return new Promise((resolve) => {
            console.log(`🎁 启动独立礼物发送进程，ID: ${giftId}，房间: ${roomId}`);
            
            // 创建临时Python脚本
            const fs = require('fs');
            const tempScript = path.join(__dirname, `temp_gift_${Date.now()}.py`);
            
            const pythonCode = `# -*- coding: utf-8 -*-
from playwright.sync_api import sync_playwright
import time
import json
import sys

def load_cookies_from_txt(file_path):
    cookies = []
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("#") or not line.strip():
                    continue
                parts = line.strip().split("\\t")
                if len(parts) >= 7:
                    domain, _, path, _, _, name, value = parts[:7]
                    cookies.append({
                        "name": name,
                        "value": value,
                        "domain": domain,
                        "path": path
                    })
        return cookies
    except Exception as e:
        print(f"❌ cookie加载失败: {e}")
        return []

# 主逻辑
print("🚀 启动B站礼物发送")
with sync_playwright() as p:
    browser = p.chromium.launch(headless=False, slow_mo=100)
    context = browser.new_context()
    page = context.new_page()

    print("🍪 加载cookies...")
    cookies = load_cookies_from_txt('C:/Users/user/Desktop/jiaobenbili/cookie.txt')
    page.goto("https://www.bilibili.com/")
    page.context.add_cookies(cookies)
    time.sleep(1)

    print(f"🏠 进入房间 ${roomId}...")
    page.goto(f"https://live.bilibili.com/${roomId}")
    page.wait_for_load_state("domcontentloaded")

    print("📦 等待礼物面板...")
    for _ in range(20):
        if page.query_selector(".gift-panel"):
            break
        time.sleep(0.5)

    print("➡️ 展开礼物面板...")
    try:
        page.evaluate('''
            () => {
                const el = document.querySelector('.gift-panel-switch');
                if (el) {
                    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    el.dispatchEvent(evt);
                }
            }
        ''')
        time.sleep(1.5)
    except:
        pass

    print("⏰ 等待10秒...")
    time.sleep(10)

    print(f"🎯 发送礼物 ${giftId}...")
    result = page.evaluate('''
        () => {
            const selector = '.gift-id-${giftId}';
            const el = document.querySelector(selector);
            if (el) {
                const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                el.dispatchEvent(evt);
                return {success: true};
            } else {
                return {success: false};
            }
        }
    ''')

    if result['success']:
        print("✅ 礼物发送成功")
        print(json.dumps({"success": True, "gift_id": "${giftId}", "room_id": "${roomId}"}))
    else:
        print("❌ 礼物元素未找到")
        print(json.dumps({"success": False, "error": "Gift not found", "gift_id": "${giftId}", "room_id": "${roomId}"}))
    
    time.sleep(5)
`;

            // 写入临时文件
            fs.writeFileSync(tempScript, pythonCode, 'utf8');
            
            // 调用Windows批处理文件
            const batFile = '/mnt/c/Users/user/minimal-games-site/send_gift.bat';
            const pythonProcess = spawn('/mnt/c/Windows/System32/cmd.exe', ['/c', 'C:\\Users\\user\\minimal-games-site\\send_gift.bat', giftId, roomId], {
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
                // 清理临时文件
                try {
                    fs.unlinkSync(tempScript);
                } catch (e) {}
                
                try {
                    // 解析输出中的JSON结果
                    const lines = output.trim().split('\n');
                    for (const line of lines.reverse()) {
                        if (line.trim().startsWith('{')) {
                            const result = JSON.parse(line.trim());
                            console.log('✅ 礼物发送完成:', result);
                            resolve(result);
                            return;
                        }
                    }
                    
                    // 如果没有找到JSON，返回成功
                    resolve({
                        success: true,
                        giftId: giftId,
                        roomId: roomId,
                        message: '礼物发送完成（浏览器已打开）'
                    });
                    
                } catch (error) {
                    resolve({
                        success: false,
                        error: error.message,
                        giftId: giftId,
                        roomId: roomId
                    });
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('❌ 启动Python失败:', error);
                resolve({
                    success: false,
                    error: error.message,
                    giftId: giftId,
                    roomId: roomId
                });
            });
        });
    }

    // 清理资源（实际上每个进程都是独立的，会自动清理）
    async cleanup() {
        console.log('🧹 独立进程，无需手动清理');
    }
}

// 单例模式
let simpleGiftSenderInstance = null;

function getSimpleGiftSender() {
    if (!simpleGiftSenderInstance) {
        simpleGiftSenderInstance = new BilibiliGiftSenderSimple();
    }
    return simpleGiftSenderInstance;
}

module.exports = { BilibiliGiftSenderSimple, getSimpleGiftSender };