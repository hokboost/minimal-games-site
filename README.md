# Minimal Games Site

Express/EJS 小游戏站点，使用 PostgreSQL 保存账户、整数余额、不可变总账、游戏结果、管理审计、UX 分析以及礼物/PK 工作器状态。

## 运行要求

- Node.js 20+
- PostgreSQL 14+
- Windows 礼物工作器另需 Python 3.10+ 和 `workers/bilibili/requirements.txt`

复制 `.env.example` 中的变量到部署平台或本机未跟踪的 `.env`。生产环境必须提供数据库凭据、`SESSION_SECRET`、`WINDOWS_API_KEY` 和 `GIFT_TASKS_HMAC_SECRET`；建议另外配置 `LOG_HASH_SECRET` 与 `ADMIN_TOTP_SECRET`。密钥至少使用 32 字节随机值，不能提交到 Git。

```bash
npm ci
npm run migrate
npm start
```

服务就绪检查为 `GET /ready`。本机默认地址是 `http://localhost:3000`。

## 资金与状态

- 余额和总账只保存 JavaScript 安全范围内的整数。
- 每次余额变动和业务记录在同一个数据库事务提交。
- 客户端写操作使用 `Idempotency-Key`；完成响应与业务事务一起持久化。
- 礼物资金先锁定，再由带租约的工作器领取。外部发送开始后遇到超时只进入 `uncertain`，不会自动退款。
- PK 先预授权扣款，再发送和结算。回报先写入本地耐久 spool，断网恢复后重试。
- 管理员只能通过带 step-up 验证的对账接口处理 `uncertain` 记录；处理过程写入追加式审计日志。

数据库迁移由 `lib/database-migrations.js` 统一执行，使用 PostgreSQL advisory lock、文件校验和和 `minimal_games_schema_migrations`。已发布的迁移文件不得修改，后续结构变化必须新增迁移。

## Windows 工作器

```powershell
py -m pip install -r workers\bilibili\requirements.txt
npm ci
node windows-gift-listener.js
```

Cookie、Bilibili 配置和浏览器状态必须放在仓库外。默认使用仓库内已版本化并校验 SHA-256 的 Python 脚本；配置外部脚本路径时，内容必须与当前版本完全一致。PK 回报默认保存在 `private/worker-spool/pk-reports`，也可用 `PK_REPORT_SPOOL_DIR` 指向受限目录。

工作器强制使用 `THREESERVER_BACKEND=http`，只有收到 Bilibili API 的明确成功码才会结算成功。第三方超时、无效响应或仅完成页面点击一律进入 `uncertain`，不得自动重试或退款。

更多协议和恢复说明见 `workers/bilibili/README.md`。

## 验证

```bash
npm run test:all
ALLOW_DATABASE_CREATE_TEST=true npm run test:migrations
npm audit --audit-level=high
python -m compileall -q bilibili_gift_sender.py workers/bilibili
```

远端安全脚本默认被拒绝。确需对受控远端执行时，必须同时设置 `ALLOW_REMOTE_SECURITY_TESTS=I_ACKNOWLEDGE_REMOTE_TARGET`、`CHANGE_TICKET` 和目标 URL，并事先确认脚本是否会产生真实写入或花费。

## 发布与恢复

1. 停止 Windows 工作器，确认 `/api/workers/drain` 成功。
2. 使用 `pg_dump` 创建可恢复备份，并在隔离数据库演练恢复。
3. 运行 `npm run migrate`，检查迁移输出及资金/状态不变量。
4. 部署 Web 服务，等待 `/ready` 返回 `ready: true`。
5. 重启工作器，确认 `worker_heartbeats` 的协议版本、版本号和时间持续更新。
6. 检查管理员礼物和 PK 对账队列，不得批量自动释放不确定资金。

数据库恢复应恢复整库，而不是只修改 `users.balance`。恢复后先保持工作器停止，核对 `balance_logs`、`gift_exchanges`、`pk_spend_authorizations`、幂等记录和 outbox，再恢复外部发送。

历史提交若曾包含密钥或 Cookie，删除当前文件并不能使旧值失效。必须在数据库、Render、Windows 工作器和 Bilibili 端轮换相关凭据；是否重写 Git 历史应作为单独、协调过的维护操作。
