const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];

function check(name, condition) {
    checks.push({ name, condition: Boolean(condition) });
}

const server = read('server.js');
const security = read('middleware/security.js');
const admin = read('routes/admin.js');
const gifts = read('routes/gifts.js');
const wish = read('routes/wish.js');
const games = read('routes/games.js');
const fixEnv = read('scripts/fix_env.js');
const listener = read('windows-gift-listener.js');
const giftSender = read('bilibili_gift_sender.py');
const ipManager = read('ip-manager.js');
const migrationRunner = read('scripts/run_idempotency_migration.js');
const idempotency = read('lib/idempotency.js');
const idempotencyMigration = read('migrations/create_idempotency_keys.sql');
const wishMigration = read('migrations/create_wish_tables.sql');
const musicPlayer = read('public/js/music-player.js');
const languageSwitcher = read('views/partials/language-switcher.ejs');
const adminClient = read('public/js/admin.js');
const quizClient = read('public/js/quiz.js');
const profileClient = read('public/js/profile.js');
const pkReportMigration = read('migrations/add_pk_report_id.sql');

check('production rejects CSRF bypass flags', server.includes('禁止启用 CSRF_TEST_MODE') && security.includes("process.env.NODE_ENV !== 'production'"));
check('password changes require CSRF', /app\.post\('\/api\/change-password', requireLogin, requireCSRF/.test(server));
check('password hashes consistently use bcrypt cost 12', !server.includes('bcrypt.hash(newPassword, 10)') && server.includes('bcrypt.hash(newPassword, 12)'));
check('CSRF tokens use a per-session secret', server.includes('req.session.csrfSecret = tokens.secretSync()') && !server.includes("req.session.id || 'default'"));
check('legacy CSRF sessions only upgrade on safe methods', server.includes("req.method === 'GET' || req.method === 'HEAD'") && server.includes('Mutating requests never accept legacy tokens'));
check('admin password writes use password_hash', admin.includes('UPDATE users SET password_hash = $1') && !admin.includes('UPDATE users SET password = $1'));
check('admin routes use CSRF', /app\.post\('\/api\/admin\/[^']+', \.\.\.adminApiGuards, requireCSRF/g.test(admin));
check('admin access is not restricted by client IP', !admin.includes('adminIPWhitelist') && !security.includes('ADMIN_IP_REJECTED') && !security.includes('ADMIN_IP_WHITELIST'));
check('gift exchange uses an allowlist', gifts.includes('redeemableGiftTypes') && gifts.includes("new Set(['heartbox', 'fanlight', 'tiedu_one'])"));
check('wish simulator uses role authorization', wish.includes('req.session.user.is_admin !== true') && !wish.includes("username !== 'hokboost'"));
check('paid games use action rate limits', games.includes("app.post('/api/scratch/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection"));
check('scratch probabilities use exact integer ranges', games.includes('if (random < 5000)') && games.includes('else if (random < 7100)'));
check('dictation PNG upload validates signature and size', games.includes('pngSignature') && games.includes('1.5 * 1024 * 1024') && games.includes("flag: 'wx'"));
check('environment helper has no embedded credentials', fixEnv.includes("flag: 'wx'") && !/password\s*[:=]\s*['\"][^'\"]{6,}/i.test(fixEnv));
check('gift listener has no default API credential', listener.includes('WINDOWS_API_KEY') && !listener.includes('your-api-key'));
check('uncertain gift outcomes are never auto-refunded', listener.includes('markTaskUncertain') && giftSender.includes('"outcome_uncertain": send_attempted'));
check('uncertain gift tasks require confirmed failure before refund', gifts.includes("delivery_status === 'uncertain' && req.body.confirmedFailure !== true"));
check('gift balance checks require explicit insufficient text', !giftSender.includes('"text=\'余额\'"') && giftSender.includes('"余额不足", "B币不足", "电池不足"'));
check('routine IP activity writes are throttled', ipManager.includes("if (action === 'request')") && ipManager.includes('now - lastWrite < 60 * 1000'));
check('migration runner contains no embedded database URL', migrationRunner.includes("require('../db')") && !migrationRunner.includes('postgres://'));
check('quiz next is protected against duplicate token issuance', server.includes("'/api/quiz/next'") && quizClient.includes("idempotentFetch('/api/quiz/next'"));
check('quiz advances without an artificial answer delay', quizClient.includes('questionIndex += 1;\n        nextQuestion();') && !/setTimeout\(\(\) => \{\s*questionIndex \+= 1;\s*nextQuestion\(\);/m.test(quizClient));
check('password changes replay success after response loss', server.includes("'/api/change-password'") && profileClient.includes("idempotentFetch('/api/change-password'"));
check('admin additive writes use idempotency', server.includes("'/api/admin/add-electric-coin'") && adminClient.includes('window.idempotentFetch(url, options)'));
check('idempotency finalization retries transient failures', idempotency.includes('FINALIZE_ATTEMPTS = 3') && idempotency.includes('retryQuery(pool'));
check('idempotency replays revalidate current authorization and CSRF', server.includes('validateExistingIdempotentRequest') && idempotency.includes('validateExistingRequest(req)'));
check('idempotency migration upgrades the legacy schema', idempotencyMigration.includes('RENAME COLUMN idem_key TO idempotency_key') && idempotencyMigration.includes("SET status = 'pending'") && server.includes("'create_idempotency_keys.sql'"));
check('database migrations are serialized across instances', server.includes("pg_advisory_lock(hashtext('minimal_games_schema_migration'))") && server.includes("pg_advisory_unlock(hashtext('minimal_games_schema_migration'))"));
check('wish migration upgrades legacy production columns', server.includes("'create_wish_tables.sql'") && wishMigration.includes('RENAME COLUMN wish_type TO gift_type') && wishMigration.includes('RENAME COLUMN reward_name TO reward') && wishMigration.includes('RENAME COLUMN wish_name TO gift_name'));
check('music playback persists across page navigation', languageSwitcher.includes("include('persistent-music-player')") && musicPlayer.includes("window.addEventListener('pagehide'") && musicPlayer.includes('sessionStorage.setItem') && musicPlayer.includes('openInSiteFrame(url)') && musicPlayer.includes('music-shell-child'));
check('PK report charging is keyed by a unique report ID', gifts.includes('ON CONFLICT (report_id) DO NOTHING') && pkReportMigration.includes('UNIQUE INDEX'));
check('completed gift callbacks repair blindbox queue continuation', gifts.includes('enqueueNextStoredBlindbox(username, taskId)'));

const failed = checks.filter((item) => !item.condition);
for (const item of checks) {
    console.log(`${item.condition ? 'PASS' : 'FAIL'} ${item.name}`);
}
if (failed.length) {
    process.exitCode = 1;
}
