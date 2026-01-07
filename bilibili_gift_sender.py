#!/usr/bin/env python3
"""
B站礼物发送服务 - Python版本
参考threeserver实现，用于minimal-games-site的礼物兑换功能
"""

from playwright.sync_api import sync_playwright
import time
import json
import logging
import sys
import os
from threading import Thread, Event
import uuid

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class BilibiliGiftSender:
    def __init__(self):
        self.browser = None
        self.page = None
        self.is_initialized = False
        self.cookie_path = 'C:/Users/user/Desktop/jiaobenbili/cookie.txt'
        self.current_room = None
        
    def load_cookies_from_txt(self, file_path):
        """从cookie.txt文件加载cookies"""
        cookies = []
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("#") or not line.strip():
                        continue
                    parts = line.strip().split("\t")
                    if len(parts) >= 7:
                        domain, _, path, _, _, name, value = parts[:7]
                        cookies.append({
                            "name": name,
                            "value": value,
                            "domain": domain,
                            "path": path
                        })
            return cookies
        except Exception as e:
            logger.error(f"❌ 加载cookie文件失败: {e}")
            return []

    def initialize(self):
        """初始化浏览器"""
        try:
            logger.info('🚀 初始化B站送礼浏览器...')
            
            p = sync_playwright().start()
            self.playwright = p
            
            # 使用与threeserver相同的配置
            self.browser = p.chromium.launch(headless=False, slow_mo=100)
            context = self.browser.new_context()
            self.page = context.new_page()
            
            # 加载cookies
            cookies = self.load_cookies_from_txt(self.cookie_path)
            if cookies:
                self.page.goto("https://www.bilibili.com/")
                self.page.context.add_cookies(cookies)
                logger.info('✅ Cookies加载成功')
            else:
                raise Exception('无法加载cookie文件')
                
            self.is_initialized = True
            logger.info('✅ B站送礼浏览器初始化完成')
            return True
            
        except Exception as e:
            logger.error(f'❌ 初始化浏览器失败: {e}')
            return False

    def enter_room(self, room_id):
        """进入指定直播间"""
        try:
            logger.info(f'🏠 进入B站直播间: {room_id}')
            
            if not self.is_initialized:
                if not self.initialize():
                    return False
            
            # 如果已经在正确房间，跳过
            if self.current_room == room_id:
                logger.info(f'✅ 已在房间 {room_id}')
                return True
                
            room_url = f"https://live.bilibili.com/{room_id}"
            self.page.goto(room_url)
            self.page.wait_for_load_state("domcontentloaded")
            
            logger.info('📦 等待礼物面板加载...')
            # 等待礼物面板加载
            for _ in range(20):
                if self.page.query_selector(".gift-panel"):
                    break
                time.sleep(0.5)
            
            # 尝试展开礼物面板
            try:
                arrow_selector = ".gift-panel-switch"
                result = self.page.evaluate(f'''
                    () => {{
                        const el = document.querySelector('{arrow_selector}');
                        if (!el) return false;
                        const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                        el.dispatchEvent(evt);
                        return true;
                    }}
                ''')
                if result:
                    time.sleep(1.5)
                    logger.info('✅ 礼物面板已展开')
            except Exception as e:
                logger.warning(f'⚠️ 箭头点击可能失败: {e}')
            
            self.current_room = room_id
            logger.info(f'✅ 成功进入房间 {room_id}')
            return True
            
        except Exception as e:
            logger.error(f'❌ 进入直播间 {room_id} 失败: {e}')
            return False

    def send_gift(self, gift_id, room_id):
        """发送礼物"""
        try:
            logger.info(f'🎁 开始发送礼物，ID: {gift_id}，房间: {room_id}')
            
            # 确保在正确的房间
            if not self.enter_room(room_id):
                return {
                    'success': False,
                    'error': '进入直播间失败'
                }
            
            # 使用JavaScript点击礼物（参考threeserver）
            result = self.page.evaluate(f'''
                () => {{
                    const selector = '.gift-id-{gift_id}';
                    const el = document.querySelector(selector);
                    if (el) {{
                        const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                        el.dispatchEvent(evt);
                        return {{success: true}};
                    }} else {{
                        return {{success: false, error: 'Gift element not found'}};
                    }}
                }}
            ''')
            
            if result.get('success'):
                # 等待可能的发送结果
                time.sleep(2)
                
                # 检查是否有错误提示
                error_detected = self.page.evaluate('''
                    () => {
                        const errorSelectors = [
                            '.error-tip', '.toast-error', '.gift-error', 
                            'text=余额不足', 'text=B币不足'
                        ];
                        
                        for (const selector of errorSelectors) {
                            try {
                                const elements = document.querySelectorAll(selector);
                                for (const element of elements) {
                                    if (element && element.offsetParent !== null) {
                                        const text = element.textContent || '';
                                        if (text.includes('余额') || text.includes('不足')) {
                                            return {error: true, message: text};
                                        }
                                    }
                                }
                            } catch (e) {}
                        }
                        return {error: false};
                    }
                ''')
                
                if error_detected.get('error'):
                    logger.warning(f'🚫 送礼失败: {error_detected.get("message")}')
                    return {
                        'success': False,
                        'error': error_detected.get('message'),
                        'gift_id': gift_id,
                        'room_id': room_id
                    }
                
                logger.info(f'✅ 礼物发送成功！ID: {gift_id}')
                return {
                    'success': True,
                    'gift_id': gift_id,
                    'room_id': room_id,
                    'message': '礼物发送成功'
                }
            else:
                logger.error(f'❌ 未找到礼物ID {gift_id} 对应的元素')
                return {
                    'success': False,
                    'error': f'未找到礼物ID {gift_id} 对应的元素',
                    'gift_id': gift_id,
                    'room_id': room_id
                }
                
        except Exception as e:
            logger.error(f'❌ 发送礼物失败: {e}')
            return {
                'success': False,
                'error': str(e),
                'gift_id': gift_id,
                'room_id': room_id
            }

    def cleanup(self):
        """清理资源"""
        try:
            if hasattr(self, 'browser') and self.browser:
                self.browser.close()
            if hasattr(self, 'playwright') and self.playwright:
                self.playwright.stop()
            self.is_initialized = False
            logger.info('✅ 浏览器资源已清理')
        except Exception as e:
            logger.error(f'❌ 清理浏览器资源失败: {e}')

# 单例模式
_gift_sender_instance = None

def get_gift_sender():
    """获取礼物发送器实例"""
    global _gift_sender_instance
    if _gift_sender_instance is None:
        _gift_sender_instance = BilibiliGiftSender()
    return _gift_sender_instance

# 测试函数
def test_gift_sender():
    """测试礼物发送功能"""
    sender = get_gift_sender()
    
    # 初始化
    if not sender.initialize():
        print("初始化失败")
        return False
    
    # 测试进入房间（使用一个测试房间号）
    test_room = "21449083"  # 可以换成实际的测试房间
    if sender.enter_room(test_room):
        print(f"成功进入房间 {test_room}")
        
        # 测试发送礼物（礼物ID可以根据实际情况修改）
        # gift_result = sender.send_gift("31164", test_room)  # 粉丝团灯牌
        # print(f"发送礼物结果: {gift_result}")
        print("测试完成，浏览器保持打开状态")
        return True
    else:
        print("进入房间失败")
        return False

if __name__ == "__main__":
    # 如果直接运行此脚本，执行测试
    if len(sys.argv) > 1 and sys.argv[1] == "test":
        try:
            test_gift_sender()
            input("按回车键退出...")
        except KeyboardInterrupt:
            pass
        finally:
            sender = get_gift_sender()
            sender.cleanup()
    else:
        print("B站礼物发送服务 - Python版本")
        print("使用方法：python bilibili-gift-sender.py test")