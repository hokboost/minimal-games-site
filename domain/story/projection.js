'use strict';

const { evaluateCondition } = require('./conditions');
const { expectedAction } = require('./engine');

function localize(value, language) {
    const key = language === 'en' ? 'en' : 'zh';
    return value?.[key] || value?.zh || value?.en || '';
}

function publicStoryProjection(content, run, { language = 'zh', ownerPresence = 'asynchronous', ownerMessagesBlocked = false } = {}) {
    const node = content.nodesById.get(run.currentNodeId);
    if (!node) return null;
    const publicNode = {
        id: node.id, type: node.type, episode: node.episode, speaker: node.speaker || null,
        text: node.type === 'owner_intervention' && ownerMessagesBlocked
            ? (language === 'en' ? 'Owner notes are muted by your preferences. Continue whenever you want.' : '你已在偏好中屏蔽守望者留言；可以按自己的节奏继续。')
            : localize(node.text, language), action: expectedAction(node)
    };
    if (node.type === 'choice') publicNode.choices = node.options
        .filter((option) => !option.condition || evaluateCondition(option.condition, run.state))
        .map((option) => ({ id: option.id, label: localize(option.label, language) }));
    if (node.type === 'puzzle') publicNode.answerOptions = (node.answerOptions || []).map((option) => ({ id: option.id, label: localize(option.label, language) }));
    if (node.type === 'timed_wait') publicNode.waitSeconds = node.waitSeconds;
    if (node.type === 'owner_intervention') publicNode.ownerPresence = ownerMessagesBlocked ? 'muted_by_creator' : ownerPresence;
    return {
        campaign: { slug: content.slug, version: content.version, title: localize(content.title, language) },
        run: { status: run.status, revision: run.revision, replayMode: run.replayMode, currentEpisode: run.currentEpisode, canRecover: Boolean(run.checkpoint) },
        node: publicNode,
        progress: {
            episodesCompleted: Object.keys(run.state.completedEpisodes || {}).length,
            memoriesUnlocked: Object.keys(run.state.memories || {}).length,
            axes: { ...run.state.axes },
            characterRelationships: { ...run.state.characterRelationships },
            clues: Object.keys(run.state.clues || {}), inventory: Object.keys(run.state.inventory || {}),
            messages: ownerMessagesBlocked ? [] : Object.keys(run.state.messages || {}), unlocks: Object.keys(run.state.unlocks || {})
        }
    };
}

module.exports = { localize, publicStoryProjection };
