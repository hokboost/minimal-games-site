// 余额变动日志记录器
const pool = require('./db');

class BalanceLogger {
    /**
     * 记录余额变动
     * @param {Object} params - 记录参数
     * @param {string} params.username - 用户名
     * @param {string} params.operationType - 操作类型
     * @param {number} params.amount - 变动金额（正数增加，负数减少）
     * @param {number} params.balanceBefore - 变动前余额
     * @param {number} params.balanceAfter - 变动后余额
     * @param {string} params.description - 操作描述
     * @param {Object} params.gameData - 游戏数据
     * @param {string} params.ipAddress - IP地址
     * @param {string} params.userAgent - 用户代理
     */
    static async log({
        username,
        operationType,
        amount,
        balanceBefore,
        balanceAfter,
        description = '',
        gameData = null,
        ipAddress = null,
        userAgent = null
    }) {
        try {
            await pool.query(`
                INSERT INTO balance_logs (
                    username, operation_type, amount, balance_before, balance_after,
                    description, game_data, ip_address, user_agent
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            `, [
                username,
                operationType,
                amount,
                balanceBefore,
                balanceAfter,
                description,
                gameData ? JSON.stringify(gameData) : null,
                ipAddress,
                userAgent
            ]);
        } catch (error) {
            console.error('记录余额日志失败:', error);
            // 不抛出错误，避免影响主业务
        }
    }

    /**
     * 安全的余额更新操作（带日志记录）
     * @param {Object} params - 更新参数
     * @param {string} params.username - 用户名
     * @param {number} params.amount - 变动金额（正数增加，负数减少）
     * @param {string} params.operationType - 操作类型
     * @param {string} params.description - 操作描述
     * @param {Object} params.gameData - 游戏数据
     * @param {string} params.ipAddress - IP地址
     * @param {string} params.userAgent - 用户代理
     * @param {boolean} params.requireSufficientBalance - 是否需要余额充足（默认true）
     * @returns {Promise<Object>} {success: boolean, balance: number, message?: string}
     */
    static async updateBalance({
        username,
        amount,
        operationType,
        description = '',
        gameData = null,
        ipAddress = null,
        userAgent = null,
        requireSufficientBalance = true,
        client: externalClient = null,
        managedTransaction = false
    }) {
        const client = externalClient || await pool.connect();
        const manageTx = false; // 按要求去掉事务/锁控制，使用单语句更新
        const maxAttempts = 3;
        const lockErrorCodes = new Set(['55P03', '57014', '40P01', '40001']); // lock/stmt timeout, deadlock, serialization
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        try {
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                try {
                    // 不再显式开启事务或设置锁/超时，缩短占用时间
                    // 单语句更新，避免显式行锁等待
                    let updateResult;
                    if (requireSufficientBalance && amount < 0) {
                        updateResult = await client.query(
                            `
                            UPDATE users
                            SET balance = balance + $2
                            WHERE username = $1 AND balance >= $3
                            RETURNING balance
                            `,
                            [username, amount, Math.abs(amount)]
                        );
                    } else {
                        updateResult = await client.query(
                            `
                            UPDATE users
                            SET balance = balance + $2
                            WHERE username = $1
                            RETURNING balance
                            `,
                            [username, amount]
                        );
                    }

                    if (updateResult.rows.length === 0) {
                        if (manageTx) await client.query('ROLLBACK');
                        return { success: false, message: '余额不足' };
                    }

                    const balanceAfter = parseFloat(updateResult.rows[0].balance);
                    const balanceBefore = balanceAfter - amount;

                    // 记录日志
                    await client.query(`
                        INSERT INTO balance_logs (
                            username, operation_type, amount, balance_before, balance_after,
                            description, game_data, ip_address, user_agent
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    `, [
                        username,
                        operationType,
                        amount,
                        balanceBefore,
                        balanceAfter,
                        description,
                        gameData ? JSON.stringify(gameData) : null,
                        ipAddress,
                        userAgent
                    ]);
                    
                    if (manageTx) {
                        await client.query('COMMIT');
                    }
                    
                    return {
                        success: true,
                        balance: balanceAfter,
                        balanceBefore: balanceBefore
                    };
                    
                } catch (error) {
                    // 确保异常后事务被回滚，避免后续查询遇到 25P02
                    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
                    const isLockTimeout = lockErrorCodes.has(error.code);
                    if (isLockTimeout && attempt < maxAttempts) {
                        // 轻量重试，缓解偶发锁等待
                        await sleep(150);
                        continue;
                    }
                    console.error('更新余额失败:', error);
                    return {
                        success: false,
                        message: isLockTimeout ? '系统繁忙，请稍后重试' : (error.message || '系统错误')
                    };
                }
            }
            return { success: false, message: '系统错误' };
        } finally {
            if (!externalClient) {
                client.release();
            }
        }
    }

    /**
     * 查询用户余额变动记录
     * @param {string} username - 用户名
     * @param {number} limit - 记录数量限制
     * @param {number} offset - 偏移量
     * @returns {Promise<Array>} 余额变动记录
     */
    static async getUserBalanceLogs(username, limit = 50, offset = 0) {
        try {
            const result = await pool.query(`
                SELECT 
                    id, operation_type, amount, balance_before, balance_after,
                    description, game_data, created_at, ip_address
                FROM balance_logs 
                WHERE username = $1 
                ORDER BY created_at DESC 
                LIMIT $2 OFFSET $3
            `, [username, limit, offset]);
            
            return result.rows;
        } catch (error) {
            console.error('查询余额记录失败:', error);
            return [];
        }
    }

    /**
     * 查询所有余额变动记录（管理员用）
     * @param {number} limit - 记录数量限制
     * @param {number} offset - 偏移量
     * @param {string} operationType - 操作类型过滤
     * @returns {Promise<Array>} 余额变动记录
     */
    static async getAllBalanceLogs(limit = 100, offset = 0, operationType = null) {
        try {
            let query = `
                SELECT 
                    id, username, operation_type, amount, balance_before, balance_after,
                    description, game_data, created_at, ip_address
                FROM balance_logs 
            `;
            const params = [];
            
            if (operationType) {
                query += ' WHERE operation_type = $1 ';
                params.push(operationType);
            }
            
            query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
            params.push(limit, offset);
            
            const result = await pool.query(query, params);
            return result.rows;
        } catch (error) {
            console.error('查询所有余额记录失败:', error);
            return [];
        }
    }
}

module.exports = BalanceLogger;
