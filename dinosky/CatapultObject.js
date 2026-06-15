import * as THREE from 'three';
import { LevelObject, LEVEL_OBJECT_STATES } from './LevelObject.js';

// Reusable scratch vectors — avoid per-frame allocations.
const TMP_WORLD_POS = new THREE.Vector3();
const TMP_LEFT_TIP = new THREE.Vector3();
const TMP_RIGHT_TIP = new THREE.Vector3();

/**
 * CatapultObject — interactive slingshot-style catapult.
 *
 * Lifecycle:
 *   - load(): builds placeholder geometry (poles, basket, ropes).
 *   - update(): runs each frame. Detects loadable objects entering the basket,
 *     tracks dyno proximity to drive the pull, and handles launch/release.
 *
 * Interaction model:
 *   1. Dyno flies above the catapult carrying an accepted object and drops it.
 *      The basket detects overlap and adopts the object as its loaded projectile.
 *   2. Dyno flies close to the loaded basket. While the dyno is inside
 *      `grabActivationRadius`, the basket position follows the dyno's position
 *      (clamped to `maxPullDistance` from rest).
 *   3. When the dyno moves outside the grab radius (or the basket reaches
 *      max stretch and the dyno keeps moving), the basket "releases" —
 *      the loaded object gets an impulse based on the pull vector and the
 *      basket springs back to rest.
 *
 * Launch math:
 *   pullVector       = restPos - basketPos          (points from basket to rest)
 *   launchDirection  = normalize(pullVector)        (slingshot fires opposite of pull)
 *   pullRatio        = |pullVector| / maxPullDistance, clamped to [0..1]
 *   launchPower      = lerp(minLaunchPower, maxLaunchPower, pullRatio)
 *   launchVelocity   = launchDirection * launchPower
 *
 * Replacing placeholder with a real model later:
 *   When a `catapult.glb` is available, swap `_buildPlaceholderVisuals()` for
 *   GLB loading. Keep `this._basketNode` as the node whose world position is
 *   the basket center — the gameplay code reads from there.
 */
export class CatapultObject extends LevelObject {
    constructor(options) {
        super(options);

        const cfg = this.config.catapult || {};
        this._catapultCfg = {
            restY: Number.isFinite(cfg.restY) ? cfg.restY : 3.5,
            basketRadius: Number.isFinite(cfg.basketRadius) ? cfg.basketRadius : 1.8,
            maxPullDistance: Number.isFinite(cfg.maxPullDistance) ? cfg.maxPullDistance : 7,
            grabActivationRadius: Number.isFinite(cfg.grabActivationRadius) ? cfg.grabActivationRadius : 2.5,
            minLaunchPower: Number.isFinite(cfg.minLaunchPower) ? cfg.minLaunchPower : 6,
            maxLaunchPower: Number.isFinite(cfg.maxLaunchPower) ? cfg.maxLaunchPower : 38,
            returnSpringStrength: Number.isFinite(cfg.returnSpringStrength) ? cfg.returnSpringStrength : 8,
            acceptedObjectTypes: Array.isArray(cfg.acceptedObjectTypes) ? cfg.acceptedObjectTypes : [],
            aimDotCount: Number.isFinite(cfg.aimDotCount) ? cfg.aimDotCount : 16,
            aimDotInterval: Number.isFinite(cfg.aimDotInterval) ? cfg.aimDotInterval : 0.012,
            debugLog: cfg.debugLog === true
        };

        // Frame/scene nodes.
        this._frameGroup = null;
        this._basketNode = null;
        this._leftPole = null;
        this._rightPole = null;
        this._leftRopeLine = null;
        this._rightRopeLine = null;

        // The basket rest position in world space (set in load() once we know base position).
        this._restPosition = new THREE.Vector3();

        // Loaded projectile.
        this._loadedObject = null;

        // True once _restPosition has been finalized (after snapToGroundOnLoad may have moved us).
        this._restPositionInitialized = false;

        // Interaction state.
        this._isGrabbed = false;
        // Track the most recently launched object so it cannot be re-loaded
        // before it has escaped the basket area.
        this._recentlyLaunched = null;
        this._recentlyLaunchedTimer = 0;
        // Constraint object pushed onto dynoTarget.positionConstraints while pulling.
        this._dynoConstraint = null;
        this._constrainedDyno = null;
        // True once the basket has returned fully to rest — skips rope redraws.
        this._basketAtRest = false;
        // Aim trail dot meshes (created in _buildPlaceholderVisuals).
        this._aimDots = [];
        // `this.physicsWorld` is injected by LevelObjectManager.add() after creation.
    }

    async load() {
        this._buildPlaceholderVisuals();

        const basePos = this.container.position;
        this._restPosition.set(
            basePos.x,
            basePos.y + this._catapultCfg.restY,
            basePos.z
        );

        if (this._basketNode) {
            this._basketNode.position.copy(this._restPosition);
        }

        this.loaded = true;
        return this;
    }

    // Build poles + basket + ropes using THREE primitives. Swap for GLB later.
    _buildPlaceholderVisuals() {
        this._frameGroup = new THREE.Group();
        this._frameGroup.name = 'CatapultFrame';
        this.container.add(this._frameGroup);

        const poleHeight = this._catapultCfg.restY + 1.5;
        const poleRadius = 0.18;
        const poleSpacing = 3.0;

        const woodMat = new THREE.MeshBasicMaterial({
            color: 0x6b4a2a,
            toneMapped: false
        });

        const leftPoleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.2, poleHeight, 8);
        this._leftPole = new THREE.Mesh(leftPoleGeo, woodMat);
        this._leftPole.position.set(-poleSpacing * 0.5, poleHeight * 0.5, 0);
        this._frameGroup.add(this._leftPole);

        const rightPoleGeo = new THREE.CylinderGeometry(poleRadius, poleRadius * 1.2, poleHeight, 8);
        this._rightPole = new THREE.Mesh(rightPoleGeo, woodMat);
        this._rightPole.position.set(poleSpacing * 0.5, poleHeight * 0.5, 0);
        this._frameGroup.add(this._rightPole);

        // Cross-brace at the base — visual frame so it looks anchored.
        const baseBeamGeo = new THREE.BoxGeometry(poleSpacing + 0.8, 0.35, 0.5);
        const baseBeam = new THREE.Mesh(baseBeamGeo, woodMat);
        baseBeam.position.set(0, 0.18, 0);
        this._frameGroup.add(baseBeam);

        // Basket — a separate node so we can move it independently of the frame.
        // Lives directly on the scene/container so its world position is the
        // ground-truth basket location used by gameplay.
        this._basketNode = new THREE.Group();
        this._basketNode.name = 'CatapultBasket';
        this.scene.add(this._basketNode);

        const basketMat = new THREE.MeshBasicMaterial({
            color: 0x8b5a2b,
            toneMapped: false
        });
        const basketGeo = new THREE.SphereGeometry(
            this._catapultCfg.basketRadius * 0.6,
            12,
            8,
            0,
            Math.PI * 2,
            0,
            Math.PI * 0.55 // open cup at the top
        );
        const basketMesh = new THREE.Mesh(basketGeo, basketMat);
        basketMesh.rotation.x = Math.PI; // flip so the open side faces up
        this._basketNode.add(basketMesh);

        // Ropes — simple Line geometries that we update each frame to connect
        // the pole tips to the basket. Built once, vertex buffer updated in update().
        const ropeMat = new THREE.LineBasicMaterial({
            color: 0x222222,
            toneMapped: false
        });

        const leftRopeGeo = new THREE.BufferGeometry();
        leftRopeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
        this._leftRopeLine = new THREE.Line(leftRopeGeo, ropeMat);
        this.scene.add(this._leftRopeLine);

        const rightRopeGeo = new THREE.BufferGeometry();
        rightRopeGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
        this._rightRopeLine = new THREE.Line(rightRopeGeo, ropeMat);
        this.scene.add(this._rightRopeLine);

        // Aim trail — a pool of small dots shown while pulling.
        const dotGeo = new THREE.SphereGeometry(0.28, 6, 4);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xffdd44, toneMapped: false });
        for (let i = 0; i < this._catapultCfg.aimDotCount; i++) {
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.visible = false;
            // Slightly in front of the catapult so it renders above ground.
            this.scene.add(dot);
            this._aimDots.push(dot);
        }
    }

    // Pole-tip world positions (where ropes anchor on the frame).
    _getLeftPoleTip(target) {
        const base = this.container.position;
        return target.set(base.x - 1.5, base.y + this._catapultCfg.restY + 1.4, base.z);
    }

    _getRightPoleTip(target) {
        const base = this.container.position;
        return target.set(base.x + 1.5, base.y + this._catapultCfg.restY + 1.4, base.z);
    }

    _updateRopeLine(line, fromVec, toVec) {
        if (!line) return;
        const positions = line.geometry.attributes.position;
        positions.setXYZ(0, fromVec.x, fromVec.y, fromVec.z);
        positions.setXYZ(1, toVec.x, toVec.y, toVec.z);
        positions.needsUpdate = true;
    }

    _registerDynoConstraint(dyno) {
        if (!dyno?.positionConstraints || this._dynoConstraint) return;
        this._constrainedDyno = dyno;
        this._dynoConstraint = {
            cx: this._restPosition.x,
            cy: this._restPosition.y,
            radius: this._catapultCfg.maxPullDistance
        };
        dyno.positionConstraints.push(this._dynoConstraint);
    }

    _unregisterDynoConstraint(dyno) {
        if (!this._dynoConstraint) return;
        const target = dyno ?? this._constrainedDyno;
        const arr = target?.positionConstraints;
        if (arr) {
            const idx = arr.indexOf(this._dynoConstraint);
            if (idx >= 0) arr.splice(idx, 1);
        }
        this._dynoConstraint = null;
        this._constrainedDyno = null;
    }

    // Is `obj` a valid projectile candidate?
    _isAcceptedType(obj) {
        if (!obj || obj.isDestroyed || obj.markedForRemoval) return false;
        if (obj === this) return false;
        return this._catapultCfg.acceptedObjectTypes.includes(obj.type);
    }

    // Scan nearby objects for one that has entered the basket area.
    // Accepted states: IDLE (settled in basket) and FALLING (dropped from above
    // by the dyno — caught mid-fall). Excluded: CARRIED/GRABBED/DRAGGED, and
    // the recently-launched object (cooldown).
    _tryDetectLoad(allObjects) {
        if (this._loadedObject) return;
        if (!Array.isArray(allObjects)) return;

        const basketPos = this._basketNode?.position;
        if (!basketPos) return;
        const r2 = this._catapultCfg.basketRadius * this._catapultCfg.basketRadius;

        for (const obj of allObjects) {
            if (!this._isAcceptedType(obj)) continue;
            // Skip anything currently held by the dyno.
            if (
                obj.state === LEVEL_OBJECT_STATES.CARRIED ||
                obj.state === LEVEL_OBJECT_STATES.GRABBED ||
                obj.state === LEVEL_OBJECT_STATES.DRAGGED
            ) continue;
            // Cooldown: never re-grab the object we just launched.
            if (obj === this._recentlyLaunched) continue;

            obj.container.updateWorldMatrix(true, false);
            obj.container.getWorldPosition(TMP_WORLD_POS);
            const dx = TMP_WORLD_POS.x - basketPos.x;
            const dy = TMP_WORLD_POS.y - basketPos.y;
            if (dx * dx + dy * dy > r2) continue;

            this._setLoadedObject(obj);
            break;
        }
    }

    _setLoadedObject(obj) {
        this._loadedObject = obj;
        // Park the object's physics by setting it to IDLE-like state. We keep
        // its visual following the basket every frame; on launch we re-enable
        // gravity and apply the impulse.
        obj.gravityEnabled = false;
        obj.state = LEVEL_OBJECT_STATES.IDLE;
        const body = this.physicsWorld?.objectBodies?.get(obj);
        if (body && this.physicsWorld?.Matter) {
            this.physicsWorld.Matter.Sleeping.set(body, true);
            this.physicsWorld.Matter.Body.setVelocity(body, { x: 0, y: 0 });
            this.physicsWorld.Matter.Body.setAngularVelocity(body, 0);
        }
        if (this._catapultCfg.debugLog) {
            console.log('[Catapult] Loaded', { id: obj.id, type: obj.type });
        }
    }

    // Compute launch velocity from current pull and simulate arc, positioning dots along it.
    _updateAimTrail() {
        if (!this._aimDots.length) return;

        const show = this._isGrabbed && this._loadedObject;
        if (!show) {
            for (const dot of this._aimDots) dot.visible = false;
            this.trajectoryBounds = null;
            return;
        }

        const basketPos = this._basketNode.position;
        const restPos = this._restPosition;
        const pullX = restPos.x - basketPos.x;
        const pullY = restPos.y - basketPos.y;
        const pullDist = Math.hypot(pullX, pullY);

        if (pullDist < 0.01) {
            for (const dot of this._aimDots) dot.visible = false;
            this.trajectoryBounds = null;
            return;
        }

        const ratio = Math.min(pullDist / this._catapultCfg.maxPullDistance, 1);
        const power = THREE.MathUtils.lerp(
            this._catapultCfg.minLaunchPower,
            this._catapultCfg.maxLaunchPower,
            ratio
        );
        const dirX = pullX / pullDist;
        const dirY = pullY / pullDist;
        const vx = dirX * power;
        let vy = dirY * power;

        // World-space gravity in units/sec².
        // Matter Verlet adds gravity.y * scale * dt_ms² to body.velocity each substep.
        // body.velocity is in world units (1 unit = 1 world unit of movement per substep).
        // PhysicsWorld exposes world-space velocity as body.velocity / stepSeconds.
        // Δworld_vel per substep = gravity.y * scale * dt_ms²
        // Δworld_vel per second  = Δworld_vel_per_substep / stepSeconds * fixedHz
        //                        = gravity.y * scale * dt_ms² / stepSeconds * fixedHz
        //                        = gravity.y * scale * (1000/Hz)² * Hz * Hz
        //                        = gravity.y * scale * 1_000_000.
        const pw = this.physicsWorld;
        const gravityY = pw?.getMatterGravityY?.() ?? 0.35;
        const gravityScale = pw?.world?.gravity?.scale ?? 0.001;
        const maxFallSpeed = pw?.getMaxFallSpeed?.() ?? 40;
        const fixedHz = pw?.getFixedStepHz?.() ?? 120;
        // World-space gravity: gravity.y * scale * dt_ms² per substep, converted to units/sec².
        const gravAccel = gravityY * gravityScale * 1_000_000;

        // frictionAir decay factor per second: (1 - frictionAir * dt_ms/baseDelta)^fixedHz.
        // baseDelta = 1000/60. Read frictionAir from the loaded object's Matter config.
        const matterCfg = this._loadedObject?.config?.matter
            || this._loadedObject?.config?.physicsBody
            || this._loadedObject?.config?.physics
            || {};
        const frictionAir = Number.isFinite(matterCfg.frictionAir) ? matterCfg.frictionAir : 0.01;
        const baseDelta = 1000 / 60;
        const frictionPerStep = 1 - frictionAir * ((1000 / fixedHz) / baseDelta);
        const frictionPerSecond = Math.pow(Math.max(frictionPerStep, 0), fixedHz);

        const simDt = this._catapultCfg.aimDotInterval;
        const z = basketPos.z + 0.3;
        let px = basketPos.x;
        let py = basketPos.y;
        let curVx = vx;
        let curVy = vy;

        let minX = basketPos.x, maxX = basketPos.x;
        let minY = basketPos.y, maxY = basketPos.y;

        for (let i = 0; i < this._aimDots.length; i++) {
            const frictionFactor = Math.pow(frictionPerSecond, simDt);
            curVx *= frictionFactor;
            curVy = Math.max(curVy * frictionFactor - gravAccel * simDt, -maxFallSpeed);
            px += curVx * simDt;
            py += curVy * simDt;

            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;

            const dot = this._aimDots[i];
            dot.position.set(px, py, z);
            // Fade dots out along the trail.
            const alpha = 1 - i / this._aimDots.length;
            dot.material.opacity = alpha;
            dot.material.transparent = alpha < 1;
            dot.visible = true;
        }

        this.trajectoryBounds = { minX, maxX, minY, maxY };
    }

    // Place the loaded object at the basket center each frame.
    _syncLoadedObjectToBasket() {
        if (!this._loadedObject || !this._basketNode) return;
        const basketPos = this._basketNode.position;
        const obj = this._loadedObject;
        obj.container.position.set(basketPos.x, basketPos.y, basketPos.z);

        const body = this.physicsWorld?.objectBodies?.get(obj);
        if (body && this.physicsWorld?.Matter) {
            this.physicsWorld.Matter.Body.setPosition(body, { x: basketPos.x, y: basketPos.y });
            this.physicsWorld.Matter.Body.setVelocity(body, { x: 0, y: 0 });
        }
    }

    // Launch the loaded object using the current pull vector.
    _launch() {
        if (!this._loadedObject || !this._basketNode) return;

        const basketPos = this._basketNode.position;
        const restPos = this._restPosition;

        // pullVector points from basket back to rest — opposite of how the basket was pulled.
        const pullX = restPos.x - basketPos.x;
        const pullY = restPos.y - basketPos.y;
        const pullDist = Math.hypot(pullX, pullY);

        if (pullDist < 0.0001) {
            // No pull — just unload, no launch.
            this._releaseLoadedObject(0, 0);
            return;
        }

        const ratio = Math.min(pullDist / this._catapultCfg.maxPullDistance, 1);
        const power = THREE.MathUtils.lerp(
            this._catapultCfg.minLaunchPower,
            this._catapultCfg.maxLaunchPower,
            ratio
        );

        const dirX = pullX / pullDist;
        const dirY = pullY / pullDist;
        const launchVX = dirX * power;
        const launchVY = dirY * power;

        if (this._catapultCfg.debugLog) {
            console.log('[Catapult] Launch', {
                objectId: this._loadedObject.id,
                type: this._loadedObject.type,
                pullDist,
                ratio,
                power,
                launchDirection: { x: dirX, y: dirY },
                velocity: { x: launchVX, y: launchVY }
            });
        }

        this._releaseLoadedObject(launchVX, launchVY);
    }

    // Hand control back to the physics system with the given launch velocity.
    // Teleports the object to the basket position first so the launch visually
    // starts from the slingshot, not from wherever the dyno dropped it.
    _releaseLoadedObject(launchVX, launchVY) {
        const obj = this._loadedObject;
        const basketPos = this._basketNode?.position;
        this._loadedObject = null;
        this._isGrabbed = false;
        // Block this object from being re-loaded for a couple seconds — long
        // enough for it to clear the basket area or for the player to react.
        this._recentlyLaunched = obj || null;
        this._recentlyLaunchedTimer = 2.0;
        if (!obj) return;

        // Re-enable gravity & set state so PhysicsWorld drives it again.
        obj.gravityEnabled = true;
        obj.state = LEVEL_OBJECT_STATES.FALLING;
        if (basketPos) {
            obj.container.position.set(basketPos.x, basketPos.y, basketPos.z);
            obj.fallStartY = basketPos.y;
        } else {
            obj.fallStartY = obj.container.position.y;
        }

        const body = this.physicsWorld?.objectBodies?.get(obj);
        if (body && this.physicsWorld?.Matter) {
            const Matter = this.physicsWorld.Matter;
            if (basketPos) {
                Matter.Body.setPosition(body, { x: basketPos.x, y: basketPos.y });
            }
            Matter.Sleeping.set(body, false);
            // Matter velocity is per-substep, so divide by substep count.
            const stepSeconds = this.physicsWorld.getFixedStepSeconds?.() || (1 / 60);
            Matter.Body.setVelocity(body, {
                x: launchVX * stepSeconds,
                y: launchVY * stepSeconds
            });
            Matter.Body.setAngularVelocity(body, 0);
            // Reset contact flags so it falls cleanly until first impact.
            if (body.plugin) {
                body.plugin.hasImpactedTerrain = false;
                body.plugin.hasMatterContact = false;
                body.plugin.settledFrameCount = 0;
                body.plugin.dropStartY = body.position.y;
            }
        }
    }

    update(delta, level, dynoTarget, allObjects) {
        if (!this.loaded || !this._basketNode) return;

        // snapToGroundOnLoad repositions container AFTER load() runs, so we must
        // re-derive _restPosition on the first update tick (when position is final).
        if (!this._restPositionInitialized) {
            this._restPositionInitialized = true;
            const basePos = this.container.position;
            this._restPosition.set(
                basePos.x,
                basePos.y + this._catapultCfg.restY,
                basePos.z
            );
            this._basketNode.position.copy(this._restPosition);
            this._basketAtRest = false; // force one rope update to sync to final position
            if (this._catapultCfg.debugLog) {
                console.log('[Catapult] Rest position finalized', { x: this._restPosition.x, y: this._restPosition.y });
            }
        }

        // Tick the post-launch cooldown so the recently-launched object becomes
        // re-loadable again once it has had time to leave the basket.
        if (this._recentlyLaunchedTimer > 0) {
            this._recentlyLaunchedTimer -= delta;
            if (this._recentlyLaunchedTimer <= 0) {
                this._recentlyLaunched = null;
            }
        }

        const basketPos = this._basketNode.position;
        const restPos = this._restPosition;

        // 1) If no loaded object, scan for one entering the basket — but only when
        // the dyno is close enough that a drop is plausible. This avoids iterating
        // all level objects every frame when the catapult is on-screen but unused.
        if (!this._loadedObject) {
            const dynoPos = dynoTarget?.position;
            const scanRadius = this._catapultCfg.maxPullDistance + this._catapultCfg.basketRadius + 4;
            const dynoNear = dynoPos &&
                Math.hypot(dynoPos.x - restPos.x, dynoPos.y - restPos.y) < scanRadius;
            if (dynoNear) {
                this._tryDetectLoad(allObjects);
            }
        }

        // 2) Grab is driven by the dyno's existing pickup/drag system.
        // While the dyno is holding the loaded object, the basket follows the
        // object's position (clamped to maxPullDistance from rest). When the
        // dyno releases the object, we fire it using the pull vector.
        if (this._loadedObject) {
            const obj = this._loadedObject;
            const isHeldByDyno = (
                obj.state === LEVEL_OBJECT_STATES.CARRIED ||
                obj.state === LEVEL_OBJECT_STATES.GRABBED ||
                obj.state === LEVEL_OBJECT_STATES.DRAGGED
            );

            if (isHeldByDyno) {
                this._isGrabbed = true;
                this._registerDynoConstraint(dynoTarget);

                // Carried objects are re-parented to the dyno's carry socket, so
                // container.position is a local offset. Walk the parent chain to get
                // the actual world position.
                obj.container.updateWorldMatrix(true, false);
                obj.container.getWorldPosition(TMP_WORLD_POS);

                // Basket follows the object's world position, clamped to maxPull from rest.
                let bx = TMP_WORLD_POS.x;
                let by = TMP_WORLD_POS.y;
                const fromRestX = bx - restPos.x;
                const fromRestY = by - restPos.y;
                const fromRestDist = Math.hypot(fromRestX, fromRestY);
                const maxPull = this._catapultCfg.maxPullDistance;
                if (fromRestDist > maxPull) {
                    const k = maxPull / fromRestDist;
                    bx = restPos.x + fromRestX * k;
                    by = restPos.y + fromRestY * k;
                }
                basketPos.set(bx, by, restPos.z);
            } else if (this._isGrabbed) {
                // Dyno just dropped the loaded object — fire the catapult.
                this._unregisterDynoConstraint(dynoTarget);
                this._launch();
            } else {
                // Object idling in the basket — keep it parked at basket position.
                this._syncLoadedObjectToBasket();
            }
        }

        // 3) When not grabbed, spring basket back to rest.
        if (!this._isGrabbed) {
            const dx = basketPos.x - restPos.x;
            const dy = basketPos.y - restPos.y;
            if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
                const k = 1 - Math.exp(-Math.max(delta, 0) * this._catapultCfg.returnSpringStrength);
                basketPos.x = THREE.MathUtils.lerp(basketPos.x, restPos.x, k);
                basketPos.y = THREE.MathUtils.lerp(basketPos.y, restPos.y, k);
                basketPos.z = restPos.z;
                this._basketAtRest = false;
            } else if (!this._basketAtRest) {
                // Snap to exact rest and mark settled so we stop updating ropes.
                basketPos.x = restPos.x;
                basketPos.y = restPos.y;
                basketPos.z = restPos.z;
                this._basketAtRest = true;
                this._updateRopeLine(this._leftRopeLine, this._getLeftPoleTip(TMP_LEFT_TIP), basketPos);
                this._updateRopeLine(this._rightRopeLine, this._getRightPoleTip(TMP_RIGHT_TIP), basketPos);
            }
        } else {
            this._basketAtRest = false;
        }

        // 4) Redraw ropes — skip when basket is settled at rest (nothing changed).
        if (!this._basketAtRest) {
            this._updateRopeLine(this._leftRopeLine, this._getLeftPoleTip(TMP_LEFT_TIP), basketPos);
            this._updateRopeLine(this._rightRopeLine, this._getRightPoleTip(TMP_RIGHT_TIP), basketPos);
        }

        // 5) Aim trail preview.
        this._updateAimTrail();
    }

    dispose() {
        this.trajectoryBounds = null;
        this._unregisterDynoConstraint(null);
        if (this._loadedObject) {
            this._releaseLoadedObject(0, 0);
        }
        if (this._basketNode) {
            this._basketNode.traverse((child) => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
            this._basketNode.removeFromParent();
            this._basketNode = null;
        }
        for (const line of [this._leftRopeLine, this._rightRopeLine]) {
            line?.geometry?.dispose?.();
            line?.material?.dispose?.();
            line?.removeFromParent?.();
        }
        this._leftRopeLine = null;
        this._rightRopeLine = null;
        if (this._aimDots.length) {
            const geo = this._aimDots[0]?.geometry;
            const mat = this._aimDots[0]?.material;
            for (const dot of this._aimDots) dot.removeFromParent();
            geo?.dispose?.();
            mat?.dispose?.();
            this._aimDots = [];
        }
        super.dispose?.();
    }
}
