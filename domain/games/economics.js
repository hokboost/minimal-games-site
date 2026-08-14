'use strict';

const RTP_POLICY = Object.freeze({
    targetMinimum: 0.98,
    target: 0.985,
    maximum: 0.99
});

const MAX_REDEEMABLE_RTP = RTP_POLICY.maximum;

function wishRtp({ cost, successRate, guaranteeCount, rewardValue }) {
    const expectedAttempts = (1 - ((1 - successRate) ** guaranteeCount)) / successRate;
    return rewardValue / (cost * expectedAttempts);
}

function outcomeWeight(outcome) {
    if (Number.isSafeInteger(outcome?.weightUnits)) return outcome.weightUnits / 1_000_000;
    if (Number.isFinite(outcome?.weight)) return outcome.weight;
    throw new Error('Outcome requires weight or integer weightUnits');
}

function weightedRtp(cost, outcomes) {
    return outcomes.reduce(
        (total, outcome) => total + Number(outcome.value) * outcomeWeight(outcome),
        0
    ) / cost;
}

function multiplierRtp(outcomes) {
    return outcomes.reduce(
        (total, outcome) => total + Number(outcome.multiplier) * outcomeWeight(outcome),
        0
    );
}

function optimalFlipEconomics(costs, cashoutRewards) {
    const solve = (goodCount) => {
        if (goodCount === 7) return { expectedCost: 0, expectedPayout: cashoutRewards[7] };
        const remaining = 9 - goodCount;
        const goodProbability = (7 - goodCount) / remaining;
        const badProbability = 2 / remaining;
        const next = solve(goodCount + 1);
        const continueResult = {
            expectedCost: costs[goodCount] + goodProbability * next.expectedCost,
            expectedPayout: goodProbability * next.expectedPayout + badProbability * 50
        };
        if (goodCount === 0) return continueResult;
        const cashout = {
            expectedCost: 0,
            expectedPayout: cashoutRewards[goodCount] || 0
        };
        const continueProfit = continueResult.expectedPayout - continueResult.expectedCost;
        return cashout.expectedPayout >= continueProfit ? cashout : continueResult;
    };
    const result = solve(0);
    return { ...result, rtp: result.expectedPayout / result.expectedCost };
}

function evaluateFlipPolicy(costs, cashoutRewards, continueMask) {
    const solve = (goodCount) => {
        if (goodCount === 7) return { expectedCost: 0, expectedPayout: cashoutRewards[7] };
        if (goodCount > 0 && (continueMask & (1 << (goodCount - 1))) === 0) {
            return { expectedCost: 0, expectedPayout: cashoutRewards[goodCount] || 0 };
        }
        const remaining = 9 - goodCount;
        const goodProbability = (7 - goodCount) / remaining;
        const badProbability = 2 / remaining;
        const next = solve(goodCount + 1);
        return {
            expectedCost: costs[goodCount] + goodProbability * next.expectedCost,
            expectedPayout: goodProbability * next.expectedPayout + badProbability * 50
        };
    };
    const result = solve(0);
    return { ...result, rtp: result.expectedPayout / result.expectedCost, continueMask };
}

function maximumFlipPolicyEconomics(costs, cashoutRewards) {
    let maximum = null;
    for (let mask = 0; mask < (1 << 6); mask += 1) {
        const result = evaluateFlipPolicy(costs, cashoutRewards, mask);
        if (!maximum || result.rtp > maximum.rtp) maximum = result;
    }
    return maximum;
}

function factorial(value) {
    let result = 1;
    for (let current = 2; current <= value; current += 1) result *= current;
    return result;
}

function canonicalStoneState(counts) {
    return counts.slice().sort((left, right) => right - left).join(',');
}

function createStoneStates(slotCount, colorCount) {
    const states = new Map();
    const visit = (remaining, maximum, counts) => {
        if (counts.length === colorCount) {
            if (remaining === 0) {
                const state = counts.slice().sort((left, right) => right - left);
                states.set(canonicalStoneState(state), state);
            }
            return;
        }
        for (let count = Math.min(maximum, remaining); count >= 0; count -= 1) {
            visit(remaining - count, count, [...counts, count]);
        }
    };
    visit(slotCount, slotCount, []);
    return states;
}

function createStoneModel({ rewards, replaceCosts, slotCount, colorCount }) {
    const states = createStoneStates(slotCount, colorCount);
    const keys = [...states.keys()];
    const indexes = new Map(keys.map((key, index) => [key, index]));
    const actions = new Map();
    for (const [key, state] of states) {
        const stateActions = [];
        const replaceCost = Number(replaceCosts[state[0]]);
        if (Number.isSafeInteger(replaceCost) && replaceCost > 0) {
            for (let source = 0; source < colorCount; source += 1) {
                if (state[source] === 0 || (source > 0 && state[source] === state[source - 1])) continue;
                const outcomes = [];
                for (let target = 0; target < colorCount; target += 1) {
                    const next = state.slice();
                    next[source] -= 1;
                    next[target] += 1;
                    outcomes.push(indexes.get(canonicalStoneState(next)));
                }
                stateActions.push(Object.freeze({ sourceCount: state[source], outcomes }));
            }
        }
        actions.set(key, Object.freeze(stateActions));
    }
    return { actions, indexes, keys, states };
}

function solveLinearSystem(matrix, rightHandSide) {
    const size = rightHandSide.length;
    const rows = matrix.map((row, index) => [...row, rightHandSide[index]]);
    for (let column = 0; column < size; column += 1) {
        let pivot = column;
        for (let row = column + 1; row < size; row += 1) {
            if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
        }
        if (Math.abs(rows[pivot][column]) < 1e-12) {
            throw new Error('Stone policy produced a non-terminating transition matrix');
        }
        [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
        const divisor = rows[column][column];
        for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
        for (let row = 0; row < size; row += 1) {
            if (row === column) continue;
            const factor = rows[row][column];
            if (Math.abs(factor) < 1e-15) continue;
            for (let index = column; index <= size; index += 1) {
                rows[row][index] -= factor * rows[column][index];
            }
        }
    }
    return rows.map((row) => row[size]);
}

function stonePolicyMatrix(model, policy, colorCount) {
    return model.keys.map((key, stateIndex) => {
        const row = Array(model.keys.length).fill(0);
        row[stateIndex] = 1;
        const action = policy[stateIndex];
        if (action) {
            for (const outcomeIndex of action.outcomes) row[outcomeIndex] -= 1 / colorCount;
        }
        return row;
    });
}

function optimizeStonePolicy(model, rewards, replaceCosts, colorCount, costWeight) {
    let policy = Array(model.keys.length).fill(null);
    for (let iteration = 0; iteration < 100; iteration += 1) {
        const matrix = stonePolicyMatrix(model, policy, colorCount);
        const rightHandSide = model.keys.map((key, index) => {
            const state = model.states.get(key);
            return policy[index] ? -costWeight * Number(replaceCosts[state[0]]) : Number(rewards[state[0]] || 0);
        });
        const values = solveLinearSystem(matrix, rightHandSide);
        let changed = false;
        const improved = model.keys.map((key, stateIndex) => {
            const state = model.states.get(key);
            let bestValue = Number(rewards[state[0]] || 0);
            let bestAction = null;
            for (const action of model.actions.get(key)) {
                const value = -costWeight * Number(replaceCosts[state[0]])
                    + action.outcomes.reduce((sum, outcomeIndex) => sum + values[outcomeIndex], 0)
                        / colorCount;
                if (value > bestValue + 1e-10) {
                    bestValue = value;
                    bestAction = action;
                }
            }
            if ((policy[stateIndex]?.sourceCount || null) !== (bestAction?.sourceCount || null)) changed = true;
            return bestAction;
        });
        policy = improved;
        if (!changed) return policy;
    }
    throw new Error('Stone policy iteration did not converge');
}

function evaluateStonePolicy(model, policy, {
    initialCost,
    rewards,
    replaceCosts,
    slotCount,
    colorCount
}) {
    const matrix = stonePolicyMatrix(model, policy, colorCount);
    const payoutValues = solveLinearSystem(matrix, model.keys.map((key, index) => {
        const state = model.states.get(key);
        return policy[index] ? 0 : Number(rewards[state[0]] || 0);
    }));
    const replacementCostValues = solveLinearSystem(matrix, model.keys.map((key, index) => {
        const state = model.states.get(key);
        return policy[index] ? Number(replaceCosts[state[0]]) : 0;
    }));
    let expectedPayout = 0;
    let expectedReplacementCost = 0;
    for (let index = 0; index < model.keys.length; index += 1) {
        const state = model.states.get(model.keys[index]);
        const probability = stoneStateProbability(state, slotCount, colorCount);
        expectedPayout += probability * payoutValues[index];
        expectedReplacementCost += probability * replacementCostValues[index];
    }
    const expectedInitialCost = initialCost * slotCount;
    const expectedCost = expectedInitialCost + expectedReplacementCost;
    return {
        expectedCost,
        expectedInitialCost,
        expectedReplacementCost,
        expectedPayout,
        rtp: expectedPayout / expectedCost,
        policy: policy.map((action) => action?.sourceCount || null)
    };
}

function stoneStateProbability(state, slotCount, colorCount) {
    const multiplicities = new Map();
    for (const count of state) multiplicities.set(count, (multiplicities.get(count) || 0) + 1);
    const colorAssignments = factorial(colorCount)
        / [...multiplicities.values()].reduce((product, count) => product * factorial(count), 1);
    const drawOrders = factorial(slotCount)
        / state.reduce((product, count) => product * factorial(count), 1);
    return (colorAssignments * drawOrders) / (colorCount ** slotCount);
}

function optimalStoneEconomics({
    initialCost,
    rewards,
    replaceCosts,
    slotCount = 6,
    colorCount = 7
}) {
    const states = createStoneStates(slotCount, colorCount);
    const transitions = new Map();
    for (const [key, state] of states) {
        const actions = [];
        for (let source = 0; source < colorCount; source += 1) {
            if (state[source] === 0 || (source > 0 && state[source] === state[source - 1])) continue;
            const outcomes = [];
            for (let target = 0; target < colorCount; target += 1) {
                const next = state.slice();
                next[source] -= 1;
                next[target] += 1;
                outcomes.push(canonicalStoneState(next));
            }
            actions.push({ sourceCount: state[source], outcomes });
        }
        transitions.set(key, actions);
    }

    let values = new Map([...states].map(([key, state]) => [key, Number(rewards[state[0]] || 0)]));
    let policy = new Map();
    for (let iteration = 0; iteration < 10_000; iteration += 1) {
        let maximumDelta = 0;
        const nextValues = new Map();
        const nextPolicy = new Map();
        for (const [key, state] of states) {
            let bestValue = Number(rewards[state[0]] || 0);
            let bestAction = null;
            const replaceCost = Number(replaceCosts[state[0]]);
            if (Number.isSafeInteger(replaceCost) && replaceCost > 0) {
                for (const action of transitions.get(key)) {
                    const futureValue = action.outcomes.reduce(
                        (total, outcome) => total + values.get(outcome),
                        0
                    ) / colorCount;
                    const actionValue = futureValue - replaceCost;
                    if (actionValue > bestValue + 1e-12) {
                        bestValue = actionValue;
                        bestAction = action;
                    }
                }
            }
            nextValues.set(key, bestValue);
            nextPolicy.set(key, bestAction);
            maximumDelta = Math.max(maximumDelta, Math.abs(bestValue - values.get(key)));
        }
        values = nextValues;
        policy = nextPolicy;
        if (maximumDelta < 1e-12) break;
        if (iteration === 9_999) throw new Error('Stone economics did not converge');
    }

    let payouts = new Map([...states].map(([key, state]) => [key, Number(rewards[state[0]] || 0)]));
    let costs = new Map([...states.keys()].map((key) => [key, 0]));
    for (let iteration = 0; iteration < 10_000; iteration += 1) {
        let maximumDelta = 0;
        const nextPayouts = new Map();
        const nextCosts = new Map();
        for (const [key, state] of states) {
            const action = policy.get(key);
            if (!action) {
                nextPayouts.set(key, Number(rewards[state[0]] || 0));
                nextCosts.set(key, 0);
                continue;
            }
            const payout = action.outcomes.reduce(
                (total, outcome) => total + payouts.get(outcome),
                0
            ) / colorCount;
            const cost = Number(replaceCosts[state[0]]) + action.outcomes.reduce(
                (total, outcome) => total + costs.get(outcome),
                0
            ) / colorCount;
            nextPayouts.set(key, payout);
            nextCosts.set(key, cost);
            maximumDelta = Math.max(
                maximumDelta,
                Math.abs(payout - payouts.get(key)),
                Math.abs(cost - costs.get(key))
            );
        }
        payouts = nextPayouts;
        costs = nextCosts;
        if (maximumDelta < 1e-10) break;
        if (iteration === 9_999) throw new Error('Stone payout policy did not converge');
    }

    let expectedPayout = 0;
    let expectedReplacementCost = 0;
    for (const [key, state] of states) {
        const probability = stoneStateProbability(state, slotCount, colorCount);
        expectedPayout += probability * payouts.get(key);
        expectedReplacementCost += probability * costs.get(key);
    }
    const expectedInitialCost = initialCost * slotCount;
    const expectedCost = expectedInitialCost + expectedReplacementCost;
    return {
        expectedCost,
        expectedInitialCost,
        expectedReplacementCost,
        expectedPayout,
        rtp: expectedPayout / expectedCost
    };
}

function maximumStonePolicyEconomics({
    initialCost,
    rewards,
    replaceCosts,
    slotCount = 6,
    colorCount = 7
}) {
    const options = { initialCost, rewards, replaceCosts, slotCount, colorCount };
    const model = createStoneModel(options);
    let ratio = 1;
    for (let iteration = 0; iteration < 50; iteration += 1) {
        const policy = optimizeStonePolicy(model, rewards, replaceCosts, colorCount, ratio);
        const result = evaluateStonePolicy(model, policy, options);
        const gap = result.expectedPayout - ratio * result.expectedCost;
        if (Math.abs(gap) <= 1e-10 * Math.max(1, result.expectedCost)
            || Math.abs(result.rtp - ratio) <= 1e-12) {
            return result;
        }
        ratio = result.rtp;
    }
    throw new Error('Stone maximum-RTP policy did not converge');
}

function assertRtp(name, rtp, maximum = MAX_REDEEMABLE_RTP) {
    if (!Number.isFinite(rtp) || rtp > maximum + 1e-12) {
        throw new Error(`${name} RTP ${(rtp * 100).toFixed(4)}% exceeds policy ${(maximum * 100).toFixed(2)}%`);
    }
    return rtp;
}

function assertTargetRtp(name, rtp, policy = RTP_POLICY) {
    assertRtp(name, rtp, policy.maximum);
    if (rtp < policy.targetMinimum - 1e-12) {
        throw new Error(
            `${name} RTP ${(rtp * 100).toFixed(4)}% is below target ${(policy.targetMinimum * 100).toFixed(2)}%`
        );
    }
    return rtp;
}

module.exports = {
    MAX_REDEEMABLE_RTP,
    RTP_POLICY,
    assertRtp,
    assertTargetRtp,
    multiplierRtp,
    maximumFlipPolicyEconomics,
    maximumStonePolicyEconomics,
    optimalFlipEconomics,
    optimalStoneEconomics,
    outcomeWeight,
    weightedRtp,
    wishRtp
};
