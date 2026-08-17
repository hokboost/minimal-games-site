'use strict';

const cases = {
    'missing-lantern': {
        evidence: [['watch-log', '零点值班簿写着灯塔仍在东堤。', 'The midnight log places the beacon on the east pier.'], ['salt-scrape', '西滑轨留下当夜新鲜盐痕。', 'Fresh salt scratches mark the west rail.'], ['calm-meter', '风速仪整夜未超过一级。', 'The wind meter stayed below force one.'], ['cart-wheel', '维修车左轮沾有东堤红漆。', 'The repair cart’s left wheel carries east-pier red paint.']],
        suspects: [['keeper', '值班守灯人', 'watch keeper'], ['mechanic', '维修员', 'mechanic'], ['tide-cart', '自动潮汐车', 'automatic tide cart']],
        solutionLinks: [['watch-log', 'cart-wheel'], ['salt-scrape', 'cart-wheel']], falseLinks: [['calm-meter', 'watch-log']], contradictions: [['watch-log', 'salt-scrape']], culprit: 2
    },
    'silent-greenhouse': {
        evidence: [['alarm-test', '警铃测试在闭馆后被切到维护模式。', 'The alarm was switched to maintenance after closing.'], ['north-pollen', '北门把手上有蓝银花粉。', 'Blue-silver pollen coats the north handle.'], ['boot-print', '灌溉靴印停在控制柜前。', 'Irrigation boot prints stop at the control cabinet.'], ['watering-log', '自动浇水比计划提前九分钟。', 'Automatic watering ran nine minutes early.']],
        suspects: [['botanist', '夜班植物师', 'night botanist'], ['irrigation-tech', '灌溉技师', 'irrigation technician'], ['courier', '种子快递员', 'seed courier']],
        solutionLinks: [['alarm-test', 'boot-print'], ['boot-print', 'watering-log']], falseLinks: [['north-pollen', 'watering-log']], contradictions: [['alarm-test', 'north-pollen']], culprit: 1
    },
    'borrowed-melody': {
        evidence: [['piano-cache', '钢琴终端缓存记录了一次本地导出。', 'The piano terminal cached one local export.'], ['tablet-clock', '平板时钟慢了十一分钟。', 'The tablet clock ran eleven minutes slow.'], ['cable-fiber', '练习室门缝夹着一根数据纤维。', 'A data fiber was caught beneath the rehearsal-room door.'], ['composer-note', '作曲者只把尾奏写在纸上。', 'The composer kept the coda on paper only.']],
        suspects: [['arranger', '编曲助理', 'arranging assistant'], ['stage-tech', '舞台技术员', 'stage technician'], ['sync-daemon', '离线同步程序', 'offline sync daemon']],
        solutionLinks: [['piano-cache', 'cable-fiber'], ['tablet-clock', 'piano-cache']], falseLinks: [['composer-note', 'tablet-clock']], contradictions: [['composer-note', 'piano-cache']], culprit: 2
    },
    'clockwork-letter': {
        evidence: [['noon-gear', '正午齿轮有近期上油痕迹。', 'The noon gear was oiled recently.'], ['paper-stock', '纸条来自楼下修复室的棉纸。', 'The notes use rag paper from the restoration room.'], ['sealed-hinge', '外壳铅封从未断裂。', 'The case’s lead seal was never broken.'], ['floor-chute', '底座与旧通风管相连。', 'The base connects to an old ventilation duct.']],
        suspects: [['curator', '钟表馆员', 'clock curator'], ['restorer', '纸品修复师', 'paper restorer'], ['building-system', '楼宇投递装置', 'building delivery mechanism']],
        solutionLinks: [['paper-stock', 'floor-chute'], ['noon-gear', 'floor-chute']], falseLinks: [['sealed-hinge', 'noon-gear']], contradictions: [['sealed-hinge', 'paper-stock']], culprit: 2
    },
    'ferry-without-shadow': {
        evidence: [['camera-loop', '监控画面每四十七秒重复一只海鸥。', 'The camera repeats one gull every forty-seven seconds.'], ['tide-chain', '航道封链的盐壳完整。', 'Salt crust on the channel chain is intact.'], ['dock-vibration', '靠岸时段没有记录到震动。', 'No docking vibration was recorded.'], ['projector-heat', '旧候船厅投影机仍有余温。', 'The old terminal projector was still warm.']],
        suspects: [['captain', '渡船船长', 'ferry captain'], ['archivist', '影像档案员', 'video archivist'], ['memorial-projector', '纪念影像系统', 'memorial projection system']],
        solutionLinks: [['camera-loop', 'projector-heat'], ['tide-chain', 'dock-vibration']], falseLinks: [['camera-loop', 'tide-chain']], contradictions: [['camera-loop', 'dock-vibration']], culprit: 2
    },
    'blue-ink-footprints': {
        evidence: [['ink-bottle', '蓝墨瓶口没有鞋底纤维。', 'The blue ink bottle holds no sole fibers.'], ['ceiling-drip', '天花轨道滴下同配方蓝墨。', 'The ceiling rail drips the same blue ink.'], ['robot-pad', '归档机器人清洁垫呈脚掌形。', 'The archive robot’s cleaning pad is foot-shaped.'], ['door-sensor', '档案门整夜只记录机器人权限。', 'The archive door recorded only robot clearance.']],
        suspects: [['researcher', '访客研究员', 'visiting researcher'], ['clerk', '夜班文员', 'night clerk'], ['archive-robot', '归档机器人', 'archive robot']],
        solutionLinks: [['ceiling-drip', 'robot-pad'], ['robot-pad', 'door-sensor']], falseLinks: [['ink-bottle', 'door-sensor']], contradictions: [['ink-bottle', 'ceiling-drip']], culprit: 2
    },
    'vanishing-applause': {
        evidence: [['page-turn', '录音里翻页后有一段超低频振动。', 'A subsonic vibration follows the page turn.'], ['seat-dust', '座椅灰尘没有被观众扰动。', 'Seat dust was undisturbed by an audience.'], ['acoustic-panel', '后墙声学板被调到延迟回放。', 'The rear acoustic panel was set to delayed playback.'], ['rehearsal-score', '乐谱标注了模拟观众声部。', 'The score marks a simulated audience part.']],
        suspects: [['actor', '独自排练的演员', 'solo actor'], ['sound-tech', '音响师', 'sound technician'], ['acoustic-system', '自适应声场系统', 'adaptive acoustic system']],
        solutionLinks: [['page-turn', 'acoustic-panel'], ['acoustic-panel', 'rehearsal-score']], falseLinks: [['seat-dust', 'rehearsal-score']], contradictions: [['seat-dust', 'page-turn']], culprit: 2
    },
    'wrong-moon-map': {
        evidence: [['tide-table', '潮汐数值与三十年前档案完全一致。', 'The tide values exactly match a chart from thirty years ago.'], ['moon-symbol', '月相符号来自废止的教学字体。', 'The moon symbol uses a retired teaching font.'], ['printer-band', '绘图机墨带含旧档案纸纤维。', 'The plotter ribbon contains old archive fibers.'], ['observer-log', '观测员当夜没有提交月面数据。', 'The observer submitted no lunar data that night.']],
        suspects: [['observer', '新任观测员', 'new observer'], ['teacher', '天文教师', 'astronomy teacher'], ['archive-import', '旧图导入程序', 'legacy chart importer']],
        solutionLinks: [['tide-table', 'printer-band'], ['moon-symbol', 'printer-band']], falseLinks: [['observer-log', 'moon-symbol']], contradictions: [['observer-log', 'tide-table']], culprit: 2
    },
    'sealed-tea-room': {
        evidence: [['warm-cup', '杯底温度从管道侧向中心递减。', 'Heat decreases from the pipe side toward the cup center.'], ['table-vent', '桌脚内藏有维修通风管。', 'A service vent runs inside the table leg.'], ['tea-aroma', '杯中只有香气凝胶，没有茶水。', 'The cup contains aroma gel, not tea.'], ['seal-photo', '封签照片与现场编号一致。', 'Seal photographs match the scene numbers.']],
        suspects: [['host', '茶室主人', 'tea-room host'], ['inspector', '封存检查员', 'seal inspector'], ['climate-system', '展陈恒温系统', 'display climate system']],
        solutionLinks: [['warm-cup', 'table-vent'], ['table-vent', 'tea-aroma']], falseLinks: [['seal-photo', 'tea-aroma']], contradictions: [['warm-cup', 'seal-photo']], culprit: 2
    },
    'radio-in-snow': {
        evidence: [['snow-antenna', '积雪把断裂天线补成临时回路。', 'Snow bridges the broken antenna into a temporary circuit.'], ['forecast-cache', '机内缓存比播出时间早一天下载。', 'The forecast cache downloaded a day before broadcast.'], ['battery-cold', '低温让备用电池电压恢复到启动阈值。', 'Cold raises the reserve battery to its startup threshold.'], ['voice-print', '播报声来自公共气象合成器。', 'The voice belongs to the public weather synthesizer.']],
        suspects: [['hiker', '路过的徒步者', 'passing hiker'], ['meteorologist', '退休气象员', 'retired meteorologist'], ['weather-cache', '自动气象缓存', 'automatic weather cache']],
        solutionLinks: [['snow-antenna', 'battery-cold'], ['forecast-cache', 'voice-print']], falseLinks: [['snow-antenna', 'voice-print']], contradictions: [['forecast-cache', 'battery-cold']], culprit: 2
    },
    'mirror-passenger': {
        evidence: [['mirror-angle', '车窗夹层会把对面车厢映到空座。', 'The window laminate reflects the opposite carriage onto an empty seat.'], ['conductor-route', '列车员巡检时始终背对对面车厢。', 'The conductor faced away from the opposite carriage during checks.'], ['seat-sensor', '压力传感器校准正常。', 'Seat pressure sensors were calibrated correctly.'], ['ticket-scan', '对应时段只有对面车厢一张票。', 'Only one ticket was scanned in the opposite carriage.']],
        suspects: [['passenger', '未登记乘客', 'unlisted passenger'], ['conductor', '疲劳列车员', 'tired conductor'], ['window-reflection', '车窗叠影', 'window reflection']],
        solutionLinks: [['mirror-angle', 'conductor-route'], ['mirror-angle', 'ticket-scan']], falseLinks: [['seat-sensor', 'conductor-route']], contradictions: [['seat-sensor', 'ticket-scan']], culprit: 2
    },
    'orchard-key': {
        evidence: [['alloy-test', '钥匙合金确实来自旧铸坊。', 'The key alloy comes from the old foundry.'], ['lock-core', '锁芯最近被换成复古规格。', 'The lock core was recently replaced with a heritage pattern.'], ['invoice', '更换单写着“匹配果园旧钥匙”。', 'The invoice says “match the orchard key.”'], ['soil-mark', '钥匙上的泥来自仓库门槛。', 'Soil on the key matches the storehouse threshold.']],
        suspects: [['gardener', '果园管理员', 'orchard keeper'], ['locksmith', '修锁匠', 'locksmith'], ['heritage-project', '遗产修复项目', 'heritage restoration project']],
        solutionLinks: [['lock-core', 'invoice'], ['alloy-test', 'invoice']], falseLinks: [['soil-mark', 'alloy-test']], contradictions: [['alloy-test', 'lock-core']], culprit: 2
    },
    'torn-weather-flag': {
        evidence: [['tear-angle', '撕口先向西延伸，末端才翻向东。', 'The tear began westward before its tip flipped east.'], ['gust-buffer', '仪器只记录十秒平均风向。', 'The instrument records ten-second average direction.'], ['mast-wake', '钟塔会制造一秒钟反向涡流。', 'The clock tower creates a one-second reverse eddy.'], ['thread-fatigue', '旗布西侧纤维已经老化。', 'Fibers on the west edge were fatigued.']],
        suspects: [['forecaster', '天气记录员', 'weather recorder'], ['groundskeeper', '场地管理员', 'groundskeeper'], ['tower-eddy', '钟塔涡流', 'clock-tower eddy']],
        solutionLinks: [['gust-buffer', 'mast-wake'], ['tear-angle', 'thread-fatigue']], falseLinks: [['tear-angle', 'mast-wake']], contradictions: [['tear-angle', 'gust-buffer']], culprit: 2
    },
    'library-tide': {
        evidence: [['salt-pattern', '盐线只出现在通风口正下方。', 'Salt lines appear only beneath air vents.'], ['humidifier', '海洋展览加湿器误接到高层风管。', 'The maritime exhibit humidifier was connected to upper vents.'], ['basement-meter', '地下室湿度记录稳定。', 'Basement humidity remained stable.'], ['book-edge', '盐分从书页上缘向下沉积。', 'Salt settled downward from upper page edges.']],
        suspects: [['plumber', '管道工', 'plumber'], ['librarian', '馆藏管理员', 'collections librarian'], ['exhibit-humidifier', '展览加湿器', 'exhibit humidifier']],
        solutionLinks: [['salt-pattern', 'humidifier'], ['humidifier', 'book-edge']], falseLinks: [['basement-meter', 'book-edge']], contradictions: [['basement-meter', 'salt-pattern']], culprit: 2
    },
    'empty-bell-tower': {
        evidence: [['bell-spectrum', '钟声缺少真实撞击的高频峰。', 'The bell sound lacks a real strike’s high-frequency peak.'], ['speaker-wire', '旧报时喇叭仍接着备用电源。', 'The old chime speaker remains on backup power.'], ['clapper-crate', '拆下的钟锤封条完好。', 'The removed clapper crate remains sealed.'], ['schedule-chip', '控制芯片保留旧班表。', 'The controller chip retains the old schedule.']],
        suspects: [['caretaker', '钟塔看守', 'tower caretaker'], ['tour-guide', '导览员', 'tour guide'], ['chime-controller', '报时控制器', 'chime controller']],
        solutionLinks: [['bell-spectrum', 'speaker-wire'], ['speaker-wire', 'schedule-chip']], falseLinks: [['clapper-crate', 'schedule-chip']], contradictions: [['clapper-crate', 'bell-spectrum']], culprit: 2
    },
    'double-booking': {
        evidence: [['divider-track', '活动隔墙昨晚展开到位。', 'The movable divider was fully deployed.'], ['door-labels', '两扇门临时贴了同一房间号。', 'Both doors temporarily carried the same room number.'], ['acoustic-test', '隔墙降噪达到演出标准。', 'The divider met performance-grade isolation.'], ['booking-map', '预约图没有显示隔墙配置。', 'The booking map omitted the divider layout.']],
        suspects: [['scheduler', '排期员', 'scheduler'], ['stage-manager', '舞台经理', 'stage manager'], ['partition-system', '可变隔墙系统', 'movable partition system']],
        solutionLinks: [['divider-track', 'acoustic-test'], ['door-labels', 'booking-map']], falseLinks: [['divider-track', 'booking-map']], contradictions: [['door-labels', 'booking-map']], culprit: 2
    },
    'amber-message': {
        evidence: [['amber-resonance', '琥珀内部有一枚微型压电裂隙。', 'A tiny piezoelectric fissure sits inside the amber.'], ['display-base', '展座每天播放语音导览测试。', 'The display base runs a daily audio-guide test.'], ['voice-match', '留言与导览员当天试音一致。', 'The message matches the guide’s sound check.'], ['age-test', '琥珀本体年代鉴定无误。', 'The amber’s age test is authentic.']],
        suspects: [['guide', '语音导览员', 'audio guide'], ['collector', '藏品捐赠者', 'collection donor'], ['resonant-display', '共振展座', 'resonant display base']],
        solutionLinks: [['amber-resonance', 'display-base'], ['display-base', 'voice-match']], falseLinks: [['age-test', 'voice-match']], contradictions: [['age-test', 'amber-resonance']], culprit: 2
    },
    'north-platform': {
        evidence: [['clock-pulse', '站钟漏掉一次维护同步脉冲。', 'The station clock missed one maintenance sync pulse.'], ['ticket-server', '车票时间来自中央服务器。', 'Ticket time comes from the central server.'], ['platform-camera', '列车实际停靠七分钟。', 'Platform video shows a seven-minute stop.'], ['maintenance-log', '同步器在列车到达前重启。', 'The clock synchronizer rebooted before arrival.']],
        suspects: [['driver', '列车司机', 'train driver'], ['dispatcher', '调度员', 'dispatcher'], ['clock-sync', '站钟同步器', 'station clock synchronizer']],
        solutionLinks: [['clock-pulse', 'maintenance-log'], ['ticket-server', 'platform-camera']], falseLinks: [['clock-pulse', 'platform-camera']], contradictions: [['clock-pulse', 'ticket-server']], culprit: 2
    },
    'paper-constellation': {
        evidence: [['paper-watermark', '画纸来自观测站儿童开放日。', 'The paper came from the observatory family day.'], ['projector-dust', '穹顶投影机曾加载测试星群。', 'The dome projector loaded a test cluster.'], ['child-route', '孩子参观路线经过测试穹顶。', 'The child’s tour passed through the test dome.'], ['discovery-log', '正式发现记录晚于开放日三周。', 'The formal discovery came three weeks after the visit.']],
        suspects: [['child', '画画的孩子', 'the child artist'], ['astronomer', '发现者', 'discovering astronomer'], ['test-projection', '测试投影', 'test projection']],
        solutionLinks: [['paper-watermark', 'child-route'], ['projector-dust', 'child-route']], falseLinks: [['discovery-log', 'paper-watermark']], contradictions: [['discovery-log', 'projector-dust']], culprit: 2
    },
    'archive-at-dawn': {
        evidence: [['sun-prism', '东窗棱镜只在日出时照亮墙缝。', 'The east-window prism lights a wall seam only at sunrise.'], ['case-marks', '旧案照片都带同一枚棱镜反光。', 'Cold-case photos share the same prism flare.'], ['floor-plan', '原始平面图在墙后标着小型校对室。', 'The original plan marks a proofing room behind the wall.'], ['registry-gap', '房间在一次编号调整中被漏登记。', 'The room vanished during a numbering change.']],
        suspects: [['archivist', '首席档案员', 'chief archivist'], ['architect', '旧馆建筑师', 'original architect'], ['lost-room', '漏登记的校对室', 'unregistered proofing room']],
        solutionLinks: [['sun-prism', 'case-marks'], ['floor-plan', 'registry-gap']], falseLinks: [['sun-prism', 'registry-gap']], contradictions: [['case-marks', 'registry-gap']], culprit: 2
    }
};

// Suspect order is deliberately authored per case. Keeping the non-human
// mechanism in one fixed position would turn the board into a position-guessing
// exercise even though every evidence graph is different.
const suspectOrders = Object.freeze({
    'missing-lantern': [2, 0, 1],
    'silent-greenhouse': [0, 2, 1],
    'borrowed-melody': [1, 0, 2],
    'clockwork-letter': [2, 1, 0],
    'ferry-without-shadow': [0, 1, 2],
    'blue-ink-footprints': [1, 2, 0],
    'vanishing-applause': [2, 0, 1],
    'wrong-moon-map': [1, 0, 2],
    'sealed-tea-room': [0, 2, 1],
    'radio-in-snow': [2, 1, 0],
    'mirror-passenger': [0, 1, 2],
    'orchard-key': [1, 2, 0],
    'torn-weather-flag': [2, 0, 1],
    'library-tide': [0, 2, 1],
    'empty-bell-tower': [1, 0, 2],
    'double-booking': [2, 1, 0],
    'amber-message': [0, 1, 2],
    'north-platform': [1, 2, 0],
    'paper-constellation': [2, 0, 1],
    'archive-at-dawn': [0, 2, 1]
});

for (const [caseId, order] of Object.entries(suspectOrders)) {
    const authored = cases[caseId];
    const originalCulprit = authored.culprit;
    authored.suspects = order.map(index => authored.suspects[index]);
    authored.culprit = order.indexOf(originalCulprit);
}

module.exports = Object.freeze(cases);
