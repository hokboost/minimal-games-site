'use strict';

const {
    COMBINATION_TYPES: TYPES,
    MAX_SEQUENCE_RANK,
    RULE_PROFILE
} = require('./constants');
const { cardsToRankCounts } = require('./cards');

const TYPE_PRIORITY = Object.freeze([
    TYPES.ROCKET,
    TYPES.BOMB,
    TYPES.FOUR_TWO_PAIR,
    TYPES.FOUR_TWO_SINGLE,
    TYPES.PLANE_PAIR,
    TYPES.PLANE_SINGLE,
    TYPES.TRIPLE_STRAIGHT,
    TYPES.PAIR_STRAIGHT,
    TYPES.STRAIGHT,
    TYPES.TRIPLE_PAIR,
    TYPES.TRIPLE_SINGLE,
    TYPES.TRIPLE,
    TYPES.PAIR,
    TYPES.SINGLE
]);

const PRIORITY_BY_TYPE = new Map(TYPE_PRIORITY.map((type, index) => [type, index]));

function descriptor(type, mainRank, chainLength, cardCount, bodyRanks) {
    return {
        type,
        mainRank,
        chainLength,
        cardCount,
        bodyRanks: [...bodyRanks]
    };
}

function descriptorKey(value) {
    return [
        value.type,
        value.mainRank,
        value.chainLength,
        value.cardCount,
        value.bodyRanks.join(',')
    ].join(':');
}

function addDescriptor(results, seen, value) {
    const key = descriptorKey(value);
    if (!seen.has(key)) {
        seen.add(key);
        results.push(value);
    }
}

function nonZeroRanks(counts) {
    const ranks = [];
    for (let rank = 0; rank < counts.length; rank += 1) {
        if (counts[rank] > 0) ranks.push(rank);
    }
    return ranks;
}

function isConsecutive(ranks) {
    for (let index = 1; index < ranks.length; index += 1) {
        if (ranks[index] !== ranks[index - 1] + 1) return false;
    }
    return true;
}

function exactSequence(counts, repeat, minimumLength) {
    const ranks = nonZeroRanks(counts);
    if (ranks.length < minimumLength || ranks.at(-1) > MAX_SEQUENCE_RANK
        || !isConsecutive(ranks)
        || ranks.some((rank) => counts[rank] !== repeat)) return null;
    return ranks;
}

function enumeratePlaneBodies(counts, length) {
    const bodies = [];
    if (!Number.isSafeInteger(length) || length < RULE_PROFILE.minimumTripleStraightLength) {
        return bodies;
    }
    for (let start = 0; start + length - 1 <= MAX_SEQUENCE_RANK; start += 1) {
        const ranks = Array.from({ length }, (_, offset) => start + offset);
        if (ranks.every((rank) => counts[rank] === 3)) bodies.push(ranks);
    }
    return bodies;
}

function remainderCounts(counts, bodyRanks, repeat) {
    const result = [...counts];
    for (const rank of bodyRanks) result[rank] -= repeat;
    return result;
}

function enumerateDescriptorsFromCounts(counts) {
    if (!Array.isArray(counts) || counts.length !== RULE_PROFILE.ranks.length
        || counts.some((count, rank) => !Number.isSafeInteger(count)
            || count < 0 || count > (rank >= 13 ? 1 : 4))) {
        throw new TypeError('Invalid Dou Dizhu rank counts');
    }
    const cardCount = counts.reduce((sum, count) => sum + count, 0);
    if (cardCount < 1 || cardCount > RULE_PROFILE.maximumSelectedCards) return [];

    const results = [];
    const seen = new Set();
    const ranks = nonZeroRanks(counts);
    const withCount = (target) => ranks.filter((rank) => counts[rank] === target);

    if (cardCount === 1) {
        addDescriptor(results, seen, descriptor(TYPES.SINGLE, ranks[0], 1, 1, [ranks[0]]));
    }
    if (cardCount === 2 && ranks.length === 1 && counts[ranks[0]] === 2) {
        addDescriptor(results, seen, descriptor(TYPES.PAIR, ranks[0], 1, 2, [ranks[0]]));
    }
    if (cardCount === 2 && counts[13] === 1 && counts[14] === 1) {
        addDescriptor(results, seen, descriptor(TYPES.ROCKET, 14, 1, 2, [13, 14]));
    }
    if (cardCount === 3 && ranks.length === 1 && counts[ranks[0]] === 3) {
        addDescriptor(results, seen, descriptor(TYPES.TRIPLE, ranks[0], 1, 3, [ranks[0]]));
    }
    if (cardCount === 4 && ranks.length === 1 && counts[ranks[0]] === 4) {
        addDescriptor(results, seen, descriptor(TYPES.BOMB, ranks[0], 1, 4, [ranks[0]]));
    }

    if (cardCount === 4 && withCount(3).length === 1 && withCount(1).length === 1) {
        const mainRank = withCount(3)[0];
        addDescriptor(
            results,
            seen,
            descriptor(TYPES.TRIPLE_SINGLE, mainRank, 1, 4, [mainRank])
        );
    }
    if (cardCount === 5 && withCount(3).length === 1 && withCount(2).length === 1) {
        const mainRank = withCount(3)[0];
        addDescriptor(results, seen, descriptor(TYPES.TRIPLE_PAIR, mainRank, 1, 5, [mainRank]));
    }

    for (const [type, repeat, minimumLength] of [
        [TYPES.STRAIGHT, 1, RULE_PROFILE.minimumStraightLength],
        [TYPES.PAIR_STRAIGHT, 2, RULE_PROFILE.minimumPairStraightLength],
        [TYPES.TRIPLE_STRAIGHT, 3, RULE_PROFILE.minimumTripleStraightLength]
    ]) {
        const sequence = exactSequence(counts, repeat, minimumLength);
        if (sequence) {
            addDescriptor(
                results,
                seen,
                descriptor(type, sequence.at(-1), sequence.length, cardCount, sequence)
            );
        }
    }

    if (cardCount === 6) {
        for (const mainRank of withCount(4)) {
            const remainder = remainderCounts(counts, [mainRank], 4);
            const remainderRanks = nonZeroRanks(remainder);
            if (remainder.reduce((sum, count) => sum + count, 0) === 2
                && remainderRanks.every((rank) => remainder[rank] <= 2)) {
                addDescriptor(
                    results,
                    seen,
                    descriptor(TYPES.FOUR_TWO_SINGLE, mainRank, 1, 6, [mainRank])
                );
            }
        }
    }
    if (cardCount === 8) {
        for (const mainRank of withCount(4)) {
            const remainder = remainderCounts(counts, [mainRank], 4);
            const remainderRanks = nonZeroRanks(remainder);
            if (remainderRanks.length === 2
                && remainderRanks.every((rank) => remainder[rank] === 2)) {
                addDescriptor(
                    results,
                    seen,
                    descriptor(TYPES.FOUR_TWO_PAIR, mainRank, 1, 8, [mainRank])
                );
            }
        }
    }

    if (cardCount % 4 === 0) {
        const bodyLength = cardCount / 4;
        for (const bodyRanks of enumeratePlaneBodies(counts, bodyLength)) {
            const remainder = remainderCounts(counts, bodyRanks, 3);
            const remainderRanks = nonZeroRanks(remainder);
            const remainderSize = remainder.reduce((sum, count) => sum + count, 0);
            if (remainderSize === bodyLength
                && bodyRanks.every((rank) => remainder[rank] === 0)
                && remainderRanks.every((rank) => remainder[rank]
                    <= RULE_PROFILE.attachments.maximumSingleWingRankMultiplicity)) {
                addDescriptor(
                    results,
                    seen,
                    descriptor(
                        TYPES.PLANE_SINGLE,
                        bodyRanks.at(-1),
                        bodyRanks.length,
                        cardCount,
                        bodyRanks
                    )
                );
            }
        }
    }

    if (cardCount % 5 === 0) {
        const bodyLength = cardCount / 5;
        for (const bodyRanks of enumeratePlaneBodies(counts, bodyLength)) {
            const remainder = remainderCounts(counts, bodyRanks, 3);
            const remainderRanks = nonZeroRanks(remainder);
            if (remainderRanks.length === bodyLength
                && bodyRanks.every((rank) => remainder[rank] === 0)
                && remainderRanks.every((rank) => remainder[rank] === 2)) {
                addDescriptor(
                    results,
                    seen,
                    descriptor(
                        TYPES.PLANE_PAIR,
                        bodyRanks.at(-1),
                        bodyRanks.length,
                        cardCount,
                        bodyRanks
                    )
                );
            }
        }
    }

    results.sort((left, right) => (
        (PRIORITY_BY_TYPE.get(left.type) ?? Number.MAX_SAFE_INTEGER)
        - (PRIORITY_BY_TYPE.get(right.type) ?? Number.MAX_SAFE_INTEGER)
        || right.chainLength - left.chainLength
        || right.mainRank - left.mainRank
    ));
    return results;
}

function classifyAllCards(cardIds) {
    if (!Array.isArray(cardIds)) throw new TypeError('Cards must be an array');
    if (cardIds.length === 0) return [];
    return enumerateDescriptorsFromCounts(cardsToRankCounts(cardIds));
}

function classifyCards(cardIds) {
    return classifyAllCards(cardIds)[0] || null;
}

function isDescriptor(value) {
    return !!value && typeof value === 'object' && typeof value.type === 'string'
        && Number.isSafeInteger(value.mainRank)
        && Number.isSafeInteger(value.chainLength)
        && Number.isSafeInteger(value.cardCount);
}

function descriptorsFor(value) {
    if (Array.isArray(value)) return classifyAllCards(value);
    if (value && Array.isArray(value.cardIds)) return classifyAllCards(value.cardIds);
    if (value && isDescriptor(value.combination)) return [value.combination];
    return isDescriptor(value) ? [value] : [];
}

function descriptorBeats(candidate, target) {
    if (candidate.type === TYPES.ROCKET) return target.type !== TYPES.ROCKET;
    if (target.type === TYPES.ROCKET) return false;
    if (candidate.type === TYPES.BOMB && target.type !== TYPES.BOMB) return true;
    if (target.type === TYPES.BOMB && candidate.type !== TYPES.BOMB) return false;
    if (candidate.type !== target.type
        || candidate.cardCount !== target.cardCount
        || candidate.chainLength !== target.chainLength) return false;
    return candidate.mainRank > target.mainRank;
}

function canBeat(candidate, target) {
    const candidates = descriptorsFor(candidate);
    if (candidates.length === 0) return false;
    if (target === null || target === undefined) return true;
    const targets = descriptorsFor(target);
    if (targets.length === 0) return false;
    return candidates.some((candidateDescriptor) => targets.some(
        (targetDescriptor) => descriptorBeats(candidateDescriptor, targetDescriptor)
    ));
}

function chooseDescriptor(cardIds, target = null) {
    const descriptors = classifyAllCards(cardIds);
    if (target === null || target === undefined) return descriptors[0] || null;
    const targetDescriptors = descriptorsFor(target);
    return descriptors.find((candidate) => targetDescriptors.some(
        (targetDescriptor) => descriptorBeats(candidate, targetDescriptor)
    )) || null;
}

module.exports = {
    TYPE_PRIORITY,
    canBeat,
    chooseDescriptor,
    classifyAllCards,
    classifyCards,
    descriptorBeats,
    descriptorKey,
    enumerateDescriptorsFromCounts
};
