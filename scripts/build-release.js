#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const buildRoot = path.join(root, 'build');
const target = path.join(buildRoot, 'release');
const artifactDirectory = path.join(buildRoot, 'artifacts');
const allowlist = Object.freeze([
    'package.json', 'package-lock.json', 'server.js', 'db.js', 'i18n.js',
    'session-manager.js', 'ip-manager.js', 'balance-logger.js', 'gift-codes.json',
    'bilibili_gift_sender.py', 'windows-gift-listener.js', 'bilibili-cookie-manager.js',
    'README.md', 'SECURITY.md', 'render.yaml',
    'docs/ARCHITECTURE.md', 'docs/DATABASE_ROLES.md', 'docs/GAME_ECONOMICS.md',
    'docs/STREAMER_WORLD_OPERATIONS.md', 'docs/THIRD_PARTY_NOTICES.md',
    'app', 'data', 'domain', 'content', 'lib', 'middleware', 'migrations', 'public', 'repositories',
    'routes', 'services', 'views', 'workers', 'private/dictation-audio',
    'scripts/run-migrations.js', 'scripts/check-secrets.js',
    'scripts/bilibili-cookie-dpapi.ps1'
]);

const FORBIDDEN_SEGMENTS = new Set([
    '.git', 'node_modules', '__pycache__', 'coverage', 'dist', 'test-results',
    'playwright-report', 'uploads', 'build', '.cache', 'cache', 'log', 'logs'
]);
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/iu;
const GENERATED_MANIFESTS = new Set(['FILE-MANIFEST.json', 'SHA256SUMS']);
const MINIMUM_NODE_MAJOR = 20;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(filename) {
    return sha256(fs.readFileSync(filename));
}

function commandText(command, args, options = {}) {
    return execFileSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options
    }).trim();
}

function assertSupportedNodeRuntime(version = process.versions.node) {
    const nodeMajor = Number(String(version).split('.')[0]);
    if (!Number.isSafeInteger(nodeMajor) || nodeMajor < MINIMUM_NODE_MAJOR) {
        throw new Error(`Release builds require Node.js ${MINIMUM_NODE_MAJOR} or newer`);
    }
    return true;
}

function releaseIdentity(environment = process.env) {
    assertSupportedNodeRuntime();
    const commit = commandText('git', ['rev-parse', 'HEAD']);
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error('Release commit identity is invalid');
    const dirtyOutput = commandText('git', ['status', '--porcelain=v1', '--untracked-files=all']);
    const dirty = dirtyOutput.length > 0;
    if (environment.RELEASE_REQUIRE_CLEAN === 'true' && dirty) {
        throw new Error('A formal release requires a clean Git worktree');
    }
    const configuredEpoch = environment.SOURCE_DATE_EPOCH;
    const epochText = configuredEpoch || commandText('git', ['show', '-s', '--format=%ct', commit]);
    if (!/^\d{1,12}$/.test(epochText) || Number(epochText) < 1) {
        throw new Error('SOURCE_DATE_EPOCH is invalid');
    }
    return Object.freeze({ commit, dirty, sourceDateEpoch: Number(epochText) });
}

function portableRelative(relative) {
    return relative.split(path.sep).join('/');
}

function hasNonAsciiCaseMapping(value) {
    return [...value].some((character) => character.codePointAt(0) > 0x7f
        && character.toLocaleLowerCase('und') !== character.toLocaleUpperCase('und'));
}

function validatePortablePath(relative, collisionMap = null) {
    const portable = portableRelative(relative);
    if (!portable || portable.startsWith('/') || portable.includes('../')) {
        throw new Error(`Release path is unsafe: ${portable}`);
    }
    const segments = portable.split('/');
    for (const segment of segments) {
        if (!segment || segment === '.' || segment === '..'
            || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\ufffd]/u.test(segment)
            || /[<>:"\\|?*]/u.test(segment)
            || segment !== segment.normalize('NFC')
            || hasNonAsciiCaseMapping(segment)
            || /[. ]$/u.test(segment)
            || WINDOWS_DEVICE_NAME.test(segment)) {
            throw new Error(`Release path is not portable: ${portable}`);
        }
        if (FORBIDDEN_SEGMENTS.has(segment.toLowerCase())) {
            throw new Error(`Forbidden release path: ${portable}`);
        }
    }
    if (/\.log(?:\.|$)/iu.test(portable)
        || /\.(?:tmp|temp|bak|py[co])$/iu.test(portable)
        || /(?:^|\/)(?:auth\.json|cookies?\.json|[^/]+\.cookies?)$/iu.test(portable)
        || /(?:^|\/)\.env(?:\.|$)/iu.test(portable)) {
        throw new Error(`Forbidden release artifact: ${portable}`);
    }
    if (collisionMap) {
        const key = portable.normalize('NFC').toLowerCase();
        const previous = collisionMap.get(key);
        if (previous && previous !== portable) {
            throw new Error(`Release path case/Unicode collision: ${previous} <> ${portable}`);
        }
        collisionMap.set(key, portable);
    }
    return portable;
}

function trackedReleaseFiles() {
    const output = execFileSync('git', ['ls-files', '-z', '--cached', '--', ...allowlist], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const files = [...new Set(output.split('\0').filter(Boolean).map(portableRelative))].sort();
    const fileSet = new Set(files);
    for (const relative of allowlist) {
        const source = path.join(root, relative);
        if (!fs.existsSync(source)) throw new Error(`Release source is missing: ${relative}`);
        const stat = fs.lstatSync(source);
        const represented = stat.isDirectory()
            ? files.some((file) => file.startsWith(`${portableRelative(relative)}/`))
            : fileSet.has(portableRelative(relative));
        if (!represented) throw new Error(`Release source is not tracked in Git: ${relative}`);
    }
    for (const relative of files) {
        validatePortablePath(relative);
        const source = path.join(root, relative);
        const stat = fs.lstatSync(source);
        if (stat.isSymbolicLink() || !stat.isFile()) {
            throw new Error(`Tracked release source is not a regular file: ${relative}`);
        }
    }
    return Object.freeze(files);
}

function assertNoSymbolicLinks(source, relative) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
        throw new Error(`Release source must not contain symlinks: ${relative}`);
    }
    if (isPythonCache(relative, stat)) return;
    validatePortablePath(relative);
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(source).sort()) {
        assertNoSymbolicLinks(path.join(source, name), path.join(relative, name));
    }
}

function isPythonCache(relative, stat) {
    return (stat.isDirectory() && path.basename(relative).toLowerCase() === '__pycache__')
        || (stat.isFile() && /\.py[co]$/i.test(relative));
}

function copyReleaseEntry(source, destination, relative) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
        throw new Error(`Release source must not contain symlinks: ${relative}`);
    }
    if (isPythonCache(relative, stat)) return;
    validatePortablePath(relative);
    if (stat.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true, mode: 0o755 });
        fs.chmodSync(destination, 0o755);
        for (const name of fs.readdirSync(source).sort()) {
            copyReleaseEntry(
                path.join(source, name),
                path.join(destination, name),
                path.join(relative, name)
            );
        }
        return;
    }
    if (!stat.isFile()) throw new Error(`Unsupported release source type: ${relative}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o755 });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, 0o644);
}

function walkFiles(directory, callback) {
    for (const name of fs.readdirSync(directory).sort()) {
        const entry = path.join(directory, name);
        const stat = fs.lstatSync(entry);
        if (stat.isSymbolicLink()) {
            throw new Error(`Release staging must not contain symlinks: ${path.relative(directory, entry)}`);
        }
        if (stat.isDirectory()) walkFiles(entry, callback);
        else if (stat.isFile()) callback(entry, stat);
        else throw new Error(`Unsupported staged filesystem entry: ${entry}`);
    }
}

function validateStagedTree(releaseRoot) {
    const collisions = new Map();
    const visit = (directory) => {
        for (const name of fs.readdirSync(directory).sort()) {
            const entry = path.join(directory, name);
            const relative = path.relative(releaseRoot, entry);
            validatePortablePath(relative, collisions);
            const stat = fs.lstatSync(entry);
            if (stat.isSymbolicLink()) throw new Error(`Release contains symlink: ${relative}`);
            if (stat.isDirectory()) visit(entry);
            else if (!stat.isFile()) throw new Error(`Release contains special file: ${relative}`);
        }
    };
    visit(releaseRoot);
}

function isFile(candidate) {
    try {
        return fs.statSync(candidate).isFile();
    } catch {
        return false;
    }
}

function verifyRelativeJavaScriptDependencies(releaseRoot) {
    const unresolved = [];
    walkFiles(releaseRoot, (file) => {
        if (!/\.(?:cjs|js)$/i.test(file)) return;
        const source = fs.readFileSync(file, 'utf8');
        const relativeRequire = /require\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
        for (const match of source.matchAll(relativeRequire)) {
            const request = match[1];
            const base = path.resolve(path.dirname(file), request);
            const relativeBase = path.relative(releaseRoot, base);
            if (relativeBase.startsWith(`..${path.sep}`) || path.isAbsolute(relativeBase)) {
                unresolved.push(`${path.relative(releaseRoot, file)} -> ${request} (outside release)`);
                continue;
            }
            const candidates = [
                base, `${base}.js`, `${base}.cjs`, `${base}.json`,
                path.join(base, 'index.js'), path.join(base, 'index.cjs')
            ];
            if (!candidates.some(isFile)) {
                unresolved.push(`${path.relative(releaseRoot, file)} -> ${request}`);
            }
        }
    });
    if (unresolved.length > 0) {
        throw new Error(`Release has unresolved relative dependencies:\n${unresolved.join('\n')}`);
    }
}

function migrationLedger(releaseRoot) {
    // Loading this module has no environment or database side effects.
    const { BASE_MIGRATION, MIGRATIONS } = require('../lib/database-migrations');
    const names = [BASE_MIGRATION, ...MIGRATIONS];
    const entries = names.map((filename) => {
        const migrationPath = path.join(releaseRoot, 'migrations', filename);
        if (!isFile(migrationPath)) throw new Error(`Release is missing migration: ${filename}`);
        return Object.freeze({ filename, sha256: sha256File(migrationPath) });
    });
    return Object.freeze({
        count: entries.length,
        latest: entries.at(-1).filename,
        combinedSha256: sha256(entries.map((entry) =>
            `${entry.filename}:${entry.sha256}\n`).join('')),
        entries: Object.freeze(entries)
    });
}

function integrityHash(integrity) {
    if (typeof integrity !== 'string') return null;
    const match = /^(sha256|sha384|sha512)-([A-Za-z0-9+/=]+)$/.exec(integrity);
    if (!match) return null;
    const decoded = Buffer.from(match[2], 'base64');
    const expectedLength = { sha256: 32, sha384: 48, sha512: 64 }[match[1]];
    if (decoded.length !== expectedLength || decoded.toString('base64') !== match[2]) return null;
    return {
        alg: match[1].toUpperCase().replace('SHA', 'SHA-'),
        content: decoded.toString('hex')
    };
}

function packageNameFromLockPath(lockPath, entry) {
    if (entry.name) return entry.name;
    const marker = 'node_modules/';
    const index = lockPath.lastIndexOf(marker);
    return index < 0 ? null : lockPath.slice(index + marker.length);
}

function npmPurl(name, version) {
    const encoded = name.startsWith('@')
        ? `%40${encodeURIComponent(name.slice(1).split('/')[0])}/${encodeURIComponent(name.split('/')[1])}`
        : encodeURIComponent(name);
    return `pkg:npm/${encoded}@${encodeURIComponent(version)}`;
}

function pypiPurl(name, version) {
    return `pkg:pypi/${encodeURIComponent(name.toLowerCase().replace(/_/g, '-'))}@${encodeURIComponent(version)}`;
}

function normalizePythonName(name) {
    return name.toLowerCase().replace(/[_.]+/g, '-');
}

function pythonComponents(releaseRoot) {
    const inputPath = path.join(releaseRoot, 'workers', 'bilibili', 'requirements.txt');
    const lockPath = path.join(releaseRoot, 'workers', 'bilibili', 'requirements.lock');
    if (!isFile(inputPath) || !isFile(lockPath)) {
        throw new Error('Release is missing Python worker requirements or lockfile');
    }
    const requested = new Map();
    for (const [index, rawLine] of fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = /^([A-Za-z0-9._-]+)==([A-Za-z0-9][A-Za-z0-9.+_-]*)$/.exec(line);
        if (!match) throw new Error(`Python requirement must be exactly pinned at line ${index + 1}`);
        requested.set(normalizePythonName(match[1]), match[2]);
    }
    const entries = [];
    let current = null;
    let collectingVia = false;
    const finish = () => {
        if (!current) return;
        if (current.hashes.length === 0) {
            throw new Error(`Locked Python requirement has no SHA-256 hashes: ${current.name}`);
        }
        entries.push(current);
        current = null;
        collectingVia = false;
    };
    for (const [index, rawLine] of fs.readFileSync(lockPath, 'utf8').split(/\r?\n/).entries()) {
        const packageMatch = /^([A-Za-z0-9._-]+)==([A-Za-z0-9][A-Za-z0-9.+_-]*)\s*\\?$/.exec(rawLine);
        if (packageMatch) {
            finish();
            current = { name: packageMatch[1], version: packageMatch[2], hashes: [], via: [] };
            continue;
        }
        const hashMatch = /^\s+--hash=sha256:([a-f0-9]{64})\s*\\?$/.exec(rawLine);
        if (hashMatch && current) {
            current.hashes.push(hashMatch[1]);
            continue;
        }
        const comment = rawLine.trim();
        if (!comment || comment.startsWith('#') && !current) continue;
        if (current && comment === '# via') {
            collectingVia = true;
            continue;
        }
        if (current && comment.startsWith('# via ')) {
            current.via.push(comment.slice('# via '.length).trim());
            collectingVia = false;
            continue;
        }
        if (current && collectingVia && comment.startsWith('#')) {
            current.via.push(comment.slice(1).trim());
            continue;
        }
        if (current && comment.startsWith('#')) continue;
        throw new Error(`Malformed Python lockfile at line ${index + 1}`);
    }
    finish();
    if (entries.length === 0 || requested.size === 0) throw new Error('Python worker requirements are empty');
    const byName = new Map(entries.map((entry) => [normalizePythonName(entry.name), entry]));
    for (const [name, version] of requested) {
        if (byName.get(name)?.version !== version) {
            throw new Error(`Python lockfile does not match direct requirement: ${name}`);
        }
    }
    const components = entries.map((entry) => {
        const ref = pypiPurl(entry.name, entry.version);
        return {
            type: 'library',
            'bom-ref': ref,
            name: entry.name,
            version: entry.version,
            purl: ref,
            properties: [
                { name: 'minimal-games:requirements-path', value: 'workers/bilibili/requirements.lock' },
                { name: 'minimal-games:distribution-hash-count', value: String(entry.hashes.length) }
            ]
        };
    });
    const references = new Map(entries.map((entry) => [normalizePythonName(entry.name),
        pypiPurl(entry.name, entry.version)]));
    const graph = new Map(components.map((component) => [component['bom-ref'], new Set()]));
    const directRefs = new Set();
    for (const entry of entries) {
        const childRef = references.get(normalizePythonName(entry.name));
        for (const source of entry.via) {
            if (source.startsWith('-r ')) {
                directRefs.add(childRef);
                continue;
            }
            const parentRef = references.get(normalizePythonName(source));
            if (!parentRef) throw new Error(`Python lockfile has unknown dependency source: ${source}`);
            graph.get(parentRef).add(childRef);
        }
    }
    for (const name of requested.keys()) directRefs.add(references.get(name));
    return Object.freeze({
        components: Object.freeze(components),
        directRefs: Object.freeze([...directRefs].sort()),
        dependencies: Object.freeze([...graph.entries()].map(([ref, dependsOn]) => ({
            ref, dependsOn: [...dependsOn].sort()
        })).sort((a, b) => a.ref.localeCompare(b.ref)))
    });
}

function resolveLockedDependency(packages, lockPath, dependencyName) {
    let current = lockPath;
    while (true) {
        const candidate = current
            ? `${current}/node_modules/${dependencyName}`
            : `node_modules/${dependencyName}`;
        if (packages[candidate]?.version) return candidate;
        const marker = current.lastIndexOf('/node_modules/');
        if (marker >= 0) {
            current = current.slice(0, marker);
        } else if (current.startsWith('node_modules/')) {
            current = '';
        } else {
            return null;
        }
    }
}

function cyclonedxFromLock(releaseRoot, identity) {
    const lock = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'package-lock.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(releaseRoot, 'package.json'), 'utf8'));
    if (!lock.packages || typeof lock.packages !== 'object') {
        throw new Error('package-lock.json does not contain a packages inventory');
    }
    const componentsByRef = new Map();
    const dependencyRefs = new Map();
    for (const [lockPath, entry] of Object.entries(lock.packages)) {
        if (!lockPath || entry.dev === true || !entry.version) continue;
        const name = packageNameFromLockPath(lockPath, entry);
        if (!name) throw new Error(`Cannot identify locked package: ${lockPath}`);
        const ref = npmPurl(name, entry.version);
        const hash = integrityHash(entry.integrity);
        if (!hash) throw new Error(`Production package has missing or invalid integrity: ${lockPath}`);
        let component = componentsByRef.get(ref);
        if (!component) component = {
            type: 'library',
            'bom-ref': ref,
            name,
            version: entry.version,
            purl: ref,
            hashes: [hash],
            properties: [{ name: 'minimal-games:lock-path', value: lockPath }]
        };
        if (typeof entry.license === 'string' && entry.license) {
            component.licenses = [{ license: { id: entry.license } }];
        }
        if (typeof entry.resolved === 'string' && /^https:\/\//.test(entry.resolved)) {
            component.externalReferences = [{ type: 'distribution', url: entry.resolved }];
        }
        componentsByRef.set(ref, component);
        const dependencies = dependencyRefs.get(ref) || new Set();
        const declaredDependencies = new Set([
            ...Object.keys(entry.dependencies || {}),
            ...Object.keys(entry.optionalDependencies || {})
        ]);
        for (const dependencyName of declaredDependencies) {
            const resolvedPath = resolveLockedDependency(lock.packages, lockPath, dependencyName);
            if (!resolvedPath) {
                if (Object.hasOwn(entry.optionalDependencies || {}, dependencyName)) continue;
                throw new Error(`Cannot resolve locked dependency: ${lockPath} -> ${dependencyName}`);
            }
            const resolved = lock.packages[resolvedPath];
            dependencies.add(npmPurl(packageNameFromLockPath(resolvedPath, resolved), resolved.version));
        }
        dependencyRefs.set(ref, dependencies);
    }
    const python = pythonComponents(releaseRoot);
    const directDependencies = Object.keys(lock.packages['']?.dependencies || {})
        .map((name) => {
            const entry = lock.packages[`node_modules/${name}`];
            return entry?.version ? npmPurl(name, entry.version) : null;
        })
        .filter(Boolean)
        .sort();
    const serialHex = sha256(`${identity.commit}:${sha256File(path.join(releaseRoot, 'package-lock.json'))}`)
        .slice(0, 32);
    const serial = `${serialHex.slice(0, 8)}-${serialHex.slice(8, 12)}-5${serialHex.slice(13, 16)}`
        + `-a${serialHex.slice(17, 20)}-${serialHex.slice(20)}`;
    const rootRef = `pkg:npm/${encodeURIComponent(manifest.name)}@${encodeURIComponent(manifest.version)}`;
    return {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        serialNumber: `urn:uuid:${serial}`,
        version: 1,
        metadata: {
            timestamp: new Date(identity.sourceDateEpoch * 1000).toISOString(),
            component: {
                type: 'application',
                'bom-ref': rootRef,
                name: manifest.name,
                version: manifest.version,
                purl: rootRef,
                properties: [
                    { name: 'minimal-games:git-commit', value: identity.commit },
                    { name: 'minimal-games:git-dirty', value: String(identity.dirty) }
                ]
            }
        },
        components: [...componentsByRef.values(), ...python.components].sort((a, b) =>
            a['bom-ref'].localeCompare(b['bom-ref'])),
        dependencies: [
            { ref: rootRef, dependsOn: [...directDependencies, ...python.directRefs].sort() },
            ...[...dependencyRefs.entries()].map(([ref, dependsOn]) => ({
                ref,
                dependsOn: [...dependsOn].sort()
            })).sort((a, b) => a.ref.localeCompare(b.ref)),
            ...python.dependencies
        ]
    };
}

function writeJson(filename, value) {
    fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o644 });
    fs.chmodSync(filename, 0o644);
}

function createFileManifest(releaseRoot) {
    const files = [];
    walkFiles(releaseRoot, (file, stat) => {
        const relative = portableRelative(path.relative(releaseRoot, file));
        if (GENERATED_MANIFESTS.has(relative)) return;
        files.push({
            path: relative,
            bytes: stat.size,
            // The source workspace may be mounted through Windows/DrvFS where
            // chmod is not faithfully represented. The archive builder copies
            // into a native temporary tree and enforces this portable mode.
            mode: '0644',
            sha256: sha256File(file)
        });
    });
    files.sort((a, b) => a.path.localeCompare(b.path));
    return Object.freeze({ schemaVersion: 1, algorithm: 'SHA-256', files });
}

function writeAndVerifyManifest(releaseRoot) {
    const manifest = createFileManifest(releaseRoot);
    writeJson(path.join(releaseRoot, 'FILE-MANIFEST.json'), manifest);
    fs.writeFileSync(path.join(releaseRoot, 'SHA256SUMS'), `${manifest.files
        .map((entry) => `${entry.sha256}  ${entry.path}`).join('\n')}\n`, { mode: 0o644 });
    fs.chmodSync(path.join(releaseRoot, 'SHA256SUMS'), 0o644);
    verifyManifest(releaseRoot);
    return manifest;
}

function verifyManifest(releaseRoot) {
    const manifestPath = path.join(releaseRoot, 'FILE-MANIFEST.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const actual = createFileManifest(releaseRoot);
    if (JSON.stringify(manifest) !== JSON.stringify(actual)) {
        throw new Error('Release file manifest does not match staged bytes');
    }
    const sums = fs.readFileSync(path.join(releaseRoot, 'SHA256SUMS'), 'utf8');
    const expectedSums = `${actual.files.map((entry) =>
        `${entry.sha256}  ${entry.path}`).join('\n')}\n`;
    if (sums !== expectedSums) throw new Error('Release SHA256SUMS does not match file manifest');
    return manifest;
}

function createArchive(releaseRoot, identity) {
    fs.rmSync(artifactDirectory, { recursive: true, force: true });
    fs.mkdirSync(artifactDirectory, { recursive: true, mode: 0o755 });
    const shortCommit = identity.commit.slice(0, 12);
    const archiveName = `minimal-games-site-${shortCommit}.tar.gz`;
    const archivePath = path.join(artifactDirectory, archiveName);
    const temporaryTar = path.join(artifactDirectory, `.${archiveName}.tar`);
    const normalizedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-games-archive-'));
    try {
        copyReleaseEntry(releaseRoot, path.join(normalizedRoot, 'release'), 'release');
        execFileSync('tar', [
            '--sort=name', `--mtime=@${identity.sourceDateEpoch}`,
            '--owner=0', '--group=0', '--numeric-owner', '--format=ustar',
            '-cf', temporaryTar, '-C', normalizedRoot, 'release'
        ], { cwd: root, stdio: 'inherit' });
        fs.writeFileSync(archivePath, zlib.gzipSync(fs.readFileSync(temporaryTar), {
            level: 9,
            mtime: 0
        }), { mode: 0o644 });
    } finally {
        fs.rmSync(temporaryTar, { force: true });
        fs.rmSync(normalizedRoot, { recursive: true, force: true });
    }
    const descriptor = {
        schemaVersion: 1,
        archive: archiveName,
        bytes: fs.statSync(archivePath).size,
        sha256: sha256File(archivePath),
        commit: identity.commit,
        dirty: identity.dirty,
        sourceDateEpoch: identity.sourceDateEpoch
    };
    writeJson(path.join(artifactDirectory, 'RELEASE-ARCHIVE.json'), descriptor);
    return { archivePath, descriptor };
}

function readTarString(buffer, start, length) {
    const field = buffer.subarray(start, start + length);
    const end = field.indexOf(0);
    return field.subarray(0, end < 0 ? field.length : end).toString('utf8');
}

function readTarOctal(buffer, start, length, label) {
    const value = readTarString(buffer, start, length).trim();
    if (!/^[0-7]+$/.test(value)) throw new Error(`Release archive has invalid ${label}`);
    const parsed = Number.parseInt(value, 8);
    if (!Number.isSafeInteger(parsed) || parsed < 0) {
        throw new Error(`Release archive has unsafe ${label}`);
    }
    return parsed;
}

function inspectTarGzip(archivePath, expected = {}) {
    const compressedSize = fs.statSync(archivePath).size;
    if (compressedSize < 1 || compressedSize > MAX_ARCHIVE_BYTES) {
        throw new Error('Release archive compressed size is unsafe');
    }
    const archive = zlib.gunzipSync(fs.readFileSync(archivePath), {
        maxOutputLength: MAX_ARCHIVE_BYTES
    });
    const collisions = new Map();
    const entries = [];
    let offset = 0;
    let zeroBlocks = 0;
    while (offset + 512 <= archive.length) {
        const header = archive.subarray(offset, offset + 512);
        if (header.every((byte) => byte === 0)) {
            zeroBlocks += 1;
            offset += 512;
            if (zeroBlocks === 2) break;
            continue;
        }
        if (zeroBlocks !== 0) throw new Error('Release archive has data after a zero block');
        const storedChecksum = readTarOctal(header, 148, 8, 'header checksum');
        let calculatedChecksum = 0;
        for (let index = 0; index < header.length; index += 1) {
            calculatedChecksum += (index >= 148 && index < 156) ? 0x20 : header[index];
        }
        if (storedChecksum !== calculatedChecksum) throw new Error('Release archive header checksum mismatch');
        const name = readTarString(header, 0, 100);
        const prefix = readTarString(header, 345, 155);
        const rawPath = prefix ? `${prefix}/${name}` : name;
        const type = String.fromCharCode(header[156] || 0x30);
        if (!['0', '5'].includes(type)) {
            throw new Error(`Release archive contains unsupported entry type: ${rawPath}`);
        }
        const mode = readTarOctal(header, 100, 8, 'entry mode');
        const uid = readTarOctal(header, 108, 8, 'entry uid');
        const gid = readTarOctal(header, 116, 8, 'entry gid');
        const mtime = readTarOctal(header, 136, 12, 'entry mtime');
        const expectedMode = type === '5' ? 0o755 : 0o644;
        if ((mode & 0o7777) !== expectedMode || uid !== 0 || gid !== 0) {
            throw new Error(`Release archive metadata is not normalized: ${rawPath}`);
        }
        if (expected.sourceDateEpoch !== undefined && mtime !== expected.sourceDateEpoch) {
            throw new Error(`Release archive timestamp is not normalized: ${rawPath}`);
        }
        const size = readTarOctal(header, 124, 12, 'entry size');
        if (type === '5' && size !== 0) throw new Error(`Release archive directory has data: ${rawPath}`);
        const normalizedPath = rawPath.replace(/\/$/, '');
        if (normalizedPath !== 'release') {
            if (!normalizedPath.startsWith('release/')) {
                throw new Error(`Release archive entry escapes root: ${rawPath}`);
            }
            validatePortablePath(normalizedPath.slice('release/'.length), collisions);
        }
        if (entries.includes(normalizedPath)) {
            throw new Error(`Release archive contains duplicate entry: ${normalizedPath}`);
        }
        entries.push(normalizedPath);
        const paddedSize = Math.ceil(size / 512) * 512;
        offset += 512 + paddedSize;
        if (offset > archive.length) throw new Error(`Release archive entry is truncated: ${rawPath}`);
    }
    if (zeroBlocks < 2 || !entries.includes('release')) {
        throw new Error('Release archive is incomplete');
    }
    if (archive.subarray(offset).some((byte) => byte !== 0)) {
        throw new Error('Release archive has non-zero trailing data');
    }
    return Object.freeze(entries);
}

function verifyCleanUnpack(archivePath, identity) {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'minimal-games-release-'));
    try {
        inspectTarGzip(archivePath, { sourceDateEpoch: identity.sourceDateEpoch });
        execFileSync('tar', ['-xzf', archivePath, '-C', temporary], {
            cwd: root,
            stdio: 'inherit'
        });
        const unpacked = path.join(temporary, 'release');
        if (!fs.statSync(unpacked).isDirectory()) throw new Error('Release archive root is missing');
        validateStagedTree(unpacked);
        verifyRelativeJavaScriptDependencies(unpacked);
        verifyManifest(unpacked);
    } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
    }
}

function buildRelease() {
    const identity = releaseIdentity();
    const files = trackedReleaseFiles();

    fs.rmSync(target, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true, mode: 0o755 });
    for (const relative of files) {
        copyReleaseEntry(path.join(root, relative), path.join(target, relative), relative);
    }
    validateStagedTree(target);
    verifyRelativeJavaScriptDependencies(target);

    const ledger = migrationLedger(target);
    const sbom = cyclonedxFromLock(target, identity);
    writeJson(path.join(target, 'SBOM.cdx.json'), sbom);
    writeJson(path.join(target, 'RELEASE-METADATA.json'), {
        schemaVersion: 1,
        commit: identity.commit,
        dirty: identity.dirty,
        sourceDateEpoch: identity.sourceDateEpoch,
        createdAt: new Date(identity.sourceDateEpoch * 1000).toISOString(),
        node: process.version,
        npm: (() => {
            try { return commandText('npm', ['--version']); } catch { return 'unknown'; }
        })(),
        migrationLedger: ledger,
        sbom: { path: 'SBOM.cdx.json', sha256: sha256File(path.join(target, 'SBOM.cdx.json')) }
    });
    const manifest = writeAndVerifyManifest(target);

    execFileSync(process.execPath, [path.join(root, 'scripts', 'check-secrets.js'), target], {
        cwd: root,
        stdio: 'inherit'
    });
    const archive = createArchive(target, identity);
    verifyCleanUnpack(archive.archivePath, identity);
    console.log(`Release staging directory created: ${target}`);
    console.log(`Release files: ${manifest.files.length}`);
    console.log(`Release archive: ${archive.archivePath}`);
    console.log(`Release archive SHA-256: ${archive.descriptor.sha256}`);
    return { identity, ledger, manifest, ...archive };
}

if (require.main === module) buildRelease();

module.exports = {
    allowlist,
    assertSupportedNodeRuntime,
    buildRelease,
    createFileManifest,
    cyclonedxFromLock,
    inspectTarGzip,
    migrationLedger,
    releaseIdentity,
    trackedReleaseFiles,
    validatePortablePath,
    validateStagedTree,
    verifyManifest,
    verifyRelativeJavaScriptDependencies
};
