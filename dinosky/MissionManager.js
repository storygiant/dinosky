import { FALLBACK_MISSION_ZONES, translateMission } from './MissionData.js';
import { MissionDialog } from './MissionDialog.js';
import { missionHandlers } from './MissionHandlers.js';
import { playTimeline, previewTimeline, collectActors, applySequenceInstantly } from './Timeline.js';
import { CONFIG } from './config.js';
import { getPlayerIdentity } from './PlayerIdentity.js';
import { postRaceScore, fetchTopScores } from './RaceLeaderboard.js';
import { PokiStopReasons } from './PokiGameplayGate.js';

export const MISSION_STATE = Object.freeze({
    IDLE: 'idle',
    SHOW_START: 'show_start',
    RUNNING: 'running',
    COMPLETED: 'completed',
    SHOW_COMPLETED: 'show_completed',
    TRANSITIONING: 'transitioning'
});

// localStorage key for persisted mission progress.
const PERSIST_KEY = 'dynoMissionState';
// Race times are always persisted, even when MISSION_DISABLE_PERSISTENCE is true.
const RACE_TIMES_KEY = 'dynoRaceTimes';

export class MissionManager {
    constructor(game, missions, options = {}) {
        this.game = game;
        this.missions = Array.isArray(missions) ? missions : [];
        this._getCoinCount = options.getCoinCount ?? null;
        this._setCoinCount = options.setCoinCount ?? null;
        this._onWatchAd = options.onWatchAd ?? null;
        this._spawnCoinFly = options.spawnCoinFly ?? null;
        this._pendingCoinFly = null; // { screenX, screenY, count } — fired after next start sequence
        this.currentMissionIndex = 0;
        this.currentMission = null;
        this.currentHandler = null;
        this.state = MISSION_STATE.IDLE;
        this.remainingTime = 0;
        this.dialog = new MissionDialog();
        this.completionFlowActive = false;
        this.timeoutLogged = false;
        this._idleBreakTimeout = null;
        this._activeBreakTimeout = null;

        // ── Persisted mission state ───────────────────────────────────────────
        // completedMissionIds: Set of mission ids that have been fully completed.
        // replayCooldowns: map of missionId → Unix timestamp (ms) when cooldown expires.
        // raceTimes: map of missionId → sorted array of top-3 best times (ms).
        this._completedIds = new Set();
        this._replayCooldowns = {};
        this._raceTimes = {};
        this._loadPersistedState();

        // ── Background missions ───────────────────────────────────────────────
        // Background missions run silently in parallel with the normal mission.
        // They never use the side widget, callouts, land areas, or start dialog.
        // Map of missionId → { mission, handler, completionFlowActive }
        this._backgroundMissions = new Map();
        // Ids loaded from persistence — consumed once during start() to re-launch missions.
        this._persistedBackgroundMissionIds = [];
        // The normal mission that was active when the game was last saved.
        this._persistedActiveSideMissionId = null;

    }

    // ── Persistence ──────────────────────────────────────────────────────────

    _loadPersistedState() {
        // Race times are always loaded regardless of the persistence flag.
        try {
            const raw = localStorage.getItem(RACE_TIMES_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (data && typeof data === 'object') this._raceTimes = data;
            }
        } catch {
            // Corrupted — start fresh.
        }

        if (CONFIG.MISSION_DISABLE_PERSISTENCE) return;
        try {
            const raw = localStorage.getItem(PERSIST_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (Array.isArray(data.completedMissionIds)) {
                this._completedIds = new Set(data.completedMissionIds);
            }
            if (data.replayCooldowns && typeof data.replayCooldowns === 'object') {
                this._replayCooldowns = data.replayCooldowns;
            }
            // Restore active background mission ids — restarted from scratch on boot.
            if (Array.isArray(data.activeBackgroundMissionIds)) {
                this._persistedBackgroundMissionIds = data.activeBackgroundMissionIds;
            }
            // Restore the active normal mission id — restarted from scratch on boot.
            if (typeof data.activeSideMissionId === 'string') {
                this._persistedActiveSideMissionId = data.activeSideMissionId;
            }
        } catch {
            // Corrupted or missing save — start fresh.
        }
    }

    _savePersistedState() {
        // Race times are always saved regardless of the persistence flag.
        try {
            localStorage.setItem(RACE_TIMES_KEY, JSON.stringify(this._raceTimes));
        } catch {
            // Storage unavailable — silently ignore.
        }

        if (CONFIG.MISSION_DISABLE_PERSISTENCE) return;
        try {
            const data = {
                completedMissionIds: [...this._completedIds],
                replayCooldowns: this._replayCooldowns,
                activeBackgroundMissionIds: [...this._backgroundMissions.keys()],
                activeSideMissionId: (
                    this.state === MISSION_STATE.RUNNING ||
                    this.state === MISSION_STATE.TRANSITIONING ||
                    this.state === MISSION_STATE.SHOW_START
                ) ? (this.currentMission?.id ?? null) : null,
            };
            localStorage.setItem(PERSIST_KEY, JSON.stringify(data));
        } catch {
            // Storage unavailable (private browsing, quota exceeded) — silently ignore.
        }
    }

    resetMissionProgress() {
        this._enterIdle();
        this.dialog?.hide?.();
        this._completedIds = new Set();
        this._replayCooldowns = {};
        this.currentMissionIndex = 0;
        this._backgroundMissions.clear();
        this._persistedBackgroundMissionIds = [];
        this._persistedActiveSideMissionId = null;
        try { localStorage.removeItem(PERSIST_KEY); } catch { /* ignore */ }
    }

    // ── Mission availability helpers ─────────────────────────────────────────

    /**
     * Returns the translated mission definition for the given id, or null if not found.
     */
    getMissionDefinition(missionId) {
        const def = this.missions.find((m) => m.id === missionId) ?? null;
        return translateMission(def);
    }

    /**
     * A mission is available to start when:
     *   1. It exists in the missions list.
     *   2. All missionDependencies have been completed.
     *   3. It has not been permanently completed (replay.enabled === false), OR
     *      replay is enabled and the cooldown has expired.
     */
    isMissionAvailable(missionId) {
        const def = this.getMissionDefinition(missionId);
        if (!def) return false;

        // Check dependencies — every listed id must be in completedIds.
        const deps = def.missionDependencies;
        if (Array.isArray(deps) && deps.length > 0) {
            for (const depId of deps) {
                if (!this._completedIds.has(depId)) {
                    return false;
                }
            }
        }

        // Check completion / replay rules.
        if (this._completedIds.has(missionId)) {
            const replay = def.replay;
            if (!replay?.enabled) {
                // One-time mission — permanently completed.
                return false;
            }
            // Replayable — check if cooldown has expired.
            const cooldownExpiry = this._replayCooldowns[missionId];
            if (Number.isFinite(cooldownExpiry) && Date.now() < cooldownExpiry) {
                return false;
            }
        }

        return true;
    }

    /**
     * A callout is visible whenever the mission is available, even if another
     * mission is running — landing near it will offer to switch missions.
     * Hidden only if callout.enabled is explicitly false, or the mission is
     * currently the active one (no point showing it for what's already running).
     */
    isMissionCalloutVisible(missionId) {
        const def = this.getMissionDefinition(missionId);
        if (!def) return false;
        // Background missions never use callouts — they start programmatically only.
        if (def.backgroundMission === true) return false;
        if (def.callout?.enabled === false) return false;
        if (this.currentMission?.id === missionId) return false;
        return this.isMissionAvailable(missionId);
    }

    // ── Race time leaderboard ─────────────────────────────────────────────────

    // Records a race time for a mission, keeps the top 3 best (lowest) times.
    recordRaceTime(missionId, timeMs) {
        if (!missionId || !Number.isFinite(timeMs) || timeMs <= 0) return;
        const times = Array.isArray(this._raceTimes[missionId]) ? [...this._raceTimes[missionId]] : [];
        times.push(Math.round(timeMs));
        times.sort((a, b) => a - b);
        this._raceTimes[missionId] = times.slice(0, 3);
        this._savePersistedState();
    }

    // Returns the stored top-3 times for a mission (array of ms, ascending, length 0–3).
    getRaceTimes(missionId) {
        return Array.isArray(this._raceTimes[missionId]) ? this._raceTimes[missionId] : [];
    }

    isTimedLeaderboardMission(mission) {
        return mission?.type === 'RACE' || mission?.type === 'DESTROY_TIMED';
    }

    getMissionCalloutIcon(missionId) {
        const def = this.getMissionDefinition(missionId);
        return def?.callout?.icon ?? def?.iconObjectType ?? null;
    }

    getMissionCalloutIconScale(missionId) {
        const def = this.getMissionDefinition(missionId);
        const missionScale = def?.callout?.iconScale;
        if (Number.isFinite(missionScale) && missionScale > 0) return missionScale;
        const configScale = CONFIG?.LEVEL_OBJECT_TYPES?.missioncallout?.iconScale;
        if (Number.isFinite(configScale) && configScale > 0) return configScale;
        return 1;
    }

    getMissionCalloutText(missionId) {
        const def = this.getMissionDefinition(missionId);
        return def?.callout?.text ?? def?.description ?? '';
    }

    // ── Idle helpers ─────────────────────────────────────────────────────────

    _enterIdle() {
        this.state = MISSION_STATE.IDLE;
        this.currentMission = null;
        this.currentHandler = null;
        this.completionFlowActive = false;
        this.game?.setActiveMission?.(null);
        this.game?.setMissionInputLocked?.(false);
        this._flushPendingCoinFly();
        this._savePersistedState();
        this._startIdleBreakLoop();
        console.info('[Mission] Entered idle — waiting for callout or nextMission.');
    }

    // ── Commercial break timers ───────────────────────────────────────────────

    wait(ms) {
        const duration = Math.max(0, Number.isFinite(ms) ? ms : 0);
        return new Promise((resolve) => {
            window.setTimeout(resolve, duration);
        });
    }

    _startIdleBreakLoop() {
        const intervalMs = Math.max(10000, (CONFIG.idleCommercialBreakInterval ?? 120) * 1000);
        this._idleBreakTimeout = window.setTimeout(async () => {
            if (this.state !== MISSION_STATE.IDLE) return;
            console.info('[Mission] Idle commercial break triggered.');
            await this.game?.runPokiCommercialBreak?.('idle');
            if (this.state === MISSION_STATE.IDLE) {
                this._startIdleBreakLoop();
            }
        }, intervalMs);
    }

    _stopIdleBreakLoop() {
        if (this._idleBreakTimeout !== null) {
            window.clearTimeout(this._idleBreakTimeout);
            this._idleBreakTimeout = null;
        }
    }

    _startActiveBreakLoop() {
        const intervalMs = Math.max(10000, (CONFIG.activeMissionCommercialBreakInterval ?? 190) * 1000);
        this._activeBreakTimeout = window.setTimeout(async () => {
            if (this.state !== MISSION_STATE.RUNNING) return;
            console.info('[Mission] Active mission commercial break triggered.');
            await this.game?.runPokiCommercialBreak?.('active mission');
            if (this.state === MISSION_STATE.RUNNING) {
                this._startActiveBreakLoop();
            }
        }, intervalMs);
    }

    _stopActiveBreakLoop() {
        if (this._activeBreakTimeout !== null) {
            window.clearTimeout(this._activeBreakTimeout);
            this._activeBreakTimeout = null;
        }
    }

    _setMissionObjectsVisible(mission, visible) {
        const names = mission?.visibleDuringMission;
        if (!Array.isArray(names) || names.length === 0) return;
        const objects = this.game?.levelObjectManager?.objects ?? [];
        for (const name of names) {
            const obj = objects.find((o) => o?.sourceObjectName === name);
            if (obj) {
                obj.setVisible?.(visible);
            } else {
                console.warn(`[Mission] visibleDuringMission: no object found with name "${name}".`);
            }
        }
    }

    getMissionCompleteDelaySeconds(mission) {
        const configuredDelay = mission?.completeDelaySeconds ??
            mission?.completionDelaySeconds ??
            mission?.completeDelay ??
            mission?.completionDelay;
        return Number.isFinite(configuredDelay)
            ? Math.max(0, configuredDelay)
            : 1;
    }

    shouldShowMissionStartCommercialBreak(mission) {
        return mission?.commercialBreak !== false &&
            mission?.showCommercialBreak !== false &&
            mission?.showCommercialBreakOnStart !== false;
    }

    buildTimelineContext() {
        const actors = {
            dyno: this.game?.player
        };

        if (this.currentMission?.params?.actorIds) {
            const additionalActors = collectActors(this.game, this.currentMission.params.actorIds);
            Object.assign(actors, additionalActors);
        }

        return {
            camera: this.game?.camera,
            actors,
            level: this.game?.level,
            game: this.game
        };
    }

    buildTimelineContextForMission(mission) {
        const translated = translateMission(mission);
        const actors = { dyno: this.game?.player };
        if (translated?.params?.actorIds) {
            const additionalActors = collectActors(this.game, translated.params.actorIds);
            Object.assign(actors, additionalActors);
        }
        return {
            camera: this.game?.camera,
            actors,
            level: this.game?.level,
            game: this.game,
        };
    }

    /**
     * Apply both sequences of a mission instantly (no animation).
     * Used when skipping a sequence or restoring world state on load.
     */
    applyMissionInstantly(mission) {
        if (!mission) return;
        const context = this.buildTimelineContextForMission(mission);
        applySequenceInstantly(mission.startSequence, context);
        applySequenceInstantly(mission.endSequence, context);
    }

    /**
     * Restore world state for all already-completed missions by applying
     * their sequences instantly. Call this after the level has loaded.
     */
    applyCompletedMissionsInstantly() {
        for (const mission of this.missions) {
            if (this._completedIds.has(mission.id)) {
                this.applyMissionInstantly(mission);
            }
        }
    }

    setTimelineActorAnimationControlled(isControlled) {
        const actors = this.buildTimelineContext()?.actors || {};
        for (const actor of Object.values(actors)) {
            actor?.setTimelineAnimationControlled?.(isControlled === true);
        }
    }

    /**
     * Play a mission timeline sequence with proper input locking.
     *
     * This is OPTIONAL - missions without sequences are unaffected.
     * Input is locked only during timeline playback.
     */
    async playMissionTimeline(sequence, lockInput = true) {
        if (!sequence) {
            return;
        }

        if (lockInput) {
            this.game?.setMissionInputLocked?.(true);
        }
        this.game?.setSequencePresentationActive?.(true);
        this.setTimelineActorAnimationControlled(true);
        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.TIMELINE_SEQUENCE);

        try {
            const context = this.buildTimelineContext();
            const { promise, timeline } = playTimeline(sequence, context);
            this.game?.setTimelineSkipHandler?.(() => {
                applySequenceInstantly(timeline, context);
                // Mark finished without re-running track.update() — applySequenceInstantly
                // already applied the correct final state with dyno-special handling.
                timeline.currentTime = timeline.duration;
                timeline.finished = true;
                for (const track of timeline.tracks) {
                    track?.onTimelineEnd?.({ ...context, camera: timeline.camera, actors: timeline.actors, level: timeline.level, game: timeline.game });
                }
            });
            await promise;
        } catch (error) {
            console.error('[Mission] Timeline playback error:', error);
        } finally {
            this.game?.setTimelineSkipHandler?.(null);
            this.setTimelineActorAnimationControlled(false);
            this.game?.setSequencePresentationActive?.(false);
            this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.TIMELINE_SEQUENCE);
            if (lockInput) {
                this.game?.setMissionInputLocked?.(false);
            }
        }
    }

    previewMissionTimelineFrame(sequence, time = 0) {
        if (!sequence) {
            return;
        }

        try {
            previewTimeline(sequence, this.buildTimelineContext(), time);
        } catch (error) {
            console.error('[Mission] Timeline preview error:', error);
        }
    }

    // ── Mission start ─────────────────────────────────────────────────────────

    /**
     * Walk the nextMission chain starting from startId.
     * Returns the first non-background mission that is available and not yet completed.
     * Completed missions are skipped by following their nextMission pointer.
     * Stops if a mission has no nextMission, is not available (unmet deps), or a cycle is detected.
     */
    // Walk the nextMission chain from startId, skipping background missions and
    // already-completed missions. Returns the first non-background mission that is
    // available but not yet completed, or null if the chain ends without finding one.
    _findNextChainedMission(startId) {
        const visited = new Set();
        let id = startId;
        while (id) {
            if (visited.has(id)) break; // cycle guard
            visited.add(id);
            const def = this.getMissionDefinition(id);
            if (!def) break;
            if (def.backgroundMission === true) {
                // Background missions in the chain are skipped — they are started
                // by _startEligibleBackgroundMissions, not by nextMission traversal.
                id = def.nextMission ?? null;
                continue;
            }
            if (!this._completedIds.has(id)) {
                return { def: this.isMissionAvailable(id) ? def : null };
            }
            id = def.nextMission ?? null;
        }
        return { def: null };
    }

    /**
     * start() — called once on game boot.
     *
     * AUTO-START RULES
     * The very first mission in the list is started automatically on first game
     * launch (i.e. it has never been completed and is available).
     * After that the player must find a callout / land area to start missions.
     * nextMission chaining also uses the normal start flow (not this method).
     */
    async start() {
        const firstMission = this.missions[0];
        if (!firstMission) {
            this._enterIdle();
            return;
        }

        this._persistedBackgroundMissionIds = [];

        // Restore the normal mission that was active when the game was last closed.
        const resumeMissionId = this._persistedActiveSideMissionId;
        this._persistedActiveSideMissionId = null;
        // Always restore completed mission world state before starting anything.
        this.applyCompletedMissionsInstantly();

        // Start all background missions whose dependencies are now met.
        // This covers: missions with no deps (start immediately), missions whose deps
        // were completed in a prior session, and missions that were running last session.
        await this._startEligibleBackgroundMissions();

        if (resumeMissionId && this.isMissionAvailable(resumeMissionId)) {
            // A mission was in-progress when the game was closed — resume it with its start dialog.
            console.info(`[Mission] Resuming active mission "${resumeMissionId}" from last session.`);
            await this.startMissionById(resumeMissionId);
        } else {
            // Find the first non-background mission in the list as the chain start point.
            const firstNormalMission = this.missions.find((m) => m.backgroundMission !== true);
            const { def: autoStart } = this._findNextChainedMission(firstNormalMission?.id ?? null);
            if (autoStart) {
                console.info(`[Mission] Auto-starting chained mission "${autoStart.id}".`);
                await this.startMissionById(autoStart.id);
            } else {
                this._enterIdle();
            }
        }
    }

    /**
     * startMissionById — starts a mission by id.
     * Routes to background or normal flow based on the mission's backgroundMission flag.
     * Used by nextMission chaining, MissionLandAreaObject triggers, and debug.
     */
    async startMissionById(missionId) {
        const def = this.getMissionDefinition(missionId);
        if (!def) {
            console.warn(`[Mission] startMissionById: mission "${missionId}" not found.`);
            return;
        }
        if (def.backgroundMission === true) {
            await this._startBackgroundMission(missionId);
            return;
        }
        const index = this.missions.findIndex((m) => m.id === missionId);
        if (index === -1) return;
        this.currentMissionIndex = index;
        await this.startMissionAt(index);
    }

    /**
     * startMissionAt — the core start flow used by all entry points.
     * Unchanged from the original except for the IDLE fallback path.
     */
    async startMissionAt(index) {
        this._stopIdleBreakLoop();

        const mission = this.missions[index];
        if (!mission) {
            console.info('[Mission] No more missions configured — entering idle.');
            this._enterIdle();
            return;
        }

        this.state = MISSION_STATE.TRANSITIONING;
        this.currentMission = translateMission(mission);
        this.currentHandler = missionHandlers[mission.type] || null;
        this.remainingTime = Number.isFinite(mission.duration) ? Math.max(0, mission.duration) : 0;
        this.timeoutLogged = false;
        // Persist immediately so a refresh during the start sequence/dialog still restores this mission.
        this._savePersistedState();

        if (!this.currentHandler) {
            console.warn(`[Mission] No handler registered for mission type "${mission.type}".`);
        }

        await this.game?.loadMissionLevel?.(mission.level);
        this.addFallbackZonesForMissionLevel(mission.level);
        this.game?.setActiveMission?.(null);
        this.game?.setMissionInputLocked?.(true);
        this.previewMissionTimelineFrame(mission.startSequence, 0);

        this.game?.setTimelineCameraControlled?.(Boolean(mission.startSequence));
        this.game?.setTimelineAnimationControlled?.(Boolean(mission.startSequence));
        this.setTimelineActorAnimationControlled(Boolean(mission.startSequence));
        await this.playMissionTimeline(mission.startSequence, true);
        this.game?.setTimelineCameraControlled?.(false);
        this.game?.setTimelineAnimationControlled?.(false);
        this.setTimelineActorAnimationControlled(false);
        this.game?.setMissionInputLocked?.(true);

        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.MISSION_START_DIALOG);
        this.state = MISSION_STATE.SHOW_START;
        await this.dialog.showStart(this.currentMission);
        this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.MISSION_START_DIALOG);
        // Delay matches the dialog fade-out transition so coins appear after it's gone.
        this._flushPendingCoinFly(220);
        if (this.shouldShowMissionStartCommercialBreak(mission)) {
            console.info(`[Mission] Requesting commercial break before starting "${mission.id}".`);
            await this.game?.runPokiCommercialBreak?.(`mission start "${mission.id}"`);
        } else {
            console.info(`[Mission] Commercial break disabled for "${mission.id}".`);
        }

        this._setMissionObjectsVisible(mission, true);

        // Camera preview pan — show the player where to go before unlocking input.
        // handler.start() is called AFTER the preview so timers don't run during the pan.
        if (mission.cameraPreview === true) {
            // For RACE, pre-build the smoothed path so the camera follows the exact trail curve.
            let previewPath = null;
            if (mission.type === 'RACE' && this.currentHandler?.buildSmoothedRacePath) {
                previewPath = this.currentHandler.buildSmoothedRacePath(this.game, mission);
            }
            if (!previewPath && this.game?.activeMissionUI) {
                previewPath = this.game.activeMissionUI.getMissionPreviewWaypoints(mission);
            }
            if (previewPath?.length > 0) {
                await this.game.runCameraPreview?.(previewPath, {
                    continuous: mission.cameraPreviewContinuous === true,
                    speed: Number.isFinite(mission.cameraPreviewSpeed) ? mission.cameraPreviewSpeed : null,
                    holdSeconds: Number.isFinite(mission.cameraPreviewHoldSeconds) ? mission.cameraPreviewHoldSeconds : null,
                    zoomFactor: Number.isFinite(mission.cameraPreviewZoom) ? mission.cameraPreviewZoom : null
                });
            }
        }

        this.currentHandler?.start?.(mission, this.game);
        this.state = MISSION_STATE.RUNNING;
        this._startActiveBreakLoop();
        this.game?.setActiveMission?.(this.currentMission);
        this.game?.setMissionInputLocked?.(false);
        this._savePersistedState();

        console.log('[Mission] Mission start', { missionId: mission.id, backgroundMission: false });
        console.info(`[Mission] Started "${mission.id}".`);

        // Complete immediately if conditions are already met at mission start.
        if (this.currentHandler?.isComplete?.(this.currentMission, this.game)) {
            this.completeCurrentMission();
        }
    }

    // ── Background missions ───────────────────────────────────────────────────
    //
    // Background missions run silently alongside the normal mission slot.
    // They skip all side-widget calculations, callouts, land areas, and the
    // start dialog. Multiple can run at once. They still support endSequence,
    // completion dialog, nextMission, and missionDependencies.

    /**
     * Scan all background missions and start any that are now eligible:
     * - backgroundMission === true
     * - isMissionAvailable() — deps met, not permanently completed, not in cooldown
     * - Not already running
     * Called on boot and after every mission completion.
     */
    async _startEligibleBackgroundMissions() {
        for (const mission of this.missions) {
            if (mission.backgroundMission !== true) continue;
            if (this._backgroundMissions.has(mission.id)) continue;
            if (!this.isMissionAvailable(mission.id)) continue;
            console.info(`[Mission] Auto-starting eligible background mission "${mission.id}".`);
            await this._startBackgroundMission(mission.id);
        }
    }

    async _startBackgroundMission(missionId) {
        if (!this.isMissionAvailable(missionId)) {
            console.warn(`[Mission] Background mission "${missionId}" is not available (dependencies or already completed).`);
            return;
        }
        if (this._backgroundMissions.has(missionId)) {
            console.warn(`[Mission] Background mission "${missionId}" is already running.`);
            return;
        }

        const def = this.getMissionDefinition(missionId);
        if (!def) return;

        const handler = missionHandlers[def.type] || null;
        if (!handler) {
            console.warn(`[Mission] No handler for background mission type "${def.type}".`);
        }

        console.log('[Mission] Background mission started', { missionId, backgroundMission: true });

        this._backgroundMissions.set(missionId, {
            mission: def,
            handler,
            completionFlowActive: false,
        });

        handler?.start?.(def, this.game);
        this._savePersistedState();
    }

    _updateBackgroundMissions(delta) {
        for (const [missionId, entry] of this._backgroundMissions) {
            const { mission, handler, completionFlowActive } = entry;
            if (completionFlowActive) continue;

            handler?.update?.(delta, mission, this.game);

            if (handler?.isComplete?.(mission, this.game)) {
                entry.completionFlowActive = true;
                this._completeBackgroundMission(missionId);
            }
        }
    }

    async _completeBackgroundMission(missionId) {
        const entry = this._backgroundMissions.get(missionId);
        if (!entry) return;

        const { mission, handler } = entry;
        console.log('[Mission] Background mission completed', { missionId, nextMission: mission.nextMission });

        handler?.cleanup?.(mission, this.game);

        const completionDelaySeconds = this.getMissionCompleteDelaySeconds(mission);
        if (completionDelaySeconds > 0) {
            await this.wait(completionDelaySeconds * 1000);
        }

        // End sequence — play directly with this mission's own context so we never
        // touch this.currentMission, which belongs to the normal mission slot.
        if (mission.endSequence) {
            this.game?.setMissionInputLocked?.(true);
            this.game?.setSequencePresentationActive?.(true);
            this.game?.setTimelineCameraControlled?.(true);
            this.game?.setTimelineAnimationControlled?.(true);
            const bgActors = Object.values(this.buildTimelineContextForMission(mission).actors);
            for (const a of bgActors) a?.setTimelineAnimationControlled?.(true);
            const bgContext = this.buildTimelineContextForMission(mission);
            try {
                const { promise, timeline } = playTimeline(mission.endSequence, bgContext);
                this.game?.setTimelineSkipHandler?.(() => {
                    applySequenceInstantly(timeline, bgContext);
                    timeline.currentTime = timeline.duration;
                    timeline.finished = true;
                    for (const track of timeline.tracks) {
                        track?.onTimelineEnd?.({ ...bgContext, camera: timeline.camera, actors: timeline.actors, level: timeline.level, game: timeline.game });
                    }
                });
                await promise;
            } catch (e) {
                console.error('[Mission] Background endSequence error:', e);
            } finally {
                this.game?.setTimelineSkipHandler?.(null);
                for (const a of bgActors) a?.setTimelineAnimationControlled?.(false);
                this.game?.setTimelineCameraControlled?.(false);
                this.game?.setTimelineAnimationControlled?.(false);
                this.game?.setSequencePresentationActive?.(false);
                this.game?.setMissionInputLocked?.(false);
            }
        }

        // Completion dialog — same flow as normal missions.
        const coinReward = Number.isFinite(mission.coinReward) && mission.coinReward > 0
            ? mission.coinReward : null;
        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.MISSION_COMPLETE_DIALOG);
        const completionChoice = await this.dialog.showComplete(mission, { coinReward });
        this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.MISSION_COMPLETE_DIALOG);
        await this.game?.runPokiCommercialBreak?.('mission won');
        if (coinReward) {
            const dialogCenter = this.dialog.getCanvasScreenCenter?.() ?? null;
            await this._awardMissionCoins(coinReward, completionChoice, dialogCenter);
        }

        // Mark completed and persist.
        this._completedIds.add(missionId);
        if (mission.replay?.enabled && mission.replay.cooldownSeconds > 0) {
            this._replayCooldowns[missionId] = Date.now() + mission.replay.cooldownSeconds * 1000;
        }
        this._savePersistedState();

        // Remove from active background set before starting newly eligible missions.
        this._backgroundMissions.delete(missionId);

        // Start any background missions that became eligible due to this completion.
        await this._startEligibleBackgroundMissions();

        // nextMission chaining — only for non-background missions; background missions
        // start themselves via dependency, not via nextMission.
        if (mission.nextMission) {
            const nextDef = this.getMissionDefinition(mission.nextMission);
            if (nextDef && nextDef.backgroundMission !== true) {
                console.info(`[Mission] nextMission chain: "${missionId}" → "${mission.nextMission}".`);
                await this.startMissionById(mission.nextMission);
            } else if (!nextDef) {
                console.warn(`[Mission] nextMission "${mission.nextMission}" not found.`);
            }
        }
    }

    /**
     * Cancel a specific background mission by id.
     * Does not affect the normal mission slot.
     */
    cancelBackgroundMission(missionId) {
        const entry = this._backgroundMissions.get(missionId);
        if (!entry) return;
        entry.handler?.cleanup?.(entry.mission, this.game);
        this._backgroundMissions.delete(missionId);
        this._savePersistedState();
        console.info(`[Mission] Background mission "${missionId}" canceled.`);
    }

    /** Returns the ids of all currently running background missions. */
    getActiveBackgroundMissionIds() {
        return [...this._backgroundMissions.keys()];
    }

    // ── Shared zone-trigger mission start ────────────────────────────────────

    getTriggerableMissionZones() {
        const zones = [];
        for (const missionDef of this.missions) {
            if (!missionDef?.id || missionDef.backgroundMission === true) {
                continue;
            }

            const mission = this.getMissionDefinition(missionDef.id);
            if (!mission || !this.isMissionAvailable(mission.id)) {
                continue;
            }
            if (this.currentMission?.id === mission.id) {
                continue;
            }

            const zoneId = mission.landingZone ?? mission.id;
            const zone = this.game?.getMissionZoneById?.(zoneId);
            if (!zone) {
                continue;
            }

            zones.push({
                ...zone,
                zoneId: zone.zoneId ?? zoneId,
                missionId: mission.id,
                requireGrounded: mission.requireGrounded === true
            });
        }

        return zones;
    }

    handleZoneTriggeredMission(missionId) {
        if (!missionId || !this.isMissionAvailable(missionId)) {
            return false;
        }

        if (this.state === MISSION_STATE.RUNNING) {
            if (this.currentMission?.id !== missionId) {
                this.showCancelMissionPopup(missionId);
            }
            return true;
        }

        if (this.state !== MISSION_STATE.IDLE) {
            return false;
        }

        this.startMissionById(missionId);
        return true;
    }


    // ── Update ────────────────────────────────────────────────────────────────

    update(delta) {
        // Tick all background missions independently of the normal mission slot.
        this._updateBackgroundMissions(delta);

        if (this.state !== MISSION_STATE.RUNNING || !this.currentMission || this.completionFlowActive) {
            return;
        }

        if (!this.currentHandler?.isStillCompletable?.(this.currentMission, this.game)) {
            console.warn(`[Mission] Mission "${this.currentMission.id}" is no longer completable. Restarting mission.`);
            this.failCurrentMission('objects');
            return;
        }

        if (this.remainingTime > 0 && Number.isFinite(delta)) {
            this.remainingTime = Math.max(0, this.remainingTime - Math.max(delta, 0));
            if (this.remainingTime <= 0 && !this.timeoutLogged) {
                this.timeoutLogged = true;
                console.info(`[Mission] Timer expired for "${this.currentMission.id}". Restarting mission.`);
                this.failCurrentMission('timeout');
                return;
            }
        }

        this.currentHandler?.update?.(delta, this.currentMission, this.game);
        if (this.currentHandler?.isComplete?.(this.currentMission, this.game)) {
            this.completeCurrentMission();
        }
    }

    // ── Completion ────────────────────────────────────────────────────────────

    async completeCurrentMission() {
        if (this.completionFlowActive || !this.currentMission) {
            return;
        }

        this.completionFlowActive = true;
        this.state = MISSION_STATE.COMPLETED;
        this._stopActiveBreakLoop();
        this.game?.setMissionInputLocked?.(true);
        this.game?.setActiveMission?.(null);
        this.currentHandler?.cleanup?.(this.currentMission, this.game);
        this._setMissionObjectsVisible(this.currentMission, false);

        const completionDelaySeconds = this.getMissionCompleteDelaySeconds(this.currentMission);
        if (completionDelaySeconds > 0) {
            await this.wait(completionDelaySeconds * 1000);
        }

        this.game?.setTimelineCameraControlled?.(Boolean(this.currentMission.endSequence));
        this.game?.setTimelineAnimationControlled?.(Boolean(this.currentMission.endSequence));
        this.setTimelineActorAnimationControlled(Boolean(this.currentMission.endSequence));

        await this.playMissionTimeline(this.currentMission.endSequence, true);
        this.game?.setTimelineCameraControlled?.(false);
        this.game?.setTimelineAnimationControlled?.(false);
        this.setTimelineActorAnimationControlled(false);

        this.state = MISSION_STATE.SHOW_COMPLETED;
        this.game?.audioManager?.play?.('triumph', { volume: 0.85 });

        // Record race time before showing the dialog so it's included in the leaderboard.
        const raceTimeMs = this.currentMission.missionResult?.raceTimeMs ?? this.currentMission.raceTimeMs;
        if (Number.isFinite(raceTimeMs) && raceTimeMs > 0) {
            this.recordRaceTime(this.currentMission.id, raceTimeMs);
        }
        const isTimedMission = this.isTimedLeaderboardMission(this.currentMission);
        const raceTimes = isTimedMission ? this.getRaceTimes(this.currentMission.id) : null;

        // Post score (only if a new best), then fetch the updated leaderboard.
        let globalScores = null;
        if (isTimedMission) {
            if (Number.isFinite(raceTimeMs) && raceTimeMs > 0) {
                const identity = getPlayerIdentity();
                await postRaceScore(this.currentMission.id, {
                    playerName: identity.name,
                    timeMs: raceTimeMs
                });
            }
            const scores = await fetchTopScores(this.currentMission.id, 100).catch(() => []);
            globalScores = scores.length > 0 ? scores : null;
        }

        const coinReward = Number.isFinite(this.currentMission.coinReward) && this.currentMission.coinReward > 0
            ? this.currentMission.coinReward
            : null;

        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.MISSION_COMPLETE_DIALOG);
        const completionChoice = await this.dialog.showComplete(this.currentMission, {
            raceTimes, raceTimeMs, globalScores, coinReward
        });
        this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.MISSION_COMPLETE_DIALOG);
        await this.game?.runPokiCommercialBreak?.('mission won');

        if (coinReward) {
            const dialogCenter = this.dialog.getCanvasScreenCenter?.() ?? null;
            await this._awardMissionCoins(coinReward, completionChoice, dialogCenter);
        }

        // ── Mark completed and persist ────────────────────────────────────────
        // Do this AFTER the completion dialog so the UI shows the correct state.
        const completedMission = this.currentMission;
        this._completedIds.add(completedMission.id);

        if (completedMission.replay?.enabled && completedMission.replay.cooldownSeconds > 0) {
            // Store expiry timestamp so availability can be checked without a running timer.
            this._replayCooldowns[completedMission.id] =
                Date.now() + completedMission.replay.cooldownSeconds * 1000;
        }
        this._savePersistedState();
        console.info(`[Mission] Completed "${completedMission.id}". Persisted.`);

        // Start any background missions that became eligible due to this completion.
        await this._startEligibleBackgroundMissions();

        // ── nextMission chaining ──────────────────────────────────────────────
        // If the completed mission specifies a nextMission, start it immediately
        // using the normal start flow. This only runs after full completion —
        // never after cancellation.
        const nextMissionId = completedMission.nextMission;
        if (nextMissionId) {
            const nextDef = this.getMissionDefinition(nextMissionId);
            if (nextDef && nextDef.backgroundMission !== true) {
                console.info(`[Mission] nextMission chain: "${completedMission.id}" → "${nextMissionId}".`);
                this.completionFlowActive = false;
                await this.startMissionById(nextMissionId);
                return;
            } else if (!nextDef) {
                console.warn(`[Mission] nextMission "${nextMissionId}" not found in missions list.`);
            }
            // nextMission pointing at a background mission is ignored — background missions
            // are started by dependency, not by nextMission chaining.
        }

        // ── No nextMission — prepare next in list then enter idle ────────────
        const nextMissionIndex = this.currentMissionIndex + 1;
        const nextMission = this.missions[nextMissionIndex] || null;
        await this.ensureNextMissionObjectsReady(nextMission);

        this.currentMissionIndex = nextMissionIndex;
        this.completionFlowActive = false;

        // Enter idle so the player can explore and find the next callout.
        this._enterIdle();
    }

    _flushPendingCoinFly(delayMs = 0) {
        if (!this._pendingCoinFly || !this._spawnCoinFly) return;
        const { screenX, screenY, count, perCoin } = this._pendingCoinFly;
        this._pendingCoinFly = null;
        const fire = () => this._spawnCoinFly(screenX, screenY, count, perCoin);
        if (delayMs > 0) {
            setTimeout(fire, delayMs);
        } else {
            fire();
        }
    }

    // ── Coin reward ───────────────────────────────────────────────────────────

    async _awardMissionCoins(coinReward, completionChoice, dialogCenter = null) {
        if (!this._setCoinCount || !this._getCoinCount) return;

        let amount = coinReward;
        if (completionChoice === 'ad' && this._onWatchAd) {
            try {
                const adWatched = await this._onWatchAd();
                amount = adWatched ? coinReward * 2 : coinReward;
            } catch {
                // Ad failed or was skipped — award the normal amount.
            }
        }

        const current = this._getCoinCount() ?? 0;
        const newTotal = current + amount;
        // Persist the real value immediately — only the visual HUD display is deferred.
        this._setCoinCount(newTotal, { visualOnly: false, skipHud: this._spawnCoinFly && dialogCenter });
        console.info(`[Mission] Awarded ${amount} coins (total: ${newTotal}).`);

        if (this._spawnCoinFly && dialogCenter) {
            const count = Math.min(Math.max(Math.round(amount / 10), 4), 12);
            // perCoin is the total amount to distribute — _spawnCoinFlyFromScreen spreads it across coins.
            this._pendingCoinFly = { screenX: dialogCenter.x, screenY: dialogCenter.y, count, perCoin: amount };
        }
    }

    // ── Cancellation ──────────────────────────────────────────────────────────

    /**
     * cancelCurrentMission — cleanly cancels the active mission.
     *
     * CANCEL vs COMPLETION
     * - Does NOT mark the mission as completed.
     * - Does NOT play the end sequence or completion dialog.
     * - Does NOT trigger nextMission.
     * - Resets temporary progress so the mission can be restarted from a callout.
     * - Enters IDLE so the player can find a callout to start another mission.
     */
    async cancelCurrentMission() {
        if (!this.currentMission || this.completionFlowActive) return;

        const canceledId = this.currentMission.id;
        console.info(`[Mission] Canceling "${canceledId}".`);

        this._stopActiveBreakLoop();
        this.currentHandler?.cleanup?.(this.currentMission, this.game);
        this._setMissionObjectsVisible(this.currentMission, false);
        this.game?.setActiveMission?.(null);
        this.game?.setMissionInputLocked?.(false);
        this.completionFlowActive = false;

        // Do NOT mark as completed; do NOT update _completedIds or _replayCooldowns.
        // The callout will reappear as soon as state returns to IDLE.

        this._enterIdle();
        console.info(`[Mission] "${canceledId}" canceled — returning to idle.`);
    }

    /**
     * showCancelMissionPopup — shown when the dyno lands in a land area for a
     * different mission while another is already running.
     *
     * If confirmed: cancel the current mission and start the requested one.
     * If declined: keep the current mission running.
     *
     * @param {string} requestedMissionId — the mission the player wants to switch to
     */
    async showCancelMissionPopup(requestedMissionId) {
        if (this.state !== MISSION_STATE.RUNNING) return;

        this.game?.setMissionInputLocked?.(true);
        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.MISSION_CANCEL_DIALOG);
        const confirmed = await this.dialog.showCancel(this.currentMission);
        this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.MISSION_CANCEL_DIALOG);
        this.game?.setMissionInputLocked?.(false);

        if (confirmed) {
            await this.cancelCurrentMission();
            if (requestedMissionId && this.isMissionAvailable(requestedMissionId)) {
                await this.startMissionById(requestedMissionId);
            }
        }
    }

    // ── Failure / retry ───────────────────────────────────────────────────────

    async ensureMissionObjectsReady(mission, referenceLevel = this.currentMission?.level) {
        if (!mission || mission.level !== referenceLevel) {
            return;
        }

        const objectType = mission.params?.objectType;
        const requiredCount = Math.max(
            1,
            Number.isFinite(mission.params?.requiredCount)
                ? mission.params.requiredCount
                : 1
        );

        if (!objectType || !this.game?.levelObjectManager?.ensureObjectTypeCount) {
            return;
        }

        await this.game.levelObjectManager.ensureObjectTypeCount(objectType, requiredCount);
    }

    async ensureNextMissionObjectsReady(nextMission) {
        await this.ensureMissionObjectsReady(nextMission, this.currentMission?.level);
    }

    resetCurrentMissionForRetry() {
        this.game?.player?.resetForLevel?.(this.game?.level);
        if (this.game?.player && this.game?.levelObjectManager) {
            this.game.player.levelObjectManager = this.game.levelObjectManager;
        }
        this.game?.setTimelineCameraControlled?.(false);
        this.game?.setTimelineAnimationControlled?.(false);
        this.setTimelineActorAnimationControlled(false);
        this.game?.setActiveMission?.(null);
        this.game?.setMissionInputLocked?.(true);
    }

    async failCurrentMission(failReason = 'generic') {
        if (this.completionFlowActive || !this.currentMission) {
            return;
        }

        this.completionFlowActive = true;
        this.state = MISSION_STATE.COMPLETED;
        this._stopActiveBreakLoop();
        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.MISSION_FAILURE_DIALOG);
        this.game?.setMissionInputLocked?.(true);
        this.game?.setActiveMission?.(null);
        this.currentHandler?.cleanup?.(this.currentMission, this.game);

        this.state = MISSION_STATE.SHOW_COMPLETED;
        await this.dialog.showComplete(this.currentMission, { isFailed: true, failReason });
        this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.MISSION_FAILURE_DIALOG);
        await this.game?.runPokiCommercialBreak?.('mission lost');

        this.completionFlowActive = false;

        // Reinitialize the current mission (don't advance to next).
        this.currentHandler = missionHandlers[this.currentMission.type] || null;
        this.remainingTime = Number.isFinite(this.currentMission.duration) ? Math.max(0, this.currentMission.duration) : 0;
        this.timeoutLogged = false;
        this.addFallbackZonesForMissionLevel(this.currentMission.level);
        await this.ensureMissionObjectsReady(this.currentMission, this.currentMission.level);
        this.resetCurrentMissionForRetry();
        this.previewMissionTimelineFrame(this.currentMission.startSequence, 0);

        this.game?.setTimelineCameraControlled?.(Boolean(this.currentMission.startSequence));
        this.game?.setTimelineAnimationControlled?.(Boolean(this.currentMission.startSequence));
        this.setTimelineActorAnimationControlled(Boolean(this.currentMission.startSequence));
        await this.playMissionTimeline(this.currentMission.startSequence, true);
        this.game?.setTimelineCameraControlled?.(false);
        this.game?.setTimelineAnimationControlled?.(false);
        this.setTimelineActorAnimationControlled(false);
        this.game?.setMissionInputLocked?.(true);

        this.game?.pokiGameplayGate?.addStopReason?.(PokiStopReasons.MISSION_START_DIALOG);
        this.state = MISSION_STATE.SHOW_START;
        await this.dialog.showStart(this.currentMission);
        this.game?.pokiGameplayGate?.removeStopReason?.(PokiStopReasons.MISSION_START_DIALOG);
        this._flushPendingCoinFly(220);

        this.currentHandler?.start?.(this.currentMission, this.game);
        this.state = MISSION_STATE.RUNNING;
        this.game?.setActiveMission?.(this.currentMission);
        this.game?.setMissionInputLocked?.(false);
    }

    // ── Timer helpers ─────────────────────────────────────────────────────────

    getTimerProgress() {
        const duration = this.currentMission?.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
            return 0;
        }
        return this.remainingTime / duration;
    }

    getRemainingTime() {
        return this.remainingTime;
    }

    // ── Fallback zones ────────────────────────────────────────────────────────

    addFallbackZonesForMissionLevel(levelKey) {
        const zones = FALLBACK_MISSION_ZONES[levelKey];
        if (!zones?.length || !this.game?.level?.addMissionZones) {
            return;
        }

        const level = this.game.level;
        const missingZones = zones.filter((zone) => {
            if (zone.zoneId && level.getMissionZoneById?.(zone.zoneId)) {
                return false;
            }
            if (zone.zoneType && level.getMissionZonesByType?.(zone.zoneType)?.length) {
                return false;
            }
            return true;
        });

        level.addMissionZones(missingZones.map((zone) => ({
            ...zone,
            source: 'mission-fallback'
        })));
    }
}
