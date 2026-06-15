/**
 * TIMELINE ANIMATION SYSTEM
 * 
 * Modular, optional system for cinematic sequences in missions.
 * 
 * DESIGN PRINCIPLES:
 * 1. Completely optional - missions without sequences are unaffected
 * 2. Self-contained - only active when explicitly started
 * 3. Modular - tracks are independent and extensible
 * 4. Safe - handles missing/undefined sequences gracefully
 * 
 * USAGE:
 *   const timeline = new Timeline(sequenceConfig);
 *   timeline.registerActors({ dyno, tank_1, chopper_1 });
 *   await playTimeline(timeline);
 * 
 * Or as a helper:
 *   await playTimeline(mission.startSequence, { actors, camera, ... });
 */

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

/**
 * Easing curves for smooth, natural motion.
 * 
 * Each easing function maps a normalized time (0-1) to an eased value (0-1).
 * 
 * - linear: No easing (constant speed)
 * - easeIn: Slow start, fast end (accelerating)
 * - easeOut: Fast start, slow end (decelerating)
 * - easeInOut: Slow start and end, fast middle (smooth)
 * 
 * WHY EASING?
 * Linear motion feels robotic. Easing functions create natural, organic motion:
 * - easeIn makes objects "accelerate" into view
 * - easeOut makes objects "decelerate" to rest
 * - easeInOut creates smooth, polished cinematics
 * 
 * USAGE:
 * { time: 0, x: 0, ease: 'easeOut' }  // Ease OUT from previous keyframe to this one
 */
const Easing = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => 1 - (1 - t) * (1 - t),
    easeInOut: (t) =>
        t < 0.5
            ? 2 * t * t
            : 1 - Math.pow(-2 * t + 2, 2) / 2
};

/**
 * Linear interpolation between two values with optional easing.
 * 
 * @param {number} from - Starting value
 * @param {number} to - Ending value
 * @param {number} progress - Normalized progress (0-1, before easing)
 * @param {string} easeName - Easing function name ('linear', 'easeIn', 'easeOut', 'easeInOut')
 * @returns {number} Interpolated value
 * 
 * PROCESS:
 * 1. Clamp progress to 0-1
 * 2. Apply easing function to progress
 * 3. Interpolate between from and to using eased progress
 */
function lerpValue(from, to, progress, easeName = 'linear') {
    if (typeof from === 'number' && typeof to === 'number') {
        // Clamp progress to 0-1
        const clampedProgress = Math.max(0, Math.min(1, progress));
        
        // Apply easing function
        const easeFn = Easing[easeName] || Easing.linear;
        const easedProgress = easeFn(clampedProgress);
        
        // Interpolate
        return from + (to - from) * easedProgress;
    }
    // For non-numeric values (like animation names), return 'to' at 100% progress
    return progress >= 1 ? to : from;
}

/**
 * Find the two keyframes that bracket a given time.
 * Returns { current, next, progress, easeName } where progress is 0-1.
 * 
 * The easing function is specified by the 'ease' property of the NEXT keyframe.
 * This defines how to interpolate FROM current TO next.
 */
function findKeyframeInterval(keyframes, time) {
    for (let i = 0; i < keyframes.length - 1; i++) {
        const current = keyframes[i];
        const next = keyframes[i + 1];
        
        if (time >= current.time && time <= next.time) {
            const interval = next.time - current.time;
            const elapsed = time - current.time;
            const progress = interval > 0 ? elapsed / interval : 1;
            
            // Get easing from the next keyframe (defines interpolation TO it)
            const easeName = next.ease || 'linear';
            
            return { current, next, progress, easeName };
        }
    }
    
    // Time is before first keyframe
    if (time < keyframes[0].time) {
        return { current: keyframes[0], next: keyframes[0], progress: 0, easeName: 'linear' };
    }
    
    // Time is after last keyframe
    const last = keyframes[keyframes.length - 1];
    return { current: last, next: last, progress: 1, easeName: 'linear' };
}

function getLatestKeyframeAtOrBefore(keyframes, time) {
    if (!Array.isArray(keyframes) || keyframes.length === 0) {
        return null;
    }

    let latest = null;
    for (const keyframe of keyframes) {
        if (typeof keyframe?.time !== 'number' || keyframe.time > time) {
            continue;
        }
        latest = keyframe;
    }
    return latest;
}

function getActorTransformTarget(actor) {
    if (actor?.getTimelineTransformTarget) {
        return actor.getTimelineTransformTarget();
    }

    if (actor?.position && actor?.rotation) {
        return actor;
    }

    return actor?.mesh || actor?.container || actor?.sceneObject || null;
}

function setActorVisible(actor, visible) {
    const nextVisible = visible === true;
    if (actor?.container) {
        actor.container.visible = nextVisible;
    }
    if (actor?.sceneObject) {
        actor.sceneObject.visible = nextVisible;
    }
    if (actor?.mesh) {
        actor.mesh.visible = nextVisible;
    }
    if ('visible' in Object(actor)) {
        actor.visible = nextVisible;
    }
}

function applyActorNodeVisibility(actor, keyframe) {
    if (!actor || !keyframe) {
        return;
    }

    if (keyframe.nodeVisibility && typeof keyframe.nodeVisibility === 'object') {
        actor.setModelNodeVisibility?.(keyframe.nodeVisibility);
    }

    if (Array.isArray(keyframe.showNodes)) {
        actor.showModelNodes?.(keyframe.showNodes);
    }

    if (Array.isArray(keyframe.hideNodes)) {
        actor.hideModelNodes?.(keyframe.hideNodes);
    }
}

// Legacy flame track hook. Player fire has been removed, so this is now a no-op.
// fireAngleDeg: optional degrees offset from facing direction (+ up, − down).
//   Sets flameDirectionOverride so the flame aims at the authored angle.
//   Pass null/undefined to clear the override and restore default aim logic.
// fireOffset: optional {x, y} world-space offset added to the anchor/mouth position.
//   X is mirrored by facing direction so positive always means "forward".
function setActorFlame(actor, active, fireAngleDeg, fireOffset) {
    void actor;
    void active;
    void fireAngleDeg;
    void fireOffset;
}

function resolveTimelineAxisValue(keyframe, axis, level) {
    if (!keyframe) {
        return undefined;
    }

    if (axis === 'x') {
        if (typeof keyframe.x === 'number') {
            return keyframe.x;
        }
        if (typeof keyframe.tx === 'number') {
            return level?.tiledToWorld?.(
                keyframe.tx,
                typeof keyframe.ty === 'number' ? keyframe.ty : 0
            )?.x;
        }
    }

    if (axis === 'y') {
        if (typeof keyframe.y === 'number') {
            return keyframe.y;
        }
        if (typeof keyframe.ty === 'number') {
            return level?.tiledToWorld?.(
                typeof keyframe.tx === 'number' ? keyframe.tx : 0,
                keyframe.ty
            )?.y;
        }
    }

    return undefined;
}

function getInterpolatedKeyframeValue(keyframes, time, resolver) {
    if (!Array.isArray(keyframes) || keyframes.length === 0 || typeof resolver !== 'function') {
        return undefined;
    }

    const keyedFrames = keyframes
        .map((keyframe) => ({
            keyframe,
            value: resolver(keyframe)
        }))
        .filter((entry) => typeof entry.value === 'number');

    if (keyedFrames.length === 0) {
        return undefined;
    }

    if (time <= keyedFrames[0].keyframe.time) {
        return keyedFrames[0].value;
    }

    for (let index = 0; index < keyedFrames.length - 1; index += 1) {
        const current = keyedFrames[index];
        const next = keyedFrames[index + 1];
        if (time < current.keyframe.time || time > next.keyframe.time) {
            continue;
        }

        const interval = next.keyframe.time - current.keyframe.time;
        const progress = interval > 0 ? (time - current.keyframe.time) / interval : 1;
        const easeName = next.keyframe.ease || 'linear';
        return lerpValue(current.value, next.value, progress, easeName);
    }

    return keyedFrames[keyedFrames.length - 1].value;
}

// ============================================================================
// TRACK BASE CLASS
// ============================================================================

/**
 * Base class for all track types.
 * Subclasses implement specific domain control (camera, actors, animations, etc).
 */
class Track {
    constructor(config) {
        this.type = config.type;
        this.keyframes = config.keyframes || [];
    }
    
    /**
     * Update the track at a specific timeline time.
     * @param {number} time - Current timeline time (0 to timeline.duration)
     * @param {object} context - { camera, actors, ... } passed from timeline
     */
    update(time, context) {
        // Override in subclasses
    }
    
    /**
     * Cleanup/reset when timeline ends.
     * @param {object} context
     */
    onTimelineEnd(context) {
        // Override if needed
    }
}

// ============================================================================
// CAMERA TRACK
// ============================================================================

/**
 * Controls camera position and zoom during timeline.
 * 
 * Keyframe format:
 * { time: 0, x: 0, y: 5, tx: 320, ty: 180, zoom: 1.5, ease: 'easeOut' }
 * 
 * Interpolates between keyframes with optional easing curves.
 * The 'ease' property defines how to smoothly transition TO this keyframe.
 * If not specified, defaults to 'linear'.
 */
class CameraTrack extends Track {
    constructor(config) {
        super(config);
    }
    
    update(time, context) {
        if (!context.camera || this.keyframes.length === 0) return;
        
        const interval = findKeyframeInterval(this.keyframes, time);
        const { current, next, progress, easeName } = interval;
        
        // Interpolate position with easing. `tx` / `ty` use Tiled editor coordinates.
        const currentX = resolveTimelineAxisValue(current, 'x', context.level);
        const nextX = resolveTimelineAxisValue(next, 'x', context.level);
        const currentY = resolveTimelineAxisValue(current, 'y', context.level);
        const nextY = resolveTimelineAxisValue(next, 'y', context.level);
        if (typeof currentX === 'number' && typeof nextX === 'number') {
            context.camera.position.x = lerpValue(currentX, nextX, progress, easeName);
        }
        if (typeof currentY === 'number' && typeof nextY === 'number') {
            context.camera.position.y = lerpValue(currentY, nextY, progress, easeName);
        }
        
        // Interpolate zoom with easing
        if ('zoom' in current && 'zoom' in next) {
            context.camera.zoom = lerpValue(current.zoom, next.zoom, progress, easeName);
            context.camera.updateProjectionMatrix?.();
        }
    }
}

// ============================================================================
// ACTOR TRACK
// ============================================================================

/**
 * Controls actor position, rotation, and visibility.
 * 
 * Keyframe format:
 * { time: 0, x: 0, y: 0, tx: 320, ty: 180, rx: 0, ry: 0, rz: 0, visible: true, ease: 'easeInOut' }
 * { time: 2, nodeVisibility: { girl: true } } // actor-specific model node visibility
 * 
 * Actor is referenced by ID.
 * The 'ease' property defines how to smoothly transition TO this keyframe.
 */
class ActorTrack extends Track {
    constructor(config) {
        super(config);
        this.actor = config.actor; // Actor ID
    }
    
    update(time, context) {
        if (!this.actor || !context.actors || !context.actors[this.actor]) {
            return;
        }
        
        const actor = context.actors[this.actor];
        if (this.keyframes.length === 0) return;
        const target = getActorTransformTarget(actor);
        if (!target) return;
        
        const discreteKeyframe = getLatestKeyframeAtOrBefore(this.keyframes, time);
        
        // Position with easing. `tx` / `ty` use Tiled editor coordinates.
        const x = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => (
            resolveTimelineAxisValue(keyframe, 'x', context.level)
        ));
        const y = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => (
            resolveTimelineAxisValue(keyframe, 'y', context.level)
        ));
        const z = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.z);
        if (typeof x === 'number') {
            target.position.x = x;
        }
        if (typeof y === 'number') {
            target.position.y = y;
        }
        if (typeof z === 'number') {
            target.position.z = z;
        }
        
        // Rotation axes are authored as absolute values per axis.
        const rx = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.rx);
        const ry = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.ry);
        const rz = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.rz);
        if (typeof rx === 'number') {
            target.rotation.x = rx;
        }
        if (typeof ry === 'number') {
            target.rotation.y = ry;
        }
        if (typeof rz === 'number') {
            target.rotation.z = rz;
        }
        
        // Scale axes are authored as absolute values per axis.
        const sx = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.sx);
        const sy = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.sy);
        const sz = getInterpolatedKeyframeValue(this.keyframes, time, (keyframe) => keyframe.sz);
        if (typeof sx === 'number') target.scale.x = sx;
        if (typeof sy === 'number') target.scale.y = sy;
        if (typeof sz === 'number') target.scale.z = sz;

        // Visibility (discrete, not interpolated)
        if (discreteKeyframe && 'visible' in discreteKeyframe) {
            setActorVisible(actor, discreteKeyframe.visible);
        }
        applyActorNodeVisibility(actor, discreteKeyframe);

        // Flame (discrete, not interpolated). fireAngle in degrees offsets from facing direction.
        // fireOffset: {x, y} world-space offset for the spawn anchor (x mirrored by facing).
        if (discreteKeyframe && 'flame' in discreteKeyframe) {
            const angle  = 'fireAngle'  in discreteKeyframe ? discreteKeyframe.fireAngle  : undefined;
            const offset = 'fireOffset' in discreteKeyframe ? discreteKeyframe.fireOffset  : undefined;
            setActorFlame(actor, discreteKeyframe.flame, angle, offset);
        }

        actor?.onTimelineTransformUpdated?.(target);
    }

    onTimelineEnd(context) {
        const actor = context?.actors?.[this.actor];
        if (actor) {
            setActorFlame(actor, false, null);
        }
    }
}

// ============================================================================
// ANIMATION TRACK
// ============================================================================

/**
 * Triggers animations on actors at specific times.
 * 
 * Keyframe format:
 * { time: 0, animation: 'idle' }
 * { time: 1, animation: 'flying_takeoff', loop: false }
 * 
 * Animation names are passed to actor.playAnimation() method.
 */
class AnimationTrack extends Track {
    constructor(config) {
        super(config);
        this.actor = config.actor; // Actor ID
        this.lastTriggeredTime = -1; // Track to avoid duplicate triggers
    }
    
    update(time, context) {
        if (!this.actor || !context.actors || !context.actors[this.actor]) {
            return;
        }
        
        const actor = context.actors[this.actor];
        if (this.keyframes.length === 0) return;
        
        // Check if we've crossed into a new keyframe
        for (const keyframe of this.keyframes) {
            if (time >= keyframe.time && keyframe.time > this.lastTriggeredTime) {
                this.lastTriggeredTime = keyframe.time;
                
                if (keyframe.animation) {
                    const loop = keyframe.loop !== false; // Default true
                    if (actor.playTimelineAnimation) {
                        actor.playTimelineAnimation(keyframe.animation, { loop });
                    } else if (loop && actor.playLoopAnimation) {
                        actor.playLoopAnimation(keyframe.animation);
                    } else if (actor.playAnimation) {
                        actor.playAnimation(keyframe.animation);
                    }
                }
            }
        }
    }
    
    onTimelineEnd(context) {
        // Reset trigger tracking
        this.lastTriggeredTime = -1;
    }
}

// ============================================================================
// EVENT TRACK
// ============================================================================

/**
 * Triggers callback functions at specific times.
 * 
 * Keyframe format:
 * { time: 0.5, callback: () => { ... } }
 * 
 * Callbacks are executed once when the timeline reaches that time.
 */
class EventTrack extends Track {
    constructor(config) {
        super(config);
        this.triggeredTimes = new Set(); // Track which keyframes have fired
    }
    
    update(time, context) {
        if (this.keyframes.length === 0) return;
        
        for (const keyframe of this.keyframes) {
            if (time >= keyframe.time && !this.triggeredTimes.has(keyframe.time)) {
                this.triggeredTimes.add(keyframe.time);
                
                if (typeof keyframe.callback === 'function') {
                    keyframe.callback(context);
                }
            }
        }
    }
    
    onTimelineEnd(context) {
        this.triggeredTimes.clear();
    }
}

// ============================================================================
// SFX TRACK
// ============================================================================

/**
 * Plays one-shot sound effects at specific times.
 *
 * Keyframe format:
 * { time: 0.5, sfx: 'grab' }
 * { time: 1.2, sound: 'wingflap', volume: 0.8 }
 *
 * Sound names map directly to keys loaded into the main AudioManager.
 */
class SfxTrack extends Track {
    constructor(config) {
        super(config);
        this.triggeredTimes = new Set();
    }

    update(time, context) {
        if (this.keyframes.length === 0) return;

        const audioManager = context?.game?.audioManager || null;
        if (!audioManager?.play) {
            return;
        }

        for (const keyframe of this.keyframes) {
            if (time >= keyframe.time && !this.triggeredTimes.has(keyframe.time)) {
                this.triggeredTimes.add(keyframe.time);

                const soundName = keyframe.sfx || keyframe.sound || keyframe.effect;
                if (!soundName) {
                    continue;
                }

                audioManager.play(soundName, {
                    volume: keyframe.volume,
                    playbackRate: keyframe.playbackRate,
                    detune: keyframe.detune,
                    cooldown: keyframe.cooldown ?? 0
                });
            }
        }
    }

    onTimelineEnd() {
        this.triggeredTimes.clear();
    }
}

// ============================================================================
// TIMELINE CLASS
// ============================================================================

/**
 * Main timeline controller.
 * 
 * Manages tracks, time, and updates.
 * Timeline is self-contained and only active when explicitly updated.
 * 
 * USAGE:
 *   const timeline = new Timeline(config);
 *   timeline.registerActors({ dyno, tank_1 });
 *   timeline.update(deltaTime);
 *   if (timeline.isFinished()) { ... }
 */
export class Timeline {
    constructor(config) {
        if (!config) {
            // Failsafe: empty timeline
            this.duration = 0;
            this.tracks = [];
        } else {
            this.duration = config.duration || 0;
            this.tracks = this.createTracks(config.tracks || []);
        }
        
        this.currentTime = 0;
        this.finished = false;
        this.actors = {}; // Actor registry: { id: actor, ... }
        this.camera = null;
        this.game = null;
    }

    skip() {
        if (this.finished) return;
        this.currentTime = this.duration;
        this.finished = true;

        const context = {
            camera: this.camera,
            actors: this.actors,
            level: this.level || null,
            game: this.game || null
        };
        for (const track of this.tracks) {
            if (track) track.update(this.currentTime, context);
        }
        for (const track of this.tracks) {
            if (track) track.onTimelineEnd(context);
        }
    }
    
    /**
     * Create track instances from config.
     * Supports built-in tracks and allows custom types.
     */
    createTracks(trackConfigs) {
        const trackMap = {
            'CameraTrack': CameraTrack,
            'ActorTrack': ActorTrack,
            'AnimationTrack': AnimationTrack,
            'EventTrack': EventTrack,
            'SfxTrack': SfxTrack
        };
        
        return trackConfigs.map(trackConfig => {
            const TrackClass = trackMap[trackConfig.type];
            if (!TrackClass) {
                console.warn(`[Timeline] Unknown track type: ${trackConfig.type}`);
                return null;
            }
            return new TrackClass(trackConfig);
        }).filter(t => t !== null);
    }
    
    /**
     * Register actors that timeline can control by ID.
     */
    registerActors(actors) {
        this.actors = { ...this.actors, ...actors };
    }
    
    /**
     * Set camera to control during timeline.
     */
    setCamera(camera) {
        this.camera = camera;
    }

    setLevel(level) {
        this.level = level;
    }

    setGame(game) {
        this.game = game;
    }
    
    /**
     * Update timeline by delta time.
     * Updates all tracks at the new time.
     */
    update(delta) {
        if (this.finished || this.duration === 0) return;
        
        this.currentTime += delta;
        
        // Check if finished
        if (this.currentTime >= this.duration) {
            this.currentTime = this.duration;
            this.finished = true;
        }
        
        // Update all tracks
        const context = {
            camera: this.camera,
            actors: this.actors,
            level: this.level || null,
            game: this.game || null
        };
        
        for (const track of this.tracks) {
            if (track) {
                track.update(this.currentTime, context);
            }
        }
        
        // Notify tracks when timeline ends
        if (this.finished) {
            for (const track of this.tracks) {
                if (track) {
                    track.onTimelineEnd(context);
                }
            }
        }
    }
    
    /**
     * Check if timeline has finished.
     */
    isFinished() {
        return this.finished;
    }
    
    /**
     * Get current time as 0-1 progress.
     */
    getProgress() {
        return this.duration > 0 ? this.currentTime / this.duration : 1;
    }
}

// ============================================================================
// TIMELINE EXECUTION HELPER
// ============================================================================

/**
 * Play a timeline sequence and wait for it to finish.
 * 
 * SAFE: Returns immediately if sequence is null or missing.
 * 
 * @param {object} sequenceConfig - Timeline config or Timeline instance
 * @param {object} context - { camera, actors, game, ... }
 * @returns {Promise} Resolves when timeline finishes
 * 
 * USAGE:
 *   await playTimeline(mission.startSequence, { camera, actors });
 *   // Continue gameplay
 */
export function playTimeline(sequenceConfig, context = {}) {
    // Failsafe: no sequence defined
    if (!sequenceConfig) {
        return { promise: Promise.resolve(), timeline: null };
    }
    
    // Create timeline from config if needed
    let timeline;
    if (sequenceConfig instanceof Timeline) {
        timeline = sequenceConfig;
    } else {
        timeline = new Timeline(sequenceConfig);
    }
    
    // Register actors and camera if provided
    if (context.actors) {
        timeline.registerActors(context.actors);
    }
    if (context.camera) {
        timeline.setCamera(context.camera);
    }
    if (context.level) {
        timeline.setLevel(context.level);
    }
    if (context.game) {
        timeline.setGame(context.game);
    }
    
    // Play timeline to completion. Returns { promise, timeline } so callers can skip().
    const promise = new Promise((resolve) => {
        let lastTimestamp = null;

        const playFrame = () => {
            if (timeline.isFinished()) {
                resolve();
                return;
            }

            const now = performance.now();
            const gamePaused = context.game?.gameplayPaused === true;
            const deltaTime = (lastTimestamp == null || gamePaused)
                ? (1 / 60)
                : Math.max(0, Math.min(0.1, (now - lastTimestamp) / 1000));
            lastTimestamp = now;
            if (!gamePaused) {
                timeline.update(deltaTime);
            }

            requestAnimationFrame(playFrame);
        };

        playFrame();
    });

    return { promise, timeline };
}

export function previewTimeline(sequenceConfig, context = {}, time = 0) {
    if (!sequenceConfig) {
        return;
    }

    const timeline = sequenceConfig instanceof Timeline
        ? sequenceConfig
        : new Timeline(sequenceConfig);

    if (context.actors) {
        timeline.registerActors(context.actors);
    }
    if (context.camera) {
        timeline.setCamera(context.camera);
    }
    if (context.level) {
        timeline.setLevel(context.level);
    }
    if (context.game) {
        timeline.setGame(context.game);
    }

    const trackContext = {
        camera: timeline.camera,
        actors: timeline.actors,
        level: timeline.level || null,
        game: timeline.game || null
    };

    for (const track of timeline.tracks) {
        if (!track || track instanceof EventTrack || track instanceof SfxTrack) {
            continue;
        }
        track.update(time, trackContext);
    }
}

// ============================================================================
// INSTANT APPLY (skip / world-state restore)
// ============================================================================

/**
 * Apply a sequence to its final state immediately, without animation.
 *
 * For the dyno actor track: only hideNodes/showNodes/nodeVisibility keyframes
 * are applied (in order, so the last one wins), and the dyno is forced visible.
 * Position, rotation, and animation tracks on the dyno are skipped — the game
 * keeps control of those after a skip.
 *
 * For every other actor track: the full final-frame state is applied.
 * EventTrack and SfxTrack are always skipped.
 */
export function applySequenceInstantly(sequenceConfig, context = {}) {
    if (!sequenceConfig) return;

    const timeline = sequenceConfig instanceof Timeline
        ? sequenceConfig
        : new Timeline(sequenceConfig);

    if (context.actors) timeline.registerActors(context.actors);
    if (context.camera) timeline.setCamera(context.camera);
    if (context.level)  timeline.setLevel(context.level);
    if (context.game)   timeline.setGame(context.game);

    const trackContext = {
        camera: timeline.camera,
        actors: timeline.actors,
        level:  timeline.level || null,
        game:   timeline.game  || null,
    };

    const dynoActor = trackContext.actors?.dyno ?? null;

    for (const track of timeline.tracks) {
        if (!track || track instanceof EventTrack || track instanceof SfxTrack || track instanceof CameraTrack) continue;

        const isDynoActorTrack = track instanceof ActorTrack && track.actor === 'dyno';

        if (isDynoActorTrack) {
            // Dyno: apply only node-visibility keyframes in order
            for (const kf of track.keyframes) {
                applyActorNodeVisibility(dynoActor, kf);
            }
            // Ensure the dyno is always visible after a skip, flame always off.
            if (dynoActor) {
                setActorVisible(dynoActor, true);
                setActorFlame(dynoActor, false, null);
                dynoActor.onTimelineTransformUpdated?.();
            }
        } else {
            track.update(timeline.duration, trackContext);
            // Flame is always off after a skip regardless of final keyframe state.
            if (track instanceof ActorTrack) {
                const actor = trackContext.actors?.[track.actor];
                setActorFlame(actor, false, null);
            }
        }
    }
}

// ============================================================================
// ACTOR REGISTRY HELPER
// ============================================================================

/**
 * Helper to collect actors by ID from game state.
 * 
 * USAGE:
 *   const actors = collectActors(game, ['dyno', 'tank_1', 'chopper_2']);
 */
export function collectActors(game, actorIds) {
    const actors = {};
    
    for (const id of actorIds) {
        const actorId = String(id);
        if (id === 'dyno') {
            actors.dyno = game.player;
        } else {
            // Look for actor in level objects
            const actor = game.levelObjectManager?.objects?.find(
                obj => String(obj.id) === actorId ||
                    obj.missionId === id ||
                    obj.sourceObjectName === actorId ||
                    obj.spawnData?.name === actorId
            );
            if (actor) {
                actors[id] = actor;
            }
        }
    }
    
    return actors;
}

// ============================================================================
// TUNING NOTES
// ============================================================================

/**
 * EASING FUNCTIONS:
 * 
 * The timeline system now supports easing curves for natural, organic motion.
 * Each keyframe can specify how to interpolate TO it from the previous keyframe.
 * 
 * Easing Types:
 *   'linear' (default)   - Constant speed (no easing)
 *   'easeIn'             - Slow start, accelerates (t²)
 *   'easeOut'            - Fast start, decelerates (smooth deceleration)
 *   'easeInOut'          - Slow start and end, fast middle (polynomial blend)
 * 
 * USAGE:
 *   { time: 0, x: 0 }           // Default: linear easing
 *   { time: 3, x: 10, ease: 'easeOut' }  // Decelerate as approaching target
 *   { time: 5, zoom: 1.5, ease: 'easeInOut' }  // Smooth acceleration and deceleration
 * 
 * WHY EASING?
 *   Linear motion feels robotic and unnatural. Easing creates:
 *   - easeIn: Objects appear to "accelerate" into scene
 *   - easeOut: Objects appear to "decelerate" into rest
 *   - easeInOut: Professional, smooth cinematics
 * 
 * EASING PERFORMANCE:
 *   - Minimal overhead (2-3 extra operations per interpolated value)
 *   - No performance impact on gameplay when not in use
 *   - All easing is computed in real-time (no lookup tables needed)
 * 
 * BACKWARD COMPATIBILITY:
 *   - Keyframes without 'ease' property default to 'linear'
 *   - Existing timelines work exactly as before
 *   - No changes needed to use easing (optional enhancement)
 * 
 * TIMING INTERPOLATION:
 * - Keyframe times must be in ascending order
 * - Time values can be fractional (e.g., 0.5, 1.25, etc)
 * - Progress is clamped to 0-1 before easing is applied
 * 
 * ACTOR POSITIONING:
 * - Actor position is in THREE.js world space
 * - Rotation is in radians (0-2π)
 * - Z position controls depth layering
 * - Easing applies to position, rotation, and zoom
 * 
 * ANIMATION TIMING:
 * - Animation keyframes trigger when timeline time >= keyframe.time
 * - Animations are discrete (no interpolation, no easing)
 * - Once triggered, an animation will not re-trigger
 * 
 * EVENT TIMING:
 * - Events fire once when timeline reaches their time
 * - Use for sound effects, visual effects, or logic triggers
 * - Callbacks receive context object with camera and actors
 * 
 * PERFORMANCE:
 * - Timelines are lightweight when not running
 * - Only tracks with keyframes consume update time
 * - Easing adds ~0.05ms per track per frame (negligible)
 * - Most games will have 1-2 timeline sequences per mission
 * 
 * DEBUGGING:
 * - Use timeline.getProgress() to check animation progress
 * - Log track updates to debug keyframe timing
 * - Check actor IDs match registered actors
 * - Verify easing names are spelled correctly (linear, easeIn, easeOut, easeInOut)
 * 
 * TUNING EASING:
 * - Start with 'linear' (baseline)
 * - Add 'easeOut' to arrivals (camera pans, actors entering)
 * - Add 'easeIn' to departures (camera pulling back, actors exiting)
 * - Use 'easeInOut' for full motion cycles (smooth, polished feel)
 * - Test with different keyframe times to find natural timing
 */
