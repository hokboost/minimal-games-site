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

def send_gift_simple(gift_id, room_id):
    """简单的礼物发送函数 - 每次独立运行"""
    print(f"Starting gift sending - Gift ID: {gift_id}, Room: {room_id}")
    
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
            if page.query_selector(".gift-panel"):
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

        # 发送礼物（完全按threeserver逻辑）
        print(f"Sending gift ID: {gift_id}")
        try:
            result = page.evaluate(f'''
                () => {{
                    const giftId = {gift_id};
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
            
            if result['success']:
                print(f"Gift {gift_id} sent successfully")
                # 等待发送结果
                time.sleep(3)
                return {"success": True, "gift_id": gift_id, "room_id": room_id}
            else:
                print(f"Gift {gift_id} not found")
                return {"success": False, "error": "Gift element not found", "gift_id": gift_id, "room_id": room_id}
                
        except Exception as e:
            print(f"Gift sending error: {e}")
            return {"success": False, "error": str(e), "gift_id": gift_id, "room_id": room_id}

        # 注意：浏览器会在with语句结束时自动关闭

if __name__ == "__main__":
    # 命令行调用: python bilibili_gift_sender.py gift_id room_id
    if len(sys.argv) >= 3:
        gift_id = sys.argv[1]
        room_id = sys.argv[2]
        result = send_gift_simple(gift_id, room_id)
        print(json.dumps(result, ensure_ascii=False))
    else:
        print("用法: python bilibili_gift_sender.py gift_id room_id")
        print("例如: python bilibili_gift_sender.py 31164 3929738")