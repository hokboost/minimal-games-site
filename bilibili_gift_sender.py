#!/usr/bin/env python3
"""
B站礼物发送服务 - 简单版本
每次请求独立运行，完全模仿threeserver逻辑
"""

from playwright.sync_api import sync_playwright
import time
import json
import sys

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
        print(f"加载cookie文件失败: {e}")
        return []

def check_balance_insufficient(page):
    """检测页面是否出现余额不足提示，参考threeserver"""
    try:
        # 检查常见的余额不足提示
        insufficient_selectors = [
            ".insufficient-balance",  # 余额不足类名
            "[class*='insufficient']",  # 包含insufficient的类名
            ".toast-message",  # 通用toast消息
            ".error-message",  # 错误消息
            ".gift-send-error"  # 送礼错误
        ]
        
        for selector in insufficient_selectors:
            elements = page.query_selector_all(selector)
            for element in elements:
                try:
                    if element.is_visible():
                        text_content = element.text_content() or ""
                        if any(keyword in text_content for keyword in ["余额", "不足", "B币", "充值"]):
                            print(f"Balance insufficient detected: {text_content}")
                            return True
                except:
                    continue
        
        return False
    except Exception as e:
        print(f"检测余额状态失败: {e}")
        return False

def send_gift_simple(gift_id, room_id, quantity=1):
    """简单的礼物发送函数 - 每次独立运行"""
    print(f"Starting gift sending - Gift ID: {gift_id}, Room: {room_id}, Quantity: {quantity}")
    
    with sync_playwright() as p:
        # 启动浏览器（完全按threeserver的配置）
        print("Starting browser...")
        browser = p.chromium.launch(headless=False, slow_mo=100)
        context = browser.new_context()
        page = context.new_page()

        # 加载cookies
        print("Loading cookies...")
        cookie_path = 'C:/Users/user/Desktop/jiaobenbili/cookie.txt'
        cookies = load_cookies_from_txt(cookie_path)
        page.goto("https://www.bilibili.com/")
        page.context.add_cookies(cookies)
        time.sleep(1)

        # 进入房间
        print(f"Entering room {room_id}...")
        page.goto(f"https://live.bilibili.com/{room_id}")
        page.wait_for_load_state("domcontentloaded")

        # 等待礼物面板加载
        print("Waiting for gift panel...")
        for _ in range(20):
            try:
                if page.query_selector(".gift-panel"):
                    break
            except Exception as e:
                print(f"Query selector error: {e}")
                break
            time.sleep(0.5)

        # 点击展开箭头（完全按threeserver逻辑）
        print("Expanding gift panel...")
        try:
            arrow_selector = ".gift-panel-switch"
            page.evaluate(f'''
                () => {{
                    const el = document.querySelector('{arrow_selector}');
                    if (!el) return false;
                    const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                    el.dispatchEvent(evt);
                    return true;
                }}
            ''')
            time.sleep(1.5)
            print("Gift panel expanded")
        except Exception as e:
            print(f"Arrow click might have failed: {e}")

        # 等待10秒（按用户要求）
        print("Waiting 10 seconds for page to fully load...")
        time.sleep(10)

        # 发送礼物并验证结果
        print(f"Sending gift ID: {gift_id}")
        try:
            # 点击礼物
            click_result = page.evaluate(f'''
                () => {{
                    const giftId = "{gift_id}";
                    const selector = '.gift-id-' + giftId;
                    const el = document.querySelector(selector);
                    if (el) {{
                        const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                        el.dispatchEvent(evt);
                        return {{success: true, id: giftId}};
                    }} else {{
                        return {{success: false, id: giftId}};
                    }}
                }}
            ''')
            
            if not click_result['success']:
                print(f"Gift {gift_id} not found")
                return {"success": False, "error": "Gift element not found", "gift_id": gift_id, "room_id": room_id}
            
            print(f"Gift {gift_id} clicked, now handling quantity: {quantity}")
            
            # 如果需要发送多个，连续点击
            if quantity > 1:
                for i in range(quantity - 1):  # 已经点击了一次，所以减1
                    time.sleep(0.5)  # 每次点击间隔0.5秒
                    page.evaluate(f'''
                        () => {{
                            const giftId = "{gift_id}";
                            const selector = '.gift-id-' + giftId;
                            const el = document.querySelector(selector);
                            if (el) {{
                                const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                                el.dispatchEvent(evt);
                            }}
                        }}
                    ''')
                print(f"Completed {quantity} gift clicks")
            
            # 等待3秒让可能的提示出现
            time.sleep(3)
            
            # 检查余额不足
            balance_insufficient = check_balance_insufficient(page)
            if balance_insufficient:
                print("Balance insufficient detected")
                return {"success": False, "error": "余额不足", "balance_insufficient": True, "gift_id": gift_id, "room_id": room_id}
            
            # 检查其他错误提示
            error_check = page.evaluate('''
                () => {
                    const errorSelectors = ['.error-tip', '.toast-error', '.gift-error', '[class*="error"]'];
                    for (const selector of errorSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.style.display !== 'none' && el.textContent.trim()) {
                            return {hasError: true, message: el.textContent.trim()};
                        }
                    }
                    return {hasError: false};
                }
            ''')
            
            if error_check['hasError']:
                print(f"Error detected: {error_check['message']}")
                return {"success": False, "error": f"送礼失败: {error_check['message']}", "gift_id": gift_id, "room_id": room_id}
            
            # 检查成功提示
            success_check = page.evaluate('''
                () => {
                    const successSelectors = ['.gift-success', '.send-success', '[class*="success"]'];
                    for (const selector of successSelectors) {
                        const el = document.querySelector(selector);
                        if (el && el.style.display !== 'none' && el.textContent.trim()) {
                            return {hasSuccess: true, message: el.textContent.trim()};
                        }
                    }
                    return {hasSuccess: false};
                }
            ''')
            
            if success_check['hasSuccess']:
                print(f"Success confirmed: {success_check['message']}")
                return {"success": True, "gift_id": gift_id, "room_id": room_id, "verified": True}
            
            # 没有明确错误或成功提示，假设成功（参考threeserver逻辑）
            print("No clear error detected, assuming success")
            return {"success": True, "gift_id": gift_id, "room_id": room_id, "verified": False}
                
        except Exception as e:
            print(f"Gift sending error: {e}")
            return {"success": False, "error": str(e), "gift_id": gift_id, "room_id": room_id}

        # 注意：浏览器会在with语句结束时自动关闭

if __name__ == "__main__":
    # 命令行调用: python bilibili_gift_sender.py gift_id room_id [quantity]
    if len(sys.argv) >= 3:
        gift_id = sys.argv[1]
        room_id = sys.argv[2]
        quantity = int(sys.argv[3]) if len(sys.argv) > 3 else 1
        result = send_gift_simple(gift_id, room_id, quantity)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print("用法: python bilibili_gift_sender.py gift_id room_id [quantity]")
        print("例如: python bilibili_gift_sender.py 31164 3929738 5")