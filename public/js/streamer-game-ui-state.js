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
