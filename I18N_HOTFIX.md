# 🔧 i18n Cookie解析热修复

## ❌ 问题
```
TypeError: Cannot read properties of undefined (reading 'lang')
at i18nMiddleware (/opt/render/project/src/i18n.js:569:30)
```

**原因**: `req.cookies` 是 undefined，因为项目中没有安装或使用 `cookie-parser` 中间件。

## ✅ 解决方案

已修改 `i18n.js` 中的 `i18nMiddleware` 函数，**手动解析cookie**，不再依赖 `cookie-parser`。

### 修改内容

**原代码** (会报错):
```javascript
const lang = req.cookies.lang || req.query.lang || 'zh';
```

**新代码** (已修复):
```javascript
// 手动解析cookie（兼容无cookie-parser的情况）
let cookieLang = 'zh';
if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
    }, {});
    cookieLang = cookies.lang || 'zh';
}

const lang = req.cookies?.lang || cookieLang || req.query.lang || 'zh';
```

### 优点
- ✅ 不需要额外安装 `cookie-parser`
- ✅ 向后兼容（如果将来安装了 cookie-parser，`req.cookies?.lang` 优先）
- ✅ 使用可选链 `?.` 避免 undefined 错误
- ✅ 手动解析逻辑简单高效

## 🚀 部署

修改已完成，直接部署即可：

```bash
git add i18n.js
git commit -m "Fix: i18n cookie parsing without cookie-parser dependency"
git push
```

Render会自动重新部署，错误将消失。

## ✅ 验证

部署后访问任意页面，应该：
- ✅ 不再报错
- ✅ 语言切换正常工作
- ✅ Cookie设置被正确读取

---

**修复时间**: 2026-01-14
**状态**: ✅ 已完成
