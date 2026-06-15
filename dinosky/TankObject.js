import * as THREE from 'three';
import { VehicleObject } from './VehicleObject.js';
import { LEVEL_OBJECT_STATES } from './LevelObject.js';
import { CONFIG } from './config.js';
import { loaderLoadAsyncWithRetry } from './fetchWithRetry.js';

const TMP_TARGET_WORLD = new THREE.Vector3();
const TMP_PIVOT_WORLD = new THREE.Vector3();
const TMP_MUZZLE_WORLD = new THREE.Vector3();
const TMP_AIM_WORLD = new THREE.Vector3();
const TMP_TARGET_LOCAL = new THREE.Vector3();
const TMP_MUZZLE_LOCAL = new THREE.Vector3();
const TMP_BULLET_STEP = new THREE.Vector3();
const TMP_CENTER = new THREE.Vector3();
const TMP_BULLET_WORLD = new THREE.Vector3();

function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}

function normalizeAngle(angle) {
    let wrapped = angle;
    while (wrapped > Math.PI) {
        wrapped -= Math.PI * 2;
    }
    while (wrapped < -Math.PI) {
        wrapped += Math.PI * 2;
    }
    return wrapped;
}

function shortestAngleDelta(current, target) {
    return normalizeAngle(target - current);
}

function angleToDirection(out, angle) {
    out.set(Math.cos(angle), Math.sin(angle), 0);
    return out;
}

export class TankObject extends VehicleObject {
    constructor(options) {
        super(options);

        this.tankCombat = this.getTankCombatConfig();
        this.cannonNode = null;
        this.cannonPivot = null;
        this.cannonRestWorldAngle = 0;
        this.cannonRestLocalAngle = 0;
        this.cannonCurrentOffset = 0;
        this.previousCombatState = null;
        this.muzzleLocal = new THREE.Vector3(2.2, 0, 0);
        this.fireCooldown = 0;
        this.nextBulletId = 1;

        this.bulletTexture = null;
        this.bulletMaterial = null;
        this.activeBullets = [];
        this.freeBullets = [];
        this.projectileBandDepth = null;
        this.projectileBandRenderOrder = 1200;
        this.projectileRoot = new THREE.Group();
        this.projectileRoot.name = `${this.type}:${this.id}:projectiles`;
        this.scene.add(this.projectileRoot);
    }

    getTankCombatConfig() {
        const combat = this.config.tankCombat || {};
        return {
            cannonMeshNames: Array.isArray(combat.cannonMeshNames) && combat.cannonMeshNames.length > 0
                ? combat.cannonMeshNames
                : ['tank_cannon', 'tank_canon'],
            aimRange: Number.isFinite(combat.aimRange) ? combat.aimRange : 12,
            cannonRotateSpeed: Number.isFinite(combat.cannonRotateSpeed) ? combat.cannonRotateSpeed : 3.5,
            fireAngleTolerance: Number.isFinite(combat.fireAngleTolerance) ? combat.fireAngleTolerance : 0.08,
            fireInterval: Number.isFinite(combat.fireInterval) ? combat.fireInterval : 0.8,
            bulletSpeed: Number.isFinite(combat.bulletSpeed) ? combat.bulletSpeed : 14,
            bulletLifetime: Number.isFinite(combat.bulletLifetime) ? combat.bulletLifetime : 2.5,
            bulletDamageToDino: Number.isFinite(combat.bulletDamageToDino) ? Math.max(0, combat.bulletDamageToDino) : 15,
            bulletScale: Number.isFinite(combat.bulletScale) ? combat.bulletScale : 0.75,
            bulletHitRadius: Number.isFinite(combat.bulletHitRadius) ? Math.max(0, combat.bulletHitRadius) : 0.6,
            bulletTexturePath: combat.bulletTexturePath || './gfx/levels/bullet.webp',
            muzzleBackOffset: Number.isFinite(combat.muzzleBackOffset) ? combat.muzzleBackOffset : 0.2,
            idleReturnSpeedMultiplier: Number.isFinite(combat.idleReturnSpeedMultiplier) ? combat.idleReturnSpeedMultiplier : 0.55,
            // Relative aim limits around cannon rest angle (radians).
            // Positive offset is "left side", negative offset is "right side".
            maxAngleLeft: Number.isFinite(combat.maxAngleLeft) ? Math.max(0, combat.maxAngleLeft) : Math.PI,
            maxAngleRight: Number.isFinite(combat.maxAngleRight) ? Math.max(0, combat.maxAngleRight) : Math.PI,
            // Keep cannon traverse on the upper arc only (right -> top -> left), never downward.
            overTopOnly: combat.overTopOnly !== false,
            // Optional downward overshoot at each side while still preferring the top arc.
            downAngleRight: Number.isFinite(combat.downAngleRight) ? Math.max(0, combat.downAngleRight) : 0,
            downAngleLeft: Number.isFinite(combat.downAngleLeft) ? Math.max(0, combat.downAngleLeft) : 0
        };
    }

    clampCannonOffset(offset) {
        const minOffset = -Math.max(0, this.tankCombat.maxAngleRight);
        const maxOffset = Math.max(0, this.tankCombat.maxAngleLeft);
        return THREE.MathUtils.clamp(offset, minOffset, maxOffset);
    }

    getOverTopWorldAngleLimits() {
        const leftLimit = THREE.MathUtils.clamp(this.tankCombat.maxAngleLeft, 0, Math.PI);
        const rightLimit = THREE.MathUtils.clamp(this.tankCombat.maxAngleRight, 0, Math.PI);
        const downRight = Math.max(0, this.tankCombat.downAngleRight);
        const downLeft = Math.max(0, this.tankCombat.downAngleLeft);

        // Full top arc when both are PI:
        // min = PI - PI = 0 (straight right), max = PI (straight left).
        // Optional downward overshoot extends range below 0 (right) and above PI (left).
        const minOffset = Math.max(-downRight, Math.PI - rightLimit - downRight);
        const maxOffset = Math.min(Math.PI + downLeft, leftLimit + downLeft);
        return {
            minAngle: Math.min(minOffset, maxOffset),
            maxAngle: Math.max(minOffset, maxOffset)
        };
    }

    resolveOverTopDesiredWorldAngle(desiredWorldAngle, referenceWorldAngle) {
        const { minAngle, maxAngle } = this.getOverTopWorldAngleLimits();
        const candidates = [
            desiredWorldAngle - (Math.PI * 2),
            desiredWorldAngle,
            desiredWorldAngle + (Math.PI * 2)
        ];
        let bestAngle = THREE.MathUtils.clamp(candidates[0], minAngle, maxAngle);
        let bestTopArcPenalty = Number.POSITIVE_INFINITY;
        let bestDesiredError = Number.POSITIVE_INFINITY;
        let bestReferenceDistance = Number.POSITIVE_INFINITY;

        for (const candidate of candidates) {
            const clamped = THREE.MathUtils.clamp(candidate, minAngle, maxAngle);
            // Keep over-top aiming on the upper arc whenever possible. Optional downward
            // overshoot still exists, but it should lose against equivalent top-arc choices.
            const topArcPenalty = (clamped < 0 || clamped > Math.PI) ? 1 : 0;
            const desiredError = Math.abs(shortestAngleDelta(clamped, desiredWorldAngle));
            const referenceDistance = Math.abs(clamped - referenceWorldAngle);
            if (
                topArcPenalty < bestTopArcPenalty ||
                (
                    topArcPenalty === bestTopArcPenalty &&
                    (
                        desiredError < bestDesiredError - 0.00001 ||
                        (
                            Math.abs(desiredError - bestDesiredError) <= 0.00001 &&
                            referenceDistance < bestReferenceDistance
                        )
                    )
                ) ||
                (
                    topArcPenalty === bestTopArcPenalty &&
                    Math.abs(desiredError - bestDesiredError) <= 0.00001 &&
                    Math.abs(referenceDistance - bestReferenceDistance) <= 0.00001 &&
                    Math.abs(clamped) < Math.abs(bestAngle)
                )
            ) {
                bestTopArcPenalty = topArcPenalty;
                bestDesiredError = desiredError;
                bestReferenceDistance = referenceDistance;
                bestAngle = clamped;
            }
        }

        return bestAngle;
    }

    getCurrentCannonWorldAngle() {
        return this.cannonRestWorldAngle + this.cannonCurrentOffset;
    }

    getCurrentCannonLocalAngle() {
        return this.cannonRestLocalAngle + this.cannonCurrentOffset;
    }

    async load() {
        await super.load();
        this.cannonNode = this.findCannonNode();
        this.setupCannonPivot();
        this.captureCannonRestAngle();
        await this.loadBulletVisuals();
        return this;
    }

    pickUp(dino, socket, options = {}) {
        const didPickUp = super.pickUp(dino, socket, options);
        if (!didPickUp) {
            return false;
        }

        // Let a freshly lifted tank fire as soon as its cannon has returned to the rest pose.
        this.fireCooldown = 0;
        return true;
    }

    findCannonNode() {
        if (!this.sceneObject) {
            return null;
        }

        const normalizedNames = new Set(
            this.tankCombat.cannonMeshNames
                .map((name) => String(name || '').trim().toLowerCase())
                .filter((name) => name.length > 0)
        );
        let found = null;
        this.sceneObject.traverse((child) => {
            if (found || !child?.isObject3D) {
                return;
            }

            const childName = String(child.name || '').trim().toLowerCase();
            if (!childName || !normalizedNames.has(childName)) {
                return;
            }

            found = child;
        });

        return found;
    }

    setupCannonPivot() {
        if (!this.cannonNode || !this.cannonNode.parent) {
            return;
        }

        const parent = this.cannonNode.parent;
        this.cannonNode.updateMatrix();
        this.cannonNode.updateMatrixWorld(true);
        parent.updateMatrixWorld(true);

        let minX = -0.5;
        let maxX = 0.5;
        let centerY = 0.8;
        let centerZ = 0.8;
        if (this.cannonNode.geometry) {
            this.cannonNode.geometry.computeBoundingBox();
            const box = this.cannonNode.geometry.boundingBox;
            if (box) {
                minX = box.min.x;
                maxX = box.max.x;
                centerY = (box.min.y + box.max.y) * 0.1;
                centerZ = (box.min.z + box.max.z) * 0.1;
            }
        }

        const pivotLocalInCannon = new THREE.Vector3(minX, centerY, centerZ);
        const pivotLocalInParent = pivotLocalInCannon.clone().applyMatrix4(this.cannonNode.matrix);
        this.muzzleLocal.set(maxX - this.tankCombat.muzzleBackOffset, centerY, centerZ);

        const pivot = new THREE.Group();
        pivot.name = `${this.cannonNode.name || 'tank_cannon'}:pivot`;
        pivot.position.copy(pivotLocalInParent);
        parent.add(pivot);

        const originalLocalMatrix = this.cannonNode.matrix.clone();
        const pivotLocalMatrix = new THREE.Matrix4().makeTranslation(
            pivot.position.x,
            pivot.position.y,
            pivot.position.z
        );
        const adjustedLocalMatrix = pivotLocalMatrix.clone().invert().multiply(originalLocalMatrix);

        this.cannonNode.removeFromParent();
        pivot.add(this.cannonNode);
        adjustedLocalMatrix.decompose(
            this.cannonNode.position,
            this.cannonNode.quaternion,
            this.cannonNode.scale
        );
        this.cannonNode.updateMatrix();
        this.cannonPivot = pivot;
    }

    captureCannonRestAngle() {
        if (!this.cannonPivot || !this.cannonNode) {
            return;
        }

        this.getCannonPivotWorld(TMP_PIVOT_WORLD);
        this.getCannonMuzzleWorld(TMP_MUZZLE_WORLD);
        TMP_AIM_WORLD.copy(TMP_MUZZLE_WORLD).sub(TMP_PIVOT_WORLD);
        if (TMP_AIM_WORLD.lengthSq() <= 0.0001) {
            this.cannonRestWorldAngle = this.currentFacingDirection >= 0 ? 0 : Math.PI;
            return;
        }

        this.cannonRestWorldAngle = Math.atan2(TMP_AIM_WORLD.y, TMP_AIM_WORLD.x);

        const parent = this.cannonPivot.parent;
        if (!parent) {
            this.cannonRestLocalAngle = 0;
            return;
        }

        parent.updateMatrixWorld(true);
        TMP_MUZZLE_LOCAL.copy(TMP_MUZZLE_WORLD);
        parent.worldToLocal(TMP_MUZZLE_LOCAL);
        TMP_MUZZLE_LOCAL.sub(this.cannonPivot.position);
        if (TMP_MUZZLE_LOCAL.lengthSq() <= 0.0001) {
            this.cannonRestLocalAngle = 0;
            return;
        }

        this.cannonRestLocalAngle = normalizeAngle(
            Math.atan2(TMP_MUZZLE_LOCAL.y, TMP_MUZZLE_LOCAL.x) - this.cannonCurrentOffset
        );
    }

    async loadBulletVisuals() {
        if (!this.tankCombat.bulletTexturePath) {
            return;
        }

        this.bulletTexture = await loaderLoadAsyncWithRetry(this.textureLoader, this.tankCombat.bulletTexturePath);
        this.bulletTexture.colorSpace = THREE.SRGBColorSpace;
        this.bulletMaterial = new THREE.SpriteMaterial({
            map: this.bulletTexture,
            transparent: true,
            depthWrite: false,
            toneMapped: false
        });
    }

    getBulletSpriteScale() {
        const baseScale = Math.max(0.001, this.tankCombat.bulletScale);
        const image = this.bulletTexture?.image;
        if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.height <= 0) {
            return { x: baseScale, y: baseScale };
        }

        // Keep the exact source image aspect on screen.
        const aspect = image.width / image.height;
        return {
            x: baseScale * aspect,
            y: baseScale
        };
    }

    getTankCenterWorld(target = new THREE.Vector3()) {
        const rect = this.getWorldCollisionRect?.();
        if (rect && Number.isFinite(rect.centerX) && Number.isFinite(rect.centerY)) {
            target.set(rect.centerX, rect.centerY, this.container.position.z);
            return target;
        }

        return this.getWorldPosition(target);
    }

    getTargetWorldPosition(dinoTarget, out = new THREE.Vector3()) {
        const hitCircle = dinoTarget?.getWorldCollisionCircle?.();
        if (
            hitCircle &&
            Number.isFinite(hitCircle.centerX) &&
            Number.isFinite(hitCircle.centerY)
        ) {
            // Aim at the same gameplay target used for hit detection so visual tracking
            // and collision outcomes stay aligned (especially while the dino is airborne).
            out.set(hitCircle.centerX, hitCircle.centerY, this.container.position.z);
            return out;
        }

        if (dinoTarget?.getMouthWorldPosition) {
            return dinoTarget.getMouthWorldPosition(out);
        }

        if (dinoTarget?.getWorldPosition) {
            return dinoTarget.getWorldPosition(out);
        }

        return null;
    }

    getCannonPivotWorld(target = new THREE.Vector3()) {
        if (!this.cannonPivot) {
            return this.getTankCenterWorld(target);
        }

        return this.cannonPivot.getWorldPosition(target);
    }

    getCannonMuzzleWorld(target = new THREE.Vector3()) {
        if (!this.cannonNode) {
            return this.getTankCenterWorld(target);
        }

        target.copy(this.muzzleLocal);
        return this.cannonNode.localToWorld(target);
    }

    computeDesiredCannonOffset(targetWorld) {
        const parent = this.cannonPivot?.parent;
        if (!parent) {
            return this.cannonCurrentOffset;
        }

        parent.updateMatrixWorld(true);
        TMP_TARGET_LOCAL.copy(targetWorld);
        parent.worldToLocal(TMP_TARGET_LOCAL);
        TMP_TARGET_LOCAL.sub(this.cannonPivot.position);
        if (TMP_TARGET_LOCAL.lengthSq() <= 0.0001) {
            return this.cannonCurrentOffset;
        }

        const desiredLocalAngle = Math.atan2(TMP_TARGET_LOCAL.y, TMP_TARGET_LOCAL.x);
        if (this.tankCombat.overTopOnly) {
            const currentLocalAngle = this.getCurrentCannonLocalAngle();
            const clampedLocalAngle = this.resolveOverTopDesiredWorldAngle(desiredLocalAngle, currentLocalAngle);
            return clampedLocalAngle - this.cannonRestLocalAngle;
        }

        const desiredOffset = normalizeAngle(desiredLocalAngle - this.cannonRestLocalAngle);
        return this.clampCannonOffset(desiredOffset);
    }

    updateCannonAim(delta, targetWorld) {
        if (!this.cannonPivot || !targetWorld) {
            return {
                inTolerance: false,
                angleError: Number.POSITIVE_INFINITY
            };
        }

        const targetOffset = this.computeDesiredCannonOffset(targetWorld);
        const deltaAngle = this.tankCombat.overTopOnly
            ? (targetOffset - this.cannonCurrentOffset)
            : shortestAngleDelta(this.cannonCurrentOffset, targetOffset);
        const response = 1 - Math.exp(-Math.max(0.001, this.tankCombat.cannonRotateSpeed) * delta);
        this.cannonCurrentOffset = this.tankCombat.overTopOnly
            ? (this.cannonCurrentOffset + (deltaAngle * clamp01(response)))
            : normalizeAngle(this.cannonCurrentOffset + (deltaAngle * clamp01(response)));
        if (this.tankCombat.overTopOnly) {
            const currentLocalAngle = this.getCurrentCannonLocalAngle();
            const clampedLocalAngle = this.resolveOverTopDesiredWorldAngle(currentLocalAngle, currentLocalAngle);
            this.cannonCurrentOffset = clampedLocalAngle - this.cannonRestLocalAngle;
        } else {
            this.cannonCurrentOffset = this.clampCannonOffset(this.cannonCurrentOffset);
        }
        this.cannonPivot.rotation.z = this.cannonCurrentOffset;

        const remainingError = this.tankCombat.overTopOnly
            ? Math.abs((targetOffset - this.cannonCurrentOffset))
            : Math.abs(shortestAngleDelta(this.cannonCurrentOffset, targetOffset));
        return {
            inTolerance: remainingError <= this.tankCombat.fireAngleTolerance,
            angleError: remainingError
        };
    }

    updateCannonIdleReturn(delta) {
        if (!this.cannonPivot) {
            return Number.POSITIVE_INFINITY;
        }

        if (Math.abs(this.cannonCurrentOffset) <= 0.0001) {
            this.cannonCurrentOffset = 0;
            this.cannonPivot.rotation.z = 0;
            return 0;
        }

        const response = 1 - Math.exp(
            -Math.max(0.001, this.tankCombat.cannonRotateSpeed * this.tankCombat.idleReturnSpeedMultiplier) * delta
        );
        let idleTargetOffset = 0;
        if (this.tankCombat.overTopOnly) {
            const restLocal = this.cannonRestLocalAngle;
            const currentLocal = this.getCurrentCannonLocalAngle();
            const clampedRestLocal = this.resolveOverTopDesiredWorldAngle(restLocal, currentLocal);
            idleTargetOffset = clampedRestLocal - this.cannonRestLocalAngle;
        }
        const deltaAngle = this.tankCombat.overTopOnly
            ? (idleTargetOffset - this.cannonCurrentOffset)
            : shortestAngleDelta(this.cannonCurrentOffset, 0);
        this.cannonCurrentOffset = this.tankCombat.overTopOnly
            ? (this.cannonCurrentOffset + (deltaAngle * clamp01(response)))
            : normalizeAngle(this.cannonCurrentOffset + (deltaAngle * clamp01(response)));
        if (this.tankCombat.overTopOnly) {
            const currentLocalAngle = this.getCurrentCannonLocalAngle();
            const clampedLocalAngle = this.resolveOverTopDesiredWorldAngle(currentLocalAngle, currentLocalAngle);
            this.cannonCurrentOffset = clampedLocalAngle - this.cannonRestLocalAngle;
        } else {
            this.cannonCurrentOffset = this.clampCannonOffset(this.cannonCurrentOffset);
        }
        this.cannonPivot.rotation.z = this.cannonCurrentOffset;
        return this.tankCombat.overTopOnly
            ? Math.abs(idleTargetOffset - this.cannonCurrentOffset)
            : Math.abs(shortestAngleDelta(this.cannonCurrentOffset, 0));
    }

    canTrackAndFire(dinoTarget, targetWorld) {
        if (!dinoTarget || !targetWorld || !this.cannonPivot || !this.cannonNode) {
            return false;
        }

        this.getTankCenterWorld(TMP_CENTER);
        return TMP_CENTER.distanceTo(targetWorld) <= this.tankCombat.aimRange;
    }

    getBullet() {
        const bullet = this.freeBullets.pop();
        if (bullet) {
            return bullet;
        }

        if (!this.bulletMaterial) {
            return null;
        }

        const spriteMaterial = this.bulletMaterial.clone();
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.visible = false;
        sprite.renderOrder = this.projectileBandRenderOrder;
        // Anchor at right-middle so positioning aligns to the bullet tail side.
        sprite.center.set(1, 0.5);
        const spriteScale = this.getBulletSpriteScale();
        sprite.scale.set(spriteScale.x, spriteScale.y, 1);
        this.projectileRoot.add(sprite);
        return {
            id: -1,
            sprite,
            position: new THREE.Vector3(),
            direction: new THREE.Vector3(1, 0, 0),
            speed: this.tankCombat.bulletSpeed,
            life: this.tankCombat.bulletLifetime,
            radius: this.tankCombat.bulletHitRadius,
            damageToDino: this.tankCombat.bulletDamageToDino
        };
    }

    fireBullet() {
        const bullet = this.getBullet();
        if (!bullet) {
            return;
        }

        this.getCannonPivotWorld(TMP_PIVOT_WORLD);
        this.getCannonMuzzleWorld(TMP_MUZZLE_WORLD);
        TMP_AIM_WORLD.copy(TMP_MUZZLE_WORLD).sub(TMP_PIVOT_WORLD);
        if (TMP_AIM_WORLD.lengthSq() <= 0.0001) {
            angleToDirection(TMP_AIM_WORLD, this.cannonRestWorldAngle + this.cannonCurrentOffset);
        } else {
            TMP_AIM_WORLD.normalize();
        }

        // Spawn slightly behind muzzle so the projectile visually emerges from the barrel.
        bullet.position.copy(TMP_MUZZLE_WORLD).addScaledVector(TMP_AIM_WORLD, -Math.max(0, this.tankCombat.muzzleBackOffset));
        // Sprite pivot compensation:
        // With a right-side anchor and non-flat angle, the rendered bullet can appear too high on
        // one side and too low on the other. Shift along shot direction so the visual centerline
        // stays aligned to the cannon regardless of left/right aiming.
        const anchorForwardOffset = (
            ((bullet.sprite?.center?.x ?? 0.5) - 0.5) *
            (bullet.sprite?.scale?.x ?? this.tankCombat.bulletScale)
        );
        if (Math.abs(anchorForwardOffset) > 0.0001) {
            bullet.position.addScaledVector(TMP_AIM_WORLD, anchorForwardOffset);
        }
        if (Number.isFinite(this.projectileBandDepth)) {
            bullet.position.z = this.projectileBandDepth;
        }
        bullet.direction.copy(TMP_AIM_WORLD).normalize();
        // Rotate bullet so it points along the same direction as the cannon/shot vector.
        if (bullet.sprite?.material) {
            bullet.sprite.material.rotation = Math.atan2(bullet.direction.y, bullet.direction.x);
        }
        bullet.id = this.nextBulletId;
        this.nextBulletId += 1;
        bullet.speed = this.tankCombat.bulletSpeed;
        bullet.life = this.tankCombat.bulletLifetime;
        bullet.radius = this.tankCombat.bulletHitRadius;
        bullet.damageToDino = this.tankCombat.bulletDamageToDino;

        bullet.sprite.visible = true;
        bullet.sprite.position.copy(bullet.position);
        this.activeBullets.push(bullet);
        this.audioManager?.play?.('tankFire', {
            volume: this.state === LEVEL_OBJECT_STATES.CARRIED ? 0.55 : 0.75,
            detune: (Math.random() * 90) - 45,
            cooldown: 0.04
        });
    }

    getActiveBulletsForCollision() {
        return this.activeBullets
            .filter((bullet) => bullet?.sprite?.visible)
            .map((bullet) => ({
                id: bullet.id,
                x: bullet.position.x,
                y: bullet.position.y,
                z: bullet.position.z,
                directionX: bullet.direction.x,
                directionY: bullet.direction.y,
                radius: bullet.radius,
                damageToDino: bullet.damageToDino
            }));
    }

    consumeBulletById(id) {
        if (!Number.isFinite(id)) {
            return false;
        }

        const index = this.activeBullets.findIndex((bullet) => bullet.id === id);
        if (index < 0) {
            return false;
        }

        const bullet = this.activeBullets[index];
        bullet.sprite.visible = false;
        this.activeBullets.splice(index, 1);
        this.freeBullets.push(bullet);
        return true;
    }

    updateBullets(delta) {
        if (!this.activeBullets.length) {
            return;
        }

        const rawBulletMinY = CONFIG.LEVEL_OBJECTS?.bulletMinY;
        const bulletMinY = rawBulletMinY == null ? null : Number(rawBulletMinY);
        const hasBulletMinY = Number.isFinite(bulletMinY);
        for (let index = this.activeBullets.length - 1; index >= 0; index -= 1) {
            const bullet = this.activeBullets[index];
            bullet.life -= delta;
            if (bullet.life <= 0) {
                bullet.sprite.visible = false;
                this.activeBullets.splice(index, 1);
                this.freeBullets.push(bullet);
                continue;
            }

            TMP_BULLET_STEP.copy(bullet.direction).multiplyScalar(bullet.speed * delta);
            bullet.position.add(TMP_BULLET_STEP);
            if (Number.isFinite(this.projectileBandDepth)) {
                bullet.position.z = this.projectileBandDepth;
            }
            bullet.sprite.position.copy(bullet.position);

            // World-space cull rule:
            // remove bullet once it is at/below the configured global world-Y threshold.
            if (hasBulletMinY) {
                bullet.sprite.getWorldPosition(TMP_BULLET_WORLD);
                if (TMP_BULLET_WORLD.y <= bulletMinY) {
                    bullet.sprite.visible = false;
                    this.activeBullets.splice(index, 1);
                    this.freeBullets.push(bullet);
                }
            }
        }
    }

    setProjectileRenderBand(band) {
        this.projectileBandDepth = Number.isFinite(band?.depth) ? band.depth : null;
        this.projectileBandRenderOrder = Number.isFinite(band?.renderOrder)
            ? band.renderOrder
            : 1200;
        this.projectileRoot.renderOrder = this.projectileBandRenderOrder;

        for (const bullet of [...this.activeBullets, ...this.freeBullets]) {
            bullet.sprite.renderOrder = this.projectileBandRenderOrder;
            if (Number.isFinite(this.projectileBandDepth)) {
                bullet.position.z = this.projectileBandDepth;
                bullet.sprite.position.z = this.projectileBandDepth;
            }
        }
    }

    updateTankCombat(delta, dinoTarget) {
        if (!this.loaded || this.isDestroyed || this.markedForRemoval) {
            return;
        }

        const previousState = this.previousCombatState;
        const currentState = this.state;
        this.previousCombatState = currentState;
        const wasAttached =
            previousState === LEVEL_OBJECT_STATES.CARRIED ||
            previousState === LEVEL_OBJECT_STATES.GRABBED ||
            previousState === LEVEL_OBJECT_STATES.DRAGGED;
        const isAttached =
            currentState === LEVEL_OBJECT_STATES.CARRIED ||
            currentState === LEVEL_OBJECT_STATES.GRABBED ||
            currentState === LEVEL_OBJECT_STATES.DRAGGED;

        // Rebuild cannon rest basis once after carry/drag rotations (like 180deg Y flips).
        if (wasAttached && !isAttached) {
            this.cannonCurrentOffset = 0;
            if (this.cannonPivot) {
                this.cannonPivot.rotation.z = 0;
            }
            this.captureCannonRestAngle();
        }

        if (this.state === LEVEL_OBJECT_STATES.CARRIED) {
            const restError = this.updateCannonIdleReturn(delta);
            this.fireCooldown = Math.max(0, this.fireCooldown - delta);
            if (restError <= this.tankCombat.fireAngleTolerance && this.fireCooldown <= 0) {
                this.fireBullet();
                this.fireCooldown = this.tankCombat.fireInterval;
            }
            return;
        }

        if (!this.hasTakenDamage()) {
            this.updateCannonIdleReturn(delta);
            this.fireCooldown = 0;
            return;
        }

        if (
            this.state === LEVEL_OBJECT_STATES.GRABBED ||
            this.state === LEVEL_OBJECT_STATES.DRAGGED
        ) {
            this.updateCannonIdleReturn(delta);
            this.fireCooldown = Math.max(0, this.fireCooldown - delta);
            return;
        }

        const targetWorld = this.getTargetWorldPosition(dinoTarget, TMP_TARGET_WORLD);
        const inRange = this.canTrackAndFire(dinoTarget, targetWorld);
        this.fireCooldown = Math.max(0, this.fireCooldown - delta);

        if (!inRange) {
            this.updateCannonIdleReturn(delta);
            return;
        }

        const aim = this.updateCannonAim(delta, targetWorld);
        if (!aim.inTolerance || this.fireCooldown > 0) {
            return;
        }

        this.fireBullet();
        this.fireCooldown = this.tankCombat.fireInterval;
    }

    update(delta, level, dinoTarget = null) {
        super.update(delta, level);
        this.updateTankCombat(delta, dinoTarget);
        this.updateBullets(delta);
        this.alwaysUpdate = this.activeBullets.length > 0;
    }

    dispose() {
        for (const bullet of this.activeBullets) {
            bullet.sprite?.material?.dispose?.();
            bullet.sprite?.removeFromParent();
        }
        for (const bullet of this.freeBullets) {
            bullet.sprite?.material?.dispose?.();
            bullet.sprite?.removeFromParent();
        }
        this.activeBullets = [];
        this.freeBullets = [];
        this.bulletMaterial?.dispose?.();
        this.bulletTexture?.dispose?.();
        this.projectileRoot.removeFromParent();
        this.projectileRoot = null;
        super.dispose();
    }
}
