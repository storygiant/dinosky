import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { DINO_MODEL_SETTINGS } from './Player.js';
import { t } from './i18n.js';
import { loadPlayerData } from './DinoSkinShop.js';
import { CONFIG } from './config.js';

const PREVIEW_ANIMATION_HOLD_SECONDS = 2.6;
const PREVIEW_ANIMATION_FADE_SECONDS = 0.28;
const PREVIEW_MODEL_TARGET_SIZE = 11;
const PREVIEW_CAMERA_BASE_VIEW_HEIGHT = 9.2;
const PREVIEW_CAMERA_MIN_VIEW_WIDTH = 14;

function injectLoadingScreenStyles() {
    if (document.getElementById('dino-loading-screen-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'dino-loading-screen-styles';
    style.textContent = `
        .dino-loading-screen {
            position: fixed;
            inset: 0;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 24px;
            background:
                radial-gradient(circle at top, rgba(255, 221, 132, 0.28), transparent 34%),
                linear-gradient(180deg, rgba(7, 43, 96, 0.92) 0%, rgba(16, 92, 168, 0.88) 42%, rgba(233, 129, 39, 0.4) 100%);
            backdrop-filter: blur(8px);
            transition: opacity 220ms ease, visibility 220ms ease;
        }

        .dino-loading-screen.is-hidden {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
        }

        .dino-loading-card {
            width: min(100%, 478px);
            height: calc(100vh - 48px);
            height: calc(100dvh - 48px);
            box-sizing: border-box;
            max-height: calc(100vh - 48px);
            max-height: calc(100dvh - 48px);
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 28px 28px 26px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 24px;
            color: #f7fbff;
            background:
                linear-gradient(180deg, rgba(6, 24, 52, 0.92) 0%, rgba(12, 44, 87, 0.94) 100%);
            box-shadow:
                0 24px 70px rgba(3, 12, 27, 0.45),
                inset 0 1px 0 rgba(255, 255, 255, 0.14);
            font-family: "Orbitron";
        }

        .dino-loading-kicker {
            margin: 0 0 12px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            text-align: center;
            color: rgba(215, 240, 255, 0.72);
        }

        .dino-loading-preview {
            position: relative;
            flex: 1 1 auto;
            min-height: 160px;
            height: auto;
            margin: 0 -8px 18px;
            overflow: hidden;
            border-radius: 18px;
            background:
                radial-gradient(circle at 66% 28%, rgba(255, 178, 58, 0.14), transparent 28%),
                radial-gradient(circle at 32% 70%, rgba(60, 151, 255, 0.16), transparent 34%),
                linear-gradient(180deg, rgba(6, 30, 64, 0.64) 0%, rgba(4, 18, 42, 0.18) 100%);
        }

        .dino-loading-preview::after {
            content: "";
            position: absolute;
            inset: auto 9% 10px;
            height: 20px;
            border-radius: 999px;
            background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.34), transparent 68%);
            filter: blur(6px);
            pointer-events: none;
        }

        .dino-loading-preview canvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
        }

        .dino-loading-preview-label {
            position: absolute;
            right: 14px;
            bottom: 14px;
            z-index: 1;
            max-width: calc(100% - 28px);
            padding: 5px 9px;
            border-radius: 999px;
            background: rgba(3, 14, 32, 0.48);
            color: rgba(221, 240, 255, 0.68);
            font-size: 10px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .dino-loading-preview.is-unavailable {
            display: none;
        }

        .dino-loading-title {
            margin: 0;
            font-size: clamp(28px, 5vw, 40px);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .dino-loading-status {
            margin: 14px 0 6px;
            min-height: 24px;
            font-size: 14px;
            line-height: 1.6;
            color: rgba(246, 251, 255, 0.9);
        }

        .dino-loading-detail {
            min-height: 20px;
            font-size: 12px;
            line-height: 1.5;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(198, 228, 255, 0.7);
        }

        .dino-loading-bar-track {
            position: relative;
            height: 18px;
            margin-top: 20px;
            overflow: hidden;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.1);
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
        }

        .dino-loading-bar-fill {
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background:
                linear-gradient(90deg, #ff9a2a 0%, #ffd256 44%, #fff1b2 100%);
            box-shadow:
                0 0 26px rgba(255, 170, 64, 0.38),
                inset 0 0 10px rgba(255, 255, 255, 0.28);
            transition: width 180ms ease;
        }

        .dino-loading-meta {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            margin-top: 10px;
            font-size: 12px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: rgba(221, 240, 255, 0.8);
        }

        .dino-loading-button {
            display: none;
            width: 100%;
            margin-top: 24px;
            padding: 14px 18px;
            border: none;
            border-radius: 16px;
            cursor: pointer;
            font: inherit;
            font-size: 16px;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #14253a;
            background:
                linear-gradient(180deg, #fff4b8 0%, #ffb949 100%);
            box-shadow:
                0 12px 30px rgba(255, 160, 55, 0.35),
                inset 0 1px 0 rgba(255, 255, 255, 0.7);
            transition: transform 140ms ease, box-shadow 140ms ease, filter 140ms ease;
        }

        .dino-loading-button:hover,
        .dino-loading-button:focus-visible {
            transform: translateY(-1px);
            box-shadow:
                0 16px 34px rgba(255, 160, 55, 0.42),
                inset 0 1px 0 rgba(255, 255, 255, 0.76);
            filter: brightness(1.03);
            outline: none;
        }

        .dino-loading-button:active {
            transform: translateY(1px);
        }

        .dino-loading-button.is-visible {
            display: block;
        }

        @media (max-height: 620px) {
            .dino-loading-preview {
                min-height: 120px;
                margin-bottom: 12px;
            }

            .dino-loading-card {
                padding: 20px;
            }
        }

        @media (max-height: 520px) and (orientation: landscape) {
            .dino-loading-screen {
                align-items: flex-start;
                padding: 10px 12px;
                padding:
                    max(10px, env(safe-area-inset-top))
                    max(12px, env(safe-area-inset-right))
                    max(10px, env(safe-area-inset-bottom))
                    max(12px, env(safe-area-inset-left));
                overflow-y: auto;
            }

            .dino-loading-card {
                display: grid;
                grid-template-columns: minmax(150px, 38%) minmax(0, 1fr);
                grid-template-areas:
                    "preview title"
                    "preview status"
                    "preview detail"
                    "bar bar"
                    "meta meta"
                    "button button";
                column-gap: 18px;
                align-items: center;
                width: min(100%, 600px);
                height: calc(100vh - 20px);
                height: calc(100dvh - 20px);
                max-height: calc(100vh - 20px);
                max-height: calc(100dvh - 20px);
                padding: 12px 16px;
                border-radius: 16px;
            }

            .dino-loading-kicker {
                display: none;
            }

            .dino-loading-preview {
                grid-area: preview;
                height: 100%;
                min-height: 0;
                margin: 0;
                border-radius: 12px;
            }

            .dino-loading-title {
                grid-area: title;
                font-size: clamp(22px, 8vh, 32px);
            }

            .dino-loading-status {
                grid-area: status;
                min-height: 0;
                margin: 4px 0 2px;
                font-size: 13px;
                line-height: 1.35;
            }

            .dino-loading-detail {
                grid-area: detail;
                min-height: 0;
                font-size: 10px;
                line-height: 1.35;
            }

            .dino-loading-bar-track {
                grid-area: bar;
                height: 14px;
                margin-top: 10px;
            }

            .dino-loading-meta {
                grid-area: meta;
                margin-top: 6px;
                font-size: 10px;
            }
                
            .dino-loading-button {
                grid-area: button;
                margin-top: 10px;
                padding: 11px 16px;
                border-radius: 8px;
                font-size: 14px;
            }
        }
    `;

    document.head.appendChild(style);
}

export class LoadingScreen {
    constructor() {
        injectLoadingScreenStyles();
        this.visible = true;
        this.readyForGo = false;

        this.preview = {
            container: null,
            label: null,
            renderer: null,
            scene: null,
            camera: null,
            root: null,
            mixer: null,
            timer: new THREE.Timer(),
            clips: [],
            actions: [],
            currentAction: null,
            currentIndex: -1,
            elapsed: 0,
            resizeObserver: null,
            frameId: null,
            isRunning: false,
            mode: 'cycle'
        };

        this.root = document.createElement('div');
        this.root.className = 'dino-loading-screen';

        this.card = document.createElement('div');
        this.card.className = 'dino-loading-card';

        this.kicker = document.createElement('p');
        this.kicker.className = 'dino-loading-kicker';
        this.kicker.textContent = 'DINO THE DINO';

        this.preview.container = document.createElement('div');
        this.preview.container.className = 'dino-loading-preview';

        this.preview.label = document.createElement('div');
        this.preview.label.className = 'dino-loading-preview-label';
        this.preview.label.textContent = t('loading_preview_label');
        this.preview.container.appendChild(this.preview.label);

        this.title = document.createElement('h1');
        this.title.className = 'dino-loading-title';
        this.title.textContent = t('loading_title');

        this.status = document.createElement('p');
        this.status.className = 'dino-loading-status';
        this.status.textContent = t('loading_status');

        this.detail = document.createElement('div');
        this.detail.className = 'dino-loading-detail';
        this.detail.textContent = t('loading_detail');

        this.progressTrack = document.createElement('div');
        this.progressTrack.className = 'dino-loading-bar-track';

        this.progressFill = document.createElement('div');
        this.progressFill.className = 'dino-loading-bar-fill';
        this.progressTrack.appendChild(this.progressFill);

        this.meta = document.createElement('div');
        this.meta.className = 'dino-loading-meta';

        this.percentLabel = document.createElement('span');
        this.percentLabel.textContent = '0%';

        this.phaseLabel = document.createElement('span');
        this.phaseLabel.textContent = t('loading_phase');

        this.meta.append(this.percentLabel, this.phaseLabel);

        this.goButton = document.createElement('button');
        this.goButton.className = 'dino-loading-button';
        this.goButton.type = 'button';
        this.goButton.textContent = t('loading_go');

        this.card.append(
            this.kicker,
            this.preview.container,
            this.title,
            this.status,
            this.detail,
            this.progressTrack,
            this.meta,
            this.goButton            
        );
        this.root.appendChild(this.card);
        document.body.appendChild(this.root);

        this.initDinoPreview();
    }

    setProgress(progress) {
        const clamped = Math.max(0, Math.min(progress, 1));
        const percent = Math.round(clamped * 100);
        this.progressFill.style.width = `${percent}%`;
        this.percentLabel.textContent = `${percent}%`;
    }

    setStatus(text) {
        this.status.textContent = text;
    }

    setDetail(text) {
        const hasDetail = typeof text === 'string' && text.trim().length > 0;
        this.detail.textContent = hasDetail ? text : '';
        this.detail.style.display = hasDetail ? '' : 'none';
    }

    setPhase(text) {
        this.phaseLabel.textContent = text;
    }

    show({ title = null, status = '', detail = '', phase = null, progress = 0, showButton = false, previewMode = 'cycle' } = {}) {
        title = title ?? t('loading_title');
        phase = phase ?? t('loading_phase');        this.visible = true;
        this.readyForGo = showButton === true;
        this.title.textContent = title;
        this.setStatus(status);
        this.setDetail(detail);
        this.setPhase(phase);
        this.setProgress(progress);
        this.setPreviewMode(previewMode);
        this.goButton.classList.toggle('is-visible', showButton === true);        
        this.root.classList.remove('is-hidden');
    }

    showReady() {
        this.visible = true;
        this.readyForGo = true;
        this.title.textContent = t('loading_title');
        this.setStatus(this.status.textContent || '');
        this.setDetail(t('loading_ready_detail'));
        this.setPhase(t('loading_ready_phase'));
        this.setProgress(1);
        this.setPreviewMode('cycle');
        this.goButton.classList.add('is-visible');        
    }

    waitForGo() {
        return new Promise((resolve) => {
            const start = () => {
                this.goButton.removeEventListener('click', start);
                resolve();
            };

            this.goButton.addEventListener('click', start, { once: true });
            this.goButton.focus();
        });
    }

    focusDialogElement() {
        if (this.readyForGo) {
            this.goButton.focus();
        }
    }

    activateFocusedElement() {
        if (!this.readyForGo) {
            return;
        }
        this.goButton.click();
    }

    handleUiBack() {
        if (!this.readyForGo) {
            return false;
        }
        this.goButton.click();
        return true;
    }

    showError(message) {
        this.visible = true;
        this.readyForGo = false;
        this.title.textContent = t('loading_title');
        this.setStatus(t('loading_failed_status'));
        this.setDetail(message);
        this.setPhase(t('loading_error_phase'));
        this.setPreviewMode('cycle');
        this.goButton.classList.remove('is-visible');        
    }

    setPreviewMode(mode = 'cycle') {
        this.preview.mode = mode === 'run' ? 'run' : 'cycle';
        this.applyPreviewMode();
    }

    hide() {
        this.visible = false;
        this.readyForGo = false;
        this.goButton.classList.remove('is-visible');        
        this.root.classList.add('is-hidden');
        this.stopDinoPreview();
    }

    initDinoPreview() {
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
            this.preview.container.insertBefore(renderer.domElement, this.preview.label);

            this.preview.scene = new THREE.Scene();
            this.preview.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
            this.preview.camera.position.set(0, 0, 28);
            this.preview.camera.lookAt(0, 0, 0);

            this.preview.root = new THREE.Group();
            this.preview.scene.add(this.preview.root);

            this.preview.resizeObserver = new ResizeObserver(() => this.resizeDinoPreview());
            this.preview.resizeObserver.observe(this.preview.container);
            this.resizeDinoPreview();

            this.loadDinoPreview();
            this.startDinoPreview();
        } catch (error) {
            console.warn('[LoadingScreen] Dino preview unavailable.', error);
            this.preview.container.classList.add('is-unavailable');
        }
    }

    async loadDinoPreview() {
        try {
            const loader = createGLTFLoader();
            const textureLoader = new THREE.TextureLoader();

            // Resolve equipped skin texture from stored player data.
            const playerData = loadPlayerData();
            const equippedId = playerData?.equippedDinoSkinId;
            const equippedSkin = (CONFIG.dinoSkins ?? []).find((s) => s.id === equippedId);
            const texturePath = equippedSkin?.texture ?? DINO_MODEL_SETTINGS.texturePath;

            const [gltf, texture] = await Promise.all([
                loader.loadAsync(DINO_MODEL_SETTINGS.path),
                textureLoader.loadAsync(texturePath).catch((error) => {
                    console.warn('[LoadingScreen] Dino preview texture failed; using embedded material.', error);
                    return null;
                })
            ]);

            if (!this.preview.isRunning) {
                return;
            }

            const dinoModel = gltf.scene;
            this.prepareDinoPreviewModel(dinoModel, texture);
            this.preview.root.add(dinoModel);
            this.fitDinoPreviewToStage(dinoModel);
            this.setupDinoPreviewAnimations(gltf.animations);
        } catch (error) {
            console.warn('[LoadingScreen] Failed to load dino preview.', error);
            this.preview.container.classList.add('is-unavailable');
        }
    }

    prepareDinoPreviewModel(dinoModel, texture) {
        if (texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.flipY = false;
        }

        dinoModel.traverse((child) => {
            if (!child.isMesh) {
                return;
            }

            child.frustumCulled = false;
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            const previewMaterials = materials.map((material) => {
                const previewMaterial = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(DINO_MODEL_SETTINGS.monotoneColor || '#ffffff'),
                    map: texture || material?.map || null,
                    transparent: material?.transparent === true,
                    opacity: material?.opacity ?? 1,
                    alphaTest: material?.alphaTest ?? 0,
                    side: material?.side ?? THREE.FrontSide,
                    depthTest: true,
                    depthWrite: true,
                    toneMapped: false,
                    fog: false
                });
                return previewMaterial;
            });

            child.material = Array.isArray(child.material) ? previewMaterials : previewMaterials[0];
        });

        dinoModel.rotation.set(
            DINO_MODEL_SETTINGS.extraRotation.x,
            DINO_MODEL_SETTINGS.facingYaw.right + DINO_MODEL_SETTINGS.extraRotation.y,
            DINO_MODEL_SETTINGS.extraRotation.z
        );
        dinoModel.scale.setScalar(1);
    }

    fitDinoPreviewToStage(dinoModel) {
        const bounds = new THREE.Box3().setFromObject(dinoModel);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const maxDimension = Math.max(size.x, size.y, 0.001);
        const targetSize = PREVIEW_MODEL_TARGET_SIZE;
        const scale = targetSize / maxDimension;

        dinoModel.scale.setScalar(scale);
        dinoModel.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        dinoModel.position.y -= targetSize * 0.03;
        this.preview.root.rotation.z = -0.03;
    }

    setupDinoPreviewAnimations(clips = []) {
        const usableClips = clips.filter((clip) => (
            clip &&
            clip.duration > 0 &&
            !this.isDinoPreviewHitClip(clip.name) &&
            !this.isDinoPreviewDeathClip(clip.name)
        ));
        this.preview.clips = usableClips;

        if (!usableClips.length || !this.preview.root.children[0]) {
            this.preview.label.textContent = t('loading_preview_ready');
            return;
        }

        this.preview.mixer = new THREE.AnimationMixer(this.preview.root.children[0]);
        this.preview.actions = usableClips.map((clip) => {
            const action = this.preview.mixer.clipAction(clip);
            action.enabled = true;
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(0);
            return action;
        });

        this.applyPreviewMode();
    }

    isDinoPreviewHitClip(name = '') {
        // Hit clips are reactive gameplay feedback, so keep the loading preview focused on
        // normal idle/movement/flying animation poses.
        return /(^|[-_])hit($|[-_])/i.test(String(name || ''));
    }

    isDinoPreviewDeathClip(name = '') {
        // Death/fall clips look abrupt in a loading loop, so keep them out of the preview.
        return /(^|[-_])(dead|death|die|dying)($|[-_])/i.test(String(name || ''));
    }

    normalizeClipName(name = '') {
        return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    findDinoPreviewRunClipIndex() {
        if (!this.preview.clips.length) {
            return -1;
        }

        const preferredNames = [
            ...(DINO_MODEL_SETTINGS?.clipHints?.run || []),
            'run'
        ].map((name) => this.normalizeClipName(name));

        for (let i = 0; i < this.preview.clips.length; i += 1) {
            const clipName = this.normalizeClipName(this.preview.clips[i]?.name);
            if (preferredNames.includes(clipName)) {
                return i;
            }
        }

        for (let i = 0; i < this.preview.clips.length; i += 1) {
            const clipName = this.normalizeClipName(this.preview.clips[i]?.name);
            if (clipName.includes('run')) {
                return i;
            }
        }

        return 0;
    }

    applyPreviewMode() {
        if (!this.preview.actions.length) {
            return;
        }

        const targetIndex = this.preview.mode === 'run'
            ? this.findDinoPreviewRunClipIndex()
            : 0;
        this.playDinoPreviewAnimation(Math.max(0, targetIndex), 0);
    }

    playDinoPreviewAnimation(index, fadeDuration = PREVIEW_ANIMATION_FADE_SECONDS) {
        if (!this.preview.actions.length) {
            return;
        }

        const nextIndex = ((index % this.preview.actions.length) + this.preview.actions.length) % this.preview.actions.length;
        const nextAction = this.preview.actions[nextIndex];
        const previousAction = this.preview.currentAction;

        nextAction.reset();
        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);
        nextAction.play();

        if (previousAction && previousAction !== nextAction) {
            previousAction.crossFadeTo(nextAction, fadeDuration, true);
        }

        this.preview.currentAction = nextAction;
        this.preview.currentIndex = nextIndex;
        this.preview.elapsed = 0;
        this.preview.label.textContent = this.formatDinoPreviewClipName(this.preview.clips[nextIndex]?.name);
    }

    formatDinoPreviewClipName(name = '') {
        return String(name || 'Dino animation')
            .replace(/[-_]+loop$/i, '')
            .replace(/[-_]+/g, ' ')
            .trim() || 'Dino animation';
    }

    resizeDinoPreview() {
        if (!this.preview.renderer || !this.preview.camera || !this.preview.container) {
            return;
        }

        const width = Math.max(this.preview.container.clientWidth, 1);
        const height = Math.max(this.preview.container.clientHeight, 1);
        const aspect = width / height;
        const baseViewWidth = PREVIEW_CAMERA_BASE_VIEW_HEIGHT * aspect;
        const viewWidth = Math.max(baseViewWidth, PREVIEW_CAMERA_MIN_VIEW_WIDTH);
        const viewHeight = viewWidth / aspect;

        this.preview.camera.left = -viewWidth * 0.5;
        this.preview.camera.right = viewWidth * 0.5;
        this.preview.camera.top = viewHeight * 0.5;
        this.preview.camera.bottom = -viewHeight * 0.5;
        this.preview.camera.updateProjectionMatrix();
        this.preview.renderer.setSize(width, height, false);
    }

    startDinoPreview() {
        if (this.preview.isRunning) {
            return;
        }

        this.preview.isRunning = true;
        this.preview.timer.reset();

        const tick = () => {
            if (!this.preview.isRunning) {
                return;
            }

            this.preview.timer.update();
            const delta = Math.min(this.preview.timer.getDelta(), 0.05);
            if (this.preview.mixer) {
                this.preview.mixer.update(delta);
                this.preview.elapsed += delta;

                if (
                    this.preview.mode === 'cycle' &&
                    this.preview.elapsed >= PREVIEW_ANIMATION_HOLD_SECONDS &&
                    this.preview.actions.length > 1
                ) {
                    this.playDinoPreviewAnimation(this.preview.currentIndex + 1);
                }
            }

            if (this.preview.root) {
                this.preview.root.position.y = Math.sin(performance.now() * 0.0018) * 0.06;
            }

            this.preview.renderer?.render(this.preview.scene, this.preview.camera);
            this.preview.frameId = requestAnimationFrame(tick);
        };

        this.preview.frameId = requestAnimationFrame(tick);
    }

    stopDinoPreview() {
        this.preview.isRunning = false;
        if (this.preview.frameId != null) {
            cancelAnimationFrame(this.preview.frameId);
            this.preview.frameId = null;
        }
        this.preview.resizeObserver?.disconnect();
        this.preview.resizeObserver = null;
        this.preview.mixer?.stopAllAction();
        this.preview.renderer?.dispose();
    }
}
