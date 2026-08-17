'use strict';
(() => {
    const root = document.body,
        lang = root.dataset.lang === 'zh' ? 'zh' : 'en',
        t = (zh, en) => lang === 'zh' ? zh : en,
        bootstrap = JSON.parse(document.getElementById('director-bootstrap').textContent),
        composer = document.getElementById('director-composer'),
        targetLabel = document.getElementById('director-target'),
        select = document.getElementById('director-template'),
        fields = document.getElementById('director-fields'),
        message = document.getElementById('director-message');
    let target = null;
    const pending = new Map();
    const id = () => globalThis.crypto.randomUUID();
    async function post(path, body, signature) {
        let saved = pending.get(signature);
        if (!saved) {
            saved = {
                ...body,
                commandId: id()
            };
            pending.set(signature, saved);
        }
        const response = await window.idempotentFetch(path, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': root.dataset.csrfToken
            },
            body: JSON.stringify(saved)
        });
        const payload = await response.json();
        if (response.ok || response.status < 500) pending.delete(signature);
        if (!response.ok) throw new Error(payload.message || 'Request failed');
        return payload;
    }

    function option(template) {
        const node = document.createElement('option');
        node.value = template.key;
        node.textContent = `${template.type} · ${lang==='zh'?template.titleZh:template.titleEn}`;
        return node;
    }
    if (select) bootstrap.templates.forEach(template => select.append(option(template)));

    function renderFields() {
        if (!fields || !select) return;
        fields.replaceChildren();
        const template = bootstrap.templates.find(item => item.key === select.value);
        if (!template) return;
        const body = document.createElement('p');
        body.textContent = lang === 'zh' ? template.bodyZh : template.bodyEn;
        fields.append(body);
        if (template.referenceIds?.length) {
            const label = document.createElement('label');
            label.textContent = t('关联对象', 'Reference');
            const reference = document.createElement('select');
            reference.id = 'director-reference';
            template.referenceIds.forEach(value => {
                const entry = document.createElement('option');
                entry.value = value;
                entry.textContent = value;
                reference.append(entry);
            });
            label.append(reference);
            fields.append(label);
        }
        if (template.type === 'poll') {
            const label = document.createElement('label');
            label.textContent = t('选项（每行一个，2–5项）', 'Options (one per line, 2–5)');
            const area = document.createElement('textarea');
            area.id = 'director-options';
            area.maxLength = 404;
            area.value = t('继续当前路线\n换一条路线', 'Continue this route\nTry another route');
            label.append(area);
            fields.append(label);
        }
        if (template.storyNodeIds?.length) {
            const label = document.createElement('label');
            label.textContent = t('已创作剧情节点', 'Authored story node');
            const node = document.createElement('select');
            node.id = 'director-story-node';
            template.storyNodeIds.forEach(value => {
                const entry = document.createElement('option');
                entry.value = value;
                entry.textContent = value;
                node.append(entry);
            });
            label.append(node);
            fields.append(label);
        }
    }
    document.addEventListener('click', async event => {
        const action = event.target.closest('[data-director-action]');
        if (action) {
            const row = action.closest('tr');
            if (action.dataset.directorAction === 'open') {
                action.disabled = true;
                try {
                    await post('/api/admin/live/open', {
                        creatorUsername: row.dataset.creator
                    }, `open:${row.dataset.creator}`);
                    location.reload();
                } catch (error) {
                    message.textContent = error.message;
                    action.disabled = false;
                }
            } else {
                target = {
                    creatorUsername: row.dataset.creator,
                    interactionId: Number(row.dataset.interactionId),
                    revision: Number(row.dataset.revision)
                };
                targetLabel.textContent =
                    `${target.creatorUsername} · #${target.interactionId} · rev ${target.revision}`;
                composer.hidden = false;
                renderFields();
                composer.scrollIntoView({
                    behavior: 'smooth'
                });
            }
            return;
        }
        const report = event.target.closest('[data-report-action]');
        if (report) {
            const card = report.closest('[data-report-id]');
            report.disabled = true;
            try {
                await post('/api/admin/live/reports/moderate', {
                    interactionId: Number(card.dataset.interactionId),
                    reportId: Number(card.dataset.reportId),
                    expectedRevision: Number(card.dataset.revision || document.querySelector(
                        `tr[data-interaction-id="${card.dataset.interactionId}"]`)
                        ?.dataset.revision || 0),
                    resolution: report.dataset.reportAction
                }, `report:${card.dataset.reportId}:${report.dataset.reportAction}`);
                location.reload();
            } catch (error) {
                message.textContent = error.message;
                report.disabled = false;
            }
        }
    });
    select?.addEventListener('change', renderFields);
    document.getElementById('director-cancel')?.addEventListener('click', () => {
        if (composer) composer.hidden = true;
        target = null;
    });
    document.getElementById('director-send')?.addEventListener('click', async event => {
        if (!target) return;
        const template = bootstrap.templates.find(item => item.key === select.value);
        const body = {
            creatorUsername: target.creatorUsername,
            interactionId: target.interactionId,
            expectedRevision: target.revision,
            itemType: template.type,
            templateKey: template.key,
            expiresInMinutes: 1440
        };
        const reference = document.getElementById('director-reference');
        if (reference) body.referenceId = reference.value;
        const storyNode = document.getElementById('director-story-node');
        if (storyNode) body.targetStoryNode = storyNode.value;
        const options = document.getElementById('director-options');
        if (options) body.pollOptions = options.value.split('\n').map(value => value.trim()).filter(
            Boolean);
        event.target.disabled = true;
        try {
            await post('/api/admin/live/send', body,
                `send:${target.interactionId}:${target.revision}:${template.key}`);
            location.reload();
        } catch (error) {
            message.textContent = error.message;
            event.target.disabled = false;
        }
    });
    renderFields();
})();
