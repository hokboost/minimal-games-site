// 模拟真实浏览器场景测试踢出功能
const io = require('socket.io-client');
const http = require('http');

// 模拟完整的浏览器会话
class RealBrowserSession {
    constructor(name, scenarios = ['visitHome', 'login']) {
        this.name = name;
        this.scenarios = scenarios;
        this.cookies = {};
        this.socket = null;
        this.isKickedOut = false;
    }

    async request(method, path, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 3000,
                path: path,
                method: method,
                headers: {
                    'Cookie': this.getCookieHeader(),
                    'User-Agent': `Browser${this.name.replace(/[^a-zA-Z0-9]/g, '')}`,
                    ...headers
                }
            };

            if (data && method !== 'GET') {
                const postData = typeof data === 'string' ? data : JSON.stringify(data);
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = http.request(options, (res) => {
                let responseData = '';
                res.on('data', (chunk) => responseData += chunk);
                res.on('end', () => {
                    // 更新cookies
                    if (res.headers['set-cookie']) {
                        res.headers['set-cookie'].forEach(cookie => {
                            const [nameValue] = cookie.split(';');
                            const [name, value] = nameValue.split('=');
                            this.cookies[name] = value;
                        });
                    }
                    resolve({
                        statusCode: res.statusCode,
                        data: responseData,
                        headers: res.headers
                    });
                });
            });

            req.on('error', reject);
            if (data && method !== 'GET') {
                req.write(data);
            }
            req.end();
        });
    }

    getCookieHeader() {
        return Object.entries(this.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    async connectWebSocket() {
        return new Promise((resolve) => {
            this.socket = io('http://localhost:3000');
            
            this.socket.on('connect', () => {
                console.log(`📡 [${this.name}] WebSocket连接成功`);
                this.socket.emit('register', '222222');
                resolve();
            });

            this.socket.on('security-alert', (event) => {
                if (event.type === 'device_logout') {
                    console.log(`🔄 [${this.name}] 收到踢出通知，模拟页面跳转`);
                    this.isKickedOut = true;
                    this.socket.disconnect();
                }
            });
        });
    }

    async visitHomePage() {
        console.log(`🏠 [${this.name}] 访问主页...`);
        const response = await this.request('GET', '/');
        
        if (response.statusCode === 200) {
            console.log(`✅ [${this.name}] 主页加载成功`);
            
            // 模拟页面的WebSocket连接
            if (response.data.includes('socket.io.js')) {
                console.log(`📡 [${this.name}] 主页包含WebSocket代码，建立连接...`);
                await this.connectWebSocket();
            }
        }
        
        return response;
    }

    async visitLoginPage() {
        console.log(`🔐 [${this.name}] 访问登录页...`);
        const response = await this.request('GET', '/login');
        
        // 提取CSRF令牌
        const csrfMatch = response.data.match(/name="_csrf".*?value="([^"]+)"/);
        if (csrfMatch) {
            this.csrfToken = csrfMatch[1];
            console.log(`🔑 [${this.name}] 获取CSRF令牌成功`);
        }
        
        // 如果已登录用户访问登录页，也会有WebSocket
        if (response.data.includes('socket.io.js') && response.data.includes('register')) {
            console.log(`📡 [${this.name}] 登录页检测到WebSocket代码`);
            await this.connectWebSocket();
        }
        
        return response;
    }

    async login() {
        if (!this.csrfToken) {
            await this.visitLoginPage();
        }

        console.log(`🔐 [${this.name}] 尝试登录用户222222...`);
        const postData = `username=222222&password=222222&_csrf=${encodeURIComponent(this.csrfToken)}`;
        
        const response = await this.request('POST', '/login', postData, {
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        if (response.statusCode === 302) {
            console.log(`✅ [${this.name}] 登录成功，重定向到: ${response.headers.location}`);
            return true;
        } else {
            console.log(`❌ [${this.name}] 登录失败: ${response.statusCode}`);
            return false;
        }
    }

    async simulateRealBehavior() {
        console.log(`\n=== ${this.name} 开始模拟真实浏览器行为 ===`);
        
        try {
            // 场景1: 直接访问主页
            if (this.scenarios.includes('visitHome')) {
                await this.visitHomePage();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // 场景2: 访问登录页并登录
            if (this.scenarios.includes('login')) {
                await this.visitLoginPage();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const loginSuccess = await this.login();
                if (loginSuccess) {
                    // 登录后访问主页
                    await new Promise(resolve => setTimeout(resolve, 500));
                    await this.visitHomePage();
                }
            }
            
            console.log(`✅ [${this.name}] 模拟行为完成`);
            
        } catch (error) {
            console.error(`❌ [${this.name}] 模拟过程出错:`, error.message);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

async function testBrowserScenario() {
    console.log('🧪 开始模拟真实浏览器踢出场景...\n');

    // 创建两个浏览器会话
    const browser1 = new RealBrowserSession('浏览器1', ['visitHome', 'login']);
    const browser2 = new RealBrowserSession('浏览器2', ['login']);

    try {
        // 浏览器1：完整的用户行为流程
        await browser1.simulateRealBehavior();
        
        // 等待一下让连接稳定
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('\n⏰ 等待2秒，然后浏览器2登录...\n');
        
        // 浏览器2：直接登录（应该踢出浏览器1）
        await browser2.simulateRealBehavior();
        
        // 等待WebSocket通知传递
        console.log('\n⏰ 等待踢出通知传递...\n');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // 检查结果
        console.log('📊 测试结果分析:');
        console.log(`🌐 浏览器1状态: ${browser1.isKickedOut ? '已被踢出✅' : '未被踢出❌'}`);
        console.log(`🌐 浏览器2状态: ${browser2.isKickedOut ? '被踢出❌' : '正常登录✅'}`);
        
        if (browser1.isKickedOut && !browser2.isKickedOut) {
            console.log('\n🎉 SUCCESS! 踢出功能正常工作');
            console.log('✅ 浏览器1被成功踢出');
            console.log('✅ 浏览器2正常保持登录');
        } else {
            console.log('\n❌ FAILED! 踢出功能未按预期工作');
            console.log('可能原因:');
            console.log('- WebSocket连接未正确建立');
            console.log('- 通知发送失败');
            console.log('- 前端处理逻辑有误');
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出现错误:', error.message);
    } finally {
        // 清理连接
        browser1.disconnect();
        browser2.disconnect();
    }
}

testBrowserScenario().then(() => {
    console.log('\n✅ 浏览器场景测试完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});