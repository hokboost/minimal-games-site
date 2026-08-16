'use strict';

const { ADVENTURE_CONFIG } = require('../configuration');
const { getChapter, getMissionCatalog } = require('./content');

class AdventureRuleError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'AdventureRuleError';
        this.code = code;
    }
}

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const isoTime = (now) => new Date(now).toISOString();
const isPlainRecord = (value) => Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function assertPlainObject(value, code = 'INVALID_ACTION') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new AdventureRuleError(code, 'Expected an object');
    }
    return value;
}

function createRun(chapterId, { now = Date.now() } = {}) {
    const chapter = getChapter(chapterId);
    if (!chapter) throw new AdventureRuleError('UNKNOWN_CHAPTER', 'Unknown adventure chapter');
    const state = {
        rulesVersion: ADVENTURE_CONFIG.contentVersion,
        chapterId: chapter.id,
        phase: 'active',
        revision: 0,
        stageIndex: 0,
        checkpointIndex: 0,
        hearts: ADVENTURE_CONFIG.maximumHearts,
        energy: 3,
        insight: 0,
        inventory: [],
        flags: {},
        attempts: {},
        history: [],
        feedback: null,
        startedAt: isoTime(now),
        stageStartedAt: isoTime(now),
        completedAt: null,
        stats: {
            correct: 0,
            incorrect: 0,
            choices: 0,
            rewinds: 0
        }
    };
    return validateRun(state);
}

function currentStage(state) {
    const chapter = getChapter(state.chapterId);
    return chapter?.stages[state.stageIndex] || null;
}

function normalizeText(value) {
    return String(value ?? '').trim().normalize('NFKC').toUpperCase();
}

function appendHistory(state, event) {
    const history = [...state.history, event];
    return history.slice(-ADVENTURE_CONFIG.maximumHistoryEntries);
}

function publicHistoryEntry(stage, outcome, detail) {
    return {
        stageId: stage.id,
        kind: stage.kind,
        outcome,
        detail: String(detail || '').slice(0, 180)
    };
}

function applyEffects(state, effects = {}) {
    const next = { ...state };
    if (Number.isSafeInteger(effects.energy)) next.energy = clamp(next.energy + effects.energy, 0, 10);
    if (Number.isSafeInteger(effects.insight)) next.insight = clamp(next.insight + effects.insight, 0, 10_000);
    if (typeof effects.item === 'string' && /^[a-z][a-z0-9-]{1,48}$/.test(effects.item)
        && !next.inventory.includes(effects.item)) {
        next.inventory = [...next.inventory, effects.item].slice(0, 20);
    }
    if (effects.flag && typeof effects.flag === 'object') {
        next.flags = { ...next.flags, [effects.flag.key]: Boolean(effects.flag.value) };
    }
    return next;
}

function evaluateAction(state, stage, action) {
    const command = assertPlainObject(action);
    const allowedKinds = new Map([
        ['narrative', 'continue'],
        ['quiz', 'answer'],
        ['boss', 'answer'],
        ['cipher', 'code'],
        ['memory', 'sequence'],
        ['choice', 'choose'],
        ['resource', 'choose'],
        ['multi', 'multi'],
        ['order', 'order'],
        ['matching', 'match'],
        ['path', 'path']
    ]);
    const expectedType = allowedKinds.get(stage.kind);
    if (command.type !== expectedType) {
        throw new AdventureRuleError('WRONG_ACTION_TYPE', `Stage expects ${expectedType}`);
    }

    if (stage.kind === 'narrative') {
        return { success: true, feedback: '故事继续向前。', points: 0 };
    }
    if (stage.kind === 'quiz' || stage.kind === 'boss') {
        if (!Number.isInteger(command.answer) || command.answer < 0 || command.answer >= stage.options.length) {
            throw new AdventureRuleError('INVALID_ANSWER', 'Answer index is invalid');
        }
        const success = command.answer === stage.answer;
        return {
            success,
            feedback: success ? '回答正确，星图亮起了一角。' : '这个答案没有通过机关，再观察一下线索。',
            points: success ? stage.points : 0
        };
    }
    if (stage.kind === 'cipher') {
        if (typeof command.code !== 'string'
            || command.code.length < 1
            || command.code.length > ADVENTURE_CONFIG.maximumActionValueLength) {
            throw new AdventureRuleError('INVALID_CODE', 'Cipher value is invalid');
        }
        const success = normalizeText(command.code) === normalizeText(stage.code);
        return {
            success,
            feedback: success ? '密码正确，机关已经解锁。' : `密码还不对。提示：${stage.hint}`,
            points: success ? stage.points : 0
        };
    }
    if (stage.kind === 'memory') {
        if (!Array.isArray(command.sequence)
            || command.sequence.length > ADVENTURE_CONFIG.maximumSequenceLength
            || command.sequence.some((entry) => typeof entry !== 'string' || entry.length > 48)) {
            throw new AdventureRuleError('INVALID_SEQUENCE', 'Memory sequence is invalid');
        }
        const success = command.sequence.length === stage.sequence.length
            && command.sequence.every((entry, index) => entry === stage.sequence[index]);
        return {
            success,
            feedback: success ? '顺序完全正确，记忆机关停止转动。' : '顺序不对，灯光重新亮起，请再记一次。',
            points: success ? stage.points : 0
        };
    }
    if (stage.kind === 'multi') {
        if (!Array.isArray(command.answers) || command.answers.length > stage.options.length
            || command.answers.some((answer) => !Number.isInteger(answer) || answer < 0 || answer >= stage.options.length)
            || new Set(command.answers).size !== command.answers.length) {
            throw new AdventureRuleError('INVALID_MULTI_ANSWER', 'Multi-select answer is invalid');
        }
        const submitted = [...command.answers].sort((a, b) => a - b);
        const expected = [...stage.answers].sort((a, b) => a - b);
        const success = submitted.length === expected.length
            && submitted.every((answer, index) => answer === expected[index]);
        return {
            success,
            feedback: success ? '多项判断全部正确。' : '至少有一个选项不符合条件，请重新核对。',
            points: success ? stage.points : 0
        };
    }
    if (stage.kind === 'order') {
        if (!Array.isArray(command.sequence) || command.sequence.length > ADVENTURE_CONFIG.maximumSequenceLength
            || command.sequence.some((entry) => typeof entry !== 'string' || entry.length > 48)
            || new Set(command.sequence).size !== command.sequence.length) {
            throw new AdventureRuleError('INVALID_ORDER', 'Ordering answer is invalid');
        }
        const success = command.sequence.length === stage.sequence.length
            && command.sequence.every((entry, index) => entry === stage.sequence[index]);
        return {
            success,
            feedback: success ? '顺序正确，流程已经恢复。' : '顺序还不能形成完整流程。',
            points: success ? stage.points : 0
        };
    }
    if (stage.kind === 'matching') {
        if (!isPlainRecord(command.pairs)
            || Object.keys(command.pairs).length > stage.left.length
            || Object.entries(command.pairs).some(([left, right]) => (
                typeof left !== 'string' || typeof right !== 'string'
                || left.length > 48 || right.length > 48
            ))) {
            throw new AdventureRuleError('INVALID_MATCHES', 'Matching answer is invalid');
        }
        const success = Object.keys(stage.pairs).length === Object.keys(command.pairs).length
            && Object.entries(stage.pairs).every(([left, right]) => command.pairs[left] === right);
        return {
            success,
            feedback: success ? '所有配对都已归位。' : '有一组配对不正确，请再检查。',
            points: success ? stage.points : 0
        };
    }
    if (stage.kind === 'path') {
        if (!Array.isArray(command.moves) || command.moves.length > stage.maxSteps
            || command.moves.some((move) => !['north', 'east', 'south', 'west'].includes(move))) {
            throw new AdventureRuleError('INVALID_PATH', 'Path answer is invalid');
        }
        const success = command.moves.length === stage.moves.length
            && command.moves.every((move, index) => move === stage.moves[index]);
        return {
            success,
            feedback: success ? '路线正确，你安全抵达了出口。' : '这条路线碰到了障碍，请回到起点规划。',
            points: success ? stage.points : 0
        };
    }

    if (typeof command.choiceId !== 'string' || command.choiceId.length > 64) {
        throw new AdventureRuleError('INVALID_CHOICE', 'Choice is invalid');
    }
    const choice = stage.choices.find((entry) => entry.id === command.choiceId);
    if (!choice) throw new AdventureRuleError('INVALID_CHOICE', 'Choice is not available');
    if (choice.requires?.energy && state.energy < choice.requires.energy) {
        throw new AdventureRuleError('NOT_ENOUGH_ENERGY', 'Not enough energy for this choice');
    }
    return {
        success: true,
        feedback: choice.feedback,
        points: 0,
        effects: choice.effects,
        choiceId: choice.id
    };
}

function failedAttempt(state, stage, result, now) {
    const remainingHearts = state.hearts - 1;
    const attempts = { ...state.attempts, [stage.id]: (state.attempts[stage.id] || 0) + 1 };
    const event = publicHistoryEntry(stage, 'incorrect', result.feedback);
    if (remainingHearts > 0) {
        return {
            ...state,
            revision: state.revision + 1,
            hearts: remainingHearts,
            attempts,
            feedback: { tone: 'warning', text: result.feedback },
            history: appendHistory(state, event),
            stats: { ...state.stats, incorrect: state.stats.incorrect + 1 }
        };
    }
    return {
        ...state,
        revision: state.revision + 1,
        stageIndex: state.checkpointIndex,
        hearts: ADVENTURE_CONFIG.maximumHearts,
        energy: Math.max(2, state.energy),
        attempts,
        feedback: { tone: 'rewind', text: '心力耗尽，星图将你送回最近的存档点。' },
        history: appendHistory(state, publicHistoryEntry(stage, 'rewind', '返回最近的存档点')),
        stageStartedAt: isoTime(now),
        stats: {
            ...state.stats,
            incorrect: state.stats.incorrect + 1,
            rewinds: state.stats.rewinds + 1
        }
    };
}

function successfulAttempt(state, chapter, stage, result, now) {
    let next = applyEffects(state, result.effects);
    const nextIndex = state.stageIndex + 1;
    const finished = nextIndex >= chapter.stages.length;
    const isChoice = stage.kind === 'choice' || stage.kind === 'resource';
    next = {
        ...next,
        phase: finished ? 'completed' : 'active',
        revision: state.revision + 1,
        stageIndex: nextIndex,
        checkpointIndex: finished
            ? state.checkpointIndex
            : (nextIndex > 0 && nextIndex % 5 === 0 ? nextIndex : state.checkpointIndex),
        insight: clamp(next.insight + (result.points || 0), 0, 10_000),
        feedback: {
            tone: finished ? 'complete' : 'success',
            text: finished ? '章节完成！奖励正在安全结算。' : result.feedback
        },
        history: appendHistory(state, publicHistoryEntry(
            stage,
            result.choiceId ? `choice:${result.choiceId}` : 'cleared',
            result.feedback
        )),
        stageStartedAt: isoTime(now),
        completedAt: finished ? isoTime(now) : null,
        stats: {
            ...state.stats,
            correct: state.stats.correct + (['quiz', 'boss', 'cipher', 'memory', 'multi', 'order', 'matching', 'path'].includes(stage.kind) ? 1 : 0),
            choices: state.stats.choices + (isChoice ? 1 : 0)
        }
    };
    return next;
}

function applyAction(inputState, action, { now = Date.now() } = {}) {
    const state = validateRun(inputState);
    if (state.phase !== 'active') {
        throw new AdventureRuleError('RUN_FINISHED', 'Adventure run is already complete');
    }
    const chapter = getChapter(state.chapterId);
    const stage = chapter.stages[state.stageIndex];
    const result = evaluateAction(state, stage, action);
    const next = result.success
        ? successfulAttempt(state, chapter, stage, result, now)
        : failedAttempt(state, stage, result, now);
    return validateRun(next);
}

function projectStage(stage, state) {
    if (!stage) return null;
    const base = { id: stage.id, kind: stage.kind, title: stage.title };
    if (stage.kind === 'narrative') return { ...base, speaker: stage.speaker, text: stage.text };
    if (stage.kind === 'quiz' || stage.kind === 'boss') {
        return { ...base, prompt: stage.prompt, options: stage.options, category: stage.category };
    }
    if (stage.kind === 'cipher') return { ...base, prompt: stage.prompt, hint: stage.hint };
    if (stage.kind === 'memory') {
        return {
            ...base,
            prompt: stage.prompt,
            preview: stage.sequence,
            tiles: stage.tiles,
            previewSeconds: 4
        };
    }
    if (stage.kind === 'multi') {
        return { ...base, prompt: stage.prompt, options: stage.options, category: stage.category };
    }
    if (stage.kind === 'order') return { ...base, prompt: stage.prompt, items: stage.items };
    if (stage.kind === 'matching') return { ...base, prompt: stage.prompt, left: stage.left, right: stage.right };
    if (stage.kind === 'path') {
        return {
            ...base,
            prompt: stage.prompt,
            maxSteps: stage.maxSteps,
            directions: [
                { id: 'north', label: '北' },
                { id: 'east', label: '东' },
                { id: 'south', label: '南' },
                { id: 'west', label: '西' }
            ]
        };
    }
    return {
        ...base,
        prompt: stage.prompt,
        choices: stage.choices.map((choice) => ({
            id: choice.id,
            label: choice.label,
            disabled: Boolean(choice.requires?.energy && state.energy < choice.requires.energy),
            requirement: choice.requires?.energy ? `需要 ${choice.requires.energy} 点能量` : null
        }))
    };
}

function projectState(inputState) {
    const state = validateRun(inputState);
    const chapter = getChapter(state.chapterId);
    return {
        rulesVersion: state.rulesVersion,
        chapter: {
            id: chapter.id,
            order: chapter.order,
            titleZh: chapter.titleZh,
            titleEn: chapter.titleEn,
            summaryZh: chapter.summaryZh,
            summaryEn: chapter.summaryEn,
            reward: chapter.reward,
            icon: chapter.icon,
            color: chapter.color,
            stageCount: chapter.stages.length
        },
        phase: state.phase,
        revision: state.revision,
        stageIndex: state.stageIndex,
        progress: Math.min(100, Math.round((state.stageIndex / chapter.stages.length) * 100)),
        checkpointIndex: state.checkpointIndex,
        hearts: state.hearts,
        maximumHearts: ADVENTURE_CONFIG.maximumHearts,
        energy: state.energy,
        insight: state.insight,
        inventory: state.inventory,
        feedback: state.feedback,
        stage: projectStage(chapter.stages[state.stageIndex], state),
        history: state.history.slice(-12),
        stats: state.stats,
        startedAt: state.startedAt,
        completedAt: state.completedAt
    };
}

function validateRun(state) {
    assertPlainObject(state, 'INVALID_STATE');
    const chapter = getChapter(state.chapterId);
    const validDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
    if (!chapter
        || state.rulesVersion !== ADVENTURE_CONFIG.contentVersion
        || !['active', 'completed'].includes(state.phase)
        || !Number.isSafeInteger(state.revision) || state.revision < 0
        || !Number.isSafeInteger(state.stageIndex) || state.stageIndex < 0 || state.stageIndex > chapter.stages.length
        || (state.phase === 'active' && state.stageIndex >= chapter.stages.length)
        || (state.phase === 'completed' && state.stageIndex !== chapter.stages.length)
        || !Number.isSafeInteger(state.checkpointIndex) || state.checkpointIndex < 0
        || state.checkpointIndex > Math.min(state.stageIndex, chapter.stages.length - 1)
        || !Number.isSafeInteger(state.hearts) || state.hearts < 1 || state.hearts > ADVENTURE_CONFIG.maximumHearts
        || !Number.isSafeInteger(state.energy) || state.energy < 0 || state.energy > 10
        || !Number.isSafeInteger(state.insight) || state.insight < 0 || state.insight > 10_000
        || !Array.isArray(state.inventory) || state.inventory.length > 20
        || !Array.isArray(state.history) || state.history.length > ADVENTURE_CONFIG.maximumHistoryEntries
        || !validDate(state.startedAt) || !validDate(state.stageStartedAt)
        || (state.completedAt !== null && !validDate(state.completedAt))
        || !state.stats || !['correct', 'incorrect', 'choices', 'rewinds'].every(
            (key) => Number.isSafeInteger(state.stats[key]) && state.stats[key] >= 0
        )) {
        throw new AdventureRuleError('INVALID_STATE', 'Adventure state is invalid');
    }
    return state;
}

module.exports = {
    AdventureRuleError,
    applyAction,
    createRun,
    getMissionCatalog,
    projectState,
    validateRun
};
