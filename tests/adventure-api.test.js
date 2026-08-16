'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const routeSource = fs.readFileSync(path.join(root, 'routes/adventure.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/add_adventure_progression.sql'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'public/js/adventure.js'), 'utf8');

test('adventure mutations use the declared authenticated, capacity, CSRF, and idempotent contract', () => {
    for (const endpoint of ['start', 'action', 'abandon']) {
        const registration = new RegExp(
            `app\\.post\\('/api/adventure/${endpoint}',\\s*rejectWhenOverloaded,\\s*requireLogin,\\s*requireAuthorized,\\s*basicRateLimit,\\s*userActionRateLimit,\\s*csrfProtection`
        );
        assert.match(routeSource, registration);
    }
    assert.match(routeSource, /await req\.finalizeIdempotency\?\.\(client, 200, responseBody\)/);
    assert.ok(routeSource.indexOf('finalizeIdempotency') < routeSource.lastIndexOf("client.query('COMMIT')"));
});

test('adventure settlement is one-time, ledgered, and transactionally coupled to completion', () => {
    assert.match(migration, /UNIQUE \(username, chapter_id, rules_version\)/);
    assert.match(migration, /run_id UUID NOT NULL UNIQUE/);
    assert.match(routeSource, /ON CONFLICT \(username, chapter_id, rules_version\) DO NOTHING/);
    assert.match(routeSource, /operationType: 'adventure_reward'/);
    assert.match(routeSource, /managedTransaction: true/);
    assert.ok(routeSource.indexOf('INSERT INTO adventure_completions') < routeSource.indexOf("operationType: 'adventure_reward'"));
    assert.ok(routeSource.indexOf("operationType: 'adventure_reward'") < routeSource.lastIndexOf("client.query('COMMIT')"));
});

test('adventure persistence enforces one active run, revision sync, ownership, and bounded state', () => {
    assert.match(migration, /adventure_runs_one_active_per_user/);
    assert.match(migration, /octet_length\(state::text\) <= 262144/);
    assert.match(migration, /state->>'revision'\)::INTEGER = revision/);
    assert.match(routeSource, /WHERE id = \$1 AND username = \$2 AND status = 'active' AND revision = \$3/);
    assert.match(routeSource, /Buffer\.byteLength\(value, 'utf8'\) > MAX_STATE_BYTES/);
});

test('adventure responses are projected and action bodies reject hidden-state injection', () => {
    assert.match(routeSource, /engine\.projectState\(state\)/);
    assert.match(routeSource, /onlyKeys\(body, allowed\)/);
    assert.match(routeSource, /allowedByType/);
    assert.doesNotMatch(routeSource, /req\.body\.(?:username|state|reward|insight|hearts)/);
    assert.match(routeSource, /Cache-Control', 'private, no-store/);
});

test('adventure UI stays inside the production no-inline-style CSP', () => {
    assert.doesNotMatch(clientSource, /\.style\b|setAttribute\(\s*['"]style/);
    assert.match(clientSource, /elements\.progress\.value = run\.progress/);
});

test('chapter prerequisites are checked before an active run can be abandoned', () => {
    const prerequisiteCheck = routeSource.indexOf("if (chapter.prerequisiteChapterId)");
    const abandonExisting = routeSource.indexOf("if (existing) {", prerequisiteCheck);
    assert.ok(prerequisiteCheck > 0);
    assert.ok(abandonExisting > prerequisiteCheck);
    assert.match(routeSource, /'CHAPTER_LOCKED', '请先通关前置章节'/);
    assert.match(routeSource, /WHERE username = \$1 AND chapter_id = \$2 AND rules_version = \$3/);
});
