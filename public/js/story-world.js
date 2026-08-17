'use strict';
(() => {
    const root = document.body, stage = document.getElementById('story-stage'), axes = document.getElementById('story-axes');
    const unlocks = document.getElementById('story-unlocks'), message = document.getElementById('story-message');
    const lang = root.dataset.lang === 'zh' ? 'zh' : 'en'; let model = JSON.parse(document.getElementById('story-bootstrap').textContent); let pendingChoice = null;
    async function post(path, body) {
        if (typeof window.idempotentFetch !== 'function') throw new Error(lang === 'zh' ? '请求组件不可用' : 'Request helper unavailable');
        const response = await window.idempotentFetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': root.dataset.csrfToken }, body: JSON.stringify(body) });
        const payload = await response.json(); if (!response.ok) throw new Error(payload.message || 'Request failed'); return payload;
    }
    function button(label, action, value) { const node = document.createElement('button'); node.type = 'button'; node.textContent = label; node.dataset.action = action; if (value) node.dataset.value = value; return node; }
    function render() {
        stage.replaceChildren(); axes.replaceChildren(); unlocks.replaceChildren(); const story = model.story;
        if (!story) {
            const intro = document.createElement('p');
            intro.textContent = lang === 'zh' ? '五季故事均已准备好。每季拥有独立快照，可以按自己的节奏开始。' : 'All five seasons are ready with independent snapshots. Begin at your own pace.';
            stage.append(intro);
            for (const season of model.seasons || []) {
                const start = button(`${lang === 'zh' ? '开始' : 'Start'} · ${season.title}`, 'start', season.slug);
                if (season.slug === model.selectedSeason) start.classList.add('is-selected');
                stage.append(start);
            }
            return;
        }
        const node = story.node, heading = document.createElement('h2'), prose = document.createElement('p'); heading.textContent = node.speaker ? `${node.speaker} · ${node.episode}` : node.episode; prose.textContent = node.text; stage.append(heading, prose);
        if (node.ownerPresence === 'deferred_for_quiet_hours') { const quiet = document.createElement('small'); quiet.textContent = lang === 'zh' ? '安静时段：陪伴留言已持久保存，不会实时打扰。' : 'Quiet hours: the companion note is saved without live interruption.'; stage.append(quiet); }
        if (story.run.status === 'completed') { stage.append(button(lang === 'zh' ? '以只读重玩开始' : 'Start value-free replay', 'replay')); return; }
        if (node.action === 'choose') node.choices.forEach((choice) => stage.append(button(choice.label, 'preview-choice', choice.id)));
        else if (node.action === 'answer') node.answerOptions.forEach((answer) => stage.append(button(answer.label, 'answer', answer.id)));
        else if (node.action === 'finish') stage.append(button(lang === 'zh' ? '完成本季' : 'Complete this season', 'finish'));
        else stage.append(button(lang === 'zh' ? '继续' : 'Continue', 'advance'));
        if (story.run.canRecover && story.run.status === 'active') stage.append(button(lang === 'zh' ? '恢复到最近检查点' : 'Recover latest checkpoint', 'recover'));
        for (const [key, value] of Object.entries(story.progress.axes)) { const meter = document.createElement('span'); meter.textContent = `${key}: ${value}`; axes.append(meter); }
        story.progress.unlocks.forEach((value) => { const item = document.createElement('li'); item.textContent = value; unlocks.append(item); });
    }
    function renderPreview(preview) {
        stage.replaceChildren(); const heading = document.createElement('h2'), outcome = document.createElement('p'), next = document.createElement('p');
        heading.textContent = lang === 'zh' ? '选择预览（尚未提交）' : 'Choice preview (not committed)'; outcome.textContent = preview.outcome; next.textContent = preview.next.text;
        stage.append(heading, outcome, next, button(lang === 'zh' ? '确认这个选择' : 'Confirm this choice', 'confirm-choice'), button(lang === 'zh' ? '返回重选' : 'Choose again', 'cancel-preview'));
    }
    stage.addEventListener('click', async (event) => {
        const target = event.target.closest('button[data-action]'); if (!target) return; target.disabled = true; message.textContent = '';
        try {
            const action = target.dataset.action; let response;
            if (action === 'cancel-preview') { pendingChoice = null; render(); return; }
            if (action === 'preview-choice') {
                response = await post('/api/story/actions/preview', { runId: Number(model.runId), expectedRevision: model.story.run.revision, action: 'choose', choiceId: target.dataset.value });
                pendingChoice = { choiceId: target.dataset.value, revision: model.story.run.revision }; renderPreview(response); return;
            }
            if (action === 'start' || action === 'replay') response = await post('/api/story/runs/start', { replay: action === 'replay', season: target.dataset.value || model.selectedSeason });
            else if (action === 'recover') response = await post('/api/story/runs/recover', { runId: Number(model.runId), expectedRevision: model.story.run.revision });
            else if (action === 'confirm-choice') {
                if (!pendingChoice || pendingChoice.revision !== model.story.run.revision) throw new Error(lang === 'zh' ? '预览已过期，请重新选择' : 'Preview expired; choose again');
                response = await post('/api/story/actions/commit', { runId: Number(model.runId), expectedRevision: pendingChoice.revision, action: 'choose', choiceId: pendingChoice.choiceId });
            } else response = await post('/api/story/actions/commit', { runId: Number(model.runId), expectedRevision: model.story.run.revision, action, answerKey: action === 'answer' ? target.dataset.value : undefined });
            pendingChoice = null; model = { ...model, ...response, hasRun: true }; if (response.outcome) message.textContent = response.outcome; render();
        } catch (error) { message.textContent = error.message; target.disabled = false; }
    });
    render();
})();
