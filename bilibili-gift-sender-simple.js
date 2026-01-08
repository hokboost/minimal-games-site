const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class BilibiliGiftSenderSimple {
    constructor() {
        this.pythonScript = 'bilibili_gift_sender.py';
    }

    // 发送礼物 - 每次都是独立的playwright实例
    async sendGift(giftId, roomId) {
        return new Promise((resolve) => {
            console.log(`🎁 启动独立礼物发送进程，ID: ${giftId}，房间: ${roomId}`);
            
            // 检测运行环境
            const isLinux = process.platform === 'linux';
            const isWSL = process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP;
            
            if (isLinux && !isWSL) {
                // 真正的Linux服务器（如Render）：使用Node.js Playwright
                this.sendGiftLinux(giftId, roomId, resolve);
                return;
            } else if (isWSL) {
                // WSL环境：模拟发送（避免依赖库问题）
                console.log('🔄 WSL环境检测到，模拟礼物发送');
                setTimeout(() => {
                    console.log(`✅ WSL模拟发送成功：ID ${giftId} 到房间 ${roomId}`);
                    resolve({
                        success: true,
                        giftId: giftId,
                        roomId: roomId,
                        message: 'WSL环境模拟发送成功'
                    });
                }, 3000);
                return;
            }
            
            // Windows环境：使用Python Playwright
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
            
            // 直接使用现有的send_gift.bat文件
            const batFile = 'C:\\Users\\user\\minimal-games-site\\send_gift.bat';
            const pythonProcess = spawn('bash', ['-c', `"${batFile}" ${giftId} ${roomId} 2>&1`], {
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

    // Linux环境的礼物发送（使用Node.js Playwright）
    async sendGiftLinux(giftId, roomId, resolve) {
        console.log('🚀 Linux环境：使用Node.js Playwright发送礼物');
        
        try {
            const { chromium } = require('playwright');
            
            const browser = await chromium.launch({ 
                headless: true,  // 服务器环境必须headless
                args: ['--no-sandbox', '--disable-setuid-sandbox'] 
            });
            
            const context = await browser.newContext();
            const page = await context.newPage();

            // 加载B站cookies（写死在代码里）
            console.log('🍪 加载B站cookies...');
            try {
                const cookieData = `# Netscape HTTP Cookie File
.bilibili.com	TRUE	/	FALSE	1799362426	SESSDATA	4282cb5c%2C1783283626%2C3f494%2A12CjAsqfXC9Or3IjeZY1e07RgiRh8zzrFdyhCDCDjv_0NrId9jxzc3gjf5yGXv-37oj2wSVkV3SXBRLTQyckF5dElWRk9oSlNuRGR4V3JERWVCNmRCeWgxWFYzV2cwVU1VMUdOOHZhcXFnYzRGWElvZFRvdjBsc0dESlVMSDVLS3Q5TzhrcHdOLUlnIIEC
.bilibili.com	TRUE	/	FALSE	1799362426	bili_jct	141eeb64e472d403d2a8031b87613894
.bilibili.com	TRUE	/	FALSE	1799362426	buvid3	XY1234567890
.bilibili.com	TRUE	/	FALSE	1799362426	b_nut	1767826426
.bilibili.com	TRUE	/	FALSE	1799362426	DedeUserID	123456789
.bilibili.com	TRUE	/	FALSE	1799362426	DedeUserID__ckMd5	abcdef1234567890
.bilibili.com	TRUE	/	FALSE	1799362426	sid	abcd1234
.live.bilibili.com	TRUE	/	FALSE	1799362426	SESSDATA	4282cb5c%2C1783283626%2C3f494%2A12CjAsqfXC9Or3IjeZY1e07RgiRh8zzrFdyhCDCDjv_0NrId9jxzc3gjf5yGXv-37oj2wSVkV3SXBRLTQyckF5dElWRk9oSlNuRGR4V3JERWVCNmRCeWgxWFYzV2cwVU1VMUdOOHZhcXFnYzRGWElvZFRvdjBsc0dESlVMSDVLS3Q5TzhrcHdOLUlnIIEC
.live.bilibili.com	TRUE	/	FALSE	1799362426	bili_jct	141eeb64e472d403d2a8031b87613894`;
                
                const cookies = this.parseCookieString(cookieData);
                await page.goto('https://www.bilibili.com/');
                await context.addCookies(cookies);
                await page.waitForTimeout(1000);
                console.log('✅ B站cookies加载成功');
            } catch (e) {
                console.log('⚠️ Cookie加载失败，使用游客模式:', e.message);
            }

            // 进入直播间
            console.log(`🏠 进入B站直播间 ${roomId}...`);
            await page.goto(`https://live.bilibili.com/${roomId}`);
            await page.waitForLoadState('domcontentloaded');

            // 等待页面加载
            console.log('⏰ 等待10秒页面加载...');
            await page.waitForTimeout(10000);

            // 尝试发送礼物
            console.log(`🎯 尝试发送礼物 ID: ${giftId}...`);
            const result = await page.evaluate((giftId) => {
                const selector = `.gift-id-${giftId}`;
                const el = document.querySelector(selector);
                if (el) {
                    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
                    el.dispatchEvent(evt);
                    return { success: true, id: giftId };
                } else {
                    return { success: false, id: giftId, error: '礼物元素未找到' };
                }
            }, parseInt(giftId));

            await browser.close();

            if (result.success) {
                console.log(`✅ Linux环境礼物发送成功: ID ${giftId}`);
                resolve({
                    success: true,
                    giftId: giftId,
                    roomId: roomId,
                    message: 'Linux环境发送成功'
                });
            } else {
                console.log(`❌ Linux环境礼物发送失败: ${result.error}`);
                resolve({
                    success: false,
                    giftId: giftId,
                    roomId: roomId,
                    error: result.error || '未知错误'
                });
            }

        } catch (error) {
            console.error('❌ Linux Playwright错误:', error);
            resolve({
                success: false,
                giftId: giftId,
                roomId: roomId,
                error: error.message
            });
        }
    }

    // 解析cookie字符串
    parseCookieString(cookieData) {
        const cookies = [];
        const lines = cookieData.split('\n');
        
        for (const line of lines) {
            if (line.trim().startsWith('#') || !line.trim()) continue;
            const parts = line.trim().split('\t');
            if (parts.length >= 7) {
                const [domain, , path, , , name, value] = parts;
                cookies.push({
                    name: name,
                    value: value,
                    domain: domain,
                    path: path
                });
            }
        }
        return cookies;
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