# Achievement producer matrix

This file is generated from the published 60-achievement catalog. Run `npm run check:achievement-matrix` after changing an achievement, trusted event, producer, or integration test.

Published definitions: 60. Trusted event types: 14.

A producer reference is accepted only when its service file, concrete method, and integration test all exist. Runtime event validation remains closed to the fields declared in `domain/achievements/rules.js`.

## story

| Achievement | Event | Hidden | Distinct | Trusted producer | Immutable source identity | Integration test |
|---|---|---:|---|---|---|---|
| first-harbor-light | story.episode.completed | no | — | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| twelve-episode-voyage | story.episode.completed | no | — | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| choice-with-an-exit | story.choice.committed | no | — | services/story-world-service.js#persistValue | story-choice:<story-event-id> | tests/full-content-expansion.test.js |
| quiet-owner-letter | story.owner_letter.persisted | yes | — | services/story-world-service.js#persistValue | story-owner-letter:<story-event-id>:<message-key> | tests/full-content-expansion.test.js |
| season-one-archive | story.season.completed | no | — | services/story-world-service.js#persistValue | story-achievement-season:<story-event-id> | tests/full-content-expansion.test.js |
| tide-reader | story.episode.completed | no | — | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| promise-bypass | story.choice.committed | yes | — | services/story-world-service.js#persistValue | story-choice:<story-event-id> | tests/full-content-expansion.test.js |
| relay-two-resumer | story.season.completed | no | — | services/story-world-service.js#persistValue | story-achievement-season:<story-event-id> | tests/full-content-expansion.test.js |
| borrowed-hour-return | story.episode.completed | no | — | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| silence-owes-nothing | story.choice.committed | yes | — | services/story-world-service.js#persistValue | story-choice:<story-event-id> | tests/full-content-expansion.test.js |
| city-clock-repaired | story.season.completed | no | — | services/story-world-service.js#persistValue | story-achievement-season:<story-event-id> | tests/full-content-expansion.test.js |
| wild-star-witness | story.episode.completed | no | — | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| correction-kept-beside-error | story.choice.committed | yes | — | services/story-world-service.js#persistValue | story-choice:<story-event-id> | tests/full-content-expansion.test.js |
| relay-four-archivist | story.season.completed | no | — | services/story-world-service.js#persistValue | story-achievement-season:<story-event-id> | tests/full-content-expansion.test.js |
| homeward-door | story.episode.completed | no | — | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| earned-never-expires | story.choice.committed | yes | — | services/story-world-service.js#persistValue | story-choice:<story-event-id> | tests/full-content-expansion.test.js |
| relay-five-open | story.season.completed | no | — | services/story-world-service.js#persistValue | story-achievement-season:<story-event-id> | tests/full-content-expansion.test.js |
| five-season-traveler | story.episode.completed | yes | season | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| sixty-episode-archive | story.episode.completed | yes | episode | services/story-world-service.js#persistValue | story-achievement-episode:<story-event-id>:<episode> | tests/full-content-expansion.test.js |
| many-valid-endings | story.season.completed | yes | season | services/story-world-service.js#persistValue | story-achievement-season:<story-event-id> | tests/full-content-expansion.test.js |

## game

| Achievement | Event | Hidden | Distinct | Trusted producer | Immutable source identity | Integration test |
|---|---|---:|---|---|---|---|
| constellation-first-repair | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| signal-duet-listener | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| mystery-linker | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| story-weaver-card | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| studio-crafter | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| meteor-defender | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| daily-maze-walker | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| trusted-bingo-card | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| echo-memory-keeper | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| fictional-predictor | game.run.completed | no | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| gentle-game-tour | game.run.completed | yes | gameId | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| standard-game-tour | game.run.completed | yes | gameId | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| expert-game-tour | game.run.completed | yes | gameId | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| solo-fallback-complete | game.run.completed | yes | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| coop-with-an-exit | game.run.completed | yes | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| game-run-five | game.run.completed | no | runId | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| game-run-twenty | game.run.completed | yes | runId | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| no-client-score | game.run.completed | yes | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| disconnect-resumer | game.run.completed | yes | — | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |
| all-game-archives | game.run.completed | yes | gameId | services/streamer-game-service.js#recordCompletionAchievements | achievement-game-run:<run-id> | tests/achievement-producers-p1.test.js |

## quest

| Achievement | Event | Hidden | Distinct | Trusted producer | Immutable source identity | Integration test |
|---|---|---:|---|---|---|---|
| first-reviewed-quest | quest.assignment.completed | no | — | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| first-trusted-quest | quest.assignment.completed | no | — | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| quest-chain-one | quest.chain.completed | no | — | services/quest-v2-service.js#emitChainCompletedAchievement | quest-chain:<user-id>:<chain-id> | tests/achievement-producers-p1.test.js |
| quest-chain-five | quest.chain.completed | yes | chain | services/quest-v2-service.js#emitChainCompletedAchievement | quest-chain:<user-id>:<chain-id> | tests/achievement-producers-p1.test.js |
| weekly-board-one | quest.assignment.completed | no | — | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| neutral-decline-kept | quest.assignment.declined | yes | — | services/quest-v2-service.js#transition | achievement-quest-declined:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| postpone-with-progress | quest.assignment.postponed | yes | — | services/quest-v2-service.js#postpone | achievement-quest-postponed:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| evidence-return-resubmit | quest.assignment.completed | yes | — | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| quest-five-completions | quest.assignment.completed | no | assignmentId | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| quest-twenty-completions | quest.assignment.completed | yes | assignmentId | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| quest-category-explorer | quest.assignment.completed | yes | category | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| zero-point-meaning | quest.assignment.completed | yes | — | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |
| appeal-resolved | quest.appeal.resolved | yes | — | services/quest-v2-service.js#resolveAppeal | achievement-quest-appeal:<assignment-id>:<appeal-id> | tests/achievement-producers-p1.test.js |
| retention-respected | quest.evidence.redacted | yes | — | services/quest-v2-service.js#redactExpiredEvidence | achievement-quest-evidence-redacted:<evidence-id> | tests/achievement-producers-p1.test.js |
| quest-thirty-chain-nodes | quest.assignment.completed | yes | chainNode | services/quest-v2-service.js#emitAssignmentCompletedAchievement | achievement-quest-<verification>:<assignment-id>:<revision> | tests/achievement-producers-p1.test.js |

## live

| Achievement | Event | Hidden | Distinct | Trusted producer | Immutable source identity | Integration test |
|---|---|---:|---|---|---|---|
| first-live-invitation | live.item.resolved | no | — | services/live-interaction-participant-commands.js#itemAction | live-item-resolved:<interaction-id>:<item-id> | tests/live-interaction-platform.test.js |
| quiet-live-inbox | live.item.persisted | yes | — | services/live-interaction-service.js#send | live-item-persisted:<interaction-id>:<item-id> | tests/live-interaction-platform.test.js |
| report-safety-path | live.report.reconsented | yes | — | services/live-interaction-service.js#reconsent | live-report-reconsented:<interaction-id>:<report-id> | tests/live-interaction-platform.test.js |
| poll-without-pressure | live.item.resolved | yes | — | services/live-interaction-participant-commands.js#itemAction | live-item-resolved:<interaction-id>:<item-id> | tests/live-interaction-platform.test.js |
| consented-live-delivery | live.item.persisted | yes | — | services/live-interaction-service.js#send | live-item-persisted:<interaction-id>:<item-id> | tests/live-interaction-platform.test.js |
