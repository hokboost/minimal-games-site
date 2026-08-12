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
const migrationRunner = read('scripts/run-migrations.js');
const databaseMigrations = read('lib/database-migrations.js');
const configValidation = read('lib/config-validation.js');
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
const hardeningMigration = read('migrations/harden_money_and_workers.sql');
const analyticsView = read('views/admin-analytics.ejs');
const threeServer = read('workers/bilibili/threeserver.py');
const normalPk = read('workers/bilibili/normalpk.py');
const firstWinPk = read('workers/bilibili/shousheng.py');
const workerRoleLease = read('lib/worker-role-lease.js');

check('production rejects CSRF bypass flags',
    configValidation.includes("process.env.CSRF_TEST_MODE === 'true'")
    && configValidation.includes("process.env.CSRF_AUTO_FILL === 'true'")
    && configValidation.includes('CSRF bypass flags are forbidden in production'));
check('password changes require CSRF', /app\.post\('\/api\/change-password', requireLogin, requireCSRF/.test(server));
check('password hashes consistently use bcrypt cost 12', !server.includes('bcrypt.hash(newPassword, 10)') && server.includes('bcrypt.hash(newPassword, 12)'));
check('CSRF tokens use a per-session secret', server.includes('req.session.csrfSecret = tokens.secretSync()') && !server.includes("req.session.id || 'default'"));
check('legacy CSRF sessions only upgrade on safe methods', server.includes("req.method === 'GET' || req.method === 'HEAD'") && server.includes('Mutating requests never accept legacy tokens'));
check('admin password resets use short-lived hashed one-time tokens',
    admin.includes("crypto.createHash('sha256').update(resetToken)")
    && admin.includes("NOW() + INTERVAL '15 minutes'")
    && !admin.includes('temporaryPassword'));
check('admin routes use CSRF', /app\.post\('\/api\/admin\/[^']+', \.\.\.adminApiGuards, requireCSRF/g.test(admin));
check('admin access is not restricted by client IP', !admin.includes('adminIPWhitelist') && !security.includes('ADMIN_IP_REJECTED') && !security.includes('ADMIN_IP_WHITELIST'));
check('gift exchange uses an allowlist', gifts.includes('redeemableGiftTypes') && gifts.includes("new Set(['heartbox', 'fanlight', 'tiedu_one'])"));
check('wish simulator uses role authorization', wish.includes('req.session.user.is_admin !== true') && !wish.includes("username !== 'hokboost'"));
check('paid games use action rate limits', games.includes("app.post('/api/scratch/play', rejectWhenOverloaded, requireLogin, requireAuthorized, basicRateLimit, userActionRateLimit, csrfProtection"));
check('scratch probabilities use exact integer ranges', games.includes('if (random < 5000)') && games.includes('else if (random < 7100)'));
check('dictation PNG upload validates signature, dimensions, CRC, and stores normalized bytes',
    games.includes('pngSignature')
    && games.includes('1.5 * 1024 * 1024')
    && games.includes('PNG.sync.read(imageBuffer, { checkCRC: true })')
    && games.includes('headerWidth * headerHeight > 4_000_000')
    && games.includes('byte_size, width, height, content'));
check('environment helper has no embedded credentials', fixEnv.includes("flag: 'wx'") && !/password\s*[:=]\s*['\"][^'\"]{6,}/i.test(fixEnv));
check('gift listener has no default API credential', listener.includes('WINDOWS_API_KEY') && !listener.includes('your-api-key'));
check('uncertain gift outcomes are never auto-refunded', listener.includes('markTaskUncertain') && giftSender.includes('"outcome_uncertain": send_attempted'));
check('a timed-out gift POST never falls back to a second sender',
    listener.includes('Never switch to another sender after this boundary')
    && !listener.includes('threeserver不可达，回退Python发送'));
check('external gift sends require provider confirmation and never retry ambiguous mutations',
    threeServer.includes('or "http"')
    && threeServer.includes('invalid_provider_response')
    && threeServer.includes('Retrying another endpoint could send twice')
    && !threeServer.includes('assumed_success')
    && !normalPk.includes('retry_resp')
    && !firstWinPk.includes('retry_resp'));
check('started or uncertain gift tasks cannot be worker-refunded',
    gifts.includes("if (delivery_status !== 'claimed')")
    && gifts.includes('必须进入人工对账')
    && !gifts.includes('confirmedFailure'));
check('gift balance checks require explicit insufficient text', !giftSender.includes('"text=\'余额\'"') && giftSender.includes('"余额不足", "B币不足", "电池不足"'));
check('routine IP activity writes are throttled and counted',
    ipManager.includes("if (action === 'request')")
    && ipManager.includes('now - entry.lastWrite < 60 * 1000')
    && ipManager.includes('entry.pending += 1')
    && ipManager.includes('request_count'));
check('Render client IP uses validated forwarded address',
    server.includes("app.set('trust proxy', (address) => isTrustedProxyAddress(address))")
    && clientIp.includes("headers?.['x-forwarded-for']")
    && clientIp.includes('isTrustedProxyAddress(socketAddress)'));
check('IP rate limits use the resolved client address', server.includes('keyGenerator: clientIpRateLimitKey') && security.includes('keyGenerator: ipRateLimitKey'));
check('registration stores its client IP', server.includes('username, password_hash, created_at, registration_ip') && server.includes("'register'"));
check('migration runner contains no embedded database URL',
    migrationRunner.includes("require('../db')")
    && migrationRunner.includes('applyDatabaseMigrations')
    && !migrationRunner.includes('postgres://'));
check('quiz next is protected against duplicate token issuance', server.includes("'/api/quiz/next'") && quizClient.includes("idempotentFetch('/api/quiz/next'"));
check('quiz advances without an artificial answer delay', quizClient.includes('questionIndex += 1;\n        nextQuestion();') && !/setTimeout\(\(\) => \{\s*questionIndex \+= 1;\s*nextQuestion\(\);/m.test(quizClient));
check('quiz leaderboard includes valid administrator scores and uses explicit day boundaries',
    !games.includes('u.is_admin = FALSE')
    && games.includes("date_trunc('day', NOW() AT TIME ZONE 'Asia/Shanghai')")
    && games.includes("+ INTERVAL '1 day'")
    && quizClient.includes('if (!response.ok || data.success !== true)'));
check('password changes replay success after response loss', server.includes("'/api/change-password'") && profileClient.includes("idempotentFetch('/api/change-password'"));
check('admin additive writes use idempotency', server.includes("'/api/admin/add-electric-coin'") && adminClient.includes('window.idempotentFetch(url, requestOptions)'));
check('admin room binding submits reliably and accepts short Bilibili room IDs', /id="bind-room-form"[^>]*novalidate/.test(adminView) && adminView.includes('data-ux-event="admin.bind_room"') && adminClient.includes("document.addEventListener('submit'") && !adminClient.includes('Bind room "${roomId}" for') && adminClient.includes('/^\\d{1,12}$/') && admin.includes('/^\\d{1,12}$/'));
check('room changes serialize gifts and PK while preserving uncertain sends',
    admin.includes("$1 || ':gift_exchange'")
    && admin.includes('prepareExternalWorkForAccountTransition')
    && admin.includes("delivery_status IN ('pending', 'claimed')")
    && admin.includes('AND started_at IS NULL')
    && admin.includes("status IN ('sending', 'uncertain')")
    && admin.includes("VALUES ($1, 'stop', 'pending'")
    && hardeningMigration.includes('users_bilibili_room_binding_shape_check'));
check('authorization revocation atomically freezes external financial work',
    admin.includes("transitionType: 'authorization_revoke'")
    && admin.includes("termination_reason = 'authorization_revoked'")
    && admin.includes('...externalState'));
check('room-bound inventory scheduling commits with the binding transaction',
    admin.includes('scheduleWishInventoryDeliveryOnBind(\n                usernameToUpdate,\n                client')
    && server.includes('async function scheduleWishInventoryDeliveryOnBind(username, client = pool)')
    && !server.includes('绑定房间号后安排待送礼物失败'));
check('PK status and start intent are bound to the current room',
    gifts.includes('control.room_id = account.bilibili_room_id')
    && gifts.includes("String(currentState.room_id || '') === String(roomId)"));
check('idempotency finalization retries transient failures', idempotency.includes('FINALIZE_ATTEMPTS = 5') && idempotency.includes('retryQuery(pool'));
check('pending request keys survive page reloads', read('public/js/i18n-helpers.js').includes('sessionStorage.setItem') && read('public/js/i18n-helpers.js').includes('IDEMPOTENCY_MAX_AGE_MS'));
check('ambiguous commits replay durable terminal results instead of overwriting them',
    idempotency.includes('SELECT status, response_status, response_body')
    && idempotency.includes("committed.status === 'indeterminate' ? 'indeterminate' : 'replayed'"));
check('financial responses finalize inside business transactions', games.includes('req.finalizeIdempotency?.(client, 200, responseBody)') && wish.includes('req.finalizeIdempotency?.(client, 200, responseBody)'));
check('balance ledger is append-only and validates new arithmetic', financialAuditMigration.includes('balance_logs_append_only') && financialAuditMigration.includes('balance_logs_amount_matches_check'));
check('account deactivation preserves financial audit history', admin.includes('账户已停用，审计记录已保留') && !admin.includes("DELETE FROM balance_logs"));
check('spin results are idempotent', server.includes("'/api/spin'") && read('public/js/spin.js').includes("idempotentFetch('/api/spin'"));
check('idempotency replays revalidate current authorization and CSRF', server.includes('validateExistingIdempotentRequest') && idempotency.includes('validateExistingRequest(req)'));
check('administrator idempotency replays revalidate recent password and MFA',
    server.includes('getRecentAdminAuthDenial(req)')
    && server.includes('if (requiresAdmin)')
    && server.includes('recentAuthDenial'));
check('idempotency migration upgrades the legacy schema',
    idempotencyMigration.includes('RENAME COLUMN idem_key TO idempotency_key')
    && idempotencyMigration.includes("SET status = 'pending'")
    && databaseMigrations.includes("'create_idempotency_keys.sql'"));
check('database migrations are serialized, tracked, and checksum protected',
    databaseMigrations.includes('pg_advisory_lock')
    && databaseMigrations.includes('pg_advisory_unlock')
    && databaseMigrations.includes('minimal_games_schema_migrations')
    && databaseMigrations.includes('Applied migration was modified'));
check('wish migration upgrades legacy production columns',
    databaseMigrations.includes("'create_wish_tables.sql'")
    && wishMigration.includes('RENAME COLUMN wish_type TO gift_type')
    && wishMigration.includes('RENAME COLUMN reward_name TO reward')
    && wishMigration.includes('RENAME COLUMN wish_name TO gift_name'));
check('music playback persists across page navigation', languageSwitcher.includes("include('persistent-music-player')") && musicPlayer.includes("window.addEventListener('pagehide'") && musicPlayer.includes('sessionStorage.setItem') && musicPlayer.includes('openInSiteFrame(url)') && musicPlayer.includes('music-shell-child'));
check('PK report charging is keyed by a unique report ID', gifts.includes('ON CONFLICT (report_id) DO NOTHING') && pkReportMigration.includes('UNIQUE INDEX'));
check('completed gift callbacks durably queue blindbox continuation',
    gifts.includes("INSERT INTO delivery_outbox (event_type, aggregate_id, payload)")
    && gifts.includes("VALUES ('enqueue_next_blindbox'")
    && gifts.includes('processDeliveryOutbox'));
check('PK controls preserve monotonic queued intent until the runner confirms state',
    gifts.includes('pk_control_state')
    && gifts.includes('command_generation = pk_control_state.command_generation + 1')
    && gifts.includes("app.post('/api/pk-tasks/:id/start'")
    && giftsClient.includes('schedulePkStatusRefresh')
    && giftsClient.includes("transition: desiredRunning ? 'start' : 'stop'")
    && !giftsClient.includes('setTimeout(updatePkStatus, 1200)'));
check('PK runners recover expired leases and require confirmed child startup',
    server.includes('queueMissingPkRunners')
    && gifts.includes('queueMissingPkRunners(client)')
    && listener.includes('await waitForChildSpawn(child)')
    && listener.includes('PK运行租约续期失败，已停止本地进程'));
check('external sends use a singleton worker lease and a cross-process provider lock',
    workerRoleLease.includes('ON CONFLICT (role) DO UPDATE')
    && server.includes('requireActiveWorkerLease')
    && gifts.includes('...workerGuards')
    && gifts.includes("hashtextextended('bilibili-provider-send', 0)")
    && listener.includes('createWorkerInstanceId(process.env.GIFT_WORKER_ID)'));
check('PK shutdown rebuild advances generation instead of reopening terminal tasks',
    gifts.includes('SET command_generation = command_generation + 1')
    && gifts.includes("task.status IN ('pending', 'claimed', 'processing', 'uncertain')")
    && !gifts.includes("task.status IN ('completed', 'failed', 'uncertain')"));
check('PK settlement reports use a durable local spool and partial results cannot auto-retry',
    listener.includes("spoolPkReport(intentPayload, 'intent')")
    && listener.includes("'/api/pk/send-start'")
    && listener.includes("spoolPkReport(reportPayload, 'final')")
    && listener.includes('flushPendingPkReports')
    && listener.includes("error: 'send_result_uncertain'"));
check('PK spend has an explicit pre-send state and serializes unresolved attempts per user',
    gifts.includes("app.post('/api/pk/send-start'")
    && gifts.includes("status IN ('reserved', 'sending', 'uncertain')")
    && hardeningMigration.includes("'reserved', 'sending', 'settled', 'released', 'uncertain'"));
check('gift workers serialize the shared provider account and lock task owners while claiming',
    listener.includes('new BoundedSemaphore(1)')
    && gifts.includes('FOR UPDATE OF exchange, owner SKIP LOCKED'));
check('dictation prompts and static assets do not expose answers',
    games.includes('const buildDictationPrompt = (item)')
    && !/return \{\s*[^}]*word:\s*item\.word/s.test(games)
    && !fs.existsSync(path.join(root, 'public', 'dictation', 'words.json')));
check('UX analytics migration is startup-managed',
    server.includes('applyDatabaseMigrations(pool')
    && databaseMigrations.includes("'create_ux_analytics.sql'")
    && uxMigration.includes('CREATE TABLE IF NOT EXISTS ux_page_views'));
check('UX heartbeats are cumulative and idempotent', uxAnalytics.includes('GREATEST(ux_page_views.active_ms') && uxAnalytics.includes('ON CONFLICT (id) DO NOTHING'));
check('UX ingestion derives identity from a currently active server session',
    uxAnalytics.includes('req.session?.user?.username')
    && uxAnalytics.includes('JOIN active_sessions AS active')
    && uxAnalytics.includes('active.session_id = $2')
    && !uxAnalytics.includes('payload.userId'));
check('UX tracker measures active time and sends page exits with beacon', uxTracker.includes('ACTIVE_WINDOW_MS') && uxTracker.includes('navigator.sendBeacon') && uxTracker.includes("eventType: 'page_exit'") && server.includes("express.text({ type: 'text/plain', limit: '32kb' })") && server.includes("error?.type === 'stream.not.readable'"));
check('UX tracker excludes inactive time after the activity window',
    uxTracker.includes('Date.now() - lastInteractionAt <= ACTIVE_WINDOW_MS')
    && uxTracker.includes("document.visibilityState === 'visible'")
    && uxTracker.includes('page.activeMs += elapsed'));
check('UX tracker never captures form values or DOM text',
    !uxTracker.includes('event.target.value')
    && !uxTracker.includes('actionElement.textContent')
    && !uxTracker.includes('actionElement.innerText')
    && uxTracker.includes('actionElement.dataset.uxEvent'));
check('core money storage uses integer invariants and safe ranges',
    hardeningMigration.includes('ALTER COLUMN balance TYPE BIGINT')
    && hardeningMigration.includes('balance_logs_safe_integer_check')
    && hardeningMigration.includes('users_balance_invariant_check'));
check('login failures are counted atomically without attacker-triggered account locks',
    server.includes('LEAST(100000, CASE')
    && server.includes('FOR UPDATE')
    && server.includes('WHEN account.locked_until > NOW() THEN account.locked_until')
    && !server.includes('failure_state.next_failures >= 5'));
check('blindbox probabilities use exact million-unit integer weights',
    games.includes('weightUnits = Math.round(weight * 1_000_000)')
    && games.includes('totalWeight !== 1_000_000')
    && games.includes('const roll = randomInt(0, totalWeight)')
    && games.includes('if (roll < acc) return item'));
check('UX admin report includes page and preference analysis', analyticsView.includes('analytics.pages') && analyticsView.includes('analytics.languages') && analyticsView.includes('analytics.preferences'));

const failed = checks.filter((item) => !item.condition);
for (const item of checks) {
    console.log(`${item.condition ? 'PASS' : 'FAIL'} ${item.name}`);
}
if (failed.length) {
    process.exitCode = 1;
}
