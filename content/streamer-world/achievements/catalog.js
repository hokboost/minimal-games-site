'use strict';

const crypto = require('node:crypto');
const { stableStringify } = require('../../../lib/idempotency');
const { validateDefinition } = require('../../../domain/achievements/rules');

const rows = [
    ['first-harbor-light','第一束港灯','First Harbor Light','完成任意故事章节并留下首个不可变章节记录。','Complete any story episode and leave the first immutable episode record.','story.episode.completed',1,{},false,1,'harbor-light-pin'],
    ['twelve-episode-voyage','十二段航迹','Twelve-Episode Voyage','在同一季完成十二个不同章节。','Complete twelve distinct episodes in one season.','story.episode.completed',12,{},false,1,'twelve-route-chart'],
    ['choice-with-an-exit','先画出口','Choice With an Exit','提交一个保留退出权的持久剧情选择。','Commit a lasting story choice that preserves an exit.','story.choice.committed',1,{},false,1,'open-door-token'],
    ['quiet-owner-letter','安静来信','Quiet Owner Letter','在安静边界内保存一封不实时打扰的站主信件。','Persist an owner letter inside quiet boundaries without a live interruption.','story.owner_letter.persisted',1,{},true,1,'quiet-envelope'],
    ['season-one-archive','一号站归档','Relay One Archive','完成第一季并保留一个长期结局。','Complete Season One and retain a lasting conclusion.','story.season.completed',1,{season:'signal-between-us'},false,1,'relay-one-seal'],
    ['tide-reader','读懂归潮','Reader of Returning Tides','完成归潮季的一段章节航线。','Complete an episode route in Returning Tides.','story.episode.completed',1,{season:'tides-of-return'},false,2,'tide-reader-lens'],
    ['promise-bypass','承诺礁绕行者','Promise-Reef Bypass','在归潮剧情中保留不依赖旧承诺的路线。','Keep a Returning Tides route that does not depend on an old promise.','story.choice.committed',1,{season:'tides-of-return'},true,2,'releasable-knot'],
    ['relay-two-resumer','二号站恢复员','Relay Two Resumer','完成归潮季并保留可恢复会话结论。','Complete Returning Tides with a resumable-session conclusion.','story.season.completed',1,{season:'tides-of-return'},false,2,'relay-two-core'],
    ['borrowed-hour-return','归还借时','Return a Borrowed Hour','完成借时城的一段无时间债章节。','Complete a debt-free episode in Borrowed Hours.','story.episode.completed',1,{season:'city-of-borrowed-hours'},false,3,'returned-minute'],
    ['silence-owes-nothing','沉默不欠债','Silence Owes Nothing','在借时剧情中选择不把未回复写成债务。','Choose not to treat an unanswered message as debt in Borrowed Hours.','story.choice.committed',1,{season:'city-of-borrowed-hours'},true,3,'debt-free-charter'],
    ['city-clock-repaired','城市时钟修复','City Clock Repaired','完成借时季并保留无惩罚的时间节奏。','Complete Borrowed Hours with a penalty-free rhythm.','story.season.completed',1,{season:'city-of-borrowed-hours'},false,3,'erasable-calendar'],
    ['wild-star-witness','野星见证人','Wild-Star Witness','完成野星档案的一段非占有观测。','Complete a non-owning observation episode in Wild Stars.','story.episode.completed',1,{season:'archive-of-wild-stars'},false,4,'wild-star-index'],
    ['correction-kept-beside-error','更正紧邻错误','Correction Beside Error','在野星剧情中把更正与原错误长期关联。','Keep a correction linked to its original error in Wild Stars.','story.choice.committed',1,{season:'archive-of-wild-stars'},true,4,'correction-telescope'],
    ['relay-four-archivist','四号站档案员','Relay Four Archivist','完成野星季且不使用破坏性压缩。','Complete Wild Stars without destructive compression.','story.season.completed',1,{season:'archive-of-wild-stars'},false,4,'relay-four-key'],
    ['homeward-door','归家门','Homeward Door','完成归家星座的一段可离开路线。','Complete a leave-safe route in Homeward Constellation.','story.episode.completed',1,{season:'homeward-constellation'},false,5,'homeward-door-lamp'],
    ['earned-never-expires','已得永不过期','Earned Never Expires','选择保护已得收藏不受赛季轮换回收。','Choose to protect earned collections from season rotation.','story.choice.committed',1,{season:'homeward-constellation'},true,5,'evergreen-collection-mark'],
    ['relay-five-open','五号站开放','Relay Five Open','完成五号站并保留五种同等长期结论。','Complete Relay Five while keeping five equally valid conclusions.','story.season.completed',1,{season:'homeward-constellation'},false,5,'relay-five-map'],
    ['five-season-traveler','五季旅行者','Five-Season Traveler','每一季至少完成一个章节。','Complete at least one episode in every season.','story.episode.completed',5,{distinct:'season'},true,5,'five-season-compass'],
    ['sixty-episode-archive','六十集档案','Sixty-Episode Archive','完成五季全部六十集且不重复计算重玩。','Complete all sixty episodes without counting replay twice.','story.episode.completed',60,{distinct:'episode'},true,5,'complete-signal-atlas'],
    ['many-valid-endings','多种有效结局','Many Valid Endings','保留五个不同季节结局，任何一个都不是失败。','Retain five conclusions where none is a failure state.','story.season.completed',5,{distinct:'season'},true,5,'equal-ending-table'],

    ['constellation-first-repair','第一条修复线','First Repair Line','完成一次星图协修服务器结算。','Complete one server-settled Constellation Repair run.','game.run.completed',1,{gameId:'constellation-repair'},false,null,'repair-thread'],
    ['signal-duet-listener','双奏听音者','Signal Duet Listener','完成一次不信任客户端时间的信号双奏。','Complete one Signal Duet run without trusting client time.','game.run.completed',1,{gameId:'signal-duet'},false,null,'duet-metronome'],
    ['mystery-linker','证据连线员','Mystery Linker','完成一宗隐藏真相直到终局的谜案。','Complete a Mystery Board case whose solution stays hidden until terminal.','game.run.completed',1,{gameId:'mystery-board'},false,null,'evidence-cord'],
    ['story-weaver-card','接龙织卡者','Story Weaver Cardwright','完成一段只使用封闭原创卡片的故事接龙。','Complete Story Weaver using only closed authored cards.','game.run.completed',1,{gameId:'story-weaver'},false,null,'weaver-card'],
    ['studio-crafter','工坊制作人','Studio Crafter','完成一次材料守恒的制作与摆放。','Complete a conservation-safe craft and placement.','game.run.completed',1,{gameId:'studio-crafting'},false,null,'studio-shelf-pin'],
    ['meteor-defender','流星防线','Meteor Defender','完成一次主防线或单人替代流星守望。','Complete Meteor Defense through main defense or solo fallback.','game.run.completed',1,{gameId:'meteor-defense'},false,null,'meteor-shield'],
    ['daily-maze-walker','每日迷航者','Daily Maze Walker','完成一次按日期与身份确定的梦境迷宫。','Complete one deterministic daily Dream Maze.','game.run.completed',1,{gameId:'dream-maze'},false,null,'maze-compass'],
    ['trusted-bingo-card','可信宾果卡','Trusted Bingo Card','只通过已确认内部事件完成直播宾果。','Complete Broadcast Bingo only through confirmed internal events.','game.run.completed',1,{gameId:'broadcast-bingo'},false,null,'bingo-lantern'],
    ['echo-memory-keeper','回声记忆保管员','Echo Memory Keeper','完成一次不泄露搭档线索的回声默契。','Complete Echo Memory without leaking a partner’s clue.','game.run.completed',1,{gameId:'echo-memory'},false,null,'echo-pair-shell'],
    ['fictional-predictor','虚构猜心者','Fictional Predictor','完成一次只使用虚构偏好的守望者猜心局。','Complete Keeper Prediction using fictional preferences only.','game.run.completed',1,{gameId:'keeper-prediction'},false,null,'fictional-oracle-card'],
    ['gentle-game-tour','温和十局','Gentle Ten-Game Tour','以温和难度完成十种不同新玩法。','Complete all ten new games on gentle difficulty.','game.run.completed',10,{distinct:'gameId',difficulty:'gentle'},true,null,'gentle-game-ring'],
    ['standard-game-tour','标准十局','Standard Ten-Game Tour','以标准难度完成十种不同新玩法。','Complete all ten new games on standard difficulty.','game.run.completed',10,{distinct:'gameId',difficulty:'standard'},true,null,'standard-game-ring'],
    ['expert-game-tour','专家十局','Expert Ten-Game Tour','以专家难度完成十种不同新玩法。','Complete all ten new games on expert difficulty.','game.run.completed',10,{distinct:'gameId',difficulty:'expert'},true,null,'expert-game-ring'],
    ['solo-fallback-complete','单人替代完成','Solo Fallback Complete','在合作玩法中使用安全单人替代完成一局。','Finish a co-op-capable game through safe solo fallback.','game.run.completed',1,{mode:'solo'},true,null,'solo-fallback-token'],
    ['coop-with-an-exit','有出口的合作','Co-op With an Exit','完成一局双方始终拥有退出权的合作玩法。','Complete a co-op run where both participants retain exit rights.','game.run.completed',1,{mode:'coop'},true,null,'shared-exit-sign'],
    ['game-run-five','五局星环','Five-Run Orbit','完成五次不同可信run结算。','Complete five distinct trusted run settlements.','game.run.completed',5,{distinct:'runId'},false,null,'five-run-orbit'],
    ['game-run-twenty','二十局星环','Twenty-Run Orbit','完成二十次不同可信run结算。','Complete twenty distinct trusted run settlements.','game.run.completed',20,{distinct:'runId'},true,null,'twenty-run-orbit'],
    ['no-client-score','分数不由浏览器','Scores Are Not Browser-Written','完成一次服务端权威计分的玩法。','Complete a game with server-authoritative scoring.','game.run.completed',1,{authoritativeScore:true},true,null,'server-score-seal'],
    ['disconnect-resumer','断线恢复员','Disconnect Resumer','恢复一次绑定版本游戏并完成结算。','Resume a version-bound game and finish settlement.','game.run.completed',1,{resumed:true},true,null,'resume-sequence-card'],
    ['all-game-archives','十玩法归档','Ten-Game Archive','为十种玩法各保留一次不会改写的完成记录。','Retain one immutable completion record for each of ten games.','game.run.completed',10,{distinct:'gameId'},true,null,'ten-game-archive'],

    ['first-reviewed-quest','首个审核任务','First Reviewed Quest','完成第一项经过人工审核的V2任务。','Complete the first manually reviewed V2 quest.','quest.assignment.completed',1,{verification:'manual'},false,null,'reviewed-quest-mark'],
    ['first-trusted-quest','首个可信任务','First Trusted Quest','完成第一项只由可信事件推进的V2任务。','Complete the first V2 quest advanced only by a trusted event.','quest.assignment.completed',1,{verification:'automatic'},false,null,'trusted-quest-mark'],
    ['quest-chain-one','第一条任务链','First Quest Chain','完成一条多步骤任务链且保留各步事件。','Complete one multistep quest chain with every transition retained.','quest.chain.completed',1,{},false,null,'chain-link-one'],
    ['quest-chain-five','五条任务链','Five Quest Chains','完成五条不同任务链。','Complete five distinct quest chains.','quest.chain.completed',5,{distinct:'chain'},true,null,'chain-link-five'],
    ['weekly-board-one','第一周板','First Weekly Board','在当前有效周板完成一项自主选择任务。','Complete one freely chosen quest on the active weekly board.','quest.assignment.completed',1,{board:true},false,null,'weekly-board-pin'],
    ['neutral-decline-kept','中性拒绝保留','Neutral Decline Preserved','拒绝一项任务且不失去关系或奖励资格。','Decline a quest without losing relationship or reward eligibility.','quest.assignment.declined',1,{},true,null,'neutral-decline-card'],
    ['postpone-with-progress','延期不丢进度','Postpone Without Progress Loss','延期任务并保留已完成步骤。','Postpone a quest while retaining completed steps.','quest.assignment.postponed',1,{},true,null,'postpone-bookmark'],
    ['evidence-return-resubmit','证据退回再提交','Evidence Return and Resubmit','在有界保留策略内完成一次退回与重新提交。','Complete one evidence return and bounded resubmission.','quest.assignment.completed',1,{resubmitted:true},true,null,'resubmit-envelope'],
    ['quest-five-completions','五项任务成果','Five Quest Results','完成五项不同任务且来源不重复。','Complete five distinct quests with unique provenance.','quest.assignment.completed',5,{distinct:'assignmentId'},false,null,'five-quest-star'],
    ['quest-twenty-completions','二十项任务成果','Twenty Quest Results','完成二十项不同任务。','Complete twenty distinct quests.','quest.assignment.completed',20,{distinct:'assignmentId'},true,null,'twenty-quest-star'],
    ['quest-category-explorer','九类任务探索','Nine-Category Quest Explorer','在九种任务类别各完成一项。','Complete one quest in each of nine categories.','quest.assignment.completed',9,{distinct:'category'},true,null,'nine-category-wheel'],
    ['zero-point-meaning','无积分也有意义','Meaning Without Points','完成一项零积分但有长期内容意义的任务。','Complete a zero-point quest with lasting content meaning.','quest.assignment.completed',1,{rewardPoints:0},true,null,'meaning-only-token'],
    ['appeal-resolved','申诉得到处理','Appeal Resolved','完成一次不丢失审计历史的任务申诉处理。','Resolve a quest appeal without losing audit history.','quest.appeal.resolved',1,{},true,null,'appeal-resolution-mark'],
    ['retention-respected','保留期被尊重','Retention Respected','证据到期清除正文并保留hash与审核墓碑。','Redact expired evidence while retaining hash and review tombstone.','quest.evidence.redacted',1,{},true,null,'retention-tombstone'],
    ['quest-thirty-chain-nodes','三十链节点','Thirty Chain Nodes','完成三十个不同任务链节点。','Complete thirty distinct chain nodes.','quest.assignment.completed',30,{distinct:'chainNode'},true,null,'thirty-node-chart'],

    ['first-live-invitation','第一封结构化邀请','First Structured Invitation','接受或中性拒绝一封结构化互动邀请。','Accept or neutrally decline one structured interaction invite.','live.item.resolved',1,{},false,null,'structured-invite-card'],
    ['quiet-live-inbox','安静互动入箱','Quiet Live Inbox','在安静时段持久接收互动且不产生presence push。','Persist a quiet-hour interaction without a presence push.','live.item.persisted',1,{quiet:true},true,null,'quiet-live-lamp'],
    ['report-safety-path','举报安全路径','Report Safety Path','完成举报、审核和主动重新同意的安全路径。','Complete report, moderation, and voluntary reconsent safely.','live.report.reconsented',1,{},true,null,'reconsent-key'],
    ['poll-without-pressure','无压力投票','Poll Without Pressure','完成一次允许跳过且不改变关系的安全投票。','Resolve a skippable poll without relationship effects.','live.item.resolved',1,{type:'poll'},true,null,'optional-poll-pin'],
    ['consented-live-delivery','已同意实时送达','Consented Live Delivery','在不处于静音或安静时段时持久接收一项结构化互动。','Persist one structured interaction outside mute and quiet hours.','live.item.persisted',1,{muted:false,quiet:false},true,null,'consented-live-seal']
];

function achievement(row) {
    const [slug,titleZh,titleEn,descriptionZh,descriptionEn,eventType,target,filters,hidden,season,collectionKey] = row;
    const content = { slug, version: 1, titleZh, titleEn, descriptionZh, descriptionEn, eventType, target, filters, hidden, season, collectionKey };
    validateDefinition(content);
    return Object.freeze({ ...content, contentHash: crypto.createHash('sha256').update(stableStringify(content)).digest('hex') });
}

const ACHIEVEMENTS = Object.freeze(rows.map(achievement));
if (ACHIEVEMENTS.length !== 60 || new Set(ACHIEVEMENTS.map((item) => item.slug)).size !== 60
    || new Set(ACHIEVEMENTS.map((item) => item.titleZh)).size !== 60
    || new Set(ACHIEVEMENTS.map((item) => item.titleEn)).size !== 60) throw new Error('Achievement catalog count or uniqueness mismatch');

module.exports = { ACHIEVEMENTS };
