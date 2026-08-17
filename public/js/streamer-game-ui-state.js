'use strict';
(function expose(root) {
    function countdownRemaining(nextBeatAtMs, serverNowMs, clientElapsedMs) {
        const offset = Number(nextBeatAtMs) - Number(serverNowMs) - Number(clientElapsedMs);
        return Number.isFinite(offset) ? Math.max(0, Math.ceil(offset)) : 0;
    }

    function keyboardAction(gameId, state, code) {
        if (gameId === 'signal-duet' && code === 'Space' && state?.yourTurn) {
            return { type: 'tap', beatIndex: state.completedBeats };
        }
        if (gameId === 'meteor-defense' && code === 'KeyR' && state?.yourRole !== 'owner') return { type: 'resolve' };
        if (gameId === 'dream-maze' && state?.canNavigate) {
            const direction = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[code];
            if (direction && state.legalDirections?.includes(direction)) return { type: 'move', direction };
        }
        if (gameId === 'dream-maze' && code === 'KeyH' && state?.canHint && state.hintsRemaining > 0) return { type: 'hint' };
        if (gameId === 'story-weaver' && /^Digit[1-5]$/.test(code)) {
            const cardIndex = Number(code.slice(-1)) - 1;
            if (cardIndex < (state?.hand?.length || 0) && state?.yourTurn !== false) return { type: 'choose', cardIndex };
        }
        if (gameId === 'studio-crafting' && code === 'KeyG' && state?.nextMaterial) {
            return { type: 'gather', material: state.nextMaterial };
        }
        if (gameId === 'studio-crafting' && code === 'KeyC') {
            const ready = Object.entries(state?.recipe || {})
                .every(([material, amount]) => Number(state?.materials?.[material] || 0) >= Number(amount));
            if (ready && !state?.crafted?.includes(state.challengeId)) return { type: 'craft' };
        }
        if (gameId === 'studio-crafting' && /^Digit[1-6]$/.test(code)
            && state?.crafted?.includes(state.challengeId)) {
            return { type: 'place', slot: Number(code.slice(-1)) - 1 };
        }
        if (gameId === 'echo-memory' && code === 'KeyM' && state?.phase === 'study' && state?.yourTurn) {
            return { type: 'study' };
        }
        if (gameId === 'meteor-defense' && /^Digit[1-4]$/.test(code)) {
            const lane = Number(code.slice(-1)) - 1;
            if (lane >= Number(state?.lanes || 0)) return null;
            if (state?.yourRole === 'owner' && state.beacon === null && Number(state.energy || 0) > 0) {
                return { type: 'beacon', lane };
            }
            if (state?.yourRole !== 'owner' && !state?.fortifiedThisWave && Number(state?.energy || 0) > 0) {
                return { type: 'fortify', lane };
            }
        }
        return null;
    }

    function createBusyGate() {
        let busy = false;
        return Object.freeze({
            begin() {
                if (busy) return false;
                busy = true;
                return true;
            },
            end() { busy = false; },
            active() { return busy; }
        });
    }

    root.StreamerGameUIState = Object.freeze({ countdownRemaining, createBusyGate, keyboardAction });
})(typeof window === 'undefined' ? globalThis : window);
