'use strict';

const { evaluateCondition } = require('./conditions');
const { applyEffects, initialStoryState } = require('./effects');

class StoryTransitionError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'StoryTransitionError';
        this.code = code;
    }
}

function safeRevision(value) {
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < 0 || number > 1000000) throw new StoryTransitionError('STORY_INVALID_REVISION', 'Invalid story revision');
    return number;
}

function createStoryRun(content, { replayMode = false } = {}) {
    return {
        status: 'active', currentNodeId: content.entryNode, currentEpisode: content.nodesById.get(content.entryNode).episode,
        revision: 0, replayMode: Boolean(replayMode), state: initialStoryState(), checkpoint: null
    };
}

function selectEnding(content, state) {
    const eligible = content.nodes.filter((node) => node.type === 'season_ending' && (!node.condition || evaluateCondition(node.condition, state)));
    if (!eligible.length) throw new StoryTransitionError('STORY_ENDING_UNAVAILABLE', 'No ending is available');
    return eligible.sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0].id;
}

function expectedAction(node) {
    if (node.type === 'choice') return 'choose';
    if (node.type === 'puzzle') return 'answer';
    if (node.type === 'season_ending') return 'finish';
    return 'advance';
}

function transitionStory(content, runValue, commandValue, { now = () => new Date() } = {}) {
    const run = structuredClone(runValue);
    const command = commandValue || {};
    if (run.status !== 'active') throw new StoryTransitionError('STORY_RUN_NOT_ACTIVE', 'Story run is not active');
    const expectedRevision = safeRevision(command.expectedRevision);
    if (run.revision !== expectedRevision) throw new StoryTransitionError('STORY_VERSION_CONFLICT', 'Story changed concurrently');
    const node = content.nodesById.get(run.currentNodeId);
    if (!node) throw new StoryTransitionError('STORY_NODE_MISSING', 'Current story node is unavailable');
    const action = expectedAction(node);
    if (command.action !== action) throw new StoryTransitionError('STORY_ACTION_INVALID', `Expected ${action}`);
    const state = structuredClone(run.state);
    state.visits[node.id] = Number(state.visits[node.id] || 0) + 1;
    if (state.visits[node.id] > node.visitBudget) throw new StoryTransitionError('STORY_VISIT_LIMIT', 'This story path exceeded its visit budget');
    let selectedChoice = null;
    let answerCorrect = null;
    let nextNodeId = node.next;
    let effects = [...(node.effects || [])];
    if (node.type === 'choice') {
        const choiceId = typeof command.choiceId === 'string' ? command.choiceId : '';
        const option = node.options.find((item) => item.id === choiceId && (!item.condition || evaluateCondition(item.condition, state)));
        if (!option) throw new StoryTransitionError('STORY_CHOICE_INVALID', 'Choice is unavailable');
        selectedChoice = choiceId;
        nextNodeId = option.next;
        effects.push(...option.effects);
        state.committedChoices.push({ nodeId: node.id, choiceId, revision: run.revision + 1 });
    } else if (node.type === 'puzzle') {
        const answerKey = typeof command.answerKey === 'string' ? command.answerKey : '';
        answerCorrect = answerKey === node.answerKey;
        nextNodeId = answerCorrect ? node.successNext : node.failureNext;
        effects.push(...(answerCorrect ? (node.successEffects || []) : (node.failureEffects || [])));
    } else if (['quest_gate', 'inventory_gate', 'relationship_gate', 'achievement_gate'].includes(node.type)) {
        nextNodeId = evaluateCondition(node.condition, state) ? node.successNext : node.failureNext;
    } else if (node.type === 'timed_wait') {
        const timestamp = now().toISOString();
        const started = state.waitStartedAt[node.id];
        if (!started) {
            state.waitStartedAt[node.id] = timestamp;
            nextNodeId = node.id;
            effects = [];
        } else if (Date.parse(timestamp) - Date.parse(started) < node.waitSeconds * 1000) {
            throw new StoryTransitionError('STORY_WAIT_ACTIVE', 'This signal is still arriving');
        } else delete state.waitStartedAt[node.id];
    } else if (node.type === 'route_conclusion') {
        nextNodeId = selectEnding(content, state);
    } else if (node.type === 'season_ending') {
        nextNodeId = node.id;
        run.status = 'completed';
    }
    const applied = applyEffects(state, effects);
    const target = content.nodesById.get(nextNodeId);
    if (!target) throw new StoryTransitionError('STORY_TARGET_MISSING', 'Story target is unavailable');
    run.currentNodeId = nextNodeId;
    run.currentEpisode = target.episode;
    run.revision += 1;
    run.state = applied.state;
    if (node.type === 'checkpoint') run.checkpoint = { nodeId: nextNodeId, revision: run.revision, state: structuredClone(run.state) };
    const newlyCompletedEpisodes = effects.filter((effect) => effect.type === 'complete_episode').map((effect) => effect.key);
    return Object.freeze({
        run, emitted: applied.emitted, event: Object.freeze({
            action, fromNodeId: node.id, toNodeId: nextNodeId, selectedChoice, answerCorrect,
            revision: run.revision, newlyCompletedEpisodes,
            effectSummary: Object.freeze(effects.map((effect) => Object.freeze({ type: effect.type, key: effect.key || effect.axis || effect.character, unlockType: effect.unlockType })))
        })
    });
}

function recoverStoryRun(content, runValue, expectedRevisionValue) {
    const run = structuredClone(runValue); const expectedRevision = safeRevision(expectedRevisionValue);
    if (run.status !== 'active' || run.revision !== expectedRevision) throw new StoryTransitionError('STORY_VERSION_CONFLICT', 'Story changed concurrently');
    if (!run.checkpoint || !content.nodesById.has(run.checkpoint.nodeId)) throw new StoryTransitionError('STORY_CHECKPOINT_MISSING', 'No recoverable checkpoint exists');
    const fromNodeId = run.currentNodeId;
    run.currentNodeId = run.checkpoint.nodeId; run.currentEpisode = content.nodesById.get(run.currentNodeId).episode;
    const restored = structuredClone(run.checkpoint.state);
    for (const key of ['memories', 'unlocks', 'messages', 'completedEpisodes']) restored[key] = { ...(restored[key] || {}), ...(run.state[key] || {}) };
    run.state = restored; run.revision += 1;
    return Object.freeze({ run, emitted: Object.freeze([]), event: Object.freeze({ action: 'recover', fromNodeId, toNodeId: run.currentNodeId, selectedChoice: null, answerCorrect: null, revision: run.revision, newlyCompletedEpisodes: [], effectSummary: Object.freeze([{ type: 'checkpoint_restore', key: run.checkpoint.nodeId }]) }) });
}

module.exports = { StoryTransitionError, createStoryRun, expectedAction, recoverStoryRun, transitionStory };
