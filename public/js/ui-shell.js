(() => {
    const body = document.body;
    if (!body) return;

    const route = window.location.pathname.replace(/^\/+|\/+$/g, '') || 'home';
    const gameRoutes = new Set(['quiz', 'slot', 'scratch', 'dictation', 'spin', 'wish', 'blindbox', 'stone', 'flip', 'duel']);

    body.classList.add('app-redesign', `page-${route.replace(/[^a-z0-9-]/gi, '-')}`);
    if (gameRoutes.has(route)) body.classList.add('game-page');

    document.addEventListener('click', (event) => {
        const disabledLink = event.target.closest('a[aria-disabled="true"]');
        if (disabledLink) event.preventDefault();
    });

    document.querySelectorAll('button:not([aria-label])').forEach((button) => {
        const text = button.textContent.trim().replace(/\s+/g, ' ');
        if (text) button.setAttribute('aria-label', text);
    });

    document.querySelectorAll('#result, #game-result, #dictation-status, #resultBox, #summaryText, .result-box, .result-section, .notice').forEach((region) => {
        region.setAttribute('aria-live', 'polite');
        region.setAttribute('aria-atomic', 'true');
    });

    function enhanceInteractiveControls(root = document) {
        const candidates = root.matches?.('.option, .stone-slot, .flip-card, .tier-card')
            ? [root]
            : root.querySelectorAll?.('.option, .stone-slot, .flip-card, .tier-card') || [];

        candidates.forEach((control) => {
            if (control.matches('button, a, input, select, textarea') || control.dataset.uiControl === 'true') return;
            control.dataset.uiControl = 'true';
            control.setAttribute('role', 'button');
            if (!control.hasAttribute('tabindex')) control.tabIndex = 0;
            control.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    if (control.matches('.disabled, .locked, [aria-disabled="true"]') || getComputedStyle(control).pointerEvents === 'none') return;
                    event.preventDefault();
                    control.click();
                }
            });
        });
    }

    enhanceInteractiveControls();
    const interactiveObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE) enhanceInteractiveControls(node);
            });
        });
    });
    interactiveObserver.observe(body, { childList: true, subtree: true });

    const filterButtons = document.querySelectorAll('[data-catalog-filter]');
    const catalogCards = document.querySelectorAll('#game-catalog [data-category]');
    filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const filter = button.dataset.catalogFilter;
            filterButtons.forEach((item) => {
                const selected = item === button;
                item.classList.toggle('active', selected);
                item.setAttribute('aria-pressed', String(selected));
            });
            catalogCards.forEach((card) => {
                card.hidden = filter !== 'all' && card.dataset.category !== filter;
            });
            document.querySelectorAll('[data-catalog-group]').forEach((group) => {
                group.hidden = !group.querySelector('[data-category]:not([hidden])');
            });
        });
    });

    document.querySelectorAll('.records-table-wrap, .leaderboard-section, .admin-content, .records-section').forEach((tableRegion) => {
        if (!tableRegion.hasAttribute('tabindex')) tableRegion.tabIndex = 0;
        tableRegion.setAttribute('role', 'region');
        tableRegion.setAttribute('aria-label', document.documentElement.lang.startsWith('zh') ? '可横向滚动的数据表' : 'Scrollable data table');
    });
})();
