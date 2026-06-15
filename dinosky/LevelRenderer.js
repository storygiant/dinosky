import * as THREE from 'three';
import { CONFIG } from './config.js';
import { GAMEPLAY_TYPES } from './TiledLevel.js';

const TILE_CHUNK_SIZE = 64;

function normalizeLayerToken(value) {
    return String(value || '').trim().toLowerCase();
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function applyNodeOpacity(node, opacity = 1, hidden = false) {
    const alpha = clamp01(opacity);
    let hasRenderableChild = false;

    node?.traverse?.((child) => {
        if (!child?.isMesh || !child.material) {
            return;
        }
        hasRenderableChild = true;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const uniqueMaterials = materials.map((material) => {
            if (!material?.isMaterial) {
                return material;
            }
            if (!material.userData.__zoneFadeClone) {
                const clone = material.clone();
                clone.userData = {
                    ...clone.userData,
                    __zoneFadeClone: true,
                    __zoneFadeBaseOpacity: typeof material.opacity === 'number' ? material.opacity : 1
                };
                return clone;
            }
            if (!Number.isFinite(material.userData.__zoneFadeBaseOpacity)) {
                material.userData.__zoneFadeBaseOpacity = typeof material.opacity === 'number' ? material.opacity : 1;
            }
            return material;
        });

        child.material = Array.isArray(child.material) ? uniqueMaterials : uniqueMaterials[0];

        for (const material of uniqueMaterials) {
            if (!material?.isMaterial) {
                continue;
            }
            const baseOpacity = Number.isFinite(material.userData.__zoneFadeBaseOpacity)
                ? material.userData.__zoneFadeBaseOpacity
                : (typeof material.opacity === 'number' ? material.opacity : 1);
            material.transparent = true;
            material.opacity = baseOpacity * alpha;
            material.needsUpdate = true;
        }
    });

    if (hasRenderableChild) {
        node.visible = hidden ? alpha > 0.001 : true;
    }
}

function createSurfaceShape(tileWidth, tileHeight, startHeight, endHeight) {
    const leftY = Math.max(0, Math.min(1, startHeight)) * tileHeight;
    const rightY = Math.max(0, Math.min(1, endHeight)) * tileHeight;
    const points = [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(tileWidth, 0)
    ];

    if (rightY > 0.0001) {
        points.push(new THREE.Vector2(tileWidth, rightY));
    }

    if (leftY > 0.0001) {
        // Always keep the left surface corner so flat tiles render as rectangles instead of wedges.
        points.push(new THREE.Vector2(0, leftY));
    }

    return new THREE.Shape(points);
}

class TileChunk {
    constructor(layerRenderer, chunkX, chunkY) {
        this.layerRenderer = layerRenderer;
        this.chunkX = chunkX;
        this.chunkY = chunkY;
        this.geometry = new THREE.BufferGeometry();
        this.mesh = new THREE.Mesh(this.geometry, layerRenderer.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = layerRenderer.renderOrder;
        this.mesh.visible = false;
        this.chunkBounds = new THREE.Box2();
        this.dirty = true;
        this.hasRenderableTiles = false;
        this.build();
    }

    build() {
        const {
            level,
            layer,
            chunkSize,
            tileWidth,
            tileHeight,
            layerDepth,
            uvInsetX,
            uvInsetY,
            getTileAt
        } = this.layerRenderer;

        const startCol = this.chunkX * chunkSize;
        const startRow = this.chunkY * chunkSize;
        const endColExclusive = Math.min(startCol + chunkSize, level.width);
        const endRowExclusive = Math.min(startRow + chunkSize, level.height);
        const chunkWorldX = level.worldOriginX + (startCol * tileWidth);
        const chunkWorldY = level.worldOriginY + (startRow * tileHeight);
        this.mesh.position.set(chunkWorldX, chunkWorldY, 0);

        const positions = [];
        const uvs = [];
        const tileOpacities = [];
        const indices = [];
        let vertexOffset = 0;
        let hasRenderableTiles = false;

        for (let row = startRow; row < endRowExclusive; row += 1) {
            for (let col = startCol; col < endColExclusive; col += 1) {
                const tile = getTileAt(col, row);
                if (
                    !tile ||
                    tile.broken ||
                    tile.norender ||
                    tile.temporarilyHidden === true ||
                    !tile.renderInfo ||
                    tile.renderInfo.kind !== 'atlas' ||
                    !tile.gid
                ) {
                    continue;
                }

                const renderInfo = tile.renderInfo;
                const tileOpacity = clamp01(
                    typeof tile.temporaryOpacity === 'number'
                        ? tile.temporaryOpacity
                        : 1
                );
                const imageWidth = Math.max(renderInfo.imageWidth || 1, 1);
                const imageHeight = Math.max(renderInfo.imageHeight || 1, 1);
                const tileAtlasX = renderInfo.x || 0;
                const tileAtlasY = renderInfo.y || 0;
                const atlasTileWidth = renderInfo.tileWidth || tileWidth;
                const atlasTileHeight = renderInfo.tileHeight || tileHeight;

                let leftU = (tileAtlasX / imageWidth) + uvInsetX;
                let rightU = ((tileAtlasX + atlasTileWidth) / imageWidth) - uvInsetX;
                // Tiled atlas coordinates are top-left based; convert to Three.js bottom-left UVs.
                let topV = (1 - (tileAtlasY / imageHeight)) - uvInsetY;
                let bottomV = (1 - ((tileAtlasY + atlasTileHeight) / imageHeight)) + uvInsetY;

                if (tile.flip?.horizontal) {
                    [leftU, rightU] = [rightU, leftU];
                }
                if (tile.flip?.vertical) {
                    [topV, bottomV] = [bottomV, topV];
                }

                const localX = (col - startCol) * tileWidth;
                const localY = (row - startRow) * tileHeight;
                const localTop = localY + tileHeight;
                const localRight = localX + tileWidth;

                // Quad = two triangles in one shared chunk mesh.
                positions.push(
                    localX, localY, layerDepth,
                    localRight, localY, layerDepth,
                    localX, localTop, layerDepth,
                    localRight, localTop, layerDepth
                );

                // Plane corners: bottom-left, bottom-right, top-left, top-right.
                uvs.push(
                    leftU, bottomV,
                    rightU, bottomV,
                    leftU, topV,
                    rightU, topV
                );
                tileOpacities.push(tileOpacity, tileOpacity, tileOpacity, tileOpacity);

                indices.push(
                    vertexOffset, vertexOffset + 1, vertexOffset + 2,
                    vertexOffset + 2, vertexOffset + 1, vertexOffset + 3
                );
                vertexOffset += 4;
                hasRenderableTiles = true;
            }
        }

        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        this.geometry.setAttribute('tileOpacity', new THREE.Float32BufferAttribute(tileOpacities, 1));
        this.geometry.setIndex(indices);
        this.geometry.computeBoundingSphere();

        this.chunkBounds.set(
            new THREE.Vector2(chunkWorldX, chunkWorldY),
            new THREE.Vector2(
                level.worldOriginX + (endColExclusive * tileWidth),
                level.worldOriginY + (endRowExclusive * tileHeight)
            )
        );

        this.hasRenderableTiles = hasRenderableTiles;
        this.mesh.visible = hasRenderableTiles;
        this.dirty = false;
    }

    rebuild() {
        this.build();
    }

    updateVisibility(cameraBounds) {
        if (this.dirty) {
            this.rebuild();
        }

        if (!this.hasRenderableTiles) {
            this.mesh.visible = false;
            return;
        }

        this.mesh.visible = !(
            this.chunkBounds.max.x < cameraBounds.left ||
            this.chunkBounds.min.x > cameraBounds.right ||
            this.chunkBounds.max.y < cameraBounds.bottom ||
            this.chunkBounds.min.y > cameraBounds.top
        );
    }

    dispose() {
        this.mesh.removeFromParent();
        this.geometry.dispose();
    }
}

class TileLayerRenderer {
    constructor(levelRenderer, layer, layerIndex, renderOrder, layerDepth, texture) {
        this.levelRenderer = levelRenderer;
        this.level = levelRenderer.level;
        this.layer = layer;
        this.layerIndex = layerIndex;
        this.renderOrder = renderOrder;
        this.layerDepth = layerDepth;
        this.chunkSize = TILE_CHUNK_SIZE;
        this.tileWidth = this.level.tileWidth;
        this.tileHeight = this.level.tileHeight;
        this.group = new THREE.Group();
        this.group.name = `TileLayerChunks:${layer.name || layerIndex}`;
        this.group.renderOrder = renderOrder;
        this.group.visible = layer.visible !== false;
        this.material = levelRenderer.createLayerMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.01,
            opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
            vertexOpacityAttribute: true
        });
        this.chunks = new Map();
        this.uvInsetX = 0;
        this.uvInsetY = 0;
        if (texture?.image?.width && texture?.image?.height) {
            // Half-texel inset avoids neighboring atlas bleed.
            this.uvInsetX = 0.5 / texture.image.width;
            this.uvInsetY = 0.5 / texture.image.height;
        }

        this.getTileAt = (col, row) => {
            if (Array.isArray(this.layer.tiles)) {
                return this.layer.tiles[row * this.level.width + col];
            }
            return this.level.getTileAtCell(col, row);
        };

        this.buildAllChunks();
    }

    buildAllChunks() {
        const chunkCols = Math.ceil(this.level.width / this.chunkSize);
        const chunkRows = Math.ceil(this.level.height / this.chunkSize);
        for (let chunkY = 0; chunkY < chunkRows; chunkY += 1) {
            for (let chunkX = 0; chunkX < chunkCols; chunkX += 1) {
                const key = `${chunkX}_${chunkY}`;
                const chunk = new TileChunk(this, chunkX, chunkY);
                this.chunks.set(key, chunk);
                this.group.add(chunk.mesh);
            }
        }
    }

    markChunkDirtyForCell(col, row) {
        const chunkX = Math.floor(col / this.chunkSize);
        const chunkY = Math.floor(row / this.chunkSize);
        const key = `${chunkX}_${chunkY}`;
        const chunk = this.chunks.get(key);
        if (chunk) {
            chunk.dirty = true;
        }
    }

    update(cameraBounds) {
        for (const chunk of this.chunks.values()) {
            chunk.updateVisibility(cameraBounds);
        }
    }

    dispose() {
        for (const chunk of this.chunks.values()) {
            chunk.dispose();
        }
        this.chunks.clear();
        this.material.dispose();
        this.group.removeFromParent();
    }
}

export class LevelRenderer {
    constructor(scene, level, options = {}) {
        this.scene = scene;
        this.level = level;
        this.shouldRenderObject = options.shouldRenderObject || (() => true);
        this.root = new THREE.Group();
        this.root.name = 'LevelRenderer';
        this.scene.add(this.root);
        this.textureLoader = new THREE.TextureLoader(options.loadingManager);
        this.textureCache = new Map();
        this.materialCache = new Map();
        this.tileLayerRenderers = [];
        this.tileChunkRenderersByLayerId = new Map();
        this.tileLayerRenderersByName = new Map();
        this.tileRenderLayersByName = new Map();
        this.tileNodeEntriesByLayerName = new Map();
        this.objectLayerEntriesByLayerName = new Map();
        this.layerTexturePromises = new Map();
        this.rebuildVersion = 0;
        this.zoneShowLayerNames = this.collectZoneShowLayerNames();

        // The dyno model has real 3D depth and a forward visual Z offset, so front object
        // layers need a clearly separated Z slot to fully occlude it when Tiled says they are
        // above Gameplay. Keep this large enough that the model cannot poke through.
        this.layerZSpacing = 8;
        this.dynoWorldZ = Number.isFinite(CONFIG?.spawnPosition?.z) ? CONFIG.spawnPosition.z : 0;
        this.postGameplayLayerSpacing = 0.5;
        this.gameplayLayerIndex = this.findGameplayLayerIndex();
        this.dynoRenderOrder = this.getLayerRenderOrder(this.gameplayLayerIndex) + 0.5;
/*        
        this.materials = {
            solid: this.createLayerMaterial({ color: 0x4f4f5a }),
            ground: this.createLayerMaterial({ color: new THREE.Color(CONFIG.COLORS.DIRT) }),
            breakable: this.createLayerMaterial({ color: 0xbb6e31 })
        };
*/
        this.unsubscribe = this.level.addChangeListener(({ col, row }) => {
            this.handleTileChanged(col, row);
        });

        this.rebuild();
    }

    getCameraWorldBounds(camera) {
        const activeCamera = camera || this.scene.userData?.mainCamera || null;
        if (!activeCamera || !activeCamera.isOrthographicCamera) {
            return null;
        }

        const out = this._scratchCamBounds || (this._scratchCamBounds = { left: 0, right: 0, top: 0, bottom: 0 });
        out.left = activeCamera.position.x + activeCamera.left;
        out.right = activeCamera.position.x + activeCamera.right;
        out.top = activeCamera.position.y + activeCamera.top;
        out.bottom = activeCamera.position.y + activeCamera.bottom;
        return out;
    }

    update(camera) {
        const cameraBounds = this.getCameraWorldBounds(camera);
        if (!cameraBounds) {
            return;
        }

        const renderers = this.tileLayerRenderers;
        for (let i = 0, n = renderers.length; i < n; i++) {
            renderers[i].update(cameraBounds);
        }
    }

    handleTileChanged(col, row) {
        for (const tileLayerRenderer of this.tileLayerRenderers) {
            tileLayerRenderer.markChunkDirtyForCell(col, row);
        }
    }

    rebuild() {
        this.rebuildVersion += 1;
        const rebuildVersion = this.rebuildVersion;
        this.zoneShowLayerNames = this.collectZoneShowLayerNames();
        for (const tileLayerRenderer of this.tileLayerRenderers) {
            tileLayerRenderer.dispose();
        }
        this.tileLayerRenderers = [];
        this.tileChunkRenderersByLayerId.clear();
        this.tileLayerRenderersByName.clear();
        this.tileRenderLayersByName.clear();
        this.tileNodeEntriesByLayerName.clear();
        this.objectLayerEntriesByLayerName.clear();
        this.layerTexturePromises.clear();

        while (this.root.children.length > 0) {
            const child = this.root.children[this.root.children.length - 1];
            this.root.remove(child);
            child?.traverse((node) => {
                node.geometry?.dispose?.();
            });
        }

        const renderLayers = this.level.renderLayers?.length
            ? this.level.renderLayers
            : [{ type: 'tilelayer', name: 'Gameplay', visible: true, opacity: 1 }];

        for (const [layerIndex, layer] of renderLayers.entries()) {
            const isGameplayLayer = layer.gameplay === true || (
                typeof layer.name === 'string' &&
                layer.name.trim().toLowerCase() === 'gameplay'
            );
            const isZoneShowLayer = this.zoneShowLayerNames.has(normalizeLayerToken(layer?.name));

            if (layer.visible === false && !isGameplayLayer && !isZoneShowLayer) {
                continue;
            }

            const layerNode = this.createNodeForLayer(layer, layerIndex, rebuildVersion);
            if (layerNode) {
                this.root.add(layerNode);
            }
        }
    }

    findGameplayLayerIndex() {
        const renderLayers = this.level.renderLayers || [];
        const gameplayIndex = renderLayers.findIndex((layer) => (
            typeof layer?.name === 'string' &&
            layer.name.trim().toLowerCase() === 'gameplay'
        ));

        return gameplayIndex >= 0 ? gameplayIndex : renderLayers.length - 1;
    }

    collectZoneShowLayerNames() {
        const names = new Set();
        const zones = this.level?.getZoneTriggerZones?.() ||
            (Array.isArray(this.level?.zoneTriggerZones) ? this.level.zoneTriggerZones : []) ||
            (Array.isArray(this.level?.triggerZones) ? this.level.triggerZones : []);
        for (const zone of zones) {
            for (const layerName of zone?.layersToShow || []) {
                const normalized = normalizeLayerToken(layerName);
                if (normalized) {
                    names.add(normalized);
                }
            }
        }
        return names;
    }

    getLayerRenderOrder(layerIndex) {
        // Keep the visual order identical to the Tiled layers array. The only special case is
        // the dyno split: layers after "Gameplay" get nudged forward so the dyno can sit
        // directly after the gameplay layer while preserving the rest of the order.
        if (layerIndex > this.gameplayLayerIndex) {
            return layerIndex + 1;
        }

        return layerIndex;
    }

    getDynoRenderOrder() {
        return this.dynoRenderOrder;
    }

    // Returns renderOrder and layerDepth (Z) for objects that should appear in front of all
    // foreground tile layers but still be occluded by the depth buffer (so the dyno,
    // which is at Z=0, naturally appears in front when it overlaps the object).
    getLayerGroupByName(name) {
        const lower = name.trim().toLowerCase();
        return this.root.children.find(
            (child) => child.name?.split(':')[1]?.trim().toLowerCase() === lower
        ) || null;
    }

    setLayerVisibilityByName(name, visible) {
        const lower = String(name || '').trim().toLowerCase();
        if (!lower) {
            return false;
        }

        let matched = false;
        for (const child of this.root.children) {
            if (child.name?.split(':')[1]?.trim().toLowerCase() !== lower) {
                continue;
            }
            child.visible = visible;
            matched = true;
        }

        const tileLayerRenderer = this.tileLayerRenderersByName.get(lower);
        if (tileLayerRenderer?.group) {
            tileLayerRenderer.group.visible = visible;
            matched = true;
        }

        return matched;
    }

    getPreGameplayProjectileBand() {
        const gameplayIndex = Math.max(0, this.gameplayLayerIndex);
        const gameplayRenderOrder = this.getLayerRenderOrder(gameplayIndex);
        const gameplayDepth = this.getLayerDepth(gameplayIndex);

        const previousLayerIndex = gameplayIndex - 1;
        const previousRenderOrder = previousLayerIndex >= 0
            ? this.getLayerRenderOrder(previousLayerIndex)
            : gameplayRenderOrder - 1;
        const previousDepth = previousLayerIndex >= 0
            ? this.getLayerDepth(previousLayerIndex)
            : gameplayDepth - this.layerZSpacing;

        // Bullets in this band render behind Gameplay but in front of the layer immediately before it.
        return {
            renderOrder: (previousRenderOrder + gameplayRenderOrder) * 0.5,
            depth: (previousDepth + gameplayDepth) * 0.5
        };
    }

    createLayerMaterial(options = {}) {
        const { vertexOpacityAttribute = false, ...materialOptions } = options;
        const material = new THREE.MeshBasicMaterial({
            ...materialOptions,
            // Level layers still follow Tiled order, but they also need stable depth slots so
            // transparent object-layer sprites can sit either in front of or behind the dyno.
            depthTest: true,
            depthWrite: false
        });
        if (vertexOpacityAttribute) {
            material.onBeforeCompile = (shader) => {
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', '#include <common>\nattribute float tileOpacity;\nvarying float vTileOpacity;')
                    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTileOpacity = tileOpacity;');
                shader.fragmentShader = shader.fragmentShader
                    .replace('#include <common>', '#include <common>\nvarying float vTileOpacity;')
                    .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vTileOpacity;');
            };
            material.customProgramCacheKey = () => 'zone-tile-opacity-v1';
        }
        return material;
    }

    getLayerDepth(layerIndex) {
        const gameplayIndex = this.gameplayLayerIndex;
        if (layerIndex <= gameplayIndex) {
            return (layerIndex - gameplayIndex) * this.layerZSpacing;
        }

        // Keep the dyno in a fixed world-Z slot, then start the first layer after Gameplay
        // one full layer step in front of that slot so foreground art can always occlude it.
        // Additional foreground layers only need a small Z delta for stable depth sorting;
        // using the full layer spacing would quickly push later layers into/behind the camera.
        const postGameplayIndex = layerIndex - gameplayIndex - 1;
        return this.dynoWorldZ + this.layerZSpacing + (postGameplayIndex * this.postGameplayLayerSpacing);
    }

    applyRenderOrder(root, renderOrder) {
        root.renderOrder = renderOrder;
        root.traverse((child) => {
            child.renderOrder = renderOrder;
        });
    }

    createNodeForLayer(layer, layerIndex, rebuildVersion = this.rebuildVersion) {
        const renderOrder = this.getLayerRenderOrder(layerIndex);
        const layerDepth = this.getLayerDepth(layerIndex);

        if (layer.type === 'tilelayer') {
            const layerNode = new THREE.Group();
            layerNode.name = `${layer.type}:${layer.name || layerIndex}`;
            const isGameplayLayer = layer.gameplay === true || (
                typeof layer.name === 'string' &&
                layer.name.trim().toLowerCase() === 'gameplay'
            );
            layerNode.visible = isGameplayLayer ? true : layer.visible !== false;
            this.applyRenderOrder(layerNode, renderOrder);
            this.rememberTileRenderLayer(layer);

            if (isGameplayLayer) {
                return layerNode;
            }

            const atlasRenderInfo = this.findLayerAtlasRenderInfo(layer);
            if (!atlasRenderInfo?.imageUrl) {
                // Fallback keeps behavior safe for non-atlas layers.
                for (let row = 0; row < this.level.height; row += 1) {
                    for (let col = 0; col < this.level.width; col += 1) {
                        const tile = Array.isArray(layer.tiles)
                            ? layer.tiles[row * this.level.width + col]
                            : this.level.getTileAtCell(col, row);
                        const tileNode = this.createNodeForTile(
                            tile,
                            col,
                            row,
                            layer.opacity,
                            layerDepth,
                            layer.name || ''
                        );
                        if (tileNode) {
                            layerNode.add(tileNode);
                            this.rememberTileNode(layer.name || '', col, row, tileNode);
                        }
                    }
                }
                return layerNode;
            }

            const imageUrl = atlasRenderInfo.imageUrl;
            const cachedTexture = this.textureCache.get(imageUrl);
            if (cachedTexture?.texture) {
                this.createChunkedTileLayer(
                    layer,
                    layerIndex,
                    renderOrder,
                    layerDepth,
                    cachedTexture.texture,
                    layerNode
                );
            } else {
                this.ensureLayerTexture(imageUrl, () => {
                    // Ignore stale async callbacks from an older rebuild pass.
                    if (rebuildVersion !== this.rebuildVersion) {
                        return;
                    }
                    const latestTexture = this.textureCache.get(imageUrl)?.texture;
                    if (!latestTexture) {
                        return;
                    }
                    this.createChunkedTileLayer(
                        layer,
                        layerIndex,
                        renderOrder,
                        layerDepth,
                        latestTexture,
                        layerNode
                    );
                });
            }

            return layerNode;
        }

        if (layer.type === 'objectgroup') {
            const layerNode = new THREE.Group();
            layerNode.name = `${layer.type}:${layer.name || layerIndex}`;
            layerNode.visible = layer.visible !== false;
            for (const [objectIndex, object] of (layer.objects || []).entries()) {
                const objectNode = this.createNodeForObject(
                    object,
                    layer.opacity,
                    layerIndex,
                    objectIndex,
                    layerDepth
                );
                if (objectNode) {
                    layerNode.add(objectNode);
                }
            }
            this.applyRenderOrder(layerNode, renderOrder);
            return layerNode;
        }

        return null;
    }

    findLayerAtlasRenderInfo(layer) {
        if (!Array.isArray(layer.tiles)) {
            return null;
        }

        let atlasImageUrl = null;
        for (const tile of layer.tiles) {
            if (!tile || tile.broken || tile.norender || tile.temporarilyHidden === true || !tile.renderInfo || !tile.gid) {
                continue;
            }

            // Chunked tile renderer assumes one atlas texture for all non-empty tiles.
            if (tile.renderInfo.kind !== 'atlas' || !tile.renderInfo.imageUrl) {
                return null;
            }

            if (!atlasImageUrl) {
                atlasImageUrl = tile.renderInfo.imageUrl;
                continue;
            }

            if (tile.renderInfo.imageUrl !== atlasImageUrl) {
                return null;
            }
        }

        if (!atlasImageUrl) {
            return null;
        }

        return { imageUrl: atlasImageUrl };
    }

    ensureLayerTexture(imageUrl, onLoaded) {
        if (this.textureCache.get(imageUrl)?.texture) {
            onLoaded?.();
            return;
        }

        if (this.layerTexturePromises.has(imageUrl)) {
            this.layerTexturePromises.get(imageUrl)?.then(() => onLoaded?.());
            return;
        }

        const promise = new Promise((resolve) => {
            this.textureLoader.load(
                imageUrl,
                (texture) => {
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.generateMipmaps = false;
                    texture.needsUpdate = true;
                    this.textureCache.set(imageUrl, { loading: false, texture });
                    resolve();
                },
                undefined,
                () => {
                    this.textureCache.delete(imageUrl);
                    resolve();
                }
            );
        });

        this.layerTexturePromises.set(imageUrl, promise);
        promise.then(() => {
            this.layerTexturePromises.delete(imageUrl);
            onLoaded?.();
        });
    }

    createChunkedTileLayer(layer, layerIndex, renderOrder, layerDepth, texture, layerNode) {
        const layerId = layer.id ?? `${layer.type}:${layerIndex}`;
        if (this.tileChunkRenderersByLayerId.has(layerId)) {
            return;
        }

        const tileLayerRenderer = new TileLayerRenderer(
            this,
            layer,
            layerIndex,
            renderOrder,
            layerDepth,
            texture
        );
        this.tileLayerRenderers.push(tileLayerRenderer);
        this.tileChunkRenderersByLayerId.set(layerId, tileLayerRenderer);
        this.tileLayerRenderersByName.set(normalizeLayerToken(layer.name || layerId), tileLayerRenderer);
        layerNode.add(tileLayerRenderer.group);
    }

    createNodeForTile(tile, col, row, layerOpacity = 1, layerDepth = 0, layerName = '') {
        if (
            !tile ||
            tile.broken ||
            tile.temporarilyHidden === true ||
            (tile.gameplayType === GAMEPLAY_TYPES.EMPTY && !tile.renderInfo)
        ) {
            return null;
        }

        const node = new THREE.Group();
        const world = this.level.cellToWorld(col, row);
        node.position.set(world.x, world.y, 0);

        const shape = createSurfaceShape(
            this.level.tileWidth,
            this.level.tileHeight,
            tile.startHeight,
            tile.endHeight
        );
        const fill = new THREE.Mesh(
            this.level.tileWidth > 0 && this.level.tileHeight > 0 && tile.renderInfo
                ? this.createRenderGeometry(tile.renderInfo, this.level.tileWidth, this.level.tileHeight, tile.flip)
                : new THREE.ShapeGeometry(shape),
            this.getFillMaterial(tile, layerOpacity)
        );
        if (tile.renderInfo) {
            fill.position.set(
                this.level.tileWidth * 0.5,
                this.level.tileHeight * 0.5,
                layerDepth
            );
        } else {
            fill.position.z = layerDepth;
        }
        node.add(fill);
        node.userData.zoneLayerMeta = {
            type: 'tile',
            layerName,
            col,
            row
        };

        return node;
    }

    createNodeForObject(object, layerOpacity = 1, layerIndex = 0, objectIndex = 0, layerDepth = 0) {
        if (!this.shouldRenderObject(object) || !object?.gid || !object.renderInfo || object.visible === false) {
            return null;
        }

        const node = new THREE.Group();
        const opacity = (typeof object.opacity === 'number' ? object.opacity : 1) * layerOpacity;
        const width = Math.max(object.width || 0, 0.001);
        const height = Math.max(object.height || 0, 0.001);
        const geometry = this.createRenderGeometry(object.renderInfo, width, height, object.flip);
        const material = this.getRenderMaterial(
            object.gid,
            object.renderInfo,
            opacity
        );

        if (!geometry || !material) {
            return null;
        }

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
            width * 0.5,
            height * 0.5,
            layerDepth + (layerIndex * 0.001) + (objectIndex * 0.00001)
        );
        node.position.set(object.worldX, object.worldY, 0);
        node.rotation.z = THREE.MathUtils.degToRad(-(object.rotation || 0));
        node.visible = object.visible !== false;
        node.add(mesh);
        node.userData.zoneLayerMeta = {
            type: 'object',
            layerName: object.sourceLayer || '',
            object
        };
        this.rememberObjectNode(object.sourceLayer || '', object, node);

        return node;
    }

    rememberTileRenderLayer(layer) {
        const key = normalizeLayerToken(layer?.name);
        if (!key) {
            return;
        }
        this.tileRenderLayersByName.set(key, layer);
    }

    rememberTileNode(layerName, col, row, node) {
        const key = normalizeLayerToken(layerName);
        if (!key) {
            return;
        }
        let nodes = this.tileNodeEntriesByLayerName.get(key);
        if (!nodes) {
            nodes = new Map();
            this.tileNodeEntriesByLayerName.set(key, nodes);
        }
        nodes.set(`${col}_${row}`, node);
    }

    rememberObjectNode(layerName, object, node) {
        const key = normalizeLayerToken(layerName);
        if (!key) {
            return;
        }
        let entries = this.objectLayerEntriesByLayerName.get(key);
        if (!entries) {
            entries = [];
            this.objectLayerEntriesByLayerName.set(key, entries);
        }
        entries.push({ object, node });
    }

    getTileRenderLayerByName(layerName) {
        return this.tileRenderLayersByName.get(normalizeLayerToken(layerName)) || null;
    }

    getObjectLayerEntriesByName(layerName) {
        return this.objectLayerEntriesByLayerName.get(normalizeLayerToken(layerName)) || [];
    }

    setTileLayerCellHidden(layerName, col, row, hidden) {
        return this.setTileLayerCellFade(layerName, col, row, hidden ? 0 : 1, hidden);
    }

    setTileLayerCellFade(layerName, col, row, opacity = 1, hidden = false) {
        const normalizedLayerName = normalizeLayerToken(layerName);
        const layer = this.tileRenderLayersByName.get(normalizedLayerName);
        if (!layer || !Array.isArray(layer.tiles)) {
            return false;
        }

        const index = row * this.level.width + col;
        const tile = layer.tiles[index];
        if (!tile) {
            return false;
        }

        const nextOpacity = clamp01(opacity);
        if (hidden && nextOpacity <= 0.001) {
            tile.temporarilyHidden = true;
        } else {
            delete tile.temporarilyHidden;
        }
        if (nextOpacity >= 0.999) {
            delete tile.temporaryOpacity;
        } else {
            tile.temporaryOpacity = nextOpacity;
        }

        const tileNode = this.tileNodeEntriesByLayerName.get(normalizedLayerName)?.get(`${col}_${row}`) || null;
        if (tileNode) {
            applyNodeOpacity(tileNode, nextOpacity, hidden);
        }

        this.tileLayerRenderersByName.get(normalizedLayerName)?.markChunkDirtyForCell?.(col, row);
        return true;
    }

    setRenderedObjectNodeFade(node, opacity = 1, hidden = false) {
        if (!node) {
            return false;
        }
        applyNodeOpacity(node, opacity, hidden);
        return true;
    }

    getFillMaterial(tile, layerOpacity = 1) {
        const texturedMaterial = this.getRenderMaterial(tile.gid, tile.renderInfo, layerOpacity);
        if (texturedMaterial) {
            return texturedMaterial;
        }
/*
        if (tile.gameplayType === GAMEPLAY_TYPES.SOLID) {
            return this.materials.solid;
        }

        if (tile.gameplayType === GAMEPLAY_TYPES.BREAKABLE) {
            return this.materials.breakable;
        }
*/
        return null;//this.materials.ground;
    }

    createRenderGeometry(renderInfo, width, height, flip = null) {
        const geometry = new THREE.PlaneGeometry(width, height);
        const { u0, u1, v0, v1 } = this.getInsetUvBounds(renderInfo);
        const uv = geometry.getAttribute('uv');
        let leftU = u0;
        let rightU = u1;
        let bottomV = v1;
        let topV = v0;

        if (flip?.horizontal) {
            [leftU, rightU] = [rightU, leftU];
        }

        if (flip?.vertical) {
            [bottomV, topV] = [topV, bottomV];
        }

        // Diagonal Tiled flips swap X/Y axes after the normal flips. Keeping that transform
        // explicit here makes the object-layer path easy to debug and extend if art needs it.
        if (flip?.diagonal) {
            uv.setXY(0, rightU, bottomV);
            uv.setXY(1, rightU, topV);
            uv.setXY(2, leftU, bottomV);
            uv.setXY(3, leftU, topV);
            uv.needsUpdate = true;
            return geometry;
        }

        // PlaneGeometry UVs are laid out bottom-left, bottom-right, top-left, top-right.
        // Keep atlas U left-to-right and V top-to-bottom aligned with the source tile image.
        uv.setXY(0, leftU, bottomV);
        uv.setXY(1, rightU, bottomV);
        uv.setXY(2, leftU, topV);
        uv.setXY(3, rightU, topV);
        uv.needsUpdate = true;

        return geometry;
    }

    getInsetUvBounds(renderInfo) {
        if (renderInfo.kind === 'image') {
            return { u0: 0, u1: 1, v0: 0, v1: 1 };
        }

        const { x, y, tileWidth, tileHeight, imageWidth, imageHeight } = renderInfo;
        // Sample slightly inside the atlas cell instead of exactly on the border.
        // A half-texel inset keeps GPU sampling away from neighboring tiles and can be
        // tuned if the atlas art or filtering mode changes later.
        const insetX = 0.5 / Math.max(imageWidth, 1);
        const insetY = 0.5 / Math.max(imageHeight, 1);
        const rawU0 = x / imageWidth;
        const rawU1 = (x + tileWidth) / imageWidth;
        const rawV0 = 1 - ((y + tileHeight) / imageHeight);
        const rawV1 = 1 - (y / imageHeight);

        return {
            u0: rawU0 + insetX,
            u1: rawU1 - insetX,
            v0: rawV0 + insetY,
            v1: rawV1 - insetY
        };
    }

    getRenderMaterial(cacheKey, renderInfo, opacity = 1) {
        const imageUrl = renderInfo?.imageUrl;
        if (!imageUrl) {
            return null;
        }

        const cacheId = `${cacheKey}|${opacity.toFixed(3)}`;
        const cachedMaterial = this.materialCache.get(cacheId);
        if (cachedMaterial) {
            return cachedMaterial;
        }

        const cachedTexture = this.textureCache.get(imageUrl);
        if (cachedTexture?.texture) {
            const material = this.createLayerMaterial({
                map: cachedTexture.texture,
                transparent: true,
                alphaTest: 0.01,
                opacity
            });
            this.materialCache.set(cacheId, material);
            return material;
        }

        if (!cachedTexture) {
            this.textureCache.set(imageUrl, { loading: true, texture: null });
            this.textureLoader.load(
                imageUrl,
                (texture) => {
                    // Tile atlases should not blend across neighbors. Nearest sampling,
                    // clamp wrapping, and disabled mipmaps keep each tile sampling stable.
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.magFilter = THREE.NearestFilter;
                    texture.minFilter = THREE.NearestFilter;
                    texture.wrapS = THREE.ClampToEdgeWrapping;
                    texture.wrapT = THREE.ClampToEdgeWrapping;
                    texture.generateMipmaps = false;
                    texture.needsUpdate = true;
                    this.textureCache.set(imageUrl, { loading: false, texture });
                    this.rebuild();
                },
                undefined,
                () => {
                    this.textureCache.delete(imageUrl);
                }
            );
        }

        return null;
    }

    dispose() {
        this.unsubscribe?.();
        for (const tileLayerRenderer of this.tileLayerRenderers) {
            tileLayerRenderer.dispose();
        }
        this.tileLayerRenderers = [];
        this.tileChunkRenderersByLayerId.clear();
        this.tileLayerRenderersByName.clear();
        this.tileRenderLayersByName.clear();
        this.tileNodeEntriesByLayerName.clear();
        this.objectLayerEntriesByLayerName.clear();
        this.layerTexturePromises.clear();
        this.root.removeFromParent();
        this.root.traverse((child) => {
            child.geometry?.dispose?.();
            if (child.material?.userData?.__zoneFadeClone) {
                child.material.dispose?.();
            } else if (Array.isArray(child.material)) {
                for (const material of child.material) {
                    if (material?.userData?.__zoneFadeClone) {
                        material.dispose?.();
                    }
                }
            }
        });
/*        
        for (const material of Object.values(this.materials)) {
            material.dispose?.();
        }
*/            
        for (const material of this.materialCache.values()) {
            material.dispose?.();
        }
        for (const entry of this.textureCache.values()) {
            entry.texture?.dispose?.();
        }
    }
}
