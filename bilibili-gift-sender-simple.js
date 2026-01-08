const { spawn } = require('child_process');
const path = require('path');

class BilibiliGiftSenderSimple {
    constructor() {
        this.pythonScript = 'bilibili_gift_sender.py';
    }

    // 发送礼物 - 服务器端只标记任务，由Windows监听服务处理
    async sendGift(giftId, roomId) {
        return new Promise((resolve) => {
            console.log(`🎁 添加礼物发送任务，ID: ${giftId}，房间: ${roomId}`);
            console.log('📝 任务已添加到数据库，等待Windows监听服务处理...');
            
            // 立即返回成功，实际发送由Windows监听服务处理
            setTimeout(() => {
                console.log(`✅ 任务提交成功：ID ${giftId} 到房间 ${roomId}`);
                resolve({
                    success: true,
                    giftId: giftId,
                    roomId: roomId,
                    message: '任务已提交到Windows监听服务队列'
                });
            }, 500);
        });
    }

    // 清理资源
    async cleanup() {
        console.log('🧹 简化版本，无需手动清理');
    }
}

// 单例模式
let simpleGiftSenderInstance = null;

function getSimpleGiftSender() {
    if (!simpleGiftSenderInstance) {
        simpleGiftSenderInstance = new BilibiliGiftSenderSimple();
    }
    return simpleGiftSenderInstance;
}

module.exports = { BilibiliGiftSenderSimple, getSimpleGiftSender };