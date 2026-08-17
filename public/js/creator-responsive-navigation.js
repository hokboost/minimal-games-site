(function creatorResponsiveNavigationBootstrap() {
    'use strict';

    if (!document.body || document.querySelector('[data-section-navigation]')) return;
    const main = document.querySelector('main');
    if (!main) return;

    const language = document.documentElement.lang?.startsWith('zh') ? 'zh' : 'en';
    const copy = language === 'zh' ? {
        title: '本页导航',
        open: '打开本页导航',
        close: '关闭本页导航',
        current: '当前位置',
        top: '返回页首',
        next: '下一节',
        previous: '上一节',
        progress: '阅读进度',
        section: '章节',
        skip: '跳到主要内容'
    } : {
        title: 'On this page',
        open: 'Open page navigation',
        close: 'Close page navigation',
        current: 'Current location',
        top: 'Back to top',
        next: 'Next section',
        previous: 'Previous section',
        progress: 'Reading progress',
        section: 'Section',
        skip: 'Skip to main content'
    };

    if (!main.id) main.id = 'creator-main-content';
    if (!document.querySelector(`a[href="#${main.id}"]`)) {
        const skip = document.createElement('a');
        skip.className = 'creator-skip-link';
        skip.href = `#${main.id}`;
        skip.textContent = copy.skip;
        document.body.prepend(skip);
    }

    const headings = [...main.querySelectorAll('h2, h3')].filter(heading => {
        if (heading.closest('[hidden]')) return false;
        if (heading.closest('[role="dialog"]')) return false;
        return heading.textContent.trim().length > 0;
    });
    if (headings.length < 2) return;

    const usedIds = new Set([...document.querySelectorAll('[id]')].map(element => element.id));
    function slug(text) {
        const normalized = text.toLowerCase()
            .normalize('NFKD')
            .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48) || 'section';
        let candidate = `creator-${normalized}`;
        let suffix = 2;
        while (usedIds.has(candidate)) candidate = `creator-${normalized}-${suffix++}`;
        usedIds.add(candidate);
        return candidate;
    }

    headings.forEach(heading => {
        if (!heading.id) heading.id = slug(heading.textContent.trim());
        heading.tabIndex = -1;
        heading.dataset.navigationHeading = 'true';
    });

    const navigation = document.createElement('nav');
    navigation.className = 'creator-section-navigation';
    navigation.dataset.sectionNavigation = 'true';
    navigation.setAttribute('aria-label', copy.title);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'creator-section-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'creator-section-panel');
    const toggleIcon = document.createElement('span');
    toggleIcon.setAttribute('aria-hidden', 'true');
    toggleIcon.textContent = '☰';
    const toggleText = document.createElement('span');
    toggleText.textContent = copy.title;
    toggle.append(toggleIcon, toggleText);

    const panel = document.createElement('div');
    panel.id = 'creator-section-panel';
    panel.className = 'creator-section-panel';
    panel.hidden = true;

    const heading = document.createElement('div');
    heading.className = 'creator-section-heading';
    const headingTitle = document.createElement('strong');
    headingTitle.textContent = copy.title;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'creator-section-close';
    close.setAttribute('aria-label', copy.close);
    close.textContent = '×';
    heading.append(headingTitle, close);

    const progressLabel = document.createElement('p');
    progressLabel.className = 'creator-section-progress-label';
    progressLabel.textContent = copy.progress;

    const progress = document.createElement('progress');
    progress.className = 'creator-section-progress';
    progress.max = headings.length;
    progress.value = 1;
    progress.setAttribute('aria-label', copy.progress);

    const list = document.createElement('ol');
    list.className = 'creator-section-list';

    const links = headings.map((sectionHeading, index) => {
        const item = document.createElement('li');
        item.className = sectionHeading.tagName === 'H3' ? 'is-subsection' : 'is-section';
        const link = document.createElement('a');
        link.href = `#${sectionHeading.id}`;
        link.dataset.sectionIndex = String(index);
        link.textContent = sectionHeading.textContent.trim();
        link.setAttribute('aria-label', `${copy.section} ${index + 1}: ${link.textContent}`);
        item.append(link);
        list.append(item);
        return link;
    });

    const controls = document.createElement('div');
    controls.className = 'creator-section-controls';

    const previous = document.createElement('button');
    previous.type = 'button';
    previous.textContent = `← ${copy.previous}`;

    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = `${copy.next} →`;

    const top = document.createElement('a');
    top.href = `#${main.id}`;
    top.textContent = `↑ ${copy.top}`;
    controls.append(previous, next, top);
    panel.append(heading, progressLabel, progress, list, controls);
    navigation.append(toggle, panel);
    document.body.append(navigation);

    let activeIndex = 0;
    let expanded = false;

    function setExpanded(value, moveFocus = false) {
        expanded = Boolean(value);
        panel.hidden = !expanded;
        toggle.setAttribute('aria-expanded', String(expanded));
        navigation.classList.toggle('is-open', expanded);
        if (expanded && moveFocus) links[activeIndex]?.focus();
        if (!expanded && moveFocus) toggle.focus();
    }

    function setActive(index, options = {}) {
        const bounded = Math.min(headings.length - 1, Math.max(0, Number(index) || 0));
        activeIndex = bounded;
        links.forEach((link, linkIndex) => {
            const current = linkIndex === activeIndex;
            link.classList.toggle('is-current', current);
            if (current) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
        });
        progress.value = activeIndex + 1;
        progressLabel.textContent = `${copy.progress}: ${activeIndex + 1}/${headings.length}`;
        previous.disabled = activeIndex === 0;
        next.disabled = activeIndex === headings.length - 1;
        toggle.dataset.currentSection = String(activeIndex + 1);
        toggle.setAttribute('aria-label', `${copy.open}. ${copy.current}: ${links[activeIndex].textContent}`);
        if (options.focus) {
            const target = headings[activeIndex];
            target.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
            target.focus({ preventScroll: true });
            if (window.innerWidth < 760) setExpanded(false, false);
        }
    }

    function move(delta) {
        setActive(activeIndex + delta, { focus: true });
    }

    links.forEach((link, index) => {
        link.addEventListener('click', event => {
            event.preventDefault();
            setActive(index, { focus: true });
            history.replaceState(null, '', `#${headings[index].id}`);
        });
        link.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const targetIndex = event.key === 'Home' ? 0
                : event.key === 'End' ? links.length - 1
                    : index + (event.key === 'ArrowDown' ? 1 : -1);
            links[Math.min(links.length - 1, Math.max(0, targetIndex))].focus();
        });
    });

    toggle.addEventListener('click', () => setExpanded(!expanded, true));
    close.addEventListener('click', () => setExpanded(false, true));
    previous.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    panel.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setExpanded(false, true);
        }
    });

    let observer = null;
    if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(entries => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
            if (!visible.length) return;
            const index = headings.indexOf(visible[0].target);
            if (index >= 0) setActive(index);
        }, {
            rootMargin: '-15% 0px -70% 0px',
            threshold: [0, 0.2, 0.8]
        });
        headings.forEach(sectionHeading => observer.observe(sectionHeading));
    } else {
        let scheduled = false;
        window.addEventListener('scroll', () => {
            if (scheduled) return;
            scheduled = true;
            window.requestAnimationFrame(() => {
                scheduled = false;
                let closest = 0;
                headings.forEach((sectionHeading, index) => {
                    if (sectionHeading.getBoundingClientRect().top <= 160) closest = index;
                });
                setActive(closest);
            });
        }, { passive: true });
    }

    const initialHash = decodeURIComponent(window.location.hash.slice(1));
    const initialIndex = headings.findIndex(sectionHeading => sectionHeading.id === initialHash);
    setActive(initialIndex >= 0 ? initialIndex : 0);

    window.CreatorSectionNavigation = Object.freeze({
        open: () => setExpanded(true, true),
        close: () => setExpanded(false, true),
        goTo: index => setActive(index, { focus: true }),
        next: () => move(1),
        previous: () => move(-1),
        state: () => ({
            activeIndex,
            expanded,
            sectionCount: headings.length,
            activeId: headings[activeIndex].id
        }),
        destroy: () => {
            observer?.disconnect();
            navigation.remove();
        }
    });
})();
