from flask import Flask, request, jsonify
from threading import Thread
import time
import sys
import json
import os
import logging
import io
from datetime import datetime
import threading
import random
import hmac
from collections import deque
from typing import Any, Dict, List, Optional, Tuple, Union

try:
    from playwright.sync_api import sync_playwright
except Exception as _e:  # Playwright 可选（HTTP giftsend 后端不需要）
    sync_playwright = None
    _playwright_import_error = _e

import requests

def force_utf8_stdio():
    try:
        if sys.stdout:
            sys.stdout.reconfigure(encoding="utf-8")
        if sys.stderr:
            sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        try:
            if sys.stdout and hasattr(sys.stdout, "buffer"):
                sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
            if sys.stderr and hasattr(sys.stderr, "buffer"):
                sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass

force_utf8_stdio()

app = Flask(__name__)
gift_queue = deque()
gift_queue_lock = threading.Lock()
balance_lock = threading.Lock()
request_lock = threading.Lock()
request_status = {}  # request_id -> {status, results, created_ts, updated_ts}

LOCAL_TOKEN = (os.getenv("THREESERVER_LOCAL_TOKEN") or "").strip()
if len(LOCAL_TOKEN.encode("utf-8")) < 32:
    raise RuntimeError("THREESERVER_LOCAL_TOKEN must contain at least 32 bytes")
ALLOWED_GIFT_IDS = {
    value.strip()
    for value in (os.getenv("THREESERVER_ALLOWED_GIFT_IDS") or "").split(",")
    if value.strip().isdigit()
}
if not ALLOWED_GIFT_IDS:
    raise RuntimeError("THREESERVER_ALLOWED_GIFT_IDS must not be empty")
MAX_QUEUE_DEPTH = 100
MAX_REQUEST_STATUS = 5000
REQUEST_STATUS_TTL_SECONDS = 3600
MAX_GIFTS_PER_REQUEST = 100
MAX_GIFT_COUNT_PER_ITEM = 100
MAX_TOTAL_GIFT_COUNT = 1000


@app.before_request
def require_local_capability():
    supplied = request.headers.get("X-Local-Sender-Token", "")
    if not hmac.compare_digest(supplied.encode("utf-8"), LOCAL_TOKEN.encode("utf-8")):
        return jsonify({"success": False, "error": "unauthorized"}), 401
    return None


def enqueue_item(item):
    with gift_queue_lock:
        if len(gift_queue) >= MAX_QUEUE_DEPTH:
            return False
        gift_queue.append(item)
        return True


def drain_queue():
    items = []
    with gift_queue_lock:
        while gift_queue:
            items.append(gift_queue.popleft())
    return items


def cleanup_request_status(now=None):
    current = now or time.time()
    with request_lock:
        expired = [
            request_id for request_id, state in request_status.items()
            if current - float(state.get("updated_ts") or state.get("created_ts") or current)
            > REQUEST_STATUS_TTL_SECONDS
        ]
        for request_id in expired:
            request_status.pop(request_id, None)
        if len(request_status) >= MAX_REQUEST_STATUS:
            return False
    return True

# Only the HTTP backend receives an explicit provider response code. The
# Playwright backend remains available for diagnostics but cannot assert that a
# dispatched click was accepted by Bilibili.
THREESERVER_BACKEND = (os.getenv("THREESERVER_BACKEND") or "http").strip().lower()

APP_DATA_DIR = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "BiliPKTool")
LOG_DIR = os.path.join(APP_DATA_DIR, "logs")

# Hard-send mode: disable any "balance/insufficient" DOM probing by default.
# Set BALANCE_CHECK_ENABLED=1 if you want to re-enable it.
BALANCE_CHECK_ENABLED = str(os.getenv("BALANCE_CHECK_ENABLED", "0") or "0").strip().lower() in (
    "1",
    "true",
    "yes",
    "y",
    "on",
)

# Ensure Playwright can find bundled browsers
if not os.getenv("PLAYWRIGHT_BROWSERS_PATH"):
    if getattr(sys, "frozen", False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.path.join(base_dir, "playwright-browsers")

# 余额状态追踪
balance_status = {
    "insufficient": False,
    "last_check": 0,
    "consecutive_failures": 0,
    "total_failed_gifts": 0,
    "current_balance": None,  # 当前余额缓存
    "balance_last_update": 0  # 余额最后更新时间
}

# 自动刷新余额节流（秒）
BALANCE_AUTO_REFRESH_INTERVAL = int(os.getenv("BALANCE_AUTO_REFRESH_INTERVAL", "10") or 10)


def request_balance_check(timeout=5):
    """
    从Flask线程请求浏览器线程查询余额（避免跨线程直接操作Playwright page）。
    返回 int(balance) / None(失败或超时)。
    """
    if not BALANCE_CHECK_ENABLED:
        return None
    try:
        request_id = str(time.time())
        result_event = threading.Event()
        result_storage = {"balance": None, "success": False}
        if not enqueue_item(
            {
                "check_balance": True,
                "request_id": request_id,
                "result_event": result_event,
                "result_storage": result_storage,
            }
        ):
            return None
        if not result_event.wait(timeout=timeout):
            return None
        if result_storage.get("success"):
            return result_storage.get("balance")
        return None
    except Exception as e:
        logger.error(f"余额查询请求失败: {e}")
        return None


def refresh_balance_if_needed(force=False):
    """
    余额不足时，尝试自动刷新余额；若余额恢复(>=1)则自动解除 insufficient 状态。
    """
    if not BALANCE_CHECK_ENABLED:
        return False
    now = int(time.time())
    with balance_lock:
        if not balance_status.get("insufficient") and not force:
            return True
        last_try = balance_status.get("last_check", 0) or 0
        if not force and now - last_try < BALANCE_AUTO_REFRESH_INTERVAL:
            return False
        balance_status["last_check"] = now

    balance = request_balance_check(timeout=5)
    if balance is None:
        return False
    with balance_lock:
        balance_status["current_balance"] = balance
        balance_status["balance_last_update"] = int(time.time())
        if balance >= 1:
            if balance_status.get("insufficient"):
                logger.info(f"✅ 检测到余额已恢复({balance})，自动解除余额不足状态")
            balance_status["insufficient"] = False
            balance_status["consecutive_failures"] = 0
            return True
    return False

# 日志配置
os.makedirs(LOG_DIR, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, 'threeserver.log'), encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 简化单房间配置
def load_config():
    try:
        config_path = os.getenv("BILIPK_CONFIG")
        script_dir = os.path.dirname(os.path.abspath(__file__))
        app_data_dir = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "BiliPKTool")
        candidates = []
        if config_path:
            candidates.append(config_path)
        # 优先使用脚本目录（与录制脚本同目录的 gift json）
        candidates.append(os.path.join(script_dir, "config_gift_only.json"))
        # 兼容旧路径：AppData
        candidates.append(os.path.join(app_data_dir, "config_gift_only.json"))

        config_file = None
        for path in candidates:
            if path and os.path.exists(path):
                config_file = path
                break

        if not config_file:
            print("ERROR: config_gift_only.json not found")
            return None

        with open(config_file, 'r', encoding='utf-8') as f:
            config = json.load(f)
        return config, config_file
    except FileNotFoundError:
        print("ERROR: config_gift_only.json not found")
        return None, None

config, config_file = load_config()
if not config:
    print("ERROR: 无法加载配置文件")
    sys.exit(1)

# 获取送礼房间配置
ROOM_ID = config.get("送礼房间配置", {}).get("送礼房间", "0")

# 允许通过环境变量或命令行覆盖送礼房间号，保证和 checkpk 使用同一个房间更方便
# 优先级：命令行参数 > 环境变量 > 配置文件
room_override_env = (os.getenv("THREESERVER_ROOM_ID") or "").strip()
if room_override_env:
    ROOM_ID = room_override_env
if len(sys.argv) > 1 and sys.argv[1].strip():
    ROOM_ID = sys.argv[1].strip()
COOKIE_FILE = os.getenv("BILI_COOKIE_PATH") or config.get("登录配置", {}).get("Cookie文件路径", "cookie.txt")
def resolve_cookie_path(cookie_path):
    if os.path.isabs(cookie_path):
        return cookie_path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    app_data_dir = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "BiliPKTool")
    config_dir = os.path.dirname(config_file) if config_file else None
    candidates = []
    if config_dir:
        candidates.append(os.path.join(config_dir, cookie_path))
    candidates.append(os.path.join(script_dir, cookie_path))
    candidates.append(os.path.join(app_data_dir, cookie_path))
    for p in candidates:
        if os.path.exists(p):
            return p
    return os.path.join(script_dir, cookie_path)

COOKIE_FILE = resolve_cookie_path(COOKIE_FILE)
ARROW_SELECTOR = ".gift-panel-switch"

if ROOM_ID == "0":
    print("ERROR: 送礼房间配置为0，请修改配置文件")
    sys.exit(1)

print(f"配置加载完成 - 送礼房间: {ROOM_ID}")
print(f"配置加载完成 - Cookie文件: {COOKIE_FILE}")

def load_cookies_from_txt(file_path):
    """
    兼容两种常见cookie文件：
    - Netscape cookies.txt: domain\tTRUE/FALSE\tpath\tTRUE/FALSE\texpiry\tname\tvalue
    - TSV导出/简化格式: name\tvalue\t(domain)\t(path)\t(expires)
    返回 Playwright context.add_cookies 所需的 cookie dict 列表。
    """
    from cookie_store import load_playwright_cookies
    return load_playwright_cookies(file_path)

def load_cookie_kv_from_txt(file_path: str) -> Dict[str, str]:
    """
    从 cookie.txt / Netscape cookies.txt 读取 Cookie 键值对（给 requests 用）。
    """
    from cookie_store import load_cookie_values
    return load_cookie_values(file_path)

def _make_requests_session(cookie_file: str) -> Tuple[requests.Session, Dict[str, str]]:
    cookie_kv = load_cookie_kv_from_txt(cookie_file)
    sess = requests.Session()
    ua = (os.getenv("BILI_USER_AGENT") or "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36").strip()
    sess.headers.update(
        {
            "User-Agent": ua,
            # 禁用 brotli，避免部分 Python / 环境组合的 br 解码问题
            "Accept-Encoding": "gzip, deflate",
            "Referer": f"https://live.bilibili.com/{ROOM_ID}",
            "Origin": "https://live.bilibili.com",
        }
    )
    if cookie_kv:
        sess.cookies.update(cookie_kv)
    return sess, cookie_kv

def _get_csrf(cookie_kv: Dict[str, str]) -> str:
    return (cookie_kv.get("bili_jct") or "").strip()

_http_session_lock = threading.Lock()
_http_session: Optional[requests.Session] = None
_http_cookie_kv: Dict[str, str] = {}
_room_uid_cache: Dict[str, int] = {}
_bag_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}  # room_id -> (ts, items)

def _get_http_session() -> Tuple[requests.Session, Dict[str, str]]:
    global _http_session, _http_cookie_kv
    with _http_session_lock:
        if _http_session is None:
            _http_session, _http_cookie_kv = _make_requests_session(COOKIE_FILE)
        return _http_session, _http_cookie_kv

def _http_timeout(fast: bool = False) -> Tuple[float, float]:
    # “偷塔”场景：宁愿失败也不要卡死；fast 模式再缩短
    if fast:
        return (0.8, 1.8)
    return (1.2, 3.0)

def _get_room_uid(session: requests.Session, room_id: str, *, fast: bool = False) -> Optional[int]:
    if room_id in _room_uid_cache:
        return _room_uid_cache[room_id]
    try:
        url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
        resp = session.get(url, timeout=_http_timeout(fast))
        data = resp.json()
        uid = data.get("data", {}).get("uid")
        if isinstance(uid, int) and uid > 0:
            _room_uid_cache[room_id] = uid
            return uid
    except Exception:
        return None
    return None

def _send_danmaku_http(session: requests.Session, cookie_kv: Dict[str, str], room_id: str, text: str, *, fast: bool = False) -> Dict[str, Any]:
    csrf = _get_csrf(cookie_kv)
    if not csrf:
        return {"success": False, "error": "missing_csrf(bili_jct)"}
    try:
        url = "https://api.live.bilibili.com/msg/send"
        payload = {
            "bubble": "0",
            "msg": text,
            "color": "16777215",
            "mode": "1",
            "fontsize": "25",
            "rnd": str(int(time.time())),
            "roomid": str(room_id),
            "csrf": csrf,
            "csrf_token": csrf,
        }
        resp = session.post(url, data=payload, timeout=_http_timeout(fast))
        j = resp.json()
        ok = (j.get("code") == 0)
        return {"success": ok, "status_code": resp.status_code, "raw": j}
    except Exception as e:
        return {"success": False, "error": str(e)}

def _fetch_bag_list(session: requests.Session, room_id: str, *, fast: bool = False) -> List[Dict[str, Any]]:
    # 简单缓存：避免每次送礼都拉一遍
    cache_ttl_s = float(os.getenv("BILI_BAG_CACHE_TTL", "2.0") or 2.0)
    now = time.time()
    cached = _bag_cache.get(room_id)
    if cached and now - cached[0] <= cache_ttl_s:
        return cached[1]

    endpoints = [
        "https://api.live.bilibili.com/xlive/revenue/v1/gift/bag_list",
        "https://api.live.bilibili.com/gift/v2/live/bag_list",
    ]
    for ep in endpoints:
        try:
            resp = session.get(ep, params={"room_id": str(room_id)}, timeout=_http_timeout(fast))
            j = resp.json()
            data = j.get("data") or {}
            items = data.get("list") or data.get("bag_list") or []
            if isinstance(items, list):
                _bag_cache[room_id] = (now, items)
                return items
        except Exception:
            continue
    _bag_cache[room_id] = (now, [])
    return []

def _send_gift_http(
    session: requests.Session,
    cookie_kv: Dict[str, str],
    *,
    room_id: str,
    ruid: int,
    gift_id: str,
    count: int,
    fast: bool,
) -> Dict[str, Any]:
    csrf = _get_csrf(cookie_kv)
    if not csrf:
        return {"id": str(gift_id), "count": count, "success": False, "error": "missing_csrf(bili_jct)"}

    # 先尝试用背包（如果有），避免走付费路径
    prefer_bag = str(os.getenv("BILI_GIFTSEND_PREFER_BAG", "1") or "1").strip().lower() not in ("0", "false", "no", "n", "off")
    bag_items = _fetch_bag_list(session, room_id, fast=fast) if prefer_bag else []

    remaining = int(count)
    results: List[Dict[str, Any]] = []

    def _provider_transaction_id(body: Dict[str, Any]) -> Optional[str]:
        data = body.get("data") if isinstance(body, dict) else None
        candidates = [body, data] if isinstance(data, dict) else [body]
        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            for key in ("transaction_id", "transactionId", "order_id", "orderId", "tid"):
                value = candidate.get(key)
                if isinstance(value, (str, int)) and 1 <= len(str(value)) <= 200:
                    return str(value)
        return None

    def _post_sendgift(payload: Dict[str, Any]) -> Tuple[bool, int, Dict[str, Any], bool]:
        endpoint = "https://api.live.bilibili.com/xlive/revenue/v1/gift/sendGift"
        try:
            resp = session.post(endpoint, data=payload, timeout=_http_timeout(fast))
            try:
                body = resp.json()
            except Exception:
                return False, resp.status_code, {"code": -1, "message": "invalid_provider_response"}, True
            if body.get("code") == 0:
                return True, resp.status_code, body, False
            return False, resp.status_code, body, False
        except Exception as error:
            # A timeout or broken response can happen after the provider has
            # accepted the gift. Retrying another endpoint could send twice.
            return False, 0, {"code": -1, "message": type(error).__name__}, True

    # 使用背包分片发送
    if bag_items and remaining > 0:
        for it in bag_items:
            try:
                if str(it.get("gift_id")) != str(gift_id):
                    continue
                bag_id = it.get("bag_id") or it.get("id")
                gift_num = int(it.get("gift_num") or it.get("num") or 0)
                if not bag_id or gift_num <= 0:
                    continue
                n = min(remaining, gift_num)
                payload = {
                    "gift_id": str(gift_id),
                    "room_id": str(room_id),
                    "roomid": str(room_id),
                    "ruid": str(ruid),
                    "num": str(n),
                    "gift_num": str(n),
                    "bag_id": str(bag_id),
                    "biz_id": str(room_id),
                    "platform": "pc",
                    "csrf": csrf,
                    "csrf_token": csrf,
                }
                ok, status_code, raw, outcome_uncertain = _post_sendgift(payload)
                results.append({
                    "id": str(gift_id), "count": n, "success": ok,
                    "status_code": status_code, "mode": "bag",
                    "provider_transaction_id": _provider_transaction_id(raw),
                    "outcome_uncertain": outcome_uncertain,
                })
                if ok:
                    remaining -= n
                else:
                    # Never fall through to a paid send after an ambiguous bag
                    # response; that would be an automatic duplicate attempt.
                    if outcome_uncertain:
                        remaining = 0
                    break
                if remaining <= 0:
                    break
            except Exception:
                continue

    # 剩余数量：尝试直接 sendGift（可能会消耗电池/或被拒）
    if remaining > 0:
        payload = {
            "gift_id": str(gift_id),
            "room_id": str(room_id),
            "roomid": str(room_id),
            "ruid": str(ruid),
            "num": str(remaining),
            "gift_num": str(remaining),
            "bag_id": "0",
            "biz_id": str(room_id),
            "platform": "pc",
            "csrf": csrf,
            "csrf_token": csrf,
        }
        ok, status_code, raw, outcome_uncertain = _post_sendgift(payload)
        results.append({
            "id": str(gift_id), "count": remaining, "success": ok,
            "status_code": status_code, "mode": "direct",
            "provider_transaction_id": _provider_transaction_id(raw),
            "outcome_uncertain": outcome_uncertain,
        })

    # 兼容 threeserver 既有返回格式：单个礼物也返回一条（或多条分片）
    if len(results) == 1:
        return results[0]
    return {
        "id": str(gift_id),
        "count": count,
        "success": all(r.get("success") for r in results),
        "outcome_uncertain": any(r.get("outcome_uncertain") for r in results),
        "mode": "split",
        "provider_transaction_ids": [
            r.get("provider_transaction_id") for r in results
            if r.get("provider_transaction_id")
        ],
        "parts": results,
    }

def _send_gifts_batch_http(gift_list: List[Any], *, fast: bool = False) -> List[Dict[str, Any]]:
    session, cookie_kv = _get_http_session()
    room_id = str(ROOM_ID)
    ruid = _get_room_uid(session, room_id, fast=fast)
    if not ruid:
        return [{"id": str(item.get("id") if isinstance(item, dict) else item), "success": False, "error": "missing_room_uid"} for item in gift_list]

    results: List[Dict[str, Any]] = []
    for item in gift_list:
        if isinstance(item, dict):
            gid = str(item.get("id") or item.get("gift_id") or item.get("giftId") or item.get("gid") or "")
            cnt = int(item.get("count") or 1)
        else:
            gid = str(item)
            cnt = 1
        if not gid:
            results.append({"id": "", "count": cnt, "success": False, "error": "missing_gift_id"})
            continue
        results.append(_send_gift_http(session, cookie_kv, room_id=room_id, ruid=int(ruid), gift_id=gid, count=cnt, fast=fast))
    return results

def run_http_worker():
    """
    HTTP giftsend 后端：不依赖 Playwright，直接用 B站接口送礼/发弹幕。
    其他脚本仍然走 threeserver 的 /send、/danmaku，不用改调用方。
    """
    print("✅ Three server 启动：HTTP giftsend 后端")
    print(f"🎯 当前送礼房间: {ROOM_ID}")
    print(f"🍪 cookie来源: {COOKIE_FILE}")

    while True:
        if gift_queue:
            gifts_to_send: List[Any] = []
            special_items: List[Any] = []
            batch_requests: List[Dict[str, Any]] = []

            for item in drain_queue():
                if isinstance(item, dict):
                    if "gifts" in item:
                        batch_requests.append(item)
                        continue
                    special_items.append(item)
                else:
                    gifts_to_send.append(item)

            # 优先处理送礼（降低排队延迟）
            for item in batch_requests:
                gift_list = item.get("gifts", [])
                req_id = item.get("request_id")
                fast = bool(item.get("fast"))
                _confirm = str(item.get("confirm") or "click").strip().lower()
                if req_id:
                    with request_lock:
                        st = request_status.get(req_id)
                        if st is not None:
                            st["status"] = "sending"
                            st["sending_ts"] = st.get("sending_ts") or time.time()
                            st["updated_ts"] = time.time()

                # HTTP backend already waits for B站接口返回；confirm 参数仅用于标注
                results = _send_gifts_batch_http(gift_list, fast=fast)
                storage = item.get("result_storage")
                if storage is not None:
                    storage["results"] = results
                    storage["success_count"] = sum(1 for r in results if r.get("success"))
                    storage["failed_count"] = len(results) - storage["success_count"]

                if req_id:
                    with request_lock:
                        st = request_status.get(req_id)
                        if st is not None:
                            st["status"] = "done"
                            st["results"] = results
                            st["done_ts"] = time.time()
                            st["updated_ts"] = time.time()

                event = item.get("result_event")
                if event:
                    event.set()

            # 兼容旧逻辑：队列里直接塞 gift_id
            if gifts_to_send:
                _send_gifts_batch_http(gifts_to_send, fast=False)

            # 弹幕/余额等
            session, cookie_kv = _get_http_session()
            for item in special_items:
                if isinstance(item, dict) and "danmaku" in item:
                    text = str(item["danmaku"])
                    res = _send_danmaku_http(session, cookie_kv, str(ROOM_ID), text, fast=True)
                    ok = res.get("success")
                    if ok:
                        print("✅ 弹幕发送成功")
                    else:
                        print(f"❌ 弹幕发送失败: {res}")
                # balance checks: noop in HTTP backend
        else:
            time.sleep(0.001)

def check_balance_insufficient(page):
    """检测页面是否出现余额不足提示或读取当前余额"""
    if not BALANCE_CHECK_ENABLED:
        return False
    try:
        # 首先尝试读取当前余额
        balance_info = get_current_balance(page)
        if balance_info is not None:
            current_balance = balance_info
            logger.info(f"💰 当前余额: {current_balance} B币")

            # 如果余额过低（小于1），认为余额不足
            if current_balance < 1:
                logger.warning(f"🚫 余额过低: {current_balance} B币")
                return True

        # 检查常见的余额不足提示
        insufficient_selectors = [
            ".insufficient-balance",  # 余额不足类名
            "[class*='insufficient']",  # 包含insufficient的类名
            "text='余额不足'",  # 直接文本匹配
            "text='B币不足'",
            "text='电池不足'",
            ".toast-message",  # 通用toast消息
            ".error-message",  # 错误消息
            ".gift-send-error"  # 送礼错误
        ]

        for selector in insufficient_selectors:
            if page.locator(selector).count() > 0:
                element = page.locator(selector).first
                if element.is_visible():
                    text_content = element.text_content() or ""
                    # 只在明确出现“不足/充值”等关键词时才判定余额不足，避免仅因出现“余额/电池”字样误判
                    if any(keyword in text_content for keyword in ["余额不足", "电池不足", "B币不足", "不足", "充值"]):
                        logger.warning(f"🚫 检测到余额不足提示: {text_content}")
                        return True

        return False
    except Exception as e:
        logger.error(f"检测余额状态失败: {e}")
        return False

def get_current_balance(page):
    """获取当前B币余额"""
    if not BALANCE_CHECK_ENABLED:
        return None
    try:
        print("[余额检测] 开始查找余额信息...")
        logger.info("[余额检测] 开始查找余额信息...")

        # 首先调试页面内容，看看都有什么元素
        try:
            # 查找所有包含"余额"文字的元素
            all_balance_elements = page.locator("text=余额").all()
            print(f"[余额检测] 找到 {len(all_balance_elements)} 个包含'余额'的元素")
            logger.info(f"[余额检测] 找到 {len(all_balance_elements)} 个包含'余额'的元素")

            for i, element in enumerate(all_balance_elements):
                try:
                    if element.is_visible():
                        text = element.text_content() or ""
                        print(f"[余额检测] 余额元素{i}: '{text}'")
                        logger.info(f"[余额检测] 余额元素{i}: '{text}'")

                        # 尝试提取数字
                        import re
                        match = re.search(r'(?:余额|电池)[:\s]*(\d+)', text)
                        if match:
                            balance = int(match.group(1))
                            print(f"✅ [余额检测] 找到余额: {balance} B币")
                            logger.info(f"✅ [余额检测] 找到余额: {balance} B币")
                            return balance
                except Exception as e:
                    print(f"[余额检测] 处理元素{i}失败: {e}")
                    logger.info(f"[余额检测] 处理元素{i}失败: {e}")

        except Exception as e:
            print(f"[余额检测] 查找余额元素失败: {e}")
            logger.info(f"[余额检测] 查找余额元素失败: {e}")

        # 尝试你提供的具体选择器
        balance_selectors = [
            ".balance-info .title",  # 余额信息标题
            "[data-v-2e691f81].title",  # 带data-v属性的标题
            ".balance-info",  # 余额信息容器
            "[class*='balance']",  # 包含balance的类名
            ".title",  # 所有title类
        ]

        for selector in balance_selectors:
            try:
                count = page.locator(selector).count()
                print(f"[余额检测] 选择器 '{selector}' 找到 {count} 个元素")
                logger.info(f"[余额检测] 选择器 '{selector}' 找到 {count} 个元素")

                if count > 0:
                    for i in range(count):
                        element = page.locator(selector).nth(i)
                        if element.is_visible():
                            balance_text = element.text_content() or ""
                            print(f"[余额检测] 选择器'{selector}' 元素{i}文本: '{balance_text}'")
                            logger.info(f"[余额检测] 选择器'{selector}' 元素{i}文本: '{balance_text}'")

                            # 提取数字 "余额: 811" -> 811
                            import re
                            match = re.search(r'(?:余额|电池)[:\s]*(\d+)', balance_text)
                            if match:
                                balance = int(match.group(1))
                                print(f"📊 [余额检测] 解析余额成功: {balance} B币")
                                logger.info(f"📊 [余额检测] 解析余额成功: {balance} B币")
                                return balance
            except Exception as e:
                print(f"[余额检测] 选择器 '{selector}' 处理失败: {e}")
                logger.info(f"[余额检测] 选择器 '{selector}' 处理失败: {e}")

        print("[余额检测] ❌ 所有方法都未找到余额信息")
        logger.warning("[余额检测] ❌ 所有方法都未找到余额信息")
        return None

    except Exception as e:
        print(f"[余额检测] 获取余额失败: {e}")
        logger.error(f"[余额检测] 获取余额失败: {e}")
        return None

def check_gift_send_result(page, gift_id, max_wait=3):
    """检查送礼结果"""
    try:
        # 等待可能的弹窗或提示
        time.sleep(max_wait)

        # 检查是否余额不足
        if check_balance_insufficient(page):
            return {"success": False, "reason": "insufficient_balance"}

        # 检查是否有其他错误提示
        error_selectors = [".error-tip", ".toast-error", ".gift-error", "[class*='error']"]
        for selector in error_selectors:
            if page.locator(selector).count() > 0:
                element = page.locator(selector).first
                if element.is_visible():
                    error_text = element.text_content() or ""
                    logger.warning(f"⚠️ 送礼错误提示: {error_text}")
                    return {"success": False, "reason": "other_error", "message": error_text}

        # 检查成功提示（如果有的话）
        success_selectors = [".gift-success", ".send-success"]
        for selector in success_selectors:
            if page.locator(selector).count() > 0:
                element = page.locator(selector).first
                if element.is_visible():
                    success_text = element.text_content() or ""
                    logger.info(f"✅ 送礼成功提示: {success_text}")
                    return {"success": True, "message": success_text}

        return {
            "success": False,
            "reason": "provider_confirmation_missing",
            "outcome_uncertain": True,
        }

    except Exception as e:
        logger.error(f"检查送礼结果失败: {e}")
        return {"success": False, "reason": "check_failed", "error": str(e)}

def update_balance_status(success, reason=""):
    """更新余额状态"""
    if not BALANCE_CHECK_ENABLED:
        return
    global balance_status
    current_time = int(time.time())

    with balance_lock:
        if not success and reason == "insufficient_balance":
            balance_status["insufficient"] = True
            balance_status["consecutive_failures"] += 1
            balance_status["total_failed_gifts"] += 1
            balance_status["last_check"] = current_time
            logger.error(f"🚫 余额不足！连续失败次数: {balance_status['consecutive_failures']}")

            # 发送通知（可以扩展为邮件、微信等）
            if balance_status["consecutive_failures"] == 1:
                logger.critical("🚨 首次检测到余额不足，建议立即充值！")
        elif success:
            # 成功时自动解除余额不足状态
            if balance_status.get("insufficient"):
                logger.info("✅ 送礼/检测成功，自动解除余额不足状态")
            balance_status["insufficient"] = False
            balance_status["consecutive_failures"] = 0
            balance_status["last_check"] = current_time
        else:
            # 其他错误情况
            balance_status["consecutive_failures"] += 1
            balance_status["last_check"] = current_time
            logger.warning(f"⚠️ 送礼失败，原因: {reason}")

@app.route("/send", methods=["POST"])
def send_gifts():
    import uuid
    data = request.get_json(silent=True) or {}
    gifts = data.get("gifts", [])
    wait = bool(data.get("wait", True))
    fast = bool(data.get("fast", False) or (not wait))
    confirm = str(data.get("confirm") or data.get("wait_mode") or "click").strip().lower()
    if not isinstance(gifts, list) or not 1 <= len(gifts) <= MAX_GIFTS_PER_REQUEST:
        return jsonify({"error": "invalid_gifts"}), 400

    normalized_gifts = []
    total_count = 0
    for item in gifts:
        if isinstance(item, dict):
            gift_id = str(item.get("id") or item.get("gift_id") or "")
            count = item.get("count", 1)
        else:
            gift_id = str(item)
            count = 1
        if (not gift_id.isdigit() or gift_id not in ALLOWED_GIFT_IDS
                or isinstance(count, bool) or not isinstance(count, int)
                or count < 1 or count > MAX_GIFT_COUNT_PER_ITEM):
            return jsonify({"error": "gift_not_allowed"}), 400
        total_count += count
        if total_count > MAX_TOTAL_GIFT_COUNT:
            return jsonify({"error": "gift_limit_exceeded"}), 400
        normalized_gifts.append({"id": gift_id, "count": count})
    gifts = normalized_gifts
    if confirm not in ("click", "api"):
        return jsonify({"error": "invalid_confirmation_mode"}), 400
    if not cleanup_request_status():
        return jsonify({"error": "request_status_capacity_reached"}), 503

    # 简化：直接添加到队列，不考虑房间ID（硬送：不做余额/不足检查）

    import threading
    request_id = str(uuid.uuid4())
    result_event = threading.Event()
    # total 兼容：既支持 ["33988","33988"] 也支持 [{"id":"33988","count":100}]
    result_storage = {
        "request_id": request_id,
        "total": total_count,
        "results": [],
        "success_count": 0,
        "failed_count": 0
    }
    created_ts = time.time()
    with request_lock:
        request_status[request_id] = {
            "status": "queued",
            "results": [],
            "created_ts": created_ts,
            "updated_ts": created_ts,
            "received_ts": created_ts,
            "sending_ts": None,
            "done_ts": None,
            "backend": THREESERVER_BACKEND,
            "confirm": confirm,
        }
    if not enqueue_item({
        "gifts": gifts,
        "request_id": request_id,
        "fast": fast,
        "confirm": confirm,
        "result_event": result_event if wait else None,
        "result_storage": result_storage
    }):
        with request_lock:
            request_status.pop(request_id, None)
        return jsonify({"error": "sender_queue_full"}), 503

    from datetime import datetime
    receive_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
    print(f"收到送礼请求: {gifts}")
    print(f"[时间] 📥 {receive_time} HTTP接收完成，等待送礼结果")

    if not wait:
        return jsonify({"success": True, "status": "queued", "request_id": request_id, "timing": {"received_ts": created_ts}}), 202

    wait_timeout = 20 if confirm == "api" else 10
    if result_event.wait(timeout=wait_timeout):
        results_list = result_storage.get("results") or []
        outcome_uncertain = any(
            isinstance(item, dict) and (
                item.get("outcome_uncertain")
                or any(
                    isinstance(part, dict) and part.get("outcome_uncertain")
                    for part in (item.get("parts") or [])
                )
            )
            for item in results_list
        )
        all_success = bool(results_list) \
            and result_storage["failed_count"] == 0 \
            and not outcome_uncertain
        with request_lock:
            st = request_status.get(request_id) or {}
            timing = {
                "received_ts": st.get("received_ts") or st.get("created_ts"),
                "sending_ts": st.get("sending_ts"),
                "done_ts": st.get("done_ts"),
            }
        if all_success:
            transaction_ids = []
            for item in results_list:
                if not isinstance(item, dict):
                    continue
                if item.get("provider_transaction_id"):
                    transaction_ids.append(str(item["provider_transaction_id"]))
                transaction_ids.extend(str(value) for value in item.get("provider_transaction_ids", []) if value)
            return jsonify({
                "success": True,
                "status": "ok",
                "request_id": request_id,
                "results": result_storage["results"],
                "provider_transaction_ids": list(dict.fromkeys(transaction_ids)),
                "provider_transaction_id": transaction_ids[0] if len(transaction_ids) == 1 else None,
                "timing": timing,
            })
        # Keep the provider result in JSON. Callers must not automatically
        # retry a partial or uncertain external mutation.
        return jsonify({
            "success": False,
            "status": "partial_failed",
            "error": "部分礼物发送失败",
            "request_id": request_id,
            "results": result_storage["results"],
            "failed_count": result_storage["failed_count"],
            "outcome_uncertain": outcome_uncertain,
            "timing": timing,
        }), 200

    return jsonify({
        "success": False,
        "error": "送礼超时",
        "outcome_uncertain": True,
        "request_id": request_id,
        "results": result_storage["results"],
        "timing": {"received_ts": created_ts},
    }), 504


@app.route("/result/<request_id>", methods=["GET"])
def get_send_result(request_id: str):
    with request_lock:
        st = request_status.get(request_id)
        if not st:
            return jsonify({"success": False, "error": "not_found", "request_id": request_id}), 404
        return jsonify({"success": True, "request_id": request_id, **st})

@app.route("/danmaku", methods=["POST"])
def send_danmaku():
    data = request.get_json()
    text = data.get("text", "")
    if not text:
        return jsonify({"error": "Empty text"}), 400

    if len(text) > 100 or not enqueue_item({"danmaku": text}):
        return jsonify({"error": "sender_queue_full_or_invalid"}), 503
    print(f"收到弹幕请求: {text}")
    return jsonify({"status": "ok", "text": text})

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "running",
        "backend": THREESERVER_BACKEND,
        "room_id": ROOM_ID,
        "balance_check_enabled": BALANCE_CHECK_ENABLED,
        "queue_length": len(gift_queue)
    })

@app.route("/balance", methods=["GET"])
def get_balance_status():
    """获取余额状态"""
    return jsonify({"enabled": BALANCE_CHECK_ENABLED})

@app.route("/reset_balance", methods=["POST"])
def reset_balance_status():
    """重置余额状态（充值后调用）"""
    return jsonify({"status": "noop", "enabled": BALANCE_CHECK_ENABLED})

@app.route("/current_balance", methods=["GET"])
def get_current_balance_api():
    """获取当前页面显示的电池余额（实时查询）"""
    if THREESERVER_BACKEND in ("http", "giftsend", "api"):
        return jsonify({"success": False, "error": "not_supported_in_http_backend"}), 503
    if not BALANCE_CHECK_ENABLED:
        return jsonify({"success": False, "error": "balance_check_disabled"}), 503
    try:
        # 添加一个标志来等待结果
        import threading
        import uuid

        request_id = str(uuid.uuid4())
        result_event = threading.Event()
        balance_result = {"balance": None, "success": False}

        # 请求浏览器线程查询余额
        if not enqueue_item({
            "check_balance": True,
            "request_id": request_id,
            "result_event": result_event,
            "result_storage": balance_result
        }):
            return jsonify({"success": False, "error": "sender_queue_full"}), 503

        # 等待结果（最多等待5秒）
        if result_event.wait(timeout=5):
            if balance_result["success"]:
                return jsonify({
                    "success": True,
                    "balance": balance_result["balance"],
                    "currency": "电池",
                    "timestamp": int(time.time())
                })
            else:
                return jsonify({
                    "success": False,
                    "error": "余额查询失败",
                    "timestamp": int(time.time())
                })
        else:
            return jsonify({
                "success": False,
                "error": "余额查询超时",
                "timestamp": int(time.time())
            }), 408

    except Exception as e:
        return jsonify({
            "success": False,
            "error": str(e),
            "timestamp": int(time.time())
        }), 500

def run_flask():
    port = int(os.getenv("THREESERVER_PORT", "9876"))
    app.run(host="127.0.0.1", port=port)  # 使用IP地址

def run_browser():
    global page  # 让页面对象全局可访问
    if sync_playwright is None:
        raise RuntimeError(f"Playwright not available: {_playwright_import_error}")
    with sync_playwright() as p:
        print("🚀 启动送礼服务器...")
        browser = None
        context = None
        slow_mo_ms = int(os.getenv("THREESERVER_SLOW_MO", "0") or 0)
        if slow_mo_ms < 0:
            slow_mo_ms = 0

        def init_browser():
            nonlocal browser, context
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass
            browser = p.chromium.launch(headless=False, slow_mo=slow_mo_ms)
            context = browser.new_context()
            page_obj = context.new_page()

            print("🍪 注入 cookie...")
            cookies = load_cookies_from_txt(COOKIE_FILE)
            page_obj.goto("https://www.bilibili.com/")
            page_obj.context.add_cookies(cookies)
            time.sleep(1)

            print(f"🏠 进入房间 {ROOM_ID}...")
            page_obj.goto(f"https://live.bilibili.com/{ROOM_ID}")
            page_obj.wait_for_load_state("domcontentloaded")

            print("📦 等待礼物面板加载...")
            for _ in range(20):
                if page_obj.query_selector(".gift-panel"):
                    break
                time.sleep(0.5)

            print("➡️ 点击展开箭头...")
            try:
                page_obj.evaluate(f'''
                    () => {{
                        const el = document.querySelector('{ARROW_SELECTOR}');
                        if (!el) return false;
                        const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                        el.dispatchEvent(evt);
                        return true;
                    }}
                ''')
                time.sleep(1.5)
                print("✅ 礼物面板已展开")
            except Exception as e:
                print(f"⚠️ 箭头点击可能失败: {e}")

            return page_obj

        page = init_browser()

        print("✅ Three server 预热完成，等待礼物指令...")
        print(f"🎯 当前送礼房间: {ROOM_ID}")

        def send_gifts_batch(gift_list, *, fast=False, confirm: str = "click"):
            if not gift_list:
                return []
            if page is None or page.is_closed():
                logger.warning("♻️ 页面已关闭，正在重启浏览器...")
                try:
                    page_obj = init_browser()
                    globals()["page"] = page_obj
                except Exception as e:
                    logger.error(f"❌ 重启浏览器失败: {e}")
                    return [{"id": gift_id, "success": False, "error": "browser_closed"} for gift_id in gift_list]

            process_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            try:
                total = 0
                for item in gift_list:
                    if isinstance(item, dict):
                        total += int(item.get("count") or 1)
                    else:
                        total += 1
            except Exception:
                total = len(gift_list)
            print(f"🎯 JavaScript批量发送 {total} 个礼物...")
            print(f"[时间] ⚡ {process_time} 开始处理队列中的礼物")
            gift_actions_js = json.dumps(gift_list, ensure_ascii=False)
            click_delay_ms = int(os.getenv("GIFT_CLICK_DELAY_MS", "0") or 0)
            if click_delay_ms < 0:
                click_delay_ms = 0
            try_bulk = str(os.getenv("GIFT_TRY_BULK_SEND", "1") or "1").strip().lower() not in ("0", "false", "no", "n", "off")

            confirm_mode = str(confirm or "click").strip().lower()
            if confirm_mode == "api" and len(gift_list) != 1:
                # confirm=api is intended for single-gift latency tests; fall back to normal behavior for batches.
                confirm_mode = "click"

            def _is_sendgift_request(req) -> bool:
                try:
                    if (req.method or "").upper() != "POST":
                        return False
                    url = req.url or ""
                    u = url.lower()
                    # Broader match to tolerate endpoint/host changes.
                    # Known examples:
                    # - https://api.live.bilibili.com/xlive/revenue/v1/gift/sendGift
                    # - https://api.live.bilibili.com/xlive/web-room/v1/gift/sendGift
                    # - https://api.live.bilibili.com/xlive/web-room/v1/gift/send
                    # - https://api.live.bilibili.com/gift/v2/Live/send
                    if "sendgift" in u:
                        return True
                    if "/gift/" in u and "send" in u:
                        return True
                    return False
                except Exception:
                    return False

            def _trigger_single_gift(force_send_button: bool) -> list:
                # Trigger UI send in the page; force_send_button tries clicking the explicit "赠送" button too.
                return page.evaluate(
                    f"""
                    async () => {{
                        const giftActions = {gift_actions_js};
                        const results = [];
                        const clickDelayMs = {click_delay_ms};
                        function clickEl(el) {{
                            const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                            el.dispatchEvent(evt);
                        }}
                        function sleep(ms) {{ return new Promise(resolve => setTimeout(resolve, ms)); }}
                        function isVisible(el) {{
                            if (!el) return false;
                            const rect = el.getBoundingClientRect();
                            if (rect.width <= 0 || rect.height <= 0) return false;
                            const style = window.getComputedStyle(el);
                            if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
                            return true;
                        }}
                        function ensureGiftPanelOpen() {{
                            const panel = document.querySelector('.gift-panel');
                            if (panel) {{
                                try {{
                                    const rect = panel.getBoundingClientRect();
                                    if (rect.width > 10 && rect.height > 10) return;
                                }} catch (e) {{}}
                            }}
                            const arrow = document.querySelector('.gift-panel-switch');
                            if (arrow) {{ try {{ clickEl(arrow); }} catch (e) {{}} }}
                        }}
                        function tryFindGift(giftId) {{
                            const idStr = String(giftId);
                            const selectors = [
                                '.gift-id-' + idStr,
                                '[data-gift-id=\"' + idStr + '\"]',
                                '[data-giftid=\"' + idStr + '\"]',
                                '[data-id=\"' + idStr + '\"]',
                                '[gift-id=\"' + idStr + '\"]',
                                '[giftid=\"' + idStr + '\"]',
                                '[class*=\"gift-id-' + idStr + '\"]',
                            ];
                            for (const sel of selectors) {{
                                const el = document.querySelector(sel);
                                if (el) return el;
                            }}
                            return null;
                        }}
                        function findGiftPanelRoot() {{
                            return document.querySelector('.gift-panel') || document.body;
                        }}
                        function clickSendButton(root) {{
                            const candidates = Array.from(root.querySelectorAll('button,div,a')).filter(isVisible);
                            const texts = ['赠送', '送出', '发送', '连送', '送礼'];
                            for (const el of candidates) {{
                                const txt = (el.textContent || '').trim();
                                const cls = (el.className || '').toLowerCase();
                                if (cls.includes('send') && txt) {{
                                    try {{ clickEl(el); return true; }} catch (e) {{}}
                                }}
                                if (texts.some(t => txt.includes(t))) {{
                                    try {{ clickEl(el); return true; }} catch (e) {{}}
                                }}
                            }}
                            return false;
                        }}

                        ensureGiftPanelOpen();
                        const action = giftActions[0];
                        const giftId = (action && typeof action === 'object') ? String(action.id ?? action.gift_id ?? action.giftId ?? action.gid ?? action) : String(action);
                        const count = (action && typeof action === 'object') ? Math.max(1, Number(action.count ?? 1)) : 1;
                        let el = document.querySelector('.gift-id-' + giftId) || tryFindGift(giftId);
                        if (!el) {{
                            results.push({{id: giftId, count, success: false, error: 'not_found'}});
                            return results;
                        }}
                        try {{
                            clickEl(el);
                            if (clickDelayMs > 0) await sleep(clickDelayMs);
                        }} catch (e) {{
                            results.push({{id: giftId, count, success: false, error: 'click_failed'}});
                            return results;
                        }}
                        let sendClicked = false;
                        if ({str(force_send_button).lower()} ) {{
                            const root = findGiftPanelRoot();
                            sendClicked = clickSendButton(root);
                            if (clickDelayMs > 0) await sleep(clickDelayMs);
                        }}
                        results.push({{id: giftId, count, success: true, mode: sendClicked ? 'send_button' : 'click'}});
                        return results;
                    }}
                    """
                )

            try:
                resp_obj = None
                api_json = None
                api_ok = None
                api_code = None
                api_url = None
                api_ms = None

                if confirm_mode == "api":
                    # Stage 1: click gift and see if a giftsend request is fired.
                    t0 = time.perf_counter()
                    req = None
                    results = []
                    try:
                        with page.expect_request(_is_sendgift_request, timeout=1200) as req_info:
                            results = _trigger_single_gift(False)
                        req = req_info.value
                    except Exception:
                        req = None
                        try:
                            with page.expect_request(_is_sendgift_request, timeout=2500) as req_info2:
                                results = _trigger_single_gift(True)
                            req = req_info2.value
                        except Exception:
                            req = None
                            results = _trigger_single_gift(True)

                    if req is not None:
                        try:
                            resp_obj = page.wait_for_response(lambda r: r.request == req, timeout=15000)
                        except Exception:
                            resp_obj = None

                    if resp_obj is not None:
                        t1 = time.perf_counter()
                        api_ms = (t1 - t0) * 1000.0
                        try:
                            api_url = resp_obj.url
                        except Exception:
                            api_url = None
                        try:
                            api_json = resp_obj.json()
                        except Exception:
                            api_json = None
                        if isinstance(api_json, dict):
                            api_code = api_json.get("code")
                            api_ok = api_code == 0
                    else:
                        api_ms = None

                    # For UI sending, the click itself may be enough to actually send; if we can't
                    # observe the network response, treat it as "sent_but_unconfirmed" instead of failure.
                    for r in results:
                        if isinstance(r, dict):
                            r["confirm"] = "api"
                            r["api_ms"] = api_ms
                            r["api_ok"] = api_ok
                            r["api_code"] = api_code
                            r["api_url"] = api_url
                            r["api_raw"] = api_json if isinstance(api_json, dict) else None
                            if api_ok is True:
                                r["success"] = True
                                r.pop("error", None)
                                r["confirm_status"] = "confirmed"
                            elif api_ok is False:
                                r["success"] = False
                                r["error"] = r.get("error") or f"api_code_{api_code}"
                                r["confirm_status"] = "rejected"
                            else:
                                r["success"] = False
                                r["outcome_uncertain"] = True
                                r["confirm_status"] = "unconfirmed"
                                r["error"] = r.get("error") or "no_api_response"
                else:
                    results = page.evaluate(
                        f'''
                        async () => {{
                            const giftActions = {gift_actions_js};
                        const results = [];
                        const clickDelayMs = {click_delay_ms};
                        const tryBulk = {str(try_bulk).lower()};
                        const fastMode = {str(bool(fast)).lower()};

                        const enableFallbackScroll = (!fastMode) && !(['0','false','False','no','NO'].includes(String(window.__GIFT_FALLBACK_SCROLL__ ?? '{os.getenv("GIFT_FALLBACK_SCROLL","1")}')));

                        function clickEl(el) {{
                            const evt = new MouseEvent('click', {{ bubbles: true, cancelable: true, view: window }});
                            el.dispatchEvent(evt);
                        }}

                        function sleep(ms) {{
                            return new Promise(resolve => setTimeout(resolve, ms));
                        }}

                        function ensureGiftPanelOpen() {{
                            // Avoid toggling panel if it's already visible (toggling can cost seconds).
                            const panel = document.querySelector('.gift-panel');
                            if (panel) {{
                                try {{
                                    const rect = panel.getBoundingClientRect();
                                    if (rect.width > 10 && rect.height > 10) return;
                                }} catch (e) {{}}
                            }}
                            const arrow = document.querySelector('.gift-panel-switch');
                            if (arrow) {{
                                try {{ clickEl(arrow); }} catch (e) {{}}
                            }}
                        }}

                        function findScrollableContainer() {{
                            const candidates = [
                                document.querySelector('.gift-panel'),
                                document.querySelector('.gift-panel .gift-list'),
                                document.querySelector('.gift-panel .gift-list-wrap'),
                                document.querySelector('.gift-panel [class*="list"]'),
                                document.querySelector('.gift-panel [class*="scroll"]'),
                            ].filter(Boolean);
                            for (const el of candidates) {{
                                if (el && el.scrollHeight && el.clientHeight && el.scrollHeight > el.clientHeight + 10) return el;
                            }}
                            return candidates[0] || null;
                        }}

                        function tryFindGift(giftId) {{
                            const idStr = String(giftId);
                            const selectors = [
                                '.gift-id-' + idStr,
                                '[data-gift-id="' + idStr + '"]',
                                '[data-giftid="' + idStr + '"]',
                                '[data-id="' + idStr + '"]',
                                '[gift-id="' + idStr + '"]',
                                '[giftid="' + idStr + '"]',
                                '[class*="gift-id-' + idStr + '"]',
                            ];
                            for (const sel of selectors) {{
                                const el = document.querySelector(sel);
                                if (el) return el;
                            }}
                            return null;
                        }}

                        function isVisible(el) {{
                            if (!el) return false;
                            const rect = el.getBoundingClientRect();
                            if (rect.width <= 0 || rect.height <= 0) return false;
                            const style = window.getComputedStyle(el);
                            if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
                            return true;
                        }}

                        function findGiftPanelRoot() {{
                            return document.querySelector('.gift-panel') || document.body;
                        }}

                        function findCountInput(root) {{
                            const inputs = Array.from(root.querySelectorAll('input')).filter(isVisible);
                            // Heuristic: prefer number-like inputs
                            for (const el of inputs) {{
                                const t = (el.getAttribute('type') || '').toLowerCase();
                                const cls = (el.className || '').toLowerCase();
                                if (t === 'number' || cls.includes('num') || cls.includes('count') || cls.includes('gift')) return el;
                            }}
                            return inputs[0] || null;
                        }}

                        function setCountViaInput(inputEl, count) {{
                            try {{
                                inputEl.focus();
                                inputEl.value = String(count);
                                inputEl.dispatchEvent(new Event('input', {{ bubbles: true }}));
                                inputEl.dispatchEvent(new Event('change', {{ bubbles: true }}));
                                return true;
                            }} catch (e) {{
                                return false;
                            }}
                        }}

                        function clickSendButton(root) {{
                            const candidates = Array.from(root.querySelectorAll('button,div,a')).filter(isVisible);
                            const texts = ['赠送', '送出', '发送', '连送', '送礼'];
                            for (const el of candidates) {{
                                const txt = (el.textContent || '').trim();
                                const cls = (el.className || '').toLowerCase();
                                if (cls.includes('send') && txt) {{
                                    try {{ clickEl(el); return true; }} catch (e) {{}}
                                }}
                                if (texts.some(t => txt.includes(t))) {{
                                    try {{ clickEl(el); return true; }} catch (e) {{}}
                                }}
                            }}
                            return false;
                        }}

                        async function sendByRepeatClick(el, giftId, count) {{
                            let ok = 0;
                            for (let i = 0; i < count; i++) {{
                                try {{
                                    clickEl(el);
                                    ok++;
                                }} catch (e) {{}}
                                if (clickDelayMs > 0) await sleep(clickDelayMs);
                            }}
                            return ok === count;
                        }}

                        async function trySendBulkOnce(el, giftId, count) {{
                            try {{
                                clickEl(el);
                                if (clickDelayMs > 0) await sleep(clickDelayMs);
                            }} catch (e) {{
                                return {{ ok: false, reason: 'click_failed' }};
                            }}
                            const root = findGiftPanelRoot();
                            const inputEl = findCountInput(root);
                            if (!inputEl) return {{ ok: false, reason: 'no_count_input' }};
                            if (!setCountViaInput(inputEl, count)) return {{ ok: false, reason: 'set_count_failed' }};
                            if (clickDelayMs > 0) await sleep(clickDelayMs);
                            const sent = clickSendButton(root);
                            if (!sent) return {{ ok: false, reason: 'no_send_button' }};
                            return {{ ok: true }};
                        }}

                        ensureGiftPanelOpen();
                        const scroller = enableFallbackScroll ? findScrollableContainer() : null;
                        for (const action of giftActions) {{
                            const giftId = (action && typeof action === 'object') ? String(action.id ?? action.gift_id ?? action.giftId ?? action.gid ?? action) : String(action);
                            const count = (action && typeof action === 'object') ? Math.max(1, Number(action.count ?? 1)) : 1;
                            let el = document.querySelector('.gift-id-' + giftId);

                            if (!el && scroller) {{
                                el = tryFindGift(giftId);
                                if (!el) {{
                                    const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
                                    for (let i = 0; i <= 8 && !el; i++) {{
                                        scroller.scrollTop = Math.floor((maxScroll * i) / 8);
                                        el = tryFindGift(giftId);
                                    }}
                                }}
                            }}

                            if (el) {{
                                try {{
                                    if (typeof el.scrollIntoView === 'function') {{
                                        el.scrollIntoView({{block:'center', inline:'center'}});
                                    }}
                                }} catch (e) {{}}
                                if (count > 1 && tryBulk) {{
                                    const bulkRes = await trySendBulkOnce(el, giftId, count);
                                    if (bulkRes.ok) {{
                                        results.push({{id: giftId, count, success: false, outcome_uncertain: true, mode: 'bulk', error: 'provider_confirmation_missing'}});
                                        continue;
                                    }}
                                    const ok = await sendByRepeatClick(el, giftId, count);
                                    results.push({{
                                        id: giftId,
                                        count,
                                        success: false,
                                        outcome_uncertain: ok,
                                        mode: 'repeat',
                                        error: ok ? 'provider_confirmation_missing' : (bulkRes.reason || 'repeat_failed')
                                    }});
                                    continue;
                                }}
                                try {{
                                    clickEl(el);
                                    if (clickDelayMs > 0) {{
                                        await sleep(clickDelayMs);
                                    }}
                                    results.push({{id: giftId, count: 1, success: false, outcome_uncertain: true, mode: 'click', error: 'provider_confirmation_missing'}});
                                }} catch (e) {{
                                    results.push({{id: giftId, count: 1, success: false, outcome_uncertain: true, error: 'click_failed'}});
                                }}
                            }} else {{
                                results.push({{id: giftId, count, success: false, error: 'not_found'}});
                            }}
                        }}
                        return results;
                    }}
                    '''
                    )
                for result in results:
                    if result.get("success"):
                        cnt = result.get("count") or 1
                        mode = result.get("mode") or "unknown"
                        logger.info(f"✅ 礼物 {result['id']} x{cnt} ({mode})")
                    else:
                        logger.warning(f"⚠️ 礼物 {result.get('id')} 失败: {result.get('error') or 'unknown'}")
                return results
            except Exception as e:
                logger.error(f"❌ 批量礼物发送异常: {e}")
                return [{
                    "id": gift_id,
                    "success": False,
                    "outcome_uncertain": True,
                    "error": type(e).__name__,
                } for gift_id in gift_list]

        # 主循环 - 批量处理模式
        while True:
            if gift_queue:
                # 批量提取礼物，避免逐个处理的开销
                gifts_to_send = []
                special_items = []
                batch_requests = []

                # 一次性处理队列中的所有项目
                for item in drain_queue():

                    # 分类处理
                    if isinstance(item, dict):
                        if "gifts" in item:
                            batch_requests.append(item)
                            continue
                        special_items.append(item)
                    else:
                        gifts_to_send.append(item)

                # 先处理特殊项目（余额检查、弹幕等）
                # 优先处理送礼（降低“检测到→真实送出”的排队延迟）
                for item in batch_requests:
                    gift_list = item.get("gifts", [])
                    req_id = item.get("request_id")
                    fast = bool(item.get("fast"))
                    confirm = str(item.get("confirm") or "click").strip().lower()
                    if req_id:
                        with request_lock:
                            st = request_status.get(req_id)
                            if st is not None:
                                st["status"] = "sending"
                                st["sending_ts"] = st.get("sending_ts") or time.time()
                                st["updated_ts"] = time.time()
                    results = send_gifts_batch(gift_list, fast=fast, confirm=confirm)
                    storage = item.get("result_storage")
                    if storage is not None:
                        storage["results"] = results
                        storage["success_count"] = sum(1 for r in results if r.get("success"))
                        storage["failed_count"] = len(results) - storage["success_count"]
                    if req_id:
                        with request_lock:
                            st = request_status.get(req_id)
                            if st is not None:
                                st["status"] = "done"
                                st["results"] = results
                                st["done_ts"] = time.time()
                                st["updated_ts"] = time.time()
                    event = item.get("result_event")
                    if event:
                        event.set()

                # 批量快速发送礼物 - JavaScript一次性处理
                if gifts_to_send:
                    send_gifts_batch(gifts_to_send)

                # 再处理特殊项目（弹幕等），避免阻塞送礼队列
                danmaku_post_delay_ms = int(os.getenv("DANMAKU_POST_DELAY_MS", "0") or 0)
                if danmaku_post_delay_ms < 0:
                    danmaku_post_delay_ms = 0
                for item in special_items:
                    if "check_balance" in item:
                        # balance checks are disabled by default in hard-send mode
                        result_event = item.get("result_event")
                        result_storage = item.get("result_storage")
                        if result_storage is not None:
                            result_storage["success"] = False
                        if result_event:
                            result_event.set()
                        continue

                    if "danmaku" in item:
                        text = item["danmaku"]
                        print(f"💬 发送弹幕：{text}")
                        try:
                            page.fill("textarea", text)
                            page.keyboard.press("Enter")
                            print("✅ 弹幕发送成功")
                        except Exception as e:
                            print(f"❌ 弹幕发送失败: {e}")
                        if danmaku_post_delay_ms:
                            time.sleep(danmaku_post_delay_ms / 1000.0)
            else:
                time.sleep(0.001)  # 极短轮询间隔

if __name__ == "__main__":
    Thread(target=run_flask, daemon=True).start()
    if THREESERVER_BACKEND in ("http", "giftsend", "api"):
        run_http_worker()
    else:
        run_browser()
