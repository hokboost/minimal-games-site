# 🌍 一键启用英文国际化

## 📦 已完成的工作

✅ **核心系统**
- i18n中间件已集成到`server.js`
- 语言切换路由已配置 (`/set-language/:lang`)
- 完整的中英文翻译配置文件 (`i18n.js`)
- 语言切换按钮组件 (`views/partials/language-switcher.ejs`)

✅ **已翻译页面**
- `login.ejs` - 登录页（示例）

⏳ **待翻译页面**
- register.ejs, index.ejs, gifts.ejs, profile.ejs
- quiz.ejs, slot.ejs, scratch.ejs, spin.ejs
- stone.ejs, flip.ejs, duel.ejs, wish.ejs
- admin.ejs, admin-user-records.ejs
- coming-soon.ejs

---

## 🚀 一键翻译所有页面

### 方法1: 自动批量处理（推荐）

```bash
cd /mnt/c/Users/user/minimal-games-site

# 批量处理所有EJS文件
node scripts/auto-translate-ejs.js --all
```

**这将自动：**
- ✅ 添加语言切换按钮到所有页面
- ✅ 替换常见中文文本为i18n变量
- ✅ 自动备份原文件（.backup后缀）
- ✅ 修改HTML lang属性

---

### 方法2: 单独处理特定文件

```bash
# 列出所有待处理文件
node scripts/auto-translate-ejs.js --list

# 处理单个文件
node scripts/auto-translate-ejs.js register.ejs
node scripts/auto-translate-ejs.js index.ejs
node scripts/auto-translate-ejs.js gifts.ejs
```

---

### 方法3: 手动修改（完全控制）

参考 `I18N_IMPLEMENTATION_GUIDE.md` 文档中的详细步骤。

---

## ✅ 测试翻译效果

### 1. 启动服务器

```bash
cd /mnt/c/Users/user/minimal-games-site
node server.js
```

### 2. 访问网站

打开浏览器访问：
- 本地：`http://localhost:3000`
- 生产：`https://www.wuguijiang.com`

### 3. 测试语言切换

1. 点击右上角的语言切换按钮（🌐 EN / 🌐 中文）
2. 查看所有文本是否正确翻译
3. 刷新页面，确认语言设置已保存（cookie）
4. 测试所有页面（登录、注册、游戏、礼物等）

---

## 📋 翻译覆盖范围

### 已包含的翻译类别

| 类别 | 中文键 | 英文键 | 数量 |
|------|--------|--------|------|
| 导航栏 | `t.nav.*` | Navigation | 8项 |
| 认证 | `t.auth.*` | Authentication | 11项 |
| 礼物兑换 | `t.gifts.*` | Gift Exchange | 13项 |
| 个人中心 | `t.profile.*` | Profile | 12项 |
| 游戏通用 | `t.game.*` | Game Common | 15项 |
| 答题游戏 | `t.quiz.*` | Quiz | 7项 |
| 老虎机 | `t.slot.*` | Slot | 6项 |
| 刮刮乐 | `t.scratch.*` | Scratch | 7项 |
| 转盘 | `t.spin.*` | Spin | 4项 |
| 宝石 | `t.stone.*` | Stone | 5项 |
| 翻牌 | `t.flip.*` | Flip | 7项 |
| 对决 | `t.duel.*` | Duel | 6项 |
| 祈愿 | `t.wish.*` | Wish | 7项 |
| 管理员 | `t.admin.*` | Admin | 13项 |
| 通用 | `t.common.*` | Common | 18项 |

**总计：约150+翻译条目**

---

## 🎯 自动翻译脚本的智能替换

脚本会自动识别并替换以下模式：

### 文本内容
- `>登录<` → `><%= t.auth.login %><`
- `>注册<` → `><%= t.auth.register %><`
- `>开始游戏<` → `><%= t.game.start %><`
- 等等...

### Input placeholder
- `placeholder="用户名"` → `placeholder="<%= t.auth.username %>"`
- `placeholder="密码"` → `placeholder="<%= t.auth.password %>"`

### HTML lang属性
- `<html lang="zh-CN">` → `<html lang="<%= lang === 'zh' ? 'zh-CN' : 'en' %>">`

### 语言切换按钮
自动在`<body>`标签后添加：
```ejs
<%- include('partials/language-switcher') %>
```

---

## 🔍 验证完成度

### 检查翻译是否完整

```bash
# 搜索未翻译的中文（示例）
grep -r "用户名\|密码\|登录\|注册" views/*.ejs --exclude="*.backup"

# 检查是否所有页面都有语言切换器
grep -L "language-switcher" views/*.ejs
```

---

## 🐛 常见问题排查

### Q: 运行脚本后页面报错？

**A:** 检查EJS语法错误：
```bash
# 查看服务器错误日志
node server.js
# 浏览器打开开发者工具（F12）查看控制台
```

### Q: 某些文本没有翻译？

**A:**
1. 检查 `i18n.js` 是否包含该文本的翻译
2. 手动添加翻译或使用条件判断：
```ejs
<%= lang === 'zh' ? '中文' : 'English' %>
```

### Q: 语言切换后没反应？

**A:**
1. 检查浏览器cookie是否启用
2. 查看Network标签，确认 `/set-language/en` 请求成功
3. 确认 `server.js` 已添加i18n中间件

### Q: 备份文件太多，如何清理？

**A:**
```bash
# 删除所有备份文件
cd /mnt/c/Users/user/minimal-games-site/views
rm -f *.backup
```

---

## 📝 手动微调建议

自动脚本会覆盖大部分常见文本，但以下内容建议手动优化：

### 1. 复杂消息
```ejs
<!-- 自动脚本无法处理的复杂文本 -->
<% if (lang === 'zh') { %>
    <p>您的账号余额不足，请先充值或玩游戏赚取电币</p>
<% } else { %>
    <p>Insufficient balance. Please top up or play games to earn coins</p>
<% } %>
```

### 2. 动态内容
```ejs
<!-- 包含变量的消息 -->
<%= lang === 'zh'
    ? `当前余额：${balance} 电币`
    : `Current Balance: ${balance} coins`
%>
```

### 3. 错误消息
建议在后端返回带语言标识的错误消息，或在前端根据语言显示。

---

## 🎨 语言切换按钮样式

默认样式为：
- 位置：右上角固定定位
- 颜色：绿色主题（#00c853）
- 响应式：移动端自适应

**自定义样式：**
编辑 `views/partials/language-switcher.ejs`

---

## 📞 完成后的检查清单

- [ ] 运行自动翻译脚本
- [ ] 启动服务器无报错
- [ ] 所有页面都有语言切换按钮
- [ ] 中文模式下所有文本显示正确
- [ ] 英文模式下所有文本显示正确
- [ ] 切换语言后设置被保存
- [ ] 所有游戏功能正常（不影响逻辑）
- [ ] 礼物兑换功能正常
- [ ] 管理后台功能正常
- [ ] 移动端显示正常

---

## 🚀 立即开始

```bash
# 1. 自动翻译所有页面
cd /mnt/c/Users/user/minimal-games-site
node scripts/auto-translate-ejs.js --all

# 2. 启动服务器测试
node server.js

# 3. 浏览器访问并测试语言切换
# http://localhost:3000
```

**预计完成时间：5分钟**

---

**需要帮助？** 查看 `I18N_IMPLEMENTATION_GUIDE.md` 获取详细文档。
