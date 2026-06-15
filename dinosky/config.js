// Matter collision category bitmasks for use in levelObject config `collideWithMask`.
// Combine with bitwise OR, e.g.: MATTER_MASK_LEVEL_OBJECTS | MATTER_MASK_PLATFORMS
// Reserved bits: 0x0001 terrain, 0x0002 generic level objects, 0x0004 platforms.
// Add named object categories from 0x0008 upward — each needs a unique power of 2.
export const MATTER_MASK_TERRAIN = 0x0001;
export const MATTER_MASK_LEVEL_OBJECTS = 0x0002;
export const MATTER_MASK_PLATFORMS = 0x0004;
export const MATTER_MASK_BLOCK = 0x0008;

export const CONFIG = {
    showFpsCounter: false,
    DO_ADS: true,
    // When false, ads are suppressed on localhost/127.0.0.1 even if DO_ADS is true.
    DO_ADS_LOCALHOST: false,
    // When true, mission progress (completed ids, replay cooldowns) is never read from
    // or written to localStorage — every session starts fresh.
    MISSION_DISABLE_PERSISTENCE: false,
    minimapShowPlanes: true,
    minimapShowZeppelins: true,
    minimapShowSharks: false,
    minimapShowMissionTarget: true,
    disablePhysics: false,
    disableLevelObjectUpdate: false,
    disableLevelObjectRendering: false,
    disableParalax: false,
    debugFlatFloorPolygon: false,
    disableUI: false,
    // When true, the GO button on the loading screen is skipped and the game starts
    // automatically when loading completes. The Poki gameplayStart SDK call is held
    // until the player has interacted (pointer down or key down) for the first time.
    autoStartOnLoad: false,
    disableDinoRendering: false,
    // Cap the WebGL pixel ratio. 1 = native CSS pixels (fastest), 2 = retina quality.
    // On weak mobile GPUs, setting this to 1 can double the framerate.
    maxPixelRatio: 2,
    spawnPosition: {
        x: 1030,
        y: 380,
        z: 26
    },
    BURNABLE_SCENERY: {
        layerName: 'BurnableObjects',
        bucketSize: 8,
        visibilityMargin: 14,
        visibilityCheckIntervalFrames: 6,
        maxParticles: 360,
        maxBurnFronts: 3,
        // Fire particles use this sprite; smoke/water keep a tiny generated soft
        // particle texture so they stay lightweight and do not render as squares.
        particleTextureUrl: './gfx/fire.webp',
        fireParticleRate: 72,
        smokeParticleRate: 18,
        waterParticleRate: 18,
        maxFlamePointChecks: 38,
        consumeFireballOnHit: true,
        debug: false,
        burnEffects: {
            // Custom trigger effects are data-only. A Tiled object picks one with
            // triggerEffect=effectName; the lightweight object then keeps the same state
            // machine but swaps particles, duration, sound, or final sprite behavior.
            defaultFire: {
                particles: 'fire',
                smoke: true,
                endState: 'burned'
            },
            waterBurst: {
                particles: 'water_burst',
                sfx: 'water_spray',
                duration: 5,
                replaceSprite: 'water_socket_broken.webp',
                endState: 'burned'
            }
        }
    },

    CAMERA_PREVIEW: {
        panSeconds: 0.6,
        holdSeconds: 0.2,
        defaultSpeed: 80,
        zoomEaseSeconds: 4
    },

    // Seconds between automatic interstitial ads shown while no missions are active.
    idleCommercialBreakInterval: 350,
    // Seconds between interstitial ads shown while a mission is actively running.
    activeMissionCommercialBreakInterval: 390,
    // Initial upward impulse used when the dino leaves the ground.
        // Initial upward impulse used when the dino leaves the ground.
    JUMP_FORCE: 20,
    // Additional lift used during the takeoff launch.
    FLIGHT_FORCE: 30,

    // Minimum upward joystick angle relative to horizontal needed to take off.
    takeoffAngleDeg: 20,
    // Minimum positive vertical joystick input needed before takeoff is allowed.
    takeoffMinUpInput: 0.05,
    // Fixed extra world-space Y offset for the dino visual while grounded.
    dinoGroundOffsetY: 0.4,

    DINO_MODEL: {
        // Dino GLB node names to hide when the player model loads. Timeline ActorTrack
        // keyframes can later show/hide these with `nodeVisibility`, `showNodes`, or `hideNodes`.
        hiddenNodesOnLoad: ['girl']
    },

    // Maximum horizontal running speed while grounded.
    maxWalkSpeed: 22,
    // Maximum grounded speed increase per second while accelerating.
    walkSpeedIncrease: 18,
    // Maximum grounded speed decrease per second while slowing down or braking.
    walkSlowdownSpeedDecrease: 60,
    // Speed threshold where grounded locomotion switches from walk to run.
    startRunSpeed: 9,
    // World distance that should correspond to one full walk animation cycle.
    walkCycleDistance: 3.5,
    // World distance that should correspond to one full run animation cycle.
    runCycleDistance: 13,
    // Minimum turn rotation speed while grounded.
    minWalkTurnSpeed: 4,
    // Maximum turn rotation speed while grounded.
    maxWalkTurnSpeed: 10,

    // Acceleration used while steering in hover mode.
    hoverAcceleration: 18,
    // Deceleration used while slowing down in hover mode.
    hoverDeceleration: 35,
    // Air speed below this value uses hover mode; at or above it the dino switches to flying mode.
    hoverSpeedThreshold: 9,
    // While hovering within this world-space distance from the resolved surface below, keep the
        // dino in hover so near-ground control stays stable and does not jump into full flight.
    nearGroundHoverLockDistance: 10,
    // Minimum turn speed used by upright hover turns at low hover speed.
    minHoverTurnSpeed: 12,
    // Maximum turn speed used by upright hover turns at higher hover speed.
    maxHoverTurnSpeed: 18,

    // Maximum horizontal speed used while flying in the X direction.
    flightMaxSpeed: 28,
    // Maximum upward speed used while flying in the positive Y direction.
    flightMaxSpeedUp: 24,
    flightMaxSpeedDown: 45,
    // Fraction of the authored level height up to which full upward flight speed is allowed.
    // Example: 0.8 means 80% of the Tiled map height.
    flightMaxSpeedUpFullHeight: 0.8,
    // Extra animation-speed multiplier reached at the ceiling while still trying to climb.
    thinAirClimbAnimationMultiplier: 5,
    // Maximum downward speed used while flying in the negative Y direction.
    // Minimum downward Y speed needed before the dino switches to the dive animation.
    flightDiveSpeedThreshold: 38,
    // Acceleration used while steering vertically in flying mode.
    flightAcceleration: 20,
    // Deceleration used while slowing down vertically in flying mode.
    flightDeceleration: 28,
    // Deceleration applied to total speed while in the dive animation (slower than flightDeceleration).
    flightDiveDeceleration: 6,
    // Smoothing speed for visually rotating toward the current flight angle.
    flightRotationSpeed: 8,
    // Smoothing speed for visually rotating toward a new ground/slope angle.
    groundRotationSpeed: 8,
    // Fixed duration for the left/right flight turnaround visual rotation.
    flightTurnDuration: 0.2,
    // How quickly horizontal speed is reduced while the dino is turning around in flight.
    flightTurnSpeedDecrease: 50,
    // How quickly horizontal speed builds back up after a flight turnaround has completed.
    flightTurnSpeedIncrease: 50,

    DINO_MOVEMENT: {
        // Runtime movement is split into small pieces so a fast frame cannot skip across a
        // blocking tile. Keep this at or below half a gameplay tile for reliable collision.
        maxStepSize: null,
        maxStepSizeTileRatio: 0.4,
        // Safety cap for unusually large frame deltas. main.js already clamps dt, so normal
        // gameplay should stay below this while still avoiding tunneling.
        maxMovementSteps: 10
    },

    // Maximum upward visual flight angle in degrees.
    maxFlightAngleUp: 80,
    // Maximum downward visual flight angle in degrees.
    maxFlightAngleDown: 87,
    // Minimum upward angle range for using flying_up-loop.
    flyingUpAngleMin: 15,
    // Minimum downward angle range for also using flying_up-loop while descending steeply.
    flyingDownAngleMin: 60,
    // Degrees from straight up within which glide is suppressed (uses flyUp instead).
    glideUpAngleExclusionDeg: 15,
    // Minimum upward angle range for using hover_up-loop while hovering.
    hoverUpAngleMin: 45,
    // Minimum downward angle range for using hover_down-loop while hovering.
    hoverDownAngleMin: 45,
    // How quickly hover blend weights move toward up/down targets.
    hoverBlendSpeed: 6,
    AIRBORNE_FLAP_SYNC: {
        // Keep all airborne wingbeat loops aligned to the same base flap cadence.
        referenceState: 'fly',
        // Hard cap for every airborne wingbeat loop so ceiling-climb boosts cannot make the
        // hover/fly/flap animations spin out of control.
        maxTimeScale: 4.8,
        stateMultipliers: {
            hover: 3,
            hoverUp: 3,
            hoverDown: 3,
            fly: 1,
            flyUp: 1,
            flyGlide: 1,
            flyDive: 1
        }
    },
    AIRBORNE_FLAP_RESPONSE: {
        // Horizontal flight still contributes fully to flap cadence.
        horizontalFactor: 1,
        // Climbing should feel more effortful, so upward movement can speed the wingbeat up more.
        climbFactor: 1.6,
        // Descending should not make the wings look like they are working harder than climbing.
        descendFactor: 0.7
    },

    // Total visible camera height in world units, independent of screen resolution.
    VIEW_HEIGHT: 35,
    CAMERA_ASPECT: {
        // The camera scale is interpolated between these aspect ratios.
        minAspect: .5,
        maxAspect: 3,
        // At maxAspect the base VIEW_HEIGHT scale is used as-is.
        maxAspectScale: 1.6,
        // Lower values zoom out more. Example: 0.5 means 2x more world is visible.
        minAspectScale: 0.5
    },
    CAMERA_DYNAMIC: {
        // Zoom factor at low speed (1 = base view height).
        minZoom: 1,
        // Zoom factor at high speed; larger means more zoomed out.
        maxZoom: 1.6,
        // Speed where zoom/look-ahead reaches max effect.
        maxSpeedForCamera: 28,
        // Max look-ahead distance at full speed.
        maxLookAheadX: 10,
        maxLookAheadY: 10,
        // 1 = linear response, higher = softer ease-in/ease-out.
        responseEasingPower: 1.4,
        // Max change rates per second toward target look-ahead/direction.
        lookAheadMaxSpeedX: 4,
        lookAheadMaxSpeedY: 4,
        directionMaxSpeed: 28,
        // Camera center follow damping (0..1). Higher = snappier.
        followLerp: 0.5
    },
    // Extra world-space headroom kept between the top of the sky gradient and the dino's
    // actual flight ceiling. Camera can still move to the full sky height.
    flightCeilingOffset: 30,
    LEVEL_HEIGHT: 600,
    // World-space size of one gameplay grid cell. Tiled tilewidth/tileheight can be larger
    // for authoring convenience without changing the in-game scale.

    LEVEL_WORLD_TILE_WIDTH: 2,
    LEVEL_WORLD_TILE_HEIGHT: 2,
    // Authored Tiled map used for world layout, local collision, and breakables.
    LEVEL_MAP_URL: './gfx/levels/level1.json',
    // Derived at runtime from the loaded Tiled map height (height * tileheight).
    LEVEL_FLIGHT_HEIGHT: 0,

    DINO_CARRY: {
        maxLiftWeight: 250,
        // Objects at or below this weight allow full flight (hover/fly/glide/dive) while carried.
        // Above this threshold the dino is locked to hover mode.
        freeFlyCarryWeightThreshold: 2,
        // Max flight speed when carried weight reaches maxLiftWeight.
        // Weight 0 uses normal flightssssssss speed; values in between are interpolated.
        flightMaxSpeedAtMaxLiftWeight: 6,
        // Optional flap timescale cap while struggling with heavy loads.
        // Interpolates from AIRBORNE_FLAP_SYNC.maxTimeScale at weight 0
        // to this value at maxLiftWeight (clamped above).
        struggleFlapMaxTimeScaleAtMaxLiftWeight: 3,
        // Heavier cargo makes airborne flap loops play faster without redesigning movement.
        flapSpeedWeightFactor: 2,
        // Extra flap speed while struggling with an object that is too heavy to lift.
        struggleFlapInputBoost: 3,
        carryHoverSpeedMultiplier: 1.2,
        // Auto-pickup moves the dino so grab reaches the object's root before attaching.
        pickupAlignSpeed: 18,
        pickupAlignTolerance: 0.25,
        pickupMaxDuration: 1,
        allowFlyWhileCarrying: false,
        allowDiveWhileCarrying: false,
        allowGlideWhileCarrying: false
    },
    DINO_DRAG: {
        // How much slower pushing is compared to pulling. 1.8 = push is 1.8× slower.
        pushSpeedDivisor: 1.8,
        // If the drag joint stretches beyond this world-unit length the object is released.
        maxJointLength: 8,
        maxDragWeight: 300,
        // Drag animation speed multiplier reached at maxDragWeight.
        // Lower values make heavy dragging look more like sliding.
        dragAnimationSpeedMultiplierAtMaxWeight: 2.5,
        // Weight where drag animation slowdown begins. At or below this value, multiplier is 1.
        dragAnimationInterpolationStartWeight: 200,
        alignSpeed: 14,
        alignTolerance: 0.35,
        alignMaxDuration: 1,
        // Maximum vertical distance (world units) between the dino's mouth and a grab point
        // at the moment of attachment. Grab points higher than this are unreachable (e.g. an
        // upside-down tank). Defaults to one tile height if not set.
        maxGrabHeightOffset: 1.5,
        // After the dino's mouth passes the reachable grab point, keep the button enabled
        // for this many world units. Pressing grab in that zone makes auto-drag walk back to
        // the same near-side anchor instead of switching to the far side of the object.
        grabOvershootDistance: 5,
        minMovementMultiplier: 0.04,
        backwardSpeedMultiplier: 0.8,
        backwardMaxWalkSpeed: 7.5,
        linearDamping: 0.985,
        angularDamping: 0.94,
        matterConstraintStiffness: 0.55,
        matterConstraintDamping: 0.28,
        matterConstraintLength: 0,
        matterGroundDragConstraintStiffness: 0.03,
        matterGroundDragConstraintDamping: 0.36,
        matterGroundDragRopeLength: 0,
        matterDragAnchorTerrainStretchMargin: 1,
        // Extra rotational friction while Matter is dragging an object by the mouth rope.
        // Lower values resist spin more strongly; 1 means no extra angular damping.
        matterDragAngularDamping: 0.82,
        // Extra rotational friction while Matter is carrying (lifting) an object.
        matterCarryAngularDamping: 0.9,
        // Rotational spring strength pulling carried object toward its rest angle (0 = off).
        matterCarryAngleSpringStrength: 0.02,
        // Damping on the rotational spring (reduces oscillation).
        matterCarryAngleSpringDamping: 0.6,
        // Target angle (degrees) for the carry rotational spring. 0 = flat/horizontal.
        matterCarryAngleSpringTargetDeg: 0,
        // Rotational spring strength for mouth-dragged objects (0 = off).
        matterDragAngleSpringStrength: 1.1,
        // Damping on the mouth-drag rotational spring.
        matterDragAngleSpringDamping: 0.3,
        // Target angle (degrees) for the mouth-drag rotational spring.
        matterDragAngleSpringTargetDeg: 45,
        // Constraint stiffness for carry (1 = rigid, no bounce).
        matterCarryConstraintStiffness: 0.1,
        // Constraint damping for carry.
        matterCarryConstraintDamping: 0.5,
        keepFreeCornerGrounded: true,
        freeCornerGroundSlop: 0.03,
        draggedBehindDinoZOffset: 2.3,
        draggedInFrontOfObjectsZOffset: 0,
        // Hold up for this many seconds while ground-dragging (non-mouth) to release the
        // object and take off. Input must stay within dragTakeoffUpAngleHalf degrees of
        // straight up throughout the hold.
        dragTakeoffHoldSeconds: 0.6,
        // Half-angle (degrees) of the upward cone that counts as "pressing up" for the
        // drag-release-and-takeoff gesture. 10° means 80°–90° from horizontal on each side.
        dragTakeoffUpAngleHalf: 10
    },
    // Dino fire combat settings removed for Dino Sky
    DINO_FIRE_COMBAT: {},
    PERFORMANCE: {
        enabled: true,
        slowDeviceDetection: {
            enabled: true,
            // Browser hints only provide an initial guess. Runtime frame-time sampling is the
            // authoritative signal so gameplay can still opt back in on stronger devices.
            useHardwareHintAsInitialSlow: true,
            lowDeviceMemoryGB: 4,
            lowHardwareConcurrency: 4,
            minSampleCount: 60,
            maxSamples: 180,
            slowAvgFrameMs: 22,
            slowLongFrameMs: 28,
            slowLongFrameRatio: 0.25,
            fastAvgFrameMs: 18,
            fastLongFrameMs: 24,
            fastLongFrameRatio: 0.12,
            logTransitions: true
        },
        qualityProfiles: {
            high: {
                renderer: {
                    // Leave undefined to fall back to the global CONFIG.maxPixelRatio and
                    // default antialias behavior.
                    maxPixelRatio: undefined,
                    antialias: true
                },
                burnableScenery: {
                    particleRateMultiplier: 1,
                    smokeRateMultiplier: 1,
                    maxActiveParticlesScale: 1,
                    glowEnabled: true
                },
                background: {
                    parallaxEnabled: true
                }
            },
            low: {
                renderer: {
                    // Big mobile FPS win: render closer to CSS pixel resolution.
                    maxPixelRatio: 2,
                    // WebGL antialias is chosen when the renderer is created.
                    antialias: false
                },
                burnableScenery: {
                    particleRateMultiplier: 0.5,
                    smokeRateMultiplier: 0.45,
                    maxActiveParticlesScale: 0.4,
                    glowEnabled: false
                },
                background: {
                    parallaxEnabled: true
                }
            }
        }
    },
    // "Dino Fury" ultimate — an Inferno Shockwave. Charge builds passively and from speed boost
    // usage; once full, KeyR (or the Fury button) unleashes a radial
    // blast that damages every enemy, knocks back physics props, and shatters breakable terrain.
    FURY: {
        enabled: false,
        // 0..1 charge. Seconds of continuous flame needed to fill from empty:
        chargePerFlameSecond: 0.05,
        // Charge gain per second while the speed meter is actively draining.
        chargePerSpeedSecond: 0.05,
        // Slow passive fill so the ability is reachable even without much combat.
        chargePerSecondPassive: 0.0,
        rageBar: {
            // Clip away the left side so fiery fill art never shows beneath the overlapping icon.
            progressStartOffset: 160,
            // Keep the fill out of the decorative right-side end cap.
            progressEndOffset: 42,
            landscapeScale: 1.4,
            portraitScale: 1,
            portraitAnchorWidthScale: 1.18,
            landscapeWidthFactor: 0.44,
            landscapeHeightFactor: 0.14,
            landscapeMaxWidth: 540,
            landscapeMaxHeight: 104,
            landscapeBottomMargin: 22,
            portraitPadding: 0,
            iconHeightFactor: 0.86,
            glowPulseDurationSeconds: 0.15,
            chargeGlowAlpha: 0.95,
            fullPulseCyclesPerSecond: 1.15,
            fullGlowBaseAlpha: 0,
            fullGlowPulseAlpha: 0.82,
            debug: false
        },
        // World-radius of the blast and how its damagemaxPixelRatio  falls off toward the edge.
        blastRadius: 40,
        // Damage applied at the origin; scales down to falloffMinFactor at the rim.
        blastDamage: 800,
        falloffMinFactor: 0.6,
        // Outward velocity (world units/sec) imparted to physics props at the origin.
        knockbackSpeed: 100,
        knockbackUpBias: 0.45,
        // Cinematic slow-motion envelope (wall-clock seconds).
        slowMoScale: 0.32,
        slowMoHoldSeconds: 0.45,
        slowMoRampSeconds: 0.55,
        // Screen shake.
        shakeMagnitude: 1.6,
        shakeDurationSeconds: 0.6,
        // Visual shockwave expansion time (wall-clock seconds).
        waveDurationSeconds: 1,
        // Pre-blast buildup: camera zooms out over buildupSeconds, then the blast fires.
        // Set to 0 to skip the buildup and blast immediately.
        buildupSeconds: 0.6,
        // Camera zoom-out. Values > 1 zoom out (e.g. 1.5 = 50% more world visible).
        // zoomOutSeconds: how many seconds to reach the full zoom-out factor.
        // zoomOutDurationSeconds: how long before it eases back to normal zoom after the blast.
        zoomOutFactor: 1.5,
        zoomOutSeconds: 0.4,
        zoomOutDurationSeconds: 1,
        // Sounds to play on detonation (fall back silently if missing).
        roarSound: 'roar',
        blastSound: 'explosion'
    },
    REWARDED_SPEED_BOOST: {
        // Seconds of unlimited speed boost after watching a rewarded video.
        durationSeconds: 120,
        // Number of times the energy meter must be fully drained before the button appears.
        unlockDrainCount: 1
    },

    // Coins awarded when the player completes a rewarded video in the skin shop.
    rewardedAdCoins: 50,

    // Dino skin definitions — add new skins here, nowhere else.
    // nameKey: i18n key; texture: gameplay dino texture;
    // buttonTexture: image shown on the thumbnail button (falls back to texture if omitted);
    // price: coin cost; unlockedByDefault: owned from first session.
    dinoSkins: [
        {
            id: 'classic',
            nameKey: 'skins.classic',
            texture: './gfx/textures/dino/dino_texture.webp',
            buttonTexture: './gfx/UI/dino_texture.webp',
            price: 0,
            unlockedByDefault: true
        },
        {
            id: 'earth',
            nameKey: 'skins.earth',
            texture: './gfx/textures/dino/dino_texture1.webp',
            buttonTexture: './gfx/UI/dino_texture1.webp',
            price: 0,
            unlockByAd: true
        },
        {
            id: 'ice',
            nameKey: 'skins.ice',
            texture: './gfx/textures/dino/dino_texture2.webp',
            buttonTexture: './gfx/UI/dino_texture2.webp',
            price: 100
        }
    ],
    DINO_ENERGY_BOOST: {
        // Energy resource values for hold-to-boost movement (ground + air).
        maxEnergyValue: 200,
        energyDrainValue: 10,
        energyFillSpeed: 0,
        energySpeedMultiplier: 2,
        // Seconds the energy meter stays empty before it begins refilling.
        energyEmptyDuration: 3
    },
    DINO_HEALTH: {
        // Dino health resource. 0 means dead / game-over-ready.
        maxHealthValue: 250,
        // Automatic health regeneration per second. Keep 0 to disable.
        healthFillSpeed: 0,
        // Missiles are single-impact projectiles. This tiny gate prevents one visual impact
        // from applying stacked damage if several overlap the dino in the same instant.
        missileDamageCooldownSeconds: 0.35
    },
    DINO_DEATH: {
        // Time to rotate from the current tilt into the dead-fall pose while airborne.
        deathFallRotateDuration: 0.5,
        // Visual pitch during airborne death (nose-down by default).
        deathFallTargetAngle: -Math.PI / 2,
        // Downward acceleration used during airborne death fall.
        deathFallAcceleration: 20,
        // Maximum downward speed during airborne death fall.
        deathMaxFallSpeed: 18
    },
    DINO_HIT_PUSH: {
        // Projectile damage maps to a small translation nudge. This keeps light bullets readable
        // without letting heavy hits shove the dino through collision.
        minHitPushDistance: 0.2,
        maxHitPushDistance: 1.2,
        referenceDamage: 50,
        hitPushStepCount: 6
    },
    DINO_HIT_IMPACT: {
        dinoHitImpactScale: 2.5,
        dinoHitImpactDuration: 0.3,
        dinoHitImpactParticleCount: 14,
        // Used only when the projectile does not provide an exact world hit position.
        dinoHitImpactFallbackOffset: 0.9
    },
    DINO_HIT_FLASH: {
        hitFlashColor: 0xffffff,
        // MeshBasicMaterial has no emissive channel and the dino base color is white, so a
        // warm tint gives textured/unlit materials a visible flash instead of white-on-white.
        hitFlashTintColor: 0xff4a2a,
        hitFlashIntensity: 3,
        hitFlashDuration: 0.3
    },
    DINO_CEILING_FAINT: {
        // Leave null to use the level's actual flight ceiling. Set a number to override with
        // an absolute world-space Y threshold.
        ceilingFaintYThreshold: null,
        faintAnimationDuration: 5.0,
        faintRotateStartTime: 0.3,
        faintRotateDuration: 0.8,
        faintTargetAngle: -Math.PI / 2,
        faintFallAcceleration: 20,
        faintMaxFallSpeed: 50,
        // Minimum downward speed enforced when flying_up_sleep ends. null means use the
        // normal dive animation threshold so the next airborne state can continue as flyDive.
        faintWakeDiveSpeed: null,
        faintDownwardAngleTolerance: 0.35,
        faintCrashExplosionRadius: 50,
        faintCrashExplosionDamage: 600,
        // Inferno shockwave (same visual as FURY but with its own tuning).
        faintCrashWaveDurationSeconds: 1.1,
        faintCrashSlowMoScale: 0.28,
        faintCrashSlowMoHoldSeconds: 0.3,
        faintCrashSlowMoRampSeconds: 0.7,
        faintCrashShakeMagnitude: 2.0,
        faintCrashShakeDurationSeconds: 0.8,
        faintCrashZoomOutFactor: 1.6,
        faintCrashZoomOutDurationSeconds: 2.0
    },
    DINO_WATER: {
        enabled: true,
        // Speed at which the swimDive state transitions to normal swim.
        swimDiveToNormalSpeed: 14,
        // Maximum swim speed (horizontal and vertical) under player control.
        waterMaxSpeed: 14,
        // Horizontal/vertical acceleration while swimming.
        waterAcceleration: 8,
        // Velocity multiplier applied each frame to simulate water drag (0–1, per second exponent).
        waterDrag: 0.85,
        // Gentler drag applied during swimDive so entry speed bleeds off gradually.
        waterDiveDrag: 0.85,
        // How fast (radians/sec, scaled by input magnitude) the dive velocity rotates toward the joystick direction.
        // Higher = more direct steering; the dino redirects its momentum faster.
        waterDiveSteerSpeed: 6,
        // Extra drag applied when input points more than 90° from current travel direction (going backwards).
        // Blends from waterDiveDrag at 90° to this value at 180°. Lower = harder brake when reversing.
        waterDiveReverseDrag: 0.6,
        // How much faster the surface dino brakes compared to its acceleration rate when pressing the opposite direction.
        waterSurfaceBrakeMultiplier: 2,
        // Distance below the dino centre to snap to the water surface when idling at the top.
        surfaceSnapDistance: 0.5,
        // How far below to probe for ground when checking whether to land after exiting water.
        exitToGroundCheckDistance: 2.0,
        // How far below the water surface (world units) before the dino tilts toward its
        // movement direction instead of staying horizontal. Default = 2 tiles × 2 units = 4.
        deepTiltDistance: 1,
        // Smoothing speed for visually rotating the tilt angle while swimming deep (lower = slower than flight).
        swimTiltRotationSpeed: 4,
        // Base animation playback speed for swim_idle / swim_idle_up when the dino is stationary.
        // Scales up linearly with speed, reaching swimIdleBaseSpeed + 1 at waterMaxSpeed.
        swimIdleBaseSpeed: 0.6
    },
    LEVEL_OBJECTS: {
        spawnLayerName: 'LevelObjects',
        debugRenderLevelCollisionContours: false,
        debugRenderWaterPolygons: false,
        debugRenderLoadPlacement: false,
        debugRenderMatterPhysics: false,
        debugRenderMissionZones: false,
        debugMatterDropDiagnostics: false,
        debugRenderCollisionShell: false,
        debugLogCarryFlightCollision: false,
        debugUseFixedFlightCollisionPolygon: false,
        debugFixedFlightCollisionPolygonLocalPoints: [
            [0.0, 1.0],
            [2, 0.35],
            [2, -2],
            [-2, -1.5],
            [-2.5, -0.9]
        ],
        // Global floor cull for tank bullets. Bullets below this world Y are removed.
        // Initial value uses tank2 spawn Y from level1 as requested.
        bulletMinY: 19,
        hoverPickupRadius: 18,
        groundPickupDistance: 12,
        gravity: 52,
        // Matter.js is used only for runtime LevelObject physics. Dino movement/collision
        // stays on the custom controller so the player feel does not change.
        // Matter uses the same world units as the rest of the game, so gravity and velocity
        // need to be tuned for this game's scale instead of relying on Matter defaults.
        collideLevelObjects: false,
        matterGravityY: 0.35,
        matterGravityScale: 0.001,
        matterFixedHz: 60,
        // Default frictionAir applied to Matter bodies while inside a water polygon.
        // Overridable per-object via matter.waterFrictionAir in the object config.
        waterFrictionAir: 0.6,
        // Matter terrain is built from optimized collision polygons. "filled" triangulates
        // polygons into static convex chunks; "edges" keeps the older thin edge strips.
        matterTerrainMode: 'filled',
        // This is a terminal-speed style clamp in world units/second. Keep it high enough
        // that gravity can visibly accelerate objects before the cap takes over.
        matterMaxFallSpeed: 200,
        matterMaxDropVelocity: 18,
        terrainColliderThickness: 0.8,
        terrainColliderEndpointOverlap: 0.2,
        matterPositionIterations: 8,
        matterVelocityIterations: 6,
        matterConstraintIterations: 4,
        levelObjectDropEscapeMaxIterations: 12,
        levelObjectDropEscapePadding: 0.02,
        levelObjectDropEscapeStep: 0.1,
        levelObjectSleepThreshold: 60,
        levelObjectVelocitySleepThreshold: 0.05,
        levelObjectAngularSleepThreshold: 0.02,
        levelObjectAngularDampingOnContact: 0.98,
        maxReleaseAngularVelocity: 0.5,
        explosionTextureUrl: './gfx/fire.webp',
        impactDamageMultiplier: 0.18,
        impactWeightMultiplier: 0.012,
        // Hard drop-height gate for fall damage. Below this height objects take no impact
        // damage; above it, the normal fall-damage formula is used unchanged.
        minimumHeightDamage: 5,
        minDamagingFallDistance: 1.5
    },
    LEVEL_OBJECT_TYPES: {
        girl: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/girl/girl.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            maxHealth: 100000,
            minimumHeightDamage: 50000,
            showHealthBar: false,
            indestructible: true,
            layerZOffset: 24,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            collisionRect: {
                width: 1,
                height: 2.6,
                offset: [0, 1.4]
            }
        },
        couch: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/couch.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            maxHealth: 1000000,
            showHealthBar: false,
            indestructible: true,
            layerZOffset: 12,
            weight: 50,
            collideWithPlatforms: true,
            minimumHeightDamage: 50000,
            groundImpactSound: 'sfx/thud_medium.ogg',
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            collisionRect: {
                width: 5.5,
                height: 1.7,
                offset: [0, 1.1]
            },
            matter: {
                // Couch — upholstered wood frame, moderate density, low bounce.
                density: 0.015,
                restitution: 0.05,
                friction: 0.6,
                frictionStatic: 0.75,
                frictionAir: 0.25,
            }
        },
        statue: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/statue.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            mouthDrag: false,
            respawn: true,
            collideWithPlatforms: true,
            respawnDelay: 20,
            layerZOffset: 18,
            weight: 3,
            maxHealth: 1000000,
            showHealthBar: false,
            indestructible: true,
            canHitAirTargets: false,
            impactResistance: 0.8,
            modelScale: 11,
            snapToGroundOnLoad: true,
            groundOffset: -0.3,
            rotation: [0, 0, 0],
            minimumHeightDamage: 3.5,
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            dragOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            collisionRect: {
                width: 1.5,
                height: 3.2,
                offset: [0, 1.6]
            },
            matter: {
                // Stone statue — dense, low bounce, high static friction.
                density: 0.05,
                restitution: 0.03,
                friction: 0.65,
                frictionStatic: 0.8,
                frictionAir: 0.25,
            }
        },     
        statuewarrior: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/statuewarrior.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            mouthDrag: false,
            respawn: true,
            collideWithPlatforms: true,
            respawnDelay: 20,
            layerZOffset: 18,
            weight: 3,
            maxHealth: 10000000,
            showHealthBar: false,
            indestructible: true,
            canHitAirTargets: false,
            impactResistance: 0.8,
            modelScale: 11,
            snapToGroundOnLoad: true,
            groundOffset: -0.3,
            rotation: [0, 0, 0],
            minimumHeightDamage: 3.5,
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            dragOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            collisionRect: {
                width: 1.5,
                height: 3.2,
                offset: [0, 1.6]
            },
            matter: {
                // Stone warrior statue — same as statue.
                density: 0.05,
                restitution: 0.03,
                friction: 0.65,
                frictionStatic: 0.8,
                frictionAir: 0.25,
            }
        },
        block: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/block.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            mouthDrag: false,
            respawn: false,
            collideWithPlatforms: true,
            category: MATTER_MASK_BLOCK,
            collideWithMask: MATTER_MASK_BLOCK | MATTER_MASK_PLATFORMS | MATTER_MASK_TERRAIN,
            collideWithDino: true,
            walkable: false,
            walkableEdgeActivationRadius: 12,
            walkableGapTolerance: 1,
            layerZOffset: 18,
            weight: 5,
            maxHealth: 10000000,
            showHealthBar: false,
            indestructible: true,
            canHitAirTargets: false,
            impactResistance: 999,
            minimumHeightDamage: 9999999,
            modelScale: 8,
            snapToGroundOnLoad: false,
            fallOnLoad: true,
            usePhysicsBody: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            dragOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            collisionRect: {
                width: 2.6,
                height: 2.6,
                offset: [0, 1.4]
            },
            matter: {
                // Concrete block — dense, rough, minimal bounce, falls freely.
                density: 0.06,
                restitution: 0.05,
                friction: 0.6,
                frictionStatic: 0.8,
                frictionAir: 0.25,
                groundHorizontalDamping: 0.3,
                groundAngularDamping: 0.75,
                snapAngleOnSettle: true,
                settleSpeed: 0.1,
                settleAngularSpeed: 0.2,
                settleFrames: 1,
                sleepThreshold: 6
            }
        },
        // ── Mission world objects ─────────────────────────────────────────────
        // These have no GLB model. Their load() is overridden in the subclass.
        // missionId is read from the Tiled object's properties and links the
        // placed marker to a mission definition in MissionData.js.
        missioncallout: {
            pickupable: false,
            draggable: false,
            snapToGroundOnLoad: false,
            indestructible: true,
            layerZOffset: 0,
            // World-space size of the icon shown above the callout position.
            width: 6,
            height: 6,
            // Default scale factor for the icon drawn on the callout background.
            // Can be overridden per-mission via callout.iconScale.
            iconScale: 1.5,
            // Half-size of the fallback landing zone rect synthesized when no Tiled zone exists.
            landingZoneRadiusX: 8,
            landingZoneRadiusY: 6,
        },
        // Boss dino object type removed for Dino Sky
        car: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/car.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            layerZOffset: 12,
            weight: 50,
            maxHealth: 200,
            respawn: true,
            respawnDelay: 200,
            minimumHeightDamage: 6,
            groundImpactSound: 'sfx/thud_medium.ogg',
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            coinValue: 3,
            destruction: {
                explosionDuration: 2.8,
                explosionScale: 3,
                maxExplosionDamage: 500,
                maxExplosionDistance: 8,
                particleCount: 20,
                debrisCount: 15,
                explosionColors: [0xC6C6C6, 0x4A4D4A, 0x55616A, 0x97999B],
                effectOffsetY: -0.5,
                debrisStartDelay: 0.9,
                visualHideDelay: 0.95,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 5.5
            },
            collisionRect: {
                width: 5.5,
                height: 1.9,
                offset: [0, 1]
            },
            matter: {
                // Car — steel+air effective density, low bounce, rubber-on-road friction.
                density: 0.02,
                restitution: 0.08,
                friction: 0.55,
                frictionStatic: 0.65,
                frictionAir: 0.25,
            }
        },
        supercar: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/supercar.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            layerZOffset: 12,
            weight: 50,
            maxHealth: 200,
            respawn: true,
            respawnDelay: 200,
            minimumHeightDamage: 6,
            groundImpactSound: 'sfx/thud_medium.ogg',
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            coinValue: 3,
            destruction: {
                explosionDuration: 2.8,
                explosionScale: 3,
                maxExplosionDamage: 500,
                maxExplosionDistance: 8,
                particleCount: 20,
                debrisCount: 15,
                explosionColors: [0xC6C6C6, 0x4A4D4A, 0x55616A, 0x97999B],
                effectOffsetY: -0.5,
                debrisStartDelay: 0.9,
                visualHideDelay: 0.95,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 5.5
            },
            collisionRect: {
                width: 5.5,
                height: 1.7,
                offset: [0, 1.1]
            },
            matter: {
                density: 0.02,
                restitution: 0.08,
                friction: 0.55,
                frictionStatic: 0.65,
                frictionAir: 0.25,
            }
        },
        hatchback: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/hatchback.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            layerZOffset: 12,
            weight: 50,
            maxHealth: 200,
            respawn: true,
            respawnDelay: 200,
            minimumHeightDamage: 6,
            groundImpactSound: 'sfx/thud_medium.ogg',
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            coinValue: 3,
            destruction: {
                explosionDuration: 2.8,
                explosionScale: 3,
                maxExplosionDamage: 500,
                maxExplosionDistance: 8,
                particleCount: 20,
                debrisCount: 15,
                explosionColors: [0xC6C6C6, 0x4A4D4A, 0x55616A, 0x97999B],
                effectOffsetY: -0.5,
                debrisStartDelay: 0.9,
                visualHideDelay: 0.95,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 5.5
            },
            collisionRect: {
                width: 5.5,
                height: 1.7,
                offset: [0, 1.1]
            },
            matter: {
                density: 0.02,
                restitution: 0.08,
                friction: 0.55,
                frictionStatic: 0.65,
                frictionAir: 0.25,
            }
        },
       delorean: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/delorean.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            layerZOffset: 12,
            weight: 50,
            maxHealth: 200,
            respawn: true,
            respawnDelay: 200,
            minimumHeightDamage: 6,
            groundImpactSound: 'sfx/thud_medium.ogg',
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            coinValue: 3,
            destruction: {
                explosionDuration: 2.8,
                explosionScale: 3,
                maxExplosionDamage: 500,
                maxExplosionDistance: 8,
                particleCount: 20,
                debrisCount: 15,
                explosionColors: [0xC6C6C6, 0x4A4D4A, 0x55616A, 0x97999B],
                effectOffsetY: -0.5,
                debrisStartDelay: 0.9,
                visualHideDelay: 0.95,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 5.5
            },
            collisionRect: {
                width: 5.5,
                height: 1.7,
                offset: [0, 1.1]
            },
            matter: {
                density: 0.02,
                restitution: 0.08,
                friction: 0.55,
                frictionStatic: 0.65,
                frictionAir: 0.25,
            }
        },
      etype: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/etype.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            layerZOffset: 12,
            weight: 50,
            maxHealth: 200,
            respawn: true,
            respawnDelay: 200,
            minimumHeightDamage: 6,
            groundImpactSound: 'sfx/thud_medium.ogg',
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            coinValue: 3,
            destruction: {
                explosionDuration: 2.8,
                explosionScale: 3,
                maxExplosionDamage: 500,
                maxExplosionDistance: 8,
                particleCount: 20,
                debrisCount: 15,
                explosionColors: [0xC6C6C6, 0x4A4D4A, 0x55616A, 0x97999B],
                effectOffsetY: -0.5,
                debrisStartDelay: 0.9,
                visualHideDelay: 0.95,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 5.5
            },
            collisionRect: {
                width: 5.5,
                height: 1.7,
                offset: [0, 1.1]
            },
            matter: {
                density: 0.02,
                restitution: 0.08,
                friction: 0.55,
                frictionStatic: 0.65,
                frictionAir: 0.25,
            }
        },
        canister: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/canister.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            groundImpactSound: 'sfx/thud_light.ogg',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            mouthDrag: true,
            respawn: true,
            respawnDelay: 20,
            layerZOffset: 24,
            weight: 0.1,
            maxHealth: 0.1,
            showHealthBar: false,
            canHitAirTargets: true,
            airTargetImpactDamage: 120,
            impactResistance: 0.8,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: -0.3,
            rotation: [0, 0, 0],
            minimumHeightDamage: 4,    
            coinValue: 1,
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },                   
            dragOffset: {
                position: [0, 1, 0],
                rotation: [Math.PI/2, 0, 0]
            },          
            destruction: {
                explosionDuration: 0.9,
                explosionScale: 1.8,
                maxExplosionDamage: 300,
                maxExplosionDistance: 4,
                particleCount: 28,
                debrisCount: 3,
                explosionColors: [0xfff1a0, 0xff9f1c, 0xff3d0a, 0x242424],
                effectOffsetY: 0,
                debrisStartDelay: 0,
                visualHideDelay: 0.1,
                debrisForceScale: 1.1,
                debrisGravityMultiplier: 3,
                particleSpeedMin: 1.5,
                particleSpeedMax: 4,
                upwardBias: 1,
                gravity: 40,
                emissionDuration: 0.25,
                spawnSpreadX: 1.5
            },
            collisionRect: {
                width: 1.15,
                height: 2,
                offset: [0, 1.1]
            },
            matter: {
                // Gas canister — thin pressurised steel, lighter than it looks, no bounce.
                density: 0.018,
                restitution: 0.04,
                friction: 0.45,
                frictionStatic: 0.55,
                frictionAir: 0.25,
            }
        },
        oildrum: {
            behavior: 'vehicle',
            modelPath: './gfx/mesh/vehicles/oildrum.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            groundImpactSound: 'sfx/thud_light.ogg',
            pickupable: true,
            draggable: false,
            collideWithPlatforms: true,
            respawn: true,
            respawnDelay: 20,
            layerZOffset: 18,
            weight: 60,
            maxHealth: 30,
            showHealthBar: false,
            canHitAirTargets: true,
            airTargetImpactDamage: 250,
            impactResistance: 1,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: -0.3,
            rotation: [0, 0, 0],
            minimumHeightDamage: 5,   
            coinValue: 1,
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            destruction: {
                explosionDuration: 1,
                explosionScale: 3.2,
                maxExplosionDamage: 1000,
                maxExplosionDistance: 6,
                particleCount: 30,
                debrisCount: 2,
                explosionColors: [0xfff1a0, 0xff9f1c, 0xff3d0a, 0x242424],
                effectOffsetY: -0.5,
                debrisStartDelay: 0,
                visualHideDelay: 0.1,
                debrisForceScale: 1.5,
                debrisGravityMultiplier: 3.2,
                particleSpeedMin: 2,
                particleSpeedMax: 5,
                upwardBias: 1,
                gravity: 40,
                emissionDuration: 0.3,
                spawnSpreadX: 2
            },
            collisionRect: {
                width: 2.15,
                height: 3.25,
                offset: [0, 1.75]
            },
            matter: {
                // Oil drum — steel + liquid fill, fairly dense, barely bounces.
                density: 0.035,
                restitution: 0.04,
                friction: 0.5,
                frictionStatic: 0.65,
                frictionAir: 0.25,
            }
        },
        suit: {
            behavior: 'human',
            uprightOnSlope: true,
            modelPath: './gfx/mesh/vehicles/suit.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            mouthDrag: true,
            respawn: true,
            showHealthBar: false,      
            collideWithPlatforms: true,
            respawnDelay: 20,
            walkAnimationSpeed: 1,
            runAnimationSpeed: 1,
            fleeTurnDelay: 0.6,
            coinValue: 1,
            pickupSounds: [
                'sfx/male_scream1.ogg',
                'sfx/male_scream2.ogg',
                'sfx/male_scream3.ogg',
                'sfx/male_scream4.ogg'
            ],
            layerZOffset: 24,
            weight: 2,
            maxHealth: 40,
            killSounds: ['sfx/human_splat.ogg', 'sfx/male_dead1.ogg', 'sfx/male_dead2.ogg'],
            objectHitSound: 'sfx/fire_hit_light.ogg',
            groundImpactSound: 'sfx/thud_light.ogg',
            modelScale: 12,
            minimumHeightDamage: 4,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            walkingBehavior: {
                enabled: true,
                idleDurationRange: [0.5, 1],
                walkDurationRange: [4, 6],
                walkSpeed: [1, 5],
                runSpeed: [7, 9],
                allowRun: true,
                reactToDino: true,
                // Keep males active while they are already well within view, so they do not
                // stand idle until the dino is almost on top of them.
                dinoReactDistance: 15,
                walkActivationRange: 150,
                aiActivationRange: 150,
                moveAwayFromDino: true,
                // Males should already flee as soon as the dino gets close enough, even if
                // the stricter face-to-face threat check would not have triggered yet.
                fleeOnDinoProximity: true,
                canWalkSlope: true,
                idleOnSlopeAfterDrop: false,
                turnDuration: 0.25,
            },
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            dragOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
//                position: [0, 0.8, 0.4],
//                rotation: [Math.PI/2, Math.PI/2, 0]
            },
            destruction: {
                explosionDuration: 1,
                explosionScale: 2,
                maxExplosionDamage: 0,
                maxExplosionDistance: 1,
                particleCount: 0,
                debrisCount: 20,
                explosionColors: [0xFF0000, 0x000000, 0x000000, 0x000000],
                effectOffsetY: -1,
                debrisStartDelay: 0,
                visualHideDelay: 0.1,
                debrisForceScale: 1,
                debrisGravityMultiplier: 2,
                particleSpeedMin: 2,
                particleSpeedMax: 5,
                upwardBias: 4,
                gravity: 30,
                emissionDuration: 0.3,
                spawnSpreadX: 1
            },
            matter: {
                // Person — human body mass, no bounce, moderate friction.
                density: 0.02,
                restitution: 0.02,
                friction: 0.6,
                frictionStatic: 0.7,
                frictionAir: 0.25,
            },
            collisionRect: {
                width: 1,
                height: 2.6,
                offset: [0, 1.4]
            }
        },
        male: {
            behavior: 'human',
            uprightOnSlope: true,
            modelPath: './gfx/mesh/vehicles/male.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            mouthDrag: true,
            respawn: true,
            collideWithPlatforms: true,
            respawnDelay: 20,
            walkAnimationSpeed: 1,
            runAnimationSpeed: 1,
            fleeTurnDelay: 0.6,
            coinValue: 1,
            pickupSounds: [
                'sfx/male_scream1.ogg',
                'sfx/male_scream2.ogg',
                'sfx/male_scream3.ogg',
                'sfx/male_scream4.ogg'
            ],
            layerZOffset: 24,
            weight: 2,
            maxHealth: 20,
            killSounds: ['sfx/human_splat.ogg', 'sfx/male_dead1.ogg', 'sfx/male_dead2.ogg'],
            objectHitSound: 'sfx/fire_hit_light.ogg',
            groundImpactSound: 'sfx/thud_light.ogg',
            modelScale: 12,
            minimumHeightDamage: 4,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            walkingBehavior: {
                enabled: true,
                idleDurationRange: [0.5, 1],
                walkDurationRange: [4, 6],
                walkSpeed: [2, 3],
                runSpeed: [7, 9],
                allowRun: true,
                reactToDino: true,
                // Keep males active while they are already well within view, so they do not
                // stand idle until the dino is almost on top of them.
                dinoReactDistance: 15,
                walkActivationRange: 150,
                aiActivationRange: 150,
                moveAwayFromDino: true,
                // Males should already flee as soon as the dino gets close enough, even if
                // the stricter face-to-face threat check would not have triggered yet.
                fleeOnDinoProximity: true,
                canWalkSlope: true,
                idleOnSlopeAfterDrop: false,
                turnDuration: 0.25,
            },
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            dragOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
//                position: [0, 0.8, 0.4],
//                rotation: [Math.PI/2, Math.PI/2, 0]
            },
            destruction: {
                explosionDuration: 1,
                explosionScale: 2,
                maxExplosionDamage: 0,
                maxExplosionDistance: 1,
                particleCount: 0,
                debrisCount: 20,
                explosionColors: [0xFF0000, 0x000000, 0x000000, 0x000000],
                effectOffsetY: -1,
                debrisStartDelay: 0,
                visualHideDelay: 0.1,
                debrisForceScale: 1,
                debrisGravityMultiplier: 2,
                particleSpeedMin: 2,
                particleSpeedMax: 5,
                upwardBias: 4,
                gravity: 30,
                emissionDuration: 0.3,
                spawnSpreadX: 1
            },
            matter: {
                // Person — human body mass, no bounce, moderate friction.
                density: 0.02,
                restitution: 0.02,
                friction: 0.6,
                frictionStatic: 0.7,
                frictionAir: 0.25,
            },
            collisionRect: {
                width: 1,
                height: 2.6,
                offset: [0, 1.4]
            }
        },
        // Cow uses the same HumanObject walking system as male, but with calmer animal-like
        // behavior: no running, slope-aware turning, and a settle idle after being dropped.
        cow: {
            behavior: 'human',
            uprightOnSlope: false,
            modelPath: './gfx/mesh/vehicles/cow.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            mouthDrag: false,
            respawn: true,
            collideWithPlatforms: true,
            respawnDelay: 20,
            walkAnimationSpeed: 0.5,
            runAnimationSpeed: 1,
            pickupSounds: ['sfx/cow1.ogg', 'sfx/cow2.ogg'],
            killSounds: ['sfx/human_splat.ogg'],            
            layerZOffset: 24,
            weight: 35,
            maxHealth: 40,
            objectHitSound: 'sfx/fire_hit_light.ogg',
            groundImpactSound: 'sfx/thud_light.ogg',
            modelScale: 12,
            minimumHeightDamage: 4,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            coinValue: 1,
            walkingBehavior: {
                enabled: true,
                idleDurationRange: [10, 15],
                walkDurationRange: [4, 8],
                walkSpeed: 0.8,
                runSpeed: 1.4,
                // Cows do not run — allowRun: false means runAway state uses walkSpeed instead.
                allowRun: false,
                reactToDino: true,
                dinoReactDistance: 12,
                walkActivationRange: 150,
                aiActivationRange: 150,
                moveAwayFromDino: true,
                // Cow turns around rather than climbing steep slopes.
                canWalkSlope: false,
                // After being dropped the cow idles calmly before resuming its walk cycle.
                idleOnSlopeAfterDrop: true,
                turnDuration: 0.3,
            },
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            dragOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            destruction: {
                explosionDuration: 1,
                explosionScale: 2,
                maxExplosionDamage: 0,
                maxExplosionDistance: 1,
                particleCount: 0,
                debrisCount: 20,
                explosionColors: [0x6a4b2a, 0x2b1b12, 0x000000, 0x000000],
                effectOffsetY: -1,
                debrisStartDelay: 0,
                visualHideDelay: 0.1,
                debrisForceScale: 1,
                debrisGravityMultiplier: 2,
                particleSpeedMin: 2,
                particleSpeedMax: 5,
                upwardBias: 4,
                gravity: 30,
                emissionDuration: 0.3,
                spawnSpreadX: 1.2
            },
            collisionRect: {
                width: 5.1,
                height: 3,
                offset: [0, 1.5]
            },
            matter: {
                // Cow — organic mass, no bounce, moderate friction so it doesn't slide.
                density: 0.025,
                restitution: 0.02,
                friction: 0.7,
                frictionStatic: 0.8,
                frictionAir: 0.25,
            },
        },
        tank: {
            modelPath: './gfx/mesh/vehicles/tank.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: true,
            collideWithPlatforms: true,
            layerZOffset: 6,
            weight: 250,
            maxHealth: 2000,
            minimumHeightDamage: 12,
            groundImpactSound: 'sfx/thud_heavy.ogg',
            respawn: true,
            respawnDelay: 240,
            // Higher resistance so short drops barely dent tanks compared to lighter vehicles.
            impactResistance: 6,
            // Optional: only these meshes blend to wrecked while health decreases.
            // At destruction, all wrecked morph targets are still forced to full.
            wreckedBlendMeshes: ['tank', 'tank_turret'],
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            tankCombat: {
                // Authoring mismatch safety: support both "tank_cannon" and "tank_canon".
                cannonMeshNames: ['tank_cannon', 'tank_canon'],
                aimRange: 42, // Aim range
                cannonRotateSpeed: 2.5, // Aim smoothness/speed
                fireAngleTolerance: 0.1, //How strict aim must be before fire:
                fireInterval: 2,
                bulletSpeed: 24,
                bulletLifetime: 6,
                bulletDamageToDino: 15,
                bulletScale: 0.8,
                bulletHitRadius: 0.6,
                bulletTexturePath: './gfx/levels/bullet.webp',
                // Spawn bullets slightly behind the muzzle s   o they emerge from the barrel.
                muzzleBackOffset: 0,
                // Cannon traverse limits relative to rest angle (radians).
                // Positive = left side, negative = right side.
                maxAngleLeft: Math.PI,
                maxAngleRight: Math.PI,
                // Optional slight downward overshoot at each side (radians).
                downAngleRight: 0.2,
                downAngleLeft: 0.2
            },
            destruction: {
                explosionDuration: 3.2,
                explosionScale: 6,
                maxExplosionDamage: 1500,
                maxExplosionDistance: 15,
                particleCount:84,
                debrisCount: 70,
                explosionColors: [0x675E3F, 0x413A21, 0x3B3935, 0x504E4C],
                effectOffsetY: -2,
                debrisStartDelay: 1.2,
                visualHideDelay: 1.25,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 12
            },
            coinValue: 10,
            collisionRect: {
                width: 12,
                height: 6.8,
                offset: [0, 3.45]
            },
            matter: {
                // Tank — heavy armoured steel, barely bounces, high friction.
                density: 0.08,
                restitution: 0.02,
                friction: 0.7,
                frictionStatic: 0.9,
                frictionAir: 0.25,
            }
        },
        groundturret: {
            behavior: 'tank',
            modelPath: './gfx/mesh/vehicles/groundturret.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            layerZOffset: 0,
//            wreckedBlendMeshes: ['groundturret'],
            weight: 250,
            maxHealth: 1000,
            minimumHeightDamage: 10,
            impactResistance: 6,
            modelScale: 12,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            coinValue: 8,
            collisionRect: {
                width: 3,
                height: 2.8,
                offset: [0, 1.4],
                angle: 0,
                debugDepth: 0.8
            },   
            tankCombat: {
                // Authoring mismatch safety: support both "tank_cannon" and "tank_canon".
                cannonMeshNames: ['groundturret_canon'],
                aimRange: 35, // Aim range
                cannonRotateSpeed: 3, // Aim smoothness/speed
                fireAngleTolerance: 0.1, //How strict aim must be before fire:
                fireInterval: 0.3,
                bulletSpeed: 42,
                bulletLifetime: 3,
                bulletDamageToDino: 5,
                bulletScale: 0.4,
                bulletHitRadius: 0.4,
                bulletTexturePath: './gfx/levels/bullet.webp',
                // Spawn bullets slightly behind the muzzle s   o they emerge from the barrel.
                muzzleBackOffset: 0,
                // Cannon traverse limits relative to rest angle (radians).
                // Positive = left side, negative = right side.
                maxAngleLeft: Math.PI,
                maxAngleRight: Math.PI,
                // Optional slight downward overshoot at each side (radians).
                downAngleRight: 0.2,
                downAngleLeft: 0.2
            },
            destruction: {
                explosionDuration: 3.2,
                explosionScale: 6,
                maxExplosionDamage: 1500,
                maxExplosionDistance: 15,
                particleCount:84,
                debrisCount: 70,
                explosionColors: [0x675E3F, 0x413A21, 0x3B3935, 0x504E4C],
                effectOffsetY: -2,
                debrisStartDelay: 1.2,
                visualHideDelay: 1.25,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 12
            }
        },
        groundsam: {
            modelPath: './gfx/mesh/vehicles/groundsam.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            layerZOffset: 6,
//            wreckedBlendMeshes: ['groundsam'],
            weight: 250,
            maxHealth: 1000,
            minimumHeightDamage: 10,
            impactResistance: 6,
            modelScale: 12,
            snapToGroundOnLoad: true,
            coinValue: 8,
            groundOffset: 0,
            rotation: [0, 0, 0],
            missilesEnabled: true,
            missileModelPath: './gfx/mesh/vehicles/missile.glb',
            missileTexturePath: './gfx/textures/vehicles/vehicles.webp',
            missileFireInterval: 6.0,
            missileLaunchOffset: [0, 0.3, 0],
            missileScale: 12,
            missileSpeed: 12,
            missileAcceleration: 20,
            missileMaxTurnRate: 2,
            missileDamageToDino: 15,
            missileLifetime: 6,
            missileHitRadius: 0.6,
            missileFireRange: 35,
            missileTrailSpawnInterval: 0.03,
            missileTrailParticleLifetime: 0.35,
            missileTrailParticleScale: 0.18,
            missileTrailSpread: 0.08,
            missileTrailBackOffset: 1.2,
            missileTrailVerticalOffset: -0.16,
            missileExplosionParticleCount: 10,
            missileExplosionLifetime: 0.65,
            missileExplosionScale: 1.2,
            missileModelRotationOffset: [0, 0, 0],
            collisionRect: {
                width: 1.5,
                height: 2.8,
                offset: [0, 1.4],
                angle: 0,
                debugDepth: 0.8
            },             
            destruction: {
                explosionDuration: 3.2,
                explosionScale: 6,
                maxExplosionDamage: 1500,
                maxExplosionDistance: 15,
                particleCount:84,
                debrisCount: 70,
                explosionColors: [0x675E3F, 0x413A21, 0x3B3935, 0x504E4C],
                effectOffsetY: -2,
                debrisStartDelay: 1.2,
                visualHideDelay: 1.25,
                debrisForceScale: 1.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 2,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 12
            }
        },
        chopper: {
            modelPath: './gfx/mesh/vehicles/chopper.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            respawn: true,
            respawnDelay: 180,
            wreckedBlendMeshes: ['heli'],
            layerZOffset: 6,
            weight: 9999,
            maxHealth: 750,
            modelScale: 12,
            snapToGroundOnLoad: false,
            // Authorable gameplay collision rectangle shared across terrain and damage checks.
            // Width/height/offset are world units relative to the chopper visual root.
            collisionRect: {
                width: 12,
                height: 3,
                offset: [-1.5, 2],
                angle: 0,
                debugDepth: 0.8
            },
            isAirTarget: true,
            groundOffset: 0,
            patrolWidth: 8,
            patrolHeight: 5,
            moveSpeed: 3,
            arriveThreshold: 0.2,
            acceleration: 7,
            movementDamping: 0.985,
            mainRotorSpeed: 28,
            tailRotorSpeed: 42,
            tailRotorAxis: 'z',
            faceTargetRange: 26,
            turnMarginX: 8,
            turnSpeedY: 5,
            missileRequiresDamage: true,
            missileModelPath: './gfx/mesh/vehicles/missile.glb',
            missileTexturePath: './gfx/textures/vehicles/vehicles.webp',
            missileFireInterval: 5.0,
            missileLaunchOffset: [0, 0.04, 0],
            missileScale: 12,
            missileSpeed: 12,
            missileAcceleration: 20,
            missileMaxTurnRate: 2.5,
            missileDamageToDino: 25,
            missileLifetime: 10,
            missileHitRadius: 0.6,
            missileFireRange: 28,
            missileTrailSpawnInterval: 0.03,
            missileTrailParticleLifetime: 0.35,
            missileTrailParticleScale: 0.18,
            missileTrailSpread: 0.08,
            missileTrailBackOffset: 1.2,
            missileTrailVerticalOffset: -0.16,
            missileExplosionParticleCount: 10,
            missileExplosionLifetime: 0.65,
            missileExplosionScale: 1.2,
            // If the missile GLB nose does not point along local +X, tune this offset.
            missileModelRotationOffset: [0, 0, 0],
            rotation: [-0.2, 0, 0],
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            coinValue: 8,
            destruction: {
                explosionDuration: 0.45,
                explosionScale: 1.2,
                maxExplosionDamage: 40,
                maxExplosionDistance: 3.5,
                particleCount: 30,
                debrisCount: 6,
                explosionColors: [0xffaa22, 0xff4a10, 0x2d6f7a, 0x222222]
            }
        },
        zeppelin: {
            layerZOffset: 0,
            modelPath: './gfx/mesh/vehicles/zeppelin.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            respawn: true,
            respawnDelay: 240,
            weight: 9999,
            maxHealth: 9999999999,
            showHealthBar: false,             
            indestructible: true,
            modelScale: 2.7,
            snapToGroundOnLoad: false,
            isAirTarget: true,
            groundOffset: 0,
            usePhysicsBody: true,
            isPlatform: true,
            moveSpeed: 4,
            platformMass: 500,
            buoyancyStiffness: 8,
            buoyancyDamping: 3,
            coinValue: 10,
            buoyancyImpulseScale: 0.12,
            // Fixed local-space reference point for the collision polygon. All polygon
            // coordinates are relative to this point. Change this if the polygon appears
            // in the wrong place; change polygon points without touching this to keep
            // existing points stable. Units: model-local at modelScale 1.
            collisionPolygonOrigin: [0, -0.3],
            // Closed collision polygon for the full zeppelin hull in model-local units at modelScale 1.
            // Used for Matter physics (objects dropped onto the zeppelin, terrain collision when falling).
            // Winds clockwise in Y-up space so Matter (Y-down) computes outward normals correctly.
            collisionPolygon: [
                [-16.0, 2.5],
                [-12.0, 2],
                [ -6.0, 1.0],
                [  0.0, 0],
                [  7.0, 0],
                [ 13.0, 2],

                [ 15.2,  4.6],
                [ 13,  6.2],
                [  9.0,  7.2],
                [  4.0,  7.5],
                [  0.0,  7.6],
                [ -4.0,  7.5],
                [-10.0,  6.8],
                [-15.0,  6],
                [-19, 5],
                [-19.8,  4.2],
            ],
            // Top-surface walking polygon in model-local units at modelScale 1.
            // Points run left to right along the envelope silhouette.
            // Scaled by modelScale at load time — tune X/Y to match the visual hull.
            deckPolygon: [
                [-19.6,  1.5],
                [-15.0,  3],
                [ -10.0,  3.6],
                [ -4.0,  4.4],
                [  0.0,  4.5],
                [  4.0,  4.4],
                [  9.0,  3.8],
                [ 13.0,  2.5],
                [ 14.5,  1.3]
            ],

            // Missiles are off by default — enable per-instance in Tiled if desired.
            missilesEnabled: false,
            missileRequiresDamage: true,
            missileModelPath: './gfx/mesh/vehicles/missile.glb',
            missileTexturePath: './gfx/textures/vehicles/vehicles.webp',
            missileFireInterval: 6.0,
            missileLaunchOffset: [0, -1.2, 0],
            missileScale: 12,
            missileSpeed: 10,
            missileAcceleration: 16,
            missileMaxTurnRate: 2.0,
            missileDamageToDino: 20,
            missileLifetime: 10,
            missileHitRadius: 0.6,
            missileFireRange: 22,
            missileTrailSpawnInterval: 0.03,
            missileTrailParticleLifetime: 0.35,
            missileTrailParticleScale: 0.18,
            missileTrailSpread: 0.08,
            missileTrailBackOffset: 1.2,
            missileTrailVerticalOffset: -0.16,
            missileExplosionParticleCount: 10,
            missileExplosionLifetime: 0.65,
            missileExplosionScale: 1.2,
            missileModelRotationOffset: [0, 0, 0],
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            destruction: {
                explosionDuration: 0.6,
                explosionScale: 1.8,
                maxExplosionDamage: 50,
                maxExplosionDistance: 5,
                particleCount: 40,
                debrisCount: 8,
                explosionColors: [0xffaa22, 0xff6600, 0xcc2200, 0x222222]
            }
        },
        ring: {
            modelPath: './gfx/mesh/vehicles/ring.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            weight: 9999,
            maxHealth: 1000000,
            showHealthBar: false,
            indestructible: true,
            modelScale: 9,
            snapToGroundOnLoad: false,
            isAirTarget: false,
            groundOffset: 0,
            layerZOffset: 0,
            fixedYawOffset: 1.15,
            rotorNodeName: 'ring_rotor',
            ringNodeName: 'ring',
            frontRingOverlay: true,
            frontRingAxis: 'x',
            frontRingSide: 'negative',
            frontRingRenderOrder: 20,
            mainRotorSpeed: 10,
            ringRotorAxis: 'y',
            patrolWidth: 1,
            patrolHeight: 5,
            moveSpeed: 2,
            arriveThreshold: 0.15,
            acceleration: 2.5,
            movementDamping: 0.985,
            missilesEnabled: false,
            rotation: [0, 0, 0],
            passCheckRadius: 25,
            passZone: {
                height: 18,
                offset: [0, 0]
            },
            collisionRect: {
                width: 5.2,
                height: 5.2,
                offset: [0, 0],
                angle: 0,
                debugDepth: 0.8
            }
        },
        ringhorizontal: {
            modelPath: './gfx/mesh/vehicles/ringhorizontal.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            weight: 9999,
            maxHealth: 1000000,
            showHealthBar: false,
            indestructible: true,
            modelScale: 9,
            snapToGroundOnLoad: false,
            isAirTarget: false,
            groundOffset: 0,
            layerZOffset: 0,
            fixedYawOffset: 0,
            rotorNodeName: null,
            ringNodeName: 'ringhorizontal',
            frontRingOverlay: true,
            frontRingAxis: 'z',
            frontRingSide: 'positive',
            frontRingRenderOrder: 20,
            mainRotorSpeed: 0,
            patrolWidth: 1,
            patrolHeight: 1,
            moveSpeed: 0,
            arriveThreshold: 0.15,
            acceleration: 2.5,
            movementDamping: 0.985,
            missilesEnabled: false,
            rotation: [0, 0, 0],
            passCheckRadius: 25,
            passZone: {
                width: 18,
                offset: [0, 0]
            },
            collisionRect: {
                width: 5.2,
                height: 5.2,
                offset: [0, 0],
                angle: 0,
                debugDepth: 0.8
            }
        },
        health: {
            behavior: 'collectible',
            modelPath: './gfx/mesh/collectibles/health.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            snapToGroundOnLoad: false,
            layerZOffset: 24,
            modelScale: 12,
            pickupRadius: 3,
            amount: 100,
            respawn: true,
            respawnDelay: 20
        },
        flame: {
            behavior: 'collectible',
            modelPath: './gfx/mesh/collectibles/flame.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            snapToGroundOnLoad: false,
            layerZOffset: 24,
            modelScale: 12,
            pickupRadius: 3,
            amount: 75,
            respawn: true,
            respawnDelay: 20
        },
        energy: {
            behavior: 'collectible',
            modelPath: './gfx/mesh/collectibles/energy.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            snapToGroundOnLoad: false,
            layerZOffset: 24,
            modelScale: 12,
            pickupRadius: 3,
            amount: 100,
            respawn: true,
            respawnDelay: 20
        },
        coin: {
            behavior: 'collectible',
            modelPath: './gfx/mesh/collectibles/coin.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: false,
            draggable: false,
            snapToGroundOnLoad: false,
            layerZOffset: 30,
            modelScale: 12,
            pickupRadius: 3,
            amount: 5,
            respawn: true,
            respawnDelay: 60
        },
        ball: {
            modelPath: './gfx/mesh/vehicles/ball.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',            
            collideWithPlatforms: true,
            category: MATTER_MASK_BLOCK,
            collideWithMask: MATTER_MASK_BLOCK | MATTER_MASK_PLATFORMS | MATTER_MASK_TERRAIN,
            collideWithDino: true,
            pickupable: true,
            draggable: false,
            modelScale: 9,
            snapToGroundOnLoad: true,
            collideWithPlatforms: true,
            showHealthBar: false,
            indestructible: true,
            maxHealth: 100000,
            minimumHeightDamage: 100000,
            impactResistance: 1,
            layerZOffset: 18,
            groundOffset: 0,
            rotation: [0, 0, 0],
            pickupOffset: {
                position: [0, 0, 0],
                rotation: [0, 0, 0]
            },
            matter: {
                // Ball — hollow rubber, very bouncy, low rolling friction, falls freely.
                density: 0.008,
                restitution: 0.72,
                friction: 0.25,
                frictionStatic: 0.3,
                frictionAir: 0.08,
            },
            collisionCircle: {
                radius: 0.24,
                offset: [0, 0.13],
                sides: 40
            }
        },

        shark: {
            // Underwater AI creature. See SharkObject.js for movement reuse notes.
            behavior: 'shark',
            modelPath: './gfx/mesh/vehicles/shark.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            pickupable: true,
            draggable: false,
            layerZOffset: 12,
            weight: 80,
            maxHealth: 1,
            showHealthBar: false,
            damageable: true,
            modelScale: 12,
            snapToGroundOnLoad: false,
            usePhysicsBody: true,
            groundOffset: 0,
            objectHitSound: 'sfx/fire_hit_light.ogg',            
            killSounds: ['sfx/human_splat.ogg'],   
            // Swim AI — consumed by SharkObject + FlyingAIController in 'swim' mode.
            swimAI: {
                enabled: true,
                behavior: 'patrol',
                waterOnly: true,
                patrolSpeed: 7,
                fleeSpeed: 12,
                turnSpeed: 3,
                acceleration: 6,
                maxVerticalAngleDeg: 8,
                arriveThreshold: 3,
                terrainAvoidanceEnabled: true,
                waterBoundaryAvoidanceEnabled: true,
                terrainAvoidanceLookAhead: 5,
                terrainAvoidanceStrength: 1.5,
                // Optional underwater depth band: [topFrac, bottomFrac] of the
                // water polygon's AABB. 0 = surface, 1 = polygon bottom.
                swimDepthRange: [0.3, 0.8],
                debugLogging: false
            },
            collisionRect: {
                width:5,
                height: 2,
                offset: [0, 1]
            },
            coinValue: 2,
            destruction: {
                explosionDuration: 0.4,
                explosionScale: 0.6,
                maxExplosionDamage: 10,
                maxExplosionDistance: 2,
                particleCount: 8,
                debrisCount: 4,
                explosionColors: [0x9bb7c4, 0x5e7a86, 0xc4d5dc, 0x333333]
            }
        },
        plane: {
            layerZOffset: 6,
            modelPath: './gfx/mesh/vehicles/plane.glb',
            texturePath: './gfx/textures/vehicles/vehicles.webp',
            behavior: 'plane',
            pickupable: false,
            draggable: false,
            respawn: true,
            respawnDelay: 120,
            weight: 9999,
            maxHealth: 400,
            modelScale: 12,
            snapToGroundOnLoad: false,
            isAirTarget: true,
            groundOffset: 0,
            flyAI: {
                movementType: 'plane',
                // 'patrol' = fly between random points, 'flee' = fly away from dino when close
                behavior: 'flee',
                // Base cruise speed (world units/second) when flying level.
                moveSpeed: 17,
                // Speed when climbing (sinAngle = +1). Defaults to moveSpeed if omitted.
                moveUpSpeed: 15,
                // Speed when diving (sinAngle = -1). Defaults to moveSpeed if omitted.
                moveDownSpeed: 22,
                // Distance from the current target at which a new patrol target is selected.
                arriveThreshold: 6,
                // World-unit radius within which the dino triggers flee behaviour.
                fleeRange: 25,
                // Flee target is placed this many units away from the dino (should be > fleeRange).
                fleeDistance: 30,
                // Multiplier applied to the current base speed when fleeing (e.g. 2 = double speed).
                fleeSpeedMultiplier: 1.6,
                // Units/s² rate at which speed ramps toward the target speed (0 = instant).
                speedIncrease: 8,
                // Plane turn rate in radians/second — lower = wider turns, more like a real plane.
                planeTurnRate: 1.0,
                // Speed at which the X roll animates to its target (0 or 180°) in radians/second.
                planeRollSpeed: 4,
                // Optional: restrict to a named zone; leave null for full-map patrol.
                // Set zoneId to 'flyZone' (or any matching zone name) in the Tiled object.
                zoneId: 'flyZone',
                // Propeller node in the GLB
                propellerNodeName: 'propeller',
                propellerSpeed: 22,
                propellerAxis: 'z',
                debugLogging: false
            },
            collisionRect: {
                width: 6,
                height: 2,
                offset: [0, 0],
                angle: 0,
                debugDepth: 0.5
            },
            coinValue: 5,
            destruction: {
                explosionDuration: 1.8,
                explosionScale: 5,
                maxExplosionDamage: 500,
                maxExplosionDistance: 8,
                particleCount: 20,
                debrisCount: 15,
                explosionColors: [0xe6db00, 0x10233d, 0xb95903, 0x6f6f6f],
                effectOffsetY: -0.5,
                debrisStartDelay: 0.01,
                visualHideDelay: 0.01,
                debrisForceScale: 0.8,
                debrisGravityMultiplier: 3,
                debrisLinearDamping: 0.978,
                debrisWeightMin: 0.8,
                debrisWeightMax: 1.6,
                particleSpeedMin: 0.5,
                particleSpeedMax: 1,
                upwardBias: 0.3,
                gravity: 13,
                emissionDuration: 1,
                spawnSpreadX: 4.5
            }
        },
        catapult: {
            // No model yet — CatapultObject builds placeholder geometry from primitives.
            modelPath: null,
            pickupable: false,
            draggable: false,
            mouthDrag: false,
            respawn: false,
            maxHealth: 1000000,
            showHealthBar: false,
            indestructible: true,
            snapToGroundOnLoad: true,
            groundOffset: 0,
            rotation: [0, 0, 0],
            modelScale: 1,
            // Catapult-specific behaviour.
            catapult: {
                // World-space rest height of the basket above the catapult base.
                restY: 3.5,
                // Detection radius (world units) around the basket for incoming objects.
                basketRadius: 1.8,
                // Pull mechanics.
                maxPullDistance: 10,
                // Grab activation: dino must be within this distance of basket while loaded.
                grabActivationRadius: 2.5,
                // Launch power range.
                minLaunchPower: 80,
                maxLaunchPower: 400,
                // How fast the basket springs back to rest when released.
                returnSpringStrength: 18,
                // Object types accepted in the basket.
                acceptedObjectTypes: ['block', 'cow', 'statue', 'statuewarrior', 'oildrum', 'canister', 'ball', 'shark', 'couch'],
                // Optional debug log on launch.
                debugLog: false
            }
        }
    },

    COLORS: {
        // Top sky gradient color.
        SKY_TOP: '#00499c',
        // Bottom sky gradient color.
        SKY_BOTTOM: '#baf8ff',
        // Solid color rendered below the authored level bottom when the camera can see past it.
        LEVEL_BELOW: '#343230',
    }
};
