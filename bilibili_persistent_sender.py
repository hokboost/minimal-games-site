#!/usr/bin/env python3
"""
持久运行的B站礼物发送服务
浏览器保持打开状态，通过HTTP API接收发送礼物的请求
"""

from playwright.sync_api import sync_playwright
import time
import json
import logging
import sys
import os
from flask import Flask, request, jsonify
from threading import Thread

# 日志配置
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 全局变量
app = Flask(__name__)
browser = None
page = None
playwright_instance = None
is_initialized = False

def initialize_browser():
    """初始化浏览器并保持打开"""
    global browser, page, playwright_instance, is_initialized
    
    try:
        logger.info('🚀 启动持久B站礼物发送服务...')
        
        playwright_instance = sync_playwright().start()
        browser = playwright_instance.chromium.launch(headless=False, slow_mo=100)
        context = browser.new_context()
        page = context.new_page()
        
        # 加载cookies
        cookie_path = 'C:/Users/user/Desktop/jiaobenbili/cookie.txt'
        cookies = load_cookies_from_txt(cookie_path)
        
        if cookies:
            page.goto("https://www.bilibili.com/")
            page.context.add_cookies(cookies)
            logger.info('✅ Cookies加载成功')
        else:
            raise Exception('无法加载cookie文件')
        
        is_initialized = True
        logger.info('✅ B站礼物发送浏览器启动完成')
        logger.info('🌐 浏览器保持打开，等待礼物发送请求...')
        
        return True
        
    except Exception as e:
        logger.error(f'❌ 初始化失败: {e}')
        return False

def load_cookies_from_txt(file_path):
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

def enter_room(room_id):
    """进入指定直播间"""
    global page
    
    try:
        logger.info(f'🏠 进入B站直播间: {room_id}')
        
        room_url = f"https://live.bilibili.com/{room_id}"
        page.goto(room_url)
        page.wait_for_load_state("domcontentloaded")
        
        logger.info('📦 等待礼物面板加载...')
        # 等待礼物面板加载
        for _ in range(20):
            if page.query_selector(".gift-panel"):
                break
            time.sleep(0.5)
        
        # 等待10秒让页面完全加载
        logger.info('⏰ 等待10秒让页面完全加载...')
        time.sleep(10)
        
        # 尝试展开礼物面板
        try:
            arrow_selector = ".gift-panel-switch"
            result = page.evaluate(f'''
                () => {{
                    const el = document.querySelector('{arrow_selector}');
                    if (!el) return false;
                    const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                    el.dispatchEvent(evt);
                    return true;
                }}
            ''')
            if result:
                time.sleep(2)
                logger.info('✅ 礼物面板已展开')
        except Exception as e:
            logger.warning(f'⚠️ 箭头点击可能失败: {e}')
        
        logger.info(f'✅ 成功进入房间 {room_id}，浏览器保持打开状态')
        return True
        
    except Exception as e:
        logger.error(f'❌ 进入直播间 {room_id} 失败: {e}')
        return False

@app.route('/send_gift', methods=['POST'])
def send_gift_api():
    """发送礼物API"""
    global page, is_initialized
    
    if not is_initialized:
        return jsonify({
            'success': False,
            'error': '浏览器未初始化'
        }), 500
    
    try:
        data = request.get_json()
        gift_id = data.get('gift_id')
        room_id = data.get('room_id')
        
        if not gift_id or not room_id:
            return jsonify({
                'success': False,
                'error': '缺少gift_id或room_id参数'
            }), 400
        
        logger.info(f'🎁 收到礼物发送请求: ID={gift_id}, 房间={room_id}')
        
        # 每次都进入指定房间（支持多个主播）
        logger.info(f'🏠 进入主播房间: {room_id}')
        if not enter_room(room_id):
            return jsonify({
                'success': False,
                'error': '进入直播间失败'
            }), 500
        
        # 等待5秒确保页面稳定
        logger.info('⏰ 等待5秒确保页面稳定...')
        time.sleep(5)
        
        # 尝试发送礼物
        result = page.evaluate(f'''
            () => {{
                const selector = '.gift-id-{gift_id}';
                console.log('Looking for gift with selector:', selector);
                
                const el = document.querySelector(selector);
                console.log('Found element:', el);
                
                if (el) {{
                    console.log('Gift element found, clicking...');
                    const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                    el.dispatchEvent(evt);
                    return {{success: true, selector: selector}};
                }} else {{
                    // 调试：查看页面中所有的礼物元素
                    const allGifts = document.querySelectorAll('[class*="gift"]');
                    console.log('All gift-related elements found:', allGifts.length);
                    
                    const giftInfo = [];
                    for (let i = 0; i < Math.min(allGifts.length, 10); i++) {{
                        giftInfo.push({{
                            index: i,
                            className: allGifts[i].className,
                            id: allGifts[i].id || 'no-id'
                        }});
                    }}
                    
                    return {{success: false, error: 'Gift element not found', selector: selector, debug: giftInfo}};
                }}
            }}
        ''')
        
        if result.get('success'):
            # 等待发送结果
            time.sleep(3)
            
            logger.info(f'✅ 礼物发送成功: ID={gift_id}')
            return jsonify({
                'success': True,
                'gift_id': gift_id,
                'room_id': room_id,
                'message': '礼物发送成功'
            })
        else:
            logger.warning(f'❌ 未找到礼物ID {gift_id} 对应的元素')
            return jsonify({
                'success': False,
                'error': f'未找到礼物ID {gift_id} 对应的元素',
                'debug_info': result.get('debug', []),
                'gift_id': gift_id,
                'room_id': room_id
            })
            
    except Exception as e:
        logger.error(f'❌ 发送礼物失败: {e}')
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/status', methods=['GET'])
def status():
    """服务状态"""
    global is_initialized, page
    
    current_url = page.url if page else None
    
    return jsonify({
        'initialized': is_initialized,
        'current_url': current_url,
        'service': 'bilibili_persistent_sender'
    })

@app.route('/enter_room', methods=['POST'])
def enter_room_api():
    """进入房间API"""
    global is_initialized
    
    if not is_initialized:
        return jsonify({
            'success': False,
            'error': '浏览器未初始化'
        }), 500
    
    try:
        data = request.get_json()
        room_id = data.get('room_id')
        
        if not room_id:
            return jsonify({
                'success': False,
                'error': '缺少room_id参数'
            }), 400
        
        success = enter_room(room_id)
        
        return jsonify({
            'success': success,
            'room_id': room_id,
            'message': '成功进入房间' if success else '进入房间失败'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

def cleanup():
    """清理资源"""
    global browser, playwright_instance
    
    try:
        if browser:
            browser.close()
        if playwright_instance:
            playwright_instance.stop()
        logger.info('✅ 浏览器资源已清理')
    except Exception as e:
        logger.error(f'❌ 清理资源失败: {e}')

def run_flask():
    """运行Flask服务"""
    app.run(host='127.0.0.1', port=5001, debug=False)

if __name__ == "__main__":
    try:
        # 初始化浏览器
        if initialize_browser():
            # 启动Flask服务
            logger.info('🌐 启动HTTP API服务 (端口5001)...')
            flask_thread = Thread(target=run_flask, daemon=True)
            flask_thread.start()
            
            logger.info('🎯 服务启动完成!')
            logger.info('📡 API端点:')
            logger.info('   POST /send_gift - 发送礼物')
            logger.info('   POST /enter_room - 进入房间')
            logger.info('   GET /status - 服务状态')
            logger.info('💡 浏览器将保持打开状态，按Ctrl+C退出')
            
            # 保持主线程运行
            try:
                while True:
                    time.sleep(1)
            except KeyboardInterrupt:
                logger.info('🛑 收到退出信号')
        
    except Exception as e:
        logger.error(f'❌ 服务启动失败: {e}')
    finally:
        cleanup()