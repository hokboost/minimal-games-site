'use strict';

const {
    compileAuthoredSeason
} = require('../../../domain/story/authored-season-compiler');
const {
    b,
    episode,
    option: o,
    scene
} = require('./authored-helpers');
const deepening = require('./season-5-deepening');

function ep(slug, zh, en, character, cameo, scenes, archiveZh, archiveEn, memoryTitleZh,
    memoryTitleEn, memoryZh, memoryEn, owner = null) {
    return episode(slug, zh, en, character, cameo, scenes, {
        type: 'checkpoint',
        text: b(archiveZh, archiveEn),
        unlockType: 'achievement',
        unlockKey: `home.${slug}`
    }, {
        title: b(memoryTitleZh, memoryTitleEn),
        body: b(memoryZh, memoryEn)
    }, owner);
}
const source = {
    slug: 'homeward-constellation',
    version: 1,
    title: b('我们之间的信号：归家星座', 'The Signal Between Us: Homeward Constellation'),
    episodes: [ep('hall-of-many-keys', '多钥匙门厅', 'The Hall of Many Keys', 'lumen', 'sora', [
            scene({
                speaker: 'lumen',
                introZh: '公共门厅有十二把钥匙，管理员想熔成一把总钥。',
                introEn: 'The public hall has twelve keys, and its keeper wants one master key.',
                promptZh: '怎样保留不同入口的自主权？',
                promptEn: 'How should distinct entrances keep autonomy?',
                options: [o({
                    labelZh: '保留每门独立钥匙',
                    labelEn: 'Keep a key per door',
                    outcomeZh: '锁芯继续互不覆盖。',
                    outcomeEn: 'Locks remain mutually isolated.',
                    resultZh: '一处授权不能打开全部空间。',
                    resultEn: 'One permission cannot open every space.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '记录钥匙权限表',
                    labelEn: 'Publish the key matrix',
                    outcomeZh: '每把钥匙的范围清楚可查。',
                    outcomeEn: 'Every key scope becomes visible.',
                    resultZh: '隐藏权限进入审计。',
                    resultEn: 'Hidden permission enters audit.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '让住户共同保管备用钥',
                    labelEn: 'Share custody of spares',
                    outcomeZh: '任何复制都需双方确认。',
                    outcomeEn: 'Every copy requires two approvals.',
                    resultZh: '保管权获得制衡。',
                    resultEn: 'Custody gains checks and balance.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '销毁未授权总钥胚',
                    labelEn: 'Destroy the master blank',
                    outcomeZh: '万能齿槽被永久熔平。',
                    outcomeEn: 'Universal teeth are melted flat.',
                    resultZh: '危险捷径不能复活。',
                    resultEn: 'The dangerous shortcut cannot return.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许无钥匙访客大厅',
                    labelEn: 'Keep a keyless public foyer',
                    outcomeZh: '公共区域不索取身份。',
                    outcomeEn: 'Public space asks no identity.',
                    resultZh: '进入共同空间不需私人权限。',
                    resultEn: 'Shared space needs no private permission.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            }), scene({
                speaker: 'sora',
                introZh: '一扇旧门只认第一季的钥匙，拒绝后来获得的同等通行权。',
                introEn: 'An old door accepts only a Season One key and rejects equivalent later access.',
                promptZh: '怎样升级而不改写旧钥历史？',
                promptEn: 'How should it upgrade without rewriting key history?',
                options: [o({
                    labelZh: '增加版本兼容锁舌',
                    labelEn: 'Add a version-aware latch',
                    outcomeZh: '五季有效钥匙各自验证。',
                    outcomeEn: 'Valid keys from five seasons verify separately.',
                    resultZh: '新权利不必冒充旧版本。',
                    resultEn: 'New rights need not impersonate old versions.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '保存旧锁只读快照',
                    labelEn: 'Snapshot the old lock',
                    outcomeZh: '历史行为可重放但不可启用。',
                    outcomeEn: 'Historic behavior is replayable but inactive.',
                    resultZh: '迁移留下完整语义证据。',
                    resultEn: 'Migration keeps full semantic evidence.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '让住户选择迁移时间',
                    labelEn: 'Let residents choose migration time',
                    outcomeZh: '旧入口保持到主动切换。',
                    outcomeEn: 'The old entrance remains until opt-in.',
                    resultZh: '升级不再强迫同步。',
                    resultEn: 'Upgrade no longer forces synchronization.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '阻止旧锁恢复活动',
                    labelEn: 'Prevent old-lock reactivation',
                    outcomeZh: '退役状态只有单向路径。',
                    outcomeEn: 'Retired state has one-way lifecycle.',
                    resultZh: '危险语义无法回滚。',
                    resultEn: 'Dangerous semantics cannot roll back.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '提供人工安全入口',
                    labelEn: 'Offer a safe manual entrance',
                    outcomeZh: '故障时仍能验证最小权限。',
                    outcomeEn: 'Failure still verifies minimal permission.',
                    resultZh: '可用性不依赖万能后门。',
                    resultEn: 'Availability needs no universal backdoor.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            })
        ], '多钥匙门厅保留独立权限、版本兼容和单向退役，不制造万能钥匙。',
        'The hall keeps independent permissions, version compatibility, and one-way retirement without a master key.',
        '没有总钥的共同门厅', 'The Shared Hall Without a Master Key',
        '每扇门知道自己的边界；新旧钥匙可以并存而不互相冒充。',
        'Every door knows its boundary; old and new keys coexist without impersonation.', {
            text: b('守望者把自己持有的总钥匙胚投入熔炉，并公开熔毁记录。',
                'The watcher melts their master-key blank and publishes the destruction record.'
                ),
            title: b('已经熔平的万能齿槽', 'The Universal Teeth Melted Flat'),
            body: b('这份记录只证明高权限被撤回，不要求任何住户交出自己的钥匙。',
                'This record proves elevated power was withdrawn and asks no resident to surrender a key.'
                )
        }), ep('lighthouse-reunion', '灯塔重逢室', 'The Lighthouse Reunion Room', 'sora',
        'mika', [scene({
            speaker: 'sora',
            introZh: '重逢室默认播放所有旧留言，其中一些发送者后来选择撤回公开。',
            introEn: 'The reunion room plays every old message by default, though some senders later withdrew public display.',
            promptZh: '欢迎仪式该怎样尊重新边界？',
            promptEn: 'How should the welcome honor newer boundaries?',
            options: [o({
                labelZh: '按当前同意过滤留言',
                labelEn: 'Filter by current consent',
                outcomeZh: '撤回内容不进入播放队列。',
                outcomeEn: 'Withdrawn notes never enter playback.',
                resultZh: '旧同意不再永久授权。',
                resultEn: 'Old consent no longer grants permanent access.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '显示留言版本历史',
                labelEn: 'Show message lifecycle',
                outcomeZh: '公开、私密与撤回各有时间。',
                outcomeEn: 'Public, private, and withdrawn states keep dates.',
                resultZh: '变化不会被重逢气氛抹去。',
                resultEn: 'Reunion sentiment cannot erase change.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让双方选择共同回看',
                labelEn: 'Require mutual replay choice',
                outcomeZh: '任一人跳过都会静音。',
                outcomeEn: 'Either person may skip and mute it.',
                resultZh: '共享记忆需要当下双方同意。',
                resultEn: 'Shared replay needs current mutual consent.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '停止强制欢迎播放',
                labelEn: 'Disable automatic welcome',
                outcomeZh: '房间以安静灯光打开。',
                outcomeEn: 'The room opens with quiet light.',
                resultZh: '进入不再触发情感轰炸。',
                resultEn: 'Entry no longer triggers emotional overload.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供无历史的新会面',
                labelEn: 'Offer a history-free meeting',
                outcomeZh: '空白桌不加载旧档案。',
                outcomeEn: 'A blank table loads no archive.',
                resultZh: '重逢可以从今天开始。',
                resultEn: 'Reunion may begin today.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'mika',
            introZh: '灯塔想用过去的亲密等级决定谁先发言。',
            introEn: 'The lighthouse wants past intimacy level to decide who speaks first.',
            promptZh: '发言顺序应该依据什么？',
            promptEn: 'What should determine speaking order?',
            options: [o({
                labelZh: '由双方轮流选择',
                labelEn: 'Alternate by choice',
                outcomeZh: '每轮都可放弃话筒。',
                outcomeEn: 'The microphone may be declined each turn.',
                resultZh: '亲密度退出发言权限。',
                resultEn: 'Intimacy leaves speaking permission.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '使用公开随机顺序',
                labelEn: 'Use a public random order',
                outcomeZh: '随机种子当场显示。',
                outcomeEn: 'The random seed appears openly.',
                resultZh: '排序不再暗藏关系偏见。',
                resultEn: 'Order no longer hides relationship bias.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '允许共同沉默一轮',
                labelEn: 'Allow a shared silent turn',
                outcomeZh: '计时结束不记录失败。',
                outcomeEn: 'The timer ends without failure.',
                resultZh: '沉默成为合法互动。',
                resultEn: 'Silence becomes valid interaction.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拆除亲密度话筒锁',
                labelEn: 'Remove the intimacy lock',
                outcomeZh: '关系数据从设备清除。',
                outcomeEn: 'Relationship data leaves the device.',
                resultZh: '权力映射被果断撤销。',
                resultEn: 'The power mapping is decisively removed.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '改用文字或手势入口',
                labelEn: 'Offer text and gesture channels',
                outcomeZh: '每人选择舒适表达方式。',
                outcomeEn: 'Each person chooses a comfortable channel.',
                resultZh: '同场不要求同样表达。',
                resultEn: 'Sharing a room needs no shared medium.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '重逢室依据当前同意播放留言，并将亲密等级从发言权限中移除。',
        'The reunion room uses current consent for playback and removes intimacy from speaking permission.',
        '可以从今天开始的重逢', 'The Reunion That May Begin Today', '旧留言、旧等级和旧仪式都不能替现在的人作决定。',
        'Old notes, levels, and rituals cannot decide for people in the present.'), ep(
        'boundary-greenhouse', '边界温室', 'Boundary Greenhouse', 'mika', 'ori', [scene({
            speaker: 'mika',
            introZh: '每株植物用叶色表示边界，但自动喷雾器只识别最常见的绿色。',
            introEn: 'Every plant signals boundaries through leaf color, but the mister recognizes only common green.',
            promptZh: '怎样照护不同信号？',
            promptEn: 'How should the greenhouse care for varied signals?',
            options: [o({
                labelZh: '建立多色识别表',
                labelEn: 'Build a multicolor registry',
                outcomeZh: '十二种叶色都有明确含义。',
                outcomeEn: 'Twelve leaf colors gain explicit meanings.',
                resultZh: '少数信号不再被忽略。',
                resultEn: 'Minority signals are no longer ignored.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录植物自行定义',
                labelEn: 'Store plant-defined meanings',
                outcomeZh: '管理员不能替换解释。',
                outcomeEn: 'Keepers cannot replace definitions.',
                resultZh: '边界来源保持可追溯。',
                resultEn: 'Boundary provenance remains traceable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让相邻植株协商水量',
                labelEn: 'Let neighboring plants coordinate',
                outcomeZh: '独立阀门支持不同选择。',
                outcomeEn: 'Independent valves support different choices.',
                resultZh: '共享环境不再要求统一需求。',
                resultEn: 'Shared space no longer requires uniform need.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '关闭误喷区域',
                labelEn: 'Shut the faulty mister zone',
                outcomeZh: '受影响花盆立即停止进水。',
                outcomeEn: 'Affected pots stop receiving water.',
                resultZh: '错误自动化不会继续伤害。',
                resultEn: 'Faulty automation stops causing harm.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供手动拒绝叶片',
                labelEn: 'Add a manual refusal leaf',
                outcomeZh: '任何颜色都能立即关阀。',
                outcomeEn: 'Any color may close its valve immediately.',
                resultZh: '拒绝权不依赖分类正确。',
                resultEn: 'Refusal does not depend on correct classification.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'ori',
            introZh: '园艺师提议用开花次数奖励更宽松的边界。',
            introEn: 'The gardener proposes rewarding looser boundaries with bloom points.',
            promptZh: '怎样阻止边界被积分操纵？',
            promptEn: 'How should boundary scoring be prevented?',
            options: [o({
                labelZh: '删除边界积分字段',
                labelEn: 'Delete boundary scoring',
                outcomeZh: '叶色不再连接奖励表。',
                outcomeEn: 'Leaf color no longer joins reward tables.',
                resultZh: '同意与货币永久分离。',
                resultEn: 'Consent separates permanently from currency.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '审计过去的加分记录',
                labelEn: 'Audit past bonuses',
                outcomeZh: '三次不当奖励被标出。',
                outcomeEn: 'Three improper bonuses are identified.',
                resultZh: '影响范围可以完整修复。',
                resultEn: 'The impact scope becomes repairable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '统一基础照护资源',
                labelEn: 'Guarantee equal base care',
                outcomeZh: '所有花盆获得相同底线。',
                outcomeEn: 'Every pot receives the same care floor.',
                resultZh: '边界选择不影响资格。',
                resultEn: 'Boundary choice does not affect eligibility.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '撤销操纵性活动',
                labelEn: 'Cancel the coercive event',
                outcomeZh: '宣传页与任务同时下线。',
                outcomeEn: 'The campaign and quest go offline.',
                resultZh: '果断停止不等待季末。',
                resultEn: 'The stop does not wait for season end.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '把开花改成纯收藏记录',
                labelEn: 'Make blooms nonmonetary memories',
                outcomeZh: '花册不触发积分。',
                outcomeEn: 'The flower book triggers no points.',
                resultZh: '意义与结算保持分开。',
                resultEn: 'Meaning remains separate from settlement.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '边界温室识别多色信号，关闭误喷，并切断边界与积分奖励的连接。',
        'The boundary greenhouse recognizes varied signals, stops faulty misting, and severs boundaries from point rewards.',
        '不需要放宽边界的花朵', 'The Flower That Needs No Looser Boundary',
        '照护、收藏和资格不再随着同意范围变化，每种叶色都能立即拒绝。',
        'Care, collection, and eligibility no longer vary with consent scope, and every leaf color may refuse immediately.', {
            text: b('守望者撤回一项曾把参与度写进奖励表的提议。',
                'The watcher withdraws a proposal that once linked participation to rewards.'
                ),
            title: b('从奖励表移除的边界列', 'The Boundary Column Removed from Rewards'),
            body: b('修订不会收回任何已得内容，只阻止未来用奖励推动同意。',
                'The revision revokes no earned content and only prevents rewards from steering future consent.'
                )
        }), ep('shared-memory-vault', '共享记忆库', 'Shared Memory Vault', 'ori', 'vale', [
            scene({
                speaker: 'ori',
                introZh: '记忆库准备把共同记忆与私人草稿合并去重。',
                introEn: 'The vault plans to deduplicate shared memories with private drafts.',
                promptZh: '怎样避免相似内容穿透边界？',
                promptEn: 'How should similar content remain boundary-safe?',
                options: [o({
                    labelZh: '分离私人和共享命名空间',
                    labelEn: 'Separate private and shared namespaces',
                    outcomeZh: '哈希只在各自范围比较。',
                    outcomeEn: 'Hashes compare only within scope.',
                    resultZh: '去重不再泄露私人存在。',
                    resultEn: 'Deduplication no longer leaks private existence.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '使用有范围的内容摘要',
                    labelEn: 'Use scoped content hashes',
                    outcomeZh: '摘要包含空间标识。',
                    outcomeEn: 'Digests include namespace identity.',
                    resultZh: '碰撞不能跨边界吞记录。',
                    resultEn: 'Collisions cannot swallow records across boundaries.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '共同记忆需双方发布',
                    labelEn: 'Require mutual publication',
                    outcomeZh: '草稿默认保持私人。',
                    outcomeEn: 'Drafts stay private by default.',
                    resultZh: '共享由明确动作产生。',
                    resultEn: 'Sharing requires an explicit action.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '停止全库去重任务',
                    labelEn: 'Stop global deduplication',
                    outcomeZh: '后台作业立即退出。',
                    outcomeEn: 'The background job exits immediately.',
                    resultZh: '危险处理不再继续扫描。',
                    resultEn: 'The dangerous process stops scanning.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许相似记忆并存',
                    labelEn: 'Permit similar memories',
                    outcomeZh: '每条记录保留独立来源。',
                    outcomeEn: 'Each record keeps distinct provenance.',
                    resultZh: '相似不再自动等于相同。',
                    resultEn: 'Similarity no longer means identity.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'vale',
                introZh: '一段共享记忆被一方归档，系统想替另一方也隐藏。',
                introEn: 'One person archives a shared memory and the system wants to hide it for the other too.',
                promptZh: '归档状态应如何投影？',
                promptEn: 'How should archival state project?',
                options: [o({
                    labelZh: '按用户保存归档状态',
                    labelEn: 'Store archival state per user',
                    outcomeZh: '一方操作不覆盖另一方。',
                    outcomeEn: 'One action does not overwrite another.',
                    resultZh: '个人整理权互不侵入。',
                    resultEn: 'Personal organization remains noninvasive.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '保留共同内容版本',
                    labelEn: 'Keep shared content immutable',
                    outcomeZh: '正文不因展示状态改变。',
                    outcomeEn: 'Content does not change with display state.',
                    resultZh: '来源快照保持稳定。',
                    resultEn: 'The provenance snapshot remains stable.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '提供共同删除协商',
                    labelEn: 'Offer mutual deletion discussion',
                    outcomeZh: '删除需要双方明确确认。',
                    outcomeEn: 'Deletion requires explicit confirmation from both.',
                    resultZh: '高影响动作获得共同控制。',
                    resultEn: 'High-impact action gains joint control.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '阻止单方硬删除',
                    labelEn: 'Block unilateral hard deletion',
                    outcomeZh: '接口只允许个人归档。',
                    outcomeEn: 'The endpoint allows personal archive only.',
                    resultZh: '不可逆损失被服务端拒绝。',
                    resultEn: 'The server rejects irreversible loss.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许导出自己的副本',
                    labelEn: 'Permit personal export',
                    outcomeZh: '导出不含他人私人字段。',
                    outcomeEn: 'Export contains no other private fields.',
                    resultZh: '可携带性不扩大可见范围。',
                    resultEn: 'Portability does not expand visibility.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '共享记忆库隔离命名空间、冻结共同内容，并把归档状态按用户保存。',
        'The shared-memory vault isolates namespaces, freezes shared content, and stores archival state per user.',
        '不会被相似草稿吞掉的记忆', 'The Memory Not Swallowed by a Similar Draft',
        '相似、归档和导出都尊重各自范围；共同正文只有共同决定才会消失。',
        'Similarity, archive, and export respect scope; shared content disappears only by mutual decision.'
        ), ep('repair-cafe', '修复咖啡馆', 'Repair Café', 'vale', 'chime', [scene({
            speaker: 'vale',
            introZh: '咖啡馆只给修好物品盖成功章，无法修复的故事被丢进后门。',
            introEn: 'The café stamps only repaired objects and discards irreparable stories out back.',
            promptZh: '无法修好的收音机应获得什么结局？',
            promptEn: 'What ending should an irreparable radio receive?',
            options: [o({
                labelZh: '保存故障说明',
                labelEn: 'Keep the failure report',
                outcomeZh: '烧毁线路进入维修档案。',
                outcomeEn: 'Burned circuits enter repair history.',
                resultZh: '失败保留可用知识。',
                resultEn: 'Failure preserves useful knowledge.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '改造成无功能展品',
                labelEn: 'Make a nonfunctional exhibit',
                outcomeZh: '外壳保留且不宣称能播放。',
                outcomeEn: 'The shell remains without playback claims.',
                resultZh: '纪念与功能诚实分离。',
                resultEn: 'Memory and function separate honestly.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '让物主选择是否拆件',
                labelEn: 'Let the owner choose parts reuse',
                outcomeZh: '任何拆解都需明确同意。',
                outcomeEn: 'Any disassembly needs explicit consent.',
                resultZh: '修复者不再占有残件。',
                resultEn: 'Repairers no longer own remnants.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '安全处置危险电池',
                labelEn: 'Dispose of the unsafe battery',
                outcomeZh: '危险部件进入认证回收。',
                outcomeEn: 'The unsafe cell enters certified recycling.',
                resultZh: '安全高于完整收藏。',
                resultEn: 'Safety outranks complete preservation.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许原样带回',
                labelEn: 'Permit return as-is',
                outcomeZh: '未修复不收成功费用。',
                outcomeEn: 'No success fee applies.',
                resultZh: '不修好也能完整离开。',
                resultEn: 'Leaving unrepaired remains complete.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'chime',
            introZh: '一台修好的留声机播放原物主没有同意公开的录音。',
            introEn: 'A repaired gramophone plays recordings its former owner never approved for public use.',
            promptZh: '怎样交付功能而不泄露内容？',
            promptEn: 'How should function return without exposing content?',
            options: [o({
                labelZh: '清除私人介质',
                labelEn: 'Remove private media',
                outcomeZh: '机器只保留空转测试。',
                outcomeEn: 'The machine keeps a blank rotation test.',
                resultZh: '功能验证不需要真实录音。',
                resultEn: 'Function testing needs no real recording.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '保存删除审计摘要',
                labelEn: 'Keep a deletion audit digest',
                outcomeZh: '摘要证明范围而不保留声音。',
                outcomeEn: 'A digest proves scope without retaining sound.',
                resultZh: '隐私清理可以被核验。',
                resultEn: 'Privacy cleanup becomes verifiable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '请物主提供虚构测试片',
                labelEn: 'Invite fictional test media',
                outcomeZh: '新唱片不含真人声音。',
                outcomeEn: 'The new disc contains no real voice.',
                resultZh: '协作不再要求披露历史。',
                resultEn: 'Cooperation no longer requires history disclosure.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '封存无法清除的存储器',
                labelEn: 'Seal uncleared storage',
                outcomeZh: '设备在清理前不可交付。',
                outcomeEn: 'The device cannot ship before cleanup.',
                resultZh: '果断阻止数据外带。',
                resultEn: 'A decisive hold prevents data escape.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供纯机械验收',
                labelEn: 'Offer mechanical acceptance',
                outcomeZh: '转速与按键足以验收。',
                outcomeEn: 'Speed and controls suffice for acceptance.',
                resultZh: '验收目标缩到最低必要。',
                resultEn: 'Acceptance shrinks to minimum necessity.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '修复咖啡馆承认无法修复结局，并把私人介质从功能验收中移除。',
        'The repair café recognizes irreparable endings and removes private media from functional acceptance.',
        '没有被修好也完整的收音机', 'The Complete Radio That Was Not Repaired',
        '失败知识、无功能纪念和原样带回都获得正式章，不再从后门消失。',
        'Failure knowledge, nonfunctional keepsakes, and return-as-is receive official stamps instead of disappearing out back.', {
            text: b('守望者带来一只坏掉的按钮，只请求记录故障，不要求修复。',
                'The watcher brings a broken button and asks only that its fault be recorded, not repaired.'
                ),
            title: b('没有维修期限的按钮', 'The Button Without a Repair Deadline'),
            body: b('它可以留作样本、被回收或以后再看；没有一种选择代表亏欠。',
                'Keep it as a sample, recycle it, or revisit later; none represents a debt.'
                )
        }), ep('house-with-five-doors', '五扇门的屋子', 'The House with Five Doors', 'chime',
        'courier', [scene({
            speaker: 'chime',
            introZh: '五扇门通向不同季节的共同房间，屋主坚持指定唯一正门。',
            introEn: 'Five doors from different seasons enter one shared room, whose keeper insists on one front door.',
            promptZh: '共同房间需要正门吗？',
            promptEn: 'Does a shared room need a front door?',
            options: [o({
                labelZh: '承认五门同等有效',
                labelEn: 'Recognize five equal doors',
                outcomeZh: '门牌尺寸保持一致。',
                outcomeEn: 'Door signs stay equal size.',
                resultZh: '入口不再制造季节等级。',
                resultEn: 'Entrances no longer create season rank.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '记录各门历史用途',
                labelEn: 'Archive each door history',
                outcomeZh: '来源不改变当前权限。',
                outcomeEn: 'Provenance does not alter current permission.',
                resultZh: '历史与地位被分开。',
                resultEn: 'History separates from status.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '由访客记住偏好入口',
                labelEn: 'Remember personal entrance preference',
                outcomeZh: '偏好只影响自己的导航。',
                outcomeEn: 'Preference affects personal navigation only.',
                resultZh: '便利不覆盖公共结构。',
                resultEn: 'Convenience does not overwrite shared structure.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '拆掉正门领奖台',
                labelEn: 'Remove the front-door podium',
                outcomeZh: '木台改成公共长凳。',
                outcomeEn: 'The podium becomes a shared bench.',
                resultZh: '等级符号停止工作。',
                resultEn: 'The hierarchy symbol stops functioning.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '增加无门槛侧入口',
                labelEn: 'Add a step-free side entrance',
                outcomeZh: '新入口同样进入屋心。',
                outcomeEn: 'The new entrance reaches the same center.',
                resultZh: '可达性不是次等路线。',
                resultEn: 'Accessibility is not a lesser route.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'courier',
            introZh: '屋内地图会把最近使用的门自动放大，逐渐挤掉其他入口。',
            introEn: 'The house map enlarges the most recent door until other entrances vanish.',
            promptZh: '怎样让个性化不删除公共选择？',
            promptEn: 'How should personalization avoid deleting shared choices?',
            options: [o({
                labelZh: '限制个人缩放在本地',
                labelEn: 'Keep zoom local',
                outcomeZh: '公共地图尺寸不变。',
                outcomeEn: 'The public map remains unchanged.',
                resultZh: '个人便利不能改写他人视图。',
                resultEn: 'Personal convenience cannot rewrite another view.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '提供重置视图按钮',
                labelEn: 'Offer reset view',
                outcomeZh: '一键恢复五门全景。',
                outcomeEn: 'One action restores all five doors.',
                resultZh: '退出个性化始终可达。',
                resultEn: 'Leaving personalization stays reachable.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '公开排序算法',
                labelEn: 'Publish ranking logic',
                outcomeZh: '最近使用不再伪装推荐。',
                outcomeEn: 'Recency no longer disguises itself as recommendation.',
                resultZh: '导航依据可被质疑。',
                resultEn: 'Navigation grounds become challengeable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '禁止自动隐藏入口',
                labelEn: 'Ban automatic hiding',
                outcomeZh: '最小可见尺寸写入规则。',
                outcomeEn: 'A visibility floor enters policy.',
                resultZh: '弱入口不会被悄悄删除。',
                resultEn: 'Quiet entrances cannot vanish silently.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许固定多个常用门',
                labelEn: 'Pin several preferred doors',
                outcomeZh: '选择不限制数量为一。',
                outcomeEn: 'Preference need not select only one.',
                resultZh: '归家路线可以同时存在。',
                resultEn: 'Homeward routes may coexist.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '五门屋取消正门等级，把个人缩放限制在本地，并增加无门槛入口。',
        'The five-door house removes front-door rank, scopes zoom locally, and adds a step-free entrance.',
        '同时通向屋心的五扇门', 'Five Doors Reaching the Same Hearth',
        '来源、最近使用和个性偏好都不会让任何入口从公共地图消失。',
        'Origin, recency, and preference cannot make an entrance disappear from the shared map.'
        ), ep('memory-tailor-shop', '记忆裁缝店', 'Memory Tailor Shop', 'courier',
        'patience', [scene({
            speaker: 'courier',
            introZh: '裁缝不删除磨损，只为重要记忆添加可以继续使用的衬里。',
            introEn: 'The tailor preserves wear and adds durable lining to important memories.',
            promptZh: '一段撕裂记忆该怎样加固？',
            promptEn: 'How should a torn memory be reinforced?',
            options: [o({
                labelZh: '保留裂口可见',
                labelEn: 'Keep the tear visible',
                outcomeZh: '衬布只托住背面。',
                outcomeEn: 'Lining supports only the reverse.',
                resultZh: '修复不再伪造完整。',
                resultEn: 'Repair no longer fabricates wholeness.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录每次补缀来源',
                labelEn: 'Record every patch source',
                outcomeZh: '线色对应修订时间。',
                outcomeEn: 'Thread colors map revision dates.',
                resultZh: '变化过程可追溯。',
                resultEn: 'The change process remains traceable.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '由共同持有人选衬布',
                labelEn: 'Let co-holders choose lining',
                outcomeZh: '任何一方都能拒绝材料。',
                outcomeEn: 'Either holder may reject a material.',
                resultZh: '共同修复需要共同同意。',
                resultEn: 'Shared repair needs mutual consent.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '剪除会继续腐蚀的线',
                labelEn: 'Remove corrosive thread',
                outcomeZh: '危险纤维单独封存。',
                outcomeEn: 'The harmful fiber is sealed separately.',
                resultZh: '安全处置优先于原样保留。',
                resultEn: 'Safe handling outranks exact preservation.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '选择暂不修补',
                labelEn: 'Choose no repair yet',
                outcomeZh: '记忆进入稳定平放盒。',
                outcomeEn: 'The memory enters a stable flat box.',
                resultZh: '等待不会导致内容失效。',
                resultEn: 'Waiting does not expire content.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'patience',
            introZh: '一块补丁带有裁缝自己的故事，准备覆盖原记忆空白。',
            introEn: 'A patch carries the tailor’s story and is about to cover a blank in the original memory.',
            promptZh: '怎样避免修复者占据空白？',
            promptEn: 'How should the repairer avoid occupying the blank?',
            options: [o({
                labelZh: '换成无文字衬布',
                labelEn: 'Use unmarked lining',
                outcomeZh: '空白保持没有解释。',
                outcomeEn: 'The blank remains unexplained.',
                resultZh: '未知不被修复者填满。',
                resultEn: 'The repairer does not fill the unknown.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '把裁缝故事独立存放',
                labelEn: 'Archive the tailor note separately',
                outcomeZh: '旁注不进入记忆正文。',
                outcomeEn: 'The note stays outside memory content.',
                resultZh: '观点与原件保持边界。',
                resultEn: 'Perspective and original retain boundaries.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '询问持有人是否需要旁注',
                labelEn: 'Ask before attaching context',
                outcomeZh: '默认答案是不添加。',
                outcomeEn: 'The default is no attachment.',
                resultZh: '解释需要主动同意。',
                resultEn: 'Explanation requires opt-in.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拆除已粘上的越界补丁',
                labelEn: 'Remove the intrusive patch',
                outcomeZh: '胶层安全软化后分离。',
                outcomeEn: 'The adhesive softens and separates safely.',
                resultZh: '错误修复可以被果断撤回。',
                resultEn: 'A mistaken repair may be decisively reversed.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许记忆保持不完整',
                labelEn: 'Permit incompleteness',
                outcomeZh: '收藏册接受缺页状态。',
                outcomeEn: 'The memory book accepts a missing page.',
                resultZh: '完整度不再决定价值。',
                resultEn: 'Completeness no longer determines value.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '记忆裁缝店保留裂口、空白和修订来源，不让修复者故事覆盖原件。',
        'The memory tailor preserves tears, blanks, and revision provenance without letting the repairer overwrite the original.',
        '仍然看得见裂口的衬里', 'The Lining That Leaves the Tear Visible',
        '加固可以帮助继续使用，却不必声称记忆完整、确定或已经修好。',
        'Reinforcement may support continued use without claiming a memory is whole, certain, or healed.', {
            text: b('守望者只送来一卷无字衬布，并把剪刀留在盒外。',
                'The watcher sends unmarked lining and leaves the scissors outside the box.'
                ),
            title: b('没有代写内容的衬布', 'Lining That Writes Nothing for You'),
            body: b('是否修补、何时修补以及保留多少裂口，都由记忆持有人决定。',
                'Whether, when, and how much to mend belongs to the memory holders.'
                )
        }), ep('choir-with-open-part', '留出声部的合唱', 'The Choir with an Open Part',
        'patience', 'tessera', [scene({
            speaker: 'patience',
            introZh: '合唱谱永远留有一个空声部，新来者可以加入也可以只听。',
            introEn: 'The score always keeps one part open for newcomers who may join or only listen.',
            promptZh: '空声部应怎样避免变成等待压力？',
            promptEn: 'How should the open part avoid becoming pressure?',
            options: [o({
                labelZh: '不显示等待倒计时',
                labelEn: 'Show no waiting countdown',
                outcomeZh: '空行没有闪烁提醒。',
                outcomeEn: 'The blank line carries no flashing prompt.',
                resultZh: '邀请不再制造期限。',
                resultEn: 'Invitation no longer creates a deadline.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录它可保持永久空白',
                labelEn: 'Mark permanent blank as valid',
                outcomeZh: '谱尾接受无人加入。',
                outcomeEn: 'The score accepts no arrival.',
                resultZh: '空缺成为完整编曲。',
                resultEn: 'Absence becomes a complete arrangement.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '提供旁听座位',
                labelEn: 'Offer listening seats',
                outcomeZh: '观众无需承诺以后演唱。',
                outcomeEn: 'Listeners promise no future singing.',
                resultZh: '参与拥有多种强度。',
                resultEn: 'Participation gains multiple intensities.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '停止自动点名新来者',
                labelEn: 'Disable newcomer callouts',
                outcomeZh: '系统不再公开催请。',
                outcomeEn: 'The system stops public prompting.',
                resultZh: '隐私与拒绝被即时保护。',
                resultEn: 'Privacy and refusal gain immediate protection.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许任何成员暂时休止',
                labelEn: 'Allow any member to rest',
                outcomeZh: '原有声部也可变成空行。',
                outcomeEn: 'Existing parts may become blank too.',
                resultZh: '开放不再只要求新人填补。',
                resultEn: 'Openness no longer asks newcomers alone to fill gaps.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'tessera',
            introZh: '指挥担心多个空声部会让作品无法算作完成。',
            introEn: 'The conductor fears several blank parts make the work incomplete.',
            promptZh: '完成定义应该怎样改变？',
            promptEn: 'How should completion be redefined?',
            options: [o({
                labelZh: '以共同收束而非人数结算',
                labelEn: 'Complete by shared closing',
                outcomeZh: '最后一拍由在场者确认。',
                outcomeEn: 'Present performers confirm the final beat.',
                resultZh: '人数不再决定完成资格。',
                resultEn: 'Headcount no longer determines completion.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '保存本次实际声部快照',
                labelEn: 'Snapshot performed parts',
                outcomeZh: '档案不补写缺席声音。',
                outcomeEn: 'The archive invents no absent voice.',
                resultZh: '历史保持诚实。',
                resultEn: 'History remains honest.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让每个声部选择结尾',
                labelEn: 'Let each part choose its close',
                outcomeZh: '不同终止音可以并列。',
                outcomeEn: 'Different final notes may coexist.',
                resultZh: '合作不要求统一终点。',
                resultEn: 'Cooperation needs no identical ending.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '撤销最低人数规则',
                labelEn: 'Remove minimum attendance',
                outcomeZh: '旧门槛从演出器删除。',
                outcomeEn: 'The old gate leaves the performance engine.',
                resultZh: '低人数不再阻塞舞台。',
                resultEn: 'Low attendance no longer blocks the stage.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '承认安静版本为正式版',
                labelEn: 'Publish the quiet version',
                outcomeZh: '休止符进入版本号。',
                outcomeEn: 'Rests enter the versioned score.',
                resultZh: '沉默也能构成作品。',
                resultEn: 'Silence can constitute the work.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '开放合唱取消倒计时、点名和最低人数，以实际声部共同收束。',
        'The open choir removes countdowns, callouts, and minimum attendance, closing with parts actually present.',
        '没有人填补也完整的声部', 'The Part That Is Complete While Unfilled',
        '加入、旁听、休止和永久空白都属于正式谱面，不影响作品完成。',
        'Joining, listening, resting, and lasting blank space all belong to the official score without blocking completion.'
        ), ep('garden-of-returned-seeds', '归种花园', 'Garden of Returned Seeds', 'tessera',
        'flora', [scene({
            speaker: 'tessera',
            introZh: '送走的种子带着外地土壤归来，园丁要求清洗到原来模样。',
            introEn: 'Seeds return with foreign soil, and the gardener demands they be washed back to their old form.',
            promptZh: '归来是否需要恢复原样？',
            promptEn: 'Must return restore the original form?',
            options: [o({
                labelZh: '保留外地土壤样本',
                labelEn: 'Keep the traveled soil',
                outcomeZh: '新旧土层各自标源。',
                outcomeEn: 'Old and new soils keep provenance.',
                resultZh: '经历不再被当作污染。',
                resultEn: 'Experience is no longer treated as contamination.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '检测土壤而非猜测风险',
                labelEn: 'Test instead of assuming danger',
                outcomeZh: '报告区分事实与未知。',
                outcomeEn: 'The report separates fact and unknown.',
                resultZh: '安全判断建立在证据上。',
                resultEn: 'Safety decisions rest on evidence.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让种子选择种植区',
                labelEn: 'Let seeds choose plots',
                outcomeZh: '混合园与独立盆都开放。',
                outcomeEn: 'Mixed beds and solo pots remain open.',
                resultZh: '归属不要求放弃变化。',
                resultEn: 'Belonging does not require abandoning change.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拒绝强制清洗机器',
                labelEn: 'Stop forced washing',
                outcomeZh: '滚筒从入口移除。',
                outcomeEn: 'The drum leaves the entrance.',
                resultZh: '回家不再以还原为条件。',
                resultEn: 'Coming home no longer requires restoration.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许种子继续旅行',
                labelEn: 'Permit continued travel',
                outcomeZh: '归来记录不锁定位置。',
                outcomeEn: 'The return record locks no location.',
                resultZh: '回家不等于永远停留。',
                resultEn: 'Homecoming does not mean staying forever.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'flora',
            introZh: '花园准备给归种颁发一次性欢迎章，七天后未领取就销毁。',
            introEn: 'The garden offers a welcome badge that is destroyed if unclaimed after seven days.',
            promptZh: '怎样让欢迎不制造错过？',
            promptEn: 'How should welcome avoid fear of missing out?',
            options: [o({
                labelZh: '取消领取期限',
                labelEn: 'Remove claim expiry',
                outcomeZh: '欢迎章永久可领。',
                outcomeEn: 'The badge remains claimable forever.',
                resultZh: '休息不会失去纪念。',
                resultEn: 'Rest cannot lose remembrance.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '将欢迎记录自动入档',
                labelEn: 'Archive welcome without claiming',
                outcomeZh: '记录不要求点击。',
                outcomeEn: 'The record requires no click.',
                resultZh: '历史不依赖在线时刻。',
                resultEn: 'History no longer depends on online timing.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让种子选择是否展示',
                labelEn: 'Let seeds choose display',
                outcomeZh: '收藏存在但默认私密。',
                outcomeEn: 'The keepsake exists but defaults private.',
                resultZh: '拥有与展示各自独立。',
                resultEn: 'Ownership and display separate.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '销毁到期回收规则',
                labelEn: 'Delete the reclaim policy',
                outcomeZh: '工作器无法删除已得章。',
                outcomeEn: 'No worker can delete earned badges.',
                resultZh: '已得内容永久安全。',
                resultEn: 'Earned content remains permanently safe.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许拒绝欢迎仪式',
                labelEn: 'Permit declining ceremony',
                outcomeZh: '拒绝不影响园地位置。',
                outcomeEn: 'Declining changes no garden place.',
                resultZh: '欢迎保持自愿。',
                resultEn: 'Welcome remains voluntary.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '归种花园保留旅行土壤与继续出发权，并取消欢迎章的领取期限和回收。',
        'The returned-seed garden preserves traveled soil and onward movement while removing badge expiry and reclaim.',
        '带着外地土壤的归种', 'The Returned Seed Carrying Foreign Soil',
        '归来不要求还原、停留、展示或按时领取欢迎；已得位置与收藏都保留。',
        'Return requires no restoration, staying, display, or timely claim; earned place and collection remain.', {
            text: b('守望者把欢迎牌放在常亮架上，没有写最后领取日期。',
                'The watcher places the welcome marker on an always-open shelf without a final claim date.'
                ),
            title: b('一直留在架上的欢迎牌', 'The Welcome Marker That Stays on the Shelf'),
            body: b('它可以今天取走、以后取走或保持不取；花园位置不会变化。',
                'Take it today, later, or never; the garden place does not change.')
        }), ep('archive-with-windows', '有窗档案馆', 'The Archive with Windows', 'flora',
        'bell', [scene({
            speaker: 'flora',
            introZh: '档案馆把封闭墙面换成窗，天气开始改变纸张湿度。',
            introEn: 'The archive replaces sealed walls with windows, and weather begins changing paper humidity.',
            promptZh: '开放与保存怎样同时成立？',
            promptEn: 'How can openness and preservation coexist?',
            options: [o({
                labelZh: '安装可调防雨窗',
                labelEn: 'Install adjustable rain screens',
                outcomeZh: '空气流通且纸张不被淋湿。',
                outcomeEn: 'Air moves while paper stays dry.',
                resultZh: '开放获得可逆保护层。',
                resultEn: 'Openness gains reversible protection.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录天气影响数据',
                labelEn: 'Log weather effects',
                outcomeZh: '湿度变化与页况并列。',
                outcomeEn: 'Humidity and page condition align.',
                resultZh: '环境后果进入可审计历史。',
                resultEn: 'Environmental effects enter audit history.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让阅览者共同调节',
                labelEn: 'Share window controls',
                outcomeZh: '本地窗区互不覆盖。',
                outcomeEn: 'Local window zones do not overwrite each other.',
                resultZh: '共同空间支持不同舒适度。',
                resultEn: 'Shared space supports different comfort.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '暴雨时果断闭窗',
                labelEn: 'Close during the storm',
                outcomeZh: '关闭状态写明预计复开。',
                outcomeEn: 'Closure states expected reopening.',
                resultZh: '临时保护不冒充永久封闭。',
                resultEn: 'Temporary protection does not impersonate permanent closure.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '保留一间无窗冷库',
                labelEn: 'Keep one windowless vault',
                outcomeZh: '脆弱原件仍有安全位置。',
                outcomeEn: 'Fragile originals retain a safe place.',
                resultZh: '开放不强迫所有内容曝光。',
                resultEn: 'Openness does not force every item into exposure.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'bell',
            introZh: '窗外城市想把实时天气写进旧档案正文。',
            introEn: 'The city wants live weather written directly into old archive text.',
            promptZh: '当下信息应怎样连接历史？',
            promptEn: 'How should current information connect to history?',
            options: [o({
                labelZh: '使用独立天气旁注',
                labelEn: 'Use separate weather annotations',
                outcomeZh: '原文保持不可变。',
                outcomeEn: 'The original text stays immutable.',
                resultZh: '当下不会改写过去。',
                resultEn: 'The present cannot rewrite the past.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '给旁注独立版本号',
                labelEn: 'Version every annotation',
                outcomeZh: '每次更新有自己的哈希。',
                outcomeEn: 'Every update gains its own hash.',
                resultZh: '变化来源清楚可查。',
                resultEn: 'Change provenance becomes clear.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '允许读者关闭天气层',
                labelEn: 'Let readers hide weather',
                outcomeZh: '个人视图不影响他人。',
                outcomeEn: 'Personal view affects no one else.',
                resultZh: '叠加信息保持可选。',
                resultEn: 'Overlay information remains optional.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '阻止原地更新历史表',
                labelEn: 'Block in-place archive updates',
                outcomeZh: '数据库拒绝正文修改。',
                outcomeEn: 'The database rejects content mutation.',
                resultZh: '不可变边界由服务端保证。',
                resultEn: 'The server guarantees immutability.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供历史与当下对照页',
                labelEn: 'Offer a comparison page',
                outcomeZh: '两个时期各自署时。',
                outcomeEn: 'Both periods keep timestamps.',
                resultZh: '连接不等于合并。',
                resultEn: 'Connection does not mean merger.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '有窗档案馆用可调保护与独立天气旁注连接当下，同时保持正文不可变。',
        'The windowed archive connects the present through adjustable protection and separate weather notes while keeping source text immutable.',
        '不会改写旧页的天气窗', 'The Weather Window That Does Not Rewrite Old Pages',
        '过去与当下可以并列呼吸；每次变化有版本，原文仍保持自己的时间。',
        'Past and present may breathe together; every change has a version while original text keeps its time.'
        ), ep('game-room-at-dawn', '黎明游戏室', 'The Game Room at Dawn', 'bell', 'keeper', [
            scene({
                speaker: 'bell',
                introZh: '十种合作游戏把首通排成圆桌，却把失败局藏在地下抽屉。',
                introEn: 'Ten cooperative games arrange first clears around a table but hide failed runs underground.',
                promptZh: '失败局应该怎样进入游戏室？',
                promptEn: 'How should failed runs enter the room?',
                options: [o({
                    labelZh: '给失败局独立座位',
                    labelEn: 'Give failed runs their own seats',
                    outcomeZh: '重试记录与首通并列。',
                    outcomeEn: 'Retries sit beside first clears.',
                    resultZh: '失败不再被成功历史吞掉。',
                    resultEn: 'Failure is no longer swallowed by success history.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '保存每局规则版本',
                    labelEn: 'Keep each run version',
                    outcomeZh: '旧局按绑定快照重放。',
                    outcomeEn: 'Old runs replay their bound snapshot.',
                    resultZh: '部署变化不改写挑战。',
                    resultEn: 'Deployments cannot rewrite challenges.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '展示双方不同贡献',
                    labelEn: 'Show asymmetric contributions',
                    outcomeZh: '支援与主行动各自计入。',
                    outcomeEn: 'Support and primary actions count separately.',
                    resultZh: '合作不再只奖励最后一步。',
                    resultEn: 'Cooperation no longer rewards only the final move.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '删除失败惩罚扣分',
                    labelEn: 'Remove failure deductions',
                    outcomeZh: '游戏不能直接触碰余额。',
                    outcomeEn: 'Games cannot touch balances directly.',
                    resultZh: '玩法与货币边界恢复。',
                    resultEn: 'Gameplay and money boundaries return.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许单人替代模式',
                    labelEn: 'Keep solo fallback',
                    outcomeZh: '同伴离线仍可完成。',
                    outcomeEn: 'A run may finish while a partner is offline.',
                    resultZh: '协作邀请不会困住玩家。',
                    resultEn: 'A co-op invitation cannot trap a player.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            }), scene({
                speaker: 'keeper',
                introZh: '圆桌想按总分决定谁能查看隐藏结局。',
                introEn: 'The table wants total score to decide who may view hidden conclusions.',
                promptZh: '叙事解锁应依据什么？',
                promptEn: 'What should narrative unlocks depend on?',
                options: [o({
                    labelZh: '使用可信完成事件',
                    labelEn: 'Use trusted completion events',
                    outcomeZh: '服务器结算才推进条件。',
                    outcomeEn: 'Only server settlement advances conditions.',
                    resultZh: '浏览器不能自报解锁。',
                    resultEn: 'Browsers cannot self-report unlocks.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '记录事件唯一来源',
                    labelEn: 'Store unique source identity',
                    outcomeZh: '重复回放只结算一次。',
                    outcomeEn: 'Replays settle exactly once.',
                    resultZh: '幂等边界得到长期保证。',
                    resultEn: 'Idempotency gains a durable guarantee.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '允许多种玩法路线',
                    labelEn: 'Offer several game routes',
                    outcomeZh: '不同游戏都能抵达故事门。',
                    outcomeEn: 'Different games reach the story gate.',
                    resultZh: '单一高分不再垄断内容。',
                    resultEn: 'One high score no longer monopolizes content.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '拒绝客户端分数字段',
                    labelEn: 'Reject client-authored scores',
                    outcomeZh: '请求中的分数被严格忽略。',
                    outcomeEn: 'Scores in requests are rejected.',
                    resultZh: '隐藏状态无法被注入。',
                    resultEn: 'Hidden state cannot be injected.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '保留非游戏剧情入口',
                    labelEn: 'Keep a nongame story path',
                    outcomeZh: '不玩游戏也能完成赛季。',
                    outcomeEn: 'The season remains completable without games.',
                    resultZh: '玩法偏好不影响主线资格。',
                    resultEn: 'Game preference does not affect main-story eligibility.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '黎明游戏室为失败局和单人替代保留座位，并以唯一可信事件连接剧情。',
        'The dawn game room seats failed runs and solo fallback while linking story through unique trusted events.',
        '圆桌旁的重试椅', 'The Retry Chair at the Round Table',
        '首通、失败、支援与单人完成都保留自己的记录；任何游戏都不直接发积分。',
        'First clears, failures, support, and solo completions keep distinct records; no game sends points directly.', {
            text: b('守望者在圆桌旁选择支援席，并关闭自己的分数显示。',
                'The watcher chooses a support seat and disables their score display.'
                ),
            title: b('不占据最高分的支援席', 'The Support Seat That Claims No High Score'),
            body: b('支援事件会被安全记录，但不会替主播提交行动或领取奖励。',
                'Support events are recorded safely but never submit creator actions or claim rewards.'
                )
        }), ep('relay-five', '五号中继站', 'Relay Five', 'keeper', 'lumen', [scene({
            speaker: 'keeper',
            introZh: '五号站不是终点，却被竣工仪式要求冻结全部路线。',
            introEn: 'Relay Five is not a terminus, but its opening ceremony demands every route be frozen.',
            promptZh: '怎样完成建设而不关闭未来选择？',
            promptEn: 'How should construction finish without closing future choice?',
            options: [o({
                labelZh: '冻结版本而非路线',
                labelEn: 'Freeze versions, not routes',
                outcomeZh: '已发布内容不可变，新版可追加。',
                outcomeEn: 'Published content is immutable and new versions may append.',
                resultZh: '历史稳定且未来仍开放。',
                resultEn: 'History stays stable and future remains open.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '建立季节总索引',
                labelEn: 'Build a season index',
                outcomeZh: '五季快照各有哈希与计数。',
                outcomeEn: 'Five snapshots keep hashes and counts.',
                resultZh: '碰撞会在启动时失败关闭。',
                resultEn: 'Collisions fail closed at startup.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '保留五种结局入口',
                labelEn: 'Keep five conclusion doors',
                outcomeZh: '大厅不选官方终点。',
                outcomeEn: 'The hall selects no official ending.',
                resultZh: '不同关系路线继续共存。',
                resultEn: 'Different relationship routes continue together.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拒绝终局删除任务',
                labelEn: 'Reject finale deletion',
                outcomeZh: '清理器不能碰已得内容。',
                outcomeEn: 'Cleanup cannot touch earned content.',
                resultZh: '结束不会触发失去。',
                resultEn: 'An ending triggers no loss.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供再次选择地图',
                labelEn: 'Offer a revisit map',
                outcomeZh: '重玩只读且不重复价值。',
                outcomeEn: 'Replay is value-free and read-only for settlement.',
                resultZh: '回看不会重复发奖。',
                resultEn: 'Revisiting never duplicates rewards.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'lumen',
            introZh: '最后一封信询问中继站应该把“家”保存成地点、关系还是返回权。',
            introEn: 'The final letter asks whether home should mean place, relationship, or right of return.',
            promptZh: '哪种定义能够容纳五季变化？',
            promptEn: 'Which definition can contain five seasons of change?',
            options: [o({
                labelZh: '把家写成可拒绝的邀请',
                labelEn: 'Write home as a declinable invitation',
                outcomeZh: '门始终开着但不发催促。',
                outcomeEn: 'The door stays open without reminders.',
                resultZh: '连接不再制造义务。',
                resultEn: 'Connection no longer creates obligation.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '把家写成有来源的档案',
                labelEn: 'Write home as sourced archive',
                outcomeZh: '每段记忆保留版本与作者。',
                outcomeEn: 'Every memory keeps version and author.',
                resultZh: '归属不抹平历史差异。',
                resultEn: 'Belonging does not flatten history.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '把家写成共同协商空间',
                labelEn: 'Write home as negotiated space',
                outcomeZh: '边界可分别更新并被尊重。',
                outcomeEn: 'Boundaries update independently and remain respected.',
                resultZh: '共同生活不要求同一尺度。',
                resultEn: 'Shared life needs no identical scale.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '把家写成随时可离开的门',
                labelEn: 'Write home as a door one may leave',
                outcomeZh: '退出按钮与入口同样明显。',
                outcomeEn: 'Exit is as visible as entry.',
                resultZh: '勇敢靠近不再牺牲自由。',
                resultEn: 'Brave closeness no longer sacrifices freedom.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许家保持未完成',
                labelEn: 'Let home remain unfinished',
                outcomeZh: '星座留下一段可扩展空线。',
                outcomeEn: 'The constellation keeps an extensible blank line.',
                resultZh: '不确定也能成为长期结论。',
                resultEn: 'Uncertainty may become a lasting conclusion.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '五号站冻结历史版本却不冻结路线，并把家保存成可拒绝、可离开、可重访的权利。',
        'Relay Five freezes historical versions without freezing routes and preserves home as a right to decline, leave, and revisit.',
        '未完成的归家星座', 'The Unfinished Homeward Constellation',
        '五季成果不会过期，五种结局没有官方胜者，返回与离开拥有同样清楚的门。',
        'Five seasons of results never expire, no ending becomes official winner, and return and departure have equally clear doors.'
        )],
    endingRouter: b('五号站展开全部季节快照与持久选择，归家星座依照关系轴形成五个同等有效的长期结论。',
        'Relay Five opens every season snapshot and lasting choice, forming five equally valid homeward conclusions from relationship axes.'
        ),
    endings: [{
        id: 'homeward-constellation.ending.constellation',
        key: 'constellation',
        route: 'home.ending.constellation',
        priority: 50,
        condition: {
            op: 'axis',
            axis: 'harmony',
            minimum: 16
        },
        text: b('开放星座保留未填声部、多个入口与自主边界，同行者不必共享同一节奏。',
            'The open constellation keeps blank parts, many entrances, and autonomous boundaries without requiring one shared tempo.'
            )
    }, {
        id: 'homeward-constellation.ending.beacon',
        key: 'beacon',
        route: 'home.ending.beacon',
        priority: 40,
        condition: {
            op: 'axis',
            axis: 'trust',
            minimum: 16
        },
        text: b('常亮门灯标出可靠入口和出口，却不会因为等待而向任何人追债。',
            'The everlit door marks reliable entry and exit without charging anyone a debt for waiting.'
            )
    }, {
        id: 'homeward-constellation.ending.archive',
        key: 'archive',
        route: 'home.ending.archive',
        priority: 30,
        condition: {
            op: 'axis',
            axis: 'curiosity',
            minimum: 16
        },
        text: b('有窗档案保存版本、裂口与更正，让当下靠近过去但不原地改写。',
            'The windowed archive keeps versions, tears, and corrections, letting the present approach without rewriting the past.'
            )
    }, {
        id: 'homeward-constellation.ending.brave',
        key: 'brave',
        route: 'home.ending.brave',
        priority: 20,
        condition: {
            op: 'axis',
            axis: 'courage',
            minimum: 16
        },
        text: b('五门远行线把退出和前进画得同样清楚，家因此不再是一把锁。',
            'The five-door expedition draws exit as clearly as progress, so home is no longer a lock.'
            )
    }, {
        id: 'homeward-constellation.ending.hearth',
        key: 'hearth',
        route: 'home.ending.hearth',
        priority: 1,
        condition: {
            op: 'always'
        },
        text: b('黎明长桌为重试、沉默与未完成留下座位，停在这里也是完整归家。',
            'The dawn table seats retries, silence, and unfinished work; staying here is a complete homecoming.'
            )
    }]
};
for (const current of source.episodes) {
    const additions = deepening[current.slug];
    if (!Array.isArray(additions) || additions.length !== 2) {
        throw new TypeError(`Season Five deepening is incomplete for ${current.slug}`);
    }
    current.scenes.push(...additions);
}
module.exports = compileAuthoredSeason(source);