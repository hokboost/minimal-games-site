#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'build', 'release');
const allowlist = [
    'package.json', 'package-lock.json', 'server.js', 'db.js', 'i18n.js',
    'session-manager.js', 'ip-manager.js', 'balance-logger.js', 'gift-codes.json',
    'bilibili_gift_sender.py', 'windows-gift-listener.js',
    'README.md', 'SECURITY.md', 'render.yaml',
    'docs/ARCHITECTURE.md', 'docs/DATABASE_ROLES.md', 'docs/GAME_ECONOMICS.md',
    'docs/THIRD_PARTY_NOTICES.md',
    'app', 'data', 'domain', 'lib', 'middleware', 'migrations', 'public', 'routes', 'views',
    'workers/bilibili', 'scripts/run-migrations.js', 'scripts/check-secrets.js'
];

function assertNoSymbolicLinks(source, relative) {
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) {
        throw new Error(`Release source must not contain symlinks: ${relative}`);
    }
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
    if (stat.isDirectory()) {
        fs.mkdirSync(destination, { recursive: true, mode: stat.mode & 0o777 });
        for (const name of fs.readdirSync(source).sort()) {
            copyReleaseEntry(
                path.join(source, name),
                path.join(destination, name),
                path.join(relative, name)
            );
        }
        return;
    }
    if (!stat.isFile()) {
        throw new Error(`Unsupported release source type: ${relative}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    fs.chmodSync(destination, stat.mode & 0o777);
}

function walkFiles(directory, callback) {
    for (const name of fs.readdirSync(directory).sort()) {
        const entry = path.join(directory, name);
        const stat = fs.lstatSync(entry);
        if (stat.isSymbolicLink()) {
            throw new Error(`Release staging must not contain symlinks: ${path.relative(target, entry)}`);
        }
        if (stat.isDirectory()) walkFiles(entry, callback);
        else if (stat.isFile()) callback(entry);
    }
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
                base,
                `${base}.js`,
                `${base}.cjs`,
                `${base}.json`,
                path.join(base, 'index.js'),
                path.join(base, 'index.cjs')
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

for (const relative of allowlist) {
    const source = path.join(root, relative);
    assertNoSymbolicLinks(source, relative);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true, mode: 0o700 });
for (const relative of allowlist) {
    const source = path.join(root, relative);
    const destination = path.join(target, relative);
    copyReleaseEntry(source, destination, relative);
}
verifyRelativeJavaScriptDependencies(target);

execFileSync(process.execPath, [path.join(root, 'scripts', 'check-secrets.js'), target], {
    cwd: root,
    stdio: 'inherit'
});
console.log(`Release staging directory created: ${target}`);
