import * as THREE from 'three';
import { LevelObject, LEVEL_OBJECT_STATES } from './LevelObject.js';
import { MissileLauncher } from './MissileProjectile.js';
import { CONFIG } from './config.js';

const TMP_TARGET_DELTA = new THREE.Vector3();
const TMP_LAUNCH_OFFSET = new THREE.Vector3();
const TMP_LAUNCH_POSITION = new THREE.Vector3();
const TMP_LAUNCH_DIRECTION = new THREE.Vector3();
const TMP_LOCAL = new THREE.Vector3();

function clamp01(v) { return THREE.MathUtils.clamp(v, 0, 1); }
function randomInRange(min, max) { return min + Math.random() * (max - min); }

const BOB_AMPLITUDE = 0.18;
const BOB_SPEED     = 0.55;

export class ZeppelinObject extends LevelObject {
    constructor(options) {
        super(options);

        this.pickupable = this.config.pickupable ?? true;
        this.draggable  = this.config.draggable  ?? false;

        this.moveSpeed        = Math.max(0.001, Number(this.config.moveSpeed        ?? 4));

        this.facingDirection  = Number(this.config.facingDirection) < 0 ? -1 : 1;
        this.turnMarginX      = Math.max(0,     Number(this.config.turnMarginX      ?? 2));
        this.faceTargetRange  = Math.max(0,     Number(this.config.faceTargetRange  ?? 20));
        this.turnSpeedY       = Math.max(0.001, Number(this.config.turnSpeedY       ?? 2.5));
        this.currentYaw       = this.facingDirection < 0 ? Math.PI : 0;
        this.targetYaw        = this.currentYaw;

        this.destroyedFalling = false;
        this._levelBoundsLeft  = null;
        this._levelBoundsRight = null;

        this.alwaysUpdate = true;
        this.frameDeltaX = 0;
        this.frameDeltaY = 0;
        this._prevX = 0;
        this._prevY = 0;

        this._deckProfile  = [];
        this._deckDebugLine = null;

        this.missileConfig   = this._getMissileConfig();
        this.missileCooldown = this.missileConfig.fireInterval;
        this.missileLauncher = null;
    }

    _getMissileConfig() {
        const mc = this.config.missile || this.config.missiles || {};
        const launchOffset = Array.isArray(this.config.missileLaunchOffset)
            ? this.config.missileLaunchOffset
            : mc.launchOffset;
        return {
            enabled:                   (this.config.missilesEnabled !== false) && (mc.enabled !== false),
            modelPath:                 this.config.missileModelPath   || mc.modelPath   || './gfx/mesh/vehicles/missile.glb',
            texturePath:               this.config.missileTexturePath || mc.texturePath || null,
            launchOffset:              Array.isArray(launchOffset) ? launchOffset : [0, -0.8, 0],
            speed:                     Math.max(0.001, Number(this.config.missileSpeed            ?? mc.speed            ?? 12)),
            acceleration:              Math.max(0.001, Number(this.config.missileAcceleration     ?? mc.acceleration     ?? 20)),
            maxTurnRate:               Math.max(0,     Number(this.config.missileMaxTurnRate      ?? mc.maxTurnRate      ?? 2.5)),
            damageToDyno:            Math.max(0,     Number(this.config.missileDamageToDyno   ?? mc.damageToDyno   ?? 25)),
            lifetime:                  Math.max(0.05,  Number(this.config.missileLifetime         ?? mc.lifetime         ?? 5)),
            fireInterval:              Math.max(0.05,  Number(this.config.missileFireInterval     ?? mc.fireInterval     ?? 4)),
            requiresDamage:            this.config.missileRequiresDamage !== false && mc.requiresDamage !== false,
            hitRadius:                 Math.max(0,     Number(this.config.missileHitRadius        ?? mc.hitRadius        ?? 0.55)),
            modelScale:                Math.max(0.001, Number(this.config.missileScale            ?? mc.scale ?? mc.modelScale ?? 1)),
            initialSpeed:              Math.max(0,     Number(this.config.missileInitialSpeed     ?? mc.initialSpeed     ?? 0)),
            fireRange:                 Math.max(0,     Number(this.config.missileFireRange        ?? mc.fireRange        ?? this.faceTargetRange)),
            trailSpawnInterval:        Math.max(0.005, Number(this.config.missileTrailSpawnInterval    ?? mc.trailSpawnInterval    ?? 0.03)),
            trailParticleLifetime:     Math.max(0.02,  Number(this.config.missileTrailParticleLifetime ?? mc.trailParticleLifetime ?? 0.35)),
            trailParticleScale:        Math.max(0.001, Number(this.config.missileTrailParticleScale    ?? mc.trailParticleScale    ?? 0.18)),
            trailSpread:               Math.max(0,     Number(this.config.missileTrailSpread      ?? mc.trailSpread      ?? 0.08)),
            trailBackOffset:           Number(this.config.missileTrailBackOffset     ?? mc.trailBackOffset     ?? 0.9),
            trailVerticalOffset:       Number(this.config.missileTrailVerticalOffset ?? mc.trailVerticalOffset ?? -0.16),
            explosionParticleCount:    Math.max(0, Math.floor(Number(this.config.missileExplosionParticleCount ?? mc.explosionParticleCount ?? 10))),
            explosionLifetime:         Math.max(0.02,  Number(this.config.missileExplosionLifetime  ?? mc.explosionLifetime  ?? 0.35)),
            explosionScale:            Math.max(0.001, Number(this.config.missileExplosionScale     ?? mc.explosionScale     ?? 0.6)),
            modelRotationOffset:       Array.isArray(this.config.missileModelRotationOffset) ? this.config.missileModelRotationOffset
                                        : (Array.isArray(mc.modelRotationOffset) ? mc.modelRotationOffset : [0, 0, 0]),
            rootName: `${this.type}:${this.id}:missiles`
        };
    }

    async load() {
        await super.load();
        if (this.missileConfig.enabled) {
            this.missileLauncher = new MissileLauncher(this.scene, this.missileConfig, this.loadingManager);
            await this.missileLauncher.load();
        }

        this._deckProfile = this._buildDeckProfileFromConfig();

        if (CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours) {
            this._setupDeckDebugLine();
        }

        this.gravityEnabled = false;
        this.state = LEVEL_OBJECT_STATES.IDLE;
        this._applyFacingYaw(0, true);
        return this;
    }

    // Read deckPolygon from config in model-local units at modelScale 1.
    // Falls back to the upper half of collisionPolygon when deckPolygon is absent.
    // No manual scaling needed — sceneObject.matrixWorld already encodes modelScale.
    _buildDeckProfileFromConfig() {
        const rawDeck = this.config.deckPolygon;
        if (Array.isArray(rawDeck) && rawDeck.length >= 2) {
            return rawDeck.map(([x, y]) => ({ x, y }));
        }

        const rawHull = this.config.collisionPolygon;
        if (!Array.isArray(rawHull) || rawHull.length < 2) return [];
        // Extract upper-half points: find the highest and lowest Y in the polygon,
        // then keep only points in the top half.
        const pts = rawHull.map(([x, y]) => ({ x, y }));
        let minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        const midY = (minY + maxY) * 0.5;
        return pts.filter((p) => p.y >= midY);
    }

    _setupDeckDebugLine() {
        const count = this._deckProfile.length;
        if (count < 2) return;

        const positions = new Float32Array(count * 3);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);

        const line = new THREE.Line(
            geometry,
            new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, depthWrite: false, toneMapped: false })
        );
        line.name = `ZeppelinDeckDebug:${this.id}`;
        line.renderOrder = 1000004;
        line.frustumCulled = false;
        this.scene.add(line);
        this._deckDebugLine = line;
    }

    _updateDeckDebugLine(worldPoints) {
        if (!this._deckDebugLine || !worldPoints?.length) return;
        const attr = this._deckDebugLine.geometry.attributes.position;
        const z = (this.container?.position?.z ?? 0) + 0.5;
        for (let i = 0; i < worldPoints.length; i++) {
            attr.setXYZ(i, worldPoints[i].x, worldPoints[i].y, z);
        }
        attr.needsUpdate = true;
        this._deckDebugLine.geometry.setDrawRange(0, worldPoints.length);
    }

    getDynoTargetWorld(dynoTarget, out = new THREE.Vector3()) {
        const hitCircle = dynoTarget?.getWorldCollisionCircle?.();
        if (hitCircle && Number.isFinite(hitCircle.centerX) && Number.isFinite(hitCircle.centerY)) {
            out.set(hitCircle.centerX, hitCircle.centerY, this.container.position.z);
            return out;
        }
        if (dynoTarget?.getWorldPosition) return dynoTarget.getWorldPosition(out);
        return null;
    }

    selectNewPatrolTarget() {
        const halfW = this.patrolWidth  * 0.5;
        const halfH = this.patrolHeight * 0.5;
        this.patrolTarget.set(
            this.patrolCenter.x + randomInRange(-halfW, halfW),
            this.patrolCenter.y + randomInRange(-halfH, halfH),
            this.container.position.z
        );
    }

    _updateFacingTarget(dynoTarget) {
        const target = this.getDynoTargetWorld(dynoTarget, TMP_TARGET_DELTA);
        if (!target) return;
        const zx = this.container.position.x;
        if (Math.hypot(target.x - zx, target.y - this.container.position.y) > this.faceTargetRange) return;
        if (this.facingDirection > 0) {
            if (target.x < (zx - this.turnMarginX)) { this.facingDirection = -1; this.targetYaw = Math.PI; }
        } else if (target.x > (zx + this.turnMarginX)) {
            this.facingDirection = 1; this.targetYaw = 0;
        }
    }

    _updatePatrol(delta, level) {
        // Cache level bounds once.
        if (this._levelBoundsLeft === null && level) {
            this._levelBoundsLeft  = level.worldOriginX ?? 0;
            this._levelBoundsRight = this._levelBoundsLeft + (level.width ?? 0) * (level.tileWidth ?? 2);
        }
        if (this._levelBoundsLeft === null) return;

        // Body AABB half-width — how far past the level edge we wait before turning.
        const aabb = this.matterBody?.plugin?.aabb;
        const halfW = aabb ? (aabb.maxX - aabb.minX) * 0.5 : 20;

        // Move in facingDirection at moveSpeed.
        const dx = this.facingDirection * this.moveSpeed * delta;
        this.container.position.x += dx;
        this.frameDeltaX = dx;

        // Update physics body rest position so applyPlatformBuoyancy moves the body (and visual) in sync.
        if (this.matterBody?.plugin) {
            this.matterBody.plugin.platformRestX = (this.matterBody.plugin.platformRestX ?? this.matterBody.position.x) + dx;
        }

        // Turn around when fully outside the level bounds.
        const x = this.container.position.x;
        if (this.facingDirection > 0 && x - halfW > this._levelBoundsRight) {
            this.facingDirection = -1;
            this.targetYaw = Math.PI;
            this.currentYaw = Math.PI;
        } else if (this.facingDirection < 0 && x + halfW < this._levelBoundsLeft) {
            this.facingDirection = 1;
            this.targetYaw = 0;
            this.currentYaw = 0;
        }
    }

    _applyFacingYaw(delta, snap = false) {
        if (!this.sceneObject) return;
        if (snap || delta <= 0) {
            this.currentYaw = this.targetYaw;
        } else {
            this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, clamp01(this.turnSpeedY * delta));
        }
        this.sceneObject.rotation.y = this.baseRotation.y + this.currentYaw;
        this.setFacingDirection(this.facingDirection);
        this.syncDebugCollisionShellTransform();
    }

    _updatePatrolMovement(delta) {
        TMP_TARGET_DELTA.copy(this.patrolTarget).sub(this.container.position);
        TMP_TARGET_DELTA.z = 0;
        const dist = TMP_TARGET_DELTA.length();
        if (dist <= this.arriveThreshold) { this.selectNewPatrolTarget(); return; }
        const slowRadius   = Math.max(this.arriveThreshold * 5, 1.5);
        const desiredSpeed = this.moveSpeed * clamp01(dist / slowRadius);
        const dir          = TMP_TARGET_DELTA.normalize();
        const lerpT        = clamp01(this.acceleration * delta);
        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, dir.x * desiredSpeed, lerpT) * this.damping;
        this.velocity.y = THREE.MathUtils.lerp(this.velocity.y, dir.y * desiredSpeed, lerpT) * this.damping;
        this.container.position.x += this.velocity.x * delta;
        this.container.position.y += this.velocity.y * delta;
    }

    _updateBob(delta) {
        this.bobTime += BOB_SPEED * delta;
        this.container.position.y += Math.sin(this.bobTime) * BOB_AMPLITUDE * delta;
    }

    getWalkableTopEdge() {
        if (!this.loaded) return null;

        // Prefer actual Matter body vertices — they are always in the correct world position
        // and match exactly what is shown in the green debug polygon.
        let worldPoints = null;
        const body = this.matterBody;
        if (body) {
            const parts = (body.parts?.length > 1) ? body.parts.slice(1) : [body];
            const all = [];
            for (const part of parts) {
                for (const v of (part.vertices ?? [])) all.push({ x: v.x, y: v.y });
            }
            if (all.length >= 2) {
                // Keep only the upper half of the body's Y range (the deck surface).
                let minY = Infinity, maxY = -Infinity;
                for (const p of all) { if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
                const midY = (minY + maxY) * 0.5;
                worldPoints = all.filter((p) => p.y >= midY);
            }
        }

        // Fallback to config-based profile if no body is available yet.
        if (!worldPoints?.length) {
            if (!this._deckProfile.length || !this.sceneObject) return null;
            this.sceneObject.updateWorldMatrix(true, false);
            const mat = this.sceneObject.matrixWorld;
            worldPoints = this._deckProfile.map(({ x, y }) => {
                TMP_LOCAL.set(x, y, 0).applyMatrix4(mat);
                return { x: TMP_LOCAL.x, y: TMP_LOCAL.y };
            });
        }

        // Always wind right-to-left in world space so getEdgeAngle (which reverses
        // 'top' edges) yields an upward normal regardless of the zeppelin's Y flip.
        worldPoints.sort((a, b) => b.x - a.x);

        this._updateDeckDebugLine(worldPoints);

        const edges = [];
        for (let i = 0; i < worldPoints.length - 1; i++) {
            const a = worldPoints[i];
            const b = worldPoints[i + 1];
            edges.push({
                x1: a.x, y1: a.y,
                x2: b.x, y2: b.y,
                start: { x: a.x, y: a.y },
                end:   { x: b.x, y: b.y },
                type: 'top',
                kind: 'top',
                regionType: 'solid',
                takeoffAllowed: true,
                _dynamic: true,
                _sourceId: this.id,
                _object: this
            });
        }
        return edges;
    }

    _getMissileLaunchWorldPosition(out = TMP_LAUNCH_POSITION) {
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

    _getMissileLaunchDirection(out = TMP_LAUNCH_DIRECTION) {
        out.set(this.facingDirection >= 0 ? 1 : -1, 0, 0);
        return out;
    }

    _updateMissileCombat(delta, dynoTarget) {
        if (
            !this.missileLauncher ||
            (this.missileConfig.requiresDamage && !this.hasTakenDamage()) ||
            this.destroyedFalling || this.health <= 0 || this.isDestroyed || this.markedForRemoval
        ) return;
        this.missileCooldown = Math.max(0, this.missileCooldown - delta);
        if (this.missileCooldown > 0) return;
        const target = this.getDynoTargetWorld(dynoTarget, TMP_TARGET_DELTA);
        if (!target) return;
        const dist = Math.hypot(target.x - this.container.position.x, target.y - this.container.position.y);
        if (this.missileConfig.fireRange > 0 && dist > this.missileConfig.fireRange) return;
        this.missileLauncher.launch({
            position:  this._getMissileLaunchWorldPosition(TMP_LAUNCH_POSITION),
            direction: this._getMissileLaunchDirection(TMP_LAUNCH_DIRECTION),
            target:    dynoTarget
        });
        this.missileCooldown = this.missileConfig.fireInterval;
    }

    destroy() {
        if (this.isDestroyed || this.destroyedFalling) return;
        if (this.carriedBy?.dropCarriedObject) this.carriedBy.dropCarriedObject();
        if (this.draggedBy?.releaseDraggedObject) this.draggedBy.releaseDraggedObject();
        this.destroyedFalling = true;
        // Explode in place — zeppelins don't fall, they just blow up in the air.
        super.destroy();
    }

    onGroundImpact(impactSpeed, fallDistance, groundHeight) {
        if (!this.destroyedFalling) return super.onGroundImpact(impactSpeed, fallDistance, groundHeight);
        this.container.position.y = groundHeight;
        this.velocity.set(0, 0, 0);
        this.gravityEnabled   = false;
        this.destroyedFalling = false;
        super.destroy();
    }

    update(delta, level, dynoTarget = null) {
        if (!this.loaded) return;

        this.updateHealthBarVisual();
        this.updateDestructionSequence(delta);
        this.missileLauncher?.update(delta, dynoTarget);
        this.alwaysUpdate = true;

        if (this.markedForRemoval || this.isDestroyed) return;

        if (this.destroyedFalling) return super.update(delta, level);

        if (this.state === LEVEL_OBJECT_STATES.CARRIED || this.carriedBy) return;

        this.state = LEVEL_OBJECT_STATES.IDLE;
        this.gravityEnabled = false;
        // frameDeltaX/Y are written by applyPlatformBuoyancy each physics step; don't overwrite here.

        this._updatePatrol(delta, level);
        this._applyFacingYaw(delta);
        this._updateMissileCombat(delta, dynoTarget);
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
        if (this._deckDebugLine) {
            this._deckDebugLine.geometry.dispose();
            this._deckDebugLine.material.dispose();
            this.scene.remove(this._deckDebugLine);
            this._deckDebugLine = null;
        }
        super.dispose();
    }
}
