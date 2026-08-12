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
const clientIp = read('lib/client-ip.js');
const idempotencyMigration = read('migrations/create_idempotency_keys.sql');
const wishMigration = read('migrations/create_wish_tables.sql');
const musicPlayer = read('public/js/music-player.js');
const languageSwitcher = read('views/partials/language-switcher.ejs');
const adminClient = read('public/js/admin.js');
const adminView = read('views/admin.ejs');
const giftsClient = read('public/js/gifts.js');
const quizClient = read('public/js/quiz.js');
const profileClient = read('public/js/profile.js');
const pkReportMigration = read('migrations/add_pk_report_id.sql');
const uxAnalytics = read('routes/analytics.js');
const uxTracker = read('public/js/ux-analytics.js');
const uxMigration = read('migrations/create_ux_analytics.sql');
const financialAuditMigration = read('migrations/strengthen_financial_audit.sql');
const analyticsView = read('views/admin-analytics.ejs');

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
check('Render client IP uses validated forwarded address', server.includes("app.set('trust proxy', 1)") && clientIp.includes("headers?.['x-forwarded-for']") && clientIp.includes('isTrustedProxyAddress(socketAddress)'));
check('IP rate limits use the resolved client address', server.includes('keyGenerator: clientIpRateLimitKey') && security.includes('keyGenerator: ipRateLimitKey'));
check('registration stores its client IP', server.includes('username, password_hash, created_at, registration_ip') && server.includes("'register'"));
check('migration runner contains no embedded database URL', migrationRunner.includes("require('../db')") && !migrationRunner.includes('postgres://'));
check('quiz next is protected against duplicate token issuance', server.includes("'/api/quiz/next'") && quizClient.includes("idempotentFetch('/api/quiz/next'"));
check('quiz advances without an artificial answer delay', quizClient.includes('questionIndex += 1;\n        nextQuestion();') && !/setTimeout\(\(\) => \{\s*questionIndex \+= 1;\s*nextQuestion\(\);/m.test(quizClient));
check('quiz leaderboard includes valid administrator scores and uses explicit day boundaries', !games.includes('u.is_admin = FALSE') && games.includes("s.submitted_at::timestamptz >= date_trunc('day', NOW())") && quizClient.includes('if (!response.ok || data.success !== true)'));
check('password changes replay success after response loss', server.includes("'/api/change-password'") && profileClient.includes("idempotentFetch('/api/change-password'"));
check('admin additive writes use idempotency', server.includes("'/api/admin/add-electric-coin'") && adminClient.includes('window.idempotentFetch(url, requestOptions)'));
check('admin room binding submits reliably and accepts short Bilibili room IDs', adminView.includes('id="bind-room-form" novalidate') && adminView.includes('data-ux-event="admin.bind_room"') && adminClient.includes("document.addEventListener('submit'") && !adminClient.includes('Bind room "${roomId}" for') && adminClient.includes('/^\\d{1,12}$/') && admin.includes('/^\\d{1,12}$/'));
check('idempotency finalization retries transient failures', idempotency.includes('FINALIZE_ATTEMPTS = 5') && idempotency.includes('retryQuery(pool'));
check('pending request keys survive page reloads', read('public/js/i18n-helpers.js').includes('sessionStorage.setItem') && read('public/js/i18n-helpers.js').includes('IDEMPOTENCY_MAX_AGE_MS'));
check('ambiguous commits replay durable success instead of returning a retryable failure', idempotency.includes('SELECT response_status, response_body') && idempotency.includes("res.set('Idempotency-Status', 'replayed')"));
check('financial responses finalize inside business transactions', games.includes('req.finalizeIdempotency?.(client, 200, responseBody)') && wish.includes('req.finalizeIdempotency?.(client, 200, responseBody)'));
check('balance ledger is append-only and validates new arithmetic', financialAuditMigration.includes('balance_logs_append_only') && financialAuditMigration.includes('balance_logs_amount_matches_check'));
check('account deactivation preserves financial audit history', admin.includes('账户已停用，审计记录已保留') && !admin.includes("DELETE FROM balance_logs"));
check('spin results are idempotent', server.includes("'/api/spin'") && read('public/js/spin.js').includes("idempotentFetch('/api/spin'"));
check('idempotency replays revalidate current authorization and CSRF', server.includes('validateExistingIdempotentRequest') && idempotency.includes('validateExistingRequest(req)'));
check('idempotency migration upgrades the legacy schema', idempotencyMigration.includes('RENAME COLUMN idem_key TO idempotency_key') && idempotencyMigration.includes("SET status = 'pending'") && server.includes("'create_idempotency_keys.sql'"));
check('database migrations are serialized across instances', server.includes("pg_advisory_lock(hashtext('minimal_games_schema_migration'))") && server.includes("pg_advisory_unlock(hashtext('minimal_games_schema_migration'))"));
check('wish migration upgrades legacy production columns', server.includes("'create_wish_tables.sql'") && wishMigration.includes('RENAME COLUMN wish_type TO gift_type') && wishMigration.includes('RENAME COLUMN reward_name TO reward') && wishMigration.includes('RENAME COLUMN wish_name TO gift_name'));
check('music playback persists across page navigation', languageSwitcher.includes("include('persistent-music-player')") && musicPlayer.includes("window.addEventListener('pagehide'") && musicPlayer.includes('sessionStorage.setItem') && musicPlayer.includes('openInSiteFrame(url)') && musicPlayer.includes('music-shell-child'));
check('PK report charging is keyed by a unique report ID', gifts.includes('ON CONFLICT (report_id) DO NOTHING') && pkReportMigration.includes('UNIQUE INDEX'));
check('completed gift callbacks repair blindbox queue continuation', gifts.includes('enqueueNextStoredBlindbox(username, taskId)'));
check('PK controls preserve queued intent until the runner confirms state', gifts.includes('desiredRunning') && gifts.includes("ORDER BY id DESC") && giftsClient.includes('schedulePkStatusRefresh') && giftsClient.includes("transition: desiredRunning ? 'start' : 'stop'") && !giftsClient.includes('setTimeout(updatePkStatus, 1200)'));
check('UX analytics migration is startup-managed', server.includes("'create_ux_analytics.sql'") && uxMigration.includes('CREATE TABLE IF NOT EXISTS ux_page_views'));
check('UX heartbeats are cumulative and idempotent', uxAnalytics.includes('GREATEST(ux_page_views.active_ms') && uxAnalytics.includes('ON CONFLICT (id) DO NOTHING'));
check('UX ingestion derives identity and IP from the server session', uxAnalytics.includes('req.session?.user?.id') && uxAnalytics.includes('req.clientIP'));
check('UX tracker measures active time and sends page exits with beacon', uxTracker.includes('ACTIVE_WINDOW_MS') && uxTracker.includes('navigator.sendBeacon') && uxTracker.includes("eventType: 'page_exit'") && server.includes("express.text({ type: 'text/plain', limit: '32kb' })") && server.includes("error?.type === 'stream.not.readable'"));
check('UX tracker rotates sessions after prolonged inactivity', uxTracker.includes("endPage('session_timeout', true)") && uxTracker.includes('SESSION_IDLE_MS'));
check('UX tracker never captures form values or DOM text', !uxTracker.includes('.value') && !uxTracker.includes('textContent') && !uxTracker.includes('innerText'));
check('UX admin report includes page and preference analysis', analyticsView.includes('analytics.pages') && analyticsView.includes('analytics.languages') && analyticsView.includes('analytics.preferences'));

const failed = checks.filter((item) => !item.condition);
for (const item of checks) {
    console.log(`${item.condition ? 'PASS' : 'FAIL'} ${item.name}`);
}
if (failed.length) {
    process.exitCode = 1;
}
