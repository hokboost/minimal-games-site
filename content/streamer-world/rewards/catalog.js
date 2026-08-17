'use strict';

function deepFreeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.values(value).forEach(deepFreeze);
    return Object.freeze(value);
}

module.exports = deepFreeze({
    catalogVersion: 'rewards-2026-s1-v1',
    items: [
        {
            slug: 'fanlight-thanks', kind: 'provider_gift', providerGiftType: 'fanlight',
            titleZh: '同行灯牌', titleEn: 'Companion Fanlight',
            descriptionZh: '用积分兑换一枚灯牌权益；领取后安全存入现有背包。',
            descriptionEn: 'Redeem a fanlight entitlement; claiming stores it safely in the existing backpack.',
            artKey: 'fanlight', pointsPrice: 1, exposureValue: 1, stockLimit: 500,
            perUserLimit: 20, cooldownHours: 6, approval: 'automatic', visibility: { type: 'open' }
        },
        {
            slug: 'heartbox-celebration', kind: 'provider_gift', providerGiftType: 'heartbox',
            titleZh: '心动庆典盒', titleEn: 'Heartfelt Celebration Box',
            descriptionZh: '适合重要里程碑的礼物权益，仍由原有送礼状态机处理结果。',
            descriptionEn: 'A milestone gift entitlement whose outcome remains governed by the existing delivery state machine.',
            artKey: 'heartbox', pointsPrice: 150, exposureValue: 150, stockLimit: 100,
            perUserLimit: 4, cooldownHours: 72, approval: 'automatic', visibility: { type: 'open' }
        },
        {
            slug: 'captains-voyage', kind: 'provider_gift', providerGiftType: 'tiedu_one',
            titleZh: '远航纪念礼', titleEn: 'Voyage Commemorative Gift',
            descriptionZh: '高价值纪念权益，必须经过管理员复核后才会扣除积分。',
            descriptionEn: 'A high-value commemorative entitlement; points are deducted only after administrator review.',
            artKey: 'captain-voyage', pointsPrice: 19980, exposureValue: 19980, stockLimit: 5,
            perUserLimit: 1, cooldownHours: 2160, approval: 'manual', visibility: { type: 'open' }
        },
        {
            slug: 'story-lantern-grant', kind: 'provider_gift', providerGiftType: 'fanlight',
            titleZh: '航迹故事灯', titleEn: 'Story Trail Lantern',
            descriptionZh: '完成指定故事航迹后可见，可由站主用结构化里程碑授予。',
            descriptionEn: 'Visible after its story trail and available as a structured owner milestone grant.',
            artKey: 'story-lantern', pointsPrice: 0, exposureValue: 1, stockLimit: 120,
            perUserLimit: 2, cooldownHours: 168, approval: 'automatic',
            visibility: { type: 'story_unlock', key: 'reward.story-lantern' }, ownerGrantOnly: true
        },
        {
            slug: 'quiet-orbit-frame', kind: 'cosmetic',
            titleZh: '静谧轨道头像框', titleEn: 'Quiet Orbit Profile Frame',
            descriptionZh: '一件非货币装饰，领取后永久加入个人收藏。',
            descriptionEn: 'A non-monetary decoration permanently added to the creator collection when claimed.',
            artKey: 'quiet-orbit', pointsPrice: 40, exposureValue: 0, stockLimit: 1000,
            perUserLimit: 1, cooldownHours: 0, approval: 'automatic', visibility: { type: 'open' }
        },
        {
            slug: 'paper-star-frame', kind: 'cosmetic',
            titleZh: '纸星漫游边框', titleEn: 'Paper-Star Wanderer Frame',
            descriptionZh: '以共同修复的纸星为灵感，不具备积分或礼物兑换价值。',
            descriptionEn: 'Inspired by repaired paper stars, with no point or gift redemption value.',
            artKey: 'paper-star', pointsPrice: 65, exposureValue: 0, stockLimit: 600,
            perUserLimit: 1, cooldownHours: 0, approval: 'automatic',
            visibility: { type: 'achievement_unlock', key: 'achievement:game:constellation-repair' }
        },
        {
            slug: 'memory-book-cover', kind: 'cosmetic',
            titleZh: '记忆书夜航封面', titleEn: 'Night-Voyage Memory Cover',
            descriptionZh: '给记忆时间线换上夜航封面，隐藏与归档设置保持不变。',
            descriptionEn: 'Give the memory timeline a night-voyage cover without changing hide or archive controls.',
            artKey: 'memory-cover', pointsPrice: 80, exposureValue: 0, stockLimit: 600,
            perUserLimit: 1, cooldownHours: 0, approval: 'automatic',
            visibility: { type: 'season_window', startsAt: '2026-01-01T00:00:00.000Z', endsAt: '2027-01-01T00:00:00.000Z' }
        },
        {
            slug: 'starlight-studio-badge', kind: 'cosmetic',
            titleZh: '星光工坊徽章', titleEn: 'Starlight Studio Badge',
            descriptionZh: '展示确定性制作成果的收藏徽章，不会提升任何游戏数值。',
            descriptionEn: 'A collectible badge for deterministic crafting accomplishments with no gameplay advantage.',
            artKey: 'studio-badge', pointsPrice: 55, exposureValue: 0, stockLimit: 800,
            perUserLimit: 1, cooldownHours: 0, approval: 'automatic', visibility: { type: 'open' }
        },
        {
            slug: 'dream-compass-key', kind: 'story_key',
            titleZh: '梦境罗盘钥匙', titleEn: 'Dream Compass Key',
            descriptionZh: '一枚非货币剧情钥匙，用于未来已注册的梦境支线。',
            descriptionEn: 'A non-monetary story key for a future registered dream route.',
            artKey: 'dream-compass', pointsPrice: 100, exposureValue: 0, stockLimit: 400,
            perUserLimit: 1, cooldownHours: 0, approval: 'automatic', visibility: { type: 'open' }
        },
        {
            slug: 'constellation-archive-key', kind: 'story_key',
            titleZh: '星图档案钥匙', titleEn: 'Constellation Archive Key',
            descriptionZh: '保存为独立进度资产，不可由浏览器按比例换回积分。',
            descriptionEn: 'Stored as a separate progression asset and never convertible back to points by the browser.',
            artKey: 'archive-key', pointsPrice: 120, exposureValue: 0, stockLimit: 300,
            perUserLimit: 1, cooldownHours: 0, approval: 'automatic', visibility: { type: 'open' }
        },
        {
            slug: 'owner-milestone-fanlight', kind: 'provider_gift', providerGiftType: 'fanlight',
            titleZh: '里程碑应援灯', titleEn: 'Milestone Support Light',
            descriptionZh: '仅可由配置站主按受限庆祝模板授予，主播可选择领取或忽略。',
            descriptionEn: 'Granted only by the configured owner through a bounded celebration template; the creator may claim or ignore it.',
            artKey: 'milestone-light', pointsPrice: 0, exposureValue: 1, stockLimit: 200,
            perUserLimit: 5, cooldownHours: 168, approval: 'automatic', visibility: { type: 'owner_only' }, ownerGrantOnly: true
        },
        {
            slug: 'owner-heartfelt-grant', kind: 'provider_gift', providerGiftType: 'heartbox',
            titleZh: '珍贵时刻礼盒', titleEn: 'Treasured Moment Gift Box',
            descriptionZh: '站主提议的高价值庆祝权益，仍需管理员独立审批且主播主动领取。',
            descriptionEn: 'An owner-proposed high-value celebration entitlement requiring independent admin approval and creator claim.',
            artKey: 'treasured-box', pointsPrice: 0, exposureValue: 150, stockLimit: 20,
            perUserLimit: 1, cooldownHours: 2160, approval: 'manual', visibility: { type: 'owner_only' }, ownerGrantOnly: true
        }
    ],
    budgets: [
        { key: 'reward-system-daily', scope: 'global', dailyLimit: 50000 },
        { key: 'reward-feature-daily', scope: 'feature', dailyLimit: 20000 },
        { key: 'reward-user-daily', scope: 'user', dailyLimit: 20000 }
    ],
    grantTemplates: [
        { key: 'quest-chain-celebration', titleZh: '任务链庆祝', titleEn: 'Quest Chain Celebration' },
        { key: 'story-route-milestone', titleZh: '故事航迹里程碑', titleEn: 'Story Route Milestone' },
        { key: 'co-op-mastery-thanks', titleZh: '协作精通致谢', titleEn: 'Co-op Mastery Thanks' },
        { key: 'season-contribution-thanks', titleZh: '赛季贡献致谢', titleEn: 'Season Contribution Thanks' }
    ]
});
