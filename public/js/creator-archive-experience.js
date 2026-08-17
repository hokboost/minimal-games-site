'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const achievementPage = document.querySelector('.achievement-shell');
    if (!achievementPage) return;
    const sections = Array.from(achievementPage.querySelectorAll(':scope > section'));
    const collectionSection = sections.find(section => /永久收藏|Permanent collection/.test(section.querySelector('h2')?.textContent || ''));
    const archiveSection = sections.find(section => /赛季归档|Season archive/.test(section.querySelector('h2')?.textContent || ''));
    const state = {
        collectionPage: 1,
        archivePage: 1,
        pageSize: 10,
        collectionQuery: '',
        archiveQuery: ''
    };

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function enhanceList(section, key, labels) {
        if (!section) return null;
        const list = section.querySelector('ul');
        if (!list) return null;
        const items = Array.from(list.querySelectorAll('li'));
        const controls = create('div', 'creator-archive-controls');
        const searchLabel = create('label', 'creator-explorer-field');
        searchLabel.append(create('span', '', labels.search));
        const search = create('input', 'creator-explorer-search');
        search.type = 'search';
        search.placeholder = labels.placeholder;
        searchLabel.append(search);
        const summary = create('p', 'creator-explorer-summary');
        summary.setAttribute('role', 'status');
        summary.setAttribute('aria-live', 'polite');
        controls.append(searchLabel, summary);
        list.before(controls);
        const pager = create('nav', 'creator-inline-pager');
        pager.setAttribute('aria-label', labels.pagination);
        const previous = create('button', '', t('上一页', 'Previous'));
        previous.type = 'button';
        const pageLabel = create('span');
        const next = create('button', '', t('下一页', 'Next'));
        next.type = 'button';
        pager.append(previous, pageLabel, next);
        list.after(pager);

        function filtered() {
            const query = shell.normalizeText(state[`${key}Query`]);
            if (!query) return items;
            return items.filter(item => shell.normalizeText(item.textContent).includes(query));
        }

        function render() {
            const matches = filtered();
            const pageCount = Math.max(1, Math.ceil(matches.length / state.pageSize));
            state[`${key}Page`] = Math.max(1, Math.min(pageCount, state[`${key}Page`]));
            const start = (state[`${key}Page`] - 1) * state.pageSize;
            const visible = new Set(matches.slice(start, start + state.pageSize));
            for (const item of items) {
                item.hidden = !visible.has(item);
                item.setAttribute('aria-hidden', String(!visible.has(item)));
            }
            const end = Math.min(start + state.pageSize, matches.length);
            summary.textContent = t(`显示 ${matches.length ? start + 1 : 0}–${end}，共 ${matches.length} 项`,
                `Showing ${matches.length ? start + 1 : 0}–${end} of ${matches.length}`);
            pageLabel.textContent = t(`第 ${state[`${key}Page`]}/${pageCount} 页`,
                `Page ${state[`${key}Page`]} of ${pageCount}`);
            previous.disabled = state[`${key}Page`] <= 1;
            next.disabled = state[`${key}Page`] >= pageCount;
            pager.hidden = matches.length <= state.pageSize;
            let empty = section.querySelector(`[data-archive-empty="${key}"]`);
            if (!empty) {
                empty = shell.createStatePanel('empty', labels.emptyTitle, labels.emptyBody);
                empty.dataset.archiveEmpty = key;
                pager.after(empty);
            }
            empty.hidden = matches.length !== 0;
            list.hidden = matches.length === 0;
        }

        search.addEventListener('input', () => {
            state[`${key}Query`] = search.value;
            state[`${key}Page`] = 1;
            render();
        });
        previous.addEventListener('click', () => {
            state[`${key}Page`] -= 1;
            render();
        });
        next.addEventListener('click', () => {
            state[`${key}Page`] += 1;
            render();
        });
        render();
        return { render, items };
    }

    const collection = enhanceList(collectionSection, 'collection', {
        search: t('搜索收藏键', 'Search collection keys'),
        placeholder: t('物品或展柜位置', 'Item or showcase slot'),
        pagination: t('永久收藏分页', 'Permanent collection pages'),
        emptyTitle: t('没有匹配收藏', 'No matching collection item'),
        emptyBody: t('已得收藏不会被筛选删除；清除搜索即可重新显示。',
            'Filtering never deletes earned collection; clear search to show it again.')
    });
    const archive = enhanceList(archiveSection, 'archive', {
        search: t('搜索赛季或路线结论', 'Search season or route conclusion'),
        placeholder: t('赛季、版本或结论', 'Season, version, or conclusion'),
        pagination: t('赛季归档分页', 'Season archive pages'),
        emptyTitle: t('没有匹配赛季', 'No matching season archive'),
        emptyBody: t('归档绑定完成时的内容快照；更换搜索不会改变历史。',
            'Archives bind the completion content snapshot; changing search does not alter history.')
    });

    function installBoundary() {
        if (!archiveSection) return;
        const details = create('details', 'creator-boundary-disclosure');
        const summary = create('summary', '', t('归档与永久收藏边界', 'Archive and permanent collection boundary'));
        const list = create('ul', 'creator-help-actions');
        for (const value of [
            t('赛季归档哈希来自绑定 story content snapshot，不是事件 payload。',
                'Season archive hash comes from the bound story content snapshot, not event payload.'),
            t('功能开关关闭只隐藏入口，不删除进度、收藏或归档。',
                'Feature disablement hides entry points without deleting progress, collection, or archives.'),
            t('收藏项可更换展柜位置，但取得来源与时间保持可审计。',
                'Collection items may change showcase slot while acquisition source and time remain auditable.'),
            t('页面不会显示隐藏成就的条件、内部过滤器或可信来源标识。',
                'The page reveals no hidden condition, internal filter, or trusted source identifier.')
        ]) list.append(create('li', '', value));
        details.append(summary, list);
        archiveSection.querySelector('h2')?.after(details);
    }

    installBoundary();
    window.CreatorArchiveExperience = Object.freeze({
        state: () => ({ ...state }),
        collection,
        archive
    });
})();
