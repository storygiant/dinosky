import * as THREE from 'three';
import { CONFIG } from './config.js';

export const BURNABLE_SCENERY_STATE = Object.freeze({
    IDLE: 'IDLE',
    IGNITING: 'IGNITING',
    BURNING: 'BURNING',
    BURNED: 'BURNED',
    RESPAWNING: 'RESPAWNING'
});

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function asBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const lower = value.trim().toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
    }
    return fallback;
}

function asNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

const MAX_SHADER_BURN_FRONTS = 3;

function createTextureAlphaSampler(texture) {
    const image = texture?.image;
    const width = image?.naturalWidth || image?.videoWidth || image?.width || 0;
    const height = image?.naturalHeight || image?.videoHeight || image?.height || 0;
    if (!image || width <= 0 || height <= 0 || typeof document === 'undefined') {
        return null;
    }

    try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        return {
            width,
            height,
            alphaAt(u, v) {
                const x = Math.max(0, Math.min(width - 1, Math.floor(clamp01(u) * (width - 1))));
                const y = Math.max(0, Math.min(height - 1, Math.floor((1 - clamp01(v)) * (height - 1))));
                return pixels[((y * width + x) * 4) + 3] / 255;
            },
            nearestVisiblePoint(originU, originV, aspect, alphaThreshold = 0.18) {
                if (this.alphaAt(originU, originV) > alphaThreshold) {
                    return { u: clamp01(originU), v: clamp01(originV) };
                }

                let best = null;
                const stride = Math.max(1, Math.floor(Math.max(width, height) / 160));
                for (let y = 0; y < height; y += stride) {
                    const v = 1 - (y / Math.max(1, height - 1));
                    const dy = v - originV;
                    for (let x = 0; x < width; x += stride) {
                        const alpha = pixels[((y * width + x) * 4) + 3] / 255;
                        if (alpha <= alphaThreshold) {
                            continue;
                        }

                        const u = x / Math.max(1, width - 1);
                        const dx = (u - originU) * aspect;
                        const distance = Math.sqrt((dx * dx) + (dy * dy));
                        if (!best || distance < best.distance) {
                            best = { u, v, distance };
                        }
                    }
                }

                return best;
            }
        };
    } catch {
        return null;
    }
}

function createSpriteMaterial(texture, opacity = 1) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        transparent: true,
        opacity,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function createBurnMaterial({ normalTexture, burnedTexture, opacity = 1, aspect = 1 }) {
    return new THREE.ShaderMaterial({
        uniforms: {
            normalMap: { value: normalTexture },
            burnedMap: { value: burnedTexture || normalTexture },
            burnProgresses: { value: new THREE.Vector3(0, 0, 0) },
            burnOrigin0: { value: new THREE.Vector2(0.5, 0.5) },
            burnOrigin1: { value: new THREE.Vector2(0.5, 0.5) },
            burnOrigin2: { value: new THREE.Vector2(0.5, 0.5) },
            burnFrontCount: { value: 0 },
            burnAspect: { value: aspect },
            edgeWidth: { value: 0.08 },
            opacity: { value: opacity }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D normalMap;
            uniform sampler2D burnedMap;
            uniform vec3 burnProgresses;
            uniform vec2 burnOrigin0;
            uniform vec2 burnOrigin1;
            uniform vec2 burnOrigin2;
            uniform float burnFrontCount;
            uniform float burnAspect;
            uniform float edgeWidth;
            uniform float opacity;
            varying vec2 vUv;

            float burnAmountForFront(vec2 origin, float progress) {
                if (progress <= 0.001) return 0.0;
                if (progress >= 0.999) return 1.0;

                vec2 scaledUv = vec2(vUv.x * burnAspect, vUv.y);
                vec2 scaledOrigin = vec2(origin.x * burnAspect, origin.y);
                float dist = distance(scaledUv, scaledOrigin);
                float maxDist = max(
                    max(distance(scaledOrigin, vec2(0.0, 0.0)), distance(scaledOrigin, vec2(burnAspect, 0.0))),
                    max(distance(scaledOrigin, vec2(0.0, 1.0)), distance(scaledOrigin, vec2(burnAspect, 1.0)))
                );
                float radius = progress * (maxDist + edgeWidth);
                return 1.0 - smoothstep(radius - edgeWidth, radius + edgeWidth, dist);
            }

            void main() {
                vec4 spriteColor  = texture2D(normalMap,  vUv);
                vec4 burnedColor  = texture2D(burnedMap,  vUv);

                vec4 color;
                float alpha;
                float burnAmount = 0.0;
                if (burnFrontCount > 0.5) burnAmount = max(burnAmount, burnAmountForFront(burnOrigin0, burnProgresses.x));
                if (burnFrontCount > 1.5) burnAmount = max(burnAmount, burnAmountForFront(burnOrigin1, burnProgresses.y));
                if (burnFrontCount > 2.5) burnAmount = max(burnAmount, burnAmountForFront(burnOrigin2, burnProgresses.z));

                if (burnAmount <= 0.001) {
                    // Not burning — pure sprite, no mask applied at all.
                    color = spriteColor;
                    alpha = spriteColor.a;
                } else if (burnAmount >= 0.999) {
                    // Fully burned — pure burnedSprite.
                    color = burnedColor;
                    alpha = burnedColor.a;
                } else {
                    color = mix(spriteColor, burnedColor, burnAmount);
                    alpha = mix(spriteColor.a, burnedColor.a, burnAmount);
                }

                color.a = alpha * opacity;
                if (color.a < 0.01) discard;
                // Convert linear to sRGB to match MeshBasicMaterial output.
                color.rgb = pow(color.rgb, vec3(1.0 / 2.2));
                gl_FragColor = color;
            }
        `,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        side: THREE.DoubleSide
    });
}

function createBurnGlowMaterial({ alphaTexture, opacity = 1, aspect = 1 }) {
    return new THREE.ShaderMaterial({
        uniforms: {
            alphaMap: { value: alphaTexture },
            burnProgresses: { value: new THREE.Vector3(0, 0, 0) },
            burnOrigin0: { value: new THREE.Vector2(0.5, 0.5) },
            burnOrigin1: { value: new THREE.Vector2(0.5, 0.5) },
            burnOrigin2: { value: new THREE.Vector2(0.5, 0.5) },
            burnFrontCount: { value: 0 },
            burnAspect: { value: aspect },
            glowWidth: { value: 0.025 },
            glowStrength: { value: 0.6 },
            opacity: { value: opacity }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D alphaMap;
            uniform vec3 burnProgresses;
            uniform vec2 burnOrigin0;
            uniform vec2 burnOrigin1;
            uniform vec2 burnOrigin2;
            uniform float burnFrontCount;
            uniform float burnAspect;
            uniform float glowWidth;
            uniform float glowStrength;
            uniform float opacity;
            varying vec2 vUv;

            float burnAmountForFront(vec2 origin, float progress) {
                if (progress <= 0.001) return 0.0;
                if (progress >= 0.999) return 1.0;
                vec2 scaledUv = vec2(vUv.x * burnAspect, vUv.y);
                vec2 scaledOrigin = vec2(origin.x * burnAspect, origin.y);
                float dist = distance(scaledUv, scaledOrigin);
                float maxDist = max(
                    max(distance(scaledOrigin, vec2(0.0, 0.0)), distance(scaledOrigin, vec2(burnAspect, 0.0))),
                    max(distance(scaledOrigin, vec2(0.0, 1.0)), distance(scaledOrigin, vec2(burnAspect, 1.0)))
                );
                float radius = progress * (maxDist + glowWidth);
                return 1.0 - smoothstep(radius - glowWidth, radius + glowWidth, dist);
            }

            float glowForFront(vec2 origin, float progress) {
                if (progress <= 0.001 || progress >= 0.995) return 0.0;
                vec2 scaledUv = vec2(vUv.x * burnAspect, vUv.y);
                vec2 scaledOrigin = vec2(origin.x * burnAspect, origin.y);
                float dist = distance(scaledUv, scaledOrigin);
                float maxDist = max(
                    max(distance(scaledOrigin, vec2(0.0, 0.0)), distance(scaledOrigin, vec2(burnAspect, 0.0))),
                    max(distance(scaledOrigin, vec2(0.0, 1.0)), distance(scaledOrigin, vec2(burnAspect, 1.0)))
                );
                float radius = progress * (maxDist + glowWidth);
                return 1.0 - smoothstep(0.0, glowWidth, abs(dist - radius));
            }

            void main() {
                vec4 spriteColor = texture2D(alphaMap, vUv);
                if (spriteColor.a < 0.02 || burnFrontCount < 0.5) discard;

                float amount0 = burnFrontCount > 0.5 ? burnAmountForFront(burnOrigin0, burnProgresses.x) : 0.0;
                float amount1 = burnFrontCount > 1.5 ? burnAmountForFront(burnOrigin1, burnProgresses.y) : 0.0;
                float amount2 = burnFrontCount > 2.5 ? burnAmountForFront(burnOrigin2, burnProgresses.z) : 0.0;

                // Multiple burn fronts may overlap. Hide each front's glow where another
                // front has already revealed the burnedSprite, so we do not visually burn
                // the same branch twice.
                float open0 = 1.0 - smoothstep(0.08, 0.28, max(amount1, amount2));
                float open1 = 1.0 - smoothstep(0.08, 0.28, max(amount0, amount2));
                float open2 = 1.0 - smoothstep(0.08, 0.28, max(amount0, amount1));
                float ring0 = glowForFront(burnOrigin0, burnProgresses.x) * open0;
                float ring1 = glowForFront(burnOrigin1, burnProgresses.y) * open1;
                float ring2 = glowForFront(burnOrigin2, burnProgresses.z) * open2;
                float ring = max(ring0, max(ring1, ring2));
                if (ring <= 0.001) discard;

                vec3 hotCore = vec3(1.0, 0.9, 0.28);
                vec3 orangeGlow = vec3(1.0, 0.28, 0.02);
                vec3 color = mix(orangeGlow, hotCore, ring);
                gl_FragColor = vec4(color * glowStrength, ring * spriteColor.a * opacity);
            }
        `,
        transparent: true,
        depthTest: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
    });
}

export class BurnableSceneryObject {
    constructor({
        object,
        normalTexture,
        burnedTexture,
        effectConfig = {},
        sceneRoot,
        renderOrder = 0,
        layerDepth = 0,
        debug = false
    }) {
        this.id = object.id ?? object.name ?? `burnable-${Math.random().toString(36).slice(2)}`;
        this.name = object.name || '';
        this.type = object.type || '';
        this.properties = object.properties || {};
        this.sourceLayer = String(object.sourceLayer || '').trim();
        this.effectConfig = effectConfig || {};
        this.debug = debug;
        this.sceneRoot = sceneRoot;
        this.renderOrder = renderOrder;
        this.layerDepth = layerDepth;
        this.normalTexture = normalTexture;
        this.burnedTexture = burnedTexture || normalTexture;
        this.alphaSampler = createTextureAlphaSampler(burnedTexture) || createTextureAlphaSampler(normalTexture);

        this.sprite = this.properties.sprite || null;
        this.burnedSprite = this.properties.burnedSprite || this.effectConfig.replaceSprite || null;
        // Burn masks are no longer required: the transition now starts at the fire hit
        // point and grows outward in a circular world-space reveal.
        this.burnMask = this.properties.burnMask || null;
        this.triggerEffect = String(this.properties.triggerEffect || 'defaultFire').trim() || 'defaultFire';
        this.burnable = asBoolean(this.properties.burnable, true);
        this.burnDuration = Math.max(0.05, asNumber(this.properties.burnDuration, this.effectConfig.duration ?? 8));
        this.igniteDuration = Math.max(0, asNumber(this.properties.igniteDuration, this.effectConfig.igniteDuration ?? 0.12));
        this.canRespawn = asBoolean(this.properties.canRespawn, false);
        this.respawnDelay = Math.max(0, asNumber(this.properties.respawnDelay, 60));
        this.hitRadius = Math.max(0.05, asNumber(this.properties.hitRadius, 0));
        this.opacity = asNumber(object.opacity, 1);

        const width = Math.max(object.width || 0, 0.1);
        const height = Math.max(object.height || 0, 0.1);
        const usesBottomAnchor = Boolean(object.gid);
        this.bounds = usesBottomAnchor
            ? {
                left: object.worldX,
                right: object.worldX + width,
                bottom: object.worldY,
                top: object.worldY + height
            }
            : {
                left: object.worldX,
                right: object.worldX + width,
                bottom: object.worldY - height,
                top: object.worldY
            };
        this.bounds.width = this.bounds.right - this.bounds.left;
        this.bounds.height = this.bounds.top - this.bounds.bottom;
        this.aspect = this.bounds.width / Math.max(this.bounds.height, 0.0001);
        this.centerX = (this.bounds.left + this.bounds.right) * 0.5;
        this.centerY = (this.bounds.bottom + this.bounds.top) * 0.5;
        this.radius = this.hitRadius || Math.hypot(this.bounds.width, this.bounds.height) * 0.5;

        this.state = BURNABLE_SCENERY_STATE.IDLE;
        this.visible = false;
        this._visibilitySuppressors = new Set();
        this._visualOpacity = 1;
        this.glowEffectsEnabled = true;
        this.burnProgress = 0;
        this.burnOriginUv = new THREE.Vector2(0.5, 0.5);
        this.burnFronts = [];
        this.maxBurnFronts = Math.max(1, Math.min(
            MAX_SHADER_BURN_FRONTS,
            Math.floor(asNumber(this.properties.maxBurnFronts, CONFIG.BURNABLE_SCENERY?.maxBurnFronts ?? 3))
        ));
        this.igniteStartTime = 0;
        this.burnStartTime = 0;
        this.respawnAtTime = 0;
        this._lastLoggedState = null;

        const geometry = new THREE.PlaneGeometry(this.bounds.width, this.bounds.height);
        this.idleMaterial = createSpriteMaterial(normalTexture, this.opacity);
        this.burnedMaterial = createSpriteMaterial(this.burnedTexture, this.opacity);
        this.burnMaterial = null;
        this.glowMaterial = null;
        this.glowMesh = null;
        this.mesh = new THREE.Mesh(geometry, this.idleMaterial);
        this.mesh.name = `BurnableScenery:${this.id}`;
        this.mesh.position.set(this.centerX, this.centerY, layerDepth);
        this.mesh.renderOrder = renderOrder;
        this.mesh.frustumCulled = true;
        sceneRoot.add(this.mesh);

        this.debugLine = null;
        if (this.debug) {
            this.debugLine = this.createDebugLine(layerDepth + 0.05, renderOrder + 10);
            sceneRoot.add(this.debugLine);
        }

        this.setVisible(false);
    }

    applyVisualOpacity() {
        const alpha = this.opacity * this._visualOpacity;
        this.idleMaterial.opacity = alpha;
        this.burnedMaterial.opacity = alpha;
        if (this.burnMaterial?.uniforms?.opacity) {
            this.burnMaterial.uniforms.opacity.value = alpha;
        }
        if (this.glowMaterial?.uniforms?.opacity) {
            this.glowMaterial.uniforms.opacity.value = alpha;
        }
    }

    ensureBurnResources() {
        if (!this.burnMaterial) {
            // Idle and fully burned scenery use cheap MeshBasicMaterial. The shader only
            // exists while a prop is actively transitioning, which keeps large forests cheap.
            this.burnMaterial = createBurnMaterial({
                normalTexture: this.normalTexture,
                burnedTexture: this.burnedTexture,
                opacity: this.opacity,
                aspect: this.aspect
            });
        }

        if (!this.glowMesh) {
            // A tiny additive overlay makes the active burn front read as hot fire without
            // simulating pixels or adding expensive dynamic geometry.
            this.glowMaterial = createBurnGlowMaterial({
                alphaTexture: this.burnedTexture || this.normalTexture,
                opacity: this.opacity,
                aspect: this.aspect
            });
            this.glowMesh = new THREE.Mesh(this.mesh.geometry.clone(), this.glowMaterial);
            this.glowMesh.name = `BurnableSceneryGlow:${this.id}`;
            this.glowMesh.position.set(this.centerX, this.centerY, this.layerDepth + 0.01);
            this.glowMesh.renderOrder = this.renderOrder + 0.2;
            this.glowMesh.frustumCulled = true;
            this.sceneRoot.add(this.glowMesh);
        }

        if (this.mesh.material !== this.burnMaterial) {
            this.mesh.material = this.burnMaterial;
        }
    }

    createDebugLine(z, renderOrder) {
        const points = [
            this.bounds.left, this.bounds.bottom, z,
            this.bounds.right, this.bounds.bottom, z,
            this.bounds.right, this.bounds.top, z,
            this.bounds.left, this.bounds.top, z,
            this.bounds.left, this.bounds.bottom, z
        ];
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
        const material = new THREE.LineBasicMaterial({
            color: 0x33ff88,
            transparent: true,
            opacity: 0.75,
            depthTest: false,
            depthWrite: false
        });
        const line = new THREE.Line(geometry, material);
        line.name = `BurnableSceneryDebug:${this.id}`;
        line.renderOrder = renderOrder;
        line.frustumCulled = false;
        return line;
    }

    isActive() {
        return this.state === BURNABLE_SCENERY_STATE.IGNITING ||
            this.state === BURNABLE_SCENERY_STATE.BURNING ||
            this.state === BURNABLE_SCENERY_STATE.RESPAWNING;
    }

    isIgnitable() {
        return this.burnable &&
            (
                this.state === BURNABLE_SCENERY_STATE.IDLE ||
                this.state === BURNABLE_SCENERY_STATE.IGNITING ||
                this.state === BURNABLE_SCENERY_STATE.BURNING
            ) &&
            this.burnFronts.length < this.maxBurnFronts;
    }

    overlapsPoint(x, y, padding = 0) {
        return x >= this.bounds.left - padding &&
            x <= this.bounds.right + padding &&
            y >= this.bounds.bottom - padding &&
            y <= this.bounds.top + padding;
    }

    overlapsCircle(x, y, radius = 0) {
        const closestX = THREE.MathUtils.clamp(x, this.bounds.left, this.bounds.right);
        const closestY = THREE.MathUtils.clamp(y, this.bounds.bottom, this.bounds.top);
        const dx = x - closestX;
        const dy = y - closestY;
        const hitRadius = Math.max(0, radius);
        return dx * dx + dy * dy <= hitRadius * hitRadius;
    }

    setBurnOriginFromWorld(x, y) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            this.burnOriginUv.set(0.5, 0.5);
            return;
        }

        const u = clamp01((x - this.bounds.left) / Math.max(this.bounds.width, 0.0001));
        const v = clamp01((y - this.bounds.bottom) / Math.max(this.bounds.height, 0.0001));
        this.burnOriginUv.set(u, v);
    }

    alphaAtWorld(x, y) {
        if (!this.alphaSampler) {
            return 1;
        }

        const u = (x - this.bounds.left) / Math.max(this.bounds.width, 0.0001);
        const v = (y - this.bounds.bottom) / Math.max(this.bounds.height, 0.0001);
        return this.alphaSampler.alphaAt(u, v);
    }

    getMaxScaledBurnDistance(origin = this.burnOriginUv) {
        return Math.max(
            Math.hypot(origin.x * this.aspect, origin.y),
            Math.hypot((origin.x * this.aspect) - this.aspect, origin.y),
            Math.hypot(origin.x * this.aspect, origin.y - 1),
            Math.hypot((origin.x * this.aspect) - this.aspect, origin.y - 1)
        );
    }

    moveTransparentOriginToVisiblePixel(origin = this.burnOriginUv) {
        if (!this.alphaSampler?.nearestVisiblePoint) {
            return origin;
        }

        const nearest = this.alphaSampler.nearestVisiblePoint(
            origin.x,
            origin.y,
            this.aspect
        );
        if (nearest) {
            // If fire hits transparent image space, move the origin to the nearest visible
            // burnedSprite pixel. This removes invisible travel time without starting as an
            // already-grown circle.
            origin.set(nearest.u, nearest.v);
        }
        return origin;
    }

    getFrontProgress(front, gameTime) {
        return clamp01((gameTime - front.startTime) / this.burnDuration);
    }

    getFrontBurnAmountAtUv(front, u, v, gameTime, edgeWidth = 0.08) {
        const progress = this.getFrontProgress(front, gameTime);
        if (progress <= 0.001) return 0;
        if (progress >= 0.999) return 1;

        const scaledX = u * this.aspect;
        const scaledOriginX = front.origin.x * this.aspect;
        const dx = scaledX - scaledOriginX;
        const dy = v - front.origin.y;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        const maxDistance = this.getMaxScaledBurnDistance(front.origin);
        const radius = progress * (maxDistance + edgeWidth);
        const lower = radius - edgeWidth;
        const upper = radius + edgeWidth;
        const t = clamp01((distance - lower) / Math.max(0.0001, upper - lower));
        const smooth = t * t * (3 - (2 * t));
        return 1 - smooth;
    }

    getOtherFrontBurnAmountAtUv(activeFront, u, v, gameTime) {
        let amount = 0;
        for (const front of this.burnFronts) {
            if (front === activeFront) {
                continue;
            }
            amount = Math.max(amount, this.getFrontBurnAmountAtUv(front, u, v, gameTime));
        }
        return amount;
    }

    getCombinedBurnAmountAtUv(u, v, gameTime) {
        let amount = 0;
        for (const front of this.burnFronts) {
            amount = Math.max(amount, this.getFrontBurnAmountAtUv(front, u, v, gameTime));
        }
        return amount;
    }

    getBurnProgressForTime(gameTime) {
        if (this.burnFronts.length === 0) {
            return 0;
        }
        return Math.max(...this.burnFronts.map((front) => this.getFrontProgress(front, gameTime)));
    }

    getAllFrontsComplete(gameTime) {
        return this.burnFronts.length > 0 &&
            this.burnFronts.every((front) => this.getFrontProgress(front, gameTime) >= 1);
    }

    createBurnOriginFromWorld(x, y) {
        const origin = new THREE.Vector2(0.5, 0.5);
        if (Number.isFinite(x) && Number.isFinite(y)) {
            origin.set(
                clamp01((x - this.bounds.left) / Math.max(this.bounds.width, 0.0001)),
                clamp01((y - this.bounds.bottom) / Math.max(this.bounds.height, 0.0001))
            );
        }
        return this.moveTransparentOriginToVisiblePixel(origin);
    }

    isDuplicateBurnFront(origin) {
        const minDistance = asNumber(this.properties.minBurnFrontDistance, 0.14);
        return this.burnFronts.some((front) => {
            const dx = (front.origin.x - origin.x) * this.aspect;
            const dy = front.origin.y - origin.y;
            return Math.sqrt((dx * dx) + (dy * dy)) < minDistance;
        });
    }

    addBurnFront(gameTime, source = {}) {
        if (this.burnFronts.length >= this.maxBurnFronts) {
            return false;
        }

        const origin = this.createBurnOriginFromWorld(source.x, source.y);
        if (this.isDuplicateBurnFront(origin)) {
            return false;
        }
        if (this.getCombinedBurnAmountAtUv(origin.x, origin.y, gameTime) > 0.58) {
            return false;
        }

        const startTime = this.state === BURNABLE_SCENERY_STATE.IDLE
            ? gameTime + this.igniteDuration
            : gameTime;
        this.burnFronts.push({ origin, startTime });
        this.burnOriginUv.copy(origin);
        this.igniteStartTime = Math.min(this.igniteStartTime || gameTime, gameTime);
        this.burnStartTime = Math.min(this.burnStartTime || startTime, startTime);
        return true;
    }

    ignite(gameTime, source = {}) {
        if (!this.isIgnitable()) {
            return false;
        }

        const wasIdle = this.state === BURNABLE_SCENERY_STATE.IDLE;
        if (!this.addBurnFront(gameTime, source)) {
            return false;
        }

        this.ensureBurnResources();
        if (wasIdle) {
            this.state = BURNABLE_SCENERY_STATE.IGNITING;
            this.burnProgress = 0;
        } else {
            this.state = BURNABLE_SCENERY_STATE.BURNING;
        }
        this.updateBurnUniforms(gameTime);
        this.logState(source);
        return true;
    }

    updateState(gameTime) {
        if (this.state === BURNABLE_SCENERY_STATE.IGNITING && gameTime >= this.burnStartTime) {
            this.state = BURNABLE_SCENERY_STATE.BURNING;
            this.logState();
        }

        if (this.state === BURNABLE_SCENERY_STATE.BURNING) {
            this.burnProgress = this.getBurnProgressForTime(gameTime);
            if (this.getAllFrontsComplete(gameTime)) {
                this.finishBurn(gameTime);
            }
        }

        if (this.state === BURNABLE_SCENERY_STATE.RESPAWNING && gameTime >= this.respawnAtTime) {
            this.resetForRespawn();
        }
    }

    finishBurn(gameTime) {
        this.burnProgress = 1;
        const endState = String(this.effectConfig.endState || 'burned').toLowerCase();
        if (endState === 'idle') {
            this.resetForRespawn();
            return;
        }

        this.state = this.canRespawn
            ? BURNABLE_SCENERY_STATE.RESPAWNING
            : BURNABLE_SCENERY_STATE.BURNED;
        this.respawnAtTime = gameTime + this.respawnDelay;
        this.mesh.material = this.burnedMaterial;
        this.updateVisual(gameTime, this.visible);
        this.logState();
    }

    resetForRespawn() {
        this.state = BURNABLE_SCENERY_STATE.IDLE;
        this.burnProgress = 0;
        this.burnFronts.length = 0;
        this.burnOriginUv.set(0.5, 0.5);
        this.igniteStartTime = 0;
        this.burnStartTime = 0;
        this.respawnAtTime = 0;
        this.mesh.material = this.idleMaterial;
        this.updateVisual(0, this.visible);
        this.logState();
    }

    updateVisual(gameTime, visible) {
        const renderVisible = visible && this._visibilitySuppressors.size === 0;
        if (this.state === BURNABLE_SCENERY_STATE.BURNING) {
            this.burnProgress = this.getBurnProgressForTime(gameTime);
        } else if (
            this.state === BURNABLE_SCENERY_STATE.BURNED ||
            this.state === BURNABLE_SCENERY_STATE.RESPAWNING
        ) {
            this.burnProgress = 1;
        } else {
            this.burnProgress = 0;
        }

        if (
            this.state === BURNABLE_SCENERY_STATE.IGNITING ||
            this.state === BURNABLE_SCENERY_STATE.BURNING
        ) {
            this.ensureBurnResources();
            this.updateBurnUniforms(gameTime);
        } else {
            this.mesh.material = this.burnProgress >= 1 ? this.burnedMaterial : this.idleMaterial;
        }
        this.mesh.visible = renderVisible;
        if (this.glowMesh) {
            this.glowMesh.visible = renderVisible && this.glowEffectsEnabled && this.state === BURNABLE_SCENERY_STATE.BURNING;
        }
        if (this.debugLine) {
            this.debugLine.visible = renderVisible;
            const color = this.state === BURNABLE_SCENERY_STATE.BURNING
                ? 0xff7733
                : (this.state === BURNABLE_SCENERY_STATE.BURNED || this.state === BURNABLE_SCENERY_STATE.RESPAWNING ? 0x777777 : 0x33ff88);
            this.debugLine.material.color.setHex(color);
        }
    }

    setVisible(visible) {
        this.visible = visible;
        this.applyVisualOpacity();
        const renderVisible = visible && this._visibilitySuppressors.size === 0;
        this.mesh.visible = renderVisible;
        if (this.glowMesh) {
            this.glowMesh.visible = renderVisible && this.glowEffectsEnabled && this.state === BURNABLE_SCENERY_STATE.BURNING;
        }
        if (this.debugLine) {
            this.debugLine.visible = renderVisible;
        }
    }

    setVisualOpacity(opacity = 1) {
        this._visualOpacity = clamp01(opacity);
        this.applyVisualOpacity();
    }

    setVisibilitySuppressed(key, suppressed) {
        const token = String(key || '').trim();
        if (!token) {
            return;
        }
        if (suppressed) {
            this._visibilitySuppressors.add(token);
        } else {
            this._visibilitySuppressors.delete(token);
        }
        this.setVisible(this.visible);
    }

    setGlowEffectsEnabled(enabled) {
        this.glowEffectsEnabled = enabled !== false;
        if (this.glowMesh) {
            this.glowMesh.visible = this.visible && this.glowEffectsEnabled && this.state === BURNABLE_SCENERY_STATE.BURNING;
        }
    }

    updateBurnUniforms(gameTime) {
        if (!this.burnMaterial || !this.glowMaterial) {
            return;
        }
        const progressValues = [0, 0, 0];
        const origins = [
            this.burnMaterial.uniforms.burnOrigin0.value,
            this.burnMaterial.uniforms.burnOrigin1.value,
            this.burnMaterial.uniforms.burnOrigin2.value
        ];
        const glowOrigins = [
            this.glowMaterial.uniforms.burnOrigin0.value,
            this.glowMaterial.uniforms.burnOrigin1.value,
            this.glowMaterial.uniforms.burnOrigin2.value
        ];

        for (let index = 0; index < MAX_SHADER_BURN_FRONTS; index += 1) {
            const front = this.burnFronts[index];
            if (front) {
                progressValues[index] = this.getFrontProgress(front, gameTime);
                origins[index].copy(front.origin);
                glowOrigins[index].copy(front.origin);
            } else {
                origins[index].set(0.5, 0.5);
                glowOrigins[index].set(0.5, 0.5);
            }
        }

        this.burnMaterial.uniforms.burnProgresses.value.set(progressValues[0], progressValues[1], progressValues[2]);
        this.glowMaterial.uniforms.burnProgresses.value.set(progressValues[0], progressValues[1], progressValues[2]);
        this.burnMaterial.uniforms.burnFrontCount.value = this.burnFronts.length;
        this.glowMaterial.uniforms.burnFrontCount.value = this.burnFronts.length;
    }

    getEffectSpawnPoint(kind = 'fire', gameTime = 0) {
        const activeFronts = this.burnFronts.filter((front) => {
            const progress = this.getFrontProgress(front, gameTime);
            return progress > 0.001 && progress < 1;
        });
        const front = activeFronts.length > 0
            ? activeFronts[Math.floor(Math.random() * activeFronts.length)]
            : this.burnFronts[Math.max(0, this.burnFronts.length - 1)];
        const origin = front?.origin || this.burnOriginUv;
        const originX = THREE.MathUtils.lerp(this.bounds.left, this.bounds.right, origin.x);
        const originY = THREE.MathUtils.lerp(this.bounds.bottom, this.bounds.top, origin.y);
        const progress = front ? Math.max(this.getFrontProgress(front, gameTime), 0.08) : 0.08;
        const maxRadius = Math.max(
            Math.hypot(originX - this.bounds.left, originY - this.bounds.bottom),
            Math.hypot(originX - this.bounds.right, originY - this.bounds.bottom),
            Math.hypot(originX - this.bounds.left, originY - this.bounds.top),
            Math.hypot(originX - this.bounds.right, originY - this.bounds.top)
        );
        const currentRadius = maxRadius * progress;
        const isSmoke = kind === 'smoke';
        const isWater = kind === 'water';
        const isFire = kind === 'fire';
        const maxAttempts = isFire
            ? Math.round(92 + progress * 56)
            : 28;
        let bestFireCandidate = null;
        let bestFireScore = -Infinity;

        // Rejection sampling keeps particles on visible burnedSprite pixels. This avoids
        // the old rectangle-edge artifact when the expanding circle reaches transparent
        // image space outside the tree/prop silhouette.
        for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const radiusFactor = isSmoke
                ? (0.18 + Math.random() * 0.62)
                : (
                    isWater
                        ? (0.35 + Math.random() * 0.65)
                        : ((0.9 - progress * 0.08) + Math.random() * (0.12 + progress * 0.16))
                );
            const radius = currentRadius * radiusFactor;
            const x = originX + Math.cos(angle) * radius;
            const y = originY + Math.sin(angle) * radius;
            if (
                x >= this.bounds.left &&
                x <= this.bounds.right &&
                y >= this.bounds.bottom &&
                y <= this.bounds.top &&
                this.alphaAtWorld(x, y) > 0.18
            ) {
                const u = (x - this.bounds.left) / Math.max(this.bounds.width, 0.0001);
                const v = (y - this.bounds.bottom) / Math.max(this.bounds.height, 0.0001);
                const frontBurnAmount = front
                    ? this.getFrontBurnAmountAtUv(front, u, v, gameTime)
                    : 0;
                const otherBurnAmount = this.getOtherFrontBurnAmountAtUv(front, u, v, gameTime);
                if (otherBurnAmount > (isFire ? 0.12 : 0.08)) {
                    continue;
                }

                if (kind === 'smoke') {
                    // Smoke trails the burned interior, but only for this front's own newly
                    // burned pixels. Overlap zones are skipped so two circles do not smoke
                    // from the same already-charred branch.
                    if (frontBurnAmount > 0.45) {
                        return { x, y };
                    }
                    continue;
                }

                if (kind === 'fire') {
                    // Flames sit on the live edge of the circle instead of the already
                    // burned interior. This keeps new hit fronts visible without stacking
                    // fire on places another front already consumed. Keep the band wider
                    // near the end of a front so thin lower branches still keep emitting
                    // visible flames instead of falling back to glow only.
                    const minFireBand = 0.01;
                    const maxFireBand = Math.min(0.999, 0.95 + progress * 0.045);
                    if (frontBurnAmount > minFireBand && frontBurnAmount < maxFireBand) {
                        return { x, y };
                    }
                    const distanceToBand = frontBurnAmount < minFireBand
                        ? (minFireBand - frontBurnAmount)
                        : Math.max(0, frontBurnAmount - maxFireBand);
                    const edgeBias = 1 - Math.min(1, distanceToBand / 0.22);
                    const radiusBias = 1 - Math.min(1, Math.abs(radiusFactor - 1) / 0.3);
                    const score = edgeBias * 1.7 + radiusBias;
                    if (score > bestFireScore) {
                        bestFireScore = score;
                        bestFireCandidate = { x, y };
                    }
                    continue;
                }

                if (kind === 'water' || frontBurnAmount > 0.08) {
                    return { x, y };
                }
            }
        }

        if (isFire && bestFireCandidate) {
            return bestFireCandidate;
        }

        return null;
    }

    logState(extra = {}) {
        if (!this.debug || this._lastLoggedState === this.state) {
            return;
        }

        this._lastLoggedState = this.state;
        console.log('Burnable object state', {
            objectId: this.id,
            state: this.state,
            burnProgress: this.burnProgress,
            visible: this.visible,
            triggerEffect: this.triggerEffect,
            ...extra
        });
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry?.dispose?.();
        this.idleMaterial?.dispose?.();
        if (this.burnedMaterial !== this.idleMaterial) {
            this.burnedMaterial?.dispose?.();
        }
        this.burnMaterial?.dispose?.();
        this.glowMesh?.removeFromParent?.();
        this.glowMesh?.geometry?.dispose?.();
        this.glowMaterial?.dispose?.();
        this.debugLine?.removeFromParent?.();
        this.debugLine?.geometry?.dispose?.();
        this.debugLine?.material?.dispose?.();
    }
}
