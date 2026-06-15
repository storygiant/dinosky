import * as THREE from 'three';

// InfernoShockwave — the visual half of the "Dyno Fury" ultimate.
//
// A single full-screen-ish quad centred on the blast origin renders an expanding,
// fire-coloured shockwave ring plus a bright central flash via a custom shader. All the
// motion lives in one `uProgress` uniform (0 → 1 over the wave's lifetime), so updating
// the effect each frame is a single uniform write — no per-frame geometry churn.
//
// The gameplay half (damage / knockback / terrain shatter) is applied once at detonation
// time by LevelObjectManager.detonateInferno(); this class is purely cosmetic and safe to
// run (or fail) independently of game state.

const VERTEX_SHADER = /* glsl */`
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const FRAGMENT_SHADER = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform float uProgress;   // 0 → 1 over the wave lifetime
    uniform vec3  uCoreColor;  // hot inner colour
    uniform vec3  uEdgeColor;  // cooler rim colour

    void main() {
        // Distance from the quad centre, normalised so r = 1 is the quad edge.
        vec2 p = vUv - 0.5;
        float r = length(p) * 2.0;

        // Eased expansion — fast out, gentle settle.
        float e = 1.0 - pow(1.0 - uProgress, 2.0);

        // --- Expanding ring -------------------------------------------------
        // Ring front races outward; its thickness grows and its brightness fades.
        float front = e;
        float thickness = mix(0.06, 0.30, e);
        float ring = 1.0 - smoothstep(0.0, thickness, abs(r - front));
        ring *= smoothstep(1.05, 0.6, r);          // clip near the quad edge
        ring *= (1.0 - e * 0.85);                  // fade as it expands

        // --- Central flash --------------------------------------------------
        // A bright core that blooms instantly then collapses.
        float flashLife = clamp(uProgress / 0.28, 0.0, 1.0);
        float flash = (1.0 - smoothstep(0.0, 0.45 + e * 0.25, r)) * (1.0 - flashLife);

        // --- Trailing heat fill --------------------------------------------
        // Soft glow inside the ring so the cleared area reads as scorched.
        float inner = smoothstep(front, front - 0.5, r) * (1.0 - e) * 0.35;

        float intensity = ring + flash * 1.4 + inner;
        if (intensity <= 0.002) discard;

        // Colour ramps from a white-hot core to the cooler rim by radius.
        vec3 col = mix(uCoreColor, uEdgeColor, clamp(r / max(front, 0.001), 0.0, 1.0));
        col = mix(col, vec3(1.0, 0.97, 0.85), flash);   // blow out the flash to near-white

        gl_FragColor = vec4(col * intensity, intensity);
    }
`;

export class InfernoShockwave {
    // The shockwave renders in its own dedicated scene+camera pass (called from main.js after
    // the main scene render), so it is guaranteed to appear on top of all tile layers, level
    // objects, and parallax backgrounds regardless of their render order or depth values.
    constructor() {
        this.active = false;
        this.elapsed = 0;
        this.duration = 0.7;
        this.radius = 0;
        this.maxRadius = 1;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uProgress: { value: 0 },
                uCoreColor: { value: new THREE.Color(1.0, 0.85, 0.35) },
                uEdgeColor: { value: new THREE.Color(1.0, 0.28, 0.05) }
            },
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });

        // Unit quad in its own isolated scene — never shares render state with the game world.
        this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 0;
        this.mesh.visible = false;

        this._scene = new THREE.Scene();
        this._scene.add(this.mesh);

        // Orthographic camera: maps world coords 1:1 so we can position the quad in game-world
        // units (centred on the blast origin). Updated each trigger via setCamera().
        this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
        this._cameraSet = false;
    }

    /** Call once after the game camera is created so the shockwave camera tracks it. */
    setCamera(gameCamera) {
        this._gameCamera = gameCamera;
    }

    /** Begin a shockwave centred at (worldX, worldY) that expands to maxRadius over durationSeconds. */
    trigger(worldX, worldY, _z, maxRadius, durationSeconds) {
        this.maxRadius = Math.max(0.5, maxRadius || 1);
        this.duration = Math.max(0.05, durationSeconds || 0.7);
        this.elapsed = 0;
        this.radius = 0;
        this.active = true;

        const span = this.maxRadius * 2;
        this.mesh.scale.set(span, span, 1);
        this.mesh.position.set(worldX, worldY, 0);
        this.material.uniforms.uProgress.value = 0;
        this.mesh.visible = true;
    }

    /** Advance the visual in wall-clock seconds (unaffected by gameplay slow-motion). */
    update(realDt) {
        if (!this.active) return;
        this.elapsed += realDt;
        const t = Math.min(1, this.elapsed / this.duration);
        this.material.uniforms.uProgress.value = t;
        this.radius = (1 - Math.pow(1 - t, 2)) * this.maxRadius;
        if (t >= 1) {
            this.active = false;
            this.mesh.visible = false;
        }
    }

    /** Render the shockwave. Call after the main scene render, before UI renders. */
    render(renderer) {
        if (!this.active || !this.mesh.visible) return;

        // Mirror the game camera's orthographic frustum so the quad sits correctly in world
        // space — the shockwave is placed at the blast's world position and sized in world units.
        const cam = this._gameCamera;
        if (cam?.isOrthographicCamera) {
            this._camera.left   = cam.position.x + cam.left;
            this._camera.right  = cam.position.x + cam.right;
            this._camera.top    = cam.position.y + cam.top;
            this._camera.bottom = cam.position.y + cam.bottom;
            this._camera.near   = -10;
            this._camera.far    = 10;
            this._camera.position.set(0, 0, 1);
            this._camera.updateProjectionMatrix();
        }

        renderer.clearDepth();
        renderer.render(this._scene, this._camera);
    }

    dispose() {
        this.mesh?.geometry?.dispose?.();
        this.material?.dispose?.();
        this.mesh = null;
        this.material = null;
        this._scene = null;
        this.active = false;
    }
}
