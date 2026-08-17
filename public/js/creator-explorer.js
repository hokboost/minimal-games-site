'use strict';
(() => {
    const shell = window.CreatorShell;
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;

    function normalize(value) {
        return String(value || '')
            .normalize('NFKC')
            .toLocaleLowerCase(language === 'zh' ? 'zh-CN' : 'en-US')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function create(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    }

    function resolveValue(item, field) {
        if (field === 'text') return item.textContent;
        if (field.startsWith('data.')) return item.dataset[field.slice(5)] || '';
        return item.querySelector(field)?.textContent || '';
    }

    function buildSearch(id, label, placeholder) {
        const wrapper = create('label', 'creator-explorer-field');
        const labelElement = create('span', '', label);
        const input = create('input', 'creator-explorer-search');
        input.type = 'search';
        input.id = `${id}-search`;
        input.placeholder = placeholder;
        input.autocomplete = 'off';
        input.spellcheck = false;
        wrapper.append(labelElement, input);
        return { wrapper, input };
    }

    function buildSelect(id, filter) {
        const wrapper = create('label', 'creator-explorer-field');
        const label = create('span', '', filter.label);
        const select = create('select', 'creator-explorer-select');
        select.id = `${id}-${filter.key}`;
        const any = create('option', '', filter.anyLabel || t('全部', 'All'));
        any.value = '';
        select.append(any);
        for (const optionDefinition of filter.options || []) {
            const option = create('option', '', optionDefinition.label);
            option.value = optionDefinition.value;
            select.append(option);
        }
        wrapper.append(label, select);
        return { wrapper, select };
    }

    function buildSort(id, sorts) {
        const wrapper = create('label', 'creator-explorer-field');
        const label = create('span', '', t('排序', 'Sort'));
        const select = create('select', 'creator-explorer-select');
        select.id = `${id}-sort`;
        for (const sort of sorts) {
            const option = create('option', '', sort.label);
            option.value = sort.key;
            select.append(option);
        }
        wrapper.append(label, select);
        return { wrapper, select };
    }

    function compare(sort, left, right) {
        const leftValue = resolveValue(left, sort.field);
        const rightValue = resolveValue(right, sort.field);
        if (sort.numeric) return (Number(leftValue) || 0) - (Number(rightValue) || 0);
        return leftValue.localeCompare(rightValue, language === 'zh' ? 'zh-CN' : 'en', {
            numeric: true,
            sensitivity: 'base'
        });
    }

    function itemMatches(item, query, filters) {
        const searchable = normalize(item.dataset.searchText || item.textContent);
        if (query && !searchable.includes(query)) return false;
        for (const filter of filters) {
            const selected = filter.select.value;
            if (!selected) continue;
            const actual = normalize(resolveValue(item, filter.field));
            if (filter.mode === 'contains') {
                if (!actual.includes(normalize(selected))) return false;
            } else if (actual !== normalize(selected)) {
                return false;
            }
        }
        return true;
    }

    function mount(options) {
        const root = document.querySelector(options.root);
        if (!root) return null;
        const collection = root.querySelector(options.collection);
        if (!collection) return null;
        const allItems = Array.from(collection.querySelectorAll(options.item));
        const pageSize = Math.max(4, Math.min(Number(options.pageSize) || 12, 50));
        const id = options.id || `explorer-${Math.random().toString(36).slice(2)}`;
        const state = {
            page: 1,
            query: '',
            sortKey: options.sorts?.[0]?.key || '',
            filtered: allItems.slice(),
            renderCount: 0
        };

        const controls = create('section', 'creator-explorer-controls');
        controls.setAttribute('aria-label', options.label || t('筛选与分页', 'Filter and pagination'));
        const search = buildSearch(
            id,
            options.searchLabel || t('搜索', 'Search'),
            options.searchPlaceholder || t('输入标题或状态', 'Enter title or status')
        );
        controls.append(search.wrapper);

        const filters = (options.filters || []).map(filterDefinition => {
            const control = buildSelect(id, filterDefinition);
            controls.append(control.wrapper);
            return { ...filterDefinition, select: control.select };
        });

        let sortControl = null;
        if (options.sorts?.length) {
            sortControl = buildSort(id, options.sorts);
            controls.append(sortControl.wrapper);
        }

        const clear = create('button', 'creator-explorer-clear', t('清除筛选', 'Clear filters'));
        clear.type = 'button';
        controls.append(clear);

        const summary = create('p', 'creator-explorer-summary');
        summary.id = `${id}-summary`;
        summary.setAttribute('role', 'status');
        summary.setAttribute('aria-live', 'polite');
        controls.setAttribute('aria-describedby', summary.id);
        controls.append(summary);

        const pagination = create('nav', 'creator-explorer-pagination');
        pagination.setAttribute('aria-label', t('结果分页', 'Result pages'));
        const previous = create('button', '', t('上一页', 'Previous'));
        previous.type = 'button';
        const pages = create('div', 'creator-explorer-pages');
        const next = create('button', '', t('下一页', 'Next'));
        next.type = 'button';
        pagination.append(previous, pages, next);

        const empty = shell.createStatePanel(
            'empty',
            options.emptyTitle || t('没有匹配项目', 'No matching items'),
            options.emptyBody || t('清除筛选或换一个搜索词。', 'Clear filters or try another search term.')
        );
        empty.hidden = true;
        empty.dataset.explorerEmpty = id;

        root.insertBefore(controls, collection);
        root.insertBefore(empty, collection.nextSibling);
        root.insertBefore(pagination, empty.nextSibling);

        function pageCount() {
            return Math.max(1, Math.ceil(state.filtered.length / pageSize));
        }

        function sorted(items) {
            const definition = options.sorts?.find(sort => sort.key === state.sortKey);
            if (!definition) return items;
            return items.slice().sort((left, right) => {
                const result = compare(definition, left, right);
                return definition.direction === 'desc' ? -result : result;
            });
        }

        function renderPages() {
            pages.replaceChildren();
            const totalPages = pageCount();
            const lower = Math.max(1, state.page - 2);
            const upper = Math.min(totalPages, state.page + 2);
            for (let page = lower; page <= upper; page += 1) {
                const button = create('button', '', String(page));
                button.type = 'button';
                button.dataset.page = String(page);
                button.setAttribute('aria-label', t(`第 ${page} 页`, `Page ${page}`));
                if (page === state.page) {
                    button.setAttribute('aria-current', 'page');
                    button.disabled = true;
                }
                button.addEventListener('click', () => {
                    state.page = page;
                    render();
                    collection.scrollIntoView({ block: 'start', behavior: shell.preferences().reducedMotion ? 'auto' : 'smooth' });
                });
                pages.append(button);
            }
            previous.disabled = state.page <= 1;
            next.disabled = state.page >= totalPages;
        }

        function render() {
            state.renderCount += 1;
            const start = (state.page - 1) * pageSize;
            const ordered = sorted(state.filtered);
            const matched = new Set(ordered);
            collection.append(...ordered, ...allItems.filter(item => !matched.has(item)));
            const visible = new Set(ordered.slice(start, start + pageSize));
            for (const item of allItems) {
                item.hidden = !visible.has(item);
                item.setAttribute('aria-hidden', String(!visible.has(item)));
            }
            const from = state.filtered.length ? start + 1 : 0;
            const to = Math.min(start + pageSize, state.filtered.length);
            summary.textContent = t(
                `显示 ${from}–${to}，共 ${state.filtered.length} 项`,
                `Showing ${from}–${to} of ${state.filtered.length}`
            );
            empty.hidden = state.filtered.length !== 0;
            collection.hidden = state.filtered.length === 0;
            pagination.hidden = state.filtered.length <= pageSize;
            renderPages();
            options.onRender?.({ ...state, visible: Array.from(visible) });
        }

        function apply() {
            state.query = normalize(search.input.value);
            state.filtered = allItems.filter(item => itemMatches(item, state.query, filters));
            state.sortKey = sortControl?.select.value || state.sortKey;
            state.page = 1;
            render();
        }

        search.input.addEventListener('input', apply);
        for (const filter of filters) filter.select.addEventListener('change', apply);
        sortControl?.select.addEventListener('change', apply);
        clear.addEventListener('click', () => {
            search.input.value = '';
            for (const filter of filters) filter.select.value = '';
            if (sortControl) sortControl.select.selectedIndex = 0;
            apply();
            search.input.focus();
            shell.announce(t('筛选已清除。', 'Filters cleared.'), 'success');
        });
        previous.addEventListener('click', () => {
            if (state.page <= 1) return;
            state.page -= 1;
            render();
        });
        next.addEventListener('click', () => {
            if (state.page >= pageCount()) return;
            state.page += 1;
            render();
        });
        controls.addEventListener('keydown', event => {
            if (event.key === 'Escape' && document.activeElement === search.input && search.input.value) {
                search.input.value = '';
                apply();
            }
        });

        render();
        return Object.freeze({
            apply,
            render,
            state: () => ({
                page: state.page,
                query: state.query,
                sortKey: state.sortKey,
                filteredCount: state.filtered.length,
                renderCount: state.renderCount
            }),
            destroy() {
                controls.remove();
                pagination.remove();
                empty.remove();
                for (const item of allItems) {
                    item.hidden = false;
                    item.removeAttribute('aria-hidden');
                }
                collection.hidden = false;
            }
        });
    }

    window.CreatorExplorer = Object.freeze({ mount, normalize });
})();
