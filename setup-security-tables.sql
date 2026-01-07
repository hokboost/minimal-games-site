-- 安全管理相关数据表

-- IP活动记录表
CREATE TABLE IF NOT EXISTS ip_activities (
    id SERIAL PRIMARY KEY,
    ip_address INET NOT NULL,
    username VARCHAR(50),
    user_agent TEXT,
    action VARCHAR(50) DEFAULT 'access',
    location_country VARCHAR(100),
    location_city VARCHAR(100),
    location_region VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IP黑名单表
CREATE TABLE IF NOT EXISTS ip_blacklist (
    id SERIAL PRIMARY KEY,
    ip_address INET UNIQUE NOT NULL,
    reason TEXT NOT NULL,
    added_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- IP白名单表
CREATE TABLE IF NOT EXISTS ip_whitelist (
    id SERIAL PRIMARY KEY,
    ip_address INET UNIQUE NOT NULL,
    reason TEXT NOT NULL,
    added_by VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- 活跃会话表
CREATE TABLE IF NOT EXISTS active_sessions (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    terminated_at TIMESTAMP WITH TIME ZONE,
    termination_reason VARCHAR(100),
    is_active BOOLEAN DEFAULT true
);

-- 登录日志表
CREATE TABLE IF NOT EXISTS login_logs (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    ip_address INET NOT NULL,
    user_agent TEXT,
    login_result VARCHAR(20) NOT NULL, -- 'success', 'failed', 'blocked'
    failure_reason TEXT,
    location_country VARCHAR(100),
    location_city VARCHAR(100),
    risk_score INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 安全事件表
CREATE TABLE IF NOT EXISTS security_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL, -- 'suspicious_login', 'multiple_sessions', 'high_risk_ip' 等
    username VARCHAR(50),
    ip_address INET,
    description TEXT,
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    handled BOOLEAN DEFAULT false,
    handled_by VARCHAR(50),
    handled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_ip_activities_ip ON ip_activities(ip_address);
CREATE INDEX IF NOT EXISTS idx_ip_activities_username ON ip_activities(username);
CREATE INDEX IF NOT EXISTS idx_ip_activities_created_at ON ip_activities(created_at);
CREATE INDEX IF NOT EXISTS idx_ip_activities_action ON ip_activities(action);

CREATE INDEX IF NOT EXISTS idx_active_sessions_username ON active_sessions(username);
CREATE INDEX IF NOT EXISTS idx_active_sessions_session_id ON active_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_active_sessions_ip ON active_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_active_sessions_active ON active_sessions(is_active);

CREATE INDEX IF NOT EXISTS idx_login_logs_username ON login_logs(username);
CREATE INDEX IF NOT EXISTS idx_login_logs_ip ON login_logs(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_logs_created_at ON login_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_login_logs_result ON login_logs(login_result);

CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_handled ON security_events(handled);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);

-- 添加一些预设的管理员白名单IP (可选)
-- INSERT INTO ip_whitelist (ip_address, reason, added_by) 
-- VALUES ('127.0.0.1', '本地开发环境', 'system') 
-- ON CONFLICT (ip_address) DO NOTHING;

COMMENT ON TABLE ip_activities IS 'IP活动记录，用于风险评估和行为分析';
COMMENT ON TABLE ip_blacklist IS 'IP黑名单，高风险或恶意IP';
COMMENT ON TABLE ip_whitelist IS 'IP白名单，可信任IP';
COMMENT ON TABLE active_sessions IS '活跃会话管理，实现单设备登录';
COMMENT ON TABLE login_logs IS '登录日志，记录所有登录尝试';
COMMENT ON TABLE security_events IS '安全事件记录，用于监控和报警';