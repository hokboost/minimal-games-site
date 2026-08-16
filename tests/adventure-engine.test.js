'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const questions = require('../data/questions');
const adventure = require('../domain/games/adventure');
const { ADVENTURE_CONFIG } = require('../domain/games/configuration');

function correctAction(stage, state) {
    if (stage.kind === 'narrative') return { type: 'continue' };
    if (stage.kind === 'quiz' || stage.kind === 'boss') return { type: 'answer', answer: stage.answer };
    if (stage.kind === 'cipher') return { type: 'code', code: stage.code };
    if (stage.kind === 'memory') return { type: 'sequence', sequence: [...stage.sequence] };
    const choice = stage.choices.find((entry) => !entry.requires?.energy || state.energy >= entry.requires.energy);
    assert.ok(choice, `stage ${stage.id} needs an affordable choice`);
    return { type: 'choose', choiceId: choice.id };
}

function clearChapter(chapter) {
    let state = adventure.createRun(chapter.id, { now: 1_700_000_000_000 });
    while (state.phase === 'active') {
        const stage = chapter.stages[state.stageIndex];
        state = adventure.applyAction(state, correctAction(stage, state), {
            now: 1_700_000_000_000 + state.revision * 1000
        });
    }
    return state;
}

test('adventure content is stable, varied, and valid', () => {
    assert.equal(adventure.validateContent(), true);
    const catalog = adventure.getMissionCatalog();
    assert.equal(catalog.length, 3);
    assert.equal(catalog.reduce((sum, chapter) => sum + chapter.stageCount, 0), 43);
    for (const mission of catalog) {
        assert.deepEqual(mission.gameModes.sort(), [
            'boss', 'choice', 'cipher', 'memory', 'narrative', 'quiz', 'resource'
        ]);
        assert.ok(mission.reward > 0);
    }
});

test('all chapters can be cleared through legal actions and finish exactly once', () => {
    for (const chapter of adventure.CHAPTERS) {
        const state = clearChapter(chapter);
        assert.equal(state.phase, 'completed');
        assert.equal(state.stageIndex, chapter.stages.length);
        assert.equal(state.revision, chapter.stages.length);
        assert.ok(state.completedAt);
        assert.equal(state.stats.incorrect, 0);
        assert.throws(
            () => adventure.applyAction(state, { type: 'continue' }),
            (error) => error.code === 'RUN_FINISHED'
        );
    }
});

test('wrong answers consume hearts and rewind to a checkpoint without corrupting revision', () => {
    let state = adventure.createRun('clockwork-library');
    state = adventure.applyAction(state, { type: 'continue' });
    for (let attempt = 0; attempt < ADVENTURE_CONFIG.maximumHearts; attempt += 1) {
        state = adventure.applyAction(state, { type: 'answer', answer: 0 });
    }
    assert.equal(state.revision, ADVENTURE_CONFIG.maximumHearts + 1);
    assert.equal(state.stageIndex, 0);
    assert.equal(state.hearts, ADVENTURE_CONFIG.maximumHearts);
    assert.equal(state.stats.incorrect, ADVENTURE_CONFIG.maximumHearts);
    assert.equal(state.stats.rewinds, 1);
    assert.equal(state.feedback.tone, 'rewind');
});

test('public adventure projection never exposes quiz answers, cipher codes, or choice effects', () => {
    for (const chapter of adventure.CHAPTERS) {
        let state = adventure.createRun(chapter.id);
        for (let index = 0; index < chapter.stages.length; index += 1) {
            const stage = chapter.stages[index];
            const projected = adventure.projectState(state);
            const json = JSON.stringify(projected.stage);
            if (stage.kind === 'quiz' || stage.kind === 'boss') assert.equal(Object.hasOwn(projected.stage, 'answer'), false);
            if (stage.kind === 'cipher') assert.equal(Object.hasOwn(projected.stage, 'code'), false);
            if (stage.kind === 'choice' || stage.kind === 'resource') assert.doesNotMatch(json, /effects|insight|item/);
            state = adventure.applyAction(state, correctAction(stage, state));
        }
    }
});

test('engine rejects malformed commands and unaffordable resource routes', () => {
    let state = adventure.createRun('clockwork-library');
    assert.throws(() => adventure.applyAction(state, { type: 'answer', answer: 2 }), /expects continue/);
    state = adventure.applyAction(state, { type: 'continue' });
    assert.throws(
        () => adventure.applyAction(state, { type: 'answer', answer: 99 }),
        (error) => error.code === 'INVALID_ANSWER'
    );

    const chapter = adventure.getChapter('clockwork-library');
    while (chapter.stages[state.stageIndex].id !== 'library-bridge') {
        const stage = chapter.stages[state.stageIndex];
        state = adventure.applyAction(state, correctAction(stage, state));
    }
    state = { ...state, energy: 0 };
    assert.equal(adventure.validateRun(state), state);
    assert.throws(
        () => adventure.applyAction(state, { type: 'choose', choiceId: 'steady' }),
        (error) => error.code === 'NOT_ENOUGH_ENERGY'
    );
});

test('expanded quiz bank has 440 unique stable questions', () => {
    assert.equal(questions.length, 440);
    assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
    assert.ok(questions.slice(400).every((question) => (
        typeof question.question === 'string'
        && question.options.length === 4
        && Number.isInteger(question.correct)
        && question.options[question.correct]
    )));
});
