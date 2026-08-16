(() => {
    const audio = document.getElementById('persistent-music-audio');
    if (!audio) return;

    const storageKey = 'minimal-games:featured-track:v1';
    const toggleButtons = document.querySelectorAll('[data-featured-track-toggle]');
    let unloading = false;
    let desiredPlaying = false;

    function readState() {
        try {
            return JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        } catch {
            return {};
        }
    }

    function saveState(playing = !audio.paused && !audio.ended) {
        try {
            sessionStorage.setItem(storageKey, JSON.stringify({
                currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
                playing,
                volume: audio.volume,
                muted: audio.muted
            }));
        } catch {
            // Playback still works when storage is unavailable.
        }
    }

    function updateButtons() {
        const isPlaying = !audio.paused && !audio.ended;
        toggleButtons.forEach((button) => {
            const label = button.querySelector('[data-featured-track-label]');
            const icon = button.querySelector('[aria-hidden="true"]');
            const zh = document.documentElement.lang.startsWith('zh');
            button.setAttribute('aria-pressed', String(isPlaying));
            button.setAttribute('aria-label', isPlaying
                ? (zh ? '暂停《勿忘》' : 'Pause Don’t Forget')
                : (zh ? '播放《勿忘》' : 'Play Don’t Forget'));
            if (label) label.textContent = isPlaying ? (zh ? '暂停' : 'Pause') : (zh ? '播放' : 'Play');
            if (icon) icon.textContent = isPlaying ? '❚❚' : '▶';
        });
    }

    async function restorePlayback() {
        const state = readState();
        if (Number.isFinite(state.volume)) audio.volume = Math.min(1, Math.max(0, state.volume));
        audio.muted = state.muted === true;
        if (Number.isFinite(state.currentTime) && state.currentTime > 0 && state.currentTime < audio.duration) {
            audio.currentTime = state.currentTime;
        }
        desiredPlaying = state.playing === true;
        if (desiredPlaying) {
            try {
                await audio.play();
            } catch {
                document.body.classList.add('music-resume-pending');
            }
        }
        updateButtons();
    }

    toggleButtons.forEach((button) => {
        button.addEventListener('click', async () => {
            if (audio.paused) {
                desiredPlaying = true;
                try {
                    await audio.play();
                } catch {
                    // The native controls remain available as a fallback.
                }
            } else {
                desiredPlaying = false;
                audio.pause();
            }
            saveState(desiredPlaying);
            updateButtons();
        });
    });

    audio.addEventListener('loadedmetadata', restorePlayback, { once: true });
    audio.addEventListener('play', () => {
        desiredPlaying = true;
        document.body.classList.remove('music-resume-pending');
        saveState(true);
        updateButtons();
        window.UXAnalytics?.track('music_started', 'featured_track', {
            currentSeconds: Math.round(audio.currentTime || 0)
        });
    });
    audio.addEventListener('pause', () => {
        if (unloading) return;
        desiredPlaying = false;
        saveState(false);
        updateButtons();
        window.UXAnalytics?.track('music_paused', 'featured_track', {
            currentSeconds: Math.round(audio.currentTime || 0)
        });
    });
    audio.addEventListener('timeupdate', () => saveState(desiredPlaying));
    audio.addEventListener('volumechange', () => saveState(desiredPlaying));
    audio.addEventListener('ended', () => {
        window.UXAnalytics?.track('music_completed', 'featured_track', {});
        desiredPlaying = false;
        audio.currentTime = 0;
        saveState(false);
        updateButtons();
    });

    window.addEventListener('pagehide', () => {
        unloading = true;
        saveState(desiredPlaying);
    });

    document.addEventListener('pointerdown', () => {
        if (desiredPlaying && audio.paused) {
            audio.play().catch(() => {});
        }
    }, { capture: true });

    if ('mediaSession' in navigator) {
        try {
            if ('MediaMetadata' in window) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: '勿忘',
                    artist: '李代沫',
                    album: '勿忘',
                    artwork: [{ src: '/assets/images/li-daimo-wuwang.jpg', sizes: '500x500', type: 'image/jpeg' }]
                });
            }
            navigator.mediaSession.setActionHandler('play', () => audio.play());
            navigator.mediaSession.setActionHandler('pause', () => audio.pause());
            navigator.mediaSession.setActionHandler('seekto', (details) => {
                if (Number.isFinite(details.seekTime)) audio.currentTime = details.seekTime;
            });
        } catch {
            // Unsupported media actions must not break normal audio controls.
        }
    }

    if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) restorePlayback();
    updateButtons();
})();
