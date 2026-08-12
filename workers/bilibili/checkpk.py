import time
import subprocess
import requests
import datetime
import random
import json
import os
import sys
import signal
import io
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
    exit(1)

# 从配置文件读取
MONITOR_ROOM_ID = config.get("房间配置", {}).get("房间号列表", ["1894863591"])[0]  # 监控的房间
GIFT_ROOM_ID = config.get("送礼房间配置", {}).get("送礼房间", "1894863591")  # 送礼房间
if str(GIFT_ROOM_ID).strip() != str(MONITOR_ROOM_ID).strip():
    print(f"[配置警告] 监控房间({MONITOR_ROOM_ID}) != 送礼房间({GIFT_ROOM_ID})，已自动改为一致")
    GIFT_ROOM_ID = MONITOR_ROOM_ID
SHOUWIN_START_HOUR = config.get("PK配置", {}).get("首胜时间段_开始", 0)
SHOUWIN_END_HOUR = config.get("PK配置", {}).get("首胜时间段_结束", 23)
CHECK_MIN_INTERVAL = config.get("检测间隔配置", {}).get("checkpk检测间隔最小值", 40)
CHECK_MAX_INTERVAL = config.get("检测间隔配置", {}).get("checkpk检测间隔最大值", 60)
CHECK_INTERVAL = 20

# 强制stdout/stderr为UTF-8，避免打包后编码错误
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

# 创建stats目录用于记录PK历史
APP_DATA_DIR = os.path.join(os.getenv("LOCALAPPDATA", os.path.expanduser("~")), "BiliPKTool")
STATS_DIR = os.path.join(APP_DATA_DIR, "stats")
os.makedirs(STATS_DIR, exist_ok=True)
print(f"[配置] stats目录: {STATS_DIR}")

print(f"[配置] 监控房间: {MONITOR_ROOM_ID}, 送礼房间: {GIFT_ROOM_ID}")
print(f"[配置] 首胜时间段: {SHOUWIN_START_HOUR}:00-{SHOUWIN_END_HOUR}:59")

if len(sys.argv) > 1:
    room_override = sys.argv[1].strip()
    if room_override:
        MONITOR_ROOM_ID = room_override
        GIFT_ROOM_ID = room_override

HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Referer": f"https://live.bilibili.com/{MONITOR_ROOM_ID}"
}

last_pk_id = None
last_date_str = ""  # 记录上次发弹幕的日期
shousheng_won = False  # 当天是否赢过首胜 type=2
win_streak = 0  # PK连胜计数器

FORCE_NORMALPK = False  # 打包版本可强制所有单人PK走 normalpk

if getattr(sys, "frozen", False):
    BASE_DIR = os.path.dirname(sys.executable)
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def build_worker_cmd(script_name, room_id, pk_id):
    if getattr(sys, "frozen", False):
        exe_path = os.path.join(BASE_DIR, f"{script_name}.exe")
        return [exe_path, room_id, str(pk_id)]
    return [sys.executable, os.path.join(BASE_DIR, f"{script_name}.py"), room_id, str(pk_id)]


def is_live(room_id):
    try:
        url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", {}).get("live_status", 0) == 1
    except Exception as e:
        print(f"[直播检测异常] {e}")
        return False


def send_danmaku(msg):
    print(f"[弹幕禁用] 已禁用弹幕发送: {msg}")
    return


def log_pk_id(pk_id, pk_type, room_id):
    """记录PK ID到stats目录"""
    try:
        now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
        date_str = now.strftime("%Y-%m-%d")
        timestamp = now.strftime("%Y-%m-%d %H:%M:%S")

        # 文件名格式：YYYY-MM-DD.txt
        log_file = os.path.join(STATS_DIR, f"{date_str}.txt")

        # 记录格式：时间戳 | PK_ID | PK类型 | 房间号
        log_entry = f"{timestamp} | {pk_id} | type={pk_type} | room={room_id}\n"

        with open(log_file, 'a', encoding='utf-8') as f:
            f.write(log_entry)

        print(f"[PK记录] 已记录到 {log_file}: PK_ID={pk_id}, type={pk_type}")

    except Exception as e:
        print(f"[PK记录异常] {e}")


def has_won_today():
    """检查今天是否已经赢过 type=2 的首胜PK"""
    try:
        # 获取主播UID
        def get_room_host_uid_temp(room_id):
            try:
                url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
                headers = {"User-Agent": "Mozilla/5.0"}
                resp = requests.get(url, headers=headers, timeout=5)
                data = resp.json()
                return data.get("data", {}).get("uid")
            except:
                return None

        my_uid = get_room_host_uid_temp(MONITOR_ROOM_ID)
        if not my_uid:
            print("[警告] 无法获取主播UID，无法判断首胜状态")
            return False

        # 调用PK历史记录接口 - 这里需要找到正确的API
        # 暂时使用简单的逻辑：检查全局变量shousheng_won
        # TODO: 后续可以改进为调用B站的PK历史API
        print(f"[首胜检测] 当前shousheng_won状态: {shousheng_won}")
        return shousheng_won
    except Exception as e:
        print(f"[首胜检测异常] {e}")
        return False


def check_new_day():
    global last_date_str, shousheng_won, win_streak
    now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))  # 北京时间
    today_str = now.strftime("%Y-%m-%d")
    hour = now.hour

    if today_str != last_date_str and hour == SHOUWIN_START_HOUR:
        # 是新的一天，并且到了首胜开始时间
        print("[新的一天] 新的一天开始了，首胜状态重置")
        last_date_str = today_str
        shousheng_won = False  # 重置首胜状态
        win_streak = 0  # 重置连胜计数


def handle_pk_result(return_code, pk_type=None):
    """根据脚本返回码处理PK结果"""
    global win_streak, shousheng_won
    try:
        if return_code == 1:  # 返回码1表示获胜
            win_streak += 1
            print(f"[连胜] 🎉 PK获胜！当前连胜: {win_streak}")

            # 如果是type=2的PK获胜，设置首胜状态
            if pk_type == 2:
                shousheng_won = True
                print(f"[首胜] ✅ type=2 PK获胜，设置首胜状态为True")

            # 检查是否达到三连胜
            if win_streak >= 3:
                print(f"[三连胜] 🔥 达成三连胜！连胜重置")
                win_streak = 0  # 重置连胜计数

        elif return_code == 0:  # 返回码0表示失败
            win_streak = 0  # 失败重置连胜
            print(f"[连胜] ❌ PK失败，连胜重置为0")
        elif return_code == 2:  # 返回码2表示异常退出（时间过短）
            print(f"[连胜] ⚠️ PK异常退出（时间<1分钟），连胜保持: {win_streak}")
        else:
            print(f"[连胜] ⚠️ 未知返回码 {return_code}，无法判断胜负")

    except Exception as e:
        print(f"[连胜处理异常] {e}")

def check_pk_result(pk_id, pk_type=None):
    """检查PK结果并更新连胜计数"""
    global win_streak, shousheng_won
    try:
        # 多次尝试获取PK结果
        members = []
        for attempt in range(5):  # 尝试5次
            print(f"[连胜检测] 第 {attempt + 1} 次尝试获取PK结果...")
            time.sleep(1)  # 每次等待1秒

            url = f"https://api.live.bilibili.com/xlive/general-interface/v2/pk/info?room_id={MONITOR_ROOM_ID}"
            resp = requests.get(url, headers=HEADERS, timeout=5)
            data = resp.json()
            members = data.get("data", {}).get("members", [])

            if members:
                print(f"[连胜检测] 成功获取到PK数据")
                break
            else:
                print(f"[连胜检测] 第 {attempt + 1} 次未获取到数据，继续重试...")

        if not members:
            print("[连胜检测] ❌ 5次重试后仍未获取到PK数据，无法判断胜负")
            return

        # 动态获取监控房间的主播UID
        def get_room_host_uid_temp(room_id):
            try:
                url = f"https://api.live.bilibili.com/room/v1/Room/get_info?room_id={room_id}"
                headers = {"User-Agent": "Mozilla/5.0"}
                resp = requests.get(url, headers=headers, timeout=5)
                data = resp.json()
                return data.get("data", {}).get("uid")
            except:
                return None

        my_uid = get_room_host_uid_temp(MONITOR_ROOM_ID)
        print(f"[连胜检测] 监控房间 {MONITOR_ROOM_ID} 的主播UID: {my_uid}")
        won = False

        for m in members:
            if m.get("uid") == my_uid:
                if m.get("is_winner", 0) == 1:
                    won = True
                    win_streak += 1
                    print(f"[连胜] 🎉 PK获胜！当前连胜: {win_streak}")

                    # 如果是type=2的PK获胜，设置首胜状态
                    if pk_type == 2:
                        shousheng_won = True
                        print(f"[首胜] ✅ type=2 PK获胜，设置首胜状态为True")

                    # 检查是否达到三连胜
                    if win_streak >= 3:
                        print(f"[三连胜] 🔥 达成三连胜！连胜重置")
                        win_streak = 0  # 重置连胜计数
                else:
                    win_streak = 0  # 失败重置连胜
                    print(f"[连胜] ❌ PK失败，连胜重置为0")
                break


    except Exception as e:
        print(f"[连胜检测异常] {e}")

def check_pk():
    global last_pk_id, shousheng_won
    try:
        url = f"https://api.live.bilibili.com/xlive/general-interface/v2/pk/info?room_id={MONITOR_ROOM_ID}"
        resp = requests.get(url, headers=HEADERS, timeout=5)
        if resp.status_code != 200:
            print("[ERROR] 请求失败")
            return

        data = resp.json()
        data_field = data.get("data")
        if not data_field:
            print("[INFO] 当前接口未返回PK数据（可能未开始PK）")
            return

        pk_basic = data_field.get("pk_basic", {})
        status = pk_basic.get("status")
        pk_type = pk_basic.get("type")
        pk_id = pk_basic.get("pk_id")

        if status == 201:
            if pk_id == last_pk_id:
                return

            # 记录新的PK ID到stats目录
            log_pk_id(pk_id, pk_type, MONITOR_ROOM_ID)

            now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
            hour = now.hour

            if pk_type == 2:
                if FORCE_NORMALPK:
                    print(f"[PK] ✅ 检测到新 PK (type=2, pk_id={pk_id})，打包版统一按普通PK处理")
                    process = subprocess.Popen(build_worker_cmd("normalpk", MONITOR_ROOM_ID, pk_id))

                    # 等待 normalpk.py 进程结束
                    print("[等待] normalpk.py 运行中...")
                    return_code = process.wait()
                    print(f"[完成] normalpk.py 已结束，返回码: {return_code}")

                    # 根据返回码判断胜负并更新连胜
                    handle_pk_result(return_code, pk_type=2)
                else:
                    print(f"[PK] ✅ 检测到新 PK (type=2, pk_id={pk_id})")
                    if SHOUWIN_START_HOUR <= hour <= SHOUWIN_END_HOUR and not shousheng_won:
                        print(f"🔔 在 {SHOUWIN_START_HOUR}~{SHOUWIN_END_HOUR} 点之间，尚未首胜，启动 shousheng.py")
                        process = subprocess.Popen(build_worker_cmd("shousheng", MONITOR_ROOM_ID, pk_id))

                        # 等待 shousheng.py 进程结束
                        print("[等待] shousheng.py 运行中...")
                        return_code = process.wait()
                        print(f"[完成] shousheng.py 已结束，返回码: {return_code}")

                        # 根据返回码判断胜负并更新连胜
                        handle_pk_result(return_code, pk_type=2)
                    else:
                        print("✅ 非首胜或已首胜，启动 normalpk.py")
                        process = subprocess.Popen(build_worker_cmd("normalpk", MONITOR_ROOM_ID, pk_id))

                        # 等待 normalpk.py 进程结束
                        print("[等待] normalpk.py 运行中...")
                        return_code = process.wait()
                        print(f"[完成] normalpk.py 已结束，返回码: {return_code}")

                        # 根据返回码判断胜负并更新连胜
                        handle_pk_result(return_code, pk_type=2)

            elif pk_type == 6:
                print(f"[PK] ✅ 检测到新 PK (type=6, pk_id={pk_id})，启动 normalpk.py")
                process = subprocess.Popen(build_worker_cmd("normalpk", MONITOR_ROOM_ID, pk_id))

                # 等待 normalpk.py 进程结束
                print("[等待] normalpk.py 运行中...")
                return_code = process.wait()
                print(f"[完成] normalpk.py 已结束，返回码: {return_code}")

                # 根据返回码判断胜负并更新连胜
                handle_pk_result(return_code, pk_type=6)

            elif pk_type == 8:
                # 多人PK由独立脚本（checkmultipk/checkmultipkws）处理，checkpk 只负责普通PK/首胜PK。
                # 避免同时启动 multipk.py 干扰你的多人PK监听与上票策略。
                print(f"[PK] ⚠️ 检测到多人PK (type=8, pk_id={pk_id})，checkpk 忽略（由独立多人PK脚本处理）")

            else:
                print(f"[INFO] 检测到未支持的PK类型 (type={pk_type})，忽略")

            last_pk_id = pk_id
        else:
            print("[INFO] 当前没有 PK 或不是支持的PK类型")
            last_pk_id = None
    except Exception as e:
        print(f"[PK检测异常] {e}")


def cleanup_and_exit(signum=None, frame=None):
    """程序退出时的清理工作"""
    print("\n[退出] 程序退出")
    exit(0)

def run():
    # 注册信号处理器，确保Ctrl+C时能正确清理
    signal.signal(signal.SIGINT, cleanup_and_exit)
    signal.signal(signal.SIGTERM, cleanup_and_exit)

    print(f"=== ✅ 开始监听房间 {MONITOR_ROOM_ID} 的 PK 状态，每次随机间隔 {CHECK_MIN_INTERVAL}~{CHECK_MAX_INTERVAL} 秒 ===")
    print("[启动] 按 Ctrl+C 安全退出")

    try:
        while True:
            interval = random.randint(CHECK_MIN_INTERVAL, CHECK_MAX_INTERVAL)
            if is_live(MONITOR_ROOM_ID):
                check_new_day()  # 检查是否到新的一天
                check_pk()
            else:
                print("[状态] 主播未开播，等待中...")
            print(f"[DEBUG] 💤 等待 {interval} 秒后再次检测")
            time.sleep(interval)
    except KeyboardInterrupt:
        cleanup_and_exit()
    except Exception as e:
        print(f"[错误] 程序异常: {e}")
        cleanup_and_exit()


if __name__ == "__main__":
    run()
