#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const releaseFiles = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root }
)
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
const forbiddenNames = [
    /(^|\/)\.env(?:\.|$)/,
    /(^|\/)cookie[^/]*\.txt$/i,
    /(^|\/)storage-state[^/]*\.json$/i,
    /(^|\/)\.claude\/settings\.local\.json$/
];
const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /postgres(?:ql)?:\/\/[^\s:/]+:[^\s@/]+@/i,
    /(?:SESSDATA|bili_jct|DedeUserID|DedeUserID__ckMd5)\s*[=:]\s*['"]?[A-Za-z0-9%._-]{16,}/
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
console.log(`Release-file secret check passed (${releaseFiles.length} files)`);
