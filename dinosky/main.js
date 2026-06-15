import * as THREE from 'three';
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { Player, PLAYER_PRELOAD_ASSET_URLS } from './Player.js';
import { Joystick } from './Joystick.js';
import { TiledLevelLoader } from './TiledLevelLoader.js';
import { LevelRenderer } from './LevelRenderer.js';
import { ParallaxBackground } from './ParallaxBackground.js';
import { SkyBackground } from './SkyBackground.js';
import { LoadingScreen } from './LoadingScreen.js';
import { GameOverDialog } from './GameOverDialog.js';
import { LevelObjectManager } from './LevelObjectManager.js';
import { BurnableSceneryManager } from './BurnableSceneryManager.js';
import { TopBarUI, TOP_BAR_PRELOAD_ASSET_URLS } from './TopBarUI.js';
import { SideSpeedBoostButton } from './SideSpeedBoostButton.js';
import { AudioManager } from './AudioManager.js';
import { SettingsDialog } from './SettingsDialog.js';
import { DynoSkinShop, loadPlayerData, savePlayerData } from './DynoSkinShop.js';
import { MISSIONS, MISSION_LEVELS } from './MissionData.js';
import { MissionManager } from './MissionManager.js';
import { ActiveMissionUI } from './ActiveMissionUI.js';
import { CinematicOverlay } from './CinematicOverlay.js';
import { InfernoShockwave } from './InfernoShockwave.js';
import { FuryBar } from './FuryBar.js';
import { syncStorageKeysFromCloud, loadLocalJson } from './PlatformBridge.js';
import { hydratePlayerIdentityFromPlatform } from './PlayerIdentity.js';
import { ZoneDialogTriggerManager } from './ZoneDialogTriggerManager.js';
import { ZoneLayerVisibilityController } from './ZoneLayerVisibilityController.js';
import { PokiGameplayGate, PokiStopReasons } from './PokiGameplayGate.js';

const SOUND_EFFECTS = {
    chopper: 'sfx/chopper.ogg',
    plane: 'sfx/plane.ogg',
    dynoHit: 'sfx/dyno_hit.ogg',
    dynoLiftoff: 'sfx/dyno_liftoff.ogg',
    explosion: 'sfx/explosion.ogg',
    explosion2: 'sfx/explosion2.ogg',
    explosionCar: 'sfx/explosion_car.ogg',
    fire: 'sfx/fire.ogg',
    fireHit: 'sfx/fire_hit.ogg',
    fireHitlight: 'sfx/fire_hit_light.ogg',
    gallop: 'sfx/gallop.ogg',
    gasp: 'sfx/gasp.ogg',
    giggle: 'sfx/giggle.ogg',
    giggle2: 'sfx/giggle2.ogg',
    grab: 'sfx/grab.ogg',
    growl: 'sfx/growl.ogg',
    growl2: 'sfx/growl2.ogg',
    hmm: 'sfx/hmm.ogg',
    roar: 'sfx/roar.ogg',
    roar2: 'sfx/roar2.ogg',
    scream: 'sfx/scream.ogg',
    step: 'sfx/step.ogg',
    tankFire: 'sfx/tank_fire.ogg',
    uh: 'sfx/uh.ogg',
    wingflap: 'sfx/wingflap.ogg',
    ring: 'sfx/ring.ogg',
    woohoo: 'sfx/woohoo.ogg',
    yay: 'sfx/yay.ogg',
    pickupHealth: 'sfx/health.ogg',
    pickupCoin: 'sfx/coin.ogg',
    pickupEnergy: 'sfx/energy.ogg',
    watersplash: 'sfx/watersplash.ogg',
    triumph: 'sfx/triumph.ogg'
};

const AMBIENCE_SOUNDS = {
    ambience: 'sfx/ambience.ogg',
    ambience_underwater: 'sfx/ambience_underwater.ogg'
};

const MUSIC_SOUNDS = {
    music1: 'sfx/music1.ogg'
};

function collectConfiguredObjectKillSounds() {
    const sounds = {};
    for (const [type, objectConfig] of Object.entries(CONFIG.LEVEL_OBJECT_TYPES || {})) {
        const killSounds = Array.isArray(objectConfig.killSounds)
            ? objectConfig.killSounds
            : (typeof objectConfig.killSound === 'string' ? [objectConfig.killSound] : []);
        killSounds.forEach((soundUrl, index) => {
            if (typeof soundUrl === 'string' && soundUrl.trim()) {
                sounds[`objectKill:${type}:${index}`] = soundUrl;
            }
        });
    }
    return sounds;
}

function collectConfiguredObjectGroundImpactSounds() {
    const sounds = {};
    for (const [type, objectConfig] of Object.entries(CONFIG.LEVEL_OBJECT_TYPES || {})) {
        if (typeof objectConfig.groundImpactSound === 'string' && objectConfig.groundImpactSound.trim()) {
            sounds[`objectGroundImpact:${type}`] = objectConfig.groundImpactSound;
        }
    }
    return sounds;
}

function collectConfiguredObjectHitSounds() {
    const sounds = {};
    for (const [type, objectConfig] of Object.entries(CONFIG.LEVEL_OBJECT_TYPES || {})) {
        if (typeof objectConfig.objectHitSound === 'string' && objectConfig.objectHitSound.trim()) {
            sounds[`objectHit:${type}`] = objectConfig.objectHitSound;
        }
    }
    return sounds;
}

function collectConfiguredObjectPickupStartSounds() {
    const sounds = {};
    for (const [type, objectConfig] of Object.entries(CONFIG.LEVEL_OBJECT_TYPES || {})) {
        const pickupSounds = Array.isArray(objectConfig.pickupSounds)
            ? objectConfig.pickupSounds
            : [];
        pickupSounds.forEach((soundUrl, index) => {
            if (typeof soundUrl === 'string' && soundUrl.trim()) {
                sounds[`objectPickup:${type}:${index}`] = soundUrl;
            }
        });
    }
    return sounds;
}

const PARALLAX_LAYER_CONFIG = [
    {
        texture: 'gfx/levels/layer2.webp',
        factorX: -0.75,
        factorY: -0.8,
        yOffset: 26,
        z: -200,
        height: 58,
        repeatX: true
    },
    {
        texture: 'gfx/levels/layer1.webp',
        factorX: -0.55,
        factorY: -0.6,
        yOffset: 30,
        z: -150,
        height: 85,
        repeatX: true
    }
];

const shouldCreateParallaxBackground = () => CONFIG.disableParalax !== true;

function isQualitySystemEnabled() {
    return CONFIG.PERFORMANCE?.enabled !== false;
}

function normalizeQualityMode(mode) {
    if (!isQualitySystemEnabled()) {
        return 'high';
    }
    return mode === 'low' || mode === 'high' || mode === 'auto' ? mode : 'auto';
}

function loadSavedQualityMode() {
    if (!isQualitySystemEnabled()) {
        return 'high';
    }
    const parsed = loadLocalJson('dynoSettings', null);
    return normalizeQualityMode(parsed?.qualityMode);
}

function getSlowDeviceHardwareHintFromNavigator(detectionConfig = CONFIG.PERFORMANCE?.slowDeviceDetection) {
    if (detectionConfig?.enabled !== true) {
        return false;
    }

    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const hardwareConcurrency = Number.isFinite(nav?.hardwareConcurrency) ? nav.hardwareConcurrency : null;
    const deviceMemory = Number.isFinite(nav?.deviceMemory) ? nav.deviceMemory : null;
    const lowCores = hardwareConcurrency != null && hardwareConcurrency <= (detectionConfig.lowHardwareConcurrency ?? 4);
    const lowMemory = deviceMemory != null && deviceMemory <= (detectionConfig.lowDeviceMemoryGB ?? 4);
    return lowCores || lowMemory;
}

function getPerformanceQualityProfile(mode = 'auto', slowDeviceDetected = false) {
    if (!isQualitySystemEnabled()) {
        mode = 'high';
        slowDeviceDetected = false;
    }
    const normalizedMode = normalizeQualityMode(mode);
    const profileKey = normalizedMode === 'auto'
        ? (slowDeviceDetected ? 'low' : 'high')
        : normalizedMode;
    const configuredProfile = CONFIG.PERFORMANCE?.qualityProfiles?.[profileKey] || {};

    return {
        key: profileKey,
        renderer: {
            maxPixelRatio: configuredProfile.renderer?.maxPixelRatio,
            antialias: configuredProfile.renderer?.antialias
        },
        burnableScenery: {
            particleRateMultiplier: configuredProfile.burnableScenery?.particleRateMultiplier ?? 1,
            smokeRateMultiplier: configuredProfile.burnableScenery?.smokeRateMultiplier ?? 1,
            maxActiveParticlesScale: configuredProfile.burnableScenery?.maxActiveParticlesScale ?? 1,
            glowEnabled: configuredProfile.burnableScenery?.glowEnabled !== false
        },
        background: {
            parallaxEnabled: configuredProfile.background?.parallaxEnabled !== false
        }
    };
}

const LOAD_PROGRESS_AFTER_LEVEL_DATA = 0.18;
// Asset downloads fill from LOAD_PROGRESS_AFTER_LEVEL_DATA up to this value.
// The remaining slice covers post-download work: physics body creation, polygon
// decomposition, object placement — so the bar never hits 100% before it's truly done.
const LOAD_PROGRESS_BEFORE_READY = 0.9;
const MAX_FRAME_DT = 0.1;
const CAMERA_Y_SAFE_MARGIN_RATIO = 0.22;
const POKI_LOADING_FINISHED_STORAGE_KEY = 'dyno:pokiGameLoadingFinished';

function easeInOutPower(value, power = 2) {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    const p = Math.max(1, power);
    if (p === 1) {
        return t;
    }

    if (t < 0.5) {
        return 0.5 * Math.pow(t * 2, p);
    }

    return 1 - (0.5 * Math.pow((1 - t) * 2, p));
}

function getDynamicCameraSettings() {
    const settings = CONFIG.CAMERA_DYNAMIC || {};
    const rawMinZoom = Number.isFinite(settings.minZoom) ? settings.minZoom : 1.0;
    const rawMaxZoom = Number.isFinite(settings.maxZoom) ? settings.maxZoom : 1.2;
    return {
        minZoom: Math.min(rawMinZoom, rawMaxZoom),
        maxZoom: Math.max(rawMinZoom, rawMaxZoom),
        maxSpeedForCamera: Math.max(0.001, Number.isFinite(settings.maxSpeedForCamera) ? settings.maxSpeedForCamera : 20),
        maxLookAheadX: Math.max(0, Number.isFinite(settings.maxLookAheadX) ? settings.maxLookAheadX : 8),
        maxLookAheadY: Math.max(0, Number.isFinite(settings.maxLookAheadY) ? settings.maxLookAheadY : 5),
        responseEasingPower: Math.max(1, Number.isFinite(settings.responseEasingPower) ? settings.responseEasingPower : 2),
        lookAheadMaxSpeedX: Math.max(0.001, Number.isFinite(settings.lookAheadMaxSpeedX) ? settings.lookAheadMaxSpeedX : 30),
        lookAheadMaxSpeedY: Math.max(0.001, Number.isFinite(settings.lookAheadMaxSpeedY) ? settings.lookAheadMaxSpeedY : 20),
        directionMaxSpeed: Math.max(0.001, Number.isFinite(settings.directionMaxSpeed) ? settings.directionMaxSpeed : 4),
        followLerp: THREE.MathUtils.clamp(Number.isFinite(settings.followLerp) ? settings.followLerp : 0.15, 0.001, 1),
    };
}

function getCameraAspectSettings() {
    const settings = CONFIG.CAMERA_ASPECT || {};
    const minAspect = Number.isFinite(settings.minAspect) ? settings.minAspect : 0.5;
    const maxAspect = Number.isFinite(settings.maxAspect) ? settings.maxAspect : 2.0;
    const minAspectScale = Number.isFinite(settings.minAspectScale) ? settings.minAspectScale : 0.5;
    const maxAspectScale = Number.isFinite(settings.maxAspectScale) ? settings.maxAspectScale : 1.0;

    return {
        minAspect: Math.max(0.01, Math.min(minAspect, maxAspect)),
        maxAspect: Math.max(minAspect, maxAspect),
        minAspectScale: Math.max(0.01, minAspectScale),
        maxAspectScale: Math.max(0.01, maxAspectScale)
    };
}

function resolveAssetUrl(url) {
    const baseUrl = typeof document !== 'undefined' && document.baseURI
        ? document.baseURI
        : window.location.href;
    return new URL(url, baseUrl).href;
}

function formatAssetName(url) {
    try {
        const baseUrl = typeof document !== 'undefined' && document.baseURI
            ? document.baseURI
            : window.location.href;
        const parsedUrl = new URL(url, baseUrl);
        const segments = parsedUrl.pathname.split('/');
        return segments[segments.length - 1] || parsedUrl.pathname;
    } catch {
        return url;
    }
}

function formatLevelLabel(levelValue) {
    if (levelValue == null || levelValue === '') {
        return 'Level';
    }

    return String(levelValue);
}

function collectLevelTextureUrls(level) {
    const urls = new Set();

    for (const cell of level.cells || []) {
        if (cell?.renderInfo?.imageUrl) {
            urls.add(resolveAssetUrl(cell.renderInfo.imageUrl));
        }
    }

    for (const layer of level.renderLayers || []) {
        for (const tile of layer.tiles || []) {
            if (tile?.renderInfo?.imageUrl) {
                urls.add(resolveAssetUrl(tile.renderInfo.imageUrl));
            }
        }
    }

    for (const layer of level.objectLayers || []) {
        if (layer?.spawnOnly) {
            continue;
        }

        for (const object of layer.objects || []) {
            if (object?.renderInfo?.imageUrl) {
                urls.add(resolveAssetUrl(object.renderInfo.imageUrl));
            }
        }
    }

    return urls;
}

function createAssetLoadingSession(loadingScreen, trackedUrls, { statusText = 'Level' } = {}) {
    const loadingManager = new THREE.LoadingManager();
    const expectedUrls = new Set([...trackedUrls].map((url) => resolveAssetUrl(url)));
    const loadedUrls = new Set();
    let resolveDone;

    const done = new Promise((resolve) => {
        resolveDone = resolve;
    });

    const updateProgress = (lastUrl = null, failed = false) => {
        const completedCount = loadedUrls.size;
        // Reserve the top 10% of the bar for post-asset work (physics setup, polygon decomp).
        // This prevents the bar from hitting 100% before everything is truly ready.
        const assetRatio = expectedUrls.size > 0 ? completedCount / expectedUrls.size : 1;
        const progress = LOAD_PROGRESS_AFTER_LEVEL_DATA +
            ((LOAD_PROGRESS_BEFORE_READY - LOAD_PROGRESS_AFTER_LEVEL_DATA) * assetRatio);

        loadingScreen.setProgress(progress);
        loadingScreen.setPhase(t('loading_phase'));
        loadingScreen.setStatus(failed ? `Error loading ${formatAssetName(lastUrl)}` : statusText);
        loadingScreen.setDetail('');
    };

    const markAssetComplete = (url, failed = false) => {
        const normalizedUrl = resolveAssetUrl(url);
        if (!expectedUrls.has(normalizedUrl)) {
            return;
        }

        loadedUrls.add(normalizedUrl);
        updateProgress(normalizedUrl, failed);
    };

    loadingManager.onProgress = (url) => {
        markAssetComplete(url, false);
    };

    loadingManager.onError = (url) => {
        markAssetComplete(url, true);
    };

    loadingManager.onLoad = () => {
        // Assets are downloaded but post-load work (physics bodies, polygon decomposition)
        // still runs after this. Resolve the promise so callers can await it, but do NOT
        // set progress to 100% or phase to Ready here — the caller does that after all work
        // is complete so the bar never regresses.
        resolveDone();
    };

    updateProgress();

    return {
        loadingManager,
        done
    };
}

function createMainRendererWithFallback({ antialias = false } = {}) {
    const attempts = [
        { antialias, powerPreference: 'high-performance' },
        { antialias: false, powerPreference: 'default' },
        { antialias: false, powerPreference: 'low-power' }
    ];
    let lastError = null;
    for (const options of attempts) {
        try {
            return new THREE.WebGLRenderer(options);
        } catch (error) {
            lastError = error;
            console.warn('[Game] WebGL renderer creation attempt failed.', options, error);
        }
    }
    throw lastError || new Error('Failed to create WebGL renderer.');
}

class Game {
    constructor() {
        const initialQualityMode = loadSavedQualityMode();
        const detectionConfig = CONFIG.PERFORMANCE?.slowDeviceDetection;
        const initialSlowDeviceHint = isQualitySystemEnabled()
            && detectionConfig?.enabled === true
            && detectionConfig.useHardwareHintAsInitialSlow === true
            ? getSlowDeviceHardwareHintFromNavigator(detectionConfig)
            : false;
        const initialQualityProfile = getPerformanceQualityProfile(initialQualityMode, initialSlowDeviceHint);
        const initialRendererMaxPixelRatio = Number.isFinite(initialQualityProfile.renderer?.maxPixelRatio)
            ? Math.max(0.5, initialQualityProfile.renderer.maxPixelRatio)
            : Math.max(0.5, CONFIG.maxPixelRatio ?? 2);
        const initialRendererAntialias = !isQualitySystemEnabled()
            ? true
            : (typeof initialQualityProfile.renderer?.antialias === 'boolean'
                ? initialQualityProfile.renderer.antialias
                : false);

        this.scene = new THREE.Scene();
        this.scene.background = null;
        this.viewHeight = CONFIG.VIEW_HEIGHT;
        this.sceneViewport = {
            x: 0,
            y: 0,
            width: window.innerWidth,
            height: window.innerHeight
        };
        this.tempClearColor = new THREE.Color();
        this.levelBelowClearColor = new THREE.Color(CONFIG.COLORS.LEVEL_BELOW ?? '#2c2c2c');
        this.cameraExtents = {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0
        };
        this.dynamicCameraState = {
            zoom: 1,
            smoothedDirection: new THREE.Vector2(),
            lookAhead: new THREE.Vector2()
        };
        
        // Orthographic camera with a fixed visible world height.
        const aspect = window.innerWidth / window.innerHeight;
        const viewWidth = this.viewHeight * aspect;
        
        this.camera = new THREE.OrthographicCamera(
            -viewWidth / 2, viewWidth / 2,
            this.viewHeight / 2, -this.viewHeight / 2,
            0.1, 1000
        );
        this.camera.position.set(0, 0, 50);
        this.camera.lookAt(0, 0, 0);

        this.performanceModeState = {
            sampleFrameTimesMs: [],
            frameSampleCount: 0,
            usedHardwareHint: false,
            slowDeviceDetected: initialSlowDeviceHint,
            appliedSlowDeviceMode: null,
            qualityMode: initialQualityMode,
            rendererAntialias: initialRendererAntialias
        };

        this.renderer = createMainRendererWithFallback({ antialias: initialRendererAntialias });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, initialRendererMaxPixelRatio));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.autoClear = false;
        this.renderer.domElement?.addEventListener?.('webglcontextlost', (event) => {
            event.preventDefault?.();
            console.warn('[Game] Main WebGL context lost.');
        });
        this.renderer.domElement?.addEventListener?.('webglcontextrestored', () => {
            console.info('[Game] Main WebGL context restored.');
        });
        // Suppress VALIDATE_STATUS false positives — common on mobile GPUs where the driver
        // fails validation even though the shader compiles and runs correctly (empty info log).
        this.renderer.debug.onShaderError = (gl, program, glVertexShader, glFragmentShader) => {
            const info = gl.getProgramInfoLog(program)?.trim();
            if (info) {
                console.error('[WebGL] Shader error:', info);
            }
        };
        // Wide-screen letterbox clear color (outside gameplay viewport).
        this.renderer.setClearColor(this.levelBelowClearColor, 1);
        document.body.appendChild(this.renderer.domElement);
        this.initializeDynamicCameraState();
        this.onResize();

        this.setupLighting();

        this.joystick = new Joystick(this.renderer.domElement);
        this.timer = new THREE.Timer();

        this._fpsFrames = 0;
        this._fpsAccum = 0;
        this._fpsCalls = 0;
        this._fpsEl = CONFIG.showFpsCounter ? (() => {
            const el = document.createElement('div');
            el.style.cssText = 'position:fixed;top:8px;left:8px;background:rgba(0,0,0,0.75);color:#0f0;font:bold 14px "Orbitron";padding:4px 8px;z-index:99999;pointer-events:none;white-space:pre;line-height:1.3';
            el.textContent = '? fps';
            document.body.appendChild(el);
            return el;
        })() : null;

        // --- Dyno Fury ultimate (Inferno Shockwave) ---
        this.timeScale = 1;                 // gameplay time scale, driven by the slow-mo envelope
        this.infernoShockwave = null;       // lazily created on first trigger
        this._furySlowMo = null;            // { elapsed, hold, ramp, scale } while active
        this._shakeTime = 0;
        this._shakeDuration = 0;
        this._shakeMagnitude = 0;
        // FuryBar is created after the renderer exists (needs domElement); initialised in init().
        this.furyBar = null;
        this.audioManager = new AudioManager({ masterVolume: 0.7 });
        this.audioManager.loadSounds({
            ...SOUND_EFFECTS,
            ...collectConfiguredObjectKillSounds(),
            ...collectConfiguredObjectGroundImpactSounds(),
            ...collectConfiguredObjectHitSounds(),
            ...collectConfiguredObjectPickupStartSounds()
        });
        this.ambienceAudioManager = new AudioManager({ masterVolume: 0.3 });
        this.ambienceAudioManager.loadSounds(AMBIENCE_SOUNDS);
        this.musicAudioManager = new AudioManager({ masterVolume: 0.48 });
        this.musicAudioManager.loadSounds(MUSIC_SOUNDS);
        this.musicAudioManager.setEnabled(false);
        this.loadingScreen = new LoadingScreen();
        this.cinematicOverlay = new CinematicOverlay();
        this.player = null;
        this.level = null;
        this.currentLevelKey = null;
        this.currentLevelUrl = null;
        this.zoneDialogTriggerManager = new ZoneDialogTriggerManager(this);
        this.zoneLayerVisibilityController = new ZoneLayerVisibilityController();
        this.levelRenderer = null;
        this.skyBackground = null;
        this.parallaxBackground = null;
        this.belowLevelBackground = null;
        this.aboveLevelBackground = null;
        this.levelCollisionContourDebug = null;
        this.levelCollisionContourDebugUnsubscribe = null;
        this.waterPolygonDebug = null;
        this.levelBottomFillY = 0;
        this.levelObjectManager = null;
        this.gameOverDialog = null;
        this.settingsDialog = null;
        this.skinShop = null;
        this.gameOverDialogShown = false;
        this.reviveRewardInProgress = false;
        this.sideSpeedBoostButton = null;
        this.speedBoostRewardInProgress = false;
        this.sideSpeedBoostUnlocked = false;
        this.rewardedSpeedBoostRemaining = 0;
        this.topBarUI = null;
        const savedPlayerData = loadPlayerData();
        // Restore coin count from persisted player data so skin shop progress survives reloads.
        this.coinCount = savedPlayerData?.coins ?? 0;
        this.skinOnboardingArrowSeen = savedPlayerData?.skinOnboardingArrowSeen === true;
        this.hasAffordableSkinAvailable = false;
        this.ringProgressCount = 0;
        this.ringProgressGoal = 100;
        this.activeMissionUI = null;
        this.missionManager = null;
        this.missionInputLocked = false;
        this.missionDisabledButtons = new Set();
        this.timelineCameraControlled = false;
        this.sequencePresentationActive = false;
        this.currentPickupTarget = null;
        this.pickupDropButtonEnabled = false;
        this.isReady = false;
        this.pokiGameplayGate = new PokiGameplayGate(null, { debug: true });
        {
            let resolveInteraction;
            this._interactionPromise = new Promise((resolve) => { resolveInteraction = resolve; });
            this._onFirstInteraction = () => {
                document.removeEventListener('pointerdown', this._onFirstInteraction, { capture: true });
                document.removeEventListener('keydown', this._onFirstInteraction, { capture: true });
                this.pokiGameplayGate.notifyInteraction();
                resolveInteraction();
                this._onFirstInteraction = null;
            };
            document.addEventListener('pointerdown', this._onFirstInteraction, { capture: true });
            document.addEventListener('keydown', this._onFirstInteraction, { capture: true });
        }
        this.initializePerformanceDetection();
        this.preStartRenderLoopActive = false;
        this.preStartRenderFrameId = null;
        this._pendingViewportSyncFrames = 0;
        this._lastViewportWidth = Math.max(window.innerWidth || 0, 1);
        this._lastViewportHeight = Math.max(window.innerHeight || 0, 1);
        this.backgroundWarmupRunId = 0;
        this.backgroundWarmupPromise = null;
        this.windowBlurAudioStates = null;
        this.windowHasFocus = true;
        this.gameplayPaused = false;

        window.addEventListener('resize', () => this.handleViewportResize());
        window.addEventListener('orientationchange', () => this.handleViewportResize());
        window.visualViewport?.addEventListener?.('resize', () => this.handleViewportResize());
        window.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        window.addEventListener('blur', () => this.handleWindowBlur());
        window.addEventListener('focus', () => this.handleWindowFocus());
        window.addEventListener('keydown', (event) => this.handleGlobalKeyDown(event), { capture: true });
        window.addEventListener('pagehide', () => this.pokiGameplayGate.endSession());
        window.addEventListener('beforeunload', () => this.pokiGameplayGate.endSession());
        window.addEventListener('pointerdown', (event) => this.handleGlobalPointerDown(event), { capture: true });
        this.init().catch((error) => {
            // ErrorEvent (Three.js asset failures) and circular objects serialize poorly.
            // Extract the useful fields explicitly instead of passing the raw object.
            const msg = error?.message || error?.filename || error?.url || String(error);
            const detail = error?.stack ? `${msg}\n${error.stack}` : msg;
            console.error('[Game] Failed to initialize level.', detail);
            const isNetworkError = /failed to fetch|networkerror|load failed|network request failed/i.test(msg);
            if (isNetworkError) {
                // On a transient network error during startup (common on mobile after a
                // background resume), reload the page automatically after a short delay
                // rather than showing a dead error screen — the game hasn't started yet
                // so a reload is safe and invisible to the user.
                console.warn('[Game] Network error during init — reloading in 3s.');
                setTimeout(() => window.location.reload(), 3000);
                return;
            }
            this.loadingScreen.showError('Open the console for more details.');
        });
    }

    setupLighting() {
/*        
        // Basic scene meshes use unlit materials, so this only affects the imported dyno model.
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.35);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.6);
        directionalLight.position.set(15, 20, 30);
        this.scene.add(directionalLight);
*/        
    }

    initializeDynamicCameraState() {
        const settings = getDynamicCameraSettings();
        this.dynamicCameraState.zoom = settings.minZoom;
        this.dynamicCameraState.smoothedDirection.set(0, 0);
        this.dynamicCameraState.lookAhead.set(0, 0);
    }

    initializePerformanceDetection() {
        if (!isQualitySystemEnabled()) {
            this.performanceModeState.usedHardwareHint = false;
            this.performanceModeState.slowDeviceDetected = false;
            this.applyPerformanceModeOverrides();
            return;
        }

        const detectionConfig = CONFIG.PERFORMANCE?.slowDeviceDetection;
        if (detectionConfig?.enabled !== true) {
            return;
        }

        this.performanceModeState.usedHardwareHint = detectionConfig.useHardwareHintAsInitialSlow === true;
        if (this.performanceModeState.usedHardwareHint) {
            this.performanceModeState.slowDeviceDetected = this.getSlowDeviceHardwareHint();
        }
        this.applyPerformanceModeOverrides();
    }

    setQualityMode(mode) {
        if (!isQualitySystemEnabled()) {
            if (this.performanceModeState.qualityMode !== 'high') {
                this.performanceModeState.qualityMode = 'high';
                this.applyPerformanceModeOverrides();
            }
            return;
        }

        const normalizedMode = normalizeQualityMode(mode);
        if (this.performanceModeState.qualityMode === normalizedMode) {
            return;
        }
        this.performanceModeState.qualityMode = normalizedMode;
        this.applyPerformanceModeOverrides();
    }

    getEffectiveSlowDeviceMode() {
        if (!isQualitySystemEnabled()) {
            return false;
        }

        const qualityMode = this.performanceModeState.qualityMode;
        if (qualityMode === 'low') {
            return true;
        }
        if (qualityMode === 'high') {
            return false;
        }
        return this.performanceModeState.slowDeviceDetected === true;
    }

    getSlowDeviceHardwareHint() {
        return getSlowDeviceHardwareHintFromNavigator(CONFIG.PERFORMANCE?.slowDeviceDetection);
    }

    getCurrentPerformanceProfile() {
        return getPerformanceQualityProfile(
            this.performanceModeState?.qualityMode,
            this.getEffectiveSlowDeviceMode()
        );
    }

    getRendererPixelRatioForProfile(profile = null) {
        const resolvedProfile = profile || this.getCurrentPerformanceProfile();
        const maxPixelRatio = Number.isFinite(resolvedProfile?.renderer?.maxPixelRatio)
            ? Math.max(0.5, resolvedProfile.renderer.maxPixelRatio)
            : Math.max(0.5, CONFIG.maxPixelRatio ?? 2);
        return Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    }

    ensureParallaxBackground() {
        if (this.parallaxBackground || !shouldCreateParallaxBackground()) {
            return this.parallaxBackground;
        }
        this.parallaxBackground = new ParallaxBackground(
            this.scene,
            this.camera,
            PARALLAX_LAYER_CONFIG
        );
        return this.parallaxBackground;
    }

    updatePerformanceDetection(dtSeconds) {
        if (!isQualitySystemEnabled()) {
            return;
        }

        const detectionConfig = CONFIG.PERFORMANCE?.slowDeviceDetection;
        if (detectionConfig?.enabled !== true || !Number.isFinite(dtSeconds) || dtSeconds <= 0) {
            return;
        }

        const frameMs = dtSeconds * 1000;
        const samples = this.performanceModeState.sampleFrameTimesMs;
        samples.push(frameMs);
        const maxSamples = Math.max(1, detectionConfig.maxSamples ?? 180);
        if (samples.length > maxSamples) {
            samples.shift();
        }
        this.performanceModeState.frameSampleCount += 1;

        const minSampleCount = Math.max(1, detectionConfig.minSampleCount ?? 60);
        if (samples.length < minSampleCount) {
            return;
        }

        let totalMs = 0;
        let slowLongFrames = 0;
        let fastLongFrames = 0;
        const slowLongFrameMs = detectionConfig.slowLongFrameMs ?? 28;
        const fastLongFrameMs = detectionConfig.fastLongFrameMs ?? 24;
        for (let i = 0; i < samples.length; i += 1) {
            const sample = samples[i];
            totalMs += sample;
            if (sample >= slowLongFrameMs) {
                slowLongFrames += 1;
            }
            if (sample >= fastLongFrameMs) {
                fastLongFrames += 1;
            }
        }

        const averageMs = totalMs / samples.length;
        const slowLongRatio = slowLongFrames / samples.length;
        const fastLongRatio = fastLongFrames / samples.length;
        const shouldBeSlow =
            averageMs >= (detectionConfig.slowAvgFrameMs ?? 22) ||
            slowLongRatio >= (detectionConfig.slowLongFrameRatio ?? 0.25);
        const shouldBeFast =
            averageMs <= (detectionConfig.fastAvgFrameMs ?? 18) &&
            fastLongRatio <= (detectionConfig.fastLongFrameRatio ?? 0.12);

        if (shouldBeSlow === this.performanceModeState.slowDeviceDetected) {
            return;
        }
        if (!shouldBeSlow && !shouldBeFast) {
            return;
        }

        this.performanceModeState.slowDeviceDetected = shouldBeSlow;
        if (detectionConfig.logTransitions === true) {
            console.info('[Performance] Slow-device mode changed', {
                slowDevice: shouldBeSlow,
                averageFrameMs: Number(averageMs.toFixed(2)),
                slowLongRatio: Number(slowLongRatio.toFixed(2)),
                sampleCount: samples.length
            });
        }
        this.applyPerformanceModeOverrides();
    }

    applyPerformanceModeOverrides() {
        const slowDevice = this.getEffectiveSlowDeviceMode();
        const profile = this.getCurrentPerformanceProfile();
        const desiredPixelRatio = this.getRendererPixelRatioForProfile(profile);
        const desiredParallaxVisible = shouldCreateParallaxBackground() && profile.background?.parallaxEnabled !== false;
        if (this.renderer && Math.abs(this.renderer.getPixelRatio() - desiredPixelRatio) > 0.001) {
            this.renderer.setPixelRatio(desiredPixelRatio);
            this.renderer.setSize(window.innerWidth, window.innerHeight, false);
        }
        if (desiredParallaxVisible) {
            this.ensureParallaxBackground();
        }
        if (
            this.performanceModeState.appliedSlowDeviceMode === slowDevice
        ) {
            this.burnableSceneryManager?.setPerformanceProfile?.(profile.burnableScenery);
            this.parallaxBackground?.setBackgroundLayersVisible?.(desiredParallaxVisible);
            return;
        }

        this.performanceModeState.appliedSlowDeviceMode = slowDevice;
        this.burnableSceneryManager?.setPerformanceProfile?.(profile.burnableScenery);
        this.parallaxBackground?.setBackgroundLayersVisible?.(desiredParallaxVisible);
    }

    getDynamicLerpAlpha(value, dt = null) {
        if (typeof dt !== 'number' || dt <= 0) {
            return value;
        }

        // Convert config-friendly 0..1 smoothing into frame-rate independent damping.
        const damping = Math.max(0.001, value * 60);
        return 1 - Math.exp(-damping * dt);
    }

    moveToward(current, target, maxDelta) {
        if (current < target) {
            return Math.min(current + maxDelta, target);
        }
        return Math.max(current - maxDelta, target);
    }

    moveVectorToward(current, target, maxDeltaX, maxDeltaY) {
        current.x = this.moveToward(current.x, target.x, maxDeltaX);
        current.y = this.moveToward(current.y, target.y, maxDeltaY);
        return current;
    }

    waitForNextFrame() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => resolve());
        });
    }

    async warmupLevelObjectSettling(levelObjectManager = this.levelObjectManager, options = {}) {
        const physicsWorld = levelObjectManager?.physicsWorld;
        if (!levelObjectManager || !physicsWorld) {
            return;
        }
        const shouldAbort = typeof options.shouldAbort === 'function'
            ? options.shouldAbort
            : () => false;

        const fixedDt = typeof physicsWorld.getFixedStepSeconds === 'function'
            ? physicsWorld.getFixedStepSeconds()
            : (1 / 60);
        const maxWarmupSeconds = 6;
        const maxSteps = Math.max(1, Math.ceil(maxWarmupSeconds / Math.max(fixedDt, 0.001)));
        const stableFramesRequired = 8;
        let stableFrames = 0;

        physicsWorld.setStartupSettlingMode?.(true);
        try {
            for (let step = 0; step < maxSteps; step += 1) {
                if (shouldAbort()) {
                    break;
                }
                levelObjectManager.update(fixedDt);

                const pendingBodies = physicsWorld.countUnsettledStartupBodies?.() ?? 0;
                if (pendingBodies <= 0) {
                    stableFrames += 1;
                    if (stableFrames >= stableFramesRequired) {
                        break;
                    }
                } else {
                    stableFrames = 0;
                }

                // Yield periodically so long pre-start settle passes stay responsive on heavier
                // levels, while still finishing before the player presses Start.
                if ((step + 1) % 24 === 0) {
                    await this.waitForNextFrame();
                }
            }
        } finally {
            physicsWorld.setStartupSettlingMode?.(false);
        }
    }

    async warmupLevelObjectRenderAssets(levelObjectManager = this.levelObjectManager, options = {}) {
        const renderer = this.renderer;
        const objects = levelObjectManager?.objects;
        if (!renderer || !Array.isArray(objects) || objects.length === 0) {
            return;
        }
        const shouldAbort = typeof options.shouldAbort === 'function'
            ? options.shouldAbort
            : () => false;

        const warmTexture = (texture) => {
            if (!texture || !renderer.initTexture) {
                return;
            }
            try {
                renderer.initTexture(texture);
            } catch {
                // Mobile/WebGL drivers can reject eager texture init occasionally.
                // Warmup is best-effort only.
            }
        };

        const warmMaterial = (material) => {
            if (!material) {
                return;
            }
            warmTexture(material.map);
            warmTexture(material.alphaMap);
            warmTexture(material.emissiveMap);
            warmTexture(material.normalMap);
            warmTexture(material.roughnessMap);
            warmTexture(material.metalnessMap);
            warmTexture(material.aoMap);
        };

        for (let i = 0; i < objects.length; i += 1) {
            if (shouldAbort()) {
                return;
            }
            const object = objects[i];
            const sceneObject = object?.sceneObject;
            if (!sceneObject) {
                continue;
            }
            sceneObject.traverse((child) => {
                if (!child?.isMesh) {
                    return;
                }
                if (Array.isArray(child.material)) {
                    for (const material of child.material) {
                        warmMaterial(material);
                    }
                } else {
                    warmMaterial(child.material);
                }
            });

            if ((i + 1) % 24 === 0) {
                await this.waitForNextFrame();
            }
        }

        if (shouldAbort()) {
            return;
        }
        if (typeof renderer.compileAsync === 'function') {
            try {
                await renderer.compileAsync(this.scene, this.camera);
            } catch {
                renderer.compile?.(this.scene, this.camera);
            }
        } else {
            renderer.compile?.(this.scene, this.camera);
        }
    }

    startBackgroundLevelWarmup(levelObjectManager = this.levelObjectManager) {
        const runId = (this.backgroundWarmupRunId || 0) + 1;
        this.backgroundWarmupRunId = runId;
        const shouldAbort = () => (
            this.backgroundWarmupRunId !== runId ||
            this.levelObjectManager !== levelObjectManager
        );

        this.backgroundWarmupPromise = (async () => {
            // Make the level playable first, then spend later frames on hitch-reduction work.
            await this.waitForNextFrame();
            if (shouldAbort()) return;
            await this.warmupLevelObjectRenderAssets(levelObjectManager, { shouldAbort });
            if (shouldAbort()) return;
            await this.warmupLevelObjectSettling(levelObjectManager, { shouldAbort });
        })().catch((error) => {
            console.warn('[Game] Background level warmup failed.', error);
        }).finally(() => {
            if (this.backgroundWarmupRunId === runId) {
                this.backgroundWarmupPromise = null;
            }
        });

        return this.backgroundWarmupPromise;
    }

    startPreStartRenderLoop() {
        if (this.preStartRenderLoopActive) {
            return;
        }

        this.preStartRenderLoopActive = true;
        const tick = () => {
            if (!this.preStartRenderLoopActive) {
                return;
            }
            this.renderFrame(0);
            this.preStartRenderFrameId = requestAnimationFrame(tick);
        };
        tick();
    }

    stopPreStartRenderLoop() {
        this.preStartRenderLoopActive = false;
        if (this.preStartRenderFrameId !== null) {
            cancelAnimationFrame(this.preStartRenderFrameId);
            this.preStartRenderFrameId = null;
        }
    }

    showMissionLoadOverlay({ isReload = false, levelValue = '' } = {}) {
        this.loadingScreen?.show?.({
            title: t('loading_title'),
            status: '',
            detail: '',
            phase: t('loading_phase'),
            progress: 0.06,
            showButton: false,
            previewMode: 'run'
        });
    }

    async hideMissionLoadOverlay(levelValue = '') {
        this.loadingScreen?.setProgress?.(1);
        this.loadingScreen?.setPhase?.(t('loading_ready_phase'));
        this.loadingScreen?.setStatus?.('');
        this.loadingScreen?.setDetail?.('');
        await this.waitForNextFrame();
        this.loadingScreen?.hide?.();
    }

    updateCameraProjection(zoomFactor = this.dynamicCameraState.zoom) {
        const screenWidth = Math.max(window.innerWidth, 1);
        const screenHeight = Math.max(window.innerHeight, 1);
        const screenAspect = screenWidth / screenHeight;
        const {
            minAspect,
            maxAspect,
            minAspectScale,
            maxAspectScale
        } = getCameraAspectSettings();
        const clampedAspect = THREE.MathUtils.clamp(screenAspect, minAspect, maxAspect);
        const aspectRange = Math.max(maxAspect - minAspect, 0.0001);
        const aspectT = THREE.MathUtils.clamp((clampedAspect - minAspect) / aspectRange, 0, 1);
        const cameraScale = THREE.MathUtils.lerp(minAspectScale, maxAspectScale, aspectT);
        const scaledViewHeight = (this.viewHeight / Math.max(cameraScale, 0.0001)) * Math.max(zoomFactor, 0.001);
        const baseViewWidth = scaledViewHeight * clampedAspect;

        let viewportWidth = screenWidth;
        let viewportHeight = screenHeight;
        let viewportX = 0;
        let viewportY = 0;
        let cameraLeft = -baseViewWidth / 2;
        let cameraRight = baseViewWidth / 2;
        let cameraTop = scaledViewHeight / 2;
        let cameraBottom = -scaledViewHeight / 2;

        if (screenAspect > maxAspect) {
            viewportWidth = Math.round(screenHeight * maxAspect);
            viewportX = Math.round((screenWidth - viewportWidth) * 0.5);
        } else if (screenAspect < minAspect) {
            const centeredViewportHeight = Math.round(screenWidth / minAspect);
            const bottomBarHeight = Math.round((screenHeight - centeredViewportHeight) * 0.5);
            viewportHeight = screenHeight - bottomBarHeight;
            viewportY = bottomBarHeight;

            const extendedViewportAspect = viewportWidth / Math.max(viewportHeight, 1);
            const extendedViewHeight = baseViewWidth / Math.max(extendedViewportAspect, 0.0001);
            cameraTop = scaledViewHeight * 0.5 + Math.max(0, extendedViewHeight - scaledViewHeight);
        }

        this.camera.left = cameraLeft;
        this.camera.right = cameraRight;
        this.camera.top = cameraTop;
        this.camera.bottom = cameraBottom;
        // Gameplay zoom is expressed through the ortho extents above. Reset direct camera.zoom
        // so cinematic tracks cannot leave a stale multiplier behind after sequence playback.
        this.camera.zoom = 1;
        this.camera.updateProjectionMatrix();

        this.sceneViewport = {
            width: viewportWidth,
            height: viewportHeight,
            x: viewportX,
            y: viewportY
        };
        this.cameraExtents = {
            left: -this.camera.left,
            right: this.camera.right,
            top: this.camera.top,
            bottom: -this.camera.bottom
        };

    }

    updateCamera() {
        this.updateCameraProjection(this.dynamicCameraState.zoom);
        if (this.isReady) {
            this.updateCameraFollow();
        }
    }

    getCameraHalfExtents() {
        return {
            halfWidth: this.cameraExtents.right,
            halfHeight: (this.cameraExtents.top + this.cameraExtents.bottom) * 0.5
        };
    }

    getCameraWorldBounds() {
        if (!this.level) {
            return null;
        }

        const left = this.level.worldOriginX;
        const right = this.level.worldOriginX + this.level.width * this.level.tileWidth;
        const bottom = this.level.worldOriginY;
        const top = this.skyBackground?.getTopY?.() ?? this.level.flightCeilingY;

        return { left, right, bottom, top };
    }

    createBelowLevelBackground() {
        if (this.belowLevelBackground) {
            this.belowLevelBackground.geometry?.dispose?.();
            this.belowLevelBackground.material?.dispose?.();
            this.belowLevelBackground.removeFromParent();
            this.belowLevelBackground = null;
        }

        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(CONFIG.COLORS.LEVEL_BELOW ?? '#2c2c2c'),
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        // Render this late as a scene-level mask so any background seam/edge below the level
        // is always covered, regardless of which background system produced it.
        mesh.renderOrder = 500;
        mesh.frustumCulled = false;
        mesh.position.z = -890;
        // Kept only for backward compatibility; bottom fill now renders as a screen-space overlay.
        mesh.visible = false;
        this.scene.add(mesh);
        this.belowLevelBackground = mesh;
        this.updateBelowLevelBackground();
    }

    createAboveLevelBackground() {
        if (this.aboveLevelBackground) {
            this.aboveLevelBackground.geometry?.dispose?.();
            this.aboveLevelBackground.material?.dispose?.();
            this.aboveLevelBackground.removeFromParent();
            this.aboveLevelBackground = null;
        }

        const skyTopColor = new THREE.Color(CONFIG.COLORS.SKY_TOP ?? '#00499c');
        // Use a ShaderMaterial so the color is output in the same linear color space as
        // SkyBackground's shader — MeshBasicMaterial goes through sRGB conversion and
        // produces a visibly different shade for the same hex value.
        const material = new THREE.ShaderMaterial({
            uniforms: { color: { value: skyTopColor } },
            vertexShader: `void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
            fragmentShader: `uniform vec3 color; void main() { gl_FragColor = vec4(color, 1.0); }`,
            depthWrite: false,
            depthTest: false
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
        mesh.renderOrder = 499;
        mesh.frustumCulled = false;
        mesh.position.z = -891;
        this.scene.add(mesh);
        this.aboveLevelBackground = mesh;
        this.updateAboveLevelBackground();
    }

    updateAboveLevelBackground() {
        if (!this.aboveLevelBackground || !this.level) {
            return;
        }

        const viewWidth = Math.max(this.camera.right - this.camera.left, 1);
        const viewHeight = Math.max(this.camera.top - this.camera.bottom, 1);
        const levelWidth = this.level.width * this.level.tileWidth;
        const bottomOverlap = Math.max(this.level.tileHeight * 0.05, 0.5);
        const width = Math.max(levelWidth, viewWidth * 3);
        const height = Math.max(CONFIG.LEVEL_HEIGHT, viewHeight * 6, 1000);
        const skyTopY = this.skyBackground?.getTopY?.() ?? (this.level.worldOriginY + CONFIG.LEVEL_HEIGHT);

        this.aboveLevelBackground.scale.set(width, height, 1);
        this.aboveLevelBackground.position.x = this.camera.position.x;
        this.aboveLevelBackground.position.y = skyTopY - bottomOverlap + (height * 0.5);
    }

    disposeLevelCollisionContourDebug() {
        this.levelCollisionContourDebugUnsubscribe?.();
        this.levelCollisionContourDebugUnsubscribe = null;
        this.levelCollisionContourDebug?.traverse((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((material) => material?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
        this.levelCollisionContourDebug?.removeFromParent?.();
        this.levelCollisionContourDebug = null;
    }

    rebuildLevelCollisionContourDebug() {
        this.disposeLevelCollisionContourDebug();

        if (!CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours || !this.level?.getCollisionPolygons) {
            return;
        }

        const polygonRegions = this.level.getCollisionPolygonRegions?.() ||
            this.level.getCollisionPolygons().map((polygon) => ({ type: 'solid', points: polygon }));
        const edges = this.level.getCollisionEdges?.() || [];
        const cleanupDebug = this.level.getCollisionContourCleanupDebug?.() || [];

        const group = new THREE.Group();
        group.name = 'LevelCollisionContourDebug';
        group.renderOrder = 999999;
        const fillMaterial = new THREE.MeshBasicMaterial({
            color: 0x00c8ff,
            transparent: true,
            opacity: 0.45,
            depthTest: false,
            depthWrite: false,
            side: THREE.DoubleSide,
            toneMapped: false
        });
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });

        const addDebugContourLine = (points, color, z, name, opacity = 0.9) => {
            if (!Array.isArray(points) || points.length < 2) {
                return;
            }

            const positions = [];
            points.forEach((point) => {
                positions.push(point.x, point.y, z);
            });
            positions.push(points[0].x, points[0].y, z);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const material = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            });
            const line = new THREE.Line(geometry, material);
            line.name = name;
            line.renderOrder = 1000002;
            line.frustumCulled = false;
            group.add(line);
        };

        const addDebugPoints = (points, color, z, name) => {
            if (!Array.isArray(points) || points.length === 0) {
                return;
            }

            const positions = [];
            points.forEach((point) => {
                positions.push(point.x, point.y, z);
            });

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const material = new THREE.PointsMaterial({
                color,
                size: Math.max(Math.min(this.level?.tileWidth ?? 1, this.level?.tileHeight ?? 1) * 0.18, 1.5),
                sizeAttenuation: false,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            });
            const pointCloud = new THREE.Points(geometry, material);
            pointCloud.name = name;
            pointCloud.renderOrder = 1000003;
            pointCloud.frustumCulled = false;
            group.add(pointCloud);
        };

        polygonRegions.forEach((region, index) => {
            const polygon = region?.points;
            if (!Array.isArray(polygon) || polygon.length < 3) {
                return;
            }

            const shape = new THREE.Shape(
                polygon.map((point) => new THREE.Vector2(point.x, point.y))
            );
            const fillGeometry = new THREE.ShapeGeometry(shape);
            const regionFillMaterial = fillMaterial.clone();
            regionFillMaterial.color.setHex(region?.type === 'fly_through' ? 0x33ff99 : 0x00c8ff);
            const fillMesh = new THREE.Mesh(fillGeometry, regionFillMaterial);
            fillMesh.position.z = 49;
            fillMesh.name = `LevelCollisionContourFill:${index}:${region?.type || 'solid'}`;
            fillMesh.renderOrder = 999998;
            fillMesh.frustumCulled = false;
            group.add(fillMesh);

            const positions = [];
            polygon.forEach((point) => {
                positions.push(point.x, point.y, 8);
            });
            positions.push(polygon[0].x, polygon[0].y, 8);

            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const regionLineMaterial = lineMaterial.clone();
            regionLineMaterial.color.setHex(region?.type === 'fly_through' ? 0x99ff66 : 0x00ffff);
            const line = new THREE.Line(geometry, regionLineMaterial);
            line.name = `LevelCollisionContour:${index}:${region?.type || 'solid'}`;
            line.renderOrder = 999999;
            line.frustumCulled = false;
            group.add(line);
        });

        cleanupDebug.forEach((entry, index) => {
            addDebugContourLine(
                entry.original,
                0xffaa33,
                50.1,
                `LevelCollisionOriginalContour:${index}`,
                0.55
            );
            addDebugContourLine(
                entry.cleaned,
                0x00ffee,
                50.2,
                `LevelCollisionCleanedContour:${index}`,
                0.95
            );
            addDebugPoints(
                entry.removedPoints,
                0xff3355,
                50.25,
                `LevelCollisionRemovedPoints:${index}`
            );
        });

        const edgeColors = {
            top: 0x33ff66,
            bottom: 0xff4455,
            left: 0x3399ff,
            right: 0x3399ff
        };

        edges.forEach((edge, index) => {
            const edgeGeometry = new THREE.BufferGeometry();
            edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
                edge.x1, edge.y1, 49.8,
                edge.x2, edge.y2, 49.8
            ], 3));
            const edgeLine = new THREE.Line(
                edgeGeometry,
                new THREE.LineBasicMaterial({
                    color: edgeColors[edge.type] || 0xffffff,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            edgeLine.name = `LevelCollisionEdge:${index}:${edge.type}`;
            edgeLine.renderOrder = 1000000;
            edgeLine.frustumCulled = false;
            group.add(edgeLine);

            const midX = (edge.x1 + edge.x2) * 0.5;
            const midY = (edge.y1 + edge.y2) * 0.5;
            const dx = edge.x2 - edge.x1;
            const dy = edge.y2 - edge.y1;
            let normalX = -dy;
            let normalY = dx;
            const normalLength = Math.hypot(normalX, normalY) || 1;
            normalX /= normalLength;
            normalY /= normalLength;
            if (edge.type === 'top' && normalY < 0) {
                normalX *= -1;
                normalY *= -1;
            } else if (edge.type === 'bottom' && normalY > 0) {
                normalX *= -1;
                normalY *= -1;
            } else if (edge.type === 'left' && normalX > 0) {
                normalX *= -1;
                normalY *= -1;
            } else if (edge.type === 'right' && normalX < 0) {
                normalX *= -1;
                normalY *= -1;
            }

            const normalGeometry = new THREE.BufferGeometry();
            normalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
                midX, midY, 49.85,
                midX + (normalX * 0.65), midY + (normalY * 0.65), 49.85
            ], 3));
            const normalLine = new THREE.Line(
                normalGeometry,
                new THREE.LineBasicMaterial({
                    color: 0xffffff,
                    depthTest: false,
                    depthWrite: false,
                    toneMapped: false
                })
            );
            normalLine.name = `LevelCollisionNormal:${index}`;
            normalLine.renderOrder = 1000001;
            normalLine.frustumCulled = false;
            group.add(normalLine);
        });

        const groups = this.level.getCollisionEdgeGroups?.() || [];
        const circleMaterial = new THREE.LineBasicMaterial({
            color: 0xff9900,
            transparent: true,
            opacity: 0.5,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const circleSegments = 24;
        groups.forEach((g, index) => {
            const positions = [];
            for (let s = 0; s <= circleSegments; s++) {
                const angle = (s / circleSegments) * Math.PI * 2;
                positions.push(g.cx + Math.cos(angle) * g.r, g.cy + Math.sin(angle) * g.r, 49.9);
            }
            const circleGeometry = new THREE.BufferGeometry();
            circleGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const circle = new THREE.Line(circleGeometry, circleMaterial);
            circle.name = `BoundingCircle:${index}`;
            circle.renderOrder = 1000001;
            circle.frustumCulled = false;
            group.add(circle);
        });

        this.scene.add(group);
        this.levelCollisionContourDebug = group;
        this.levelCollisionContourDebugUnsubscribe = this.level.addChangeListener(() => {
            this.rebuildLevelCollisionContourDebug();
        });
    }

    disposeWaterPolygonDebug() {
        this.waterPolygonDebug?.traverse((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((m) => m.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
        this.waterPolygonDebug?.removeFromParent?.();
        this.waterPolygonDebug = null;
    }

    rebuildWaterPolygonDebug() {
        this.disposeWaterPolygonDebug();

        if (!CONFIG.LEVEL_OBJECTS?.debugRenderWaterPolygons) return;

        const polygons = this.level?.waterPolygons;
        if (!Array.isArray(polygons) || polygons.length === 0) return;

        const group = new THREE.Group();
        group.name = 'WaterPolygonDebug';
        group.renderOrder = 999990;

        polygons.forEach((poly, index) => {
            const pts = poly.points;
            if (!Array.isArray(pts) || pts.length < 3) return;

            // Filled semi-transparent blue shape.
            const shape = new THREE.Shape(pts.map((p) => new THREE.Vector2(p.x, p.y)));
            const fillGeometry = new THREE.ShapeGeometry(shape);
            const fillMesh = new THREE.Mesh(fillGeometry, new THREE.MeshBasicMaterial({
                color: 0x0055ff,
                transparent: true,
                opacity: 0.25,
                depthTest: false,
                depthWrite: false,
                side: THREE.DoubleSide,
                toneMapped: false
            }));
            fillMesh.position.z = 48;
            fillMesh.name = `WaterPolygonFill:${index}`;
            fillMesh.renderOrder = 999990;
            fillMesh.frustumCulled = false;
            group.add(fillMesh);

            // Outline in bright cyan-blue.
            const linePositions = [];
            pts.forEach((p) => linePositions.push(p.x, p.y, 48.1));
            linePositions.push(pts[0].x, pts[0].y, 48.1);
            const lineGeometry = new THREE.BufferGeometry();
            lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
                color: 0x33aaff,
                transparent: true,
                opacity: 0.9,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            }));
            line.name = `WaterPolygonOutline:${index}`;
            line.renderOrder = 999992;
            line.frustumCulled = false;
            group.add(line);

            // Vertex dots so point order is visible.
            const dotPositions = pts.map((p) => [p.x, p.y, 48.2]).flat();
            const dotGeometry = new THREE.BufferGeometry();
            dotGeometry.setAttribute('position', new THREE.Float32BufferAttribute(dotPositions, 3));
            const dots = new THREE.Points(dotGeometry, new THREE.PointsMaterial({
                color: 0xffffff,
                size: Math.max(Math.min(this.level?.tileWidth ?? 1, this.level?.tileHeight ?? 1) * 0.15, 1.5),
                sizeAttenuation: false,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            }));
            dots.name = `WaterPolygonDots:${index}`;
            dots.renderOrder = 999993;
            dots.frustumCulled = false;
            group.add(dots);
        });

        this.scene.add(group);
        this.waterPolygonDebug = group;
    }

    disposeMissionZoneDebug() {
        this.missionZoneDebug?.traverse((child) => {
            child.geometry?.dispose?.();
            child.material?.dispose?.();
        });
        this.missionZoneDebug?.removeFromParent?.();
        this.missionZoneDebug = null;
    }

    rebuildMissionZoneDebug() {
        this.disposeMissionZoneDebug();
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderMissionZones) return;

        const zones = this.level?.getMissionZones?.() || [];
        // Also include synthesized fallback zones from missioncallout objects.
        const synthZones = [];
        for (const obj of this.levelObjectManager?.objects || []) {
            if (obj?.type !== 'missioncallout' || !obj.missionId || !obj.container) continue;
            if (zones.some((z) => z.zoneId === obj.missionId)) continue;
            const cx = obj.container.position.x;
            const cy = obj.container.position.y;
            const calloutCfg = CONFIG?.LEVEL_OBJECT_TYPES?.missioncallout;
            const rx = calloutCfg?.landingZoneRadiusX ?? calloutCfg?.landingZoneRadius ?? 10;
            const ry = calloutCfg?.landingZoneRadiusY ?? calloutCfg?.landingZoneRadius ?? 6;
            synthZones.push({ zoneId: obj.missionId, left: cx - rx, right: cx + rx, bottom: cy - ry, top: cy + ry, synthetic: true });
        }

        const allZones = [...zones, ...synthZones];

        if (allZones.length === 0) return;

        const group = new THREE.Group();
        group.name = 'MissionZoneDebug';

        const Z = 48;
        allZones.forEach((zone) => {
            const { left, right, bottom, top, zoneId, synthetic } = zone;
            const w = right - left;
            const h = top - bottom;
            const cx = left + w * 0.5;
            const cy = bottom + h * 0.5;

            // Filled rect.
            const fill = new THREE.Mesh(
                new THREE.PlaneGeometry(w, h),
                new THREE.MeshBasicMaterial({
                    color: synthetic ? 0xffaa00 : 0x00ff88,
                    transparent: true,
                    opacity: 0.15,
                    depthTest: false,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                    toneMapped: false
                })
            );
            fill.position.set(cx, cy, Z);
            fill.renderOrder = 999980;
            fill.frustumCulled = false;
            group.add(fill);

            // Outline.
            const pts = [left, bottom, right, bottom, right, top, left, top, left, bottom];
            const linePos = [];
            for (let i = 0; i < pts.length; i += 2) linePos.push(pts[i], pts[i + 1], Z + 0.1);
            const lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
            const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({
                color: synthetic ? 0xffcc44 : 0x44ffaa,
                transparent: true,
                opacity: 0.9,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            }));
            line.renderOrder = 999981;
            line.frustumCulled = false;
            group.add(line);
        });

        this.scene.add(group);
        this.missionZoneDebug = group;
    }

    resolveLevelBottomFillY() {
        if (!this.level) {
            return 0;
        }

        const fallbackBottom = this.level.worldOriginY;
        let minSurfaceY = Number.POSITIVE_INFINITY;
        const sampleInset = Math.min(Math.max(this.level.tileWidth * 0.05, 0.01), this.level.tileWidth * 0.45);

        for (let row = 0; row < this.level.height; row += 1) {
            for (let col = 0; col < this.level.width; col += 1) {
                const tile = this.level.getTileAtCell(col, row);
                if (!this.level.usesHeightBasedCollision(tile)) {
                    continue;
                }

                const cellWorld = this.level.cellToWorld(col, row);
                const leftSurfaceY = this.level.getSurfaceHeightAtCell(col, row, cellWorld.x + sampleInset);
                const rightSurfaceY = this.level.getSurfaceHeightAtCell(
                    col,
                    row,
                    cellWorld.x + this.level.tileWidth - sampleInset
                );

                if (Number.isFinite(leftSurfaceY)) {
                    minSurfaceY = Math.min(minSurfaceY, leftSurfaceY);
                }
                if (Number.isFinite(rightSurfaceY)) {
                    minSurfaceY = Math.min(minSurfaceY, rightSurfaceY);
                }
            }
        }

        return Number.isFinite(minSurfaceY) ? minSurfaceY : fallbackBottom;
    }

    updateBelowLevelBackground() {
        if (!this.belowLevelBackground || !this.level) {
            return;
        }
        

        const viewWidth = Math.max(this.camera.right - this.camera.left, 1);
        const viewHeight = Math.max(this.camera.top - this.camera.bottom, 1);
        const levelWidth = this.level.width * this.level.tileWidth;
        // Keep the lower color aligned with the actual map bottom; only a tiny overlap is used
        // to avoid a 1px seam from filtering between adjacent background layers.
        const topOverlap = Math.max(this.level.tileHeight * 0.05, 0.5);
        const width = Math.max(levelWidth, viewWidth * 3);
        const height = Math.max(CONFIG.LEVEL_HEIGHT, viewHeight * 6, 1000) + topOverlap;
        const fillTopY = Number.isFinite(this.levelBottomFillY) ? this.levelBottomFillY : this.level.worldOriginY;

        this.belowLevelBackground.scale.set(width, height, 1);
        this.belowLevelBackground.position.x = this.camera.position.x;
        this.belowLevelBackground.position.y = fillTopY + topOverlap - (height * 0.5);
    }

    getBelowLevelViewportRect() {
        if (!this.level || !this.sceneViewport) {
            return null;
        }

        const fillTopY = Number.isFinite(this.levelBottomFillY) ? this.levelBottomFillY : this.level.worldOriginY;
        const cameraMinY = this.camera.position.y + this.camera.bottom;
        const cameraMaxY = this.camera.position.y + this.camera.top;
        const cameraHeight = Math.max(cameraMaxY - cameraMinY, 0.0001);
        const normalizedY = THREE.MathUtils.clamp((fillTopY - cameraMinY) / cameraHeight, -1, 2);
        const fillTopPixel = this.sceneViewport.y + (normalizedY * this.sceneViewport.height);
        const overlayTopPixel = Math.ceil(fillTopPixel) + 1;
        const overlayBottomPixel = this.sceneViewport.y;
        const overlayHeight = Math.max(
            0,
            Math.min(overlayTopPixel, this.sceneViewport.y + this.sceneViewport.height) - overlayBottomPixel
        );

        if (overlayHeight <= 0 || this.sceneViewport.width <= 0) {
            return null;
        }

        return {
            x: Math.floor(this.sceneViewport.x),
            y: Math.floor(overlayBottomPixel),
            width: Math.max(1, Math.ceil(this.sceneViewport.width)),
            height: Math.max(1, Math.ceil(overlayHeight)),
            top: Math.floor(overlayBottomPixel + overlayHeight)
        };
    }

    getSceneRenderScissorRect() {
        const out = this._scratchScissorRect || (this._scratchScissorRect = { x: 0, y: 0, width: 0, height: 0 });
        out.x = Math.floor(this.sceneViewport.x);
        out.y = Math.floor(this.sceneViewport.y);
        out.width = Math.max(1, Math.ceil(this.sceneViewport.width));
        out.height = Math.max(1, Math.ceil(this.sceneViewport.height));

        const belowRect = this.getBelowLevelViewportRect();
        if (!belowRect) {
            return out;
        }

        const sceneTop = out.y + out.height;
        const clippedY = Math.min(Math.max(belowRect.top, out.y), sceneTop);
        const clippedHeight = Math.max(0, sceneTop - clippedY);
        if (clippedHeight <= 0) {
            return out;
        }
        out.y = clippedY;
        out.height = clippedHeight;
        return out;
    }

    clampCameraCenter(target, minWorld, maxWorld, halfExtent) {
        const minCenter = minWorld + halfExtent;
        const maxCenter = maxWorld - halfExtent;

        // If the visible view is larger than the level span, keep the camera centered on the span.
        if (minCenter > maxCenter) {
            return (minWorld + maxWorld) * 0.5;
        }

        return THREE.MathUtils.clamp(target, minCenter, maxCenter);
    }

    clampCameraCenterWithExtents(target, minWorld, maxWorld, negativeExtent, positiveExtent) {
        const minCenter = minWorld + negativeExtent;
        const maxCenter = maxWorld - positiveExtent;

        if (minCenter > maxCenter) {
            return (minWorld + maxWorld + negativeExtent - positiveExtent) * 0.5;
        }

        return THREE.MathUtils.clamp(target, minCenter, maxCenter);
    }

    async runCameraPreview(waypoints, { continuous = false, speed = null, holdSeconds = null, zoomFactor = null } = {}) {
        if (!waypoints || waypoints.length === 0 || !this.camera) return;

        const cfg = CONFIG.CAMERA_PREVIEW || {};
        const holdMs = ((Number.isFinite(holdSeconds) && holdSeconds >= 0) ? holdSeconds : (cfg.holdSeconds ?? 0.7)) * 1000;
        const defaultSpeed = cfg.defaultSpeed ?? 80;
        const resolvedSpeed = (Number.isFinite(speed) && speed > 0) ? speed : defaultSpeed;
        const panMs = (cfg.panSeconds ?? 0.6) * 1000;
        const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const zoomEaseMs = (cfg.zoomEaseSeconds ?? 0.4) * 1000;
        const targetZoom = (Number.isFinite(zoomFactor) && zoomFactor > 0) ? zoomFactor : null;

        const clampX = (x) => {
            const bounds = this.getCameraWorldBounds?.();
            if (!bounds) return x;
            const { halfWidth } = this.getCameraHalfExtents?.() || { halfWidth: 0 };
            return this.clampCameraCenter(x, bounds.left, bounds.right, halfWidth);
        };

        // Enter cinematic mode.
        this.setTimelineCameraControlled(true);
        this.setSequencePresentationActive(true);

        // Zoom management — ease in at start, ease out at end.
        const baseZoom = this.dynamicCameraState.zoom;
        const applyPreviewZoom = (t) => {
            // t=0: base zoom, t=1: targetZoom
            const z = baseZoom + (targetZoom - baseZoom) * easeInOut(t);
            this._cameraPreviewZoom = z;
        };
        if (targetZoom) {
            this._cameraPreviewZoom = baseZoom;
        }

        let skipped = false;
        let resolveSkip = null;
        const skipPromise = new Promise((res) => { resolveSkip = res; });

        const doSkip = () => {
            if (skipped) return;
            skipped = true;
            if (this._cameraPreviewRaf) {
                cancelAnimationFrame(this._cameraPreviewRaf);
                this._cameraPreviewRaf = null;
            }
            resolveSkip?.();
        };
        this.setTimelineSkipHandler(doSkip);

        // Snap camera back to dyno, restore zoom, and exit cinematic mode.
        const exitPreview = () => {
            if (this.player) {
                this.camera.position.x = clampX(this.player.position.x);
                this.camera.position.y = this.player.position.y;
            }
            this._cameraPreviewZoom = null;
            this.updateCameraProjection();
            this.setTimelineSkipHandler(null);
            this.setSequencePresentationActive(false);
            this.setTimelineCameraControlled(false);
            this._cameraPreviewRaf = null;
        };

        // Zoom factor applied as a curve across the full pan duration:
        // ease in during the first zoomEaseMs, hold at peak, ease out during the last zoomEaseMs.
        const computeZoomForT = (t, totalDuration) => {
            if (!targetZoom) return undefined;
            const fadeMs = Math.min(zoomEaseMs, totalDuration * 0.35);
            const fadeT = totalDuration > 0 ? fadeMs / totalDuration : 0;
            let z;
            if (t < fadeT) {
                z = baseZoom + (targetZoom - baseZoom) * easeInOut(t / fadeT);
            } else if (t > 1 - fadeT) {
                z = baseZoom + (targetZoom - baseZoom) * easeInOut((1 - t) / fadeT);
            } else {
                z = targetZoom;
            }
            this._cameraPreviewZoom = z;
            return z;
        };

        if (continuous) {
            // Build full path: start (dyno) → all waypoints → end (dyno).
            const dynoPos = this.player
                ? { x: this.player.position.x, y: this.player.position.y }
                : waypoints[0];
            const path = [dynoPos, ...waypoints, dynoPos];

            // Compute cumulative distances for uniform speed.
            const dists = [0];
            for (let i = 1; i < path.length; i++) {
                dists.push(dists[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
            }
            const totalDist = dists[dists.length - 1];
            const totalMs = totalDist > 0 ? (totalDist / resolvedSpeed) * 1000 : panMs;

            await new Promise((resolve) => {
                const startTime = performance.now();
                const animate = () => {
                    if (skipped) { resolve(); return; }
                    const elapsed = performance.now() - startTime;
                    const t = Math.min(elapsed / totalMs, 1);
                    const d = t * totalDist;
                    let seg = 0;
                    while (seg < dists.length - 2 && dists[seg + 1] < d) seg++;
                    const segLen = dists[seg + 1] - dists[seg];
                    const segT = segLen > 0 ? (d - dists[seg]) / segLen : 1;
                    this.camera.position.x = clampX(path[seg].x + (path[seg + 1].x - path[seg].x) * segT);
                    this.camera.position.y = path[seg].y + (path[seg + 1].y - path[seg].y) * segT;
                    this.updateCameraProjection(computeZoomForT(t, totalMs) ?? undefined);
                    if (t < 1) {
                        this._cameraPreviewRaf = requestAnimationFrame(animate);
                    } else {
                        this._cameraPreviewRaf = null;
                        resolve();
                    }
                };
                this._cameraPreviewRaf = requestAnimationFrame(animate);
                skipPromise.then(resolve);
            });

        } else {
            // Stop-and-hold: estimate total duration for zoom curve.
            const dynoPos = this.player
                ? { x: this.player.position.x, y: this.player.position.y }
                : waypoints[0];
            let totalEstMs = 0;
            let prev = dynoPos;
            for (const wp of waypoints) {
                totalEstMs += (Math.hypot(wp.x - prev.x, wp.y - prev.y) / resolvedSpeed) * 1000 + holdMs;
                prev = wp;
            }

            const journeyStart = performance.now();
            const panTo = (toX, toY) => new Promise((resolve) => {
                const fromX = this.camera.position.x;
                const fromY = this.camera.position.y;
                const tx = clampX(toX);
                const dist = Math.hypot(tx - fromX, toY - fromY);
                if (dist < 0.5) { resolve(); return; }
                const segMs = (dist / resolvedSpeed) * 1000;
                const startTime = performance.now();
                const animate = () => {
                    if (skipped) { resolve(); return; }
                    const t = Math.min((performance.now() - startTime) / segMs, 1);
                    const journeyT = Math.min((performance.now() - journeyStart) / totalEstMs, 1);
                    this.camera.position.x = fromX + (tx - fromX) * easeInOut(t);
                    this.camera.position.y = fromY + (toY - fromY) * easeInOut(t);
                    this.updateCameraProjection(computeZoomForT(journeyT, totalEstMs) ?? undefined);
                    if (t < 1) {
                        this._cameraPreviewRaf = requestAnimationFrame(animate);
                    } else {
                        this._cameraPreviewRaf = null;
                        resolve();
                    }
                };
                this._cameraPreviewRaf = requestAnimationFrame(animate);
                skipPromise.then(resolve);
            });

            const hold = (ms) => new Promise((resolve) => {
                const timer = setTimeout(resolve, ms);
                skipPromise.then(() => { clearTimeout(timer); resolve(); });
            });

            for (const wp of waypoints) {
                if (skipped) break;
                await panTo(wp.x, wp.y);
                await hold(holdMs);
            }
        }

        exitPreview();
    }

    updateCameraFollow(dt = null) {
        if (!this.player || this.timelineCameraControlled) {
            return;
        }

        const dynamicSettings = getDynamicCameraSettings();
        const velocity = this.player.velocity;
        const vx = velocity?.x ?? 0;
        const vy = velocity?.y ?? 0;
        const speed = Math.hypot(vx, vy);
        const speedT = THREE.MathUtils.clamp(speed / dynamicSettings.maxSpeedForCamera, 0, 1);
        const easedSpeedT = easeInOutPower(speedT, dynamicSettings.responseEasingPower);

        const rawDirection = this._scratchRawDirection || (this._scratchRawDirection = new THREE.Vector2());
        if (speed > 0.0001) rawDirection.set(vx / speed, vy / speed);
        else rawDirection.set(0, 0);
        if (typeof dt === 'number' && dt > 0) {
            this.moveVectorToward(
                this.dynamicCameraState.smoothedDirection,
                rawDirection,
                dynamicSettings.directionMaxSpeed * dt,
                dynamicSettings.directionMaxSpeed * dt
            );
        } else {
            this.dynamicCameraState.smoothedDirection.copy(rawDirection);
        }
        if (speed <= 0.0001 && this.dynamicCameraState.smoothedDirection.lengthSq() < 0.000001) {
            this.dynamicCameraState.smoothedDirection.set(0, 0);
        } else {
            this.dynamicCameraState.smoothedDirection.clampLength(0, 1);
        }

        const targetLookAhead = this._scratchTargetLookAhead || (this._scratchTargetLookAhead = new THREE.Vector2());
        targetLookAhead.set(
            this.dynamicCameraState.smoothedDirection.x * dynamicSettings.maxLookAheadX * easedSpeedT,
            this.dynamicCameraState.smoothedDirection.y * dynamicSettings.maxLookAheadY * easedSpeedT
        );
        if (typeof dt === 'number' && dt > 0) {
            this.moveVectorToward(
                this.dynamicCameraState.lookAhead,
                targetLookAhead,
                dynamicSettings.lookAheadMaxSpeedX * dt,
                dynamicSettings.lookAheadMaxSpeedY * dt
            );
        } else {
            this.dynamicCameraState.lookAhead.copy(targetLookAhead);
        }

        const lookAheadRatioX = dynamicSettings.maxLookAheadX > 0
            ? Math.abs(this.dynamicCameraState.lookAhead.x) / dynamicSettings.maxLookAheadX
            : 0;
        const lookAheadRatioY = dynamicSettings.maxLookAheadY > 0
            ? Math.abs(this.dynamicCameraState.lookAhead.y) / dynamicSettings.maxLookAheadY
            : 0;
        const lookAheadT = THREE.MathUtils.clamp(Math.max(lookAheadRatioX, lookAheadRatioY), 0, 1);
        const easedLookAheadT = easeInOutPower(lookAheadT, dynamicSettings.responseEasingPower);
        // Keep zoom tightly coupled to framing offset:
        // centered dyno -> minZoom, max look-ahead -> maxZoom.
        const targetZoom = THREE.MathUtils.lerp(dynamicSettings.minZoom, dynamicSettings.maxZoom, easedLookAheadT);

        // Fury zoom: factor > 1 zooms out (more world visible).
        // Buildup: ease-out (starts fast, decelerates to peak).
        // Post-blast return: ease-in (starts slow, accelerates back to normal).
        let furyZoomCurrent = 1;
        if (this._furyBuildup) {
            const t = this._furyBuildup.zoomOutSeconds > 0
                ? THREE.MathUtils.clamp(this._furyBuildup.elapsed / this._furyBuildup.zoomOutSeconds, 0, 1)
                : 1;
            const eased = 1 - (1 - t) * (1 - t); // ease-out quad
            furyZoomCurrent = 1 + (this._furyBuildup.factor - 1) * eased;
        } else if (this._furyZoom) {
            const t = THREE.MathUtils.clamp(this._furyZoom.elapsed / this._furyZoom.duration, 0, 1);
            const eased = t * t; // ease-in quad: slow start, accelerates back to normal
            furyZoomCurrent = THREE.MathUtils.lerp(this._furyZoom.factor, 1, eased);
        }
        this._furyZoomCurrent = furyZoomCurrent;
        this.dynamicCameraState.zoom = targetZoom * (this._furyZoomCurrent ?? 1);
        this.updateCameraProjection(this.dynamicCameraState.zoom);

        // Look-ahead follows velocity so the camera leads the movement direction. That places
        // the dyno opposite on screen (e.g. moving right -> dyno shifts left in viewport).
        const bounds = this.getCameraWorldBounds();
        if (!bounds) {
            return;
        }

        const { halfWidth, halfHeight } = this.getCameraHalfExtents();
        const targetX = this.player.position.x + this.dynamicCameraState.lookAhead.x;
        const unclampedTargetY = this.player.position.y + this.dynamicCameraState.lookAhead.y;
        const clampedTargetX = this.clampCameraCenter(targetX, bounds.left, bounds.right, halfWidth);
        // Do not clamp camera Y to the authored level top/bottom. Otherwise the dyno gets
        // pushed toward the screen edge near level borders instead of staying normally framed.
        const targetY = unclampedTargetY;

        const followAlpha = this.getDynamicLerpAlpha(dynamicSettings.followLerp, dt);
        this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, clampedTargetX, followAlpha);
        if (typeof dt === 'number' && dt > 0) {
            this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, followAlpha);
        } else {
            this.camera.position.y = targetY;
        }

        const safeMarginY = halfHeight * CAMERA_Y_SAFE_MARGIN_RATIO;
        const maxVisibleOffsetUp = Math.max(this.cameraExtents.top - safeMarginY, this.cameraExtents.top * 0.2);
        const maxVisibleOffsetDown = Math.max(this.cameraExtents.bottom - safeMarginY, this.cameraExtents.bottom * 0.2);
        const playerOffsetY = this.player.position.y - this.camera.position.y;

        if (playerOffsetY > maxVisibleOffsetUp) {
            this.camera.position.y = this.player.position.y - maxVisibleOffsetUp;
        } else if (playerOffsetY < -maxVisibleOffsetDown) {
            this.camera.position.y = this.player.position.y + maxVisibleOffsetDown;
        }
    }

    onResize() {
        const viewport = this.getViewportDimensions();
        this._lastViewportWidth = viewport.width;
        this._lastViewportHeight = viewport.height;
        this._pendingViewportSyncFrames = Math.max(this._pendingViewportSyncFrames, 4);
        this.renderer.setSize(viewport.width, viewport.height, false);
        this.renderer.setPixelRatio(this.getRendererPixelRatioForProfile());
        this.renderer.resetState();
        this.renderer.domElement.style.position = 'fixed';
        this.renderer.domElement.style.left = '0px';
        this.renderer.domElement.style.top = '0px';
        this.renderer.domElement.style.width = `${viewport.width}px`;
        this.renderer.domElement.style.height = `${viewport.height}px`;
        this.topBarUI?.layout(viewport.width, viewport.height);
        this.activeMissionUI?.layout(viewport.width, viewport.height);
        this.sideSpeedBoostButton?.layout(viewport.width, viewport.height);
        this.furyBar?.layout(viewport.width, viewport.height);
        this.updateCamera();
    }

    getViewportDimensions() {
        const visualViewport = window.visualViewport;
        const width = Math.max(
            Math.round(visualViewport?.width || 0) || 0,
            Math.round(window.innerWidth || 0) || 0,
            1
        );
        const height = Math.max(
            Math.round(visualViewport?.height || 0) || 0,
            Math.round(window.innerHeight || 0) || 0,
            1
        );
        return { width, height };
    }

    handleViewportResize() {
        this._pendingViewportSyncFrames = Math.max(this._pendingViewportSyncFrames, 4);
        this.onResize();
    }

    startPokiGameplay(reason) {
        if (reason) {
            this.pokiGameplayGate.removeStopReason(reason);
        } else {
            this.pokiGameplayGate.startSession();
        }
        this.startAmbienceLoop();
        this.startMusicLoop();
    }

    stopPokiGameplay(reason) {
        if (reason) {
            this.pokiGameplayGate.addStopReason(reason);
        } else {
            this.pokiGameplayGate.endSession();
        }
        this.stopAmbienceLoop();
        this.stopMusicLoop();
    }

    startAmbienceLoop() {
        this._updateAmbienceForWaterState();
    }

    stopAmbienceLoop() {
        this.ambienceAudioManager?.stopLoop?.('ambience');
        this.ambienceAudioManager?.stopLoop?.('ambience_underwater');
    }

    setAmbienceEnabled(enabled) {
        this.ambienceAudioManager?.setEnabled?.(enabled);
        if (enabled !== false && this.pokiGameplayGate.isGameplayRunning()) {
            this.startAmbienceLoop();
        }
    }

    _updateAmbienceForWaterState() {
        if (!this.ambienceAudioManager) return;
        const ws = this.player?.waterState;
        const inWater = (this.player?.isInWater ?? false)
            && ws !== 'swimSurfaceIdle' && ws !== 'swimSurfaceIdleUp';
        const active = inWater ? 'ambience_underwater' : 'ambience';
        const inactive = inWater ? 'ambience' : 'ambience_underwater';
        this.ambienceAudioManager.startLoop(active, { volume: 1 });
        this.ambienceAudioManager.stopLoop(inactive);
    }

    startMusicLoop() {
        this.musicAudioManager?.startLoop?.('music1', { volume: 1 });
    }

    stopMusicLoop() {
        this.musicAudioManager?.stopLoop?.('music1');
    }

    setMusicEnabled(enabled) {
        this.musicAudioManager?.setEnabled?.(enabled);
        if (enabled !== false && this.pokiGameplayGate.isGameplayRunning()) {
            this.startMusicLoop();
        }
    }

    notifyPokiGameLoadingFinishedOnce() {
        if (typeof PokiSDK === 'undefined' || !PokiSDK || typeof PokiSDK.gameLoadingFinished !== 'function') {
            return;
        }

        try {
            if (window.sessionStorage?.getItem(POKI_LOADING_FINISHED_STORAGE_KEY) === 'true') {
                return;
            }
        } catch (error) {
            // Storage can be unavailable in some embedded/browser privacy modes. Fall back to
            // the in-memory flag so the SDK is still protected during this page lifetime.
            if (window[POKI_LOADING_FINISHED_STORAGE_KEY] === true) {
                return;
            }
        }

        PokiSDK.gameLoadingFinished();

        window[POKI_LOADING_FINISHED_STORAGE_KEY] = true;
        try {
            window.sessionStorage?.setItem(POKI_LOADING_FINISHED_STORAGE_KEY, 'true');
        } catch (error) {
            // In-memory flag above is enough when sessionStorage cannot be written.
        }
    }

    muteAllAudioForAd() {
        return [
            this.audioManager,
            this.ambienceAudioManager,
            this.musicAudioManager
        ].map(mgr => {
            const wasEnabled = mgr?.isEnabled?.() ?? false;
            mgr?.setEnabled?.(false);
            return wasEnabled;
        });
    }

    restoreAllAudioAfterAd(savedStates) {
        const managers = [this.audioManager, this.ambienceAudioManager, this.musicAudioManager];
        managers.forEach((mgr, i) => {
            if (savedStates[i]) {
                mgr?.setEnabled?.(true);
            }
        });
    }

    async runPokiRewardedBreak(context = 'rewarded') {
        if (typeof PokiSDK === 'undefined' || !PokiSDK || typeof PokiSDK.rewardedBreak !== 'function') {
            return true;
        }

        this.pokiGameplayGate.addStopReason(PokiStopReasons.AD_REWARDED);
        const audioStates = this.muteAllAudioForAd();
        try {
            const rewardGranted = await PokiSDK.rewardedBreak();
            return rewardGranted === true;
        } catch (error) {
            console.warn(`[Game] Poki ${context} rewarded break failed.`, error);
            return false;
        } finally {
            this.restoreAllAudioAfterAd(audioStates);
            this.pokiGameplayGate.removeStopReason(PokiStopReasons.AD_REWARDED);
        }
    }

    async runPokiCommercialBreak(context = 'mission start') {
        console.log('[SDK POKI] Starting commercial break for context:', context);
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        const doAds = CONFIG.DO_ADS && (!isLocalhost || CONFIG.DO_ADS_LOCALHOST);
        if (!doAds) {
            return;
        }

        if (typeof PokiSDK === 'undefined' || !PokiSDK || typeof PokiSDK.commercialBreak !== 'function') {
            return;
        }

        this.pokiGameplayGate.addStopReason(PokiStopReasons.AD_COMMERCIAL);
        const audioStates = this.muteAllAudioForAd();
        try {
            await PokiSDK.commercialBreak();
        } catch (error) {
            console.warn(`[Game] Poki ${context} commercial break failed.`, error);
        } finally {
            this.restoreAllAudioAfterAd(audioStates);
            this.pokiGameplayGate.removeStopReason(PokiStopReasons.AD_COMMERCIAL);
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.pokiGameplayGate.addStopReason(PokiStopReasons.VISIBILITY_HIDDEN);
            this.handleWindowBlur();
            return;
        }
        this.pokiGameplayGate.removeStopReason(PokiStopReasons.VISIBILITY_HIDDEN);
        this.handleWindowFocus();
        this.startAmbienceLoop();
        this.startMusicLoop();
    }

    handleWindowBlur() {
        this.windowHasFocus = false;
        this.pokiGameplayGate.addStopReason(PokiStopReasons.BACKGROUND);
        if (this.windowBlurAudioStates) {
            return;
        }
        this.windowBlurAudioStates = this.muteAllAudioForAd();
    }

    handleWindowFocus() {
        this.windowHasFocus = true;
        this.pokiGameplayGate.removeStopReason(PokiStopReasons.BACKGROUND);
        if (document.hidden) {
            return;
        }
        if (this.windowBlurAudioStates) {
            this.restoreAllAudioAfterAd(this.windowBlurAudioStates);
            this.windowBlurAudioStates = null;
        }
    }

    isModalGameplayDialogVisible() {
        return this.settingsDialog?.visible === true ||
            this.skinShop?.visible === true ||
            this.missionManager?.dialog?.visible === true ||
            this.gameOverDialog?.visible === true;
    }

    getActiveModalDialog() {
        if (!this.isReady && this.loadingScreen?.visible && this.loadingScreen?.readyForGo) return this.loadingScreen;
        if (this.gameOverDialog?.visible) return this.gameOverDialog;
        if (this.missionManager?.dialog?.visible) return this.missionManager.dialog;
        if (this.settingsDialog?.visible) return this.settingsDialog;
        if (this.skinShop?.visible) return this.skinShop;
        return null;
    }

    isGameplayPaused() {
        return document.hidden === true ||
            this.windowHasFocus === false ||
            this.isModalGameplayDialogVisible();
    }

    syncGameplayPauseState() {
        const paused = this.isGameplayPaused();
        if (this.gameplayPaused === paused) {
            return paused;
        }

        this.gameplayPaused = paused;
        this.player?.setGameplayInputLocked?.(this.missionInputLocked || paused);
        this.joystick?.setGameplayInputSuppressed?.(this.missionInputLocked || paused);
        if (paused) {
            this.joystick?.clearAllInputState?.();
            this.timer.reset?.();
        }
        return paused;
    }

    openSettingsDialogFromUi() {
        if (!this.settingsDialog || this.gameOverDialog?.visible || this.missionManager?.dialog?.visible) {
            return false;
        }
        if (this.skinShop?.visible) {
            this.skinShop.hide();
        }
        this.pokiGameplayGate.addStopReason(PokiStopReasons.SETTINGS_DIALOG);
        this.settingsDialog.show();
        return true;
    }

    openSkinShopFromUi() {
        if (!this.skinShop || this.gameOverDialog?.visible || this.missionManager?.dialog?.visible) {
            return false;
        }
        if (this.settingsDialog?.visible) {
            this.settingsDialog.hide();
        }
        this.dismissSkinOnboardingArrow?.();
        this.pokiGameplayGate.addStopReason(PokiStopReasons.SKIN_SHOP_DIALOG);
        this.skinShop.show(this.coinCount);
        return true;
    }

    openDialogTriggerById(dialogId, zone = null) {
        switch (String(dialogId || '').trim().toLowerCase()) {
            case 'skins':
            case 'skindialog':
            case 'skinshop':
                return this.openSkinShopFromUi();
            case 'settings':
                return this.openSettingsDialogFromUi();
            default:
                console.warn('[ZoneDialogTrigger] Unknown dialog trigger id.', {
                    dialogId,
                    zoneId: zone?.zoneId ?? null
                });
                return false;
        }
    }

    syncZoneLayerVisibilityContext() {
        this.zoneLayerVisibilityController?.setContext?.({
            level: this.level,
            levelRenderer: this.levelRenderer,
            levelObjectManager: this.levelObjectManager,
            burnableSceneryManager: this.burnableSceneryManager
        });
    }

    setActiveZoneHideTriggers(zones = []) {
        this.zoneLayerVisibilityController?.applyZones?.(zones);
    }

    handleGlobalKeyDown(event) {
        const activeDialog = this.getActiveModalDialog();
        if (activeDialog) {
            const key = event.key;
            if (key === 'Tab') {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                activeDialog.focusDialogElement?.(event.shiftKey ? -1 : 1);
                return;
            }
            if (key === 'ArrowLeft' || key === 'ArrowUp') {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                if (activeDialog.adjustFocusedElement?.(-1) !== true) {
                    activeDialog.focusDialogElement?.(-1);
                }
                return;
            }
            if (key === 'ArrowRight' || key === 'ArrowDown') {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                if (activeDialog.adjustFocusedElement?.(1) !== true) {
                    activeDialog.focusDialogElement?.(1);
                }
                return;
            }
            if (key === ' ' || key === 'Enter') {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                activeDialog.activateFocusedElement?.();
                return;
            }
            if (key === 'Escape' || key === 'x' || key === 'X') {
                event.preventDefault?.();
                event.stopImmediatePropagation?.();
                if (activeDialog.handleUiBack?.() !== true) {
                    activeDialog.activateFocusedElement?.();
                }
            }
            return;
        }

        if (event.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
            return;
        }
        if (event.code === 'Escape' && this.windowHasFocus && !document.hidden) {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            this.openSettingsDialogFromUi();
            return;
        }
        if (event.code === 'KeyC' && this.windowHasFocus && !document.hidden) {
            event.preventDefault?.();
            event.stopImmediatePropagation?.();
            this.openSkinShopFromUi();
        }
    }

    handleGlobalUiInput() {
        const activeDialog = this.getActiveModalDialog();
        if (activeDialog) {
            if (this.joystick?.consumeUiLeftPressed?.()) {
                if (activeDialog.adjustFocusedElement?.(-1) !== true) {
                    activeDialog.focusDialogElement?.(-1);
                }
            }
            if (this.joystick?.consumeUiRightPressed?.()) {
                if (activeDialog.adjustFocusedElement?.(1) !== true) {
                    activeDialog.focusDialogElement?.(1);
                }
            }
            if (this.joystick?.consumeUiUpPressed?.()) {
                activeDialog.focusDialogElement?.(-1);
            }
            if (this.joystick?.consumeUiDownPressed?.()) {
                activeDialog.focusDialogElement?.(1);
            }
            if (this.joystick?.consumeUiAcceptPressed?.()) {
                activeDialog.activateFocusedElement?.();
            }
            if (this.joystick?.consumeUiBackPressed?.()) {
                if (activeDialog.handleUiBack?.() !== true) {
                    activeDialog.activateFocusedElement?.();
                }
            }
            if (this.joystick?.consumeMenuSettingsPressed?.()) {
                if (activeDialog.handleUiBack?.() !== true) {
                    activeDialog.activateFocusedElement?.();
                }
            }
            return;
        }

        if (document.hidden || !this.windowHasFocus) {
            return;
        }
        if (this.joystick?.consumeMenuSettingsPressed?.()) {
            this.openSettingsDialogFromUi();
            return;
        }
        if (this.joystick?.consumeMenuSkinsPressed?.()) {
            this.openSkinShopFromUi();
        }
    }

    handleGlobalPointerDown(event) {
        if (!this.topBarUI || this.gameOverDialogShown || this.missionInputLocked) {
            return;
        }

        if (this.skinShop && this.topBarUI.isSkinsButtonHit(event.clientX, event.clientY)) {
            event.preventDefault();
            event.stopPropagation();
            this.dismissSkinOnboardingArrow();
            if (this.skinShop.visible) {
                this.skinShop.hide();
            } else {
                this.openSkinShopFromUi();
            }
            return;
        }

        if (!this.settingsDialog || !this.topBarUI.isSettingsButtonHit(event.clientX, event.clientY)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        if (this.settingsDialog.visible) {
            this.settingsDialog.hide();
        } else {
            this.openSettingsDialogFromUi();
        }
    }

    async init() {
        await syncStorageKeysFromCloud([
            'dynoPlayerIdentity',
            'dynoPlayerData',
            'dynoSettings'
        ]);
        await hydratePlayerIdentityFromPlatform();
        const syncedPlayerData = loadPlayerData();
        this.coinCount = syncedPlayerData?.coins ?? this.coinCount;
        this.skinOnboardingArrowSeen = syncedPlayerData?.skinOnboardingArrowSeen === true;

        const initialMissionLevel = MISSIONS[0]?.level || CONFIG.LEVEL_MAP_URL;
        this.loadingScreen.setPhase(t('loading_phase'));
        this.loadingScreen.setStatus('');
        this.loadingScreen.setDetail('');
        this.loadingScreen.setProgress(0.06);

        const loader = new TiledLevelLoader();
        const initialLevelUrl = this.resolveMissionLevelUrl(initialMissionLevel);
        this.currentLevelKey = initialMissionLevel;
        this.currentLevelUrl = initialLevelUrl;
        this.level = await loader.load(initialLevelUrl);
        this.zoneDialogTriggerManager?.setLevel?.(this.level);
        this.levelBottomFillY = this.resolveLevelBottomFillY();
        this.rebuildLevelCollisionContourDebug();
        this.rebuildWaterPolygonDebug();
        this.loadingScreen.setProgress(LOAD_PROGRESS_AFTER_LEVEL_DATA);
        this.loadingScreen.setDetail('');

        this.skyBackground = new SkyBackground(this.scene, this.camera, {
            colorTop: CONFIG.COLORS.SKY_TOP,
            colorBottom: CONFIG.COLORS.SKY_BOTTOM,
            width: this.level.width * this.level.tileWidth,
            height: CONFIG.LEVEL_HEIGHT,
            bottomY: this.level.worldOriginY,
            z: -900
        });
        this.createBelowLevelBackground();
        this.createAboveLevelBackground();

        const skyTopY = this.skyBackground.getTopY();
        const flightCeilingY = Math.max(
            this.level.worldOriginY,
            skyTopY - CONFIG.flightCeilingOffset
        );
        this.level.flightCeilingY = flightCeilingY;
        this.level.flightHeight = flightCeilingY - this.level.worldOriginY;
        CONFIG.LEVEL_FLIGHT_HEIGHT = flightCeilingY;

        const trackedAssetUrls = new Set([
            ...collectLevelTextureUrls(this.level),
            ...(shouldCreateParallaxBackground()
                ? PARALLAX_LAYER_CONFIG.map((layer) => resolveAssetUrl(layer.texture))
                : []),
            ...PLAYER_PRELOAD_ASSET_URLS.map((url) => resolveAssetUrl(url)),
            ...TOP_BAR_PRELOAD_ASSET_URLS.map((url) => resolveAssetUrl(url)),
            ...[...LevelObjectManager.collectModelUrlsForLevel(this.level)].map((url) => resolveAssetUrl(url)),
            ...[...BurnableSceneryManager.collectTextureUrlsForLevel(this.level, this.currentLevelUrl)].map((url) => resolveAssetUrl(url))
        ]);
        const assetLoadingSession = createAssetLoadingSession(this.loadingScreen, trackedAssetUrls, {
            statusText: ''
        });

        this.levelObjectManager = new LevelObjectManager(this.scene, this.level, {
            loadingManager: assetLoadingSession.loadingManager,
            audioManager: this.audioManager,
            levelUrl: this.currentLevelUrl,
            onRingPassed: (ring) => this.addRingProgress(1, ring),
            onObjectKilled: (obj) => this.addCoins(obj),
            onCollectiblePickup: (type, amount, worldPos) => this.collectPickup(type, amount, worldPos)
        });

        if (shouldCreateParallaxBackground()) {
            this.parallaxBackground = new ParallaxBackground(
                this.scene,
                this.camera,
                PARALLAX_LAYER_CONFIG,
                { loadingManager: assetLoadingSession.loadingManager }
            );
        }

        this.levelRenderer = new LevelRenderer(this.scene, this.level, {
            loadingManager: assetLoadingSession.loadingManager,
            shouldRenderObject: (object) => !this.levelObjectManager?.shouldManageObjectMarker(object)
        });
        this.levelObjectManager.setProjectileRenderBand(
            this.levelRenderer.getPreGameplayProjectileBand()
        );
        this.burnableSceneryManager = new BurnableSceneryManager(this.scene, this.level, {
            loadingManager: assetLoadingSession.loadingManager,
            audioManager: this.audioManager,
            renderer: this.renderer,
            levelUrl: this.currentLevelUrl,
            renderOrder: this.levelRenderer.getDynoRenderOrder() - 0.25,
            layerDepth: this.levelRenderer.getPreGameplayProjectileBand().depth
        });
        this.player = new Player(this.scene, this.level, this.joystick, {
            loadingManager: assetLoadingSession.loadingManager,
            levelObjectManager: this.levelObjectManager,
            audioManager: this.audioManager
        });
        this.levelObjectManager.setDynoTarget(this.player);
        this.levelObjectManager.onFaintCrashExplosion = (position, faintConfig) => {
            this.triggerFaintCrashInfernoShockwave(position, faintConfig);
        };
        this.player.setRenderOrder(this.levelRenderer.getDynoRenderOrder());
        this.topBarUI = new TopBarUI({
            loadingManager: assetLoadingSession.loadingManager
        });
        this.gameOverDialog = new GameOverDialog({
            onRetry: () => this.retryLevel(),
            onRevive: () => this.revivePlayer()
        });
        this.settingsDialog = new SettingsDialog({
            sfxEnabled: this.audioManager.isEnabled(),
            ambienceEnabled: this.ambienceAudioManager.isEnabled(),
            musicEnabled: this.musicAudioManager.isEnabled(),
            qualityMode: this.performanceModeState.qualityMode,
            qualitySystemEnabled: isQualitySystemEnabled(),
            onSfxEnabledChange: (enabled) => {
                this.audioManager.setEnabled(enabled);
            },
            onAmbienceEnabledChange: (enabled) => {
                this.setAmbienceEnabled(enabled);
            },
            onMusicEnabledChange: (enabled) => {
                this.setMusicEnabled(enabled);
            },
            onQualityModeChange: (mode) => {
                this.setQualityMode(mode);
            },
            onRestartMissions: () => {
                this.missionManager?.resetMissionProgress();
                this.softReset();
            },
            onResetAll: () => {
                const keys = [
                    'dynoPlayerData',
                    'dynoMissionState',
                    'dynoRaceTimes',
                    'dynoMyLeaderboardEntries',
                    'dynoPlayerIdentity',
                    'dynoSettings'
                ];
                keys.forEach(k => { try { localStorage.removeItem(k); } catch { /* ignore */ } });
                this.softReset();
            },
            onHide: () => {
                this.pokiGameplayGate.removeStopReason(PokiStopReasons.SETTINGS_DIALOG);
                this.runPokiCommercialBreak('settings close');
            }
        });
        this.skinShop = new DynoSkinShop({
            getCoinCount: () => this.coinCount,
            setCoinCount: (n) => {
                this.coinCount = n;
                this.topBarUI?.setCoinCount?.(n);
                this.updateSkinHudHints();
                // Persist updated coins immediately.
                const data = loadPlayerData() ?? {};
                savePlayerData({ ...data, coins: n });
            },
            onEquip: (skinId, texturePath) => {
                this.player?.setDynoTexture?.(texturePath);
            },
            onWatchAd: () => this.runPokiRewardedBreak('skin shop coins'),
            onHide: () => {
                this.pokiGameplayGate.removeStopReason(PokiStopReasons.SKIN_SHOP_DIALOG);
                this.runPokiCommercialBreak('skin shop close');
            }
        });
        this.skinShop.preloadPreviewAssets?.();
        // Apply the equipped skin from saved data on startup.
        const equippedTexture = this.skinShop.getTexturePath(this.skinShop.getEquippedSkinId());
        if (equippedTexture) this.player?.setDynoTexture?.(equippedTexture);
        // Re-sync coinCount from the shop's persisted data — the shop is the single
        // source of truth for coins so the HUD always matches what the shop stored.
        this.coinCount = this.skinShop.getPersistedCoins();
        this.sideSpeedBoostButton = new SideSpeedBoostButton({
            durationSeconds: this.getRewardedSpeedBoostDuration(),
            onPress: () => this.activateRewardedSpeedBoost(),
            domElement: this.renderer.domElement
        });
        if (!CONFIG.disableUI && CONFIG.FURY?.enabled !== false) {
            const viewport = this.getViewportDimensions();
            this.furyBar = new FuryBar({
                onPress: () => this.tryTriggerFury(),
                domElement: this.renderer.domElement,
                joystick: this.joystick
            });
            this.furyBar.layout(viewport.width, viewport.height);
        }
        this.missionManager = new MissionManager(this, MISSIONS, {
            getCoinCount: () => this.coinCount,
            setCoinCount: (n, opts) => {
                this.coinCount = n;
                if (!opts?.skipHud) this.topBarUI?.setCoinCount?.(n);
                const data = loadPlayerData() || {};
                savePlayerData({ ...data, coins: n });
                this.skinShop?.syncCoins?.(n);
                this.updateSkinHudHints();
            },
            onWatchAd: () => this.runPokiRewardedBreak('mission coins'),
            spawnCoinFly: (screenX, screenY, count, perCoin) => this._spawnCoinFlyFromScreen(screenX, screenY, count, perCoin)
        });
        this.levelObjectManager.setMissionManager(this.missionManager);
        this.activeMissionUI = new ActiveMissionUI({
            domElement: this.renderer.domElement,
            game: this
        });
        this.topBarUI.setHealthProgress(this.player.getHealthProgress());
        this.topBarUI.setEnergyProgress(this.player.getEnergyProgress());
        this.topBarUI.layout(window.innerWidth, window.innerHeight);
        this.topBarUI.setCoinCount(this.coinCount);
        this.updateSkinHudHints();

        const levelObjectsReady = this.levelObjectManager.loadFromLevel();
        const burnableSceneryReady = this.burnableSceneryManager.loadFromLevel();
        await assetLoadingSession.done;
        await levelObjectsReady;
        await burnableSceneryReady;
        this.syncZoneLayerVisibilityContext();
        this.levelObjectManager.attachCalloutsToLayerGroup(this.levelRenderer.getLayerGroupByName('Gameplay'));
        this.rebuildMissionZoneDebug();
        this.notifyPokiGameLoadingFinishedOnce();
        this.loadingScreen.setProgress(1);
        this.renderFrame(0);
        this.startBackgroundLevelWarmup(this.levelObjectManager);
        this.pokiGameplayGate.setSdk(typeof PokiSDK !== 'undefined' ? PokiSDK : null);
        const skipGoButton = CONFIG.autoStartOnLoad || this.pokiGameplayGate.hasInteracted();
        if (skipGoButton) {
            this.loadingScreen.hide();
            if (!this.pokiGameplayGate.hasInteracted()) {
                this.pokiGameplayGate.setInteractionGate(this._interactionPromise);
            }
        } else {
            this.loadingScreen.showReady();
            this.startPreStartRenderLoop();
            await Promise.race([this.loadingScreen.waitForGo(), this._interactionPromise]);
            this.stopPreStartRenderLoop();
            this.loadingScreen.hide();
        }
        this.pokiGameplayGate.startSession();
        this.startAmbienceLoop();
        this.startMusicLoop();
        this.isReady = true;
        this.timer.reset?.();
        this.animate();
        await this.missionManager.start();
    }

    resolveMissionLevelUrl(levelValue) {
        const configuredUrl = MISSION_LEVELS[levelValue] || levelValue || CONFIG.LEVEL_MAP_URL;
        return resolveAssetUrl(configuredUrl);
    }

    applyLoadedMissionLevel(level, levelValue, levelUrl) {
        this.zoneLayerVisibilityController?.setContext?.({});
        this.level = level;
        this.zoneDialogTriggerManager?.setLevel?.(level);
        this.currentLevelKey = levelValue;
        this.currentLevelUrl = levelUrl;
        this.levelBottomFillY = this.resolveLevelBottomFillY();
        this.rebuildLevelCollisionContourDebug();
        this.rebuildWaterPolygonDebug();

        this.skyBackground?.dispose?.();
        this.skyBackground = new SkyBackground(this.scene, this.camera, {
            colorTop: CONFIG.COLORS.SKY_TOP,
            colorBottom: CONFIG.COLORS.SKY_BOTTOM,
            width: this.level.width * this.level.tileWidth,
            height: CONFIG.LEVEL_HEIGHT,
            bottomY: this.level.worldOriginY,
            z: -900
        });
        this.createBelowLevelBackground();
        this.createAboveLevelBackground();

        const skyTopY = this.skyBackground.getTopY();
        const flightCeilingY = Math.max(
            this.level.worldOriginY,
            skyTopY - CONFIG.flightCeilingOffset
        );
        this.level.flightCeilingY = flightCeilingY;
        this.level.flightHeight = flightCeilingY - this.level.worldOriginY;
        CONFIG.LEVEL_FLIGHT_HEIGHT = flightCeilingY;
    }

    async rebuildForMissionLevel(level, levelValue, levelUrl) {
        this.setMissionInputLocked(true);
        this.activeMissionUI?.setMission?.(null);
        this.gameOverDialog?.hide?.();
        this.gameOverDialogShown = false;
        this.currentPickupTarget = null;
        this.pickupDropButtonEnabled = false;
        this.rewardedSpeedBoostRemaining = 0;
        this.player?.setRewardedSpeedBoostActive?.(false);
        this.joystick?.setPickupDropEnabled?.(false);
        this.joystick?.setFireEnabled?.(false);

        // Build new managers into temp vars so the old level keeps rendering while assets load.
        const trackedAssetUrls = new Set([
            ...collectLevelTextureUrls(level),
            ...[...LevelObjectManager.collectModelUrlsForLevel(level)].map((url) => resolveAssetUrl(url)),
            ...[...BurnableSceneryManager.collectTextureUrlsForLevel(level, levelUrl)].map((url) => resolveAssetUrl(url))
        ]);
        const assetLoadingSession = createAssetLoadingSession(this.loadingScreen, trackedAssetUrls, {
            statusText: ''
        });

        const nextLevelObjectManager = new LevelObjectManager(this.scene, level, {
            loadingManager: assetLoadingSession.loadingManager,
            audioManager: this.audioManager,
            levelUrl,
            onRingPassed: (ring) => this.addRingProgress(1, ring),
            onObjectKilled: (obj) => this.addCoins(obj),
            onCollectiblePickup: (type, amount, worldPos) => this.collectPickup(type, amount, worldPos)
        });
        const nextLevelRenderer = new LevelRenderer(this.scene, level, {
            loadingManager: assetLoadingSession.loadingManager,
            shouldRenderObject: (object) => !nextLevelObjectManager?.shouldManageObjectMarker(object)
        });
        nextLevelObjectManager.setProjectileRenderBand(
            nextLevelRenderer.getPreGameplayProjectileBand()
        );
        nextLevelObjectManager.setDynoTarget(this.player);
        const nextBurnableSceneryManager = new BurnableSceneryManager(this.scene, level, {
            loadingManager: assetLoadingSession.loadingManager,
            audioManager: this.audioManager,
            renderer: this.renderer,
            levelUrl,
            renderOrder: nextLevelRenderer.getDynoRenderOrder() - 0.25,
            layerDepth: nextLevelRenderer.getPreGameplayProjectileBand().depth
        });

        const levelObjectsReady = nextLevelObjectManager.loadFromLevel();
        const burnableSceneryReady = nextBurnableSceneryManager.loadFromLevel();
        await assetLoadingSession.done;
        await levelObjectsReady;
        await burnableSceneryReady;

        // All assets downloaded and physics bodies built — set 100% before swapping.
        this.loadingScreen?.setProgress?.(1);

        // Assets ready — dispose old managers and swap in the new level atomically.
        this.levelObjectManager?.dispose?.();
        this.burnableSceneryManager?.dispose?.();
        this.levelRenderer?.dispose?.();

        this.player?.resetForLevel?.(level);
        this.applyLoadedMissionLevel(level, levelValue, levelUrl);

        this.levelObjectManager = nextLevelObjectManager;
        this.burnableSceneryManager = nextBurnableSceneryManager;
        this.levelRenderer = nextLevelRenderer;
        this.syncZoneLayerVisibilityContext();
        if (this.missionManager) {
            this.levelObjectManager.setMissionManager(this.missionManager);
        }
        this.levelObjectManager.onFaintCrashExplosion = (position, faintConfig) => {
            this.triggerFaintCrashInfernoShockwave(position, faintConfig);
        };

        if (this.player) {
            this.player.ground = this.level;
            this.player.levelObjectManager = this.levelObjectManager;
            this.player.setRenderOrder(this.levelRenderer.getDynoRenderOrder());
        }
        this.levelObjectManager.attachCalloutsToLayerGroup(this.levelRenderer.getLayerGroupByName('Gameplay'));
        this.rebuildMissionZoneDebug();

        this.initializeDynamicCameraState();
        this.updateCameraFollow();
        this.renderFrame(0);
        this.startBackgroundLevelWarmup(this.levelObjectManager);
    }

    async loadMissionLevel(levelValue, options = {}) {
        const nextLevelUrl = this.resolveMissionLevelUrl(levelValue);
        const forceReload = options.forceReload === true;
        if (!forceReload && this.level && this.currentLevelUrl === nextLevelUrl) {
            return;
        }

        const shouldShowOverlay = this.isReady === true;
        if (shouldShowOverlay) {
            this.showMissionLoadOverlay({ isReload: forceReload, levelValue });
            await this.waitForNextFrame();
        }

        const loader = new TiledLevelLoader();
        try {
            const nextLevel = await loader.load(nextLevelUrl);
            this.loadingScreen?.setProgress?.(LOAD_PROGRESS_AFTER_LEVEL_DATA);
            this.loadingScreen?.setDetail?.('');
            await this.rebuildForMissionLevel(nextLevel, levelValue, nextLevelUrl);
            if (shouldShowOverlay) {
                await this.hideMissionLoadOverlay(levelValue);
            }
            console.info(`[Mission] Loaded level "${levelValue}" for mission${forceReload ? ' (force reload)' : ''}.`);
        } catch (error) {
            if (shouldShowOverlay) {
                this.loadingScreen?.showError?.('Open the console for more details.');
            }
            throw error;
        }
    }

    setMissionInputLocked(isLocked) {
        this.missionInputLocked = isLocked === true;
        this.player?.setGameplayInputLocked?.(this.missionInputLocked || this.gameplayPaused);
        this.joystick?.setGameplayInputSuppressed?.(this.missionInputLocked || this.gameplayPaused);
        if (this.missionInputLocked) {
            this.joystick?.clearAllInputState?.();
        }
    }

    setTimelineCameraControlled(isControlled) {
        this.timelineCameraControlled = isControlled === true;
        if (!this.timelineCameraControlled) {
            this.updateCameraFollow();
        }
    }

    setTimelineAnimationControlled(isControlled) {
        this.player?.setTimelineAnimationControlled?.(isControlled === true);
    }

    setSequencePresentationActive(isActive) {
        this.sequencePresentationActive = isActive === true;
        this.cinematicOverlay?.setActive?.(this.sequencePresentationActive);
        this.activeMissionUI?.setUiVisible?.(!this.sequencePresentationActive);
        this.sideSpeedBoostButton?.setUiVisible?.(!this.sequencePresentationActive);
        this.joystick?.setUiVisible?.(!this.sequencePresentationActive);
    }

    setTimelineSkipHandler(handler) {
        this.cinematicOverlay?.setSkipHandler?.(handler);
    }

    getMissionZones() {
        return this.level?.getMissionZones?.() || [];
    }

    getMissionZoneById(id) {
        return this.level?.getMissionZoneById?.(id) || null;
    }

    getMissionZonesByType(type) {
        return this.level?.getMissionZonesByType?.(type) || [];
    }

    getDialogTriggerZones() {
        return this.level?.getDialogTriggerZones?.() || [];
    }

    getZoneTriggerZones() {
        return this.level?.getZoneTriggerZones?.() || [];
    }

    getSkinDialogZoneTargetPoint() {
        const zone = this.getDialogTriggerZones().find((entry) => {
            const dialogId = String(entry?.dialogId || '').trim().toLowerCase();
            return dialogId === 'skins' || dialogId === 'skindialog' || dialogId === 'skinshop';
        });
        if (!zone || !Number.isFinite(zone.centerX) || !Number.isFinite(zone.centerY)) {
            return null;
        }
        return { x: zone.centerX, y: zone.centerY };
    }

    getRingProgressRatio() {
        return THREE.MathUtils.clamp(
            this.ringProgressCount / Math.max(this.ringProgressGoal, 1),
            0,
            1
        );
    }

    addRingProgress(amount = 1, ring = null) {
        const nextValue = this.ringProgressCount + Math.max(0, Math.floor(Number.isFinite(amount) ? amount : 1));
        this.ringProgressCount = Math.min(nextValue, this.ringProgressGoal);
        this.audioManager.play('ring', { volume: 0.8 });
        ring?.triggerPassPulse?.();
    }

    addCoins(killedObject) {
        const reward = killedObject?.config?.coinValue;
        const amount = Number.isFinite(reward) ? Math.max(0, Math.floor(reward)) : 1;
        if (amount <= 0) return;

        this.coinCount += amount;
        this._persistCoins();

        // Try to get the object's world position for a fly animation.
        const pos = killedObject?.container?.position ?? killedObject?.position ?? null;
        if (pos && this.camera && this.topBarUI) {
            const ndc = new THREE.Vector3(pos.x, pos.y, pos.z ?? 0).project(this.camera);
            const onScreen = ndc.x >= -1 && ndc.x <= 1 && ndc.y >= -1 && ndc.y <= 1;
            if (onScreen) {
                const screenX = (ndc.x * 0.5 + 0.5) * window.innerWidth;
                const screenY = (1 - (ndc.y * 0.5 + 0.5)) * window.innerHeight;
                this._spawnCoinFlyFromScreen(screenX, screenY, Math.min(amount, 6), amount);
                return;
            }
        }

        // Off-screen or no position — update HUD directly.
        this.topBarUI?.setCoinCount?.(this.coinCount);
        this.updateSkinHudHints();
    }

    _persistCoins() {
        const data = loadPlayerData() ?? {};
        savePlayerData({ ...data, coins: this.coinCount });
        this.skinShop?.syncCoins(this.coinCount);
        this.updateSkinHudHints();
    }

    updateSkinAffordabilityBadge() {
        this.updateSkinHudHints();
    }

    updateSkinHudHints() {
        const hasAffordableSkin = this.skinShop?.hasAffordableLockedSkin?.(this.coinCount) === true;
        this.hasAffordableSkinAvailable = hasAffordableSkin;
        this.topBarUI?.setSkinsAffordableBadgeVisible?.(
            hasAffordableSkin
        );
        this.topBarUI?.setSkinsOnboardingArrowVisible?.(
            hasAffordableSkin && this.skinOnboardingArrowSeen !== true
        );
    }

    dismissSkinOnboardingArrow() {
        if (this.skinOnboardingArrowSeen) {
            return;
        }

        this.skinOnboardingArrowSeen = true;
        this.topBarUI?.setSkinsOnboardingArrowVisible?.(false);
        const data = loadPlayerData() ?? {};
        savePlayerData({ ...data, skinOnboardingArrowSeen: true });
    }

    collectPickup(type, amount, worldPosition) {
        const soundKey = { health: 'pickupHealth', coin: 'pickupCoin', energy: 'pickupEnergy' }[type];
        if (soundKey) this.audioManager.play(soundKey, { volume: 0.7 });
        this._spawnPickupFlyAnimation(type, amount, worldPosition);
    }

    _applyPickupAmount(type, amount) {
        const player = this.player;
        switch (type) {
            case 'health':
                if (player) {
                    const max = player.maxHealthValue ?? 0;
                    player.currentHealthValue = THREE.MathUtils.clamp(
                        (player.currentHealthValue ?? 0) + amount, 0, max
                    );
                }
                break;
            case 'energy':
                if (player) {
                    const max = player.maxEnergyValue ?? 0;
                    player.currentEnergyValue = THREE.MathUtils.clamp(
                        (player.currentEnergyValue ?? 0) + amount, 0, max
                    );
                }
                break;
            case 'coin':
                this.coinCount += amount;
                this.topBarUI?.addCoinCountVisual?.(amount);
                this._persistCoins();
                break;
        }
    }

    _spawnPickupFlyAnimation(type, amount, worldPosition) {
        if (!this.camera || !worldPosition || !this.topBarUI) {
            this._applyPickupAmount(type, amount);
            return;
        }

        const hudPos = this.topBarUI.getIndicatorScreenPosition(type);
        if (!hudPos) {
            this._applyPickupAmount(type, amount);
            return;
        }

        // Project 3D world position to CSS screen space.
        const ndc = worldPosition.clone().project(this.camera);
        const screenX = (ndc.x * 0.5 + 0.5) * window.innerWidth;
        const screenY = (1 - (ndc.y * 0.5 + 0.5)) * window.innerHeight;

        // Icon images per type — reuse the HUD asset paths.
        const iconSrc = {
            health: './gfx/UI/health_fill.webp',
            energy: './gfx/UI/energy_fill.webp',
            coin:   './gfx/UI/coin.webp'
        }[type];

        const size = 36;
        const el = document.createElement('img');
        el.src = iconSrc || '';
        el.style.cssText = [
            'position:fixed',
            'pointer-events:none',
            'z-index:9999',
            `width:${size}px`,
            `height:${size}px`,
            `left:${screenX - size * 0.5}px`,
            `top:${screenY - size * 0.5}px`,
            'transition:none',
            'will-change:transform,opacity'
        ].join(';');
        document.body.appendChild(el);

        const duration = 550;
        const startTime = performance.now();
        const startX = screenX;
        const startY = screenY;
        const endX = hudPos.x;
        const endY = hudPos.y;
        let applied = false;

        const animate = (now) => {
            const t = Math.min((now - startTime) / duration, 1);
            const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
            const cx = startX + (endX - startX) * ease;
            const cy = startY + (endY - startY) * ease;
            const scale = 1 + Math.sin(ease * Math.PI) * 0.4;
            const opacity = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
            el.style.left = `${cx - size * 0.5}px`;
            el.style.top = `${cy - size * 0.5}px`;
            el.style.transform = `scale(${scale})`;
            el.style.opacity = String(opacity);
            if (!applied && t >= 1) {
                applied = true;
                this._applyPickupAmount(type, amount);
                el.remove();
            } else if (t < 1) {
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);
    }

    _spawnCoinFlyFromScreen(screenX, screenY, count = 6, perCoin = 0) {
        if (!this.topBarUI) return;
        const hudPos = this.topBarUI.getIndicatorScreenPosition('coin');
        if (!hudPos) return;

        const SPREAD = 28;
        const iconSrc = './gfx/UI/coin.webp';
        const size = 36;
        // perCoin is the TOTAL amount to distribute across all coins.
        let visualRemaining = Math.round(perCoin);

        for (let i = 0; i < count; i++) {
            const delay = i * 60;
            const ox = (Math.random() - 0.5) * SPREAD * 2;
            const oy = (Math.random() - 0.5) * SPREAD * 2;
            const startX = screenX + ox;
            const startY = screenY + oy;
            // Each coin awards 1 visual unit; last coin gets any remainder.
            const coinsLeft = count - i;
            const visualThisCoin = perCoin > 0
                ? (i === count - 1 ? visualRemaining : Math.round(visualRemaining / coinsLeft))
                : 0;
            if (perCoin > 0) visualRemaining -= visualThisCoin;

            setTimeout(() => {
                const el = document.createElement('img');
                el.src = iconSrc;
                el.style.cssText = [
                    'position:fixed',
                    'pointer-events:none',
                    'z-index:9999',
                    `width:${size}px`,
                    `height:${size}px`,
                    `left:${startX - size * 0.5}px`,
                    `top:${startY - size * 0.5}px`,
                    'will-change:transform,opacity'
                ].join(';');
                document.body.appendChild(el);

                const duration = 520 + Math.random() * 120;
                const t0 = performance.now();
                const endX = hudPos.x;
                const endY = hudPos.y;
                let landed = false;

                const tick = (now) => {
                    const p = Math.min((now - t0) / duration, 1);
                    const ease = p < 0.5 ? 2 * p * p : -1 + (4 - 2 * p) * p;
                    el.style.left = `${startX + (endX - startX) * ease - size * 0.5}px`;
                    el.style.top  = `${startY + (endY - startY) * ease - size * 0.5}px`;
                    el.style.transform = `scale(${1 + Math.sin(ease * Math.PI) * 0.35})`;
                    el.style.opacity = p < 0.8 ? '1' : String(1 - (p - 0.8) / 0.2);
                    if (p < 1) {
                        requestAnimationFrame(tick);
                    } else {
                        el.remove();
                        if (!landed && visualThisCoin > 0) {
                            landed = true;
                            this.topBarUI?.addCoinCountVisual?.(visualThisCoin);
                        }
                    }
                };
                requestAnimationFrame(tick);
            }, delay);
        }
    }

    getMissionZoneById(zoneId) {
        const zone = this.level?.getMissionZoneById?.(zoneId);
        if (zone) return zone;

        // Fallback: synthesize a zone from the missioncallout object whose missionId matches zoneId.
        const callout = this.levelObjectManager?.objects?.find(
            (obj) => obj?.type === 'missioncallout' && obj?.missionId === zoneId
        );
        if (!callout?.container) return null;

        const cx = callout.container.position.x;
        const cy = callout.container.position.y;
        const calloutCfg = CONFIG?.LEVEL_OBJECT_TYPES?.missioncallout;
        const rx = calloutCfg?.landingZoneRadiusX ?? calloutCfg?.landingZoneRadius ?? 10;
        const ry = calloutCfg?.landingZoneRadiusY ?? calloutCfg?.landingZoneRadius ?? 6;
        return { zoneId, left: cx - rx, right: cx + rx, bottom: cy - ry, top: cy + ry };
    }

    setActiveMission(mission) {
        this.activeMissionUI?.setMission?.(mission);
        this.setMissionDisabledButtons(mission?.disabledButtons || mission?.params?.disabledButtons || []);
        this.updatePickupDropButtonState();
        this.updateFireButtonState();
        this.updateSpeedButtonState();
    }

    setMissionDisabledButtons(disabledButtons = []) {
        const normalized = new Set(
            (Array.isArray(disabledButtons) ? disabledButtons : [])
                .map((button) => String(button || '').trim().toLowerCase())
                .map((button) => {
                    if (button === 'grab' || button === 'lift' || button === 'grab/lift' || button === 'pickupdrop') {
                        return 'pickup';
                    }
                    return button;
                })
                .filter(Boolean)
        );
        this.missionDisabledButtons = normalized;
    }

    isMissionButtonDisabled(buttonName) {
        const normalized = String(buttonName || '').trim().toLowerCase();
        if (!normalized) {
            return false;
        }

        if (normalized === 'grab' || normalized === 'lift' || normalized === 'grab/lift' || normalized === 'pickupdrop') {
            return this.missionDisabledButtons.has('pickup');
        }

        return this.missionDisabledButtons.has(normalized);
    }

    handlePickupDropInput() {
        if (this.gameplayPaused || this.missionInputLocked) {
            return;
        }
        if (this.player?.isAutoInteractionActive?.()) {
            return;
        }

        if (!this.player || !this.levelObjectManager || !this.joystick.consumePickupDropPressed()) {
            return;
        }

        if (this.player.hasAttachedObject?.()) {
            this.player.dropCarriedObject();
            return;
        }

        if (this.player.isDraggingObject?.()) {
            this.player.releaseDraggedObject();
            return;
        }

        const nearestObject = this.currentPickupTarget;
        if (!this.pickupDropButtonEnabled || !nearestObject || !this.player.canUsePickupDropButton(nearestObject)) {
            return;
        }

        const didBeginInteraction = this.player.canPickupObject(nearestObject)
            ? this.player.beginAutoPickup(nearestObject)
            : this.player.beginAutoDrag(nearestObject);

        if (didBeginInteraction) {
            this.currentPickupTarget = null;
            this.pickupDropButtonEnabled = false;
            this.joystick.setPickupDropEnabled(false);
        }
    }

    findCurrentPickupTarget() {
        if (!this.player || !this.levelObjectManager) {
            return null;
        }

        const airborne = this.player.isAirbornePickupEligible?.();
        const pickupRadius = airborne ? this.getHoverPickupRadius() : this.getGroundPickupDistance();
        const useGrabPoints = !airborne;
        return this.levelObjectManager.findNearestInteractableObject(
            this.player.position,
            pickupRadius,
            this.player,
            useGrabPoints
        );
    }

    getHoverPickupRadius() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.hoverPickupRadius)
            ? CONFIG.LEVEL_OBJECTS.hoverPickupRadius
            : (Number.isFinite(CONFIG.LEVEL_OBJECTS?.pickupRadius) ? CONFIG.LEVEL_OBJECTS.pickupRadius : 15);
    }

    getGroundPickupDistance() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.groundPickupDistance)
            ? CONFIG.LEVEL_OBJECTS.groundPickupDistance
            : (Number.isFinite(CONFIG.LEVEL_OBJECTS?.pickupRadius) ? CONFIG.LEVEL_OBJECTS.pickupRadius : 5.5);
    }

    updatePickupDropButtonState() {
        if (!this.player || !this.joystick) {
            return;
        }

        if (this.isMissionButtonDisabled('pickup')) {
            this.currentPickupTarget = null;
            this.pickupDropButtonEnabled = false;
            this.joystick.setPickupDropMode('lift');
            this.joystick.setPickupDropEnabled(false);
            this.joystick.setDragDirectionHint?.(null);
            return;
        }

        if (this.player.isAutoInteractionActive?.()) {
            // While auto alignment is moving the dyno, disable the button visually and functionally
            // so repeated presses cannot start another pickup/drop action mid-alignment.
            this.currentPickupTarget = null;
            this.pickupDropButtonEnabled = false;
            this.joystick.setPickupDropMode(
                this.player.isAutoDragActive?.() ? 'drag' : 'lift'
            );
            this.joystick.setPickupDropEnabled(false);
            this.joystick.setDragDirectionHint?.(null);
            return;
        }

        if (this.player.isDraggingObject?.()) {
            this.currentPickupTarget = null;
            this.pickupDropButtonEnabled = true;
            this.joystick.setPickupDropMode('drag');
            this.joystick.setPickupDropEnabled(true);
            // Show the allowed drag direction only for ground pull-dragging (not mouth drag).
            if (this.player.isPullDraggingObject?.()) {
                const dragFacing = this.player.getDragFacingDirection?.() ?? null;
                this.joystick.setDragDirectionHint?.(dragFacing !== null ? -dragFacing : null);
            } else {
                this.joystick.setDragDirectionHint?.(null);
            }
            return;
        }

        if (this.player.hasAttachedObject?.()) {
            this.currentPickupTarget = null;
            this.pickupDropButtonEnabled = true;
            this.joystick.setPickupDropMode('lift');
            this.joystick.setPickupDropEnabled(true);
            this.joystick.setDragDirectionHint?.(null);
            return;
        }

        const nearestObject = this.findCurrentPickupTarget();
        const canLift = this.player.canPickupObject?.(nearestObject) === true;
        // Use skipMouthSideCheck so the drag icon shows even when the dyno needs to walk back
        // to the grab point — matches the same relaxed check used by canUsePickupDropButton.
        const canDrag = this.player.canDragObject?.(nearestObject, { skipMouthSideCheck: true }) === true;
        const isEnabled = this.player.canUsePickupDropButton(nearestObject);

        this.currentPickupTarget = nearestObject;
        this.pickupDropButtonEnabled = isEnabled;
        this.joystick.setPickupDropMode(canLift ? 'lift' : (canDrag ? 'drag' : 'lift'));
        this.joystick.setPickupDropEnabled(isEnabled);
        this.joystick.setDragDirectionHint?.(null);
    }

    updateFireButtonState() {
        if (!this.joystick?.setFireEnabled) {
            return;
        }

        this.joystick.setFireEnabled(false);
    }

    updateSpeedButtonState() {
        if (!this.joystick?.setSpeedEnabled) {
            return;
        }

        this.joystick.setSpeedEnabled(!this.isMissionButtonDisabled('speed'));
    }

    async retryLevel() {
        await this.runPokiCommercialBreak('game over retry');
        this.softReset();
    }

    async revivePlayer() {
        if (this.reviveRewardInProgress) {
            return;
        }

        this.reviveRewardInProgress = true;
        this.gameOverDialog?.setRevivePending?.(true);

        const rewardGranted = await this.runPokiRewardedBreak('revive');
        if (!rewardGranted) {
            this.reviveRewardInProgress = false;
            this.gameOverDialog?.setRevivePending?.(false);
            return;
        }

        if (!this.player?.startReviveFlow?.()) {
            this.reviveRewardInProgress = false;
            this.gameOverDialog?.setRevivePending?.(false);
            return;
        }

        this.reviveRewardInProgress = false;
        this.gameOverDialog?.hide();
        this.gameOverDialog?.setRevivePending?.(false);
        this.gameOverDialogShown = false;
        this.joystick?.setPickupDropEnabled?.(false);
        this.joystick?.setFireEnabled?.(false);
    }

    getRewardedSpeedBoostDuration() {
        return Math.max(
            0,
            Number.isFinite(CONFIG.REWARDED_SPEED_BOOST?.durationSeconds)
                ? CONFIG.REWARDED_SPEED_BOOST.durationSeconds
                : 120
        );
    }

    async activateRewardedSpeedBoost() {
        if (this.speedBoostRewardInProgress || this.player?.isDead?.()) {
            return;
        }

        this.speedBoostRewardInProgress = true;
        this.updateRewardedSpeedBoostUI();

        const rewardGranted = await this.runPokiRewardedBreak('speed boost');
        this.speedBoostRewardInProgress = false;

        if (!rewardGranted || this.player?.isDead?.()) {
            this.updateRewardedSpeedBoostUI();
            return;
        }

        this.rewardedSpeedBoostRemaining += this.getRewardedSpeedBoostDuration();
        this.player?.setRewardedSpeedBoostActive?.(this.rewardedSpeedBoostRemaining > 0);
        this.updateRewardedSpeedBoostUI();
    }

    updateRewardedSpeedBoost(dt = 0) {
        const duration = this.getRewardedSpeedBoostDuration();
        const energyDepletedCount = this.player?.getEnergyDepletedCount?.() ?? 0;
        const speedUnlockCount = CONFIG.REWARDED_SPEED_BOOST?.unlockDrainCount ?? 3;
        if (!this.sideSpeedBoostUnlocked && energyDepletedCount >= speedUnlockCount) {
            this.sideSpeedBoostUnlocked = true;
        }

        if (this.player?.isDead?.()) {
            this.rewardedSpeedBoostRemaining = 0;
            this.player?.setRewardedSpeedBoostActive?.(false);
            this.sideSpeedBoostButton?.update({
                isActive: false,
                isPending: this.speedBoostRewardInProgress,
                remainingSeconds: duration,
                durationSeconds: duration,
                isVisible: false,
                isUnlocked: this.sideSpeedBoostUnlocked,
                dt
            });
            return;
        }

        if (this.rewardedSpeedBoostRemaining > 0 && Number.isFinite(dt) && dt > 0) {
            this.rewardedSpeedBoostRemaining = Math.max(0, this.rewardedSpeedBoostRemaining - dt);
        }

        const isActive = this.rewardedSpeedBoostRemaining > 0;
        this.player?.setRewardedSpeedBoostActive?.(isActive);
        this.sideSpeedBoostButton?.update({
            isActive,
            isPending: this.speedBoostRewardInProgress,
            remainingSeconds: this.rewardedSpeedBoostRemaining,
            durationSeconds: duration,
            isVisible: !this.gameOverDialogShown,
            isUnlocked: this.sideSpeedBoostUnlocked,
            dt
        });
    }

    updateRewardedSpeedBoostUI() {
        this.updateRewardedSpeedBoost(0);
    }

    updateGameOverDialogState() {
        if (!this.player || !this.gameOverDialog) {
            return;
        }

        if (this.player.isGameOverAnimationFinished?.() === true) {
            if (!this.gameOverDialogShown) {
                this.gameOverDialogShown = true;
                this.pokiGameplayGate.addStopReason(PokiStopReasons.GAME_OVER_DIALOG);
                this.gameOverDialog.show();
            }
            return;
        }

        if (!this.player.isDead?.() && this.gameOverDialogShown) {
            this.gameOverDialog.hide();
            this.gameOverDialogShown = false;
            this.pokiGameplayGate.removeStopReason(PokiStopReasons.GAME_OVER_DIALOG);
        }
    }

    _updateFuryBar() {
        const visible = !!(this.player && this.isReady && !this.sequencePresentationActive);
        const progress = this.player?.getFuryProgress?.() ?? 0;
        const inputMode = this.joystick?.inputMode ?? 'touch';
        const ready = this.player?.isFuryReady?.() === true;
        if (!this.furyBar) return;
        this.furyBar.setVisible(visible);
        this.joystick?.updateFuryKeyLabel(visible && ready, visible ? this.furyBar.bounds : null);
        if (!visible) return;
        this.furyBar.update(
            progress,
            inputMode,
            ready
        );
    }

    // Fires the Dyno Fury ultimate if the player has a full charge.
    tryTriggerFury() {
        if (CONFIG.FURY?.enabled === false || !this.player || !this.levelObjectManager) {
            return;
        }
        // Already in buildup — ignore repeat presses.
        if (this._furyBuildup) return;
        if (!this.player.consumeFury()) {
            return;
        }
        const fury = CONFIG.FURY || {};
        const buildup = Math.max(0, fury.buildupSeconds ?? 0.7);
        if (buildup <= 0) {
            this.triggerFury();
            return;
        }
        // Start the buildup phase: zoom out, then blast when it finishes.
        this._furyBuildup = {
            elapsed: 0,
            duration: buildup,
            factor: Math.max(0.1, fury.zoomOutFactor ?? 1.5),
            zoomOutSeconds: Math.max(0.01, fury.zoomOutSeconds ?? 0.4)
        };
        this.audioManager?.play?.(fury.roarSound || 'roar', { volume: 1.0 });
    }

    triggerFury() {
        const fury = CONFIG.FURY || {};
        const ox = this.player.position.x;
        const oy = this.player.position.y;
        const oz = this.player.position.z;
        const radius = fury.blastRadius ?? 24;

        if (!this.infernoShockwave) {
            this.infernoShockwave = new InfernoShockwave();
            this.infernoShockwave.setCamera(this.camera);
        }
        this.infernoShockwave.trigger(ox, oy, oz, radius, fury.waveDurationSeconds ?? 0.7);

        // Apply the gameplay blast once (visual wave is purely cosmetic afterward).
        this.levelObjectManager.detonateInferno(ox, oy);
        this.burnableSceneryManager?.applyFuryDamage?.(ox, oy, radius);

        // Cinematic slow-motion envelope, paced in wall-clock seconds.
        this._furySlowMo = {
            elapsed: 0,
            hold: Math.max(0, fury.slowMoHoldSeconds ?? 0.45),
            ramp: Math.max(0.01, fury.slowMoRampSeconds ?? 0.55),
            scale: THREE.MathUtils.clamp(fury.slowMoScale ?? 0.35, 0.05, 1)
        };

        // Screen shake.
        this._shakeDuration = Math.max(0, fury.shakeDurationSeconds ?? 0.6);
        this._shakeTime = this._shakeDuration;
        this._shakeMagnitude = Math.max(0, fury.shakeMagnitude ?? 1.5);

        // Post-blast zoom: stay zoomed out then ease back. If buildup already zoomed us
        // out, carry that factor forward so there's no jump.
        const builtupFactor = this._furyBuildup?.factor ?? Math.max(0.1, fury.zoomOutFactor ?? 1.5);
        this._furyZoom = {
            elapsed: 0,
            factor: Math.max(0.1, builtupFactor),
            duration: Math.max(0.01, fury.zoomOutDurationSeconds ?? 1.8)
        };
        this._furyBuildup = null;

        this.audioManager?.play?.(fury.blastSound || 'explosion', { volume: 0.9 });
    }

    triggerFaintCrashInfernoShockwave(position, faintConfig = {}) {
        const ox = position.x;
        const oy = position.y;
        const oz = Number.isFinite(position.z) ? position.z : 3;
        const radius = Math.max(faintConfig.faintCrashExplosionRadius ?? 30, 0);

        if (!this.infernoShockwave) {
            this.infernoShockwave = new InfernoShockwave();
            this.infernoShockwave.setCamera(this.camera);
        }
        this.infernoShockwave.trigger(ox, oy, oz, radius, faintConfig.faintCrashWaveDurationSeconds ?? 1.1);

        this._furySlowMo = {
            elapsed: 0,
            hold: Math.max(0, faintConfig.faintCrashSlowMoHoldSeconds ?? 0.3),
            ramp: Math.max(0.01, faintConfig.faintCrashSlowMoRampSeconds ?? 0.7),
            scale: THREE.MathUtils.clamp(faintConfig.faintCrashSlowMoScale ?? 0.28, 0.05, 1)
        };

        this._shakeDuration = Math.max(0, faintConfig.faintCrashShakeDurationSeconds ?? 0.8);
        this._shakeTime = this._shakeDuration;
        this._shakeMagnitude = Math.max(0, faintConfig.faintCrashShakeMagnitude ?? 2.0);

        this._furyZoom = {
            elapsed: 0,
            factor: Math.max(0.1, faintConfig.faintCrashZoomOutFactor ?? 1.6),
            duration: Math.max(0.01, faintConfig.faintCrashZoomOutDurationSeconds ?? 2.0)
        };

        this.audioManager?.play?.('explosion', { volume: 1.0 });
    }

    // Advances the ability envelope in wall-clock seconds; sets this.timeScale for gameplay.
    updateFuryAbility(realDt) {
        // The shockwave visual runs on wall-clock time so slow-mo doesn't stall it.
        this.infernoShockwave?.update(realDt);

        // Advance buildup and fire blast when it completes.
        if (this._furyBuildup) {
            this._furyBuildup.elapsed += realDt;
            if (this._furyBuildup.elapsed >= this._furyBuildup.duration) {
                this.triggerFury();
            }
        }

        let scale = 1;
        const sm = this._furySlowMo;
        if (sm) {
            sm.elapsed += realDt;
            if (sm.elapsed <= sm.hold) {
                scale = sm.scale;
            } else {
                const k = Math.min(1, (sm.elapsed - sm.hold) / sm.ramp);
                scale = THREE.MathUtils.lerp(sm.scale, 1, k);
                if (k >= 1) this._furySlowMo = null;
            }
        }
        this.timeScale = scale;

        if (this._shakeTime > 0) {
            this._shakeTime = Math.max(0, this._shakeTime - realDt);
        }

        if (this._furyZoom) {
            this._furyZoom.elapsed += realDt;
            if (this._furyZoom.elapsed >= this._furyZoom.duration) {
                this._furyZoom = null;
            }
        }

        this._updateFuryBar();
    }

    renderFrame(dt = null) {
        if (!this.player) {
            return;
        }

        const viewport = this.getViewportDimensions();
        if (viewport.width !== this._lastViewportWidth || viewport.height !== this._lastViewportHeight) {
            this.onResize();
        }

        this.applyPerformanceModeOverrides();
        if (typeof dt === 'number' && dt > 0) {
            this.updatePerformanceDetection(dt);
        }

        const camViewRect = this._scratchCamViewRect || (this._scratchCamViewRect = { left: 0, right: 0, top: 0, bottom: 0 });
        camViewRect.left = this.camera.position.x + this.camera.left;
        camViewRect.right = this.camera.position.x + this.camera.right;
        camViewRect.top = this.camera.position.y + this.camera.top;
        camViewRect.bottom = this.camera.position.y + this.camera.bottom;
        this.levelObjectManager?.setCameraViewRect?.(camViewRect);
        this.burnableSceneryManager?.setCameraViewRect?.(camViewRect);

        if (typeof dt === 'number') {
            this.joystick?.update?.();
            this.handleGlobalUiInput();
            this.handlePickupDropInput();
            const clampedDt = Math.min(dt, MAX_FRAME_DT);
            this.player.update(clampedDt);
            this.updateRewardedSpeedBoost(clampedDt);
            this.levelObjectManager?.update(clampedDt);
            this.burnableSceneryManager?.update(clampedDt);
            this.missionManager?.update(clampedDt);
            this.zoneDialogTriggerManager?.update(clampedDt);
            this.zoneLayerVisibilityController?.update?.(clampedDt);
            this.activeMissionUI?.update(clampedDt);
            this._updateAmbienceForWaterState();
            this.updateCameraFollow(dt);
            camViewRect.left = this.camera.position.x + this.camera.left;
            camViewRect.right = this.camera.position.x + this.camera.right;
            camViewRect.top = this.camera.position.y + this.camera.top;
            camViewRect.bottom = this.camera.position.y + this.camera.bottom;
            this.burnableSceneryManager?.setCameraViewRect?.(camViewRect);
            if (!this.isReady || clampedDt === 0) {
                this.burnableSceneryManager?.update?.(0);
            }
            this.updateGameOverDialogState();
        } else {
            this.joystick?.update?.();
            this.handleGlobalUiInput();
            this.updateCameraFollow();
            camViewRect.left = this.camera.position.x + this.camera.left;
            camViewRect.right = this.camera.position.x + this.camera.right;
            camViewRect.top = this.camera.position.y + this.camera.top;
            camViewRect.bottom = this.camera.position.y + this.camera.bottom;
            this.burnableSceneryManager?.setCameraViewRect?.(camViewRect);
            if (!this.isReady) {
                this.burnableSceneryManager?.update?.(0);
            }
        }
        this.updatePickupDropButtonState();
        this.updateFireButtonState();
        this.updateSpeedButtonState();
        if (this.topBarUI && this.player?.getHealthProgress) {
            this.topBarUI.setHealthProgress(this.player.getHealthProgress());
        }
        if (this.topBarUI && this.player?.getEnergyProgress) {
            this.topBarUI.setEnergyProgress(this.player.getEnergyProgress());
        }
        if (this.topBarUI && this.player && this.level) {
            this.topBarUI.updateMinimapPlayerDot(this.player.position.x, this.player.position.y, this.level);

            const showPlanes = CONFIG.minimapShowPlanes;
            const showZeppelins = CONFIG.minimapShowZeppelins;
            const showSharks = CONFIG.minimapShowSharks;
            const planeObjects = this._minimapPlaneObjects || (this._minimapPlaneObjects = []);
            const zeppelinObjects = this._minimapZeppelinObjects || (this._minimapZeppelinObjects = []);
            const sharkObjects = this._minimapSharkObjects || (this._minimapSharkObjects = []);
            planeObjects.length = 0;
            zeppelinObjects.length = 0;
            sharkObjects.length = 0;
            const allObjs = this.levelObjectManager?.objects;
            if (allObjs && (showPlanes || showZeppelins || showSharks)) {
                for (let i = 0, n = allObjs.length; i < n; i++) {
                    const o = allObjs[i];
                    if (!o || o.isDestroyed || o.markedForRemoval) continue;
                    const t = o.type;
                    if (showPlanes && t === 'plane') planeObjects.push(o);
                    else if (showZeppelins && t === 'zeppelin') zeppelinObjects.push(o);
                    else if (showSharks && t === 'shark') sharkObjects.push(o);
                }
            }
            this.topBarUI.updateMinimapObjectDots(planeObjects, this.level);
            this.topBarUI.updateMinimapZeppelinDots(zeppelinObjects, this.level);
            this.topBarUI.updateMinimapSharkDots(sharkObjects, this.level);

            const missionTargetPos = CONFIG.minimapShowMissionTarget && this.missionManager?.currentMission
                ? this.activeMissionUI?.getMissionGuideTargetPoint?.() ?? null
                : null;
            this.topBarUI.updateMinimapMissionTargetDot(missionTargetPos, this.level);
            this.topBarUI.updateMinimapSkinsAffordableDot(
                this.getSkinDialogZoneTargetPoint(),
                this.level,
                this.hasAffordableSkinAvailable === true
            );
        }
        if (this.skyBackground) this.skyBackground.mesh.visible = !CONFIG.disableParalax;
        this.skyBackground?.update();
        if (this.parallaxBackground) {
            const parallaxEnabled = shouldCreateParallaxBackground() && this.getCurrentPerformanceProfile().background.parallaxEnabled !== false;
            this.parallaxBackground.setBackgroundLayersVisible(parallaxEnabled);
            this.parallaxBackground.update();
        }
        this.updateBelowLevelBackground();
        this.updateAboveLevelBackground();
        this.levelRenderer?.update(this.camera);
        if (CONFIG.disableDynoRendering && this.player?.mesh) {
            this.player.mesh.visible = false;
        }
        const sceneScissor = this.getSceneRenderScissorRect();

        if (this._fpsEl) this.renderer.info.reset();
        const winW = this._lastViewportWidth;
        const winH = this._lastViewportHeight;
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, winW, winH);
        this.renderer.setScissor(0, 0, winW, winH);
        if (this._pendingViewportSyncFrames > 0) {
            // Mobile rotation can briefly leave Safari/WebGL presenting a stretched previous
            // backbuffer. Force a few full-screen clears after resize/orientation so stale UI
            // pixels cannot survive behind the newly laid out Fury bar.
            this.renderer.clear(true, true, true);
        }
        this.renderer.clear();
        this.renderer.setViewport(
            this.sceneViewport.x,
            this.sceneViewport.y,
            this.sceneViewport.width,
            this.sceneViewport.height
        );
        this.renderer.setScissor(
            sceneScissor.x,
            sceneScissor.y,
            sceneScissor.width,
            sceneScissor.height
        );
        // Transient screen shake (e.g. Dyno Fury detonation). Offset only for this render so
        // camera-follow math next frame is unaffected.
        let shakeX = 0;
        let shakeY = 0;
        if (this._shakeTime > 0 && this._shakeDuration > 0) {
            const k = this._shakeTime / this._shakeDuration;
            const amp = this._shakeMagnitude * k * k;
            shakeX = (Math.random() * 2 - 1) * amp;
            shakeY = (Math.random() * 2 - 1) * amp;
            this.camera.position.x += shakeX;
            this.camera.position.y += shakeY;
        }
        if (sceneScissor.width > 0 && sceneScissor.height > 0) {
            this.renderer.setScissorTest(true);
            this.renderer.render(this.scene, this.camera);
        }
        if (shakeX !== 0 || shakeY !== 0) {
            this.camera.position.x -= shakeX;
            this.camera.position.y -= shakeY;
        }
//        this.renderBelowLevelColorOverlay();
        this.renderer.setScissorTest(false);
        this.renderer.setViewport(0, 0, winW, winH);
        this.renderer.setScissor(0, 0, winW, winH);
        // Shockwave renders in its own pass — guaranteed on top of all game-world geometry.
        this.infernoShockwave?.render(this.renderer);
        if (!CONFIG.disableUI) {
            if (!this.sequencePresentationActive) {
                this.topBarUI?.render(this.renderer);
            }
            this.activeMissionUI?.render(this.renderer);
            this.sideSpeedBoostButton?.render(this.renderer);
            this.joystick.render(this.renderer);
            this.furyBar?.render(this.renderer);
            this.joystick.renderFuryKeyLabel(this.renderer);
        }
        if (this._fpsEl && typeof dt === 'number') {
            this._fpsFrames++;
            this._fpsAccum += dt;
            this._fpsCalls += this.renderer.info.render.calls;
            if (this._fpsAccum >= 0.5) {
                const fps = Math.round(this._fpsFrames / this._fpsAccum);
                const calls = Math.round(this._fpsCalls / this._fpsFrames);
                this._fpsFrames = 0;
                this._fpsAccum = 0;
                this._fpsCalls = 0;
                this._fpsEl.textContent = `${calls}dc ${fps}fps`;
            }
        }
        if (this._pendingViewportSyncFrames > 0) {
            this._pendingViewportSyncFrames -= 1;
        }
    }

    async softReset() {
        // Hide any open dialogs and remove their Poki stop-reasons.
        if (this.settingsDialog?.visible) this.settingsDialog.hide();
        if (this.skinShop?.visible) this.skinShop.hide();
        if (this.gameOverDialog?.visible) this.gameOverDialog.hide();
        this.gameOverDialogShown = false;

        // End Poki gameplay session — restarted after the level reloads.
        this.pokiGameplayGate.endSession();
        this.pokiGameplayGate.clearStopReasons();

        // Reload the current level through the normal mission-level path (force reload
        // so it always re-builds even when the level URL hasn't changed).
        // Retry up to 3 times on network failure (e.g. "Failed to fetch" on mobile after
        // the tab has been backgrounded), then surface a user-visible error.
        {
            const MAX_ATTEMPTS = 3;
            const RETRY_DELAY_MS = 1500;
            let lastError;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                try {
                    await this.loadMissionLevel(this.currentLevelKey, { forceReload: true });
                    lastError = null;
                    break;
                } catch (error) {
                    lastError = error;
                    const msg = error?.message || String(error);
                    console.warn(`[Game] softReset: level reload failed (attempt ${attempt}/${MAX_ATTEMPTS}).`, msg);
                    if (attempt < MAX_ATTEMPTS) {
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
                    }
                }
            }
            if (lastError) {
                const msg = lastError?.message || String(lastError);
                console.error('[Game] softReset: level reload failed after all retries.', msg);
                this.loadingScreen?.showError?.('Check your connection and reload the page.');
                return;
            }
        }

        // Fresh mission manager — reads the now-cleared localStorage.
        this.missionManager = new MissionManager(this, MISSIONS, {
            getCoinCount: () => this.coinCount,
            setCoinCount: (n, opts) => {
                this.coinCount = n;
                if (!opts?.skipHud) this.topBarUI?.setCoinCount?.(n);
                const data = loadPlayerData() || {};
                savePlayerData({ ...data, coins: n });
                this.skinShop?.syncCoins?.(n);
                this.updateSkinHudHints();
            },
            onWatchAd: () => this.runPokiRewardedBreak('mission coins'),
            spawnCoinFly: (screenX, screenY, count, perCoin) => this._spawnCoinFlyFromScreen(screenX, screenY, count, perCoin)
        });
        this.levelObjectManager.setMissionManager(this.missionManager);

        // Re-sync coins from the skin shop (its localStorage may have been cleared).
        this.coinCount = this.skinShop?.getPersistedCoins?.() ?? 0;
        this.topBarUI?.setCoinCount?.(this.coinCount);
        this.skinShop?.syncCoins?.(this.coinCount);
        this.updateSkinHudHints();

        // Reset misc game-play state.
        this.rewardedSpeedBoostRemaining = 0;
        this.player?.setRewardedSpeedBoostActive?.(false);
        this.reviveRewardInProgress = false;
        this.speedBoostRewardInProgress = false;
        this.ringProgressCount = 0;
        this.currentPickupTarget = null;
        this.pickupDropButtonEnabled = false;

        // Resume Poki gameplay session.
        this.pokiGameplayGate.startSession();

        await this.missionManager.start();
    }

    animate() {
        if (!this._boundAnimate) this._boundAnimate = this.animate.bind(this);
        requestAnimationFrame(this._boundAnimate);

        if (!this.isReady || !this.player) {
            return;
        }

        const paused = this.syncGameplayPauseState();
        this.timer.update();
        const rawDt = paused ? 0 : this.timer.getDelta();

        // Dyno Fury ultimate: trigger on key/button press, then advance its slow-mo + shake
        // envelope on wall-clock time before scaling gameplay dt.
        if (!paused && this.joystick?.consumeFuryPressed?.()) {
            this.tryTriggerFury();
        }
        if (!paused) {
            this.updateFuryAbility(rawDt);
        }

        const dt = rawDt * (this.timeScale ?? 1);
        this.renderFrame(dt);
    }
}

// Suppress unhandled rejections from third-party SDKs (Poki ads, analytics fetch calls)
// that fail due to ad blockers or network issues. These are outside our control and would
// otherwise pollute error reporting with noise unrelated to game code.
window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason?.message || String(reason);
    const stack = reason?.stack || '';
    const isPokiSDK = stack.includes('poki-sdk') || stack.includes('poki.com/scripts');
    const isFetchError = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed');
    if (isPokiSDK || isFetchError) {
        event.preventDefault();
    }
});

if (PokiSDK && PokiSDK.init) {
    PokiSDK.init().then(() => {
        new Game();
    }).catch(() => {
        new Game();
    });
} else {
    new Game();
}
