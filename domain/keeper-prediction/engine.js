'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger, seeded } = require('../streamer-games/shared');

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(item => item.id === id);
    if (!challenge) throw new TypeError('Unknown prediction challenge');
    return challenge;
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    return { ...baseState('keeper-prediction', challenge, difficulty, mode), round: 0,
        roundCount: difficultyValue(difficulty, config.rounds), submissions: {}, reveals: [] };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Prediction run is not active');
    const action = assertKeys(raw, ['type', 'choice', 'prediction'], 'prediction action');
    if (action.type !== 'submit') throw new TypeError('Unknown prediction action');
    const choice = safeInteger(action.choice, 0, 2, 'choice');
    const prediction = safeInteger(action.prediction, 0, 2, 'prediction');
    const role = state.mode === 'solo' ? 'creator' : context.actorRole;
    if (state.submissions[role]) throw new TypeError('Role already submitted');
    let submissions = { ...state.submissions, [role]: { choice, prediction } };
    if (state.mode === 'solo') {
        const challenge = challengeById(state.challengeId, context.contentPack || config.pack);
        const random = seeded(challenge.seed + state.round * 17);
        submissions.owner = { choice: Math.floor(random() * 3), prediction: Math.floor(random() * 3) };
    }
    if (!submissions.creator || !submissions.owner) return { ...state, submissions, turn: state.turn + 1,
        history: appendHistory(state, { type: 'sealed', actorRole: role }) };
    const points = Number(submissions.creator.prediction === submissions.owner.choice) + Number(submissions.owner.prediction === submissions.creator.choice);
    const round = state.round + 1;
    const complete = round >= state.roundCount;
    return { ...state, round, submissions: {}, reveals: [...state.reveals, { round: state.round,
        creatorChoice: submissions.creator.choice, ownerChoice: submissions.owner.choice, points }],
    turn: state.turn + 1, status: complete ? 'completed' : 'active', score: state.score + points * 100,
    history: appendHistory(state, { type: 'reveal', points }) };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    return { ...publicBase(state, challenge), round: state.round, roundCount: state.roundCount,
        choicesZh: challenge.choicesZh, choicesEn: challenge.choicesEn,
        submitted: Boolean(state.submissions[viewerRole === 'owner' ? 'owner' : 'creator']),
        partnerSubmitted: Boolean(state.submissions[viewerRole === 'owner' ? 'creator' : 'owner']),
        reveals: state.reveals };
}

module.exports = { applyAction, challengeById, createState, project };
