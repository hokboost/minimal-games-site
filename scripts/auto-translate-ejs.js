#!/usr/bin/env node
/**
 * EJS模板自动翻译脚本
 *
 * 用法：node scripts/auto-translate-ejs.js <文件名>
 * 示例：node scripts/auto-translate-ejs.js register.ejs
 *
 * 或批量处理：node scripts/auto-translate-ejs.js --all
 */

const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, '..', 'views');

// 翻译映射表
const replacements = [
    // HTML lang属性
    { pattern: /<html lang="zh-CN">/, replace: '<html lang="<%= lang === \'zh\' ? \'zh-CN\' : \'en\' %>">' },

    // 认证相关
    { pattern: />登录</g, replace: '><%= t.auth.login %><' },
    { pattern: />注册</g, replace: '><%= t.auth.register %><' },
    { pattern: /placeholder="用户名"/g, replace: 'placeholder="<%= t.auth.username %>"' },
    { pattern: /placeholder="密码"/g, replace: 'placeholder="<%= t.auth.password %>"' },
    { pattern: /placeholder="确认密码"/g, replace: 'placeholder="<%= t.auth.confirmPassword %>"' },

    // 导航
    { pattern: />首页</g, replace: '><%= t.nav.home %><' },
    { pattern: />游戏</g, replace: '><%= t.nav.games %><' },
    { pattern: />礼物兑换</g, replace: '><%= t.nav.gifts %><' },
    { pattern: />个人中心</g, replace: '><%= t.nav.profile %><' },
    { pattern: />管理后台</g, replace: '><%= t.nav.admin %><' },
    { pattern: />登出</g, replace: '><%= t.nav.logout %><' },

    // 游戏通用
    { pattern: />开始游戏</g, replace: '><%= t.game.start %><' },
    { pattern: />开始</g, replace: '><%= t.game.play %><' },
    { pattern: />提交</g, replace: '><%= t.game.submit %><' },
    { pattern: />确认</g, replace: '><%= t.game.confirm %><' },
    { pattern: />取消</g, replace: '><%= t.game.cancel %><' },
    { pattern: />重新开始</g, replace: '><%= t.game.restart %><' },
    { pattern: />余额</g, replace: '><%= t.game.balance %><' },
    { pattern: />得分</g, replace: '><%= t.game.score %><' },
    { pattern: />奖励</g, replace: '><%= t.game.reward %><' },
    { pattern: />花费</g, replace: '><%= t.game.cost %><' },

    // 礼物兑换
    { pattern: />礼物兑换中心</g, replace: '><%= t.gifts.title %><' },
    { pattern: />当前电币</g, replace: '><%= t.gifts.balance %><' },
    { pattern: />兑换</g, replace: '><%= t.gifts.exchange %><' },
    { pattern: />数量</g, replace: '><%= t.gifts.quantity %><' },

    // 通用
    { pattern: />操作成功</g, replace: '><%= t.common.success %><' },
    { pattern: />操作失败</g, replace: '><%= t.common.failed %><' },
    { pattern: />加载中\.\.\.</g, replace: '><%= t.common.loading %><' },
    { pattern: />保存</g, replace: '><%= t.common.save %><' },
    { pattern: />返回</g, replace: '><%= t.common.back %><' },
];

// 需要在<body>后添加语言切换器的检查
function needsLanguageSwitcher(content) {
    return !content.includes('language-switcher') && content.includes('<body>');
}

// 添加语言切换器
function addLanguageSwitcher(content) {
    return content.replace(
        /<body>/,
        '<body>\n    <%- include(\'partials/language-switcher\') %>\n'
    );
}

// 处理单个文件
function processFile(filename) {
    const filePath = path.join(viewsDir, filename);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ 文件不存在: ${filename}`);
        return false;
    }

    console.log(`\n📝 处理文件: ${filename}`);

    let content = fs.readFileSync(filePath, 'utf8');
    let changeCount = 0;

    // 备份原文件
    const backupPath = filePath + '.backup';
    fs.writeFileSync(backupPath, content);
    console.log(`   📦 已备份到: ${filename}.backup`);

    // 应用所有替换
    replacements.forEach(({ pattern, replace }) => {
        const before = content;
        content = content.replace(pattern, replace);
        if (before !== content) {
            changeCount++;
        }
    });

    // 添加语言切换器（如果需要）
    if (needsLanguageSwitcher(content)) {
        content = addLanguageSwitcher(content);
        changeCount++;
        console.log(`   ✅ 添加了语言切换器`);
    }

    // 写回文件
    fs.writeFileSync(filePath, content);

    if (changeCount > 0) {
        console.log(`   ✅ 完成！共替换 ${changeCount} 处`);
        return true;
    } else {
        console.log(`   ⏭️  没有需要替换的内容`);
        // 删除备份（没有改动）
        fs.unlinkSync(backupPath);
        return false;
    }
}

// 获取所有EJS文件
function getAllEjsFiles() {
    return fs.readdirSync(viewsDir)
        .filter(file => file.endsWith('.ejs'))
        .filter(file => file !== 'login.ejs'); // 跳过已翻译的
}

// 主函数
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args[0] === '--help') {
        console.log(`
🌍 EJS模板自动翻译脚本

用法：
  node scripts/auto-translate-ejs.js <文件名>          # 处理单个文件
  node scripts/auto-translate-ejs.js --all             # 处理所有文件
  node scripts/auto-translate-ejs.js --list            # 列出所有待处理文件

示例：
  node scripts/auto-translate-ejs.js register.ejs
  node scripts/auto-translate-ejs.js --all

注意：
  - 会自动备份原文件为 .backup
  - 已处理的文件：login.ejs（会被跳过）
        `);
        return;
    }

    if (args[0] === '--list') {
        const files = getAllEjsFiles();
        console.log('\n📋 待处理文件列表：\n');
        files.forEach(file => console.log(`   - ${file}`));
        console.log(`\n   共 ${files.length} 个文件\n`);
        return;
    }

    if (args[0] === '--all') {
        const files = getAllEjsFiles();
        console.log(`\n🚀 批量处理 ${files.length} 个文件...\n`);

        let successCount = 0;
        files.forEach(file => {
            if (processFile(file)) {
                successCount++;
            }
        });

        console.log(`\n✅ 完成！成功处理 ${successCount}/${files.length} 个文件\n`);
        return;
    }

    // 处理单个文件
    const filename = args[0];
    processFile(filename);
}

// 运行
main();
