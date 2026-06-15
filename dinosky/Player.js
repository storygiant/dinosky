import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { CONFIG } from './config.js';

import { GAMEPLAY_TYPES, isPointInsideZone, isPointNearZone } from './TiledLevel.js';
import { loaderLoadWithRetry } from './fetchWithRetry.js';

const PLAYER_RADIUS = 1;
const LOCAL_GROUND_EPSILON = 0.05;

// Keep dyno-specific tuning centralized so visuals and animation mapping stay easy to tweak.
export const DYNO_MODEL_SETTINGS = {
    path: './gfx/mesh/dyno/dyno.glb',
    texturePath: './gfx/textures/dyno/dyno_texture.webp',
    // Render the dyno unlit so the texture colors stay exact and lighting does not darken it.
    useUnlitMonotoneMaterial: true,
    monotoneColor: '#ffffff',
    // Fixed dyno model scale in world space so every device uses the exact same size.
    modelScale: 8,
    // Fixed local base offset for the imported model.
    // Ground alignment is controlled explicitly with fitOffset.y + CONFIG.dynoGroundOffsetY.
    baseOffsetY: 0,
    // Manual world-space visual offsets. Y is intentionally a simple fixed value.
    // Keep the body in front of the ground layers even when the dyno turns on the Y axis.
    fitOffset: { x: 0, y: -1.5, z: 1.4 },
    facingYaw: {
        right: -Math.PI / 2,
        left: Math.PI / 2
    },
    extraRotation: { x: 0, y: -0.2, z: 0 },
    fadeDuration: 0.22,
    tiltLerpSpeed: 10,
    animationSpeedDeadZone: 0.18,
    locomotionTimeScaleMax: 100,
    clipOverrides: {
        idle: null,
        dragIdle: null,
        dragPush: null,
        walk: null,
        drag: null,
        run: null,
        turnLeft: null,
        turnRight: null,
        airTurnLeft: null,
        airTurnRight: null,
        hover: null,
        hoverUp: null,
        hoverDown: null,
        takeoff: null,
        fly: null,
        flyUp: null,
        flyGlide: null,
        flyDive: null,
        faint: null,
        landing: null,
        deadFalling: null,
        dead: null,
        revive: null,
        swimIdle: null,
        swimDive: null,
        swimNormal: null,
        swimIdleUp: null,
        swimIdleGrab: null
    },
    clipHints: {
        idle: ['idle', 'breathe'],
        dragIdle: ['drag_idle-loop', 'drag_idle_loop', 'drag_idle', 'dragidle'],
        dragPush: ['drag_push-loop', 'drag_push_loop', 'drag_push', 'dragpush'],
        walk: ['walk'],
        drag: ['drag-loop', 'drag_loop', 'drag'],
        run: ['run'],
        turnLeft: ['walk_turn_right', 'turn_left'],
        turnRight: ['walk_turn_left', 'turn_right'],
        airTurnLeft: ['hover_turn_right', 'turn_left'],
        airTurnRight: ['hover_turn_left', 'turn_right'],
        hover: ['hover'],
        hoverUp: ['hover_up', 'hover_up-loop'],
        hoverDown: ['hover_down', 'hover_down-loop'],
        takeoff: ['hover'],
//        takeoff: ['takeoff', 'take_off', 'launch'],
        fly: ['flying', 'fly'],
        flyUp: ['flying_up', 'fly_up', 'flyingup'],
        flyGlide: ['flying_glide', 'glide'],
        flyDive: ['flying_dive', 'dive'],
        faint: ['flying_up_sleep'],
        landing: ['landing', 'land', 'touchdown'],
        deadFalling: ['dead_falling-loop', 'dead_falling', 'deadfalling', 'deadfall'],
        dead: ['dead', 'death'],
        revive: ['revive', 'revival'],
        swimIdle: ['swim_idle-loop', 'swim_idle_loop', 'swim_idle'],
        swimDive: ['swim_dive-loop', 'swim_dive_loop', 'swim_dive'],
        swimNormal: ['swim_normal-loop', 'swim_normal_loop', 'swim_normal'],
        swimIdleUp: ['swim_idle_up-loop', 'swim_idle_up_loop', 'swim_idle_up'],
        swimIdleGrab: ['swim_idle_grab-loop', 'swim_idle_grab_loop', 'swim_idle_grab']
    },
    fallbackOrder: {
        idle: ['idle', 'walk', 'run', 'hover', 'fly', 'takeoff', 'landing'],
        dragIdle: ['dragIdle'],
        dragPush: ['dragPush', 'dragIdle'],
        walk: ['walk', 'run', 'idle', 'hover', 'fly'],
        drag: ['drag'],
        run: ['run', 'walk', 'idle', 'fly', 'hover'],
        turnLeft: ['turnLeft', 'walk', 'run', 'idle'],
        turnRight: ['turnRight', 'walk', 'run', 'idle'],
        airTurnLeft: ['airTurnLeft', 'hover', 'fly'],
        airTurnRight: ['airTurnRight', 'hover', 'fly'],
        hover: ['hover', 'fly', 'idle', 'walk', 'run'],
        hoverUp: ['hoverUp', 'hover', 'fly'],
        hoverDown: ['hoverDown', 'hover', 'fly'],
        takeoff: ['takeoff', 'fly', 'hover', 'idle', 'walk', 'run', 'landing'],
        fly: ['fly', 'hover', 'takeoff', 'idle', 'walk', 'run', 'landing'],
        flyUp: ['flyUp', 'fly', 'hover'],
        flyGlide: ['flyGlide', 'fly', 'hover'],
        flyDive: ['flyDive', 'fly', 'hover'],
        faint: ['faint', 'flyUp', 'fly'],
        landing: ['landing', 'walk', 'idle', 'run', 'hover', 'fly', 'takeoff'],
        deadFalling: ['deadFalling', 'dead', 'flyDive', 'fly', 'hover'],
        dead: ['dead', 'idle'],
        revive: ['revive', 'idle'],
        swimIdle: ['swimIdle', 'hover', 'fly', 'idle'],
        swimDive: ['swimDive', 'swimNormal', 'fly', 'hover'],
        swimNormal: ['swimNormal', 'swimIdle', 'hover', 'fly'],
        swimIdleUp: ['swimIdleUp', 'swimIdle', 'hover', 'fly'],
        swimIdleGrab: ['swimIdleGrab', 'swimIdle', 'hover', 'fly']
    }
};

/* Dyno fire breath removed for Dyno Sky */

const UNDERWATER_TRAIL_SETTINGS = Object.freeze({
    maxParticles: 32,
    minSpawnSpeed: 1.2,
    spawnRateMin: 10,
    spawnRateMax: 28,
    offsetBehind: 0.95,
    offsetDown: 0.12,
    driftUpMin: 0.35,
    driftUpMax: 1.4,
    backwardSpeedMin: 0.5,
    backwardSpeedMax: 2.2,
    spreadX: 0.34,
    spreadY: 0.22,
    sizeMin: 0.6,
    sizeMax: 2,
    endSizeRatio: 0.3,
    lifeMin: 0.4,
    lifeMax: 0.85
});

export const PLAYER_PRELOAD_ASSET_URLS = [
    DYNO_MODEL_SETTINGS.path,
    DYNO_MODEL_SETTINGS.texturePath
];

const LOCOMOTION_TIMESCALE_LOG_STATES = new Set([
    'hover', 'hoverUp', 'hoverDown', 'walk', 'drag', 'run',
    'fly', 'flyUp', 'flyGlide', 'flyDive',
    'swimNormal', 'swimDive', 'swimIdle', 'swimIdleUp', 'swimIdleGrab'
]);

export class Player {
    constructor(scene, ground, joystick, options = {}) {
        this.doDebug = false;
        this.scene = scene;
        this.ground = ground;
        this.joystick = joystick;
        this.loadingManager = options.loadingManager || undefined;
        this.levelObjectManager = options.levelObjectManager || null;
        this.audioManager = options.audioManager || null;
        this.loader = createGLTFLoader(this.loadingManager);
        this.textureLoader = new THREE.TextureLoader(this.loadingManager);

        // This root remains the authoritative gameplay body. Visuals stay underneath it.
        this.mesh = new THREE.Group();
        this.mesh.renderOrder = 0;
        this.visualRenderOrder = 0;

        // Keep flight side-switching on a world-space Y axis, then apply tilt and local facing underneath it.
        this.dynoFlightTurnPivot = new THREE.Group();

        this.dynoTiltPivot = new THREE.Group();
        this.dynoTiltPivot.position.y = -PLAYER_RADIUS;

        this.dynoTurnPivot = new THREE.Group();
        this.dynoTurnPivot.position.y = PLAYER_RADIUS;

        this.dynoCollisionAnchor = new THREE.Group();
        this.dynoCollisionAnchor.name = 'DynoCollisionAnchor';

        this.dynoFacingPivot = new THREE.Group();
        this.dynoFacingPivot.visible = false;

        this.dynoFitRoot = new THREE.Group();
            this.dynoFitRoot.rotation.set(
                DYNO_MODEL_SETTINGS.extraRotation.x,
                DYNO_MODEL_SETTINGS.extraRotation.y,
                DYNO_MODEL_SETTINGS.extraRotation.z
            );

        this.dynoFacingPivot.add(this.dynoFitRoot);
        this.dynoTurnPivot.add(this.dynoCollisionAnchor);
        this.dynoTurnPivot.add(this.dynoFacingPivot);
        this.dynoTiltPivot.add(this.dynoTurnPivot);
        this.dynoFlightTurnPivot.add(this.dynoTiltPivot);
        this.mesh.add(this.dynoFlightTurnPivot);
        this.scene.add(this.mesh);

        const spawnConfig = CONFIG.spawnPosition || {};
        const spawnX = Number.isFinite(spawnConfig.x) ? spawnConfig.x : 0;
//        const spawnY = Number.isFinite(spawnConfig.y) ? spawnConfig.y : 0;
        const spawnZ = Number.isFinite(spawnConfig.z) ? spawnConfig.z : 1;
        const configuredSpawnY = Number.isFinite(spawnConfig.y) ? spawnConfig.y : null;
        const spawnProbeY = configuredSpawnY == null
            ? this.getFlightCeilingHeight()
            : this.getGroundProbeY(configuredSpawnY);
        const spawnGroundInfo = this.getGroundInfoBelowAt(spawnX, spawnProbeY);
        const groundedSpawnY = (spawnGroundInfo?.surfaceHeight ?? 0) + PLAYER_RADIUS;
        const shouldSnapToGround = true;//configuredSpawnY == null || configuredSpawnY <= groundedSpawnY;
        const spawnY = shouldSnapToGround ? groundedSpawnY : (configuredSpawnY ?? groundedSpawnY);

        this.position = new THREE.Vector3(spawnX, spawnY, spawnZ);
        this.velocity = new THREE.Vector3(0, 0, 0);
        this.actualHorizontalSpeed = 0;
        this.onGround = shouldSnapToGround;
        if (this.onGround) {
            this.updateGroundContact(spawnGroundInfo);
        }
        this.lastFacingDirection = 1;
        this.currentGroundTilt = 0;
        this.targetGroundTilt = 0;
        this.groundContact = null;
        this.currentTurnRotation = 0;
        this.isTurning = false;
        this.currentTurnSpeed = CONFIG.minWalkTurnSpeed;
        this.turnMode = 'ground';
        this.turnStartFacing = 1;
        this.turnTargetFacing = 1;
        this.turnDirection = null;
        this.turnRotationTarget = -Math.PI;
        this.lastGroundMoveSign = 0;
        this.lastMovementBand = 'idle';
        this.airMode = 'hover';
        this.airHoverRecoveryLock = false;
        this.isFlightTurning = false;
        this.flightTurnElapsed = 0;
        this.flightTurnDuration = 0;
        this.flightTurnStartFacing = 1;
        this.flightTurnTargetFacing = 1;
        this.flightTurnVisualStartRotation = 0;
        this.flightTurnVisualTargetRotation = 0;
        this.flightTurnVisualRotation = 0;
        this.flightTurnPitchReferenceX = 0;
        this.flightFacingRotationY = 0;
        this.holdFlightTurnFlyUp = false;
        this.lastAirborneHorizontalBlocked = false;
        this.isFainting = false;
        this.isFaintSequenceActive = false;
        this.isFaintConditionActive = false;
        this.faintSequenceElapsed = 0;
        this.hasWokenFromFaint = false;
        this.faintVisualStartAngle = 0;
        this.faintVisualAngle = 0;
        this.faintAnimationAction = null;
        this.faintCrashExplosionTriggered = false;
        this.airborneAnimationState = 'hover';
        this.isHovering = false;
        this.debugState = new Map();
        this.missingAnimationWarnings = new Set();
        this.currentInput = { x: 0, y: 0 };
        this.loggedCarryFlightCollisionForObjectId = null;
        this.playerUpdateFrame = 0;
        this.cachedCarryFlightCollisionLocalPolygon = null;
        this.cachedCarryFlightCollisionObjectId = null;
        this.pendingCarryFlightCollisionObjectId = null;
        this.animationTimeScales = {
            hover: 1,
            hoverUp: 1,
            hoverDown: 1,
            walk: 1,
            drag: 1,
            run: 1,
            fly: 1,
            flyUp: 1,
            flyGlide: 1,
            flyDive: 1
        };
        this.groundTravelDistance = 0;
        this.hoverBlendWeights = {
            hover: 1,
            hoverUp: 0,
            hoverDown: 0
        };
        // Keep hover directional blending stateful so opposite-direction switches
        // always pass through neutral hover instead of snapping up<->down directly.
        this.hoverBlendMode = 'neutral';
        this.hoverBlendPendingMode = null;
        this.dragLayerBounds = new THREE.Box3();

        this.dynoModel = null;
        this.dynoMaterialStates = [];
        this.hitFlashElapsed = 0;
        this.hitFlashActive = false;
        this.animationMixer = null;
        this.animationActions = {};
        this.animationClipActions = new Map();
        this.animationClipActionsNormalized = new Map();
        this.stateClipMap = {};
        this.activeAnimationState = null;
        this.activeAction = null;
        this.transitionAction = null;
        this.queuedLoopState = null;
        this.mouthObject = null;
        this.mouthSocket = null;
        this.carrySocket = null;
        this.maxLiftWeight = Number.isFinite(CONFIG.DYNO_CARRY?.maxLiftWeight)
            ? CONFIG.DYNO_CARRY.maxLiftWeight
            : 0;
        this.maxDragWeight = Number.isFinite(CONFIG.DYNO_DRAG?.maxDragWeight)
            ? CONFIG.DYNO_DRAG.maxDragWeight
            : 0;
        this.carriedObject = null;
        this.grabbedObject = null;
        this.grabbedObjectAnchorWorld = new THREE.Vector3();
        this.grabbedObjectPlayerOffsetWorld = new THREE.Vector3();
        this.autoPickupTarget = null;
        // External circle constraints (e.g. catapult pull limit): [{cx, cy, radius}]
        this.positionConstraints = [];
        this.autoPickupElapsed = 0;
        this.autoDragTarget = null;
        this.autoDragGrabPointName = null;
        this.autoDragElapsed = 0;
        this.draggedObject = null;
        this.dragFacingDirection = null;
        this.gameplayInputLocked = false;
        this.timelineAnimationControlled = false;

        // Water gameplay state
        this.isInWater = false;
        this.waterState = null; // null | 'swim' | 'swimDive' | 'swimSurfaceIdle' | 'swimSurfaceIdleUp'
        this.waterPolygonCache = null; // { polygon, cx, cy, cr² }[] built on first use
        this.waterZoneRectCache = null; // { zone, cx, cy, cr2 }[] built on first use
        this.currentWaterPolygonEntry = null;
        this.underwaterTrailGroup = null;
        this.underwaterTrailParticles = [];
        this.freeUnderwaterTrailParticles = [];
        this.underwaterTrailSpawnAccumulator = 0;
        this.setupUnderwaterTrail();

        this.lastFootstepDistance = 0;
        this.lastGallopAudioState = null;
        this.lastGallopAudioPhase = null;
        this.lastWingflapAudioState = null;
        this.lastWingflapAudioPhase = null;
        this.fireButtonWasDown = false;
        this.rewardedSpeedBoostActive = false;
        this.energyDepletedCount = 0;
        this.maxEnergyValue = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_ENERGY_BOOST?.maxEnergyValue)
                ? CONFIG.DYNO_ENERGY_BOOST.maxEnergyValue
                : 100
        );
        this.energyDrainValue = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_ENERGY_BOOST?.energyDrainValue)
                ? CONFIG.DYNO_ENERGY_BOOST.energyDrainValue
                : 25
        );
        this.energyFillSpeed = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_ENERGY_BOOST?.energyFillSpeed)
                ? CONFIG.DYNO_ENERGY_BOOST.energyFillSpeed
                : 15
        );
        this.energyEmptyDuration = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_ENERGY_BOOST?.energyEmptyDuration)
                ? CONFIG.DYNO_ENERGY_BOOST.energyEmptyDuration
                : 0
        );
        this.energyEmptyTimer = 0;
        this.energySpeedMultiplier = Math.max(
            1,
            Number.isFinite(CONFIG.DYNO_ENERGY_BOOST?.energySpeedMultiplier)
                ? CONFIG.DYNO_ENERGY_BOOST.energySpeedMultiplier
                : 1.6
        );
        this.currentEnergyValue = this.maxEnergyValue;
        this.energyBoostActive = false;
        this.lastEnergyDrainAmount = 0;
        this.maxHealthValue = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_HEALTH?.maxHealthValue)
                ? CONFIG.DYNO_HEALTH.maxHealthValue
                : 100
        );
        this.healthFillSpeed = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_HEALTH?.healthFillSpeed)
                ? CONFIG.DYNO_HEALTH.healthFillSpeed
                : 0
        );
        this.currentHealthValue = this.maxHealthValue;
        this.lastMissileDamageTime = -Infinity;
        this.gameOverReady = false;
        // Dyno Fury ultimate charge (0..1): fills while breathing flame plus a slow passive
        // trickle. At full charge the player can unleash the Inferno Shockwave (see main.js).
        this.furyCharge = 0;
        this.isDeadState = false;
        this.deathState = null; // null | 'falling' | 'grounded'
        this.gameOverAnimationFinished = false;
        this.deathFallElapsed = 0;
        this.deathFallStartAngle = 0;
        this.deathFallingVisualAngle = 0;
        this.deathGroundedAction = null;
        this.isReviving = false;
        this.reviveAction = null;
        this.debugHitRectLine = null;
        this.debugHitRectFill = null;
        this.debugCarryRectWorldLine = null;
        this.debugCarryRectReprojectedLine = null;
        this.debugCarryRectConnectorLine = null;
        this.debugMatterDynoAnchorLines = new Map();
        this.debugCollisionOverlay = null;
        this.debugCollisionMarkers = [];

        this.setupDebugHitRect();
        this.setupDebugCollisionOverlay();
        this.loadDyno();
    }

    setupDebugHitRect() {
        this.disposeDebugHitRect();
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderCollisionShell) {
            return;
        }

        const geometry = new THREE.BufferGeometry();
        const fillMaterial = new THREE.MeshBasicMaterial({
            color: 0xff3333,
            transparent: true,
            opacity: 0.22,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide
        });
        this.debugHitRectFill = new THREE.Mesh(geometry, fillMaterial);
        this.debugHitRectFill.name = 'DynoCollisionShapeDebugFill';
        this.debugHitRectFill.renderOrder = 10000;
        this.scene.add(this.debugHitRectFill);

        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0xff4444,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            linewidth: 2
        });
        this.debugHitRectLine = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
        this.debugHitRectLine.name = 'DynoCollisionShapeDebugOutline';
        this.debugHitRectLine.renderOrder = 10001;
        this.scene.add(this.debugHitRectLine);

        const rawRectLineMaterial = new THREE.LineBasicMaterial({
            color: 0x00ff66,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            linewidth: 2
        });
        this.debugCarryRectWorldLine = new THREE.Line(new THREE.BufferGeometry(), rawRectLineMaterial);
        this.debugCarryRectWorldLine.name = 'DynoCarryRectWorldDebugOutline';
        this.debugCarryRectWorldLine.renderOrder = 10002;
        this.scene.add(this.debugCarryRectWorldLine);

        const reprojectedLineMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            linewidth: 2
        });
        this.debugCarryRectReprojectedLine = new THREE.Line(new THREE.BufferGeometry(), reprojectedLineMaterial);
        this.debugCarryRectReprojectedLine.name = 'DynoCarryRectReprojectedDebugOutline';
        this.debugCarryRectReprojectedLine.renderOrder = 10003;
        this.scene.add(this.debugCarryRectReprojectedLine);

        const connectorLineMaterial = new THREE.LineBasicMaterial({
            color: 0xff00ff,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            linewidth: 2
        });
        this.debugCarryRectConnectorLine = new THREE.LineSegments(new THREE.BufferGeometry(), connectorLineMaterial);
        this.debugCarryRectConnectorLine.name = 'DynoCarryRectComparisonConnectors';
        this.debugCarryRectConnectorLine.renderOrder = 10004;
        this.scene.add(this.debugCarryRectConnectorLine);
        this.updateDebugHitRect();
    }

    getCarryRectDebugComparisonWorldPolygons() {
        if (!this.carriedObject) {
            return {
                rawRectWorldPoints: [],
                reprojectedRectWorldPoints: [],
                maxCornerDrift: 0,
                averageCornerDrift: 0
            };
        }

        const carriedRect = this.getCurrentCarriedCollisionRect();
        if (!carriedRect) {
            return {
                rawRectWorldPoints: [],
                reprojectedRectWorldPoints: [],
                maxCornerDrift: 0,
                averageCornerDrift: 0
            };
        }

        const transform = this.getDynoCollisionTransform();
        const rectWorldPoints = this.getRectWorldPoints(carriedRect, false);
        const orderedRectWorldPoints = this.orderRectPointsForCarryPolygon(rectWorldPoints, transform);
        const rawRectWorldPoints = orderedRectWorldPoints.length > 0
            ? [...orderedRectWorldPoints.map((point) => point.clone()), orderedRectWorldPoints[0].clone()]
            : [];
        const reprojectedRectWorldPoints = orderedRectWorldPoints
            .map((point) => this.transformWorldPointToDynoLocal(point, transform))
            .filter(Boolean)
            .map((point) => this.transformDynoLocalPointToWorld(point, transform))
            .filter(Boolean);

        if (reprojectedRectWorldPoints.length > 0) {
            reprojectedRectWorldPoints.push(reprojectedRectWorldPoints[0].clone());
        }

        let maxCornerDrift = 0;
        let totalCornerDrift = 0;
        const driftCount = Math.min(orderedRectWorldPoints.length, reprojectedRectWorldPoints.length > 0 ? reprojectedRectWorldPoints.length - 1 : 0);
        for (let index = 0; index < driftCount; index += 1) {
            const sourcePoint = orderedRectWorldPoints[index];
            const reprojectedPoint = reprojectedRectWorldPoints[index];
            const drift = sourcePoint.distanceTo(reprojectedPoint);
            maxCornerDrift = Math.max(maxCornerDrift, drift);
            totalCornerDrift += drift;
        }

        return {
            rawRectWorldPoints,
            reprojectedRectWorldPoints,
            maxCornerDrift,
            averageCornerDrift: driftCount > 0 ? totalCornerDrift / driftCount : 0
        };
    }

    makeDebugCrossGeometry(point, size = 0.35, z = 49.2) {
        const x = Number.isFinite(point?.x) ? point.x : 0;
        const y = Number.isFinite(point?.y) ? point.y : 0;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute([
                x - size, y, z,
                x + size, y, z,
                x, y - size, z,
                x, y + size, z
            ], 3)
        );
        return geometry;
    }

    updateDebugMatterDynoAnchors() {
        if (CONFIG.LEVEL_OBJECTS?.debugRenderMatterPhysics !== true) {
              this.disposeDebugMatterDynoAnchors();
            return;
        }

        const markerSpecs = [
            {
                key: 'mouth',
                color: 0x0066ff,
                point: this.getMouthWorldPosition(new THREE.Vector3())
            },
            {
                key: 'mouth_socket',
                color: 0x66ccff,
                point: this.getMouthAttachmentObject()?.getWorldPosition?.(new THREE.Vector3())
            },
            {
                key: 'carry_socket',
                color: 0x00ffff,
                point: this.getCarryFootWorldPosition(new THREE.Vector3())
            }
        ];
        const activeKeys = new Set();

        for (const marker of markerSpecs) {
            if (!marker.point || !Number.isFinite(marker.point.x) || !Number.isFinite(marker.point.y)) {
                continue;
            }

            activeKeys.add(marker.key);
            let line = this.debugMatterDynoAnchorLines.get(marker.key);
            const geometry = this.makeDebugCrossGeometry(marker.point, 0.42, 49.35);
            if (!line) {
                line = new THREE.LineSegments(
                    geometry,
                    new THREE.LineBasicMaterial({
                        color: marker.color,
                        transparent: true,
                        opacity: 1,
                        depthTest: false,
                        depthWrite: false,
                        toneMapped: false
                    })
                );
                line.name = `DynoMatterAnchorDebug:${marker.key}`;
                line.renderOrder = 1000015;
                line.frustumCulled = false;
                this.scene.add(line);
                this.debugMatterDynoAnchorLines.set(marker.key, line);
            } else {
                line.geometry?.dispose?.();
                line.geometry = geometry;
                line.material?.color?.setHex?.(marker.color);
                line.visible = true;
            }
        }
        for (const [key, line] of [...this.debugMatterDynoAnchorLines.entries()]) {
            if (activeKeys.has(key)) {
                continue;
            }

            line.geometry?.dispose?.();
            line.material?.dispose?.();
            line.removeFromParent?.();
            this.debugMatterDynoAnchorLines.delete(key);
        }
    }

    disposeDebugMatterDynoAnchors() {
        for (const line of this.debugMatterDynoAnchorLines.values()) {
            line.geometry?.dispose?.();
            line.material?.dispose?.();
            line.removeFromParent?.();
        }
        this.debugMatterDynoAnchorLines.clear();
    }

    updateDebugHitRect() {
        this.updateDebugMatterDynoAnchors();

        if (!CONFIG.LEVEL_OBJECTS?.debugRenderCollisionShell) {
            if (this.debugHitRectFill) {
                this.debugHitRectFill.visible = false;
            }
            if (this.debugHitRectLine) {
                this.debugHitRectLine.visible = false;
            }
            if (this.debugCarryRectWorldLine) {
                this.debugCarryRectWorldLine.visible = false;
            }
            if (this.debugCarryRectReprojectedLine) {
                this.debugCarryRectReprojectedLine.visible = false;
            }
            if (this.debugCarryRectConnectorLine) {
                this.debugCarryRectConnectorLine.visible = false;
            }
            return;
        }

        if (!this.debugHitRectLine) {
            this.setupDebugHitRect();
            if (!this.debugHitRectLine) {
                return;
            }
        }

        if (!this.debugHitRectFill) {
            this.setupDebugHitRect();
            if (!this.debugHitRectFill) {
                return;
            }
        }

        if (!this.debugCarryRectWorldLine || !this.debugCarryRectReprojectedLine || !this.debugCarryRectConnectorLine) {
            this.setupDebugHitRect();
            if (!this.debugCarryRectWorldLine || !this.debugCarryRectReprojectedLine || !this.debugCarryRectConnectorLine) {
                return;
            }
        }

        this.debugHitRectFill.visible = true;
        this.debugHitRectLine.visible = true;
        const attachedObject = this.getAttachedObject();
        this.debugCarryRectWorldLine.visible = Boolean(attachedObject && !this.useDebugFixedFlightCollisionPolygon());
        this.debugCarryRectReprojectedLine.visible = Boolean(attachedObject && !this.useDebugFixedFlightCollisionPolygon());
        this.debugCarryRectConnectorLine.visible = Boolean(attachedObject && !this.useDebugFixedFlightCollisionPolygon());
        const shapePoints = this.useDebugFixedFlightCollisionPolygon()
            ? this.getFixedFlightCollisionPolygon(true)
            : (attachedObject
                ? this.getCarriedFlightCollisionPolygon(true)
                : this.getCollisionCircleWorldPoints(32, true));
        const fillColor = this.useDebugFixedFlightCollisionPolygon()
            ? 0xcc0000
            : (attachedObject ? 0xff3333 : 0xff6666);
        const lineColor = this.useDebugFixedFlightCollisionPolygon()
            ? 0xff0000
            : (attachedObject ? 0xff2222 : 0xff4444);
        this.debugHitRectFill.material.color.set(fillColor);
        this.debugHitRectLine.material.color.set(lineColor);

        if (shapePoints.length >= 2) {
            const filledPoints = shapePoints.slice(0, -1);
            const vertices = [];
            for (const point of filledPoints) {
                vertices.push(point.x, point.y, this.position.z + 0.18);
            }

            this.debugHitRectFill.geometry?.dispose?.();
            this.debugHitRectFill.geometry = new THREE.BufferGeometry();
            this.debugHitRectFill.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(vertices, 3)
            );
            this.debugHitRectFill.geometry.setIndex(
                this.buildDebugPolygonTriangleIndices(filledPoints.length)
            );
            this.debugHitRectFill.geometry.computeVertexNormals();

            this.debugHitRectLine.geometry?.dispose?.();
            this.debugHitRectLine.geometry = new THREE.BufferGeometry().setFromPoints(
                shapePoints.map((point) => new THREE.Vector3(point.x, point.y, this.position.z + 0.2))
            );
        }

        this.debugHitRectLine.position.set(0, 0, 0);

        if (attachedObject && !this.useDebugFixedFlightCollisionPolygon()) {
            const { rawRectWorldPoints, reprojectedRectWorldPoints } = this.getCarryRectDebugComparisonWorldPolygons();

            this.debugCarryRectWorldLine.geometry?.dispose?.();
            this.debugCarryRectWorldLine.geometry = new THREE.BufferGeometry().setFromPoints(
                rawRectWorldPoints.map((point) => new THREE.Vector3(point.x, point.y, this.position.z + 0.24))
            );
            this.debugCarryRectWorldLine.position.set(0, 0, 0);

            this.debugCarryRectReprojectedLine.geometry?.dispose?.();
            this.debugCarryRectReprojectedLine.geometry = new THREE.BufferGeometry().setFromPoints(
                reprojectedRectWorldPoints.map((point) => new THREE.Vector3(point.x, point.y, this.position.z + 0.28))
            );
            this.debugCarryRectReprojectedLine.position.set(0, 0, 0);

            const connectorPoints = [];
            const connectorCount = Math.min(
                Math.max(rawRectWorldPoints.length - 1, 0),
                Math.max(reprojectedRectWorldPoints.length - 1, 0)
            );
            for (let index = 0; index < connectorCount; index += 1) {
                const rawPoint = rawRectWorldPoints[index];
                const reprojectedPoint = reprojectedRectWorldPoints[index];
                connectorPoints.push(
                    new THREE.Vector3(rawPoint.x, rawPoint.y, this.position.z + 0.26),
                    new THREE.Vector3(reprojectedPoint.x, reprojectedPoint.y, this.position.z + 0.26)
                );
            }

            this.debugCarryRectConnectorLine.geometry?.dispose?.();
            this.debugCarryRectConnectorLine.geometry = new THREE.BufferGeometry().setFromPoints(connectorPoints);
            this.debugCarryRectConnectorLine.position.set(0, 0, 0);
        }
    }

    disposeDebugHitRect() {
        this.disposeDebugMatterDynoAnchors();

        if (this.debugHitRectFill) {
            this.debugHitRectFill.geometry?.dispose?.();
            this.debugHitRectFill.material?.dispose?.();
            this.debugHitRectFill.removeFromParent();
            this.debugHitRectFill = null;
        }

        if (!this.debugHitRectLine) {
            return;
        }

        this.debugHitRectLine.geometry?.dispose?.();
        this.debugHitRectLine.material?.dispose?.();
        this.debugHitRectLine.removeFromParent();
        this.debugHitRectLine = null;

        if (this.debugCarryRectWorldLine) {
            this.debugCarryRectWorldLine.geometry?.dispose?.();
            this.debugCarryRectWorldLine.material?.dispose?.();
            this.debugCarryRectWorldLine.removeFromParent();
            this.debugCarryRectWorldLine = null;
        }

        if (this.debugCarryRectReprojectedLine) {
            this.debugCarryRectReprojectedLine.geometry?.dispose?.();
            this.debugCarryRectReprojectedLine.material?.dispose?.();
            this.debugCarryRectReprojectedLine.removeFromParent();
            this.debugCarryRectReprojectedLine = null;
        }

        if (this.debugCarryRectConnectorLine) {
            this.debugCarryRectConnectorLine.geometry?.dispose?.();
            this.debugCarryRectConnectorLine.material?.dispose?.();
            this.debugCarryRectConnectorLine.removeFromParent();
            this.debugCarryRectConnectorLine = null;
        }
    }

    buildDebugPolygonTriangleIndices(pointCount) {
        if (!Number.isFinite(pointCount) || pointCount < 3) {
            return [];
        }

        const indices = [];
        for (let index = 1; index < pointCount - 1; index += 1) {
            indices.push(0, index, index + 1);
        }
        return indices;
    }

    setupDebugCollisionOverlay() {
        this.disposeDebugCollisionOverlay();
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours) {
            return;
        }

        this.debugCollisionOverlay = new THREE.Group();
        this.debugCollisionOverlay.name = 'DynoCollisionOverlayDebug';
        this.scene.add(this.debugCollisionOverlay);
    }

    disposeDebugCollisionOverlay() {
        this.debugCollisionOverlay?.traverse((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((material) => material?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
        this.debugCollisionOverlay?.removeFromParent?.();
        this.debugCollisionOverlay = null;
    }

    clearCollisionDebugMarkers() {
        this.debugCollisionMarkers = [];
        if (!this.debugCollisionOverlay) {
            return;
        }

        while (this.debugCollisionOverlay.children.length > 0) {
            const child = this.debugCollisionOverlay.children.pop();
            child.geometry?.dispose?.();
            child.material?.dispose?.();
            child.removeFromParent?.();
        }
    }

    addCollisionDebugMarker(point, normal) {
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours || !point || !normal) {
            return;
        }

        this.debugCollisionMarkers.push({
            point: point.clone(),
            normal: normal.clone()
        });
    }

    rebuildCollisionDebugMarkers() {
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours) {
            this.clearCollisionDebugMarkers();
            return;
        }

        if (!this.debugCollisionOverlay) {
            this.setupDebugCollisionOverlay();
        }
        if (!this.debugCollisionOverlay) {
            return;
        }

        while (this.debugCollisionOverlay.children.length > 0) {
            const child = this.debugCollisionOverlay.children.pop();
            child.geometry?.dispose?.();
            child.material?.dispose?.();
            child.removeFromParent?.();
        }

        const pointMaterial = new THREE.LineBasicMaterial({
            color: 0xffff00,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const normalMaterial = new THREE.LineBasicMaterial({
            color: 0xff00ff,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });

        for (const marker of this.debugCollisionMarkers) {
            const crossSize = 0.18;
            const crossPoints = [
                marker.point.x - crossSize, marker.point.y, 49.5,
                marker.point.x + crossSize, marker.point.y, 49.5,
                marker.point.x, marker.point.y - crossSize, 49.5,
                marker.point.x, marker.point.y + crossSize, 49.5
            ];
            const crossGeometry = new THREE.BufferGeometry();
            crossGeometry.setAttribute('position', new THREE.Float32BufferAttribute(crossPoints, 3));
            const cross = new THREE.LineSegments(crossGeometry, pointMaterial.clone());
            cross.renderOrder = 1000001;
            this.debugCollisionOverlay.add(cross);

            const normalEnd = marker.point.clone().add(marker.normal.clone().multiplyScalar(0.65));
            const normalGeometry = new THREE.BufferGeometry();
            normalGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
                marker.point.x, marker.point.y, 49.55,
                normalEnd.x, normalEnd.y, 49.55
            ], 3));
            const normalLine = new THREE.Line(normalGeometry, normalMaterial.clone());
            normalLine.renderOrder = 1000002;
            this.debugCollisionOverlay.add(normalLine);
        }
    }

    setRenderOrder(renderOrder) {
        this.visualRenderOrder = renderOrder;
        this.mesh.renderOrder = renderOrder;

        if (this.dynoModel) {
            this.dynoModel.traverse((child) => {
                if (child.isMesh) {
                    child.renderOrder = renderOrder;
                }
            });
        }

        if (this.underwaterTrailGroup) {
            const trailRenderOrder = renderOrder + 2;
            this.underwaterTrailGroup.renderOrder = trailRenderOrder;
            for (const child of this.underwaterTrailGroup.children) {
                child.renderOrder = trailRenderOrder;
            }
        }
    }

    loadDyno() {
        loaderLoadWithRetry(this.loader, DYNO_MODEL_SETTINGS.path)
            .then((gltf) => this.handleDynoLoaded(gltf))
            .catch((error) => {
                const detail = error instanceof Error
                    ? error.message
                    : (error?.message || error?.url || error?.filename || String(error));
                console.error(`[Player] Failed to load dyno.glb: ${detail}`, error);
            });
    }

    handleDynoLoaded(gltf) {
        this.dynoModel = gltf.scene;
        this.applyDynoTexture(this.dynoModel);
        this.prepareDynoModel(this.dynoModel);
        this.applyInitialDynoNodeVisibility();
        this.collectDynoMaterials();
        this.setupAnimations(gltf.animations);
        this.setupCarrySocket();

        this.dynoFacingPivot.visible = true;
        this.updateFacingDirection(0);
        this.updateGroundAlignment(0);
            // Dyno fire breath removed for Dyno Sky

//        console.info('[Player] Dyno model loaded:', DYNO_MODEL_SETTINGS.path);
    }

    findDynoNodesByName(name) {
        if (!this.dynoModel || typeof name !== 'string' || !name.trim()) {
            return [];
        }

        const matches = [];
        this.dynoModel.traverse((child) => {
            if (child?.name === name) {
                matches.push(child);
            }
        });
        return matches;
    }

    setDynoNodeVisible(name, visible) {
        const matches = this.findDynoNodesByName(name);
        if (!matches.length) {
            console.warn(`[Player] Dyno model node not found: "${name}"`);
            return false;
        }

        const nextVisible = visible === true;
        for (const node of matches) {
            node.visible = nextVisible;
        }
        return true;
    }

    setDynoNodeVisibility(nodeVisibility = {}) {
        if (!nodeVisibility || typeof nodeVisibility !== 'object') {
            return false;
        }

        let changed = false;
        for (const [name, visible] of Object.entries(nodeVisibility)) {
            changed = this.setDynoNodeVisible(name, visible === true) || changed;
        }
        return changed;
    }

    setModelNodeVisibility(nodeVisibility = {}) {
        return this.setDynoNodeVisibility(nodeVisibility);
    }

    showModelNodes(nodeNames = []) {
        if (!Array.isArray(nodeNames)) {
            return false;
        }

        let changed = false;
        for (const name of nodeNames) {
            changed = this.setDynoNodeVisible(name, true) || changed;
        }
        return changed;
    }

    hideModelNodes(nodeNames = []) {
        if (!Array.isArray(nodeNames)) {
            return false;
        }

        let changed = false;
        for (const name of nodeNames) {
            changed = this.setDynoNodeVisible(name, false) || changed;
        }
        return changed;
    }

    applyInitialDynoNodeVisibility() {
        const hiddenNodes = CONFIG.DYNO_MODEL?.hiddenNodesOnLoad;
        if (!Array.isArray(hiddenNodes)) {
            return;
        }

        this.hideModelNodes(hiddenNodes);
    }

    // Dyno fire breath removed for Dyno Sky

    setupMouthSocket(mouthObject) {
        this.mouthSocket?.removeFromParent();
        this.mouthSocket = null;

        if (!mouthObject?.add) {
            return;
        }

        this.mouthSocket = new THREE.Group();
        this.mouthSocket.name = 'DynoMouthSocket';
        mouthObject.add(this.mouthSocket);
        this.mouthSocket.position.set(0, 0, 0);
        this.mouthSocket.rotation.set(0, 0, 0);
        this.updateMouthSocketScaleCompensation();
    }

    updateMouthSocketScaleCompensation() {
        if (!this.mouthSocket?.parent) {
            return;
        }

        const parentWorldScale = new THREE.Vector3();
        this.mouthSocket.parent.updateWorldMatrix(true, false);
        this.mouthSocket.parent.getWorldScale(parentWorldScale);

        const safeScaleX = Math.abs(parentWorldScale.x) > 0.0001 ? 1 / parentWorldScale.x : 1;
        const safeScaleY = Math.abs(parentWorldScale.y) > 0.0001 ? 1 / parentWorldScale.y : 1;
        const safeScaleZ = Math.abs(parentWorldScale.z) > 0.0001 ? 1 / parentWorldScale.z : 1;

        this.mouthSocket.scale.set(safeScaleX, safeScaleY, safeScaleZ);
    }

    setupCarrySocket() {
        this.carrySocket?.removeFromParent();

        const footBone = this.findDynoBone('grab');
        this.carrySocket = new THREE.Group();
        this.carrySocket.name = 'DynoCarrySocket';

        // Carrying is anchored to the authored grab bone so phase 1 pickups follow the real
        // dyno animation without requiring any changes to the imported dyno rig or GLBs.
        if (footBone) {
            footBone.add(this.carrySocket);
            this.carrySocket.position.set(0, 0, 0);
            this.carrySocket.rotation.set(0, 0, 0);
            this.updateCarrySocketScaleCompensation();
//            console.info('[Player] Carry socket attached to dyno bone: grab');
            return;
        }

        this.dynoFitRoot.add(this.carrySocket);
        this.carrySocket.position.set(0, -1.3, 0.5);
        this.carrySocket.scale.set(1, 1, 1);
        console.warn('[Player] Carry socket fallback in use because grab bone was not found.');
    }

    updateCarrySocketScaleCompensation() {
        if (!this.carrySocket?.parent) {
            return;
        }

        const parentWorldScale = new THREE.Vector3();
        this.carrySocket.parent.updateWorldMatrix(true, false);
        this.carrySocket.parent.getWorldScale(parentWorldScale);

        const safeScaleX = Math.abs(parentWorldScale.x) > 0.0001 ? 1 / parentWorldScale.x : 1;
        const safeScaleY = Math.abs(parentWorldScale.y) > 0.0001 ? 1 / parentWorldScale.y : 1;
        const safeScaleZ = Math.abs(parentWorldScale.z) > 0.0001 ? 1 / parentWorldScale.z : 1;

        // The carry socket sits under the scaled dyno rig. Counter-scaling the socket keeps
        // carried level objects at the same world size they have while resting in the level.
        this.carrySocket.scale.set(safeScaleX, safeScaleY, safeScaleZ);
    }

    findDynoBone(name) {
        if (!this.dynoModel || !name) {
            return null;
        }

        let foundBone = null;
        this.dynoModel.traverse((child) => {
            if (foundBone || !child?.isBone || child.name !== name) {
                return;
            }

            foundBone = child;
        });

        return foundBone;
    }

    findDynoMouthObject() {
        if (!this.dynoModel) {
            return null;
        }

        const scoredCandidates = [];

        this.dynoModel.traverse((child) => {
            if (!child?.isObject3D) {
                return;
            }

            const normalizedName = (child.name || '').toLowerCase();
            if (!normalizedName) {
                return;
            }

            let score = 0;
            if (normalizedName.includes('mouth')) score += 100;
            if (normalizedName.includes('jaw')) score += 70;
            if (normalizedName.includes('snout')) score += 58;
            if (normalizedName.includes('muzzle')) score += 55;
            if (normalizedName.includes('head')) score += 30;
            if (normalizedName.includes('upper')) score += 4;
            if (normalizedName.includes('end')) score += 3;
            if (normalizedName.includes('ik')) score -= 20;
            if (normalizedName.includes('target')) score -= 25;

            if (score > 0) {
                scoredCandidates.push({ child, score });
            }
        });

        if (!scoredCandidates.length) {
            return null;
        }

        scoredCandidates.sort((a, b) => b.score - a.score);
        return scoredCandidates[0].child;
    }

    // Swaps the dyno's texture at runtime (called by DynoSkinShop on equip).
    setDynoTexture(texturePath) {
        DYNO_MODEL_SETTINGS.texturePath = texturePath;
        if (!this.dynoModel) return; // model not loaded yet — texturePath is set above so handleDynoLoaded will pick it up
        this.applyDynoTexture(this.dynoModel);
    }

    applyDynoTexture(dynoModel) {
        this.textureLoader.load(
            DYNO_MODEL_SETTINGS.texturePath,
            (texture) => {
                // glTF UVs expect external textures with flipY disabled in Three.js.
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.flipY = false;

                dynoModel.traverse((child) => {
                    if (!child.isMesh) {
                        return;
                    }

                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    for (const material of materials) {
                        if (!material) {
                            continue;
                        }

                        material.map = texture;
                        material.needsUpdate = true;
                    }
                });

//                console.info('[Player] Dyno texture applied:', DYNO_MODEL_SETTINGS.texturePath);
            },
            undefined,
            (error) => {
                console.warn('[Player] Failed to load dyno texture, keeping original materials.', error);
            }
        );
    }

    prepareDynoModel(dynoModel) {
        this.dynoFitRoot.clear();
        this.dynoFitRoot.rotation.set(
            DYNO_MODEL_SETTINGS.extraRotation.x,
            DYNO_MODEL_SETTINGS.extraRotation.y,
            DYNO_MODEL_SETTINGS.extraRotation.z
        );

            dynoModel.traverse((child) => {
            if (!child.isMesh) {
                return;
            }

            // Animated skinned meshes can disappear too early if frustum-culling stays on.
            child.frustumCulled = false;
            child.renderOrder = this.visualRenderOrder;

            const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
            const nextMaterials = sourceMaterials.map((material) => {
                if (!material) {
                    return material;
                }

                if (!DYNO_MODEL_SETTINGS.useUnlitMonotoneMaterial) {
                    // Let the dyno self-occlude correctly so wings and body parts do not
                    // visually render through each other during tight flight poses.
                    // The model already sits in front of the terrain via its world-space Z offset.
                    material.depthTest = true;
                    material.depthWrite = true;
                    return material;
                }

                const unlitMaterial = new THREE.MeshBasicMaterial({
                    color: new THREE.Color(DYNO_MODEL_SETTINGS.monotoneColor),
                    map: material.map ?? null,
                    transparent: material.transparent === true,
                    opacity: material.opacity ?? 1,
                    alphaTest: material.alphaTest ?? 0,
                    side: material.side ?? THREE.FrontSide,
                    depthTest: true,
                    depthWrite: true,
                    toneMapped: false,
                    fog: false
                });
                return unlitMaterial;
            });

            child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];
        });

        this.dynoFitRoot.add(dynoModel);

        // Use one explicit model scale instead of runtime auto-fit scaling.
        dynoModel.scale.setScalar(DYNO_MODEL_SETTINGS.modelScale);
        this.dynoFitRoot.updateMatrixWorld(true);

        const fittedBounds = this.getStaticModelBounds(this.dynoFitRoot);
        const fittedCenter = new THREE.Vector3();
        fittedBounds.getCenter(fittedCenter);

        this.dynoFitRoot.position.set(
            DYNO_MODEL_SETTINGS.fitOffset.x - fittedCenter.x,
            DYNO_MODEL_SETTINGS.baseOffsetY + DYNO_MODEL_SETTINGS.fitOffset.y + CONFIG.dynoGroundOffsetY,
            DYNO_MODEL_SETTINGS.fitOffset.z - fittedCenter.z
        );
        this.dynoFitRoot.updateMatrixWorld(true);
    }

    collectDynoMaterials() {
        this.dynoMaterialStates = [];
        if (!this.dynoModel) {
            return;
        }

        const seenMaterials = new Set();
        this.dynoModel.traverse((child) => {
            if (!child.isMesh) {
                return;
            }

            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of materials) {
                if (!material || seenMaterials.has(material)) {
                    continue;
                }

                seenMaterials.add(material);
                this.dynoMaterialStates.push({
                    material,
                    baseColor: material.color?.clone?.() || null,
                    baseEmissive: material.emissive?.clone?.() || null,
                    baseEmissiveIntensity: Number.isFinite(material.emissiveIntensity)
                        ? material.emissiveIntensity
                        : null
                });
            }
        });
    }

    getStaticModelBounds(root) {
        const bounds = new THREE.Box3();
        const childBounds = new THREE.Box3();
        let hasBounds = false;

        root.updateMatrixWorld(true);

        root.traverse((child) => {
            if (!child.isMesh || !child.geometry) {
                return;
            }

            if (!child.geometry.boundingBox) {
                child.geometry.computeBoundingBox();
            }

            if (!child.geometry.boundingBox) {
                return;
            }

            childBounds.copy(child.geometry.boundingBox);
            childBounds.applyMatrix4(child.matrixWorld);

            if (!hasBounds) {
                bounds.copy(childBounds);
                hasBounds = true;
                return;
            }

            bounds.union(childBounds);
        });

        if (!hasBounds) {
            return new THREE.Box3(
                new THREE.Vector3(-0.5, -0.5, -0.5),
                new THREE.Vector3(0.5, 0.5, 0.5)
            );
        }

        return bounds;
    }

    setupAnimations(clips) {
        const clipNames = clips.map((clip) => clip.name || '(unnamed)');
//        console.info('[Player] Dyno clips found:', clipNames);

        if (!clips.length) {
            return;
        }

        this.animationMixer = new THREE.AnimationMixer(this.dynoModel);
        this.animationMixer.addEventListener('finished', (event) => this.handleAnimationFinished(event));
        this.animationClipActions.clear();
        this.animationClipActionsNormalized.clear();

        for (const clip of clips) {
            const action = this.animationMixer.clipAction(clip);
            action.enabled = true;
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(1);

            const clipName = clip.name || '';
            if (!clipName) {
                continue;
            }

            this.animationClipActions.set(clipName, action);
            const normalizedClipName = this.normalizeClipName(clipName);
            if (normalizedClipName && !this.animationClipActionsNormalized.has(normalizedClipName)) {
                this.animationClipActionsNormalized.set(normalizedClipName, action);
            }
        }

        this.stateClipMap = this.buildStateClipMap(clips);
        const chosenClips = {};

        for (const [state, clip] of Object.entries(this.stateClipMap)) {
            chosenClips[state] = clip ? clip.name : null;

            if (!clip) {
                continue;
            }

            const action = this.animationClipActions.get(clip.name) || this.animationMixer.clipAction(clip);
            this.animationActions[state] = action;
        }

        this.ensureRequiredAnimationClips();

//        console.info('[Player] Chosen dyno clips per state:', chosenClips);
        this.playLoopAnimation(this.getPreferredLoopState());
    }

    ensureRequiredAnimationClips() {
        if (!this.animationActions.drag) {
            throw new Error('[Player] Missing required dyno animation clip: drag-loop (state "drag").');
        }
        if (!this.animationActions.dragIdle) {
            throw new Error('[Player] Missing required dyno animation clip: drag_idle-loop (state "dragIdle").');
        }
    }

    buildStateClipMap(clips) {
        const clipEntries = clips.map((clip) => ({
            clip,
            normalizedName: this.normalizeClipName(clip.name || '')
        }));
        const stateClipMap = {};

        for (const state of Object.keys(DYNO_MODEL_SETTINGS.clipOverrides)) {
            stateClipMap[state] = this.findClipForState(state, clipEntries);
        }

        return stateClipMap;
    }

    findClipForState(state, clipEntries) {
        const overrideName = DYNO_MODEL_SETTINGS.clipOverrides[state];
        if (overrideName) {
            const overrideNormalized = this.normalizeClipName(overrideName);
            const overrideMatch = clipEntries.find((entry) => (
                entry.normalizedName === overrideNormalized ||
                entry.normalizedName.includes(overrideNormalized)
            ));

            if (overrideMatch) {
                return overrideMatch.clip;
            }

            console.warn(`[Player] Manual clip override "${overrideName}" for ${state} was not found. Falling back to automatic matching.`);
        }

        const hints = DYNO_MODEL_SETTINGS.clipHints[state] || [];
        for (const hint of hints) {
            const match = this.pickBestClipForHint(hint, clipEntries);
            if (match) {
                return match.clip;
            }
        }

        return null;
    }

    pickBestClipForHint(hint, clipEntries) {
        const normalizedHint = this.normalizeClipName(hint);
        const candidates = clipEntries
            .map((entry) => ({
                ...entry,
                score: this.scoreClipMatch(normalizedHint, entry.normalizedName)
            }))
            .filter((entry) => entry.score > 0)
            .sort((a, b) => b.score - a.score);

        return candidates[0] || null;
    }

    scoreClipMatch(normalizedHint, normalizedName) {
        if (!normalizedHint || !normalizedName || normalizedName.includes('tpose')) {
            return 0;
        }

        let score = 0;

        if (normalizedName === normalizedHint) {
            score += 100;
        }
        if (normalizedName.startsWith(normalizedHint)) {
            score += 40;
        }
        if (normalizedName.includes(normalizedHint)) {
            score += 20;
        }
        if (normalizedName.includes('loop')) {
            score += 5;
        }
        if (normalizedName.includes('turn')) {
            score -= 4;
        }
        if (normalizedName.includes('dive')) {
            score -= 6;
        }

        score -= normalizedName.length * 0.01;
        return score;
    }

    normalizeClipName(name) {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    getCombinedInput() {
        const out = this._scratchInput || (this._scratchInput = { x: 0, y: 0 });
        if (this.isInputLocked()) {
            out.x = 0; out.y = 0;
            return out;
        }

        if (this.isAutoInteractionActive()) {
            // Auto interaction owns movement briefly so joystick/keyboard direction cannot pull
            // the dyno away while grab or the mouth is being aligned to an object anchor.
            out.x = 0; out.y = 0;
            return out;
        }

        out.x = Math.abs(this.joystick.x) < 0.001 ? 0 : this.joystick.x;
        out.y = Math.abs(this.joystick.y) < 0.001 ? 0 : this.joystick.y;

        if (this.isPullDraggingObject()) {
            out.y = 0;
        }
        return out;
    }

    getBackwardOnlyDragInput(input) {
        return {
            x: input.x,
            y: 0
        };
    }

    logPositionChange() {
        if (this.doDebug === false) return;
        const signature = [
            this.position.x.toFixed(2),
            this.position.y.toFixed(2),
            this.position.z.toFixed(2)
        ].join('|');

        this.logDebugChange(
            'position',
            signature,
            `[Player] Position: x=${this.position.x.toFixed(2)} y=${this.position.y.toFixed(2)} z=${this.position.z.toFixed(2)}`,
            false
        );
    }

    isFireInputDown() {
        if (this.isInputLocked()) {
            return false;
        }

        return this.joystick?.fireButtonDown === true;
    }

    canUseFlame() {
        return false;
    }

    setRewardedFlameBoostActive(isActive) {
        void isActive;
    }

    isFlameActive() {
        return false;
    }

    startFlame() {
        return false;
    }

    stopFlame() {
        this.audioManager?.stopLoop?.('flameLoop');
    }

    // --- Dyno Fury ultimate charge ---------------------------------------
    updateFuryCharge(dt) {
        const fury = CONFIG.FURY || {};
        if (fury.enabled === false || !(dt > 0)) {
            return;
        }
        let gain = (fury.chargePerSecondPassive ?? 0) * dt;
        if (this.lastEnergyDrainAmount > 0 && this.energyDrainValue > 0) {
            gain += (this.lastEnergyDrainAmount / this.energyDrainValue) * (fury.chargePerSpeedSecond ?? 0);
        }
        if (gain > 0) {
            this.furyCharge = Math.min(1, (this.furyCharge || 0) + gain);
        }
    }

    addFuryCharge(amount) {
        if (amount > 0) {
            this.furyCharge = Math.min(1, (this.furyCharge || 0) + amount);
        }
    }

    getFuryProgress() {
        return THREE.MathUtils.clamp(this.furyCharge || 0, 0, 1);
    }

    isFuryReady() {
        return CONFIG.FURY?.enabled !== false &&
            (this.furyCharge || 0) >= 1 - 1e-6 &&
            !this.isDeadState &&
            !this.isReviving &&
            !this.timelineAnimationControlled;
    }

    // Spends a full charge. Returns true if the ability fired.
    consumeFury() {
        if (!this.isFuryReady()) {
            return false;
        }
        this.furyCharge = 0;
        return true;
    }

    consumeFlameResource(amount) {
        void amount;
        return 0;
    }

    consumeEnergyResource(amount) {
        if (!Number.isFinite(amount) || amount <= 0) {
            return 0;
        }
        const previousValue = this.currentEnergyValue;
        this.currentEnergyValue = Math.max(0, previousValue - amount);
        const drainedAmount = Math.max(0, previousValue - this.currentEnergyValue);
        this.lastEnergyDrainAmount += drainedAmount;
        return drainedAmount;
    }

    updateFlameResource(delta) {
        void delta;
    }

    getFlameDepletedCount() {
        return 0;
    }

    getEnergyDepletedCount() {
        return Math.max(0, Number.isFinite(this.energyDepletedCount) ? this.energyDepletedCount : 0);
    }

    setRewardedSpeedBoostActive(isActive) {
        const nextActive = Boolean(isActive);
        if (this.rewardedSpeedBoostActive === nextActive) {
            return;
        }
        this.rewardedSpeedBoostActive = nextActive;
        if (nextActive) {
            this.currentEnergyValue = this.maxEnergyValue;
        }
    }

    getFlameProgress() {
        return 0;
    }

    isEnergyBoostButtonDown() {
        // Reuse the existing bottom-right UI button as hold-to-boost input.
        return this.joystick?.speedButtonDown === true;
    }

    hasEnergyBoostMovementIntent() {
        const boostInputDeadZone = 0.05;
        return Math.abs(this.currentInput?.x ?? 0) > boostInputDeadZone ||
            Math.abs(this.currentInput?.y ?? 0) > boostInputDeadZone;
    }

    hasEnergyBoostVelocity() {
        // Drain/boost only while the dyno is actually moving in any direction.
        return Math.hypot(this.velocity.x, this.velocity.y) > 0.05;
    }

    canUseEnergyBoost() {
        if (this.isInputLocked() || this.isFaintSequenceActive) {
            return false;
        }
        if (!this.isEnergyBoostButtonDown() || !this.hasEnergyBoostMovementIntent() || !this.hasEnergyBoostVelocity()) {
            return false;
        }
        if (this.rewardedSpeedBoostActive) {
            return true;
        }
        return this.energyEmptyTimer <= 0 && this.currentEnergyValue > 0.0001;
    }

    isEnergyBoostActive() {
        return this.energyBoostActive;
    }

    refreshEnergyBoostState() {
        this.energyBoostActive = this.canUseEnergyBoost();
    }

    getCurrentSpeedMultiplier() {
        return this.isEnergyBoostActive() ? this.energySpeedMultiplier : 1;
    }

    updateEnergyResource(delta) {
        if (!Number.isFinite(delta) || delta <= 0) {
            return;
        }

        this.lastEnergyDrainAmount = 0;
        this.refreshEnergyBoostState();
        const maxEnergy = Math.max(this.maxEnergyValue, 0);
        if (maxEnergy <= 0) {
            this.currentEnergyValue = 0;
            this.energyBoostActive = false;
            return;
        }

        if (this.rewardedSpeedBoostActive) {
            this.currentEnergyValue = maxEnergy;
        } else if (this.energyBoostActive) {
            // Energy drains only during active boost while input + velocity confirm movement.
            this.consumeEnergyResource(this.energyDrainValue * delta);
            if (this.currentEnergyValue <= 0) {
                this.currentEnergyValue = 0;
                this.energyBoostActive = false;
                this.energyDepletedCount += 1;
                this.energyEmptyTimer = this.energyEmptyDuration;
            }
        } else {
            // Hold off refill while the empty-penalty timer is still counting down.
            if (this.energyEmptyTimer > 0) {
                this.energyEmptyTimer = Math.max(0, this.energyEmptyTimer - delta);
            } else {
                // Automatic refill whenever boost is not actively consuming energy.
                this.currentEnergyValue += this.energyFillSpeed * delta;
            }
        }

        this.currentEnergyValue = THREE.MathUtils.clamp(this.currentEnergyValue, 0, maxEnergy);
    }

    getEnergyProgress() {
        if (this.maxEnergyValue <= 0) {
            return 0;
        }

        // UI progress is normalized from current value over max value.
        return THREE.MathUtils.clamp(this.currentEnergyValue / this.maxEnergyValue, 0, 1);
    }

    updateHealthResource(delta) {
        if (!Number.isFinite(delta) || delta <= 0) {
            return;
        }

        const maxHealth = Math.max(this.maxHealthValue, 0);
        if (maxHealth <= 0) {
            this.currentHealthValue = 0;
            this.gameOverReady = true;
            return;
        }

        // Health regen is optional: when healthFillSpeed is 0, no refill is applied.
        if (this.healthFillSpeed > 0 && !this.gameOverReady && this.currentHealthValue < maxHealth) {
            this.currentHealthValue += this.healthFillSpeed * delta;
            this.currentHealthValue = THREE.MathUtils.clamp(this.currentHealthValue, 0, maxHealth);
        }
    }

    applyDamage(amount, type = 'generic', options = {}) {
        if (!Number.isFinite(amount) || amount <= 0 || this.isDead()) {
            return false;
        }

        if (type === 'missile') {
            const nowSeconds = typeof performance !== 'undefined' && performance?.now
                ? performance.now() / 1000
                : Date.now() / 1000;
            const cooldownSeconds = Math.max(
                0,
                CONFIG.DYNO_HEALTH?.missileDamageCooldownSeconds ?? 0.35
            );
            if (nowSeconds - this.lastMissileDamageTime < cooldownSeconds) {
                return false;
            }
            this.lastMissileDamageTime = nowSeconds;
        }

        const maxHealth = Math.max(this.maxHealthValue, 0);
        if (maxHealth <= 0) {
            this.currentHealthValue = 0;
            this.gameOverReady = true;
            return true;
        }

        this.currentHealthValue = THREE.MathUtils.clamp(this.currentHealthValue - amount, 0, maxHealth);
        this.applyHitPush(options.projectileDirection, amount);
        this.spawnDynoHitImpactEffect(options.impactPosition, options.projectileDirection);
        this.triggerDynoHitFlash();
        this.audioManager?.play?.('dynoHit', { volume: 0.85, cooldown: 0.08 });
        if (this.currentHealthValue <= 0) {
            this.currentHealthValue = 0;
            this.beginDeathFlow();
        }
        return true;
    }

    triggerDynoHitFlash() {
        if (!this.dynoMaterialStates.length) {
            return;
        }

        // Repeated hits restart the flash at full strength instead of stacking material changes.
        this.hitFlashElapsed = 0;
        this.hitFlashActive = true;
        this.updateDynoHitFlash(0);
    }

    updateDynoHitFlash(delta) {
        if (!this.hitFlashActive) {
            return;
        }

        const flashConfig = CONFIG.DYNO_HIT_FLASH || {};
        const duration = Math.max(flashConfig.hitFlashDuration ?? 0.12, 0.001);
        this.hitFlashElapsed += Math.max(delta, 0);
        const progress = THREE.MathUtils.clamp(this.hitFlashElapsed / duration, 0, 1);
        const fade = 1 - progress;
        const flashColor = new THREE.Color(flashConfig.hitFlashColor ?? 0xffffff);
        const tintColor = new THREE.Color(flashConfig.hitFlashTintColor ?? flashConfig.hitFlashColor ?? 0xff4a2a);
        const flashIntensity = Math.max(flashConfig.hitFlashIntensity ?? 1.5, 0);

        for (const state of this.dynoMaterialStates) {
            const material = state.material;
            if (!material) {
                continue;
            }

            if (state.baseEmissive && material.emissive) {
                // Emissive is ideal for damage flashes because it brightens without changing
                // lighting or gameplay state; the fade drops back to the exact stored value.
                material.emissive.copy(state.baseEmissive).lerp(flashColor, fade);
                material.emissiveIntensity = (state.baseEmissiveIntensity ?? 0) + (flashIntensity * fade);
            } else if (state.baseColor && material.color) {
                // MeshBasicMaterial has no emissive channel. Since the dyno's normal color is
                // white, a separate warm tint is used so the flash remains visible on textures.
                material.color.copy(state.baseColor).lerp(tintColor, fade);
            }

            material.needsUpdate = true;
        }

        if (progress >= 1) {
            this.restoreDynoHitFlashMaterials();
        }
    }

    restoreDynoHitFlashMaterials() {
        for (const state of this.dynoMaterialStates) {
            const material = state.material;
            if (!material) {
                continue;
            }

            if (state.baseEmissive && material.emissive) {
                material.emissive.copy(state.baseEmissive);
                if (state.baseEmissiveIntensity != null) {
                    material.emissiveIntensity = state.baseEmissiveIntensity;
                }
            }
            if (state.baseColor && material.color) {
                material.color.copy(state.baseColor);
            }

            material.needsUpdate = true;
        }

        this.hitFlashActive = false;
        this.hitFlashElapsed = 0;
    }

    spawnDynoHitImpactEffect(impactPosition, projectileDirection) {
        void impactPosition;
        void projectileDirection;
        return false;
    }

    computeHitPushDistance(damage) {
        const pushConfig = CONFIG.DYNO_HIT_PUSH || {};
        const minDistance = Math.max(pushConfig.minHitPushDistance ?? 0.2, 0);
        const maxDistance = Math.max(pushConfig.maxHitPushDistance ?? 1.2, minDistance);
        const referenceDamage = Math.max(pushConfig.referenceDamage ?? 50, 0.0001);
        const damageRatio = THREE.MathUtils.clamp(damage / referenceDamage, 0, 1);

        // Damage drives push strength so small bullets nudge while heavier projectiles read
        // as stronger impacts, with a hard cap for predictable gameplay.
        return THREE.MathUtils.lerp(minDistance, maxDistance, damageRatio);
    }

    getHitPushStepCount() {
        return Math.max(1, Math.floor(CONFIG.DYNO_HIT_PUSH?.hitPushStepCount ?? 6));
    }

    normalizeHitPushDirection(projectileDirection, out = new THREE.Vector2()) {
        const x = Number.isFinite(projectileDirection?.x) ? projectileDirection.x : 0;
        const y = Number.isFinite(projectileDirection?.y) ? projectileDirection.y : 0;
        out.set(x, y);
        if (out.lengthSq() <= 0.0001) {
            return null;
        }

        return out.normalize();
    }

    projectHitPushAlongGround(direction, out = new THREE.Vector2()) {
        const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        const groundAngle = Number.isFinite(groundInfo?.angle) ? groundInfo.angle : 0;
        const tangent = new THREE.Vector2(Math.cos(groundAngle), Math.sin(groundAngle));
        const alongSlope = direction.dot(tangent);
        if (Math.abs(alongSlope) <= 0.0001) {
            return null;
        }

        // Grounded knockback follows the walkable surface. This strips the "push into the
        // floor" part of downward impacts while preserving left/right energy on slopes.
        return out.copy(tangent).multiplyScalar(Math.sign(alongSlope)).normalize();
    }

    applyHitPush(projectileDirection, damage) {
        const direction = this.normalizeHitPushDirection(projectileDirection);
        if (!direction || !Number.isFinite(damage) || damage <= 0) {
            return false;
        }

        const pushDistance = this.computeHitPushDistance(damage);
        if (pushDistance <= 0) {
            return false;
        }

        const resolvedDirection = this.onGround
            ? this.projectHitPushAlongGround(direction)
            : direction;
        if (!resolvedDirection) {
            return false;
        }

        const desiredOffset = new THREE.Vector2(
            resolvedDirection.x * pushDistance,
            resolvedDirection.y * pushDistance
        );

        return this.resolveHitPushAgainstCollision(desiredOffset);
    }

    resolveHitPushAgainstCollision(offset) {
        if (!offset || offset.lengthSq() <= 0.000001) {
            return false;
        }

        const wasGrounded = this.onGround;
        const steps = this.getHitPushStepCount();
        const stepOffset = offset.clone().multiplyScalar(1 / steps);
        let moved = false;

        // Step-based resolution allows partial knockback and avoids tunneling through thin
        // solids. Each accepted step leaves the dyno in a valid placement.
        for (let step = 0; step < steps; step += 1) {
            const candidateX = this.position.x + stepOffset.x;
            const candidateY = this.position.y + stepOffset.y;
            const resolvedPosition = wasGrounded
                ? this.resolveGroundedHitPushPosition(candidateX)
                : this.resolveAirborneHitPushPosition(candidateX, candidateY, stepOffset.x);

            if (!resolvedPosition || !this.isValidDynoPosition(resolvedPosition, {
                grounded: wasGrounded,
                movementX: stepOffset.x
            })) {
                break;
            }

            this.position.copy(resolvedPosition);
            moved = true;
        }

        if (moved && wasGrounded) {
            this.velocity.y = 0;
        }

        return moved;
    }

    resolveGroundedHitPushPosition(candidateX) {
        const currentGroundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        const nextGroundInfo = this.getGroundInfoAt(candidateX, this.position.y);
        if (!this.canStayGroundedOnSurface(currentGroundInfo, nextGroundInfo)) {
            return null;
        }

        const candidateY = nextGroundInfo.surfaceHeight + PLAYER_RADIUS;
        return new THREE.Vector3(candidateX, candidateY, this.position.z);
    }

    resolveAirborneHitPushPosition(candidateX, candidateY, movementX = 0) {
        return new THREE.Vector3(candidateX, candidateY, this.position.z);
    }

    isValidDynoPosition(position, options = {}) {
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
            return false;
        }

        const bounds = this.getFlightBounds();
        if (
            position.x < bounds.left ||
            position.x > bounds.right ||
            position.y < bounds.bottom ||
            position.y > bounds.top
        ) {
            return false;
        }

        if (options.grounded) {
            return !this.isGroundedPositionBlockedAt(position.x, position.y);
        }

        // Airborne push may follow projectile direction directly, but the final body samples
        // still use the same solid-tile checks as regular airborne movement.
        return !this.isPositionBlockedAt(position.x, position.y, {
            ignoreGroundTiles: false,
            movementDirX: Math.sign(options.movementX ?? 0)
        });
    }

    isDead() {
        return this.isDeadState || this.gameOverReady || this.currentHealthValue <= 0;
    }

    isGameOverAnimationFinished() {
        return this.gameOverAnimationFinished === true;
    }

    isInputLocked() {
        // Death and revive animation flows own movement/combat/interaction.
        return this.gameplayInputLocked || this.isDeadState || this.isReviving;
    }

    setGameplayInputLocked(isLocked) {
        this.gameplayInputLocked = isLocked === true;
        if (!this.gameplayInputLocked) {
            return;
        }

        this.currentInput = { x: 0, y: 0 };
        this.energyBoostActive = false;
        this.fireButtonWasDown = false;
        this.stopFlame();
        this.joystick?.reset?.();
        this.joystick?.releaseFireButton?.();
        this.joystick?.releasePickupDropButton?.();
        this.joystick?.releaseSpeedButton?.();
    }

    getTimelineTransformTarget() {
        return this.mesh;
    }

    resetTimelineVisualPivots() {
        this.dynoFlightTurnPivot.rotation.set(0, 0, 0);
        this.dynoTiltPivot.rotation.set(0, 0, 0);
        this.dynoTurnPivot.rotation.set(0, 0, 0);
        this.dynoFacingPivot.rotation.set(0, 0, 0);
    }

    onTimelineTransformUpdated(target = this.mesh) {
        if (!target) {
            return;
        }

        this.resetTimelineVisualPivots();
        this.position.copy(target.position);

        // Keep lastFacingDirection in sync with the ry the timeline is driving.
        const leftYaw = DYNO_MODEL_SETTINGS.facingYaw.left;
        const rightYaw = DYNO_MODEL_SETTINGS.facingYaw.right;
        const ry = target.rotation.y;
        const distToLeft = Math.abs(((ry - leftYaw) + Math.PI) % (2 * Math.PI) - Math.PI);
        const distToRight = Math.abs(((ry - rightYaw) + Math.PI) % (2 * Math.PI) - Math.PI);
        this.lastFacingDirection = distToLeft <= distToRight ? -1 : 1;
    }

    setTimelineAnimationControlled(isControlled) {
        const nextControlled = isControlled === true;
        if (this.timelineAnimationControlled === nextControlled) {
            return;
        }

        this.timelineAnimationControlled = nextControlled;
        this.transitionAction = null;
        this.queuedLoopState = null;

        if (nextControlled) {
            this.resetTimelineVisualPivots();
            this.currentInput = { x: 0, y: 0 };
            this.energyBoostActive = false;
            this.stopFlame();
            this.stopGameplayAudioLoops();
            this.resetHoverAnimationBlend();
            return;
        }

        // Preserve the facing direction the timeline left the dyno in.
        const timelineFinalRy = this.mesh.rotation.y;
        const leftYaw = DYNO_MODEL_SETTINGS.facingYaw.left;
        const rightYaw = DYNO_MODEL_SETTINGS.facingYaw.right;
        const distToLeft = Math.abs(((timelineFinalRy - leftYaw) + Math.PI) % (2 * Math.PI) - Math.PI);
        const distToRight = Math.abs(((timelineFinalRy - rightYaw) + Math.PI) % (2 * Math.PI) - Math.PI);
        this.lastFacingDirection = distToLeft <= distToRight ? -1 : 1;
        this.dynoFacingPivot.rotation.y = this.lastFacingDirection > 0 ? rightYaw : leftYaw;

        this.mesh.rotation.set(0, 0, 0);
        this.playLoopAnimation(this.getPreferredLoopState());
    }

    resetForLevel(level) {
        this.ground = level || this.ground;
        this.waterPolygonCache = null; // rebuild on next water check
        this.waterZoneRectCache = null;
        this.currentWaterPolygonEntry = null;
        this.isInWater = false;
        this.waterState = null;
        this.levelObjectManager = null;
        this.currentInput = { x: 0, y: 0 };
        this.velocity.set(0, 0, 0);
        this.actualHorizontalSpeed = 0;
        this.energyBoostActive = false;
        this.fireButtonWasDown = false;
        this.stopFlame();
        this.cancelAutoPickup();
        this.cancelAutoDrag();
        this.releaseDraggedObject({ force: true });
        this.dropCarriedObject({ force: true });
        this.releaseGrabbedObject({ force: true });
        this.cancelTurn();
        this.cancelFlightTurn();

        this.currentHealthValue = this.maxHealthValue;
        this.energyEmptyTimer = 0;
        this.gameOverReady = false;
        this.isDeadState = false;
        this.deathState = null;
        this.gameOverAnimationFinished = false;
        this.deathGroundedAction = null;
        this.isReviving = false;
        this.reviveAction = null;
        this.airMode = 'hover';
        this.airHoverRecoveryLock = false;
        this.airborneAnimationState = 'hover';
        this.onGround = true;
        this.currentGroundTilt = 0;
        this.targetGroundTilt = 0;
        this.groundTravelDistance = 0;
        this.lastFootstepDistance = 0;
        this.resetFireballCooldown();

        const spawnConfig = CONFIG.spawnPosition || {};
        const spawnX = Number.isFinite(spawnConfig.x) ? spawnConfig.x : 0;
        const spawnZ = Number.isFinite(spawnConfig.z) ? spawnConfig.z : 1;
        const configuredSpawnY = Number.isFinite(spawnConfig.y) ? spawnConfig.y : null;
        const spawnProbeY = configuredSpawnY == null
            ? this.getFlightCeilingHeight()
            : this.getGroundProbeY(configuredSpawnY);
        const spawnGroundInfo = this.getGroundInfoBelowAt(spawnX, spawnProbeY);
        const spawnY = Number.isFinite(spawnGroundInfo?.surfaceHeight)
            ? spawnGroundInfo.surfaceHeight + PLAYER_RADIUS
            : (configuredSpawnY ?? PLAYER_RADIUS);

        this.position.set(spawnX, spawnY, spawnZ);
        this.mesh.position.copy(this.position);
        this.updateGroundAlignment(0);
        this.updateGroundContact(spawnGroundInfo);
        this.playLoopAnimation(this.getGroundAnimationState());
    }

    getDeathConfig() {
        return CONFIG.DYNO_DEATH || {};
    }

    beginDeathFlow() {
        if (this.isDeadState) {
            return;
        }

        this.currentHealthValue = 0;
        this.gameOverReady = true;
        this.isDeadState = true;
        this.gameOverAnimationFinished = false;
        this.deathGroundedAction = null;
        this.deathFallElapsed = 0;
        this.deathFallStartAngle = this.currentGroundTilt;
        this.deathFallingVisualAngle = this.currentGroundTilt;

        // Death locks all controls immediately and clears any active combat/interaction actions.
        this.currentInput = { x: 0, y: 0 };
        this.energyBoostActive = false;
        this.fireButtonWasDown = false;
        this.stopFlame();
        if (this.joystick) {
            this.joystick.releaseFireButton?.();
            this.joystick.releasePickupDropButton?.();
            this.joystick.releaseSpeedButton?.();
        }
        this.cancelAutoPickup();
        this.cancelAutoDrag();
        this.releaseDraggedObject({ force: true });
        this.dropCarriedObject({ force: true });
        this.releaseGrabbedObject({ force: true });
        this.cancelTurn();
        this.cancelFlightTurn();
        this.isFainting = false;
        this.isFaintSequenceActive = false;
        this.isFaintConditionActive = false;
        this.hasWokenFromFaint = false;
        this.faintAnimationAction = null;

        // Air vs ground death is chosen once at the moment health reaches 0.
        if (this.onGround) {
            this.enterGroundedDeathState();
        } else {
            this.enterAirborneDeathState();
        }
    }

    enterAirborneDeathState() {
        this.deathState = 'falling';
        this.onGround = false;
        this.airMode = 'fly';
        this.airborneAnimationState = 'deadFalling';
        this.deathFallStartAngle = this.currentGroundTilt;
        this.deathFallingVisualAngle = this.currentGroundTilt;
        this.deathFallElapsed = 0;
        this.playLoopAnimation('deadFalling');
    }

    enterGroundedDeathState() {
        this.deathState = 'grounded';
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        if (groundInfo) {
            this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
            this.setTargetGroundTilt(groundInfo.angle ?? 0, { snapVisual: true });
        }
        this.playDeadGroundAnimation();
    }

    playDeadGroundAnimation() {
        const resolvedState = this.resolveStateWithFallback('dead');
        if (!resolvedState) {
            this.gameOverAnimationFinished = true;
            return;
        }

        this.transitionAction = null;
        this.queuedLoopState = null;
        this.playAnimation(resolvedState, DYNO_MODEL_SETTINGS.fadeDuration, true);
        this.deathGroundedAction = this.animationActions[resolvedState] || null;

        if (!this.deathGroundedAction) {
            this.gameOverAnimationFinished = true;
        }
    }

    updateDeathState(dt) {
        if (!this.isDeadState) {
            return;
        }

        if (this.deathState === 'falling') {
            this.updateAirborneDeathState(dt);
            return;
        }

        if (this.deathState === 'grounded') {
            this.velocity.set(0, 0, 0);
            this.onGround = true;
            const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
            if (groundInfo) {
                this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
            }
        }
    }

    updateAirborneDeathState(dt) {
        const deathConfig = this.getDeathConfig();
        const rotateDuration = Math.max(deathConfig.deathFallRotateDuration ?? 0.5, 0.001);
        const rotateTargetAngle = Number.isFinite(deathConfig.deathFallTargetAngle)
            ? deathConfig.deathFallTargetAngle
            : -Math.PI / 2;
        const fallAcceleration = Math.max(deathConfig.deathFallAcceleration ?? 20, 0);
        const maxFallSpeed = Math.max(deathConfig.deathMaxFallSpeed ?? 18, 0.01);

        this.deathFallElapsed += dt;
        const rotateProgress = THREE.MathUtils.clamp(this.deathFallElapsed / rotateDuration, 0, 1);
        this.deathFallingVisualAngle = THREE.MathUtils.lerp(
            this.deathFallStartAngle,
            rotateTargetAngle,
            THREE.MathUtils.smoothstep(rotateProgress, 0, 1)
        );

        this.velocity.x = this.moveToward(this.velocity.x, 0, fallAcceleration * 0.35 * dt);
        this.velocity.y = Math.max(Math.min(this.velocity.y, 0) - (fallAcceleration * dt), -maxFallSpeed);

        const landed = this.moveAirborneWithCollisions(this.velocity.x * dt, this.velocity.y * dt);
        if (!landed) {
            this.onGround = false;
            this.airMode = 'fly';
            this.airborneAnimationState = 'deadFalling';
            return;
        }

        this.handleAirDeathGroundImpact();
    }

    handleAirDeathGroundImpact() {
        const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        if (groundInfo) {
            this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
            this.setTargetGroundTilt(groundInfo.angle ?? 0, { snapVisual: true });
        }
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        this.enterGroundedDeathState();
    }

    startReviveFlow() {
        if (!this.isDeadState || !this.gameOverAnimationFinished || this.isReviving) {
            return false;
        }

        this.isDeadState = false;
        this.isReviving = true;
        this.gameOverReady = false;
        this.gameOverAnimationFinished = false;
        this.deathState = null;
        this.deathGroundedAction = null;
        this.currentHealthValue = this.maxHealthValue;
        this.velocity.set(0, 0, 0);
        this.currentInput = { x: 0, y: 0 };
        this.energyBoostActive = false;
        this.stopFlame();
        this.cancelTurn();
        this.cancelFlightTurn();
        this.onGround = true;
        this.airMode = 'hover';
        this.airHoverRecoveryLock = false;
        this.airborneAnimationState = 'hover';

        const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        if (groundInfo) {
            this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
            this.setTargetGroundTilt(groundInfo.angle ?? 0, { snapVisual: true });
        }

        return this.playReviveAnimation();
    }

    playReviveAnimation() {
        const resolvedState = this.resolveStateWithFallback('revive');
        if (!resolvedState) {
            this.finishReviveFlow();
            return false;
        }

        this.transitionAction = null;
        this.queuedLoopState = null;
        this.playAnimation(resolvedState, DYNO_MODEL_SETTINGS.fadeDuration, true);
        this.reviveAction = this.animationActions[resolvedState] || null;

        if (!this.reviveAction) {
            this.finishReviveFlow();
            return false;
        }

        return true;
    }

    updateReviveState(dt) {
        if (!this.isReviving) {
            return;
        }

        this.velocity.set(0, 0, 0);
        this.onGround = true;
        const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        if (groundInfo) {
            this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
        }

        if (this.reviveAction?.isRunning?.() === false) {
            this.finishReviveFlow();
        }
    }

    finishReviveFlow() {
        this.isReviving = false;
        this.reviveAction = null;
        this.currentHealthValue = this.maxHealthValue;
        this.gameOverReady = false;
        this.gameOverAnimationFinished = false;
        this.deathState = null;
        this.deathGroundedAction = null;
        this.velocity.set(0, 0, 0);
        this.onGround = true;
        this.airMode = 'hover';
        this.airHoverRecoveryLock = false;
        this.airborneAnimationState = 'hover';
        this.playLoopAnimation(this.getGroundAnimationState());
    }

    getHealthProgress() {
        if (this.maxHealthValue <= 0) {
            return 0;
        }

        return THREE.MathUtils.clamp(this.currentHealthValue / this.maxHealthValue, 0, 1);
    }

    getDynoCollisionAnchorWorldPosition(target = new THREE.Vector3()) {
        const anchor = this.dynoCollisionAnchor || this.mesh;
        anchor.updateWorldMatrix?.(true, false);
        return anchor.getWorldPosition(target);
    }

    getWorldCollisionCircle() {
        // Circle collision for projectile tests based on PLAYER_RADIUS.
        const worldPosition = this.getDynoCollisionAnchorWorldPosition(new THREE.Vector3());
        return {
            centerX: worldPosition.x,
            centerY: worldPosition.y,
            radius: PLAYER_RADIUS
        };
    }
  
    getDynoCollisionTransform() {
        const collisionCircle = this.getWorldCollisionCircle();
        const facingSign = this.lastFacingDirection >= 0 ? 1 : -1;
        const angle = (this.currentGroundTilt ?? 0) * facingSign;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            centerX: collisionCircle.centerX,
            centerY: collisionCircle.centerY,
            facingSign,
            angle,
            cos,
            sin
        };
    }

    getDynoCollisionTransform2(carriedRect) 
    {        
        const facingSign = this.lastFacingDirection >= 0 ? 1 : -1;     
        const angle = -0.135 * facingSign;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            centerX: 0,
            centerY: carriedRect.halfHeight + 1.35,
            facingSign,
            angle,
            cos,
            sin
        };
    }    

/*    
    getDynoCollisionTransform2() {
        const facingSign = this.lastFacingDirection >= 0 ? 1 : -1;
        const socket = this.carrySocket;

        if (!socket) {
            return this.getDynoCollisionTransform();
        }

        socket.updateWorldMatrix(true, false);
        const worldPos = socket.getWorldPosition(new THREE.Vector3());

        // Derive the XY-plane angle from the carry socket's world orientation,
        // cancelling out the Y-flip that the facing direction introduces.
        // Result uses the same sign convention as getDynoCollisionTransform:
        // positive = nose-up tilt in body space, mirrored by facingSign.
        const q = socket.getWorldQuaternion(new THREE.Quaternion());
        const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
        axisX.z = 0;
        let angle = 0;
        if (axisX.lengthSq() > 0.000001) {
            axisX.normalize();
            angle = Math.atan2(axisX.y, axisX.x * facingSign);
        }

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            centerX: worldPos.x,
            centerY: worldPos.y,
            facingSign,
            angle,
            cos,
            sin
        };
    }
*/
    transformDynoLocalPointToWorld(localPoint, transform = this.getDynoCollisionTransform()) {
        if (!localPoint || !transform) {
            return null;
        }

        const mirroredX = localPoint.x * transform.facingSign;
        return new THREE.Vector2(
            transform.centerX + (mirroredX * transform.cos) - (localPoint.y * transform.sin),
            transform.centerY + (mirroredX * transform.sin) + (localPoint.y * transform.cos)
        );
    }

    transformDynoLocalVectorToWorld(localPoint, transform = this.getDynoCollisionTransform()) {
        if (!localPoint || !transform) {
            return null;
        }

        const mirroredX = localPoint.x * transform.facingSign;
        return new THREE.Vector2(
            (mirroredX * transform.cos) - (localPoint.y * transform.sin),
            (mirroredX * transform.sin) + (localPoint.y * transform.cos)
        );
    }

    transformWorldPointToDynoLocal(worldPoint, transform = this.getDynoCollisionTransform()) {
        if (!worldPoint || !transform) {
            return null;
        }

        const dx = worldPoint.x - transform.centerX;
        const dy = worldPoint.y - transform.centerY;
        const unrotatedX = (dx * transform.cos) + (dy * transform.sin);
        const unrotatedY = (-dx * transform.sin) + (dy * transform.cos);
        return new THREE.Vector2(
            unrotatedX * transform.facingSign,
            unrotatedY
        );
    }

    getCollisionCircleWorldPoints(segments = 16, closeLoop = false) {
        const { centerX, centerY, radius } = this.getWorldCollisionCircle();
        const pointCount = Math.max(segments, 3);
        const points = [];

        for (let index = 0; index < pointCount; index += 1) {
            const angle = (index / pointCount) * Math.PI * 2;
            points.push(new THREE.Vector2(
                centerX + (Math.cos(angle) * radius),
                centerY + (Math.sin(angle) * radius)
            ));
        }

        if (closeLoop && points.length > 0) {
            points.push(points[0].clone());
        }

        return points;
    }

    useDebugFixedFlightCollisionPolygon() {
        return CONFIG.LEVEL_OBJECTS?.debugUseFixedFlightCollisionPolygon === true;
    }

    getFixedFlightCollisionLocalPolygon(closeLoop = false) {
        const configuredPoints = CONFIG.LEVEL_OBJECTS?.debugFixedFlightCollisionPolygonLocalPoints;
        if (!Array.isArray(configuredPoints) || configuredPoints.length < 3) {
            return [];
        }

        const points = configuredPoints
            .map((point) => (
                Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1])
                    ? new THREE.Vector2(point[0], point[1])
                    : null
            ))
            .filter(Boolean);

        if (closeLoop && points.length > 0) {
            points.push(points[0].clone());
        }

        return points;
    }

    getFixedFlightCollisionPolygon(closeLoop = false) {
        const transform = this.getDynoCollisionTransform();
        return this.getFixedFlightCollisionLocalPolygon(closeLoop)
            .map((point) => this.transformDynoLocalPointToWorld(point, transform))
            .filter(Boolean);
    }

    getOffsetsFromLocalPolygon(localPolygon) {
       const transform = this.getDynoCollisionTransform();
        const circleAnchorOffset = new THREE.Vector2(
            transform.centerX - this.position.x,
            transform.centerY - this.position.y
        );
        const offsets = [];
        let centroidX = 0;
        let centroidY = 0;

        for (let index = 0; index < localPolygon.length; index += 1) {
            const point = localPolygon[index];
            centroidX += point.x;
            centroidY += point.y;
            offsets.push(circleAnchorOffset.clone().add(
                this.transformDynoLocalVectorToWorld(point, transform)
            ));

            const nextPoint = localPolygon[(index + 1) % localPolygon.length];
            offsets.push(circleAnchorOffset.clone().add(
                this.transformDynoLocalVectorToWorld(point.clone().lerp(nextPoint, 0.25), transform)
            ));
            offsets.push(circleAnchorOffset.clone().add(
                this.transformDynoLocalVectorToWorld(point.clone().lerp(nextPoint, 0.5), transform)
            ));
            offsets.push(circleAnchorOffset.clone().add(
                this.transformDynoLocalVectorToWorld(point.clone().lerp(nextPoint, 0.75), transform)
            ));
        }

        offsets.push(circleAnchorOffset.clone().add(
            this.transformDynoLocalVectorToWorld(
                new THREE.Vector2(
                    centroidX / localPolygon.length,
                    centroidY / localPolygon.length
                ),
                transform
            )
        ));

        return offsets;   
    }


    getFixedFlightCollisionSampleOffsets() {
        const localPolygon = this.getFixedFlightCollisionLocalPolygon(false);
        if (localPolygon.length === 0) {
            return [];
        }

        return this.getOffsetsFromLocalPolygon(localPolygon);
    }

    getRectWorldPoints(rect, closeLoop = false) {
        if (!rect) {
            return [];
        }

        const {
            centerX,
            centerY,
            halfWidth,
            halfHeight,
            angle = 0
        } = rect;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const corners = [
            new THREE.Vector2(-halfWidth, -halfHeight),
            new THREE.Vector2(halfWidth, -halfHeight),
            new THREE.Vector2(halfWidth, halfHeight),
            new THREE.Vector2(-halfWidth, halfHeight)
        ].map((corner) => new THREE.Vector2(
            0 + (corner.x * cos) - (corner.y * sin),
            0 + (corner.x * sin) + (corner.y * cos)
        ));

        if (closeLoop && corners.length > 0) {
            corners.push(corners[0].clone());
        }

        return corners;
    }

    getRectWorldPoint(rect, localX, localY) {
        if (!rect) {
            return null;
        }

        const angle = rect.angle ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new THREE.Vector2(
            rect.centerX + (localX * cos) - (localY * sin),
            rect.centerY + (localX * sin) + (localY * cos)
        );
    }

    roundDebugNumber(value, digits = 3) {
        if (!Number.isFinite(value)) {
            return value;
        }

        return Number(value.toFixed(digits));
    }

    formatDebugVector2(point, digits = 3) {
        if (!point) {
            return null;
        }

        return {
            x: this.roundDebugNumber(point.x, digits),
            y: this.roundDebugNumber(point.y, digits)
        };
    }

    formatDebugRect(rect, digits = 3) {
        if (!rect) {
            return null;
        }

        return {
            centerX: this.roundDebugNumber(rect.centerX, digits),
            centerY: this.roundDebugNumber(rect.centerY, digits),
            halfWidth: this.roundDebugNumber(rect.halfWidth, digits),
            halfHeight: this.roundDebugNumber(rect.halfHeight, digits),
            angle: this.roundDebugNumber(rect.angle ?? 0, digits)
        };
    }

    maybeLogCarryFlightCollisionDebug(debugInfo) {
        if (!CONFIG.LEVEL_OBJECTS?.debugLogCarryFlightCollision || !debugInfo) {
            return;
        }

        const attachedObjectId = this.carriedObject?.id ?? this.carriedObject?.name ?? 'unknown';
        if (this.loggedCarryFlightCollisionForObjectId === attachedObjectId) {
            return;
        }

        this.loggedCarryFlightCollisionForObjectId = attachedObjectId;
        console.info('[Player] Carry flight collision debug\n' + JSON.stringify(debugInfo, null, 2));
    }

    getCarryFlightCollisionObjectId() {
        return this.carriedObject?.id ?? this.carriedObject?.name ?? null;
    }

    handleDebugCarryPolygonRebuildRequest() {
        if (!this.joystick?.consumeDebugRebuildCarryPolygonPressed?.()) {
            return;
        }

        if (!this.carriedObject) {
            return;
        }

        this.invalidateCarryFlightCollisionCache();
        this.scheduleCarryFlightCollisionBuild();
        console.info('[Player] Manual carry flight collision rebuild requested.');
    }

    invalidateCarryFlightCollisionCache() {
        this.cachedCarryFlightCollisionLocalPolygon = null;
        this.cachedCarryFlightCollisionObjectId = null;
        this.pendingCarryFlightCollisionObjectId = null;
        this.loggedCarryFlightCollisionForObjectId = null;
    }

    scheduleCarryFlightCollisionBuild() {
        const attachedObjectId = this.getCarryFlightCollisionObjectId();
        this.cachedCarryFlightCollisionLocalPolygon = null;
        this.cachedCarryFlightCollisionObjectId = null;
        this.pendingCarryFlightCollisionObjectId = attachedObjectId;
        this.loggedCarryFlightCollisionForObjectId = null;
    }

    getCurrentCarriedCollisionRect() {
        if (!this.carriedObject) {
            return null;
        }

        this.carriedObject.syncCarriedPickupRootToSocket?.();
        this.carriedObject.container?.updateWorldMatrix?.(true, true);
        this.carriedObject.sceneObject?.updateWorldMatrix?.(true, true);
        this.carriedObject.rootNode?.updateWorldMatrix?.(true, true);

        return this.carriedObject.getWorldCollisionRect?.() ?? this.carriedObject.getExplosionDamageRect?.() ?? null;
    }

    getRectPointInCircleLocalSpace(rect, circle, localX, localY) {
        if (!rect || !circle) {
            return null;
        }

        const angle = rect.angle ?? 0;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const relativeCenterX = rect.centerX - circle.centerX;
        const relativeCenterY = rect.centerY - circle.centerY;
        return new THREE.Vector2(
            relativeCenterX + (localX * cos) - (localY * sin),
            relativeCenterY + (localX * sin) + (localY * cos)
        );
    }

    orderRectPointsForCarryPolygon(worldPoints, transform = this.getDynoCollisionTransform()) {
        if (!Array.isArray(worldPoints) || worldPoints.length < 4) {
            return [];
        }

        const localPoints = worldPoints
            .map((point) => ({
                worldPoint: point,
                localPoint: this.transformWorldPointToDynoLocal(point, transform)
            }))
            .filter((entry) => entry.localPoint);

        const sortedByY = [...localPoints].sort((pointA, pointB) => pointB.localPoint.y - pointA.localPoint.y);
        const topPoints = sortedByY.slice(0, 2).sort((pointA, pointB) => pointB.localPoint.x - pointA.localPoint.x);
        const bottomPoints = sortedByY.slice(2).sort((pointA, pointB) => pointB.localPoint.x - pointA.localPoint.x);
        const [topRight, topLeft] = topPoints;
        const [bottomRight, bottomLeft] = bottomPoints;
        
        return [topRight, bottomRight, bottomLeft, topLeft]
            .filter(Boolean)
            .map((entry) => entry.worldPoint.clone());
    }

    buildCarriedFlightCollisionLocalPolygon() {
        if (!this.carriedObject) {
            return [];
        }

        const carriedRect = this.getCurrentCarriedCollisionRect();
        if (!carriedRect) {
            return [];
        }
  
        carriedRect.angle = 0;

        const transform = this.getDynoCollisionTransform2(carriedRect);
        const rectWorldPoints = this.getRectWorldPoints(carriedRect, false);
        const orderedRectWorldPoints = this.orderRectPointsForCarryPolygon(rectWorldPoints, transform);
        const {
            maxCornerDrift,
            averageCornerDrift
        } = this.getCarryRectDebugComparisonWorldPolygons();

        const polygon = [
           new THREE.Vector2(0, PLAYER_RADIUS),
            ...orderedRectWorldPoints
                .map((point) => this.transformWorldPointToDynoLocal(point, transform))
                .filter(Boolean)        
        ];

        this.maybeLogCarryFlightCollisionDebug({
            attachedObject: this.carriedObject?.name || this.carriedObject?.type || 'unknown',
            facing: this.lastFacingDirection,
            groundTilt: this.roundDebugNumber(this.currentGroundTilt ?? 0),
            collisionCircle: {
                centerX: this.roundDebugNumber(transform.centerX),
                centerY: this.roundDebugNumber(transform.centerY),
                radius: this.roundDebugNumber(PLAYER_RADIUS)
            },
            transform: {
                centerX: this.roundDebugNumber(transform.centerX),
                centerY: this.roundDebugNumber(transform.centerY),
                facingSign: transform.facingSign,
                angle: this.roundDebugNumber(transform.angle),
                cos: this.roundDebugNumber(transform.cos),
                sin: this.roundDebugNumber(transform.sin)
            },
            carriedRect: this.formatDebugRect(carriedRect),
            comparisonDrift: {
                maxCornerDrift: this.roundDebugNumber(maxCornerDrift, 4),
                averageCornerDrift: this.roundDebugNumber(averageCornerDrift, 4)
            },
            rectWorldPoints: rectWorldPoints.map((point) => this.formatDebugVector2(point)),
            orderedRectWorldPoints: orderedRectWorldPoints.map((point) => this.formatDebugVector2(point)),
            // For the current carry polygon path we intentionally skip any extra
            // world->dyno-local conversion for the carried rect corners.
//              orderedRectLocalPoints: orderedRectWorldPoints.map((point) => this.formatDebugVector2(point)),
              orderedRectLocalPoints: orderedRectWorldPoints
                .map((point) => this.transformWorldPointToDynoLocal(point, transform))
                .filter(Boolean)
                .map((point) => this.formatDebugVector2(point)),            
            polygonLocalPoints: polygon.map((point) => this.formatDebugVector2(point)),
            polygonWorldPoints: polygon
                .map((point) => this.transformDynoLocalPointToWorld(point, transform))
                .filter(Boolean)
                .map((point) => this.formatDebugVector2(point))
        });

        return polygon;
    }

    refreshCarryFlightCollisionCacheIfReady() {
        const attachedObjectId = this.getCarryFlightCollisionObjectId();
        if (!attachedObjectId) {
            this.invalidateCarryFlightCollisionCache();
            return;
        }

        if (this.cachedCarryFlightCollisionObjectId === attachedObjectId && this.cachedCarryFlightCollisionLocalPolygon) {
            return;
        }

        if (this.pendingCarryFlightCollisionObjectId !== attachedObjectId) {
            this.scheduleCarryFlightCollisionBuild();
            return;
        }

        const polygon = this.buildCarriedFlightCollisionLocalPolygon();
        if (!polygon || polygon.length === 0) {
            return;
        }

        this.cachedCarryFlightCollisionLocalPolygon = polygon;
        this.cachedCarryFlightCollisionObjectId = attachedObjectId;
        this.pendingCarryFlightCollisionObjectId = null;
    }

    getCarriedFlightCollisionLocalPolygon(closeLoop = false) {
        if (this.carriedObject?.isPhysicsCarried?.() === true) {
            const livePolygon = this.buildCarriedFlightCollisionLocalPolygon();
            const polygon = livePolygon.map((point) => point.clone());
            if (closeLoop && polygon.length > 0) {
                polygon.push(polygon[0].clone());
            }
            return polygon;
        }

        this.refreshCarryFlightCollisionCacheIfReady();
        const basePolygon = this.cachedCarryFlightCollisionLocalPolygon || [];
        const polygon = basePolygon.map((point) => point.clone());

        if (closeLoop && polygon.length > 0) {
            polygon.push(polygon[0].clone());
        }

        return polygon;
    }

    getCarriedFlightCollisionPolygon(closeLoop = false) {
        const transform = this.getDynoCollisionTransform();
        const localPolygon = this.getCarriedFlightCollisionLocalPolygon(closeLoop);
        return localPolygon
            .map((point) => this.transformDynoLocalPointToWorld(point, transform))
            .filter(Boolean);
    }

    getCarriedFlightCollisionSampleOffsets() {
        const localPolygon = this.getCarriedFlightCollisionLocalPolygon(false);
        if (localPolygon.length === 0) {
            return [];
        }
        return this.getOffsetsFromLocalPolygon(localPolygon);
    }

    getCarriedFlightCollisionDebugPolygon() {
        const sampleOffsets = this.getCarriedFlightCollisionSampleOffsets();
        if (sampleOffsets.length === 0) {
            return [];
        }

        const uniquePoints = [];
        for (const offset of sampleOffsets) {
            const point = new THREE.Vector2(
                this.position.x + offset.x,
                this.position.y + offset.y
            );
            const isDuplicate = uniquePoints.some((existingPoint) => existingPoint.distanceToSquared(point) <= 0.0004);
            if (!isDuplicate) {
                uniquePoints.push(point);
            }
        }

        if (uniquePoints.length < 3) {
            return uniquePoints;
        }

        let centroidX = 0;
        let centroidY = 0;
        for (const point of uniquePoints) {
            centroidX += point.x;
            centroidY += point.y;
        }
        centroidX /= uniquePoints.length;
        centroidY /= uniquePoints.length;

        uniquePoints.sort((pointA, pointB) => (
            Math.atan2(pointA.y - centroidY, pointA.x - centroidX) -
            Math.atan2(pointB.y - centroidY, pointB.x - centroidX)
        ));
        uniquePoints.push(uniquePoints[0].clone());
        return uniquePoints;
    }

    getCarrySocket() {
        return this.carrySocket;
    }

    getAttachedObject() {
        return this.carriedObject || this.grabbedObject || null;
    }

    hasAttachedObject() {
        return Boolean(this.getAttachedObject());
    }

    isAutoPickupActive() {
        return Boolean(this.autoPickupTarget);
    }

    isAutoDragActive() {
        return Boolean(this.autoDragTarget);
    }

    isAutoInteractionActive() {
        return this.isAutoPickupActive() || this.isAutoDragActive();
    }

    isDraggingObject() {
        return Boolean(this.draggedObject);
    }

    isMouthDraggingObject() {
        return Boolean(
            this.draggedObject &&
            (
                this.draggedObject.isMouthDragged?.() === true ||
                this.draggedObject.config?.mouthDrag === true ||
                this.draggedObject.config?.mouthDraggable === true
            )
        );
    }

    isPullDraggingObject() {
        return this.isDraggingObject() && !this.isMouthDraggingObject();
    }

    canUseFireButton() {
        return false;
    }

    isGrabStruggleActive() {
        return Boolean(this.grabbedObject);
    }

    getDragFacingDirection() {
        return this.dragFacingDirection || this.lastFacingDirection || 1;
    }

    getBackMostVisualZ() {
        const fallbackZ = Number.isFinite(this.position?.z)
            ? this.position.z
            : (Number.isFinite(this.mesh?.position?.z) ? this.mesh.position.z : 0);
        if (!this.dynoModel) {
            return fallbackZ;
        }

        this.dynoModel.updateWorldMatrix(true, true);
        this.dragLayerBounds.setFromObject(this.dynoModel);
        if (this.dragLayerBounds.isEmpty()) {
            return fallbackZ;
        }

        return this.dragLayerBounds.min.z;
    }

    getCarriedWeight() {
        return this.getAttachedObject()?.weight ?? 0;
    }

    getCarryWeightRatio() {
        if (!this.maxLiftWeight) {
            return 0;
        }

        return THREE.MathUtils.clamp(this.getCarriedWeight() / this.maxLiftWeight, 0, 1);
    }

    getCarryFlapSpeedMultiplier() {
        if (this.grabbedObject) {
            // Too-heavy grab should look effort-driven by current input, not a constant max flap.
            // Keep base multiplier neutral so struggle input boost can visibly modulate speed.
            return 1;
        }

        const weightFactor = Number.isFinite(CONFIG.DYNO_CARRY?.flapSpeedWeightFactor)
            ? CONFIG.DYNO_CARRY.flapSpeedWeightFactor
            : 0;

        // Fase 1 weight response stays intentionally simple: heavier cargo just speeds up the
        // airborne flap loops through one tunable multiplier instead of changing movement code.
        return 1 + (this.getCarryWeightRatio() * weightFactor);
    }

    isCarryHoverOnlyActive() {
        if (!this.hasAttachedObject()) return false;
        const threshold = CONFIG.DYNO_CARRY?.freeFlyCarryWeightThreshold ?? 10;
        return this.getCarriedWeight() > threshold;
    }

    recoverFromBlockedCarryDrop() {
        if (!this.isPositionBlockedAt(this.position.x, this.position.y)) {
            return false;
        }

        const tileStep = Math.max(
            Math.min(this.ground?.tileWidth ?? 1, this.ground?.tileHeight ?? 1) * 0.25,
            0.1
        );
        const maxRecoveryDistance = Math.max(tileStep * 24, PLAYER_RADIUS * 6);

        for (let offset = tileStep; offset <= maxRecoveryDistance; offset += tileStep) {
            const candidateY = this.position.y - offset;
            if (this.isPositionBlockedAt(this.position.x, candidateY)) {
                continue;
            }

            this.position.y = candidateY;
            this.velocity.y = Math.min(this.velocity.y, 0);
            const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
            const groundedY = groundInfo?.surfaceHeight + PLAYER_RADIUS;
            if (
                groundInfo &&
                Number.isFinite(groundedY) &&
                this.position.y <= groundedY + this.getCollisionStepSize()
            ) {
                this.position.y = groundedY;
                this.velocity.y = 0;
                this.onGround = true;
                this.airMode = 'hover';
                this.airHoverRecoveryLock = false;
                this.cancelFlightTurn();
            }
            return true;
        }

        return false;
    }

    enterCarryHoverMode() {
        if (!this.hasAttachedObject()) {
            return;
        }

        this.onGround = false;
        this.airMode = 'hover';
        this.airHoverRecoveryLock = true;
        this.cancelFlightTurn();
        this.flightFacingRotationY = 0;
        this.flightTurnVisualRotation = 0;
        this.airborneAnimationState = 'hover';
    }

    isPickupHoverState() {
        return !this.onGround && this.airMode === 'hover' && !this.isFlightTurning;
    }

    isAirbornePickupEligible() {
        // Hover mode is the normal pickup state. Allow triggering from any airborne state —
        // beginAutoPickup will force the dyno into hover to complete the approach.
        return !this.onGround && !this.isFlightTurning;
    }

    isInsideMissionZoneType(zoneType) {
        const normalizedZoneType = String(zoneType || '').trim();
        if (!normalizedZoneType) {
            return false;
        }

        const zones = this.ground?.getMissionZonesByType?.(normalizedZoneType) ?? [];
        if (zones.length === 0) {
            return false;
        }

        const circle = this.getWorldCollisionCircle?.();
        const px = circle?.centerX ?? this.position?.x;
        const py = circle?.centerY ?? this.position?.y;
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
            return false;
        }

        for (const zone of zones) {
            if (!isPointNearZone(zone, px, py)) {
                continue;
            }
            if (isPointInsideZone(zone, px, py)) {
                return true;
            }
        }

        return false;
    }

    isInNoCarryZone() {
        return this.isInsideMissionZoneType('noCarry');
    }

    canPickupObject(levelObject = null, options = {}) {
        if (this.isInputLocked()) {
            return false;
        }

        if (
            this.hasAttachedObject() ||
            this.isDraggingObject() ||
            (!options.allowDuringAuto && this.isAutoInteractionActive()) ||
            !this.carrySocket
        ) {
            return false;
        }

        if (!this.isAirbornePickupEligible()) {
            return false;
        }

        // noCarry zones only block starting a new lift/carry action.
        // Drop stays available because the carried-object path does not call canPickupObject.
        if (this.isInNoCarryZone()) {
            return false;
        }

        // Hover mode alone is not enough to perform a pickup. Callers that want to know
        // whether pickup can happen right now must provide the actual nearby target object.
        if (!levelObject) {
            return false;
        }

        if ((levelObject.state !== 'idle' && levelObject.state !== 'falling') || levelObject.pickupable === false || levelObject.isDestroyed) {
            return false;
        }

        // Don't allow pickup if the dyno is more than 1 tile below the object's collision bottom.
        const collisionBounds = levelObject.getCollisionPolygonBounds?.();
        if (collisionBounds) {
            const tileHeight = CONFIG.LEVEL_WORLD_TILE_HEIGHT ?? 2;
            const feetY = this.getFeetY();
            if (feetY < collisionBounds.minY - tileHeight) {
                return false;
            }
        }

        // When grounded on a dynamic walkable object, don't allow pickup of objects whose
        // grab point is below the dyno's circle bottom — prevents grabbing the block underfoot.
        if (this.onGround && this.groundContact?.edge?._object?.config?.walkable) {
            const pickupRootWorld = levelObject.getPickupRootWorldPosition?.(new THREE.Vector3());
            if (pickupRootWorld && pickupRootWorld.y < this.getFeetY()) {
                return false;
            }
        }

        return true;
    }

    canUsePickupDropButton(levelObject = null) {
        if (this.isInputLocked()) {
            return false;
        }

        if (this.isAutoInteractionActive()) {
            return false;
        }

        if (this.isDraggingObject()) {
            return true;
        }

        if (this.hasAttachedObject()) {
            return true;
        }

        return Boolean(levelObject) && (
            this.canPickupObject(levelObject) ||
            this.canDragObject(levelObject, { skipMouthSideCheck: true })
        );
    }

    canLiftObject(levelObject = null) {
        if (!levelObject) {
            return false;
        }

        return levelObject.weight <= this.maxLiftWeight;
    }

    getCarryHoverSpeedMultiplier() {
        return Number.isFinite(CONFIG.DYNO_CARRY?.carryHoverSpeedMultiplier)
            ? CONFIG.DYNO_CARRY.carryHoverSpeedMultiplier
            : 1;
    }

    canDragObject(levelObject = null, options = {}) {
        if (this.isInputLocked()) {
            return false;
        }

        if (
            !levelObject ||
            this.hasAttachedObject() ||
            this.isDraggingObject() ||
            (!options.allowDuringAuto && this.isAutoInteractionActive()) ||
            !this.onGround ||
            this.isTurning
        ) {
            return false;
        }

        const objectCanBeDragged = typeof levelObject.canBeDraggedBy === 'function'
            ? levelObject.canBeDraggedBy(this)
            : levelObject.draggable === true;

        if (!objectCanBeDragged) {
            return false;
        }

        // When grounded on a dynamic walkable object, reject grab nodes below the dyno's
        // circle bottom — prevents showing the grab button for blocks underfoot.
        if (this.onGround && !options.allowDuringAuto && this.groundContact?.edge?._object?.config?.walkable) {
            const grabPointName = this.selectDragGrabPoint(levelObject);
            if (!this._scratchVec3B) this._scratchVec3B = new THREE.Vector3();
            const grabWorld = levelObject.getPhysicsAnchorWorldPosition?.(grabPointName, this._scratchVec3B) ||
                levelObject.getGrabPointWorldPosition?.(grabPointName, this._scratchVec3B);
            if (grabWorld && grabWorld.y < this.getFeetY()) {
                return false;
            }
        }

        // Skip mouth-side and height checks when explicitly requested (e.g. button pressed while
        // moving — beginAutoDrag will walk the dyno back to the correct grab position).
        if (options.allowDuringAuto || options.skipMouthSideCheck) {
            return true;
        }

        // Require the dyno to be within 1.5 tiles vertically of the grab node.
        const grabPointName = this.selectDragGrabPoint(levelObject);
        if (!this._scratchVec3B) this._scratchVec3B = new THREE.Vector3();
        const grabWorld = levelObject.getPhysicsAnchorWorldPosition?.(grabPointName, this._scratchVec3B) ||
            levelObject.getGrabPointWorldPosition?.(grabPointName, this._scratchVec3B);
        if (grabWorld && Number.isFinite(grabWorld.y)) {
            const tileHeight = CONFIG.LEVEL_WORLD_TILE_HEIGHT ?? 2;
            if (Math.abs(this.position.y - grabWorld.y) > tileHeight * 1.5) {
                return false;
            }
        }

        return this.isMouthOnFacingSideOfDragGrabPoint(levelObject);
    }

    isMouthOnFacingSideOfDragGrabPoint(levelObject) {
        const dynoFacing = this.lastFacingDirection >= 0 ? 1 : -1;
        const grabPointName = this.selectDragGrabPoint(levelObject);
        if (!this._scratchVec3A) this._scratchVec3A = new THREE.Vector3();
        if (!this._scratchVec3B) this._scratchVec3B = new THREE.Vector3();
        const mouthWorld = this.getMouthWorldPosition(this._scratchVec3A);
        const grabWorld = levelObject.getPhysicsAnchorWorldPosition?.(grabPointName, this._scratchVec3B) ||
            levelObject.getGrabPointWorldPosition?.(grabPointName, this._scratchVec3B);

        if (!grabWorld) {
            return false;
        }

        // Keep using the near-side anchor, but allow a small configurable overshoot after the
        // mouth passes it. Pressing grab there makes auto-drag walk back to this same point.
        const overshootDistance = this.getDragGrabOvershootDistance();
        return dynoFacing > 0
            ? mouthWorld.x <= grabWorld.x + overshootDistance
            : mouthWorld.x >= grabWorld.x - overshootDistance;
    }

    getPickupAlignSpeed() {
        return Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_CARRY?.pickupAlignSpeed)
                ? CONFIG.DYNO_CARRY.pickupAlignSpeed
                : 18
        );
    }

    getPickupAlignTolerance() {
        return Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_CARRY?.pickupAlignTolerance)
                ? CONFIG.DYNO_CARRY.pickupAlignTolerance
                : 0.25
        );
    }

    getPickupMaxDuration() {
        return Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_CARRY?.pickupMaxDuration)
                ? CONFIG.DYNO_CARRY.pickupMaxDuration
                : 1
        );
    }

    getDragAlignSpeed() {
        return Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_DRAG?.alignSpeed)
                ? CONFIG.DYNO_DRAG.alignSpeed
                : 14
        );
    }

    getDragAlignTolerance() {
        return Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_DRAG?.alignTolerance)
                ? CONFIG.DYNO_DRAG.alignTolerance
                : 0.35
        );
    }

    getDragAlignMaxDuration() {
        return Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_DRAG?.alignMaxDuration)
                ? CONFIG.DYNO_DRAG.alignMaxDuration
                : 1
        );
    }

    getDragGrabOvershootDistance() {
        return Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_DRAG?.grabOvershootDistance)
                ? CONFIG.DYNO_DRAG.grabOvershootDistance
                : 0
        );
    }

    getDragMovementMultiplier() {
        if (!this.isPullDraggingObject()) {
            return 1;
        }

        // If object exceeds max drag weight, prevent all movement
        if (this.draggedObject.weight > this.maxDragWeight) {
            return 0;
        }

        return this.getDragMovementMultiplierForWeight(this.draggedObject.weight);
    }

    getDragMovementMultiplierForWeight(weight) {
        const backwardSpeedMultiplier = THREE.MathUtils.clamp(
            Number.isFinite(CONFIG.DYNO_DRAG?.backwardSpeedMultiplier)
                ? CONFIG.DYNO_DRAG.backwardSpeedMultiplier
                : 0.8,
            0,
            1
        );
        const maxDragWeight = Math.max(
            0.001,
            Number.isFinite(CONFIG.DYNO_DRAG?.maxDragWeight)
                ? CONFIG.DYNO_DRAG.maxDragWeight
                : this.maxDragWeight || 260
        );
        const minMultiplier = THREE.MathUtils.clamp(
            Number.isFinite(CONFIG.DYNO_DRAG?.minMovementMultiplier)
                ? CONFIG.DYNO_DRAG.minMovementMultiplier
                : 0.12,
            0,
            1
        );
        const weightRatio = THREE.MathUtils.clamp((weight ?? 0) / maxDragWeight, 0, 1);

        return backwardSpeedMultiplier * THREE.MathUtils.lerp(1, minMultiplier, weightRatio);
    }

    getDragAnimationSpeedMultiplier() {
        if (!this.isPullDraggingObject()) {
            return 1;
        }

        const dragConfig = CONFIG.DYNO_DRAG || {};
        const maxWeight = Math.max(
            0.001,
            Number.isFinite(this.maxDragWeight) ? this.maxDragWeight : 1
        );
        const startWeight = THREE.MathUtils.clamp(
            Number.isFinite(dragConfig.dragAnimationInterpolationStartWeight)
                ? dragConfig.dragAnimationInterpolationStartWeight
                : 0,
            0,
            maxWeight
        );
        const maxWeightMultiplier = Math.max(
            0.01,
            Number.isFinite(dragConfig.dragAnimationSpeedMultiplierAtMaxWeight)
                ? dragConfig.dragAnimationSpeedMultiplierAtMaxWeight
                : 1
        );
        const weight = Number.isFinite(this.draggedObject.weight) ? this.draggedObject.weight : 0;

        if (weight <= startWeight) {
            return 1;
        }

        const t = THREE.MathUtils.clamp(
            (weight - startWeight) / Math.max(maxWeight - startWeight, 0.0001),
            0,
            1
        );
        return THREE.MathUtils.lerp(1, maxWeightMultiplier, t);
    }

    getHeavyDragStandstillAnimationSpeed(inputX = this.currentInput.x) {
        if (!this.isPullDraggingObject() || !this.draggedObject || this.draggedObject.weight <= this.maxDragWeight) {
            return 0;
        }

        const dragFacing = this.getDragFacingDirection();
        const forwardAmount = inputX * dragFacing;
        if (forwardAmount >= -0.05) {
            return 0;
        }

        const pullInput = THREE.MathUtils.clamp(-forwardAmount, 0, 1);
        const maxWeightMovementMultiplier = this.getDragMovementMultiplierForWeight(this.maxDragWeight);
        const theoreticalSpeed = pullInput * CONFIG.maxWalkSpeed * maxWeightMovementMultiplier;
        return Math.min(theoreticalSpeed, this.getDragBackwardMaxWalkSpeed());
    }

    getDragBackwardMaxWalkSpeed() {
        const baseSpeed = Math.max(
            0,
            Number.isFinite(CONFIG.DYNO_DRAG?.backwardMaxWalkSpeed)
                ? CONFIG.DYNO_DRAG.backwardMaxWalkSpeed
                : Math.max(0, CONFIG.startRunSpeed * 0.85)
        );
        return baseSpeed * this.getCurrentSpeedMultiplier();
    }

    getPickupRootWorldPosition(levelObject, target = new THREE.Vector3()) {
        if (typeof levelObject?.getPickupRootWorldPosition === 'function') {
            return levelObject.getPickupRootWorldPosition(target);
        }

        return levelObject?.getWorldPosition?.(target) || target.copy(this.position);
    }

    getCarryFootWorldPosition(target = new THREE.Vector3()) {
        // The carry socket is placed on grab when the rig exposes that bone, so aligning the
        // socket world position is the practical non-IK way to align grab to the object root.
        this.mesh.updateMatrixWorld(true);
        return (this.carrySocket || this.mesh).getWorldPosition(target);
    }

    getMouthWorldPosition(target = new THREE.Vector3()) {
        this.mesh.updateMatrixWorld(true);

        if (this.mouthObject?.getWorldPosition) {
            return this.mouthObject.getWorldPosition(target);
        }

        target.set((this.lastFacingDirection >= 0 ? 1 : -1) * 0.8, 0.4, 0);
        return this.mesh.localToWorld(target);
    }

    getMouthAttachmentObject() {
        return this.mouthSocket || this.mouthObject || this.mesh;
    }

    getFireballDamage() {
        return 0;
    }

    getFireballCooldown() {
        return 0;
    }

    updateFireballCooldown(dt) {
        void dt;
    }

    canShootFireball() {
        return false;
    }

    resetFireballCooldown() {
        this.fireballCooldownRemaining = 0;
    }

    getFlameDamagePerSecond() {
        return 0;
    }

    shouldDespawnFireballOnHit() {
        return false;
    }

    getActiveFireballsForDamage() {
        return [];
    }

    consumeFireballById(id, options = {}) {
        void id;
        void options;
        return false;
    }

    getContinuousFlameDamageRect() {
        return null;
    }

    selectDragGrabPoint(levelObject) {
        const dynoFacing = this.lastFacingDirection >= 0 ? 1 : -1;
        const mouthWorld = this.getMouthWorldPosition(new THREE.Vector3());
        let selectedName = null;
        let selectedX = dynoFacing > 0 ? Infinity : -Infinity;
        let selectedTieDistanceSq = Infinity;

        // A walking dyno can only reach the near side of the object. Facing right means the
        // dyno approaches from the left, so only the leftmost world-space anchor is reachable.
        // Facing left is the opposite. This stays correct even if the object is upside down or
        // rotated on a slope, because it uses the anchors' actual world positions.
        for (const name of ['grab_front', 'grab_back']) {
            const grabWorld = levelObject?.getPhysicsAnchorWorldPosition?.(name, new THREE.Vector3()) ||
                levelObject?.getGrabPointWorldPosition?.(name, new THREE.Vector3());
            if (!grabWorld || !Number.isFinite(grabWorld.x) || !Number.isFinite(grabWorld.y)) {
                continue;
            }

            const distanceSq = mouthWorld.distanceToSquared(grabWorld);
            const isBetterSide = dynoFacing > 0
                ? grabWorld.x < selectedX - 0.0001
                : grabWorld.x > selectedX + 0.0001;
            const isTieButCloser = Math.abs(grabWorld.x - selectedX) <= 0.0001 &&
                distanceSq < selectedTieDistanceSq;

            if (isBetterSide || isTieButCloser) {
                selectedX = grabWorld.x;
                selectedTieDistanceSq = distanceSq;
                selectedName = name;
            }
        }

        if (selectedName) {
            return selectedName;
        }

        const objectFacing = typeof levelObject?.getFacingDirection === 'function'
            ? levelObject.getFacingDirection()
            : 1;

        // Pick the end that puts the dyno's mouth at the near side of the vehicle:
        // same facing grabs the back; opposite facing grabs the front.
        return dynoFacing === objectFacing ? 'grab_back' : 'grab_front';
    }

    syncMeshForPickupAlignment() {
        this.mesh.position.copy(this.position);
        this.mesh.updateMatrixWorld(true);
    }

    beginAutoPickup(levelObject) {
        if (this.isInputLocked()) {
            return false;
        }

        if (this.isAutoPickupActive() || !levelObject || !this.canPickupObject(levelObject)) {
            return false;
        }

        this.autoPickupTarget = levelObject;
        this.autoPickupElapsed = 0;
        this.velocity.set(0, 0, 0);
        this.onGround = false;
        // Force into hover regardless of current flight mode so the approach logic works.
        this.airMode = 'hover';
        this.airHoverRecoveryLock = true;
        this.airborneAnimationState = 'hover';
        this.cancelTurn();
        this.cancelFlightTurn();
        this.flightFacingRotationY = 0;
        this.flightTurnVisualRotation = 0;
        this.syncMeshForPickupAlignment();

        return true;
    }

    beginAutoDrag(levelObject) {
        if (this.isInputLocked()) {
            return false;
        }

        if (this.isAutoInteractionActive() || !levelObject || !this.canDragObject(levelObject, { skipMouthSideCheck: true })) {
            return false;
        }

        this.autoDragTarget = levelObject;
        this.autoDragGrabPointName = this.selectDragGrabPoint(levelObject);
        this.autoDragElapsed = 0;
        this.velocity.set(0, 0, 0);
        this.cancelTurn();
        this.cancelFlightTurn();
        this.syncMeshForPickupAlignment();
        return true;
    }

    cancelAutoPickup() {
        if (!this.isAutoPickupActive()) {
            return;
        }

        this.autoPickupTarget = null;
        this.autoPickupElapsed = 0;
        this.velocity.set(0, 0, 0);
        this.airMode = 'hover';
        this.airHoverRecoveryLock = true;
    }

    cancelAutoDrag() {
        if (!this.isAutoDragActive()) {
            return;
        }

        this.autoDragTarget = null;
        this.autoDragGrabPointName = null;
        this.autoDragElapsed = 0;
        this.velocity.set(0, 0, 0);
    }

    completeAutoPickup() {
        const target = this.autoPickupTarget;
        this.autoPickupTarget = null;
        this.autoPickupElapsed = 0;
        this.velocity.set(0, 0, 0);

        if (!target) {
            return false;
        }

        // The object stays in the level throughout the approach. Only now, after grab is close
        // enough to the object's root, do we call the existing attach/carry logic.
        return this.tryPickUpObject(target, { preserveWorldTransform: true });
    }

    completeAutoDrag() {
        const target = this.autoDragTarget;
        const grabPointName = this.autoDragGrabPointName;
        this.autoDragTarget = null;
        this.autoDragGrabPointName = null;
        this.autoDragElapsed = 0;
        this.velocity.set(0, 0, 0);

        if (!target || !grabPointName || !this.canDragObject(target, { allowDuringAuto: true })) {
            return false;
        }

        const grabWorld = target.getPhysicsAnchorWorldPosition?.(grabPointName, new THREE.Vector3()) ||
            target.getGrabPointWorldPosition?.(grabPointName, new THREE.Vector3());
        if (grabWorld) {
            const mouthWorld = this.getMouthWorldPosition(new THREE.Vector3());
            const tileHeight = this.ground?.tileHeight ?? CONFIG.LEVEL_WORLD_TILE_HEIGHT ?? 2;
            const maxHeightOffset = Number.isFinite(CONFIG.DYNO_DRAG?.maxGrabHeightOffset)
                ? CONFIG.DYNO_DRAG.maxGrabHeightOffset
                : tileHeight;
            if (grabWorld.y - mouthWorld.y > maxHeightOffset) {
                return false;
            }
        }

        const didStartDrag = target.startDrag?.(this, grabPointName);
        if (!didStartDrag) {
            return false;
        }

        this.draggedObject = target;
        this.dragFacingDirection = this.lastFacingDirection || 1;
        this._dragTakeoffHoldTimer = 0;
        this.audioManager?.play?.('grab', { volume: 0.75 });
        return true;
    }

    updateAutoPickupAlignment(dt) {
        const target = this.autoPickupTarget;
        if (!target || !this.canPickupObject(target, { allowDuringAuto: true })) {
            this.cancelAutoPickup();
            return;
        }

        this.autoPickupElapsed += dt;
        this.onGround = false;
        this.airMode = 'hover';
        this.airHoverRecoveryLock = true;
        this.airborneAnimationState = 'hover';
        this.cancelFlightTurn();

        const rootWorld = this.getPickupRootWorldPosition(target, new THREE.Vector3());
        const footWorld = this.getCarryFootWorldPosition(new THREE.Vector3());
        const delta = rootWorld.sub(footWorld);
        delta.z = 0;

        const distance = Math.hypot(delta.x, delta.y);
        const tolerance = this.getPickupAlignTolerance();
        if (distance <= tolerance) {
            this.completeAutoPickup();
            return;
        }

        if (this.autoPickupElapsed >= this.getPickupMaxDuration()) {
            // If the target cannot be reached quickly, cancel and hand control back instead of
            // dragging the dyno indefinitely through the level.
            this.cancelAutoPickup();
            return;
        }

        // Smoothly move the gameplay body toward the root/foot delta. This is a short controlled
        // action, not IK; the animated foot/socket is used as the alignment probe.
        const stepDistance = Math.min(distance, this.getPickupAlignSpeed() * dt);
        if (stepDistance <= 0.0001) {
            this.velocity.set(0, 0, 0);
            return;
        }

        const stepX = (delta.x / distance) * stepDistance;
        const stepY = (delta.y / distance) * stepDistance;
        this.position.x += stepX;
        this.position.y += stepY;
        this.velocity.set(
            dt > 0 ? stepX / dt : 0,
            dt > 0 ? stepY / dt : 0,
            0
        );
        this.syncMeshForPickupAlignment();

        if (distance - stepDistance <= tolerance) {
            this.completeAutoPickup();
        }
    }

    updateAutoDragAlignment(dt) {
        const target = this.autoDragTarget;
        const grabPointName = this.autoDragGrabPointName;
        if (!target || !grabPointName || !this.canDragObject(target, { allowDuringAuto: true })) {
            this.cancelAutoDrag();
            return;
        }

        this.autoDragElapsed += dt;
        const grabWorld = target.getPhysicsAnchorWorldPosition?.(grabPointName, new THREE.Vector3()) ||
            target.getGrabPointWorldPosition(grabPointName, new THREE.Vector3());
        const mouthWorld = this.getMouthWorldPosition(new THREE.Vector3());
        const delta = grabWorld.sub(mouthWorld);
        delta.z = 0;

        // Ground auto-drag alignment should move like walking, not gliding. Use horizontal
        // approach distance and keep movement on the ground-follow path.
        const distance = Math.abs(delta.x);
        const tolerance = this.getDragAlignTolerance();
        if (distance <= tolerance) {
            this.completeAutoDrag();
            return;
        }

        if (this.autoDragElapsed >= this.getDragAlignMaxDuration()) {
            this.cancelAutoDrag();
            return;
        }

        const desiredInputX = Math.sign(delta.x);
        if (desiredInputX === 0) {
            this.velocity.set(0, 0, 0);
            return;
        }

        // Use the normal grounded locomotion pipeline so auto-approach follows slopes and wall
        // collision, but allow reverse walking here: overshot grabs need the dyno to step
        // backward to the pinned mouth anchor without starting a turn.
        this.updateGroundedMovement({ x: desiredInputX, y: 0 }, dt, {
            allowReverseWithoutTurn: true
        });
        this.syncMeshForPickupAlignment();

        const postGrabWorld = target.getPhysicsAnchorWorldPosition?.(grabPointName, new THREE.Vector3()) ||
            target.getGrabPointWorldPosition(grabPointName, new THREE.Vector3());
        const postMouthWorld = this.getMouthWorldPosition(new THREE.Vector3());
        const postDistance = Math.abs(postGrabWorld.x - postMouthWorld.x);
        if (postDistance <= tolerance) {
            this.completeAutoDrag();
        }
    }

    releaseDraggedObject(options = {}) {
        if (this.isInputLocked() && options.force !== true) {
            return false;
        }

        if (!this.draggedObject) {
            return false;
        }

        const objectToRelease = this.draggedObject;
        const didRelease = objectToRelease.releaseDrag?.();
        if (!didRelease) {
            return false;
        }

        this.draggedObject = null;
        this.dragFacingDirection = null;
        this.velocity.set(0, 0, 0);
        return true;
    }

    // Accumulates hold time while the player presses up (within the configured cone) while
    // ground-dragging a non-mouth object. When the threshold is reached the drag is released
    // and a normal takeoff is triggered.
    _updateDragTakeoffHold(input, dt) {
        const dragCfg = CONFIG.DYNO_DRAG || {};
        const holdRequired = Number.isFinite(dragCfg.dragTakeoffHoldSeconds) ? dragCfg.dragTakeoffHoldSeconds : 1.0;
        const halfAngle    = Number.isFinite(dragCfg.dragTakeoffUpAngleHalf) ? dragCfg.dragTakeoffUpAngleHalf : 10;

        // getCombinedInput strips y=0 during pull-drag, so read raw joystick directly.
        const rawY = this.joystick?.y ?? 0;
        const rawX = this.joystick?.x ?? 0;
        const isUpInput = rawY > CONFIG.takeoffMinUpInput;
        const angleDeg  = isUpInput ? THREE.MathUtils.radToDeg(Math.atan2(rawY, Math.abs(rawX))) : 0;
        const inCone    = isUpInput && angleDeg >= (90 - halfAngle);

        if (!inCone) {
            this._dragTakeoffHoldTimer = 0;
            return;
        }

        this._dragTakeoffHoldTimer = (this._dragTakeoffHoldTimer || 0) + dt;
        if (this._dragTakeoffHoldTimer < holdRequired) return;

        this._dragTakeoffHoldTimer = 0;
        const released = this.releaseDraggedObject();
        if (!released) return;

        // tryStartTakeoff will now succeed because isPullDraggingObject() is false.
        // Pass raw joystick so launch velocity uses the actual up input, not the drag-filtered y=0.
        this.tryStartTakeoff({ x: rawX, y: rawY });
    }

    _updateDragHeadRaise(dt) {
        if (!this._neckBone) return;

        const dragCfg = CONFIG.DYNO_DRAG || {};
        const holdRequired = Number.isFinite(dragCfg.dragTakeoffHoldSeconds) ? dragCfg.dragTakeoffHoldSeconds : 1.0;

        let targetT = 0;
        const rawY = this.joystick?.y ?? 0;
        if (this.isPullDraggingObject()) {
            if (rawY > CONFIG.takeoffMinUpInput && holdRequired > 0) {
                // Positive t = head up, driven by how far through the hold we are.
                targetT = THREE.MathUtils.clamp((this._dragTakeoffHoldTimer || 0) / holdRequired, 0, 1);
            } else if (rawY < -0.1) {
                targetT = THREE.MathUtils.clamp(rawY, -1, 0) * 0.5;
            }
        } else if (this.onGround && !this.isAutoDragActive() && !this.isAutoPickupActive()) {
            // On the ground with no drag: tilt neck up/down with input, scaled down for subtlety.
            targetT = THREE.MathUtils.clamp(rawY, -1, 1) * 0.6;
        }

        this._dragHeadRaiseT = THREE.MathUtils.lerp(this._dragHeadRaiseT ?? 0, targetT, Math.min(dt * 8, 1));

        if (Math.abs(this._dragHeadRaiseT) < 0.001) {
            this._appliedNeckRaiseOffset = 0;
            return;
        }

        // Positive t raises head (positive rotation.x in this rig), negative t lowers it.
        const maxAngle = THREE.MathUtils.degToRad(30);
        const offset = maxAngle * this._dragHeadRaiseT;
        this._neckBone.rotation.x += offset;
        this._appliedNeckRaiseOffset = offset;
    }

    updateCarriedObjectFacing() {
        const obj = this.carriedObject;
        if (!obj) {
            return;
        }
        if (this._carryLastFacingDirection === undefined) {
            this._carryLastFacingDirection = this.lastFacingDirection;
        }

        const relation = this._carryFacingRelation ?? 1;

        if (this._carryLastFacingDirection !== this.lastFacingDirection) {
            this._carryLastFacingDirection = this.lastFacingDirection;
            // Apply the same relation that was captured at pickup: if the object started
            // inverted relative to the dyno, keep it inverted after each turn.
            obj.onCarryFacingFlipped?.(this.lastFacingDirection * relation);
            obj.carryTurnYOffset = 0;
        } else if (this.isTurning) {
            // Mirror the dyno's live turn rotation onto the carried object so it
            // rotates in sync. The relation only affects the committed facing on turn
            // completion — the rotation arc itself always follows the dyno's direction.
            obj.carryTurnYOffset = this.currentTurnRotation;
        } else {
            obj.carryTurnYOffset = 0;
        }
    }

    updatePulledLevelObjectVelocity(frameStartX, dt) {
        this.mesh.position.copy(this.position);
        this.mesh.updateMatrixWorld(true);

        if (this.carriedObject?.isPhysicsCarried?.() === true) {
            this.carriedObject.physicsWorld?.updateLevelObjectDragTarget?.(
                this.carriedObject,
                this.carriedObject.getCarryTargetWorldPosition?.(new THREE.Vector3(), this.carrySocket)
            );
        }

        if (this.carriedObject) {
            this.updateCarriedObjectFacing();
        }

        if (!this.draggedObject) {
            return;
        }

        this.draggedObject.physicsWorld?.updateLevelObjectDragTarget?.(
            this.draggedObject,
            this.draggedObject.getDragTargetWorldPosition?.(new THREE.Vector3())
        );

        if (!this.isMouthDraggingObject()) {
            const maxLen = Number.isFinite(CONFIG.DYNO_DRAG?.maxJointLength) ? CONFIG.DYNO_DRAG.maxJointLength : 8;
            const physicsWorld = this.draggedObject.physicsWorld;
            const constraint = physicsWorld?.dragConstraints?.get(this.draggedObject);
            if (constraint && physicsWorld) {
                const pA = physicsWorld.getConstraintPointWorld(constraint, 'A');
                const pB = physicsWorld.getConstraintPointWorld(constraint, 'B');
                const dist = Math.hypot(pB.x - pA.x, pB.y - pA.y);
                if (dist > maxLen) {
                    this.releaseDraggedObject({ force: true });
                }
            }
        }
    }

    tryPickUpObject(levelObject, options = {}) {
        if (this.isInputLocked()) {
            return false;
        }

        if (!levelObject || !this.canPickupObject(levelObject)) {
            return false;
        }

        if (this.canLiftObject(levelObject)) {
            const didPickUp = levelObject.pickUp(this, this.carrySocket, {
                preserveWorldTransform: options.preserveWorldTransform === true
            });
            if (!didPickUp) {
                return false;
            }

            this.carriedObject = levelObject;
            this._carryLastFacingDirection = this.lastFacingDirection;
            // Track whether the object started aligned with the dyno (+1) or inverted (-1).
            this._carryFacingRelation = (levelObject.currentFacingDirection ?? 1) === this.lastFacingDirection ? 1 : -1;
            this.scheduleCarryFlightCollisionBuild();
            this.enterCarryHoverMode();
            this.audioManager?.play?.('grab', { volume: 0.75 });
            return true;
        }

        return this.tryGrabTooHeavyObject(levelObject);
    }

    tryGrabTooHeavyObject(levelObject) {
        const originalWorldPosition = levelObject.getWorldPosition(new THREE.Vector3());
        const didGrab = levelObject.grab?.(this, this.carrySocket);
        if (!didGrab) {
            return false;
        }

        this.grabbedObject = levelObject;
        this.invalidateCarryFlightCollisionCache();
        this.grabbedObjectAnchorWorld.copy(originalWorldPosition);
        this.grabbedObjectPlayerOffsetWorld.copy(this.position).sub(originalWorldPosition);
        this.applyGrabbedObjectAnchorConstraint(true);
        this.enterCarryHoverMode();
        this.audioManager?.play?.('grab', { volume: 0.75 });
        return true;
    }

    applyPositionConstraints() {
        if (!this.positionConstraints?.length) return;
        for (const c of this.positionConstraints) {
            const dx = this.position.x - c.cx;
            const dy = this.position.y - c.cy;
            const dist = Math.hypot(dx, dy);
            if (dist <= c.radius) continue;
            // Clamp position to circle edge.
            const k = c.radius / dist;
            this.position.x = c.cx + dx * k;
            this.position.y = c.cy + dy * k;
            // Cancel outward velocity component.
            const nx = dx / dist;
            const ny = dy / dist;
            const outward = this.velocity.x * nx + this.velocity.y * ny;
            if (outward > 0) {
                this.velocity.x -= outward * nx;
                this.velocity.y -= outward * ny;
            }
        }
    }

    applyGrabbedObjectAnchorConstraint(forceMeshSync = false) {
        if (!this.grabbedObject) {
            return;
        }

        const grabbedWorldPosition = this.grabbedObject.getWorldPosition(new THREE.Vector3());
        this.position.x = grabbedWorldPosition.x + this.grabbedObjectPlayerOffsetWorld.x;
        this.position.y = grabbedWorldPosition.y + this.grabbedObjectPlayerOffsetWorld.y;
        this.velocity.x = 0;
        this.velocity.y = 0;
        this.onGround = false;
        this.airMode = 'hover';
        this.airHoverRecoveryLock = true;
        this.cancelFlightTurn();
        this.flightFacingRotationY = 0;
        this.flightTurnVisualRotation = 0;
        this.airborneAnimationState = 'hover';

        if (forceMeshSync) {
            this.mesh.position.copy(this.position);
        }
    }

    dropCarriedObject(options = {}) {
        if (this.isInputLocked() && options.force !== true) {
            return false;
        }

        if (this.carriedObject) {
            const objectToDrop = this.carriedObject;
            const wasPhysicsCarried = objectToDrop.isPhysicsCarried?.() === true;
            const didDrop = objectToDrop.drop(new THREE.Vector3(this.velocity.x, this.velocity.y, 0));
            if (!didDrop) {
                return false;
            }

            if (CONFIG.LEVEL_OBJECTS?.debugMatterDropDiagnostics === true) {
                console.log('[Player] Released carried object', {
                    object: objectToDrop.getDebugLabel?.() || objectToDrop.type || objectToDrop.name || 'unknown',
                    preservesMatterVelocity: wasPhysicsCarried,
                    dynoVelocity: {
                        x: this.velocity.x,
                        y: this.velocity.y
                    }
                });
            }

            if (this.carriedObject) this.carriedObject.carryTurnYOffset = 0;
            this.carriedObject = null;
            this._carryLastFacingDirection = undefined;
            this._carryFacingRelation = undefined;
            this.invalidateCarryFlightCollisionCache();
            this.recoverFromBlockedCarryDrop();
            return true;
        }

        if (!this.grabbedObject) {
            return false;
        }

        const objectToRelease = this.grabbedObject;
        const didRelease = objectToRelease.releaseGrab?.(this.ground, new THREE.Vector3());
        if (!didRelease) {
            return false;
        }

        this.grabbedObject = null;
        this.invalidateCarryFlightCollisionCache();
        return true;
    }

    releaseGrabbedObject(options = {}) {
        if (this.isInputLocked() && options.force !== true) {
            return false;
        }

        if (!this.grabbedObject) {
            return false;
        }

        const objectToRelease = this.grabbedObject;
        const didRelease = objectToRelease.releaseGrab?.(this.ground, new THREE.Vector3());
        if (!didRelease) {
            return false;
        }

        this.grabbedObject = null;
        this.invalidateCarryFlightCollisionCache();
        return true;
    }

    updateFireInput(dt) {
        void dt;

        if (this.isInputLocked()) {
            this.stopFlame();
            this.fireButtonWasDown = false;
            return;
        }

        if (this.isDraggingObject()) {
            // Dragging uses the mouth/neck for the object interaction, so fire attacks are
            // disabled and any held flame is cancelled immediately.
            this.stopFlame();
            this.fireButtonWasDown = false;
            return;
        }

        this.stopFlame();
        this.fireButtonWasDown = this.isFireInputDown();
    }

    stopGameplayAudioLoops() {
        this.audioManager?.stopLoop?.('gallop');
        this.audioManager?.stopLoop?.('flameLoop');
    }

    updateGameplayAudio(dt) {
        if (!this.audioManager) {
            return;
        }

        const animationState = this.activeAnimationState;
        const groundSpeed = Math.abs(this.actualHorizontalSpeed);
        const isRunning = this.onGround && animationState === 'run' && groundSpeed > 0.5;

        if (isRunning) {
            this.updateGallopAudioPhase();
        } else {
            this.resetGallopAudioPhase();
            this.audioManager.stopLoop('gallop');
        }

        // Footsteps are one-shots tied to traveled ground distance.
        const usesFootsteps = this.onGround &&
            (animationState === 'walk' || animationState === 'drag') &&
            groundSpeed > 0.25;
        if (usesFootsteps) {
            const stepDistance = Math.max((CONFIG.walkCycleDistance ?? 3.5) * 0.5, 0.6);
            if (Math.abs(this.groundTravelDistance - this.lastFootstepDistance) >= stepDistance) {
                this.lastFootstepDistance = this.groundTravelDistance;
                this.audioManager.play('step', {
                    volume: animationState === 'drag' ? 0.5 : 0.62,
                    detune: (Math.random() * 90) - 45,
                    cooldown: 0.08
                });
            }
        } else {
            this.lastFootstepDistance = this.groundTravelDistance;
        }

        const wingflapState = this.getWingflapAudioState(animationState);
        if (!wingflapState) {
            this.resetWingflapAudioPhase();
            return;
        }

        const action = this.animationActions[wingflapState];
        const duration = action?.getClip?.().duration || 0;
        if (!action || duration <= 0) {
            this.resetWingflapAudioPhase();
            return;
        }

        const phase = THREE.MathUtils.euclideanModulo(action.time, duration) / duration;
        const previousPhase = this.lastWingflapAudioPhase;
        const previousState = this.lastWingflapAudioState;
        this.lastWingflapAudioState = wingflapState;
        this.lastWingflapAudioPhase = phase;

        if (previousState !== wingflapState || previousPhase === null) {
            return;
        }

        const downstrokePhase = 0;
        const crossedDownstroke = previousPhase <= phase
            ? previousPhase < downstrokePhase && phase >= downstrokePhase
            : previousPhase < downstrokePhase || phase >= downstrokePhase;

        if (!crossedDownstroke) {
            return;
        }

        this.audioManager.play('wingflap', {
            volume: this.airMode === 'fly' ? 0.48 : 0.36,
            detune: (Math.random() * 70) - 35,
            cooldown: 0.12
        });
    }

    updateGallopAudioPhase() {
        const action = this.animationActions.run;
        const duration = action?.getClip?.().duration || 0;
        if (!action || duration <= 0) {
            this.resetGallopAudioPhase();
            return;
        }

        const phase = THREE.MathUtils.euclideanModulo(action.time, duration) / duration;
        const previousPhase = this.lastGallopAudioPhase;
        const previousState = this.lastGallopAudioState;
        this.lastGallopAudioState = 'run';
        this.lastGallopAudioPhase = phase;

        if (previousState !== 'run' || previousPhase === null) {
            return;
        }

        const beatPhase = 0;
        const crossedBeat = previousPhase <= phase
            ? previousPhase < beatPhase && phase >= beatPhase
            : previousPhase < beatPhase || phase >= beatPhase;

        if (!crossedBeat) {
            return;
        }

        this.audioManager.play('gallop', {
            volume: 0.38,
            detune: (Math.random() * 70) - 35,
            cooldown: 0.12
        });
    }

    resetGallopAudioPhase() {
        this.lastGallopAudioState = null;
        this.lastGallopAudioPhase = null;
    }

    getWingflapAudioState(animationState) {
        if (this.onGround || this.isInWater || this.isDead()) {
            return null;
        }

        const airborneState = this.getAirborneAnimationState();
        if (
            animationState === 'flyGlide' ||
            animationState === 'flyDive' ||
            airborneState === 'flyGlide' ||
            airborneState === 'flyDive'
        ) {
            return null;
        }

        return ['hover', 'hoverUp', 'hoverDown', 'fly', 'flyUp'].includes(animationState)
            ? animationState
            : null;
    }

    resetWingflapAudioPhase() {
        this.lastWingflapAudioState = null;
        this.lastWingflapAudioPhase = null;
    }

    update(dt) {
        this.playerUpdateFrame += 1;
        const wasOnGround = this.onGround;
        const frameStartX = this.position.x;
        const input = this.getCombinedInput();
        this.currentInput = input;
        this.handleDebugCarryPolygonRebuildRequest();
        this.refreshCarryFlightCollisionCacheIfReady();

        if (!this.isDeadState && this.currentHealthValue <= 0) {
            this.beginDeathFlow();
        }

        if (this.isReviving) {
            this.updateReviveState(dt);
            this.actualHorizontalSpeed = 0;
            this.logGroundStateTransition(wasOnGround);
            this.updateFacingDirection(0);
            this.updateGroundAlignment(dt);
            this.logPositionChange();
            this.mesh.position.copy(this.position);
            this.updateDebugHitRect();
            this.updateDynoHitFlash(dt);
            this.updateAnimationState(0, 0, wasOnGround);
            if (this.animationMixer) {
                this.animationMixer.update(dt);
            }
            this.updateUnderwaterTrail(dt);
            this.stopGameplayAudioLoops();
            return;
        }

        if (this.isDeadState) {
            this.updateDeathState(dt);
            this.actualHorizontalSpeed = 0;
            this.logGroundStateTransition(wasOnGround);
            this.updateFacingDirection(0);
            this.updateGroundAlignment(dt);
            this.logPositionChange();
            this.mesh.position.copy(this.position);
            this.updateDebugHitRect();
            this.updateDynoHitFlash(dt);
            this.updateAnimationState(0, 0, wasOnGround);
            if (this.animationMixer) {
                this.animationMixer.update(dt);
            }
            this.updateHoverAnimationBlend(dt);
            this.updateUnderwaterTrail(dt);
            this.stopGameplayAudioLoops();
            return;
        }

        if (this.timelineAnimationControlled) {
            this.actualHorizontalSpeed = 0;
            this.currentInput = { x: 0, y: 0 };
            this.position.copy(this.mesh.position);
            this.updateDebugHitRect();
            this.updateDynoHitFlash(dt);
            if (this.animationMixer) {
                this.animationMixer.update(dt);
            }
            this.updateUnderwaterTrail(dt);
            this.stopGameplayAudioLoops();
            return;
        }

        this.refreshEnergyBoostState();

        if (this.hasAttachedObject() && this.onGround) {
            this.enterCarryHoverMode();
        }

        if (this.isFaintSequenceActive) {
            this.updateFaintSequence(input, dt);
        } else {
            this.updatePostWakeFaintCondition(input);
        }

        // Water entry detection (runs before movement dispatch)
        // The dyno can enter water from outside but never self-exits — water exit
        // must be triggered by a gameplay event (e.g. a story trigger or level unload).
        if (!this.isFaintSequenceActive && !this.isAutoPickupActive() && !this.isAutoDragActive()) {
            if (!this.isInWater && this.checkIsInWater()) {
                this.enterWater();
            }
        }

        if (this.isFaintSequenceActive) {
            // The forced sleep/fall sequence owns movement until the configured animation
            // window ends. Normal controls resume in finishFaintSequence().
        } else if (this.isAutoPickupActive()) {
            this.updateAutoPickupAlignment(dt);
        } else if (this.isAutoDragActive()) {
            this.updateAutoDragAlignment(dt);
        } else if (this.isInWater) {
            this.updateWaterMovement(input, dt);
        } else if (this.onGround) {
            if (this.isPullDraggingObject()) {
                this._updateDragTakeoffHold(input, dt);
            } else {
                this._dragTakeoffHoldTimer = 0;
            }
            const tookOff = this.tryStartTakeoff(input);
            if (!tookOff) {
                this.updateGroundedMovement(input, dt);
            }
        } else {
            const previousAirY = this.position.y;
            this.updateAirborneMovement(input, dt);
            if (!this.tryStartCeilingFaint(input, previousAirY)) {
                this.applyFlightHeightLimit();
            }
        }

        this.handleFaintGroundImpactIfNeeded(wasOnGround);
        if (!this.isFaintSequenceActive && !this.onGround) {
            this.updatePostWakeFaintCondition(input);
        }

        if (this.grabbedObject) {
            // Too-heavy grabs stay visually attached to the foot, but the object remains anchored
            // in the level so the dyno can only flap in place until the player releases it.
            this.applyGrabbedObjectAnchorConstraint();
        }

        this.updatePulledLevelObjectVelocity(frameStartX, dt);
        this.applyPositionConstraints();

        const movedX = Math.abs(this.position.x - frameStartX);
        this.actualHorizontalSpeed = dt > 0 ? (movedX / dt) : Math.abs(this.velocity.x);

        this.updateTurnState(dt, input.x);
        this.logGroundStateTransition(wasOnGround);
        this.updateFacingDirection(input.x);
        this.updateGroundAlignment(dt);
        this.logPositionChange();

        this.mesh.position.copy(this.position);
        this.updateDebugHitRect();
        if (!this.isFaintSequenceActive && !this.isInWater) {
            this.updateFireballCooldown(dt);
            this.updateFireInput(dt);
        }
        this.updateFlameResource(dt);
        this.updateEnergyResource(dt);
        this.updateHealthResource(dt);
        this.updateFuryCharge(dt);
        this.updateDynoHitFlash(dt);
        this.updateAnimationState(input.x, input.y, wasOnGround);
        this.updateLocomotionAnimationSpeed(dt);
        this.updateGameplayAudio(dt);

        // Undo neck raise before mixer overwrites — mirrors DynoFireBreath.beforeAnimationUpdate.
        if (this._neckBone && this._appliedNeckRaiseOffset) {
            this._neckBone.rotation.x -= this._appliedNeckRaiseOffset;
            this._appliedNeckRaiseOffset = 0;
        }

        if (this.animationMixer) {
            this.animationMixer.update(dt);
        }

        // Update hover animation blending based on velocity angle
        this.updateHoverAnimationBlend(dt);

        this._updateDragHeadRaise(dt);
        this.updateUnderwaterTrail(dt);
    }

    getFeetY(positionY = this.position.y) {
        return positionY - PLAYER_RADIUS + 0.05;
    }

    getGroundProbeY(positionY = this.position.y) {
        return this.getFeetY(positionY) + (this.ground.tileHeight ?? 1);
    }

    getCollisionEdges() {
        return this.ground?.getCollisionEdges?.() || [];
    }

    getCollisionEdgeGroups() {
        return this.ground?.getCollisionEdgeGroups?.() || null;
    }

    getTopCollisionEdges(x = null, margin = 0) {
        const groups = this.getCollisionEdgeGroups();
        const result = [];
        if (groups) {
            for (const group of groups) {
                if (x !== null && (x - margin > group.cx + group.r || x + margin < group.cx - group.r)) continue;
                for (const edge of group.edges) {
                    if (edge.type === 'top') result.push(edge);
                }
            }
        } else {
            for (const edge of this.getCollisionEdges()) {
                if (edge.type === 'top') result.push(edge);
            }
        }
        return result;
    }

    forEachTopCollisionEdge(x, margin, callback) {
        if (this.ground?.forEachEdgeGroupNearX && x !== null) {
            this.ground.forEachEdgeGroupNearX(x, margin, (group) => {
                if (x - margin > group.cx + group.r || x + margin < group.cx - group.r) return;
                for (const edge of group.edges) {
                    if (edge.type === 'top') callback(edge);
                }
            });
            return;
        }
        const groups = this.getCollisionEdgeGroups();
        if (groups) {
            for (const group of groups) {
                if (x !== null && (x - margin > group.cx + group.r || x + margin < group.cx - group.r)) continue;
                for (const edge of group.edges) {
                    if (edge.type === 'top') callback(edge);
                }
            }
        } else {
            for (const edge of this.getCollisionEdges()) {
                if (edge.type === 'top') callback(edge);
            }
        }
    }

    getLocalTopEdges(x) {
        // Cache the nearby top edges for the current frame position. All ground queries
        // within one frame happen within a small X window, so one lookup covers all of them.
        const margin = 2;
        if (this._localEdgesX !== null &&
            this._localEdgesX !== undefined &&
            Math.abs(x - this._localEdgesX) <= margin &&
            this._localEdgesFrame === this.playerUpdateFrame) {
            return this._localEdgesCache;
        }
        const result = [];
        this.forEachTopCollisionEdge(x, margin, (edge) => result.push(edge));
        this._localEdgesX = x;
        this._localEdgesFrame = this.playerUpdateFrame;
        this._localEdgesCache = result;
        return result;
    }

    getEdgeVector(edge) {
        return new THREE.Vector2((edge?.x2 ?? edge?.end?.x ?? 0) - (edge?.x1 ?? edge?.start?.x ?? 0), (edge?.y2 ?? edge?.end?.y ?? 0) - (edge?.y1 ?? edge?.start?.y ?? 0));
    }

    getEdgeNormal(edge) {
        if (!edge) {
            return new THREE.Vector2(0, 1);
        }

        // An edge's normal is fixed by its (immutable) geometry, and this runs per-edge in
        // the hot collision loop. Memoize the result on the edge — static level edges persist
        // across frames (computed once), dynamic edges are rebuilt fresh (recomputed harmlessly).
        // No caller mutates the returned normal, so sharing the reference is safe.
        const cached = edge._normalCache;
        if (cached !== undefined) {
            return cached;
        }

        const vector = this.getEdgeVector(edge);
        let normal;
        if (vector.lengthSq() <= 0.000001) {
            if (edge.type === 'left') normal = new THREE.Vector2(-1, 0);
            else if (edge.type === 'right') normal = new THREE.Vector2(1, 0);
            else if (edge.type === 'bottom') normal = new THREE.Vector2(0, -1);
            else normal = new THREE.Vector2(0, 1);
            edge._normalCache = normal;
            return normal;
        }

        normal = new THREE.Vector2(-vector.y, vector.x).normalize();
        if (edge.type === 'top' && normal.y < 0) {
            normal.multiplyScalar(-1);
        } else if (edge.type === 'bottom' && normal.y > 0) {
            normal.multiplyScalar(-1);
        } else if (edge.type === 'left' && normal.x > 0) {
            normal.multiplyScalar(-1);
        } else if (edge.type === 'right' && normal.x < 0) {
            normal.multiplyScalar(-1);
        }
        edge._normalCache = normal;
        return normal;
    }

    getEdgeAngle(edge) {
        if (!edge) {
            return 0;
        }

        const vector = edge.type === 'top'
            ? new THREE.Vector2(edge.x1 - edge.x2, edge.y1 - edge.y2)
            : this.getEdgeVector(edge);
        return vector.lengthSq() <= 0.000001 ? 0 : Math.atan2(vector.y, vector.x);
    }

    isXWithinEdgeSpan(edge, x, padding = 0.0001) {
        const minX = Math.min(edge.x1, edge.x2) - padding;
        const maxX = Math.max(edge.x1, edge.x2) + padding;
        return x >= minX && x <= maxX;
    }

    getEdgeSurfaceYAtX(edge, x) {
        if (!edge || !this.isXWithinEdgeSpan(edge, x)) {
            return null;
        }

        const deltaX = edge.x2 - edge.x1;
        if (Math.abs(deltaX) <= 0.000001) {
            return Math.max(edge.y1, edge.y2);
        }

        const t = (x - edge.x1) / deltaX;
        return THREE.MathUtils.lerp(edge.y1, edge.y2, t);
    }

    getGroundInfoFromEdge(edge, x) {
        const surfaceHeight = this.getEdgeSurfaceYAtX(edge, x);
        if (!edge || surfaceHeight == null) {
            return null;
        }

        return {
            edge,
            surfaceHeight,
            angle: this.getEdgeAngle(edge),
            takeoffAllowed: edge.takeoffAllowed !== false
        };
    }

    getNearestGroundInfoAt(x = this.position.x, positionY = this.position.y, options = {}) {
        const feetY = this.getFeetY(positionY);
        const maxStepUp = Number.isFinite(options.maxStepUp)
            ? options.maxStepUp
            : Math.max(this.getCollisionStepSize() + LOCAL_GROUND_EPSILON, LOCAL_GROUND_EPSILON);
        const maxDropDown = Number.isFinite(options.maxDropDown)
            ? options.maxDropDown
            : Math.max(this.getCollisionStepSize() + LOCAL_GROUND_EPSILON, LOCAL_GROUND_EPSILON);
        let bestGroundInfo = null;
        let bestHeightDelta = Number.POSITIVE_INFINITY;

        const edges = this.getLocalTopEdges(x);
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (!this.isXWithinEdgeSpan(edge, x, 0.05)) continue;
            const surfaceHeight = this.getEdgeSurfaceYAtX(edge, x);
            if (surfaceHeight == null) continue;
            const heightDelta = surfaceHeight - feetY;
            if (heightDelta > maxStepUp || heightDelta < -maxDropDown) continue;
            const deltaMagnitude = Math.abs(heightDelta);
            if (deltaMagnitude >= bestHeightDelta) continue;
            bestGroundInfo = {
                edge,
                surfaceHeight,
                angle: this.getEdgeAngle(edge),
                takeoffAllowed: edge.takeoffAllowed !== false
            };
            bestHeightDelta = deltaMagnitude;
        }

        return bestGroundInfo;
    }

    getGroundInfoBelowAt(x = this.position.x, probeY = this.getFeetY(this.position.y)) {
        let bestGroundInfo = null;

        const edges = this.getLocalTopEdges(x);
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (!this.isXWithinEdgeSpan(edge, x, 0.05)) continue;
            const surfaceHeight = this.getEdgeSurfaceYAtX(edge, x);
            if (surfaceHeight == null || surfaceHeight > probeY + LOCAL_GROUND_EPSILON) continue;
            if (!bestGroundInfo || surfaceHeight > bestGroundInfo.surfaceHeight) {
                bestGroundInfo = {
                    edge,
                    surfaceHeight,
                    angle: this.getEdgeAngle(edge),
                    takeoffAllowed: edge.takeoffAllowed !== false
                };
            }
        }

        return bestGroundInfo;
    }

    applyGroundInfo(groundInfo) {
        if (!groundInfo) {
            return false;
        }
        if (this.isInWater) {
            this.onGround = false;
            this.clearGroundContact();
            return false;
        }

        this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
        this.targetGroundTilt = groundInfo.angle ?? 0;
        this.onGround = true;
        this.lastAirborneHorizontalBlocked = false;
        this.updateGroundContact(groundInfo);
        return true;
    }

    setAirborneState() {
        this.onGround = false;
        this.clearGroundContact();
    }

    // ─── Water gameplay ────────────────────────────────────────────────────────

    buildWaterPolygonCache() {
        const polys = this.ground?.waterPolygons;
        if (!Array.isArray(polys) || polys.length === 0) {
            this.waterPolygonCache = [];
            return;
        }
        this.waterPolygonCache = polys.map((poly) => {
            const pts = poly.points;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of pts) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            const cx = (minX + maxX) * 0.5;
            const cy = (minY + maxY) * 0.5;
            const rx = (maxX - minX) * 0.5;
            const ry = (maxY - minY) * 0.5;
            const cr2 = rx * rx + ry * ry;
            return { polygon: poly, cx, cy, cr2, minX, maxX, maxY };
        });
    }

    buildWaterZoneRectCache() {
        const zones = this.ground?.getMissionZonesByType?.('water') ?? [];
        this.waterZoneRectCache = zones.map((zone) => {
            const cx = (zone.left + zone.right) * 0.5;
            const cy = (zone.bottom + zone.top) * 0.5;
            const rx = (zone.right - zone.left) * 0.5;
            const ry = (zone.top - zone.bottom) * 0.5;
            const cr2 = rx * rx + ry * ry;
            return { zone, cx, cy, cr2 };
        });
    }

    isPointInWaterPolygon(x, y) {
        if (!this.waterPolygonCache) {
            this.buildWaterPolygonCache();
        }
        if (!this.waterPolygonCache || this.waterPolygonCache.length === 0) {
            return false;
        }
        for (const entry of this.waterPolygonCache) {
            if (this.isPointInWaterPolygonEntry(entry, x, y)) {
                return true;
            }
        }
        return false;
    }

    isPointInWaterPolygonEntry(entry, x, y) {
        if (!entry) return false;
        const dx = x - entry.cx;
        const dy = y - entry.cy;
        if (dx * dx + dy * dy > entry.cr2) return false;
        const pts = entry.polygon.points;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
            const a = pts[i];
            const b = pts[j];
            const intersects = ((a.y > y) !== (b.y > y)) &&
                (x < (((b.x - a.x) * (y - a.y)) / Math.max(b.y - a.y, 0.0000001)) + a.x);
            if (intersects) inside = !inside;
        }
        return inside;
    }

    getWaterPolygonEntryAt(x, y) {
        if (!this.waterPolygonCache) {
            this.buildWaterPolygonCache();
        }
        if (!this.waterPolygonCache || this.waterPolygonCache.length === 0) {
            return null;
        }
        for (const entry of this.waterPolygonCache) {
            if (this.isPointInWaterPolygonEntry(entry, x, y)) {
                return entry;
            }
        }
        return null;
    }

    getWaterSurfaceYAtXForPolygonEntry(entry, x) {
        if (!entry?.polygon?.points || entry.polygon.points.length === 0) {
            return null;
        }

        const pts = entry.polygon.points;
        let topY = null;
        const epsilon = 0.0001;

        for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
            const a = pts[j];
            const b = pts[i];
            const minX = Math.min(a.x, b.x) - epsilon;
            const maxX = Math.max(a.x, b.x) + epsilon;
            if (x < minX || x > maxX) continue;

            let sampleY = null;
            if (Math.abs(b.x - a.x) <= epsilon) {
                sampleY = Math.max(a.y, b.y);
            } else {
                const t = (x - a.x) / (b.x - a.x);
                if (t < -epsilon || t > 1 + epsilon) continue;
                sampleY = a.y + ((b.y - a.y) * t);
            }

            if (topY === null || sampleY > topY) {
                topY = sampleY;
            }
        }

        return topY;
    }

    getWaterSurfaceZoneYAtX(x, preferredPolygonEntry = this.currentWaterPolygonEntry) {
        if (!this.waterZoneRectCache) {
            this.buildWaterZoneRectCache();
        }
        if (this.waterZoneRectCache && this.waterZoneRectCache.length > 0) {
            for (const entry of this.waterZoneRectCache) {
                const { zone } = entry;
                if (x < zone.left || x > zone.right) continue;

                const polygonEntry = preferredPolygonEntry ?? this.getWaterPolygonEntryAt(x, this.position.y);
                if (!polygonEntry) {
                    return zone.top;
                }

                let rectSurface = null;
                for (const pt of polygonEntry.polygon.points) {
                    if (pt.x < zone.left || pt.x > zone.right) continue;
                    if (rectSurface === null || pt.y > rectSurface) {
                        rectSurface = pt.y;
                    }
                }

                return rectSurface ?? zone.top;
            }
        }

        const polygonEntry = preferredPolygonEntry ?? this.getWaterPolygonEntryAt(x, this.position.y);
        if (!polygonEntry) {
            return null;
        }

        const surfaceY = this.getWaterSurfaceYAtXForPolygonEntry(polygonEntry, x);
        if (surfaceY === null) {
            return null;
        }

        const exitProbeY = surfaceY + PLAYER_RADIUS + 0.1;
        if (this.isPositionBlockedAt(x, exitProbeY)) {
            return null;
        }

        return surfaceY;
    }

    isPointInCurrentWaterPolygon(x = this.position.x, y = this.position.y) {
        if (!this.currentWaterPolygonEntry) {
            return this.checkIsInWaterOrRect();
        }
        return this.isPointInWaterPolygonEntry(this.currentWaterPolygonEntry, x, y);
    }

    isPointInWaterZoneRect(x, y) {
        if (!this.waterZoneRectCache) {
            this.buildWaterZoneRectCache();
        }
        for (const entry of this.waterZoneRectCache) {
            const dx = x - entry.cx;
            const dy = y - entry.cy;
            if (dx * dx + dy * dy > entry.cr2) continue;
            const { zone } = entry;
            if (x < zone.left || x > zone.right) continue;
            if (y < zone.bottom || y > zone.top) continue;
            return true;
        }
        return false;
    }

    checkIsInWater() {
        const waterConfig = CONFIG.DYNO_WATER;
        if (!waterConfig?.enabled) return false;
        return this.isPointInWaterPolygon(this.position.x, this.position.y);
    }

    checkIsInWaterOrRect() {
        if (!CONFIG.DYNO_WATER?.enabled) return false;
        const x = this.position.x;
        const y = this.position.y;
        return this.isPointInWaterPolygon(x, y) || this.isPointInWaterZoneRect(x, y);
    }

    enterWater() {
        this.playWaterSplashEffect();
        const prevState = this.waterState;
        // Carrying always enters swim_idle_grab — no dive while holding an object
        const isDiveEntry = !this.hasAttachedObject() &&
            (this.airborneAnimationState === 'flyDive' || this.airborneAnimationState === 'flyGlide');
        if (isDiveEntry) {
            this.waterState = 'swimDive';
        } else {
            this.waterState = 'swim';
        }
        this.isInWater = true;
        this.currentWaterPolygonEntry = this.getWaterPolygonEntryAt(this.position.x, this.position.y);
        this.onGround = false;
        this.stopFlame();
        // Initialise flight pivot so deep-swim side-switching starts from current facing
        this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
        this.flightTurnVisualRotation = this.flightFacingRotationY;
        this.cancelFlightTurn();
    }

    exitWater() {
        //console.log(`[Player] exitWater from waterState=${this.waterState}`);
        this.playWaterSplashEffect();
        this.isInWater = false;
        this.waterState = null;
        this.currentWaterPolygonEntry = null;
        this.setAirborneState();
        if (this.airMode !== 'hover' && this.airMode !== 'fly') {
            this.airMode = 'hover';
        }
    }

    setupUnderwaterTrail() {
        this.underwaterTrailGroup?.removeFromParent?.();
        this.underwaterTrailGroup = new THREE.Group();
        this.underwaterTrailGroup.name = 'DynoUnderwaterTrail';
        const trailRenderOrder = (Number.isFinite(this.visualRenderOrder) ? this.visualRenderOrder : 0) + 2;
        this.underwaterTrailGroup.renderOrder = trailRenderOrder;
        this.scene.add(this.underwaterTrailGroup);

        const geometry = new THREE.PlaneGeometry(0.24, 0.24);
        for (let index = 0; index < UNDERWATER_TRAIL_SETTINGS.maxParticles; index += 1) {
            const material = new THREE.MeshBasicMaterial({
                color: index % 3 === 0 ? 0xffffff : 0xb8f3ff,
                transparent: true,
                opacity: 0,
                blending: THREE.NormalBlending,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
                fog: false
            });
            const particle = new THREE.Mesh(geometry, material);
            particle.visible = false;
            particle.renderOrder = trailRenderOrder;
            particle.userData = {
                velocity: new THREE.Vector3(),
                age: 0,
                life: 0.6,
                startSize: 0.12,
                endSize: 0.02,
                spin: 0
            };
            this.underwaterTrailGroup.add(particle);
            this.freeUnderwaterTrailParticles.push(particle);
        }
    }

    updateUnderwaterTrail(dt) {
        const settings = UNDERWATER_TRAIL_SETTINGS;
        const speed = Math.hypot(this.velocity.x, this.velocity.y);
        const canSpawn = this.isInWater &&
            speed >= settings.minSpawnSpeed &&
            this.waterState !== 'swimSurfaceIdle' &&
            this.waterState !== 'swimSurfaceIdleUp';

        if (canSpawn) {
            const speedT = THREE.MathUtils.clamp(speed / Math.max(this.getWaterMaxSpeed?.() || 1, 0.001), 0, 1.6);
            const spawnRate = THREE.MathUtils.lerp(settings.spawnRateMin, settings.spawnRateMax, Math.min(speedT, 1));
            this.underwaterTrailSpawnAccumulator += dt * spawnRate;

            while (this.underwaterTrailSpawnAccumulator >= 1 && this.freeUnderwaterTrailParticles.length > 0) {
                this.underwaterTrailSpawnAccumulator -= 1;
                const particle = this.freeUnderwaterTrailParticles.pop();
                const data = particle.userData;
                const facing = this.lastFacingDirection >= 0 ? 1 : -1;
                const backwardDirection = speed > 0.001
                    ? new THREE.Vector2(-this.velocity.x / speed, -this.velocity.y / speed)
                    : new THREE.Vector2(-facing, 0);
                const sideJitter = (Math.random() - 0.5) * settings.spreadX;
                const verticalJitter = (Math.random() - 0.5) * settings.spreadY;
                const size = THREE.MathUtils.lerp(settings.sizeMin, settings.sizeMax, Math.random());
                const backwardSpeed = THREE.MathUtils.lerp(settings.backwardSpeedMin, settings.backwardSpeedMax, Math.random());
                const upwardDrift = THREE.MathUtils.lerp(settings.driftUpMin, settings.driftUpMax, Math.random());

                const spawnOrigin = this.getMouthWorldPosition(new THREE.Vector3());
                particle.position.set(
                    spawnOrigin.x + sideJitter,
                    spawnOrigin.y + verticalJitter,
                    spawnOrigin.z
                );
                particle.rotation.z = Math.random() * Math.PI * 2;
                particle.scale.setScalar(size);
                particle.material.opacity = 0.75;
                particle.visible = true;

                data.age = 0;
                data.life = THREE.MathUtils.lerp(settings.lifeMin, settings.lifeMax, Math.random());
                data.startSize = size;
                data.endSize = size * (Number.isFinite(settings.endSizeRatio) ? settings.endSizeRatio : 0.35);
                data.spin = (Math.random() - 0.5) * 3.5;
                data.velocity.set(
                    backwardDirection.x * backwardSpeed + ((Math.random() - 0.5) * 0.35),
                    backwardDirection.y * (backwardSpeed * 0.4) + upwardDrift,
                    0
                );

                this.underwaterTrailParticles.push(particle);
            }
        } else {
            this.underwaterTrailSpawnAccumulator = 0;
        }

        for (let index = this.underwaterTrailParticles.length - 1; index >= 0; index -= 1) {
            const particle = this.underwaterTrailParticles[index];
            const data = particle.userData;
            data.age += dt;
            const progress = THREE.MathUtils.clamp(data.age / Math.max(data.life, 0.0001), 0, 1);
            if (progress >= 1) {
                particle.visible = false;
                particle.material.opacity = 0;
                this.underwaterTrailParticles.splice(index, 1);
                this.freeUnderwaterTrailParticles.push(particle);
                continue;
            }

            particle.position.addScaledVector(data.velocity, dt);
            data.velocity.y += 0.7 * dt;
            data.velocity.x *= Math.pow(0.92, Math.max(dt * 60, 0));
            particle.rotation.z += data.spin * dt;
            particle.scale.setScalar(THREE.MathUtils.lerp(data.startSize, data.endSize, progress));
            particle.material.opacity = 0.75 * (1 - progress);            
//            particle.scale.setScalar(3);
        }
    }

    playWaterSplashEffect(options = {}) {
        this.audioManager?.play?.('watersplash', { volume: 0.8 });
        const splashY = Number.isFinite(options.y)
            ? options.y
            : (
                this.getWaterSurfaceZoneYAtX?.(this.position.x) ??
                this.position.y
            );
        this.levelObjectManager?.spawnWaterSplashEffect?.({
            x: this.position.x,
            y: splashY,
            z: this.position.z
        }, {
            scale: options.scale ?? 1.55,
            particleCount: options.particleCount ?? 34
        });
    }

    getWaterSurfaceY() {
        if (!this.waterPolygonCache) {
            this.buildWaterPolygonCache();
        }
        if (!this.waterZoneRectCache) {
            this.buildWaterZoneRectCache();
        }
        const x = this.position.x;
        const y = this.position.y;

        if (this.isInWater && this.currentWaterPolygonEntry) {
            for (const entry of this.waterZoneRectCache) {
                const dx = x - entry.cx;
                const dy = y - entry.cy;
                if (dx * dx + dy * dy > entry.cr2) continue;
                const { zone } = entry;
                if (x < zone.left || x > zone.right) continue;

                const currentSurfaceY = this.getWaterSurfaceYAtXForPolygonEntry(this.currentWaterPolygonEntry, x);
                if (currentSurfaceY !== null) return currentSurfaceY;
                return this.currentWaterPolygonEntry.maxY;
            }

            const currentSurfaceY = this.getWaterSurfaceYAtXForPolygonEntry(this.currentWaterPolygonEntry, x);
            if (currentSurfaceY !== null) return currentSurfaceY;
            return this.currentWaterPolygonEntry.maxY;
        }

        // Check if the player's X is inside a water rect zone — if so, find the highest
        // polygon vertex whose X falls within the rect. That vertex is on the concave
        // surface edge inside the rect, not the global polygon top.
        for (const entry of this.waterZoneRectCache) {
            const dx = x - entry.cx;
            const dy = y - entry.cy;
            if (dx * dx + dy * dy > entry.cr2) continue;
            const { zone } = entry;
            if (x < zone.left || x > zone.right) continue;
            let rectSurface = null;
            for (const poly of this.waterPolygonCache) {
                if (poly.maxX < zone.left || poly.minX > zone.right) continue;
                for (const pt of poly.polygon.points) {
                    if (pt.x < zone.left || pt.x > zone.right) continue;
                    if (rectSurface === null || pt.y > rectSurface) {
                        rectSurface = pt.y;
                    }
                }
            }
            if (rectSurface !== null) return rectSurface;
            return zone.top;
        }
        let topSurface = null;
        for (const entry of this.waterPolygonCache) {
            if (x < entry.minX || x > entry.maxX) continue;
            if (topSurface === null || entry.maxY > topSurface) {
                topSurface = entry.maxY;
            }
        }
        return topSurface;
    }

    isDeepWaterSwim() {
        if (!this.isInWater || this.waterState !== 'swim') return false;
        const deepTilt = CONFIG.DYNO_WATER?.deepTiltDistance ?? 4;
        const surfaceY = this.getWaterSurfaceY();
        return surfaceY !== null && (surfaceY - this.position.y) >= deepTilt;
    }

    updateWaterMovement(input, dt) {
        const waterConfig = CONFIG.DYNO_WATER ?? {};
        const maxSpeed = (waterConfig.waterMaxSpeed ?? 4) * this.getCurrentSpeedMultiplier();
        const surfaceSnap = waterConfig.surfaceSnapDistance ?? 0.5;
        const diveToNormalSpeed = waterConfig.swimDiveToNormalSpeed ?? 5;

        // While carrying, allow full 2D movement (like carrying in air) then fall through to position update
        if (this.hasAttachedObject()) {
            if (this.waterState === 'swimDive' || this.waterState === 'swimSurfaceIdleUp' || this.waterState === 'swimSurfaceIdle') {
                this.waterState = 'swim';
            }
            this.onGround = false;

            // Surface boost exit — same condition as swimSurfaceIdleUp
            const surfaceYCarry = this.getWaterSurfaceZoneYAtX(this.position.x);
            const nearSurfaceCarry = surfaceYCarry !== null && (surfaceYCarry - this.position.y) <= surfaceSnap * 2;
            const boostWantsExitCarry = nearSurfaceCarry &&
                input.y > 0.05 &&
                this.isEnergyBoostButtonDown() &&
                this.energyEmptyTimer <= 0 &&
                this.currentEnergyValue > 0.0001;
            if (boostWantsExitCarry) {
                this.consumeEnergyResource(this.energyDrainValue);
                if (surfaceYCarry !== null) {
                    this.position.y = surfaceYCarry + PLAYER_RADIUS + 0.1;
                }
                const minExitSpeed = waterConfig.minExitWaterSpeed ?? 5;
                this.velocity.y = minExitSpeed;
                this.playWaterSplashEffect();
                this.isInWater = false;
                this.waterState = null;
                this.cancelTurn();
                this.cancelFlightTurn();
                this.airMode = 'hover';
                this.airHoverRecoveryLock = false;
                this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
                this.flightTurnVisualRotation = this.flightFacingRotationY;
                return;
            }

            const drag = waterConfig.waterDrag ?? 0.85;
            const acceleration = waterConfig.waterAcceleration ?? 8;
            const dragFactor = Math.pow(drag, dt);
            this.velocity.x *= dragFactor;
            this.velocity.y *= dragFactor;
            if (Math.abs(input.x) > 0.05) {
                this.velocity.x += input.x * acceleration * dt;
            }
            if (Math.abs(input.y) > 0.05) {
                this.velocity.y += input.y * acceleration * dt;
            }
            const speed = Math.hypot(this.velocity.x, this.velocity.y);
            if (speed > maxSpeed) {
                this.velocity.x = (this.velocity.x / speed) * maxSpeed;
                this.velocity.y = (this.velocity.y / speed) * maxSpeed;
            }
            // Fall through to position update, surface clamp and water-exit checks below
        } else

        // Transition out of swimDive once downward velocity drops enough
        if (this.waterState === 'swimDive') {
            const totalSpeed = Math.hypot(this.velocity.x, this.velocity.y);
            if (totalSpeed < diveToNormalSpeed) {
                this.waterState = 'swim';
            }

            // Sync flight pivot and trigger Y-axis turn when input reverses direction
            if (!this.isFlightTurning) {
                const expectedPivot = this.getFlightBaseRotationY(this.lastFacingDirection);
                if (this.flightFacingRotationY !== expectedPivot) {
                    this.flightFacingRotationY = expectedPivot;
                    this.flightTurnVisualRotation = expectedPivot;
                }
            }
            const inputSignDive = this.getSignWithDeadZone(input.x, 0.05);
            const shouldStartTurnDive = !this.isFlightTurning && inputSignDive !== 0 && inputSignDive !== this.lastFacingDirection;
            const shouldRetargetDive = this.isFlightTurning && inputSignDive !== 0 && inputSignDive !== this.flightTurnTargetFacing;
            if (shouldStartTurnDive || shouldRetargetDive) {
                this.startOrUpdateFlightTurn(inputSignDive);
            }
            // Advance the visual turn rotation (applyFlightTurn is air-only; drive it here for water)
            if (this.isFlightTurning) {
                this.flightTurnElapsed = Math.min(this.flightTurnElapsed + dt, this.flightTurnDuration);
                const progress = this.flightTurnDuration > 0 ? this.flightTurnElapsed / this.flightTurnDuration : 1;
                this.flightTurnVisualRotation = THREE.MathUtils.lerp(
                    this.flightTurnVisualStartRotation,
                    this.flightTurnVisualTargetRotation,
                    progress
                );
                if (progress >= 1) {
                    this.isFlightTurning = false;
                    this.lastFacingDirection = this.flightTurnTargetFacing;
                    this.flightFacingRotationY = this.flightTurnVisualTargetRotation;
                    this.flightTurnVisualRotation = this.flightFacingRotationY;
                }
            }

            // Momentum redirection: input steers the velocity direction, preserving total speed.
            // The stick steers the velocity direction at waterDiveSteerSpeed (radians/sec).
            // Drag rules:
            // waterDiveDrag always bleeds speed. Reversing (>90°) adds extra drag on top.
            const diveDrag = waterConfig.waterDiveDrag ?? 0.97;
            const reverseDrag = waterConfig.waterDiveReverseDrag ?? 0.6;
            const steerSpeed = waterConfig.waterDiveSteerSpeed ?? 6;
            const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
            let extraDrag = 1; // multiplied on top of diveDrag when reversing
            if (currentSpeed > 0.01) {
                const inputMag = Math.hypot(input.x, input.y);
                if (inputMag > 0.05) {
                    const targetAngle = Math.atan2(input.y, input.x);
                    const currentAngle = Math.atan2(this.velocity.y, this.velocity.x);
                    let delta = targetAngle - currentAngle;
                    if (delta > Math.PI) delta -= 2 * Math.PI;
                    if (delta < -Math.PI) delta += 2 * Math.PI;
                    const maxRotation = steerSpeed * inputMag * dt;
                    const rotation = Math.abs(delta) <= maxRotation ? delta : Math.sign(delta) * maxRotation;
                    const newAngle = currentAngle + rotation;
                    this.velocity.x = Math.cos(newAngle) * currentSpeed;
                    this.velocity.y = Math.sin(newAngle) * currentSpeed;
                    // Extra drag only when pointing more than 90° away
                    const absDelta = Math.abs(delta);
                    if (absDelta > Math.PI / 2) {
                        const reverseT = (absDelta - Math.PI / 2) / (Math.PI / 2);
                        extraDrag = THREE.MathUtils.lerp(1, reverseDrag, reverseT);
                    }
                }
            }
            const dragFactor = Math.pow(diveDrag * extraDrag, dt);
            this.velocity.x *= dragFactor;
            this.velocity.y *= dragFactor;
        }

        if (this.waterState === 'swim' && this.isDeepWaterSwim()) {
            // ── Deep water: behaves like fly mode ─────────────────────────────
            // Sync flight pivot to lastFacingDirection whenever it drifts out of sync
            // (e.g. after a surface turn completed and zeroed it, or on first deep entry).
            if (!this.isFlightTurning) {
                const expectedPivot = this.getFlightBaseRotationY(this.lastFacingDirection);
                if (this.flightFacingRotationY !== expectedPivot) {
                    this.flightFacingRotationY = expectedPivot;
                    this.flightTurnVisualRotation = expectedPivot;
                }
            }

            // Trigger the Y-axis flight-turn pivot when X input reverses direction,
            // then accelerate toward the joystick target using water speeds.
            const inputSign = this.getSignWithDeadZone(input.x, 0.05);
            const shouldStartTurn = !this.isFlightTurning && inputSign !== 0 && inputSign !== this.lastFacingDirection;
            const shouldRetarget = this.isFlightTurning && inputSign !== 0 && inputSign !== this.flightTurnTargetFacing;
            if (shouldStartTurn || shouldRetarget) {
                this.startOrUpdateFlightTurn(inputSign);
            }

            if (this.isFlightTurning) {
                // During the turn, brake X and drive Y with water speeds
                this.velocity.x = this.moveToward(this.velocity.x, 0, CONFIG.flightTurnSpeedDecrease * dt);
                const targetVY = input.y * maxSpeed;
                this.velocity.y = this.moveToward(
                    this.velocity.y, targetVY,
                    (Math.abs(targetVY) > Math.abs(this.velocity.y) ? CONFIG.flightAcceleration : CONFIG.flightDeceleration) * dt
                );
                // Update the visual pivot rotation
                this.flightTurnElapsed = Math.min(this.flightTurnElapsed + dt, this.flightTurnDuration);
                const progress = this.flightTurnDuration > 0 ? this.flightTurnElapsed / this.flightTurnDuration : 1;
                this.flightTurnVisualRotation = THREE.MathUtils.lerp(
                    this.flightTurnVisualStartRotation,
                    this.flightTurnVisualTargetRotation,
                    progress
                );
                const hasStoppedH = Math.abs(this.velocity.x) <= DYNO_MODEL_SETTINGS.animationSpeedDeadZone;
                if (progress >= 1 && hasStoppedH) {
                    this.isFlightTurning = false;
                    this.velocity.x = 0;
                    this.lastFacingDirection = this.flightTurnTargetFacing;
                    this.flightFacingRotationY = this.flightTurnVisualTargetRotation;
                    this.flightTurnVisualRotation = this.flightFacingRotationY;
                    this.flightTurnPitchReferenceX = 0;
                }
            } else {
                const targetVX = input.x * maxSpeed;
                const targetVY = input.y * maxSpeed;
                this.velocity.x = this.moveToward(
                    this.velocity.x, targetVX,
                    (Math.abs(targetVX) > Math.abs(this.velocity.x) ? CONFIG.flightTurnSpeedIncrease : CONFIG.flightTurnSpeedDecrease) * dt
                );
                this.velocity.y = this.moveToward(
                    this.velocity.y, targetVY,
                    (Math.abs(targetVY) > Math.abs(this.velocity.y) ? CONFIG.flightAcceleration : CONFIG.flightDeceleration) * dt
                );
            }

            this.velocity.x = THREE.MathUtils.clamp(this.velocity.x, -maxSpeed, maxSpeed);
            this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -maxSpeed, maxSpeed);

        } else if (this.waterState === 'swim') {
            // ── Shallow swim (near surface) ────────────────────────────────────
            const drag = waterConfig.waterDrag ?? 0.85;
            const diveDrag = waterConfig.waterDiveDrag ?? 0.97;
            const acceleration = waterConfig.waterAcceleration ?? 8;
            const speedNow = Math.hypot(this.velocity.x, this.velocity.y);

            if (speedNow > maxSpeed) {
                // Still carrying dive momentum — same steer-and-drag model as swimDive
                const reverseDrag = waterConfig.waterDiveReverseDrag ?? 0.6;
                const steerSpeed = waterConfig.waterDiveSteerSpeed ?? 6;
                let extraDrag = 1;
                const inputMag = Math.hypot(input.x, input.y);
                if (inputMag > 0.05) {
                    const targetAngle = Math.atan2(input.y, input.x);
                    const currentAngle = Math.atan2(this.velocity.y, this.velocity.x);
                    let delta = targetAngle - currentAngle;
                    if (delta > Math.PI) delta -= 2 * Math.PI;
                    if (delta < -Math.PI) delta += 2 * Math.PI;
                    const maxRotation = steerSpeed * inputMag * dt;
                    const rotation = Math.abs(delta) <= maxRotation ? delta : Math.sign(delta) * maxRotation;
                    const newAngle = currentAngle + rotation;
                    this.velocity.x = Math.cos(newAngle) * speedNow;
                    this.velocity.y = Math.sin(newAngle) * speedNow;
                    const absDelta = Math.abs(delta);
                    if (absDelta > Math.PI / 2) {
                        const reverseT = (absDelta - Math.PI / 2) / (Math.PI / 2);
                        extraDrag = THREE.MathUtils.lerp(1, reverseDrag, reverseT);
                    }
                }
                const dragFactor = Math.pow(diveDrag * extraDrag, dt);
                this.velocity.x *= dragFactor;
                this.velocity.y *= dragFactor;
            } else {
                const dragFactor = Math.pow(drag, dt);
                this.velocity.x *= dragFactor;
                this.velocity.y *= dragFactor;
                if (Math.abs(input.x) > 0.05) {
                    this.velocity.x += input.x * acceleration * dt;
                    const absVx = Math.abs(this.velocity.x);
                    if (absVx > maxSpeed) this.velocity.x = (this.velocity.x / absVx) * maxSpeed;
                }
                if (Math.abs(input.y) > 0.05) {
                    this.velocity.y += input.y * acceleration * dt;
                    const absVy = Math.abs(this.velocity.y);
                    if (absVy > maxSpeed) this.velocity.y = (this.velocity.y / absVy) * maxSpeed;
                }
            }

            // Surface state management
            const surfaceY = this.getWaterSurfaceZoneYAtX(this.position.x);
            const nearSurface = surfaceY !== null && (surfaceY - this.position.y) <= surfaceSnap * 2 && (surfaceY - this.position.y) >= -0.5;
            if (nearSurface) {
                this.cancelFlightTurn();
                if (input.y > 0.05) {
                    this.waterState = 'swimSurfaceIdleUp';
                    this.position.y = surfaceY - surfaceSnap;
                    this.velocity.y = 0;
                } else if (input.y < -0.05) {
                    this.waterState = 'swim';
                } else {
                    this.waterState = 'swimSurfaceIdle';
                    this.position.y = surfaceY - surfaceSnap;
                    this.velocity.y = 0;
                }
            }

        } else if (this.waterState === 'swimSurfaceIdle') {
            const drag = waterConfig.waterDrag ?? 0.85;
            const acceleration = waterConfig.waterAcceleration ?? 8;
            const surfaceY = this.getWaterSurfaceZoneYAtX(this.position.x);
            if (surfaceY !== null) {
                this.position.y = surfaceY - surfaceSnap;
                this.velocity.y = 0;
            } else {
                this.waterState = 'swim';
            }
            const inputSign = input.x > 0.05 ? 1 : input.x < -0.05 ? -1 : 0;
            const velSign = this.velocity.x > 0.001 ? 1 : this.velocity.x < -0.001 ? -1 : 0;
            const reversingDirection = inputSign !== 0 && velSign !== 0 && inputSign !== velSign;
            const brakeMul = waterConfig.waterSurfaceBrakeMultiplier ?? 4;
            const brakeAccel = acceleration * (reversingDirection ? brakeMul : 1) * dt;
            if (this.isTurning || reversingDirection || inputSign === 0) {
                // Brake to zero: during turn, when reversing, or when stick is released
                if (Math.abs(this.velocity.x) <= brakeAccel) {
                    this.velocity.x = 0;
                } else {
                    this.velocity.x -= Math.sign(this.velocity.x) * brakeAccel;
                }
            } else {
                this.velocity.x += input.x * acceleration * dt;
                const absVx = Math.abs(this.velocity.x);
                if (absVx > maxSpeed) this.velocity.x = (this.velocity.x / absVx) * maxSpeed;
            }
            if (input.y > 0.05) this.waterState = 'swimSurfaceIdleUp';
            if (input.y < -0.05) this.waterState = 'swim';

            // Exit to walking when pressing into a shore: probe horizontally at water surface level
            if (inputSign !== 0) {
                const checkDist = waterConfig.exitToGroundCheckDistance ?? 1.0;
                const shoreProbeX = this.position.x + inputSign * checkDist;
                const waterSurfaceY = this.getWaterSurfaceZoneYAtX(this.position.x);
                if (waterSurfaceY === null) {
                    this.waterState = 'swim';
                    this.onGround = false;
                    this.clearGroundContact();
                    return;
                }
                // Probe just below the water surface so we catch ground flush with the shore
                const shoreGround = this.getGroundInfoBelowAt(shoreProbeX, waterSurfaceY);
                if (shoreGround && shoreGround.surfaceHeight >= waterSurfaceY - surfaceSnap) {
                    // Move to shore position first so the dyno is outside the water polygon
                    this.position.x = shoreProbeX;
                    this.velocity.x = 0;
                    this.velocity.y = 0;
                    this.isInWater = false;
                    this.waterState = null;
                    this.cancelTurn();
                    this.cancelFlightTurn();
                    this.applyGroundInfo(shoreGround);
                    return;
                }
            }

        } else if (this.waterState === 'swimSurfaceIdleUp') {
            const minExitSpeed = waterConfig.minExitWaterSpeed ?? 5;
            const drag = waterConfig.waterDrag ?? 0.85;
            const acceleration = waterConfig.waterAcceleration ?? 8;
            const surfaceY = this.getWaterSurfaceZoneYAtX(this.position.x);
            if (surfaceY !== null) {
                this.position.y = surfaceY - surfaceSnap;
            } else {
                this.waterState = 'swim';
            }

            // Exit to hover/fly when boost button is held with up input (bypass velocity requirement)
            const boostWantsExit = input.y > 0.05 &&
                this.isEnergyBoostButtonDown() &&
                this.currentEnergyValue > 0.0001;
            if (boostWantsExit) {
                this.consumeEnergyResource(this.energyDrainValue);
                // Move above the water surface so checkIsInWater() returns false next frame
                const exitSurfaceY = this.getWaterSurfaceZoneYAtX(this.position.x);
                if (exitSurfaceY !== null) {
                    this.position.y = exitSurfaceY + PLAYER_RADIUS + 0.1;
                }
                this.velocity.y = minExitSpeed;
                this.playWaterSplashEffect();
                this.isInWater = false;
                this.waterState = null;
                this.cancelTurn();
                this.cancelFlightTurn();
                this.airMode = 'hover';
                this.airHoverRecoveryLock = false;
                this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
                this.flightTurnVisualRotation = this.flightFacingRotationY;
                return;
            }

            const inputSignUp = input.x > 0.05 ? 1 : input.x < -0.05 ? -1 : 0;

            // Exit to walking when pressing into a shore (same logic as swimSurfaceIdle)
            if (inputSignUp !== 0) {
                const checkDist = waterConfig.exitToGroundCheckDistance ?? 1.0;
                const shoreProbeX = this.position.x + inputSignUp * checkDist;
                const waterSurfaceY = this.getWaterSurfaceZoneYAtX(this.position.x);
                if (waterSurfaceY === null) {
                    this.waterState = 'swim';
                    this.onGround = false;
                    this.clearGroundContact();
                    return;
                }
                const shoreGround = this.getGroundInfoBelowAt(shoreProbeX, waterSurfaceY);
                if (shoreGround && shoreGround.surfaceHeight >= waterSurfaceY - surfaceSnap) {
                    this.position.x = shoreProbeX;
                    this.velocity.x = 0;
                    this.velocity.y = 0;
                    this.isInWater = false;
                    this.waterState = null;
                    this.cancelTurn();
                    this.cancelFlightTurn();
                    this.applyGroundInfo(shoreGround);
                    return;
                }
            }

            // Without boost, up alone stays at surface
            if (input.y > 0.05) {
                // intentionally no exit — just hold position
            } else {
                this.velocity.y = 0;
                this.waterState = input.y < -0.05 ? 'swim' : 'swimSurfaceIdle';
            }

            const velSignUp = this.velocity.x > 0.001 ? 1 : this.velocity.x < -0.001 ? -1 : 0;
            const reversingDirectionUp = inputSignUp !== 0 && velSignUp !== 0 && inputSignUp !== velSignUp;
            const brakeMulUp = waterConfig.waterSurfaceBrakeMultiplier ?? 4;
            const brakeAccelUp = acceleration * (reversingDirectionUp ? brakeMulUp : 1) * dt;
            if (this.isTurning || reversingDirectionUp || inputSignUp === 0) {
                if (Math.abs(this.velocity.x) <= brakeAccelUp) {
                    this.velocity.x = 0;
                } else {
                    this.velocity.x -= Math.sign(this.velocity.x) * brakeAccelUp;
                }
            } else {
                this.velocity.x += input.x * acceleration * dt;
                const absVx = Math.abs(this.velocity.x);
                if (absVx > maxSpeed) this.velocity.x = (this.velocity.x / absVx) * maxSpeed;
            }
        }

        // Move position
        this.position.x += this.velocity.x * dt;
        this.position.y += this.velocity.y * dt;

        // Clamp: never move above the water surface — swimDive always exits to fly, others need upward speed
        const surfaceYFinal = this.getWaterSurfaceZoneYAtX(this.position.x);
        if (surfaceYFinal !== null && this.position.y > surfaceYFinal - surfaceSnap) {
            const minExitSpeed = waterConfig.minExitWaterSpeed ?? 5;
            if (this.waterState === 'swimDive' || this.velocity.y >= minExitSpeed) {
                this.position.y = surfaceYFinal + PLAYER_RADIUS + 0.1;
                this.playWaterSplashEffect();
                this.isInWater = false;
                this.waterState = null;
                this.cancelTurn();
                this.cancelFlightTurn();
                this.airMode = 'fly';
                this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
                this.flightTurnVisualRotation = this.flightFacingRotationY;
                return;
            }
            this.position.y = surfaceYFinal - surfaceSnap;
            if (this.velocity.y > 0) this.velocity.y = 0;
        }

        // Clamp: if outside water after X move, roll back X
        if (!this.isPointInCurrentWaterPolygon()) {
            this.position.x -= this.velocity.x * dt;
            this.velocity.x = 0;
        }

        // Clamp: if still outside water after Y move (hit bottom or side), roll back Y
        if (!this.isPointInCurrentWaterPolygon()) {
            this.position.y -= this.velocity.y * dt;
            this.velocity.y = 0;
        }

        this.onGround = false;
        this.clearGroundContact();
    }

    getWaterAnimationState() {
        if (this.hasAttachedObject()) {
            return 'swimIdleGrab';
        }
        switch (this.waterState) {
            case 'swimDive': return 'swimDive';
            case 'swimSurfaceIdle': return 'swimIdle';
            case 'swimSurfaceIdleUp': return 'swimIdleUp';
            case 'swim': {
                const vx = this.velocity.x;
                const vy = this.velocity.y;
                const moving = Math.sqrt(vx * vx + vy * vy) > DYNO_MODEL_SETTINGS.animationSpeedDeadZone;
                const hasInput = Math.abs(this.currentInput?.x ?? 0) > 0.05 || Math.abs(this.currentInput?.y ?? 0) > 0.05;
                return (moving || hasInput) ? 'swimNormal' : 'swimIdle';
            }
            default: return 'swimIdle';
        }
    }

    // ──────────────────────────────────────────────────────────────────────────

    setTargetGroundTilt(angle = 0, { snapVisual = false } = {}) {
        this.targetGroundTilt = angle;
        if (snapVisual) {
            this.currentGroundTilt = angle;
        }
    }

    getGroundInfoAt(x = this.position.x, positionY = this.position.y) {
        return this.getNearestGroundInfoAt(x, positionY, {
            maxStepUp: this.onGround ? this.getCollisionStepSize() + LOCAL_GROUND_EPSILON : LOCAL_GROUND_EPSILON,
            maxDropDown: this.getCollisionStepSize() + LOCAL_GROUND_EPSILON
        });
    }

    getAdjacentGroundInfoAt(x = this.position.x, positionY = this.position.y) {
        return this.getGroundInfoAt(x, positionY);
    }

    getAdjacentLandingGroundInfoAt(x = this.position.x, previousPositionY = this.position.y, candidatePositionY = this.position.y) {
        const previousFeetY = this.getFeetY(previousPositionY);
        const candidateFeetY = this.getFeetY(candidatePositionY);
        let bestGroundInfo = null;

        const edges = this.getLocalTopEdges(x);
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (!this.isXWithinEdgeSpan(edge, x, 0.05)) continue;
            const surfaceHeight = this.getEdgeSurfaceYAtX(edge, x);
            if (surfaceHeight == null) continue;
            const wasAboveSurface = previousFeetY >= surfaceHeight - LOCAL_GROUND_EPSILON;
            const crossedSurface = candidateFeetY <= surfaceHeight + LOCAL_GROUND_EPSILON;
            if (!wasAboveSurface || !crossedSurface) continue;
            if (!bestGroundInfo || surfaceHeight > bestGroundInfo.surfaceHeight) {
                bestGroundInfo = {
                    edge,
                    surfaceHeight,
                    angle: this.getEdgeAngle(edge),
                    takeoffAllowed: edge.takeoffAllowed !== false
                };
            }
        }

        return bestGroundInfo;
    }

    getPenetratingGroundInfoAt(x = this.position.x, positionY = this.position.y) {
        const feetY = this.getFeetY(positionY);
        const maxPenetration = Math.max(this.getCollisionStepSize() + LOCAL_GROUND_EPSILON, LOCAL_GROUND_EPSILON);
        let bestGroundInfo = null;
        const edges = this.getLocalTopEdges(x);
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (!this.isXWithinEdgeSpan(edge, x, 0.05)) continue;
            const surfaceHeight = this.getEdgeSurfaceYAtX(edge, x);
            if (surfaceHeight == null) continue;
            const penetrationDepth = surfaceHeight - feetY;
            if (penetrationDepth < -LOCAL_GROUND_EPSILON || penetrationDepth > maxPenetration) continue;
            if (!bestGroundInfo || surfaceHeight > bestGroundInfo.surfaceHeight) {
                bestGroundInfo = {
                    edge,
                    surfaceHeight,
                    angle: this.getEdgeAngle(edge),
                    takeoffAllowed: edge.takeoffAllowed !== false
                };
            }
        }
        return bestGroundInfo;
    }

    getDistanceToGroundBelow(positionX = this.position.x, positionY = this.position.y) {
        const feetY = this.getFeetY(positionY);
        let nearestSurfaceHeight = null;
        const edges = this.getLocalTopEdges(positionX);
        for (let i = 0; i < edges.length; i++) {
            const edge = edges[i];
            if (!this.isXWithinEdgeSpan(edge, positionX, 0.05)) continue;
            const surfaceHeight = this.getEdgeSurfaceYAtX(edge, positionX);
            if (surfaceHeight == null || surfaceHeight > feetY + LOCAL_GROUND_EPSILON) continue;
            if (nearestSurfaceHeight == null || surfaceHeight > nearestSurfaceHeight) {
                nearestSurfaceHeight = surfaceHeight;
            }
        }
        return nearestSurfaceHeight == null
            ? Number.POSITIVE_INFINITY
            : Math.max(0, feetY - nearestSurfaceHeight);
    }

    isWithinNearGroundHoverLockDistance() {
        const hoverLockDistance = Number.isFinite(CONFIG.nearGroundHoverLockDistance)
            ? CONFIG.nearGroundHoverLockDistance
            : 1.5;

        if (hoverLockDistance <= 0) {
            return false;
        }

        if (this.getDistanceToGroundBelow() <= hoverLockDistance) {
            return true;
        }

        // Also lock hover when flying just above a water surface
        const waterSurfaceY = this.getWaterSurfaceY();
        if (waterSurfaceY !== null) {
            const distToWaterSurface = Math.max(0, this.getFeetY() - waterSurfaceY);
            if (distToWaterSurface <= hoverLockDistance) {
                return true;
            }
        }

        return false;
    }

    shouldLockHoverNearGround() {
        // Only apply this rule to non-carry hover. Carrying already has its own dedicated
        // hover-only rule; this one exists to keep low-altitude hovering stable and readable.
        return (
            !this.carriedObject &&
            !this.isFaintConditionActive &&
            !this.onGround &&
            this.airMode === 'hover' &&
            this.isWithinNearGroundHoverLockDistance()
        );
    }

    canStayGroundedOnSurface(currentGroundInfo, candidateGroundInfo) {
        if (!currentGroundInfo || !candidateGroundInfo) {
            return false;
        }

        // Ground follow is local only: small slope-height changes are fine, but a missing or
        // distant lower surface means the dyno leaves the ground instead of snapping downward.
        const dropDistance = currentGroundInfo.surfaceHeight - candidateGroundInfo.surfaceHeight;
        return dropDistance <= this.getCollisionStepSize() + LOCAL_GROUND_EPSILON;
    }

    getCollisionStepSize() {
        const configuredStep = CONFIG.DYNO_MOVEMENT?.maxStepSize;
        if (Number.isFinite(configuredStep) && configuredStep > 0) {
            return configuredStep;
        }

        const levelStep = Math.min(this.ground?.tileWidth ?? 1, this.ground?.tileHeight ?? 1);
        const ratio = Number.isFinite(CONFIG.DYNO_MOVEMENT?.maxStepSizeTileRatio)
            ? CONFIG.DYNO_MOVEMENT.maxStepSizeTileRatio
            : 0.4;
        return Math.max(0.2, levelStep * ratio);
    }

    getMaxMovementSteps() {
        return Math.max(
            1,
            Math.floor(
                Number.isFinite(CONFIG.DYNO_MOVEMENT?.maxMovementSteps)
                    ? CONFIG.DYNO_MOVEMENT.maxMovementSteps
                    : 10
            )
        );
    }

    getMovementStepCount(deltaX, deltaY = 0) {
        const maxDelta = Math.max(Math.abs(deltaX), Math.abs(deltaY));
        if (maxDelta <= 0.0001) {
            return 0;
        }

        // Stepping/sweeping prevents tunneling: every frame movement is decomposed into
        // sub-tile increments, so collision samples cannot jump from one side of a wall to
        // the other without testing the tile in between.
        return Math.min(
            this.getMaxMovementSteps(),
            Math.max(1, Math.ceil(maxDelta / this.getCollisionStepSize()))
        );
    }

    getCollisionSampleOffsets() {
        if (!this._collisionSampleOffsets) {
            const sideRadius = PLAYER_RADIUS - 0.02;
            const diagonalRadius = PLAYER_RADIUS * 0.92;
            const diagonalHigh = diagonalRadius * 0.7;
            const diagonalLow = diagonalRadius * 0.35;
            this._collisionSampleOffsets = [
                new THREE.Vector2(0, 0),
                new THREE.Vector2(0, PLAYER_RADIUS - 0.05),
                new THREE.Vector2(0, -PLAYER_RADIUS + 0.05),
                new THREE.Vector2(sideRadius, 0),
                new THREE.Vector2(-sideRadius, 0),
                new THREE.Vector2(diagonalHigh, diagonalHigh),
                new THREE.Vector2(-diagonalHigh, diagonalHigh),
                new THREE.Vector2(diagonalHigh, -diagonalLow),
                new THREE.Vector2(-diagonalHigh, -diagonalLow)
            ];
        }
        return this._collisionSampleOffsets;
    }

    shouldEdgeCollide(edge, movement, options = {}) {
        if (!edge) {
            return false;
        }

        if (edge.type === 'bottom') {
            return edge.regionType !== 'fly_through' && movement.y > 0.0001;
        }

        if (edge.type === 'top') {
            if (edge.regionType === 'fly_through') {
                return movement.y < -0.0001;
            }

            const normal = this.getEdgeNormal(edge);
            return Math.abs(movement.dot(normal)) > 0.0001;
        }

        const normal = this.getEdgeNormal(edge);
        return movement.dot(normal) < -0.0001;
    }

    getSegmentIntersection(start, delta, edge) {
        const edgeStart = new THREE.Vector2(edge.x1, edge.y1);
        const edgeDelta = new THREE.Vector2(edge.x2 - edge.x1, edge.y2 - edge.y1);
        const denominator = (delta.x * edgeDelta.y) - (delta.y * edgeDelta.x);
        if (Math.abs(denominator) <= 0.000001) {
            return null;
        }

        const diff = edgeStart.clone().sub(start);
        const t = ((diff.x * edgeDelta.y) - (diff.y * edgeDelta.x)) / denominator;
        const u = ((diff.x * delta.y) - (diff.y * delta.x)) / denominator;
        if (t < -0.000001 || t > 1.000001 || u < -0.000001 || u > 1.000001) {
            return null;
        }

        return {
            t: THREE.MathUtils.clamp(t, 0, 1),
            u: THREE.MathUtils.clamp(u, 0, 1),
            point: start.clone().add(delta.clone().multiplyScalar(t))
        };
    }

    findEarliestEdgeCollision(startPosition, movement, options = {}) {
        if (movement.lengthSq() <= 0.000001) {
            return null;
        }

        let bestCollision = null;
        const baseSampleOffsets = Array.isArray(options.sampleOffsets)
            ? options.sampleOffsets
            : this.getCollisionSampleOffsets();
        const extraSampleOffsets = Array.isArray(options.extraSampleOffsets)
            ? options.extraSampleOffsets
            : [];
        const sampleOffsets = Array.isArray(options.sampleOffsets)
            ? baseSampleOffsets
            : [
                ...baseSampleOffsets,
                ...extraSampleOffsets
            ];

        // Compute max sample offset radius once for bounding circle culling.
        let maxSampleRadius = 0;
        for (const o of sampleOffsets) {
            const d = Math.sqrt(o.x * o.x + o.y * o.y);
            if (d > maxSampleRadius) maxSampleRadius = d;
        }

        // Reusable scratch — avoids per-sample Vector2 allocations in the inner loop.
        const _sampleStart = this._scratchSampleStart || (this._scratchSampleStart = new THREE.Vector2());
        const mx = movement.x, my = movement.y;

        const testEdges = (edges) => {
            for (const edge of edges) {
                if (!this.shouldEdgeCollide(edge, movement, options)) {
                    continue;
                }

                const normal = this.getEdgeNormal(edge);
                // Inline edge geometry once per edge.
                const ex1 = edge.x1, ey1 = edge.y1;
                const edx = edge.x2 - ex1, edy = edge.y2 - ey1;
                const denom = mx * edy - my * edx;
                if (Math.abs(denom) <= 0.000001) continue;
                const invDenom = 1 / denom;

                for (const sampleOffset of sampleOffsets) {
                    if (edge.type === 'top' && sampleOffset.y > 0.1) {
                        continue;
                    }

                    const sx = startPosition.x + sampleOffset.x;
                    const sy = startPosition.y + sampleOffset.y;
                    const diffX = ex1 - sx, diffY = ey1 - sy;
                    const t = (diffX * edy - diffY * edx) * invDenom;
                    if (t < -0.000001 || t > 1.000001) continue;
                    const u = (diffX * my - diffY * mx) * invDenom;
                    if (u < -0.000001 || u > 1.000001) continue;

                    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
                    if (!bestCollision || tc < bestCollision.t) {
                        _sampleStart.set(sx, sy);
                        bestCollision = {
                            edge,
                            normal,
                            t: tc,
                            point: _sampleStart.clone().addScaledVector(movement, tc),
                            centerPoint: startPosition.clone().addScaledVector(movement, tc)
                        };
                    }
                }
            }
        };

        if (Array.isArray(options.edges)) {
            // Explicit edge list supplied — no culling needed.
            testEdges(options.edges);
        } else if (this.ground?.forEachEdgeGroupNearX) {
            const ex = movement.x, ey = movement.y;
            const lenSq = ex * ex + ey * ey;
            const marginX = Math.abs(ex) + maxSampleRadius;
            const midX = startPosition.x + ex * 0.5;
            this.ground.forEachEdgeGroupNearX(midX, marginX, (group) => {
                const dx = group.cx - startPosition.x;
                const dy = group.cy - startPosition.y;
                const t = lenSq > 0 ? Math.max(0, Math.min(1, (dx * ex + dy * ey) / lenSq)) : 0;
                const closestX = startPosition.x + t * ex;
                const closestY = startPosition.y + t * ey;
                const distSq = (group.cx - closestX) ** 2 + (group.cy - closestY) ** 2;
                const cullRadius = group.r + maxSampleRadius;
                if (distSq > cullRadius * cullRadius) return;
                testEdges(group.edges);
            });
        } else {
            const groups = this.getCollisionEdgeGroups();
            if (groups) {
                const ex = movement.x, ey = movement.y;
                const lenSq = ex * ex + ey * ey;
                for (const group of groups) {
                    const dx = group.cx - startPosition.x;
                    const dy = group.cy - startPosition.y;
                    const t = lenSq > 0 ? Math.max(0, Math.min(1, (dx * ex + dy * ey) / lenSq)) : 0;
                    const closestX = startPosition.x + t * ex;
                    const closestY = startPosition.y + t * ey;
                    const distSq = (group.cx - closestX) ** 2 + (group.cy - closestY) ** 2;
                    const cullRadius = group.r + maxSampleRadius;
                    if (distSq > cullRadius * cullRadius) continue;
                    testEdges(group.edges);
                }
            } else {
                testEdges(this.getCollisionEdges());
            }
        }

        return bestCollision;
    }

    isPositionBlockedAt(x, y, extraSampleOffsets = []) {
        const point = new THREE.Vector2(this.position.x, this.position.y);
        const movement = new THREE.Vector2(x - point.x, y - point.y);
        return Boolean(this.findEarliestEdgeCollision(point, movement, { ignoreGroundTiles: false, extraSampleOffsets }));
    }

    isGroundedPositionBlockedAt(x, y) {
        const point = new THREE.Vector2(this.position.x, this.position.y);
        const movement = new THREE.Vector2(x - point.x, y - point.y);
        const ex = movement.x, ey = movement.y;
        const lenSq = ex * ex + ey * ey;
        const cullRadius = PLAYER_RADIUS + 0.1;
        const marginX = Math.abs(ex) + cullRadius;
        const midX = point.x + ex * 0.5;

        if (this.ground?.forEachEdgeGroupNearX) {
            let blocked = false;
            this.ground.forEachEdgeGroupNearX(midX, marginX, (group) => {
                if (blocked) return;
                const dx = group.cx - point.x;
                const dy = group.cy - point.y;
                const t = lenSq > 0 ? Math.max(0, Math.min(1, (dx * ex + dy * ey) / lenSq)) : 0;
                const closestX = point.x + t * ex;
                const closestY = point.y + t * ey;
                const distSq = (group.cx - closestX) ** 2 + (group.cy - closestY) ** 2;
                const r = group.r + cullRadius;
                if (distSq > r * r) return;
                for (const edge of group.edges) {
                    if (edge.type !== 'left' && edge.type !== 'right') continue;
                    if (this.findEarliestEdgeCollision(point, movement, { edges: [edge] })) {
                        blocked = true;
                        return;
                    }
                }
            });
            return blocked;
        }

        const groups = this.getCollisionEdgeGroups();
        if (groups) {
            for (const group of groups) {
                const dx = group.cx - point.x;
                const dy = group.cy - point.y;
                const t = lenSq > 0 ? Math.max(0, Math.min(1, (dx * ex + dy * ey) / lenSq)) : 0;
                const closestX = point.x + t * ex;
                const closestY = point.y + t * ey;
                const distSq = (group.cx - closestX) ** 2 + (group.cy - closestY) ** 2;
                const r = group.r + cullRadius;
                if (distSq > r * r) continue;
                for (const edge of group.edges) {
                    if (edge.type !== 'left' && edge.type !== 'right') continue;
                    if (this.findEarliestEdgeCollision(point, movement, { edges: [edge] })) return true;
                }
            }
            return false;
        }
        return this.getCollisionEdges()
            .filter((edge) => edge.type === 'left' || edge.type === 'right')
            .some((edge) => Boolean(this.findEarliestEdgeCollision(point, movement, { edges: [edge] })));
    }

    updateGroundContact(groundInfo) {
        if (this.isInWater) {
            this.groundContact = null;
            return;
        }
        if (!groundInfo?.edge) {
            this.groundContact = null;
            return;
        }

        this.groundContact = {
            edge: groundInfo.edge,
            normal: this.getEdgeNormal(groundInfo.edge),
            takeoffAllowed: groundInfo.takeoffAllowed !== false
        };
    }

    clearGroundContact() {
        this.groundContact = null;
    }

    getGroundFollowDropMax() {
        // Allow following slopes that drop up to one full tile height per step so the
        // dyno sticks to steep terrain instead of launching into the air.
        return (this.ground?.tileHeight ?? 2) + LOCAL_GROUND_EPSILON;
    }

    getGroundInfoForSlope(x, positionY) {
        return this.getNearestGroundInfoAt(x, positionY, {
            maxStepUp: this.getCollisionStepSize() + LOCAL_GROUND_EPSILON,
            maxDropDown: this.getGroundFollowDropMax()
        });
    }

    moveGroundedHorizontally(deltaX) {
        if (Math.abs(deltaX) <= 0.0001) {
            return;
        }

        const steps = this.getMovementStepCount(deltaX);
        const stepX = deltaX / steps;
        let currentGroundInfo = this.getGroundInfoForSlope(this.position.x, this.position.y);

        for (let step = 0; step < steps; step += 1) {
            const candidateX = this.position.x + stepX;
            const groundInfo = this.getGroundInfoForSlope(candidateX, this.position.y);

            if (!groundInfo) {
                if (!this.isPositionBlockedAt(candidateX, this.position.y)) {
                    this.position.x = candidateX;
                    this.onGround = false;
                    this.clearGroundContact();
                } else {
                    this.velocity.x = 0;
                }
                return;
            }

            const candidateY = groundInfo.surfaceHeight + PLAYER_RADIUS;
            if (this.isGroundedPositionBlockedAt(candidateX, candidateY)) {
                this.velocity.x = 0;
                return;
            }

            this.position.x = candidateX;
            this.position.y = candidateY;
            currentGroundInfo = groundInfo;
            this.updateGroundContact(groundInfo);
        }
    }

    moveAirborneWithCollisions(deltaX, deltaY, options = {}) {
        let remainingMovement = new THREE.Vector2(deltaX, deltaY);
        let iterations = 0;
        let landed = false;
        this.lastAirborneHorizontalBlocked = false;
        this.clearGroundContact();
        this.clearCollisionDebugMarkers();

        const airborneSampleOffsets = this.useDebugFixedFlightCollisionPolygon()
            ? this.getFixedFlightCollisionSampleOffsets()
            : this.getCarriedFlightCollisionSampleOffsets();
        // Build the per-call collision query options once — neither the supplied options
        // nor the airborne sample offsets change across the resolution iterations.
        const airborneCollisionOptions = this._scratchAirborneCollisionOptions ||
            (this._scratchAirborneCollisionOptions = {});
        for (const key in airborneCollisionOptions) delete airborneCollisionOptions[key];
        Object.assign(airborneCollisionOptions, options);
        airborneCollisionOptions.sampleOffsets = airborneSampleOffsets.length > 0 ? airborneSampleOffsets : undefined;

        const startPosition = this._scratchAirborneStart || (this._scratchAirborneStart = new THREE.Vector2());
        const debugContours = CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours;

        while (iterations < 5 && remainingMovement.lengthSq() > 0.000001) {
            iterations += 1;
            startPosition.set(this.position.x, this.position.y);
            const collision = this.findEarliestEdgeCollision(startPosition, remainingMovement, airborneCollisionOptions);
            if (!collision) {
                this.position.x += remainingMovement.x;
                this.position.y += remainingMovement.y;
                break;
            }

            const nx = collision.normal.x, ny = collision.normal.y;
            const epsilon = 0.02;
            this.position.x = collision.centerPoint.x + nx * epsilon;
            this.position.y = collision.centerPoint.y + ny * epsilon;
            if (debugContours) {
                this.addCollisionDebugMarker(new THREE.Vector3(collision.point.x, collision.point.y, 49.5), new THREE.Vector3(nx, ny, 0));
            }

            const isHorizontalBlock = Math.abs(nx) > 0.5 &&
                remainingMovement.x * nx < -0.0001;
            if (isHorizontalBlock) {
                this.lastAirborneHorizontalBlocked = true;
            }

            const velocityInwardDot = this.velocity.x * nx + this.velocity.y * ny;
            if (velocityInwardDot < 0) {
                this.velocity.x -= nx * velocityInwardDot;
                this.velocity.y -= ny * velocityInwardDot;
            }

            const remainingFactor = Math.max(0, 1 - collision.t);
            let rax = remainingMovement.x * remainingFactor;
            let ray = remainingMovement.y * remainingFactor;
            const inwardDot = rax * nx + ray * ny;
            if (inwardDot < 0) {
                rax -= nx * inwardDot;
                ray -= ny * inwardDot;
            }

            if (collision.edge.type === 'top' && options.ignoreGroundTiles !== true && ny > 0.2) {
                const groundInfo = this.getGroundInfoFromEdge(collision.edge, this.position.x);
                if (groundInfo) {
                    this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
                    this.velocity.y = 0;
                    this.updateGroundContact(groundInfo);
                    landed = true;
                    break;
                }
            }

            remainingMovement.set(rax, ray);
        }

        this.rebuildCollisionDebugMarkers();
        return landed;
    }

    resolveBreakableTilesFromFire() {
    }

    getCeilingFaintConfig() {
        return CONFIG.DYNO_CEILING_FAINT || {};
    }

    getCeilingFaintYThreshold() {
        const configuredThreshold = this.getCeilingFaintConfig().ceilingFaintYThreshold;
        return Number.isFinite(configuredThreshold)
            ? configuredThreshold
            : this.getFlightCeilingHeight();
    }

    getFaintWakeDiveSpeed() {
        const configuredWakeSpeed = this.getCeilingFaintConfig().faintWakeDiveSpeed;
        return Number.isFinite(configuredWakeSpeed)
            ? Math.max(configuredWakeSpeed, 0)
            : Math.max(CONFIG.flightDiveSpeedThreshold, 0);
    }

    tryStartCeilingFaint(input, previousY = this.position.y) {
        if (
            this.isFaintSequenceActive ||
            this.isFaintConditionActive ||
            this.onGround ||
            this.airMode !== 'fly'
        ) {
            return false;
        }

        const ceilingThreshold = this.getCeilingFaintYThreshold();
        const wasMovingUp = this.velocity.y > 0.05 || input.y > 0.05;
        const reachedCeiling = this.position.y >= ceilingThreshold && previousY <= ceilingThreshold + 0.001;
        if (!wasMovingUp || !reachedCeiling) {
            return false;
        }

        this.startCeilingFaintSequence();
        this.position.y = Math.min(this.position.y, ceilingThreshold);
        return true;
    }

    startCeilingFaintSequence() {
        this.isFainting = true;
        this.isFaintSequenceActive = true;
        this.isFaintConditionActive = false;
        this.hasWokenFromFaint = false;
        this.faintSequenceElapsed = 0;
        this.faintCrashExplosionTriggered = false;
        this.faintVisualStartAngle = this.currentGroundTilt;
        this.faintVisualAngle = this.currentGroundTilt;
        this.airMode = 'fly';
        this.onGround = false;
        this.cancelTurn();
        this.cancelFlightTurn();
        // Faint sequence is the forced phase: controls are suppressed, flying_up_sleep plays,
        // and movement is owned by updateFaintSequence() until finishFaintSequence() wakes up.
        this.playFaintAnimation();
        this.logDebugChange(
            'ceilingFaint',
            'start',
            `[Player] Ceiling faint started at y=${this.position.y.toFixed(2)} threshold=${this.getCeilingFaintYThreshold().toFixed(2)}`,
            true
        );
    }

    playFaintAnimation() {
        const resolvedState = this.resolveStateWithFallback('faint');
        if (!resolvedState) {
            return;
        }

        const duration = Math.max(this.getCeilingFaintConfig().faintAnimationDuration ?? 3, 0.05);
        this.playAnimation(resolvedState, DYNO_MODEL_SETTINGS.fadeDuration, true);
        const action = this.animationActions[resolvedState];
        const clipDuration = Math.max(action?.getClip?.()?.duration ?? duration, 0.0001);
        action?.setEffectiveTimeScale(clipDuration / duration);
        this.faintAnimationAction = action || null;
        this.airborneAnimationState = 'faint';
    }

    updateFaintSequence(input, dt) {
        const faintConfig = this.getCeilingFaintConfig();
        const animationDuration = Math.max(faintConfig.faintAnimationDuration ?? 3, 0.05);
        const rotateStartTime = Math.max(faintConfig.faintRotateStartTime ?? 0.3, 0);
        const rotateDuration = Math.max(faintConfig.faintRotateDuration ?? 0.8, 0.001);
        const rotateElapsed = Math.max(this.faintSequenceElapsed - rotateStartTime, 0);
        const rotateProgress = THREE.MathUtils.smoothstep(
            THREE.MathUtils.clamp(rotateElapsed / rotateDuration, 0, 1),
            0,
            1
        );
        const targetAngle = Number.isFinite(faintConfig.faintTargetAngle)
            ? faintConfig.faintTargetAngle
            : -Math.PI / 2;

        this.faintVisualAngle = THREE.MathUtils.lerp(this.faintVisualStartAngle, targetAngle, rotateProgress);
        this.currentGroundTilt = this.faintVisualAngle;

        const fallAcceleration = Math.max(faintConfig.faintFallAcceleration ?? 20, 0);
        const maxFallSpeed = Math.max(faintConfig.faintMaxFallSpeed ?? 50, this.getFaintWakeDiveSpeed());
        this.velocity.x = this.moveToward(this.velocity.x, 0, fallAcceleration * 0.5 * dt);
        this.velocity.y = Math.max(Math.min(this.velocity.y, 0) - (fallAcceleration * dt), -maxFallSpeed);

        const landed = this.moveAirborneWithCollisions(this.velocity.x * dt, this.velocity.y * dt);
        if (landed) {
            const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
            if (groundInfo) {
                this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
            }
            this.onGround = true;
            this.handleFaintGroundImpactIfNeeded(false);
            return;
        }

        this.onGround = false;
        this.airMode = 'fly';
        this.airborneAnimationState = 'faint';
        this.faintSequenceElapsed += dt;

        if (this.faintSequenceElapsed >= animationDuration) {
            this.finishFaintSequence(input);
        }
    }

    finishFaintSequence(input) {
        // Wake-up is the handoff point: normal controls return immediately. The only thing
        // that can remain is the conditional crash flag, and only while the player maintains
        // a valid downward dive.
        this.isFaintSequenceActive = false;
        this.hasWokenFromFaint = true;
        this.faintAnimationAction = null;
        // flying_up_sleep ends in a dive pose, so hand off at dive speed. That lets the
        // next animation resolve straight to flyDive instead of flashing through flying.
        this.velocity.y = Math.min(this.velocity.y, -this.getFaintWakeDiveSpeed());
        this.isFaintConditionActive = this.isFaintDiveConditionMet(input);
        this.isFainting = this.isFaintConditionActive;
        this.airborneAnimationState = this.selectAirborneAnimationState();
        this.logDebugChange(
            'ceilingFaint',
            `wake|${this.isFaintConditionActive}`,
            `[Player] Ceiling faint wake-up; controls restored, crash condition ${this.isFaintConditionActive ? 'armed' : 'ended'}`,
            true
        );
    }

    isFaintDiveConditionMet(input = this.currentInput) {
        if (this.isFaintSequenceActive || this.onGround || this.airMode !== 'fly') {
            return false;
        }

        const desiredX = (input?.x ?? 0) * this.getHorizontalFlightMaxSpeed();
        const desiredY = (input?.y ?? 0) * this.getVerticalFlightMaxSpeed(input?.y ?? 0);
        if (desiredY >= -0.05) {
            return false;
        }

        const angleFromStraightDown = Math.atan2(Math.abs(desiredX), Math.max(-desiredY, 0.001));
        const tolerance = Math.max(this.getCeilingFaintConfig().faintDownwardAngleTolerance ?? 0.35, 0);
        return angleFromStraightDown <= tolerance;
    }

    updatePostWakeFaintCondition(input = this.currentInput) {
        if (!this.isFaintConditionActive) {
            return;
        }

        if (this.isFaintDiveConditionMet(input)) {
            this.isFainting = true;
            return;
        }

        this.isFaintConditionActive = false;
        this.isFainting = false;
        this.debugState.delete('ceilingFaint');
    }

    handleFaintGroundImpactIfNeeded(wasOnGround) {
        const impactedGround = !wasOnGround && this.onGround;
        if (!impactedGround || this.faintCrashExplosionTriggered) {
            return;
        }

        if (!this.isFaintSequenceActive && !this.isFaintConditionActive && !this.hasWokenFromFaint) {
            return;
        }

        // The special blast is allowed only while faint is still active: either during the
        // forced sleep fall, or after wake-up while the player is still holding a valid dive.
        const impactPoint = new THREE.Vector3(this.position.x, this.getFeetY(this.position.y), this.position.z);
        this.triggerFaintCrashExplosion(impactPoint);
        this.isFaintSequenceActive = false;
        this.isFaintConditionActive = false;
        this.isFainting = false;
        this.hasWokenFromFaint = false;
        this.faintAnimationAction = null;
        this.velocity.set(0, 0, 0);
        this.airMode = 'hover';
        this.airHoverRecoveryLock = false;
        this.airborneAnimationState = 'hover';
        this.setTargetGroundTilt(this.getGroundInfoAt(this.position.x, this.position.y)?.angle ?? 0, { snapVisual: true });
    }

    triggerFaintCrashExplosion(impactPoint) {
        this.faintCrashExplosionTriggered = true;
        this.levelObjectManager?.triggerDynoFaintCrashExplosion?.(impactPoint, this.getCeilingFaintConfig());
        this.logDebugChange(
            'ceilingFaint',
            'crash',
            `[Player] Ceiling faint crash explosion at (${impactPoint.x.toFixed(2)}, ${impactPoint.y.toFixed(2)})`,
            true
        );
    }

    updateGroundedMovement(input, dt, options = {}) {
        if (this.isTurning) {
            // Ground reversals should begin visually right away while preserving braking.
            this.velocity.x = this.moveToward(this.velocity.x, 0, CONFIG.walkSlowdownSpeedDecrease * dt);
            if (Math.abs(this.velocity.x) < DYNO_MODEL_SETTINGS.animationSpeedDeadZone) {
                this.velocity.x = 0;
            }
            this.velocity.y = 0;
            this.onGround = true;
            const previousX = this.position.x;
            this.moveGroundedHorizontally(this.velocity.x * dt);
            this.groundTravelDistance += Math.abs(this.position.x - previousX);
            const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
            if (groundInfo) {
                this.position.y = groundInfo.surfaceHeight + PLAYER_RADIUS;
            }
            return;
        }

        const hasHorizontalInput = Math.abs(input.x) > 0.05;
        const inputSign = this.getSignWithDeadZone(input.x, 0.05);
        const isRequestingReverse = options.allowReverseWithoutTurn !== true &&
            !this.isPullDraggingObject() &&
            inputSign !== 0 &&
            inputSign !== this.lastFacingDirection;
        const targetVelocityX = isRequestingReverse
            ? 0
            : this.getGroundTargetVelocity(input.x);
        const isAcceleratingInSameDirection =
            Math.sign(targetVelocityX) !== 0 &&
            Math.sign(targetVelocityX) === Math.sign(this.velocity.x) &&
            Math.abs(targetVelocityX) > Math.abs(this.velocity.x);
        const isAcceleratingFromStop =
            Math.abs(this.velocity.x) <= 0.0001 &&
            Math.abs(targetVelocityX) > 0;
        const maxSpeedDelta = (isAcceleratingFromStop || isAcceleratingInSameDirection)
            ? CONFIG.walkSpeedIncrease * dt
            : CONFIG.walkSlowdownSpeedDecrease * dt;

        // Ground speed can only move toward the target by the configured per-second cap.
        this.velocity.x = this.moveToward(this.velocity.x, targetVelocityX, maxSpeedDelta);

/*        
        this.logDebugChange(
            'groundSpeedStep',
            `${targetVelocityX.toFixed(2)}|${this.velocity.x.toFixed(2)}|${maxSpeedDelta.toFixed(3)}`,
            `[Player] Ground speed: current=${this.velocity.x.toFixed(2)} target=${targetVelocityX.toFixed(2)} maxStep=${maxSpeedDelta.toFixed(3)} dt=${dt.toFixed(3)}`
        );
*/
        if (!hasHorizontalInput && Math.abs(this.velocity.x) < DYNO_MODEL_SETTINGS.animationSpeedDeadZone) {
            this.velocity.x = 0;
        }
        if (isRequestingReverse && Math.abs(this.velocity.x) < DYNO_MODEL_SETTINGS.animationSpeedDeadZone) {
            this.velocity.x = 0;
        }

        const previousX = this.position.x;
        const deltaX = this.velocity.x * dt;
        this.moveGroundedHorizontally(deltaX);
        this.groundTravelDistance += Math.abs(this.position.x - previousX);

        if (!this.onGround) {
            this.airMode = 'hover';
            this.airHoverRecoveryLock = false;
            this.clearGroundContact();
            return;
        }

        const groundInfo = this.getGroundInfoForSlope(this.position.x, this.position.y);
        if (groundInfo) {
            this.velocity.y = 0;
            this.applyGroundInfo(groundInfo);
            return;
        }

        this.setAirborneState();
        this.airMode = 'hover';
        this.airHoverRecoveryLock = false;
    }

    updateAirborneMovement(input, dt) {
        const inputLength = Math.min(1, Math.hypot(input.x, input.y));
        const inputSign = this.getSignWithDeadZone(input.x, 0.05);
        const isAirReverseRequested = inputSign !== 0 && inputSign !== this.lastFacingDirection;

        this.updateAirMode(input, inputLength, isAirReverseRequested);

        const acceleration = this.airMode === 'hover' ? CONFIG.hoverAcceleration : CONFIG.flightAcceleration;
        const deceleration = this.airMode === 'hover' ? CONFIG.hoverDeceleration : CONFIG.flightDeceleration;
        const shouldUseHoverTurn = this.airMode === 'hover';
        const isRequestingReverse = shouldUseHoverTurn && isAirReverseRequested;
        const targetVelocity = this.resolveAirTargetVelocity(input, isRequestingReverse);
        const fullUpHeight = this.getFlightFullUpHeight();
        const isThinAirHoverClimb = this.airMode === 'hover' &&
            input.y > 0 &&
            this.position.y > fullUpHeight;
        const verticalAcceleration = isThinAirHoverClimb ? CONFIG.flightAcceleration : acceleration;
        const verticalDeceleration = isThinAirHoverClimb ? CONFIG.flightDeceleration : deceleration;

        if (this.doDebug !== false) {
            this.logDebugChange(
                'airInputMagnitude',
                `${inputLength.toFixed(2)}|${this.airMode}`,
                `[Player] Air input: magnitude=${inputLength.toFixed(2)} mode=${this.airMode}`
            );
        }

        if (this.airMode !== 'fly') {
            this.cancelFlightTurn();
        }

        if (this.airMode === 'fly') {
            this.updateFlightTurningState(input, inputLength, dt);
        } else if (this.isTurning && shouldUseHoverTurn) {
            // Hover turns stay upright and feel close to grounded walk turns.
            this.velocity.x = 0;
            this.velocity.y = this.moveToward(this.velocity.y, targetVelocity.y, verticalAcceleration * dt);
        } else if (inputLength <= 0.0001) {
            // No stick input: brake along the current air-velocity vector so diagonal drift
            // keeps direction while slowing down, instead of X/Y damping at different rates.
            const currentSpeed = Math.hypot(this.velocity.x, this.velocity.y);
            if (currentSpeed > 0.000001) {
                const directionalDeceleration = Math.min(deceleration, verticalDeceleration);
                const nextSpeed = this.moveToward(currentSpeed, 0, directionalDeceleration * dt);
                const speedScale = nextSpeed / currentSpeed;
                this.velocity.x *= speedScale;
                this.velocity.y *= speedScale;
            } else {
                this.velocity.x = 0;
                this.velocity.y = 0;
            }
        } else {
            this.velocity.x = this.moveToward(
                this.velocity.x,
                targetVelocity.x,
                (Math.abs(targetVelocity.x) > Math.abs(this.velocity.x) ? acceleration : deceleration) * dt
            );
            this.velocity.y = this.moveToward(
                this.velocity.y,
                targetVelocity.y,
                (Math.abs(targetVelocity.y) > Math.abs(this.velocity.y) ? verticalAcceleration : verticalDeceleration) * dt
            );
        }

        this.isHovering = this.airMode === 'hover';

        // Hard-clamp each velocity axis to its own max.
        // Horizontal and vertical limits are independent — a diagonal can reach
        // sqrt(maxH² + maxV²) total speed and that is intentional and correct.
        const maxVx = this.getHorizontalFlightMaxSpeed();
        this.velocity.x = THREE.MathUtils.clamp(this.velocity.x, -maxVx, maxVx);
        const maxVy = this.getVerticalFlightMaxSpeed(this.velocity.y >= 0 ? 1 : -1);
        this.velocity.y = THREE.MathUtils.clamp(this.velocity.y, -maxVy, maxVy);

        // Additional total-speed cap for dive/glide states where extra deceleration applies.
        const currentTotalSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isHighSpeed = this.airborneAnimationState === 'flyDive' || this.airborneAnimationState === 'flyGlide';
        if (isHighSpeed) {
            const directionalMax = this.getDirectionalFlightMaxSpeed();
            if (currentTotalSpeed > directionalMax && currentTotalSpeed > 0.0001) {
                const speedDecel = CONFIG.flightDiveDeceleration ?? 8;
                if (speedDecel > 0) {
                    const nextSpeed = Math.max(directionalMax, currentTotalSpeed - speedDecel * dt);
                    const scale = nextSpeed / currentTotalSpeed;
                    this.velocity.x *= scale;
                    this.velocity.y *= scale;
                }
            }
        }

        // Vertical hard clamp only (down speed safety cap; horizontal is handled by gradual decel above).
        this.velocity.y = this.clampVerticalFlightSpeed(this.velocity.y);
        const landed = this.moveAirborneWithCollisions(
            this.velocity.x * dt,
            this.velocity.y * dt,
            { ignoreGroundTiles: Boolean(this.carriedObject) && !this.useDebugFixedFlightCollisionPolygon() }
        );
        const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
        const penetratingGroundInfo = this.getPenetratingGroundInfoAt(this.position.x, this.position.y) || groundInfo;

        if (this.carriedObject) {
            if (landed) {
                this.airMode = 'hover';
                this.airHoverRecoveryLock = true;
                this.cancelFlightTurn();
                this.flightFacingRotationY = 0;
                this.flightTurnVisualRotation = 0;
                this.airborneAnimationState = 'hover';
            }
            this.onGround = false;
            this.clearGroundContact();
            return;
        }

        if (penetratingGroundInfo && (landed || (
            this.getFeetY(this.position.y) <= penetratingGroundInfo.surfaceHeight + 0.05 &&
            this.velocity.y <= 0.1
        ))) {
            this.position.y = penetratingGroundInfo.surfaceHeight + PLAYER_RADIUS;
            this.velocity.y = 0;
            this.applyGroundInfo(penetratingGroundInfo);
            this.airMode = 'hover';
            this.airHoverRecoveryLock = false;
            this.cancelFlightTurn();
            this.flightFacingRotationY = 0;
            this.flightTurnVisualRotation = 0;
            this.airborneAnimationState = 'hover';
            return;
        }

        this.setAirborneState();
    }

    updateAirMode(input, inputLength, isAirReverseRequested) {
        if (this.isCarryHoverOnlyActive()) {
            // Carrying keeps the dyno in the responsive hover control family so pickup / carry
            // gameplay stays readable and never transitions into faster flight / dive states.
            this.airMode = 'hover';
            this.cancelFlightTurn();
            this.flightFacingRotationY = 0;
            this.flightTurnVisualRotation = 0;
            this.airHoverRecoveryLock = true;
            if (this.doDebug !== false) {
                this.logDebugChange(
                    'airMode',
                    'carry-hover',
                    '[Player] Carry mode active: locking airborne movement to hover'
                );
            }
            return;
        }

        if (this.shouldLockHoverNearGround()) {
            // Near the surface, keep hover stable so the dyno does not accidentally pop into
            // faster air states before it has clearly climbed away from the ground below.
            this.airMode = 'hover';
            this.flightFacingRotationY = 0;
            this.flightTurnVisualRotation = 0;
            if (this.doDebug !== false) {
                this.logDebugChange(
                    'airMode',
                    `near-ground-hover|${this.getDistanceToGroundBelow().toFixed(2)}`,
                    `[Player] Near-ground hover lock active: distance=${this.getDistanceToGroundBelow().toFixed(2)} threshold=${CONFIG.nearGroundHoverLockDistance.toFixed(2)}`
                );
            }
            return;
        }

        if (this.isFlightTurning) {
            this.airMode = 'fly';
            if (this.doDebug !== false) {
                this.logDebugChange(
                    'airMode',
                    `fly-turn|${Math.round(Math.hypot(this.velocity.x, this.velocity.y))}`,
                    `[Player] Flying mode active: locked during flight turn speed=${Math.hypot(this.velocity.x, this.velocity.y).toFixed(2)}`
                );
            }
            return;
        }

        const airSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const requestedSpeed = this.getRequestedAirSpeed(input);
        const velocityLength = Math.max(airSpeed, 0.0001);
        const alignment = inputLength > 0.001
            ? ((input.x * this.velocity.x) + (input.y * this.velocity.y)) / (inputLength * velocityLength)
            : 0;
        const modeBuffer = Math.max(0.35, CONFIG.hoverSpeedThreshold * 0.08);
        const hoverEnterThreshold = CONFIG.hoverSpeedThreshold - modeBuffer;
        const flyEnterThreshold = CONFIG.hoverSpeedThreshold + modeBuffer;

        let nextAirMode = this.airMode === 'hover'
            ? (Math.max(airSpeed, requestedSpeed) < flyEnterThreshold ? 'hover' : 'fly')
            : ((airSpeed < hoverEnterThreshold && (requestedSpeed < flyEnterThreshold || isAirReverseRequested)) ? 'hover' : 'fly');

        // During an airborne side reversal, force a stable hover phase until the dyno has slowed
        // enough to complete the upright hover turn instead of jittering between fly and hover.
        if (isAirReverseRequested) {
            nextAirMode = airSpeed < flyEnterThreshold ? 'hover' : 'fly';
        }

        if (isAirReverseRequested && this.airMode === 'hover' && !this.isTurning) {
            nextAirMode = 'hover';
        }

        if (this.airHoverRecoveryLock) {
            nextAirMode = airSpeed < flyEnterThreshold ? 'hover' : 'fly';
            if (nextAirMode === 'fly') {
                this.airHoverRecoveryLock = false;
            }
        }

        if (nextAirMode !== this.airMode) {
            //console.info(
            //    `[Player] Air mode transition: ${this.airMode} -> ${nextAirMode} ` +
            //    `speed=${airSpeed.toFixed(2)} requested=${requestedSpeed.toFixed(2)} threshold=${CONFIG.hoverSpeedThreshold.toFixed(2)} band=${hoverEnterThreshold.toFixed(2)}-${flyEnterThreshold.toFixed(2)} input=${inputLength.toFixed(2)} align=${alignment.toFixed(2)} reversing=${isAirReverseRequested} recoveryLock=${this.airHoverRecoveryLock}`
            //);
            if (nextAirMode === 'fly' && !this.isFlightTurning) {
                this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
                this.flightTurnVisualRotation = this.flightFacingRotationY;
            }
            if (nextAirMode === 'hover') {
                this.flightFacingRotationY = 0;
                this.flightTurnVisualRotation = 0;
            }
            this.airMode = nextAirMode;
        }

        if (this.doDebug !== false) {
            this.logDebugChange(
                'airMode',
                `${this.airMode}|${Math.round(airSpeed)}|${Math.round(requestedSpeed)}|${Math.round(alignment * 10)}|${Math.round(modeBuffer * 10)}|${isAirReverseRequested}|${this.airHoverRecoveryLock}`,
                `[Player] ${this.airMode === 'hover' ? 'Hover mode active' : 'Flying mode active'}: speed=${airSpeed.toFixed(2)} requested=${requestedSpeed.toFixed(2)} threshold=${CONFIG.hoverSpeedThreshold.toFixed(2)} band=${hoverEnterThreshold.toFixed(2)}-${flyEnterThreshold.toFixed(2)} input=${inputLength.toFixed(2)} align=${alignment.toFixed(2)} reversing=${isAirReverseRequested} recoveryLock=${this.airHoverRecoveryLock}`
            );
        }
    }

    getVerticalFlightMaxSpeed(inputY) {
        const speedMultiplier = this.getCurrentSpeedMultiplier();
        if (this.isCarryHoverOnlyActive()) {
            const hoverCarryMaxSpeed = this.getCarryWeightedHoverMaxSpeed();
            return hoverCarryMaxSpeed * speedMultiplier;
        }

        if (inputY < 0) {
            return this.getDynamicAirSpeedCap(
                this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeedDown)
            ) * speedMultiplier;
        }

        const carriedFlightSpeed = this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeedUp);
        const fullUpHeight = this.getFlightFullUpHeight();
        const ceilingHeight = this.getFlightCeilingHeight();

        if (this.position.y <= fullUpHeight) {
            return carriedFlightSpeed * speedMultiplier;
        }

        if (this.position.y >= ceilingHeight) {
            return CONFIG.hoverSpeedThreshold * speedMultiplier;
        }

        const taperRange = Math.max(ceilingHeight - fullUpHeight, 0.001);
        const remainingRatio = 1 - ((this.position.y - fullUpHeight) / taperRange);

        return THREE.MathUtils.lerp(
            CONFIG.hoverSpeedThreshold,
            carriedFlightSpeed,
            THREE.MathUtils.clamp(remainingRatio, 0, 1)
        ) * speedMultiplier;
    }

    getCurrentAirSpeedMagnitude() {
        return Math.hypot(this.velocity.x, this.velocity.y);
    }

    getDynamicAirSpeedCap(baseSpeed) {
        const currentAirSpeed = this.getCurrentAirSpeedMagnitude();
        if (currentAirSpeed <= CONFIG.flightDiveSpeedThreshold) {
            return baseSpeed;
        }

        return Math.max(baseSpeed, currentAirSpeed);
    }

    // Returns the maximum total air speed based on the current velocity direction.
    // Horizontal → flightMaxSpeed, straight up → flightMaxSpeedUp, straight down → flightMaxSpeedDown.
    // Angles between horizontal and straight up/down interpolate linearly.
    getDirectionalFlightMaxSpeed() {
        const speedMultiplier = this.getCurrentSpeedMultiplier();
        const vx = this.velocity.x;
        const vy = this.velocity.y;
        const speed = Math.hypot(vx, vy);
        const horizontal = this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeed);
        if (speed < 0.0001) {
            return horizontal * speedMultiplier;
        }
        if (vy > 0) {
            // upT = 0 when horizontal, 1 when straight up
            const upT = THREE.MathUtils.clamp(vy / speed, 0, 1);
            const upward = this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeedUp);
            return THREE.MathUtils.lerp(horizontal, upward, upT) * speedMultiplier;
        } else {
            // downT = 0 when horizontal, 1 when straight down
            const downT = THREE.MathUtils.clamp(-vy / speed, 0, 1);
            const downward = this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeedDown);
            return THREE.MathUtils.lerp(horizontal, downward, downT) * speedMultiplier;
        }
    }

    getCarryWeightedFlightMaxSpeed(baseSpeed) {
        if (!this.carriedObject) {
            return baseSpeed;
        }

        const maxSpeedAtMaxLiftWeight = Number.isFinite(CONFIG.DYNO_CARRY?.flightMaxSpeedAtMaxLiftWeight)
            ? CONFIG.DYNO_CARRY.flightMaxSpeedAtMaxLiftWeight
            : baseSpeed;
        return THREE.MathUtils.lerp(baseSpeed, maxSpeedAtMaxLiftWeight, this.getCarryWeightRatio());
    }

    getCarryWeightedHoverMaxSpeed() {
        const baseHoverSpeed = CONFIG.hoverSpeedThreshold * this.getCarryHoverSpeedMultiplier();
        if (!this.carriedObject) {
            return baseHoverSpeed;
        }

        const weightedFlightMaxSpeed = this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeed);
        const normalizedRatio = CONFIG.flightMaxSpeed > 0
            ? THREE.MathUtils.clamp(weightedFlightMaxSpeed / CONFIG.flightMaxSpeed, 0, 1)
            : 1;
        return baseHoverSpeed * normalizedRatio;
    }

    getHorizontalFlightMaxSpeed() {
        const speedMultiplier = this.getCurrentSpeedMultiplier();
        if (this.isCarryHoverOnlyActive()) {
            return this.getCarryWeightedHoverMaxSpeed() * speedMultiplier;
        }

        return this.getDynamicAirSpeedCap(
            this.getCarryWeightedFlightMaxSpeed(CONFIG.flightMaxSpeed) * speedMultiplier
        );
    }

    clampVerticalFlightSpeed(speedY) {
        const boostedDownMax = CONFIG.flightMaxSpeedDown * this.getCurrentSpeedMultiplier();
        return THREE.MathUtils.clamp(speedY, -boostedDownMax, this.getVerticalFlightMaxSpeed(1));
    }

    getRequestedAirSpeed(input) {
        return Math.hypot(
            input.x * this.getHorizontalFlightMaxSpeed(),
            input.y * this.getVerticalFlightMaxSpeed(input.y)
        );
    }

    resolveAirTargetVelocity(input, isRequestingReverse) {
        const targetVelocityY = input.y * this.getVerticalFlightMaxSpeed(input.y);
        const out = this._scratchAirTargetVelocity || (this._scratchAirTargetVelocity = new THREE.Vector2());
        out.set(
            isRequestingReverse ? 0 : input.x * this.getHorizontalFlightMaxSpeed(),
            targetVelocityY
        );
        return out;
    }

    updateFlightTurningState(input, inputLength, dt) {
        const inputSign = this.getSignWithDeadZone(input.x, 0.05);
        const shouldStartFlightTurn = !this.isFlightTurning && inputSign !== 0 && inputSign !== this.lastFacingDirection;
        const shouldRetargetFlightTurn = this.isFlightTurning && inputSign !== 0 && inputSign !== this.flightTurnTargetFacing;

        if (this.doDebug !== false) {
            this.logDebugChange(
                'flightDirection',
                `${input.x.toFixed(2)}|${input.y.toFixed(2)}|${this.velocity.x.toFixed(2)}|${this.velocity.y.toFixed(2)}|${inputSign}|${this.lastFacingDirection}|${this.flightTurnTargetFacing}`,
                `[Player] Flight X turn check: input=(${input.x.toFixed(2)}, ${input.y.toFixed(2)}) velocity=(${this.velocity.x.toFixed(2)}, ${this.velocity.y.toFixed(2)}) inputSign=${inputSign} facing=${this.lastFacingDirection} targetFacing=${this.flightTurnTargetFacing}`
            );
        }

        if (shouldStartFlightTurn || shouldRetargetFlightTurn) {
            this.startOrUpdateFlightTurn(inputSign);
        }

        if (this.isFlightTurning) {
            this.applyFlightTurn(dt, input);
            return;
        }

        const targetVelocityX = input.x * this.getHorizontalFlightMaxSpeed();
        const targetVelocityY = input.y * this.getVerticalFlightMaxSpeed(input.y);

        this.velocity.x = this.moveToward(
            this.velocity.x,
            targetVelocityX,
            (Math.abs(targetVelocityX) > Math.abs(this.velocity.x) ? CONFIG.flightTurnSpeedIncrease : CONFIG.flightTurnSpeedDecrease) * dt
        );
        this.velocity.y = this.moveToward(
            this.velocity.y,
            targetVelocityY,
            (Math.abs(targetVelocityY) > Math.abs(this.velocity.y) ? CONFIG.flightAcceleration : CONFIG.flightDeceleration) * dt
        );
    }

    startOrUpdateFlightTurn(targetFacing) {
        const retargeting = this.isFlightTurning;
        const currentVisualRotation = this.isFlightTurning
            ? this.flightTurnVisualRotation
            : this.flightFacingRotationY;

        this.isFlightTurning = true;
        this.flightTurnElapsed = 0;
        this.flightTurnDuration = CONFIG.flightTurnDuration;
        this.flightTurnStartFacing = this.lastFacingDirection;
        this.flightTurnTargetFacing = targetFacing;
        this.flightTurnVisualStartRotation = currentVisualRotation;
        this.flightTurnVisualRotation = currentVisualRotation;
        this.flightTurnVisualTargetRotation = this.getFlightBaseRotationY(targetFacing);
        this.flightTurnPitchReferenceX = Math.max(Math.abs(this.velocity.x), CONFIG.hoverSpeedThreshold, 0.001);
        this.holdFlightTurnFlyUp = true;

        //console.info(
        //    `[Player] ${retargeting ? 'Flight turn target updated' : 'Flight turning triggered'}: ` +
        //    `duration=${this.flightTurnDuration.toFixed(2)} pitchRefX=${this.flightTurnPitchReferenceX.toFixed(2)} ` +
        //    `facing=${this.flightTurnStartFacing > 0 ? 'right' : 'left'}->${targetFacing > 0 ? 'right' : 'left'}`
        //);
    }

    getFlightBaseRotationY(facing) {
        // Flight mode owns the side-switch on a dedicated pivot. Keep right-facing as the base
        // orientation and rotate 180deg on Y when the dyno should be viewed from the other side.
        return facing > 0 ? 0 : -Math.PI;
    }

    applyFlightTurn(dt, input) {
        this.flightTurnElapsed = Math.min(this.flightTurnElapsed + dt, this.flightTurnDuration);
        const progress = this.flightTurnDuration > 0 ? this.flightTurnElapsed / this.flightTurnDuration : 1;
        this.flightTurnVisualRotation = THREE.MathUtils.lerp(
            this.flightTurnVisualStartRotation,
            this.flightTurnVisualTargetRotation,
            progress
        );

        this.velocity.x = this.moveToward(this.velocity.x, 0, CONFIG.flightTurnSpeedDecrease * dt);
        this.velocity.y = this.moveToward(
            this.velocity.y,
            input.y * this.getVerticalFlightMaxSpeed(input.y),
            (Math.abs(input.y * this.getVerticalFlightMaxSpeed(input.y)) > Math.abs(this.velocity.y) ? CONFIG.flightAcceleration : CONFIG.flightDeceleration) * dt
        );

        if (this.doDebug !== false) {
            this.logDebugChange(
                'flightTurnProgress',
                `${Math.round(progress * 100)}|${Math.round(this.velocity.x * 10)}|${this.flightTurnTargetFacing}`,
                `[Player] Flight turn progress: ${(progress * 100).toFixed(0)}% vx=${this.velocity.x.toFixed(2)} vy=${this.velocity.y.toFixed(2)} targetFacing=${this.flightTurnTargetFacing > 0 ? 'right' : 'left'}`
            );
        }

        const hasStoppedHorizontally = Math.abs(this.velocity.x) <= DYNO_MODEL_SETTINGS.animationSpeedDeadZone;
        const canCompleteImmediately = hasStoppedHorizontally && this.lastAirborneHorizontalBlocked === true;
        if ((progress >= 1 && hasStoppedHorizontally) || canCompleteImmediately) {
            this.isFlightTurning = false;
            this.velocity.x = 0;
            this.lastFacingDirection = this.flightTurnTargetFacing;
            this.flightFacingRotationY = this.flightTurnVisualTargetRotation;
            this.flightTurnVisualRotation = this.flightFacingRotationY;
            this.flightTurnPitchReferenceX = 0;
            this.lastAirborneHorizontalBlocked = false;
            this.debugState.delete('flightTurnProgress');
            //console.info('[Player] Flight turn complete');
        }
    }

    cancelFlightTurn() {
        if (!this.isFlightTurning) {
            return;
        }

        this.isFlightTurning = false;
        this.flightTurnElapsed = 0;
        this.flightTurnDuration = 0;
        this.flightTurnPitchReferenceX = 0;
        this.flightTurnVisualRotation = this.flightFacingRotationY;
        this.holdFlightTurnFlyUp = false;
        this.lastAirborneHorizontalBlocked = false;
        this.debugState.delete('flightTurnProgress');
    }

    applyFlightHeightLimit() {
        const bounds = this.getFlightBounds();

        if (this.position.x < bounds.left) {
            this.position.x = bounds.left;
            this.velocity.x = Math.max(0, this.velocity.x);
        }

        if (this.position.x > bounds.right) {
            this.position.x = bounds.right;
            this.velocity.x = Math.min(0, this.velocity.x);
        }

        if (this.position.y < bounds.bottom && !this.isFainting) {
            this.position.y = bounds.bottom;
            this.velocity.y = Math.max(0, this.velocity.y);
        }

        if (this.position.y > bounds.top) {
            this.position.y = bounds.top;
            this.velocity.y = Math.min(0, this.velocity.y);
        }
    }

    getFlightBounds() {
        const left = (this.ground?.worldOriginX ?? 0) + PLAYER_RADIUS;
        const right = (this.ground?.worldOriginX ?? 0) +
            (this.ground?.width ?? 0) * (this.ground?.tileWidth ?? 1) -
            PLAYER_RADIUS;
        const bottom = (this.ground?.worldOriginY ?? 0) + PLAYER_RADIUS;
        const top = this.getFlightCeilingHeight();

        return { left, right, bottom, top };
    }

    getFlightCeilingHeight() {
        return this.ground?.flightCeilingY ?? CONFIG.LEVEL_FLIGHT_HEIGHT;
    }

    getFlightFullUpHeight() {
        if (!this.ground?.getFlightMaxSpeedUpFullHeightY) {
            return this.getFlightCeilingHeight() * CONFIG.flightMaxSpeedUpFullHeight;
        }

        return this.ground.getFlightMaxSpeedUpFullHeightY(CONFIG.flightMaxSpeedUpFullHeight);
    }

    getTakeoffDecision(inputX, inputY) {
        const groundInfo = this.groundContact?.edge
            ? {
                edge: this.groundContact.edge,
                angle: this.getEdgeAngle(this.groundContact.edge)
            }
            : this.getGroundInfoAt(this.position.x, this.position.y);
        const angleDeg = this.calculateTakeoffAngleRelativeToGroundDeg(inputX, inputY, groundInfo);
        const surfaceNormal = groundInfo?.edge
            ? this.getEdgeNormal(groundInfo.edge)
            : new THREE.Vector2(0, 1);
        const inputLength = Math.hypot(inputX, inputY);
        const normalComponent = inputLength > 0.0001
            ? ((inputX * surfaceNormal.x) + (inputY * surfaceNormal.y)) / inputLength
            : 0;
        const allowed = angleDeg > CONFIG.takeoffAngleDeg &&
            inputY > CONFIG.takeoffMinUpInput &&
            normalComponent > 0.001;
        return {
            allowed,
            angleDeg,
            surfaceAngleDeg: THREE.MathUtils.radToDeg(groundInfo?.angle ?? 0),
            normalComponent
        };
    }

    calculateJoystickAngleDeg(inputX, inputY) {
        if (inputY <= 0) {
            return 0;
        }

        return THREE.MathUtils.radToDeg(Math.atan2(inputY, Math.abs(inputX)));
    }

    calculateTakeoffAngleRelativeToGroundDeg(inputX, inputY, groundInfo = null) {
        const inputLength = Math.hypot(inputX, inputY);
        if (inputLength <= 0.0001) {
            return 0;
        }

        if (!groundInfo?.edge) {
            return this.calculateJoystickAngleDeg(inputX, inputY);
        }

        const tangent = new THREE.Vector2(
            Math.cos(groundInfo.angle ?? 0),
            Math.sin(groundInfo.angle ?? 0)
        );
        const normal = this.getEdgeNormal(groundInfo.edge);
        const tangentComponent = ((inputX * tangent.x) + (inputY * tangent.y)) / inputLength;
        const normalComponent = ((inputX * normal.x) + (inputY * normal.y)) / inputLength;
        if (normalComponent <= 0) {
            return 0;
        }

        return THREE.MathUtils.radToDeg(Math.atan2(normalComponent, Math.abs(tangentComponent)));
    }

    getGroundTargetVelocity(inputX) {
        if (Math.abs(inputX) <= 0.05) {
            return 0;
        }

        const speedMultiplier = this.getCurrentSpeedMultiplier();
        const targetVelocityX = inputX * CONFIG.maxWalkSpeed * this.getDragMovementMultiplier() * speedMultiplier;
        if (!this.isPullDraggingObject()) {
            return targetVelocityX;
        }

        // Pull and push share the same base cap; push is additionally divided down.
        const maxDragSpeed = this.getDragBackwardMaxWalkSpeed();
        const forwardInput = inputX * this.getDragFacingDirection();
        if (!this.isMouthDraggingObject() && forwardInput > 0) {
            const divisor = Number.isFinite(CONFIG.DYNO_DRAG?.pushSpeedDivisor) ? CONFIG.DYNO_DRAG.pushSpeedDivisor : 1.8;
            const maxPushSpeed = maxDragSpeed / divisor;
            return THREE.MathUtils.clamp(targetVelocityX, -maxPushSpeed, maxPushSpeed);
        }
        return THREE.MathUtils.clamp(targetVelocityX, -maxDragSpeed, maxDragSpeed);
    }

    moveToward(current, target, maxDelta) {
        if (current < target) {
            return Math.min(current + maxDelta, target);
        }

        return Math.max(current - maxDelta, target);
    }

    updateTurnState(dt, inputX) {
        const isSurfaceWater = this.isInWater && !this.isDeepWaterSwim() &&
            (this.waterState === 'swimSurfaceIdle' || this.waterState === 'swimSurfaceIdleUp');

        if (this.isInWater && !isSurfaceWater) {
            this.cancelTurn();
            return;
        }

        if (!this.onGround && this.airMode !== 'hover' && !isSurfaceWater) {
            this.cancelTurn();
            return;
        }

        if (this.isAutoDragActive()) {
            // Auto-drag alignment can intentionally walk backward to a recently passed grab
            // point. Keep the current facing and suppress all turn logic until the drag starts.
            this.cancelTurn();
            this.debugState.delete('turnWaitForStop');
            return;
        }

        if (this.isGrabStruggleActive()) {
            // Too-heavy grab keeps the dyno anchored to the object; keep facing stable so
            // stick input does not trigger side-switch turns during the struggle.
            this.cancelTurn();
            this.debugState.delete('turnWaitForStop');
            return;
        }

        if (this.isPullDraggingObject()) {
            // Dragging locks rotation: backward velocity must not trigger a side-switch, because
            // the dyno should keep facing the object while pulling it with the mouth.
            this.cancelTurn();
            this.debugState.delete('turnWaitForStop');
            return;
        }

        const inputSign = this.getSignWithDeadZone(inputX, 0.05);
        const movementSign = this.getSignWithDeadZone(this.velocity.x, DYNO_MODEL_SETTINGS.animationSpeedDeadZone);

        if (!this.isTurning) {
            if (inputSign !== 0 && inputSign !== this.lastFacingDirection) {
                if (this.onGround || movementSign === 0 || isSurfaceWater) {
                    this.startTurn(inputSign, inputX);
                } else {
                    this.logDebugChange(
                        'turnWaitForStop',
                        `${this.onGround ? 'ground' : 'air'}|${this.lastFacingDirection}|${inputSign}`,
                        `[Player] Reverse requested: braking to zero before ${this.onGround ? 'ground' : 'air'} turn (${this.lastFacingDirection > 0 ? 'right' : 'left'} -> ${inputSign > 0 ? 'right' : 'left'})`
                    );
                }
                return;
            }

            this.debugState.delete('turnWaitForStop');

            if (!this.onGround) {
                return;
            }

            if (
                inputSign === 0 &&
                movementSign !== 0 &&
                this.lastGroundMoveSign !== 0 &&
                movementSign !== this.lastGroundMoveSign
            ) {
                this.startTurn(movementSign, inputX);
            }

            if (movementSign !== 0) {
                this.lastGroundMoveSign = movementSign;
            }
            return;
        }

        if (!isSurfaceWater) {
            this.handleTurnRetarget(inputX);
        }
        this.currentTurnSpeed = this.getTurnSpeed(inputX);

        const maxStep = this.currentTurnSpeed * dt;
        this.currentTurnRotation = this.moveToward(this.currentTurnRotation, this.turnRotationTarget, maxStep);
        const progress = this.getTurnCompletionRatio();

        // Surface water: drive flightFacingRotationY through the turn so the flight pivot
        // smoothly rotates from start facing to target facing (dynoTurnPivot is suppressed).
        if (isSurfaceWater) {
            const startPivot = this.getFlightBaseRotationY(this.turnStartFacing);
            const targetPivot = this.getFlightBaseRotationY(-this.turnStartFacing);
            const newPivot = THREE.MathUtils.lerp(startPivot, targetPivot, progress);
            this.flightFacingRotationY = newPivot;
            this.flightTurnVisualRotation = this.flightFacingRotationY;
        }

        // Always rotate the dyno forward toward the camera during side switching.

        if (this.doDebug !== false) {
            const progressBucket = Math.min(4, Math.floor(progress * 4));
            this.logDebugChange(
                'turnProgress',
                `${this.turnDirection}|${progressBucket}`,
                `[Player] Turn progress: ${this.turnDirection} ${(progress * 100).toFixed(0)}% speed=${this.currentTurnSpeed.toFixed(2)}`
            );
        }

        if (Math.abs(this.currentTurnRotation - this.turnRotationTarget) <= 0.0001) {
            this.completeTurn();
        }
    }

    getSignWithDeadZone(value, deadZone) {
        if (Math.abs(value) <= deadZone) {
            return 0;
        }

        return value > 0 ? 1 : -1;
    }

    updateFacingDirection(inputX) {
        if (this.isAutoDragActive() || this.isAutoPickupActive()) {
            this.dynoFacingPivot.rotation.y = this.lastFacingDirection > 0
                ? DYNO_MODEL_SETTINGS.facingYaw.right
                : DYNO_MODEL_SETTINGS.facingYaw.left;
            return;
        }

        if (this.isPullDraggingObject()) {
            const dragFacing = this.getDragFacingDirection();
            this.lastFacingDirection = dragFacing;
            this.dynoFacingPivot.rotation.y = dragFacing > 0
                ? DYNO_MODEL_SETTINGS.facingYaw.right
                : DYNO_MODEL_SETTINGS.facingYaw.left;
            return;
        }

        if (this.isTurning) {
            if (this.isInWater) {
                // In water the flight pivot owns facing — facingPivot stays locked to right.
                this.dynoFacingPivot.rotation.y = DYNO_MODEL_SETTINGS.facingYaw.right;
            } else {
                this.dynoFacingPivot.rotation.y = this.turnStartFacing > 0
                    ? DYNO_MODEL_SETTINGS.facingYaw.right
                    : DYNO_MODEL_SETTINGS.facingYaw.left;
            }
            return;
        }

        if (!this.onGround && (this.airMode === 'fly' || this.isFlightTurning)) {
            // Flight side-switching is handled by the dedicated flight-turn pivot, so do not add a second flip here.
            this.dynoFacingPivot.rotation.y = DYNO_MODEL_SETTINGS.facingYaw.right;
            return;
        }

        if (this.isInWater) {
            // All water states use the flight-turn pivot for Y-axis facing — facingPivot locked to right.
            this.dynoFacingPivot.rotation.y = DYNO_MODEL_SETTINGS.facingYaw.right;
            return;
        }

        const velocitySign = this.getSignWithDeadZone(this.velocity.x, DYNO_MODEL_SETTINGS.animationSpeedDeadZone);
        const inputSign = this.getSignWithDeadZone(inputX, 0.05);
        const shouldFollowVelocityFacing = velocitySign !== 0 &&
            (inputSign === 0 || inputSign === velocitySign);
        if (shouldFollowVelocityFacing) {
            this.lastFacingDirection = velocitySign;
        }

        this.dynoFacingPivot.rotation.y = this.lastFacingDirection > 0
            ? DYNO_MODEL_SETTINGS.facingYaw.right
            : DYNO_MODEL_SETTINGS.facingYaw.left;
    }

    getImmediateFireFacingDirection() {
        if (this.isPullDraggingObject()) {
            return this.getDragFacingDirection();
        }

        if (!this.onGround && (this.airMode === 'fly' || this.isFlightTurning)) {
            if (this.isFlightTurning) {
                return this.flightTurnTargetFacing || this.lastFacingDirection || 1;
            }

            const inputSign = this.getSignWithDeadZone(this.currentInput?.x ?? 0, 0.05);
            if (inputSign !== 0) {
                return inputSign;
            }
        }

        return this.lastFacingDirection || 1;
    }

    getImmediateFireAimDirection() {
        if (this.isInWater) {
            return null;
        }

        // Hover uses its own authored up/down blend state instead of the raw mouth quaternion.
        // That keeps the aim aligned with hoverUp/hoverDown intent without depending on the
        // rig's local mouth-forward axis, which can point the wrong way in hover poses.
        if (!this.onGround && this.airMode === 'hover' && !this.isFlightTurning) {
            const facing = this.getImmediateFireFacingDirection();
            const hoverUpAngle = THREE.MathUtils.degToRad(CONFIG.hoverUpAngleMin ?? 45);
            const hoverDownAngle = THREE.MathUtils.degToRad(CONFIG.hoverDownAngleMin ?? 45);
            const hoverPitch =
                (this.hoverBlendWeights?.hoverUp ?? 0) * hoverUpAngle -
                (this.hoverBlendWeights?.hoverDown ?? 0) * hoverDownAngle;
            const aimAngle = hoverPitch;
            const horizontal = Math.cos(aimAngle);
            const vertical = Math.sin(aimAngle);

            return new THREE.Vector3(
                (facing >= 0 ? 1 : -1) * horizontal,
                vertical,
                0
            ).normalize();
        }

        const facing = this.getImmediateFireFacingDirection();
        const pitch = this.onGround
            ? ((this.currentGroundTilt || 0) * (facing >= 0 ? 1 : -1))
            : (this.currentGroundTilt || 0);
        const aimAngle = pitch;
        const horizontal = Math.cos(aimAngle);
        const vertical = Math.sin(aimAngle);

        return new THREE.Vector3(
            (facing >= 0 ? 1 : -1) * horizontal,
            vertical,
            0
        ).normalize();
    }

    updateGroundAlignment(dt) {
        const targetTilt = this.getVisualTiltTarget();
        const alignmentSpeed = this.onGround
            ? (Number.isFinite(CONFIG.groundRotationSpeed)
                ? CONFIG.groundRotationSpeed
                : DYNO_MODEL_SETTINGS.tiltLerpSpeed)
            : (this.isDeepWaterSwim() || this.waterState === 'swimDive')
                ? (CONFIG.DYNO_WATER.swimTiltRotationSpeed ?? 3)
                : CONFIG.flightRotationSpeed;
        const lerpAlpha = Math.min(1, alignmentSpeed * dt);
        const useFlightPivot = (!this.onGround && (this.airMode === 'fly' || this.isFlightTurning)) ||
            this.isInWater;
        const flightTurnRotationY = useFlightPivot
            ? (this.isFlightTurning ? this.flightTurnVisualRotation : this.flightFacingRotationY)
            : 0;

        this.currentGroundTilt = THREE.MathUtils.lerp(this.currentGroundTilt, targetTilt, lerpAlpha);
        this.dynoFlightTurnPivot.rotation.y = flightTurnRotationY;
        this.dynoTiltPivot.rotation.z = this.currentGroundTilt;
        // In water the flight pivot owns Y-facing; suppress dynoTurnPivot to avoid double-rotation.
        this.dynoTurnPivot.rotation.y = this.isInWater ? 0 : this.currentTurnRotation;

        if (this.doDebug !== false) {
            if (!this.onGround && this.airMode === 'fly') {
                this.logDebugChange(
                    'flightAngleCurrent',
                    this.currentGroundTilt.toFixed(2),
                    `[Player] Current smoothed flight angle: ${THREE.MathUtils.radToDeg(this.currentGroundTilt).toFixed(1)}deg`
                );
            } else {
                this.debugState.delete('flightAngleCurrent');
            }
        }
    }

    logGroundStateTransition(wasOnGround) {
        if (wasOnGround === this.onGround) {
            return;
        }

        if (this.onGround) {
//            console.info('[Player] Airborne -> grounded');
        } else {
//            console.info('[Player] Grounded -> airborne');
            // Release non-mouth ground drag when the dyno becomes airborne.
            if (this.isPullDraggingObject() && !this.isMouthDraggingObject()) {
                this.releaseDraggedObject({ force: true });
            }
        }
    }

    updateAnimationState(inputX, inputY, wasOnGround) {
        if (!this.animationMixer) {
            return;
        }

        if (this.timelineAnimationControlled) {
            return;
        }

        if (this.isDeadState) {
            if (this.deathState === 'falling') {
                this.playLoopAnimation('deadFalling');
                return;
            }

            if (this.deathState === 'grounded') {
                if (!this.gameOverAnimationFinished && !this.deathGroundedAction) {
                    this.playDeadGroundAnimation();
                } else if (
                    !this.gameOverAnimationFinished &&
                    this.deathGroundedAction &&
                    this.deathGroundedAction.isRunning?.() === false
                ) {
                    this.gameOverAnimationFinished = true;
                    this.deathGroundedAction = null;
                }
                return;
            }
        }

        if (this.isReviving) {
            if (!this.reviveAction || this.reviveAction.isRunning?.() === false) {
                this.playReviveAnimation();
            }
            return;
        }

        if (this.isFaintSequenceActive) {
            if (!this.faintAnimationAction || this.faintAnimationAction.isRunning?.() === false) {
                this.playFaintAnimation();
            }
            return;
        }

        const desiredState = this.resolveAnimationState(inputX, inputY, wasOnGround);
        const preferredLoopState = desiredState === 'takeoff' || desiredState === 'landing'
            ? this.getPreferredLoopState()
            : desiredState;

        if (this.transitionAction) {
            this.queuedLoopState = preferredLoopState;
            return;
        }

        if (desiredState === 'takeoff' && this.animationActions.takeoff) {
            this.playOneShotAnimation('takeoff', 'fly');
            return;
        }

        if (desiredState === 'landing' && this.animationActions.landing) {
            this.playOneShotAnimation('landing', this.getGroundAnimationState());
            return;
        }

        this.playLoopAnimation(preferredLoopState);
    }

    resolveAnimationState(inputX, inputY, wasOnGround) {
        if (this.isInWater) {
            return this.getWaterAnimationState();
        }
        if (!this.onGround) {
            return this.resolveAirborneAnimationState();
        }

        return this.getGroundAnimationState(inputX, inputY);
    }

    getGroundAnimationState() {
        if (this.isTurning && this.turnDirection) {
            return this.turnDirection;
        }

        const absSpeed = this.isPullDraggingObject()
            ? this.actualHorizontalSpeed
            : Math.abs(this.velocity.x);
        const movementBand = absSpeed <= DYNO_MODEL_SETTINGS.animationSpeedDeadZone
            ? 'idle'
            : absSpeed < CONFIG.startRunSpeed
                ? 'walk'
                : 'run';

        if (this.isPullDraggingObject() && !this.isMouthDraggingObject()) {
            const forwardInput = (this.joystick?.x ?? 0) * this.getDragFacingDirection();
            if (forwardInput > 0.1) {
                this.logMovementBand('dragPush', absSpeed);
                return 'dragPush';
            }
        }

        if (this.isPullDraggingObject()) {
            if (movementBand === 'idle' && this.getHeavyDragStandstillAnimationSpeed() <= 0) {
                this.logMovementBand('dragIdle', absSpeed);
                return 'dragIdle';
            }

            this.logMovementBand('drag', absSpeed);
            return 'drag';
        }

        this.logMovementBand(movementBand, absSpeed);
        return movementBand;
    }

    getGroundLocomotionState() {
        const groundState = this.getGroundAnimationState();
        return groundState === 'turnLeft' || groundState === 'turnRight'
            ? (this.isPullDraggingObject() ? 'drag' : 'walk')
            : groundState;
    }

    getAirborneAnimationState() {
        return this.airborneAnimationState || 'hover';
    }

    resolveAirborneAnimationState() {
        if (this.isTurning && this.turnDirection) {
            return this.turnDirection;
        }

        const nextState = this.selectAirborneAnimationState();
/*        
        if (nextState !== this.airborneAnimationState) {
            console.info(
                `[Player] Airborne animation chosen: ${nextState} ` +
                `vx=${this.velocity.x.toFixed(2)} vy=${this.velocity.y.toFixed(2)} mode=${this.airMode}`
            );
        }
*/            
        this.airborneAnimationState = nextState;
        return this.airborneAnimationState;
    }

    selectAirborneAnimationState() {
        if (this.isFaintSequenceActive) {
            return 'faint';
        }

        if (this.airMode === 'hover') {
            this.holdFlightTurnFlyUp = false;
            // Always return 'hover' for the primary animation
            // Animation blending is handled in updateHoverAnimationBlend()
            return 'hover';
        }

        const airSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const isGlidingFastEnough = airSpeed > CONFIG.flightDiveSpeedThreshold;
        const isDivingFastEnough = this.velocity.y <= -CONFIG.flightDiveSpeedThreshold;


        if (isDivingFastEnough) {
            this.logDebugChange(
                'flyingDiveChoice',
                `true|${Math.round(this.velocity.y)}`,
                `[Player] Flying animation choice: flyDive vy=${this.velocity.y.toFixed(2)} threshold=${CONFIG.flightDiveSpeedThreshold.toFixed(2)}`
            );
            return 'flyDive';
        }

        if (isGlidingFastEnough) {
            // Suppress glide within the exclusion zone around straight up so steep climbs
            // use flyUp instead of snapping to glide.
            const glideUpExclusion = CONFIG.glideUpAngleExclusionDeg ?? 15;
            const angleFromStraightUp = airSpeed > 0.0001
                ? Math.acos(THREE.MathUtils.clamp(this.velocity.y / airSpeed, -1, 1)) * (180 / Math.PI)
                : 180;
            const isStraightUp = angleFromStraightUp <= glideUpExclusion;
            if (!isStraightUp) {
                this.logDebugChange(
                    'flyingGlideChoice',
                    `true|${Math.round(airSpeed)}`,
                    `[Player] Flying animation choice: flyGlide speed=${airSpeed.toFixed(2)} threshold=${CONFIG.flightMaxSpeed.toFixed(2)}`
                );
                return 'flyGlide';
            }
        }

        if (this.isFlightTurning) {
            this.logDebugChange(
                'flyingUpChoice',
                `turning|${Math.round(airSpeed)}`,
                `[Player] Flying animation choice: flyUp forced during flight turn speed=${airSpeed.toFixed(2)}`
            );
            return 'flyUp';
        }

        if (this.holdFlightTurnFlyUp) {
            if (airSpeed < CONFIG.hoverSpeedThreshold) {
                this.logDebugChange(
                    'flyingUpChoice',
                    `turnHold|${Math.round(airSpeed)}`,
                    `[Player] Flying animation choice: flyUp held after turn speed=${airSpeed.toFixed(2)} threshold=${CONFIG.hoverSpeedThreshold.toFixed(2)}`
                );
                return 'flyUp';
            }

            this.holdFlightTurnFlyUp = false;
        }

        const flightAngleDeg = this.getCurrentFlightAngleDeg();
        const useFlyingUp = flightAngleDeg >= CONFIG.flyingUpAngleMin ||
            flightAngleDeg <= -CONFIG.flyingDownAngleMin;

        if (this.doDebug !== false) {
            this.logDebugChange(
                'flyingUpChoice',
                `${useFlyingUp}|${Math.round(flightAngleDeg)}`,
                `[Player] Flying animation choice: ${useFlyingUp ? 'flyUp' : 'fly'} angle=${flightAngleDeg.toFixed(1)}deg`
            );
        }

        if (useFlyingUp) {
            return 'flyUp';
        }

        return 'fly';
    }

    logMovementBand(movementBand, absSpeed) {
        if (movementBand === this.lastMovementBand) {
            return;
        }

        this.lastMovementBand = movementBand;
//        console.info(`[Player] Locomotion animation chosen: ${movementBand} at speed ${absSpeed.toFixed(2)}`);
    }

    getPreferredLoopState() {
        if (this.isInWater) return this.getWaterAnimationState();
        return this.onGround ? this.getGroundAnimationState() : this.getAirborneAnimationState();
    }

    updateHoverAnimationBlend(dt) {
        if (!this.animationMixer) {
            return;
        }

        if (this.timelineAnimationControlled) {
            this.resetHoverAnimationBlend();
            return;
        }

        if (this.onGround || this.isInWater || this.airMode !== 'hover') {
            this.resetHoverAnimationBlend();
            return;
        }

        const hoverAction = this.animationActions.hover;
        const hoverUpAction = this.animationActions.hoverUp;
        const hoverDownAction = this.animationActions.hoverDown;

        // Ensure all hover animations are initialized and playing
        if (hoverUpAction && !hoverUpAction.isRunning()) {
            const referenceTime = hoverAction?.time ?? 0;
            hoverUpAction.enabled = true;
            hoverUpAction.reset();
            hoverUpAction.setLoop(THREE.LoopRepeat, Infinity);
            hoverUpAction.clampWhenFinished = false;
            hoverUpAction.setEffectiveTimeScale(this.animationTimeScales.hoverUp || 1);
            hoverUpAction.time = referenceTime;
            hoverUpAction.play();
        }

        if (hoverDownAction && !hoverDownAction.isRunning()) {
            const referenceTime = hoverAction?.time ?? 0;
            hoverDownAction.enabled = true;
            hoverDownAction.reset();
            hoverDownAction.setLoop(THREE.LoopRepeat, Infinity);
            hoverDownAction.clampWhenFinished = false;
            hoverDownAction.setEffectiveTimeScale(this.animationTimeScales.hoverDown || 1);
            hoverDownAction.time = referenceTime;
            hoverDownAction.play();
        }

        // Hover directional blending follows stick intent (target direction), not current
        // movement velocity. This keeps animation response immediate but still smoothly blended.
        const hoverStickDeadZone = 0.05;
        const stickY = Math.abs(this.currentInput.y) < hoverStickDeadZone ? 0 : this.currentInput.y;
        const verticalIntent = THREE.MathUtils.clamp(stickY, -1, 1);
        const desiredMode = verticalIntent > 0
            ? 'up'
            : (verticalIntent < 0 ? 'down' : 'neutral');

        // If input flips from up->down (or down->up), force a pass through neutral hover first.
        // This preserves the authored loop flow instead of crossfading opposite loops directly.
        if (desiredMode === 'neutral') {
            this.hoverBlendMode = 'neutral';
            this.hoverBlendPendingMode = null;
        } else if (this.hoverBlendMode === 'neutral') {
            this.hoverBlendMode = desiredMode;
            this.hoverBlendPendingMode = null;
        } else if (this.hoverBlendMode !== desiredMode) {
            this.hoverBlendMode = 'neutral';
            this.hoverBlendPendingMode = desiredMode;
        }

        const switchThroughHoverThreshold = 0.12;
        if (
            this.hoverBlendMode === 'neutral' &&
            this.hoverBlendPendingMode &&
            this.hoverBlendWeights.hoverUp <= switchThroughHoverThreshold &&
            this.hoverBlendWeights.hoverDown <= switchThroughHoverThreshold
        ) {
            this.hoverBlendMode = this.hoverBlendPendingMode;
            this.hoverBlendPendingMode = null;
        }

        // Calculate target blend weights for hover, hoverUp, and hoverDown.
        // Directional loops are driven by stick magnitude, while hover fills the remainder.
        let targetHoverWeight = 1;
        let targetHoverUpWeight = 0;
        let targetHoverDownWeight = 0;
        const directionalStrength = Math.abs(verticalIntent);
        if (this.hoverBlendMode === 'up') {
            targetHoverUpWeight = directionalStrength;
            targetHoverWeight = 1 - targetHoverUpWeight;
        } else if (this.hoverBlendMode === 'down') {
            targetHoverDownWeight = directionalStrength;
            targetHoverWeight = 1 - targetHoverDownWeight;
        }

        const blendSpeed = Number.isFinite(CONFIG.hoverBlendSpeed) ? CONFIG.hoverBlendSpeed : 8;
        const blendAlpha = Math.min(1, Math.max(0, blendSpeed * dt));
        this.hoverBlendWeights.hover = THREE.MathUtils.lerp(this.hoverBlendWeights.hover, targetHoverWeight, blendAlpha);
        this.hoverBlendWeights.hoverUp = THREE.MathUtils.lerp(this.hoverBlendWeights.hoverUp, targetHoverUpWeight, blendAlpha);
        this.hoverBlendWeights.hoverDown = THREE.MathUtils.lerp(this.hoverBlendWeights.hoverDown, targetHoverDownWeight, blendAlpha);

        // Sync animation times so they all progress together
        // Use hover as the reference animation
        if (hoverAction && hoverAction.isRunning()) {
            const hoverTime = hoverAction.time;
            
            if (hoverUpAction && hoverUpAction.isRunning()) {
                hoverUpAction.time = hoverTime;
            }
            if (hoverDownAction && hoverDownAction.isRunning()) {
                hoverDownAction.time = hoverTime;
            }
        }

        // Apply weights to animations
        if (hoverAction) {
            hoverAction.setEffectiveWeight(this.hoverBlendWeights.hover);
        }

        if (hoverUpAction) {
            hoverUpAction.setEffectiveWeight(this.hoverBlendWeights.hoverUp);
        }

        if (hoverDownAction) {
            hoverDownAction.setEffectiveWeight(this.hoverBlendWeights.hoverDown);
        }
    }

    resetHoverAnimationBlend() {
        const hoverAction = this.animationActions.hover;
        const hoverUpAction = this.animationActions.hoverUp;
        const hoverDownAction = this.animationActions.hoverDown;

        if (hoverAction) {
            hoverAction.setEffectiveWeight(0);
            hoverAction.stop();
        }

        if (hoverUpAction) {
            hoverUpAction.setEffectiveWeight(0);
            hoverUpAction.stop();
        }

        if (hoverDownAction) {
            hoverDownAction.setEffectiveWeight(0);
            hoverDownAction.stop();
        }

        this.hoverBlendWeights.hover = 1;
        this.hoverBlendWeights.hoverUp = 0;
        this.hoverBlendWeights.hoverDown = 0;
        this.hoverBlendMode = 'neutral';
        this.hoverBlendPendingMode = null;
    }

    playOneShotAnimation(state, followUpState) {
        const resolvedState = this.resolveStateWithFallback(state);
        if (!resolvedState) {
            this.playLoopAnimation(followUpState);
            return;
        }

        this.transitionAction = this.animationActions[resolvedState];
        this.queuedLoopState = followUpState;
        this.playAnimation(resolvedState, DYNO_MODEL_SETTINGS.fadeDuration, true);
    }

    playLoopAnimation(state) {
        const resolvedState = this.resolveStateWithFallback(state);
        if (!resolvedState) {
            return;
        }

        this.playAnimation(resolvedState, DYNO_MODEL_SETTINGS.fadeDuration, false);
    }

    resolveTimelineClipAction(name) {
        const exactName = String(name || '').trim();
        if (!exactName) {
            return null;
        }

        const exactMatch = this.animationClipActions.get(exactName);
        if (exactMatch) {
            return exactMatch;
        }

        const normalizedName = this.normalizeClipName(exactName);
        if (!normalizedName) {
            return null;
        }

        return this.animationClipActionsNormalized.get(normalizedName) || null;
    }

    playTimelineAnimation(state, options = {}) {
        const directClipAction = this.resolveTimelineClipAction(state);
        if (!directClipAction) {
            return;
        }

        const resolvedState = String(state || '').trim();
        const loop = options.loop !== false;
        if (directClipAction) {
            this.transitionAction = null;
            this.queuedLoopState = null;
            this.playResolvedAnimationAction(
                directClipAction,
                resolvedState,
                DYNO_MODEL_SETTINGS.fadeDuration,
                !loop
            );
        }
    }

    resolveStateWithFallback(state) {
        const fallbackOrder = DYNO_MODEL_SETTINGS.fallbackOrder[state] || [state];

        for (const candidate of fallbackOrder) {
            if (this.animationActions[candidate]) {
                if (candidate !== state) {
                    const warningKey = `${state}->${candidate}`;
                    if (!this.missingAnimationWarnings.has(warningKey)) {
                        this.missingAnimationWarnings.add(warningKey);
                        console.warn(`[Player] Missing animation for "${state}", using fallback "${candidate}".`);
                    }
                }
                return candidate;
            }
        }

        if (!this.missingAnimationWarnings.has(state)) {
            this.missingAnimationWarnings.add(state);
            console.warn(`[Player] No animation available for "${state}".`);
        }

        return null;
    }

    playAnimation(state, fadeDuration = DYNO_MODEL_SETTINGS.fadeDuration, loopOnce = false) {
        const nextAction = this.animationActions[state];
        if (!nextAction) {
            return;
        }

        this.playResolvedAnimationAction(nextAction, state, fadeDuration, loopOnce);
    }

    playResolvedAnimationAction(nextAction, stateLabel, fadeDuration = DYNO_MODEL_SETTINGS.fadeDuration, loopOnce = false) {
        if (!nextAction) {
            return;
        }

        if (nextAction === this.activeAction && this.activeAnimationState === stateLabel && !loopOnce) {
            return;
        }

        const previousAction = this.activeAction;
        const previousState = this.activeAnimationState;
        this.stopInactiveActions(previousAction, nextAction);

        nextAction.enabled = true;
        nextAction.setEffectiveTimeScale(1);
        nextAction.setEffectiveWeight(1);

        if (loopOnce) {
            nextAction.reset();
            nextAction.setLoop(THREE.LoopOnce, 1);
            nextAction.clampWhenFinished = true;
        } else {
            const shouldPreserveLoopPhase = this.shouldPreserveLoopPhase(previousState, stateLabel);
            if (nextAction !== previousAction && !shouldPreserveLoopPhase) {
                nextAction.reset();
            }
            nextAction.setLoop(THREE.LoopRepeat, Infinity);
            nextAction.clampWhenFinished = false;
            if (shouldPreserveLoopPhase && previousAction && previousAction !== nextAction) {
                this.matchLoopPhase(previousAction, nextAction);
            }
        }

        nextAction.play();

        if (previousAction && previousAction !== nextAction) {
            previousAction.crossFadeTo(nextAction, fadeDuration, true);
        } else if (nextAction !== previousAction) {
            nextAction.fadeIn(fadeDuration);
        }

//        console.info(`[Player] Animation transition: ${this.activeAnimationState ?? 'none'} -> ${stateLabel}`);
        this.activeAction = nextAction;
        this.activeAnimationState = stateLabel;
    }

    isAirborneLoopState(state) {
        return ['hover', 'hoverUp', 'hoverDown', 'fly', 'flyUp', 'flyGlide', 'flyDive'].includes(state);
    }

    shouldPreserveLoopPhase(previousState, nextState) {
        if (!previousState || !nextState || previousState === nextState) {
            return false;
        }

        // Fly <-> hover family transitions should keep loop phase to avoid visible pop/hitch
        // when input changes quickly (for example releasing stick from an upward flight angle).
        return this.isAirborneLoopState(previousState) && this.isAirborneLoopState(nextState);
    }

    matchLoopPhase(sourceAction, targetAction) {
        if (!sourceAction || !targetAction) {
            return;
        }

        const sourceDuration = Math.max(sourceAction.getClip()?.duration || 0, 0.0001);
        const targetDuration = Math.max(targetAction.getClip()?.duration || 0, 0.0001);
        const normalizedPhase = THREE.MathUtils.euclideanModulo(sourceAction.time, sourceDuration) / sourceDuration;
        targetAction.time = normalizedPhase * targetDuration;
    }

    stopInactiveActions(previousAction, nextAction) {
        const uniqueActions = new Set(Object.values(this.animationActions));
        
        // Don't stop hover animations while in hover mode - they're used for blending
        const preserveHoverAnimations = !this.onGround && this.airMode === 'hover';

        for (const action of uniqueActions) {
            if (action !== previousAction && action !== nextAction) {
                // Preserve hover-related actions during hover mode
                if (preserveHoverAnimations && ['hover', 'hoverUp', 'hoverDown'].some(
                    state => action === this.animationActions[state]
                )) {
                    continue;
                }
                action.stop();
            }
        }
    }

    handleAnimationFinished(event) {
        if (this.timelineAnimationControlled) {
            return;
        }

        if (this.isReviving && this.reviveAction && event.action === this.reviveAction) {
            this.finishReviveFlow();
            return;
        }

        if (
            this.isDeadState &&
            this.deathState === 'grounded' &&
            this.deathGroundedAction &&
            event.action === this.deathGroundedAction
        ) {
            // Final dead pose is considered finished when "dead" reached its end frame on ground.
            this.gameOverAnimationFinished = true;
            this.deathGroundedAction = null;
            return;
        }

        if (event.action !== this.transitionAction) {
            return;
        }

        this.transitionAction = null;

        const nextLoopState = this.queuedLoopState || this.getPreferredLoopState();
        this.queuedLoopState = null;
        this.playLoopAnimation(nextLoopState);
    }

    logDebugChange(key, signature, message, forced) {
        if (this.doDebug === false && !forced) {
            return;
        }

        if (this.debugState.get(key) === signature) {
            return;
        }

        this.debugState.set(key, signature);
        console.info(message);
    }

    tryStartTakeoff(input) {
        if (!this.onGround || this.isTurning || this.isPullDraggingObject()) {
            return false;
        }

        const groundContact = this.groundContact || (() => {
            const groundInfo = this.getGroundInfoAt(this.position.x, this.position.y);
            if (!groundInfo) {
                return null;
            }
            this.updateGroundContact(groundInfo);
            return this.groundContact;
        })();
        if (!groundContact?.takeoffAllowed) {
            this.logDebugChange(
                'takeoffDecision',
                `false|noTakeoff|${input.y.toFixed(2)}`,
                `[Player] Takeoff decision: blocked by edge metadata up=${input.y.toFixed(2)}`
            );
            return false;
        }

        const takeoffDecision = this.getTakeoffDecision(input.x, input.y);
        const angleBucket = Math.round(takeoffDecision.angleDeg / 5);
        this.logDebugChange(
            'takeoffDecision',
            `${takeoffDecision.allowed}|${angleBucket}|${input.y.toFixed(2)}`,
            `[Player] Takeoff decision: angle=${takeoffDecision.angleDeg.toFixed(1)}deg up=${input.y.toFixed(2)} allowed=${takeoffDecision.allowed}`
        );

        if (!takeoffDecision.allowed) {
            return false;
        }

        const groundState = this.getGroundLocomotionState();
        const airborneState = this.selectTakeoffAnimationFromGroundState(groundState);
        const launchVelocityY = Math.max(
            CONFIG.JUMP_FORCE * 0.7,
            Math.max(input.y, CONFIG.takeoffMinUpInput) * CONFIG.FLIGHT_FORCE * 0.4
        );

        this.setAirborneState();
        this.airMode = airborneState === 'fly' ? 'fly' : 'hover';
        this.airHoverRecoveryLock = false;
        this.cancelFlightTurn();
        this.flightFacingRotationY = this.airMode === 'fly'
            ? this.getFlightBaseRotationY(this.lastFacingDirection)
            : 0;
        this.flightTurnVisualRotation = this.flightFacingRotationY;
        this.airborneAnimationState = airborneState;
        this.isHovering = this.airMode === 'hover';
        this.velocity.y = launchVelocityY;
        this.position.y += 0.02;
        this.cancelTurn();
        this.audioManager?.play?.('dynoLiftoff', { volume: 0.85 });
        this.audioManager?.stopLoop?.('gallop');

        //console.info(
        //    `[Player] Grounded -> airborne: groundState=${groundState} animation=${airborneState} ` +
        //    `angle=${takeoffDecision.angleDeg.toFixed(1)}deg vx=${this.velocity.x.toFixed(2)} vy=${this.velocity.y.toFixed(2)}`
        //);

        this.playLoopAnimation(airborneState);
        return true;
    }

    selectTakeoffAnimationFromGroundState(groundState) {
        const selectedState = groundState === 'run' ? 'fly' : 'hover';
        const resolvedState = this.resolveStateWithFallback(selectedState) || selectedState;

        if (resolvedState !== selectedState) {
            console.warn(`[Player] Missing airborne animation "${selectedState}", using fallback "${resolvedState}".`);
        }

        //console.info(`[Player] Takeoff animation selected: ${groundState} -> ${resolvedState}`);
        return resolvedState;
    }

    startTurn(targetFacing, inputX) {
        const inputStrength = THREE.MathUtils.clamp(Math.abs(inputX), 0, 1);

        const isSurfaceWater = this.isInWater && !this.isDeepWaterSwim() &&
            (this.waterState === 'swimSurfaceIdle' || this.waterState === 'swimSurfaceIdleUp');

        this.isTurning = true;
        this.turnMode = (this.onGround || isSurfaceWater) ? 'ground' : 'air';
        this.turnStartFacing = this.lastFacingDirection;
        this.currentTurnRotation = 0;
        // Ensure flight pivot starts from the correct facing before the turn lerp begins.
        if (isSurfaceWater) {
            this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
            this.flightTurnVisualRotation = this.flightFacingRotationY;
        }
        this.currentTurnSpeed = this.getTurnSpeed(inputX);
        this.retargetTurn(this.getTurnRotationForFacing(targetFacing), inputStrength);

        const selectedTurnAnimation = this.resolveStateWithFallback(this.turnDirection) || 'none';
        //console.info(
        //    `[Player] ${this.turnMode} turn start: ${this.turnStartFacing > 0 ? 'right' : 'left'} -> ${targetFacing > 0 ? 'right' : 'left'} ` +
        //    `direction=${this.turnDirection} animation=${selectedTurnAnimation} speed=${this.currentTurnSpeed.toFixed(2)} input=${inputStrength.toFixed(2)} rotationTarget=${this.turnRotationTarget.toFixed(2)}`
        //);
    }

    completeTurn() {
        this.lastFacingDirection = Math.abs(this.turnRotationTarget) > Math.PI * 0.5
            ? -this.turnStartFacing
            : this.turnStartFacing;
        this.lastGroundMoveSign = this.lastFacingDirection;
        this.isTurning = false;
        this.currentTurnRotation = 0;
        this.currentTurnSpeed = this.onGround ? CONFIG.minWalkTurnSpeed : CONFIG.minHoverTurnSpeed;

        const completedDirection = this.turnDirection;
        this.turnDirection = null;
        this.turnMode = this.onGround ? 'ground' : 'air';
        if (!this.onGround && !this.isInWater) {
            const inputLength = Math.min(1, Math.hypot(this.currentInput.x, this.currentInput.y));
            const currentAirSpeed = Math.hypot(this.velocity.x, this.velocity.y);
            const requestedAirSpeed = this.getRequestedAirSpeed(this.currentInput);
            const modeBuffer = Math.max(0.35, CONFIG.hoverSpeedThreshold * 0.08);
            const flyEnterThreshold = CONFIG.hoverSpeedThreshold + modeBuffer;
            const shouldResumeFlightImmediately = Math.max(currentAirSpeed, requestedAirSpeed) >= flyEnterThreshold;

            if (this.isCarryHoverOnlyActive()) {
                this.airMode = 'hover';
                this.airHoverRecoveryLock = true;
            } else if (this.airMode === 'hover' && this.isWithinNearGroundHoverLockDistance()) {
                // Turn completion should not immediately kick low-altitude hover back into flight.
                // Once the dyno climbs above the hover-lock distance, normal air transitions
                // become available again through updateAirMode().
                this.airMode = 'hover';
                this.airHoverRecoveryLock = false;
            } else {
                this.airMode = shouldResumeFlightImmediately ? 'fly' : 'hover';
                this.airHoverRecoveryLock = !shouldResumeFlightImmediately;
            }

            if (!this.isCarryHoverOnlyActive() && this.airMode === 'fly' && shouldResumeFlightImmediately) {
                // Hover turns can complete straight into flight mode. When that happens, the flight
                // side-view pivot must immediately inherit the freshly completed facing direction,
                // otherwise the dyno can visually keep the previous side while movement resumes.
                this.flightFacingRotationY = this.getFlightBaseRotationY(this.lastFacingDirection);
                this.flightTurnVisualRotation = this.flightFacingRotationY;
            } else {
                this.flightFacingRotationY = 0;
                this.flightTurnVisualRotation = 0;
            }

            //console.info(
            //    `[Player] Air turn exit: mode=${this.airMode} speed=${currentAirSpeed.toFixed(2)} ` +
            //    `requested=${requestedAirSpeed.toFixed(2)} flyEnter=${flyEnterThreshold.toFixed(2)} recoveryLock=${this.airHoverRecoveryLock}`
            //);
        }
        this.turnRotationTarget = this.getTurnRotationForFacing(-this.turnStartFacing);
        this.debugState.delete('turnProgress');

        //console.info(`[Player] ${this.turnMode} turn complete: facing ${this.lastFacingDirection > 0 ? 'right' : 'left'} (${completedDirection})`);
        this.playLoopAnimation(this.getPreferredLoopState());
    }

    cancelTurn() {
        if (!this.isTurning) {
            this.currentTurnRotation = 0;
            return;
        }

        this.isTurning = false;
        this.currentTurnRotation = 0;
        this.currentTurnSpeed = this.onGround ? CONFIG.minWalkTurnSpeed : CONFIG.minHoverTurnSpeed;
        this.turnDirection = null;
        this.turnMode = this.onGround ? 'ground' : 'air';
        this.turnRotationTarget = this.getTurnRotationForFacing(-this.lastFacingDirection);
        this.debugState.delete('turnProgress');
    }

    updateLocomotionAnimationSpeed(dt) {
        const locomotionTimeScales = {
            hover: 1,
            walk: 0,
            drag: 0,
            run: 0,
            fly: 1,
            flyUp: 1,
            flyGlide: 1,
            flyDive: 1,
            swimNormal: 1,
            swimDive: 1,
            swimIdle: 1,
            swimIdleUp: 1,
            swimIdleGrab: 1
        };
        const absGroundSpeed = Math.abs(this.velocity.x);
        const heavyDragStandstillAnimationSpeed = this.getHeavyDragStandstillAnimationSpeed();
        const airborneAnimationReference = this.getAirborneAnimationReference();
        const airborneAnimationSpeed = airborneAnimationReference.speed;

        if (this.isInWater) {
            const waterMaxSpeed = (CONFIG.DYNO_WATER?.waterMaxSpeed ?? 4) * this.getCurrentSpeedMultiplier();
            const swimSpeed = Math.hypot(this.velocity.x, this.velocity.y);
            const swimScale = waterMaxSpeed > 0 ? THREE.MathUtils.clamp(swimSpeed / waterMaxSpeed, 0, 2) : 1;
            locomotionTimeScales.swimNormal = swimScale;
            locomotionTimeScales.swimDive = swimScale;
            // Surface idle: base speed + linear ramp from horizontal movement
            const idleBase = CONFIG.DYNO_WATER?.swimIdleBaseSpeed ?? 0.6;
            const idleScale = idleBase + (waterMaxSpeed > 0 ? THREE.MathUtils.clamp(Math.abs(this.velocity.x) / waterMaxSpeed, 0, 1) : 0);
            locomotionTimeScales.swimIdle = idleScale;
            locomotionTimeScales.swimIdleUp = idleScale;
            locomotionTimeScales.swimIdleGrab = idleScale;
        }

        if (this.onGround && !this.isTurning) {
            locomotionTimeScales.walk = this.getCycleSyncedTimeScale('walk', absGroundSpeed, CONFIG.walkCycleDistance);
            locomotionTimeScales.drag = this.getCycleSyncedTimeScale('drag', absGroundSpeed, CONFIG.walkCycleDistance);
            locomotionTimeScales.run = this.getCycleSyncedTimeScale('run', absGroundSpeed, CONFIG.runCycleDistance);
            if (this.isPullDraggingObject()) {
                if (heavyDragStandstillAnimationSpeed > 0 && absGroundSpeed <= DYNO_MODEL_SETTINGS.animationSpeedDeadZone) {
                    // Overweight pull attempts are movement-locked. Drive drag-loop from the
                    // equivalent max-drag-weight pull speed so the dyno visibly slides in place.
                    locomotionTimeScales.drag = this.getCycleSyncedTimeScale(
                        'drag',
                        heavyDragStandstillAnimationSpeed,
                        CONFIG.walkCycleDistance
                    );
                }
                locomotionTimeScales.drag *= this.getDragAnimationSpeedMultiplier();
                // Dragging moves opposite the dyno's facing direction. Play the ground cycle
                // backward so the feet read as a backward pull instead of a forward walk.
                locomotionTimeScales.walk *= -1;
                locomotionTimeScales.drag *= -1;
                locomotionTimeScales.run *= -1;
            }
        } else if (!this.onGround && !this.isTurning) {
            const airScale =
                this.getNormalizedAirborneTimeScale(airborneAnimationSpeed) *
                this.getAirborneAnimationInputMultiplier() *
                this.getCarryFlapSpeedMultiplier();
            locomotionTimeScales.hover = this.getAirborneStateTimeScale('hover', airScale);
            locomotionTimeScales.hoverUp = this.getAirborneStateTimeScale('hoverUp', airScale);
            locomotionTimeScales.hoverDown = this.getAirborneStateTimeScale('hoverDown', airScale);
            locomotionTimeScales.fly = this.getAirborneStateTimeScale('fly', airScale);
            locomotionTimeScales.flyUp = this.getAirborneStateTimeScale('flyUp', airScale);
            locomotionTimeScales.flyGlide = this.getAirborneStateTimeScale('flyGlide', airScale);
            locomotionTimeScales.flyDive = this.getAirborneStateTimeScale('flyDive', airScale);
        }

        for (const state of ['hover', 'hoverUp', 'hoverDown', 'walk', 'drag', 'run', 'fly', 'flyUp', 'flyGlide', 'flyDive', 'swimNormal', 'swimDive', 'swimIdle', 'swimIdleUp', 'swimIdleGrab']) {
            this.animationTimeScales[state] = locomotionTimeScales[state];

            const action = this.animationActions[state];
            if (!action) {
                continue;
            }

            // Ground loops stay distance-locked, while airborne loops scale with normalized flight speed.
            action.setEffectiveTimeScale(this.animationTimeScales[state]);
        }

        if (this.onGround && !this.isTurning) {
            const isPushing = this.isPullDraggingObject() && !this.isMouthDraggingObject() &&
                (this.joystick?.x ?? 0) * this.getDragFacingDirection() > 0.05;
            // Pull: cycle runs backward (-1) so feet animate correctly when walking backward.
            // Push: cycle runs forward (+1) like normal walking.
            const groundCycleDirection = (this.isPullDraggingObject() && !isPushing) ? -1 : 1;
            const dragCycleDistance = this.isPullDraggingObject()
                ? this.groundTravelDistance * this.getDragAnimationSpeedMultiplier()
                : this.groundTravelDistance;
            this.syncGroundCycleAnimationPhase('walk', CONFIG.walkCycleDistance, groundCycleDirection);
            if (!(heavyDragStandstillAnimationSpeed > 0 && absGroundSpeed <= DYNO_MODEL_SETTINGS.animationSpeedDeadZone)) {
                this.syncGroundCycleAnimationPhase(
                    'drag',
                    CONFIG.walkCycleDistance,
                    groundCycleDirection,
                    dragCycleDistance
                );
            }
            this.syncGroundCycleAnimationPhase(
                'dragPush',
                CONFIG.walkCycleDistance,
                1,
                dragCycleDistance
            );
            this.syncGroundCycleAnimationPhase('run', CONFIG.runCycleDistance, groundCycleDirection);
        }

        if (LOCOMOTION_TIMESCALE_LOG_STATES.has(this.activeAnimationState)) {
            if (this.doDebug !== false) {
                const speedForLog = this.onGround ? absGroundSpeed : airborneAnimationSpeed;
                this.logDebugChange(
                    'locomotionTimeScale',
                    `${this.activeAnimationState}|${this.animationTimeScales[this.activeAnimationState].toFixed(2)}`,
                    `[Player] Locomotion timescale: ${this.activeAnimationState} speed=${speedForLog.toFixed(2)} scale=${this.animationTimeScales[this.activeAnimationState].toFixed(2)}`
                );
            }
        } else if (this.doDebug !== false) {
            this.debugState.delete('locomotionTimeScale');
        }
    }

    isThinAirFlapBoostActive() {
        const fullUpHeight = this.getFlightFullUpHeight();
        return !this.onGround &&
            this.position.y > fullUpHeight &&
            this.currentInput.y >= 0 &&
            this.velocity.y >= -0.2;
    }

    getAirborneAnimationReference() {
        let actualReference = {
            speed: Math.hypot(this.velocity.x, this.velocity.y)
        };

        let desiredReference = {
            speed: Math.hypot(
                this.currentInput.x * this.getHorizontalFlightMaxSpeed(),
                this.currentInput.y * this.getVerticalFlightMaxSpeed(this.currentInput.y)
            )
        };

        if (this.airMode === 'hover') {
            // Hover should use one stable baseline cadence. Directional hover input then adjusts
            // that baseline via AIRBORNE_FLAP_RESPONSE, instead of downward hover motion raising
            // the base flap speed by reusing the faster flight-speed reference.
            actualReference = {
                speed: CONFIG.hoverSpeedThreshold
            };
            desiredReference = {
                speed: CONFIG.hoverSpeedThreshold
            };

            if (this.grabbedObject) {
                const upIntent = THREE.MathUtils.clamp(this.currentInput.y, 0, 1);
                if (upIntent > 0) {
                    const fullClimbReferenceSpeed = this.getVerticalFlightMaxSpeed(1);
                    desiredReference.speed = THREE.MathUtils.lerp(
                        CONFIG.hoverSpeedThreshold,
                        fullClimbReferenceSpeed,
                        upIntent
                    );
                }
            }
        }

        let chosenReference = actualReference.speed >= desiredReference.speed
            ? actualReference
            : desiredReference;

        if (this.isThinAirFlapBoostActive()) {
            const fullUpHeight = this.getFlightFullUpHeight();
            const ceilingHeight = this.getFlightCeilingHeight();
            const thinAirClimbRatio = THREE.MathUtils.clamp(
                (this.position.y - fullUpHeight) /
                Math.max(ceilingHeight - fullUpHeight, 0.001),
                0,
                1
            );
            const fullClimbReferenceSpeed = this.getVerticalFlightMaxSpeed(1);

            // Hovering in thin air should still flap as hard as an upward climb, even if the
            // current Y input is neutral and the dyno is simply trying to hold altitude.
            chosenReference.speed = Math.max(chosenReference.speed, fullClimbReferenceSpeed);

            // Higher climbing near the ceiling should visibly cost more effort even while the
            // actual upward speed cap is tapering off, so the wingbeat speeds up with altitude.
            chosenReference.speed *= THREE.MathUtils.lerp(
                1,
                CONFIG.thinAirClimbAnimationMultiplier,
                thinAirClimbRatio
            );

            this.logDebugChange(
                'thinAirClimb',
                `${thinAirClimbRatio.toFixed(2)}|${this.currentInput.y.toFixed(2)}|${CONFIG.thinAirClimbAnimationMultiplier.toFixed(2)}`,
                `[Player] Thin-air climb boost: ratio=${thinAirClimbRatio.toFixed(2)} multiplier=${CONFIG.thinAirClimbAnimationMultiplier.toFixed(2)} desiredSpeed=${chosenReference.speed.toFixed(2)}`
            );
        }

        // Keep flight wing speed at least as fast as the intended joystick-driven flight speed,
        // even while the body is still accelerating or braking toward that target.
        return chosenReference;
    }

    getAirborneAnimationInputMultiplier(inputX = this.currentInput.x, inputY = this.currentInput.y) {
        const flapResponse = CONFIG.AIRBORNE_FLAP_RESPONSE || {};
        const horizontalFactor = Number.isFinite(flapResponse.horizontalFactor)
            ? flapResponse.horizontalFactor
            : 1;
        const climbFactor = Number.isFinite(flapResponse.climbFactor)
            ? flapResponse.climbFactor
            : 1.2;
        const descendFactor = Number.isFinite(flapResponse.descendFactor)
            ? flapResponse.descendFactor
            : 0.65;

        const horizontalMagnitude = Math.abs(inputX);
        const climbMagnitude = Math.max(inputY, 0);
        const descendMagnitude = Math.max(-inputY, 0);
        const totalMagnitude = horizontalMagnitude + climbMagnitude + descendMagnitude;

        if (totalMagnitude <= 0.0001) {
            return Math.max(0, horizontalFactor);
        }

        // In air mode, the current stick direction chooses how hard the dyno appears to flap:
        // up can speed the loop up, while down can keep it calmer or even slower.
        const baseInputMultiplier = (
            (horizontalMagnitude * horizontalFactor) +
            (climbMagnitude * climbFactor) +
            (descendMagnitude * descendFactor)
        ) / totalMagnitude;
        if (!this.isGrabStruggleActive()) {
            return baseInputMultiplier;
        }

        const struggleIntent = Math.max(horizontalMagnitude, climbMagnitude);
        const struggleBoost = Number.isFinite(CONFIG.DYNO_CARRY?.struggleFlapInputBoost)
            ? CONFIG.DYNO_CARRY.struggleFlapInputBoost
            : 1.2;
        const weightedStruggleBoost = THREE.MathUtils.lerp(
            0,
            Math.max(0, struggleBoost),
            this.getCarryWeightRatio()
        );
        return baseInputMultiplier + (struggleIntent * weightedStruggleBoost);
    }

    getCycleSyncedTimeScale(state, absGroundSpeed, cycleDistance) {
        const action = this.animationActions[state];
        if (!action) {
            return 0;
        }

        const safeDistance = Math.max(cycleDistance, 0.001);
        const loopDuration = Math.max(action.getClip().duration, 0.001);
        const loopsPerSecond = absGroundSpeed / safeDistance;
        const rawTimeScale = loopsPerSecond * loopDuration;

        return THREE.MathUtils.clamp(
            rawTimeScale,
            0,
            DYNO_MODEL_SETTINGS.locomotionTimeScaleMax
        );
    }

    syncGroundCycleAnimationPhase(state, cycleDistance, direction = 1, traveledDistance = this.groundTravelDistance) {
        const action = this.animationActions[state];
        if (!action || cycleDistance <= 0.0001) {
            return;
        }

        const clipDuration = Math.max(action.getClip().duration, 0.0001);
        const normalizedCycleProgress = (Math.max(traveledDistance, 0) / cycleDistance) % 1;
        const directedProgress = direction < 0 && normalizedCycleProgress > 0
            ? 1 - normalizedCycleProgress
            : normalizedCycleProgress;

        // Keep the walk/run foot phase tied to actual traveled distance instead of frame time,
        // so the dyno pose stays consistent across devices while grounded.
        action.time = directedProgress * clipDuration;
    }

    getNormalizedAirborneTimeScale(airSpeed) {
        const referenceSpeed = Math.max(
            0.001,
            Math.max(CONFIG.flightMaxSpeed, CONFIG.flightMaxSpeedUp, CONFIG.flightMaxSpeedDown)
        );
        const normalizedSpeed = airSpeed / referenceSpeed;
        return THREE.MathUtils.clamp(normalizedSpeed * 2.2, 0.35, DYNO_MODEL_SETTINGS.locomotionTimeScaleMax);
    }

    getAirborneStateTimeScale(state, baseScale) {
        const flapSyncConfig = CONFIG.AIRBORNE_FLAP_SYNC || {};
        const referenceState = flapSyncConfig.referenceState || 'fly';
        const stateMultipliers = flapSyncConfig.stateMultipliers || {};
        const stateMultiplier = Number.isFinite(stateMultipliers[state]) ? stateMultipliers[state] : 1;
        const baseMaxTimeScale = Number.isFinite(flapSyncConfig.maxTimeScale)
            ? Math.max(flapSyncConfig.maxTimeScale, 0)
            : DYNO_MODEL_SETTINGS.locomotionTimeScaleMax;
        let maxTimeScale = baseMaxTimeScale;
        if (this.isGrabStruggleActive()) {
            const struggleMax = Number.isFinite(CONFIG.DYNO_CARRY?.struggleFlapMaxTimeScaleAtMaxLiftWeight)
                ? Math.max(CONFIG.DYNO_CARRY.struggleFlapMaxTimeScaleAtMaxLiftWeight, 0)
                : baseMaxTimeScale;
            maxTimeScale = THREE.MathUtils.lerp(baseMaxTimeScale, struggleMax, this.getCarryWeightRatio());
        }
        const referenceAction = this.animationActions[referenceState];
        const stateAction = this.animationActions[state];

        if (!referenceAction || !stateAction) {
            return THREE.MathUtils.clamp(baseScale * stateMultiplier, 0, maxTimeScale);
        }

        const referenceDuration = Math.max(referenceAction.getClip().duration, 0.0001);
        const stateDuration = Math.max(stateAction.getClip().duration, 0.0001);

        // Different airborne clips can have different authored lengths. Scale them against
        // one reference loop so hover and fly keep the same apparent wingbeat cadence. Then
        // cap the result so ceiling-climb boosts cannot make any airborne loop spin wildly.
        return THREE.MathUtils.clamp(
            baseScale * (referenceDuration / stateDuration) * stateMultiplier,
            0,
            maxTimeScale
        );
    }

    handleTurnRetarget(inputX) {
        const inputSign = this.getSignWithDeadZone(inputX, 0.05);
        const progressRatio = this.getTurnCompletionRatio();

        if (inputSign === 0) {
            const releaseFacing = progressRatio > 0.5 ? -this.turnStartFacing : this.turnStartFacing;
            this.retargetTurn(this.getTurnRotationForFacing(releaseFacing), 0);
            return;
        }

        this.retargetTurn(this.getTurnRotationForFacing(inputSign), Math.abs(inputX));
    }

    retargetTurn(targetRotation, inputStrength) {
        const nextTurnTargetFacing = Math.abs(targetRotation) > Math.PI * 0.5
            ? -this.turnStartFacing
            : this.turnStartFacing;
        const nextTurnDirection = this.getTurnAnimationState(nextTurnTargetFacing);
        const hasSameRotationTarget = Math.abs(targetRotation - this.turnRotationTarget) < 0.0001;

        if (
            hasSameRotationTarget &&
            this.turnTargetFacing === nextTurnTargetFacing &&
            this.turnDirection === nextTurnDirection
        ) {
            return;
        }

        this.turnRotationTarget = targetRotation;
        this.currentTurnSpeed = this.getTurnSpeed(inputStrength);
        this.turnTargetFacing = nextTurnTargetFacing;

        if (nextTurnDirection !== this.turnDirection) {
            this.turnDirection = nextTurnDirection;
            //console.info(
            //    `[Player] ${this.turnMode} turn retarget: direction=${this.turnDirection} targetFacing=${this.turnTargetFacing > 0 ? 'right' : 'left'} ` +
            //    `speed=${this.currentTurnSpeed.toFixed(2)} progress=${this.getTurnCompletionRatio().toFixed(2)}`
            //);
            this.playLoopAnimation(this.turnDirection);
        }

        this.syncTurnAnimationToRotation();
    }

    getTurnRotationForFacing(facing) {
        return this.turnStartFacing > 0
            ? (facing > 0 ? 0 : -Math.PI)
            : (facing > 0 ? Math.PI : 0);
    }

    getTurnCompletionRatio() {
        return THREE.MathUtils.clamp(Math.abs(this.currentTurnRotation) / Math.PI, 0, 1);
    }

    getTurnSpeed(inputStrength) {
        const minTurnSpeed = this.turnMode === 'air' ? CONFIG.minHoverTurnSpeed : CONFIG.minWalkTurnSpeed;
        const maxTurnSpeed = this.turnMode === 'air' ? this.getHoverTurnSpeed() : CONFIG.maxWalkTurnSpeed;

        return THREE.MathUtils.lerp(
            minTurnSpeed,
            maxTurnSpeed,
            THREE.MathUtils.clamp(Math.abs(inputStrength), 0, 1)
        );
    }

    getHoverTurnSpeed() {
        const hoverSpeed = Math.hypot(this.velocity.x, this.velocity.y);
        const speedFactor = THREE.MathUtils.clamp(
            hoverSpeed / Math.max(CONFIG.hoverSpeedThreshold, 0.001),
            0,
            1
        );

        return THREE.MathUtils.lerp(
            CONFIG.minHoverTurnSpeed,
            CONFIG.maxHoverTurnSpeed,
            speedFactor
        );
    }

    getTurnAnimationState(targetFacing) {
        if (this.turnMode === 'air') {
            return targetFacing < 0 ? 'airTurnLeft' : 'airTurnRight';
        }

        return targetFacing < 0 ? 'turnLeft' : 'turnRight';
    }

    getVisualTiltTarget() {
        if (this.isDeadState) {
            if (this.deathState === 'falling') {
                return this.deathFallingVisualAngle;
            }

            if (this.onGround) {
                return this.targetGroundTilt ?? 0;
            }
        }

        if (this.isFaintSequenceActive) {
            return this.faintVisualAngle;
        }

        if (this.isInWater) {
            if (!this.isDeepWaterSwim() && this.waterState !== 'swimDive') {
                return 0;
            }
            // Deep water and dive: pitch toward velocity/joystick direction
            const vx = this.velocity.x;
            const vy = this.velocity.y;
            const speed = Math.sqrt(vx * vx + vy * vy);
            const waterMaxSpeed = (CONFIG.DYNO_WATER?.waterMaxSpeed ?? 4) * this.getCurrentSpeedMultiplier();
            const desiredHorizontalSpeed = Math.abs(this.currentInput.x) * waterMaxSpeed;
            const desiredVerticalSpeed = this.currentInput.y * waterMaxSpeed;
            const velocityAngle = Math.atan2(vy, Math.max(Math.abs(vx), 0.001));
            const joystickAngle = Math.atan2(desiredVerticalSpeed, Math.max(desiredHorizontalSpeed, 0.001));
            const horizontalCatchUpRatio = desiredHorizontalSpeed > 0.001
                ? THREE.MathUtils.clamp(Math.abs(vx) / desiredHorizontalSpeed, 0, 1)
                : 1;
            const verticalCatchUpRatio = Math.abs(desiredVerticalSpeed) > 0.001
                ? THREE.MathUtils.clamp(Math.abs(vy) / Math.abs(desiredVerticalSpeed), 0, 1)
                : 1;
            const isNearVerticalIntent = Math.abs(this.currentInput.y) > 0.7 && Math.abs(this.currentInput.x) < 0.3;
            const isVerticalReversal = Math.abs(this.currentInput.y) > 0.2 && Math.abs(vy) > 0.2 && Math.sign(this.currentInput.y) !== Math.sign(vy);
            const angleDifference = Math.abs(Math.atan2(Math.sin(velocityAngle - joystickAngle), Math.cos(velocityAngle - joystickAngle)));
            const catchUpRatio = Math.min(horizontalCatchUpRatio, verticalCatchUpRatio);
            const shouldUseAssist = isNearVerticalIntent || isVerticalReversal || (desiredHorizontalSpeed > 0.01 && horizontalCatchUpRatio < 0.95);
            let assistBlend = shouldUseAssist ? THREE.MathUtils.smoothstep(catchUpRatio, 0.72, 0.95) : 1;
            if (isNearVerticalIntent || isVerticalReversal) assistBlend = Math.min(assistBlend, 0.12);
            if (angleDifference > THREE.MathUtils.degToRad(18)) assistBlend = Math.min(assistBlend, 0.12);
            const worldAngle = speed < 0.3 ? 0 : THREE.MathUtils.lerp(joystickAngle, velocityAngle, assistBlend);
            return THREE.MathUtils.clamp(
                worldAngle,
                -THREE.MathUtils.degToRad(CONFIG.maxFlightAngleDown),
                THREE.MathUtils.degToRad(CONFIG.maxFlightAngleUp)
            );
        }

        if (this.onGround) {
            return this.targetGroundTilt ?? 0;
        }

        if (this.airMode === 'hover') {
            this.logDebugChange('flightPitch', 'hover', '[Player] Pitch angle: hovering near neutral');
            return 0;
        }

        const desiredHorizontalSpeed = Math.abs(this.currentInput.x) * this.getHorizontalFlightMaxSpeed();
        const desiredVerticalSpeed = this.currentInput.y * this.getVerticalFlightMaxSpeed(this.currentInput.y);
        const velocityAngle = Math.atan2(this.velocity.y, Math.max(Math.abs(this.velocity.x), 0.001));
        const joystickAngle = Math.atan2(desiredVerticalSpeed, Math.max(desiredHorizontalSpeed, 0.001));
        const horizontalCatchUpRatio = desiredHorizontalSpeed > 0.001
            ? THREE.MathUtils.clamp(Math.abs(this.velocity.x) / desiredHorizontalSpeed, 0, 1)
            : 1;
        const verticalCatchUpRatio = Math.abs(desiredVerticalSpeed) > 0.001
            ? THREE.MathUtils.clamp(Math.abs(this.velocity.y) / Math.abs(desiredVerticalSpeed), 0, 1)
            : 1;
        const isNearVerticalIntent = Math.abs(this.currentInput.y) > 0.7 && Math.abs(this.currentInput.x) < 0.3;
        const isVerticalReversal =
            Math.abs(this.currentInput.y) > 0.2 &&
            Math.abs(this.velocity.y) > 0.2 &&
            Math.sign(this.currentInput.y) !== Math.sign(this.velocity.y);
        const angleDifference = Math.abs(Math.atan2(
            Math.sin(velocityAngle - joystickAngle),
            Math.cos(velocityAngle - joystickAngle)
        ));
        const catchUpRatio = Math.min(horizontalCatchUpRatio, verticalCatchUpRatio);
        const shouldUseJoystickPitchAssist = this.isFlightTurning ||
            isNearVerticalIntent ||
            isVerticalReversal ||
            (desiredHorizontalSpeed > 0.01 && horizontalCatchUpRatio < 0.95);
        let assistBlend = shouldUseJoystickPitchAssist
            ? THREE.MathUtils.smoothstep(catchUpRatio, 0.72, 0.95)
            : 1;

        if (isNearVerticalIntent || isVerticalReversal) {
            // For steep up/down redirects, trust the intended joystick angle much more strongly
            // than the still-catching-up vertical velocity to avoid a visible pitch glitch.
            assistBlend = Math.min(assistBlend, 0.12);
        }

        if (angleDifference > THREE.MathUtils.degToRad(18)) {
            // After a diagonal flight turn, the velocity vector can briefly be much steeper than
            // the intended joystick angle. Keep trusting the intended angle until those two are
            // close enough again, otherwise the dyno appears to "jump" in pitch.
            assistBlend = Math.min(assistBlend, 0.12);
        }

        const worldFlightAngle = THREE.MathUtils.lerp(joystickAngle, velocityAngle, assistBlend);
        const clampedWorldFlightAngle = THREE.MathUtils.clamp(
            worldFlightAngle,
            -THREE.MathUtils.degToRad(CONFIG.maxFlightAngleDown),
            THREE.MathUtils.degToRad(CONFIG.maxFlightAngleUp)
        );
        // Flight side-switching is already handled by the dedicated Y-axis pivot, so the
        // up/down pitch should stay in world space and must not be mirrored a second time.
        const visualPitch = clampedWorldFlightAngle;

        if (this.doDebug !== false) {
            this.logDebugChange(
                'flightPitch',
                `${clampedWorldFlightAngle.toFixed(2)}|${joystickAngle.toFixed(2)}|${velocityAngle.toFixed(2)}|${catchUpRatio.toFixed(2)}|${assistBlend.toFixed(2)}|${isNearVerticalIntent}|${isVerticalReversal}|${angleDifference.toFixed(2)}`,
                `[Player] Target flight angle: ${THREE.MathUtils.radToDeg(clampedWorldFlightAngle).toFixed(1)}deg joystick=${THREE.MathUtils.radToDeg(joystickAngle).toFixed(1)}deg velocity=${THREE.MathUtils.radToDeg(velocityAngle).toFixed(1)}deg catchUp=${catchUpRatio.toFixed(2)} blend=${assistBlend.toFixed(2)} nearVertical=${isNearVerticalIntent} verticalReverse=${isVerticalReversal} angleDiff=${THREE.MathUtils.radToDeg(angleDifference).toFixed(1)}deg`
            );
        }

        return visualPitch;
    }

    getCurrentFlightAngleDeg() {
        return THREE.MathUtils.radToDeg(this.currentGroundTilt);
    }

    syncTurnAnimationToRotation() {
        if (!this.turnDirection) {
            return;
        }

        const action = this.animationActions[this.turnDirection];
        if (!action) {
            return;
        }

        action.time = this.getTurnCompletionRatio() * action.getClip().duration;
    }
}
