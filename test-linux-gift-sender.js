#!/usr/bin/env node

// 测试Linux版本的B站礼物发送功能
const { getSimpleGiftSender } = require('./bilibili-gift-sender-simple.js');

async function testLinuxGiftSender() {
    console.log('🧪 开始测试Linux版本B站礼物发送...');
    
    const sender = getSimpleGiftSender();
    
    try {
        const result = await sender.sendGift('31164', '3929738');
        console.log('🎯 测试结果:', result);
        
        if (result.success) {
            console.log('✅ Linux版本测试成功！');
        } else {
            console.log('❌ Linux版本测试失败:', result.error);
        }
        
    } catch (error) {
        console.error('❌ 测试过程中出错:', error);
    }
    
    process.exit(0);
}

// 模拟Linux环境
Object.defineProperty(process, 'platform', {
    value: 'linux'
});

testLinuxGiftSender();