# 新增安全测试脚本说明

## 概述

基于代码审计发现的潜在漏洞，新增3个针对性的安全测试脚本：

## 1. HMAC签名绕过测试 (`security_test_hmac_bypass.js`)

### 测试目标
验证礼物任务完成接口 `/api/gift-tasks/:id/complete` 的HMAC签名保护是否可被绕过

### 测试场景
- ❌ **不传签名** - 只传API Key，不传timestamp/nonce/signature
- ❌ **错误签名** - 传入伪造的签名
- ❌ **过期签名** - 使用10分钟前的timestamp
- ✅ **正确签名** - 验证正常流程（应该通过认证但因任务不存在返回404）
- ❌ **重放攻击** - 使用相同nonce重复请求

### 运行方法
```bash
# 需要配置API密钥和HMAC密钥
export TARGET_URL="https://www.wuguijiang.com"
export WINDOWS_API_KEY="your-api-key"
export GIFT_TASKS_HMAC_SECRET="your-hmac-secret"

node scripts/security_test_hmac_bypass.js
```

### 预期结果
- 所有非法请求应返回 `401 Unauthorized`
- 重放攻击应被nonce缓存检测并拒绝
- 正确签名应通过认证（但因任务不存在返回404）

### 发现的漏洞
位置：`routes/gifts.js:542-549`

当前代码逻辑：
```javascript
if (!verification.valid) {
    const enforce = process.env.GIFT_TASKS_HMAC_ENFORCE === 'true';
    // 仅当明确启用强制并且传入了签名却校验失败时才阻断
    if (enforce && timestamp && signature) {
        return res.status(401).json({ ... });
    }
}
// ← 如果不传timestamp/signature，即使enforce=true也会放行
```

**问题**：攻击者可以完全不传签名来绕过验证（如果只传了API Key）

---

## 2. 时序攻击测试 (`security_test_session_timing.js`)

### 测试目标
检测CSRF token比较是否存在时序攻击漏洞

### 测试原理
通过多次请求测量正确token vs 错误token的响应时间差异：
- 如果使用 `!==` 比较，错误token可能更快被拒绝（字符串比较提前终止）
- 如果使用 `crypto.timingSafeEqual()`，时间应该是常量（无论token正确与否）

### 运行方法
```bash
export TARGET_URL="https://www.wuguijiang.com"
export AUTH_USER="your-username"
export AUTH_PASS="your-password"
export ITERATIONS=50  # 可选，默认50次

node scripts/security_test_session_timing.js
```

### 预期结果
- 正确token和错误token的平均响应时间差应 < 2个标准差
- 如果检测到明显的时序差异，说明存在时序攻击风险

### 发现的漏洞
位置：多处，包括：
- `server.js:358` - CSRF验证
- `server.js:828` - 登录CSRF验证
- `middleware/security.js:358` - CSRF保护

当前使用 `!==` 进行字符串比较，理论上存在时序攻击风险。

**建议修复**：
```javascript
const crypto = require('crypto');

function constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(
        Buffer.from(a, 'utf8'),
        Buffer.from(b, 'utf8')
    );
}

// 使用：
if (!constantTimeCompare(token, sessionToken)) {
    return res.status(403).json({ ... });
}
```

---

## 3. 弱默认配置测试 (`security_test_weak_defaults.js`)

### 测试目标
检测系统是否存在危险的默认配置

### 测试项
1. **CSRF保护绕过** - 检查 `CSRF_TEST_MODE` 是否意外启用
2. **Session Cookie配置** - 检查 HttpOnly/Secure/SameSite 标志
3. **安全响应头** - X-Frame-Options, HSTS, CSP等
4. **错误信息泄露** - 检查是否泄露堆栈跟踪、数据库信息
5. **限流有效性** - 验证rate limiting是否正常工作
6. **默认凭据** - 测试常见的默认用户名/密码组合

### 运行方法
```bash
export TARGET_URL="https://www.wuguijiang.com"
export AUTH_USER="your-username"
export AUTH_PASS="your-password"

node scripts/security_test_weak_defaults.js
```

### 预期结果
- CSRF保护应该在生产环境启用（返回403）
- Cookie应该有完整的安全标志
- 错误响应不应泄露内部细节
- 限流应该正常工作
- 不应存在默认凭据

### 发现的配置问题

#### 1. CSRF可被完全禁用
位置：`middleware/security.js:344-347`
```javascript
if (process.env.CSRF_TEST_MODE === 'true') {
    return next();  // 完全绕过CSRF保护
}
```

#### 2. 管理员密码重置默认弱密码
位置：`routes/admin.js:437`
```javascript
const { username, newPassword = '123456' } = req.body;
```

---

## 运行所有新测试

创建一个批处理脚本来运行所有新测试：

```bash
#!/bin/bash
# run_new_security_tests.sh

export TARGET_URL="https://www.wuguijiang.com"
export AUTH_USER="your-username"
export AUTH_PASS="your-password"
export WINDOWS_API_KEY="your-api-key"
export GIFT_TASKS_HMAC_SECRET="your-hmac-secret"

echo "=== 1. HMAC签名绕过测试 ==="
node scripts/security_test_hmac_bypass.js

echo -e "\n=== 2. 时序攻击测试 ==="
node scripts/security_test_session_timing.js

echo -e "\n=== 3. 弱默认配置测试 ==="
node scripts/security_test_weak_defaults.js

echo -e "\n✅ 所有新增测试完成"
```

---

## 严重性评级

| 脚本 | 发现漏洞 | 严重性 | 状态 |
|------|---------|--------|------|
| `security_test_hmac_bypass.js` | HMAC签名绕过 | 🟡 P2 | 需修复 |
| `security_test_session_timing.js` | 时序攻击风险 | 🟡 P2 | 建议修复 |
| `security_test_weak_defaults.js` | 弱配置/CSRF绕过 | 🟠 P1 | 需修复 |

---

## 修复建议优先级

### 立即修复（上线前必须）
1. ✅ 修复HMAC验证绕过 - 强制要求签名
2. ✅ 确保生产环境 `CSRF_TEST_MODE=false`
3. ✅ 移除管理员密码重置的弱默认值

### 建议修复（提高安全性）
4. 🔧 使用常量时间比较验证token
5. 🔧 增强错误信息过滤，避免泄露内部细节

---

## 与现有测试的关系

现有测试主要关注：
- 业务逻辑篡改（价格、数量等）
- 并发竞态条件
- SQL注入payload
- 未授权访问

新增测试关注：
- 加密学安全（HMAC、时序攻击）
- 配置安全（默认值、环境变量）
- 协议级漏洞（CSRF绕过）

两者互补，共同构建完整的安全防护体系。

---

## 联系

如发现新的安全问题，请通过安全渠道报告。
