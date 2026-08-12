# Bilibili Worker Protocol

`windows-gift-listener.js` 是唯一可以持有网站工作器密钥的本地进程。Python 子进程只获得运行、Cookie 路径和 Bilibili 配置所需的环境变量，不能读取数据库、会话、API 或 HMAC 密钥。

## 组件

- `bilibili_gift_sender.py`: 普通礼物任务发送器。
- `threeserver.py`: 绑定单一房间的本地发送后端。
- `checkpk.py`, `normalpk.py`, `shousheng.py`: PK 监控和选礼规则。
- `windows-gift-listener.js`: 任务租约、外部进程、预授权、回报和安全停机的所有者。

Python 脚本不能直接调用网站结算接口。PK 脚本只访问 `127.0.0.1` 上带随机能力路径的代理；代理在每次发送前向网站预授权，并在发送后上报结论。

## 状态规则

礼物任务按 `pending -> claimed -> processing -> completed/uncertain` 运行。只有尚未进入 `processing` 的确定失败可以自动退款。`processing` 后的超时、进程崩溃或模糊响应必须进入 `uncertain`。

PK 控制命令有单调递增的 `command_generation`。新命令只会 supersede 旧命令，不会把终态改回 pending。工作器重启时会推进代次并创建新的重建命令。

PK 花费按 `reserved -> sending -> settled/uncertain` 运行。发送意图在预扣前原子写入 `PK_REPORT_SPOOL_DIR`，服务端确认 `sending` 后才允许请求第三方，结算确认后才删除。`*.dead-letter` 或 `*.invalid` 文件必须保留并由管理员结合服务器对账队列检查，不能直接删除或据此自动退款。

## 安全停机

用 `Ctrl+C` 或 `SIGTERM` 停止工作器。工作器会停止领取、等待轮询、终止子进程、标记已开始的模糊礼物、刷新 PK spool，并调用 `/api/workers/drain`。不要直接结束进程树，除非故障处置需要；强制结束后必须检查两个管理员对账队列。

配置、Cookie、spool 和日志都不应位于 Git 跟踪范围内。更新 Python 文件后应与 Node 工作器一起发布；外部覆盖脚本若与仓库版本哈希不同，工作器会拒绝启动。
