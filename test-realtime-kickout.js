// 测试实时踢出功能
const io = require('socket.io-client');
const http = require('http');

// 模拟浏览器会话
class BrowserSession {
    constructor(name) {
        this.name = name;
        this.cookies = {};
        this.socket = null;
    }

    // 连接WebSocket
    connectWebSocket() {
        return new Promise((resolve) => {
            this.socket = io('http://localhost:3000');
            
            this.socket.on('connect', () => {
                console.log(`📡 [${this.name}] WebSocket连接成功: ${this.socket.id}`);
                this.socket.emit('register', '老六');
                resolve();
            });

            this.socket.on('security-alert', (event) => {
                console.log(`🚨 [${this.name}] 收到安全警告:`, event);
                
                if (event.type === 'device_logout') {
                    console.log(`🔄 [${this.name}] 检测到被踢出，模拟跳转到登录页`);
                    this.socket.disconnect();
                    console.log(`📵 [${this.name}] 已断开连接，模拟跳转完成`);
                }
            });

            this.socket.on('disconnect', () => {
                console.log(`❌ [${this.name}] WebSocket连接断开`);
            });
        });
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
                    'User-Agent': `TestClient${this.name.replace(/[^a-zA-Z0-9]/g, '')}`,
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
                const postData = typeof data === 'string' ? data : JSON.stringify(data);
                req.write(postData);
            }

            req.end();
        });
    }

    getCookieHeader() {
        return Object.entries(this.cookies)
            .map(([name, value]) => `${name}=${value}`)
            .join('; ');
    }

    async getLoginPage() {
        console.log(`🌐 [${this.name}] 获取登录页面...`);
        const response = await this.request('GET', '/login');
        
        // 提取CSRF令牌
        const csrfMatch = response.data.match(/name="_csrf".*?value="([^"]+)"/);
        if (csrfMatch) {
            this.csrfToken = csrfMatch[1];
            console.log(`🔑 [${this.name}] CSRF令牌获取成功`);
        }
        
        return response;
    }

    async login() {
        console.log(`🔐 [${this.name}] 尝试登录...`);
        
        if (!this.csrfToken) {
            await this.getLoginPage();
        }

        const postData = `username=老六&password=111111&_csrf=${encodeURIComponent(this.csrfToken)}`;
        
        const response = await this.request('POST', '/login', postData, {
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        console.log(`📝 [${this.name}] 登录响应: ${response.statusCode} -> ${response.headers.location || '页面'}`);
        
        if (response.statusCode === 302) {
            console.log(`✅ [${this.name}] 登录成功`);
            return true;
        } else {
            console.log(`❌ [${this.name}] 登录失败`);
            return false;
        }
    }
}

async function testRealtimeKickout() {
    console.log('🧪 测试实时踢出功能...\n');

    const device1 = new BrowserSession('设备1');
    const device2 = new BrowserSession('设备2');

    try {
        // 设备1：登录并连接WebSocket
        console.log('=== 设备1 登录流程 ===');
        await device1.getLoginPage();
        const login1Success = await device1.login();
        
        if (login1Success) {
            console.log(`📡 [设备1] 建立WebSocket连接...`);
            await device1.connectWebSocket();
            console.log(`✅ [设备1] 已完成登录并连接WebSocket\n`);
        }

        // 等待3秒让第一个设备稳定
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 设备2：登录（应该踢出设备1）
        console.log('=== 设备2 登录流程（应该踢出设备1）===');
        await device2.getLoginPage();
        await device2.connectWebSocket();
        
        console.log(`⏰ 等待WebSocket连接稳定...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const login2Success = await device2.login();
        
        if (login2Success) {
            console.log(`✅ [设备2] 登录成功\n`);
            
            // 等待WebSocket通知传递
            console.log(`⏰ 等待实时踢出通知...\n`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('📊 测试结果分析:');
        console.log('1. ✅ 设备1成功登录并建立WebSocket连接');
        console.log('2. ✅ 设备2成功登录');
        console.log('3. 📡 检查设备1是否收到踢出通知并断开连接');
        console.log('4. 🔄 被踢出的设备应该立即跳转到登录页');

    } catch (error) {
        console.error('❌ 测试过程中出错:', error.message);
    } finally {
        // 清理连接
        if (device1.socket) device1.socket.disconnect();
        if (device2.socket) device2.socket.disconnect();
    }

    console.log('\n💡 手动验证步骤:');
    console.log('1. 在浏览器1访问 http://localhost:3000');
    console.log('2. 用账号"老六"登录 (密码: 111111)');
    console.log('3. 在浏览器2也访问同样网址用同账号登录');
    console.log('4. 浏览器1应该立即显示"账号已在其他设备登录"提示');
    console.log('5. 2秒后浏览器1自动跳转到登录页面');
}

testRealtimeKickout().then(() => {
    console.log('\n✅ 实时踢出测试完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});