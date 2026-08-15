'use strict';

const { COMBINATION_TYPES: TYPES, MAX_SEQUENCE_RANK, RULE_PROFILE } = require('./constants');
const {
    cardsToRankCounts,
    rankCountsToCardIds,
    sortCards
} = require('./cards');
const {
    TYPE_PRIORITY,
    chooseDescriptor,
    classifyAllCards,
    descriptorKey
} = require('./combinations');

const TYPE_ORDER = new Map(TYPE_PRIORITY.map((type, index) => [type, index]));

function emptyCounts() {
    return Array(RULE_PROFILE.ranks.length).fill(0);
}

function cloneCounts(counts) {
    return [...counts];
}

function contiguousWindows(availableCounts, repeat, minimumLength) {
    const windows = [];
    let start = 0;
    while (start <= MAX_SEQUENCE_RANK) {
        while (start <= MAX_SEQUENCE_RANK && availableCounts[start] < repeat) start += 1;
        if (start > MAX_SEQUENCE_RANK) break;
        let end = start;
        while (end + 1 <= MAX_SEQUENCE_RANK && availableCounts[end + 1] >= repeat) end += 1;
        const segmentLength = end - start + 1;
        for (let length = minimumLength; length <= segmentLength; length += 1) {
            for (let windowStart = start; windowStart + length - 1 <= end; windowStart += 1) {
                windows.push(Array.from({ length }, (_, offset) => windowStart + offset));
            }
        }
        start = end + 1;
    }
    return windows;
}

function boundedRankSelections(availableCounts, total, maximumPerRank) {
    const results = [];
    const selected = emptyCounts();

    function visit(rank, remaining) {
        if (remaining === 0) {
            results.push(cloneCounts(selected));
            return;
        }
        if (rank >= availableCounts.length) return;
        let availableAfter = 0;
        for (let index = rank; index < availableCounts.length; index += 1) {
            availableAfter += Math.min(maximumPerRank, availableCounts[index]);
        }
        if (availableAfter < remaining) return;
        const maximum = Math.min(maximumPerRank, availableCounts[rank], remaining);
        for (let count = 0; count <= maximum; count += 1) {
            selected[rank] = count;
            visit(rank + 1, remaining - count);
        }
        selected[rank] = 0;
    }

    visit(0, total);
    return results;
}

function distinctRankSelections(ranks, count) {
    const results = [];
    const selected = [];
    function visit(index, remaining) {
        if (remaining === 0) {
            results.push([...selected]);
            return;
        }
        if (ranks.length - index < remaining) return;
        for (let cursor = index; cursor <= ranks.length - remaining; cursor += 1) {
            selected.push(ranks[cursor]);
            visit(cursor + 1, remaining - 1);
            selected.pop();
        }
    }
    visit(0, count);
    return results;
}

function combineCounts(left, right) {
    return left.map((count, rank) => count + right[rank]);
}

function targetDescriptor(target) {
    if (target === null || target === undefined) return null;
    if (target.combination) return target.combination;
    if (target.type) return target;
    const descriptors = Array.isArray(target) ? classifyAllCards(target) : [];
    return descriptors[0] || null;
}

function generateLegalMoves(hand, target = null) {
    const sortedHand = sortCards(hand);
    if (new Set(sortedHand).size !== sortedHand.length) throw new TypeError('Hand has duplicate cards');
    const available = cardsToRankCounts(sortedHand);
    const requiredTarget = targetDescriptor(target);
    if (target !== null && target !== undefined && !requiredTarget) {
        throw new TypeError('Target move is invalid');
    }

    const moves = [];
    const seen = new Set();
    function add(candidateCounts, intendedType = null, intendedMainRank = null) {
        const cardIds = rankCountsToCardIds(candidateCounts, sortedHand);
        if (!cardIds) return;
        const descriptors = classifyAllCards(cardIds);
        const intended = intendedType === null
            ? descriptors[0]
            : descriptors.find((value) => value.type === intendedType
                && (intendedMainRank === null || value.mainRank === intendedMainRank));
        if (!intended) return;
        const combination = requiredTarget
            ? chooseDescriptor(cardIds, requiredTarget)
            : intended;
        if (!combination) return;
        const key = cardIds.join(',');
        if (seen.has(key)) return;
        seen.add(key);
        moves.push({ cardIds, combination });
    }

    for (let rank = 0; rank < available.length; rank += 1) {
        if (available[rank] >= 1) {
            const counts = emptyCounts();
            counts[rank] = 1;
            add(counts, TYPES.SINGLE, rank);
        }
        if (available[rank] >= 2) {
            const counts = emptyCounts();
            counts[rank] = 2;
            add(counts, TYPES.PAIR, rank);
        }
        if (available[rank] >= 3) {
            const counts = emptyCounts();
            counts[rank] = 3;
            add(counts, TYPES.TRIPLE, rank);
        }
        if (available[rank] >= 4) {
            const counts = emptyCounts();
            counts[rank] = 4;
            add(counts, TYPES.BOMB, rank);
        }
    }
    if (available[13] >= 1 && available[14] >= 1) {
        const counts = emptyCounts();
        counts[13] = 1;
        counts[14] = 1;
        add(counts, TYPES.ROCKET, 14);
    }

    for (let body = 0; body <= 12; body += 1) {
        if (available[body] < 3) continue;
        for (let wing = 0; wing < available.length; wing += 1) {
            if (wing === body) continue;
            if (available[wing] >= 1) {
                const counts = emptyCounts();
                counts[body] = 3;
                counts[wing] = 1;
                add(counts, TYPES.TRIPLE_SINGLE, body);
            }
            if (available[wing] >= 2) {
                const counts = emptyCounts();
                counts[body] = 3;
                counts[wing] = 2;
                add(counts, TYPES.TRIPLE_PAIR, body);
            }
        }
    }

    for (const [type, repeat, minimumLength] of [
        [TYPES.STRAIGHT, 1, RULE_PROFILE.minimumStraightLength],
        [TYPES.PAIR_STRAIGHT, 2, RULE_PROFILE.minimumPairStraightLength],
        [TYPES.TRIPLE_STRAIGHT, 3, RULE_PROFILE.minimumTripleStraightLength]
    ]) {
        for (const ranks of contiguousWindows(available, repeat, minimumLength)) {
            const counts = emptyCounts();
            for (const rank of ranks) counts[rank] = repeat;
            add(counts, type, ranks.at(-1));
        }
    }

    for (const bodyRanks of contiguousWindows(
        available,
        3,
        RULE_PROFILE.minimumTripleStraightLength
    )) {
        const body = emptyCounts();
        const remaining = cloneCounts(available);
        for (const rank of bodyRanks) {
            body[rank] = 3;
            remaining[rank] = 0;
        }
        const bodyLength = bodyRanks.length;
        for (const wings of boundedRankSelections(
            remaining,
            bodyLength,
            RULE_PROFILE.attachments.maximumSingleWingRankMultiplicity
        )) {
            add(combineCounts(body, wings), TYPES.PLANE_SINGLE, bodyRanks.at(-1));
        }
        const pairRanks = [];
        for (let rank = 0; rank < remaining.length; rank += 1) {
            if (remaining[rank] >= 2) pairRanks.push(rank);
        }
        for (const selectedRanks of distinctRankSelections(pairRanks, bodyLength)) {
            const wings = emptyCounts();
            for (const rank of selectedRanks) wings[rank] = 2;
            add(combineCounts(body, wings), TYPES.PLANE_PAIR, bodyRanks.at(-1));
        }
    }

    for (let body = 0; body <= 12; body += 1) {
        if (available[body] < 4) continue;
        const main = emptyCounts();
        main[body] = 4;
        const remaining = cloneCounts(available);
        remaining[body] = 0;
        for (const wings of boundedRankSelections(remaining, 2, 2)) {
            add(combineCounts(main, wings), TYPES.FOUR_TWO_SINGLE, body);
        }
        const pairRanks = [];
        for (let rank = 0; rank < remaining.length; rank += 1) {
            if (remaining[rank] >= 2) pairRanks.push(rank);
        }
        for (const selectedRanks of distinctRankSelections(pairRanks, 2)) {
            const wings = emptyCounts();
            for (const rank of selectedRanks) wings[rank] = 2;
            add(combineCounts(main, wings), TYPES.FOUR_TWO_PAIR, body);
        }
    }

    moves.sort((left, right) => (
        (TYPE_ORDER.get(left.combination.type) ?? Number.MAX_SAFE_INTEGER)
            - (TYPE_ORDER.get(right.combination.type) ?? Number.MAX_SAFE_INTEGER)
        || left.combination.cardCount - right.combination.cardCount
        || left.combination.mainRank - right.combination.mainRank
        || descriptorKey(left.combination).localeCompare(descriptorKey(right.combination))
        || left.cardIds.join(',').localeCompare(right.cardIds.join(','))
    ));
    return moves;
}

module.exports = {
    boundedRankSelections,
    generateLegalMoves
};
