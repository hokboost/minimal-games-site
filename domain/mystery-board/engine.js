'use strict';

const config = require('./configuration');
const { appendHistory, assertKeys, baseState, difficultyValue, publicBase, safeInteger } = require('../streamer-games/shared');

function challengeById(id, pack = config.pack) {
    const challenge = pack.challenges.find(entry => entry.id === id);
    if (!challenge) throw new TypeError('Unknown mystery case');
    return challenge;
}

function linkKey(pair) {
    return [...pair].sort().join(':');
}

function createState({ challengeId, difficulty, mode, contentPack = config.pack }) {
    const challenge = challengeById(challengeId, contentPack);
    return {
        ...baseState('mystery-board', challenge, difficulty, mode),
        evidence: challenge.evidence.map(([id, textZh, textEn], index) => ({
            id, textZh, textEn, category: ['time', 'physical', 'witness', 'system'][index % 4]
        })),
        suspects: challenge.suspects.map(([id, nameZh, nameEn]) => ({ id, nameZh, nameEn })),
        solutionLinks: challenge.solutionLinks.map(linkKey),
        falseLinks: challenge.falseLinks.map(linkKey),
        contradictions: challenge.contradictions.map(linkKey),
        links: [],
        accusations: []
    };
}

function applyAction(state, raw, context) {
    if (state.status !== 'active') throw new TypeError('Mystery case is not active');
    const command = assertKeys(raw, ['type', 'left', 'right', 'suspectIndex'], 'mystery action');
    let links = state.links;
    let accusations = state.accusations;
    let mistakes = state.mistakes;
    let status = state.status;
    let score = state.score;
    if (command.type === 'link') {
        const ids = new Set(state.evidence.map(entry => entry.id));
        if (!ids.has(command.left) || !ids.has(command.right) || command.left === command.right) {
            throw new TypeError('Invalid evidence link');
        }
        const key = linkKey([command.left, command.right]);
        if (links.includes(key)) throw new TypeError('Evidence already linked');
        if (links.length >= difficultyValue(state.difficulty, config.maximumLinks)) throw new TypeError('Link budget exhausted');
        links = [...links, key];
    } else if (command.type === 'unlink') {
        const key = linkKey([command.left, command.right]);
        if (!links.includes(key)) throw new TypeError('Evidence link not found');
        links = links.filter(entry => entry !== key);
    } else if (command.type === 'accuse') {
        const suspect = safeInteger(command.suspectIndex, 0, state.suspects.length - 1, 'suspect');
        const correctLinks = state.solutionLinks.filter(link => links.includes(link)).length;
        const falseLinkCount = state.falseLinks.filter(link => links.includes(link)).length;
        const required = difficultyValue(state.difficulty, [1, state.solutionLinks.length, state.solutionLinks.length]);
        const correct = suspect === challengeById(state.challengeId, context.contentPack || config.pack).culprit
            && correctLinks >= required && (state.difficulty !== 'expert' || falseLinkCount === 0);
        accusations = [...accusations, { suspect, actorRole: context.actorRole, correct }];
        mistakes += correct ? 0 : 1;
        status = correct ? 'completed' : mistakes >= 3 ? 'failed' : 'active';
        score = correct ? Math.max(100, 1200 - links.length * 30 - mistakes * 120) : score;
    } else throw new TypeError('Unknown mystery action');
    const turn = state.turn + 1;
    return {
        ...state,
        links,
        accusations,
        mistakes,
        status: status === 'active' && turn >= config.maximumActions ? 'failed' : status,
        score,
        turn,
        history: appendHistory(state, { type: command.type, actorRole: context.actorRole })
    };
}

function project(state, viewerRole, contentPack = config.pack) {
    const challenge = challengeById(state.challengeId, contentPack);
    const terminal = state.status !== 'active';
    return {
        ...publicBase(state, challenge),
        evidence: state.evidence,
        suspects: state.suspects,
        links: state.links,
        accusations: state.accusations.map(entry => terminal ? entry : {
            suspect: entry.suspect,
            actorRole: entry.actorRole
        }),
        linkBudget: difficultyValue(state.difficulty, config.maximumLinks),
        contradictionHint: state.difficulty === 'gentle' ? state.contradictions[0] : null,
        solution: terminal ? { links: state.solutionLinks, culprit: challenge.culprit } : undefined
    };
}

module.exports = { applyAction, challengeById, createState, linkKey, project };
