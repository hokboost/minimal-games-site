import requests
import time
import random
import os
import sys
import io
import json
import hashlib
from decimal import Decimal, ROUND_HALF_UP

def check_pk_duration_and_exit(pk_start_time, exit_code, reason=""):
    """检查PK持续时间并决定退出码"""
    pk_duration = time.time() - pk_start_time
    duration_minutes = pk_duration / 60

    print(f"[时长检查] PK持续时间: {duration_minutes:.2f} 分钟")

    if duration_minutes < 1.0:
        print(f"[时长检查] ⚠️ PK时间过短（<1分钟），判定为异常退出: {reason}")
        print(f"[时长检查] 返回码2（异常），不影响连胜")
        exit(2)  # 异常退出，不影响连胜
    else:
        print(f"[时长检查] ✅ PK时间正常（>1分钟），按原计划退出: {reason}")
        exit(exit_code)  # 正常退出

def load_config():
    try:
        env_path = os.getenv("BILIPK_CONFIG")
        if getattr(sys, "frozen", False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.dirname(os.path.abspath(__file__))
        app_data_dir = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "BiliPKTool")
        candidates = []
        if env_path:
            candidates.append(env_path)
        candidates.append(os.path.join(base_dir, "config_gift_only.json"))
        candidates.append(os.path.join(app_data_dir, "config_gift_only.json"))

        config_path = None
        for path in candidates:
            if path and os.path.exists(path):
                config_path = path
                break
        if not config_path:
            raise FileNotFoundError("config_gift_only.json")

        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        print("❌ 找不到config_gift_only.json")
        return None

config = load_config()
if not config:
    print("ERROR: 无法加载配置文件")
    exit(1)  # 配置文件问题，在PK开始前，正常退出

def force_utf8_stdio():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
            sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass

force_utf8_stdio()

# 从配置文件读取
GIFT_ROOM_ID = config.get("送礼房间配置", {}).get("送礼房间", "4795936")
MAX_DIFF = config.get("PK配置", {}).get("普通PK最大追分金额", 100)
FINAL_SECONDS = config.get("PK配置", {}).get("最后几秒上票", 1.0)  # 从配置读取最后几秒上票

def get_room_host_uid(room_id):
    """获取房间主播的UID"""
    try:
        url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, headers=headers, timeout=5)
        data = resp.json()
        uid = data.get("data", {}).get("uid")
        if uid:
            print(f"[配置] 获取到监控房间 {room_id} 的主播UID: {uid}")
            return uid
        else:
            print(f"[警告] 无法获取房间 {room_id} 的主播UID")
            return None  # 返回None表示获取失败
    except Exception as e:
        print(f"[错误] 获取主播UID失败: {e}")
        return None  # 返回None表示获取失败

print(f"[配置] 送礼房间: {GIFT_ROOM_ID}, 最大追分: {MAX_DIFF}元, 最后 {FINAL_SECONDS} 秒上票")

# 从配置文件读取礼物池
GIFT_POOL = {}
DISABLED_GIFT_IDS = set(str(x) for x in (config.get("禁用礼物ID", []) or []))
ALLOW_GIFT_IDS = set(str(x) for x in (config.get("仅使用礼物ID", []) or []))
gift_config = config.get("礼物池配置", {})
for gid, (name, price) in gift_config.items():
    if ALLOW_GIFT_IDS and str(gid) not in ALLOW_GIFT_IDS:
        continue
    if str(gid) in DISABLED_GIFT_IDS:
        continue
    GIFT_POOL[gid] = (name, price)

print(f"[配置] 加载了 {len(GIFT_POOL)} 个礼物")
if DISABLED_GIFT_IDS:
    print(f"[配置] 已禁用礼物ID: {sorted(DISABLED_GIFT_IDS)}")
if ALLOW_GIFT_IDS:
    print(f"[配置] 仅使用礼物ID: {sorted(ALLOW_GIFT_IDS)}")

# 普通PK：排除某些礼物（例如“提督一号”这种不适合普通追分）
NORMALPK_EXCLUDE_GIFT_IDS = set(
    str(x)
    for x in (config.get("PK配置", {}).get("普通PK排除礼物ID", ["34638"]) or ["34638"])
)
NORMALPK_EXCLUDE_GIFT_IDS |= DISABLED_GIFT_IDS
GIFT_POOL_SELECT = {gid: v for gid, v in GIFT_POOL.items() if str(gid) not in NORMALPK_EXCLUDE_GIFT_IDS}
if NORMALPK_EXCLUDE_GIFT_IDS:
    print(f"[配置] 普通PK排除礼物ID: {sorted(NORMALPK_EXCLUDE_GIFT_IDS)}")
    print(f"[配置] 普通PK可选礼物数量: {len(GIFT_POOL_SELECT)}")

THREESERVER_URL = os.getenv("THREESERVER_URL", "http://127.0.0.1:9876").strip()
SEND_URL = f"{THREESERVER_URL}/send"  # 使用IP地址避免DNS解析
PK_EVENT_ID = (sys.argv[2].strip() if len(sys.argv) > 2 else os.getenv("PK_EVENT_ID", "").strip())
if not PK_EVENT_ID:
    PK_EVENT_ID = f"manual-{os.getpid()}-{time.time_ns()}"

def send_operation_id(phase):
    return hashlib.sha256(f"{PK_EVENT_ID}\0{phase}".encode("utf-8")).hexdigest()

def report_send(gift_ids, result):
    # The authenticated local proxy performs preauthorization and settlement.
    return None

def has_uncertain_send_result(value):
    if isinstance(value, dict):
        if value.get("outcome_uncertain") is True:
            return True
        return any(
            has_uncertain_send_result(value.get(key))
            for key in ("results", "parts")
        )
    if isinstance(value, list):
        return any(has_uncertain_send_result(item) for item in value)
    return False

def calc_ticket_count(gifts):
    """
    支持两种输入：
    - ["33988","33988"]  (旧格式：重复ID表示数量)
    - [{"id":"33988","count":100}] (新格式：压缩计数，推荐用于最后一秒)
    """
    total = Decimal("0")
    for item in gifts:
        if isinstance(item, dict):
            gid = str(item.get("id") or item.get("gift_id") or item.get("giftId") or "")
            count = int(item.get("count") or 1)
        else:
            gid = str(item)
            count = 1
        info = GIFT_POOL.get(gid)
        if info:
            total += Decimal(str(info[1])) * Decimal(str(count))
    tickets = (total * Decimal("10")).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(tickets)

def get_pk_info(room_id, retry_count=3, delay=2):
    """获取PK信息，增加重试机制"""
    url = f"https://api.live.bilibili.com/xlive/general-interface/v2/pk/info?room_id={room_id}"
    headers = {
        "User-Agent": "Mozilla/5.0",
        "Referer": f"https://live.bilibili.com/{room_id}"
    }

    for attempt in range(retry_count):
        try:
            resp = requests.get(url, headers=headers, timeout=8)
            if resp.status_code != 200 or not resp.text.strip().startswith("{"):
                if attempt < retry_count - 1:
                    print(f"[网络] 接口响应异常，{delay}秒后重试 ({attempt+1}/{retry_count})")
                    time.sleep(delay)
                    continue
                else:
                    print("[ERROR] 接口响应异常，已达最大重试次数")
                    return None

            data = resp.json()
            if data.get("code") != 0:
                message = data.get("message") or ""
                if attempt < retry_count - 1 and ("超时" in message or "timeout" in message.lower()):
                    print(f"[网络] 接口返回超时，{delay}秒后重试 ({attempt+1}/{retry_count})")
                    time.sleep(delay)
                    continue
                print(f"[ERROR] 接口返回错误：{message}")
                return None
            return data.get("data", {})

        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, ConnectionResetError) as e:
            if attempt < retry_count - 1:
                print(f"[网络] 连接失败，{delay}秒后重试 ({attempt+1}/{retry_count}): {type(e).__name__}")
                time.sleep(delay)
                continue
            else:
                print(f"[网络] 连接失败，已达最大重试次数: {e}")
                return None
        except Exception as e:
            if attempt < retry_count - 1:
                print(f"[网络] 请求异常，{delay}秒后重试 ({attempt+1}/{retry_count}): {e}")
                time.sleep(delay)
                continue
            else:
                print(f"[ERROR] 请求异常，已达最大重试次数: {e}")
                return None

    return None

def select_gift_combo(target_amount: float):
    """
    贪心补票（覆盖目标金额，允许略微超出）：
    - 用 Decimal 规避 float 地板除导致的“明明能凑齐却算不出来”。
    - 默认策略：大额礼物先出，最后用最小礼物补齐剩余（向上取整）。
    返回格式：[((gid,name,price), count), ...]
    """
    gifts = []
    for gid, (name, price) in GIFT_POOL_SELECT.items():
        try:
            price_dec = Decimal(str(price)).quantize(Decimal("0.01"))
        except Exception:
            continue
        if price_dec <= 0:
            continue
        gifts.append((str(gid), str(name), price_dec))
    if not gifts:
        return None

    gifts.sort(key=lambda x: x[2], reverse=True)
    smallest_gid, smallest_name, smallest_price = gifts[-1]

    remaining = Decimal(str(target_amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if remaining <= 0:
        return []

    combo: list[tuple[tuple[str, str, float], int]] = []

    # 先用除最后一个外的礼物做贪心地板除
    for gid, name, price_dec in gifts[:-1]:
        if remaining <= 0:
            break
        count = int(remaining // price_dec)
        if count <= 0:
            continue
        combo.append(((gid, name, float(price_dec)), count))
        remaining = (remaining - (price_dec * Decimal(count))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # 最后用最小礼物补齐（向上取整，确保覆盖目标）
    if remaining > 0:
        count = int((remaining / smallest_price).to_integral_value(rounding="ROUND_CEILING"))
        if count > 0:
            combo.append(((smallest_gid, smallest_name, float(smallest_price)), count))
            remaining = Decimal("0.00")

    return combo

def call_send(gifts, phase):
    gift_ids = gifts
    print(f"[SEND] 发送礼物：{gift_ids}")

    # 计算总价值（兼容 gifts=["id","id"] / gifts=[{"id":"x","count":n}]）
    total = Decimal("0")
    for item in gift_ids:
        if isinstance(item, dict):
            gid = str(item.get("id") or item.get("gift_id") or item.get("giftId") or "")
            count = int(item.get("count") or 1)
        else:
            gid = str(item)
            count = 1
        info = GIFT_POOL.get(gid)
        if info:
            total += Decimal(str(info[1])) * Decimal(str(count))

    print(f"[CHECK] 本次送礼总额：{total:.2f} 元")
    print(f"[CHECK] 本次送礼电池：{calc_ticket_count(gift_ids)}")

    try:
        from datetime import datetime

        def _post(ids):
            t0 = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print(f"[时间] 🚀 {t0} 开始HTTP请求: {ids}")
            resp = requests.post(
                SEND_URL,
                json={"gifts": ids, "operationId": send_operation_id(phase)},
                timeout=10,
            )
            t1 = datetime.now().strftime("%H:%M:%S.%f")[:-3]
            print(f"[时间] 📨 {t1} HTTP请求完成: HTTP {resp.status_code}")
            return resp

        response = _post(gift_ids)

        if response.status_code == 200:
            try:
                payload = response.json()
            except Exception:
                payload = None

            if not isinstance(payload, dict):
                result = {"success": False, "reason": "outcome_uncertain", "total_value": float(total)}
                report_send(gift_ids, result)
                return result

            if has_uncertain_send_result(payload):
                result = {"success": False, "reason": "outcome_uncertain", "total_value": float(total)}
                report_send(gift_ids, result)
                return result

            if payload.get("success") is False:
                results = payload.get("results") or []
                failed_ids = [str(r.get("id")) for r in results if not r.get("success") and r.get("id") is not None]
                result = {
                    "success": False,
                    "reason": "partial_failed" if failed_ids else "server_reported_failure",
                    "failed_ids": failed_ids,
                    "total_value": float(total),
                }
                report_send(gift_ids, result)
                return result

            if payload.get("success") is not True:
                result = {"success": False, "reason": "outcome_uncertain", "total_value": float(total)}
                report_send(gift_ids, result)
                return result
            send_success = True
        elif response.status_code == 402:
            result = {"success": False, "reason": "insufficient_balance", "total_value": float(total)}
            report_send(gift_ids, result)
            return result
        else:
            result = {"success": False, "reason": "http_error", "status_code": response.status_code, "total_value": float(total)}
            report_send(gift_ids, result)
            return result

    except requests.exceptions.Timeout:
        result = {"success": False, "reason": "timeout", "total_value": float(total)}
        report_send(gift_ids, result)
        return result
    except requests.exceptions.RequestException as e:
        result = {"success": False, "reason": "network_error", "error": str(e), "total_value": float(total)}
        report_send(gift_ids, result)
        return result
    except Exception as e:
        result = {"success": False, "reason": "unknown_error", "error": str(e), "total_value": float(total)}
        report_send(gift_ids, result)
        return result

    result = {"success": True, "total_value": float(total)}
    report_send(gift_ids, result)
    return result
def main(monitor_room_id=None):
    if monitor_room_id is None:
        monitor_room_id = GIFT_ROOM_ID  # 默认使用送礼房间

    # 记录PK开始时间
    import time
    pk_start_time = time.time()

    # 获取监控房间的主播UID
    MY_UID = get_room_host_uid(monitor_room_id)
    print(f"\n===== 监听房间 {monitor_room_id} 是否进入双人PK，礼物发送到 {GIFT_ROOM_ID} =====")
    print(f"===== 监控房间主播UID: {MY_UID} =====\n")

    while True:
        pk_data = get_pk_info(monitor_room_id)
        if not pk_data:
            print("[DEBUG] 获取失败，重试中...")
            time.sleep(1)
            continue

        pk_info = pk_data.get("pk_basic", {})
        members = pk_data.get("members", [])
        status = pk_info.get("status")
        pk_type = pk_info.get("type")

        if status != 201 or pk_type not in [2, 6] or len(members) != 2:
            print("[INFO] 当前不是有效的双人 PK，退出 normalpk ✅")
            check_pk_duration_and_exit(pk_start_time, 0, "无效PK")  # 无效PK默认失败

        print("[INFO] ✅ 检测到双人 PK，等待最后偷塔时机...")

        break  # 不再重新检测

    # 等待进入最后阶段
    end_ts = pk_info.get("end_time", 0)
    print(f"[倒计时] PK结束时间戳: {end_ts}")

    # 记录连续失败次数，避免网络问题导致误判
    consecutive_failures = 0
    max_consecutive_failures = 3  # 连续失败3次才认为PK真的结束了

    while True:
        # 每次都重新查询PK状态（应对绝杀机制）
        current_pk_data = get_pk_info(monitor_room_id)
        if not current_pk_data:
            consecutive_failures += 1
            print(f"[倒计时] ⚠️ 无法获取PK状态 ({consecutive_failures}/{max_consecutive_failures})")

            if consecutive_failures >= max_consecutive_failures:
                print("[倒计时] 🚨 连续多次无法获取PK状态，判定为PK结束")
                break
            else:
                # 检查是否接近PK结束时间
                current_time = time.time()
                estimated_remaining = end_ts - current_time

                if estimated_remaining <= 10:  # 如果估计剩余时间<=10秒
                    print(f"[倒计时] ⚠️ 接近PK结束时间，快速重试")
                    time.sleep(1)  # 只等待1秒，避免错过最后阶段
                else:
                    print(f"[倒计时] 等待3秒后重试...")
                    time.sleep(3)  # 正常情况等待3秒
                continue
        else:
            # 成功获取数据，重置失败计数
            consecutive_failures = 0

        current_pk_info = current_pk_data.get("pk_basic", {})
        current_status = current_pk_info.get("status")
        current_end_ts = current_pk_info.get("end_time", 0)

        # 检查PK是否提前结束（绝杀等情况）
        if current_status != 201:
            print(f"[倒计时] 🏁 PK提前结束！状态码: {current_status}")
            break

        # 更新结束时间（防止时间变化）
        if current_end_ts != end_ts:
            print(f"[倒计时] 🔄 PK结束时间更新: {end_ts} → {current_end_ts}")
            end_ts = current_end_ts

        # 使用毫秒级精确计算（直接使用current_pk_data中的mill_timestamp）
        mill_timestamp = current_pk_data.get("mill_timestamp", 0)
        if mill_timestamp > 0:
            api_time = mill_timestamp / 1000  # 毫秒转秒
            remaining = end_ts - api_time
        else:
            remaining = end_ts - time.time()  # 备用方案

        # 避免负数时间显示
        if remaining <= 0:
            from datetime import datetime
            local_time_str = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            print(f"[倒计时] {local_time_str} | ⏰ PK已结束 (剩余:{remaining:.3f})")
            break

        # 显示本地时间用于调试
        from datetime import datetime
        local_time_str = datetime.now().strftime('%H:%M:%S.%f')[:-3]
        if mill_timestamp > 0:
            api_time_str = datetime.fromtimestamp(api_time).strftime('%H:%M:%S.%f')[:-3]
            print(f"[倒计时] {local_time_str} | PK还剩 {remaining:.3f} 秒结束 (API时间:{api_time_str})")
        else:
            print(f"[倒计时] {local_time_str} | PK还剩 {remaining:.3f} 秒结束 (使用本地时间)")

        if remaining > 60:
            time.sleep(random.uniform(8, 10))
            continue
        elif remaining > 10:
            time.sleep(random.uniform(4, 5))
            continue
        elif remaining > 5:
            time.sleep(random.uniform(0.9, 1.1))
            continue
        elif remaining > 3:
            time.sleep(random.uniform(0.4, 0.6))
            continue
        else:  # remaining <= 3，启用高频监控
            print(f"[倒计时] {local_time_str} | 🚀 切换到高频监控模式 (剩余{remaining:.3f}秒)")

            # 使用类似pkmonitor的高频查询
            start_highfreq_time = time.time()
            while True:
                hf_start = time.time()
                hf_pk_data = get_pk_info(monitor_room_id)
                if not hf_pk_data:
                    time.sleep(0.1)
                    continue

                hf_pk_info = hf_pk_data.get("pk_basic", {})
                hf_status = hf_pk_info.get("status")
                hf_end_ts = hf_pk_info.get("end_time", 0)

                if hf_status != 201:
                    print(f"[高频] PK提前结束！状态码: {hf_status}")
                    break

                # 使用毫秒级精确计算
                hf_mill_timestamp = hf_pk_data.get("mill_timestamp", 0)
                if hf_mill_timestamp > 0:
                    hf_api_time = hf_mill_timestamp / 1000
                    hf_remaining = hf_end_ts - hf_api_time
                else:
                    hf_remaining = hf_end_ts - time.time()

                hf_local_time_str = datetime.now().strftime('%H:%M:%S.%f')[:-3]

                if hf_remaining <= 0:
                    print(f"[高频] {hf_local_time_str} | ⏰ PK已结束 (剩余:{hf_remaining:.3f})")
                    break

                print(f"[高频] {hf_local_time_str} | PK还剩 {hf_remaining:.3f} 秒结束")

                if hf_remaining <= FINAL_SECONDS:
                    print(f"[高频] {hf_local_time_str} | 🚨 进入决胜阶段！还有{hf_remaining:.3f}秒 + 2.3秒延长窗口")
                    break

                # 高频查询，目标0.1秒间隔
                elapsed = time.time() - hf_start
                sleep_time = max(0.05, 0.1 - elapsed)  # 最少50ms，目标100ms
                time.sleep(sleep_time)
            break

    print("🚨 [决胜阶段] 检查是否追分")

    # 第一次获取票数（用于首次投票决策）
    pk_data = get_pk_info(monitor_room_id)
    if not pk_data:
        print("[ERROR] 无法获取最终票数")
        check_pk_duration_and_exit(pk_start_time, 0, "无法获取最终票数")  # 异常情况下默认失败

    members = pk_data.get("members", [])
    my_votes = None
    opp_votes = None

    for m in members:
        uid = m.get("uid")
        votes = m.get("votes", 0)
        if uid == MY_UID:
            my_votes = votes
        else:
            opp_votes = votes

    if my_votes is None or opp_votes is None:
        print("[ERROR] 票数异常")
        check_pk_duration_and_exit(pk_start_time, 0, "票数异常")  # 异常情况下默认失败

    diff = opp_votes - my_votes
    diff_yuan = diff / 10

    # 记录第一次检查时的对面票数（用于反制监控）
    initial_opp_votes = opp_votes
    first_vote_sent = False

    if diff_yuan < 0:
        print("[领先] 当前已领先 ✅")
        print("[领先] 启动反制监控，防止对手最后反杀")
        first_vote_sent = True  # 领先时也要监控反制
    elif diff_yuan == 0:
        print("[平局] 当前双方票数相等，上一票确保获胜 ⚖️")

        # 平局时上一张最便宜的票
        cheapest_gift = min(GIFT_POOL_SELECT.items(), key=lambda x: x[1][1])
        gid, (name, price) = cheapest_gift

        print(f"[平局追分] 选择最便宜礼物: {name} ({price}元)")
        send_result = call_send([gid], "initial")

        if send_result["success"]:
            print(f"✅ [平局追分] 上票成功！")
            first_vote_sent = True
        else:
            print(f"❌ [平局追分] 上票失败: {send_result.get('reason', 'unknown')}")
            first_vote_sent = False

    else:  # diff_yuan > 0，我方落后
        print(f"[落后] 当前差距：{diff_yuan:.2f} 元")

        if diff_yuan > MAX_DIFF:
            print(f"[跳过] 差距超出 {MAX_DIFF} 元，不追 ❌")
            first_vote_sent = False
        else:
            target = round(diff_yuan + 0.1, 2)
            combo = select_gift_combo(target)
            if combo:
                print("[组合] 准备补票：")
                gift_ids = []
                for (gid, name, price), count in combo:
                    print(f"  - {name} × {count}")
                    gift_ids.extend([gid] * count)

                # 追分礼物发送时间
                from datetime import datetime
                chase_send_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                print(f"[时间] 📤 {chase_send_time} 发送追分礼物到threeserver: {gift_ids}")
                send_result = call_send(gift_ids, "initial")

                if send_result["success"]:
                    print(f"✅ [追分] 补票成功，总额 {send_result['total_value']:.2f}元")
                    first_vote_sent = True
                else:
                    reason = send_result.get("reason", "unknown")
                    if reason == "insufficient_balance":
                        print(f"🚫 [追分] 补票失败：余额不足！PK可能失败")
                        print(f"💡 [提示] 请立即充值B币，否则后续PK都会失败")
                    else:
                        print(f"❌ [追分] 补票失败：{reason}")
                        print(f"⚠️ [警告] PK追分失败，可能影响胜负")
                    first_vote_sent = False
            else:
                print("[失败] 无合适组合 ❌")
                try:
                    print(f"[DEBUG] target={target} GIFT_POOL_SELECT={GIFT_POOL_SELECT}")
                except Exception:
                    pass
                first_vote_sent = False

    # 反制上票监控阶段
    if first_vote_sent:
        print(f"🔍 [反制监控] 已发送首次投票，开始监控对手反制 (基准对手票数:{initial_opp_votes})")
        counter_attack_start_time = time.time()
        counter_attack_timeout = 5.0  # 监控5秒

        while True:
            current_time = time.time()
            if current_time - counter_attack_start_time >= counter_attack_timeout:
                print("[反制监控] 监控时间结束，未检测到对手反制")
                break

            # 获取当前票数
            current_pk_data = get_pk_info(monitor_room_id)
            if not current_pk_data:
                time.sleep(0.2)
                continue

            current_members = current_pk_data.get("members", [])
            current_opp_votes = None

            for m in current_members:
                uid = m.get("uid")
                votes = m.get("votes", 0)
                if uid != MY_UID:  # 对手票数
                    current_opp_votes = votes
                    break

            if current_opp_votes is None:
                time.sleep(0.2)
                continue

            # 检测对手是否增票
            if current_opp_votes > initial_opp_votes:
                opp_increase = current_opp_votes - initial_opp_votes
                opp_increase_yuan = opp_increase / 10

                print(f"🚨 [反制监控] 检测到对手反制！增加{opp_increase_yuan:.2f}元 ({initial_opp_votes}->{current_opp_votes})")

                # 简单逻辑：对手增加多少，我就跟多少
                counter_target = round(opp_increase_yuan, 2)
                print(f"[反制计算] 对手增加{opp_increase_yuan:.2f}元，我跟投{counter_target}元")
                counter_combo = select_gift_combo(counter_target)

                if counter_combo:
                    counter_gift_ids = []
                    print("[反制组合] 准备反制投票：")
                    for (gid, name, price), count in counter_combo:
                        print(f"  - {name} × {count}")
                        counter_gift_ids.extend([gid] * count)

                    # 反制礼物发送时间 - 和第一次上票格式保持一致
                    from datetime import datetime
                    counter_send_time = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                    print(f"[时间] 📤 {counter_send_time} 发送反制礼物到threeserver: {counter_gift_ids}")
                    counter_result = call_send(counter_gift_ids, f"counter-{current_opp_votes}")

                    if counter_result["success"]:
                        print(f"✅ [反制] 补票成功，总额 {counter_result['total_value']:.2f}元")
                        # 更新基准票数，继续监控
                        initial_opp_votes = current_opp_votes
                    else:
                        reason = counter_result.get("reason", "unknown")
                        if reason == "insufficient_balance":
                            print(f"🚫 [反制] 补票失败：余额不足！PK可能失败")
                            print(f"💡 [提示] 请立即充值B币，否则后续PK都会失败")
                        else:
                            print(f"❌ [反制] 补票失败：{reason}")
                            print(f"⚠️ [警告] PK反制失败，可能影响胜负")
                        break  # 反制失败就退出监控
                else:
                    print("[失败] 无合适反制组合 ❌")
                    try:
                        print(f"[DEBUG] counter_target={counter_target} GIFT_POOL_SELECT={GIFT_POOL_SELECT}")
                    except Exception:
                        pass
                    break

            time.sleep(0.2)  # 200ms间隔检查
    else:
        print("🔍 [反制监控] 未发送首次投票，跳过反制监控")

    # 等待PK结束并判断最终胜负
    print("[等待] PK结束，等待3秒后检查最终结果...")
    time.sleep(3)

    final_pk_data = get_pk_info(monitor_room_id)
    if final_pk_data:
        check_final_result(final_pk_data, monitor_room_id, pk_start_time)
    else:
        print("[警告] 无法获取最终结果")
        if first_vote_sent:
            check_pk_duration_and_exit(pk_start_time, 1, "投票后无法获取最终结果")
        else:
            check_pk_duration_and_exit(pk_start_time, 0, "未投票且无法获取最终结果")

def check_final_result(pk_data, monitor_room_id, pk_start_time):
    """检查最终PK结果并返回相应退出码"""
    members = pk_data.get("members", [])
    if len(members) != 2:
        print("[异常] PK成员数不正确")
        check_pk_duration_and_exit(pk_start_time, 0, "PK成员数不正确")
        return

    # 获取主播UID
    my_uid = get_room_host_uid(monitor_room_id)
    if not my_uid:
        print("[异常] 无法获取主播UID")
        check_pk_duration_and_exit(pk_start_time, 0, "无法获取主播UID")
        return

    my_final_votes = None
    opp_final_votes = None

    for member in members:
        uid = member.get("uid")
        votes = member.get("votes", 0)
        if uid == my_uid:
            my_final_votes = votes
        else:
            opp_final_votes = votes

    if my_final_votes is None or opp_final_votes is None:
        print("[异常] 无法获取最终票数")
        check_pk_duration_and_exit(pk_start_time, 0, "无法获取最终票数")
        return

    print(f"[最终结果] 我方票数: {my_final_votes}, 对方票数: {opp_final_votes}")

    if my_final_votes > opp_final_votes:
        print("[结果] 🎉 PK获胜！")
        # 庆祝弹幕已禁用
        print("[弹幕禁用] 已禁用获胜庆祝弹幕")

        time.sleep(random.uniform(28,40))

        check_pk_duration_and_exit(pk_start_time, 1, "PK获胜")
    elif my_final_votes < opp_final_votes:
        print("[结果] ❌ PK失败！")
        check_pk_duration_and_exit(pk_start_time, 0, "PK失败")
    else:
        print("[结果] ⚖️ PK平局！")
        check_pk_duration_and_exit(pk_start_time, 0, "PK平局")

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        monitor_room_id = sys.argv[1]
        main(monitor_room_id)
    else:
        main()
