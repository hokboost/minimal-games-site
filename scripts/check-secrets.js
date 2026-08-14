#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const excludedDirectories = new Set(['.git', 'node_modules', 'build', 'dist', 'coverage']);
const releaseFiles = [];
function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (!excludedDirectories.has(entry.name)) walk(path.join(directory, entry.name), relative);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            releaseFiles.push(relative);
        }
    }
}
walk(root);
const forbiddenNames = [
    /(^|\/)\.env(?:\.|$)/,
    /(^|\/)cookie[^/]*\.txt$/i,
    /(^|\/)storage-state[^/]*\.json$/i,
    /(^|\/).*\.har$/i,
    /(^|\/).*\.log$/i,
    /(^|\/).*\.dpapi$/i,
    /(^|\/)browser-profile(?:\/|$)/i,
    /(^|\/)\.claude\/settings\.local\.json$/
];
const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/i,
    /(?:SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5)\s*[=:]\s*['"]?[A-Za-z0-9%._-]{16,}/,
    /\bgh[opsu]_[A-Za-z0-9_]{30,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/
];
const failures = [];

for (const filename of releaseFiles) {
    if (filename === '.env.example' || filename === 'scripts/check-secrets.js') continue;
    const fullPath = path.join(root, filename);
    if (!fs.existsSync(fullPath)) continue;
    if (forbiddenNames.some((pattern) => pattern.test(filename))) {
        failures.push(`${filename}: forbidden credential filename`);
        continue;
    }
    const stat = fs.lstatSync(fullPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 5 * 1024 * 1024) continue;
    const content = fs.readFileSync(fullPath, 'utf8');
    if (secretPatterns.some((pattern) => pattern.test(content))) {
        failures.push(`${filename}: possible embedded credential`);
    }
}

if (failures.length > 0) {
    process.stderr.write(`${failures.join('\n')}\n`);
    process.exit(1);
}
console.log(`Secret/artifact check passed (${releaseFiles.length} files under ${root})`);
