import { CONFIG } from './config.js';
import { LevelObject } from './LevelObject.js';
import { VehicleObject } from './VehicleObject.js';
import { HumanObject } from './HumanObject.js';
import { TankObject } from './TankObject.js';
import { ChopperObject } from './ChopperObject.js';
import { GroundSamObject } from './GroundSamObject.js';
import { ZeppelinObject } from './ZeppelinObject.js';
import { BallObject } from './BallObject.js';
import { RingObject } from './RingObject.js';
import { RingHorizontalObject } from './RingHorizontalObject.js';
import { MissionCalloutObject } from './MissionCalloutObject.js';
import { CollectibleObject } from './CollectibleObject.js';
import { PlaneObject } from './PlaneObject.js';
import { SharkObject } from './SharkObject.js';
import { CatapultObject } from './CatapultObject.js';

function normalizeTypeName(value) {
    return String(value || '').trim().toLowerCase();
}

function getNumericOverride(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}

export class LevelObjectFactory {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.loadingManager = options.loadingManager;
        this.audioManager = options.audioManager || null;
        // MissionManager reference — injected so mission world objects can call back.
        this.missionManager = options.missionManager || null;
    }

    getConfigForType(type) {
        const normalizedType = normalizeTypeName(type);
        return CONFIG.LEVEL_OBJECT_TYPES?.[normalizedType] || null;
    }

    createLevelObject(type, options = {}) {
        const normalizedType = normalizeTypeName(type);
        const baseConfig = this.getConfigForType(normalizedType);
        if (!baseConfig) {
            return null;
        }

        const propertyOverrides = options.propertyOverrides || {};
        const mergedConfig = {
            ...baseConfig,
            pickupable: typeof propertyOverrides.pickupable === 'boolean'
                ? propertyOverrides.pickupable
                : baseConfig.pickupable,
            draggable: typeof propertyOverrides.draggable === 'boolean'
                ? propertyOverrides.draggable
                : baseConfig.draggable,
            weight: getNumericOverride(propertyOverrides.weight, baseConfig.weight),
            maxHealth: getNumericOverride(propertyOverrides.maxHealth, baseConfig.maxHealth),
            showHealthBar: typeof propertyOverrides.showHealthBar === 'boolean'
                ? propertyOverrides.showHealthBar
                : baseConfig.showHealthBar,
            canHitAirTargets: typeof propertyOverrides.canHitAirTargets === 'boolean'
                ? propertyOverrides.canHitAirTargets
                : baseConfig.canHitAirTargets,
            isAirTarget: typeof propertyOverrides.isAirTarget === 'boolean'
                ? propertyOverrides.isAirTarget
                : baseConfig.isAirTarget,
            airTargetImpactDamage: getNumericOverride(
                propertyOverrides.airTargetImpactDamage,
                baseConfig.airTargetImpactDamage
            ),
            minimumHeightDamage: getNumericOverride(
                propertyOverrides.minimumHeightDamage,
                baseConfig.minimumHeightDamage
            ),
            impactResistance: getNumericOverride(propertyOverrides.impactResistance, baseConfig.impactResistance),
            patrolWidth: getNumericOverride(propertyOverrides.patrolWidth, baseConfig.patrolWidth),
            patrolHeight: getNumericOverride(propertyOverrides.patrolHeight, baseConfig.patrolHeight),
            moveSpeed: getNumericOverride(propertyOverrides.moveSpeed, baseConfig.moveSpeed),
            arriveThreshold: getNumericOverride(propertyOverrides.arriveThreshold, baseConfig.arriveThreshold),
            acceleration: getNumericOverride(propertyOverrides.acceleration, baseConfig.acceleration),
            movementDamping: getNumericOverride(propertyOverrides.movementDamping, baseConfig.movementDamping),
            // Placement is capability-driven so future object types opt in with one config flag.
            snapToGroundOnLoad: typeof propertyOverrides.snapToGroundOnLoad === 'boolean'
                ? propertyOverrides.snapToGroundOnLoad
                : baseConfig.snapToGroundOnLoad === true,
            fallOnLoad: typeof propertyOverrides.fallOnLoad === 'boolean'
                ? propertyOverrides.fallOnLoad
                : baseConfig.fallOnLoad === true,
            walkSpeed: getNumericOverride(propertyOverrides.walkSpeed, baseConfig.walkSpeed),
            walkAnimationSpeed: getNumericOverride(
                propertyOverrides.walkAnimationSpeed,
                baseConfig.walkAnimationSpeed
            ),
            runSpeed: getNumericOverride(propertyOverrides.runSpeed, baseConfig.runSpeed),
            runAnimationSpeed: getNumericOverride(propertyOverrides.runAnimationSpeed, baseConfig.runAnimationSpeed),
            fleeRange: getNumericOverride(propertyOverrides.fleeRange, baseConfig.fleeRange),
            fleeTurnDelay: getNumericOverride(propertyOverrides.fleeTurnDelay, baseConfig.fleeTurnDelay),
            walkDirection: getNumericOverride(propertyOverrides.walkDirection, baseConfig.walkDirection),
            facingDirection: getNumericOverride(propertyOverrides.facingDirection, baseConfig.facingDirection),
            respawn: typeof propertyOverrides.respawn === 'boolean'
                ? propertyOverrides.respawn
                : baseConfig.respawn,
            respawnDelay: getNumericOverride(propertyOverrides.respawnDelay, baseConfig.respawnDelay)
        };
        const commonOptions = {
            id: options.id ?? `${normalizedType}-${Date.now()}`,
            type: normalizedType,
            config: mergedConfig,
            scene: this.scene,
            loadingManager: this.loadingManager,
            spawnData: options.spawnData,
            audioManager: options.audioManager || this.audioManager,
            // Raw Tiled properties forwarded as-is so subclasses can read missionId etc.
            rawProperties: propertyOverrides,
            missionManager: this.missionManager
        };

        if (normalizedType === 'groundsam') {
            return new GroundSamObject(commonOptions);
        }

        if (normalizedType === 'tank' || mergedConfig.behavior === 'tank') {
            return new TankObject(commonOptions);
        }

        if (mergedConfig.behavior === 'human') {
            return new HumanObject(commonOptions);
        }

        // Boss dyno removed for Dyno Sky — fall back to generic LevelObject

        if (normalizedType === 'car' || mergedConfig.behavior === 'vehicle') {
            return new VehicleObject(commonOptions);
        }

        if (normalizedType === 'chopper') {
            return new ChopperObject(commonOptions);
        }

        if (normalizedType === 'plane' || mergedConfig.behavior === 'plane') {
            return new PlaneObject(commonOptions);
        }

        if (normalizedType === 'shark' || mergedConfig.behavior === 'shark') {
            return new SharkObject(commonOptions);
        }

        if (normalizedType === 'ring') {
            return new RingObject(commonOptions);
        }

        if (normalizedType === 'ringhorizontal') {
            return new RingHorizontalObject(commonOptions);
        }

        if (normalizedType === 'zeppelin') {
            return new ZeppelinObject(commonOptions);
        }

        if (normalizedType === 'ball') {
            return new BallObject(commonOptions);
        }

        if (mergedConfig.behavior === 'collectible') {
            return new CollectibleObject(commonOptions);
        }

        // Mission world objects — no GLB, purely logical or sprite-based.
        if (normalizedType === 'missioncallout') {
            return new MissionCalloutObject(commonOptions);
        }

        if (normalizedType === 'catapult') {
            return new CatapultObject(commonOptions);
        }

        return new LevelObject(commonOptions);
    }
}
