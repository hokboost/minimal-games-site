'use strict';

const phaseTwo = require('./phase-2-pack');
const phaseEight = require('./phase-8-expansion');

const quests = Object.freeze([...phaseTwo.QUESTS, ...phaseEight.QUESTS]);
const chains = Object.freeze([...phaseTwo.CHAINS, ...phaseEight.CHAINS]);
const boards = phaseTwo.BOARDS;

const counts = Object.freeze({ quests: quests.length, chains: chains.length, boards: boards.length });
if (counts.quests !== 180 || counts.chains !== 30 || counts.boards !== 12) {
    throw new Error('Full quest catalog count mismatch');
}
if (new Set(quests.map((item) => item.slug)).size !== quests.length
    || new Set(chains.map((item) => item.slug)).size !== chains.length) {
    throw new Error('Full quest catalog identity collision');
}
for (const chain of chains) {
    if (chain.quests.some((slug) => !quests.some((quest) => quest.slug === slug))) {
        throw new Error(`Quest chain contains an unknown definition: ${chain.slug}`);
    }
}

module.exports = { boards, chains, counts, quests };
