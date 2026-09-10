'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { SONGS, PRIZES, PILOT_USER_ID, JJ_SONG_IDS, YAO_SONG_IDS, canPlayDoorbell, selectSongs, isCorrect } = require('../domain/games/doorbell');
const { project, validate } = require('../services/doorbell-service');
const { randomUUID, createHash } = require('node:crypto');

test('pilot access uses database identity and current account eligibility', () => {
    const base = { authorized: true, is_admin: false, id: PILOT_USER_ID, username: 'renamed' };
    assert.equal(canPlayDoorbell(base), true);
    assert.equal(canPlayDoorbell({ ...base, id: 148, username: '一个乌龟酱' }), false);
    assert.equal(canPlayDoorbell({ ...base, id: 148, is_admin: true }), true);
    for (const change of [{ authorized: false }, { deactivated: true }, { account_locked: true }]) assert.equal(canPlayDoorbell({ ...base, ...change }), false);
    assert.equal(canPlayDoorbell(null), false);
});

test('eight unique doors fix door one and cover every Yao/JJ combination', () => {
    const tails = new Set();
    for (let i = 0; i < 100; i++) {
        const songs = selectSongs();
        assert.equal(songs.length, 8); assert.equal(new Set(songs).size, 8);
        assert.equal(songs[0], 'bad-wings');
        assert.ok(YAO_SONG_IDS.includes(songs[1]));
        assert.ok(JJ_SONG_IDS.includes(songs[2]));
        tails.add(songs.slice(3).join(','));
    }
    assert.ok(tails.size > 1);
    YAO_SONG_IDS.forEach((yao, yaoIndex) => JJ_SONG_IDS.forEach((jj, jjIndex) => {
        let call = 0;
        const songs = selectSongs(max => {
            call++;
            if (call === 1) { assert.equal(max, 2); return yaoIndex; }
            if (call === 2) { assert.equal(max, 3); return jjIndex; }
            return max - 1;
        });
        assert.deepEqual(songs.slice(0, 3), ['bad-wings', yao, jj]);
        assert.equal(songs.length, 8);
        assert.equal(new Set(songs).size, 8);
        assert.ok(!songs.slice(3).includes(yao));
        assert.ok(!songs.slice(3).includes(jj));
    }));
    assert.deepEqual(PRIZES, [1000, 2000, 3000, 5000, 10000, 15000, 20000, 30000]);
});

test('accept title punctuation, fullwidth digits and explicit traditional aliases, reject near misses', () => {
    assert.ok(isCorrect(SONGS[0], ' 《 壞翅膀 》 '));
    assert.ok(isCorrect(SONGS[4], '９９９朵玫瑰'));
    assert.equal(isCorrect(SONGS[0], '好翅膀'), false);
    assert.equal(isCorrect(SONGS[1], '唯独我们尧顺宇'), false);
    assert.throws(() => validate({ commandId: randomUUID(), runId: randomUUID(), revision: 0, type: 'answer', answer: '  《》' }), /填写歌名/);
    assert.throws(() => validate({ commandId: randomUUID(), reward: 30000 }, true), /无效字段/);
});

test('state exposes neither answers nor original media before reveal or help', () => {
    const raw = { id: randomUUID(), status: 'playing', completed: 0, revision: 0, song_ids: selectSongs(), original_door: null, hint_door: null, hint: null, results: [], settled_amount: 0 };
    const result = project(raw, 500);
    const text = JSON.stringify(result);
    for (const song of SONGS) { assert.ok(!text.includes(song.title)); assert.ok(!text.includes(song.id)); }
    assert.equal(result.run.current.bellPlayed, false);
    assert.equal(result.run.current.originalUrl, undefined);
    assert.equal(result.run.current.bellUrl, undefined);
    raw.hint_door = 1; raw.hint = { length: 3, index: 2, character: '膀' };
    assert.deepEqual(project(raw, 500).run.current.hint, raw.hint);
    raw.status = 'revealed'; raw.completed = 1; raw.results = [{ door: 1, correct: true }];
    assert.equal(project(raw, 500).run.results[0].credit, '翻唱');
    assert.equal(project(raw, 500).run.results[0].artist, '周菲戈');
    assert.ok(project(raw, 500).run.results[0].originalUrl.endsWith('/1/chorus'));
});

test('all private audio variants are packaged and never stored under public/', () => {
    const sources = require('../private/doorbell-audio/sources.json');
    for (const song of SONGS) for (const kind of ['bell', 'original', 'chorus']) {
        const file = `${song.id}-${kind}.mp3`;
        assert.ok(fs.statSync(path.join(__dirname, '../private/doorbell-audio', file)).size > 100000);
        assert.equal(fs.existsSync(path.join(__dirname, '../public', file)), false);
        const digest = createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../private/doorbell-audio', file))).digest('hex');
        assert.equal(digest, sources.find(source => source.id === song.id)[kind + 'Sha256']);
    }
});

test('catalog entry is absent from non-pilot HTML, including logged-out HTML', async () => {
    const filename = path.join(__dirname, '../views/partials/doorbell-entry.ejs');
    for (const doorbellVisible of [false, undefined]) assert.ok(!(await ejs.renderFile(filename, { doorbellVisible })).includes('/doorbell'));
    assert.match(await ejs.renderFile(filename, { doorbellVisible: true }), /保证前三首歌是直播间唱过的/);
});
