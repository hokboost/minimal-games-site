// 国际化配置文件
const translations = {
    zh: {
        // 导航栏
        nav: {
            home: '首页',
            games: '游戏',
            gifts: '礼物兑换',
            profile: '个人中心',
            admin: '管理后台',
            logout: '登出',
            login: '登录',
            register: '注册'
        },

        // 首页
        home: {
            title: 'Minimal Games - 娱乐游戏平台',
            welcome: '欢迎来到 Minimal Games',
            subtitle: '玩游戏，赢电币，兑换真实礼物！',
            getStarted: '立即开始',
            features: {
                title: '平台特色',
                games: '多种游戏',
                gamesDesc: '答题、老虎机、刮刮乐、转盘等多种游戏',
                rewards: '真实奖励',
                rewardsDesc: '电币可兑换真实B站礼物',
                safe: '安全可靠',
                safeDesc: '完善的账户系统和交易保护'
            },
            gameList: {
                title: '游戏列表',
                quiz: {
                    name: '答题游戏',
                    desc: '回答问题赢取电币'
                },
                slot: {
                    name: '老虎机',
                    desc: '拉动拉杆，赢取大奖'
                },
                scratch: {
                    name: '刮刮乐',
                    desc: '刮开卡片，发现惊喜'
                },
                spin: {
                    name: '幸运转盘',
                    desc: '转动转盘，好运连连'
                },
                stone: {
                    name: '魔法宝石',
                    desc: '收集宝石，获得奖励'
                },
                flip: {
                    name: '翻牌游戏',
                    desc: '翻开卡片，挑战运气'
                },
                duel: {
                    name: '礼物对决',
                    desc: '挑战礼物，赢取奖励'
                },
                wish: {
                    name: '祈愿系统',
                    desc: '许下心愿，梦想成真'
                }
            }
        },

        // 登录/注册
        auth: {
            login: '登录',
            register: '注册',
            username: '用户名',
            password: '密码',
            confirmPassword: '确认密码',
            loginButton: '登录',
            registerButton: '注册',
            noAccount: '没有账号？',
            hasAccount: '已有账号？',
            goRegister: '去注册',
            goLogin: '去登录'
        },

        // 礼物兑换
        gifts: {
            title: '礼物兑换中心',
            balance: '当前电币',
            exchangeHistory: '兑换记录',
            exchange: '兑换',
            cost: '消耗',
            quantity: '数量',
            confirm: '确认兑换',
            cancel: '取消',
            success: '兑换成功',
            failed: '兑换失败',
            insufficient: '电币不足',
            pleaseLogin: '请先登录',
            noHistory: '暂无兑换记录',
            status: {
                pending: '待处理',
                processing: '处理中',
                completed: '已完成',
                failed: '失败',
                refunded: '已退款'
            }
        },

        // 个人中心
        profile: {
            title: '个人中心',
            username: '用户名',
            balance: '电币余额',
            accountInfo: '账户信息',
            gameRecords: '游戏记录',
            giftRecords: '兑换记录',
            changePassword: '修改密码',
            oldPassword: '原密码',
            newPassword: '新密码',
            confirmNewPassword: '确认新密码',
            updatePassword: '更新密码',
            statistics: '统计信息',
            totalGames: '游戏总次数',
            totalWins: '获胜次数',
            totalGifts: '兑换礼物数'
        },

        // 游戏通用
        game: {
            start: '开始游戏',
            play: '开始',
            next: '下一题',
            submit: '提交',
            restart: '重新开始',
            bet: '下注',
            betAmount: '下注金额',
            result: '结果',
            win: '获胜',
            lose: '失败',
            reward: '奖励',
            cost: '花费',
            balance: '余额',
            score: '得分',
            loading: '加载中...',
            confirm: '确认',
            cancel: '取消'
        },

        // 答题游戏
        quiz: {
            title: '答题游戏',
            startCost: '开始游戏需要 10 电币',
            question: '问题',
            selectAnswer: '请选择答案',
            correct: '回答正确',
            wrong: '回答错误',
            finalScore: '最终得分',
            reward: '奖励电币'
        },

        // 老虎机
        slot: {
            title: '老虎机游戏',
            spin: '拉动拉杆',
            selectBet: '选择下注金额',
            jackpot: '大奖',
            miniJackpot: '小奖',
            win: '中奖',
            payout: '赢得'
        },

        // 刮刮乐
        scratch: {
            title: '刮刮乐游戏',
            selectTier: '选择刮刮卡',
            tier1: '初级卡 (10电币)',
            tier2: '中级卡 (30电币)',
            tier3: '高级卡 (50电币)',
            scratch: '开始刮',
            reveal: '全部揭晓',
            matches: '匹配数',
            prize: '奖品'
        },

        // 转盘
        spin: {
            title: '幸运转盘',
            spinCost: '旋转一次需要 5 电币',
            spin: '旋转',
            prize: '您获得了',
            goodLuck: '祝您好运'
        },

        // 宝石游戏
        stone: {
            title: '魔法宝石游戏',
            collect: '收集',
            replace: '替换',
            cashout: '结算',
            slot: '槽位',
            matchBonus: '连击奖励',
            totalReward: '总奖励'
        },

        // 翻牌游戏
        flip: {
            title: '翻牌游戏',
            flip: '翻牌',
            reveal: '揭晓',
            good: '好牌',
            bad: '坏牌',
            continue: '继续',
            cashout: '结算',
            finalReward: '最终奖励'
        },

        // 对决游戏
        duel: {
            title: '礼物对决',
            selectGift: '选择礼物',
            selectPower: '选择战力',
            duel: '开始对决',
            victory: '胜利',
            defeat: '失败',
            reward: '奖励'
        },

        // 祈愿系统
        wish: {
            title: '祈愿系统',
            selectGift: '选择祈愿礼物',
            wish: '许愿',
            guarantee: '保底',
            wishCount: '祈愿次数',
            success: '祈愿成功',
            failed: '未中奖',
            batchWish: '批量祈愿'
        },

        // 管理后台
        admin: {
            title: '管理后台',
            users: '用户管理',
            addCoins: '添加电币',
            updateBalance: '修改余额',
            authorize: '授权用户',
            unauthorize: '取消授权',
            resetPassword: '重置密码',
            userRecords: '用户记录',
            gameRecords: '游戏记录',
            giftRecords: '兑换记录',
            statistics: '统计数据',
            totalUsers: '总用户数',
            activeUsers: '活跃用户',
            totalGifts: '总兑换数'
        },

        // 通用消息
        common: {
            success: '操作成功',
            failed: '操作失败',
            error: '发生错误',
            loading: '加载中...',
            confirm: '确认',
            cancel: '取消',
            save: '保存',
            delete: '删除',
            edit: '编辑',
            close: '关闭',
            back: '返回',
            next: '下一步',
            previous: '上一步',
            submit: '提交',
            reset: '重置',
            search: '搜索',
            filter: '筛选',
            sort: '排序',
            refresh: '刷新',
            language: '语言',
            theme: '主题',
            help: '帮助',
            about: '关于'
        }
    },

    en: {
        // Navigation
        nav: {
            home: 'Home',
            games: 'Games',
            gifts: 'Gift Exchange',
            profile: 'Profile',
            admin: 'Admin',
            logout: 'Logout',
            login: 'Login',
            register: 'Register'
        },

        // Home page
        home: {
            title: 'Minimal Games - Entertainment Platform',
            welcome: 'Welcome to Minimal Games',
            subtitle: 'Play games, earn coins, redeem real gifts!',
            getStarted: 'Get Started',
            features: {
                title: 'Platform Features',
                games: 'Various Games',
                gamesDesc: 'Quiz, slots, scratch cards, spin wheel and more',
                rewards: 'Real Rewards',
                rewardsDesc: 'Exchange coins for real Bilibili gifts',
                safe: 'Safe & Secure',
                safeDesc: 'Complete account system and transaction protection'
            },
            gameList: {
                title: 'Game List',
                quiz: {
                    name: 'Quiz Game',
                    desc: 'Answer questions to earn coins'
                },
                slot: {
                    name: 'Slot Machine',
                    desc: 'Pull the lever, win big prizes'
                },
                scratch: {
                    name: 'Scratch Card',
                    desc: 'Scratch cards for surprises'
                },
                spin: {
                    name: 'Lucky Wheel',
                    desc: 'Spin the wheel for good luck'
                },
                stone: {
                    name: 'Magic Stones',
                    desc: 'Collect stones, earn rewards'
                },
                flip: {
                    name: 'Card Flip',
                    desc: 'Flip cards, test your luck'
                },
                duel: {
                    name: 'Gift Duel',
                    desc: 'Challenge gifts, win rewards'
                },
                wish: {
                    name: 'Wish System',
                    desc: 'Make wishes, dreams come true'
                }
            }
        },

        // Auth
        auth: {
            login: 'Login',
            register: 'Register',
            username: 'Username',
            password: 'Password',
            confirmPassword: 'Confirm Password',
            loginButton: 'Login',
            registerButton: 'Register',
            noAccount: "Don't have an account?",
            hasAccount: 'Already have an account?',
            goRegister: 'Register',
            goLogin: 'Login'
        },

        // Gift Exchange
        gifts: {
            title: 'Gift Exchange Center',
            balance: 'Current Balance',
            exchangeHistory: 'Exchange History',
            exchange: 'Exchange',
            cost: 'Cost',
            quantity: 'Quantity',
            confirm: 'Confirm Exchange',
            cancel: 'Cancel',
            success: 'Exchange Successful',
            failed: 'Exchange Failed',
            insufficient: 'Insufficient Balance',
            pleaseLogin: 'Please Login First',
            noHistory: 'No Exchange History',
            status: {
                pending: 'Pending',
                processing: 'Processing',
                completed: 'Completed',
                failed: 'Failed',
                refunded: 'Refunded'
            }
        },

        // Profile
        profile: {
            title: 'Profile',
            username: 'Username',
            balance: 'Coin Balance',
            accountInfo: 'Account Info',
            gameRecords: 'Game Records',
            giftRecords: 'Exchange Records',
            changePassword: 'Change Password',
            oldPassword: 'Old Password',
            newPassword: 'New Password',
            confirmNewPassword: 'Confirm New Password',
            updatePassword: 'Update Password',
            statistics: 'Statistics',
            totalGames: 'Total Games',
            totalWins: 'Total Wins',
            totalGifts: 'Total Gifts'
        },

        // Game Common
        game: {
            start: 'Start Game',
            play: 'Play',
            next: 'Next',
            submit: 'Submit',
            restart: 'Restart',
            bet: 'Bet',
            betAmount: 'Bet Amount',
            result: 'Result',
            win: 'Win',
            lose: 'Lose',
            reward: 'Reward',
            cost: 'Cost',
            balance: 'Balance',
            score: 'Score',
            loading: 'Loading...',
            confirm: 'Confirm',
            cancel: 'Cancel'
        },

        // Quiz
        quiz: {
            title: 'Quiz Game',
            startCost: 'Start game costs 10 coins',
            question: 'Question',
            selectAnswer: 'Select your answer',
            correct: 'Correct',
            wrong: 'Wrong',
            finalScore: 'Final Score',
            reward: 'Reward Coins'
        },

        // Slot
        slot: {
            title: 'Slot Machine',
            spin: 'Pull Lever',
            selectBet: 'Select Bet Amount',
            jackpot: 'Jackpot',
            miniJackpot: 'Mini Jackpot',
            win: 'Win',
            payout: 'Payout'
        },

        // Scratch
        scratch: {
            title: 'Scratch Card Game',
            selectTier: 'Select Card Tier',
            tier1: 'Basic Card (10 coins)',
            tier2: 'Silver Card (30 coins)',
            tier3: 'Gold Card (50 coins)',
            scratch: 'Start Scratch',
            reveal: 'Reveal All',
            matches: 'Matches',
            prize: 'Prize'
        },

        // Spin
        spin: {
            title: 'Lucky Wheel',
            spinCost: 'One spin costs 5 coins',
            spin: 'Spin',
            prize: 'You won',
            goodLuck: 'Good Luck'
        },

        // Stone
        stone: {
            title: 'Magic Stones Game',
            collect: 'Collect',
            replace: 'Replace',
            cashout: 'Cash Out',
            slot: 'Slot',
            matchBonus: 'Match Bonus',
            totalReward: 'Total Reward'
        },

        // Flip
        flip: {
            title: 'Card Flip Game',
            flip: 'Flip',
            reveal: 'Reveal',
            good: 'Good',
            bad: 'Bad',
            continue: 'Continue',
            cashout: 'Cash Out',
            finalReward: 'Final Reward'
        },

        // Duel
        duel: {
            title: 'Gift Duel',
            selectGift: 'Select Gift',
            selectPower: 'Select Power',
            duel: 'Start Duel',
            victory: 'Victory',
            defeat: 'Defeat',
            reward: 'Reward'
        },

        // Wish
        wish: {
            title: 'Wish System',
            selectGift: 'Select Wish Gift',
            wish: 'Make a Wish',
            guarantee: 'Guarantee',
            wishCount: 'Wish Count',
            success: 'Wish Success',
            failed: 'Not Won',
            batchWish: 'Batch Wish'
        },

        // Admin
        admin: {
            title: 'Admin Dashboard',
            users: 'User Management',
            addCoins: 'Add Coins',
            updateBalance: 'Update Balance',
            authorize: 'Authorize User',
            unauthorize: 'Revoke Authorization',
            resetPassword: 'Reset Password',
            userRecords: 'User Records',
            gameRecords: 'Game Records',
            giftRecords: 'Gift Records',
            statistics: 'Statistics',
            totalUsers: 'Total Users',
            activeUsers: 'Active Users',
            totalGifts: 'Total Gifts'
        },

        // Common
        common: {
            success: 'Success',
            failed: 'Failed',
            error: 'Error',
            loading: 'Loading...',
            confirm: 'Confirm',
            cancel: 'Cancel',
            save: 'Save',
            delete: 'Delete',
            edit: 'Edit',
            close: 'Close',
            back: 'Back',
            next: 'Next',
            previous: 'Previous',
            submit: 'Submit',
            reset: 'Reset',
            search: 'Search',
            filter: 'Filter',
            sort: 'Sort',
            refresh: 'Refresh',
            language: 'Language',
            theme: 'Theme',
            help: 'Help',
            about: 'About'
        }
    }
};

// i18n 中间件
function i18nMiddleware(req, res, next) {
    // 从cookie或query获取语言设置，默认中文
    // 手动解析cookie（兼容无cookie-parser的情况）
    let cookieLang = 'zh';
    if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        cookieLang = cookies.lang || 'zh';
    }

    const lang = req.cookies?.lang || cookieLang || req.query.lang || 'zh';

    // 验证语言
    const validLang = ['zh', 'en'].includes(lang) ? lang : 'zh';

    // 设置cookie（7天过期）
    res.cookie('lang', validLang, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });

    // 提供翻译函数
    res.locals.lang = validLang;
    res.locals.t = translations[validLang];
    res.locals.__ = (key) => {
        const keys = key.split('.');
        let value = translations[validLang];
        for (const k of keys) {
            value = value?.[k];
        }
        return value || key;
    };

    next();
}

// 语言切换路由
function setupLanguageRoutes(app) {
    app.get('/set-language/:lang', (req, res) => {
        const { lang } = req.params;
        const validLang = ['zh', 'en'].includes(lang) ? lang : 'zh';
        res.cookie('lang', validLang, { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true });

        // 重定向回referer或首页
        const referer = req.get('referer') || '/';
        res.redirect(referer);
    });
}

module.exports = {
    i18nMiddleware,
    setupLanguageRoutes,
    translations
};
