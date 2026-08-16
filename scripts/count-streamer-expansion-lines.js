#!/usr/bin/env node
'use strict';

/**
 * Verifies meaningful expansion work against a recorded Git base commit.
 *
 * This deliberately does not use raw `git diff --numstat` as the acceptance
 * signal. It excludes generated/vendor/bootstrap files, blank lines,
 * comment-only padding, binary files, exact copies of blobs that already
 * existed at the base commit, and documentation above a small credit cap.
 *
 * Usage:
 *   node scripts/count-streamer-expansion-lines.js
 *   node scripts/count-streamer-expansion-lines.js --base <commit>
 *   node scripts/count-streamer-expansion-lines.js --json
 *   node scripts/count-streamer-expansion-lines.js --enforce
 */

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DEFAULT_BASE_FILE = path.join(ROOT, 'docs', 'streamer-expansion', 'base-commit.txt');
const DOC_CREDIT_CAP = 2_000;

const THRESHOLDS = Object.freeze({
  totalAdded: 50_000,
  netGrowth: 40_000,
  backendAdded: 12_000,
  frontendAdded: 8_000,
  contentAdded: 16_000,
  testsAdded: 10_000,
  coreAdded: 36_000,
});

const BOOTSTRAP_PATHS = new Set([
  '.claude/agents/streamer-world-builder.md',
  'KICKOFF_PROMPT.md',
  'README_STREAMER_WORLD_AGENT.md',
  'docs/STREAMER_WORLD_REPOSITORY_AUDIT.md',
  'docs/STREAMER_WORLD_PRODUCT_BLUEPRINT.md',
  'docs/streamer-expansion/PROGRESS_TEMPLATE.md',
  'docs/streamer-expansion/PROGRESS.md',
  'docs/streamer-expansion/base-commit.txt',
  'scripts/count-streamer-expansion-lines.js',
]);

const EXCLUDED_DIRECTORY_PARTS = new Set([
  '.git',
  'node_modules',
  'bower_components',
  'vendor',
  'vendors',
  'third_party',
  'third-party',
  'build',
  'dist',
  'coverage',
  '.nyc_output',
  '.cache',
  '.parcel-cache',
  '.next',
  '.nuxt',
  'release',
  'releases',
  'artifacts',
  'generated',
  '__generated__',
  '__snapshots__',
  'snapshots',
  'tmp',
  'temp',
  'logs',
  'dumps',
  '__pycache__',
]);

const EXCLUDED_BASENAMES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lock',
  'bun.lockb',
  'composer.lock',
  'poetry.lock',
  'cargo.lock',
]);

const BINARY_EXTENSIONS = new Set([
  '.7z', '.a', '.avi', '.bin', '.bmp', '.class', '.db', '.dll', '.dylib',
  '.eot', '.exe', '.flac', '.gif', '.gz', '.ico', '.jar', '.jpeg', '.jpg',
  '.lockb', '.m4a', '.m4v', '.mov', '.mp3', '.mp4', '.o', '.ogg', '.otf',
  '.pdf', '.png', '.pyc', '.so', '.sqlite', '.sqlite3', '.tar', '.tgz',
  '.tiff', '.ttf', '.wav', '.webm', '.webp', '.woff', '.woff2', '.xls',
  '.xlsx', '.zip',
]);

const MINIFIED_RE = /(?:^|\.)min\.(?:css|js|mjs|cjs)$/i;
const SOURCE_MAP_RE = /\.map$/i;
const LOG_DUMP_RE = /\.(?:log|dump|sql\.bak|bak|tmp)$/i;

function fail(message) {
  process.stderr.write(`streamer-line-check: ${message}\n`);
  process.exit(2);
}

function runGit(args, options = {}) {
  const result = childProcess.spawnSync('git', args, {
    cwd: ROOT,
    encoding: options.encoding === undefined ? 'utf8' : options.encoding,
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0 && !options.allowFailure) {
    const stderr = Buffer.isBuffer(result.stderr)
      ? result.stderr.toString('utf8')
      : String(result.stderr || '');
    fail(`git ${args.join(' ')} failed: ${stderr.trim()}`);
  }

  return result;
}

function parseArgs(argv) {
  const options = {
    base: null,
    enforce: false,
    json: false,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--base') {
      i += 1;
      if (!argv[i]) fail('--base requires a commit-ish value');
      options.base = argv[i];
    } else if (arg === '--enforce') {
      options.enforce = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write([
        'Usage: node scripts/count-streamer-expansion-lines.js [options]',
        '',
        'Options:',
        '  --base <commit>  Compare against this Git commit-ish.',
        '  --enforce        Exit 1 when any acceptance threshold fails.',
        '  --json           Print machine-readable JSON.',
        '  --verbose        Include per-file counts and exclusion reasons.',
        '  -h, --help       Show this help.',
        '',
      ].join('\n'));
      process.exit(0);
    } else {
      fail(`unknown option: ${arg}`);
    }
  }

  return options;
}

function resolveBase(explicitBase) {
  let candidate = explicitBase;
  if (!candidate && fs.existsSync(DEFAULT_BASE_FILE)) {
    candidate = fs.readFileSync(DEFAULT_BASE_FILE, 'utf8').trim().split(/\s+/)[0];
  }
  if (!candidate) candidate = 'HEAD';

  const verified = runGit(['rev-parse', '--verify', `${candidate}^{commit}`]);
  return verified.stdout.trim();
}

function normalizeRepoPath(value) {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .normalize('NFC');
}

function isExcludedPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) {
    return 'unsafe-or-empty-path';
  }
  if (BOOTSTRAP_PATHS.has(normalized)) return 'agent-bootstrap-file';

  const parts = normalized.split('/');
  if (parts.some((part) => EXCLUDED_DIRECTORY_PARTS.has(part))) {
    return 'generated-vendor-or-output-directory';
  }

  const basename = parts[parts.length - 1].toLowerCase();
  if (EXCLUDED_BASENAMES.has(basename)) return 'lockfile';
  if (MINIFIED_RE.test(basename)) return 'minified-asset';
  if (SOURCE_MAP_RE.test(basename)) return 'source-map';
  if (LOG_DUMP_RE.test(basename)) return 'log-dump-or-backup';

  const extension = path.extname(basename).toLowerCase();
  if (BINARY_EXTENSIONS.has(extension)) return 'binary-extension';

  return null;
}

function classifyPath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const lower = normalized.toLowerCase();
  const basename = path.posix.basename(lower);

  if (
    lower.startsWith('tests/')
    || lower.includes('/__tests__/')
    || /(?:^|\/)(?:test|spec)s?\//.test(lower)
    || /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(lower)
    || /^scripts\/(?:test-|check-|security-regression)/.test(lower)
  ) {
    return 'tests';
  }

  if (
    lower.startsWith('content/streamer-world/')
    || lower.startsWith('data/streamer-world/')
    || lower.startsWith('domain/story/content/')
    || lower.startsWith('domain/quests/content/')
  ) {
    return 'content';
  }

  if (
    lower.startsWith('views/')
    || lower.startsWith('public/js/')
    || lower.startsWith('public/css/')
    || lower.startsWith('public/styles/')
    || lower.startsWith('public/stylesheets/')
    || lower.startsWith('public/components/')
    || /\.(?:ejs|html|css|scss|sass|less)$/.test(lower)
  ) {
    return 'frontend';
  }

  if (
    lower.startsWith('domain/')
    || lower.startsWith('services/')
    || lower.startsWith('repositories/')
    || lower.startsWith('routes/')
    || lower.startsWith('app/')
    || lower.startsWith('lib/')
    || lower.startsWith('workers/')
    || lower.startsWith('migrations/')
    || lower.startsWith('middleware/')
    || lower.startsWith('models/')
    || lower.startsWith('controllers/')
    || lower.startsWith('config/')
    || basename === 'server.js'
  ) {
    return 'backend';
  }

  if (lower.startsWith('docs/') || /\.(?:md|mdx|rst|adoc)$/.test(lower)) {
    return 'docs';
  }

  if (lower.startsWith('scripts/') || lower.startsWith('tools/')) {
    return 'tooling';
  }

  return 'other';
}

function commentStyleForPath(repoPath) {
  const lower = repoPath.toLowerCase();
  const extension = path.extname(lower);

  if (['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.java', '.c', '.cc', '.cpp', '.h', '.hpp', '.css', '.scss', '.less'].includes(extension)) {
    return 'slash';
  }
  if (['.py', '.sh', '.bash', '.zsh', '.rb', '.pl', '.r', '.yaml', '.yml', '.toml'].includes(extension)) {
    return 'hash';
  }
  if (['.sql'].includes(extension)) return 'sql';
  if (['.html', '.htm', '.ejs', '.xml', '.svg'].includes(extension)) return 'html';
  if (['.md', '.mdx'].includes(extension)) return 'markdown';
  return 'none';
}

function isMeaningfulLine(line, repoPath, state) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  // Extremely long one-line generated payloads are not credited. This still
  // permits ordinary long prose, SQL, and test fixtures.
  if (trimmed.length > 4_000) return false;

  const style = commentStyleForPath(repoPath);

  if (style === 'slash') {
    if (state.blockComment) {
      const closeIndex = trimmed.indexOf('*/');
      if (closeIndex === -1) return false;
      state.blockComment = false;
      return trimmed.slice(closeIndex + 2).trim().length > 0;
    }

    if (trimmed.startsWith('//')) return false;
    if (trimmed.startsWith('/*')) {
      const closeIndex = trimmed.indexOf('*/', 2);
      if (closeIndex === -1) {
        state.blockComment = true;
        return false;
      }
      return trimmed.slice(closeIndex + 2).trim().length > 0;
    }
    if (trimmed.startsWith('*') || trimmed === '*/') return false;
  } else if (style === 'hash') {
    if (trimmed.startsWith('#')) {
      // Shebang is executable metadata rather than padding and gets credit.
      return trimmed.startsWith('#!');
    }
  } else if (style === 'sql') {
    if (trimmed.startsWith('--')) return false;
    if (state.blockComment) {
      const closeIndex = trimmed.indexOf('*/');
      if (closeIndex === -1) return false;
      state.blockComment = false;
      return trimmed.slice(closeIndex + 2).trim().length > 0;
    }
    if (trimmed.startsWith('/*')) {
      const closeIndex = trimmed.indexOf('*/', 2);
      if (closeIndex === -1) state.blockComment = true;
      return closeIndex !== -1 && trimmed.slice(closeIndex + 2).trim().length > 0;
    }
  } else if (style === 'html') {
    if (state.htmlComment) {
      const closeIndex = trimmed.indexOf('-->');
      if (closeIndex === -1) return false;
      state.htmlComment = false;
      return trimmed.slice(closeIndex + 3).trim().length > 0;
    }
    if (trimmed.startsWith('<!--')) {
      const closeIndex = trimmed.indexOf('-->', 4);
      if (closeIndex === -1) state.htmlComment = true;
      return closeIndex !== -1 && trimmed.slice(closeIndex + 3).trim().length > 0;
    }
  } else if (style === 'markdown') {
    if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) return false;
  }

  return true;
}

function countMeaningfulLines(text, repoPath) {
  const state = { blockComment: false, htmlComment: false };
  let count = 0;
  for (const line of String(text).split(/\r?\n/)) {
    if (isMeaningfulLine(line, repoPath, state)) count += 1;
  }
  return count;
}

function decodeNulList(bufferOrString) {
  const value = Buffer.isBuffer(bufferOrString)
    ? bufferOrString.toString('utf8')
    : String(bufferOrString || '');
  return value.split('\0').filter(Boolean);
}

function getBaseBlobHashes(base) {
  const result = runGit(['ls-tree', '-r', '-z', '--full-tree', base], { encoding: 'buffer' });
  const hashes = new Set();
  for (const entry of decodeNulList(result.stdout)) {
    const tab = entry.indexOf('\t');
    if (tab === -1) continue;
    const metadata = entry.slice(0, tab).split(/\s+/);
    if (metadata[1] === 'blob' && metadata[2]) hashes.add(metadata[2]);
  }
  return hashes;
}

function pathExistsAtBase(base, repoPath) {
  const result = runGit(['cat-file', '-e', `${base}:${repoPath}`], { allowFailure: true });
  return result.status === 0;
}

function hashWorkingFile(absolutePath) {
  const hash = crypto.createHash('sha1');
  // Git blob hash is SHA-1 over "blob <size>\0<bytes>".
  const content = fs.readFileSync(absolutePath);
  hash.update(`blob ${content.length}\0`);
  hash.update(content);
  return hash.digest('hex');
}

function isProbablyBinary(absolutePath) {
  const fd = fs.openSync(absolutePath, 'r');
  try {
    const sample = Buffer.alloc(8_192);
    const bytesRead = fs.readSync(fd, sample, 0, sample.length, 0);
    for (let i = 0; i < bytesRead; i += 1) {
      if (sample[i] === 0) return true;
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function parsePatch(patchText) {
  const countsByPath = new Map();
  let currentPath = null;
  let currentOldPath = null;
  let addedState = { blockComment: false, htmlComment: false };
  let deletedState = { blockComment: false, htmlComment: false };

  function ensurePath(repoPath) {
    if (!countsByPath.has(repoPath)) {
      countsByPath.set(repoPath, { added: 0, deleted: 0 });
    }
    return countsByPath.get(repoPath);
  }

  for (const rawLine of patchText.split(/\n/)) {
    if (rawLine.startsWith('diff --git ')) {
      currentPath = null;
      currentOldPath = null;
      addedState = { blockComment: false, htmlComment: false };
      deletedState = { blockComment: false, htmlComment: false };
      continue;
    }

    if (rawLine.startsWith('--- ')) {
      const marker = rawLine.slice(4).trim();
      if (marker === '/dev/null') {
        currentOldPath = null;
      } else if (marker.startsWith('a/')) {
        currentOldPath = normalizeRepoPath(marker.slice(2));
      } else {
        currentOldPath = normalizeRepoPath(marker);
      }
      continue;
    }

    if (rawLine.startsWith('+++ ')) {
      const marker = rawLine.slice(4).trim();
      if (marker === '/dev/null') {
        currentPath = currentOldPath;
      } else if (marker.startsWith('b/')) {
        currentPath = normalizeRepoPath(marker.slice(2));
      } else {
        currentPath = normalizeRepoPath(marker);
      }
      continue;
    }

    if (!currentPath) continue;
    if (rawLine.startsWith('@@')) {
      addedState = { blockComment: false, htmlComment: false };
      deletedState = { blockComment: false, htmlComment: false };
      continue;
    }

    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      const record = ensurePath(currentPath);
      if (isMeaningfulLine(rawLine.slice(1), currentPath, addedState)) record.added += 1;
    } else if (rawLine.startsWith('-') && !rawLine.startsWith('---')) {
      const record = ensurePath(currentPath);
      if (isMeaningfulLine(rawLine.slice(1), currentPath, deletedState)) record.deleted += 1;
    }
  }

  return countsByPath;
}

function listUntrackedPaths() {
  const result = runGit(['ls-files', '--others', '--exclude-standard', '-z'], { encoding: 'buffer' });
  return decodeNulList(result.stdout).map(normalizeRepoPath);
}

function makeEmptyCategoryTotals() {
  return {
    backend: { added: 0, deleted: 0 },
    frontend: { added: 0, deleted: 0 },
    content: { added: 0, deleted: 0 },
    tests: { added: 0, deleted: 0 },
    docs: { added: 0, deleted: 0 },
    tooling: { added: 0, deleted: 0 },
    other: { added: 0, deleted: 0 },
  };
}

function analyze(base, verbose) {
  const baseHashes = getBaseBlobHashes(base);
  const patchResult = runGit([
    'diff',
    '--no-ext-diff',
    '--no-color',
    '--find-renames=50%',
    '--find-copies=50%',
    '--find-copies-harder',
    '--unified=0',
    base,
    '--',
  ]);

  const patchCounts = parsePatch(patchResult.stdout);
  const perFile = [];
  const exclusions = [];
  const categoryTotals = makeEmptyCategoryTotals();

  function addFileRecord(repoPath, added, deleted, source) {
    const normalized = normalizeRepoPath(repoPath);
    const exclusion = isExcludedPath(normalized);
    if (exclusion) {
      exclusions.push({ path: normalized, reason: exclusion, source });
      return;
    }

    const absolutePath = path.join(ROOT, normalized);
    const existsNow = fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();

    if (existsNow && isProbablyBinary(absolutePath)) {
      exclusions.push({ path: normalized, reason: 'binary-content', source });
      return;
    }

    if (existsNow && !pathExistsAtBase(base, normalized)) {
      const workingHash = hashWorkingFile(absolutePath);
      if (baseHashes.has(workingHash)) {
        exclusions.push({ path: normalized, reason: 'exact-copy-of-base-blob', source });
        return;
      }
    }

    const category = classifyPath(normalized);
    categoryTotals[category].added += added;
    categoryTotals[category].deleted += deleted;
    perFile.push({ path: normalized, category, added, deleted, source });
  }

  for (const [repoPath, counts] of patchCounts.entries()) {
    addFileRecord(repoPath, counts.added, counts.deleted, 'tracked-diff');
  }

  const alreadyCounted = new Set(patchCounts.keys());
  for (const repoPath of listUntrackedPaths()) {
    if (alreadyCounted.has(repoPath)) continue;

    const exclusion = isExcludedPath(repoPath);
    if (exclusion) {
      exclusions.push({ path: repoPath, reason: exclusion, source: 'untracked' });
      continue;
    }

    const absolutePath = path.join(ROOT, repoPath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
    if (isProbablyBinary(absolutePath)) {
      exclusions.push({ path: repoPath, reason: 'binary-content', source: 'untracked' });
      continue;
    }

    const workingHash = hashWorkingFile(absolutePath);
    if (baseHashes.has(workingHash)) {
      exclusions.push({ path: repoPath, reason: 'exact-copy-of-base-blob', source: 'untracked' });
      continue;
    }

    const text = fs.readFileSync(absolutePath, 'utf8');
    const added = countMeaningfulLines(text, repoPath);
    addFileRecord(repoPath, added, 0, 'untracked');
  }

  const rawDocsAdded = categoryTotals.docs.added;
  const creditedDocsAdded = Math.min(rawDocsAdded, DOC_CREDIT_CAP);

  const creditedCategoryAdded = {
    backend: categoryTotals.backend.added,
    frontend: categoryTotals.frontend.added,
    content: categoryTotals.content.added,
    tests: categoryTotals.tests.added,
    docs: creditedDocsAdded,
    tooling: categoryTotals.tooling.added,
    other: categoryTotals.other.added,
  };

  const totalAdded = Object.values(creditedCategoryAdded).reduce((sum, value) => sum + value, 0);
  const totalDeleted = Object.values(categoryTotals).reduce((sum, value) => sum + value.deleted, 0);
  const netGrowth = totalAdded - totalDeleted;
  const coreAdded = creditedCategoryAdded.backend + creditedCategoryAdded.frontend + creditedCategoryAdded.content;

  const metrics = {
    totalAdded,
    totalDeleted,
    netGrowth,
    backendAdded: creditedCategoryAdded.backend,
    frontendAdded: creditedCategoryAdded.frontend,
    contentAdded: creditedCategoryAdded.content,
    testsAdded: creditedCategoryAdded.tests,
    coreAdded,
  };

  const gates = {};
  for (const [name, minimum] of Object.entries(THRESHOLDS)) {
    gates[name] = {
      actual: metrics[name],
      minimum,
      passed: metrics[name] >= minimum,
    };
  }

  return {
    base,
    root: ROOT,
    docCreditCap: DOC_CREDIT_CAP,
    rawDocsAdded,
    creditedCategoryAdded,
    categoryTotals,
    metrics,
    gates,
    passed: Object.values(gates).every((gate) => gate.passed),
    perFile: verbose
      ? perFile.sort((a, b) => (b.added - b.deleted) - (a.added - a.deleted))
      : undefined,
    exclusions: verbose
      ? exclusions.sort((a, b) => a.path.localeCompare(b.path))
      : undefined,
  };
}

function formatNumber(value) {
  return Number(value).toLocaleString('en-CA');
}

function printHuman(report, verbose) {
  const lines = [];
  lines.push('Streamer World meaningful-line report');
  lines.push(`Base commit: ${report.base}`);
  lines.push('');
  lines.push('Credited additions by category:');
  for (const category of ['backend', 'frontend', 'content', 'tests', 'docs', 'tooling', 'other']) {
    const added = report.creditedCategoryAdded[category];
    const raw = report.categoryTotals[category].added;
    const deleted = report.categoryTotals[category].deleted;
    const capNote = category === 'docs' && raw !== added ? ` (raw ${formatNumber(raw)}, capped)` : '';
    lines.push(`  ${category.padEnd(9)} +${formatNumber(added)} / -${formatNumber(deleted)}${capNote}`);
  }
  lines.push('');
  lines.push(`Credited additions: ${formatNumber(report.metrics.totalAdded)}`);
  lines.push(`Meaningful deletions: ${formatNumber(report.metrics.totalDeleted)}`);
  lines.push(`Credited net growth: ${formatNumber(report.metrics.netGrowth)}`);
  lines.push(`Backend + frontend + content: ${formatNumber(report.metrics.coreAdded)}`);
  lines.push('');
  lines.push('Acceptance gates:');

  const labels = {
    totalAdded: 'total meaningful additions',
    netGrowth: 'net growth',
    backendAdded: 'backend additions',
    frontendAdded: 'frontend additions',
    contentAdded: 'authored-content additions',
    testsAdded: 'test additions',
    coreAdded: 'backend + frontend + content',
  };

  for (const [name, gate] of Object.entries(report.gates)) {
    const mark = gate.passed ? 'PASS' : 'FAIL';
    lines.push(`  [${mark}] ${labels[name]}: ${formatNumber(gate.actual)} / ${formatNumber(gate.minimum)}`);
  }

  lines.push('');
  lines.push(report.passed ? 'Overall: PASS' : 'Overall: FAIL');

  if (verbose && report.perFile) {
    lines.push('');
    lines.push('Per-file credited changes:');
    for (const record of report.perFile) {
      lines.push(`  ${record.category.padEnd(9)} +${record.added}/-${record.deleted} ${record.path} (${record.source})`);
    }
  }

  if (verbose && report.exclusions) {
    lines.push('');
    lines.push('Excluded files:');
    for (const exclusion of report.exclusions) {
      lines.push(`  ${exclusion.path} — ${exclusion.reason} (${exclusion.source})`);
    }
  }

  process.stdout.write(`${lines.join('\n')}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const insideRepo = runGit(['rev-parse', '--is-inside-work-tree']);
  if (insideRepo.stdout.trim() !== 'true') fail('run this script from a Git work tree');

  const base = resolveBase(options.base);
  const report = analyze(base, options.verbose);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printHuman(report, options.verbose);
  }

  if (options.enforce && !report.passed) process.exit(1);
}

main();
