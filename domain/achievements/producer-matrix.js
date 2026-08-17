'use strict';

const { EVENT_FIELDS } = require('./rules');

const PRODUCERS = Object.freeze({
    'story.episode.completed': Object.freeze({
        producer: 'services/story-world-service.js#persistValue',
        sourceIdentity: 'story-achievement-episode:<story-event-id>:<episode>',
        integrationTest: 'tests/full-content-expansion.test.js'
    }),
    'story.choice.committed': Object.freeze({
        producer: 'services/story-world-service.js#persistValue',
        sourceIdentity: 'story-choice:<story-event-id>',
        integrationTest: 'tests/full-content-expansion.test.js'
    }),
    'story.owner_letter.persisted': Object.freeze({
        producer: 'services/story-world-service.js#persistValue',
        sourceIdentity: 'story-owner-letter:<story-event-id>:<message-key>',
        integrationTest: 'tests/full-content-expansion.test.js'
    }),
    'story.season.completed': Object.freeze({
        producer: 'services/story-world-service.js#persistValue',
        sourceIdentity: 'story-achievement-season:<story-event-id>',
        integrationTest: 'tests/full-content-expansion.test.js'
    }),
    'game.run.completed': Object.freeze({
        producer: 'services/streamer-game-service.js#recordCompletionAchievements',
        sourceIdentity: 'achievement-game-run:<run-id>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'quest.assignment.completed': Object.freeze({
        producer: 'services/quest-v2-service.js#emitAssignmentCompletedAchievement',
        sourceIdentity: 'achievement-quest-<verification>:<assignment-id>:<revision>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'quest.chain.completed': Object.freeze({
        producer: 'services/quest-v2-service.js#emitChainCompletedAchievement',
        sourceIdentity: 'quest-chain:<user-id>:<chain-id>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'quest.assignment.declined': Object.freeze({
        producer: 'services/quest-v2-service.js#transition',
        sourceIdentity: 'achievement-quest-declined:<assignment-id>:<revision>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'quest.assignment.postponed': Object.freeze({
        producer: 'services/quest-v2-service.js#postpone',
        sourceIdentity: 'achievement-quest-postponed:<assignment-id>:<revision>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'quest.appeal.resolved': Object.freeze({
        producer: 'services/quest-v2-service.js#resolveAppeal',
        sourceIdentity: 'achievement-quest-appeal:<assignment-id>:<appeal-id>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'quest.evidence.redacted': Object.freeze({
        producer: 'services/quest-v2-service.js#redactExpiredEvidence',
        sourceIdentity: 'achievement-quest-evidence-redacted:<evidence-id>',
        integrationTest: 'tests/achievement-producers-p1.test.js'
    }),
    'live.item.resolved': Object.freeze({
        producer: 'services/live-interaction-participant-commands.js#itemAction',
        sourceIdentity: 'live-item-resolved:<interaction-id>:<item-id>',
        integrationTest: 'tests/live-interaction-platform.test.js'
    }),
    'live.item.persisted': Object.freeze({
        producer: 'services/live-interaction-service.js#send',
        sourceIdentity: 'live-item-persisted:<interaction-id>:<item-id>',
        integrationTest: 'tests/live-interaction-platform.test.js'
    }),
    'live.report.reconsented': Object.freeze({
        producer: 'services/live-interaction-service.js#reconsent',
        sourceIdentity: 'live-report-reconsented:<interaction-id>:<report-id>',
        integrationTest: 'tests/live-interaction-platform.test.js'
    })
});

function buildAchievementProducerMatrix(achievements) {
    if (!Array.isArray(achievements)) throw new TypeError('Achievement catalog is required');
    return Object.freeze(achievements.map(definition => {
        const producer = PRODUCERS[definition.eventType];
        if (!producer) throw new Error(`Published achievement has no trusted producer: ${definition.slug}`);
        return Object.freeze({
            slug: definition.slug,
            eventType: definition.eventType,
            hidden: definition.hidden,
            distinctKey: definition.filters.distinct || null,
            ...producer
        });
    }));
}

function validateAchievementProducerMatrix(achievements, matrix) {
    if (!Array.isArray(achievements) || !Array.isArray(matrix)
        || matrix.length !== achievements.length) throw new Error('Achievement producer matrix size mismatch');
    const bySlug = new Map(matrix.map(row => [row.slug, row]));
    if (bySlug.size !== matrix.length) throw new Error('Achievement producer matrix contains duplicate slugs');
    for (const definition of achievements) {
        const row = bySlug.get(definition.slug);
        const allowed = EVENT_FIELDS[definition.eventType];
        if (!row || row.eventType !== definition.eventType || row.hidden !== definition.hidden
            || row.distinctKey !== (definition.filters.distinct || null)
            || typeof row.producer !== 'string' || !/^services\/.+\.js#[A-Za-z][A-Za-z0-9]+$/.test(row.producer)
            || typeof row.sourceIdentity !== 'string' || row.sourceIdentity.length < 8
            || typeof row.integrationTest !== 'string' || !/^tests\/.+\.test\.js$/.test(row.integrationTest)
            || (row.distinctKey && !allowed?.has(row.distinctKey))) {
            throw new Error(`Published achievement producer is incomplete: ${definition.slug}`);
        }
    }
    return true;
}

const { ACHIEVEMENTS } = require('../../content/streamer-world/achievements/catalog');
const ACHIEVEMENT_PRODUCER_MATRIX = buildAchievementProducerMatrix(ACHIEVEMENTS);
validateAchievementProducerMatrix(ACHIEVEMENTS, ACHIEVEMENT_PRODUCER_MATRIX);

module.exports = { ACHIEVEMENT_PRODUCER_MATRIX, PRODUCERS, buildAchievementProducerMatrix,
    validateAchievementProducerMatrix };
