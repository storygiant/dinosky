export const PokiStopReasons = Object.freeze({
    MISSION_START_DIALOG:    'mission_start_dialog',
    MISSION_COMPLETE_DIALOG: 'mission_complete_dialog',
    MISSION_FAILURE_DIALOG:  'mission_failure_dialog',
    MISSION_CANCEL_DIALOG:   'mission_cancel_dialog',

    SETTINGS_DIALOG:         'settings_dialog',
    SKIN_SHOP_DIALOG:        'skin_shop_dialog',
    GAME_OVER_DIALOG:        'game_over_dialog',

    TIMELINE_SEQUENCE:       'timeline_sequence',

    PAUSE_MENU:              'pause_menu',

    BACKGROUND:              'background',
    VISIBILITY_HIDDEN:       'visibility_hidden',

    MODAL_DIALOG:            'modal_dialog',

    AD_REWARDED:             'ad_rewarded',
    AD_COMMERCIAL:           'ad_commercial',
    LOADING:                 'loading',
    MATCHMAKING:             'matchmaking',
});

// Minimum ms between consecutive SDK gameplayStart/gameplayStop calls.
const SDK_CALL_MIN_GAP_MS = 500;

export class PokiGameplayGate {
    constructor(pokiSDK, options = {}) {
        this._sdk = pokiSDK;
        this._debug = options.debug === true;

        this._sessionActive = false;
        this._isGameplayActive = false; // logical state
        this._stopReasons = new Set();

        this._interactionGate = null;
        this._interactionReady = false;

        // SDK dispatch state
        this._sdkGameplayActive = false; // last state actually sent to SDK
        this._sdkPending = null;         // null | true | false — desired next SDK state
        this._sdkTimer = null;
        this._sdkLastCallTime = 0;
    }

    // ── Interaction gate ──────────────────────────────────────────────────────

    hasInteracted() {
        return this._interactionReady;
    }

    notifyInteraction() {
        if (this._interactionReady) return;
        this._interactionReady = true;
        this._log('interactionGate: interaction notified synchronously');
    }

    setInteractionGate(promise) {
        this._interactionGate = promise;
        promise.then(() => {
            if (this._sdkGameplayActive) {
                this._log('interactionGate resolved — SDK already started, nothing to do');
                return;
            }
            if (this._isGameplayActive) {
                this._log('interactionGate resolved — scheduling deferred gameplayStart');
                this._scheduleSdkCall(true);
            } else {
                this._log('interactionGate resolved — session not active yet, normal flow will handle it');
            }
        });
    }

    // ── Session lifecycle ─────────────────────────────────────────────────────

    setSdk(sdk) {
        this._sdk = sdk;
    }

    startSession() {
        this._log('startSession');
        this._sessionActive = true;
        this._update();
    }

    endSession() {
        this._log('endSession');
        this._sessionActive = false;
        this._update();
    }

    // ── Stop reason management ────────────────────────────────────────────────

    addStopReason(reason) {
        if (this._stopReasons.has(reason)) return;
        this._stopReasons.add(reason);
        this._log(`addStopReason ${reason}`);
        this._update();
    }

    removeStopReason(reason) {
        if (!this._stopReasons.has(reason)) return;
        this._stopReasons.delete(reason);
        this._log(`removeStopReason ${reason}`);
        this._update();
    }

    clearStopReasons() {
        this._stopReasons.clear();
        this._log('clearStopReasons');
        this._update();
    }

    // ── Introspection ─────────────────────────────────────────────────────────

    isStopped(reason) {
        return this._stopReasons.has(reason);
    }

    isGameplayRunning() {
        return this._isGameplayActive;
    }

    getStopReasons() {
        return new Set(this._stopReasons);
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    _effectiveStopReasons() {
        if (this._stopReasons.has(PokiStopReasons.TIMELINE_SEQUENCE)) {
            return new Set([PokiStopReasons.TIMELINE_SEQUENCE]);
        }
        return this._stopReasons;
    }

    _update() {
        const effective = this._effectiveStopReasons();
        const shouldBeActive = this._sessionActive && effective.size === 0;
        const gated = this._interactionGate !== null && !this._interactionReady;

        if (shouldBeActive && !this._isGameplayActive) {
            this._isGameplayActive = true;
            if (gated) {
                this._log('gameplayStart (suppressed — waiting for interaction)');
            } else {
                this._log('gameplayStart — scheduling');
                this._scheduleSdkCall(true);
            }
        } else if (!shouldBeActive && this._isGameplayActive) {
            this._isGameplayActive = false;
            if (effective.size > 0) {
                this._log(`active reasons: ${[...effective].join(', ')}`);
            }
            if (gated || !this._sdkGameplayActive && this._sdkPending !== true) {
                this._log('gameplayStop (suppressed — no start has been sent yet)');
            } else {
                this._log('gameplayStop — scheduling');
                this._scheduleSdkCall(false);
            }
        }
    }

    // Schedule a SDK call. If the desired state flips again before the timer
    // fires, the pending call is simply updated — no extra SDK call is made.
    _scheduleSdkCall(active) {
        // Never send a stop if the SDK has never received a start.
        if (!active && !this._sdkGameplayActive && this._sdkPending !== true) {
            this._log(`SDK gameplayStop dropped — no prior start`);
            return;
        }

        // If the new desired state matches what's already dispatched and nothing
        // is pending, there's nothing to do.
        if (this._sdkPending === null && this._sdkGameplayActive === active) {
            return;
        }

        this._sdkPending = active;
        this._log(`SDK call pending: ${active ? 'gameplayStart' : 'gameplayStop'}`);

        if (this._sdkTimer !== null) {
            // Timer already running — it will pick up the updated _sdkPending.
            return;
        }

        const now = Date.now();
        const elapsed = now - this._sdkLastCallTime;
        const delay = Math.max(0, SDK_CALL_MIN_GAP_MS - elapsed);

        this._sdkTimer = setTimeout(() => {
            this._sdkTimer = null;
            this._flushSdkCall();
        }, delay);
    }

    _flushSdkCall() {
        const desired = this._sdkPending;
        this._sdkPending = null;

        if (desired === null) return;

        // State may have toggled back while the timer was running — skip if redundant.
        if (desired === this._sdkGameplayActive) {
            this._log(`SDK call skipped — already in state: ${desired ? 'active' : 'inactive'}`);
            return;
        }

        // Never send stop before start.
        if (!desired && !this._sdkGameplayActive) {
            this._log('SDK gameplayStop skipped — never started');
            return;
        }

        this._sdkGameplayActive = desired;
        this._sdkLastCallTime = Date.now();
        const name = desired ? 'gameplayStart' : 'gameplayStop';
        this._log(`SDK ${name} (dispatched)`);
        try {
            if (desired) {
                if (typeof this._sdk?.gameplayStart === 'function') this._sdk.gameplayStart();
            } else {
                if (typeof this._sdk?.gameplayStop === 'function') this._sdk.gameplayStop();
            }
        } catch (e) {
            console.warn(`[PokiGate] ${name} threw:`, e);
        }
    }

    _log(msg) {
        if (this._debug) {
            console.log(`[PokiGate] ${msg}`);
        }
    }
}
