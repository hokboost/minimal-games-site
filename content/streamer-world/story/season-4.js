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
const deepening = require('./season-4-deepening');

function ep(slug, zh, en, character, cameo, scenes, archiveZh, archiveEn, memoryTitleZh,
    memoryTitleEn, memoryZh, memoryEn, owner = null) {
    return episode(slug, zh, en, character, cameo, scenes, {
        type: 'memory_unlock',
        text: b(archiveZh, archiveEn),
        unlockType: 'collection',
        unlockKey: `wild-stars.${slug}`
    }, {
        title: b(memoryTitleZh, memoryTitleEn),
        body: b(memoryZh, memoryEn)
    }, owner);
}
const source = {
    slug: 'archive-of-wild-stars',
    version: 1,
    title: b('我们之间的信号：野星档案', 'The Signal Between Us: Archive of Wild Stars'),
    episodes: [ep('wild-star-registry', '野星登记处', 'Wild-Star Registry', 'lumen', 'ori', [scene({
            speaker: 'lumen',
            introZh: '登记处拒绝没有固定轨道的星，却仍偷偷给它们编号。',
            introEn: 'The registry rejects stars without fixed orbits while secretly numbering them.',
            promptZh: '第一颗野星应获得怎样的记录？',
            promptEn: 'What record should the first wild star receive?',
            options: [o({
                labelZh: '登记观测而非所有权',
                labelEn: 'Register observation, not ownership',
                outcomeZh: '条目只写时间与光谱。',
                outcomeEn: 'The entry stores time and spectrum only.',
                resultZh: '编号不再声称占有星体。',
                resultEn: 'The number no longer claims ownership.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '保存多条可能轨道',
                labelEn: 'Preserve possible orbits',
                outcomeZh: '三条曲线并列显示。',
                outcomeEn: 'Three curves appear side by side.',
                resultZh: '不确定性进入正式目录。',
                resultEn: 'Uncertainty enters the official catalog.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让发现者共同署名',
                labelEn: 'Share discovery credit',
                outcomeZh: '六个望台拥有同等位置。',
                outcomeEn: 'Six observatories receive equal placement.',
                resultZh: '合作记录不再抢夺首名。',
                resultEn: 'Collaboration no longer competes for first billing.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拒绝强行固定坐标',
                labelEn: 'Refuse a forced coordinate',
                outcomeZh: '锁定器停止追逐。',
                outcomeEn: 'The targeting rig stops chasing.',
                resultZh: '自由移动不被写成异常。',
                resultEn: 'Free movement is not labeled abnormal.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '设立暂不分类栏',
                labelEn: 'Create an unclassified shelf',
                outcomeZh: '空白类别获得稳定索引。',
                outcomeEn: 'The blank category gains a stable index.',
                resultZh: '未知身份不影响可查性。',
                resultEn: 'Unknown identity no longer harms discoverability.',
                axis: 'curiosity',
                route: 'archive-route'
            })]
        }), scene({
            speaker: 'ori',
            introZh: '旧目录把最亮星定义成其他星的领袖。',
            introEn: 'The old catalog defines the brightest star as leader of the others.',
            promptZh: '怎样移除光度与权力的错误映射？',
            promptEn: 'How should brightness be separated from power?',
            options: [o({
                labelZh: '删除领袖字段',
                labelEn: 'Delete the leader field',
                outcomeZh: '光度仍作为物理读数。',
                outcomeEn: 'Brightness remains a physical reading.',
                resultZh: '测量不再生成地位。',
                resultEn: 'Measurement no longer creates status.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '加入多维星图',
                labelEn: 'Add a multidimensional chart',
                outcomeZh: '颜色、距离与变化各自成轴。',
                outcomeEn: 'Color, distance, and variation get separate axes.',
                resultZh: '单一排名失去支配权。',
                resultEn: 'One ranking loses its control.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让小星选择群组',
                labelEn: 'Let faint stars choose groups',
                outcomeZh: '星群关系不由亮度决定。',
                outcomeEn: 'Groups no longer follow brightness.',
                resultZh: '归属成为自主连接。',
                resultEn: 'Belonging becomes voluntary connection.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '撤下旧权力图',
                labelEn: 'Remove the hierarchy chart',
                outcomeZh: '展墙留下修订说明。',
                outcomeEn: 'The wall keeps a revision notice.',
                resultZh: '有害图示停止继续影响。',
                resultEn: 'The harmful chart stops shaping behavior.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '保留无中心视图',
                labelEn: 'Keep a centerless view',
                outcomeZh: '星图可从任一点旋转。',
                outcomeEn: 'The map rotates from any point.',
                resultZh: '没有星被固定成边缘。',
                resultEn: 'No star is fixed as peripheral.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '登记处把野星写成可观测而不可占有，并删除亮度领袖字段。',
        'The registry records wild stars as observable but unowned and deletes brightness-based leadership.',
        '没有固定轨道的正式条目', 'The Official Entry Without a Fixed Orbit',
        '多种轨道与未知分类都能被查到，编号不再变成锁链。',
        'Possible orbits and unknown classes remain findable, and a number no longer becomes a chain.', {
            text: b('守望者交回一枚曾用于优先命名的印章。',
                'The watcher returns a seal once used for priority naming.'),
            title: b('不再盖下的所有权章', 'The Ownership Seal No Longer Used'),
            body: b('印章被保留作权力历史，不会再赋予任何星名。',
                'The seal remains as power history and assigns no future star name.'
                )
        }), ep('comet-orchard', '彗星果园', 'Comet Orchard', 'sora', 'vale', [scene({
            speaker: 'sora',
            introZh: '果树只在彗星经过时结果，园主想提前摇落所有青果。',
            introEn: 'The orchard fruits only during comet passage, and its keeper wants every green fruit shaken down early.',
            promptZh: '这次稀有窗口应怎样使用？',
            promptEn: 'How should this rare window be used?',
            options: [o({
                labelZh: '只采自然落果',
                labelEn: 'Gather fallen fruit only',
                outcomeZh: '枝头成熟节奏保持不变。',
                outcomeEn: 'Branch ripening remains untouched.',
                resultZh: '稀有机会不再压过生长边界。',
                resultEn: 'Rarity no longer outranks growth boundaries.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '记录不同树的成熟差',
                labelEn: 'Map ripening differences',
                outcomeZh: '十二棵树各有时间线。',
                outcomeEn: 'Twelve trees receive timelines.',
                resultZh: '差异成为下一次观测依据。',
                resultEn: 'Difference becomes evidence for next passage.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '分配公共采集篮',
                labelEn: 'Share collection baskets',
                outcomeZh: '每组只拿明确配额。',
                outcomeEn: 'Each group takes a bounded share.',
                resultZh: '合作阻止先到者独占。',
                resultEn: 'Cooperation prevents first-arrival capture.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '停止摇树机器',
                labelEn: 'Stop the shaking rig',
                outcomeZh: '机械臂锁在安全位置。',
                outcomeEn: 'The arm locks in a safe position.',
                resultZh: '一次果断停机保护未熟果。',
                resultEn: 'A decisive stop protects unripe fruit.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许整季不采摘',
                labelEn: 'Permit no harvest',
                outcomeZh: '空篮仍记录观测成功。',
                outcomeEn: 'Empty baskets still record a successful watch.',
                resultZh: '不获取也成为完整成果。',
                resultEn: 'Taking nothing becomes a complete result.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'vale',
            introZh: '商人把彗星果包装成错过就永不再有的限时礼盒。',
            introEn: 'A merchant sells comet fruit as a miss-it-forever box.',
            promptZh: '怎样消除这场人为稀缺？',
            promptEn: 'How should this manufactured scarcity end?',
            options: [o({
                labelZh: '保存种子长期可种',
                labelEn: 'Keep seeds permanently available',
                outcomeZh: '种子库没有过期日。',
                outcomeEn: 'The seed bank has no expiry date.',
                resultZh: '未来参与不再依赖本次窗口。',
                resultEn: 'Future participation no longer depends on this window.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '公布历次彗星周期',
                labelEn: 'Publish passage history',
                outcomeZh: '档案显示它会再次回来。',
                outcomeEn: 'The archive shows the comet returns.',
                resultZh: '宣传无法再冒充唯一机会。',
                resultEn: 'Marketing cannot impersonate a final chance.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '改成随时可看的标本',
                labelEn: 'Create an anytime exhibit',
                outcomeZh: '果皮色谱长期开放。',
                outcomeEn: 'The peel spectrum remains open permanently.',
                resultZh: '庆祝脱离购买倒计时。',
                resultEn: 'Celebration leaves the purchase countdown.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '下架限时礼盒',
                labelEn: 'Withdraw the pressure box',
                outcomeZh: '库存转入普通目录。',
                outcomeEn: 'Inventory enters the regular catalog.',
                resultZh: '紧迫话术当场停止。',
                resultEn: 'Urgency language stops immediately.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '保留已得收藏不回收',
                labelEn: 'Protect existing keepsakes',
                outcomeZh: '旧礼盒持有人无需重领。',
                outcomeEn: 'Existing holders need not reclaim anything.',
                resultZh: '轮换不会夺走已得内容。',
                resultEn: 'Rotation never removes earned content.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '彗星果园停止摇树与限时销售，把种子和标本永久开放。',
        'The comet orchard stops forced harvest and timed sales, keeping seeds and specimens permanently available.',
        '没有倒计时的彗星种子', 'The Comet Seed Without a Countdown', '错过一次天象不会失去种植、观看或收藏的资格。',
        'Missing one passage loses no eligibility to grow, view, or collect.'), ep(
        'shadow-testimony', '影子证词庭', 'Court of Shadow Testimony', 'mika', 'chime', [
            scene({
                speaker: 'mika',
                introZh: '法庭只接受与本人动作完全一致的影子作证。',
                introEn: 'The court accepts only shadows that perfectly match their person.',
                promptZh: '一个延迟半拍的影子应被怎样听取？',
                promptEn: 'How should a shadow delayed by half a beat be heard?',
                options: [o({
                    labelZh: '分别记录人和影子',
                    labelEn: 'Record person and shadow separately',
                    outcomeZh: '两条时间线并列入卷。',
                    outcomeEn: 'Two timelines enter the file side by side.',
                    resultZh: '差异不再自动判成谎言。',
                    resultEn: 'Difference no longer automatically means lying.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '测量灯源延迟',
                    labelEn: 'Measure the light delay',
                    outcomeZh: '墙灯解释半拍偏差。',
                    outcomeEn: 'The wall lamp explains the half-beat lag.',
                    resultZh: '环境因素加入证据链。',
                    resultEn: 'Environmental factors enter the evidence chain.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '允许双方补充说明',
                    labelEn: 'Permit both accounts',
                    outcomeZh: '说明自愿且各自署名。',
                    outcomeEn: 'Explanations are optional and separately signed.',
                    resultZh: '多重视角获得平等位置。',
                    resultEn: 'Multiple views receive equal placement.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '暂停依赖影子的判决',
                    labelEn: 'Suspend shadow-based judgment',
                    outcomeZh: '旧规则进入紧急复核。',
                    outcomeEn: 'The old rule enters emergency review.',
                    resultZh: '错误标准停止继续伤害。',
                    resultEn: 'The faulty standard stops causing harm.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '承认无法确定动作',
                    labelEn: 'Record the action unresolved',
                    outcomeZh: '卷宗保留未知结论。',
                    outcomeEn: 'The file keeps an unresolved finding.',
                    resultZh: '法庭不再强迫唯一答案。',
                    resultEn: 'The court no longer forces one answer.',
                    axis: 'curiosity',
                    route: 'archive-route'
                })]
            }), scene({
                speaker: 'chime',
                introZh: '一名证人的影子拒绝进入公开直播画面。',
                introEn: 'A witness’s shadow refuses to enter the public broadcast.',
                promptZh: '审理怎样继续而不惩罚隐私选择？',
                promptEn: 'How can the hearing continue without punishing privacy?',
                options: [o({
                    labelZh: '关闭直播保留庭内记录',
                    labelEn: 'Close the stream, keep court record',
                    outcomeZh: '公众推送立即停止。',
                    outcomeEn: 'Public broadcast stops immediately.',
                    resultZh: '审理权不再依赖曝光。',
                    resultEn: 'The right to be heard no longer depends on exposure.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '投影匿名轮廓',
                    labelEn: 'Use an anonymous silhouette',
                    outcomeZh: '画面不含可识别动作。',
                    outcomeEn: 'The view contains no identifying motion.',
                    resultZh: '最小公开满足旁听需求。',
                    resultEn: 'Minimal disclosure supports observation.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '审计直播访问日志',
                    labelEn: 'Audit stream access',
                    outcomeZh: '异常下载请求被阻断。',
                    outcomeEn: 'An abnormal download request is blocked.',
                    resultZh: '隐私风险留下可追溯证据。',
                    resultEn: 'Privacy risk leaves traceable evidence.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '举报后封存影像',
                    labelEn: 'Seal footage after the report',
                    outcomeZh: '录像变成受限证物。',
                    outcomeEn: 'The recording becomes restricted evidence.',
                    resultZh: '举报不会降低证词权重。',
                    resultEn: 'Reporting does not reduce testimony weight.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '提供纯文字陈述',
                    labelEn: 'Offer a text-only statement',
                    outcomeZh: '证人自行确认最终文字。',
                    outcomeEn: 'The witness approves the final text.',
                    resultZh: '表达获得无影像入口。',
                    resultEn: 'Expression gains a nonvisual entrance.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '影子庭采用双时间线、匿名陈述和可保留未知的判决。',
        'The shadow court adopts dual timelines, anonymous statements, and findings that may remain unresolved.',
        '晚半拍的合法证词', 'The Valid Testimony Half a Beat Late',
        '动作差异有了环境解释，拒绝直播也不会损害被听见的权利。',
        'Motion differences gain environmental context, and refusing broadcast cannot harm the right to be heard.', {
            text: b('守望者关闭自己的旁听摄像头，并把操作写进公开日志。',
                'The watcher disables their gallery camera and records the action publicly.'
                ),
            title: b('先关掉的旁听镜头', 'The Gallery Camera Switched Off First'),
            body: b('这项选择只缩小可见范围，不影响案件、证词或后续邀请。',
                'This choice narrows visibility only; it changes no case, testimony, or later invitation.'
                )
        }), ep('paper-moon-workshop', '纸月工坊', 'Paper Moon Workshop', 'ori', 'courier', [
            scene({
                speaker: 'ori',
                introZh: '工坊折出一轮纸月，却发现背胶会复制制作人的手写便签。',
                introEn: 'The workshop folds a paper moon whose adhesive copies its maker’s handwritten notes.',
                promptZh: '怎样保留月亮而清除意外复制？',
                promptEn: 'How can the moon remain while accidental copies are removed?',
                options: [o({
                    labelZh: '更换无记录背胶',
                    labelEn: 'Use memoryless adhesive',
                    outcomeZh: '新胶只固定纸层。',
                    outcomeEn: 'The new adhesive only binds paper.',
                    resultZh: '制作工具停止采集文字。',
                    resultEn: 'The craft tool stops collecting text.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '列出所有已复制位置',
                    labelEn: 'Map every copied note',
                    outcomeZh: '检查表找到四处残留。',
                    outcomeEn: 'The checklist finds four remnants.',
                    resultZh: '清理范围完整可复核。',
                    resultEn: 'Cleanup scope becomes fully reviewable.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '由制作者决定哪些保留',
                    labelEn: 'Let the maker choose retention',
                    outcomeZh: '便签逐张获得同意状态。',
                    outcomeEn: 'Each note gains a consent state.',
                    resultZh: '控制权回到原作者。',
                    resultEn: 'Control returns to the original writer.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '销毁无法安全分离的层',
                    labelEn: 'Destroy inseparable layers',
                    outcomeZh: '问题纸浆进入封闭回收。',
                    outcomeEn: 'The affected pulp enters closed recycling.',
                    resultZh: '隐私高于成品完整。',
                    resultEn: 'Privacy outranks artifact completeness.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '从空白纸重新制作',
                    labelEn: 'Rebuild from blank paper',
                    outcomeZh: '新月没有旧文字痕迹。',
                    outcomeEn: 'The new moon carries no prior writing.',
                    resultZh: '重新开始不会失去配方解锁。',
                    resultEn: 'Starting again loses no recipe unlock.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'courier',
                introZh: '展台想给每轮纸月标出唯一正确的折法。',
                introEn: 'The display wants one correct fold assigned to every paper moon.',
                promptZh: '工坊应怎样呈现不同结构？',
                promptEn: 'How should the workshop present different structures?',
                options: [o({
                    labelZh: '展示五种稳定折法',
                    labelEn: 'Show five stable folds',
                    outcomeZh: '每种月形各有承重说明。',
                    outcomeEn: 'Each moon shape lists its load limit.',
                    resultZh: '差异以能力而非名次展示。',
                    resultEn: 'Difference appears as capability, not rank.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '公开失败折痕样本',
                    labelEn: 'Display failed creases',
                    outcomeZh: '破裂原因进入教学墙。',
                    outcomeEn: 'Break causes enter the teaching wall.',
                    resultZh: '失败不再被成品历史删除。',
                    resultEn: 'Failure is no longer removed from craft history.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '保留无说明自由桌',
                    labelEn: 'Keep an instruction-free table',
                    outcomeZh: '访客可以只玩纸张。',
                    outcomeEn: 'Visitors may simply explore paper.',
                    resultZh: '参与不要求追求作品。',
                    resultEn: 'Participation requires no finished artifact.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '撤下唯一正确奖牌',
                    labelEn: 'Remove the one-right-way medal',
                    outcomeZh: '奖牌被改造成普通垫片。',
                    outcomeEn: 'The medal becomes a plain spacer.',
                    resultZh: '权威符号停止制造等级。',
                    resultEn: 'The authority symbol stops creating rank.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '让作者命名自己的结构',
                    labelEn: 'Let makers name structures',
                    outcomeZh: '命名可匿名也可留白。',
                    outcomeEn: 'Names may be anonymous or blank.',
                    resultZh: '创作身份保持自愿。',
                    resultEn: 'Creative identity remains optional.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '纸月工坊更换无记录背胶，并让五种折法并列展出。',
        'The workshop replaces copying adhesive and displays five folds side by side.',
        '没有偷走便签的纸月', 'The Paper Moon That Steals No Notes',
        '配方、失败和自由折叠都被保存，作者可以署名也可以保持空白。',
        'Recipes, failures, and free folding remain archived; makers may sign or stay blank.'
        ), ep('uncharted-zoo', '未绘星兽园', 'The Uncharted Star Zoo', 'vale', 'patience', [
            scene({
                speaker: 'vale',
                introZh: '园方按预测性格给星兽分笼，温顺标签锁住了最爱奔跑的一只。',
                introEn: 'The zoo pens star creatures by predicted temperament, trapping its fastest runner under tame.',
                promptZh: '第一道错误围栏应怎样处理？',
                promptEn: 'What should happen to the first faulty enclosure?',
                options: [o({
                    labelZh: '打开通往奔跑场的门',
                    labelEn: 'Open the running-field gate',
                    outcomeZh: '星兽自行决定是否离笼。',
                    outcomeEn: 'The creature decides whether to leave.',
                    resultZh: '标签不再控制可达空间。',
                    resultEn: 'Labels no longer control reachable space.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '删除性格预测档案',
                    labelEn: 'Delete temperament predictions',
                    outcomeZh: '记录只保留观察事实。',
                    outcomeEn: 'Records keep observations only.',
                    resultZh: '推测不再成为权限依据。',
                    resultEn: 'Inference no longer determines permission.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '让兽群选择同伴',
                    labelEn: 'Let creatures choose companions',
                    outcomeZh: '围栏改成可开合通道。',
                    outcomeEn: 'Pens become optional passages.',
                    resultZh: '关系由参与者建立。',
                    resultEn: 'Relationships form through participants.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '拆除伤害性的锁',
                    labelEn: 'Remove the harmful lock',
                    outcomeZh: '锁芯退出全部笼门。',
                    outcomeEn: 'The lock type leaves every enclosure.',
                    resultZh: '危险控制不会换名保留。',
                    resultEn: 'Dangerous control is not kept under a new name.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '设置不分类栖息区',
                    labelEn: 'Create an unclassified habitat',
                    outcomeZh: '未知星兽获得安全水源。',
                    outcomeEn: 'Unknown creatures gain safe water.',
                    resultZh: '未定义不再失去照护。',
                    resultEn: 'Being undefined no longer loses care.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'patience',
                introZh: '游客投票想让最受欢迎的星兽获得双倍食物。',
                introEn: 'Visitors vote to give the most popular creature twice the food.',
                promptZh: '园方该如何回应人气分配？',
                promptEn: 'How should the zoo answer popularity-based feeding?',
                options: [o({
                    labelZh: '按营养需要供食',
                    labelEn: 'Feed by nutritional need',
                    outcomeZh: '兽医表替代票数。',
                    outcomeEn: 'Veterinary charts replace votes.',
                    resultZh: '照护不再由观众喜好决定。',
                    resultEn: 'Care no longer follows audience preference.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '把投票改成虚构吉祥物',
                    labelEn: 'Vote on fictional mascots',
                    outcomeZh: '真实星兽退出竞赛。',
                    outcomeEn: 'Real creatures leave the contest.',
                    resultZh: '游戏不再改变生命资源。',
                    resultEn: 'Play no longer alters living resources.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '公开票数偏差',
                    labelEn: 'Publish voting bias',
                    outcomeZh: '入口位置造成的优势被测出。',
                    outcomeEn: 'Entrance placement bias is measured.',
                    resultZh: '人气数据失去客观外衣。',
                    resultEn: 'Popularity data loses its objective disguise.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '停止整场投票',
                    labelEn: 'Stop the contest',
                    outcomeZh: '投票终端显示取消原因。',
                    outcomeEn: 'Voting terminals show the cancellation reason.',
                    resultZh: '果断停止保护资源公平。',
                    resultEn: 'A decisive stop protects resource fairness.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许星兽避开游客',
                    labelEn: 'Offer visitor-free habitats',
                    outcomeZh: '安静区不装直播镜头。',
                    outcomeEn: 'Quiet habitats contain no stream cameras.',
                    resultZh: '被观看不再是获得照护的条件。',
                    resultEn: 'Being watched no longer conditions care.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '星兽园移除性格笼和人气配食，建立不分类与不被观看的栖息区。',
        'The zoo removes temperament pens and popularity feeding, creating unclassified and visitor-free habitats.',
        '自己选择奔跑方向的星兽', 'The Star Creature That Chooses Where to Run',
        '照护依据需要而非标签或票数；未知、安静和离群都拥有安全位置。',
        'Care follows need instead of labels or votes; unknown, quiet, and solitary states all have safe places.', {
            text: b('守望者把自己的游客票换成一袋由兽医分配的普通饲料。',
                'The watcher exchanges their visitor ballot for ordinary feed allocated by the veterinarian.'
                ),
            title: b('不参与人气投票的票根', 'The Stub That Cast No Popularity Vote'),
            body: b('它记录一次退出竞赛的选择，不会给任何星兽增加或减少资源。',
                'It records opting out of a contest and changes no creature’s resources.'
                )
        }), ep('constellation-surgery', '星座修复室', 'Constellation Surgery', 'chime',
        'tessera', [scene({
            speaker: 'chime',
            introZh: '修复室想把断裂星线接回旧图，却发现两颗星已经选择不同星群。',
            introEn: 'The repair room plans to restore a broken line, but both stars have chosen new constellations.',
            promptZh: '旧连接应得到怎样的修复？',
            promptEn: 'What repair should the old connection receive?',
            options: [o({
                labelZh: '保留断线并写明原因',
                labelEn: 'Keep the break with context',
                outcomeZh: '断点获得清楚注释。',
                outcomeEn: 'The break gains a clear annotation.',
                resultZh: '结束不再被误写成损坏。',
                resultEn: 'An ending is no longer mislabeled damage.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '画成历史虚线',
                labelEn: 'Draw a historical dotted line',
                outcomeZh: '旧关系可见但不传输信号。',
                outcomeEn: 'The old relation remains visible but carries no signal.',
                resultZh: '记忆与当前权限分离。',
                resultEn: 'Memory separates from current permission.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '询问两颗星是否重连',
                labelEn: 'Ask both stars about reconnection',
                outcomeZh: '任何一方拒绝都会停止。',
                outcomeEn: 'Either refusal stops the process.',
                resultZh: '连接需要双向同意。',
                resultEn: 'Connection requires mutual consent.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拆除自动焊接臂',
                labelEn: 'Remove the auto-welder',
                outcomeZh: '机械臂退出修复轨道。',
                outcomeEn: 'The robot leaves the repair rail.',
                resultZh: '系统不能替参与者恢复关系。',
                resultEn: 'The system cannot restore relationships for participants.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '为新星群增加入口',
                labelEn: 'Add entrances to new groups',
                outcomeZh: '两颗星无需返回旧图。',
                outcomeEn: 'Neither star must return to the old map.',
                resultZh: '成长不再被旧档案阻塞。',
                resultEn: 'Growth is no longer blocked by an old archive.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        }), scene({
            speaker: 'tessera',
            introZh: '一条实验星线能提高亮度，却会隐藏两端的独立名称。',
            introEn: 'An experimental line increases brightness but hides both endpoint names.',
            promptZh: '是否值得用身份换取更亮星图？',
            promptEn: 'Is a brighter map worth trading away identity?',
            options: [o({
                labelZh: '拒绝隐藏名称的增亮',
                labelEn: 'Reject identity-hiding brightness',
                outcomeZh: '实验线保持断开。',
                outcomeEn: 'The experimental line stays disconnected.',
                resultZh: '可见度不再高于身份边界。',
                resultEn: 'Visibility no longer outranks identity boundaries.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '测试不改名的替代线',
                labelEn: 'Test a name-safe line',
                outcomeZh: '新材料保持两端标签。',
                outcomeEn: 'New material preserves endpoint labels.',
                resultZh: '创新通过边界而非绕过边界。',
                resultEn: 'Innovation works through boundaries, not around them.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让两端各控自己的亮度',
                labelEn: 'Give each endpoint control',
                outcomeZh: '独立滑杆不覆盖对方。',
                outcomeEn: 'Independent sliders cannot overwrite each other.',
                resultZh: '合作不再要求统一曝光。',
                resultEn: 'Cooperation no longer requires uniform exposure.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '封存危险实验线',
                labelEn: 'Seal the harmful prototype',
                outcomeZh: '样本进入只读安全柜。',
                outcomeEn: 'The prototype enters read-only custody.',
                resultZh: '危险能力不能在前端重启。',
                resultEn: 'The dangerous capability cannot restart from the client.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '接受较暗但可署名的图',
                labelEn: 'Choose a dimmer named chart',
                outcomeZh: '星图保留完整端点。',
                outcomeEn: 'The chart keeps both endpoints intact.',
                resultZh: '清楚来源胜过视觉热度。',
                resultEn: 'Clear provenance beats visual popularity.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        })], '修复室把断线改为历史虚线，并封存会隐藏端点身份的增亮材料。',
        'The repair room turns old breaks into historical dotted lines and seals material that hides endpoint identity.',
        '不自动焊回的星线', 'The Star Line That Does Not Reattach Itself',
        '结束、重连与新星群都保有独立状态；更亮不再意味着更正确。',
        'Ending, reconnection, and new groups retain separate states; brighter no longer means more correct.'
        ), ep('rumor-telescope', '传闻望远镜', 'Rumor Telescope', 'courier', 'flora', [
    scene({
            speaker: 'courier',
            introZh: '望远镜把重复最多的传闻放大成看似清晰的星面。',
            introEn: 'The telescope enlarges the most repeated rumor into an apparently clear stellar surface.',
            promptZh: '第一幅高热度影像该怎样标注？',
            promptEn: 'How should the first high-volume image be labeled?',
            options: [o({
                labelZh: '标成未经证实',
                labelEn: 'Mark it unverified',
                outcomeZh: '红框覆盖清晰度幻觉。',
                outcomeEn: 'A red frame counters the illusion of clarity.',
                resultZh: '重复次数不再冒充证据。',
                resultEn: 'Repetition no longer impersonates evidence.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '追溯最早来源',
                labelEn: 'Trace the earliest source',
                outcomeZh: '路径终点是匿名猜测板。',
                outcomeEn: 'The chain ends at an anonymous speculation board.',
                resultZh: '来源质量进入投影。',
                resultEn: 'Source quality enters the projection.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '并列可信观测',
                labelEn: 'Show verified observations beside it',
                outcomeZh: '测量值拥有独立面板。',
                outcomeEn: 'Measurements receive a separate panel.',
                resultZh: '事实不用与传闻争夺同一栏。',
                resultEn: 'Facts need not compete in the rumor column.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '停止传播伤害影像',
                labelEn: 'Stop the harmful image',
                outcomeZh: '分享按钮被服务端撤销。',
                outcomeEn: 'The server removes sharing capability.',
                resultZh: '危险内容不能靠客户端绕过。',
                resultEn: 'Dangerous content cannot bypass through the client.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '保留未知而不补图',
                labelEn: 'Leave the surface unknown',
                outcomeZh: '星面回到模糊状态。',
                outcomeEn: 'The surface returns to blur.',
                resultZh: '没有答案优于虚假清晰。',
                resultEn: 'No answer is better than false clarity.',
                axis: 'curiosity',
                route: 'archive-route'
            })]
        }), scene({
            speaker: 'flora',
            introZh: '一条更正消息传播很慢，系统准备删除它以保持版面整齐。',
            introEn: 'A correction travels slowly, and the system plans to delete it for a tidy feed.',
            promptZh: '怎样让更正获得长期可达性？',
            promptEn: 'How should the correction remain reachable?',
            options: [o({
                labelZh: '固定更正在原传闻旁',
                labelEn: 'Pin correction beside rumor',
                outcomeZh: '两条记录永久关联。',
                outcomeEn: 'Both records remain linked permanently.',
                resultZh: '错误不能脱离后续修正。',
                resultEn: 'The error cannot detach from its correction.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '保存更正传播路径',
                labelEn: 'Archive correction reach',
                outcomeZh: '慢速节点逐一可查。',
                outcomeEn: 'Slow nodes become individually visible.',
                resultZh: '传播速度不再决定价值。',
                resultEn: 'Reach speed no longer determines value.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '邀请社区共同核验',
                labelEn: 'Invite community verification',
                outcomeZh: '每项证据独立署源。',
                outcomeEn: 'Each evidence item keeps its source.',
                resultZh: '协作不等于多数投票。',
                resultEn: 'Collaboration does not equal majority vote.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '冻结拒绝更正的账号',
                labelEn: 'Freeze the blocking relay',
                outcomeZh: '中继只能读取等待审查。',
                outcomeEn: 'The relay becomes read-only pending review.',
                resultZh: '果断限制阻止继续误导。',
                resultEn: 'A decisive restriction stops further deception.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供只看已核验模式',
                labelEn: 'Offer verified-only viewing',
                outcomeZh: '用户自己选择信息入口。',
                outcomeEn: 'Users choose their information entrance.',
                resultZh: '可见性控制回到读者。',
                resultEn: 'Visibility control returns to readers.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '传闻望远镜把热度与证据分开，并将每条更正固定在原错误旁。',
        'The rumor telescope separates volume from evidence and pins every correction beside its error.',
        '重新变模糊的星面', 'The Stellar Surface Allowed to Blur Again',
        '未知状态、来源路径和慢速更正都比虚假清晰更长久。',
        'Unknown state, provenance paths, and slow corrections outlast false clarity.', {
            text: b('守望者撤回自己转发过的一条未核验星讯，并保留更正链接。',
                'The watcher retracts an unverified star notice they shared and preserves its correction link.'
                ),
            title: b('带着更正留下的撤回', 'A Retraction That Keeps Its Correction'),
            body: b('撤回不会删除审计历史，也不会要求读者原谅或继续关注。',
                'The retraction deletes no audit history and asks no reader to forgive or keep following.'
                )
        }), ep('gravity-library', '重力图书馆', 'Gravity Library', 'patience', 'bell', [
            scene({
                speaker: 'patience',
                introZh: '最常借阅的书变得最重，低层读者无法从高架取下。',
                introEn: 'Frequently borrowed books become heaviest and unreachable from upper shelves.',
                promptZh: '图书馆怎样恢复平等取阅？',
                promptEn: 'How should the library restore equal access?',
                options: [o({
                    labelZh: '把重书移到可达层',
                    labelEn: 'Move heavy books down',
                    outcomeZh: '升降台完成安全搬运。',
                    outcomeEn: 'A lift completes safe relocation.',
                    resultZh: '人气不再制造物理门槛。',
                    resultEn: 'Popularity no longer creates a physical barrier.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '提供等内容轻量副本',
                    labelEn: 'Offer lightweight equivalents',
                    outcomeZh: '副本保留版本与来源。',
                    outcomeEn: 'Copies keep version and provenance.',
                    resultZh: '可达副本不是次等内容。',
                    resultEn: 'Accessible copies are not lesser content.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '研究借阅与重量关系',
                    labelEn: 'Study the weight rule',
                    outcomeZh: '日志显示算法人为加重。',
                    outcomeEn: 'Logs reveal algorithmic weighting.',
                    resultZh: '机制来源进入公开档案。',
                    resultEn: 'The mechanism source enters public archive.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '关闭增重装置',
                    labelEn: 'Disable the gravity engine',
                    outcomeZh: '新借阅不再改变质量。',
                    outcomeEn: 'New loans no longer change mass.',
                    resultZh: '有害反馈循环当场结束。',
                    resultEn: 'The harmful feedback loop ends immediately.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许预约桌面送达',
                    labelEn: 'Offer desk delivery',
                    outcomeZh: '请求不需说明身体情况。',
                    outcomeEn: 'Requests need no health explanation.',
                    resultZh: '辅助入口不收集敏感理由。',
                    resultEn: 'The access path collects no sensitive reason.',
                    axis: 'trust',
                    route: 'beacon-route'
                })]
            }), scene({
                speaker: 'bell',
                introZh: '一本无人借阅的书轻到不断飘离目录桌。',
                introEn: 'An unread book grows so light it floats away from the catalog desk.',
                promptZh: '怎样让冷门书保持可发现？',
                promptEn: 'How should an unpopular book remain discoverable?',
                options: [o({
                    labelZh: '加上不改变内容的书锚',
                    labelEn: 'Use a neutral book anchor',
                    outcomeZh: '软带固定封面而不贴热度标签。',
                    outcomeEn: 'A soft strap secures the cover without a popularity label.',
                    resultZh: '低借阅不再等于不稳定资格。',
                    resultEn: 'Low borrowing no longer means unstable eligibility.',
                    axis: 'trust',
                    route: 'beacon-route'
                }), o({
                    labelZh: '设置随机探索书架',
                    labelEn: 'Create a random discovery shelf',
                    outcomeZh: '轮换不考虑历史点击。',
                    outcomeEn: 'Rotation ignores prior clicks.',
                    resultZh: '发现机会脱离热度循环。',
                    resultEn: 'Discovery leaves the popularity loop.',
                    axis: 'curiosity',
                    route: 'archive-route'
                }), o({
                    labelZh: '邀请读者建立主题路径',
                    labelEn: 'Invite thematic paths',
                    outcomeZh: '小众书能进入多个自选路线。',
                    outcomeEn: 'The book joins several reader-made routes.',
                    resultZh: '社区连接不要求多数认可。',
                    resultEn: 'Community linking needs no majority approval.',
                    axis: 'harmony',
                    route: 'constellation-route'
                }), o({
                    labelZh: '移除零借阅自动下架',
                    labelEn: 'Delete zero-loan removal',
                    outcomeZh: '保留策略立即生效。',
                    outcomeEn: 'The retention rule takes effect immediately.',
                    resultZh: '无人阅读不再触发消失。',
                    resultEn: 'Being unread no longer triggers disappearance.',
                    axis: 'courage',
                    route: 'brave-route'
                }), o({
                    labelZh: '允许书保持安静收藏',
                    labelEn: 'Permit quiet preservation',
                    outcomeZh: '馆藏无需主动推荐。',
                    outcomeEn: 'The collection needs no active promotion.',
                    resultZh: '存在不再依赖注意力。',
                    resultEn: 'Existence no longer depends on attention.',
                    axis: 'harmony',
                    route: 'constellation-route'
                })]
            })
        ], '重力馆关闭热度增重与零借阅下架，并提供平等副本和安静保存。',
        'The gravity library disables popularity weight and zero-loan removal while offering equal copies and quiet preservation.',
        '不会因无人阅读而飘走的书', 'The Book That Will Not Float Away Unread',
        '热门书重新可达，冷门书也无需争取注意力来保住位置。',
        'Popular books become reachable, and quiet books need not compete for attention to keep a place.'
        ), ep('aurora-bridge', '极光长桥', 'Aurora Bridge', 'tessera', 'lumen', [scene({
            speaker: 'tessera',
            introZh: '桥面只在两岸同时在线时出现，任何一次离线都会让行人坠入等待层。',
            introEn: 'The bridge appears only while both shores are online, and any disconnect drops travelers into waiting.',
            promptZh: '怎样让极光桥容忍真实断线？',
            promptEn: 'How should Aurora Bridge tolerate real disconnects?',
            options: [o({
                labelZh: '保存每位行人检查点',
                labelEn: 'Save traveler checkpoints',
                outcomeZh: '重连从最后安全板恢复。',
                outcomeEn: 'Reconnect resumes at the last safe tile.',
                resultZh: '离线不再重置进度。',
                resultEn: 'Offline time no longer resets progress.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '建立单人备用步道',
                labelEn: 'Build a solo fallback path',
                outcomeZh: '同伴离线时仍能安全返回。',
                outcomeEn: 'A traveler may return safely while a partner is offline.',
                resultZh: '协作不再成为困住人的条件。',
                resultEn: 'Cooperation no longer becomes a trap.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '记录缺失事件序号',
                labelEn: 'Track missing sequences',
                outcomeZh: '恢复只补拉断线区间。',
                outcomeEn: 'Recovery fetches only the missing interval.',
                resultZh: '断线恢复拥有可验证边界。',
                resultEn: 'Reconnect gains a verifiable boundary.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '停止会坠落的旧协议',
                labelEn: 'Retire the falling protocol',
                outcomeZh: '危险桥版永久下线。',
                outcomeEn: 'The dangerous bridge version retires permanently.',
                resultZh: '旧语义不能复活。',
                resultEn: 'The old semantics cannot reactivate.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '允许任何一岸主动离房',
                labelEn: 'Allow either shore to leave',
                outcomeZh: '退出将行人送回各自入口。',
                outcomeEn: 'Leaving returns travelers to their own entrances.',
                resultZh: '离房不会扣除关系。',
                resultEn: 'Leaving deducts no relationship.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'lumen',
            introZh: '桥灯试图广播每位行人的当前步伐和下一步预测。',
            introEn: 'Bridge lights try to broadcast every traveler’s current pace and predicted next step.',
            promptZh: '公开投影应该保留什么？',
            promptEn: 'What should the public projection retain?',
            options: [o({
                labelZh: '只显示有人在桥上',
                labelEn: 'Show occupancy only',
                outcomeZh: '身份和步伐保持隐藏。',
                outcomeEn: 'Identity and pace stay hidden.',
                resultZh: 'presence缩到最低必要信息。',
                resultEn: 'Presence shrinks to minimum necessary data.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '由行人选择可见昵称',
                labelEn: 'Let travelers choose a visible alias',
                outcomeZh: '匿名模式随时可切换。',
                outcomeEn: 'Anonymous mode remains switchable.',
                resultZh: '公开身份成为自愿字段。',
                resultEn: 'Public identity becomes optional.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '审计预测数据来源',
                labelEn: 'Audit prediction inputs',
                outcomeZh: '系统承认使用过往步长。',
                outcomeEn: 'The system admits using prior stride data.',
                resultZh: '隐藏画像进入删除流程。',
                resultEn: 'Hidden profiling enters deletion workflow.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '关闭下一步预测',
                labelEn: 'Disable next-step prediction',
                outcomeZh: '桥灯只照安全板。',
                outcomeEn: 'Lights illuminate safe tiles only.',
                resultZh: '未来行动不再泄露。',
                resultEn: 'Future action no longer leaks.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '安静时段不推送presence',
                labelEn: 'Suppress quiet-hour presence',
                outcomeZh: '状态持久但不实时广播。',
                outcomeEn: 'State persists without live broadcast.',
                resultZh: '安静模式拥有完整功能。',
                resultEn: 'Quiet mode keeps full functionality.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '极光桥新增检查点、单人退路和最小presence，旧坠落协议永久退役。',
        'Aurora Bridge gains checkpoints, solo retreat, and minimal presence while the falling protocol retires permanently.',
        '断线后仍在原位的桥板', 'The Bridge Tile That Remains After Disconnect',
        '序号与检查点保存进度；离线、离房和安静时段都不会成为关系惩罚。',
        'Sequence and checkpoints preserve progress; offline, leaving, and quiet hours never become relationship penalties.', {
            text: b('守望者先关闭自己的步伐广播，只留下桥端的一盏安全灯。',
                'The watcher disables their own pace broadcast first and leaves one safety light at the bridge end.'
                ),
            title: b('不预测下一步的桥灯', 'The Bridge Light That Predicts No Next Step'),
            body: b('这盏灯只标出口；它不知道也不会猜测你接下来往哪边走。',
                'This light marks an exit only; it neither knows nor guesses where you go next.'
                )
        }), ep('meteor-shelter', '流星避难所', 'Meteor Shelter', 'flora', 'sora', [scene({
            speaker: 'flora',
            introZh: '避难所按游戏排名分配最厚护盾，低分玩家只得到警报。',
            introEn: 'The shelter allocates its strongest shields by game rank, leaving low scorers only alarms.',
            promptZh: '防护资源应怎样重新分配？',
            promptEn: 'How should protection be reallocated?',
            options: [o({
                labelZh: '按当前威胁程度',
                labelEn: 'Allocate by current threat',
                outcomeZh: '受冲击区先获得护盾。',
                outcomeEn: 'Impact zones receive shields first.',
                resultZh: '安全资源脱离游戏成绩。',
                resultEn: 'Safety resources leave game scores.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '保证每区最低护盾',
                labelEn: 'Guarantee a shield floor',
                outcomeZh: '所有入口达到安全基线。',
                outcomeEn: 'Every entrance reaches a safety baseline.',
                resultZh: '协作不再牺牲弱势区域。',
                resultEn: 'Cooperation no longer sacrifices weaker zones.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '审计排名接线原因',
                labelEn: 'Audit the ranking link',
                outcomeZh: '旧设计文件暴露营销决定。',
                outcomeEn: 'Old design notes reveal a marketing choice.',
                resultZh: '不当来源被永久记录。',
                resultEn: 'The improper source is recorded permanently.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '切断分数数据接口',
                labelEn: 'Sever the score feed',
                outcomeZh: '护盾控制器停止读取游戏表。',
                outcomeEn: 'Shield controls stop reading game tables.',
                resultZh: '危险耦合立即消失。',
                resultEn: 'The dangerous coupling disappears immediately.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供无需账户的入口',
                labelEn: 'Offer account-free shelter',
                outcomeZh: '访客可直接进入安全区。',
                outcomeEn: 'Visitors enter safety without accounts.',
                resultZh: '保护不要求身份或资格。',
                resultEn: 'Protection requires no identity or eligibility.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'sora',
            introZh: '警报系统把一次演习误写成真实灾害，并准备永久标记参与者。',
            introEn: 'The alarm mislabels a drill as disaster and plans permanent participant flags.',
            promptZh: '怎样纠正事件又保留审计？',
            promptEn: 'How should the event be corrected while retaining audit history?',
            options: [o({
                labelZh: '追加演习更正事件',
                labelEn: 'Append a drill correction',
                outcomeZh: '原记录保持只读并链接更正。',
                outcomeEn: 'The original stays read-only and links to correction.',
                resultZh: '历史可追溯且当前状态正确。',
                resultEn: 'History remains traceable and current state becomes correct.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '清除个人灾害标记',
                labelEn: 'Clear participant flags',
                outcomeZh: '账户不再携带错误风险标签。',
                outcomeEn: 'Accounts lose the false risk labels.',
                resultZh: '修复删除不当画像。',
                resultEn: 'Repair deletes improper profiling.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '比较警报来源凭证',
                labelEn: 'Compare alarm credentials',
                outcomeZh: '演习签名与真实源不同。',
                outcomeEn: 'Drill signatures differ from real sources.',
                resultZh: '可信事件边界得到证明。',
                resultEn: 'The trusted-event boundary is proven.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '冻结误报适配器',
                labelEn: 'Freeze the faulty adapter',
                outcomeZh: '适配器等待人工复核。',
                outcomeEn: 'The adapter awaits manual review.',
                resultZh: '错误源不能继续写入。',
                resultEn: 'The faulty source cannot write further.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '向参与者展示完整纠正',
                labelEn: 'Show participants the correction',
                outcomeZh: '安全投影不含他人身份。',
                outcomeEn: 'The safe projection contains no other identities.',
                resultZh: '透明修复尊重隐私。',
                resultEn: 'Transparent repair respects privacy.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '流星避难所切断游戏排名，并用追加更正修复演习误报与个人标签。',
        'The shelter severs game ranking and uses an appended correction to repair drill misclassification and personal flags.',
        '不看分数的共同护盾', 'The Shared Shield That Reads No Scores',
        '防护依据威胁与最低保障；演习、游戏和身份不再改变安全资格。',
        'Protection follows threat and minimum guarantees; drills, games, and identity no longer alter safety eligibility.'
        ), ep('star-name-commons', '星名公地', 'Star-Name Commons', 'bell', 'mika', [scene({
            speaker: 'bell',
            introZh: '公地发现同一颗星被三种语言命名，管理员要求只保留最常用的一种。',
            introEn: 'The commons finds one star named in three languages, and an administrator demands only the most common remain.',
            promptZh: '名字冲突应怎样保存？',
            promptEn: 'How should the naming conflict be preserved?',
            options: [o({
                labelZh: '并列三种名称',
                labelEn: 'Keep all three names',
                outcomeZh: '入口按语言独立可搜。',
                outcomeEn: 'Each language remains independently searchable.',
                resultZh: '多数使用不再删除少数名称。',
                resultEn: 'Majority use no longer deletes minority names.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '记录每个名称来源',
                labelEn: 'Record every origin',
                outcomeZh: '年代与社群各自署名。',
                outcomeEn: 'Dates and communities keep attribution.',
                resultZh: '来源比统一排名更重要。',
                resultEn: 'Provenance outranks unified ranking.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '允许用户选择显示名',
                labelEn: 'Let viewers choose display names',
                outcomeZh: '偏好只影响个人视图。',
                outcomeEn: 'Preference affects personal view only.',
                resultZh: '自定义不覆盖公共档案。',
                resultEn: 'Customization does not overwrite the commons.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '拒绝删除命令',
                labelEn: 'Reject the deletion order',
                outcomeZh: '管理员请求进入审计队列。',
                outcomeEn: 'The admin request enters audit review.',
                resultZh: '果断拒绝保护不可逆历史。',
                resultEn: 'A decisive refusal protects irreversible history.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '增加未命名别名入口',
                labelEn: 'Add an unnamed alias',
                outcomeZh: '无需名称也能访问坐标。',
                outcomeEn: 'Coordinates remain reachable without a name.',
                resultZh: '命名不再是存在门槛。',
                resultEn: 'Naming is no longer a gate to existence.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'mika',
            introZh: '一次公众投票想把败选星名标成错误答案。',
            introEn: 'A public vote wants losing star names labeled wrong answers.',
            promptZh: '公地应该怎样解释投票结果？',
            promptEn: 'How should the commons explain the vote?',
            options: [o({
                labelZh: '标注为显示偏好票',
                labelEn: 'Label it display preference',
                outcomeZh: '票数不改变有效名称集合。',
                outcomeEn: 'Votes do not change the valid-name set.',
                resultZh: '偏好与事实被分开。',
                resultEn: 'Preference separates from fact.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '公开参与范围',
                labelEn: 'Publish participation scope',
                outcomeZh: '缺席社群不会被算入同意。',
                outcomeEn: 'Absent communities are not counted as consent.',
                resultZh: '统计边界清楚可见。',
                resultEn: 'Statistical boundaries become visible.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '提供各社群独立首页',
                labelEn: 'Offer community home views',
                outcomeZh: '入口共享底层坐标。',
                outcomeEn: 'Home views share the underlying coordinate.',
                resultZh: '多种呈现可以和平共存。',
                resultEn: 'Multiple presentations can coexist peacefully.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '撤销错误答案标签',
                labelEn: 'Remove wrong-answer badges',
                outcomeZh: '败选名恢复中性状态。',
                outcomeEn: 'Nonwinning names return to neutral status.',
                resultZh: '竞争不再伤害历史合法性。',
                resultEn: 'Competition no longer harms historical legitimacy.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '停止未来淘汰式投票',
                labelEn: 'End eliminative polls',
                outcomeZh: '新投票只能选择个人显示。',
                outcomeEn: 'Future polls affect personal display only.',
                resultZh: '共同档案不再由热度删改。',
                resultEn: 'The commons can no longer be edited by popularity.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '星名公地保留多语言名称、未命名入口和个人显示偏好，淘汰式投票永久停止。',
        'The Star-Name Commons keeps multilingual names, unnamed access, and personal display preferences while eliminative voting ends permanently.',
        '没有败选名字的星图', 'The Star Chart Without Losing Names',
        '投票可以表达显示偏好，却不能把任何有来源的名称改成错误。',
        'Voting may express display preference but cannot turn any sourced name into an error.', {
            text: b('守望者把自己曾提议的星名移到普通别名栏，不申请置顶。',
                'The watcher moves a name they proposed into the ordinary alias list and requests no priority.'
                ),
            title: b('不占据首位的提名', 'The Nomination That Takes No First Place'),
            body: b('它与其他名称同样可查，也同样可以不被任何人选作显示名。',
                'It is as searchable as every other name and equally optional as a display choice.'
                )
        }), ep('relay-four', '四号中继站', 'Relay Four', 'keeper', 'courier', [scene({
            speaker: 'keeper',
            introZh: '四号站准备把五季档案压缩成一个最佳结论以节省空间。',
            introEn: 'Relay Four plans to compress five seasons into one best conclusion to save space.',
            promptZh: '如何扩容而不牺牲路线历史？',
            promptEn: 'How should capacity grow without sacrificing route history?',
            options: [o({
                labelZh: '增加不可变季快照',
                labelEn: 'Add immutable season snapshots',
                outcomeZh: '每季内容拥有独立哈希。',
                outcomeEn: 'Each season gains its own hash.',
                resultZh: '旧运行永远按绑定版本恢复。',
                resultEn: 'Old runs always resume their bound version.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '拆分索引与正文存储',
                labelEn: 'Separate index from content',
                outcomeZh: '轻索引指向完整档案。',
                outcomeEn: 'A light index points to full archives.',
                resultZh: '可达性不要求复制或删除。',
                resultEn: 'Reachability needs neither copying nor deletion.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让各路线保留入口',
                labelEn: 'Keep an entrance per route',
                outcomeZh: '五种结局都出现在大厅。',
                outcomeEn: 'All five conclusions remain in the hall.',
                resultZh: '多数路线不吞掉少数结局。',
                resultEn: 'Major routes do not consume minority conclusions.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '拒绝破坏性压缩',
                labelEn: 'Reject destructive compression',
                outcomeZh: '删除任务从调度器移除。',
                outcomeEn: 'The deletion job leaves the scheduler.',
                resultZh: '不可逆捷径被果断禁止。',
                resultEn: 'The irreversible shortcut is decisively forbidden.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '归档冷数据但不失效',
                labelEn: 'Archive cold data without expiry',
                outcomeZh: '旧内容可按需安全加载。',
                outcomeEn: 'Old content loads safely on demand.',
                resultZh: '不活跃不再等于可清除。',
                resultEn: 'Inactive no longer means disposable.',
                axis: 'trust',
                route: 'beacon-route'
            })]
        }), scene({
            speaker: 'keeper',
            introZh: '新站想把所有解锁改成赛季结束即失效的临时通行证。',
            introEn: 'The new relay wants every unlock to expire when a season ends.',
            promptZh: '长期成果应采用什么状态机？',
            promptEn: 'What state machine should lasting results use?',
            options: [o({
                labelZh: '已得解锁永久保留',
                labelEn: 'Keep earned unlocks permanent',
                outcomeZh: '赛季归档不修改持有状态。',
                outcomeEn: 'Season archive does not alter ownership.',
                resultZh: '收藏免受轮换影响。',
                resultEn: 'Collections remain safe from rotation.',
                axis: 'trust',
                route: 'beacon-route'
            }), o({
                labelZh: '区分可见与已拥有',
                labelEn: 'Separate visibility from ownership',
                outcomeZh: '目录轮换只改变发现入口。',
                outcomeEn: 'Catalog rotation changes discovery only.',
                resultZh: '隐藏不再等于撤销。',
                resultEn: 'Hidden no longer means revoked.',
                axis: 'curiosity',
                route: 'archive-route'
            }), o({
                labelZh: '让用户主动整理展柜',
                labelEn: 'Let users arrange showcases',
                outcomeZh: '六个槽位不改变库存。',
                outcomeEn: 'Six slots do not alter inventory.',
                resultZh: '表达和所有权独立存在。',
                resultEn: 'Expression and ownership remain independent.',
                axis: 'harmony',
                route: 'constellation-route'
            }), o({
                labelZh: '删除到期回收工作器',
                labelEn: 'Remove the expiry worker',
                outcomeZh: '后台不再触碰已得记录。',
                outcomeEn: 'Background work no longer touches earned records.',
                resultZh: 'FOMO机制从系统中退出。',
                resultEn: 'The FOMO mechanism leaves the system.',
                axis: 'courage',
                route: 'brave-route'
            }), o({
                labelZh: '提供完整季节归档页',
                labelEn: 'Provide a season archive page',
                outcomeZh: '历史结局和收藏只读可查。',
                outcomeEn: 'Past conclusions and collections remain readable.',
                resultZh: '结束之后仍能安全回看。',
                resultEn: 'The ending remains safely revisitable.',
                axis: 'harmony',
                route: 'constellation-route'
            })]
        })], '四号站采用不可变季快照、永久解锁和非破坏归档，拒绝最佳结论压缩。',
        'Relay Four adopts immutable season snapshots, permanent unlocks, and nondestructive archive while rejecting best-ending compression.',
        '不会过期的野星档案钥匙', 'The Wild-Star Archive Key That Never Expires',
        '旧运行、少数结局和已得收藏都能在轮换后恢复，且不需要重新购买。',
        'Old runs, minority conclusions, and earned collections remain recoverable after rotation without repurchase.'
        )],
    endingRouter: b('野星档案拒绝把自由轨道压成单一答案，四号站根据持久关系轴开放五条共存路线。',
        'The wild-star archive refuses to compress free orbits into one answer, and Relay Four opens five coexisting routes from lasting axes.'
        ),
    endings: [{
        id: 'archive-of-wild-stars.ending.constellation',
        key: 'constellation',
        route: 'wild.ending.constellation',
        priority: 50,
        condition: {
            op: 'axis',
            axis: 'harmony',
            minimum: 16
        },
        text: b('无中心星图让多种名称、轨道与群组并列存在，每颗星自己选择连接。',
            'The centerless chart holds many names, orbits, and groups while each star chooses connection.'
            )
    }, {
        id: 'archive-of-wild-stars.ending.beacon',
        key: 'beacon',
        route: 'wild.ending.beacon',
        priority: 40,
        condition: {
            op: 'axis',
            axis: 'trust',
            minimum: 16
        },
        text: b('极光桥只承诺安全出口与可靠恢复，从不要求两岸持续在线。',
            'Aurora Bridge promises safe exit and reliable recovery, never constant presence on both shores.'
            )
    }, {
        id: 'archive-of-wild-stars.ending.archive',
        key: 'archive',
        route: 'wild.ending.archive',
        priority: 30,
        condition: {
            op: 'axis',
            axis: 'curiosity',
            minimum: 16
        },
        text: b('多版本档案保存错误、更正和未知分类，不用整齐交换真实。',
            'The multiversion archive keeps errors, corrections, and unknown classes without trading truth for neatness.'
            )
    }, {
        id: 'archive-of-wild-stars.ending.brave',
        key: 'brave',
        route: 'wild.ending.brave',
        priority: 20,
        condition: {
            op: 'axis',
            axis: 'courage',
            minimum: 16
        },
        text: b('野星保护队切断排名、强制焊接与破坏压缩，给自由轨道留下空间。',
            'The wild-star guard severs ranking, forced welding, and destructive compression to protect free orbits.'
            )
    }, {
        id: 'archive-of-wild-stars.ending.hearth',
        key: 'hearth',
        route: 'wild.ending.hearth',
        priority: 1,
        condition: {
            op: 'always'
        },
        text: b('重力馆为安静书与未命名星保留位置，不要求被看见才算存在。',
            'The gravity library keeps places for quiet books and unnamed stars without requiring attention for existence.'
            )
    }]
};
for (const current of source.episodes) {
    const additions = deepening[current.slug];
    if (!Array.isArray(additions) || additions.length !== 2) {
        throw new TypeError(`Season Four deepening is incomplete for ${current.slug}`);
    }
    current.scenes.push(...additions);
}
module.exports = compileAuthoredSeason(source);