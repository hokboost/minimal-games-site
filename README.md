# Minimal Games Site

Express/EJS 小游戏站点，使用 PostgreSQL 保存账户、整数余额、不可变总账、游戏结果、管理审计、UX 分析以及礼物/PK 工作器状态。

## 运行要求

- Node.js 20+
- PostgreSQL 14+
- Windows 礼物工作器另需 Python 3.10+ 和 `workers/bilibili/requirements.txt`

复制 `.env.example` 中的变量到部署平台或本机未跟踪的 `.env`。生产环境必须提供数据库凭据、各用途独立密钥、readiness token，以及 `WORKER_CREDENTIALS_JSON` 中逐 worker 的独立凭证。管理员应使用独立强密码；登录后的后台操作依赖管理员会话、CSRF、严格限流和追加式审计，不要求二次密码或验证码。Windows worker 只配置自己的 `WORKER_CREDENTIAL_ID`、`WORKER_API_KEY` 和 `WORKER_HMAC_SECRET`。所有密钥至少使用 32 字节随机值，不能提交到 Git。

```bash
npm ci
npm run migrate
npm start
```

`npm run migrate` 必须在一次性迁移任务中使用 schema owner/migrator 身份执行；Web 服务随后改用无 DDL 权限的 runtime 身份启动，且 Web 环境中不得保留 migrator 凭证。生产 Web 启动只核对迁移文件及 SHA-256，不会自动改 schema。角色授权示例见 `docs/DATABASE_ROLES.md`。

公开就绪检查为 `GET /ready`，仅返回通用状态；带 `X-Readiness-Token` 的 `GET /internal/ready` 才返回内部诊断。本机默认地址是 `http://localhost:3000`。

## 扩展游戏与架构

游戏参数、目录信息、RTP 校验、随机抽取、个人记录适配器已经集中到
`domain/games/`。可兑换随机玩法的政策区间是 **98%–99%**，规划目标为
98.5%；注册表在启动阶段执行精确经济模型校验，超出区间时拒绝启动。
Flip 与 Stone 还会校验所有玩家策略中的最高 RTP，而不只校验“期望利润
最优”的策略。

`/adventure` 是数据驱动的剧情闯关板块。完整战役包含 50 个连续解锁章节、
607 个剧情节点，并按每 10 章一个篇章分页展示。玩法涵盖剧情选择、知识问答、
密码推理、记忆、资源路线、Boss、多选、排序、配对、路线规划等十一类机制。
进度以数据库版本号并发控制并可断线续玩；浏览器只收到当前关卡的公开投影，
首次通关奖励与不可变余额总账在同一个事务内提交。新增章节只扩展
`domain/games/adventure/content.js`，不需要复制结算或路由代码。

新增游戏时不要在路由、EJS、浏览器脚本和测试中复制成本或概率；添加一份
不可变私有配置、一个目录描述符、纯经济模型/引擎和可选记录适配器，再通过
服务器公开经过裁剪的前端配置。后台周期任务统一由应用生命周期管理器启动和
停止，模块加载不得隐式创建 timer。

完整边界、扩展步骤、事务规则和渐进迁移计划见
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)；当前参数、精确结果和边界
测试说明见 [`docs/GAME_ECONOMICS.md`](docs/GAME_ECONOMICS.md)。

## 资金与状态

- 余额和总账只保存 JavaScript 安全范围内的整数。
- 每次余额变动和业务记录在同一个数据库事务提交。
- 客户端写操作使用 `Idempotency-Key`；完成响应与业务事务一起持久化。
- 礼物资金先锁定，再由带租约的工作器领取。外部发送开始后遇到超时只进入 `uncertain`，不会自动退款。
- PK 先预授权扣款，再发送和结算。回报先写入本地耐久 spool，断网恢复后重试。
- 管理员只能通过受会话、CSRF、严格限流和幂等保护的对账接口处理 `uncertain` 记录；处理过程写入追加式审计日志。

数据库迁移由 `lib/database-migrations.js` 统一执行，使用 PostgreSQL advisory lock、文件校验和和 `minimal_games_schema_migrations`。已发布的迁移文件不得修改，后续结构变化必须新增迁移。

## Windows 工作器

```powershell
py -m pip install -r workers\bilibili\requirements.txt
npm ci
node windows-gift-listener.js
```

Cookie、Bilibili 配置和浏览器状态必须放在仓库外。默认使用仓库内已版本化并校验 SHA-256 的 Python 脚本；配置外部脚本路径时，内容必须与当前版本完全一致。PK 回报默认保存在 `private/worker-spool/pk-reports`，也可用 `PK_REPORT_SPOOL_DIR` 指向受限目录。

工作器强制使用 `THREESERVER_BACKEND=http`。普通礼物在任务仍为 `claimed` 时按目标房间启动并确认本地 sender，确认失败可安全退款；发起 `/send` 后只有同时收到 Bilibili 明确成功码和唯一 provider transaction ID 才会结算成功。第三方超时、无效响应、缺少可核对回执或仅完成页面点击一律进入 `uncertain`，不得切换到浏览器 sender 自动重试或退款。

本机 `threeserver.py` 还要求每次进程启动使用新的 `THREESERVER_LOCAL_TOKEN`，并通过 `THREESERVER_ALLOWED_GIFT_IDS` 指定允许的数字礼物 ID。由 Windows listener 启动的普通礼物及 PK sender 都会使用动态本地端口，并自动生成 token 和允许列表。所有 endpoint（包括状态接口）均要求 `X-Local-Sender-Token`。

更多协议和恢复说明见 `workers/bilibili/README.md`。

## 验证

```bash
npm run test:all
node scripts/build-release.js
ALLOW_DATABASE_CREATE_TEST=true npm run test:migrations
npm audit --audit-level=high
python -m compileall -q bilibili_gift_sender.py workers/bilibili
```

远端安全脚本默认被拒绝。确需对受控远端执行时，必须同时设置 `ALLOW_REMOTE_SECURITY_TESTS=I_ACKNOWLEDGE_REMOTE_TARGET`、`CHANGE_TICKET` 和目标 URL，并事先确认脚本是否会产生真实写入或花费。

## 发布与恢复

1. 停止 Windows 工作器，确认 `/api/workers/drain` 成功。
2. 使用 `pg_dump` 创建可恢复备份，并在隔离数据库演练恢复。
3. 在不向 Web 暴露 migrator 凭证的一次性任务中运行 `npm run migrate`，检查迁移输出及资金/状态不变量。
4. 部署 Web 服务，等待 `/ready` 返回 `ready: true`。
5. 重启工作器，确认 `worker_heartbeats` 的协议版本、版本号和时间持续更新。
6. 检查管理员礼物和 PK 对账队列，不得批量自动释放不确定资金。

数据库恢复应恢复整库，而不是只修改 `users.balance`。恢复后先保持工作器停止，核对 `balance_logs`、`gift_exchanges`、`pk_spend_authorizations`、幂等记录和 outbox，再恢复外部发送。

历史提交若曾包含密钥或 Cookie，删除当前文件并不能使旧值失效。必须在数据库、Render、Windows 工作器和 Bilibili 端轮换相关凭据；是否重写 Git 历史应作为单独、协调过的维护操作。
