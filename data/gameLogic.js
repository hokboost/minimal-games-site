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

    // Wish 幸运祈愿游戏逻辑 - 真实系统模拟
    static wish = {
        // 全局统计数据（轻量化）
        globalStats: {
            totalAttempts: 0,
            totalWins: 0,
            currentCycleLossScore: 0, // 当前轮次亏欠值
            recentWins: 0,
            recentAttempts: 0,
            lastResetTime: Date.now()
        },

        // 分段概率配置 - 模拟真实系统
        pityConfig: {
            targetGlobalRate: 0.0135, // 目标1.35% = 平均74抽
            hardPity: 147, // 硬保底
            
            // 分段概率曲线（更像真实系统）
            earlyPhase: { start: 0, end: 60, baseRate: 0.006 }, // 0.6%
            midPhase: { start: 61, end: 120, baseRate: 0.008 }, // 0.8%
            latePhase: { start: 121, end: 146, baseRate: 0.035 }, // 3.5%
            
            // 跨轮补偿系数
            cycleLossBonus: {
                threshold: 90, // 超过90抽未出开始累积亏欠
                bonusPerDraw: 0.0001, // 每抽增加0.01%补偿
                maxBonus: 0.01, // 最大1%补偿
                decayRate: 0.3 // 下轮开始时保留30%
            }
        },

        // 计算当前抽数的基础概率
        getBaseProbability(pityCount) {
            const config = this.pityConfig;
            
            // 硬保底
            if (pityCount >= config.hardPity) {
                return 1.0;
            }
            
            // 分段概率
            if (pityCount <= config.earlyPhase.end) {
                return config.earlyPhase.baseRate;
            } else if (pityCount <= config.midPhase.end) {
                return config.midPhase.baseRate;
            } else {
                // 后期阶段：线性增长到保底
                const lateStart = config.midPhase.end + 1;
                const lateProgress = (pityCount - lateStart) / (config.hardPity - lateStart);
                return config.latePhase.baseRate + lateProgress * (1.0 - config.latePhase.baseRate);
            }
        },

        // 计算跨轮补偿加成
        getCycleLossBonus() {
            const config = this.pityConfig.cycleLossBonus;
            const bonus = Math.min(this.globalStats.currentCycleLossScore * config.bonusPerDraw, config.maxBonus);
            return bonus;
        },

        // 计算最终概率
        getCurrentWinRate(currentCount = 0) {
            // 基础概率（分段）
            let finalRate = this.getBaseProbability(currentCount);
            
            // 跨轮补偿
            const cycleLossBonus = this.getCycleLossBonus();
            finalRate += cycleLossBonus;
            
            // 连击抑制（模拟真实系统的平滑机制）
            if (this.globalStats.recentWins >= 1 && this.globalStats.recentAttempts <= 3) {
                finalRate *= 0.7; // 降低到70%
            }
            
            // 安全限制
            return Math.min(Math.max(finalRate, 0.001), 0.8);
        },

        // 更新跨轮状态
        updateCycleLossScore(currentCount, isWin) {
            const config = this.pityConfig.cycleLossBonus;
            
            if (isWin) {
                // 中奖时：如果上轮亏欠太多，下轮继承部分补偿
                if (currentCount > config.threshold) {
                    const lossAmount = currentCount - config.threshold;
                    this.globalStats.currentCycleLossScore = Math.floor(lossAmount * config.decayRate);
                } else {
                    this.globalStats.currentCycleLossScore = 0;
                }
            } else {
                // 未中奖时：如果超过阈值，累积亏欠
                if (currentCount > config.threshold) {
                    this.globalStats.currentCycleLossScore++;
                }
            }
        },

        // 更新统计数据
        updateStats(isWin, currentCount) {
            this.globalStats.totalAttempts++;
            this.globalStats.recentAttempts++;
            
            if (isWin) {
                this.globalStats.totalWins++;
                this.globalStats.recentWins++;
            }
            
            // 更新跨轮补偿状态
            this.updateCycleLossScore(currentCount, isWin);
            
            // 每20次重置短期统计
            if (this.globalStats.recentAttempts >= 20) {
                this.globalStats.recentAttempts = 0;
                this.globalStats.recentWins = 0;
            }
            
            // 长期数据管理
            if (this.globalStats.totalAttempts >= 50000) {
                const keepRatio = 0.8;
                this.globalStats.totalAttempts = Math.floor(this.globalStats.totalAttempts * keepRatio);
                this.globalStats.totalWins = Math.floor(this.globalStats.totalWins * keepRatio);
                this.globalStats.currentCycleLossScore = Math.floor(this.globalStats.currentCycleLossScore * keepRatio);
            }
        },

        // 主要祈愿逻辑
        makeWish(currentCount = 0) {
            const isGuaranteed = currentCount >= this.pityConfig.hardPity;
            
            // 获取当前概率（分段+跨轮补偿）
            const winRate = this.getCurrentWinRate(currentCount);
            
            // 使用crypto真随机数
            const randomBytes = crypto.randomBytes(4);
            const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF;
            
            const isWin = randomValue < winRate;
            
            // 更新统计
            this.updateStats(isWin, currentCount);
            
            // 计算全服中奖率
            const exactGlobalRate = this.globalStats.totalAttempts > 0 ? 
                (this.globalStats.totalWins / this.globalStats.totalAttempts) : this.pityConfig.targetGlobalRate;
            
            return {
                isWin,
                guaranteed: isGuaranteed,
                actualRate: winRate,
                globalRate: exactGlobalRate,
                debug: {
                    randomValue,
                    winRate,
                    currentCount,
                    baseRate: this.getBaseProbability(currentCount),
                    cycleLossBonus: this.getCycleLossBonus(),
                    cycleLossScore: this.globalStats.currentCycleLossScore,
                    phase: currentCount <= 60 ? 'early' : currentCount <= 120 ? 'mid' : 'late',
                    globalStats: { ...this.globalStats }
                }
            };
        }
    };
}

module.exports = GameLogic;