'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const {
    allowlist,
    assertSupportedNodeRuntime,
    createFileManifest,
    cyclonedxFromLock,
    inspectTarGzip,
    validatePortablePath,
    verifyManifest
} = require('../scripts/build-release');

function temporaryDirectory() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-test-'));
}

test('release path policy rejects traversal, Windows aliases, ADS, wildcards and Unicode ambiguity', () => {
    for (const accepted of [
        'public/js/app.js',
        'private/dictation-audio/001.wav',
        'content/星图.json'
    ]) assert.equal(validatePortablePath(accepted), accepted);
    for (const rejected of [
        '../escape',
        'safe/../../escape',
        'C:\\escape',
        'safe\\..\\escape',
        'name:stream',
        'bad?.js',
        'bad*.js',
        'CON',
        'CON.txt',
        'CON:',
        'COM¹',
        'LPT².txt',
        'CONIN$',
        'CONOUT$.txt',
        'CLOCK$',
        'bidi-\u202ereversed.js',
        'isolate-\u2066name.js',
        'joiner-\u200dname.js',
        'control-\u0085name.js',
        'Greek-Σ.js',
        'Greek-ς.js',
        'debug.log.1',
        'debug.log.gz',
        'logs/runtime.txt',
        'build/generated.js',
        '.cache/value.bin',
        'workers/bilibili/auth.json',
        'workers/bilibili/session.cookie',
        'workers/bilibili/session.cookies',
        'trailing. ',
        'decomposed-e\u0301.txt',
        'replacement-\ufffd.txt',
        'node_modules/library.js',
        'private/uploads/evidence.png'
    ]) assert.throws(() => validatePortablePath(rejected), /Release path|Forbidden release/,
        rejected);
});

test('file manifest and SHA256SUMS detect changed bytes and omit self-reference', () => {
    const directory = temporaryDirectory();
    try {
        fs.mkdirSync(path.join(directory, 'domain'));
        fs.writeFileSync(path.join(directory, 'domain', 'engine.js'), 'module.exports = 1;\n');
        const manifest = createFileManifest(directory);
        fs.writeFileSync(path.join(directory, 'FILE-MANIFEST.json'),
            `${JSON.stringify(manifest, null, 2)}\n`);
        fs.writeFileSync(path.join(directory, 'SHA256SUMS'),
            `${manifest.files.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n')}\n`);
        assert.equal(verifyManifest(directory).files.length, 1);
        assert.equal(manifest.files[0].mode, '0644');
        assert.ok(manifest.files.every((entry) => !['FILE-MANIFEST.json', 'SHA256SUMS']
            .includes(entry.path)));
        fs.appendFileSync(path.join(directory, 'domain', 'engine.js'), '// tampered\n');
        assert.throws(() => verifyManifest(directory), /does not match staged bytes/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('embedded CycloneDX inventory is lockfile-derived and excludes dev-only packages', () => {
    const directory = temporaryDirectory();
    try {
        fs.mkdirSync(path.join(directory, 'workers', 'bilibili'), { recursive: true });
        fs.writeFileSync(path.join(directory, 'workers', 'bilibili', 'requirements.txt'),
            'Flask==3.1.1\nrequests==2.32.4\n');
        fs.writeFileSync(path.join(directory, 'workers', 'bilibili', 'requirements.lock'),
            `Flask==3.1.1 \\\n    --hash=sha256:${'a'.repeat(64)}\n    # via -r workers/bilibili/requirements.txt\nrequests==2.32.4 \\\n    --hash=sha256:${'b'.repeat(64)}\n    # via -r workers/bilibili/requirements.txt\n`);
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
            name: 'fixture-app', version: '1.0.0'
        }));
        fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify({
            lockfileVersion: 3,
            packages: {
                '': { dependencies: { runtime: '1.0.0' }, devDependencies: { tooling: '2.0.0' } },
                'node_modules/runtime': {
                    version: '1.0.0',
                    integrity: `sha512-${Buffer.alloc(64, 7).toString('base64')}`,
                    dependencies: { nested: '3.0.0' },
                    optionalDependencies: { optional: '4.0.0' },
                    license: 'MIT'
                },
                'node_modules/runtime/node_modules/nested': {
                    version: '3.0.0',
                    integrity: `sha512-${Buffer.alloc(64, 9).toString('base64')}`
                },
                'node_modules/optional': {
                    version: '4.0.0',
                    integrity: `sha512-${Buffer.alloc(64, 11).toString('base64')}`
                },
                'node_modules/tooling': { version: '2.0.0', dev: true }
            }
        }));
        const bom = cyclonedxFromLock(directory, {
            commit: 'a'.repeat(40), dirty: false, sourceDateEpoch: 1700000000
        });
        assert.equal(bom.bomFormat, 'CycloneDX');
        assert.equal(bom.specVersion, '1.5');
        assert.deepEqual(bom.components.map((item) => item.name).sort(),
            ['Flask', 'nested', 'optional', 'requests', 'runtime'].sort());
        const runtime = bom.components.find((item) => item.name === 'runtime');
        assert.equal(runtime.hashes[0].alg, 'SHA-512');
        assert.equal(bom.dependencies[0].dependsOn.length, 3);
        assert.deepEqual(bom.dependencies.find((item) => item.ref === runtime['bom-ref']).dependsOn,
            ['pkg:npm/nested@3.0.0', 'pkg:npm/optional@4.0.0']);
        assert.doesNotMatch(JSON.stringify(bom), /tooling/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('SBOM generation rejects malformed production integrity and unpinned Python dependencies', () => {
    const directory = temporaryDirectory();
    try {
        fs.mkdirSync(path.join(directory, 'workers', 'bilibili'), { recursive: true });
        fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({
            name: 'fixture-app', version: '1.0.0'
        }));
        fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify({
            lockfileVersion: 3,
            packages: {
                '': { dependencies: { runtime: '1.0.0' } },
                'node_modules/runtime': {
                    version: '1.0.0',
                    integrity: `sha512-${Buffer.from('short').toString('base64')}`
                }
            }
        }));
        fs.writeFileSync(path.join(directory, 'workers', 'bilibili', 'requirements.txt'),
            'Flask==3.1.1\n');
        fs.writeFileSync(path.join(directory, 'workers', 'bilibili', 'requirements.lock'),
            `Flask==3.1.1 \\\n    --hash=sha256:${'a'.repeat(64)}\n    # via -r workers/bilibili/requirements.txt\n`);
        const identity = { commit: 'a'.repeat(40), dirty: false, sourceDateEpoch: 1700000000 };
        assert.throws(() => cyclonedxFromLock(directory, identity), /invalid integrity/);
        const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
        lock.packages['node_modules/runtime'].integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
        fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify(lock));
        fs.writeFileSync(path.join(directory, 'workers', 'bilibili', 'requirements.txt'),
            'Flask>=3\n');
        assert.throws(() => cyclonedxFromLock(directory, identity), /exactly pinned/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('formal release tooling refuses unsupported Node runtimes', () => {
    assert.throws(() => assertSupportedNodeRuntime('18.20.0'), /Node\.js 20 or newer/);
    assert.equal(assertSupportedNodeRuntime('20.20.2'), true);
    assert.equal(assertSupportedNodeRuntime('24.1.0'), true);
});

test('archive preflight rejects links before extraction', () => {
    const directory = temporaryDirectory();
    try {
        const release = path.join(directory, 'release');
        fs.mkdirSync(release, { mode: 0o755 });
        fs.chmodSync(release, 0o755);
        fs.writeFileSync(path.join(release, 'server.js'), 'module.exports = true;\n', { mode: 0o644 });
        fs.symlinkSync('server.js', path.join(release, 'alias.js'));
        const archive = path.join(directory, 'unsafe.tar.gz');
        execFileSync('tar', [
            '--owner=0', '--group=0', '--numeric-owner', '--format=ustar',
            '-czf', archive, '-C', directory, 'release'
        ]);
        assert.throws(() => inspectTarGzip(archive), /unsupported entry type/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('archive preflight rejects non-normalized file permissions', () => {
    const directory = temporaryDirectory();
    try {
        const release = path.join(directory, 'release');
        fs.mkdirSync(release, { mode: 0o755 });
        const executable = path.join(release, 'server.js');
        fs.writeFileSync(executable, 'module.exports = true;\n', { mode: 0o755 });
        fs.chmodSync(executable, 0o755);
        const archive = path.join(directory, 'unsafe-mode.tar.gz');
        execFileSync('tar', [
            '--owner=0', '--group=0', '--numeric-owner', '--format=ustar',
            '-czf', archive, '-C', directory, 'release'
        ]);
        assert.throws(() => inspectTarGzip(archive), /metadata is not normalized/);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('runtime allowlist includes dynamic workers and immutable dictation assets only', () => {
    assert.ok(allowlist.includes('workers'));
    assert.ok(allowlist.includes('private/dictation-audio'));
    assert.ok(allowlist.includes('bilibili-cookie-manager.js'));
    assert.ok(allowlist.includes('scripts/bilibili-cookie-dpapi.ps1'));
    assert.ok(!allowlist.includes('private'));
    assert.ok(!allowlist.includes('tests'));
});
