import * as THREE from 'three';
import { LEVEL_OBJECT_STATES } from './LevelObject.js';
import { TankObject } from './TankObject.js';
import { MissileLauncher } from './MissileProjectile.js';

const TMP_TARGET_WORLD = new THREE.Vector3();
const TMP_LAUNCH_WORLD = new THREE.Vector3();
const TMP_LAUNCH_OFFSET = new THREE.Vector3();
const TMP_LAUNCH_DIRECTION = new THREE.Vector3();

export class GroundSamObject extends TankObject {
    constructor(options) {
        super(options);
        this.pickupable = false;
        this.draggable = false;
        this.launchNode = null;
        this.missileConfig = this.getMissileConfig();
        this.missileCooldown = this.missileConfig.fireInterval;
        this.missileLauncher = null;
        this.missileCombatAwakened = false;
    }

    async load() {
        await super.load();
        this.pickupable = false;
        this.draggable = false;
        this.launchNode = this.findNamedNode('groundsam_canon') || this.cannonNode || null;
        if (this.missileConfig.enabled) {
            this.missileLauncher = new MissileLauncher(
                this.scene,
                this.missileConfig,
                this.loadingManager
            );
            await this.missileLauncher.load();
        }
        return this;
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

    getMissileConfig() {
        const missileConfig = this.config.missile || this.config.missiles || {};
        const launchOffset = Array.isArray(this.config.missileLaunchOffset)
            ? this.config.missileLaunchOffset
            : missileConfig.launchOffset;

        return {
            enabled: this.config.missilesEnabled !== false && missileConfig.enabled !== false,
            modelPath: this.config.missileModelPath || missileConfig.modelPath || './gfx/mesh/vehicles/missile.glb',
            texturePath: this.config.missileTexturePath || missileConfig.texturePath || './gfx/textures/vehicles/vehicles.webp',
            launchOffset: Array.isArray(launchOffset) ? launchOffset : [0, 1.1, 0],
            speed: Math.max(0.001, Number(this.config.missileSpeed ?? missileConfig.speed ?? 12)),
            acceleration: Math.max(0.001, Number(this.config.missileAcceleration ?? missileConfig.acceleration ?? 20)),
            maxTurnRate: Math.max(0, Number(this.config.missileMaxTurnRate ?? missileConfig.maxTurnRate ?? 2.5)),
            damageToDino: Math.max(0, Number(this.config.missileDamageToDino ?? missileConfig.damageToDino ?? 25)),
            lifetime: Math.max(0.05, Number(this.config.missileLifetime ?? missileConfig.lifetime ?? 5)),
            fireInterval: Math.max(0.05, Number(this.config.missileFireInterval ?? missileConfig.fireInterval ?? 2)),
            wakeFireDelay: Math.max(0, Number(this.config.missileWakeFireDelay ?? missileConfig.wakeFireDelay ?? 0.7)),
            hitRadius: Math.max(0, Number(this.config.missileHitRadius ?? missileConfig.hitRadius ?? 0.55)),
            modelScale: Math.max(0.001, Number(this.config.missileScale ?? missileConfig.scale ?? missileConfig.modelScale ?? 1)),
            initialSpeed: Math.max(0, Number(this.config.missileInitialSpeed ?? missileConfig.initialSpeed ?? 0)),
            fireRange: Math.max(0, Number(this.config.missileFireRange ?? missileConfig.fireRange ?? 30)),
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

    getDinoTargetWorld(dinoTarget, out = TMP_TARGET_WORLD) {
        const hitCircle = dinoTarget?.getWorldCollisionCircle?.();
        if (hitCircle && Number.isFinite(hitCircle.centerX) && Number.isFinite(hitCircle.centerY)) {
            out.set(hitCircle.centerX, hitCircle.centerY, this.container.position.z);
            return out;
        }

        if (dinoTarget?.getWorldPosition) {
            return dinoTarget.getWorldPosition(out);
        }

        return null;
    }

    getMissileLaunchWorldPosition(out = TMP_LAUNCH_WORLD) {
        const offset = this.missileConfig.launchOffset || [0, 1.1, 0];
        TMP_LAUNCH_OFFSET.set(
            Number.isFinite(offset[0]) ? offset[0] : 0,
            Number.isFinite(offset[1]) ? offset[1] : 1.1,
            Number.isFinite(offset[2]) ? offset[2] : 0
        );

        const launchFrom = this.launchNode || this.sceneObject;
        if (launchFrom) {
            launchFrom.updateWorldMatrix(true, false);
            out.copy(TMP_LAUNCH_OFFSET).applyMatrix4(launchFrom.matrixWorld);
        } else {
            out.copy(this.container.position).add(TMP_LAUNCH_OFFSET);
        }
        return out;
    }

    getMissileLaunchDirection(out = TMP_LAUNCH_DIRECTION) {
        out.set(0, 1, 0);
        return out;
    }

    updateMissileCombat(delta, dinoTarget) {
        if (
            !this.missileLauncher ||
            this.health <= 0 ||
            this.isDestroyed ||
            this.markedForRemoval
        ) {
            return;
        }

        if (!this.hasTakenDamage()) {
            return;
        }

        if (!this.missileCombatAwakened) {
            this.missileCombatAwakened = true;
            this.missileCooldown = this.missileConfig.wakeFireDelay;
        }

        this.missileCooldown = Math.max(0, this.missileCooldown - delta);
        if (this.missileCooldown > 0) {
            return;
        }

        const target = this.getDinoTargetWorld(dinoTarget, TMP_TARGET_WORLD);
        if (!target) {
            return;
        }

        const launchPosition = this.getMissileLaunchWorldPosition(TMP_LAUNCH_WORLD);
        const distanceToTarget = Math.hypot(
            target.x - launchPosition.x,
            target.y - launchPosition.y
        );
        if (this.missileConfig.fireRange > 0 && distanceToTarget > this.missileConfig.fireRange) {
            return;
        }

        this.missileLauncher.launch({
            position: launchPosition,
            direction: this.getMissileLaunchDirection(TMP_LAUNCH_DIRECTION),
            target: dinoTarget
        });
        this.missileCooldown = this.missileConfig.fireInterval;
    }

    updateTankCombat(delta, dinoTarget) {
        if (!this.loaded || this.state === LEVEL_OBJECT_STATES.DESTROYED) {
            return;
        }
        this.updateMissileCombat(delta, dinoTarget);
    }

    update(delta, level, dinoTarget = null) {
        super.update(delta, level, dinoTarget);
        if (this.missileLauncher?.hasActiveWork?.()) {
            this.missileLauncher.update(delta, dinoTarget);
        }
        this.alwaysUpdate = this.missileLauncher?.hasActiveWork?.() ?? false;
    }

    setProjectileRenderBand(band) {
        super.setProjectileRenderBand(band);
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
