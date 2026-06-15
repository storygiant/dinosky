import * as THREE from 'three';

function randomRange(min, max) {
    return min + (Math.random() * (max - min));
}

function pickRandom(values, fallback) {
    if (!Array.isArray(values) || !values.length) {
        return fallback;
    }

    return values[Math.floor(Math.random() * values.length)];
}

function createEffectMaterial({
    color,
    opacity = 1,
    map = null,
    blending = THREE.AdditiveBlending
}) {
    return new THREE.MeshBasicMaterial({
        color,
        map,
        transparent: true,
        opacity,
        blending,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        fog: false
    });
}

function disposeBranch(root) {
    root?.traverse((child) => {
        child.geometry?.dispose?.();

        if (Array.isArray(child.material)) {
            for (const material of child.material) {
                material?.dispose?.();
            }
        } else {
            child.material?.dispose?.();
        }
    });
}

export class LevelObjectDestructionEffect {
    constructor(parent, options = {}) {
        this.parent = parent;
        this.options = options;
        this.elapsed = 0;
        this.finished = false;
        this.duration = Math.max(options.explosionDuration ?? 0.65, 0.05);
        this.explosionScale = Math.max(options.explosionScale ?? 1, 0.01);
        this.durationForceScale = THREE.MathUtils.clamp(Math.sqrt(this.duration / 0.55), 0.75, 1.8);
        this.forceScale = Math.max(options.explosionForce ?? this.durationForceScale, 0.1) * this.explosionScale;
        this.particleCount = Math.max(Math.floor(options.particleCount ?? 32), 0);
        this.debrisCount = Math.max(Math.floor(options.debrisCount ?? 7), 0);
        this.particleSpeedMin = options.particleSpeedMin ?? 4;
        this.particleSpeedMax = options.particleSpeedMax ?? 10;
        this.debrisSpeedMin = options.debrisSpeedMin ?? 3;
        this.debrisSpeedMax = options.debrisSpeedMax ?? 8;
        this.gravity = options.gravity ?? (75 * this.forceScale);
        this.upwardBias = options.upwardBias ?? 7.5;
        this.debrisForceScale = Math.max(options.debrisForceScale ?? 0.26, 0.01);
        this.debrisGravityMultiplier = Math.max(options.debrisGravityMultiplier ?? 4.2, 0.1);
        this.debrisLinearDamping = THREE.MathUtils.clamp(options.debrisLinearDamping ?? 0.982, 0.7, 0.9999);
        this.debrisWeightMin = Math.max(options.debrisWeightMin ?? 0.75, 0.01);
        this.debrisWeightMax = Math.max(options.debrisWeightMax ?? 2.3, this.debrisWeightMin);
        this.colors = options.explosionColors || [0xffaa00, 0xff5500, 0x333333];
        this.effectOffsetY = options.effectOffsetY ?? 0;
        this.effectOffsetZ = options.effectOffsetZ ?? 3;
        this.debrisStartDelay = Math.max(options.debrisStartDelay ?? 0.3, 0);
        this.debrisShown = false;
        this.emissionDuration = Math.max(options.emissionDuration ?? 0.5, 0.05);
        this.spawnSpreadX = Math.max(options.spawnSpreadX ?? 0, 0);
        this.spawnSpreadY = Math.max(options.spawnSpreadY ?? 0, 0);
        this.emissionRate = Math.max(
            options.emissionRate ?? (this.particleCount / Math.max(this.emissionDuration, 0.001)),
            0
        );
        this.emissionAccumulator = 0;

        this.root = new THREE.Group();
        this.root.name = 'LevelObjectExplosionEffect';
        this.root.position.set(0, this.effectOffsetY, this.effectOffsetZ);
        this.root.renderOrder = 9500;
        this.parent.add(this.root);

        this.textureLoader = new THREE.TextureLoader(options.loadingManager || undefined);
        this.flameTexture = null;
        if (options.flameTextureUrl) {
            this.flameTexture = this.textureLoader.load(options.flameTextureUrl);
            this.flameTexture.colorSpace = THREE.SRGBColorSpace;
            this.flameTexture.minFilter = THREE.LinearMipmapLinearFilter;
            this.flameTexture.magFilter = THREE.LinearFilter;
            this.flameTexture.generateMipmaps = true;
        }

        this.particles = [];
        this.debris = [];
        this.createDebris();
    }

    getParticleLife(baseMin, baseMax, colorHex) {
        const color = new THREE.Color(colorHex);
        const isYellowHot = color.r > 0.8 && color.g > 0.55 && color.b < 0.3;
        const lifeScale = isYellowHot ? 0.45 : 1;
        return randomRange(baseMin * lifeScale, baseMax * lifeScale);
    }

    getSpawnOffset() {
        return {
            x: randomRange(-this.spawnSpreadX * 0.5, this.spawnSpreadX * 0.5),
            y: randomRange(-this.spawnSpreadY * 0.5, this.spawnSpreadY * 0.5)
        };
    }

    emitParticles(count) {
        const geometry = new THREE.PlaneGeometry(0.6, 0.6);

        for (let index = 0; index < count; index += 1) {
            const color = pickRandom(this.colors, 0xff7a1a);
            const material = createEffectMaterial({
                color,
                opacity: 0.95,
                map: this.flameTexture
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.renderOrder = 9501;

            const angle = randomRange(0, Math.PI * 2);
            const radiusBias = randomRange(0.15, 1);
            const speed = randomRange(this.particleSpeedMin, this.particleSpeedMax) * this.forceScale;
            const spawnOffset = this.getSpawnOffset();
            const velocity = new THREE.Vector3(
                Math.cos(angle) * speed * radiusBias * randomRange(0.25, 0.55),
                (speed * randomRange(0.72, 1.25)) + (this.upwardBias * this.forceScale),
                randomRange(-1.8, 1.8) * this.forceScale
            );
            const size = randomRange(0.25, 0.75) * this.explosionScale;

            particle.userData.velocity = velocity;
            particle.userData.life = this.getParticleLife(0.2, 0.45, color);
            particle.userData.age = 0;
            particle.userData.startSize = size;
            particle.userData.endSize = size * randomRange(1.6, 3.2);
            particle.userData.spin = randomRange(-8, 8);
            particle.scale.setScalar(size);
            particle.rotation.z = randomRange(0, Math.PI * 2);
            particle.position.set(spawnOffset.x, spawnOffset.y, 0);
            particle.visible = true;
            this.particles.push(particle);
            this.root.add(particle);
        }
    }

    createParticleBurst() {
        const geometry = new THREE.PlaneGeometry(0.6, 0.6);

        for (let index = 0; index < this.particleCount; index += 1) {
            const color = pickRandom(this.colors, 0xff7a1a);
            const material = createEffectMaterial({
                color,
                opacity: 0.95,
                map: this.flameTexture
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.renderOrder = 9501;

            const angle = randomRange(0, Math.PI * 2);
            const radiusBias = randomRange(0.15, 1);
            const speed = randomRange(this.particleSpeedMin, this.particleSpeedMax) * this.forceScale;
            const spawnOffset = this.getSpawnOffset();
            // Explosions should read as a blast of fire thrown upward first, then pulled down
            // by gravity. Duration feeds force so longer effects get a taller arc.
            const velocity = new THREE.Vector3(
                Math.cos(angle) * speed * radiusBias * randomRange(0.25, 0.55),
                (speed * randomRange(0.72, 1.25)) + (this.upwardBias * this.forceScale),
                randomRange(-1.8, 1.8) * this.forceScale
            );
            const size = randomRange(0.25, 0.75) * this.explosionScale;

            particle.userData.velocity = velocity;
            particle.userData.life = this.getParticleLife(this.duration * 0.55, this.duration, color);
            particle.userData.age = 0;
            particle.userData.startSize = size;
            particle.userData.endSize = size * randomRange(1.6, 3.2);
            particle.userData.spin = randomRange(-8, 8);
            particle.scale.setScalar(size);
            particle.rotation.z = randomRange(0, Math.PI * 2);
            particle.position.set(spawnOffset.x, spawnOffset.y, 0);
            particle.visible = true;
            this.particles.push(particle);
            this.root.add(particle);
        }
    }

    createDebris() {
        const weightRange = Math.max(this.debrisWeightMax - this.debrisWeightMin, 0.0001);
        for (let index = 0; index < this.debrisCount; index += 1) {
            const color = pickRandom(this.colors, 0x333333);
            const geometry = new THREE.BoxGeometry(
                randomRange(0.14, 0.34) * this.explosionScale,
                randomRange(0.08, 0.24) * this.explosionScale,
                randomRange(0.04, 0.16) * this.explosionScale
            );
            const material = createEffectMaterial({
                color,
                opacity: 0.95,
                blending: THREE.NormalBlending
            });
            const piece = new THREE.Mesh(geometry, material);
            piece.renderOrder = 9502;

            const angle = randomRange(0, Math.PI * 2);
            const debrisWeight = randomRange(this.debrisWeightMin, this.debrisWeightMax);
            const normalizedWeight = THREE.MathUtils.clamp(
                (debrisWeight - this.debrisWeightMin) / weightRange,
                0,
                1
            );
            const launchWeightFactor = 1 / Math.sqrt(debrisWeight);
            const speed = randomRange(this.debrisSpeedMin, this.debrisSpeedMax) *
                this.forceScale *
                this.debrisForceScale;
            piece.userData.velocity = new THREE.Vector3(
                Math.cos(angle) * speed * randomRange(0.3, 0.72) * launchWeightFactor,
                ((speed * randomRange(0.38, 0.78)) + (this.upwardBias * 0.5 * this.forceScale)) * launchWeightFactor,
                randomRange(-1.2, 1.2) * this.forceScale * this.debrisForceScale * launchWeightFactor
            );
            piece.userData.angularVelocity = new THREE.Vector3(
                randomRange(-5, 5),
                randomRange(-5, 5),
                randomRange(-8, 8)
            );
            piece.userData.life = randomRange(this.duration * 0.65, this.duration);
            piece.userData.age = 0;
            piece.userData.weight = debrisWeight;
            piece.userData.gravityScale = THREE.MathUtils.lerp(1.1, 2.6, normalizedWeight);
            piece.userData.linearDamping = THREE.MathUtils.lerp(
                this.debrisLinearDamping + 0.01,
                this.debrisLinearDamping - 0.02,
                normalizedWeight
            );
            piece.visible = false;
            this.debris.push(piece);
            this.root.add(piece);
        }
    }

    setWorldPosition(position) {
        this.root.position.set(
            position.x,
            position.y + this.effectOffsetY,
            position.z + this.effectOffsetZ
        );
    }

    start() {
        this.elapsed = 0;
        this.finished = false;
        this.debrisShown = false;
        this.emissionAccumulator = 0;
        this.createParticleBurst();
        this.root.visible = true;
    }

    update(delta) {
        if (this.finished) {
            return;
        }

        this.elapsed += delta;
        let anyAlive = false;

        if (this.elapsed <= this.emissionDuration && this.emissionRate > 0) {
            this.emissionAccumulator += delta * this.emissionRate;
            const emitCount = Math.floor(this.emissionAccumulator);
            if (emitCount > 0) {
                this.emissionAccumulator -= emitCount;
                this.emitParticles(emitCount);
                anyAlive = true;
            }
        }

        // Show debris at the appropriate time
        if (!this.debrisShown && this.elapsed >= this.debrisStartDelay) {
            this.debrisShown = true;
            for (const piece of this.debris) {
                piece.userData.age = 0;
                piece.visible = true;
            }
        }

        for (const particle of this.particles) {
            const data = particle.userData;
            data.age += delta;
            const progress = THREE.MathUtils.clamp(data.age / data.life, 0, 1);
            if (progress < 1) {
                anyAlive = true;
            }

            data.velocity.y -= this.gravity * delta;
            particle.position.addScaledVector(data.velocity, delta);
            particle.rotation.z += data.spin * delta;
            particle.scale.setScalar(THREE.MathUtils.lerp(data.startSize, data.endSize, progress));
            // Keep fire particles bright for most of their life, then fade sharply at the end
            const fadeFraction = Math.max(0, (progress - 0.8) / 0.2);
            particle.material.opacity = 0.95 * (1 - fadeFraction);
            particle.visible = progress < 1;
        }

        for (const piece of this.debris) {
            const data = piece.userData;
            data.age += delta;
            const progress = THREE.MathUtils.clamp(data.age / data.life, 0, 1);
            if (progress < 1) {
                anyAlive = true;
            }

            // Only update debris that have been shown
            if (this.debrisShown) {
                data.velocity.y -= this.gravity * this.debrisGravityMultiplier * data.gravityScale * delta;
                const frameDamping = Math.pow(data.linearDamping ?? this.debrisLinearDamping, Math.max(delta * 60, 0));
                data.velocity.multiplyScalar(frameDamping);
                piece.position.addScaledVector(data.velocity, delta);
                piece.rotation.x += data.angularVelocity.x * delta;
                piece.rotation.y += data.angularVelocity.y * delta;
                piece.rotation.z += data.angularVelocity.z * delta;
                piece.material.opacity = 0.95 * (1 - progress);
                piece.visible = progress < 1;
            }
        }

        if (!anyAlive || this.elapsed >= this.duration + 0.1) {
            this.finished = true;
            this.root.visible = false;
        }
    }

    isFinished() {
        return this.finished;
    }

    dispose() {
        this.flameTexture?.dispose?.();
        disposeBranch(this.root);
        this.root.removeFromParent();
    }
}

export class WaterSplashEffect {
    constructor(parent, options = {}) {
        this.parent = parent;
        this.options = options;
        this.elapsed = 0;
        this.finished = false;
        this.duration = Math.max(options.duration ?? 0.6, 0.08);
        this.particleCount = Math.max(Math.floor(options.particleCount ?? 28), 1);
        this.scale = Math.max(options.scale ?? 1, 0.1);
        this.upwardSpeedMin = options.upwardSpeedMin ?? 4.2;
        this.upwardSpeedMax = options.upwardSpeedMax ?? 9.5;
        this.sideSpeedMin = options.sideSpeedMin ?? 1.8;
        this.sideSpeedMax = options.sideSpeedMax ?? 5.4;
        this.gravity = options.gravity ?? 18;
        this.root = new THREE.Group();
        this.root.name = 'WaterSplashEffect';
        this.root.renderOrder = 9505;
        this.parent.add(this.root);
        this.particles = [];
    }

    setWorldPosition(position) {
        this.root.position.set(
            Number.isFinite(position?.x) ? position.x : 0,
            Number.isFinite(position?.y) ? position.y : 0,
            Number.isFinite(position?.z) ? position.z : 3
        );
    }

    start() {
        this.elapsed = 0;
        this.finished = false;
        this.root.visible = true;

        const geometry = new THREE.PlaneGeometry(0.42, 0.42);
        const colors = [0xffffff, 0xd8f4ff, 0x9fe8ff];
        for (let index = 0; index < this.particleCount; index += 1) {
            const material = createEffectMaterial({
                color: pickRandom(colors, 0xd8f4ff),
                opacity: 0.9,
                blending: THREE.NormalBlending
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.renderOrder = 9506;
            const angle = randomRange(0, Math.PI * 2);
            const upwardSpeed = randomRange(this.upwardSpeedMin, this.upwardSpeedMax) * this.scale;
            const sideSpeed = randomRange(this.sideSpeedMin, this.sideSpeedMax) * this.scale;
            const size = randomRange(0.22, 0.6) * this.scale;
            particle.position.set(
                randomRange(-0.32, 0.32) * this.scale,
                randomRange(-0.1, 0.12) * this.scale,
                randomRange(-0.08, 0.08)
            );
            particle.scale.setScalar(size);
            particle.rotation.z = randomRange(0, Math.PI * 2);
            particle.userData.velocity = new THREE.Vector3(
                Math.cos(angle) * sideSpeed,
                upwardSpeed,
                randomRange(-0.4, 0.4) * this.scale
            );
            particle.userData.life = randomRange(this.duration * 0.55, this.duration);
            particle.userData.age = 0;
            particle.userData.spin = randomRange(-6, 6);
            particle.userData.startSize = size;
            particle.userData.endSize = size * randomRange(0.5, 0.9);
            this.particles.push(particle);
            this.root.add(particle);
        }
    }

    update(delta) {
        if (this.finished) {
            return;
        }

        this.elapsed += delta;
        let anyAlive = false;

        for (const particle of this.particles) {
            const data = particle.userData;
            data.age += delta;
            const progress = THREE.MathUtils.clamp(data.age / data.life, 0, 1);
            if (progress < 1) {
                anyAlive = true;
            }

            data.velocity.y -= this.gravity * delta;
            particle.position.addScaledVector(data.velocity, delta);
            particle.rotation.z += data.spin * delta;
            particle.scale.setScalar(THREE.MathUtils.lerp(data.startSize, data.endSize, progress));
            particle.material.opacity = 0.9 * (1 - progress);
            particle.visible = progress < 1;
        }

        if (!anyAlive || this.elapsed >= this.duration + 0.05) {
            this.finished = true;
            this.root.visible = false;
        }
    }

    isFinished() {
        return this.finished;
    }

    dispose() {
        disposeBranch(this.root);
        this.root.removeFromParent();
    }
}
