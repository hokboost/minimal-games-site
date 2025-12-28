// 游戏逻辑模块
const crypto = require('crypto');

class GameLogic {
    // 生成随机数（使用crypto真随机）
    static randomInt(min, max) {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8);
        const maxValue = Math.pow(2, bytesNeeded * 8);
        
        let randomValue;
        do {
            randomValue = crypto.randomBytes(bytesNeeded).readUIntBE(0, bytesNeeded);
        } while (randomValue >= maxValue - (maxValue % range));
        
        return min + (randomValue % range);
    }

    // 生成随机字符串
    static generateToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Quiz 游戏逻辑
    static quiz = {
        // 前6题必选类别 (已废弃，现在完全随机)
        // requiredCategories: ['常识', '英语', '数学', '语文', '音乐', '体育'],
        
        // 获取随机题目
        getRandomQuestion(questions, seenIds = [], questionIndex = 0) {
            const availableQuestions = questions.filter(q => !seenIds.includes(q.id));
            if (availableQuestions.length === 0) return null;
            
            // 完全随机选择，不再限制前6题的类别
            const randomIndex = GameLogic.randomInt(0, availableQuestions.length - 1);
            return availableQuestions[randomIndex];
        },

        // 验证答案
        validateAnswer(question, answerIndex, token) {
            if (!question || answerIndex < 0 || answerIndex >= question.options.length) {
                return false;
            }
            return answerIndex === question.correct;
        },

        // 计算得分
        calculateScore(answers, questions) {
            let correct = 0;
            for (const answer of answers) {
                const question = questions.find(q => q.id === answer.questionId);
                if (question && this.validateAnswer(question, answer.answerIndex)) {
                    correct++;
                }
            }
            return correct;
        }
    };

    // Slot 游戏逻辑 - 新的金额概率系统
    static slot = {
        spin() {
            const rand = Math.random();
            let reward = '0';
            
            // 新概率分配：各20%概率
            if (rand < 0.2) {
                reward = '+2';  // 20%概率
            } else if (rand < 0.4) {  // 0.2-0.4 = 20%
                reward = '+1';  // 20%概率
            } else if (rand < 0.6) {  // 0.4-0.6 = 20%
                reward = '0';   // 20%概率
            } else if (rand < 0.8) {  // 0.6-0.8 = 20%
                reward = '-1';  // 20%概率
            } else {
                reward = '-2';  // 0.8-1.0 = 20%
            }
            
            // 生成显示用的转轮
            const amounts = ['+2', '+1', '0', '-1', '-2'];
            let reels;
            
            if (reward === '0') {
                // 40%概率：3个图案不一样就啥也没有
                do {
                    reels = [
                        amounts[GameLogic.randomInt(0, amounts.length - 1)],
                        amounts[GameLogic.randomInt(0, amounts.length - 1)],
                        amounts[GameLogic.randomInt(0, amounts.length - 1)]
                    ];
                } while (reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2]);
            } else {
                // 有奖时：显示对应的金额
                reels = [reward, reward, reward];
            }
            
            return {
                reels,
                reward,
                isWin: reward !== '0'
            };
        }
    };

    // Scratch 刮刮卡游戏逻辑 - 新的金额系统
    static scratch = {
        // 生成刮刮卡
        generateCard() {
            // 生成5个中奖号码
            const winningNumbers = [];
            while (winningNumbers.length < 5) {
                const num = GameLogic.randomInt(1, 99);
                if (!winningNumbers.includes(num)) {
                    winningNumbers.push(num);
                }
            }
            
            // 生成20个玩家号码槽，每个都有金额
            const slots = [];
            
            for (let i = 0; i < 20; i++) {
                const num = GameLogic.randomInt(1, 99);
                
                // 每个号码都有一个金额 - 根据概率分配
                const rand = Math.random();
                let amount;
                if (rand < 0.1) {
                    amount = '+2';  // 10%概率
                } else if (rand < 0.3) {
                    amount = '+1';  // 20%概率
                } else {
                    amount = '0';    // 70%概率无奖
                }
                
                // 只有匹配中奖号码才能获得奖励
                const isWinningNumber = winningNumbers.includes(num);
                const finalAmount = isWinningNumber ? amount : '0';
                
                slots.push({ 
                    num, 
                    amount: amount,  // 显示的金额
                    prize: finalAmount === '0' ? null : finalAmount  // 实际奖励
                });
            }
            
            return {
                winningNumbers,
                slots
            };
        }
    };

    // Spin 转盘游戏逻辑 - 生存直播挑战版
    static spin = {
        challenges: [
            '2加币买吃的',
            'Quiz',
            'Scratch', 
            'Slot',
            '10个深蹲',
            // '和路人美女要微信',
            // '和路人美女合照',
            // '给路人吉他唱歌打分',
            '热舞1分钟',
            '10个俯卧撑',
            // '公主抱下蹲5个',
            // '要路人帅哥微信',
            // '找路人要吃的',
            // '和路人音准比拼',
            // '找到一名路人猜歌',
            // '找路人妹妹合唱',
            // '回答队友真心话',
            // '连续夸赞路人美女30秒',
            // '人群中大声清唱10秒',
            '转盘次数+2',
            // '和路人帅哥合照',
            '反方向走3分钟',
            '负重前行',
            '3分钟不能说你我他',
            '20秒吹一瓶可乐',
            // '和路人石头剪刀布',
            // '让路人B站关注一个乌龟酱',
            // '找一名路人猜年龄',
            '浏览器记录',
            // '手拉手走一分钟',
            '垃圾清洁工',
            // '含水对视',
            // '背起走路'
        ],
        
        // 权重数组：所有选项权重相等
        weights: [
            1, // 2加币买吃的
            1, // Quiz
            1, // Scratch
            1, // Slot
            1, // 集体10个深蹲
            // 1, // 和路人美女要微信
            // 1, // 和路人美女合照
            // 1, // 给路人吉他唱歌打分
            1, // 集体热舞1分钟
            1, // 集体10个俯卧撑
            // 1, // 公主抱下蹲5个
            // 1, // 要路人帅哥微信
            // 1, // 找路人要吃的
            // 1, // 和路人音准比拼
            // 1, // 找到一名路人猜歌
            // 1, // 找路人妹妹合唱
            // 1, // 回答队友真心话
            // 1, // 连续夸赞路人美女30秒
            // 1, // 人群中大声清唱10秒
            1, // 转盘次数+2
            // 1, // 和路人帅哥合照
            1, // 反方向走3分钟
            1, // 负重前行
            1, // 3分钟不能说你我他
            1, // 20秒吹一瓶可乐
            // 1, // 和路人石头剪刀布
            // 1, // 让路人B站关注一个乌龟酱
            // 1, // 找一名路人猜年龄
            1, // 浏览器记录
            // 1, // 手拉手走一分钟
            1, // 垃圾清洁工
            // 1, // 含水对视
            // 1  // 背起走路
        ],
        
        names: ['麻瓜', '大彪', '乌龟'],
        
        // 歌手列表
        singers: ['周杰伦', '林俊杰', '邓紫棋', '张学友', '陈奕迅', '王菲', '薛之谦', '毛不易', '李荣浩', '汪苏泷'],
        
        // 集体任务不需要加名字
        groupTasks: ['10个深蹲', '热舞1分钟', '10个俯卧撑', '转盘次数+2', 
                    '反方向走3分钟', '负重前行'],

        // 根据权重随机选择挑战（使用crypto真随机）
        getWeightedRandomChallenge() {
            const totalWeight = this.weights.reduce((sum, weight) => sum + weight, 0);
            // 使用crypto生成0到1之间的随机数
            const randomBytes = crypto.randomBytes(4);
            const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
            let random = randomValue * totalWeight;
            
            for (let i = 0; i < this.weights.length; i++) {
                random -= this.weights[i];
                if (random <= 0) {
                    return i;
                }
            }
            return 0; // fallback
        },

        spin() {
            // 使用权重随机选择实际的挑战
            const actualChallengeIndex = this.getWeightedRandomChallenge();
            let challenge = this.challenges[actualChallengeIndex];
            let singerInfo = null;
            
            // 如果是猜歌任务，选择歌手
            // if (challenge === '找到一名路人猜歌') {
            //     const randomSinger = this.singers[GameLogic.randomInt(0, this.singers.length - 1)];
            //     singerInfo = randomSinger;
            // }
            
            // 如果不是集体任务，随机加上一个人名
            // if (!this.groupTasks.includes(this.challenges[actualChallengeIndex])) {
            //     const randomName = this.names[GameLogic.randomInt(0, this.names.length - 1)];
            //     challenge = `${randomName}: ${challenge}`;
            // }
            
            // 计算显示角度（基于实际选择的挑战）
            const segmentAngle = 360 / this.challenges.length;  // 30个任务，每个12度
            const centerAngle = actualChallengeIndex * segmentAngle + segmentAngle / 2;
            const randomOffset = GameLogic.randomInt(-5, 5) + (Math.random() * 0.9 - 0.45);  // ±5.9度偏移，确保在扇形内
            const angle = (centerAngle + randomOffset) % 360;
            
            return {
                prize: challenge,
                angle,
                success: true,
                singerInfo // 额外返回歌手信息，方便前端显示
            };
        }
    };

    // Wish 幸运祈愿游戏逻辑 - 精确1.6%中奖率
    static wish = {
        // 全局统计数据（模拟服务器端统计）
        globalStats: {
            totalAttempts: 0,
            totalWins: 0,
            guaranteedWins: 0, // 保底中奖次数
            recentWins: 0,
            recentAttempts: 0,
            cumulativeError: 0.0, // 累积误差
            lastResetTime: Date.now()
        },

        // 获取当前真实概率（精确控制到1.6%）
        getCurrentWinRate(currentCount = 0) {
            const targetRate = 0.0145; // 精确目标1.45%
            
            // 如果达到保底，必中
            if (currentCount >= 147) {
                return 1.0;
            }
            
            // 计算不包含保底的实际中奖率
            const normalWins = this.globalStats.totalWins - this.globalStats.guaranteedWins;
            const currentRate = this.globalStats.totalAttempts > 0 ? 
                normalWins / this.globalStats.totalAttempts : 0;
            
            // PID控制器式精确调整
            const error = targetRate - currentRate;
            this.globalStats.cumulativeError += error;
            
            // 限制累积误差防止过度调整
            this.globalStats.cumulativeError = Math.max(-0.05, Math.min(0.05, this.globalStats.cumulativeError));
            
            // 精确调整算法
            const Kp = 1.0;  // 比例系数
            const Ki = 0.3;  // 积分系数
            const adjustment = Kp * error + Ki * this.globalStats.cumulativeError;
            
            let adjustedRate = targetRate + adjustment;
            
            // 保底机制补偿：考虑保底对整体概率的影响
            const guaranteeImpact = this.calculateGuaranteeImpact();
            adjustedRate -= guaranteeImpact;
            
            // 渐进式保底：最后20次温和提升
            if (currentCount >= 127) {
                const gentleBoost = (currentCount - 127) / 20 * 0.01; // 最后20次提升1%
                adjustedRate += gentleBoost;
            }
            
            // 连击保护：温和降低而非急剧下降
            if (this.globalStats.recentWins >= 2 && this.globalStats.recentAttempts <= 8) {
                adjustedRate *= 0.7; // 降低到70%
            }
            
            // 精确限制范围
            return Math.min(Math.max(adjustedRate, 0.002), 0.04); // 限制在0.2%-4%范围
        },

        // 计算保底机制对整体概率的影响
        calculateGuaranteeImpact() {
            if (this.globalStats.totalAttempts === 0) return 0;
            
            // 估算保底机制额外贡献的中奖率
            const guaranteeContribution = this.globalStats.guaranteedWins / this.globalStats.totalAttempts;
            
            // 理论上每148次有1次保底 = 0.676%额外概率
            const theoreticalGuaranteeRate = 1 / 148;
            
            // 返回实际保底影响，用于从基础概率中扣除
            return Math.min(guaranteeContribution, theoreticalGuaranteeRate);
        },

        // 更新统计数据
        updateStats(isWin, isGuaranteed = false) {
            this.globalStats.totalAttempts++;
            this.globalStats.recentAttempts++;
            
            if (isWin) {
                this.globalStats.totalWins++;
                this.globalStats.recentWins++;
                
                if (isGuaranteed) {
                    this.globalStats.guaranteedWins++;
                }
            }
            
            // 每50次重置短期统计
            if (this.globalStats.recentAttempts >= 50) {
                this.globalStats.recentAttempts = 0;
                this.globalStats.recentWins = 0;
            }
            
            // 长期数据管理：保持统计精确性
            if (this.globalStats.totalAttempts >= 20000) {
                // 保持最近10000次的数据，丢弃更早的
                const keepRatio = 0.5;
                this.globalStats.totalAttempts = Math.floor(this.globalStats.totalAttempts * keepRatio);
                this.globalStats.totalWins = Math.floor(this.globalStats.totalWins * keepRatio);
                this.globalStats.guaranteedWins = Math.floor(this.globalStats.guaranteedWins * keepRatio);
                this.globalStats.cumulativeError *= keepRatio; // 误差也按比例缩放
            }
        },

        // 主要祈愿逻辑
        makeWish(currentCount = 0) {
            const isGuaranteed = currentCount >= 147;
            
            // 获取当前动态概率
            const winRate = this.getCurrentWinRate(currentCount);
            
            // 使用crypto真随机数
            const randomBytes = crypto.randomBytes(4);
            const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
            
            const isWin = randomValue < winRate;
            
            // 更新统计
            this.updateStats(isWin, isGuaranteed && isWin);
            
            // 计算精确的全服中奖率
            const exactGlobalRate = this.globalStats.totalAttempts > 0 ? 
                (this.globalStats.totalWins / this.globalStats.totalAttempts) : 0.0145;
            
            return {
                isWin,
                guaranteed: isGuaranteed,
                actualRate: winRate,
                globalRate: exactGlobalRate,
                debug: {
                    randomValue,
                    winRate,
                    currentCount,
                    normalWins: this.globalStats.totalWins - this.globalStats.guaranteedWins,
                    guaranteedWins: this.globalStats.guaranteedWins,
                    cumulativeError: this.globalStats.cumulativeError,
                    globalStats: { ...this.globalStats }
                }
            };
        }
    };
}

module.exports = GameLogic;