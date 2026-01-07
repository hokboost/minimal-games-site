const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

class BilibiliCookieManager {
    constructor(cookiePath = '/mnt/c/Users/user/Desktop/jiaobenbili/cookie.txt') {
        this.cookiePath = cookiePath;
        this.browser = null;
        this.page = null;
        this.currentCookies = null;
    }

    // 检查cookie是否过期
    async checkCookieExpiry() {
        try {
            const cookies = this.loadCookiesFromTxt(this.cookiePath);
            
            if (cookies.length === 0) {
                console.log('⚠️ 没有找到cookie文件或cookie为空');
                return { expired: true, reason: 'no_cookies' };
            }

            // 检查关键cookie是否存在
            const sessdata = cookies.find(c => c.name === 'SESSDATA');
            const biliJct = cookies.find(c => c.name === 'bili_jct');
            
            if (!sessdata || !biliJct) {
                console.log('⚠️ 缺少关键cookie (SESSDATA或bili_jct)');
                return { expired: true, reason: 'missing_key_cookies' };
            }

            // 尝试访问B站API验证cookie有效性
            const testResult = await this.testCookieValidity(cookies);
            
            if (!testResult.valid) {
                console.log('⚠️ Cookie已过期或无效');
                return { expired: true, reason: testResult.reason };
            }

            console.log('✅ Cookie有效，无需更新');
            return { expired: false, cookies: cookies };

        } catch (error) {
            console.error('❌ 检查cookie过期状态失败:', error);
            return { expired: true, reason: 'check_error' };
        }
    }

    // 测试cookie有效性
    async testCookieValidity(cookies) {
        try {
            console.log('🔍 测试cookie有效性...');
            
            // 启动临时浏览器测试
            const browser = await chromium.launch({ headless: true });
            const context = await browser.newContext();
            const page = await context.newPage();

            // 设置cookie
            await page.goto('https://www.bilibili.com/');
            await page.context().addCookies(cookies);

            // 访问需要登录的页面
            await page.goto('https://api.bilibili.com/x/web-interface/nav', { 
                waitUntil: 'domcontentloaded' 
            });
            
            // 检查响应内容
            const content = await page.content();
            const response = JSON.parse(await page.locator('pre').textContent());

            await browser.close();

            if (response.code === 0 && response.data && response.data.isLogin) {
                console.log(`✅ Cookie有效，用户: ${response.data.uname}`);
                return { valid: true, userInfo: response.data };
            } else {
                console.log('❌ Cookie无效，需要重新登录');
                return { valid: false, reason: 'login_required' };
            }

        } catch (error) {
            console.error('❌ 测试cookie有效性失败:', error);
            return { valid: false, reason: 'test_error' };
        }
    }

    // 自动登录获取新cookie
    async autoLogin(options = {}) {
        try {
            console.log('🚀 开始自动登录B站获取cookie...');
            
            this.browser = await chromium.launch({ 
                headless: false,  // 显示浏览器以便用户操作
                slowMo: 100 
            });
            
            const context = await this.browser.newContext();
            this.page = await context.newPage();

            // 访问B站登录页
            await this.page.goto('https://passport.bilibili.com/login');
            await this.page.waitForTimeout(2000);

            console.log('📱 请在浏览器中完成登录操作...');
            console.log('💡 支持以下登录方式:');
            console.log('   1. 扫码登录 (推荐)');
            console.log('   2. 账号密码登录');
            console.log('   3. 手机号登录');

            // 等待用户手动登录完成
            await this.waitForLogin();

            // 获取登录后的cookie
            const newCookies = await context.cookies();
            
            if (newCookies.length === 0) {
                throw new Error('登录后未获取到cookie');
            }

            // 验证关键cookie是否存在
            const sessdata = newCookies.find(c => c.name === 'SESSDATA');
            const biliJct = newCookies.find(c => c.name === 'bili_jct');

            if (!sessdata || !biliJct) {
                throw new Error('登录后缺少关键cookie');
            }

            console.log('✅ 获取到新的cookie');
            console.log(`📋 SESSDATA: ${sessdata.value.substring(0, 20)}...`);
            console.log(`📋 bili_jct: ${biliJct.value}`);

            // 保存cookie到文件
            await this.saveCookiesToFile(newCookies);

            await this.browser.close();
            this.browser = null;
            this.page = null;

            console.log('✅ Cookie已更新并保存到文件');
            return { success: true, cookies: newCookies };

        } catch (error) {
            console.error('❌ 自动登录失败:', error);
            
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
            }
            
            return { success: false, error: error.message };
        }
    }

    // 等待用户完成登录
    async waitForLogin(timeout = 300000) { // 5分钟超时
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                // 检查是否已跳转到主页或其他已登录页面
                const currentUrl = this.page.url();
                
                if (currentUrl.includes('bilibili.com') && 
                    !currentUrl.includes('passport.bilibili.com/login')) {
                    
                    console.log('✅ 检测到登录成功，页面已跳转');
                    return true;
                }

                // 检查是否存在用户头像等登录后的元素
                const userAvatar = await this.page.$('.header-avatar-wrap, .avatar-item, .user-con');
                if (userAvatar) {
                    console.log('✅ 检测到登录成功，找到用户头像');
                    return true;
                }

                // 检查localStorage中的登录状态
                const isLoggedIn = await this.page.evaluate(() => {
                    return localStorage.getItem('bfe_id') || 
                           localStorage.getItem('uuid') || 
                           document.cookie.includes('SESSDATA');
                });

                if (isLoggedIn) {
                    console.log('✅ 检测到登录成功，找到登录标识');
                    return true;
                }

                await this.page.waitForTimeout(1000);
                
            } catch (error) {
                // 继续等待
                await this.page.waitForTimeout(1000);
            }
        }

        throw new Error('登录超时，请重试');
    }

    // 加载cookie文件
    loadCookiesFromTxt(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                return [];
            }

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
            console.error('❌ 加载cookie文件失败:', error);
            return [];
        }
    }

    // 保存cookie到文件
    async saveCookiesToFile(cookies) {
        try {
            // 备份原有cookie文件
            if (fs.existsSync(this.cookiePath)) {
                const backupPath = `${this.cookiePath}.backup.${Date.now()}`;
                fs.copyFileSync(this.cookiePath, backupPath);
                console.log(`📋 原cookie文件已备份到: ${backupPath}`);
            }

            // 转换为Netscape格式
            const lines = [
                '# Netscape HTTP Cookie File',
                '# Generated by Bilibili Cookie Manager',
                `# ${new Date().toISOString()}`,
                ''
            ];

            cookies.forEach(cookie => {
                if (cookie.domain && cookie.name && cookie.value) {
                    const line = [
                        cookie.domain,
                        'TRUE',
                        cookie.path || '/',
                        'FALSE',
                        '0',
                        cookie.name,
                        cookie.value
                    ].join('\t');
                    lines.push(line);
                }
            });

            fs.writeFileSync(this.cookiePath, lines.join('\n'));
            console.log(`✅ Cookie已保存到: ${this.cookiePath}`);

        } catch (error) {
            console.error('❌ 保存cookie失败:', error);
            throw error;
        }
    }

    // 自动刷新cookie（如果需要）
    async autoRefreshIfNeeded() {
        try {
            console.log('🔍 检查cookie是否需要刷新...');
            
            const checkResult = await this.checkCookieExpiry();
            
            if (!checkResult.expired) {
                console.log('✅ Cookie仍然有效，无需刷新');
                return { refreshed: false, cookies: checkResult.cookies };
            }

            console.log('⚠️ Cookie已过期，开始自动刷新...');
            const loginResult = await this.autoLogin();
            
            if (loginResult.success) {
                console.log('✅ Cookie刷新成功');
                return { refreshed: true, cookies: loginResult.cookies };
            } else {
                console.log('❌ Cookie刷新失败');
                return { refreshed: false, error: loginResult.error };
            }

        } catch (error) {
            console.error('❌ 自动刷新cookie失败:', error);
            return { refreshed: false, error: error.message };
        }
    }

    // 获取有效的cookie（自动处理过期情况）
    async getValidCookies() {
        try {
            const refreshResult = await this.autoRefreshIfNeeded();
            
            if (refreshResult.cookies) {
                return { success: true, cookies: refreshResult.cookies };
            } else {
                return { success: false, error: refreshResult.error };
            }

        } catch (error) {
            console.error('❌ 获取有效cookie失败:', error);
            return { success: false, error: error.message };
        }
    }

    // 清理资源
    async cleanup() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
                console.log('✅ Cookie管理器资源已清理');
            }
        } catch (error) {
            console.error('❌ 清理cookie管理器资源失败:', error);
        }
    }
}

module.exports = { BilibiliCookieManager };