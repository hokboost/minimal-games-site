(() => {
    const ENDPOINT = '/api/ux/batch';
    const BOOTSTRAP_ENDPOINT = '/api/ux/bootstrap';
    const REVOKE_ENDPOINT = '/api/ux/revoke';
    const CONSENT_VERSION = '2026-08-12';
    const HEARTBEAT_MS = 15000;
    const ACTIVE_WINDOW_MS = 30000;
    const CONSENT_KEY = 'minimal-games:ux-consent:v2';
    const TAB_KEY = 'minimal-games:ux-tab-nonce:v2';
    const QUEUE_KEY = 'minimal-games:ux-queue:v2';
    const lang = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => lang === 'zh' ? zh : en;
    const noop = () => {};
    const noopAnalytics = Object.freeze({
        track: noop,
        pausePage: noop,
        resumePage: noop,
        flush: noop
    });
    window.UXAnalytics = noopAnalytics;

    let issuedSession = null;
    let revokeCurrentSession = async () => {};

    function uuid() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function isUuid(value) {
        return typeof value === 'string'
            && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    }

    function readStorage(storage, key) {
        try {
            return JSON.parse(storage.getItem(key) || 'null');
        } catch {
            return null;
        }
    }

    function writeStorage(storage, key, value) {
        try {
            storage.setItem(key, JSON.stringify(value));
            return true;
        } catch {
            return false;
        }
    }

    function readConsent() {
        const value = readStorage(localStorage, CONSENT_KEY);
        if (!value || value.version !== CONSENT_VERSION
            || typeof value.analytics !== 'boolean'
            || typeof value.detailedPreferences !== 'boolean') return null;
        return value;
    }

    function storeConsent(analytics, detailedPreferences) {
        writeStorage(localStorage, CONSENT_KEY, {
            version: CONSENT_VERSION,
            analytics: analytics === true,
            detailedPreferences: analytics === true && detailedPreferences === true,
            decidedAt: new Date().toISOString()
        });
    }

    function clearTrackingStorage() {
        try {
            sessionStorage.removeItem(TAB_KEY);
            sessionStorage.removeItem(QUEUE_KEY);
        } catch {
            // Storage may be disabled.
        }
    }

    function element(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    }

    function closePrivacyUi() {
        document.querySelector('.ux-consent-banner')?.remove();
        document.querySelector('.ux-privacy-overlay')?.remove();
    }

    function showPrivacySettings(firstVisit = false) {
        closePrivacyUi();
        const current = readConsent() || {
            analytics: false,
            detailedPreferences: false
        };
        const overlay = element('div', 'ux-privacy-overlay');
        const dialog = element('section', 'ux-privacy-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'ux-privacy-title');

        const title = element('h2', null, t('隐私设置', 'Privacy settings'));
        title.id = 'ux-privacy-title';
        const description = element(
            'p',
            'ux-privacy-description',
            t('你可以决定是否允许网站记录页面停留与使用偏好。',
                'Choose whether the site may record page engagement and usage preferences.')
        );
        const options = element('div', 'ux-privacy-options');

        const analyticsLabel = element('label', 'ux-privacy-option');
        const analyticsInput = document.createElement('input');
        analyticsInput.type = 'checkbox';
        analyticsInput.checked = current.analytics;
        const analyticsText = element('span');
        analyticsText.append(
            element('strong', null, t('体验分析', 'Experience analytics')),
            element('small', null, t('记录访问页面、活跃时长、滚动深度和操作类型。',
                'Records visited pages, active time, scroll depth, and action categories.'))
        );
        analyticsLabel.append(analyticsInput, analyticsText);

        const detailsLabel = element('label', 'ux-privacy-option');
        const detailsInput = document.createElement('input');
        detailsInput.type = 'checkbox';
        detailsInput.checked = current.analytics && current.detailedPreferences;
        detailsInput.disabled = !analyticsInput.checked;
        const detailsText = element('span');
        detailsText.append(
            element('strong', null, t('设备与语言偏好', 'Device and language preferences')),
            element('small', null, t('包括设备类型、语言、时区、屏幕和无障碍偏好，不保存 UX 记录的完整 IP。',
                'Includes device type, language, time zone, screen, and accessibility preferences. Full IP addresses are not stored in UX records.'))
        );
        detailsLabel.append(detailsInput, detailsText);
        options.append(analyticsLabel, detailsLabel);

        analyticsInput.addEventListener('change', () => {
            detailsInput.disabled = !analyticsInput.checked;
            if (!analyticsInput.checked) detailsInput.checked = false;
        });

        const actions = element('div', 'ux-privacy-actions');
        const cancelButton = element('button', 'ux-privacy-secondary', t('取消', 'Cancel'));
        cancelButton.type = 'button';
        const saveButton = element('button', 'ux-privacy-primary', t('保存', 'Save'));
        saveButton.type = 'button';
        if (!firstVisit) {
            cancelButton.addEventListener('click', closePrivacyUi);
            actions.appendChild(cancelButton);
        }
        saveButton.addEventListener('click', async () => {
            const previous = readConsent();
            const analytics = analyticsInput.checked;
            const detailed = analytics && detailsInput.checked;
            if (previous?.analytics && !analytics) {
                await revokeCurrentSession();
                clearTrackingStorage();
            }
            storeConsent(analytics, detailed);
            closePrivacyUi();
            if (analytics !== previous?.analytics
                || detailed !== previous?.detailedPreferences) {
                window.location.reload();
            }
        });
        actions.appendChild(saveButton);
        dialog.append(title, description, options, actions);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        analyticsInput.focus();
    }

    function showConsentBanner() {
        closePrivacyUi();
        const banner = element('aside', 'ux-consent-banner');
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', t('分析隐私选择', 'Analytics privacy choice'));
        const text = element(
            'p',
            null,
            t('允许体验分析后，网站会记录页面停留与设备偏好，用于改进使用体验。',
                'Allow experience analytics to record page engagement and device preferences for product improvement.')
        );
        const actions = element('div', 'ux-consent-actions');
        const reject = element('button', 'ux-privacy-secondary', t('仅必要功能', 'Necessary only'));
        reject.type = 'button';
        reject.addEventListener('click', () => {
            storeConsent(false, false);
            clearTrackingStorage();
            closePrivacyUi();
        });
        const settings = element('button', 'ux-privacy-secondary', t('设置', 'Settings'));
        settings.type = 'button';
        settings.addEventListener('click', () => showPrivacySettings(true));
        const accept = element('button', 'ux-privacy-primary', t('允许', 'Allow'));
        accept.type = 'button';
        accept.addEventListener('click', () => {
            storeConsent(true, true);
            closePrivacyUi();
            window.location.reload();
        });
        actions.append(reject, settings, accept);
        banner.append(text, actions);
        document.body.appendChild(banner);
    }

    document.getElementById('privacy-settings-button')?.addEventListener('click', () => {
        showPrivacySettings(false);
    });
    window.UXPrivacy = Object.freeze({ open: () => showPrivacySettings(false) });

    const consent = readConsent();
    if (!consent) {
        showConsentBanner();
        return;
    }
    if (!consent.analytics) return;

    function getTabNonce() {
        const stored = readStorage(sessionStorage, TAB_KEY);
        if (isUuid(stored)) return stored;
        const created = uuid();
        writeStorage(sessionStorage, TAB_KEY, created);
        return created;
    }

    function normalizeRoute(value) {
        try {
            const url = new URL(value, window.location.href);
            if (url.origin !== window.location.origin) return '/external';
            if (/^\/admin\/users\/[^/]+\/records$/.test(url.pathname)) {
                return '/admin/users/:username/records';
            }
            return url.pathname.slice(0, 180) || '/';
        } catch {
            return '/unknown';
        }
    }

    function mediaMatches(query) {
        try {
            return window.matchMedia(query).matches;
        } catch {
            return false;
        }
    }

    function getDeviceType() {
        const coarse = mediaMatches('(pointer: coarse)');
        const width = Math.min(screen.width || innerWidth, screen.height || innerHeight);
        if (coarse && width < 600) return 'mobile';
        if (coarse && width < 1100) return 'tablet';
        return 'desktop';
    }

    function getPreferences() {
        if (!consent.detailedPreferences) return {};
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        return {
            deviceType: getDeviceType(),
            platform: navigator.userAgentData?.platform || navigator.platform || null,
            browserLanguage: navigator.language || null,
            preferredLanguages: Array.isArray(navigator.languages) ? navigator.languages.slice(0, 10) : [],
            appLanguage: document.documentElement.lang || null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
            screenWidth: screen.width || null,
            screenHeight: screen.height || null,
            viewportWidth: innerWidth || null,
            viewportHeight: innerHeight || null,
            pixelRatio: devicePixelRatio || 1,
            orientation: screen.orientation?.type || null,
            colorScheme: mediaMatches('(prefers-color-scheme: dark)') ? 'dark' : 'light',
            reducedMotion: mediaMatches('(prefers-reduced-motion: reduce)'),
            highContrast: mediaMatches('(prefers-contrast: more)'),
            touchCapable: navigator.maxTouchPoints > 0,
            cookiesEnabled: navigator.cookieEnabled === true,
            standalone: mediaMatches('(display-mode: standalone)') || navigator.standalone === true,
            hardwareConcurrency: navigator.hardwareConcurrency || null,
            deviceMemoryGb: navigator.deviceMemory || null,
            connectionType: connection?.effectiveType || connection?.type || null,
            saveData: connection?.saveData === true
        };
    }

    async function bootstrap() {
        const response = await fetch(BOOTSTRAP_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                analytics: true,
                detailedPreferences: consent.detailedPreferences,
                consentVersion: CONSENT_VERSION,
                tabNonce: getTabNonce()
            }),
            credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('analytics_bootstrap_failed');
        const body = await response.json();
        if (!body?.success || !isUuid(body.session?.id) || !isUuid(body.session?.anonymousId)
            || !isUuid(body.session?.tabId) || !isUuid(body.session?.tabNonce)
            || typeof body.session?.startedAt !== 'string'
            || typeof body.session?.ingestToken !== 'string') {
            throw new Error('analytics_bootstrap_invalid');
        }
        return body.session;
    }

    bootstrap().then((session) => {
        issuedSession = session;
        startAnalytics(session);
    }).catch(() => {
        window.UXAnalytics = noopAnalytics;
    });

    function startAnalytics(session) {
        let page = null;
        let pendingEvents = [];
        let lastInteractionAt = Date.now();
        let lastTickAt = performance.now();
        let paused = false;
        let sending = false;
        let retryCount = 0;
        let retryTimer = null;
        let queue = readStorage(sessionStorage, QUEUE_KEY);
        queue = Array.isArray(queue)
            ? queue.filter((batch) => batch?.payload?.session?.id === session.id).slice(-20)
            : [];

        function persistQueue() {
            while (queue.length > 1
                && JSON.stringify(queue).length > 120000) queue.shift();
            writeStorage(sessionStorage, QUEUE_KEY, queue);
        }

        function updateActivityClock() {
            if (!page || page.ended) return;
            const now = performance.now();
            const elapsed = Math.max(0, Math.min(5000, now - lastTickAt));
            const recentlyActive = Date.now() - lastInteractionAt <= ACTIVE_WINDOW_MS;
            if (!paused && document.visibilityState === 'visible' && recentlyActive) {
                page.activeMs += elapsed;
            }
            lastTickAt = now;
        }

        function updateScrollDepth() {
            if (!page || page.ended) return;
            const scrollable = Math.max(0, document.documentElement.scrollHeight - innerHeight);
            const percent = scrollable === 0 ? 100 : Math.round(100 * Math.min(1, scrollY / scrollable));
            page.maxScrollPercent = Math.max(page.maxScrollPercent, percent);
        }

        function noteInteraction() {
            lastInteractionAt = Date.now();
        }

        function track(eventType, elementName = null, metadata = {}) {
            if (!page || page.ended) return;
            pendingEvents.push({
                id: uuid(),
                pageViewId: page.id,
                eventType,
                elementName,
                metadata,
                occurredAt: new Date().toISOString()
            });
            if (pendingEvents.length > 100) pendingEvents = pendingEvents.slice(-100);
        }

        function pagePayload(exitReason = null) {
            updateActivityClock();
            updateScrollDepth();
            return {
                id: page.id,
                route: page.route,
                referrerRoute: page.referrerRoute,
                enteredAt: page.enteredAt,
                exitedAt: page.exitedAt,
                durationMs: Math.min(86400000, Math.max(0, Date.now() - page.enteredTimestamp)),
                activeMs: Math.min(86400000, Math.round(page.activeMs)),
                maxScrollPercent: page.maxScrollPercent,
                exitReason: exitReason || page.exitReason,
                isEmbedded: page.isEmbedded
            };
        }

        function buildPayload(reason, exitReason = null) {
            const events = pendingEvents.filter((event) => event.pageViewId === page.id).slice(0, 25);
            return {
                reason,
                session: {
                    id: session.id,
                    anonymousId: session.anonymousId,
                    tabId: session.tabId,
                    tabNonce: session.tabNonce,
                    startedAt: session.startedAt,
                    ingestToken: session.ingestToken,
                    detailedPreferences: consent.detailedPreferences,
                    preferences: getPreferences()
                },
                pageView: pagePayload(exitReason),
                events: events.map(({ pageViewId, ...event }) => event)
            };
        }

        function enqueue(payload) {
            const batch = { id: uuid(), payload };
            const index = queue.findIndex((item) => (
                item?.payload?.pageView?.id === payload.pageView.id
            ));
            if (index >= 0) queue[index] = batch;
            else queue.push(batch);
            queue = queue.slice(-20);
            persistQueue();
            return batch;
        }

        function scheduleRetry() {
            if (retryTimer || queue.length === 0) return;
            const delay = Math.min(60000, 1000 * (2 ** Math.min(retryCount, 6)));
            retryTimer = setTimeout(() => {
                retryTimer = null;
                flushQueue();
            }, delay);
        }

        async function flushQueue() {
            if (sending || queue.length === 0) return;
            const batch = queue[0];
            sending = true;
            try {
                const response = await fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(batch.payload),
                    credentials: 'same-origin',
                    keepalive: true
                });
                if (response.ok) {
                    queue = queue.filter((item) => item.id !== batch.id);
                    const sentIds = new Set((batch.payload.events || []).map((event) => event.id));
                    pendingEvents = pendingEvents.filter((event) => !sentIds.has(event.id));
                    retryCount = 0;
                    persistQueue();
                } else if (response.status === 401 || response.status === 403) {
                    queue = [];
                    persistQueue();
                } else {
                    retryCount += 1;
                }
            } catch {
                retryCount += 1;
            } finally {
                sending = false;
                if (queue.length > 0) scheduleRetry();
            }
        }

        function send(reason, options = {}) {
            if (!page) return;
            const batch = enqueue(buildPayload(reason, options.exitReason));
            if (options.beacon && typeof navigator.sendBeacon === 'function') {
                navigator.sendBeacon(ENDPOINT, JSON.stringify(batch.payload));
                return;
            }
            flushQueue();
        }

        function startPage() {
            const now = new Date();
            page = {
                id: uuid(),
                route: normalizeRoute(window.location.href),
                referrerRoute: document.referrer ? normalizeRoute(document.referrer) : null,
                enteredAt: now.toISOString(),
                enteredTimestamp: now.getTime(),
                activeMs: 0,
                maxScrollPercent: 0,
                exitReason: null,
                exitedAt: null,
                ended: false,
                isEmbedded: window.self !== window.top
            };
            paused = false;
            lastInteractionAt = Date.now();
            lastTickAt = performance.now();
            updateScrollDepth();
            track('page_view', 'page', { route: page.route, embedded: page.isEmbedded });
            send('start');
        }

        function endPage(reason, useBeacon = true) {
            if (!page || page.ended) return;
            updateActivityClock();
            page.exitReason = reason;
            page.exitedAt = new Date().toISOString();
            pendingEvents.push({
                id: uuid(),
                pageViewId: page.id,
                eventType: 'page_exit',
                elementName: 'page',
                metadata: { reason },
                occurredAt: page.exitedAt
            });
            page.ended = true;
            send('exit', { beacon: useBeacon, exitReason: reason });
        }

        function pausePage(reason = 'shell_covered') {
            endPage(reason, true);
            paused = true;
        }

        function resumePage() {
            if (page && !page.ended) return;
            startPage();
        }

        revokeCurrentSession = async () => {
            if (!issuedSession) return;
            await fetch(REVOKE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session: issuedSession }),
                credentials: 'same-origin'
            }).catch(() => {});
        };

        window.UXAnalytics = Object.freeze({
            track,
            pausePage,
            resumePage,
            flush: () => send('manual')
        });

        for (const eventName of ['pointerdown', 'keydown', 'touchstart']) {
            document.addEventListener(eventName, noteInteraction, { passive: true, capture: true });
        }
        document.addEventListener('scroll', () => {
            noteInteraction();
            updateScrollDepth();
        }, { passive: true });
        document.addEventListener('visibilitychange', () => {
            updateActivityClock();
            send('visibility');
        });
        window.addEventListener('resize', updateScrollDepth, { passive: true });
        window.addEventListener('pagehide', () => endPage('pagehide', true));
        window.addEventListener('error', (event) => {
            track('client_error', 'window', { name: event.error?.name || 'Error' });
        });
        window.addEventListener('unhandledrejection', (event) => {
            track('client_error', 'promise', { name: event.reason?.name || 'UnhandledRejection' });
        });
        document.addEventListener('click', (event) => {
            const link = event.target.closest?.('a[href]');
            if (link) {
                const destination = normalizeRoute(link.href);
                track(
                    link.pathname?.startsWith('/set-language/') ? 'language_changed' : 'navigation_click',
                    link.dataset.uxName || 'link',
                    { destination }
                );
            }
            const actionElement = event.target.closest?.('[data-ux-event]');
            if (actionElement) track('ui_action', actionElement.dataset.uxEvent, {});
        }, { capture: true });

        setInterval(updateActivityClock, 1000);
        setInterval(() => send('heartbeat'), HEARTBEAT_MS);
        persistQueue();
        flushQueue();
        startPage();
    }
})();
