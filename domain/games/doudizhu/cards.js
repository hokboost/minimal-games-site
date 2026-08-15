'use strict';

const { randomInt } = require('node:crypto');
const { RANKS } = require('./constants');

const SUITS = Object.freeze([
    Object.freeze({ key: 'S', symbol: '♠', labelZh: '黑桃', labelEn: 'Spades', color: 'black' }),
    Object.freeze({ key: 'H', symbol: '♥', labelZh: '红桃', labelEn: 'Hearts', color: 'red' }),
    Object.freeze({ key: 'C', symbol: '♣', labelZh: '梅花', labelEn: 'Clubs', color: 'black' }),
    Object.freeze({ key: 'D', symbol: '♦', labelZh: '方片', labelEn: 'Diamonds', color: 'red' })
]);

const CARD_DATA = new Map();
const DECK = [];

for (let rankValue = 0; rankValue <= 12; rankValue += 1) {
    const rank = RANKS[rankValue];
    for (let suitIndex = 0; suitIndex < SUITS.length; suitIndex += 1) {
        const suit = SUITS[suitIndex];
        const id = `${suit.key}${rank.key}`;
        const card = Object.freeze({ id, rankValue, rank, suit, suitIndex });
        CARD_DATA.set(id, card);
        DECK.push(id);
    }
}

for (const [id, rankValue, color] of [['LJ', 13, 'black'], ['BJ', 14, 'red']]) {
    const card = Object.freeze({
        id,
        rankValue,
        rank: RANKS[rankValue],
        suit: null,
        suitIndex: 4 + rankValue,
        color
    });
    CARD_DATA.set(id, card);
    DECK.push(id);
}

Object.freeze(DECK);

function assertCardId(cardId) {
    if (typeof cardId !== 'string' || !CARD_DATA.has(cardId)) {
        throw new TypeError(`Invalid Dou Dizhu card id: ${String(cardId)}`);
    }
    return cardId;
}

function getCardRank(cardId) {
    assertCardId(cardId);
    return CARD_DATA.get(cardId).rankValue;
}

function getCardSuit(cardId) {
    assertCardId(cardId);
    return CARD_DATA.get(cardId).suit?.key || null;
}

function formatCard(cardId, locale = 'zh') {
    assertCardId(cardId);
    const card = CARD_DATA.get(cardId);
    if (locale === 'neutral') {
        const rank = card.rank.key;
        return {
            id: card.id,
            rank,
            rankValue: card.rankValue,
            suit: card.suit?.key || null,
            suitLabel: card.suit?.symbol || '',
            color: card.suit?.color || card.color,
            label: card.suit ? `${card.suit.symbol}${rank}` : rank
        };
    }
    const useEnglish = locale === 'en';
    const rank = useEnglish ? card.rank.labelEn : card.rank.labelZh;
    if (!card.suit) {
        return {
            id: card.id,
            rank,
            rankValue: card.rankValue,
            suit: null,
            suitLabel: '',
            color: card.color,
            label: rank
        };
    }
    return {
        id: card.id,
        rank,
        rankValue: card.rankValue,
        suit: card.suit.key,
        suitLabel: useEnglish ? card.suit.labelEn : card.suit.labelZh,
        color: card.suit.color,
        label: `${card.suit.symbol}${rank}`
    };
}

function compareCardIds(left, right) {
    const leftCard = CARD_DATA.get(assertCardId(left));
    const rightCard = CARD_DATA.get(assertCardId(right));
    return leftCard.rankValue - rightCard.rankValue
        || leftCard.suitIndex - rightCard.suitIndex
        || left.localeCompare(right);
}

function sortCards(cardIds) {
    if (!Array.isArray(cardIds)) throw new TypeError('Cards must be an array');
    return [...cardIds].map(assertCardId).sort(compareCardIds);
}

function createDeck() {
    return [...DECK];
}

function drawRandomIndex(rng, maximumExclusive) {
    if (!Number.isSafeInteger(maximumExclusive) || maximumExclusive < 1) {
        throw new RangeError('Random bound must be a positive safe integer');
    }
    if (rng === undefined || rng === null) return randomInt(0, maximumExclusive);
    if (rng && typeof rng.nextInt === 'function') {
        const value = rng.nextInt(maximumExclusive);
        if (!Number.isSafeInteger(value) || value < 0 || value >= maximumExclusive) {
            throw new RangeError('rng.nextInt returned an out-of-range value');
        }
        return value;
    }
    if (typeof rng !== 'function') throw new TypeError('rng must be a function or nextInt provider');
    const value = rng(maximumExclusive);
    if (!Number.isFinite(value)) throw new RangeError('rng returned a non-finite value');
    if (value >= 0 && value < 1) return Math.floor(value * maximumExclusive);
    if (Number.isSafeInteger(value) && value >= 0 && value < maximumExclusive) return value;
    throw new RangeError('rng returned an out-of-range value');
}

function shuffleCards(cardIds, rng) {
    const shuffled = sortCards(cardIds);
    if (new Set(shuffled).size !== shuffled.length) {
        throw new TypeError('Cannot shuffle duplicate card ids');
    }
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const target = drawRandomIndex(rng, index + 1);
        [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
    }
    return shuffled;
}

function cardsToRankCounts(cardIds) {
    if (!Array.isArray(cardIds)) throw new TypeError('Cards must be an array');
    if (new Set(cardIds).size !== cardIds.length) throw new TypeError('Duplicate card id');
    const counts = Array(RANKS.length).fill(0);
    for (const cardId of cardIds) counts[getCardRank(cardId)] += 1;
    return counts;
}

function rankCountsToCardIds(counts, hand) {
    if (!Array.isArray(counts) || counts.length !== RANKS.length
        || counts.some((count) => !Number.isSafeInteger(count) || count < 0)) {
        throw new TypeError('Invalid rank counts');
    }
    const byRank = Array.from({ length: RANKS.length }, () => []);
    for (const cardId of sortCards(hand)) byRank[getCardRank(cardId)].push(cardId);
    const result = [];
    for (let rank = 0; rank < counts.length; rank += 1) {
        if (counts[rank] > byRank[rank].length) return null;
        result.push(...byRank[rank].slice(0, counts[rank]));
    }
    return sortCards(result);
}

module.exports = {
    SUITS,
    assertCardId,
    cardsToRankCounts,
    compareCardIds,
    createDeck,
    drawRandomIndex,
    formatCard,
    getCardRank,
    getCardSuit,
    rankCountsToCardIds,
    shuffleCards,
    sortCards
};
