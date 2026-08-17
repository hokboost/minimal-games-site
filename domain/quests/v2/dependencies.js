'use strict';

const STEP_KEY = /^[a-z][a-z0-9_-]{1,79}$/;

class QuestStepGraphError extends Error {
    constructor(message) {
        super(message);
        this.name = 'QuestStepGraphError';
        this.code = 'QUEST_STEP_DEPENDENCY_INVALID';
    }
}

function validateStepGraph(rawSteps) {
    if (!Array.isArray(rawSteps) || rawSteps.length < 1 || rawSteps.length > 100) {
        throw new QuestStepGraphError('Quest requires between one and one hundred steps');
    }
    const steps = rawSteps.map((step) => {
        const key = step?.step_key ?? step?.stepKey;
        const dependencies = step?.depends_on_keys ?? step?.dependsOnKeys ?? [];
        if (typeof key !== 'string' || !STEP_KEY.test(key)
            || !Array.isArray(dependencies) || dependencies.length > 12
            || dependencies.some((dependency) => typeof dependency !== 'string' || !STEP_KEY.test(dependency))
            || new Set(dependencies).size !== dependencies.length) {
            throw new QuestStepGraphError('Quest step dependency data is malformed');
        }
        return Object.freeze({ key, dependencies: Object.freeze([...dependencies]) });
    });
    const byKey = new Map();
    for (const step of steps) {
        if (byKey.has(step.key)) throw new QuestStepGraphError('Quest step keys must be unique');
        byKey.set(step.key, step);
    }
    for (const step of steps) {
        for (const dependency of step.dependencies) {
            if (!byKey.has(dependency)) {
                throw new QuestStepGraphError(`Quest step ${step.key} has a missing dependency`);
            }
        }
    }

    const visiting = new Set();
    const visited = new Set();
    const visit = (key) => {
        if (visiting.has(key)) throw new QuestStepGraphError('Quest step dependency graph contains a cycle');
        if (visited.has(key)) return;
        visiting.add(key);
        for (const dependency of byKey.get(key).dependencies) visit(dependency);
        visiting.delete(key);
        visited.add(key);
    };
    for (const step of steps) visit(step.key);
    return Object.freeze(steps);
}

function validateVerificationPlan(version, steps) {
    validateStepGraph(steps);
    const required = steps.filter((step) => step.required !== false);
    const trusted = required.filter((step) => step.evidence_kind === 'trusted_event').length;
    const reviewed = required.length - trusted;
    if (required.length < 1) throw new QuestStepGraphError('Published quest requires a required step');
    if (version.verification_mode === 'automatic') {
        if (version.review_policy !== 'none' || trusted !== required.length) {
            throw new QuestStepGraphError('Automatic quests require trusted steps and no human review');
        }
    } else if (version.verification_mode === 'manual') {
        if (!['owner', 'admin'].includes(version.review_policy) || trusted !== 0) {
            throw new QuestStepGraphError('Manual quests require reviewed steps and a human review policy');
        }
    } else if (version.verification_mode === 'hybrid') {
        if (!['owner', 'admin'].includes(version.review_policy) || trusted === 0 || reviewed === 0) {
            throw new QuestStepGraphError('Hybrid quests require trusted and reviewed steps');
        }
    } else {
        throw new QuestStepGraphError('Unknown quest verification mode');
    }
    if (version.safety_class === 'sensitive'
        && version.verification_mode !== 'automatic'
        && version.review_policy !== 'admin') {
        throw new QuestStepGraphError('Sensitive evidence quests require independent admin review');
    }
    return true;
}

module.exports = { QuestStepGraphError, validateStepGraph, validateVerificationPlan };
