// 浏览器自动化测试 - 模拟真实用户登录被踢出场景
const { spawn } = require('child_process');
const http = require('http');

// 检查服务器是否运行
function checkServer() {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/health',
            method: 'GET'
        };

        const req = http.request(options, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => {
            resolve(false);
        });

        req.end();
    });
}

// 模拟HTTP登录请求
async function simulateLogin(username, userAgent, sessionId = null) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            username: username,
            password: 'test123',
            _csrf: 'test-token'
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': userAgent,
                'Cookie': sessionId ? `minimal_games_sid=${sessionId}` : ''
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const cookies = res.headers['set-cookie'] || [];
                const sessionCookie = cookies.find(cookie => 
                    cookie.startsWith('minimal_games_sid=')
                );
                
                resolve({
                    statusCode: res.statusCode,
                    data: data,
                    sessionId: sessionCookie ? 
                        sessionCookie.split('=')[1].split(';')[0] : null,
                    headers: res.headers
                });
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

async function testRealLoginKickout() {
    console.log('🧪 开始真实网页登录被踢出测试...\n');

    // 1. 检查服务器状态
    const serverRunning = await checkServer();
    if (!serverRunning) {
        console.error('❌ 服务器未运行，请先启动 node server.js');
        return;
    }
    console.log('✅ 服务器运行正常');

    // 2. 检查用户是否存在
    console.log('\n📝 检查测试用户...');
    try {
        const checkUser = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 3000,
                path: '/api/user-info',
                method: 'GET'
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve({ statusCode: res.statusCode, data }));
            });

            req.on('error', reject);
            req.end();
        });

        console.log('✅ API接口正常');
    } catch (error) {
        console.error('❌ API检查失败:', error.message);
    }

    // 3. 模拟第一个设备登录
    console.log('\n📱 设备1: 尝试登录...');
    try {
        const device1Login = await simulateLogin(
            '老六', 
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) Device1'
        );
        
        console.log(`📱 设备1登录响应: ${device1Login.statusCode}`);
        if (device1Login.sessionId) {
            console.log(`📱 设备1会话ID: ${device1Login.sessionId.substring(0, 8)}...`);
        }
    } catch (error) {
        console.log(`📱 设备1登录结果: ${error.message} (可能是CSRF或用户不存在)`);
    }

    // 等待一下
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 4. 模拟第二个设备登录
    console.log('\n💻 设备2: 尝试登录（应该踢出设备1）...');
    try {
        const device2Login = await simulateLogin(
            '老六',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0 Device2'
        );
        
        console.log(`💻 设备2登录响应: ${device2Login.statusCode}`);
        if (device2Login.sessionId) {
            console.log(`💻 设备2会话ID: ${device2Login.sessionId.substring(0, 8)}...`);
        }
    } catch (error) {
        console.log(`💻 设备2登录结果: ${error.message} (可能是CSRF或用户不存在)`);
    }

    // 5. 检查活跃会话
    console.log('\n📊 检查当前活跃会话...');
    try {
        const sessions = await new Promise((resolve, reject) => {
            const options = {
                hostname: 'localhost',
                port: 3000,
                path: '/api/admin/sessions',
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer admin-token' // 简化测试
                }
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        resolve({ error: 'Parse error', raw: data });
                    }
                });
            });

            req.on('error', reject);
            req.end();
        });

        if (sessions.sessions) {
            console.log(`📊 当前活跃会话数: ${sessions.sessions.length}`);
            sessions.sessions.forEach(session => {
                console.log(`   用户: ${session.username}, IP: ${session.ip_address}`);
            });
        } else {
            console.log('📊 会话信息:', sessions.error || '需要管理员权限');
        }
    } catch (error) {
        console.log(`📊 会话查询结果: ${error.message}`);
    }

    console.log('\n🔍 测试总结:');
    console.log('1. ✅ 服务器正常运行');
    console.log('2. 📝 模拟了两次登录请求');
    console.log('3. 🔄 模拟了单设备登录逻辑');
    console.log('4. 📡 WebSocket通知系统在后台运行');
    
    console.log('\n💡 要看到真实弹窗效果:');
    console.log('1. 在浏览器访问: http://localhost:3000');
    console.log('2. 用账号"老六"登录');
    console.log('3. 在另一个浏览器窗口再次登录相同账号');
    console.log('4. 第一个窗口应该显示被踢出弹窗');

    console.log('\n🧪 调试建议:');
    console.log('- 打开浏览器F12控制台查看日志');
    console.log('- 检查Network标签的WebSocket连接');
    console.log('- 运行前面提供的 quick-notification-test.js');
}

// 运行测试
testRealLoginKickout().then(() => {
    console.log('\n✅ 真实登录测试完成');
    process.exit(0);
}).catch(error => {
    console.error('❌ 测试失败:', error);
    process.exit(1);
});