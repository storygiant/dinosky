import * as THREE from 'three';
import { CONFIG } from './config.js';

const SIDE_SPEED_ASSETS = {
    background: 'gfx/UI/sidebutton.webp',
    speedIcon: 'gfx/UI/booster_speed.webp',
    timerGreen: 'gfx/UI/timer_green.webp',
    timerRed: 'gfx/UI/timer_red.webp',
    ad: 'gfx/UI/ad.webp'
};

export const SIDE_SPEED_BOOST_ASSET_URLS = Object.values(SIDE_SPEED_ASSETS);

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function formatSeconds(totalSeconds) {
    const clamped = Math.max(0, Math.ceil(Number.isFinite(totalSeconds) ? totalSeconds : 0));
    const minutes = Math.floor(clamped / 60);
    const seconds = clamped % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function getTopBarRowMetrics(width, height) {
    const isPortrait = width / height < 1.4;
    const topOffset = isPortrait ? 75 : 0;
    const rowHeight = 106 * (height / 760);
    const rowCenterY = height - topOffset - (rowHeight * 0.5);
    return { rowCenterY, rowHeight };
}

export class SideSpeedBoostButton {
    constructor({ durationSeconds = 120, onPress, domElement = null, loadingManager = null } = {}) {
        this.durationSeconds = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 120);
        this.onPress = onPress;
        this.domElement = domElement;
        this.loadingManager = loadingManager || undefined;
        this.isActive = false;
        this.isPending = false;
        this.isVisible = true;
        this.externalVisible = true;
        this.isUnlocked = false;
        this.revealProgress = 0;
        this.revealSpeed = 4.5;
        this.remainingSeconds = this.durationSeconds;
        this.lastTimerText = '';
        this.lastTimerIsActive = null;
        this.bounds = { left: 0, right: 0, top: 0, bottom: 0 };
        this.targetCenterX = 0;
        this.hiddenCenterX = 0;
        this.lastLayoutWidth = 1;
        this.lastLayoutHeight = 1;
        this.uiShortSideUnits = CONFIG.VIEW_HEIGHT;

        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.textures = {
            background: this.loadTexture(SIDE_SPEED_ASSETS.background),
            speedIcon: this.loadTexture(SIDE_SPEED_ASSETS.speedIcon),
            timerGreen: this.loadTexture(SIDE_SPEED_ASSETS.timerGreen),
            timerRed: this.loadTexture(SIDE_SPEED_ASSETS.timerRed),
            ad: this.loadTexture(SIDE_SPEED_ASSETS.ad)
        };

        this.uiScene = new THREE.Scene();
        this.uiCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
        this.uiCamera.position.z = 1;

        this.root = new THREE.Group();
        this.uiScene.add(this.root);

        this.backgroundSprite = new THREE.Sprite(createSpriteMaterial(this.textures.background, 0.96));
        this.backgroundSprite.renderOrder = 2500;
        this.iconSprite = new THREE.Sprite(createSpriteMaterial(this.textures.speedIcon, 1));
        this.iconSprite.renderOrder = 2510;
        this.adSprite = new THREE.Sprite(createSpriteMaterial(this.textures.ad, 1));
        this.adSprite.renderOrder = 2530;
        this.timerBgSprite = new THREE.Sprite(createSpriteMaterial(this.textures.timerRed, 1));
        this.timerBgSprite.renderOrder = 2520;
        this.timerTextSprite = new THREE.Sprite(createSpriteMaterial(this.createTimerTextTexture('0:00'), 1));
        this.timerTextSprite.renderOrder = 2525;

        this.root.add(
            this.backgroundSprite,
            this.iconSprite,
            this.adSprite,
            this.timerBgSprite,
            this.timerTextSprite
        );

        this.handlePointerDown = (event) => this.onPointerDown(event);
        this.domElement?.addEventListener?.('pointerdown', this.handlePointerDown, { capture: true });

        this.layout(window.innerWidth, window.innerHeight);
        this.update({
            isActive: false,
            isPending: false,
            remainingSeconds: this.durationSeconds,
            durationSeconds: this.durationSeconds,
            isVisible: true
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

    createTimerTextTexture(text) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 96;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.font = '700 44px "Orbitron"';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.lineJoin = 'round';
        context.strokeStyle = 'rgba(0, 0, 0, 0.36)';
        context.lineWidth = 7;
        context.strokeText(text, canvas.width * 0.5, canvas.height * 0.52);
        context.fillStyle = '#ffffff';
        context.fillText(text, canvas.width * 0.5, canvas.height * 0.52);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return texture;
    }

    setTimerText(text) {
        if (this.lastTimerText === text) {
            return;
        }
        this.lastTimerText = text;
        const previousTexture = this.timerTextSprite.material.map;
        this.timerTextSprite.material.map = this.createTimerTextTexture(text);
        this.timerTextSprite.material.needsUpdate = true;
        previousTexture?.dispose?.();
    }

    update({ isActive, isPending, remainingSeconds, durationSeconds, isVisible = true, isUnlocked = false, dt = 0 } = {}) {
        if (Number.isFinite(durationSeconds)) {
            this.durationSeconds = Math.max(0, durationSeconds);
        }

        this.isActive = Boolean(isActive);
        this.isPending = Boolean(isPending);
        this.isVisible = Boolean(isVisible);
        this.isUnlocked = Boolean(isUnlocked);
        this.remainingSeconds = Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : this.durationSeconds;

        if (this.isUnlocked) {
            const next = this.revealProgress + (Math.max(0, Number.isFinite(dt) ? dt : 0) * this.revealSpeed);
            this.revealProgress = clamp(next, 0, 1);
        } else {
            this.revealProgress = 0;
        }

        const displaySeconds = this.isActive ? this.remainingSeconds : this.durationSeconds;
        this.setTimerText(formatSeconds(displaySeconds));
        const canRender = this.isVisible && this.externalVisible && this.revealProgress > 0.0001;
        this.root.visible = canRender;
        this.adSprite.visible = canRender && !this.isPending;
        this.timerBgSprite.material.map = this.isActive ? this.textures.timerGreen : this.textures.timerRed;
        this.timerBgSprite.material.needsUpdate = this.lastTimerIsActive !== this.isActive;
        this.lastTimerIsActive = this.isActive;

        const disabledOpacity = this.isPending ? 0.72 : 1;
        this.backgroundSprite.material.opacity = 0.96 * disabledOpacity;
        this.iconSprite.material.opacity = disabledOpacity;
        this.timerBgSprite.material.opacity = disabledOpacity;
        this.timerTextSprite.material.opacity = disabledOpacity;
        this.adSprite.material.opacity = disabledOpacity;
        const visibleCenterX = this.targetCenterX || this.root.position.x;
        const hiddenCenterX = this.hiddenCenterX || visibleCenterX;
        this.root.position.x = THREE.MathUtils.lerp(hiddenCenterX, visibleCenterX, this.revealProgress);
    }

    setUiVisible(isVisible) {
        this.externalVisible = isVisible !== false;
        this.root.visible = this.isVisible && this.externalVisible && this.revealProgress > 0.0001;
    }

    layout(width, height) {
        this.lastLayoutWidth = Math.max(width, 1);
        this.lastLayoutHeight = Math.max(height, 1);

        this.uiCamera.left = 0;
        this.uiCamera.right = this.lastLayoutWidth;
        this.uiCamera.top = this.lastLayoutHeight;
        this.uiCamera.bottom = 0;
        this.uiCamera.updateProjectionMatrix();

        const isPortrait = this.lastLayoutWidth / this.lastLayoutHeight < 1.4;
        const shortLandscape = !isPortrait && this.lastLayoutHeight <= 520;
        const shortSide = Math.max(Math.min(this.lastLayoutWidth, this.lastLayoutHeight), 1);
        const pixelsPerUiUnit = shortSide / Math.max(this.uiShortSideUnits, 1);
        const joystickButtonDiameter = 3;
        const sideButtonUiWidth = joystickButtonDiameter * (isPortrait ? 2.05 : (shortLandscape ? 1.87 : 1.98));
        const buttonWidth = sideButtonUiWidth * pixelsPerUiUnit;
        const backgroundAspect = this.getTextureAspect(this.textures.background, 1.5);
        const buttonHeight = buttonWidth / backgroundAspect;
        const tuckRatio = isPortrait || shortLandscape ? 0.16 : 0.12;
        const rightPadding = 8;
        const centerX = this.lastLayoutWidth - rightPadding - (buttonWidth * 0.5) + (buttonWidth * tuckRatio);
        const topBarMetrics = getTopBarRowMetrics(this.lastLayoutWidth, this.lastLayoutHeight);
        const missionGap = buttonHeight * 0.04;
        const flameButtonCenterY = topBarMetrics.rowCenterY - (topBarMetrics.rowHeight * 0.5) - missionGap - (buttonHeight * 0.5);
        const buttonGap = buttonHeight * 0.12;
        const centerY = flameButtonCenterY - buttonHeight - buttonGap;

        this.targetCenterX = centerX;
        this.hiddenCenterX = centerX + (buttonWidth * 1.1);
        this.root.position.set(
            THREE.MathUtils.lerp(this.hiddenCenterX, this.targetCenterX, this.revealProgress),
            centerY,
            0
        );
        this.backgroundSprite.scale.set(buttonWidth, buttonHeight, 1);
        this.iconSprite.position.set(-buttonWidth * 0.06, buttonHeight * 0.02, 0);
        const iconWidth = buttonWidth;
        const iconHeight = iconWidth / this.getTextureAspect(this.textures.speedIcon, 1);
        this.iconSprite.scale.set(iconWidth, iconHeight, 1);

        const adSize = buttonWidth * 0.35;
        this.adSprite.position.set(buttonWidth * 0.2, buttonHeight * 0.4, 0);
        this.adSprite.scale.set(adSize, adSize, 1);

        const timerWidth = buttonWidth * 0.7;
        const timerHeight = buttonHeight * 0.3;
        this.timerBgSprite.position.set(buttonWidth * 0.15, -buttonHeight * 0.4, 0);
        this.timerBgSprite.scale.set(timerWidth, timerHeight, 1);
        this.timerTextSprite.position.copy(this.timerBgSprite.position);
        this.timerTextSprite.scale.set(timerWidth * 1.5, timerHeight * 1.5, 1);

        this.bounds.left = centerX - (buttonWidth * 0.5);
        this.bounds.right = centerX + (buttonWidth * 0.5);
        this.bounds.top = centerY - (buttonHeight * 0.5);
        this.bounds.bottom = centerY + (buttonHeight * 0.5);
    }

    containsClientPoint(clientX, clientY) {
        const rect = this.domElement?.getBoundingClientRect?.();
        if (!rect) {
            return false;
        }
        const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * this.lastLayoutWidth;
        const y = this.lastLayoutHeight - (((clientY - rect.top) / Math.max(rect.height, 1)) * this.lastLayoutHeight);
        return x >= this.bounds.left &&
            x <= this.bounds.right &&
            y >= this.bounds.top &&
            y <= this.bounds.bottom;
    }

    onPointerDown(event) {
        if (!this.externalVisible || !this.isVisible || !this.isUnlocked || this.revealProgress < 0.99 || this.isPending || !this.containsClientPoint(event.clientX, event.clientY)) {
            return;
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        this.onPress?.();
    }

    render(renderer) {
        if (!this.externalVisible || !this.isVisible || !this.root.visible) {
            return;
        }
        renderer.clearDepth();
        renderer.render(this.uiScene, this.uiCamera);
    }

    dispose() {
        this.domElement?.removeEventListener?.('pointerdown', this.handlePointerDown, { capture: true });
        this.root.traverse((child) => {
            child.material?.map?.dispose?.();
            child.material?.dispose?.();
            child.geometry?.dispose?.();
        });
        for (const texture of Object.values(this.textures)) {
            texture?.dispose?.();
        }
    }
}
