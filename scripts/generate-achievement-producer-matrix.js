'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    ACHIEVEMENT_PRODUCER_MATRIX,
    validateAchievementProducerMatrix
} = require('../domain/achievements/producer-matrix');
const { ACHIEVEMENTS } = require('../content/streamer-world/achievements/catalog');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'docs/streamer-expansion/ACHIEVEMENT_PRODUCER_MATRIX.md');

function methodPattern(method) {
    const escaped = method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:async\\s+)?${escaped}\\s*\\(`);
}

function validateProducerReferences(matrix = ACHIEVEMENT_PRODUCER_MATRIX) {
    for (const row of matrix) {
        const [relativeFile, method] = row.producer.split('#');
        const producerFile = path.join(ROOT, relativeFile);
        const integrationFile = path.join(ROOT, row.integrationTest);
        if (!fs.statSync(producerFile, { throwIfNoEntry: false })?.isFile()) {
            throw new Error(`Achievement producer file is missing: ${row.slug} -> ${relativeFile}`);
        }
        if (!methodPattern(method).test(fs.readFileSync(producerFile, 'utf8'))) {
            throw new Error(`Achievement producer method is missing: ${row.slug} -> ${row.producer}`);
        }
        if (!fs.statSync(integrationFile, { throwIfNoEntry: false })?.isFile()) {
            throw new Error(`Achievement integration test is missing: ${row.slug} -> ${row.integrationTest}`);
        }
    }
    return true;
}

function cell(value) {
    return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function renderMatrix(matrix = ACHIEVEMENT_PRODUCER_MATRIX) {
    const groups = new Map();
    for (const row of matrix) {
        const domain = row.eventType.split('.')[0];
        if (!groups.has(domain)) groups.set(domain, []);
        groups.get(domain).push(row);
    }
    const lines = [
        '# Achievement producer matrix',
        '',
        'This file is generated from the published 60-achievement catalog. Run `npm run check:achievement-matrix` after changing an achievement, trusted event, producer, or integration test.',
        '',
        `Published definitions: ${matrix.length}. Trusted event types: ${new Set(matrix.map(row => row.eventType)).size}.`,
        '',
        'A producer reference is accepted only when its service file, concrete method, and integration test all exist. Runtime event validation remains closed to the fields declared in `domain/achievements/rules.js`.',
        ''
    ];
    for (const [domain, rows] of groups) {
        lines.push(`## ${domain}`, '');
        lines.push('| Achievement | Event | Hidden | Distinct | Trusted producer | Immutable source identity | Integration test |');
        lines.push('|---|---|---:|---|---|---|---|');
        for (const row of rows) {
            lines.push(`| ${cell(row.slug)} | ${cell(row.eventType)} | ${row.hidden ? 'yes' : 'no'} | ${cell(row.distinctKey || '—')} | ${cell(row.producer)} | ${cell(row.sourceIdentity)} | ${cell(row.integrationTest)} |`);
        }
        lines.push('');
    }
    return `${lines.join('\n')}\n`;
}

function main(argv = process.argv.slice(2)) {
    validateAchievementProducerMatrix(ACHIEVEMENTS, ACHIEVEMENT_PRODUCER_MATRIX);
    validateProducerReferences();
    const rendered = renderMatrix();
    if (argv.includes('--check')) {
        const current = fs.readFileSync(OUTPUT, 'utf8');
        if (current !== rendered) throw new Error('Achievement producer matrix is stale; regenerate it');
        process.stdout.write(`Verified ${ACHIEVEMENT_PRODUCER_MATRIX.length} achievement producers.\n`);
        return;
    }
    fs.writeFileSync(OUTPUT, rendered, 'utf8');
    process.stdout.write(`Wrote ${path.relative(ROOT, OUTPUT)} with ${ACHIEVEMENT_PRODUCER_MATRIX.length} rows.\n`);
}

if (require.main === module) main();

module.exports = { OUTPUT, renderMatrix, validateProducerReferences };
