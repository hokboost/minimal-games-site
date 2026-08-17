(() => {
    'use strict';

    const csrfToken = document.body.dataset.csrfToken || '';
    const message = document.getElementById('creator-message');
    const chinese = document.documentElement.lang.startsWith('zh');

    function show(text, failed = false) {
        if (!message) return;
        message.textContent = text;
        message.classList.toggle('is-error', failed);
        message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function mutate(url, method, body) {
        show(chinese ? '正在保存…' : 'Saving…');
        try {
            const response = await window.idempotentFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
                body: JSON.stringify(body)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.message || (chinese ? '保存失败' : 'Save failed'));
            show(chinese ? '已保存。' : 'Saved.');
            window.setTimeout(() => window.location.reload(), 350);
        } catch (error) {
            show(error.message, true);
        }
    }

    const profileForm = document.getElementById('creator-profile-form');
    profileForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(profileForm);
        const interactionTones = data.getAll('interactionTones').map(String);
        if (interactionTones.length > 3) {
            show(chinese ? '互动身份最多选择三个。' : 'Choose at most three interaction roles.', true);
            return;
        }
        mutate('/api/creator/profile', 'PUT', {
            displayName: data.get('displayName'),
            bio: data.get('bio'),
            pronouns: data.get('pronouns'),
            timezone: data.get('timezone'),
            difficulty: data.get('difficulty'),
            storyTone: data.get('storyTone'),
            communicationStyle: data.get('communicationStyle'),
            profileVisibility: data.get('profileVisibility'),
            evidenceRetention: data.get('evidenceRetention'),
            interactionTones,
            liveInteractionOptIn: data.has('liveInteractionOptIn'),
            expectedVersion: Number(profileForm.dataset.version || 0)
        });
    });

    document.getElementById('creator-preferences-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const preferences = [...document.querySelectorAll('[data-preference-type]')].map((row) => ({
            type: row.dataset.preferenceType,
            key: row.dataset.preferenceKey,
            value: row.querySelector('select').value
        }));
        mutate('/api/creator/preferences', 'PUT', { preferences });
    });

    function timeMinute(value) {
        const [hours, minutes] = String(value).split(':').map(Number);
        return hours * 60 + minutes;
    }

    document.getElementById('creator-quiet-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const quietHours = [...event.currentTarget.querySelectorAll('.creator-quiet-row')]
            .filter((row) => row.querySelector('.quiet-enabled').checked)
            .map((row) => ({
                weekday: Number(row.dataset.weekday),
                startMinute: timeMinute(row.querySelector('.quiet-start').value),
                endMinute: timeMinute(row.querySelector('.quiet-end').value),
                enabled: true
            }));
        mutate('/api/creator/quiet-hours', 'PUT', { quietHours });
    });

    document.getElementById('creator-interaction-form')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const interactionWindows = [...document.querySelectorAll('.creator-interaction-row')]
            .filter((row) => row.querySelector('.interaction-enabled').checked)
            .map((row) => ({
                weekday: Number(row.dataset.weekday),
                startMinute: timeMinute(row.querySelector('.interaction-start').value),
                endMinute: timeMinute(row.querySelector('.interaction-end').value),
                mode: row.querySelector('.interaction-mode').value,
                enabled: true
            }));
        mutate('/api/creator/interaction-windows', 'PUT', { interactionWindows });
    });

    const roomForm = document.getElementById('creator-room-form');
    roomForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const data = new FormData(roomForm);
        mutate('/api/creator/room-binding-requests', 'POST', {
            roomId: data.get('roomId'),
            note: data.get('note')
        });
    });

    document.getElementById('cancel-room-request')?.addEventListener('click', (event) => {
        mutate('/api/creator/room-binding-requests/cancel', 'POST', {
            requestId: Number(event.currentTarget.dataset.requestId)
        });
    });
})();
