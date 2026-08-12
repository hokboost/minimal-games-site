(() => {
    const ENDPOINT = '/api/ux/batch';
    const HEARTBEAT_MS = 15000;
    const ACTIVE_WINDOW_MS = 30000;
    const SESSION_IDLE_MS = 30 * 60 * 1000;
    const anonymousKey = 'minimal-games:ux-anonymous:v1';
    const sessionKey = 'minimal-games:ux-session:v1';
    const tabKey = 'minimal-games:ux-tab:v1';
    const apiActions = new Map([
        ['/api/quiz/start', ['quiz', 'start']],
        ['/api/quiz/next', ['quiz', 'next']],
        ['/api/quiz/submit', ['quiz', 'submit']],
        ['/api/dictation/start', ['dictation', 'start']],
        ['/api/dictation/retry', ['dictation', 'retry']],
        ['/api/dictation/submit', ['dictation', 'submit']],
        ['/api/slot/play', ['slot', 'play']],
        ['/api/scratch/play', ['scratch', 'play']],
        ['/api/stone/add', ['stone', 'add']],
        ['/api/stone/fill', ['stone', 'fill']],
        ['/api/stone/replace', ['stone', 'replace']],
        ['/api/stone/redeem', ['stone', 'redeem']],
        ['/api/flip/start', ['flip', 'start']],
        ['/api/flip/flip', ['flip', 'flip']],
        ['/api/flip/cashout', ['flip', 'cashout']],
        ['/api/blindbox/open', ['blindbox', 'open']],
        ['/api/duel/play', ['duel', 'play']],
        ['/api/wish/play', ['wish', 'play']],
        ['/api/wish-batch', ['wish', 'batch']],
        ['/api/gifts/exchange', ['gifts', 'exchange']]
    ]);
    const completedActions = new Set([
        'quiz.submit',
        'slot.play',
        'scratch.play',
        'stone.redeem',
        'flip.cashout',
        'blindbox.open',
        'duel.play',
        'wish.play',
        'wish.batch'
    ]);

    function uuid() {
        if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
        } catch {
            // Analytics remains best-effort when storage is unavailable.
        }
    }

    function getStableId(storage, key) {
        const stored = readStorage(storage, key);
        if (typeof stored === 'string' && stored.length === 36) return stored;
        const created = uuid();
        writeStorage(storage, key, created);
        return created;
    }

    function getSession() {
        const now = Date.now();
        const stored = readStorage(sessionStorage, sessionKey);
        if (
            stored?.id && stored?.startedAt && Number.isFinite(stored.lastActivity)
            && now - stored.lastActivity < SESSION_IDLE_MS
        ) {
            stored.lastActivity = now;
            writeStorage(sessionStorage, sessionKey, stored);
            return stored;
        }
        const created = { id: uuid(), startedAt: new Date(now).toISOString(), lastActivity: now };
        writeStorage(sessionStorage, sessionKey, created);
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

    const anonymousId = getStableId(localStorage, anonymousKey);
    const tabId = getStableId(sessionStorage, tabKey);
    let session = getSession();
    let page = null;
    let pendingEvents = [];
    let lastInteractionAt = Date.now();
    let lastTickAt = performance.now();
    let paused = false;
    let sending = false;

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
        const now = Date.now();
        if (now - session.lastActivity >= SESSION_IDLE_MS) {
            endPage('session_timeout', true);
            session = getSession();
            startPage();
        }
        lastInteractionAt = now;
        session.lastActivity = lastInteractionAt;
        writeStorage(sessionStorage, sessionKey, session);
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
        const now = Date.now();
        return {
            id: page.id,
            route: page.route,
            referrerRoute: page.referrerRoute,
            enteredAt: page.enteredAt,
            exitedAt: page.exitedAt,
            durationMs: Math.min(86400000, Math.max(0, now - page.enteredTimestamp)),
            activeMs: Math.min(86400000, Math.round(page.activeMs)),
            maxScrollPercent: page.maxScrollPercent,
            exitReason: exitReason || page.exitReason,
            isEmbedded: page.isEmbedded
        };
    }

    function removeSentEvents(ids) {
        if (!ids.size) return;
        pendingEvents = pendingEvents.filter((event) => !ids.has(event.id));
    }

    function send(reason, options = {}) {
        if (!page || (sending && !options.beacon)) return;
        const pageId = page.id;
        const eventSnapshot = pendingEvents.filter((event) => event.pageViewId === pageId).slice(0, 25);
        const sentIds = new Set(eventSnapshot.map((event) => event.id));
        const payload = {
            reason,
            session: {
                id: session.id,
                anonymousId,
                tabId,
                startedAt: session.startedAt,
                preferences: getPreferences()
            },
            pageView: pagePayload(options.exitReason),
            events: eventSnapshot.map(({ pageViewId, ...event }) => event)
        };
        const serialized = JSON.stringify(payload);

        if (options.beacon && typeof navigator.sendBeacon === 'function') {
            const accepted = navigator.sendBeacon(
                ENDPOINT,
                serialized
            );
            if (accepted) removeSentEvents(sentIds);
            return;
        }

        sending = true;
        fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: serialized,
            credentials: 'same-origin',
            keepalive: serialized.length < 60000
        }).then((response) => {
            if (response.ok) removeSentEvents(sentIds);
        }).catch(() => {}).finally(() => {
            sending = false;
        });
    }

    function endPage(reason, useBeacon = true) {
        if (!page || page.ended) return;
        updateActivityClock();
        page.ended = true;
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

    function classifyApiAction(pathname) {
        return apiActions.get(pathname) || null;
    }

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
        let url;
        try {
            url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
        } catch {
            return originalFetch(input, init);
        }
        const action = url.origin === window.location.origin ? classifyApiAction(url.pathname) : null;
        if (!action || url.pathname === ENDPOINT) return originalFetch(input, init);

        const started = performance.now();
        try {
            const response = await originalFetch(input, init);
            let responseBody = null;
            try {
                responseBody = await response.clone().json();
            } catch {
                // Status still provides a useful outcome when the body is not JSON.
            }
            const [game, apiAction] = action;
            const success = response.ok && responseBody?.success !== false;
            const metadata = {
                game,
                action: apiAction,
                success,
                status: response.status,
                durationMs: Math.round(performance.now() - started),
                code: typeof responseBody?.code === 'string' ? responseBody.code.slice(0, 80) : null
            };
            track('api_action', `${game}.${apiAction}`, metadata);
            if (apiAction === 'start' && success) track('game_started', game, { action: apiAction });
            if (completedActions.has(`${game}.${apiAction}`) && success) {
                track('game_completed', game, { action: apiAction });
            }
            if (!success) {
                const insufficient = /余额不足|积分不足|balance|insufficient/i.test(
                    `${responseBody?.code || ''} ${responseBody?.message || ''}`
                );
                track(insufficient ? 'insufficient_balance' : 'game_error', game, metadata);
            }
            return response;
        } catch (error) {
            const [game, apiAction] = action;
            track('game_error', game, {
                action: apiAction,
                networkError: true,
                durationMs: Math.round(performance.now() - started)
            });
            throw error;
        }
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
        track('client_error', 'window', {
            name: event.error?.name || 'Error',
            message: String(event.message || 'Unknown error').slice(0, 160)
        });
    });
    window.addEventListener('unhandledrejection', (event) => {
        track('client_error', 'promise', {
            name: event.reason?.name || 'UnhandledRejection'
        });
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
        if (actionElement) {
            track('ui_action', actionElement.dataset.uxEvent, {});
        }
    }, { capture: true });

    setInterval(updateActivityClock, 1000);
    setInterval(() => send('heartbeat'), HEARTBEAT_MS);
    startPage();
})();
