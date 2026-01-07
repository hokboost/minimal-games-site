const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { BilibiliCookieManager } = require('./bilibili-cookie-manager');

class BilibiliGiftSender {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isInitialized = false;
        this.cookiePath = '/mnt/c/Users/user/Desktop/jiaobenbili/cookie.txt';
        this.cookieManager = new BilibiliCookieManager(this.cookiePath);
        this.lastCookieCheck = 0;
        this.cookieCheckInterval = 30 * 60 * 1000; // 30分钟检查一次
    }

    // 加载cookie文件
    loadCookiesFromTxt(filePath) {
        try {
            const cookies = [];
            const content = fs.readFileSync(filePath, 'utf-8');
            
            for (const line of content.split('\n')) {
                if (line.trim().startsWith('#') || !line.trim()) {
                    continue;
                }
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
        } catch (error) {
            console.error('❌ 加载cookie文件失败:', error.message);
            return [];
        }
    }

    // 确保cookie有效性
    async ensureValidCookies() {
        const now = Date.now();
        
        // 如果距离上次检查时间不足间隔，跳过检查
        if (now - this.lastCookieCheck < this.cookieCheckInterval) {
            return true;
        }

        try {
            console.log('🔍 检查cookie有效性...');
            const cookieResult = await this.cookieManager.getValidCookies();
            
            if (cookieResult.success) {
                this.lastCookieCheck = now;
                console.log('✅ Cookie有效或已自动刷新');
                return true;
            } else {
                console.error('❌ Cookie无效且刷新失败:', cookieResult.error);
                return false;
            }
            
        } catch (error) {
            console.error('❌ 检查cookie有效性失败:', error);
            return false;
        }
    }

    // 初始化浏览器
    async initialize() {
        try {
            console.log('🚀 初始化B站送礼浏览器...');
            
            // 首先确保cookie有效
            const cookiesValid = await this.ensureValidCookies();
            if (!cookiesValid) {
                throw new Error('Cookie无效且无法刷新，请手动登录');
            }
            
            this.browser = await chromium.launch({ 
                headless: false,
                slowMo: 100 
            });
            
            const context = await this.browser.newContext();
            this.page = await context.newPage();

            // 加载最新的有效cookies
            const cookies = this.loadCookiesFromTxt(this.cookiePath);
            if (cookies.length > 0) {
                await this.page.goto('https://www.bilibili.com/');
                await this.page.context().addCookies(cookies);
                console.log('✅ 最新Cookies加载成功');
            } else {
                throw new Error('无法加载cookie文件');
            }

            this.isInitialized = true;
            console.log('✅ B站送礼浏览器初始化完成');
            
        } catch (error) {
            console.error('❌ 初始化浏览器失败:', error);
            throw error;
        }
    }

    // 进入指定直播间
    async enterRoom(roomId) {
        try {
            console.log(`🏠 进入B站直播间: ${roomId}`);
            
            if (!this.isInitialized) {
                await this.initialize();
            }

            const roomUrl = `https://live.bilibili.com/${roomId}`;
            await this.page.goto(roomUrl, { waitUntil: 'domcontentloaded' });
            
            // 等待礼物面板加载
            console.log('📦 等待礼物面板加载...');
            await this.page.waitForTimeout(3000);

            // 尝试展开礼物面板
            try {
                const arrowSelector = '.gift-panel-switch';
                const arrowElement = await this.page.$(arrowSelector);
                if (arrowElement) {
                    await arrowElement.click();
                    await this.page.waitForTimeout(1000);
                    console.log('✅ 礼物面板已展开');
                }
            } catch (error) {
                console.log('⚠️ 礼物面板展开可能失败，继续尝试发送礼物');
            }

            return true;
            
        } catch (error) {
            console.error(`❌ 进入直播间 ${roomId} 失败:`, error);
            return false;
        }
    }

    // 发送礼物
    async sendGift(giftId, roomId) {
        try {
            console.log(`🎁 开始发送礼物，ID: ${giftId}，房间: ${roomId}`);

            // 确保浏览器已初始化
            if (!this.isInitialized) {
                await this.initialize();
            }

            // 再次检查cookie有效性（如果是敏感操作）
            const cookiesValid = await this.ensureValidCookies();
            if (!cookiesValid) {
                throw new Error('Cookie已过期，无法发送礼物');
            }

            // 确保在正确的房间
            const currentUrl = this.page.url();
            if (!currentUrl.includes(`live.bilibili.com/${roomId}`)) {
                const success = await this.enterRoom(roomId);
                if (!success) {
                    throw new Error('进入直播间失败');
                }
            }

            // 尝试多种选择器查找礼物
            const giftSelectors = [
                `.gift-id-${giftId}`,
                `[data-gift-id="${giftId}"]`,
                `.gift-item[data-id="${giftId}"]`,
                `.gift-list .gift-item:has([data-gift-id="${giftId}"])`
            ];

            let giftFound = false;
            for (const selector of giftSelectors) {
                try {
                    const giftElement = await this.page.$(selector);
                    if (giftElement && await giftElement.isVisible()) {
                        console.log(`✅ 找到礼物元素，选择器: ${selector}`);
                        await giftElement.click();
                        giftFound = true;
                        break;
                    }
                } catch (error) {
                    // 继续尝试下一个选择器
                }
            }

            if (!giftFound) {
                // 尝试JavaScript方式点击
                console.log('🔄 尝试JavaScript方式发送礼物...');
                const jsResult = await this.page.evaluate((giftId) => {
                    const selectors = [
                        `.gift-id-${giftId}`,
                        `[data-gift-id="${giftId}"]`,
                        `.gift-item[data-id="${giftId}"]`
                    ];
                    
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            const event = new MouseEvent('click', { 
                                bubbles: true, 
                                cancelable: true, 
                                view: window 
                            });
                            element.dispatchEvent(event);
                            return { success: true, selector: selector };
                        }
                    }
                    return { success: false };
                }, giftId);

                if (!jsResult.success) {
                    throw new Error(`未找到礼物ID ${giftId} 对应的元素`);
                }
                
                console.log(`✅ JavaScript点击成功，选择器: ${jsResult.selector}`);
            }

            // 等待可能的发送结果
            await this.page.waitForTimeout(2000);

            // 检查是否有错误提示
            const errorSelectors = [
                '.error-tip', '.toast-error', '.gift-error', 
                'text=余额不足', 'text=B币不足'
            ];
            
            for (const errorSelector of errorSelectors) {
                try {
                    const errorElement = await this.page.$(errorSelector);
                    if (errorElement && await errorElement.isVisible()) {
                        const errorText = await errorElement.textContent();
                        if (errorText.includes('余额') || errorText.includes('不足')) {
                            throw new Error('B币余额不足');
                        }
                    }
                } catch (error) {
                    // 忽略选择器错误
                }
            }

            console.log(`✅ 礼物发送成功！ID: ${giftId}`);
            return {
                success: true,
                giftId: giftId,
                roomId: roomId,
                message: '礼物发送成功'
            };

        } catch (error) {
            console.error(`❌ 发送礼物失败:`, error.message);
            return {
                success: false,
                giftId: giftId,
                roomId: roomId,
                error: error.message
            };
        }
    }

    // 检查当前B币余额
    async checkBalance() {
        try {
            // 尝试多种方式查找余额信息
            const balanceSelectors = [
                '.balance-info .title',
                '[data-v-2e691f81].title',
                '.balance-info',
                'text=/余额[:\\s]*\\d+/'
            ];

            for (const selector of balanceSelectors) {
                try {
                    const elements = await this.page.$$(selector);
                    for (const element of elements) {
                        const text = await element.textContent();
                        const match = text.match(/余额[:\s]*(\d+)/);
                        if (match) {
                            const balance = parseInt(match[1]);
                            console.log(`💰 当前B币余额: ${balance}`);
                            return balance;
                        }
                    }
                } catch (error) {
                    // 继续尝试下一个选择器
                }
            }

            console.log('⚠️ 无法获取B币余额');
            return null;

        } catch (error) {
            console.error('❌ 检查余额失败:', error);
            return null;
        }
    }

    // 清理资源
    async cleanup() {
        try {
            if (this.cookieManager) {
                await this.cookieManager.cleanup();
            }
            
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
                this.isInitialized = false;
                console.log('✅ 浏览器资源已清理');
            }
        } catch (error) {
            console.error('❌ 清理浏览器资源失败:', error);
        }
    }

    // 手动刷新cookie
    async refreshCookies() {
        try {
            console.log('🔄 手动刷新cookie...');
            const refreshResult = await this.cookieManager.autoRefreshIfNeeded();
            
            if (refreshResult.refreshed) {
                console.log('✅ Cookie刷新成功，需要重新初始化浏览器');
                
                // 重新初始化浏览器以使用新cookie
                if (this.isInitialized) {
                    await this.cleanup();
                    await this.initialize();
                }
                
                return { success: true, message: 'Cookie已刷新' };
            } else if (refreshResult.error) {
                return { success: false, error: refreshResult.error };
            } else {
                return { success: true, message: 'Cookie仍然有效，无需刷新' };
            }
            
        } catch (error) {
            console.error('❌ 手动刷新cookie失败:', error);
            return { success: false, error: error.message };
        }
    }
}

// 单例模式，避免重复初始化
let giftSenderInstance = null;

function getGiftSender() {
    if (!giftSenderInstance) {
        giftSenderInstance = new BilibiliGiftSender();
    }
    return giftSenderInstance;
}

module.exports = { BilibiliGiftSender, getGiftSender };