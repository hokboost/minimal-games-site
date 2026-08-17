'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger, shuffled } = require('../streamer-games/shared');

const CARDS = Object.freeze([
    ['listen', '先听完', 'listen first', '她没有打断，而是让那句迟疑完整落地。', 'She did not interrupt, letting the hesitant sentence land.', 'empathy'],
    ['lantern', '留一盏灯', 'leave a light', '窗边那盏灯被留到天亮，像一个无需催促的回答。', 'The window lamp stayed on until dawn, an answer that asked for no hurry.', 'hope'],
    ['question', '追问细节', 'ask one detail', '他只追问了一个细节，故事的方向便悄悄改变。', 'He asked one careful detail, and the story quietly changed direction.', 'curiosity'],
    ['return', '选择归还', 'choose to return', '最终，他们把不属于自己的东西放回原处。', 'In the end, they returned what had never belonged to them.', 'trust'],
    ['detour', '绕一段远路', 'take a detour', '那段远路没有浪费时间，反而让两个人看见同一片天空。', 'The detour wasted no time; it let them see the same sky.', 'wonder'],
    ['promise', '守住承诺', 'keep the promise', '风声盖住了脚步，却没有盖住那句被兑现的承诺。', 'Wind covered the footsteps, but not the promise being kept.', 'trust'],
    ['repair', '修好旧物', 'repair the old thing', '裂痕仍然可见，但旧物终于可以再次被使用。', 'The seam remained visible, yet the old thing could be used again.', 'care'],
    ['name', '说出名字', 'speak the name', '名字被说出口后，沉默不再像一堵墙。', 'Once the name was spoken, silence no longer felt like a wall.', 'courage'],
    ['share', '分享线索', 'share the clue', '她把最重要的线索推到桌子中央，邀请所有人一起判断。', 'She moved the vital clue to the table center and invited everyone to judge.', 'empathy'],
    ['wait', '再等片刻', 'wait a little longer', '他们多等了一会儿，于是听见门后传来真正的回答。', 'They waited a little longer and heard the real answer behind the door.', 'patience']
].map(([id, zh, en, passageZh, passageEn, theme]) => Object.freeze({ id, zh, en, passageZh, passageEn, theme })));

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(entry => entry.id === id);
    if (!challenge) throw new TypeError('Unknown story prompt');
    return challenge;
}

function handFor(state, turn) {
    const count = difficultyValue(state.difficulty, config.cardCounts);
    return shuffled(CARDS.length, state.seed + turn * 97).slice(0, count).map(index => CARDS[index]);
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    return {
        ...baseState('story-weaver', challenge, difficulty, mode),
        seed: challenge.seed,
        targetTurns: challenge.turns,
        passages: [],
        themes: {}
    };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Story workshop is not active');
    const command = assertKeys(raw, ['type', 'cardIndex'], 'weaver action');
    if (command.type !== 'choose') throw new TypeError('Unknown weaver action');
    const hand = handFor(state, state.turn);
    const index = safeInteger(command.cardIndex, 0, hand.length - 1, 'card index');
    if (state.mode === 'coop') {
        const expectedRole = state.turn % 2 ? 'owner' : 'creator';
        if (context.actorRole !== expectedRole) throw new TypeError('Partner writing turn required');
    }
    const card = hand[index];
    const passages = [...state.passages, { cardId: card.id, actorRole: context.actorRole, turn: state.turn,
        textZh: card.passageZh, textEn: card.passageEn }];
    const themes = { ...state.themes, [card.theme]: (state.themes[card.theme] || 0) + 1 };
    const complete = passages.length >= state.targetTurns;
    const variety = Object.keys(themes).length;
    const handoffs = passages.slice(1).filter((entry, index) => entry.actorRole !== passages[index].actorRole).length;
    return {
        ...state,
        passages,
        themes,
        turn: state.turn + 1,
        status: complete ? 'completed' : state.turn + 1 >= config.maximumActions ? 'failed' : 'active',
        score: complete ? passages.length * 120 + variety * 80 + handoffs * 25 : state.score,
        history: appendHistory(state, { type: 'choose', cardId: card.id, actorRole: context.actorRole })
    };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    return {
        ...publicBase(state, challenge),
        targetTurns: state.targetTurns,
        passages: state.passages.map(entry => ({ ...entry, card: CARDS.find(card => card.id === entry.cardId) })),
        hand: state.status === 'active' ? handFor(state, state.turn) : [],
        nextRole: state.mode === 'solo' ? 'creator' : state.turn % 2 ? 'owner' : 'creator',
        themes: Object.keys(state.themes)
    };
}

module.exports = { CARDS, applyAction, challengeById, createState, handFor, project };
