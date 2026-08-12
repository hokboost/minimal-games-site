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
        if os.path.islink(file_path) or not os.path.isfile(file_path):
            return []
        if os.name != "nt" and (os.stat(file_path).st_mode & 0o077):
            return []
        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("#") or not line.strip():
                    continue
                parts = line.strip().split("\t")
                if len(parts) == 1:
                    parts = line.strip().split()
                if len(parts) >= 7 and (parts[0].startswith(".") or parts[0].endswith(".com") or parts[0].endswith(".cn")):
                    domain, _, path, _, _, name, value = parts[:7]
                elif len(parts) >= 4:
                    name, value, domain, path = parts[:4]
                    if name.lower() in ("name", "cookie") or not domain:
                        continue
                else:
                    continue
                cookies.append({
                    "name": name,
                    "value": value,
                    "domain": domain,
                    "path": path
                })
        return cookies
    except Exception:
        safe_print("加载 Cookie 文件失败")
        return []

def normalize_live_cookies(cookies):
    """补全 live.bilibili.com 需要的关键cookie域名"""
    key_names = {"SESSDATA", "bili_jct", "DedeUserID", "DedeUserID__ckMd5"}
    live_domains = {".live.bilibili.com", "live.bilibili.com"}
    existing = {(c.get("name"), c.get("domain")) for c in cookies}
    extras = []
    for c in cookies:
        name = c.get("name")
        if name not in key_names:
            continue
        for domain in live_domains:
            if (name, domain) in existing:
                continue
            extra = dict(c)
            extra["domain"] = domain
            extras.append(extra)
    if extras:
        cookies.extend(extras)
    return cookies

def build_guard_gift_ids():
    config_path = os.environ.get('BILIPK_CONFIG', 'C:/Users/user/Desktop/jiaobenbili/config_gift_only.json')
    if not os.path.exists(config_path):
        return {"34636", "34638", "34639"}
    try:
        with open(config_path, 'r', encoding='utf-8') as f:
            config_data = json.load(f)
        gift_pool = config_data.get("礼物池配置", {})
        guard_ids = set()
        for gid, info in gift_pool.items():
            name = ""
            if isinstance(info, (list, tuple)) and info:
                name = info[0]
            if isinstance(name, str) and any(token in name for token in ("舰长", "提督", "总督", "大航海")):
                guard_ids.add(str(gid))
        guard_ids.update({"34636", "34638", "34639"})
        return guard_ids
    except Exception as e:
        safe_print(f"加载航海礼物配置失败: {e}")
        return {"34636", "34638", "34639"}

GUARD_GIFT_IDS = build_guard_gift_ids()

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
                        
                        # 尝试提取数字（支持万/亿）
                        import re
                        match = re.search(r'余额[:\s]*([\d.]+)\s*([万亿]?)', text)
                        if match:
                            value = float(match.group(1))
                            unit = match.group(2)
                            if unit == "万":
                                value *= 10000
                            elif unit == "亿":
                                value *= 100000000
                            balance = float(value)
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
                        
                        # 提取数字（支持万/亿）
                        import re
                        match = re.search(r'余额[:\s]*([\d.]+)\s*([万亿]?)', balance_text)
                        if match:
                            value = float(match.group(1))
                            unit = match.group(2)
                            if unit == "万":
                                value *= 10000
                            elif unit == "亿":
                                value *= 100000000
                            balance = float(value)
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
        # 检查常见的余额不足提示
        insufficient_selectors = [
            ".insufficient-balance",  # 余额不足类名
            "[class*='insufficient']",  # 包含insufficient的类名
            "text='余额不足'",  # 直接文本匹配
            "text='B币不足'",
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
                        normalized_text = "".join(text_content.split())
                        if any(keyword in normalized_text for keyword in [
                            "余额不足", "B币不足", "电池不足", "请充值", "充值后"
                        ]):
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
        success_selectors = [".gift-success", ".send-success"]
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
        
        return {
            "success": False,
            "reason": "provider_confirmation_missing",
            "outcome_uncertain": True
        }
        
    except Exception as e:
        safe_print(f"检查送礼结果失败: {e}")
        return {"success": False, "reason": "check_failed", "error": str(e)}

def send_gift_simple(gift_id, room_id, quantity=1):
    """简单的礼物发送函数 - 每次独立运行"""
    safe_print(f"Starting gift sending - Gift ID: {gift_id}, Room: {room_id}, Quantity: {quantity}")
    send_attempted = False
    
    with sync_playwright() as p:
        # 启动浏览器（完全按threeserver的配置）
        safe_print("Starting browser...")
        browser = p.chromium.launch(headless=False, slow_mo=100)
        context = browser.new_context()
        page = context.new_page()

        # 加载cookies
        safe_print("Loading cookies...")
        cookie_path = os.environ.get('BILI_COOKIE_PATH', 'C:/Users/user/Desktop/jiaobenbili/cookie.txt')
        cookies = load_cookies_from_txt(cookie_path)
        cookies = normalize_live_cookies(cookies)
        if not cookies:
            return {"success": False, "error": "no_cookies_loaded", "message": "cookie文件为空或解析失败"}
        cookie_names = {c.get("name") for c in cookies}
        if "SESSDATA" not in cookie_names or "bili_jct" not in cookie_names:
            return {"success": False, "error": "missing_key_cookies", "message": "缺少SESSDATA或bili_jct"}
        safe_print("Cookie 已加载")
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
            # ✅ B站所有礼物价格映射表（价格单位：电池）
            GIFT_PRICE_MAP = {
                "13000": 0, "30606": 50, "30628": 1000, "30688": 899, "30732": 6660, "30733": 280, "30758": 1, "30847": 12450, "30869": 1, "30873": 299,
                "31028": 22330, "31036": 1, "31039": 1, "31044": 52, "31053": 199, "31087": 12450, "31088": 4000, "31115": 10000, "31122": 1000, "31164": 1,
                "31243": 7999, "31588": 199, "31589": 1314, "31591": 6666, "31877": 299, "31878": 299, "31882": 299, "31883": 1314, "31884": 1314, "31885": 1314,
                "31886": 1314, "31891": 3000, "31892": 3000, "31893": 3000, "31894": 3000, "31932": 3000, "31933": 5200, "32089": 1000, "32091": 1000, "32092": 1000, "32093": 1000,
                "32228": 1990, "32251": 150, "32313": 29990, "32609": 2, "32613": 2000, "32761": 99, "32767": 330, "32768": 520, "33020": 99, "33032": 26000,
                "33065": 12450, "33066": 3000, "33067": 1000, "33068": 6666, "33069": 22330, "33070": 29990, "33668": 399, "33988": 1, "34001": 1, "34022": 99,
                "34065": 99, "34102": 1, "34115": 99, "34212": 99, "34213": 99, "34214": 99, "34215": 99, "34294": 99, "34296": 99, "34315": 99,
                "34316": 99, "34344": 8888, "34379": 880, "34380": 3000, "34381": 5000, "34382": 10000, "34383": 30000, "34428": 1314, "34429": 520, "34448": 520,
                "34500": 10, "34526": 1000, "34527": 100, "34547": 1000, "34551": 1000, "34657": 199, "34684": 1520, "34908": 6666, "34931": 49, "34970": 3000,
                "34989": 9, "34990": 299, "34991": 666, "34992": 6666, "34997": 1990, "34998": 29990, "34999": 5200, "35017": 1000, "35019": 1000, "35081": 199,
                "35082": 30000, "35165": 30000, "35206": 50, "35212": 500, "35228": 199, "35261": 299, "35282": 299, "35283": 1888, "35284": 3000, "35287": 250,
                "35289": 199, "35292": 666, "35293": 888, "35301": 1, "35302": 990, "35303": 30000, "35405": 1990,
                "34636": 1980, "34638": 19980, "34639": 199980
            }
            price = GIFT_PRICE_MAP.get(str(gift_id), 1)
            price_bcoin = price / 1000.0
            before_balance = None
            try:
                before_balance = get_current_balance(page)
                safe_print(f"💰 [余额差计算] 发送前余额: {before_balance} (price={price}电池≈{price_bcoin:.2f}B币)")
            except Exception as e:
                safe_print(f"⚠️ [余额差计算] 获取发送前余额失败: {e}")
            if before_balance is not None and price_bcoin > 0 and before_balance < price_bcoin:
                safe_print(f"🚫 余额不足: {before_balance} B币 < {price_bcoin:.2f} B币")
                return {
                    "success": False,
                    "error": "insufficient_balance",
                    "balance_insufficient": True,
                    "gift_id": gift_id,
                    "room_id": room_id,
                    "requested_quantity": quantity,
                    "actual_quantity": 0,
                    "partial_success": False,
                    "coins_spent": 0
                }

            safe_print(f"Gift {gift_id} clicked, now handling quantity: {quantity}")
            
            # ⚡ 逐个点击发送，每次点击后短暂等待并检查余额，首次发现余额不足立即停止
            successful_sends = 0
            stopped_for_balance = False
            for i in range(quantity):
                guard_ids_js = json.dumps(sorted(GUARD_GIFT_IDS))
                send_attempted = True
                click_result = page.evaluate(f'''
                    async () => {{
                        const giftId = "{gift_id}";
                        const guardGiftIds = new Set({guard_ids_js});
                        const isGuardGift = guardGiftIds.has(String(giftId));

                        const clickBySelector = (selector) => {{
                            const node = document.querySelector(selector);
                            if (!node) return false;
                            const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                            node.dispatchEvent(evt);
                            return true;
                        }};

                        const clickTabByText = (text) => {{
                            const tabs = document.querySelectorAll('.gift-tabs .gift-tab');
                            for (const tab of tabs) {{
                                const nameEl = tab.querySelector('.name');
                                const label = (nameEl ? nameEl.textContent : tab.textContent || '').replace(/\\s+/g, '');
                                if (label.includes(text)) {{
                                    const target = nameEl || tab;
                                    target.dispatchEvent(new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }}));
                                    return true;
                                }}
                            }}
                            return false;
                        }};

                        const getGiftPanel = () => {{
                            return document.querySelector('.gift-panel.extend-panel')
                                || document.querySelector('.gift-panel')
                                || document.body;
                        }};

                        const ensureGiftPanelOpen = () => {{
                            const switchSelectors = [
                                '.gift-panel-switch',
                                '.gift-panel-switch.pointer',
                                '.gift-panel-switch-icon',
                                '.gift-panel-switch-btn'
                            ];
                            for (const sel of switchSelectors) {{
                                if (clickBySelector(sel)) return true;
                            }}
                            return false;
                        }};

                        const scrollGiftContainers = () => {{
                            const panel = getGiftPanel();
                            const containers = Array.from(panel.querySelectorAll('*')).filter((el) => {{
                                try {{
                                    return el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'visible';
                                }} catch (e) {{
                                    return false;
                                }}
                            }});
                            if (panel && panel.scrollHeight > panel.clientHeight) {{
                                containers.unshift(panel);
                            }}
                            for (const el of containers) {{
                                el.scrollTop = 0;
                            }}
                            return containers;
                        }};

                        const findGiftElement = (id) => {{
                            const panel = getGiftPanel();
                            const selectors = [
                                '.gift-id-' + id,
                                '[class*="gift-id-' + id + '"]',
                                '[data-gift-id="' + id + '"]'
                            ];
                            for (const selector of selectors) {{
                                const el = panel.querySelector(selector);
                                if (el) return el;
                            }}
                            const reportCandidates = Array.from(panel.querySelectorAll('[data-report]'));
                            for (const el of reportCandidates) {{
                                const report = el.getAttribute('data-report') || '';
                                if (report.includes(`"gift_id":${id}`)) {{
                                    return el;
                                }}
                            }}
                            for (const selector of selectors) {{
                                const el = document.querySelector(selector);
                                if (el) return el;
                            }}
                            return null;
                        }};

                        if (isGuardGift) {{
                            clickTabByText('航海');
                            await new Promise((resolve) => setTimeout(resolve, 300));
                        }}

                        let el = findGiftElement(giftId);
                        if (!el) {{
                            ensureGiftPanelOpen();
                            if (isGuardGift) {{
                                clickTabByText('航海');
                                await new Promise((resolve) => setTimeout(resolve, 300));
                            }}
                            el = findGiftElement(giftId);
                        }}
                        if (!el) {{
                            const containers = scrollGiftContainers();
                            for (const container of containers) {{
                                container.scrollTop = Math.floor(container.scrollHeight / 2);
                            }}
                            await new Promise((resolve) => setTimeout(resolve, 150));
                            el = findGiftElement(giftId);
                        }}
                        if (!el) {{
                            const containers = scrollGiftContainers();
                            for (const container of containers) {{
                                container.scrollTop = container.scrollHeight;
                            }}
                            el = findGiftElement(giftId);
                        }}

                        if (el) {{
                            const target = el.querySelector('.gift-item-content') || el;
                            if (target.scrollIntoView) {{
                                target.scrollIntoView({{ block: 'center', inline: 'center' }});
                            }}
                            const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                            target.dispatchEvent(evt);

                            const actionButton = el.querySelector('.bottom-btn-section button, .bottom-btn-section .btn, .bottom-btn-section .buy-btn, .bottom-btn-section .send-btn');
                            if (actionButton && actionButton.offsetParent !== null) {{
                                actionButton.dispatchEvent(evt);
                            }}
                            return {{ success: true, guard: isGuardGift }};
                        }}

                        const activeTab = document.querySelector('.gift-tabs .gift-tab.active .name');
                        const panel = getGiftPanel();
                        const panelClass = panel ? panel.className : '';
                        const panelCount = document.querySelectorAll('.gift-panel').length;
                        const panelGiftCount = panel ? panel.querySelectorAll('.gift-item').length : 0;
                        const globalGiftCount = document.querySelectorAll('.gift-item').length;
                        const targetByClass = document.querySelector('.gift-id-' + giftId) ? true : false;
                        const reportCandidates = Array.from(document.querySelectorAll('[data-report]'))
                            .some((node) => (node.getAttribute('data-report') || '').includes('"gift_id":' + giftId));
                        const sampleGiftClasses = Array.from((panel || document).querySelectorAll('[class*="gift-id-"]'))
                            .slice(0, 5)
                            .map((node) => node.className)
                            .join(' | ');
                        return {{
                            success: false,
                            debug: {{
                                isGuardGift,
                                activeTab: activeTab ? activeTab.textContent.trim() : '',
                                panelClass,
                                panelCount,
                                panelGiftCount,
                                globalGiftCount,
                                targetByClass,
                                targetByReport: reportCandidates,
                                sampleGiftClasses
                            }}
                        }};
                    }}
                ''')

                if not click_result or not click_result.get("success"):
                    # page.evaluate returned normally and explicitly reported
                    # that no gift element was clicked.
                    if successful_sends == 0:
                        send_attempted = False
                    debug = click_result.get("debug") if isinstance(click_result, dict) else None
                    safe_print(f"⚠️ 第{i+1}次点击失败，礼物元素不可用")
                    if debug:
                        safe_print(
                            "🔎 送礼调试: "
                            f"isGuard={debug.get('isGuardGift')}, "
                            f"tab={debug.get('activeTab')}, "
                            f"panelClass={debug.get('panelClass')}, "
                            f"panelCount={debug.get('panelCount')}, "
                            f"panelGiftCount={debug.get('panelGiftCount')}, "
                            f"globalGiftCount={debug.get('globalGiftCount')}, "
                            f"targetByClass={debug.get('targetByClass')}, "
                            f"targetByReport={debug.get('targetByReport')}"
                        )
                        if debug.get("sampleGiftClasses"):
                            safe_print(f"🔎 礼物样本class: {debug.get('sampleGiftClasses')}")
                    break

                if click_result.get("guard"):
                    try:
                        confirm_clicked = page.evaluate(r'''() => {
                            const buttons = Array.from(document.querySelectorAll('button, .btn, .confirm, .confirm-btn'));
                            for (const btn of buttons) {
                                const text = (btn.textContent || '').replace(/\s+/g, '');
                                if (text.includes('同意并投喂') || text.includes('确认投喂') || text.includes('同意')) {
                                    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                    return true;
                                }
                            }
                            return false;
                        }''')
                        if confirm_clicked:
                            safe_print("✅ 已点击弹窗确认")
                    except Exception as e:
                        safe_print(f"⚠️ 弹窗确认失败: {e}")

                time.sleep(0.3)  # 每次点击间隔0.3秒，便于观察余额变化
                if check_balance_insufficient(page):
                    safe_print(f"🚫 余额不足，已发送 {successful_sends}/{quantity}，在第{i+1}次点击后停止")
                    stopped_for_balance = True
                    break

                successful_sends += 1

            safe_print(f"🎯 总计完成 {successful_sends}/{quantity} 个礼物发送")

            if not send_attempted and successful_sends == 0:
                return {
                    "success": False,
                    "error": "gift_not_found",
                    "gift_id": gift_id,
                    "room_id": room_id,
                    "requested_quantity": quantity,
                    "actual_quantity": 0,
                    "partial_success": False,
                    "outcome_uncertain": False
                }

            # 如果已经检测到余额不足，直接返回失败并带上实际成功数
            if stopped_for_balance:
                after_balance = None
                try:
                    after_balance = get_current_balance(page)
                    safe_print(f"💰 [余额差计算] 发送后余额: {after_balance}")
                except Exception as e:
                    safe_print(f"⚠️ [余额差计算] 获取发送后余额失败: {e}")

                return {
                    "success": False,
                    "error": "insufficient_balance",
                    "balance_insufficient": True,
                    "gift_id": gift_id,
                    "room_id": room_id,
                    "requested_quantity": quantity,
                    "actual_quantity": 0,
                    "observed_clicks": successful_sends,
                    "partial_success": False,
                    "coins_spent": 0,
                    "outcome_uncertain": send_attempted
                }
            
            # 使用threeserver的完整验证逻辑
            safe_print("Checking gift send result using threeserver validation logic...")
            result = check_gift_send_result(page, gift_id, max_wait=3)
            after_balance = None
            try:
                after_balance = get_current_balance(page)
                safe_print(f"💰 [余额差计算] 发送后余额: {after_balance}")
            except Exception as e:
                safe_print(f"⚠️ [余额差计算] 获取发送后余额失败: {e}")

            error_message = result.get("message") or ""
            if (result.get("reason") == "other_error" or "打Call" in error_message) and str(gift_id) in GUARD_GIFT_IDS:
                safe_print(f"⚠️ 检测到提示弹窗: {error_message}")

                # 点击“同意并投喂”确认弹窗
                try:
                    confirm_clicked = page.evaluate(r'''() => {
                        const buttons = Array.from(document.querySelectorAll('button, .btn, .confirm, .confirm-btn'));
                        for (const btn of buttons) {
                            const text = (btn.textContent || '').replace(/\s+/g, '');
                            if (text.includes('同意并投喂') || text.includes('确认投喂') || text.includes('同意')) {
                                btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                return true;
                            }
                        }
                        const dialog = document.querySelector('.dialog, .modal, .popup, .confirm');
                        if (dialog) {
                            const ok = dialog.querySelector('button, .btn');
                            if (ok) {
                                ok.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                                return true;
                            }
                        }
                        return false;
                    }''')
                except Exception as e:
                    safe_print(f"⚠️ 弹窗确认失败: {e}")
                    confirm_clicked = False

                if confirm_clicked:
                    safe_print("✅ 已点击弹窗确认，等待结果...")
                    time.sleep(1.2)
                    result = check_gift_send_result(page, gift_id, max_wait=2)
                    try:
                        after_balance = get_current_balance(page)
                        safe_print(f"💰 [余额差计算] 发送后余额: {after_balance}")
                    except Exception as e:
                        safe_print(f"⚠️ [余额差计算] 获取发送后余额失败: {e}")
                else:
                    safe_print("❌ 弹窗确认按钮未找到")
                    return {
                        "success": False,
                        "error": error_message or "send_failed",
                        "balance_insufficient": False,
                        "gift_id": gift_id,
                        "room_id": room_id,
                        "requested_quantity": quantity,
                        "actual_quantity": 0,
                        "partial_success": False,
                        "coins_spent": 0,
                        "outcome_uncertain": True
                    }
            
            # 根据验证结果返回适当的响应
            # 🛡️ 正确的成功失败判断：余额不足时必须返回失败
            balance_insufficient = result.get("reason") == "insufficient_balance"
            
            if balance_insufficient:
                # ✅ 用余额差/单价推断实际成功数量，兼容后续支持不同礼物价格
                after_balance = None
                try:
                    after_balance = get_current_balance(page)
                    safe_print(f"💰 [余额差计算] 发送后余额: {after_balance}")
                except Exception as e:
                    safe_print(f"⚠️ [余额差计算] 获取发送后余额失败: {e}")

                sent = successful_sends
                if before_balance is not None and after_balance is not None and price_bcoin >= 1:
                    delta_bcoin = max(0.0, float(before_balance) - float(after_balance))
                    sent = min(quantity, int((delta_bcoin * 1000 + 1e-6) // price))

                # 余额不足：如果全部送完则算成功，否则部分成功并返回失败状态
                if sent == quantity:
                    safe_print(f"✅ 全部成功（余额用尽）: {sent}/{quantity} 个礼物发送成功")
                    return {
                        "success": True,
                        "gift_id": gift_id,
                        "room_id": room_id,
                        "requested_quantity": quantity,
                        "actual_quantity": sent,
                        "verified": True,
                        "message": "送礼成功（余额耗尽）",
                        "partial_success": False,
                        "coins_spent": sent * price
                    }
                else:
                    safe_print(f"⚠️ 部分成功且余额不足: {sent}/{quantity} 个礼物发送成功")
                    return {
                        "success": False, 
                        "error": "insufficient_balance", 
                        "balance_insufficient": True,
                        "gift_id": gift_id, 
                        "room_id": room_id,
                        "requested_quantity": quantity,
                        "actual_quantity": sent,
                        "partial_success": sent > 0,
                        "coins_spent": sent * price
                    }
            elif result.get("success"):
                # 只有非余额不足的情况下才考虑部分成功
                verified = "message" in result
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
                    "partial_success": is_partial,
                    "coins_spent": successful_sends * price
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
                    "partial_success": False,
                    "outcome_uncertain": bool(result.get("outcome_uncertain") or send_attempted)
                }
                
        except Exception as e:
            safe_print(f"Gift sending error: {e}")
            return {
                "success": False,
                "error": str(e),
                "gift_id": gift_id,
                "room_id": room_id,
                "outcome_uncertain": send_attempted
            }

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
