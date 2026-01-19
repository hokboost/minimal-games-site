# 🌍 国际化实现指南

已完成基础架构设置和部分页面翻译，以下是完整的实现说明。

## ✅ 已完成

### 1. 核心文件
- ✅ `i18n.js` - 完整的中英文翻译配置
- ✅ `views/partials/language-switcher.ejs` - 语言切换按钮组件
- ✅ `server.js` - i18n中间件已集成

### 2. 已翻译页面
- ✅ `login.ejs` - 登录页（完整双语）

## 📝 如何使用

### 在EJS模板中使用翻译

**方法1: 使用 `t` 对象（推荐）**
```ejs
<h1><%= t.nav.home %></h1>
<button><%= t.game.start %></button>
<p><%= t.gifts.balance %>: <%= balance %></p>
```

**方法2: 使用 `__()` 函数**
```ejs
<%= __('nav.home') %>
<%= __('game.start') %>
```

**方法3: 条件判断（用于复杂文本）**
```ejs
<%= lang === 'zh' ? '中文文本' : 'English Text' %>
```

### 必须添加的内容

**每个页面都需要：**

1. **语言切换按钮**（在`<body>`标签后）
```ejs
<%- include('partials/language-switcher') %>
```

2. **HTML lang属性**
```ejs
<html lang="<%= lang === 'zh' ? 'zh-CN' : 'en' %>">
```

## 🔧 快速修改其他页面的步骤

### 示例：修改 `register.ejs`

**原始代码：**
```ejs
<h1>注册 Minimal Games</h1>
<input type="text" name="username" placeholder="用户名" required />
<button type="submit">注册</button>
```

**修改后：**
```ejs
<html lang="<%= lang === 'zh' ? 'zh-CN' : 'en' %>">
...
<body>
    <%- include('partials/language-switcher') %>

    <h1><%= t.auth.register %> Minimal Games</h1>
    <input type="text" name="username" placeholder="<%= t.auth.username %>" required />
    <button type="submit"><%= t.auth.registerButton %></button>
</body>
```

## 📋 所有翻译键值对照表

### 导航栏 (nav)
| 键 | 中文 | English |
|---|---|---|
| `t.nav.home` | 首页 | Home |
| `t.nav.games` | 游戏 | Games |
| `t.nav.gifts` | 礼物兑换 | Gift Exchange |
| `t.nav.profile` | 个人中心 | Profile |
| `t.nav.admin` | 管理后台 | Admin |
| `t.nav.logout` | 登出 | Logout |
| `t.nav.login` | 登录 | Login |
| `t.nav.register` | 注册 | Register |

### 登录/注册 (auth)
| 键 | 中文 | English |
|---|---|---|
| `t.auth.login` | 登录 | Login |
| `t.auth.register` | 注册 | Register |
| `t.auth.username` | 用户名 | Username |
| `t.auth.password` | 密码 | Password |
| `t.auth.confirmPassword` | 确认密码 | Confirm Password |
| `t.auth.loginButton` | 登录 | Login |
| `t.auth.registerButton` | 注册 | Register |
| `t.auth.noAccount` | 没有账号？ | Don't have an account? |
| `t.auth.hasAccount` | 已有账号？ | Already have an account? |
| `t.auth.goRegister` | 去注册 | Register |
| `t.auth.goLogin` | 去登录 | Login |

### 游戏通用 (game)
| 键 | 中文 | English |
|---|---|---|
| `t.game.start` | 开始游戏 | Start Game |
| `t.game.play` | 开始 | Play |
| `t.game.submit` | 提交 | Submit |
| `t.game.balance` | 余额 | Balance |
| `t.game.score` | 得分 | Score |
| `t.game.reward` | 奖励 | Reward |
| `t.game.cost` | 花费 | Cost |
| `t.game.confirm` | 确认 | Confirm |
| `t.game.cancel` | 取消 | Cancel |

### 礼物兑换 (gifts)
| 键 | 中文 | English |
|---|---|---|
| `t.gifts.title` | 礼物兑换中心 | Gift Exchange Center |
| `t.gifts.balance` | 当前电币 | Current Balance |
| `t.gifts.exchange` | 兑换 | Exchange |
| `t.gifts.cost` | 消耗 | Cost |
| `t.gifts.quantity` | 数量 | Quantity |
| `t.gifts.confirm` | 确认兑换 | Confirm Exchange |
| `t.gifts.success` | 兑换成功 | Exchange Successful |
| `t.gifts.failed` | 兑换失败 | Exchange Failed |

### 通用 (common)
| 键 | 中文 | English |
|---|---|---|
| `t.common.success` | 操作成功 | Success |
| `t.common.failed` | 操作失败 | Failed |
| `t.common.loading` | 加载中... | Loading... |
| `t.common.confirm` | 确认 | Confirm |
| `t.common.cancel` | 取消 | Cancel |
| `t.common.save` | 保存 | Save |
| `t.common.back` | 返回 | Back |

## 🎯 待修改页面清单

### 优先级 1 (重要页面)
- [x] login.ejs
- [ ] register.ejs
- [ ] index.ejs (首页)
- [ ] gifts.ejs (礼物兑换)
- [ ] profile.ejs (个人中心)

### 优先级 2 (游戏页面)
- [ ] quiz.ejs
- [ ] slot.ejs
- [ ] scratch.ejs
- [ ] spin.ejs
- [ ] stone.ejs
- [ ] flip.ejs
- [ ] duel.ejs
- [ ] wish.ejs

### 优先级 3 (管理页面)
- [ ] admin.ejs
- [ ] admin-user-records.ejs

## 🚀 批量修改技巧

### 1. 使用查找替换

**VS Code 快捷键：** `Ctrl + Shift + H` (全局查找替换)

**常见替换模式：**

| 查找（正则） | 替换为 |
|---|---|
| `placeholder="用户名"` | `placeholder="<%= t.auth.username %>"` |
| `>登录<` | `><%= t.auth.login %><` |
| `>注册<` | `><%= t.auth.register %><` |
| `>开始游戏<` | `><%= t.game.start %><` |

### 2. 常见模式

**按钮文本：**
```ejs
<!-- 原始 -->
<button>开始游戏</button>

<!-- 修改后 -->
<button><%= t.game.start %></button>
```

**输入框placeholder：**
```ejs
<!-- 原始 -->
<input type="text" placeholder="用户名">

<!-- 修改后 -->
<input type="text" placeholder="<%= t.auth.username %>">
```

**页面标题：**
```ejs
<!-- 原始 -->
<h1>礼物兑换中心</h1>

<!-- 修改后 -->
<h1><%= t.gifts.title %></h1>
```

## 🔍 测试

### 测试语言切换

1. 启动服务器：`node server.js`
2. 访问：`http://localhost:3000`
3. 点击右上角语言切换按钮
4. 验证所有文本都正确翻译

### 测试checklist

- [ ] 语言切换按钮显示正确
- [ ] 中文显示完整
- [ ] 英文显示完整
- [ ] 切换后保持语言设置（cookie）
- [ ] 所有页面都有语言切换按钮
- [ ] placeholder正确翻译
- [ ] 错误/成功消息正确翻译

## 📦 需要安装的依赖

无需额外安装，所有依赖已包含在项目中。

## ⚙️ 配置说明

### 修改翻译

编辑 `i18n.js` 文件：

```javascript
// 添加新翻译
translations.zh.newSection = {
    title: '新章节',
    subtitle: '副标题'
};

translations.en.newSection = {
    title: 'New Section',
    subtitle: 'Subtitle'
};
```

### 添加新语言

在 `i18n.js` 中添加新语言：

```javascript
const translations = {
    zh: { ... },
    en: { ... },
    es: { ... }  // 西班牙语
};
```

## 🐛 常见问题

### Q: 为什么某些页面没有翻译？
A: 需要手动修改每个EJS文件，参考本文档的修改步骤。

### Q: 如何添加新的翻译文本？
A: 在 `i18n.js` 的 `translations` 对象中同时添加中文和英文。

### Q: 语言切换后为什么没保存？
A: 检查浏览器是否启用cookie。语言设置存储在cookie中，有效期7天。

### Q: 如何设置默认语言？
A: 修改 `i18n.js` 中的 `i18nMiddleware` 函数，将 `'zh'` 改为其他语言代码。

## 📞 技术支持

如遇问题，请检查：
1. `i18n.js` 是否正确导入
2. `server.js` 是否添加了中间件
3. EJS模板是否包含语言切换按钮
4. 浏览器控制台是否有错误

---

**当前进度**: 基础架构 ✅ | 登录页 ✅ | 其他页面待完成 ⏳
