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
