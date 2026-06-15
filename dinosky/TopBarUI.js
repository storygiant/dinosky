import * as THREE from 'three';

const TOP_BAR_ASSETS = {
    healthBackground: './gfx/UI/health.webp',
    healthFill: './gfx/UI/health_fill.webp',
    energyBackground: './gfx/UI/energy.webp',
    energyFill: './gfx/UI/energy_fill.webp',
    barBackground: './gfx/UI/bar.webp',
    barFill: './gfx/UI/bar_fill.webp',
    coinBackground: './gfx/UI/coinbar.webp',
    settingsButton: './gfx/UI/button_settings.webp',
    skinsButton: './gfx/UI/button_skins.webp',
    minimap: './gfx/UI/minimap.webp'
};

export const TOP_BAR_PRELOAD_ASSET_URLS = Object.values(TOP_BAR_ASSETS);

const DEFAULT_TOP_BAR_CONFIG = Object.freeze({
    topOffsetLandscape: 0,
    topOffsetPortrait: 75,
    groupGap: 16,
    rightPadding: 0,
    leftPadding: 0,
    topPadding: 0,
    groupToSettingsGap: 16,
    itemScale: 1,
    verticalItemHeight: 106,
    barHeight: 72,
    // Optional target bar width before responsive itemScale is applied.
    // 0 keeps the authored width (height * texture aspect).
    barWidth: 300,
    // 3-slice center-stretch inset for bar.webp and bar_fill.webp.
    // Stretch region is [inset, width - inset] in source pixels.
    barSliceInsetPx: 100,
    settingsHeight: 94,
    // Minimap height in the landscape group (scales with itemScale).
    minimapHeight: 72,
    // Portrait: offset from the right edge of the screen to the right edge of the minimap.
    minimapPortraitRightOffset: 8,
    // Portrait: offset from the top edge of the screen to the top edge of the minimap.
    minimapPortraitTopOffset: 8,
    // Fraction of the minimap image height where the grid starts (top edge of grid area, 0 = image top).
    minimapGridTop: 0.3,
    // Fraction of the minimap image height where the grid ends (bottom edge of grid area, 1 = image bottom).
    minimapGridBottom: 1.0
});

function clamp01(value) {
    return THREE.MathUtils.clamp(value, 0, 1);
}

function toPositiveNumber(value, fallback) {
    return Number.isFinite(value) ? Math.max(value, 0) : fallback;
}

function createSpriteMaterial(texture, opacity = 1) {
    return new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
    });
}

function createMeshMaterial(texture, opacity = 1) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
    });
}

function createFillMaterial(texture, fillDirection) {
    const material = createSpriteMaterial(texture, 1);
    material.userData.fillDirection = fillDirection;
    material.userData.fillProgress = 1;
    material.userData.fillShader = null;
    // Vertical and horizontal fills inject different shader code.
    material.customProgramCacheKey = () => `topbar-fill-${fillDirection}`;

    material.onBeforeCompile = (shader) => {
        shader.uniforms.uFillProgress = { value: material.userData.fillProgress };

        // UI clipping axes:
        // - vertical indicators: bottom -> top
        // - horizontal bar: left -> right
        const axisExpr = fillDirection === 'vertical' ? 'vMapUv.y' : 'vMapUv.x';

        shader.fragmentShader = shader.fragmentShader.replace(
            'void main() {',
            'uniform float uFillProgress;\nvoid main() {'
        );
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float fillMask = step(${axisExpr}, uFillProgress);
            diffuseColor.a *= fillMask;`
        );

        material.userData.fillShader = shader;
    };

    return material;
}

export class TopBarUI {
    constructor(options = {}) {
        this.config = { ...DEFAULT_TOP_BAR_CONFIG };
        this.loadingManager = options.loadingManager;
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.uiScene = new THREE.Scene();
        this.uiCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
        this.uiCamera.position.z = 1;

        this.root = new THREE.Group();
        this.groupRoot = new THREE.Group();
        this.settingsRoot = new THREE.Group();
        this.root.add(this.groupRoot);
        this.root.add(this.settingsRoot);
        this.uiScene.add(this.root);

        this.lastLayoutWidth = 1;
        this.lastLayoutHeight = 1;
        this.settingsButtonRect = { left: 0, top: 0, right: 0, bottom: 0 };
        this.hudRowScreenBounds = { left: 0, right: 1, top: 0, bottom: 1, height: 1 };

        this.textures = {
            healthBackground: this.loadTexture(TOP_BAR_ASSETS.healthBackground),
            healthFill: this.loadTexture(TOP_BAR_ASSETS.healthFill),
            energyBackground: this.loadTexture(TOP_BAR_ASSETS.energyBackground),
            energyFill: this.loadTexture(TOP_BAR_ASSETS.energyFill),
            barBackground: this.loadTexture(TOP_BAR_ASSETS.barBackground),
            barFill: this.loadTexture(TOP_BAR_ASSETS.barFill),
            coinBackground: this.loadTexture(TOP_BAR_ASSETS.coinBackground),
            settingsButton: this.loadTexture(TOP_BAR_ASSETS.settingsButton),
            skinsButton: this.loadTexture(TOP_BAR_ASSETS.skinsButton),
            minimap: this.loadTexture(TOP_BAR_ASSETS.minimap)
        };

        this.healthIndicator = this.createProgressIndicator(
            this.textures.healthBackground,
            this.textures.healthFill,
            'vertical',
            2000
        );
        this.energyIndicator = this.createProgressIndicator(
            this.textures.energyBackground,
            this.textures.energyFill,
            'vertical',
            2010
        );
        this.barIndicator = this.createThreeSliceBarIndicator(
            this.textures.barBackground,
            this.textures.barFill,
            2020
        );

        this.coinDisplay = this.createCoinDisplay(2025);

        this.settingsSprite = new THREE.Sprite(createSpriteMaterial(this.textures.settingsButton, 0.95));
        this.settingsSprite.renderOrder = 2100;
        this.settingsRoot.add(this.settingsSprite);

        this.skinsSprite = new THREE.Sprite(createSpriteMaterial(this.textures.skinsButton, 0.95));
        this.skinsSprite.renderOrder = 2101;
        this.settingsRoot.add(this.skinsSprite);
        this.skinsBadgeSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._createAlertBadgeTexture(64),
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        }));
        this.skinsBadgeSprite.renderOrder = 2102;
        this.skinsBadgeSprite.visible = false;
        this.settingsRoot.add(this.skinsBadgeSprite);
        this.skinsOnboardingArrowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._createOnboardingArrowTexture(96, 128),
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        }));
        this.skinsOnboardingArrowSprite.renderOrder = 2103;
        this.skinsOnboardingArrowSprite.visible = false;
        this.skinsOnboardingArrowBaseY = 0;
        this.settingsRoot.add(this.skinsOnboardingArrowSprite);
        this.skinsButtonRect = { left: 0, top: 0, right: 0, bottom: 0 };

        this.minimapRoot = new THREE.Group();
        this.minimapSprite = new THREE.Sprite(createSpriteMaterial(this.textures.minimap, 1));
        this.minimapSprite.renderOrder = 2040;
        this.minimapRoot.add(this.minimapSprite);
        this.root.add(this.minimapRoot);

        // Red dot showing dyno position on the minimap.
        // Rendered as a separate sprite above the minimap image.
        this.minimapDotSprite = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: this._createDotTexture(8),
                color: 0xff0000,
                transparent: true,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        this.minimapDotSprite.renderOrder = 2045;
        this.minimapDotSprite.visible = false;
        this.root.add(this.minimapDotSprite);
        this.minimapSkinsAffordableDot = new THREE.Sprite(
            new THREE.SpriteMaterial({
                map: this._createAlertDotTexture(32),
                transparent: true,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        this.minimapSkinsAffordableDot.renderOrder = 2046;
        this.minimapSkinsAffordableDot.visible = false;
        this.root.add(this.minimapSkinsAffordableDot);

        // Stored by layout() so getMinimapBounds() can return screen-space coordinates.
        this.minimapScreenBounds = { x: 0, y: 0, width: 1, height: 1 };

        // Initial values.
        this.setHealthProgress(1);
        this.setEnergyProgress(1);

        this.layout(window.innerWidth, window.innerHeight);

        document.fonts?.ready?.then(() => {
            this._updateCoinTexture();
        });
    }

    loadTexture(url) {
        const texture = this.textureLoader.load(url, () => {
            this.layout(this.lastLayoutWidth, this.lastLayoutHeight);
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    getTextureAspect(texture, fallback = 1) {
        const image = texture?.image;
        if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.height <= 0) {
            return fallback;
        }

        return image.width / image.height;
    }

    getTextureDimensions(texture, fallbackWidth = 300, fallbackHeight = 100) {
        const image = texture?.image;
        if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
            return { width: fallbackWidth, height: fallbackHeight };
        }

        return { width: image.width, height: image.height };
    }

    createProgressIndicator(backgroundTexture, fillTexture, fillDirection, renderOrderBase) {
        const root = new THREE.Group();
        const background = new THREE.Sprite(createSpriteMaterial(backgroundTexture, 0.95));
        background.renderOrder = renderOrderBase;
        const fill = new THREE.Sprite(createFillMaterial(fillTexture, fillDirection));
        fill.renderOrder = renderOrderBase + 1;

        root.add(background);
        root.add(fill);
        this.groupRoot.add(root);

        return {
            type: fillDirection === 'vertical' ? 'vertical' : 'horizontal',
            root,
            background,
            fill,
            fillDirection,
            progress: 0.7
        };
    }

    createSliceMesh(texture, renderOrder, opacity = 1) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), createMeshMaterial(texture, opacity));
        mesh.renderOrder = renderOrder;
        mesh.frustumCulled = false;
        return mesh;
    }

    createThreeSliceLayer(texture, renderOrder, opacity = 1) {
        const root = new THREE.Group();
        const left = this.createSliceMesh(texture, renderOrder, opacity);
        const center = this.createSliceMesh(texture, renderOrder, opacity);
        const right = this.createSliceMesh(texture, renderOrder, opacity);
        root.add(left);
        root.add(center);
        root.add(right);

        return { root, left, center, right, texture };
    }

    createThreeSliceBarIndicator(backgroundTexture, fillTexture, renderOrderBase) {
        const root = new THREE.Group();
        const backgroundLayer = this.createThreeSliceLayer(backgroundTexture, renderOrderBase, 0.95);
        const fillLayer = this.createThreeSliceLayer(fillTexture, renderOrderBase + 1, 1);
        root.add(backgroundLayer.root);
        root.add(fillLayer.root);
        this.groupRoot.add(root);

        return {
            type: 'threeSliceBar',
            root,
            progress: 0.7,
            backgroundLayer,
            fillLayer,
            backgroundMetrics: null,
            fillMetrics: null
        };
    }

    setSliceUv(mesh, u0, u1) {
        const uvAttribute = mesh.geometry.getAttribute('uv');
        if (!uvAttribute || uvAttribute.count < 4) {
            return;
        }

        uvAttribute.setXY(0, u0, 1);
        uvAttribute.setXY(1, u1, 1);
        uvAttribute.setXY(2, u0, 0);
        uvAttribute.setXY(3, u1, 0);
        uvAttribute.needsUpdate = true;
    }

    setSlicePiece(mesh, centerX, width, height, u0, u1) {
        const epsilon = 0.0001;
        if (width <= epsilon || height <= epsilon || u1 <= (u0 + 0.000001)) {
            mesh.visible = false;
            return;
        }

        mesh.visible = true;
        mesh.position.set(centerX, 0, 0);
        mesh.scale.set(width, height, 1);
        this.setSliceUv(mesh, u0, u1);
    }

    computeBarSliceMetrics(texture, totalWidth, height) {
        const { width: imageWidth, height: imageHeight } = this.getTextureDimensions(texture, 300, 100);
        const requestedInsetPx = toPositiveNumber(this.config.barSliceInsetPx, DEFAULT_TOP_BAR_CONFIG.barSliceInsetPx);
        const maxInsetPx = Math.max((imageWidth * 0.5) - 1, 0);
        const insetPx = THREE.MathUtils.clamp(requestedInsetPx, 0, maxInsetPx);
        const uLeft = insetPx / imageWidth;
        const uRight = 1 - (insetPx / imageWidth);

        const leftWidth = height * (insetPx / imageHeight);
        const rightWidth = height * (insetPx / imageHeight);
        const centerWidth = Math.max(totalWidth - leftWidth - rightWidth, 0.0001);

        return {
            totalWidth,
            height,
            leftWidth,
            centerWidth,
            rightWidth,
            uLeft,
            uRight
        };
    }

    layoutThreeSliceLayerFull(layer, metrics) {
        const barLeft = -metrics.totalWidth * 0.5;
        this.setSlicePiece(
            layer.left,
            barLeft + (metrics.leftWidth * 0.5),
            metrics.leftWidth,
            metrics.height,
            0,
            metrics.uLeft
        );
        this.setSlicePiece(
            layer.center,
            barLeft + metrics.leftWidth + (metrics.centerWidth * 0.5),
            metrics.centerWidth,
            metrics.height,
            metrics.uLeft,
            metrics.uRight
        );
        this.setSlicePiece(
            layer.right,
            barLeft + metrics.leftWidth + metrics.centerWidth + (metrics.rightWidth * 0.5),
            metrics.rightWidth,
            metrics.height,
            metrics.uRight,
            1
        );
    }

    layoutThreeSliceLayerFill(layer, metrics, progress) {
        const clampedProgress = clamp01(progress);
        const visibleWidth = metrics.totalWidth * clampedProgress;
        const epsilon = 0.0001;

        if (visibleWidth <= epsilon) {
            layer.left.visible = false;
            layer.center.visible = false;
            layer.right.visible = false;
            return;
        }

        const pieces = [
            { mesh: layer.left, maxWidth: metrics.leftWidth, u0: 0, u1: metrics.uLeft },
            { mesh: layer.center, maxWidth: metrics.centerWidth, u0: metrics.uLeft, u1: metrics.uRight },
            { mesh: layer.right, maxWidth: metrics.rightWidth, u0: metrics.uRight, u1: 1 }
        ];

        let remaining = visibleWidth;
        let cursorLeft = -metrics.totalWidth * 0.5;
        for (const piece of pieces) {
            const fullPieceWidth = Math.max(piece.maxWidth, 0);
            const pieceVisibleWidth = THREE.MathUtils.clamp(remaining, 0, fullPieceWidth);
            if (pieceVisibleWidth > epsilon && fullPieceWidth > epsilon) {
                const ratio = pieceVisibleWidth / fullPieceWidth;
                const uVisibleEnd = piece.u0 + ((piece.u1 - piece.u0) * ratio);
                this.setSlicePiece(
                    piece.mesh,
                    cursorLeft + (pieceVisibleWidth * 0.5),
                    pieceVisibleWidth,
                    metrics.height,
                    piece.u0,
                    uVisibleEnd
                );
            } else {
                piece.mesh.visible = false;
            }

            remaining -= fullPieceWidth;
            cursorLeft += fullPieceWidth;
        }
    }

    layoutThreeSliceBarIndicator(indicator, width, height) {
        indicator.backgroundMetrics = this.computeBarSliceMetrics(indicator.backgroundLayer.texture, width, height);
        indicator.fillMetrics = this.computeBarSliceMetrics(indicator.fillLayer.texture, width, height);
        this.layoutThreeSliceLayerFull(indicator.backgroundLayer, indicator.backgroundMetrics);
        this.layoutThreeSliceLayerFill(indicator.fillLayer, indicator.fillMetrics, indicator.progress);
    }

    setHealthProgress(value) {
        this.setIndicatorProgress(this.healthIndicator, value);
    }

    setFlameProgress(value) {
        void value;
    }

    setEnergyProgress(value) {
        this.setIndicatorProgress(this.energyIndicator, value);
    }

    setBarProgress(value) {
        const progress = Number.isFinite(value) ? value / 100 : 0;
        this.setIndicatorProgress(this.barIndicator, progress);
    }

    setCoinCount(count) {
        const n = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
        if (this.coinDisplay.count === n) return;
        this.coinDisplay.count = n;
        this._updateCoinTexture();
    }

    setSkinsAffordableBadgeVisible(isVisible) {
        if (this.skinsBadgeSprite) {
            this.skinsBadgeSprite.visible = isVisible === true;
        }
    }

    setSkinsOnboardingArrowVisible(isVisible) {
        if (this.skinsOnboardingArrowSprite) {
            this.skinsOnboardingArrowSprite.visible = isVisible === true;
        }
    }

    addCoinCountVisual(amount) {
        const n = Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 0));
        if (n === 0) return;
        this.coinDisplay.count = Math.max(0, (this.coinDisplay.count || 0) + n);
        this._updateCoinTexture();
        this._punchCoinScale();
    }

    _punchCoinScale() {
        const sprite = this.coinDisplay.textSprite;
        if (!sprite) return;

        // Cancel any in-flight punch so a rapid arrival restarts fresh.
        if (this._coinPunchRaf) {
            cancelAnimationFrame(this._coinPunchRaf);
            this._coinPunchRaf = null;
        }

        const baseScale = sprite.userData._baseScale;
        if (!baseScale) return;

        const PEAK = 1.45;
        const DURATION = 280;
        const t0 = performance.now();

        const tick = (now) => {
            const p = Math.min((now - t0) / DURATION, 1);
            // Quick attack, slow spring back: ease out with overshoot feel.
            const s = p < 0.25
                ? 1 + (PEAK - 1) * (p / 0.25)                  // ramp up
                : 1 + (PEAK - 1) * Math.cos((p - 0.25) / 0.75 * Math.PI * 0.5); // spring back
            sprite.scale.set(
                baseScale.x * s,
                baseScale.y * s,
                baseScale.z
            );
            if (p < 1) {
                this._coinPunchRaf = requestAnimationFrame(tick);
            } else {
                sprite.scale.copy(baseScale);
                this._coinPunchRaf = null;
            }
        };
        this._coinPunchRaf = requestAnimationFrame(tick);
    }

    createCoinDisplay(renderOrder) {
        const root = new THREE.Group();
        this.groupRoot.add(root);

        const bgSprite = new THREE.Sprite(createSpriteMaterial(this.textures.coinBackground, 0.95));
        bgSprite.renderOrder = renderOrder;
        root.add(bgSprite);

        const textCanvas = document.createElement('canvas');
        const textTexture = new THREE.CanvasTexture(textCanvas);
        const textSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: textTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        }));
        textSprite.renderOrder = renderOrder + 1;
        root.add(textSprite);

        return { root, bgSprite, textSprite, textCanvas, textTexture, count: -1, width: 0, height: 0 };
    }

    _updateCoinTexture() {
        const { textCanvas, textTexture } = this.coinDisplay;
        const count = Math.max(0, this.coinDisplay.count);
        const w = textCanvas.width;
        const h = textCanvas.height;
        if (w <= 0 || h <= 0) return;

        const ctx = textCanvas.getContext('2d');
        ctx.clearRect(0, 0, w, h);

        const fontSize = Math.round(h * 0.62);
        ctx.font = `700 ${fontSize}px "Orbitron"`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        const tx = w * 0.06;
        const text = String(count);
        const textMetrics = ctx.measureText(text);
        const ascent = Number.isFinite(textMetrics.actualBoundingBoxAscent)
            ? textMetrics.actualBoundingBoxAscent
            : fontSize * 0.72;
        const descent = Number.isFinite(textMetrics.actualBoundingBoxDescent)
            ? textMetrics.actualBoundingBoxDescent
            : fontSize * 0.18;
        const targetCenterY = h * 0.5;
        const baselineY = targetCenterY + ((ascent - descent) * 0.5);

        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillText(text, tx + 2, baselineY + 2);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, tx, baselineY);

        textTexture.needsUpdate = true;
    }

    setIndicatorProgress(indicator, value) {
        indicator.progress = clamp01(value);
        this.updateIndicatorFill(indicator);
    }

    updateIndicatorFill(indicator) {
        if (indicator.type === 'threeSliceBar') {
            if (indicator.fillMetrics) {
                this.layoutThreeSliceLayerFill(indicator.fillLayer, indicator.fillMetrics, indicator.progress);
            }
            return;
        }

        const progress = clamp01(indicator.progress);
        const epsilon = 0.0001;

        if (progress <= epsilon) {
            indicator.fill.visible = false;
            return;
        }

        indicator.fill.visible = true;
        const fillMaterial = indicator.fill.material;
        fillMaterial.userData.fillProgress = progress;
        if (fillMaterial.userData.fillShader?.uniforms?.uFillProgress) {
            fillMaterial.userData.fillShader.uniforms.uFillProgress.value = progress;
        }
    }

    setIndicatorSize(indicator, width, height) {
        indicator.background.scale.set(width, height, 1);
        indicator.fill.scale.set(width, height, 1);
    }

    layout(width, height) {
        this.lastLayoutWidth = Math.max(width, 1);
        this.lastLayoutHeight = Math.max(height, 1);

        this.uiCamera.left = 0;
        this.uiCamera.right = this.lastLayoutWidth;
        this.uiCamera.top = this.lastLayoutHeight;
        this.uiCamera.bottom = 0;
        this.uiCamera.updateProjectionMatrix();

        // Use landscape layout only when meaningfully wider than tall (aspect >= 1.4).
        // Narrower windows stay in portrait so the group doesn't get squeezed.
        const isPortrait = this.lastLayoutWidth / this.lastLayoutHeight < 1.4;
        const topOffset = isPortrait
            ? toPositiveNumber(this.config.topOffsetPortrait, DEFAULT_TOP_BAR_CONFIG.topOffsetPortrait)
            : toPositiveNumber(this.config.topOffsetLandscape, DEFAULT_TOP_BAR_CONFIG.topOffsetLandscape);

        const topPadding = toPositiveNumber(this.config.topPadding, DEFAULT_TOP_BAR_CONFIG.topPadding);
        const rightPadding = toPositiveNumber(this.config.rightPadding, DEFAULT_TOP_BAR_CONFIG.rightPadding);
        const leftPadding = toPositiveNumber(this.config.leftPadding, DEFAULT_TOP_BAR_CONFIG.leftPadding);
        const groupToSettingsGap = toPositiveNumber(this.config.groupToSettingsGap, DEFAULT_TOP_BAR_CONFIG.groupToSettingsGap);
        const shortSide = Math.max(Math.min(this.lastLayoutWidth, this.lastLayoutHeight), 1);
        const orientationScale = THREE.MathUtils.clamp(shortSide / 900, 0.52, 1);
        const itemScale = Math.max(toPositiveNumber(this.config.itemScale, 1), 0.001) * orientationScale;

        let verticalHeight = toPositiveNumber(this.config.verticalItemHeight, DEFAULT_TOP_BAR_CONFIG.verticalItemHeight) * itemScale;
        let barHeight = toPositiveNumber(this.config.barHeight, DEFAULT_TOP_BAR_CONFIG.barHeight) * itemScale;
        let settingsHeight = toPositiveNumber(this.config.settingsHeight, DEFAULT_TOP_BAR_CONFIG.settingsHeight) * itemScale;
        let groupGap = toPositiveNumber(this.config.groupGap, DEFAULT_TOP_BAR_CONFIG.groupGap) * itemScale;

        let healthWidth = verticalHeight * this.getTextureAspect(this.textures.healthBackground, 1);
        let energyWidth = verticalHeight * this.getTextureAspect(this.textures.energyBackground, 1);
        let barWidth = 0;
        this.barIndicator.root.visible = false;
        const coinScale = 1.3;
        let coinHeight = verticalHeight * coinScale;
        let coinWidth = coinHeight * this.getTextureAspect(this.textures.coinBackground, 3);
        let settingsWidth = settingsHeight * this.getTextureAspect(this.textures.settingsButton, 1);

        let minimapHeight = toPositiveNumber(this.config.minimapHeight, DEFAULT_TOP_BAR_CONFIG.minimapHeight) * itemScale;
        let minimapWidth = minimapHeight * this.getTextureAspect(this.textures.minimap, 1);

        // Landscape: minimap is part of the centered group (between bar and settings).
        // Portrait: minimap floats at top-right, independent of the group.
        const minimapInGroup = !isPortrait;
        const minimapGroupGap = minimapInGroup ? groupGap : 0;

        let groupWidth = healthWidth + energyWidth + coinWidth + (groupGap * 2)
            + (minimapInGroup ? minimapWidth + minimapGroupGap : 0);
        const settingsLeftEdge = this.lastLayoutWidth - rightPadding - settingsWidth;
        const maxGroupRight = settingsLeftEdge - groupToSettingsGap;
        const availableGroupWidth = Math.max(1, maxGroupRight - leftPadding);
        if (groupWidth > availableGroupWidth) {
            const fitScale = THREE.MathUtils.clamp(availableGroupWidth / groupWidth, 0.3, 1);
            healthWidth *= fitScale;
            energyWidth *= fitScale;
            coinWidth *= fitScale;
            coinHeight *= fitScale;
            verticalHeight *= fitScale;
            barHeight *= fitScale;
            groupGap *= fitScale;
            settingsWidth *= fitScale;
            settingsHeight *= fitScale;
            minimapWidth *= fitScale;
            minimapHeight *= fitScale;
            groupWidth = healthWidth + energyWidth + coinWidth + (groupGap * 2)
                + (minimapInGroup ? minimapWidth + groupGap : 0);
        }

        // Center the group within the available space between leftPadding and settings.
        let groupLeft = leftPadding + (availableGroupWidth - groupWidth) * 0.5;
        if (groupLeft + groupWidth > maxGroupRight) {
            groupLeft = maxGroupRight - groupWidth;
        }
        groupLeft = Math.max(groupLeft, leftPadding);

        const rowHeight = Math.max(verticalHeight, settingsHeight, minimapHeight);
        const rowCenterY = this.lastLayoutHeight - topPadding - topOffset - (rowHeight * 0.5);

        this.setIndicatorSize(this.healthIndicator, healthWidth, verticalHeight);
        this.setIndicatorSize(this.energyIndicator, energyWidth, verticalHeight);
        this.settingsSprite.scale.set(settingsWidth, settingsHeight, 1);
        this.minimapSprite.scale.set(minimapWidth, minimapHeight, 1);

        // Coin display: background sprite + text sprite covering the right ~65% of the background.
        this.coinDisplay.bgSprite.scale.set(coinWidth, coinHeight, 1);
        const textW = coinWidth * 0.65;
        const textH = coinHeight * 0.65;
        this.coinDisplay.textSprite.scale.set(textW, textH, 1);
        this.coinDisplay.textSprite.userData._baseScale = new THREE.Vector3(textW, textH, 1);
        // Fixed canvas resolution — aspect ratio difference causes no vertical error because
        // we only care about the Y midpoint (h*0.5) which maps to the sprite's Y midpoint regardless.
        if (this.coinDisplay.textCanvas.width !== 256 || this.coinDisplay.textCanvas.height !== 80) {
            this.coinDisplay.textCanvas.width = 256;
            this.coinDisplay.textCanvas.height = 80;
            this._updateCoinTexture();
        }
        this.coinDisplay.width = coinWidth;
        this.coinDisplay.height = coinHeight;

        let cursorX = groupLeft;
        this.healthIndicator.root.position.set(cursorX + (healthWidth * 0.5), rowCenterY, 0);
        cursorX += healthWidth + groupGap;
        this.energyIndicator.root.position.set(cursorX + (energyWidth * 0.5), rowCenterY, 0);
        cursorX += energyWidth + groupGap * 0;
        this.coinDisplay.root.position.set(cursorX + (coinWidth * 0.5), rowCenterY, 0);
        // Text sprite left-edge aligned just after the coin icon (~37% from bg left edge).
        // Keep it slightly below the sprite center to match the coinbar number slot.
        this.coinDisplay.textSprite.position.set(coinWidth * 0.195, coinHeight * -0.025, 0);
        cursorX += coinWidth;

        let minimapCenterX, minimapCenterY;
        if (minimapInGroup) {
            cursorX += groupGap;
            minimapCenterX = cursorX + (minimapWidth * 0.5);
            minimapCenterY = rowCenterY;
            this.minimapRoot.position.set(minimapCenterX, minimapCenterY, 0);
        } else {
            // Portrait: anchor right edge of minimap to right edge of screen, just above the settings button.
            const mmRightOffset = toPositiveNumber(this.config.minimapPortraitRightOffset, DEFAULT_TOP_BAR_CONFIG.minimapPortraitRightOffset);
            const settingsTopEdge = rowCenterY + (settingsHeight * 0.5);
            const portraitGap = groupGap;
            minimapCenterX = this.lastLayoutWidth - mmRightOffset - (minimapWidth * 0.5);
            minimapCenterY = settingsTopEdge + portraitGap + (minimapHeight * 0.5);
            this.minimapRoot.position.set(minimapCenterX, minimapCenterY, 0);
        }

        // Store screen-space bounds for dot placement.
        // The UI camera maps world coords = screen pixels, Y-up (origin = bottom-left).
        // Convert to top-left origin for external callers by flipping Y.
        this.minimapScreenBounds = {
            x: minimapCenterX - (minimapWidth * 0.5),
            y: this.lastLayoutHeight - minimapCenterY - (minimapHeight * 0.5),
            width: minimapWidth,
            height: minimapHeight,
            // Also keep the Three.js world-space center for dot positioning.
            worldCenterX: minimapCenterX,
            worldCenterY: minimapCenterY
        };

        // Size the dot — 8px logical radius, scaled with minimap
        const dotSize = Math.max(minimapHeight * 0.08, 4);
        this.minimapDotSprite.scale.set(dotSize * 2, dotSize * 2, 1);

        this._updateCoinTexture();

        const settingsCenterX = this.lastLayoutWidth - rightPadding - (settingsWidth * 0.5);
        this.settingsRoot.position.set(settingsCenterX, rowCenterY, 0);
        this.settingsButtonRect = {
            left: settingsCenterX - (settingsWidth * 0.5),
            right: settingsCenterX + (settingsWidth * 0.5),
            top: this.lastLayoutHeight - (rowCenterY + (settingsHeight * 0.5)),
            bottom: this.lastLayoutHeight - (rowCenterY - (settingsHeight * 0.5))
        };
        this.hudRowScreenBounds = {
            left: leftPadding,
            right: this.lastLayoutWidth - rightPadding,
            top: this.lastLayoutHeight - (rowCenterY + (rowHeight * 0.5)),
            bottom: this.lastLayoutHeight - (rowCenterY - (rowHeight * 0.5)),
            height: rowHeight
        };

        // Skins button sits directly left of the settings button with a small gap.
        const skinsGap = -4;
        const skinsCenterX = settingsCenterX - settingsWidth * 0.5 - skinsGap - settingsWidth * 0.5;
        this.skinsSprite.scale.set(settingsWidth, settingsHeight, 1);
        this.skinsSprite.position.set(skinsCenterX - settingsCenterX, 0, 0);
        const badgeSize = settingsHeight * 0.34;
        this.skinsBadgeSprite.scale.set(badgeSize, badgeSize, 1);
        this.skinsBadgeSprite.position.set(
            this.skinsSprite.position.x + settingsWidth * 0.22,
            -settingsHeight * 0.25,
            0
        );
        const arrowHeight = settingsHeight * 0.58;
        const arrowWidth = arrowHeight * 0.75;
        this.skinsOnboardingArrowBaseY = -settingsHeight * 0.86;
        this.skinsOnboardingArrowSprite.scale.set(arrowWidth, arrowHeight, 1);
        this.skinsOnboardingArrowSprite.position.set(
            this.skinsSprite.position.x,
            this.skinsOnboardingArrowBaseY,
            0
        );
        this.skinsButtonRect = {
            left: skinsCenterX - (settingsWidth * 0.5),
            right: skinsCenterX + (settingsWidth * 0.5),
            top: this.lastLayoutHeight - (rowCenterY + (settingsHeight * 0.5)),
            bottom: this.lastLayoutHeight - (rowCenterY - (settingsHeight * 0.5))
        };
    }

    // Creates a white circle texture for the dot; tinted red via SpriteMaterial.color.
    _createDotTexture(radius) {
        const size = radius * 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.arc(radius, radius, radius - 1, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    _createOvalTexture(w, h) {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.beginPath();
        ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    updateMinimapZeppelinDots(objects, level) {
        if (!this._zeppelinDotPool) {
            this._zeppelinDotPool = [];
            this._zeppelinDotTexture = this._createOvalTexture(20, 10);
        }

        const needed = objects ? objects.length : 0;

        while (this._zeppelinDotPool.length < needed) {
            const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: this._zeppelinDotTexture,
                    color: 0xffffff,
                    transparent: true,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            sprite.renderOrder = 2041;
            sprite.visible = false;
            this.root.add(sprite);
            this._zeppelinDotPool.push(sprite);
        }

        const b = this.minimapScreenBounds;
        const ovalW = Math.max(b.width * 0.03, 3);
        const ovalH = Math.max(b.height * 0.04, 1.5);
        const scaleX = ovalW * 2;
        const scaleY = ovalH * 2;
        const poolLen = this._zeppelinDotPool.length;

        for (let i = 0; i < needed; i++) {
            const sprite = this._zeppelinDotPool[i];
            const obj    = objects[i];

            if (!obj || !level || obj.isDestroyed || obj.markedForRemoval || obj.container?.visible === false) {
                sprite.visible = false;
                continue;
            }

            const pos = this._worldPosToMinimapSprite(obj.container.position.x, obj.container.position.y, level);
            if (!pos) { sprite.visible = false; continue; }

            sprite.scale.set(scaleX, scaleY, 1);
            sprite.position.set(pos.x, pos.y, 0);
            sprite.visible = true;
        }
        for (let i = needed; i < poolLen; i++) {
            const sprite = this._zeppelinDotPool[i];
            if (sprite.visible) sprite.visible = false;
        }
    }

    _createOnboardingArrowTexture(width = 96, height = 128) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const cx = width * 0.5;

        ctx.clearRect(0, 0, width, height);
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.38)';
        ctx.shadowBlur = width * 0.08;
        ctx.shadowOffsetY = height * 0.03;

        ctx.beginPath();
        ctx.moveTo(cx, height * 0.08);
        ctx.lineTo(width * 0.82, height * 0.42);
        ctx.lineTo(width * 0.62, height * 0.42);
        ctx.lineTo(width * 0.62, height * 0.86);
        ctx.lineTo(width * 0.38, height * 0.86);
        ctx.lineTo(width * 0.38, height * 0.42);
        ctx.lineTo(width * 0.18, height * 0.42);
        ctx.closePath();

        ctx.fillStyle = '#ff2a1f';
        ctx.fill();
        ctx.shadowColor = 'transparent';
        ctx.lineWidth = Math.max(3, width * 0.055);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    _createAlertBadgeTexture(size = 64) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const center = size * 0.5;
        const radius = size * 0.42;

        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ff1111';
        ctx.fill();
        ctx.lineWidth = Math.max(2, size * 0.05);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${Math.round(size * 0.62)}px "Orbitron"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', center, center + size * 0.03);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    _createAlertDotTexture(size = 32) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const center = size * 0.5;
        const radius = size * 0.34;

        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ff1111';
        ctx.fill();
        ctx.lineWidth = Math.max(2, size * 0.08);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.needsUpdate = true;
        return texture;
    }

    // Returns the minimap image bounds in screen-pixel coordinates (top-left origin).
    getMinimapBounds() {
        return {
            x: this.minimapScreenBounds.x,
            y: this.minimapScreenBounds.y,
            width: this.minimapScreenBounds.width,
            height: this.minimapScreenBounds.height
        };
    }

    getHudRowBounds() {
        return {
            left: this.hudRowScreenBounds.left,
            right: this.hudRowScreenBounds.right,
            top: this.hudRowScreenBounds.top,
            bottom: this.hudRowScreenBounds.bottom,
            height: this.hudRowScreenBounds.height
        };
    }

    // Maps the dyno's world position onto the minimap and positions the red dot.
    // X maps relative to the full grid width; Y maps relative to the full grid height.
    // Aspect ratio is intentionally not corrected — the minimap image is the visual reference.
    // The dot is clamped to minimap bounds in case the dyno flies outside the grid.
    updateMinimapPlayerDot(dynoX, dynoY, level) {
        if (!level) { this.minimapDotSprite.visible = false; return; }

        const gridWorldWidth  = level.width  * level.tileWidth;
        const gridWorldHeight = level.height * level.tileHeight;
        if (gridWorldWidth <= 0 || gridWorldHeight <= 0) { this.minimapDotSprite.visible = false; return; }

        const originX = level.worldOriginX ?? 0;
        const originY = level.worldOriginY ?? 0;
        const gridTop    = this.config.minimapGridTop    ?? DEFAULT_TOP_BAR_CONFIG.minimapGridTop;
        const gridBottom = this.config.minimapGridBottom ?? DEFAULT_TOP_BAR_CONFIG.minimapGridBottom;

        // Two-segment Y mapping:
        // Segment 1: world bottom → grid top Y  →  image [gridBottom .. gridTop]
        // Segment 2: grid top Y  → flight ceiling  →  image [gridTop .. 0]
        const worldGridBottom = originY;
        const worldGridTop    = originY + gridWorldHeight;
        const worldCeiling    = level.flightCeilingY ?? worldGridTop;

        let rx = (dynoX - originX) / gridWorldWidth;
        rx = THREE.MathUtils.clamp(rx, 0, 1);

        let mappedRy;
        const dynoWorldY = dynoY;
        if (dynoWorldY <= worldGridTop) {
            // Below or at grid top — map into [gridTop .. gridBottom] image slice
            const t = THREE.MathUtils.clamp((dynoWorldY - worldGridBottom) / Math.max(worldGridTop - worldGridBottom, 0.0001), 0, 1);
            // t=0 → image gridBottom, t=1 → image gridTop
            mappedRy = gridBottom - t * (gridBottom - gridTop);
        } else {
            // Above grid top — map into [0 .. gridTop] image slice
            const aboveCeilingRange = Math.max(worldCeiling - worldGridTop, 0.0001);
            const t = THREE.MathUtils.clamp((dynoWorldY - worldGridTop) / aboveCeilingRange, 0, 1);
            // t=0 → image gridTop, t=1 → image 0
            mappedRy = gridTop - t * gridTop;
        }

        const b = this.minimapScreenBounds;
        const dotSize = Math.max(b.height * 0.08, 4);
        const dotHalfFrac = b.height > 0 ? dotSize / b.height : 0;
        const clampedRy = THREE.MathUtils.clamp(mappedRy, dotHalfFrac, 1 - dotHalfFrac);
        // Convert from screen-pixel (top-left origin) back to Three.js world-space (bottom-left origin).
        const dotWorldX = b.x + rx * b.width;
        const dotWorldY = this.lastLayoutHeight - (b.y + clampedRy * b.height);

        this.minimapDotSprite.position.set(dotWorldX, dotWorldY, 0);
        this.minimapDotSprite.visible = true;
    }

    // Maps a world position to minimap sprite coords. Returns the scratch object on
    // success (do not retain — overwritten on next call) or null if outside the visible range.
    _worldPosToMinimapSprite(worldX, worldY, level) {
        const gridWorldWidth  = level.width  * level.tileWidth;
        const gridWorldHeight = level.height * level.tileHeight;
        if (gridWorldWidth <= 0 || gridWorldHeight <= 0) return null;

        const originX = level.worldOriginX ?? 0;
        const originY = level.worldOriginY ?? 0;
        const gridTop    = this.config.minimapGridTop    ?? DEFAULT_TOP_BAR_CONFIG.minimapGridTop;
        const gridBottom = this.config.minimapGridBottom ?? DEFAULT_TOP_BAR_CONFIG.minimapGridBottom;
        const worldGridTop = originY + gridWorldHeight;
        const worldCeiling = level.flightCeilingY ?? worldGridTop;

        const rx = (worldX - originX) / gridWorldWidth;
        if (rx < 0 || rx > 1) return null;

        let mappedRy;
        if (worldY <= worldGridTop) {
            const t = THREE.MathUtils.clamp((worldY - originY) / Math.max(worldGridTop - originY, 0.0001), 0, 1);
            mappedRy = gridBottom - t * (gridBottom - gridTop);
        } else {
            const t = THREE.MathUtils.clamp((worldY - worldGridTop) / Math.max(worldCeiling - worldGridTop, 0.0001), 0, 1);
            mappedRy = gridTop - t * gridTop;
        }

        if (mappedRy < 0 || mappedRy > 1) return null;

        const b = this.minimapScreenBounds;
        const out = this._scratchMinimapPos || (this._scratchMinimapPos = { x: 0, y: 0 });
        out.x = b.x + rx * b.width;
        out.y = this.lastLayoutHeight - (b.y + mappedRy * b.height);
        return out;
    }

    // Shows a small black dot on the minimap for each object in the provided array.
    // Objects that are destroyed, invisible, or outside the level are skipped.
    // Call once per frame with the filtered list of objects to display (e.g. all live planes).
    updateMinimapObjectDots(objects, level) {
        // Lazily create the dot pool.
        if (!this._objectDotPool) {
            this._objectDotPool = [];
            this._objectDotTexture = this._createDotTexture(6);
        }

        const needed = objects ? objects.length : 0;

        // Grow pool as needed.
        while (this._objectDotPool.length < needed) {
            const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: this._objectDotTexture,
                    color: 0xffdd00,
                    transparent: true,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            sprite.renderOrder = 2044;
            sprite.visible = false;
            this.root.add(sprite);
            this._objectDotPool.push(sprite);
        }

        const b = this.minimapScreenBounds;
        const dotSize = Math.max(b.height * 0.035, 2);
        const dotScale = dotSize * 2;
        const poolLen = this._objectDotPool.length;

        for (let i = 0; i < needed; i++) {
            const sprite = this._objectDotPool[i];
            const obj    = objects[i];

            if (!obj || !level || obj.isDestroyed || obj.markedForRemoval || obj.container?.visible === false) {
                sprite.visible = false;
                continue;
            }

            const pos = this._worldPosToMinimapSprite(obj.container.position.x, obj.container.position.y, level);
            if (!pos) { sprite.visible = false; continue; }

            sprite.scale.set(dotScale, dotScale, 1);
            sprite.position.set(pos.x, pos.y, 0);
            sprite.visible = true;
        }
        // Hide any leftover pooled sprites beyond the needed count.
        for (let i = needed; i < poolLen; i++) {
            const sprite = this._objectDotPool[i];
            if (sprite.visible) sprite.visible = false;
        }
    }

    updateMinimapSharkDots(objects, level) {
        if (!this._sharkDotPool) {
            this._sharkDotPool = [];
            this._sharkDotTexture = this._createDotTexture(6);
        }

        const needed = objects ? objects.length : 0;

        while (this._sharkDotPool.length < needed) {
            const sprite = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: this._sharkDotTexture,
                    color: 0x888888,
                    transparent: true,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            sprite.renderOrder = 2043;
            sprite.visible = false;
            this.root.add(sprite);
            this._sharkDotPool.push(sprite);
        }

        const b = this.minimapScreenBounds;
        const dotSize = Math.max(b.height * 0.035, 2);
        const dotScale = dotSize * 2;
        const poolLen = this._sharkDotPool.length;

        for (let i = 0; i < needed; i++) {
            const sprite = this._sharkDotPool[i];
            const obj    = objects[i];

            if (!obj || !level || obj.isDestroyed || obj.markedForRemoval || obj.container?.visible === false) {
                sprite.visible = false;
                continue;
            }

            const pos = this._worldPosToMinimapSprite(obj.container.position.x, obj.container.position.y, level);
            if (!pos) { sprite.visible = false; continue; }

            sprite.scale.set(dotScale, dotScale, 1);
            sprite.position.set(pos.x, pos.y, 0);
            sprite.visible = true;
        }
        for (let i = needed; i < poolLen; i++) {
            const sprite = this._sharkDotPool[i];
            if (sprite.visible) sprite.visible = false;
        }
    }

    // Shows a single gray dot on the minimap at the active mission target's world position.
    // Pass null for targetWorldPos to hide the dot.
    updateMinimapMissionTargetDot(targetWorldPos, level) {
        if (!this._missionTargetDot) {
            if (!this._objectDotTexture) {
                this._objectDotTexture = this._createDotTexture(6);
            }
            this._missionTargetDot = new THREE.Sprite(
                new THREE.SpriteMaterial({
                    map: this._objectDotTexture,
                    color: 0x44cc44,
                    transparent: true,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            this._missionTargetDot.renderOrder = 2044;
            this._missionTargetDot.visible = false;
            this.root.add(this._missionTargetDot);
        }

        if (!targetWorldPos || !level) {
            this._missionTargetDot.visible = false;
            return;
        }

        const pos = this._worldPosToMinimapSprite(targetWorldPos.x, targetWorldPos.y, level);
        if (!pos) {
            this._missionTargetDot.visible = false;
            return;
        }

        const b = this.minimapScreenBounds;
        const dotSize = Math.max(b.height * 0.045, 2);
        this._missionTargetDot.scale.set(dotSize * 2, dotSize * 2, 1);
        this._missionTargetDot.position.set(pos.x, pos.y, 0);
        this._missionTargetDot.visible = true;
    }

    updateMinimapSkinsAffordableDot(targetWorldPos, level, isVisible) {
        if (!this.minimapSkinsAffordableDot) {
            return;
        }
        if (!isVisible || !targetWorldPos || !level) {
            this.minimapSkinsAffordableDot.visible = false;
            return;
        }

        const pos = this._worldPosToMinimapSprite(targetWorldPos.x, targetWorldPos.y, level);
        if (!pos) {
            this.minimapSkinsAffordableDot.visible = false;
            return;
        }

        const b = this.minimapScreenBounds;
        const dotSize = Math.max(b.height * 0.055, 3);
        const blinkAlpha = 0.45 + 0.55 * ((Math.sin(performance.now() * 0.012) + 1) * 0.5);
        this.minimapSkinsAffordableDot.scale.set(dotSize * 2, dotSize * 2, 1);
        this.minimapSkinsAffordableDot.position.set(pos.x, pos.y, 0);
        this.minimapSkinsAffordableDot.material.opacity = blinkAlpha;
        this.minimapSkinsAffordableDot.visible = true;
    }

    // Returns the screen-space center of the named HUD indicator in CSS pixel coordinates
    // (top-left origin). Valid names: 'health', 'energy', 'coin'.
    // Returns null if the name is unknown.
    getIndicatorScreenPosition(name) {
        let root;
        switch (name) {
            case 'health': root = this.healthIndicator.root; break;
            case 'energy': root = this.energyIndicator.root; break;
            case 'coin':   root = this.coinDisplay.root;     break;
            default: return null;
        }
        // UI camera world-space is screen pixels, Y-up with origin at bottom-left.
        // Convert to CSS top-left origin by flipping Y.
        return {
            x: root.position.x,
            y: this.lastLayoutHeight - root.position.y
        };
    }

    isSettingsButtonHit(clientX, clientY) {
        const rect = this.settingsButtonRect;
        return clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom;
    }

    isSkinsButtonHit(clientX, clientY) {
        const rect = this.skinsButtonRect;
        return clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom;
    }

    render(renderer) {
        if (this.skinsOnboardingArrowSprite?.visible) {
            const bob = Math.sin(performance.now() * 0.006) * 7;
            this.skinsOnboardingArrowSprite.position.y = this.skinsOnboardingArrowBaseY + bob;
        }
        renderer.clearDepth();
        renderer.render(this.uiScene, this.uiCamera);
    }

    dispose() {
        this.groupRoot.traverse((child) => {
            child.material?.dispose?.();
            child.geometry?.dispose?.();
        });
        this.settingsRoot.traverse((child) => {
            child.material?.dispose?.();
            child.geometry?.dispose?.();
        });

        for (const texture of Object.values(this.textures)) {
            texture?.dispose?.();
        }
    }
}
