import * as THREE from 'three';
import { LevelObject, LEVEL_OBJECT_STATES, levelObjectRectsIntersect } from './LevelObject.js';
import { CONFIG } from './config.js';

const TMP_VECTOR_A = new THREE.Vector2();
const TMP_VECTOR_B = new THREE.Vector2();

export class VehicleObject extends LevelObject {
    constructor(options) {
        super(options);

        this.physicsConfig = null;
        this.bodyHalfExtents = new THREE.Vector2(1, 0.5);
        this.bodyOffset = new THREE.Vector2();
        this.centerOfMassOffset = new THREE.Vector2();
        this.mass = Math.max(this.weight, 1);
        this.inverseMass = 1 / this.mass;
        this.momentOfInertia = 1;
        this.inverseInertia = 1;
        this.restitution = 0.15;
        this.friction = 0.8;
        this.angularDamping = 0.92;
        this.linearDamping = 0.98;
        this.groundLinearDamping = 0.94;
        this.groundAngularDamping = 0.88;
        this.settleLinearThreshold = 0.05;
        this.settleAngularThreshold = 0.03;
        this.settleTimeRequired = 0.5;
        this.maxAngularSpeed = 4;
        this.maxGroundAngularAcceleration = 18;
        this.sleeping = false;
        this.grounded = false;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
        this.canHitAirTargets = this.config.canHitAirTargets === true;
        this.airTargetImpactDamage = Math.max(0, Number(this.config.airTargetImpactDamage ?? 0));
    }

    async load() {
        await super.load();
        this.initializeVehiclePhysics();
        this.setupDebugCollisionShell();
        return this;
    }

    setupDebugCollisionShell() {
        this.disposeDebugCollisionShell();

        if (!CONFIG.LEVEL_OBJECTS?.debugRenderCollisionShell) {
            return;
        }

        const width = this.bodyHalfExtents.x * 2;
        const height = this.bodyHalfExtents.y * 2;
        const depth = Number.isFinite(this.configuredCollisionRect?.debugDepth)
            ? Math.max(this.configuredCollisionRect.debugDepth, 0.01)
            : 0.8;
        const centerMarkerRadius = Number.isFinite(this.physicsConfig?.debugCenterMarkerRadius)
            ? this.physicsConfig.debugCenterMarkerRadius
            : 0.14;

        const shell = new THREE.Group();
        shell.name = `${this.type}:${this.id}:CollisionBody`;
        shell.renderOrder = 9999;

        const body = new THREE.Mesh(
            new THREE.BoxGeometry(width, height, depth),
            this.createDebugCollisionMaterial()
        );
        body.position.set(this.bodyOffset.x, this.bodyOffset.y, 0);
        body.renderOrder = 9999;
        shell.add(body);

        const centerMarker = new THREE.Mesh(
            new THREE.SphereGeometry(centerMarkerRadius, 8, 8),
            new THREE.MeshBasicMaterial({
                color: 0xffdd33,
                transparent: true,
                opacity: 0.9,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        centerMarker.position.set(
            this.bodyOffset.x + this.centerOfMassOffset.x,
            this.bodyOffset.y + this.centerOfMassOffset.y,
            0
        );
        centerMarker.renderOrder = 10000;
        shell.add(centerMarker);

        this.debugCollisionShell = shell;
        this.sceneObject.add(this.debugCollisionShell);
        this.syncDebugCollisionShellTransform();
    }

    syncDebugCollisionShellTransform() {
        if (!this.debugCollisionShell || !this.sceneObject) {
            return;
        }
        const s = this.sceneObject.scale.x || 1;
        this.debugCollisionShell.scale.setScalar(1 / s);
        this.debugCollisionShell.position.set(0, this.baseGroundOffset / s, 0);
    }

    initializeVehiclePhysics() {
        const physicsConfig = this.config.physics || {};
        const collisionRect = this.configuredCollisionRect;
        const derivedWidth = Math.max(this.meshBounds.maxX - this.meshBounds.minX, 0.1);
        const derivedHeight = Math.max(this.meshBounds.maxY - this.meshBounds.minY, 0.1);
        const derivedCenterX = (this.meshBounds.minX + this.meshBounds.maxX) * 0.5;
        const derivedCenterY = (this.meshBounds.minY + this.meshBounds.maxY) * 0.5;
        const resolvedWidth = Number.isFinite(collisionRect?.width) ? collisionRect.width : derivedWidth;
        const resolvedHeight = Number.isFinite(collisionRect?.height) ? collisionRect.height : derivedHeight;
        const resolvedOffsetX = Number.isFinite(collisionRect?.offsetX) ? collisionRect.offsetX : derivedCenterX;
        const resolvedOffsetY = Number.isFinite(collisionRect?.offsetY) ? collisionRect.offsetY : derivedCenterY;

        this.physicsConfig = physicsConfig;
        this.bodyHalfExtents.set(
            Math.max(resolvedWidth, 0.1) * 0.5,
            Math.max(resolvedHeight, 0.1) * 0.5
        );
        this.bodyOffset.set(
            resolvedOffsetX,
            resolvedOffsetY
        );
        this.centerOfMassOffset.set(
            Number.isFinite(physicsConfig.centerOfMassOffset?.[0]) ? physicsConfig.centerOfMassOffset[0] : 0,
            Number.isFinite(physicsConfig.centerOfMassOffset?.[1]) ? physicsConfig.centerOfMassOffset[1] : 0
        );

        this.mass = Math.max(
            Number.isFinite(physicsConfig.mass) ? physicsConfig.mass : Math.max(this.weight, 1),
            0.01
        );
        this.inverseMass = 1 / this.mass;
        this.restitution = Number.isFinite(physicsConfig.restitution) ? physicsConfig.restitution : 0.15;
        this.friction = Number.isFinite(physicsConfig.friction) ? physicsConfig.friction : 0.8;
        this.angularDamping = Number.isFinite(physicsConfig.angularDamping) ? physicsConfig.angularDamping : 0.92;
        this.linearDamping = Number.isFinite(physicsConfig.linearDamping) ? physicsConfig.linearDamping : 0.98;
        this.groundLinearDamping = Number.isFinite(physicsConfig.groundLinearDamping)
            ? physicsConfig.groundLinearDamping
            : 0.94;
        this.groundAngularDamping = Number.isFinite(physicsConfig.groundAngularDamping)
            ? physicsConfig.groundAngularDamping
            : 0.88;
        this.settleLinearThreshold = Number.isFinite(physicsConfig.settleLinearThreshold)
            ? physicsConfig.settleLinearThreshold
            : 0.05;
        this.settleAngularThreshold = Number.isFinite(physicsConfig.settleAngularThreshold)
            ? physicsConfig.settleAngularThreshold
            : 0.03;
        this.settleTimeRequired = Number.isFinite(physicsConfig.settleTimeRequired)
            ? physicsConfig.settleTimeRequired
            : 0.5;
        this.maxAngularSpeed = Number.isFinite(physicsConfig.maxAngularSpeed)
            ? physicsConfig.maxAngularSpeed
            : 4;
        this.maxGroundAngularAcceleration = Number.isFinite(physicsConfig.maxGroundAngularAcceleration)
            ? physicsConfig.maxGroundAngularAcceleration
            : 18;

        const width = this.bodyHalfExtents.x * 2;
        const height = this.bodyHalfExtents.y * 2;
        this.momentOfInertia = Math.max((this.mass * ((width * width) + (height * height))) / 12, 0.001);
        this.inverseInertia = 1 / this.momentOfInertia;
        this.sleeping = false;
        this.grounded = false;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
    }

    pickUp(dino, socket, options = {}) {
        const didPickUp = super.pickUp(dino, socket, options);
        if (!didPickUp) {
            return false;
        }

        this.sleeping = false;
        this.grounded = false;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
        return true;
    }

    drop(initialVelocity = new THREE.Vector3(), options = {}) {
        const didDrop = super.drop(initialVelocity, options);
        if (!didDrop) {
            return false;
        }

        this.sleeping = false;
        this.grounded = false;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
        this.polygonTerrainContactLastFrame = false;
        return true;
    }

    startDrag(dino, grabPointName) {
        const didStartDrag = super.startDrag(dino, grabPointName);
        if (!didStartDrag) {
            return false;
        }

        this.sleeping = false;
        this.grounded = false;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
        return true;
    }

    releaseDrag() {
        const didRelease = super.releaseDrag();
        if (!didRelease) {
            return false;
        }

        this.sleeping = false;
        this.grounded = false;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
        return true;
    }

    getBodyGroundProbeY(level, anchorY = this.container.position.y, rotation = this.currentGroundAngle) {
        const tileHeight = Math.max(level?.tileHeight ?? 1, 0.001);
        let highestBodyY = anchorY + this.baseGroundOffset;

        for (const corner of this.getLocalBodyCorners()) {
            const rotatedCorner = this.getRotatedLocalPointAtAngle(corner, rotation, TMP_VECTOR_A);
            highestBodyY = Math.max(highestBodyY, anchorY + this.baseGroundOffset + rotatedCorner.y);
        }

        // Initial placement should be driven by the authored physics rectangle, not by mesh
        // bounds. Probe from just above that rectangle so the rect bottom lands on the road.
        return highestBodyY + (tileHeight * 0.5);
    }

    getGroundAlignedWorldY(worldY) {
        return Number.isFinite(worldY) ? worldY : this.container.position.y;
    }

    resolveBodyGroundSupport(level, probeY, rotation = this.currentGroundAngle) {
        if (!level?.getGroundInfoAtWorld) {
            return null;
        }

        const bottomCorners = this.getLocalBodyCorners().slice(0, 2);
        const samples = [];
        let supportSample = null;

        for (const localPoint of bottomCorners) {
            const rotatedPoint = this.getRotatedLocalPointAtAngle(localPoint, rotation, new THREE.Vector2());
            const sampleX = this.container.position.x + rotatedPoint.x;
            const groundInfo = level.getGroundInfoAtWorld(sampleX, probeY);
            if (!groundInfo) {
                continue;
            }

            const requiredAnchorY = this.getGroundAlignedWorldY(
                groundInfo.surfaceHeight - this.baseGroundOffset - rotatedPoint.y
            );
            const sample = {
                sampleX,
                rotatedPoint,
                groundInfo,
                requiredAnchorY
            };
            samples.push(sample);

            if (!supportSample || requiredAnchorY > supportSample.requiredAnchorY) {
                supportSample = sample;
            }
        }

        if (!supportSample) {
            return null;
        }

        const leftSample = samples.reduce((best, sample) => (
            sample.sampleX < best.sampleX ? sample : best
        ), samples[0]);
        const rightSample = samples.reduce((best, sample) => (
            sample.sampleX > best.sampleX ? sample : best
        ), samples[0]);
        const sampleWidth = rightSample.sampleX - leftSample.sampleX;
        const supportAngle = Math.abs(sampleWidth) > 0.0001
            ? Math.atan2(
                rightSample.groundInfo.surfaceHeight - leftSample.groundInfo.surfaceHeight,
                sampleWidth
            )
            : (supportSample.groundInfo.angle ?? 0);

        return {
            anchorY: supportSample.requiredAnchorY,
            supportSurfaceHeight: supportSample.groundInfo.surfaceHeight,
            angle: supportAngle,
            leftSurfaceHeight: leftSample.groundInfo.surfaceHeight,
            rightSurfaceHeight: rightSample.groundInfo.surfaceHeight
        };
    }

    getAirDropGroundProbeY(level, previousY = this.container.position.y) {
        return this.getBodyBottomProbeY(level, Math.max(previousY, this.container.position.y), this.currentGroundAngle);
    }

    getGroundQuerySlop(level) {
        return Math.max(this.getAirDropImpactThreshold(), (level?.tileHeight ?? 1) * 0.02, 0.03);
    }

    getGroundContactProbeReach(level) {
        const tileHeight = Math.max(level?.tileHeight ?? 1, 0.001);
        return Math.max(this.getGroundQuerySlop(level), Math.min(tileHeight * 0.25, 0.5));
    }

    getBodyBottomProbeY(level, anchorY = this.container.position.y, rotation = this.currentGroundAngle) {
        let highestBottomY = Number.NEGATIVE_INFINITY;

        for (const corner of this.getLocalBodyCorners().slice(0, 2)) {
            const rotatedCorner = this.getRotatedLocalPointAtAngle(corner, rotation, TMP_VECTOR_A);
            highestBottomY = Math.max(highestBottomY, anchorY + this.baseGroundOffset + rotatedCorner.y);
        }

        return highestBottomY + this.getGroundContactProbeReach(level);
    }

    resolveBodyGroundSupportDownward(
        level,
        previousAnchorY = this.container.position.y,
        rotation = this.currentGroundAngle,
        options = {}
    ) {
        if (!level?.getGroundInfoAtWorld && !level?.getGroundInfoBelowWorld) {
            return null;
        }

        const querySlop = options.querySlop ?? this.getGroundQuerySlop(level);
        const probeReach = options.probeReach ?? this.getGroundContactProbeReach(level);
        const probeAnchorY = Math.max(previousAnchorY, this.container.position.y);
        const bottomCorners = this.getLocalBodyCorners().slice(0, 2);
        const samples = [];
        let supportSample = null;
        let hasImpact = false;

        for (const localPoint of bottomCorners) {
            const rotatedPoint = this.getRotatedLocalPointAtAngle(localPoint, rotation, new THREE.Vector2());
            const sampleX = this.container.position.x + rotatedPoint.x;
            const probeY = probeAnchorY + this.baseGroundOffset + rotatedPoint.y + probeReach;
            const groundInfo = this.getGroundInfoBelow(level, sampleX, probeY);
            if (!groundInfo) {
                continue;
            }

            const worldY = this.container.position.y + this.baseGroundOffset + rotatedPoint.y;
            const requiredAnchorY = this.getGroundAlignedWorldY(
                groundInfo.surfaceHeight - this.baseGroundOffset - rotatedPoint.y
            );
            const sample = {
                sampleX,
                rotatedPoint,
                groundInfo,
                requiredAnchorY
            };
            samples.push(sample);
            hasImpact = hasImpact || worldY <= groundInfo.surfaceHeight + querySlop;

            if (!supportSample || requiredAnchorY > supportSample.requiredAnchorY) {
                supportSample = sample;
            }
        }

        if (!supportSample) {
            return null;
        }

        const leftSample = samples.reduce((best, sample) => (
            sample.sampleX < best.sampleX ? sample : best
        ), samples[0]);
        const rightSample = samples.reduce((best, sample) => (
            sample.sampleX > best.sampleX ? sample : best
        ), samples[0]);
        const sampleWidth = rightSample.sampleX - leftSample.sampleX;
        const supportAngle = Math.abs(sampleWidth) > 0.0001
            ? Math.atan2(
                rightSample.groundInfo.surfaceHeight - leftSample.groundInfo.surfaceHeight,
                sampleWidth
            )
            : (supportSample.groundInfo.angle ?? 0);

        return {
            groundInfo: supportSample.groundInfo,
            anchorY: supportSample.requiredAnchorY,
            supportSurfaceHeight: supportSample.groundInfo.surfaceHeight,
            angle: supportAngle,
            hasImpact
        };
    }

    resolveSimpleAirDropLanding(level, previousPosition = this.container.position) {
        if (!level?.getGroundInfoAtWorld && !level?.getGroundInfoBelowWorld) {
            return null;
        }

        const support = this.resolveBodyGroundSupportDownward(level, previousPosition.y, this.currentGroundAngle);
        if (!support) {
            return null;
        }

        const finalAngle = this.getGroundAngleForFacing(
            support.angle ?? 0,
            this.simpleAirDropFacingDirection || this.getFacingDirection()
        );
        // After picking the slope angle, resolve Y again with the rectangle already rotated to
        // that angle; otherwise a car that first touches with one corner can settle off-slope.
        const finalSupport = this.resolveBodyGroundSupportDownward(
            level,
            support.anchorY,
            finalAngle,
            {
                probeReach: this.getGroundContactProbeReach(level)
            }
        ) || support;

        return {
            groundInfo: finalSupport.groundInfo,
            anchorY: finalSupport.anchorY,
            angle: support.angle ?? 0,
            hasImpact: support.hasImpact
        };
    }

    completeSimpleAirDropLanding(landing, impactSpeed = 0, fallDistance = 0) {
        if (typeof super.completeSimpleAirDropLanding === 'function') {
            super.completeSimpleAirDropLanding(landing, impactSpeed, fallDistance);
        } else if (landing) {
            this.container.position.y = landing.anchorY;
            this.currentGroundAngle = landing.angle ?? this.currentGroundAngle;
            this.restoreGroundLayerZ();
            this.releaseDropVisualPose?.();
            this.applyGroundAlignment();
            this.applyLandingDamage?.(impactSpeed, fallDistance);
        }
        // Keep vehicles awake after air-drop landing so a car that lands on a slope can enter
        // the same natural slide path as a car released from mouth-dragging on that slope.
        this.sleeping = false;
        this.grounded = true;
        this.sleepTimer = 0;
        this.contactPersistence = 0;
        this.gravityEnabled = false;
    }

    snapToGround(level) {
        if (!level) {
            return false;
        }

        const tileHeight = Math.max(level.tileHeight ?? 1, 0.001);
        const maxSnapDistance = tileHeight * Math.max(
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.maxSnapDistanceTiles)
                ? CONFIG.LEVEL_OBJECTS.maxSnapDistanceTiles
                : 3,
            0
        );
        const originalY = this.container.position.y;
        const probeStartY = this.getBodyGroundProbeY(level, originalY);
        const probeLift = probeStartY - originalY;
        const support = this.resolveBodyGroundSupport(level, probeStartY);
        if (!support) {
            console.warn(`[VehicleObject] No ground found for ${this.getDebugLabel()} near y=${originalY.toFixed(2)}.`);
            return false;
        }

        const snapDistance = probeStartY - support.anchorY;
        if (snapDistance > maxSnapDistance + probeLift) {
            console.warn(
                `[VehicleObject] Ground snap skipped for ${this.getDebugLabel()}; ` +
                `surface was ${snapDistance.toFixed(2)} units below spawn.`
            );
            return false;
        }

        this.currentGroundAngle = support.angle ?? 0;
        const settledProbeY = Math.max(
            probeStartY,
            this.getBodyGroundProbeY(level, originalY, this.currentGroundAngle)
        );
        const settledSupport = this.resolveBodyGroundSupport(level, settledProbeY, this.currentGroundAngle) || support;
        this.restoreGroundLayerZ();
        this.container.position.y = settledSupport.anchorY;
        this.applyGroundAlignment();

        this.sleeping = true;
        this.grounded = true;
        this.sleepTimer = this.settleTimeRequired;
        this.contactPersistence = this.settleTimeRequired;
        this.gravityEnabled = false;
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.state = LEVEL_OBJECT_STATES.IDLE;
        return true;
    }

    getLocalBodyCenter(target = new THREE.Vector2()) {
        return target.copy(this.bodyOffset).add(this.centerOfMassOffset);
    }

    getRotatedLocalPoint(localPoint, target = new THREE.Vector2()) {
        const sin = Math.sin(this.currentGroundAngle);
        const cos = Math.cos(this.currentGroundAngle);
        return target.set(
            (localPoint.x * cos) - (localPoint.y * sin),
            (localPoint.x * sin) + (localPoint.y * cos)
        );
    }

    getWorldPoint(localPoint, target = new THREE.Vector2()) {
        this.getRotatedLocalPoint(localPoint, target);
        target.x += this.container.position.x;
        target.y += this.container.position.y + this.baseGroundOffset;
        return target;
    }

    getLocalBodyCorners() {
        const centerX = this.bodyOffset.x;
        const centerY = this.bodyOffset.y;
        const halfWidth = this.bodyHalfExtents.x;
        const halfHeight = this.bodyHalfExtents.y;

        return [
            new THREE.Vector2(centerX - halfWidth, centerY - halfHeight),
            new THREE.Vector2(centerX + halfWidth, centerY - halfHeight),
            new THREE.Vector2(centerX + halfWidth, centerY + halfHeight),
            new THREE.Vector2(centerX - halfWidth, centerY + halfHeight)
        ];
    }

    getWorldBodyCorners() {
        return this.getLocalBodyCorners().map((corner) => this.getWorldPoint(corner, new THREE.Vector2()));
    }

    getWorldCenterOfMass(target = new THREE.Vector2()) {
        const localCenter = this.getLocalBodyCenter(TMP_VECTOR_A);
        this.getRotatedLocalPoint(localCenter, target);
        target.x += this.container.position.x;
        target.y += this.container.position.y + this.baseGroundOffset;
        return target;
    }

    getExplosionDamageRect() {
        // Vehicles use their authored gameplay body rectangle (with current ground angle),
        // so blast falloff is measured from the real collision footprint instead of center.
        const worldCenter = this.getWorldCenterOfMass(new THREE.Vector2());
        return {
            centerX: worldCenter.x,
            centerY: worldCenter.y,
            halfWidth: Math.max(this.bodyHalfExtents.x, 0.001),
            halfHeight: Math.max(this.bodyHalfExtents.y, 0.001),
            angle: this.currentGroundAngle
        };
    }

    isAirTargetImpactActive() {
        if (
            !this.canHitAirTargets ||
            this.isDestroyed ||
            this.markedForRemoval ||
            this.state === LEVEL_OBJECT_STATES.CARRIED ||
            this.state === LEVEL_OBJECT_STATES.GRABBED ||
            this.state === LEVEL_OBJECT_STATES.DRAGGED ||
            this.state === LEVEL_OBJECT_STATES.DESTROYED ||
            this.sleeping ||
            this.grounded ||
            this.isBeingDragged?.()
        ) {
            return false;
        }

        // Air target hits are intentionally limited to thrown/dropped airborne motion. Resting
        // objects should not act like landmines against hovering enemies that pass nearby.
        return (
            this.gravityEnabled ||
            this.state === LEVEL_OBJECT_STATES.FALLING ||
            this.velocity.lengthSq() > 0.0001
        );
    }

    isValidAirImpactTarget(target) {
        if (
            !target ||
            target === this ||
            target.isDestroyed ||
            target.markedForRemoval ||
            target.state === LEVEL_OBJECT_STATES.DESTROYED ||
            target.destroyedFalling ||
            typeof target.applyDamage !== 'function'
        ) {
            return false;
        }

        // Generic air-target filter: configs may opt in explicitly, while current airborne
        // level enemies such as choppers are naturally non-ground objects.
        return target.config?.isAirTarget === true || target.isGroundObject === false;
    }

    checkAirTargetImpacts(targets = []) {
        if (!this.isAirTargetImpactActive() || !Array.isArray(targets) || !targets.length) {
            return null;
        }

        const selfRect = this.getWorldCollisionRect?.() || this.getExplosionDamageRect?.();
        if (!selfRect) {
            return null;
        }

        for (const target of targets) {
            if (!this.isValidAirImpactTarget(target)) {
                continue;
            }

            const targetRect = target.getWorldCollisionRect?.() || target.getExplosionDamageRect?.();
            if (!targetRect || !levelObjectRectsIntersect(selfRect, targetRect)) {
                continue;
            }

            // Direct impact damage is separate from explosion falloff damage: the hit target
            // gets this guaranteed collision hit first, then this vehicle explodes normally.
            if (this.airTargetImpactDamage > 0) {
                target.applyDamage(this.airTargetImpactDamage, 'airImpact');
            }
            this.destroy();
            return target;
        }

        return null;
    }

    getPointVelocity(localPoint, target = new THREE.Vector2()) {
        const worldOffset = this.getRotatedLocalPoint(localPoint, TMP_VECTOR_A);
        target.set(
            this.velocity.x + (-this.angularVelocity * worldOffset.y),
            this.velocity.y + (this.angularVelocity * worldOffset.x)
        );
        return target;
    }

    applyDragConstraint(stepDelta) {
        if (!this.isBeingDragged() || !this.draggedBy?.getMouthWorldPosition) {
            return;
        }

        // If object exceeds max drag weight, don't apply any constraint - it stays completely still
        if (this.weight > this.draggedBy.maxDragWeight) {
            return;
        }

        const grabLocalPoint = this.getGrabPointLocalOffset(this.dragGrabPointName, TMP_VECTOR_A);
        const grabWorld = this.getWorldPoint(grabLocalPoint, TMP_VECTOR_B);
        const mouthWorld = this.getDragTargetWorldPosition(new THREE.Vector3());
        const delta = new THREE.Vector2(
            mouthWorld.x - grabWorld.x,
            mouthWorld.y - grabWorld.y
        );

        if (delta.lengthSq() <= 0.000001) {
            return;
        }

        // Partial constraint model: only the chosen grab point is pulled to the mouth. The
        // object's center and angle remain physical, so ground contacts and gravity create tilt.
        this.container.position.x += delta.x;
        this.container.position.y += delta.y;

        this.applyGroundAlignment();
    }

    getRotatedLocalPointAtAngle(localPoint, angle, target = new THREE.Vector2()) {
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        return target.set(
            (localPoint.x * cos) - (localPoint.y * sin),
            (localPoint.x * sin) + (localPoint.y * cos)
        );
    }

    getNearestAngleForLocalYOffset(localOffset, targetY, currentAngle = this.currentGroundAngle) {
        const radius = Math.hypot(localOffset.x, localOffset.y);
        if (radius <= 0.0001) {
            return currentAngle;
        }

        const phase = Math.atan2(localOffset.y, localOffset.x);
        const normalizedTarget = targetY / radius;
        let candidates;

        if (normalizedTarget <= -1) {
            candidates = [(-Math.PI * 0.5) - phase];
        } else if (normalizedTarget >= 1) {
            candidates = [(Math.PI * 0.5) - phase];
        } else {
            const base = Math.asin(normalizedTarget);
            candidates = [
                base - phase,
                Math.PI - base - phase
            ];
        }

        return candidates.reduce((best, candidate) => {
            const bestDelta = Math.abs(this.getShortestAngleDelta(currentAngle, best));
            const candidateDelta = Math.abs(this.getShortestAngleDelta(currentAngle, candidate));
            return candidateDelta < bestDelta ? candidate : best;
        }, candidates[0]);
    }

    getDraggedFreeBottomCornerLocalPoint(target = new THREE.Vector2()) {
        const grabLocalPoint = this.getGrabPointLocalOffset(this.dragGrabPointName, TMP_VECTOR_A);
        const bottomCorners = this.getLocalBodyCorners().slice(0, 2);
        let bestCorner = bottomCorners[0];
        let bestDistanceSq = -1;

        for (const corner of bottomCorners) {
            const distanceSq = corner.distanceToSquared(grabLocalPoint);
            if (distanceSq > bestDistanceSq) {
                bestCorner = corner;
                bestDistanceSq = distanceSq;
            }
        }

        return target.copy(bestCorner);
    }

    keepDraggedFreeCornerOnGround(level, stepDelta) {
        if (
            !this.isBeingDragged() ||
            !CONFIG.DINO_DRAG?.keepFreeCornerGrounded ||
            (!level?.getGroundInfoAtWorld && !level?.getGroundInfoBelowWorld)
        ) {
            return false;
        }

        const grabLocalPoint = this.getGrabPointLocalOffset(this.dragGrabPointName, new THREE.Vector2());
        const freeCornerLocalPoint = this.getDraggedFreeBottomCornerLocalPoint(new THREE.Vector2());
        const freeCornerWorld = this.getWorldPoint(freeCornerLocalPoint, new THREE.Vector2());
        const groundInfo = this.getGroundInfoBelow(
            level,
            freeCornerWorld.x,
            freeCornerWorld.y + this.getGroundContactProbeReach(level)
        );
        if (!groundInfo) {
            return false;
        }

        const gap = freeCornerWorld.y - groundInfo.surfaceHeight;
        const slop = Number.isFinite(CONFIG.DINO_DRAG?.freeCornerGroundSlop)
            ? CONFIG.DINO_DRAG.freeCornerGroundSlop
            : 0.03;
        if (gap <= slop) {
            return false;
        }

        const grabWorld = this.getWorldPoint(grabLocalPoint, new THREE.Vector2());
        const cornerOffset = new THREE.Vector2().copy(freeCornerLocalPoint).sub(grabLocalPoint);
        const targetCornerY = groundInfo.surfaceHeight - grabWorld.y;
        const nextAngle = this.getNearestAngleForLocalYOffset(
            cornerOffset,
            targetCornerY,
            this.currentGroundAngle
        );
        const angleDelta = this.getShortestAngleDelta(this.currentGroundAngle, nextAngle);
        this.currentGroundAngle = nextAngle;

        const rotatedGrab = this.getRotatedLocalPointAtAngle(grabLocalPoint, this.currentGroundAngle, new THREE.Vector2());
        this.container.position.x = grabWorld.x - rotatedGrab.x;
        this.container.position.y = grabWorld.y - this.baseGroundOffset - rotatedGrab.y;
        if (stepDelta > 0) {
            this.angularVelocity += angleDelta / stepDelta;
            this.clampAngularVelocity();
        }
        this.applyGroundAlignment();
        return true;
    }

    applyImpulse(impulse, worldOffset) {
        this.velocity.x += impulse.x * this.inverseMass;
        this.velocity.y += impulse.y * this.inverseMass;
        this.angularVelocity += (
            (worldOffset.x * impulse.y) -
            (worldOffset.y * impulse.x)
        ) * this.inverseInertia;
        this.clampAngularVelocity();
    }

    clampAngularVelocity() {
        this.angularVelocity = THREE.MathUtils.clamp(
            this.angularVelocity,
            -this.maxAngularSpeed,
            this.maxAngularSpeed
        );
    }

    buildGroundContacts(level) {
        const contacts = [];
        const contactProbeReach = this.getGroundContactProbeReach(level);
        const penetrationBand = Number.isFinite(this.physicsConfig?.contactPenetrationBand)
            ? this.physicsConfig.contactPenetrationBand
            : 0.2;
        const bottomCorners = this.getLocalBodyCorners().slice(0, 2);

        // Ground support stays on the authored bottom edge of the collision rectangle. Each
        // contact ray still points downward, but it starts with a small recovery reach so a
        // corner that dipped into a slope can be pushed back out instead of falling through.
        for (const localPoint of bottomCorners) {
            const worldPoint = this.getWorldPoint(localPoint, new THREE.Vector2());
            const groundInfo = this.getGroundInfoBelow(level, worldPoint.x, worldPoint.y + contactProbeReach);
            if (!groundInfo) {
                continue;
            }

            const penetration = groundInfo.surfaceHeight - worldPoint.y;
            if (penetration < -0.03) {
                continue;
            }

            const normal = new THREE.Vector2(
                -Math.sin(groundInfo.angle ?? 0),
                Math.cos(groundInfo.angle ?? 0)
            ).normalize();
            const tangent = new THREE.Vector2(normal.y, -normal.x);

            contacts.push({
                localPoint: localPoint.clone(),
                worldPoint,
                groundInfo,
                penetration,
                normal,
                tangent
            });
        }

        if (!contacts.length) {
            return contacts;
        }

        const maxPenetration = Math.max(...contacts.map((contact) => contact.penetration));
        return contacts.filter((contact) => (
            contact.penetration >= (maxPenetration - penetrationBand)
        ));
    }

    resolveGroundPenetration(contacts) {
        if (!contacts.length) {
            return false;
        }

        const maxPenetration = Math.max(...contacts.map((contact) => contact.penetration));
        if (maxPenetration <= 0) {
            return false;
        }

        const penetrationSlop = Number.isFinite(this.physicsConfig?.penetrationSlop)
            ? this.physicsConfig.penetrationSlop
            : 0.001;
        // Ground should feel solid. Fully resolving the current overlap keeps the vehicle from
        // visibly dipping into the road before bouncing back out on the following frame.
        const correction = maxPenetration + penetrationSlop;
        this.container.position.y += correction;
        this.releaseDropVisualPose();
        this.applyGroundAlignment();
        return true;
    }

    applyContactImpulses(contacts) {
        if (!contacts.length) {
            return;
        }

        const activeContacts = contacts.filter((contact) => contact.penetration >= -0.01);
        if (!activeContacts.length) {
            return;
        }

        for (const contact of activeContacts) {
            const worldOffset = this.getRotatedLocalPoint(contact.localPoint, TMP_VECTOR_A);
            const pointVelocity = this.getPointVelocity(contact.localPoint, TMP_VECTOR_B);
            const normalSpeed = pointVelocity.dot(contact.normal);
            if (normalSpeed < 0) {
                const bounceThreshold = Number.isFinite(this.physicsConfig?.bounceSpeedThreshold)
                    ? this.physicsConfig.bounceSpeedThreshold
                    : 1.25;
                const effectiveRestitution = Math.abs(normalSpeed) >= bounceThreshold
                    ? this.restitution
                    : 0;
                const crossNormal = (worldOffset.x * contact.normal.y) - (worldOffset.y * contact.normal.x);
                const inverseEffectiveMass = this.inverseMass + ((crossNormal * crossNormal) * this.inverseInertia);
                const unclampedImpulseMagnitude = (
                    -(1 + effectiveRestitution) * normalSpeed
                ) / Math.max(inverseEffectiveMass, 0.0001);
                const maxBounceSpeed = Number.isFinite(this.physicsConfig?.maxBounceSpeed)
                    ? this.physicsConfig.maxBounceSpeed
                    : 7;
                const maxNormalImpulse = this.mass * maxBounceSpeed;
                const impulseMagnitude = Math.min(unclampedImpulseMagnitude, maxNormalImpulse);
                const normalImpulse = contact.normal.clone()
                    .multiplyScalar(impulseMagnitude / activeContacts.length);
                this.applyImpulse(normalImpulse, worldOffset);
            }

            const updatedPointVelocity = this.getPointVelocity(contact.localPoint, TMP_VECTOR_B);
            const tangentSpeed = updatedPointVelocity.dot(contact.tangent);
            if (Math.abs(tangentSpeed) <= 0.0001) {
                continue;
            }

            const crossTangent = (worldOffset.x * contact.tangent.y) - (worldOffset.y * contact.tangent.x);
            const inverseTangentMass = this.inverseMass + ((crossTangent * crossTangent) * this.inverseInertia);
            const rawFrictionImpulse = -tangentSpeed / Math.max(inverseTangentMass, 0.0001);
            const clampedFrictionImpulse = THREE.MathUtils.clamp(
                rawFrictionImpulse,
                -this.friction,
                this.friction
            );
            const frictionImpulse = contact.tangent.clone()
                .multiplyScalar(clampedFrictionImpulse / activeContacts.length);
            this.applyImpulse(frictionImpulse, worldOffset);
        }

        const maxPostImpactUpwardSpeed = Number.isFinite(this.physicsConfig?.maxPostImpactUpwardSpeed)
            ? this.physicsConfig.maxPostImpactUpwardSpeed
            : 6;
        this.velocity.y = Math.min(this.velocity.y, maxPostImpactUpwardSpeed);
    }

    applyGroundTorque(contacts, delta) {
        if (!contacts.length) {
            return;
        }

        const supportMinX = Math.min(...contacts.map((contact) => contact.worldPoint.x));
        const supportMaxX = Math.max(...contacts.map((contact) => contact.worldPoint.x));
        const centerOfMass = this.getWorldCenterOfMass(TMP_VECTOR_A);
        const supportCenterX = (supportMinX + supportMaxX) * 0.5;
        const leverArm = centerOfMass.x - supportCenterX;
        const minimumSupportWidth = Math.max(this.bodyHalfExtents.x * 0.6, 0.5);
        const supportWidth = Math.max(supportMaxX - supportMinX, minimumSupportWidth);
        const gravity = Number.isFinite(CONFIG.LEVEL_OBJECTS?.gravity)
            ? CONFIG.LEVEL_OBJECTS.gravity
            : 52;
        const tipTorqueFactor = Number.isFinite(this.physicsConfig?.tipTorqueFactor)
            ? this.physicsConfig.tipTorqueFactor
            : 1.6;
        const unclampedAngularAcceleration = ((-gravity * leverArm) / supportWidth) * tipTorqueFactor;
        const clampedAngularAcceleration = THREE.MathUtils.clamp(
            unclampedAngularAcceleration,
            -this.maxGroundAngularAcceleration,
            this.maxGroundAngularAcceleration
        );

        this.angularVelocity += clampedAngularAcceleration * delta;
        this.clampAngularVelocity();
    }

    applyGroundDamping(delta) {
        const frameFactor = Math.max(delta * 60, 0);
        this.velocity.x *= Math.pow(this.groundLinearDamping, frameFactor);
        this.velocity.y *= Math.pow(this.linearDamping, frameFactor);
        this.angularVelocity *= Math.pow(this.groundAngularDamping, frameFactor);
        this.clampAngularVelocity();
    }

    getRestGroundAngleFromContacts(contacts = []) {
        if (!contacts.length) {
            return null;
        }

        const sortedContacts = contacts
            .filter((contact) => contact?.worldPoint && contact?.groundInfo)
            .slice()
            .sort((a, b) => a.worldPoint.x - b.worldPoint.x);

        if (!sortedContacts.length) {
            return null;
        }

        const leftContact = sortedContacts[0];
        const rightContact = sortedContacts[sortedContacts.length - 1];
        const sampleWidth = rightContact.worldPoint.x - leftContact.worldPoint.x;
        if (Math.abs(sampleWidth) > 0.0001) {
            return Math.atan2(
                rightContact.groundInfo.surfaceHeight - leftContact.groundInfo.surfaceHeight,
                sampleWidth
            );
        }

        return leftContact.groundInfo.angle ?? 0;
    }

    settleToVehicleRestPose(level, contacts = []) {
        if (!level?.getGroundInfoAtWorld) {
            return false;
        }

        const contactAngle = this.getRestGroundAngleFromContacts(contacts);
        const targetAngle = Number.isFinite(contactAngle) ? contactAngle : this.currentGroundAngle;
        const probeY = this.getBodyGroundProbeY(level, this.container.position.y, targetAngle);
        const support = this.resolveBodyGroundSupport(level, probeY, targetAngle);
        if (!support) {
            return false;
        }

        this.currentGroundAngle = targetAngle;
        this.container.position.y = support.anchorY;
        this.restoreGroundLayerZ();
        this.releaseDropVisualPose();
        this.applyGroundAlignment();
        return true;
    }

    updateSleepState(contacts, delta, level) {
        const stableGroundContact = contacts.length >= 2;
        const smallLinearVelocity = this.velocity.lengthSq() <= (this.settleLinearThreshold * this.settleLinearThreshold);
        const smallAngularVelocity = Math.abs(this.angularVelocity) <= this.settleAngularThreshold;

        if (stableGroundContact && smallLinearVelocity && smallAngularVelocity) {
            this.sleepTimer += delta;
            if (this.sleepTimer >= this.settleTimeRequired) {
                this.settleToVehicleRestPose(level, contacts);
                this.sleeping = true;
                this.grounded = true;
                this.gravityEnabled = false;
                this.velocity.set(0, 0, 0);
                this.angularVelocity = 0;
                this.state = LEVEL_OBJECT_STATES.IDLE;
                console.debug?.(`[VehicleObject] ${this.type}#${this.id} entered sleep state.`);
                this.tryFinalizePendingDestroy();
            }
            return;
        }

        this.sleepTimer = 0;
    }

    applyLandingDamage(impactSpeed, fallDistance) {
        if (impactSpeed <= 0.01 && fallDistance <= 0.01) {
            return;
        }

        // Damage remains driven by impact severity, but pose resolution is entirely separate:
        // wrecked visuals can change while the rigid body keeps bouncing / rotating naturally.
        this.applyDamage(this.getImpactDamage(fallDistance));
    }

    updatePhysicsStep(stepDelta, level) {
        const wasGrounded = this.grounded;
        const dragging = this.isBeingDragged();
        const gravity = Number.isFinite(CONFIG.LEVEL_OBJECTS?.gravity)
            ? CONFIG.LEVEL_OBJECTS.gravity
            : 52;

        if (dragging) {
            this.applyDragConstraint(stepDelta);
        } else {
            this.state = LEVEL_OBJECT_STATES.FALLING;
        }
        this.gravityEnabled = true;

        this.velocity.y -= gravity * stepDelta;
        const linearDamping = dragging && Number.isFinite(CONFIG.DINO_DRAG?.linearDamping)
            ? CONFIG.DINO_DRAG.linearDamping
            : this.linearDamping;
        const angularDamping = dragging && Number.isFinite(CONFIG.DINO_DRAG?.angularDamping)
            ? CONFIG.DINO_DRAG.angularDamping
            : this.angularDamping;
        this.velocity.multiplyScalar(linearDamping);
        this.angularVelocity *= angularDamping;
        this.clampAngularVelocity();

        this.container.position.x += this.velocity.x * stepDelta;
        this.container.position.y += this.velocity.y * stepDelta;
        if (dragging) {
            this.syncDraggedLayerZ();
        } else {
            this.container.position.z += this.velocity.z * stepDelta;
        }
        this.currentGroundAngle += this.angularVelocity * stepDelta;
        if (!this.shouldPreserveDropVisualPose()) {
            this.applyGroundAlignment();
        }
        if (dragging) {
            this.keepDraggedFreeCornerOnGround(level, stepDelta);
        }

        let contacts = this.buildGroundContacts(level);
        this.resolveGroundPenetration(contacts);
        contacts = this.buildGroundContacts(level);

        if (!contacts.length) {
            this.grounded = false;
            this.contactPersistence = 0;
            this.sleepTimer = 0;
            return;
        }

        this.releaseDropVisualPose();
        this.applyGroundAlignment();
        contacts = this.buildGroundContacts(level);

        const preImpactSpeed = Math.max(0, -this.velocity.y);
        this.applyContactImpulses(contacts);
        this.applyGroundTorque(contacts, stepDelta);
        this.applyGroundDamping(stepDelta);

        this.grounded = true;
        this.gravityEnabled = dragging;
        this.state = dragging ? LEVEL_OBJECT_STATES.DRAGGED : LEVEL_OBJECT_STATES.IDLE;
        this.contactPersistence += stepDelta;

        if (!wasGrounded) {
            const fallDistance = Math.max(0, (this.fallStartY ?? this.container.position.y) - this.container.position.y);
            this.applyLandingDamage(preImpactSpeed, fallDistance);
            this.fallStartY = this.container.position.y;
        }

        if (!dragging) {
            this.updateSleepState(contacts, stepDelta, level);
        } else {
            this.sleepTimer = 0;
            this.sleeping = false;
        }
        this.tryFinalizePendingDestroy();
    }

    update(delta, level, dinoTarget = null, airTargets = []) {
        super.update(delta, level);
        if (!this.container.visible) return;
        this.grounded = this.state === LEVEL_OBJECT_STATES.IDLE && !this.gravityEnabled;
        this.sleeping = this.grounded;
        this.checkAirTargetImpacts(airTargets);
    }

    getWalkableTopEdge() {
        if (!this.config?.walkable || !this.loaded) return null;

        const body = this.matterBody;
        if (!body) return null;

        // Collect all vertices from the body (handles compound bodies).
        const parts = (body.parts?.length > 1) ? body.parts.slice(1) : [body];
        const verts = [];
        for (const part of parts) {
            for (const v of (part.vertices ?? [])) verts.push({ x: v.x, y: v.y });
        }
        if (verts.length < 2) return null;

        // Find the topmost vertex Y (highest in world space = maximum Y in this coordinate system).
        let maxY = -Infinity;
        for (const v of verts) if (v.y > maxY) maxY = v.y;

        // Keep only the upper band — vertices within 15% of the body height from the top.
        let minY = Infinity;
        for (const v of verts) if (v.y < minY) minY = v.y;
        const height = maxY - minY;
        const bandThreshold = maxY - height * 0.15;
        const topVerts = verts.filter((v) => v.y >= bandThreshold);
        if (topVerts.length < 2) return null;

        // Sort left-to-right and take the leftmost and rightmost as the edge endpoints.
        topVerts.sort((a, b) => a.x - b.x);
        const left  = topVerts[0];
        const right = topVerts[topVerts.length - 1];

        if (Math.abs(right.x - left.x) < 0.01) return null;

        // Check the surface angle — reject if steeper than 45°.
        const maxWalkAngle = Math.PI * 0.25;
        const edgeAngle = Math.atan2(right.y - left.y, right.x - left.x);
        if (Math.abs(edgeAngle) > maxWalkAngle) return null;

        // Extend each endpoint outward by half the configured gap tolerance so that two
        // blocks within walkableGapTolerance world-units of each other produce overlapping
        // edges — the dino walks across the gap without leaving the grounded surface.
        const gapTolerance = Number.isFinite(this.config.walkableGapTolerance)
            ? this.config.walkableGapTolerance
            : 0;
        const extend = gapTolerance * 0.5;

        // Project the extension along the edge direction so sloped tops extend correctly.
        const edgeLen = Math.hypot(right.x - left.x, right.y - left.y);
        const edgeDirX = edgeLen > 0.0001 ? (right.x - left.x) / edgeLen : 1;
        const edgeDirY = edgeLen > 0.0001 ? (right.y - left.y) / edgeLen : 0;

        const rx = right.x + edgeDirX * extend;
        const ry = right.y + edgeDirY * extend;
        const lx = left.x  - edgeDirX * extend;
        const ly = left.y  - edgeDirY * extend;

        // Wind right-to-left so the 'top' edge normal points upward (matches zeppelin convention).
        return [{
            x1: rx, y1: ry,
            x2: lx, y2: ly,
            start: { x: rx, y: ry },
            end:   { x: lx, y: ly },
            type: 'top',
            kind: 'top',
            regionType: 'solid',
            takeoffAllowed: true,
            _dynamic: true,
            _sourceId: this.id,
            _object: this
        }];
    }
}
