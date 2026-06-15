import * as THREE from 'three';
import { LevelObject, LEVEL_OBJECT_STATES } from './LevelObject.js';
import { MissileLauncher } from './MissileProjectile.js';

const TMP_TARGET_DELTA = new THREE.Vector3();
const TMP_LAUNCH_OFFSET = new THREE.Vector3();
const TMP_LAUNCH_POSITION = new THREE.Vector3();
const TMP_LAUNCH_DIRECTION = new THREE.Vector3();

function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}

function randomInRange(min, max) {
    return min + (Math.random() * (max - min));
}

export class ChopperObject extends LevelObject {
    constructor(options) {
        super(options);

        // Choppers are airborne AI entities, not carry/drag gameplay objects.
        this.pickupable = false;
        this.draggable = false;

        this.patrolWidth = Math.max(0, Number(this.config.patrolWidth ?? 8));
        this.patrolHeight = Math.max(0, Number(this.config.patrolHeight ?? 5));
        this.moveSpeed = Math.max(0.001, Number(this.config.moveSpeed ?? 3));
        this.arriveThreshold = Math.max(0.01, Number(this.config.arriveThreshold ?? 0.2));
        this.acceleration = Math.max(0.001, Number(this.config.acceleration ?? (this.moveSpeed * 2.25)));
        this.damping = clamp01(Number(this.config.movementDamping ?? 0.98));

        this.patrolCenter = new THREE.Vector3();
        this.patrolTarget = new THREE.Vector3();
        this.destroyedFalling = false;
        this.mainRotorNode = null;
        this.tailRotorNode = null;
        this.mainRotorSpeed = Number.isFinite(this.config.mainRotorSpeed) ? this.config.mainRotorSpeed : 28;
        this.tailRotorSpeed = Number.isFinite(this.config.tailRotorSpeed) ? this.config.tailRotorSpeed : 42;
        this.mainRotorAxis = ['x', 'y', 'z'].includes(this.config.mainRotorAxis)
            ? this.config.mainRotorAxis
            : 'y';
        this.tailRotorAxis = ['x', 'y', 'z'].includes(this.config.tailRotorAxis)
            ? this.config.tailRotorAxis
            : 'z';
        this.facingDirection = Number(this.config.facingDirection) < 0 ? -1 : 1;
        this.turnMarginX = Math.max(0, Number(this.config.turnMarginX ?? 0.4));
        this.faceTargetRange = Math.max(0, Number(this.config.faceTargetRange ?? 16));
        this.turnSpeedY = Math.max(0.001, Number(this.config.turnSpeedY ?? 8));
        this.currentYaw = this.facingDirection < 0 ? Math.PI : 0;
        this.targetYaw = this.currentYaw;
        this.missileConfig = this.getMissileConfig();
        this.missileCooldown = this.missileConfig.fireInterval;
        this.missileLauncher = null;
    }

    async load() {
        await super.load();
        this.mainRotorNode = this.findNamedNode('heli_rotor');
        this.tailRotorNode = this.findNamedNode('heli_rotorback');
        if (this.missileConfig.enabled) {
            this.missileLauncher = new MissileLauncher(
                this.scene,
                this.missileConfig,
                this.loadingManager
            );
            await this.missileLauncher.load();
        }
        this.gravityEnabled = false;
        this.state = LEVEL_OBJECT_STATES.IDLE;
        this.patrolCenter.copy(this.container.position);
        this.selectNewPatrolTarget();
        this.applyFacingRotation(0, true);
        return this;
    }

    getMissileConfig() {
        const missileConfig = this.config.missile || this.config.missiles || {};
        const launchOffset = Array.isArray(this.config.missileLaunchOffset)
            ? this.config.missileLaunchOffset
            : missileConfig.launchOffset;

        return {
            enabled: this.config.missilesEnabled !== false && missileConfig.enabled !== false,
            modelPath: this.config.missileModelPath || missileConfig.modelPath || './gfx/mesh/vehicles/missile.glb',
            texturePath: this.config.missileTexturePath || missileConfig.texturePath || null,
            launchOffset: Array.isArray(launchOffset) ? launchOffset : [0, -0.8, 0],
            speed: Math.max(0.001, Number(this.config.missileSpeed ?? missileConfig.speed ?? 12)),
            acceleration: Math.max(0.001, Number(this.config.missileAcceleration ?? missileConfig.acceleration ?? 20)),
            maxTurnRate: Math.max(0, Number(this.config.missileMaxTurnRate ?? missileConfig.maxTurnRate ?? 2.5)),
            damageToDino: Math.max(0, Number(this.config.missileDamageToDino ?? missileConfig.damageToDino ?? 25)),
            lifetime: Math.max(0.05, Number(this.config.missileLifetime ?? missileConfig.lifetime ?? 5)),
            fireInterval: Math.max(0.05, Number(this.config.missileFireInterval ?? missileConfig.fireInterval ?? 2)),
            requiresDamage: this.config.missileRequiresDamage !== false && missileConfig.requiresDamage !== false,
            hitRadius: Math.max(0, Number(this.config.missileHitRadius ?? missileConfig.hitRadius ?? 0.55)),
            modelScale: Math.max(0.001, Number(this.config.missileScale ?? missileConfig.scale ?? missileConfig.modelScale ?? 1)),
            initialSpeed: Math.max(0, Number(this.config.missileInitialSpeed ?? missileConfig.initialSpeed ?? 0)),
            fireRange: Math.max(0, Number(this.config.missileFireRange ?? missileConfig.fireRange ?? this.faceTargetRange)),
            trailSpawnInterval: Math.max(0.005, Number(this.config.missileTrailSpawnInterval ?? missileConfig.trailSpawnInterval ?? 0.03)),
            trailParticleLifetime: Math.max(0.02, Number(this.config.missileTrailParticleLifetime ?? missileConfig.trailParticleLifetime ?? 0.35)),
            trailParticleScale: Math.max(0.001, Number(this.config.missileTrailParticleScale ?? missileConfig.trailParticleScale ?? 0.18)),
            trailSpread: Math.max(0, Number(this.config.missileTrailSpread ?? missileConfig.trailSpread ?? 0.08)),
            trailBackOffset: Number(this.config.missileTrailBackOffset ?? missileConfig.trailBackOffset ?? 0.9),
            trailVerticalOffset: Number(this.config.missileTrailVerticalOffset ?? missileConfig.trailVerticalOffset ?? -0.16),
            explosionParticleCount: Math.max(0, Math.floor(Number(this.config.missileExplosionParticleCount ?? missileConfig.explosionParticleCount ?? 10))),
            explosionLifetime: Math.max(0.02, Number(this.config.missileExplosionLifetime ?? missileConfig.explosionLifetime ?? 0.35)),
            explosionScale: Math.max(0.001, Number(this.config.missileExplosionScale ?? missileConfig.explosionScale ?? 0.6)),
            modelRotationOffset: Array.isArray(this.config.missileModelRotationOffset)
                ? this.config.missileModelRotationOffset
                : (Array.isArray(missileConfig.modelRotationOffset) ? missileConfig.modelRotationOffset : [0, 0, 0]),
            rootName: `${this.type}:${this.id}:missiles`
        };
    }

    findNamedNode(name) {
        if (!this.sceneObject || !name) {
            return null;
        }

        let found = null;
        this.sceneObject.traverse((child) => {
            if (found || !child?.isObject3D) {
                return;
            }
            if (child.name === name) {
                found = child;
            }
        });
        return found;
    }

    updateRotorSpin(delta) {
        if (this.health <= 0) {
            return;
        }

        if (this.mainRotorNode && Number.isFinite(this.mainRotorSpeed)) {
            this.mainRotorNode.rotation[this.mainRotorAxis] += this.mainRotorSpeed * delta;
        }
        if (this.tailRotorNode && Number.isFinite(this.tailRotorSpeed)) {
            this.tailRotorNode.rotation[this.tailRotorAxis] += this.tailRotorSpeed * delta;
        }
    }

    getDinoTargetWorld(target, out = new THREE.Vector3()) {
        const hitCircle = target?.getWorldCollisionCircle?.();
        if (hitCircle && Number.isFinite(hitCircle.centerX) && Number.isFinite(hitCircle.centerY)) {
            out.set(hitCircle.centerX, hitCircle.centerY, this.container.position.z);
            return out;
        }

        if (target?.getWorldPosition) {
            return target.getWorldPosition(out);
        }

        return null;
    }

    updateFacingTarget(target) {
        const targ = this.getDinoTargetWorld(target, TMP_TARGET_DELTA);
        if (!targ) {
            return;
        }
        const chopperX = this.container.position.x;
        const chopperY = this.container.position.y;
        const targetX = targ.x;
        const targetY = targ.y;
        const inRange = Math.hypot(targetX - chopperX, targetY - chopperY) <= this.faceTargetRange;
        if (!inRange) {
            return;
        }

        // Hysteresis margin:
        // - facing right: only switch to left when target passes x - margin
        // - facing left: only switch to right when target passes x + margin
        if (this.facingDirection > 0) {
            if (targetX < (chopperX - this.turnMarginX)) {
                this.facingDirection = -1;
                this.targetYaw = Math.PI;
            }
        } else if (targetX > (chopperX + this.turnMarginX)) {
            this.facingDirection = 1;
            this.targetYaw = 0;
        }
    }

    applyFacingRotation(delta, snap = false) {
        if (!this.sceneObject) {
            return;
        }

        if (snap || delta <= 0) {
            this.currentYaw = this.targetYaw;
        } else {
            const yawLerp = clamp01(this.turnSpeedY * delta);
            this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, yawLerp);
        }

        this.sceneObject.rotation.y = this.baseRotation.y + this.currentYaw;
        this.setFacingDirection(this.facingDirection);
        this.syncDebugCollisionShellTransform();
    }

    selectNewPatrolTarget() {
        const halfW = this.patrolWidth * 0.5;
        const halfH = this.patrolHeight * 0.5;
        this.patrolTarget.set(
            this.patrolCenter.x + randomInRange(-halfW, halfW),
            this.patrolCenter.y + randomInRange(-halfH, halfH),
            this.container.position.z
        );
    }

    updatePatrolMovement(delta) {
        TMP_TARGET_DELTA.copy(this.patrolTarget).sub(this.container.position);
        TMP_TARGET_DELTA.z = 0;

        const distance = TMP_TARGET_DELTA.length();
        if (distance <= this.arriveThreshold) {
            this.selectNewPatrolTarget();
            return;
        }

        const desiredDirection = TMP_TARGET_DELTA.normalize();
        const slowRadius = Math.max(this.arriveThreshold * 5, 0.8);
        const speedScale = clamp01(distance / slowRadius);
        const desiredSpeed = this.moveSpeed * speedScale;
        const desiredVelocityX = desiredDirection.x * desiredSpeed;
        const desiredVelocityY = desiredDirection.y * desiredSpeed;

        // Light accel/decel smoothing keeps patrol readable without robotic snapping.
        const velocityLerp = clamp01(this.acceleration * delta);
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, desiredVelocityX, velocityLerp);
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, desiredVelocityY, velocityLerp);
        this.velocity.x *= this.damping;
        this.velocity.y *= this.damping;

        this.container.position.x += this.velocity.x * delta;
        this.container.position.y += this.velocity.y * delta;
    }

    getMissileLaunchWorldPosition(out = TMP_LAUNCH_POSITION) {
        const offset = this.missileConfig.launchOffset || [0, -0.8, 0];
        TMP_LAUNCH_OFFSET.set(
            Number.isFinite(offset[0]) ? offset[0] : 0,
            Number.isFinite(offset[1]) ? offset[1] : -0.8,
            Number.isFinite(offset[2]) ? offset[2] : 0
        );

        if (this.sceneObject) {
            this.sceneObject.updateWorldMatrix(true, false);
            out.copy(TMP_LAUNCH_OFFSET).applyMatrix4(this.sceneObject.matrixWorld);
        } else {
            out.copy(this.container.position).add(TMP_LAUNCH_OFFSET);
        }
        return out;
    }

    getMissileLaunchDirection(out = TMP_LAUNCH_DIRECTION) {
        // Missiles launch in the chopper's facing direction. Homing can bend them later, but
        // the initial vector is intentionally simple and readable.
        out.set(this.facingDirection >= 0 ? 1 : -1, 0, 0);
        return out;
    }

    updateMissileCombat(delta, dinoTarget) {
        if (
            !this.missileLauncher ||
            (this.missileConfig.requiresDamage && !this.hasTakenDamage()) ||
            this.destroyedFalling ||
            this.health <= 0 ||
            this.isDestroyed ||
            this.markedForRemoval
        ) {
            return;
        }

        this.missileCooldown = Math.max(0, this.missileCooldown - delta);
        if (this.missileCooldown > 0) {
            return;
        }

        const target = this.getDinoTargetWorld(dinoTarget, TMP_TARGET_DELTA);
        if (!target) {
            return;
        }

        const distanceToTarget = Math.hypot(
            target.x - this.container.position.x,
            target.y - this.container.position.y
        );
        if (this.missileConfig.fireRange > 0 && distanceToTarget > this.missileConfig.fireRange) {
            return;
        }

        this.missileLauncher.launch({
            position: this.getMissileLaunchWorldPosition(TMP_LAUNCH_POSITION),
            direction: this.getMissileLaunchDirection(TMP_LAUNCH_DIRECTION),
            target: dinoTarget
        });
        this.missileCooldown = this.missileConfig.fireInterval;
    }

    destroy() {
        if (this.isDestroyed || this.destroyedFalling) {
            return;
        }

        if (this.carriedBy && typeof this.carriedBy.dropCarriedObject === 'function') {
            this.carriedBy.dropCarriedObject();
        }
        if (this.draggedBy && typeof this.draggedBy.releaseDraggedObject === 'function') {
            this.draggedBy.releaseDraggedObject();
        }

        // Chopper-specific destruction: do not explode immediately on health==0.
        // First transition to a falling wreck, then explode only after ground impact.
        this.health = 0;
        this.pickupable = false;
        this.draggable = false;
        this.destroyedFalling = true;
        this.gravityEnabled = true;
        this.state = LEVEL_OBJECT_STATES.FALLING;
        this.fallStartY = this.container.position.y;
        this.velocity.x *= 0.5;
        this.velocity.y = Math.min(this.velocity.y, -0.5);
        this.velocity.z = 0;
        this.angularVelocity = 0;
        this.updateWreckedMorph();
        this.updateHealthBarVisual();
    }

    onGroundImpact(impactSpeed, fallDistance, groundHeight) {
        if (!this.destroyedFalling) {
            return super.onGroundImpact(impactSpeed, fallDistance, groundHeight);
        }

        this.container.position.y = groundHeight;
        this.velocity.set(0, 0, 0);
        this.gravityEnabled = false;
        this.destroyedFalling = false;

        // Ground impact is the trigger point for the normal explosion/removal sequence.
        super.destroy();
    }

    update(delta, level, dinoTarget = null) {
        if (!this.loaded) {
            return;
        }

        this.updateRotorSpin(delta);
        this.updateHealthBarVisual();
        this.updateDestructionSequence(delta);
        this.missileLauncher?.update(delta, dinoTarget);
        this.alwaysUpdate = this.missileLauncher?.hasActiveWork?.() ?? false;
        if (this.markedForRemoval || this.isDestroyed) {
            return;
        }

        if (this.destroyedFalling || this.gravityEnabled) {
            // Falling wreck reuses shared gravity + ground-impact path from LevelObject.
            return super.update(delta, level);
        }

        // Alive airborne patrol mode.
        this.state = LEVEL_OBJECT_STATES.IDLE;
        this.gravityEnabled = false;
        this.updateFacingTarget(dinoTarget);
        this.applyFacingRotation(delta);
        this.updateMissileCombat(delta, dinoTarget);
        this.updatePatrolMovement(delta);
    }

    setProjectileRenderBand(band) {
        this.missileLauncher?.setProjectileRenderBand(band);
    }

    getActiveMissilesForCollision() {
        return this.missileLauncher?.getActiveMissilesForCollision?.() || [];
    }

    dispose() {
        this.missileLauncher?.dispose();
        this.missileLauncher = null;
        super.dispose();
    }
}
