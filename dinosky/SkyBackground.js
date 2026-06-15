import * as THREE from 'three';

export class SkyBackground {
    constructor(scene, camera, config = {}) {
        this.scene = scene;
        this.camera = camera;
        this.config = {
            colorTop: config.colorTop ?? 0x111111,
            colorBottom: config.colorBottom ?? 0xffffff,
            width: config.width ?? null,
            height: config.height ?? 1000,
            bottomY: config.bottomY ?? 0,
            z: config.z ?? -900
        };

        this.material = this.createMaterial();
        this.mesh = this.createMesh();
        this.scene.add(this.mesh);
        this.update();
    }

    createMaterial() {
        return new THREE.ShaderMaterial({
            uniforms: {
                colorTop: { value: new THREE.Color(this.config.colorTop) },
                colorBottom: { value: new THREE.Color(this.config.colorBottom) },
                planeHeight: { value: this.config.height }
            },
            vertexShader: `
                varying float vLocalY;

                void main() {
                    // Keep the fragment shader in local plane space so the gradient stays stable
                    // even while the whole sky plane follows the camera around the level.
                    vLocalY = position.y;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 colorTop;
                uniform vec3 colorBottom;
                uniform float planeHeight;

                varying float vLocalY;

                void main() {
                    // Convert local Y from [-height/2, +height/2] into a 0..1 blend factor, then
                    // mix bottom and top colors to create a simple vertical atmosphere gradient.
                    float t = clamp((vLocalY + planeHeight * 0.5) / planeHeight, 0.0, 1.0);
                    vec3 color = mix(colorBottom, colorTop, t);
                    gl_FragColor = vec4(color, 1.0);
                }
            `,
            depthWrite: false,
            depthTest: false,
            side: THREE.DoubleSide
        });
    }

    createMesh() {
        const geometry = new THREE.PlaneGeometry(this.getSkyWidth(), this.config.height);
        const mesh = new THREE.Mesh(geometry, this.material);
        mesh.position.y = this.config.bottomY + this.config.height * 0.5;
        mesh.position.z = this.config.z;
        mesh.renderOrder = -1000;
        return mesh;
    }

    getSkyWidth() {
        if (typeof this.config.width === 'number' && this.config.width > 0) {
            return this.config.width;
        }

        if (this.camera?.isOrthographicCamera) {
            return Math.max(this.camera.right - this.camera.left, 1);
        }

        return 2000;
    }

    getBottomY() {
        return this.config.bottomY;
    }

    getTopY() {
        return this.config.bottomY + this.config.height;
    }

    update() {
        // The sky gradient is anchored in world space: the bottom of the plane stays at the
        // configured level bottom, and the camera simply moves over that gradient as the dino
        // climbs. X can still follow the camera so the plane always covers the visible width.
        this.mesh.position.x = this.camera.position.x;
        this.mesh.position.y = this.config.bottomY + this.config.height * 0.5;
        this.mesh.position.z = this.config.z;

        const desiredWidth = this.getSkyWidth();
        if (Math.abs(this.mesh.scale.x - 1) > 0.0001 || Math.abs(this.mesh.geometry.parameters.width - desiredWidth) > 0.0001) {
            this.mesh.geometry.dispose();
            this.mesh.geometry = new THREE.PlaneGeometry(desiredWidth, this.config.height);
        }
    }

    dispose() {
        this.mesh.removeFromParent();
        this.mesh.geometry?.dispose?.();
        this.material?.dispose?.();
    }
}
