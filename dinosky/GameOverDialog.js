import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { DYNO_MODEL_SETTINGS } from './Player.js';
import { t } from './i18n.js';

const PREVIEW_MODEL_TARGET_SIZE = 11;
const PREVIEW_CAMERA_BASE_VIEW_HEIGHT = 13;
const PREVIEW_CAMERA_MIN_VIEW_WIDTH = 14;

function injectGameOverDialogStyles() {
    if (document.getElementById('dyno-game-over-dialog-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'dyno-game-over-dialog-styles';
    style.textContent = `
        .dyno-game-over-screen {
            position: fixed;
            inset: 0;
            z-index: 1100;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 24px;
            background:
                radial-gradient(circle at top, rgba(255, 221, 132, 0.18), transparent 34%),
                linear-gradient(180deg, rgba(7, 43, 96, 0.66) 0%, rgba(16, 92, 168, 0.56) 42%, rgba(50, 35, 24, 0.54) 100%);
            backdrop-filter: blur(4px);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 180ms ease, visibility 180ms ease;
        }

        .dyno-game-over-screen.is-visible {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }

        .dyno-game-over-card {
            width: min(100%, 478px);
            height: calc(100vh - 48px);
            height: calc(100dvh - 48px);
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: visible;
            padding: 28px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 24px;
            color: #f7fbff;
            background:
                linear-gradient(180deg, rgba(6, 24, 52, 0.96) 0%, rgba(12, 44, 87, 0.97) 100%);
            box-shadow:
                0 24px 70px rgba(3, 12, 27, 0.45),
                inset 0 1px 0 rgba(255, 255, 255, 0.14);
            font-family: "Orbitron";
        }

        .dyno-game-over-kicker {
            margin: 0 0 12px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            text-align: center;
            color: rgba(215, 240, 255, 0.72);
        }

        .dyno-game-over-preview {
            position: relative;
            flex: 1 1 auto;
            min-height: 160px;
            height: auto;
            margin: 0 -8px 22px;
            overflow: hidden;
            border-radius: 18px;
            background:
                radial-gradient(circle at 66% 28%, rgba(255, 178, 58, 0.1), transparent 28%),
                radial-gradient(circle at 32% 70%, rgba(60, 151, 255, 0.12), transparent 34%),
                linear-gradient(180deg, rgba(6, 30, 64, 0.64) 0%, rgba(4, 18, 42, 0.18) 100%);
        }

        .dyno-game-over-preview::after {
            content: "";
            position: absolute;
            inset: auto 9% 10px;
            height: 20px;
            border-radius: 999px;
            background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.34), transparent 68%);
            filter: blur(6px);
            pointer-events: none;
        }

        .dyno-game-over-preview canvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
        }

        .dyno-game-over-title {
            margin: 0 0 24px;
            font-size: clamp(34px, 7vw, 48px);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-align: center;
            text-transform: uppercase;
        }

        .dyno-game-over-actions {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 36px;
            overflow: visible;
        }

        .dyno-game-over-button {
            position: relative;
            min-height: 46px;
            padding: 12px 18px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-size: 14px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #14253a;
            background:
                linear-gradient(180deg, #fff4b8 0%, #ffb949 100%);
            box-shadow:
                0 12px 30px rgba(255, 160, 55, 0.35),
                inset 0 1px 0 rgba(255, 255, 255, 0.7);
            transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;
        }

        .dyno-game-over-button-ad {
            position: absolute;
            top: 0;
            right: 0;
            width: 50px;
            height: auto;
            transform: translate(34%, -42%);
            pointer-events: none;
            user-select: none;
        }

        .dyno-game-over-button:hover,
        .dyno-game-over-button:focus-visible {
            transform: translateY(-1px);
            box-shadow:
                0 16px 34px rgba(255, 160, 55, 0.42),
                inset 0 1px 0 rgba(255, 255, 255, 0.76);
            filter: brightness(1.03);
            outline: none;
        }

        .dyno-game-over-button:active {
            transform: translateY(1px);
        }

        .dyno-game-over-button:disabled {
            cursor: default;
            filter: saturate(0.75) brightness(0.9);
            opacity: 0.72;
            transform: none;
        }

        @media (max-width: 420px) {
            .dyno-game-over-card {
                padding: 20px;
            }

            .dyno-game-over-actions {
                gap: 14px;
            }

            .dyno-game-over-button-ad {
                width: 44px;
                transform: translate(28%, -40%);
            }
        }

        @media (max-height: 560px) and (orientation: landscape) {
            .dyno-game-over-screen {
                align-items: flex-start;
                overflow-y: auto;
                padding: 10px 12px;
            }

            .dyno-game-over-card {
                width: min(100%, 620px);
                height: calc(100vh - 20px);
                height: calc(100dvh - 20px);
                padding: 14px 18px;
                border-radius: 16px;
            }

            .dyno-game-over-preview {
                min-height: 80px;
                margin-bottom: 12px;
                border-radius: 12px;
            }

            .dyno-game-over-title {
                margin-bottom: 12px;
                font-size: clamp(24px, 9vh, 36px);
            }
        }
    `;

    document.head.appendChild(style);
}

export class GameOverDialog {
    constructor({ onRetry, onRevive } = {}) {
        injectGameOverDialogStyles();

        this.onRetry = onRetry;
        this.onRevive = onRevive;
        this.visible = false;
        this.preview = {
            renderer: null,
            scene: null,
            camera: null,
            root: null,
            mixer: null,
            resizeObserver: null,
            frameId: null,
            isRunning: false
        };

        this.root = document.createElement('div');
        this.root.className = 'dyno-game-over-screen';

        this.card = document.createElement('div');
        this.card.className = 'dyno-game-over-card';

        this.kicker = document.createElement('p');
        this.kicker.className = 'dyno-game-over-kicker';
        this.kicker.textContent = 'DYNO THE DYNO';

        this.previewContainer = document.createElement('div');
        this.previewContainer.className = 'dyno-game-over-preview';

        this.title = document.createElement('h1');
        this.title.className = 'dyno-game-over-title';
        this.title.textContent = t('game_over_title');

        this.actions = document.createElement('div');
        this.actions.className = 'dyno-game-over-actions';

        this.retryButton = document.createElement('button');
        this.retryButton.className = 'dyno-game-over-button';
        this.retryButton.type = 'button';
        this.retryButton.textContent = t('game_over_retry');

        this.reviveButton = document.createElement('button');
        this.reviveButton.className = 'dyno-game-over-button';
        this.reviveButton.type = 'button';
        this.reviveButton.textContent = t('game_over_revive');

        this.reviveAdIcon = document.createElement('img');
        this.reviveAdIcon.className = 'dyno-game-over-button-ad';
        this.reviveAdIcon.src = 'gfx/UI/ad.webp';
        this.reviveAdIcon.alt = 'Ad';
        this.reviveAdIcon.draggable = false;
        this.reviveButton.appendChild(this.reviveAdIcon);

        this.actions.append(this.retryButton, this.reviveButton);
        this.card.append(this.kicker, this.previewContainer, this.title, this.actions);
        this.root.appendChild(this.card);
        document.body.appendChild(this.root);

        this.retryButton.addEventListener('click', () => this.onRetry?.());
        this.reviveButton.addEventListener('click', () => this.onRevive?.());

        this._onLanguageChange = () => this._applyTranslations();
        window.addEventListener('languagechange', this._onLanguageChange);

        this.initPreview();
    }

    _applyTranslations() {
        this.title.textContent = t('game_over_title');
        this.retryButton.textContent = t('game_over_retry');
        // Preserve the ad icon child when updating revive button text.
        const adIcon = this.reviveAdIcon;
        this.reviveButton.textContent = t('game_over_revive');
        if (adIcon) this.reviveButton.appendChild(adIcon);
    }

    setRevivePending(isPending) {
        this.reviveButton.disabled = Boolean(isPending);
    }

    getNavigableElements() {
        return [this.retryButton, this.reviveButton].filter((element) => element && !element.disabled);
    }

    focusDialogElement(direction = 1) {
        const elements = this.getNavigableElements();
        if (!elements.length) {
            return;
        }
        const active = document.activeElement;
        let index = elements.indexOf(active);
        if (index < 0) {
            index = direction >= 0 ? 0 : elements.length - 1;
        } else {
            index = (index + direction + elements.length) % elements.length;
        }
        elements[index]?.focus?.();
    }

    focusInitialElement() {
        (this.getNavigableElements()[1] || this.getNavigableElements()[0])?.focus?.();
    }

    activateFocusedElement() {
        const active = document.activeElement;
        if (!active) {
            this.focusInitialElement();
            return;
        }
        active.click?.();
    }

    handleUiBack() {
        if (!this.visible) {
            return false;
        }
        this.activateFocusedElement();
        return true;
    }

    show() {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.root.classList.add('is-visible');
        this.startPreview();
        this.focusInitialElement();
    }

    hide() {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.root.classList.remove('is-visible');
        this.stopPreview();
    }

    initPreview() {
        try {
            const renderer = new THREE.WebGLRenderer({
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance'
            });
            renderer.setClearColor(0x000000, 0);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

            this.preview.renderer = renderer;
            this.previewContainer.appendChild(renderer.domElement);

            this.preview.scene = new THREE.Scene();
            this.preview.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
            this.preview.camera.position.set(0, 0, 28);
            this.preview.camera.lookAt(0, 0, 0);

            this.preview.root = new THREE.Group();
            this.preview.scene.add(this.preview.root);

            this.preview.resizeObserver = new ResizeObserver(() => this.resizePreview());
            this.preview.resizeObserver.observe(this.previewContainer);
            this.resizePreview();
            this.loadPreviewModel();
        } catch (error) {
            console.warn('[GameOverDialog] Dyno preview unavailable.', error);
            this.previewContainer.style.display = 'none';
        }
    }

    async loadPreviewModel() {
        try {
            const loader = createGLTFLoader();
            const textureLoader = new THREE.TextureLoader();
            const [gltf, texture] = await Promise.all([
                loader.loadAsync(DYNO_MODEL_SETTINGS.path),
                textureLoader.loadAsync(DYNO_MODEL_SETTINGS.texturePath).catch(() => null)
            ]);

            const dynoModel = gltf.scene;
            this.preparePreviewModel(dynoModel, texture);
            this.preview.root.add(dynoModel);
            this.fitPreviewToStage(dynoModel);
            this.applyDeadPose(dynoModel, gltf.animations);
            if (this.visible) {
                this.startPreview();
            }
        } catch (error) {
            console.warn('[GameOverDialog] Failed to load dyno preview.', error);
            this.previewContainer.style.display = 'none';
        }
    }

    preparePreviewModel(dynoModel, texture) {
        if (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
        }

        dynoModel.traverse((child) => {
            if (!child.isMesh) {
                return;
            }

            child.frustumCulled = false;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            const previewMaterials = materials.map((material) => new THREE.MeshBasicMaterial({
                    color: new THREE.Color(DYNO_MODEL_SETTINGS.monotoneColor || '#ffffff'),
                map: texture || material?.map || null,
                transparent: material?.transparent === true,
                opacity: material?.opacity ?? 1,
                alphaTest: material?.alphaTest ?? 0,
                side: material?.side ?? THREE.FrontSide,
                depthTest: true,
                depthWrite: true,
                toneMapped: false,
                fog: false
            }));
            child.material = Array.isArray(child.material) ? previewMaterials : previewMaterials[0];
        });

        dynoModel.rotation.set(
            DYNO_MODEL_SETTINGS.extraRotation.x,
            DYNO_MODEL_SETTINGS.facingYaw.right + DYNO_MODEL_SETTINGS.extraRotation.y,
            DYNO_MODEL_SETTINGS.extraRotation.z
        );
        dynoModel.scale.setScalar(1);
    }

    fitPreviewToStage(dynoModel) {
        const bounds = new THREE.Box3().setFromObject(dynoModel);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const scale = PREVIEW_MODEL_TARGET_SIZE / Math.max(size.x, size.y, 0.001);

        dynoModel.scale.setScalar(scale);
        dynoModel.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        dynoModel.position.y -= PREVIEW_MODEL_TARGET_SIZE * 0.12;
        this.preview.root.rotation.z = 0;
    }

    applyDeadPose(dynoModel, clips = []) {
        const deadClip = clips.find((clip) => String(clip?.name || '').toLowerCase() === 'dead') ||
            clips.find((clip) => String(clip?.name || '').toLowerCase().includes('dead'));
        if (!deadClip) {
            return;
        }

        this.preview.mixer = new THREE.AnimationMixer(dynoModel);
        const action = this.preview.mixer.clipAction(deadClip);
        action.enabled = true;
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        action.time = Math.max(deadClip.duration - 0.001, 0);
        this.preview.mixer.update(0);
    }

    resizePreview() {
        const renderer = this.preview.renderer;
        const camera = this.preview.camera;
        if (!renderer || !camera || !this.previewContainer) {
            return;
        }

        const rect = this.previewContainer.getBoundingClientRect();
        const width = Math.max(1, Math.floor(rect.width));
        const height = Math.max(1, Math.floor(rect.height));
        renderer.setSize(width, height, false);

        const aspect = width / height;
        const baseViewWidth = PREVIEW_CAMERA_BASE_VIEW_HEIGHT * aspect;
        const viewWidth = Math.max(baseViewWidth, PREVIEW_CAMERA_MIN_VIEW_WIDTH);
        const viewHeight = viewWidth / aspect;
        camera.left = -viewWidth / 2;
        camera.right = viewWidth / 2;
        camera.top = viewHeight / 2;
        camera.bottom = -viewHeight / 2;
        camera.updateProjectionMatrix();
    }

    startPreview() {
        if (this.preview.isRunning || !this.preview.renderer) {
            return;
        }

        this.preview.isRunning = true;
        const render = () => {
            if (!this.preview.isRunning) {
                return;
            }

            this.preview.renderer.render(this.preview.scene, this.preview.camera);
            this.preview.frameId = requestAnimationFrame(render);
        };
        render();
    }

    stopPreview() {
        this.preview.isRunning = false;
        if (this.preview.frameId != null) {
            cancelAnimationFrame(this.preview.frameId);
            this.preview.frameId = null;
        }
    }

    dispose() {
        this.stopPreview();
        this.preview.resizeObserver?.disconnect?.();
        this.preview.renderer?.dispose?.();
        window.removeEventListener('languagechange', this._onLanguageChange);
        this.root.remove();
    }
}
