#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
B站礼物发送服务 - 简单版本
每次请求独立运行，完全模仿threeserver逻辑
"""

import sys
import io
import os

# 🛡️ 修复Windows字符编码问题
if sys.platform == 'win32':
    # 设置stdout和stderr为UTF-8编码
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')
    # 设置控制台输出为UTF-8
    os.system('chcp 65001')

from playwright.sync_api import sync_playwright
import time
import json

def safe_print(text):
    """安全打印函数，处理编码问题 (log to stderr; keep stdout clean for JSON)."""
    try:
        print(text, file=sys.stderr)
    except UnicodeEncodeError:
        safe_text = text.encode('ascii', errors='ignore').decode('ascii')
        print(f"[ENCODING_ERROR] {safe_text}", file=sys.stderr)


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
        safe_print(f"加载cookie文件失败: {e}")
        return []

def get_current_balance(page):
    """获取当前B币余额，完全参考threeserver.py实现"""
    try:
        safe_print("[余额检测] 开始查找余额信息...")
        
        # 首先查找所有包含"余额"文字的元素
        try:
            balance_elements = page.query_selector_all("text=余额")
            safe_print(f"[余额检测] 找到 {len(balance_elements)} 个包含'余额'的元素")
            
            for i, element in enumerate(balance_elements):
                try:
                    if element.is_visible():
                        text = element.text_content() or ""
                        safe_print(f"[余额检测] 余额元素{i}: '{text}'")
                        
                        # 尝试提取数字
                        import re
                        match = re.search(r'余额[:\s]*(\d+)', text)
                        if match:
                            balance = int(match.group(1))
                            safe_print(f"✅ [余额检测] 找到余额: {balance} B币")
                            return balance
                except Exception as e:
                    safe_print(f"[余额检测] 处理元素{i}失败: {e}")
                    
        except Exception as e:
            safe_print(f"[余额检测] 查找余额元素失败: {e}")
        
        # 尝试具体选择器
        balance_selectors = [
            ".balance-info .title",
            "[data-v-2e691f81].title",
            ".balance-info",
            "[class*='balance']",
            ".title",
        ]
        
        for selector in balance_selectors:
            try:
                elements = page.query_selector_all(selector)
                safe_print(f"[余额检测] 选择器 '{selector}' 找到 {len(elements)} 个元素")
                
                for i, element in enumerate(elements):
                    if element.is_visible():
                        balance_text = element.text_content() or ""
                        safe_print(f"[余额检测] 选择器'{selector}' 元素{i}文本: '{balance_text}'")
                        
                        # 提取数字 "余额: 811" -> 811
                        import re
                        match = re.search(r'余额[:\s]*(\d+)', balance_text)
                        if match:
                            balance = int(match.group(1))
                            safe_print(f"📊 [余额检测] 解析余额成功: {balance} B币")
                            return balance
            except Exception as e:
                safe_print(f"[余额检测] 选择器 '{selector}' 处理失败: {e}")
        
        safe_print("[余额检测] ❌ 所有方法都未找到余额信息")
        return None
        
    except Exception as e:
        safe_print(f"[余额检测] 获取余额失败: {e}")
        return None

def check_balance_insufficient(page):
    """检测页面是否出现余额不足提示或余额过低，完全参考threeserver"""
    try:
        # 首先尝试读取当前余额
        balance_info = get_current_balance(page)
        if balance_info is not None:
            current_balance = balance_info
            safe_print(f"💰 当前余额: {current_balance} B币")
            
            # 如果余额过低（小于1），认为余额不足
            if current_balance < 1:
                safe_print(f"🚫 余额过低: {current_balance} B币")
                return True
        
        # 检查常见的余额不足提示
        insufficient_selectors = [
            ".insufficient-balance",  # 余额不足类名
            "[class*='insufficient']",  # 包含insufficient的类名
            "text='余额不足'",  # 直接文本匹配
            "text='B币不足'",
            "text='余额'",
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
                            try:
                                safe_print(f"🚫 检测到余额不足提示: {text_content}")
                            except UnicodeEncodeError:
                                safe_print("🚫 检测到余额不足提示 (编码问题)")
                            return True
                except:
                    continue
        
        return False
    except Exception as e:
        safe_print(f"检测余额状态失败: {e}")
        return False

def check_gift_send_result(page, gift_id, max_wait=3):
    """检查送礼结果，完全参考threeserver.py实现"""
    try:
        # 等待可能的弹窗或提示
        time.sleep(max_wait)
        
        # 检查是否余额不足
        if check_balance_insufficient(page):
            return {"success": False, "reason": "insufficient_balance"}
        
        # 检查是否有其他错误提示
        error_selectors = [".error-tip", ".toast-error", ".gift-error", "[class*='error']"]
        for selector in error_selectors:
            elements = page.query_selector_all(selector)
            for element in elements:
                try:
                    if element.is_visible():
                        error_text = element.text_content() or ""
                        safe_print(f"⚠️ 送礼错误提示: {error_text}")
                        return {"success": False, "reason": "other_error", "message": error_text}
                except:
                    continue
        
        # 检查成功提示（如果有的话）
        success_selectors = [".gift-success", ".send-success", "[class*='success']"]
        for selector in success_selectors:
            elements = page.query_selector_all(selector)
            for element in elements:
                try:
                    if element.is_visible():
                        success_text = element.text_content() or ""
                        safe_print(f"✅ 送礼成功提示: {success_text}")
                        return {"success": True, "message": success_text}
                except:
                    continue
        
        # 如果没有明确的错误或成功提示，假设成功
        return {"success": True, "reason": "assumed_success"}
        
    except Exception as e:
        safe_print(f"检查送礼结果失败: {e}")
        return {"success": False, "reason": "check_failed", "error": str(e)}

def send_gift_simple(gift_id, room_id, quantity=1):
    """简单的礼物发送函数 - 每次独立运行"""
    safe_print(f"Starting gift sending - Gift ID: {gift_id}, Room: {room_id}, Quantity: {quantity}")
    
    with sync_playwright() as p:
        # 启动浏览器（完全按threeserver的配置）
        safe_print("Starting browser...")
        browser = p.chromium.launch(headless=False, slow_mo=100)
        context = browser.new_context()
        page = context.new_page()

        # 加载cookies
        safe_print("Loading cookies...")
        cookie_path = 'C:/Users/user/Desktop/jiaobenbili/cookie.txt'
        cookies = load_cookies_from_txt(cookie_path)
        page.goto("https://www.bilibili.com/")
        page.context.add_cookies(cookies)
        time.sleep(1)

        # 进入房间
        safe_print(f"Entering room {room_id}...")
        page.goto(f"https://live.bilibili.com/{room_id}")
        page.wait_for_load_state("domcontentloaded")

        # 等待礼物面板加载
        safe_print("Waiting for gift panel...")
        for _ in range(20):
            try:
                if page.query_selector(".gift-panel"):
                    break
            except Exception as e:
                safe_print(f"Query selector error: {e}")
                break
            time.sleep(0.5)

        # 点击展开箭头（完全按threeserver逻辑）
        safe_print("Expanding gift panel...")
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
            safe_print("Gift panel expanded")
        except Exception as e:
            safe_print(f"Arrow click might have failed: {e}")

        # 等待10秒（按用户要求）
        safe_print("Waiting 10 seconds for page to fully load...")
        time.sleep(10)

        # 发送礼物并验证结果
        safe_print(f"Sending gift ID: {gift_id}")
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
                safe_print(f"Gift {gift_id} not found")
                return {"success": False, "error": "Gift element not found", "gift_id": gift_id, "room_id": room_id}
            
            safe_print(f"Gift {gift_id} clicked, now handling quantity: {quantity}")
            
            # ⚡ 带0.05秒延时的礼物发送，方便计数
            successful_sends = 1  # 第一次点击已完成
            if quantity > 1:
                # 逐个发送剩余礼物，每次间隔0.05秒
                for i in range(quantity - 1):
                    time.sleep(0.05)  # 0.05秒延时，方便计数
                    click_result = page.evaluate(f'''
                        () => {{
                            const giftId = "{gift_id}";
                            const selector = '.gift-id-' + giftId;
                            const el = document.querySelector(selector);
                            if (el) {{
                                const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                                el.dispatchEvent(evt);
                                return true;
                            }}
                            return false;
                        }}
                    ''')
                    
                    if click_result:
                        successful_sends += 1
                    else:
                        safe_print(f"⚠️ 第{i+2}次点击失败，礼物元素不可用")
                        break
                
                safe_print(f"⚡ 带延时发送: {successful_sends - 1}/{quantity - 1} 次额外点击成功")
                safe_print(f"🎯 总计完成 {successful_sends}/{quantity} 个礼物发送")
            
            # 使用threeserver的完整验证逻辑
            safe_print("Checking gift send result using threeserver validation logic...")
            result = check_gift_send_result(page, gift_id, max_wait=3)
            
            # 根据验证结果返回适当的响应
            # 🛡️ 正确的成功失败判断：余额不足时必须返回失败
            balance_insufficient = result.get("reason") == "insufficient_balance"
            
            if balance_insufficient:
                # 余额不足时，无论点击了多少次都算失败
                safe_print(f"❌ 余额不足失败: 尝试 {quantity} 个礼物，余额不足")
                return {
                    "success": False, 
                    "error": "insufficient_balance", 
                    "balance_insufficient": True,
                    "gift_id": gift_id, 
                    "room_id": room_id,
                    "requested_quantity": quantity,
                    "actual_quantity": 0,  # 余额不足时实际成功数为0
                    "partial_success": False
                }
            elif result["success"] or successful_sends > 0:
                # 只有非余额不足的情况下才考虑部分成功
                verified = "message" in result and result.get("reason") != "assumed_success"
                is_partial = successful_sends < quantity
                
                if is_partial:
                    safe_print(f"⚠️ 部分成功: {successful_sends}/{quantity} 个礼物发送成功")
                else:
                    safe_print(f"✅ 全部成功: {successful_sends}/{quantity} 个礼物发送成功")
                
                return {
                    "success": True, 
                    "gift_id": gift_id, 
                    "room_id": room_id, 
                    "requested_quantity": quantity,
                    "actual_quantity": successful_sends,
                    "verified": verified,
                    "message": result.get("message", "送礼成功"),
                    "partial_success": is_partial
                }
            else:
                error_msg = result.get("message", result.get("reason", "未知错误"))
                balance_insufficient = result.get("reason") == "insufficient_balance"
                
                safe_print(f"❌ Gift sending failed - Reason: {error_msg}")
                return {
                    "success": False, 
                    "error": error_msg, 
                    "balance_insufficient": balance_insufficient,
                    "gift_id": gift_id, 
                    "room_id": room_id,
                    "requested_quantity": quantity,
                    "actual_quantity": 0,
                    "partial_success": False
                }
                
        except Exception as e:
            safe_print(f"Gift sending error: {e}")
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
        safe_print("用法: python bilibili_gift_sender.py gift_id room_id [quantity]")
        safe_print("例如: python bilibili_gift_sender.py 31164 3929738 5")