import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BurnableSceneryObject, BURNABLE_SCENERY_STATE } from './BurnableSceneryObject.js';
import { SpatialGrid } from './SpatialGrid.js';

const DEFAULT_LAYER_NAME = 'BurnableObjects';

function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
}

function isBurnableLayer(layer) {
    const configuredName = normalizeToken(CONFIG.BURNABLE_SCENERY?.layerName || DEFAULT_LAYER_NAME);
    return layer?.burnableScenery === true || normalizeToken(layer?.name) === configuredName;
}

function getBaseUrl() {
    return typeof document !== 'undefined' && document.baseURI
        ? document.baseURI
        : window.location.href;
}

function resolveAssetUrl(url, baseUrl = getBaseUrl()) {
    if (!url || typeof url !== 'string') {
        return null;
    }

    try {
        return new URL(url, baseUrl).href;
    } catch {
        return null;
    }
}

function propertyTextureUrl(object, propertyName, baseUrl) {
    const value = object?.properties?.[propertyName];
    return typeof value === 'string' && value.trim()
        ? resolveAssetUrl(value.trim(), baseUrl)
        : null;
}

function rectIntersectsBounds(rect, bounds) {
    if (!rect || !bounds) return false;
    const angle = Number.isFinite(rect.angle) ? rect.angle : 0;
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const radius = Math.hypot(bounds.width, bounds.height) * 0.5;
    const dx = ((bounds.left + bounds.right) * 0.5) - rect.centerX;
    const dy = ((bounds.bottom + bounds.top) * 0.5) - rect.centerY;
    const localX = (dx * cos) - (dy * sin);
    const localY = (dx * sin) + (dy * cos);

    return Math.abs(localX) <= rect.halfWidth + radius &&
        Math.abs(localY) <= rect.halfHeight + radius;
}

function boundsHitPointFromRect(rect, bounds) {
    if (!rect || !bounds) {
        return null;
    }

    return {
        x: THREE.MathUtils.clamp(rect.centerX, bounds.left, bounds.right),
        y: THREE.MathUtils.clamp(rect.centerY, bounds.bottom, bounds.top)
    };
}

function createFallbackTexture(color = 0xffffff) {
    const data = new Uint8Array([
        (color >> 16) & 255,
        (color >> 8) & 255,
        color & 255,
        255
    ]);
    const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
}

function createSoftParticleTexture(color = 0xffffff) {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    const red = (color >> 16) & 255;
    const green = (color >> 8) & 255;
    const blue = color & 255;
    const center = (size - 1) * 0.5;

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const dx = (x - center) / center;
            const dy = (y - center) / center;
            const radius = Math.sqrt(dx * dx + dy * dy);
            const alpha = Math.max(0, 1 - radius);
            const softened = alpha * alpha * (3 - 2 * alpha);
            const offset = (y * size + x) * 4;
            data[offset] = red;
            data[offset + 1] = green;
            data[offset + 2] = blue;
            data[offset + 3] = Math.round(softened * 255);
        }
    }

    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
    return texture;
}

export class BurnableSceneryManager {
    static get DEFAULT_SPATIAL_GRID_CELL_SIZE() {
        return Math.max(1, CONFIG.BURNABLE_SCENERY?.bucketSize ?? 8);
    }

    constructor(scene, level, options = {}) {
        this.scene = scene;
        this.level = level;
        this.levelUrl = options.levelUrl || getBaseUrl();
        this.loadingManager = options.loadingManager || null;
        this.audioManager = options.audioManager || null;
        this.renderer = options.renderer || null;
        this.renderOrder = Number.isFinite(options.renderOrder) ? options.renderOrder : 0;
        this.layerDepth = Number.isFinite(options.layerDepth) ? options.layerDepth : -2;
        this.debug = CONFIG.BURNABLE_SCENERY?.debug === true;

        this.root = new THREE.Group();
        this.root.name = 'BurnableSceneryManager';
        this.root.renderOrder = this.renderOrder;
        this.scene.add(this.root);

        this.textureLoader = new THREE.TextureLoader(this.loadingManager || undefined);
        this.textureCache = new Map();
        this.ownedFallbackTextures = [];
        this.objects = [];
        this.activeObjects = new Set();
        this._activeFireballIds = new Set();
        this.spatialGrid = new SpatialGrid(BurnableSceneryManager.DEFAULT_SPATIAL_GRID_CELL_SIZE);
        this.fireballHitRegistry = new Map();
        this.gameTime = 0;
        this.cameraViewRect = null;
        this.visibilityFrame = 0;
        this.particles = [];
        this.freeParticles = [];
        this.activeParticles = [];
        this.particleRoot = this.root;
        this.particleTextures = {
            fire: null,
            smoke: null,
            water: null
        };
        this.performanceProfile = {
            particleRateMultiplier: 1,
            smokeRateMultiplier: 1,
            maxActiveParticlesScale: 1,
            glowEnabled: true
        };

        this._buildParticlePool();
    }


    static collectTextureUrlsForLevel(level, levelUrl = getBaseUrl()) {
        const urls = new Set();
        const effects = CONFIG.BURNABLE_SCENERY?.burnEffects || {};
        const add = (url) => {
            const resolved = resolveAssetUrl(url, levelUrl);
            if (resolved) urls.add(resolved);
        };

        for (const layer of level?.objectLayers || []) {
            if (!isBurnableLayer(layer)) {
                continue;
            }

            for (const object of layer.objects || []) {
                const triggerEffect = String(object?.properties?.triggerEffect || 'defaultFire').trim() || 'defaultFire';
                const effect = effects[triggerEffect] || effects.defaultFire || {};
                add(object?.properties?.sprite);
                add(object?.properties?.burnedSprite);
                add(effect?.replaceSprite);
                if (!object?.properties?.sprite && object?.renderInfo?.imageUrl) {
                    add(object.renderInfo.imageUrl);
                }
            }
        }

        add(CONFIG.BURNABLE_SCENERY?.particleTextureUrl);
        return urls;
    }

    warmTexture(texture) {
        if (!texture || !this.renderer?.initTexture) {
            return;
        }
        try {
            this.renderer.initTexture(texture);
        } catch {
            // Older/mobile drivers can be fussy here. Warmup is best-effort only.
        }
    }

    shouldManageObjectMarker(object) {
        return normalizeToken(object?.sourceLayer) === normalizeToken(CONFIG.BURNABLE_SCENERY?.layerName || DEFAULT_LAYER_NAME);
    }

    async loadFromLevel() {
        const burnableLayers = (this.level?.objectLayers || []).filter(isBurnableLayer);
        const loads = [];

        for (const layer of burnableLayers) {
            for (const object of layer.objects || []) {
                loads.push(this.createObject(object));
            }
        }

        await Promise.all(loads);
        this.rebuildSpatialBuckets();
        for (const object of this.objects) {
            object._visibilityDirty = true;
        }
    }

    async createObject(object) {
        const effects = CONFIG.BURNABLE_SCENERY?.burnEffects || {};
        const triggerEffect = String(object?.properties?.triggerEffect || 'defaultFire').trim() || 'defaultFire';
        const effectConfig = effects[triggerEffect] || effects.defaultFire || {};
        const spriteUrl = propertyTextureUrl(object, 'sprite', this.levelUrl) ||
            object?.renderInfo?.imageUrl ||
            resolveAssetUrl(CONFIG.BURNABLE_SCENERY?.fallbackSprite, this.levelUrl);
        const burnedUrl = propertyTextureUrl(object, 'burnedSprite', this.levelUrl) ||
            resolveAssetUrl(effectConfig.replaceSprite, this.levelUrl) ||
            spriteUrl;

        const [normalTexture, burnedTexture] = await Promise.all([
            this.loadTexture(spriteUrl, 0xffffff),
            this.loadTexture(burnedUrl, 0x2b241f)
        ]);

        const burnableObject = new BurnableSceneryObject({
            object,
            normalTexture,
            burnedTexture,
            effectConfig,
            sceneRoot: this.root,
            renderOrder: this.renderOrder,
            layerDepth: this.layerDepth,
            debug: this.debug
        });
        burnableObject.setGlowEffectsEnabled?.(this.performanceProfile.glowEnabled);

        this.objects.push(burnableObject);
        this.warmTexture(normalTexture);
        this.warmTexture(burnedTexture);
    }

    loadTexture(url, fallbackColor = 0xffffff, fallbackFactory = null) {
        if (!url) {
            const texture = fallbackFactory ? fallbackFactory() : createFallbackTexture(fallbackColor);
            if (!fallbackFactory) {
                this.ownedFallbackTextures.push(texture);
            }
            return Promise.resolve(texture);
        }

        const cached = this.textureCache.get(url);
        if (cached?.texture) {
            return Promise.resolve(cached.texture);
        }
        if (cached?.promise) {
            return cached.promise;
        }

        const promise = new Promise((resolve) => {
            this.textureLoader.load(
                url,
                (texture) => {
                    const finalize = () => {
                        texture.colorSpace = THREE.SRGBColorSpace;
                        texture.magFilter = THREE.LinearFilter;
                        texture.minFilter = THREE.LinearMipmapLinearFilter;
                        texture.wrapS = THREE.ClampToEdgeWrapping;
                        texture.wrapT = THREE.ClampToEdgeWrapping;
                        texture.needsUpdate = true;
                        this.textureCache.set(url, { texture });
                        this.warmTexture(texture);
                        resolve(texture);
                    };

                    const image = texture.image;
                    if (image && typeof image.decode === 'function') {
                        image.decode().catch(() => {}).finally(finalize);
                    } else {
                        finalize();
                    }
                },
                undefined,
                () => {
                    const texture = fallbackFactory ? fallbackFactory() : createFallbackTexture(fallbackColor);
                    if (!fallbackFactory) {
                        this.ownedFallbackTextures.push(texture);
                    }
                    this.textureCache.set(url, { texture });
                    this.warmTexture(texture);
                    resolve(texture);
                }
            );
        });

        this.textureCache.set(url, { promise });
        return promise;
    }

    _buildParticlePool() {
        const maxParticles = Math.max(0, CONFIG.BURNABLE_SCENERY?.maxParticles ?? 96);
        const textureUrl = resolveAssetUrl(CONFIG.BURNABLE_SCENERY?.particleTextureUrl);
        // A generated soft alpha texture keeps the system self-contained and avoids
        // square particles for smoke/water or while optional fire art is loading.
        const softParticleTexture = createSoftParticleTexture();
        this.ownedFallbackTextures.push(softParticleTexture);
        this.particleTextures.fire = softParticleTexture;
        this.particleTextures.smoke = softParticleTexture;
        this.particleTextures.water = softParticleTexture;

        const geometry = new THREE.PlaneGeometry(1, 1);
        for (let index = 0; index < maxParticles; index += 1) {
            const material = new THREE.MeshBasicMaterial({
                map: softParticleTexture,
                color: 0xffffff,
                transparent: true,
                opacity: 0,
                depthTest: false,
                depthWrite: false,
                blending: THREE.NormalBlending,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.visible = false;
            mesh.frustumCulled = false;
            this.particleRoot.add(mesh);
            const particle = {
                sprite: mesh,
                material,
                life: 0,
                maxLife: 1,
                velocityX: 0,
                velocityY: 0,
                scale: 1,
                scaleX: 1,
                scaleY: 1,
                endScaleX: 1,
                endScaleY: 1,
                rotation: 0,
                spin: 0,
                smokeOnDeath: false,
                kind: 'fire'
            };
            this.particles.push(particle);
            this.freeParticles.push(particle);
        }

        if (!textureUrl) {
            return;
        }

        this.loadTexture(textureUrl, 0xffaa33, () => softParticleTexture).then((texture) => {
            this.particleTextures.fire = texture;
        });
    }

    rebuildSpatialBuckets() {
        this.spatialGrid.clear();
        for (const object of this.objects) {
            this.spatialGrid.insertAabb(
                object,
                object.bounds.left,
                object.bounds.bottom,
                object.bounds.right,
                object.bounds.top
            );
        }
    }

    queryPoint(x, y, radius = 0, callback) {
        const candidates = this._queryCandidates || (this._queryCandidates = []);
        candidates.length = 0;
        this.spatialGrid.queryAabb(
            x - radius,
            y - radius,
            x + radius,
            y + radius,
            candidates
        );

        for (const object of candidates) {
            callback(object);
        }
    }

    setCameraViewRect(rect) {
        const hadRect = !!this.cameraViewRect;
        this.cameraViewRect = rect || null;
        if (!hadRect && this.cameraViewRect) {
            for (const object of this.objects) {
                object._visibilityDirty = true;
            }
        }
    }

    setPerformanceProfile(profile = null) {
        this.performanceProfile = {
            particleRateMultiplier: Math.max(0, profile?.particleRateMultiplier ?? 1),
            smokeRateMultiplier: Math.max(0, profile?.smokeRateMultiplier ?? 1),
            maxActiveParticlesScale: Math.max(0, profile?.maxActiveParticlesScale ?? 1),
            glowEnabled: profile?.glowEnabled !== false
        };
        for (const object of this.objects) {
            object.setGlowEffectsEnabled?.(this.performanceProfile.glowEnabled);
        }
    }

    getActiveParticleBudget() {
        const scale = Math.max(0, this.performanceProfile?.maxActiveParticlesScale ?? 1);
        return Math.max(0, Math.min(this.particles.length, Math.floor(this.particles.length * scale)));
    }

    applyDynoFireDamage(player) {
        void player;
    }

    applyFuryDamage(centerX, centerY, radius) {
        if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || !Number.isFinite(radius) || radius <= 0) {
            return;
        }

        this.queryPoint(centerX, centerY, radius, (object) => {
            if (!object.isIgnitable() || !object.overlapsCircle(centerX, centerY, radius)) {
                return;
            }

            const hitX = Math.max(object.bounds.left, Math.min(object.bounds.right, centerX));
            const hitY = Math.max(object.bounds.bottom, Math.min(object.bounds.top, centerY));
            this.igniteObject(object, { source: 'fury', x: hitX, y: hitY });
        });
    }

    applyFlameDamage(player) {
        void player;
    }

    applyFireballDamage(player) {
        void player;
    }

    igniteObject(object, source = {}) {
        if (!object?.ignite?.(this.gameTime, source)) {
            return false;
        }

        this.activeObjects.add(object);
        object._visibilityDirty = true;
        const effect = object.effectConfig || {};
        if (effect.sfx) {
            this.audioManager?.play?.(effect.sfx, { volume: effect.volume ?? 0.65, cooldown: 0.15 });
        } else if (object.triggerEffect === 'defaultFire') {
            this.audioManager?.play?.('fireHitlight', { volume: 0.45, cooldown: 0.12 });
        }
        return true;
    }

    update(delta) {
        if (!Number.isFinite(delta) || delta < 0) {
            return;
        }

        if (delta === 0) {
            // The loading screen renders one zero-delta frame before the player presses
            // Start. Do the cheap visibility pass there so main-scene burnables are already
            // visible and do not pop in on the first gameplay frame.
            this.updateVisibility(true);
            return;
        }

        this.gameTime += delta;
        this.updateActiveObjects();
        this.updateVisibility();
        this.updateParticles(delta);
        this.emitVisibleEffects(delta);
    }

    updateActiveObjects() {
        if (this.activeObjects.size === 0) {
            return;
        }

        const finished = this._finishedActiveObjects || (this._finishedActiveObjects = []);
        finished.length = 0;
        for (const object of this.activeObjects) {
            object.updateState(this.gameTime);
            if (!object.isActive()) {
                finished.push(object);
            }
        }
        for (const object of finished) {
            this.activeObjects.delete(object);
        }
    }

    updateVisibility(force = false) {
        this.visibilityFrame = (this.visibilityFrame + 1) % Math.max(1, CONFIG.BURNABLE_SCENERY?.visibilityCheckIntervalFrames ?? 6);
        const shouldRecheck = force || this.visibilityFrame === 0;
        const rect = this.cameraViewRect;
        if (!rect) {
            for (const object of this.objects) {
                object.setVisible(false);
            }
            return;
        }

        const margin = Math.max(0, CONFIG.BURNABLE_SCENERY?.visibilityMargin ?? 12);
        for (const object of this.objects) {
            const wasVisible = object.visible;
            if (shouldRecheck || object._visibilityDirty) {
                object._visibilityDirty = false;
                object.visible = !(
                    object.bounds.right < rect.left - margin ||
                    object.bounds.left > rect.right + margin ||
                    object.bounds.top < rect.bottom - margin ||
                    object.bounds.bottom > rect.top + margin
                );
            }
            // Offscreen simulation is time based, so no visual work is needed until the object
            // comes back into range. When it does, updateVisual derives the current burnProgress
            // from gameTime immediately.
            if (
                shouldRecheck ||
                object.visible !== wasVisible ||
                (object.visible && object.isActive())
            ) {
                object.updateVisual(this.gameTime, object.visible);
            }
        }
    }

    emitVisibleEffects(delta) {
        if (this.activeObjects.size === 0 || this.freeParticles.length === 0) {
            return;
        }

        for (const object of this.activeObjects) {
            if (!object.visible || object.state !== BURNABLE_SCENERY_STATE.BURNING) {
                continue;
            }
            const effect = object.effectConfig || {};
            const particleKind = effect.particles === 'water_burst' ? 'water' : 'fire';
            const rate = particleKind === 'water'
                ? (CONFIG.BURNABLE_SCENERY?.waterParticleRate ?? 18)
                : ((CONFIG.BURNABLE_SCENERY?.fireParticleRate ?? 10) * (this.performanceProfile.particleRateMultiplier ?? 1));
            object._particleAccumulator = (object._particleAccumulator || 0) + rate * delta;
            while (object._particleAccumulator >= 1 && this.freeParticles.length > 0) {
                object._particleAccumulator -= 1;
                this.spawnParticle(object, particleKind);
            }

            if (particleKind === 'fire' && effect.smoke !== false) {
                const smokeRate = (CONFIG.BURNABLE_SCENERY?.smokeParticleRate ?? 14) * (this.performanceProfile.smokeRateMultiplier ?? 1);
                object._smokeAccumulator = (object._smokeAccumulator || 0) + smokeRate * delta;
                while (object._smokeAccumulator >= 1 && this.freeParticles.length > 0) {
                    object._smokeAccumulator -= 1;
                    this.spawnParticle(object, 'smoke');
                }
            }
        }
    }

    spawnParticle(object, kind, pointOverride = null) {
        if (this.activeParticles.length >= this.getActiveParticleBudget()) {
            return;
        }
        const particle = this.freeParticles.pop();
        if (!particle) {
            return;
        }

        const isWater = kind === 'water';
        const isSmoke = kind === 'smoke';
        const point = pointOverride || object.getEffectSpawnPoint(kind, this.gameTime);
        if (!point) {
            this.freeParticles.push(particle);
            return;
        }
        particle.kind = kind;
        particle.life = 0;
        particle.smokeOnDeath = kind === 'fire';
        particle.maxLife = isWater
            ? 0.45 + Math.random() * 0.35
            : (isSmoke ? 1.15 + Math.random() * 1.05 : 0.34 + Math.random() * 0.22);
        particle.velocityX = (Math.random() - 0.5) * (isWater ? 4.5 : (isSmoke ? 0.55 : 0.95));
        particle.velocityY = isWater
            ? (3 + Math.random() * 4)
            : (isSmoke ? (1.2 + Math.random() * 1.8) : (2.2 + Math.random() * 2.7));
        particle.scale = isWater
            ? (0.25 + Math.random() * 0.35)
            : (isSmoke ? (0.34 + Math.random() * 0.62) : (0.36 + Math.random() * 0.56));
        particle.scaleX = isWater
            ? particle.scale
            : (isSmoke ? particle.scale * 1.2 : particle.scale * 0.45);
        particle.scaleY = isWater
            ? particle.scale
            : (isSmoke ? particle.scale * 1.2 : particle.scale * (1.8 + Math.random() * 0.9));
        particle.endScaleX = isWater
            ? particle.scale * 1.45
            : (isSmoke ? particle.scale * (2.1 + Math.random() * 0.7) : particle.scale * (1.0 + Math.random() * 0.35));
        particle.endScaleY = isWater
            ? particle.scale * 1.45
            : (isSmoke ? particle.endScaleX : particle.scale * (0.75 + Math.random() * 0.35));
        particle.rotation = isSmoke ? (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.75;
        particle.spin = isSmoke ? (Math.random() - 0.5) * 0.8 : (Math.random() - 0.5) * 3.2;
        particle.sprite.position.set(point.x, point.y, object.mesh.position.z + 0.5);
        particle.sprite.renderOrder = this.renderOrder + 0.5;
        particle.sprite.scale.set(particle.scaleX, particle.scaleY, 1);
        particle.sprite.rotation.z = particle.rotation;
        particle.sprite.visible = true;
        particle.material.map = this.particleTextures[kind] || this.particleTextures.fire || this.particleTextures.smoke;
        // Fire keeps the source sprite colors; smoke/water use the generated soft alpha texture.
        particle.material.color.setHex(isWater ? 0x7fdcff : (isSmoke ? 0x4a4a4a : 0xff6a12));
        particle.material.opacity = isWater ? 0.8 : (isSmoke ? 0.42 : 1.0);
        particle.material.blending = isSmoke || isWater ? THREE.NormalBlending : THREE.AdditiveBlending;
        particle.material.needsUpdate = true;
        this.activeParticles.push(particle);
    }

    updateParticles(delta) {
        for (let index = this.activeParticles.length - 1; index >= 0; index -= 1) {
            const particle = this.activeParticles[index];
            particle.life += delta;
            const t = particle.life / Math.max(particle.maxLife, 0.0001);
            if (t >= 1) {
                if (particle.smokeOnDeath && this.freeParticles.length > 0) {
                    this.spawnSmokeFromExpiredFlame(particle);
                }
                particle.sprite.visible = false;
                particle.material.opacity = 0;
                this.activeParticles.splice(index, 1);
                this.freeParticles.push(particle);
                continue;
            }

            const drag = particle.kind === 'smoke' ? 1.15 : (particle.kind === 'fire' ? 2.4 : 0.35);
            const dragFactor = Math.max(0, 1 - drag * delta);
            particle.velocityX *= dragFactor;
            particle.velocityY *= dragFactor;
            if (particle.kind !== 'water') {
                particle.velocityY += (particle.kind === 'smoke' ? 0.9 : 1.4) * delta;
            }
            particle.sprite.position.x += particle.velocityX * delta;
            particle.sprite.position.y += particle.velocityY * delta;
            particle.rotation += particle.spin * delta;
            particle.sprite.rotation.z = particle.rotation;

            const flameBloom = particle.kind === 'fire' ? Math.sin(Math.PI * Math.min(1, t)) : 0;
            const scaleX = THREE.MathUtils.lerp(particle.scaleX, particle.endScaleX, t) * (1 + flameBloom * 0.35);
            const scaleY = THREE.MathUtils.lerp(particle.scaleY, particle.endScaleY, t) * (1 + flameBloom * 0.2);
            particle.sprite.scale.set(scaleX, scaleY, 1);
            const baseOpacity = particle.kind === 'water' ? 0.72 : (particle.kind === 'smoke' ? 0.32 : 1.0);
            const fade = particle.kind === 'fire'
                ? Math.max(0, 1 - Math.pow(t, 1.35))
                : (1 - t);
            particle.material.opacity = baseOpacity * fade;
        }
    }

    spawnSmokeFromExpiredFlame(flameParticle) {
        const point = {
            x: flameParticle.sprite.position.x,
            y: flameParticle.sprite.position.y
        };
        this.spawnParticle(
            { getEffectSpawnPoint: () => point, mesh: flameParticle.sprite },
            'smoke',
            point
        );
    }

    dispose() {
        for (const object of this.objects) {
            object.dispose();
        }
        this.objects = [];
        this.activeObjects.clear();
        for (const particle of this.particles) {
            particle.sprite.removeFromParent();
            particle.material?.dispose?.();
        }
        this.particles = [];
        this.freeParticles = [];
        this.activeParticles = [];
        this.root.removeFromParent();
        for (const entry of this.textureCache.values()) {
            entry.texture?.dispose?.();
        }
        for (const texture of this.ownedFallbackTextures) {
            texture.dispose?.();
        }
    }
}
