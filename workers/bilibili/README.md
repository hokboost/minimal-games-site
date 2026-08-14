# Bilibili Worker Protocol

`windows-gift-listener.js` 是唯一可以持有网站工作器密钥的本地进程。Python 子进程只获得运行、Cookie 路径和 Bilibili 配置所需的环境变量，不能读取数据库、会话、API 或 HMAC 密钥。

## 组件

- `threeserver.py`: 普通礼物与 PK 共用的、绑定单一房间的本地 HTTP 发送后端。
- `bilibili_gift_sender.py`: 保留的人工诊断工具；Windows listener 不会用它作为自动回退发送器。
- `checkpk.py`, `normalpk.py`, `shousheng.py`: PK 监控和选礼规则。
- `windows-gift-listener.js`: 任务租约、外部进程、预授权、回报和安全停机的所有者。

Python 脚本不能直接调用网站结算接口。普通礼物发送前，Windows listener 会按目标房间生成配置，在动态本地端口启动 `THREESERVER_BACKEND=http`，注入每进程随机 token 和礼物 ID allowlist，并在任务仍为 `claimed` 时确认 sender 报告的房间。确认成功后才把任务推进到 `processing`，以 `confirm=api` 执行唯一一次 `/send` POST，并让本地 HTTP 超时覆盖 sender 的 20 秒 provider 确认窗口。PK 脚本只访问 `127.0.0.1` 上带随机能力路径的代理；代理在每次发送前向网站预授权，并在发送后上报结论。

## 状态规则

礼物任务按 `pending -> claimed -> processing -> completed/uncertain` 运行。本地 sender 无法启动或无法确认目标房间时，外部发送尚未开始，任务可安全失败并退款。`/send` POST 发起后，超时、进程崩溃、模糊响应以及缺少或存在多个 provider transaction ID 都必须进入 `uncertain`；不得改用浏览器 sender 重试。只有恰好一个可核对的 provider transaction ID 才能结算完成。

PK 控制命令有单调递增的 `command_generation`。新命令只会 supersede 旧命令，不会把终态改回 pending。工作器重启时会推进代次并创建新的重建命令。

PK 花费按 `reserved -> sending -> settled/uncertain` 运行。发送意图在预扣前原子写入 `PK_REPORT_SPOOL_DIR`，服务端确认 `sending` 后才允许请求第三方，结算确认后才删除。`*.dead-letter` 或 `*.invalid` 文件必须保留并由管理员结合服务器对账队列检查，不能直接删除或据此自动退款。

## 安全停机

用 `Ctrl+C` 或 `SIGTERM` 停止工作器。工作器会停止领取、等待轮询、终止普通礼物及 PK sender/监控子进程、标记已开始的模糊礼物、刷新 PK spool，并调用 `/api/workers/drain`。不要直接结束进程树，除非故障处置需要；强制结束后必须检查两个管理员对账队列。

配置、Cookie、spool 和日志都不应位于 Git 跟踪范围内。更新 Python 文件后应与 Node 工作器一起发布；外部覆盖脚本若与仓库版本哈希不同，工作器会拒绝启动。
