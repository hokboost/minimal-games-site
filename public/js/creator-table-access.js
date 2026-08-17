'use strict';
(() => {
    const language = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    const t = (zh, en) => language === 'zh' ? zh : en;
    const tables = Array.from(document.querySelectorAll('table'));
    const summaries = [];

    function safeLabel(value) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    }

    function enhance(table, index) {
        const headers = Array.from(table.querySelectorAll('thead th')).map(cell => safeLabel(cell.textContent));
        if (!headers.length) return;
        if (!table.id) table.id = `creator-data-table-${index + 1}`;
        const wrapper = table.parentElement;
        wrapper?.classList.add('creator-table-scroll');
        if (wrapper) wrapper.dataset.stacked = 'true';
        wrapper?.setAttribute('role', 'region');
        wrapper?.setAttribute('tabindex', '0');
        wrapper?.setAttribute('aria-label', t('可横向滚动的数据表', 'Horizontally scrollable data table'));
        const caption = table.querySelector('caption') || document.createElement('caption');
        if (!caption.parentElement) {
            caption.textContent = t(`数据表 ${index + 1}`, `Data table ${index + 1}`);
            table.prepend(caption);
        }
        const rows = Array.from(table.querySelectorAll('tbody tr'));
        for (const row of rows) {
            Array.from(row.children).forEach((cell, cellIndex) => {
                if (!headers[cellIndex]) return;
                cell.dataset.columnLabel = headers[cellIndex];
                cell.setAttribute('aria-label', `${headers[cellIndex]}: ${safeLabel(cell.textContent)}`);
            });
        }
        const summary = {
            id: table.id,
            columns: headers.length,
            rows: rows.length,
            headers
        };
        summaries.push(summary);
        const status = document.createElement('p');
        status.className = 'creator-table-summary';
        status.textContent = t(`${rows.length} 行，${headers.length} 列。窄屏可横向滚动。`,
            `${rows.length} rows and ${headers.length} columns. Scroll horizontally on narrow screens.`);
        status.id = `${table.id}-summary`;
        wrapper?.setAttribute('aria-describedby', status.id);
        wrapper?.after(status);
    }

    tables.forEach(enhance);
    window.CreatorTableAccess = Object.freeze({ summaries: () => summaries.map(value => ({ ...value })) });
})();
