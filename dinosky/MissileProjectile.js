import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { CONFIG } from './config.js';
import { loaderLoadAsyncWithRetry } from './fetchWithRetry.js';

const TMP_TARGET_POSITION = new THREE.Vector3();
const TMP_TO_TARGET = new THREE.Vector3();
const TMP_STEP = new THREE.Vector3();
const TMP_DESTROY_POSITION = new THREE.Vector3();

function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}

function shortestAngleDelta(current, target) {
    return Math.atan2(
        Math.sin(target - current),
        Math.cos(target - current)
    );
}

function pointToCircleDistance(point, circle) {
    if (!point || !circle) {
        return Number.POSITIVE_INFINITY;
    }

    const radius = Math.max(circle.radius ?? 0, 0.0001);
    const dx = point.x - circle.centerX;
    const dy = point.y - circle.centerY;
    const distance = Math.hypot(dx, dy);
    return Math.max(distance - radius, 0);
}

function resolveVector3Tuple(values = [], fallback = [0, 0, 0]) {
    return new THREE.Vector3(
        Number.isFinite(values[0]) ? values[0] : fallback[0],
        Number.isFinite(values[1]) ? values[1] : fallback[1],
        Number.isFinite(values[2]) ? values[2] : fallback[2]
    );
}

function randomRange(min, max) {
    return min + (Math.random() * (max - min));
}

export class MissileProjectile {
    constructor(modelRoot, config = {}) {
        this.root = modelRoot || new THREE.Group();
        this.root.visible = false;

        this.position = new THREE.Vector3();
        this.direction = new THREE.Vector3(1, 0, 0);
        this.speed = 0;
        this.age = 0;
        this.active = false;
        this.damageToDino = 0;
        this.hitRadius = 0.4;
        this.lifetime = 5;
        this.targetSpeed = 12;
        this.acceleration = 20;
        this.maxTurnRate = 2.5;
        this.modelRotationOffset = resolveVector3Tuple(config.modelRotationOffset);
        this.modelScale = Number.isFinite(config.modelScale) ? Math.max(config.modelScale, 0.001) : 12;
        this.trailAccumulator = 0;
        this.trailSpawnInterval = 0.03;
        this.onDestroy = null;
    }

    launch(position, direction, config = {}) {
        this.position.copy(position);
        this.direction.copy(direction);
        this.direction.z = 0;
        if (this.direction.lengthSq() <= 0.0001) {
            this.direction.set(1, 0, 0);
        } else {
            this.direction.normalize();
        }

        this.speed = Math.max(0, Number.isFinite(config.initialSpeed) ? config.initialSpeed : 0);
        this.age = 0;
        this.active = true;
        this.damageToDino = Math.max(0, Number.isFinite(config.damageToDino) ? config.damageToDino : 25);
        this.hitRadius = Math.max(0, Number.isFinite(config.hitRadius) ? config.hitRadius : 0.45);
        this.lifetime = Math.max(0.05, Number.isFinite(config.lifetime) ? config.lifetime : 5);
        this.targetSpeed = Math.max(0.001, Number.isFinite(config.speed) ? config.speed : 12);
        this.acceleration = Math.max(0.001, Number.isFinite(config.acceleration) ? config.acceleration : 20);
        this.maxTurnRate = Math.max(0, Number.isFinite(config.maxTurnRate) ? config.maxTurnRate : 2.5);
        this.modelRotationOffset.copy(resolveVector3Tuple(config.modelRotationOffset));
        this.modelScale = Number.isFinite(config.modelScale) ? Math.max(config.modelScale, 0.001) : 12;
        this.trailAccumulator = 0;
        this.trailSpawnInterval = Math.max(0.005, Number.isFinite(config.trailSpawnInterval) ? config.trailSpawnInterval : 0.03);
        this.root.scale.setScalar(this.modelScale);

        this.root.visible = true;
        this.syncVisual();
    }

    update(delta, target) {
        if (!this.active) {
            return { active: false, hit: false };
        }

        this.age += delta;
        if (this.age >= this.lifetime) {
            this.destroyMissile('timeout');
            return { active: false, hit: false };
        }

        this.updateHoming(delta, target);
        this.speed = THREE.MathUtils.lerp(
            this.speed,
            this.targetSpeed,
            clamp01((this.acceleration / Math.max(this.targetSpeed, 0.001)) * delta)
        );

        TMP_STEP.copy(this.direction).multiplyScalar(this.speed * delta);
        this.position.add(TMP_STEP);
        this.syncVisual();
        this.emitTrail(delta);

        if (this.hitDino(target)) {
            const damage = Math.max(0, Number.isFinite(this.damageToDino) ? this.damageToDino : 0);
            target?.applyDamage?.(damage, 'missile', {
                projectileDirection: {
                    x: this.direction.x,
                    y: this.direction.y,
                    z: this.direction.z
                },
                impactPosition: {
                    x: this.position.x,
                    y: this.position.y,
                    z: this.position.z
                }
            });
            this.destroyMissile('hitDino');
            return { active: false, hit: true };
        }

        return { active: true, hit: false };
    }

    updateHoming(delta, target) {
        if (!this.getTargetPoint(target, TMP_TARGET_POSITION)) {
            return;
        }

        // Homing direction is the vector from missile to the current dino target point.
        TMP_TO_TARGET.copy(TMP_TARGET_POSITION).sub(this.position);
        TMP_TO_TARGET.z = 0;
        if (TMP_TO_TARGET.lengthSq() <= 0.0001) {
            return;
        }

        TMP_TO_TARGET.normalize();
        const currentAngle = Math.atan2(this.direction.y, this.direction.x);
        const desiredAngle = Math.atan2(TMP_TO_TARGET.y, TMP_TO_TARGET.x);
        const maxStep = this.maxTurnRate * delta;
        // Max turn rate clamps angle change per frame, so missiles curve toward the target
        // instead of snapping or instantly reversing 180 degrees.
        const nextAngle = currentAngle + THREE.MathUtils.clamp(
            shortestAngleDelta(currentAngle, desiredAngle),
            -maxStep,
            maxStep
        );

        this.direction.set(Math.cos(nextAngle), Math.sin(nextAngle), 0);
    }

    getTargetPoint(target, out) {
        const targetCircle = target?.getWorldCollisionCircle?.();
        if (targetCircle && Number.isFinite(targetCircle.centerX) && Number.isFinite(targetCircle.centerY)) {
            out.set(targetCircle.centerX, targetCircle.centerY, this.position.z);
            return true;
        }

        if (target?.getWorldPosition) {
            target.getWorldPosition(out);
            return true;
        }

        return false;
    }

    hitDino(target) {
        const targetCircle = target?.getWorldCollisionCircle?.();
        if (!targetCircle) {
            return false;
        }

        return pointToCircleDistance(
            { x: this.position.x, y: this.position.y },
            targetCircle
        ) <= this.hitRadius;
    }

    syncVisual() {
        this.root.position.copy(this.position);
        // Visual rotation follows actual flight direction, keeping the missile nose aligned
        // with movement after homing turn-rate limits are applied.
        this.root.rotation.set(
            this.modelRotationOffset.x,
            this.modelRotationOffset.y,
            this.modelRotationOffset.z + Math.atan2(this.direction.y, this.direction.x)
        );
    }

    emitTrail(delta) {
        if (typeof this.onDestroy !== 'function') {
            return;
        }

        this.trailAccumulator += delta;
        while (this.trailAccumulator >= this.trailSpawnInterval) {
            this.trailAccumulator -= this.trailSpawnInterval;
            // Trail particles are emitted just behind the missile nose direction, so the effect
            // reads as propulsion/exhaust instead of a large smoke cloud.
            this.onDestroy('trail', this.position, this.direction);
        }
    }

    destroyMissile(reason = 'generic') {
        if (!this.active) {
            return;
        }

        TMP_DESTROY_POSITION.copy(this.position);
        this.deactivate();
        if (typeof this.onDestroy === 'function') {
            // Both hit and timeout destruction use the same hook, keeping cleanup consistent.
            this.onDestroy(reason, TMP_DESTROY_POSITION, this.direction);
        }
    }

    deactivate() {
        this.active = false;
        this.root.visible = false;
    }

    dispose() {
        this.root.traverse((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                for (const material of child.material) {
                    material?.dispose?.();
                }
            } else {
                child.material?.dispose?.();
            }
        });
        this.root.removeFromParent();
    }
}

export class MissileLauncher {
    constructor(scene, config = {}, loadingManager = null) {
        this.scene = scene;
        this.config = config;
        this.loadingManager = loadingManager;
        this.loader = createGLTFLoader(loadingManager);
        this.textureLoader = new THREE.TextureLoader(loadingManager);
        this.modelTemplate = null;
        this.texture = null;
        this.root = new THREE.Group();
        this.root.name = config.rootName || 'MissileLauncher';
        this.scene.add(this.root);
        this.vfxRoot = new THREE.Group();
        this.vfxRoot.name = `${this.root.name}:vfx`;
        this.scene.add(this.vfxRoot);
        this.activeMissiles = [];
        this.freeMissiles = [];
        this.activeParticles = [];
        this.freeParticles = [];
        this.particleMaterial = null;
        this.projectileBandDepth = null;
        this.projectileBandRenderOrder = 1200;
    }

    async load() {
        const modelPath = this.config.modelPath || './gfx/mesh/vehicles/missile.glb';
        const [gltf, texture] = await Promise.all([
            loaderLoadAsyncWithRetry(this.loader, modelPath),
            this.loadConfiguredTexture()
        ]);
        this.modelTemplate = gltf.scene;
        this.texture = texture;
        this.prepareModelTemplate(this.modelTemplate, texture);
        this.particleMaterial = new THREE.SpriteMaterial({
            map: texture,
            color: 0xffc166,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            toneMapped: false,
            fog: false
        });
        return this;
    }

    async loadConfiguredTexture() {
        if (!this.config.texturePath) {
            return null;
        }

        try {
            const texture = await this.textureLoader.loadAsync(this.config.texturePath);
            // Match glTF/vehicle texture handling used by LevelObject.
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
            return texture;
        } catch (error) {
            console.warn('[MissileLauncher] Failed to load missile texture:', this.config.texturePath, error);
            return null;
        }
    }

    prepareModelTemplate(root, texture = null) {
        root.traverse((child) => {
            if (!child?.isMesh) {
                return;
            }

            child.frustumCulled = false;
            child.castShadow = false;
            child.receiveShadow = false;

            const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
            const nextMaterials = sourceMaterials.map((material) => {
                if (!material) {
                    return material;
                }

                return new THREE.MeshBasicMaterial({
                    // Same unlit material style used by LevelObject vehicles/choppers.
                    color: 0xffffff,
                    map: texture ?? material.map ?? null,
                    transparent: material.transparent === true,
                    opacity: material.opacity ?? 1,
                    alphaTest: material.alphaTest ?? 0,
                    side: material.side ?? THREE.FrontSide,
                    depthTest: true,
                    depthWrite: true,
                    toneMapped: false,
                    fog: false
                });
            });

            child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];
        });
    }

    launch({ position, direction, configOverrides = {} }) {
        if (!position || !direction || !this.modelTemplate) {
            return null;
        }

        const missile = this.getMissile();
        const launchConfig = {
            ...this.config,
            ...configOverrides
        };

        missile.launch(position, direction, launchConfig);
        if (Number.isFinite(this.projectileBandDepth)) {
            missile.position.z = this.projectileBandDepth;
            missile.root.position.z = this.projectileBandDepth;
        }
        missile.root.renderOrder = this.projectileBandRenderOrder;
        this.activeMissiles.push(missile);
        return missile;
    }

    getMissile() {
        const pooled = this.freeMissiles.pop();
        if (pooled) {
            return pooled;
        }

        const model = this.modelTemplate.clone(true);
        model.visible = false;
        model.renderOrder = this.projectileBandRenderOrder;
        model.traverse((child) => {
            if (child?.isMesh) {
                child.renderOrder = this.projectileBandRenderOrder;
            }
        });
        this.root.add(model);
        const missile = new MissileProjectile(model, this.config);
        missile.onDestroy = (reason, position, direction) => {
            this.handleMissileEvent(reason, position, direction);
        };
        return missile;
    }

    update(delta, target) {
        if (!this.hasActiveWork()) {
            return;
        }

        const rawBulletMinY = CONFIG.LEVEL_OBJECTS?.bulletMinY;
        const bulletMinY = rawBulletMinY == null ? null : Number(rawBulletMinY);
        const hasBulletMinY = Number.isFinite(bulletMinY);

        for (let index = this.activeMissiles.length - 1; index >= 0; index -= 1) {
            const missile = this.activeMissiles[index];
            missile.update(delta, target);
            if (missile.active && hasBulletMinY && missile.position.y <= bulletMinY) {
                // Match tank-bullet world-Y cull behavior: missiles detonate when crossing below
                // the same configured floor threshold.
                missile.destroyMissile('groundCull');
            }
            if (missile.active) {
                continue;
            }

            this.activeMissiles.splice(index, 1);
            this.freeMissiles.push(missile);
        }

        this.updateParticles(delta);
    }

    hasActiveWork() {
        return this.activeMissiles.length > 0 || this.activeParticles.length > 0;
    }

    getActiveMissilesForCollision() {
        return this.activeMissiles;
    }

    handleMissileEvent(reason, position, direction) {
        if (reason === 'trail') {
            this.spawnMissileTrailParticle(position, direction);
            return;
        }

        if (reason === 'hitDino' || reason === 'timeout' || reason === 'groundCull' || reason === 'hitByDinoFire') {
            this.spawnMissileExplosion(position);
        }
    }

    getParticle() {
        const pooled = this.freeParticles.pop();
        if (pooled) {
            return pooled;
        }

        const material = this.particleMaterial
            ? this.particleMaterial.clone()
            : new THREE.SpriteMaterial({
                color: 0xffc166,
                transparent: true,
                opacity: 0,
                depthWrite: false,
                toneMapped: false,
                fog: false
            });
        const sprite = new THREE.Sprite(material);
        sprite.visible = false;
        sprite.renderOrder = this.projectileBandRenderOrder;
        this.vfxRoot.add(sprite);

        return {
            sprite,
            material,
            position: new THREE.Vector3(),
            velocity: new THREE.Vector3(),
            age: 0,
            lifetime: 0.35,
            startScale: 0.18,
            endScale: 0.28,
            startOpacity: 0.55,
            rotationSpeed: 0
        };
    }

    spawnMissileTrailParticle(position, direction) {
        const lifetime = Math.max(0.02, Number.isFinite(this.config.trailParticleLifetime) ? this.config.trailParticleLifetime : 0.35);
        const scale = Math.max(0.001, Number.isFinite(this.config.trailParticleScale) ? this.config.trailParticleScale : 0.18);
        const spread = Math.max(0, Number.isFinite(this.config.trailSpread) ? this.config.trailSpread : 0.08);
        const backOffset = Number.isFinite(this.config.trailBackOffset) ? this.config.trailBackOffset : 0.9;
        const verticalOffset = Number.isFinite(this.config.trailVerticalOffset) ? this.config.trailVerticalOffset : -0.16;
        const particle = this.getParticle();
        const backX = -(direction?.x ?? 1);
        const backY = -(direction?.y ?? 0);
        const lateralX = -(direction?.y ?? 0);
        const lateralY = direction?.x ?? 1;

        particle.position.copy(position);
        // Offset the trail toward the missile tail, then slightly below the missile centerline.
        // This keeps the exhaust from appearing on top of the missile body.
        particle.position.x += (backX * backOffset) + (lateralX * verticalOffset) + randomRange(-spread, spread);
        particle.position.y += (backY * backOffset) + (lateralY * verticalOffset) + randomRange(-spread, spread);
        particle.position.z = Number.isFinite(this.projectileBandDepth)
            ? this.projectileBandDepth
            : position.z;
        particle.velocity.set(
            backX * randomRange(0.35, 0.9) + randomRange(-spread, spread),
            backY * randomRange(0.35, 0.9) + randomRange(-spread, spread),
            0
        );
        particle.age = 0;
        particle.lifetime = lifetime;
        particle.startScale = scale * randomRange(0.85, 1.2);
        particle.endScale = particle.startScale * randomRange(1.5, 2.2);
        particle.startOpacity = 0.5;
        particle.rotationSpeed = randomRange(-3, 3);
        particle.material.color.setHex(0xffbb55);
        particle.material.opacity = particle.startOpacity;
        particle.material.rotation = Math.random() * Math.PI * 2;
        particle.sprite.scale.setScalar(particle.startScale);
        particle.sprite.position.copy(particle.position);
        particle.sprite.visible = true;
        this.activeParticles.push(particle);
    }

    spawnMissileExplosion(position) {
        const count = Math.max(0, Math.floor(Number.isFinite(this.config.explosionParticleCount) ? this.config.explosionParticleCount : 10));
        const lifetime = Math.max(0.02, Number.isFinite(this.config.explosionLifetime) ? this.config.explosionLifetime : 0.35);
        const scale = Math.max(0.001, Number.isFinite(this.config.explosionScale) ? this.config.explosionScale : 0.6);

        for (let i = 0; i < count; i += 1) {
            const particle = this.getParticle();
            const angle = Math.random() * Math.PI * 2;
            const speed = randomRange(scale * 5, scale * 12);

            particle.position.copy(position);
            particle.position.x += randomRange(-scale * 0.18, scale * 0.18);
            particle.position.y += randomRange(-scale * 0.18, scale * 0.18);
            particle.position.z = Number.isFinite(this.projectileBandDepth)
                ? this.projectileBandDepth
                : position.z;
            particle.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
            particle.age = 0;
            particle.lifetime = lifetime * randomRange(0.8, 1.25);
            particle.startScale = scale * randomRange(0.38, 0.82);
            particle.endScale = particle.startScale * randomRange(1.5, 2.7);
            particle.startOpacity = randomRange(0.65, 0.95);
            particle.rotationSpeed = randomRange(-7, 7);
            particle.material.color.setHex(Math.random() < 0.7 ? 0xff8b22 : 0xffe08a);
            particle.material.opacity = particle.startOpacity;
            particle.material.rotation = Math.random() * Math.PI * 2;
            particle.sprite.scale.setScalar(particle.startScale);
            particle.sprite.position.copy(particle.position);
            particle.sprite.visible = true;
            this.activeParticles.push(particle);
        }
    }

    updateParticles(delta) {
        for (let index = this.activeParticles.length - 1; index >= 0; index -= 1) {
            const particle = this.activeParticles[index];
            particle.age += delta;
            const t = clamp01(particle.age / Math.max(particle.lifetime, 0.0001));
            if (t >= 1) {
                particle.sprite.visible = false;
                particle.material.opacity = 0;
                this.activeParticles.splice(index, 1);
                this.freeParticles.push(particle);
                continue;
            }

            particle.position.addScaledVector(particle.velocity, delta);
            particle.velocity.multiplyScalar(Math.max(0, 1 - (2.4 * delta)));
            const scale = THREE.MathUtils.lerp(particle.startScale, particle.endScale, t);
            particle.sprite.scale.setScalar(scale);
            particle.sprite.position.copy(particle.position);
            particle.material.opacity = particle.startOpacity * (1 - t);
            particle.material.rotation += particle.rotationSpeed * delta;
        }
    }

    setProjectileRenderBand(band) {
        this.projectileBandDepth = Number.isFinite(band?.depth) ? band.depth : null;
        this.projectileBandRenderOrder = Number.isFinite(band?.renderOrder)
            ? band.renderOrder
            : 1200;
        this.root.renderOrder = this.projectileBandRenderOrder;
        this.vfxRoot.renderOrder = this.projectileBandRenderOrder;

        for (const missile of [...this.activeMissiles, ...this.freeMissiles]) {
            missile.root.renderOrder = this.projectileBandRenderOrder;
            missile.root.traverse((child) => {
                if (child?.isMesh) {
                    child.renderOrder = this.projectileBandRenderOrder;
                }
            });
            if (Number.isFinite(this.projectileBandDepth)) {
                missile.position.z = this.projectileBandDepth;
                missile.root.position.z = this.projectileBandDepth;
            }
        }

        for (const particle of [...this.activeParticles, ...this.freeParticles]) {
            particle.sprite.renderOrder = this.projectileBandRenderOrder;
            if (Number.isFinite(this.projectileBandDepth)) {
                particle.position.z = this.projectileBandDepth;
                particle.sprite.position.z = this.projectileBandDepth;
            }
        }
    }

    dispose() {
        for (const missile of [...this.activeMissiles, ...this.freeMissiles]) {
            missile.dispose();
        }
        this.activeMissiles = [];
        this.freeMissiles = [];
        for (const particle of [...this.activeParticles, ...this.freeParticles]) {
            particle.material?.dispose?.();
            particle.sprite?.removeFromParent();
        }
        this.activeParticles = [];
        this.freeParticles = [];
        this.particleMaterial?.dispose?.();
        this.particleMaterial = null;
        this.texture?.dispose?.();
        this.texture = null;
        this.root.removeFromParent();
        this.vfxRoot.removeFromParent();
        this.root = null;
        this.vfxRoot = null;
        this.modelTemplate = null;
    }
}
