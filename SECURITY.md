# Security Operations

不要在 Issue、日志、截图或聊天中提交数据库密码、管理员密码、会话密钥、工作器密钥或 Bilibili Cookie。疑似泄露时应先轮换凭据，再调查日志和历史提交。

管理员登录要求密码，高风险操作还要求当前管理员会话、CSRF、限流以及十分钟内完成的密码 step-up；成功和失败结果都会写入 `admin_audit_log`。管理员 TOTP 不再是配置项或登录条件，因此管理员必须使用独立高熵密码并妥善保管。生产环境不支持管理员 IP 白名单，因为移动网络地址不稳定；管理权限依赖身份、近期密码验证、会话保护和审计。

外部礼物结果为 `uncertain` 时，不得根据网络错误自动退款。管理员应核对 Bilibili 交易记录、provider transaction ID、工作器 spool、`gift_delivery_events` 或 `pk_gift_logs`，写明至少 8 个字符的依据后再使用对账接口。

安全测试脚本默认只允许 localhost。生产测试必须有变更单、备份、限额测试账号和明确的回滚窗口。
