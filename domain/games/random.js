'use strict';

const WEIGHT_SCALE = 1_000_000;

function assertWeightTable(name, outcomes) {
    if (!Array.isArray(outcomes) || outcomes.length === 0) {
        throw new Error(`${name} requires at least one outcome`);
    }
    const total = outcomes.reduce((sum, outcome) => {
        if (!Number.isSafeInteger(outcome?.weightUnits) || outcome.weightUnits < 1) {
            throw new Error(`${name} has an invalid integer weight`);
        }
        return sum + outcome.weightUnits;
    }, 0);
    if (total !== WEIGHT_SCALE) {
        throw new Error(`${name} weights must total ${WEIGHT_SCALE}`);
    }
    return outcomes;
}

function pickWeightedOutcome(outcomes, randomInt) {
    assertWeightTable('weighted outcome table', outcomes);
    const roll = randomInt(0, WEIGHT_SCALE);
    let cursor = 0;
    for (const outcome of outcomes) {
        cursor += outcome.weightUnits;
        if (roll < cursor) return outcome;
    }
    throw new Error('Weighted random draw exceeded its configured range');
}

function stochasticRoundMoney(expectedValue, randomInt) {
    if (!Number.isFinite(expectedValue) || expectedValue < 0 || expectedValue > Number.MAX_SAFE_INTEGER) {
        throw new RangeError('Expected payout is outside the safe money range');
    }
    const floor = Math.floor(expectedValue);
    const fractionUnits = Math.round((expectedValue - floor) * WEIGHT_SCALE);
    if (fractionUnits <= 0) return floor;
    if (fractionUnits >= WEIGHT_SCALE) return floor + 1;
    return floor + (randomInt(0, WEIGHT_SCALE) < fractionUnits ? 1 : 0);
}

module.exports = {
    WEIGHT_SCALE,
    assertWeightTable,
    pickWeightedOutcome,
    stochasticRoundMoney
};
