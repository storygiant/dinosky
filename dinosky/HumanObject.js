import * as THREE from 'three';
import { LEVEL_OBJECT_STATES } from './LevelObject.js';
import { VehicleObject } from './VehicleObject.js';

const TMP_VECTOR = new THREE.Vector2();

function getFiniteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

function getRandomRangeNumber(value, fallback) {
    if (Number.isFinite(value)) {
        return value;
    }

    let min = null;
    let max = null;
    if (Array.isArray(value)) {
        min = value.find((entry) => Number.isFinite(entry));
        max = value.slice(1).find((entry) => Number.isFinite(entry));
    } else if (value && typeof value === 'object') {
        min = Number.isFinite(value.min) ? value.min : null;
        max = Number.isFinite(value.max) ? value.max : null;
    }

    if (!Number.isFinite(min) && !Number.isFinite(max)) {
        return fallback;
    }

    if (!Number.isFinite(min)) {
        min = max;
    }
    if (!Number.isFinite(max)) {
        max = min;
    }

    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return low + (Math.random() * (high - low));
}

function getRandomDuration(range, fallback) {
    if (!Array.isArray(range) || range.length < 2) {
        return Number.isFinite(fallback) ? fallback : 3;
    }
    const lo = Math.min(range[0], range[1]);
    const hi = Math.max(range[0], range[1]);
    return lo + Math.random() * (hi - lo);
}

// Max slope angle (radians) a non-slope-walking object will tolerate before turning.
const MAX_WALK_SLOPE_ANGLE = 0.35;

export class HumanObject extends VehicleObject {
    constructor(options) {
        super(options);

        // Always update humans so they can walk naturally when activated by aiActivationRange
        this.alwaysUpdate = true;

        const wb = this.config.walkingBehavior ?? {};

        const configuredDirection = Number.isFinite(this.config.walkDirection)
            ? this.config.walkDirection
            : (Number.isFinite(this.config.facingDirection)
                ? this.config.facingDirection
                : (Math.random() < 0.5 ? -1 : 1));
        this.walkDirection = configuredDirection >= 0 ? 1 : -1;

        // Speed — walkingBehavior takes precedence, flat config fields are the male fallback.
        this.walkSpeed = Math.max(0, getRandomRangeNumber(
            wb.walkSpeed ?? this.config.walkSpeed, 2.5
        ));
        this.walkAnimationSpeed = getFiniteNumber(this.config.walkAnimationSpeed, 1);
        this.runSpeed = Math.max(this.walkSpeed, getRandomRangeNumber(
            wb.runSpeed ?? this.config.runSpeed, this.walkSpeed * 2
        ));
        this.runAnimationSpeed = getFiniteNumber(this.config.runAnimationSpeed, 1);

        // Dino reaction — fleeRange maps to dinoReactDistance.
        // reactToDino: false disables it entirely.
        const reactToDino = wb.reactToDino !== false;
        this.fleeRange = reactToDino
            ? Math.max(0, getFiniteNumber(wb.dinoReactDistance ?? this.config.fleeRange, 40))
            : 0;
        this.fleeOnDinoProximity = wb.fleeOnDinoProximity === true || this.config.fleeOnDinoProximity === true;
        this.fleeTurnDelay = Math.max(0, getFiniteNumber(this.config.fleeTurnDelay, 0.45));
        this.fleeCorrectionTimer = 0;
        this.fleeDirectionLock = 0;

        // Running allowed only when config says so and run-loop exists (checked after load).
        // allowRun defaults true for backward compat with male.
        this.allowRun = wb.allowRun !== false && this.config.allowRun !== false;
        this.moveAwayFromDino = wb.moveAwayFromDino !== false;
        // For male (no walkingBehavior), moveAwayFromDino defaults true (existing flee).
        if (!this.config.walkingBehavior) {
            this.moveAwayFromDino = true;
        }
        this.canWalkSlope = wb.canWalkSlope !== false;
        this.idleOnSlopeAfterDrop = wb.idleOnSlopeAfterDrop === true;

        // Duration ranges for idle/walk state machine.
        this.idleDurationRange = wb.idleDurationRange ?? null;
        this.walkDurationRange = wb.walkDurationRange ?? null;
        this.walkActivationRange = Math.max(
            0,
            getFiniteNumber(
                wb.walkActivationRange
                    ?? this.config.walkActivationRange
                    ?? this.fleeRange,
                this.fleeRange
            )
        );
        this.aiActivationRange = Math.max(
            this.walkActivationRange,
            Math.max(
                0,
                getFiniteNumber(
                    wb.aiActivationRange
                        ?? this.config.aiActivationRange
                        ?? 150,
                    Math.max(this.walkActivationRange, 150)
                )
            )
        );

        // Smooth turn: rotate around Y axis over turnDuration seconds.
        this.turnDuration = Math.max(0, getFiniteNumber(wb.turnDuration ?? this.config.turnDuration, 0));
        this.turnElapsed = this.turnDuration; // Start complete.
        this._turnYaw = this.walkDirection < 0 ? Math.PI : 0;
        this._turnFromYaw = this._turnYaw;
        this._turnToYaw = this._turnYaw;

        // Walk state machine: 'idle' | 'walk' | 'runAway'
        this.walkState = 'walk';
        this.walkStateTimer = 0;
        this.isFleeing = false;

        // Available animations — resolved after load.
        this.availableAnimations = { idle: null, walk: null, run: null };

        this.locomotionAction = null;
        this.locomotionAnimationName = null;

        // Set after returning to idle following a non-idle state (e.g. drop).
        this._wasIdle = true;
        // Set when idleOnSlopeAfterDrop wants a forced idle period after settling.
        this._postDropIdleTimer = 0;
    }

    async load() {
        await super.load();

        // Resolve which animation clips actually exist — never assume.
        this.availableAnimations.idle = this.resolveAvailableAnimationName(['idle-loop']);
        this.availableAnimations.walk = this.resolveAvailableAnimationName(['walk-loop']);
        this.availableAnimations.run  = this.resolveAvailableAnimationName(['run-loop']);

        this.resetWalkingStateMachine();
        this.setFacingDirection(this.walkDirection);
        this.applyGroundAlignment();
        return this;
    }

    resolveAvailableAnimationName(candidates) {
        for (const name of candidates) {
            if (this.animationClips?.has(name)) {
                return name;
            }
        }
        return null;
    }

    canRun() {
        return this.allowRun && this.availableAnimations.run !== null;
    }

    // ── State machine ────────────────────────────────────────────────────────

    resetWalkingStateMachine() {
        // If no walk animation skip straight to idle (if available), else just walk.
        if (this.availableAnimations.walk) {
            this.walkState = 'walk';
            this.walkStateTimer = this.getNextWalkDuration();
        } else if (this.availableAnimations.idle) {
            this.walkState = 'idle';
            this.walkStateTimer = this.getNextIdleDuration();
        } else {
            this.walkState = 'walk';
            this.walkStateTimer = this.getNextWalkDuration();
        }
    }

    getNextIdleDuration() {
        return getRandomDuration(this.idleDurationRange, 5);
    }

    getNextWalkDuration() {
        return getRandomDuration(this.walkDurationRange, 4);
    }

    advanceWalkingStateMachine(delta) {
        if (this.walkState === 'runAway') {
            return; // Dino reaction overrides normal cycle; released in updateFleeState.
        }

        const safeDelta = Number.isFinite(delta) ? Math.max(delta, 0) : 0;
        this.walkStateTimer -= safeDelta;

        if (this.walkStateTimer > 0) {
            return;
        }

        if (this.walkState === 'idle') {
            // Idle finished → start walking (possibly change direction).
            if (Math.random() < 0.35) {
                this.walkDirection *= -1;
                this.setFacingDirection(this.walkDirection);
                this.applyGroundAlignment();
            }
            if (this.availableAnimations.walk) {
                this.walkState = 'walk';
                this.walkStateTimer = this.getNextWalkDuration();
            } else {
                // No walk clip — loop back to idle.
                this.walkStateTimer = this.getNextIdleDuration();
            }
        } else {
            // Walk finished → idle if animation exists, else keep walking.
            if (this.availableAnimations.idle) {
                this.walkState = 'idle';
                this.walkStateTimer = this.getNextIdleDuration();
            } else {
                this.walkStateTimer = this.getNextWalkDuration();
            }
        }
    }

    // ── Update ───────────────────────────────────────────────────────────────

    update(delta, level, dinoTarget = null, airTargets = []) {
        if (!this.loaded) {
            return;
        }

        if (this.timelineAnimationControlled) {
            this.stopLocomotionAnimation();
            this.updateFacingTurnAnimation(delta);
            this.updateInteractionAnimation(delta);
            this.updateHealthBarVisual();
            this.updateDestructionSequence(delta);
            return;
        }

        if (this.state !== LEVEL_OBJECT_STATES.IDLE || this.gravityEnabled) {
            this._wasIdle = false;
            const isFalling = this.state === LEVEL_OBJECT_STATES.FALLING;
            if (isFalling) {
                // Keep locomotion playing so the cow doesn't snap to T-pose mid-air.
                const animName = this.getLocomotionAnimationName();
                const animSpeed = this.getLocomotionAnimationSpeed();
                this.ensureLocomotionAnimation(animName, animSpeed);
            } else {
                this.stopLocomotionAnimation();
            }
            super.update(delta, level, dinoTarget, airTargets);
            return;  // No turn animation while carried/falling/grabbed.
        }

        // First frame back on the ground after being airborne/carried.
        if (!this._wasIdle) {
            this._wasIdle = true;
            this.resetWalkingStateMachine();
            // idleOnSlopeAfterDrop: brief settle pause so physics can stabilise before walking.
            if (this.idleOnSlopeAfterDrop && this.availableAnimations.idle) {
                this._postDropIdleTimer = 1.5;
                this.walkState = 'idle';
                this.walkStateTimer = this._postDropIdleTimer;
            }
        }

        if (!this.isDinoWithinAiActivationRange(dinoTarget)) {
            this._lastDinoTarget = null;
            this.isFleeing = false;
            this.fleeDirectionLock = 0;
            this.fleeCorrectionTimer = 0;
            if (this.walkState === 'runAway') {
                this.walkState = 'walk';
                this.walkStateTimer = this.getNextWalkDuration();
            }
            // Only advance state machine, no movement or animation updates when dino is far away
            this.advanceWalkingStateMachine(delta);
            this.velocity.set(0, 0, 0);
            this.stopLocomotionAnimation();
            this.updateHealthBarVisual();
            this.updateDestructionSequence(delta);
            return;
        }

        this._lastDinoTarget = dinoTarget;
        this.updateFleeState(delta, level, dinoTarget);

        const isMoving = this.walkState !== 'idle' && !this._postDropIdleTimer;
        const animName = this.getLocomotionAnimationName();
        const animSpeed = this.getLocomotionAnimationSpeed();
        this.ensureLocomotionAnimation(animName, animSpeed);

        this.updateFacingTurnAnimation(delta);
        this.updateInteractionAnimation(delta);
        this.updateHealthBarVisual();
        this.updateDestructionSequence(delta);

        if (this.markedForRemoval || this.isDestroyed || this.state === LEVEL_OBJECT_STATES.DESTROYED) {
            this.stopLocomotionAnimation();
            return;
        }

        // Count down post-drop idle timer.
        if (this._postDropIdleTimer > 0) {
            const safeDelta = Number.isFinite(delta) ? Math.max(delta, 0) : 0;
            this._postDropIdleTimer = Math.max(0, this._postDropIdleTimer - safeDelta);
        }

        if (isMoving) {
            this.updateGroundWalk(delta, level);
        } else {
            this.velocity.set(0, 0, 0);
            this.advanceWalkingStateMachine(delta);
        }
    }

    getLocomotionAnimationName() {
        if (this.walkState === 'runAway' && this.canRun()) {
            return this.availableAnimations.run;
        }
        if (this.walkState === 'idle' || this._postDropIdleTimer > 0) {
            return this.availableAnimations.idle ?? this.availableAnimations.walk;
        }
        return this.availableAnimations.walk;
    }

    getLocomotionAnimationSpeed() {
        if (this.walkState === 'runAway' && this.canRun()) {
            return this.runAnimationSpeed;
        }
        return this.walkAnimationSpeed;
    }

    // ── Animations ───────────────────────────────────────────────────────────

    ensureLocomotionAnimation(animationName, timeScale = 1) {
        if (!this.animationMixer || this.activeInteractionAnimationAction) {
            this.stopLocomotionAnimation();
            return false;
        }

        if (!animationName) {
            this.stopLocomotionAnimation();
            return false;
        }

        const clip = this.animationClips.get(animationName);
        if (!clip) {
            this.stopLocomotionAnimation();
            return false;
        }

        if (this.locomotionAnimationName !== animationName) {
            this.stopLocomotionAnimation();
        }

        if (!this.locomotionAction) {
            this.locomotionAction = this.animationMixer.clipAction(clip);
            this.locomotionAction.setLoop(THREE.LoopRepeat, Infinity);
            this.locomotionAction.clampWhenFinished = false;
            this.locomotionAnimationName = animationName;
        }

        this.locomotionAction.enabled = true;
        this.locomotionAction.setEffectiveTimeScale(timeScale);

        if (!this.locomotionAction.isRunning()) {
            this.locomotionAction.reset();
            this.locomotionAction.play();
        }

        return true;
    }

    stopLocomotionAnimation() {
        if (!this.locomotionAction) {
            return;
        }

        this.locomotionAction.stop();
        this.locomotionAction = null;
        this.locomotionAnimationName = null;
    }

    // ── Facing / turn animation ───────────────────────────────────────────────

    getFacingYawOffset() {
        return this._turnYaw;
    }

    applyGroundAlignment() {
        super.applyGroundAlignment();
        if (this.sceneObject) {
            this.sceneObject.scale.setScalar(this.scale);
        }
    }

    setFacingDirection(direction, options = {}) {
        if (!Number.isFinite(direction) || direction === 0) {
            return;
        }

        const nextFacing = direction >= 0 ? 1 : -1;
        const prevFacing = this.currentFacingDirection >= 0 ? 1 : -1;
        const nextYaw = nextFacing < 0 ? Math.PI : 0;

        super.setFacingDirection(nextFacing, options);

        if (nextFacing === prevFacing) {
            return;
        }

        if (this.turnDuration <= 0 || options.snap === true) {
            this._turnYaw = nextYaw;
            this._turnFromYaw = nextYaw;
            this._turnToYaw = nextYaw;
            this.turnElapsed = this.turnDuration;
            return;
        }

        this._turnFromYaw = this._turnYaw;
        this._turnToYaw = nextYaw;
        this.turnElapsed = 0;
    }

    snapTurnToFacing() {
        const targetYaw = this.currentFacingDirection < 0 ? Math.PI : 0;
        this._turnYaw = targetYaw;
        this._turnFromYaw = targetYaw;
        this._turnToYaw = targetYaw;
        this.turnElapsed = this.turnDuration;
        this.applyGroundAlignment();
    }

    onCarryFacingFlipped(newFacingDirection) {
        super.onCarryFacingFlipped(newFacingDirection);
        // Keep _turnYaw in sync so getFacingYawOffset() reflects the new carry-facing.
        const yaw = (newFacingDirection >= 0 ? 1 : -1) < 0 ? Math.PI : 0;
        this._turnYaw = yaw;
        this._turnFromYaw = yaw;
        this._turnToYaw = yaw;
        this.turnElapsed = this.turnDuration;
    }

    updateFacingTurnAnimation(delta) {
        if (!this.sceneObject) {
            return;
        }

        if (this.turnElapsed >= this.turnDuration || this.turnDuration <= 0) {
            return;
        }

        const safeDelta = Number.isFinite(delta) ? Math.max(delta, 0) : 0;
        this.turnElapsed = Math.min(this.turnElapsed + safeDelta, this.turnDuration);
        const t = this.turnElapsed / this.turnDuration;

        // Always rotate forward (face dips toward the camera) — force the negative arc.
        let delta_yaw = this._turnToYaw - this._turnFromYaw;
        if (delta_yaw >= 0) delta_yaw -= Math.PI * 2;
        this._turnYaw = this._turnFromYaw + delta_yaw * t;

        this.applyGroundAlignment();
    }

    // ── Flee / dino reaction ────────────────────────────────────────────────

    isDinoWithinAiActivationRange(dinoTarget) {
        if (this.aiActivationRange <= 0) return false;
        const dinoPosition = this.getDinoPosition(dinoTarget);
        if (!dinoPosition) return false;
        const dx = dinoPosition.x - this.container.position.x;
        const dy = dinoPosition.y - this.container.position.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
        return (dx * dx + dy * dy) <= (this.aiActivationRange * this.aiActivationRange);
    }

    isDinoNearForWalkActivation(dinoTarget) {
        if (this.walkActivationRange <= 0) return false;
        const dinoPosition = this.getDinoPosition(dinoTarget);
        if (!dinoPosition) return false;
        const dx = dinoPosition.x - this.container.position.x;
        const dy = dinoPosition.y - this.container.position.y;
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
        if (Math.abs(dy) > 4) return false;
        return Math.abs(dx) <= this.walkActivationRange;
    }

    updateFleeState(delta, level, dinoTarget) {
        const dinoPosition = this.getDinoPosition(dinoTarget);

        const stopFleeing = () => {
            if (this.isFleeing) {
                this.isFleeing = false;
                this.fleeDirectionLock = 0;
                this.walkState = 'walk';
                this.walkStateTimer = this.getNextWalkDuration();
                this.fleeCorrectionTimer = 0;
            }
        };

        if (!dinoPosition || this.fleeRange <= 0) {
            stopFleeing();
            return;
        }

        const dx = dinoPosition.x - this.container.position.x;
        const dy = dinoPosition.y - this.container.position.y;

        // Condition 3: dino must be on the ground (not airborne).
        const groundThreshold = (level?.tileHeight ?? 2) * 0.75;
        if (dy > groundThreshold) {
            stopFleeing();
            return;
        }

        // Condition 1: dino in range.
        const inRange = (dx * dx + dy * dy) <= (this.fleeRange * this.fleeRange);
        if (!inRange) {
            stopFleeing();
            return;
        }

        // Condition 2: dino facing toward the cow (dinoFacing * dx < 0 means facing our way).
        const dinoFacing = dinoTarget?.lastFacingDirection >= 0 ? 1 : -1;
        const dinoFacingCow = dinoFacing * dx < 0;

        // Condition 4: cow facing the dino (walkDirection toward dino).
        const cowFacingDino = this.walkDirection * dx > 0;

        const shouldFleeFromFacingThreat = dinoFacingCow && cowFacingDino;
        const shouldFleeFromProximity = this.fleeOnDinoProximity;

        if (!shouldFleeFromFacingThreat && !shouldFleeFromProximity) {
            // Dino not threatening — stop fleeing but don't turn back if already fleeing away.
            stopFleeing();
            return;
        }

        const wasFleeing = this.isFleeing;
        this.isFleeing = true;

        if (this.moveAwayFromDino) {
            this.walkState = 'runAway';
            const desiredDirection = dx >= 0 ? -1 : 1;
            if (!wasFleeing || this.fleeDirectionLock === 0 || this.fleeDirectionLock !== desiredDirection) {
                this.fleeDirectionLock = desiredDirection;
                this.fleeCorrectionTimer = 0;
            }
            const fleeDirection = this.fleeDirectionLock || desiredDirection;
            if (this.walkDirection === fleeDirection) {
                if (this.fleeCorrectionTimer > 0) {
                    const safeDelta = Number.isFinite(delta) ? Math.max(delta, 0) : 0;
                    this.fleeCorrectionTimer = Math.max(0, this.fleeCorrectionTimer - safeDelta);
                }
                return;
            }

            if (this.fleeCorrectionTimer > 0) {
                const safeDelta = Number.isFinite(delta) ? Math.max(delta, 0) : 0;
                this.fleeCorrectionTimer = Math.max(0, this.fleeCorrectionTimer - safeDelta);
                return;
            }

            // Turn away from the dino (preserve new direction so we never face it again
            // while it stays in range and facing us).
            this.turnAround(level, { delayFleeCorrection: true, preserveDirection: false });
        }
    }

    getDinoPosition(dinoTarget) {
        const position = dinoTarget?.position || dinoTarget?.mesh?.position || null;
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
            return null;
        }

        return position;
    }

    getCurrentMoveSpeed() {
        return this.walkState === 'runAway' && this.canRun() ? this.runSpeed : this.walkSpeed;
    }

    // ── Sound ─────────────────────────────────────────────────────────────────

    getPickupSoundNames() {
        const pickupSounds = Array.isArray(this.config?.pickupSounds)
            ? this.config.pickupSounds
            : [];
        return pickupSounds
            .map((soundUrl, index) => (typeof soundUrl === 'string' && soundUrl.trim()
                ? `objectPickup:${this.type}:${index}`
                : null))
            .filter(Boolean);
    }

    playPickupStartSound() {
        const soundNames = this.getPickupSoundNames();
        if (!soundNames.length) {
            return;
        }

        this.audioManager?.playRandom?.(soundNames, {
            volume: 0.82,
            detune: (Math.random() * 50) - 25,
            cooldown: 0.2
        });
    }

    pickUp(dino, socket, options = {}) {
        const didPickUp = super.pickUp(dino, socket, options);
        if (didPickUp) {
            this.snapTurnToFacing();
            this.playPickupStartSound();
        }
        return didPickUp;
    }

    grab(dino, socket) {
        const didGrab = super.grab(dino, socket);
        if (didGrab) {
            this.snapTurnToFacing();
            this.playPickupStartSound();
        }
        return didGrab;
    }

    startDrag(dino, grabPointName) {
        const didStartDrag = super.startDrag(dino, grabPointName);
        if (didStartDrag) {
            this.playPickupStartSound();
        }
        return didStartDrag;
    }

    // ── Walking ───────────────────────────────────────────────────────────────

    updateGroundWalk(delta, level) {
        const moveSpeed = this.getCurrentMoveSpeed();
        if (!level?.getGroundInfoAtWorld || moveSpeed <= 0 || !Number.isFinite(delta) || delta <= 0) {
            this.velocity.set(0, 0, 0);
            return;
        }

        this.sleeping = false;
        this.grounded = true;
        this.gravityEnabled = false;
        this.angularVelocity = 0;

        const totalDeltaX = this.walkDirection * moveSpeed * delta;
        const stepCount = Math.max(1, Math.ceil(Math.abs(totalDeltaX) / this.getWalkCollisionStepSize(level)));
        const stepDeltaX = totalDeltaX / stepCount;
        let moved = false;

        for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
            if (!this.tryWalkStep(stepDeltaX, level)) {
                this.turnAround(level, { delayFleeCorrection: this.isFleeing });
                break;
            }

            moved = true;
        }

        this.velocity.x = moved ? this.walkDirection * moveSpeed : 0;
        this.velocity.y = 0;
        this.velocity.z = 0;

        this.advanceWalkingStateMachine(delta);

        this.tryFinalizePendingDestroy();
    }

    getWalkCollisionStepSize(level) {
        const tileSize = Math.min(level?.tileWidth ?? 1, level?.tileHeight ?? 1);
        return Math.max(0.15, tileSize * 0.35);
    }

    tryWalkStep(deltaX, level) {
        const currentProbeY = this.getBodyGroundProbeY(level, this.container.position.y);
        const currentSupport = this.resolveBodyGroundSupport(level, currentProbeY, this.currentGroundAngle);
        if (!currentSupport) {
            return false;
        }

        const candidateX = this.container.position.x + deltaX;
        const candidateSupport = this.resolveWalkingSupportAt(level, candidateX, currentProbeY, this.currentGroundAngle);
        if (!candidateSupport || !this.canStepToSupport(level, currentSupport, candidateSupport)) {
            return false;
        }

        const targetAngle = this.getGroundAngleForFacing(candidateSupport.angle ?? 0, this.walkDirection);

        // Slope-aware turning: refuse steps onto or toward steep ground.
        if (!this.canWalkSlope) {
            if (Math.abs(candidateSupport.angle ?? 0) > MAX_WALK_SLOPE_ANGLE) {
                return false;
            }
            // Also probe one body-width ahead so the cow turns before reaching the slope.
            const lookAheadX = candidateX + this.walkDirection * (this.bodyHalfExtents.x * 2);
            const lookAheadSupport = this.resolveWalkingSupportAt(level, lookAheadX, currentProbeY, this.currentGroundAngle);
            if (lookAheadSupport && Math.abs(lookAheadSupport.angle ?? 0) > MAX_WALK_SLOPE_ANGLE) {
                return false;
            }
        }

        const settledProbeY = Math.max(
            currentProbeY,
            this.getBodyGroundProbeY(level, candidateSupport.anchorY, targetAngle)
        );
        const settledSupport =
            this.resolveWalkingSupportAt(level, candidateX, settledProbeY, targetAngle) ||
            candidateSupport;

        if (!this.hasGroundAhead(level, candidateX, settledSupport, targetAngle) ||
            this.isBodyBlockedAt(level, candidateX, settledSupport.anchorY, targetAngle)) {
            return false;
        }

        this.container.position.x = candidateX;
        this.container.position.y = settledSupport.anchorY;
        this.currentGroundAngle = targetAngle;
        this.setFacingDirection(this.walkDirection);
        this.applyGroundAlignment();
        this.physicsWorld?.syncBodyFromLevelObject?.(this);
        return true;
    }

    resolveWalkingSupportAt(level, x, probeY, rotation) {
        const previousX = this.container.position.x;
        this.container.position.x = x;
        const support = this.resolveBodyGroundSupport(level, probeY, rotation);
        this.container.position.x = previousX;
        return support;
    }

    canStepToSupport(level, currentSupport, candidateSupport) {
        if (!currentSupport || !candidateSupport) {
            return false;
        }

        const maxStepDownTiles = Math.max(0, getFiniteNumber(this.config.walkMaxStepDownTiles, 1));
        const maxStepDown = (level?.tileHeight ?? 1) * maxStepDownTiles;
        const dropDistance = currentSupport.supportSurfaceHeight - candidateSupport.supportSurfaceHeight;
        return dropDistance <= maxStepDown + 0.0001;
    }

    hasGroundAhead(level, candidateX, support, rotation) {
        if (!level?.getGroundInfoAtWorld || !support) {
            return false;
        }

        const tileWidth = Math.max(level.tileWidth ?? 1, 0.001);
        const lookAhead = Math.max(
            getFiniteNumber(this.config.walkLookAhead, tileWidth * 0.25),
            this.bodyHalfExtents.x * 0.25
        );
        const frontLocalX = this.bodyOffset.x + (this.walkDirection * this.bodyHalfExtents.x);
        const sampleX = candidateX + frontLocalX + (this.walkDirection * lookAhead);
        const probeY = this.getBodyGroundProbeY(level, support.anchorY, rotation);
        const groundInfo = level.getGroundInfoAtWorld(sampleX, probeY);
        if (!groundInfo) {
            return false;
        }

        const maxStepDownTiles = Math.max(0, getFiniteNumber(this.config.walkMaxStepDownTiles, 1));
        const maxStepDown = (level?.tileHeight ?? 1) * maxStepDownTiles;
        const dropDistance = support.supportSurfaceHeight - groundInfo.surfaceHeight;
        return dropDistance <= maxStepDown + 0.0001;
    }

    isBodyBlockedAt(level, candidateX, candidateY, rotation) {
        if (!level?.isBlockedAtWorld) {
            return false;
        }

        const frontX = this.bodyOffset.x + (this.walkDirection * this.bodyHalfExtents.x);
        const insetX = this.bodyHalfExtents.x * 0.35;
        const samplePoints = [
            new THREE.Vector2(frontX, this.bodyOffset.y + (this.bodyHalfExtents.y * 0.15)),
            new THREE.Vector2(frontX, this.bodyOffset.y + (this.bodyHalfExtents.y * 0.55)),
            new THREE.Vector2(frontX, this.bodyOffset.y + (this.bodyHalfExtents.y * 0.9)),
            new THREE.Vector2(this.bodyOffset.x + (this.walkDirection * insetX), this.bodyOffset.y + (this.bodyHalfExtents.y * 0.9))
        ];

        for (const point of samplePoints) {
            this.getRotatedLocalPointAtAngle(point, rotation, TMP_VECTOR);
            const sampleX = candidateX + TMP_VECTOR.x;
            const sampleY = candidateY + this.baseGroundOffset + TMP_VECTOR.y;
            if (level.isBlockedAtWorld(sampleX, sampleY)) {
                return true;
            }
        }

        return false;
    }

    turnAround(level, options = {}) {
        if (!options.preserveDirection) {
            const newDirection = this.walkDirection * -1;

            // Don't turn if doing so would face the cow toward a threatening grounded dino.
            if (this._lastDinoTarget) {
                const dinoPos = this.getDinoPosition(this._lastDinoTarget);
                if (dinoPos) {
                    const dx = dinoPos.x - this.container.position.x;
                    const dy = dinoPos.y - this.container.position.y;
                    const groundThreshold = (level?.tileHeight ?? 2) * 0.75;
                    const dinoGrounded = dy <= groundThreshold;
                    const dinoFacing = this._lastDinoTarget?.lastFacingDirection >= 0 ? 1 : -1;
                    const dinoFacingCow = dinoFacing * dx < 0;
                    const inRange = (dx * dx + dy * dy) <= (this.fleeRange * this.fleeRange);
                    const wouldFaceDino = newDirection * dx > 0;

                    if (dinoGrounded && dinoFacingCow && inRange && wouldFaceDino) {
                        // Turning would face the dino — go idle instead of looping.
                        this.velocity.set(0, 0, 0);
                        this.angularVelocity = 0;
                        if (this.availableAnimations.idle) {
                            this.walkState = 'idle';
                            this.walkStateTimer = this.getNextIdleDuration();
                        }
                        return;
                    }
                }
            }

            this.walkDirection = newDirection;
        }
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.setFacingDirection(this.walkDirection);
        if (options.delayFleeCorrection && this.fleeTurnDelay > 0) {
            this.fleeCorrectionTimer = this.fleeTurnDelay;
        }
    }
}
