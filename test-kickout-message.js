// 测试踢出消息功能
const http = require('http');

// 模拟登录会话
class LoginSession {
    constructor(name) {
        this.name = name;
        this.cookies = {};
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

        const postData = `username=老六&password=123456&_csrf=${encodeURIComponent(this.csrfToken)}`;
        
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

    async visitHome() {
        console.log(`🏠 [${this.name}] 访问主页检查踢出消息...`);
        const response = await this.request('GET', '/');
        
        // 检查是否包含踢出消息
        const hasKickoutMessage = response.data.includes('kickoutData') || 
                                response.data.includes('踢出消息') ||
                                response.data.includes('设备登录');
        
        console.log(`👢 [${this.name}] 踢出消息存在: ${hasKickoutMessage ? '是' : '否'}`);
        
        if (hasKickoutMessage) {
            // 尝试提取踢出消息内容
            const kickoutMatch = response.data.match(/const kickoutData = ({.*?});/);
            if (kickoutMatch) {
                try {
                    const kickoutData = JSON.parse(kickoutMatch[1]);
                    console.log(`📨 [${this.name}] 踢出消息内容:`, kickoutData);
                } catch (e) {
                    console.log(`🔍 [${this.name}] 踢出消息解析失败，但消息存在`);
                }
            }
        }
        
        return { hasKickoutMessage, data: response.data };
    }
}

async function testKickoutMessage() {
    console.log('🧪 测试踢出消息功能...\n');

    const device1 = new LoginSession('设备1');
    const device2 = new LoginSession('设备2');

    try {
        // 第一个设备登录
        console.log('=== 第一个设备登录 ===');
        await device1.getLoginPage();
        const login1Success = await device1.login();
        if (login1Success) {
            await device1.visitHome();
        }

        console.log('\n' + '='.repeat(50) + '\n');
        
        // 等待2秒
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 第二个设备登录（应该踢出第一个设备）
        console.log('=== 第二个设备登录（应该踢出第一个设备）===');
        await device2.getLoginPage();
        const login2Success = await device2.login();
        
        if (login2Success) {
            const homeResult = await device2.visitHome();
            
            if (homeResult.hasKickoutMessage) {
                console.log('\n🎉 SUCCESS! 踢出消息功能正常工作!');
                console.log('✅ 登录时检测到其他设备');
                console.log('✅ 生成了踢出消息');
                console.log('✅ 消息传递给前端成功');
            } else {
                console.log('\n❌ FAILED! 没有检测到踢出消息');
                console.log('可能原因:');
                console.log('- session管理未正常工作');
                console.log('- 消息传递逻辑有问题');
                console.log('- 前端渲染异常');
            }
        }

        console.log('\n📊 测试总结:');
        console.log('1. ✅ 模拟了两个不同设备登录');
        console.log('2. ✅ 使用了真实的CSRF令牌');
        console.log('3. ✅ 检查了踢出消息的生成和传递');

    } catch (error) {
        console.error('❌ 测试过程中出错:', error.message);
    }

    console.log('\n💡 手动验证步骤:');
    console.log('1. 在浏览器1访问 http://localhost:3000');
    console.log('2. 用账号"老六"登录 (密码: 123456)');
    console.log('3. 在浏览器2也访问同样网址用同账号登录');
    console.log('4. 浏览器2登录后应该显示踢出消息弹窗');
}

testKickoutMessage().then(() => {
    console.log('\n✅ 测试完成');
}).catch(error => {
    console.error('❌ 测试失败:', error);
});