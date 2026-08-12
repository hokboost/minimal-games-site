// 余额变动日志记录器
const pool = require('./db');
const { getRequestId } = require('./lib/request-context');
const { parseMoney } = require('./lib/integer-money');

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
        userAgent = null,
        requestId = null,
        client = null,
        managedTransaction = false
    }) {
        if (!client || !managedTransaction) {
            throw new Error('Balance ledger writes require the caller business transaction');
        }
        let numericAmount;
        try {
            numericAmount = parseMoney(amount, 'ledger amount');
        } catch (error) {
            throw new Error('Balance ledger amount must be a non-zero safe integer');
        }
        if (numericAmount === 0) {
            throw new Error('Balance ledger amount must be a non-zero safe integer');
        }
        await client.query(`
            INSERT INTO balance_logs (
                username, operation_type, amount, balance_before, balance_after,
                description, game_data, ip_address, user_agent, request_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            username,
            operationType,
            numericAmount,
            balanceBefore,
            balanceAfter,
            description,
            gameData ? JSON.stringify(gameData) : null,
            ipAddress,
            userAgent,
            requestId || getRequestId()
        ]);
        return true;
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
        requestId = null,
        requireSufficientBalance = true,
        client: externalClient = null,
        managedTransaction = false
    }) {
        let numericAmount;
        try {
            numericAmount = parseMoney(amount, 'balance change');
        } catch (error) {
            return { success: false, message: '余额变动参数无效' };
        }
        if (!username || numericAmount === 0) {
            return { success: false, message: '余额变动参数无效' };
        }
        if (typeof operationType !== 'string' || !operationType.trim()) {
            return { success: false, message: '余额操作类型无效' };
        }
        if (!externalClient || !managedTransaction) {
            return { success: false, message: '余额变更必须由调用方业务事务管理' };
        }

        const client = externalClient;
        const maxAttempts = 3;
        const lockErrorCodes = new Set(['55P03', '57014', '40P01', '40001']); // lock/stmt timeout, deadlock, serialization
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

        try {
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                const savepointName = `balance_update_${attempt}`;
                await client.query(`SAVEPOINT ${savepointName}`);
                try {
                    let updateResult;
                    if (requireSufficientBalance && numericAmount < 0) {
                        updateResult = await client.query(
                            `
                            UPDATE users
                            SET balance = balance + $2
                            WHERE username = $1 AND balance >= $3
                            RETURNING balance
                            `,
                            [username, numericAmount, Math.abs(numericAmount)]
                        );
                    } else {
                        updateResult = await client.query(
                            `
                            UPDATE users
                            SET balance = balance + $2
                            WHERE username = $1
                            RETURNING balance
                            `,
                            [username, numericAmount]
                        );
                    }

                    if (updateResult.rows.length === 0) {
                        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
                        return { success: false, message: '余额不足' };
                    }

                    const balanceAfter = parseMoney(updateResult.rows[0].balance, 'database balance', { min: 0 });
                    const balanceBefore = balanceAfter - numericAmount;
                    if (!Number.isSafeInteger(balanceAfter) || !Number.isSafeInteger(balanceBefore)) {
                        throw new Error('Database returned an unsafe balance value');
                    }

                    // 记录日志
                    await client.query(`
                        INSERT INTO balance_logs (
                            username, operation_type, amount, balance_before, balance_after,
                            description, game_data, ip_address, user_agent, request_id
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [
                        username,
                        operationType,
                        numericAmount,
                        balanceBefore,
                        balanceAfter,
                        description,
                        gameData ? JSON.stringify(gameData) : null,
                        ipAddress,
                        userAgent,
                        requestId || getRequestId()
                    ]);

                    await client.query(`RELEASE SAVEPOINT ${savepointName}`);
                    return {
                        success: true,
                        balance: balanceAfter,
                        balanceBefore: balanceBefore
                    };

                } catch (error) {
                    try {
                        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
                        await client.query(`RELEASE SAVEPOINT ${savepointName}`);
                    } catch (rollbackError) {
                        console.error('回滚余额更新保存点失败:', rollbackError);
                    }
                    const isLockTimeout = lockErrorCodes.has(error.code);
                    if (isLockTimeout && attempt < maxAttempts) {
                        await sleep(150);
                        continue;
                    }
                    console.error('更新余额失败:', error);
                    return {
                        success: false,
                        message: isLockTimeout ? '系统繁忙，请稍后重试' : '余额更新失败'
                    };
                }
            }
            return { success: false, message: '系统错误' };
        } catch (error) {
            console.error('余额更新初始化失败:', error);
            return { success: false, message: '系统繁忙，请稍后重试' };
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
        const safeLimit = Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 50));
        const safeOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
        const result = await pool.query(`
            SELECT
                id, operation_type, amount, balance_before, balance_after,
                description, game_data, created_at, ip_address
            FROM balance_logs
            WHERE username = $1
            ORDER BY created_at DESC, id DESC
            LIMIT $2 OFFSET $3
        `, [username, safeLimit, safeOffset]);
        return result.rows;
    }

    /**
     * 查询所有余额变动记录（管理员用）
     * @param {number} limit - 记录数量限制
     * @param {number} offset - 偏移量
     * @param {string} operationType - 操作类型过滤
     * @returns {Promise<Array>} 余额变动记录
     */
    static async getAllBalanceLogs(limit = 100, offset = 0, operationType = null) {
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

        query += ` ORDER BY created_at DESC, id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(
            Math.min(200, Math.max(1, Number.parseInt(limit, 10) || 100)),
            Math.max(0, Number.parseInt(offset, 10) || 0)
        );

        const result = await pool.query(query, params);
        return result.rows;
    }
}

module.exports = BalanceLogger;
