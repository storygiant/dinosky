import { LevelObject, LEVEL_OBJECT_STATES } from './LevelObject.js';
import { FlyingAIController } from './FlyingAIController.js';

// Underwater AI-driven LevelObject.
//
// Movement reuse:
//   The shark reuses FlyingAIController in 'swim' mode. The controller drives
//   smooth acceleration, smooth turning, facing-direction flip, target selection
//   and terrain (collisionPolygon) avoidance — exactly like a drone or plane —
//   but the allowed region is a *water polygon* supplied by this class via
//   `getAIAllowedPolygon()` instead of a rectangular flight zone.
//
// Water polygon tracking:
//   On spawn (and after any drop) the shark resolves which water polygon (if
//   any) contains its position via `level.getWaterPolygonAt(point)`. While the
//   shark is inside a polygon, swim AI runs and the `walk-loop` animation plays.
//   While outside water, swim AI is disabled and the shark behaves as a normal
//   physics-driven LevelObject (so a thrown shark falls under gravity and slides
//   along terrain until it lands in water again).
//
// Lift / drop:
//   The existing pickup pipeline already handles the lifted animation. Because
//   the shark's GLB exposes a `root_top` node, `getSelectedPickupRootName()`
//   returns `'root_top'` and `playInteractionAnimationForAnchor('root_top')`
//   automatically plays `root_top-loop` while carried. We just need to disable
//   swim AI while carried and re-evaluate water containment when released.
//
// Animation fallback:
//   `playTimelineAnimation` and `playInteractionAnimationByName` both return
//   false (without throwing) when the requested clip is missing — they simply
//   stop the current interaction animation. So a shark GLB without `walk-loop`
//   or `root_top-loop` will not crash; it just won't animate that state.

const SWIM_DEBUG_INTERVAL_SEC = 1.0;

export class SharkObject extends LevelObject {
    constructor(options) {
        super(options);

        // Lift/drop: shark uses the standard pickupable path so the dino's grab
        // logic and root_top socket selection work without changes.
        this.pickupable = this.config.pickupable !== false;
        this.draggable  = this.config.draggable === true;

        const swimCfg = this.config.swimAI || {};

        // Swim AI is created lazily — we only attach FlyingAIController when the
        // shark is actually inside water, so out-of-water sharks behave like
        // inert physics props (carried, falling, idle on ground).
        this.flyingAI = new FlyingAIController(this, {
            movementType: 'swim',
            // Map swim config → FlyingAIController param names.
            // patrolSpeed → moveSpeed; fleeSpeed → moveSpeed × fleeSpeedMultiplier
            moveSpeed: Number(swimCfg.patrolSpeed ?? 3),
            fleeSpeedMultiplier: swimCfg.patrolSpeed > 0
                ? Number(swimCfg.fleeSpeed ?? swimCfg.patrolSpeed) / Number(swimCfg.patrolSpeed)
                : 1,
            acceleration: Number(swimCfg.acceleration ?? 6),
            turnSpeedY: Number(swimCfg.turnSpeed ?? 3),
            behaviorMode: String(swimCfg.behavior ?? 'patrol'),
            // Slightly larger arrive threshold so the shark doesn't oscillate around tight targets.
            arriveThreshold: Number(swimCfg.arriveThreshold ?? 3),
            debugLogging: Boolean(swimCfg.debugLogging ?? this.config.debugLogging ?? false)
        });

        // Optional underwater depth bias for random target selection.
        // Format: [topFrac, bottomFrac] where 0 = water surface, 1 = polygon bottom.
        this.swimDepthRange = Array.isArray(swimCfg.swimDepthRange ?? this.config.swimDepthRange)
            ? (swimCfg.swimDepthRange ?? this.config.swimDepthRange)
            : null;

        // Current water polygon — null while out of water.
        this.currentWaterPolygon = null;
        this.currentWaterPolygonId = null;

        // Whether swim AI is active. Driven by water containment + carried state.
        this.swimAIEnabled = false;

        // Tracks the previous state so we can detect drop events (CARRIED → !CARRIED).
        this._prevState = null;

        // Periodic debug log throttle.
        this._swimDebugTimer = 0;
        this._swimDebugEnabled = Boolean(swimCfg.debugLogging ?? this.config.debugLogging ?? false);

        // The shark is normally affected by gravity (so a shark dropped above
        // water falls into it), but we disable gravity while the AI is driving it.
        this.alwaysUpdate = true;
    }

    async load() {
        await super.load();
        this.state = LEVEL_OBJECT_STATES.IDLE;
        // gravityEnabled is decided per-frame in update(): on while out of water,
        // off while swim AI drives position.
        return this;
    }

    // ── Water polygon hooks used by FlyingAIController ────────────────────

    // Called every frame by FlyingAIController when movementType==='swim'.
    // Returning null forces the controller to fall back to the rectangular area
    // (which we never want underwater) — so we only return a polygon when one
    // is actually assigned.
    getAIAllowedPolygon() {
        return this.currentWaterPolygon || null;
    }

    // Called by FlyingAIController to pick a target inside the current polygon.
    // We delegate to TiledLevel so the depth-band sampling lives in one place.
    pickRandomSwimTarget() {
        const level = this._cachedLevel;
        const poly = this.currentWaterPolygon;
        if (!level || !poly || typeof level.getRandomPointInsideWaterPolygon !== 'function') return null;
        return level.getRandomPointInsideWaterPolygon(poly, {
            depthRange: this.swimDepthRange
        });
    }

    // ── Water containment ─────────────────────────────────────────────────

    _refreshWaterPolygon(level) {
        if (!level || typeof level.getWaterPolygonAt !== 'function') {
            this._setWaterPolygon(null);
            return;
        }
        const pos = this.container.position;
        const poly = level.getWaterPolygonAt({ x: pos.x, y: pos.y });
        this._setWaterPolygon(poly);
    }

    _setWaterPolygon(poly) {
        const newId = poly?.id ?? null;
        if (newId === this.currentWaterPolygonId) {
            // Same polygon — keep existing reference (the polygon object is stable).
            this.currentWaterPolygon = poly || this.currentWaterPolygon;
            return;
        }
        this.currentWaterPolygon = poly || null;
        this.currentWaterPolygonId = newId;
        // Force the AI to pick a new target inside the new polygon.
        this.flyingAI?.resetPatrolTarget?.();
    }

    // ── Lift / drop transitions ───────────────────────────────────────────

    _handleStateTransition(level) {
        const carriedNow = this.state === LEVEL_OBJECT_STATES.CARRIED || this.carriedBy;
        const wasCarried = this._prevState === LEVEL_OBJECT_STATES.CARRIED;

        if (carriedNow && !wasCarried) {
            // Just picked up: disable swim AI; the pickup pipeline already started
            // root_top-loop via playInteractionAnimationForAnchor('root_top').
            this.swimAIEnabled = false;
            this._setWaterPolygon(null);
            if (this._swimDebugEnabled) {
                console.log('[Shark] lifted', { id: this.id });
            }
        } else if (!carriedNow && wasCarried) {
            // Just dropped: re-check water containment. If inside water, swim AI
            // resumes on the next frame; otherwise the shark falls until it
            // enters water (handled by the per-frame re-entry check below).
            this._refreshWaterPolygon(level);
            if (this._swimDebugEnabled) {
                console.log('[Shark] dropped', {
                    id: this.id,
                    inWater: Boolean(this.currentWaterPolygon),
                    waterPolygonId: this.currentWaterPolygonId
                });
            }
        }

        this._prevState = this.state;
    }

    // ── Main update ───────────────────────────────────────────────────────

    update(delta, level, dinoTarget = null) {
        if (!this.loaded) return;

        this._cachedLevel = level;

        this.updateHealthBarVisual?.();
        this.updateDestructionSequence?.(delta);

        if (this.markedForRemoval || this.isDestroyed) {
            // Let the base class handle destruction motion (debris etc.).
            return super.update(delta, level);
        }

        // Detect carry/release transitions and refresh water polygon accordingly.
        this._handleStateTransition(level);

        const carried = this.state === LEVEL_OBJECT_STATES.CARRIED || this.carriedBy;
        const dragged = this.state === LEVEL_OBJECT_STATES.DRAGGED;
        const grabbed = this.state === LEVEL_OBJECT_STATES.GRABBED;
        const falling = this.state === LEVEL_OBJECT_STATES.FALLING;

        if (carried || dragged || grabbed) {
            this.swimAIEnabled = false;
            return super.update(delta, level);
        }

        // Re-evaluate water containment every frame while not held. This covers
        // every entry path: spawn, falling into a lake, sliding off terrain, or
        // being thrown into water mid-arc.
        this._refreshWaterPolygon(level);

        const inWater = Boolean(this.currentWaterPolygon);

        if (inWater) {
            // Swim AI takes over: disable gravity, ensure swim animation, run AI.
            // Reset angle to horizontal when first re-entering water so the shark
            // never resumes at a tilted angle from being dragged or falling in.
            if (!this.swimAIEnabled) {
                // Reset any tilt applied by carry/drag.
                if (this.sceneObject) {
                    this.sceneObject.rotation.x = this.baseRotation?.x ?? 0;
                    this.sceneObject.rotation.z = this.baseRotation?.z ?? 0;
                }
                // Sync AI facing state from currentFacingDirection so the drone AI
                // and LevelObject agree on direction before swim resumes.
                if (this.flyingAI) {
                    const facing = this.currentFacingDirection >= 0 ? 1 : -1;
                    this.flyingAI.facingDirection = facing;
                    const yaw = facing < 0 ? Math.PI : 0;
                    this.flyingAI.currentYaw = yaw;
                    this.flyingAI.targetYaw = yaw;
                }
            }
            this.swimAIEnabled = true;
            this.gravityEnabled = false;
            // We set state to IDLE so the engine doesn't keep applying falling-state
            // physics; the AI drives position directly.
            if (falling) this.state = LEVEL_OBJECT_STATES.IDLE;

            // Swim loop. Missing animation is a no-op (returns false silently).
            this._ensureSwimAnimation();

            this.flyingAI.update(delta, level, dinoTarget);

            // The physics body may have been put to sleep by the idle-sleep path.
            // Re-sync its position to match the visual so pickup proximity checks
            // (which use the collision body) see the shark where it actually is.
            this._syncSwimBodyPosition();
        } else {
            // Out of water: swim AI off, gravity on, stop swim animation.
            // Falling under gravity is delegated to the base LevelObject update
            // path, which already handles ground contact, falling animation hooks
            // and idle settling.
            this.swimAIEnabled = false;
            if (this.activeInteractionAnimationName === 'walk-loop') {
                this.stopInteractionAnimation();
            }
            super.update(delta, level);
        }

        // Animation mixer tick — covers the swim case (super.update was skipped).
        if (inWater) this.updateInteractionAnimation(delta);

        this._logDebug(delta);
    }

    // Keep the Matter physics body in sync with the AI-driven visual position.
    // The normal idle-sleep path puts the body to sleep immediately after the
    // shark spawns (state=IDLE, gravityEnabled=false), then skips position
    // updates for sleeping bodies. We wake and reposition the body each swim
    // frame so pickup proximity checks always use the correct world position.
    _syncSwimBodyPosition() {
        const body = this.physicsWorld?.objectBodies?.get?.(this);
        if (!body || !this.physicsWorld?.Matter) return;
        const pos = this.container.position;
        if (body.isSleeping) {
            this.physicsWorld.Matter.Sleeping.set(body, false);
        }
        this.physicsWorld.Matter.Body.setPosition(body, { x: pos.x, y: pos.y });
        this.physicsWorld.Matter.Body.setVelocity(body, { x: this.velocity.x, y: this.velocity.y });
        if (this.physicsWorld._updateBodyAABB) {
            this.physicsWorld._updateBodyAABB(body);
        }
    }

    _ensureSwimAnimation() {
        // Only play walk-loop if it exists. We probe via animationClips so we
        // don't repeatedly call play() for a missing clip.
        if (!this.animationMixer) return;
        const clipName = 'walk-loop';
        if (!this.animationClips?.has?.(clipName)) return;
        if (this.activeInteractionAnimationName === clipName) return;
        this.playInteractionAnimationByName(clipName);
    }

    // Sharks always appear level — never inherit a tilted angle from physics.
    getVisualGroundAngle() {
        return 0;
    }

    // Before the carry system reads the sceneObject world quaternion, reset rotation
    // to what applyGroundAlignment produces so the carry offset and facing are correct.
    grab(dino, socket) {
        // Sync AI facingDirection → currentFacingDirection before grab so offsets
        // and rotation are consistent when the carry system reads them.
        if (this.flyingAI) {
            const facing = this.flyingAI.facingDirection >= 0 ? 1 : -1;
            if (facing !== (this.currentFacingDirection >= 0 ? 1 : -1)) {
                this.currentFacingDirection = facing;
            }
        }
        if (this.sceneObject) {
            const base = this.baseRotation ?? { x: 0, y: 0, z: 0 };
            const yaw = this.currentFacingDirection < 0 ? Math.PI : 0;
            this.sceneObject.rotation.set(base.x, base.y + yaw, base.z);
            this.sceneObject.updateMatrixWorld(true);
        }
        return super.grab(dino, socket);
    }

    // ── Damage / destruction ──────────────────────────────────────────────

    // Damage uses the inherited LevelObject pipeline (applyDamage → destroy on 0 HP).
    // We override destroy() to make sure swim AI stops cleanly and the shark drops
    // to physics so its corpse can sink / drift without the AI fighting it.
    destroy() {
        if (this.isDestroyed) return;
        this.swimAIEnabled = false;
        this._setWaterPolygon(null);
        // Let any carrier/dragger release us so the standard explosion path runs.
        if (this.carriedBy?.dropCarriedObject) this.carriedBy.dropCarriedObject();
        if (this.draggedBy?.releaseDraggedObject) this.draggedBy.releaseDraggedObject();
        super.destroy();
    }

    // ── Debug ─────────────────────────────────────────────────────────────

    _logDebug(delta) {
        if (!this._swimDebugEnabled) return;
        this._swimDebugTimer += delta;
        if (this._swimDebugTimer < SWIM_DEBUG_INTERVAL_SEC) return;
        this._swimDebugTimer = 0;
        const target = this.flyingAI?._hasPatrolTarget ? this.flyingAI.patrolTarget : null;
        console.log('Shark swim state', {
            objectId: this.id,
            inWater: Boolean(this.currentWaterPolygon),
            waterPolygonId: this.currentWaterPolygonId,
            swimAIEnabled: this.swimAIEnabled,
            target: target ? { x: target.x, y: target.y } : null,
            lifted: this.state === LEVEL_OBJECT_STATES.CARRIED || Boolean(this.carriedBy),
            state: this.state
        });
    }
}
