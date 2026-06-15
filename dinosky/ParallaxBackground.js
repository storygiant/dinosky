import * as THREE from 'three';
import { loaderLoadWithRetry } from './fetchWithRetry.js';

export class ParallaxBackground {
    constructor(scene, camera, config, options = {}) {
        this.scene = scene;
        this.camera = camera;
        this.layerConfigs = Array.isArray(config) ? config : [];
        this.textureLoader = new THREE.TextureLoader(options.loadingManager);
        this.root = new THREE.Group();
        this.root.name = 'ParallaxBackground';
        this.scene.add(this.root);
        this.layers = this.layerConfigs.map((layerConfig, index) => this.createLayer(layerConfig, index));
    }

    createLayer(layerConfig, index) {
        const group = new THREE.Group();
        group.name = `ParallaxLayer:${index}`;
        group.position.z = layerConfig.z ?? -100;
        this.root.add(group);

        const layer = {
            config: {
                factorX: layerConfig.factorX ?? 0,
                factorY: layerConfig.factorY ?? 0,
                yOffset: layerConfig.yOffset ?? 0,
                z: layerConfig.z ?? -100,
                height: layerConfig.height ?? 100,
                repeatX: layerConfig.repeatX !== false
            },
            group,
            width: 0,
            geometry: null,
            meshes: [],
            material: null,
            ready: false
        };

        loaderLoadWithRetry(this.textureLoader, layerConfig.texture)
            .then((texture) => {
                this.configureTexture(texture);
                this.finishLayerSetup(layer, texture);
            })
            .catch((error) => {
                const detail = error instanceof Error
                    ? error.message
                    : (error?.message || error?.url || error?.filename || String(error));
                console.error(`[ParallaxBackground] Failed to load ${layerConfig.texture}: ${detail}`, error);
            });

        return layer;
    }

    configureTexture(texture) {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
    }

    finishLayerSetup(layer, texture) {
        const imageWidth = Math.max(texture.image?.width || 1, 1);
        const imageHeight = Math.max(texture.image?.height || 1, 1);
        const height = Math.max(layer.config.height, 0.001);
        const width = height * (imageWidth / imageHeight);
        const geometry = new THREE.PlaneGeometry(width, height);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            depthWrite: false
        });

        layer.width = width;
        layer.geometry = geometry;
        layer.material = material;
        layer.ready = true;

        this.updateLayer(layer);
    }

    getCameraBounds() {
        if (this.camera.isOrthographicCamera) {
            return {
                left: this.camera.position.x + this.camera.left,
                right: this.camera.position.x + this.camera.right
            };
        }

        const fallbackWidth = 100;
        return {
            left: this.camera.position.x - fallbackWidth * 0.5,
            right: this.camera.position.x + fallbackWidth * 0.5
        };
    }

    getVisibleWorldWidth() {
        const bounds = this.getCameraBounds();
        return Math.max(bounds.right - bounds.left, 0);
    }

    ensureLayerMeshCount(layer) {
        if (!layer.ready || !layer.geometry || !layer.material) {
            return;
        }

        const visibleWorldWidth = this.getVisibleWorldWidth();
        const requiredMeshCount = layer.config.repeatX
            ? Math.max(3, Math.ceil(visibleWorldWidth / Math.max(layer.width, 0.001)) + 2)
            : 1;

        while (layer.meshes.length < requiredMeshCount) {
            const mesh = new THREE.Mesh(layer.geometry, layer.material);
            layer.meshes.push(mesh);
            layer.group.add(mesh);
        }

        while (layer.meshes.length > requiredMeshCount) {
            const mesh = layer.meshes.pop();
            mesh.removeFromParent();
        }
    }

    layoutLayerMeshes(layer) {
        if (!layer.config.repeatX || layer.meshes.length === 0 || layer.width <= 0) {
            if (layer.meshes[0]) {
                layer.meshes[0].position.x = 0;
            }
            return;
        }

        const bounds = this.getCameraBounds();
        const groupX = layer.group.position.x;
        const startTileIndex = Math.floor((bounds.left - groupX) / layer.width) - 1;

        // Instead of waiting for a tile to leave the screen and then snapping it around, place
        // enough tiles every frame to cover the full camera width plus overscan. That keeps the
        // skyline seamless even at the extreme left/right edges and removes visible pop-in.
        for (let index = 0; index < layer.meshes.length; index += 1) {
            const tileIndex = startTileIndex + index;
            layer.meshes[index].position.x = (tileIndex + 0.5) * layer.width;
        }
    }

    updateLayer(layer) {
        if (!layer.ready) {
            return;
        }

        const camX = this.camera.position.x;
        const camY = this.camera.position.y;

        // Smaller parallax factors make distant layers drift less than the gameplay camera.
        layer.group.position.x = -camX * layer.config.factorX;
        layer.group.position.y = layer.config.yOffset - camY * layer.config.factorY;
        layer.group.position.z = layer.config.z;

        this.ensureLayerMeshCount(layer);
        this.layoutLayerMeshes(layer);
    }

    // frontLayerOnly=true: keep the frontmost layer visible, hide all layers behind it.
    setBackgroundLayersVisible(visible) {
        const frontIndex = this.layers.length - 1;
        for (let i = 0; i < this.layers.length; i++) {
            this.layers[i].group.visible = visible || i === frontIndex;
        }
    }

    update() {
        for (const layer of this.layers) {
            this.updateLayer(layer);
        }
    }

    dispose() {
        this.root.removeFromParent();

        for (const layer of this.layers) {
            layer.geometry?.dispose?.();
            layer.material?.dispose?.();
        }
    }
}
