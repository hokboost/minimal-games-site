'use strict';
(() => {
    const csrf = document.body.dataset.csrfToken;
    const message = document.getElementById('quest-message');
    async function mutate(path, body) {
        if (typeof window.idempotentFetch !== 'function') throw new Error('Request helper unavailable');
        const response = await window.idempotentFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(body) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Request failed');
        return payload;
    }
    document.getElementById('quest-draft-form')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
        const automatic = data.verificationMode === 'automatic';
        const payload = { slug: data.slug, version: Number(data.version), category: data.category, tags: [data.category, 'owner-studio'], difficulty: 'guided', estimatedMinutes: 15, safetyClass: data.category === 'wellbeing' ? 'wellbeing' : 'standard', titleZh: data.titleZh, titleEn: data.titleEn, descriptionZh: data.descriptionZh, descriptionEn: data.descriptionEn, hintZh: '按任务步骤完成；如不合适可无惩罚拒绝。', hintEn: 'Follow the quest steps; decline without penalty if unsuitable.', completionZh: '任务已完成。', completionEn: 'Quest complete.', verificationMode: data.verificationMode, eligibilityRule: { op: 'relationship_level', minimum: 1 }, completionRule: automatic ? { op: 'event_count', event: data.eventType, target: 1, filters: {} } : { op: 'evidence_approved' }, rewardPoints: data.category === 'wellbeing' ? 0 : Number(data.rewardPoints), reviewPolicy: automatic ? 'none' : 'admin', cooldownHours: 168, evidenceKind: automatic ? 'trusted_event' : data.evidenceKind };
        try { await mutate('/api/admin/quests/v2/drafts', payload); location.reload(); } catch (error) { message.textContent = error.message; }
    });
    document.addEventListener('click', async (event) => {
        const review = event.target.closest('[data-review]'); const publish = event.target.closest('[data-publish-version]');
        if (!review && !publish) return; event.target.disabled = true;
        try { if (review) await mutate('/api/admin/quests/v2/review', { assignmentId: Number(review.dataset.assignmentId), decision: review.dataset.review, note: review.closest('.quest-card').querySelector('[data-review-note]').value }); else await mutate('/api/admin/quests/v2/publish', { versionId: Number(publish.dataset.publishVersion) }); location.reload(); }
        catch (error) { message.textContent = error.message; event.target.disabled = false; }
    });
})();
