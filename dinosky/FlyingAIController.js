import * as THREE from 'three';

const TMP_TO_TARGET   = new THREE.Vector3();
const TMP_CANDIDATE   = new THREE.Vector3();
const TMP_QUAT_FLIGHT = new THREE.Quaternion();
const TMP_QUAT_ROLL   = new THREE.Quaternion();
const TMP_EULER       = new THREE.Euler();
const FORWARD_AXIS    = new THREE.Vector3(1, 0, 0);

const MAX_SAFE_TARGET_ATTEMPTS  = 6;
const PATROL_FORWARD_CONE_HALF  = Math.PI * 70 / 180 / 2; // 35° each side → 70° total
const FLEE_JINK_HALF            = Math.PI * 70 / 180 / 2; // same cone for flee jink
// Number of intermediate points sampled when checking whether a path is clear of terrain.
const PATH_CHECK_STEPS          = 5;
const FLEE_PATH_RETRIES         = 4; // destination re-picks before giving up

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function randomInRange(min, max) { return min + Math.random() * (max - min); }

function shortestAngleDelta(from, to) {
    let d = (to - from) % (Math.PI * 2);
    if (d > Math.PI)  d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

// ─── terrain / area helpers ───────────────────────────────────────────────────

function isPointSafe(x, y, level, excludeWater = false) {
    if (!level?.isPointInsideAnyCollisionPolygon) return true;
    if (level.isPointInsideAnyCollisionPolygon({ x, y })) return false;
    if (excludeWater && typeof level.isPointInsideWater === 'function') {
        if (level.isPointInsideWater({ x, y })) return false;
    }
    return true;
}

function getRegionTop(points) {
    if (!Array.isArray(points) || points.length === 0) return null;
    let top = -Infinity;
    for (const point of points) {
        if (Number.isFinite(point?.y) && point.y > top) top = point.y;
    }
    return Number.isFinite(top) ? top : null;
}

function isPointInRect(x, y, area) {
    return !area || (x >= area.left && x <= area.right && y >= area.bottom && y <= area.top);
}

// Ray-cast point-in-polygon. Polygon = array of {x, y}. Mirrors TiledLevel.pointInPolygon.
function pointInPolygon(x, y, points) {
    if (!Array.isArray(points) || points.length < 3) return false;
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i++) {
        const a = points[i];
        const b = points[j];
        if ((a.y > y) !== (b.y > y)) {
            const intersectX = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y);
            if (x < intersectX) inside = !inside;
        }
    }
    return inside;
}

// True iff (x,y) is inside the AI's allowed region. For swim mode the polygon
// is authoritative; for plane/drone the rect is authoritative.
function isPointInAllowedRegion(x, y, area, polygon) {
    if (polygon) return pointInPolygon(x, y, polygon.points);
    return isPointInRect(x, y, area);
}

// Check FLEE_PATH_STEPS evenly-spaced intermediate points along (x0,y0)→(x1,y1).
// Returns true if all intermediate points are safe and inside the allowed region.
function isPathClear(x0, y0, x1, y1, area, level, polygon = null, excludeWater = false) {
    for (let i = 1; i <= PATH_CHECK_STEPS; i++) {
        const t = i / (PATH_CHECK_STEPS + 1);
        const mx = x0 + (x1 - x0) * t;
        const my = y0 + (y1 - y0) * t;
        if (!isPointInAllowedRegion(mx, my, area, polygon) || !isPointSafe(mx, my, level, excludeWater)) return false;
    }
    return true;
}

// ─── flight zone helper ───────────────────────────────────────────────────────

function getFlyingAIAllowedArea(object, level) {
    const cfg = object?.config || {};
    const zoneId = cfg.flyAI?.zoneId ?? cfg.zoneId;
    if (zoneId && level) {
        const zone = level.getMissionZoneById(zoneId);
        if (zone) return { left: zone.left, right: zone.right, bottom: zone.bottom, top: zone.top };
    }
    if (level) {
        return {
            left:   level.worldOriginX,
            right:  level.worldOriginX + level.width  * level.tileWidth,
            bottom: level.worldOriginY,
            top:    level.worldOriginY + level.height * level.tileHeight
        };
    }
    return { left: -100, right: 100, bottom: 0, top: 80 };
}

// ─── FlyingAIController ───────────────────────────────────────────────────────

export class FlyingAIController {
    constructor(owner, options = {}) {
        this.owner = owner;
        const cfg = owner?.config || {};
        // Sub-block: cfg.flyAI (plane) or cfg.swimAI (shark). Values here take
        // precedence over the flat keys on cfg, keeping backward compatibility
        // with objects that still use the old flat-key style.
        const sub = cfg.flyAI || cfg.swimAI || {};

        // Helper: options → sub-block → flat cfg → default
        const r = (key, def) => options[key] ?? sub[key] ?? cfg[key] ?? def;

        this.movementType = String(r('movementType', 'plane')).toLowerCase();

        // Shared params
        this.moveSpeed            = Math.max(0.001, Number(r('moveSpeed',           r('patrolSpeed', 7))));
        this.moveUpSpeed          = Math.max(0.001, Number(r('moveUpSpeed',          this.moveSpeed)));
        this.moveDownSpeed        = Math.max(0.001, Number(r('moveDownSpeed',        this.moveSpeed)));
        this.arriveThreshold      = Math.max(0.5,   Number(r('arriveThreshold',      4)));
        this.fleeRange            = Math.max(0,     Number(r('fleeRange',            20)));
        this.fleeDistance         = Math.max(0,     Number(r('fleeDistance',         this.fleeRange * 2)));
        this.fleeSpeedMultiplier  = Math.max(0.001, Number(r('fleeSpeedMultiplier',  1)));
        this.speedIncrease        = Math.max(0,     Number(r('speedIncrease',        0)));
        this.fleeResumeDelay      = Math.max(0,     Number(r('fleeResumeDelay',      3)));

        // Plane-mode params
        this.planeTurnRate        = Math.max(0.01,  Number(r('planeTurnRate',        1.2))); // rad/s
        this.planeBankMax         = Math.max(0,     Number(r('planeBankMax',         0.55)));
        this.planeBankSpeed       = Math.max(0.001, Number(r('planeBankSpeed',       4)));
        // Optional: clamp the flight angle to ±this many degrees from horizontal.
        // Use for sharks/fish that should always swim nearly flat.
        const maxVertDeg = r('maxVerticalAngleDeg', null);
        this._maxVerticalAngle    = (maxVertDeg !== null && Number.isFinite(Number(maxVertDeg)))
            ? THREE.MathUtils.degToRad(Math.max(0, Number(maxVertDeg)))
            : null;
        this._clampVerticalAngle();

        // Drone/swim-mode params
        this.acceleration    = Math.max(0.001, Number(r('acceleration',    8)));
        this.damping         = clamp01(Number(r('movementDamping',         0.985)));
        this.turnSpeedY      = Math.max(0.001, Number(r('turnSpeedY',      r('turnSpeed', 6))));

        // Shared state
        this._area            = null;
        this.patrolTarget     = new THREE.Vector3();
        this._hasPatrolTarget = false;
        this._fleeTimer      = 0;
        this._fleeing        = false;
        // behaviorMode: options → sub.behavior → cfg.flyingAIBehavior → 'patrol'
        this.behaviorMode    = String(options.behaviorMode ?? sub.behavior ?? cfg.flyingAIBehavior ?? 'patrol').toLowerCase();
        this.debugLogging    = Boolean(r('debugLogging', false));

        // Plane-mode flight state
        const initFacing = Number(options.facingDirection ?? cfg.facingDirection ?? 1) >= 0 ? 1 : -1;
        this._planeAngle  = initFacing >= 0 ? 0 : Math.PI;
        this._planeBankX  = 0;

        // Drone-mode facing state
        this.facingDirection = initFacing;
        this.currentYaw      = initFacing < 0 ? Math.PI : 0;
        this.targetYaw       = this.currentYaw;
    }

    // ── public API ────────────────────────────────────────────────────────────

    update(delta, level, dynoTarget) {
        const obj = this.owner;
        if (!obj?.container) return;

        // Swim mode lets the owner provide a polygon (e.g. water polygon) that
        // replaces the rectangular allowed area. The polygon's AABB still acts as
        // a fallback rect so margin-based steering and uniform random sampling work.
        this._allowedPolygon = (this.movementType === 'swim' && typeof obj.getAIAllowedPolygon === 'function')
            ? obj.getAIAllowedPolygon()
            : null;
        this._area = this._allowedPolygon
            ? this._polygonBoundsToArea(this._allowedPolygon)
            : getFlyingAIAllowedArea(obj, level);

        if (!this._initialised) {
            this._initialised = true;
            const area = this._area;
            if (area) {
                const pos = obj.container.position;
                const outside = !isPointInAllowedRegion(pos.x, pos.y, area, this._allowedPolygon);
                if (outside || !isPointSafe(pos.x, pos.y, level)) {
                    let snapped = null;
                    for (let i = 0; i < 20; i++) {
                        const sx = randomInRange(area.left, area.right);
                        const sy = randomInRange(area.bottom, area.top);
                        if (isPointInAllowedRegion(sx, sy, area, this._allowedPolygon) && isPointSafe(sx, sy, level)) {
                            snapped = { x: sx, y: sy }; break;
                        }
                    }
                    if (snapped) {
                        pos.x = snapped.x;
                        pos.y = snapped.y;
                    } else if (!this._allowedPolygon) {
                        // No safe point found inside an arbitrary polygon — leave the owner where it is
                        // so it isn't teleported outside its water polygon. The rect case keeps the
                        // legacy "center of area" fallback for planes/drones.
                        pos.x = (area.left + area.right)  * 0.5;
                        pos.y = (area.bottom + area.top) * 0.5;
                    }
                    this._hasPatrolTarget = false;
                }
            }
        }

        if (this.movementType === 'plane') {
            this._updatePlane(delta, level, dynoTarget);
        } else {
            // Drone path is reused for swim — the controller treats swim as a drone
            // with a polygon-constrained allowed region. Owner-specific visuals
            // (e.g. underwater bob) are not handled here.
            this._updateDrone(delta, level, dynoTarget);
            this._applyDroneFacingRotation(delta);
        }
    }

    _polygonBoundsToArea(polygon) {
        const pts = polygon?.points;
        if (!Array.isArray(pts) || pts.length === 0) return null;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        return { left: minX, right: maxX, bottom: minY, top: maxY };
    }

    resetPatrolTarget() {
        this._hasPatrolTarget = false;
    }

    // ── plane movement ────────────────────────────────────────────────────────

    _updatePlane(delta, level, dynoTarget) {
        const obj = this.owner;
        const pos = obj.container.position;

        this._lastDelta = delta;

        if (this.behaviorMode === 'flee') {
            this._updatePlaneFleeTarget(dynoTarget, level);
        }

        if (!this._hasPatrolTarget && !this._isFleeing) {
            this._pickPatrolTarget(level, pos);
        }

        // Steer toward current target.
        let actualTurnThisFrame = 0;
        if (this._hasPatrolTarget) {
            TMP_TO_TARGET.set(
                this.patrolTarget.x - pos.x,
                this.patrolTarget.y - pos.y,
                0
            );
            const dist = Math.hypot(TMP_TO_TARGET.x, TMP_TO_TARGET.y);

            if (dist <= this.arriveThreshold) {
                this._hasPatrolTarget = false;
            } else {
                const desiredAngle = Math.atan2(TMP_TO_TARGET.y, TMP_TO_TARGET.x);
                const maxStep = this.planeTurnRate * delta;
                const angleDelta = THREE.MathUtils.clamp(
                    shortestAngleDelta(this._planeAngle, desiredAngle),
                    -maxStep, maxStep
                );
                this._planeAngle += angleDelta;
                this._clampVerticalAngle();
                actualTurnThisFrame = delta > 0 ? angleDelta / delta : 0;
            }
        }
        this._lastTurnRate = actualTurnThisFrame;

        this._applyAreaBoundarySteer(delta);
        this._applyTerrainAvoidanceSteer(delta, level);
        this._clampVerticalAngle();

        // Advance position.
        const sinAngle = Math.sin(this._planeAngle);
        const baseSpeed = sinAngle >= 0
            ? this.moveSpeed + (this.moveUpSpeed  - this.moveSpeed) * sinAngle
            : this.moveSpeed + (this.moveSpeed - this.moveDownSpeed) * sinAngle;
        const targetSpeed = baseSpeed * (this._isFleeing ? this.fleeSpeedMultiplier : 1);
        if (this._currentSpeed === undefined) this._currentSpeed = baseSpeed;
        if (this.speedIncrease > 0) {
            const diff = targetSpeed - this._currentSpeed;
            const step = this.speedIncrease * delta;
            this._currentSpeed += Math.abs(diff) <= step ? diff : step * Math.sign(diff);
        } else {
            this._currentSpeed = targetSpeed;
        }
        const prevX = pos.x;
        const prevY = pos.y;
        pos.x += Math.cos(this._planeAngle) * this._currentSpeed * delta;
        pos.y += Math.sin(this._planeAngle) * this._currentSpeed * delta;

        // In flee mode, destroy when crossing INTO a static terrain polygon.
        // Uses collisionPolygons (terrain fill only) — dynamic edges like zeppelin decks are excluded.
        // Require the plane to be inside for 2 consecutive frames to avoid false positives from
        // floating-point edge cases near polygon boundaries.
        if (this._isFleeing && level?.getCollisionPolygonRegionContainingPoint) {
            this._fleeCrashGracePeriod = Math.max(0, (this._fleeCrashGracePeriod ?? 0) - delta);
            if (this._fleeCrashGracePeriod <= 0) {
                const currentPoint = { x: pos.x, y: pos.y };
                const currentRegion = level.getCollisionPolygonRegionContainingPoint(currentPoint);
                let shouldCrashFromRegion = false;

                if (currentRegion) {
                    const regionType = String(currentRegion.type || '').trim().toLowerCase();
                    if (regionType === 'fly_through') {
                        const regionTop = getRegionTop(currentRegion.points);
                        // Fly-through polygons only count as a crash when the plane entered
                        // them from above. Coming up from below should stay non-fatal.
                        shouldCrashFromRegion = Number.isFinite(regionTop)
                            ? (prevY >= regionTop - 0.0001 && pos.y <= regionTop + 0.0001)
                            : false;
                    } else {
                        shouldCrashFromRegion = true;
                    }
                }

                if (shouldCrashFromRegion) {
                    this._insidePolygonFrames = (this._insidePolygonFrames || 0) + 1;
                    if (this._insidePolygonFrames >= 2) {
                        if (typeof obj.destroy === 'function') obj.destroy();
                        return;
                    }
                } else {
                    this._insidePolygonFrames = 0;
                }
            }
        } else {
            this._insidePolygonFrames = 0;
        }

        this._applyPlaneVisualRotation(delta);
    }

    // ── flee targeting ────────────────────────────────────────────────────────
    // Flee picks a destination + validates the path has no polygon intersections.
    // The plane physically flies straight toward each successive flee target (no
    // forced detours mid-flight), so it can still clip terrain if it turns badly —
    // that's intentional: flee crashes are allowed.

    _updatePlaneFleeTarget(dynoTarget, level) {
        const targetPos = this._getDynoXY(dynoTarget);
        if (!targetPos) return;

        const pos = this.owner.container.position;
        const dx = pos.x - targetPos.x;
        const dy = pos.y - targetPos.y;
        const dist = Math.hypot(dx, dy);

        if (dist > this.fleeRange) {
            if (this._isFleeing) {
                this._isFleeing = false;
                this._hasPatrolTarget = false;
            }
            return;
        }

        if (!this._isFleeing) {
            this._isFleeing = true;
            this._hasPatrolTarget = false;
            this._fleeRetargetTimer = 0;
            this._insidePolygonFrames = 0;
            this._fleeCrashGracePeriod = 0.5; // seconds before crash detection activates
        }

        // Countdown re-pick timer; keep current target until it expires or plane arrives.
        this._fleeRetargetTimer = (this._fleeRetargetTimer ?? 0) - (this._lastDelta ?? 0);
        if (this._hasPatrolTarget && this._fleeRetargetTimer > 0) return;

        // Pick a flee destination with a clear path (no polygon intersections, stays in rect).
        const awayAngle = Math.atan2(
            dist > 0.001 ? dy / dist : 0,
            dist > 0.001 ? dx / dist : 1
        );
        const area = this._area;
        const exWater = true; // planes never flee into water

        // If inside terrain, escape to open air before picking a flee destination.
        const escape = this._findEscapeTarget(pos, area, level, exWater);
        if (escape) {
            this.patrolTarget.set(escape.x, escape.y, pos.z);
            this._hasPatrolTarget = true;
            this._fleeRetargetTimer = 0.5;
            return;
        }
        let fleeX = null, fleeY = null;

        for (let attempt = 0; attempt < FLEE_PATH_RETRIES && fleeX === null; attempt++) {
            // Random jink angle biased away from dyno.
            const a = awayAngle + randomInRange(-FLEE_JINK_HALF, FLEE_JINK_HALF);
            const tx = pos.x + Math.cos(a) * this.fleeDistance;
            const ty = pos.y + Math.sin(a) * this.fleeDistance;
            if (!isPointInRect(tx, ty, area) || !isPointSafe(tx, ty, level, exWater)) continue;
            if (!isPathClear(pos.x, pos.y, tx, ty, area, level, null, exWater)) continue;
            fleeX = tx; fleeY = ty;
        }

        // Systematic fan fallback if random jinks all failed.
        if (fleeX === null) {
            const fanStep = Math.PI / 8;
            outer: for (let fan = 0; fan <= Math.PI + 0.001; fan += fanStep) {
                for (const off of fan === 0 ? [0] : [fan, -fan]) {
                    const a = awayAngle + off;
                    const tx = pos.x + Math.cos(a) * this.fleeDistance;
                    const ty = pos.y + Math.sin(a) * this.fleeDistance;
                    if (!isPointInRect(tx, ty, area) || !isPointSafe(tx, ty, level, exWater)) continue;
                    if (!isPathClear(pos.x, pos.y, tx, ty, area, level, null, exWater)) continue;
                    fleeX = tx; fleeY = ty;
                    break outer;
                }
            }
        }

        // Last resort: any safe rect point with a clear path.
        if (fleeX === null && area) {
            for (let i = 0; i < MAX_SAFE_TARGET_ATTEMPTS; i++) {
                const tx = randomInRange(area.left, area.right);
                const ty = randomInRange(area.bottom, area.top);
                if (isPointSafe(tx, ty, level, exWater) && isPathClear(pos.x, pos.y, tx, ty, area, level, null, exWater)) {
                    fleeX = tx; fleeY = ty; break;
                }
            }
        }

        if (fleeX !== null) {
            this.patrolTarget.set(fleeX, fleeY, pos.z);
            this._hasPatrolTarget = true;
            this._fleeRetargetTimer = randomInRange(1.0, 2.0);
        }
    }

    // ── terrain avoidance steer ───────────────────────────────────────────────
    // Probes several points ahead and to the sides. If terrain is detected, steers
    // away with higher urgency than the flee target, so avoiding walls wins.

    _applyTerrainAvoidanceSteer(delta, level) {
        if (!level?.isPointInsideAnyCollisionPolygon) return;

        const pos = this.owner.container.position;
        const speed = this._currentSpeed ?? this.moveSpeed;
        // Look-ahead distance: 1.5 seconds of travel, minimum 12 units.
        const lookAhead = Math.max(speed * 0.8, 12);
        const probeAngles = [-Math.PI / 3, -Math.PI / 6, 0, Math.PI / 6, Math.PI / 3];

        let steerX = 0, steerY = 0;
        for (const offset of probeAngles) {
            const a = this._planeAngle + offset;
            const px = pos.x + Math.cos(a) * lookAhead;
            const py = pos.y + Math.sin(a) * lookAhead;
            if (level.isPointInsideAnyCollisionPolygon({ x: px, y: py })) {
                // Push away from the blocked direction — weight centre probes more heavily.
                const weight = 1 - Math.abs(offset) / Math.PI;
                steerX -= Math.cos(a) * weight;
                steerY -= Math.sin(a) * weight;
            }
        }

        if (steerX === 0 && steerY === 0) return;

        const avoidAngle = Math.atan2(steerY, steerX);
        const angleDelta = shortestAngleDelta(this._planeAngle, avoidAngle);
        // Terrain avoidance turns harder than normal patrol/flee steering.
        const maxStep = this.planeTurnRate * delta * 4;
        this._planeAngle += THREE.MathUtils.clamp(angleDelta, -maxStep, maxStep);
    }

    // ── area boundary steer ───────────────────────────────────────────────────

    _applyAreaBoundarySteer(delta) {
        const area = this._area;
        if (!area) return;
        const pos = this.owner.container.position;

        const clampedX = Math.max(area.left, Math.min(area.right,  pos.x));
        const clampedY = Math.max(area.bottom, Math.min(area.top, pos.y));
        const wasOutside = clampedX !== pos.x || clampedY !== pos.y;
        pos.x = clampedX;
        pos.y = clampedY;

        if (wasOutside) {
            this._hasPatrolTarget = false;
        }

        const margin = this.moveSpeed * 1.5;
        const maxStep = this.planeTurnRate * delta;

        let steerX = 0, steerY = 0;
        if (pos.x < area.left   + margin) steerX += clamp01((area.left   + margin - pos.x) / margin);
        if (pos.x > area.right  - margin) steerX -= clamp01((pos.x - area.right  + margin) / margin);
        if (pos.y < area.bottom + margin) steerY += clamp01((area.bottom + margin - pos.y) / margin);
        if (pos.y > area.top    - margin) steerY -= clamp01((pos.y - area.top    + margin) / margin);

        if (steerX === 0 && steerY === 0) return;

        const steerAngle = Math.atan2(steerY, steerX);
        const delta_angle = shortestAngleDelta(this._planeAngle, steerAngle);
        const urgency = Math.max(Math.abs(steerX), Math.abs(steerY));
        this._planeAngle += THREE.MathUtils.clamp(delta_angle, -maxStep * (2 + urgency * 4), maxStep * (2 + urgency * 4));
        this._clampVerticalAngle();
    }

    // Clamp _planeAngle so vertical deviation from horizontal never exceeds _maxVerticalAngle.
    _clampVerticalAngle() {
        if (this._maxVerticalAngle === null) return;
        const cosA = Math.cos(this._planeAngle);
        const sinA = Math.sin(this._planeAngle);
        const maxSin = Math.sin(this._maxVerticalAngle);
        if (Math.abs(sinA) <= maxSin) return;
        // Clamp vertical, preserve horizontal sign.
        const clampedSin = Math.sign(sinA) * maxSin;
        const clampedCos = Math.sqrt(1 - clampedSin * clampedSin) * (cosA >= 0 ? 1 : -1);
        this._planeAngle = Math.atan2(clampedSin, clampedCos);
    }

    // ── visual rotation ───────────────────────────────────────────────────────

    _applyPlaneVisualRotation(delta) {
        const obj = this.owner;
        if (!obj.sceneObject) return;

        const baseRot = obj.baseRotation ?? { x: 0, y: 0, z: 0 };
        const flyingLeft = Math.cos(this._planeAngle) < 0;

        const targetRoll = flyingLeft ? Math.PI : 0;
        if (this._planeRoll === undefined) this._planeRoll = targetRoll;
        const rollSpeed = Math.max(0.001, Number(obj.config?.flyAI?.planeRollSpeed ?? obj.config?.planeRollSpeed ?? 4));
        const rollDelta = shortestAngleDelta(this._planeRoll, targetRoll);
        const rollStep  = Math.min(Math.abs(rollDelta), rollSpeed * delta) * Math.sign(rollDelta);
        this._planeRoll += rollStep;

        TMP_EULER.set(baseRot.x, baseRot.y, baseRot.z + this._planeAngle, 'XYZ');
        TMP_QUAT_FLIGHT.setFromEuler(TMP_EULER);
        TMP_QUAT_ROLL.setFromAxisAngle(FORWARD_AXIS, this._planeRoll);
        obj.sceneObject.quaternion.multiplyQuaternions(TMP_QUAT_FLIGHT, TMP_QUAT_ROLL);

        this.facingDirection = flyingLeft ? -1 : 1;
        if (typeof obj.setFacingDirection === 'function') obj.setFacingDirection(this.facingDirection);
        if (typeof obj.syncDebugCollisionShellTransform === 'function') obj.syncDebugCollisionShellTransform();
    }

    // ── drone movement (legacy) ───────────────────────────────────────────────

    _updateDrone(delta, level, dynoTarget) {
        if (this.behaviorMode === 'flee') {
            this._updateDroneFlee(delta, level, dynoTarget);
        } else {
            this._updateDronePatrol(delta, level);
        }
    }

    _updateDronePatrol(delta, level) {
        if (!this._hasPatrolTarget) this._selectNewPatrolTarget(level);
        this._droneMoveTowardTarget(delta, level, this.patrolTarget, this.moveSpeed);
    }

    _updateDroneFlee(delta, level, dynoTarget) {
        const pos = this.owner.container.position;
        const targetPos = this._getDynoXY(dynoTarget);
        if (targetPos && Math.hypot(targetPos.x - pos.x, targetPos.y - pos.y) < this.fleeRange) {
            this._fleeing = true;
            this._fleeTimer = this.fleeResumeDelay;
        }
        if (this._fleeing) {
            this._fleeTimer -= delta;
            if (this._fleeTimer <= 0) this._fleeing = false;
        }
        if (this._fleeing && targetPos) {
            const dx = pos.x - targetPos.x;
            const dy = pos.y - targetPos.y;
            const d = Math.hypot(dx, dy) || 1;
            TMP_CANDIDATE.set(pos.x + (dx / d) * this.fleeRange, pos.y + (dy / d) * this.fleeRange, pos.z);
            this._clampToArea(TMP_CANDIDATE);
            this._droneMoveTowardTarget(delta, level, TMP_CANDIDATE, this.moveSpeed * this.fleeSpeedMultiplier);
        } else {
            this._updateDronePatrol(delta, level);
        }
    }

    _droneMoveTowardTarget(delta, level, target, maxSpeed) {
        const obj = this.owner;
        const pos = obj.container.position;
        TMP_TO_TARGET.set(target.x - pos.x, target.y - pos.y, 0);
        const dist = TMP_TO_TARGET.length();
        if (dist <= this.arriveThreshold) { this._hasPatrolTarget = false; return; }

        const dir = TMP_TO_TARGET.normalize();
        const speedScale = clamp01(dist / Math.max(this.arriveThreshold * 6, 1.2));
        const velLerp = clamp01(this.acceleration * delta);
        obj.velocity.x = THREE.MathUtils.lerp(obj.velocity.x, dir.x * maxSpeed * speedScale, velLerp) * this.damping;
        obj.velocity.y = THREE.MathUtils.lerp(obj.velocity.y, dir.y * maxSpeed * speedScale, velLerp) * this.damping;
        obj.velocity.z = 0;

        const area = this._area;
        const polygon = this._allowedPolygon;
        const proposedX = pos.x + obj.velocity.x * delta;
        const proposedY = pos.y + obj.velocity.y * delta;
        if (polygon) {
            // Polygon-constrained step: only commit the axis if it remains inside.
            // If both axes would leave the polygon, hold position and drop the target
            // so a new in-water target is picked next frame.
            const tryXY = pointInPolygon(proposedX, proposedY, polygon.points);
            const tryX  = tryXY || pointInPolygon(proposedX, pos.y, polygon.points);
            const tryY  = tryXY || pointInPolygon(pos.x, proposedY, polygon.points);
            if (tryXY) {
                pos.x = proposedX;
                pos.y = proposedY;
            } else if (tryX) {
                pos.x = proposedX;
                obj.velocity.y = 0;
                this._hasPatrolTarget = false;
            } else if (tryY) {
                pos.y = proposedY;
                obj.velocity.x = 0;
                this._hasPatrolTarget = false;
            } else {
                obj.velocity.x = 0;
                obj.velocity.y = 0;
                this._hasPatrolTarget = false;
            }
        } else {
            pos.x = area ? Math.max(area.left, Math.min(area.right, proposedX)) : proposedX;
            pos.y = area ? Math.max(area.bottom, Math.min(area.top, proposedY)) : proposedY;
        }

        const minFacingSpeed = maxSpeed * 0.25;
        if (obj.velocity.x > minFacingSpeed && this.facingDirection < 0) { this.facingDirection = 1; this.targetYaw = 0; }
        else if (obj.velocity.x < -minFacingSpeed && this.facingDirection > 0) { this.facingDirection = -1; this.targetYaw = Math.PI; }
    }

    _applyDroneFacingRotation(delta) {
        const obj = this.owner;
        if (!obj.sceneObject) return;
        this.currentYaw = THREE.MathUtils.lerp(this.currentYaw, this.targetYaw, clamp01(this.turnSpeedY * delta));
        obj.sceneObject.rotation.y = (obj.baseRotation?.y ?? 0) + this.currentYaw;
        // Only call setFacingDirection when the facing actually changes to avoid
        // repeatedly flipping pickupRootLocalOffsets every frame.
        const newFacing = this.facingDirection >= 0 ? 1 : -1;
        const curFacing = Number.isFinite(obj.currentFacingDirection) ? (obj.currentFacingDirection >= 0 ? 1 : -1) : 1;
        if (newFacing !== curFacing && typeof obj.setFacingDirection === 'function') {
            obj.setFacingDirection(this.facingDirection);
        }
        if (typeof obj.syncDebugCollisionShellTransform === 'function') obj.syncDebugCollisionShellTransform();
    }

    // ── shared helpers ────────────────────────────────────────────────────────

    // Returns a nearby safe point just outside terrain if the plane is currently inside
    // a polygon, or null if already outside. Used to pick an escape target first.
    _findEscapeTarget(pos, area, level, exWater = false) {
        if (!level?.isPointInsideAnyCollisionPolygon) return null;
        if (!level.isPointInsideAnyCollisionPolygon({ x: pos.x, y: pos.y })) return null;

        // Fan outward in 16 directions at increasing distances until we find open air.
        const fanSteps = 16;
        for (const dist of [8, 16, 24, 40]) {
            for (let i = 0; i < fanSteps; i++) {
                const a = (i / fanSteps) * Math.PI * 2;
                const tx = pos.x + Math.cos(a) * dist;
                const ty = pos.y + Math.sin(a) * dist;
                if (isPointInRect(tx, ty, area) && isPointSafe(tx, ty, level, exWater)) {
                    return { x: tx, y: ty };
                }
            }
        }
        return null;
    }

    _pickPatrolTarget(level, pos) {
        const area = this._area || { left: -100, right: 100, bottom: 0, top: 80 };
        const zoneW = area.right - area.left;
        const zoneH = area.top - area.bottom;
        const minDist = Math.max(zoneW, zoneH) * 0.35;
        const maxDist = Math.max(zoneW, zoneH) * 0.85;
        // Planes and drones must not target points inside water polygons.
        const exWater = this.movementType !== 'swim';

        // If currently inside terrain, escape first.
        const escape = this._findEscapeTarget(pos, area, level, exWater);
        if (escape) {
            this.patrolTarget.set(escape.x, escape.y, pos.z);
            this._hasPatrolTarget = true;
            return;
        }

        // Try random points within the 70° forward cone at a long distance.
        for (let i = 0; i < MAX_SAFE_TARGET_ATTEMPTS; i++) {
            const dist = randomInRange(minDist, maxDist);
            const a = this._planeAngle + randomInRange(-PATROL_FORWARD_CONE_HALF, PATROL_FORWARD_CONE_HALF);
            const tx = pos.x + Math.cos(a) * dist;
            const ty = pos.y + Math.sin(a) * dist;
            if (isPointInRect(tx, ty, area) && isPointSafe(tx, ty, level, exWater) && isPathClear(pos.x, pos.y, tx, ty, area, level, null, exWater)) {
                this.patrolTarget.set(tx, ty, pos.z);
                this._hasPatrolTarget = true;
                return;
            }
        }

        // Any safe random point in the rect with a clear path.
        for (let i = 0; i < MAX_SAFE_TARGET_ATTEMPTS; i++) {
            const tx = randomInRange(area.left, area.right);
            const ty = randomInRange(area.bottom, area.top);
            if (isPointSafe(tx, ty, level, exWater) && isPathClear(pos.x, pos.y, tx, ty, area, level, null, exWater)) {
                this.patrolTarget.set(tx, ty, pos.z);
                this._hasPatrolTarget = true;
                return;
            }
        }

        // Last resort: zone center.
        this.patrolTarget.set((area.left + area.right) * 0.5, (area.bottom + area.top) * 0.5, pos.z);
        this._hasPatrolTarget = true;
    }

    _selectNewPatrolTarget(level) {
        const area = this._area || { left: -100, right: 100, bottom: 0, top: 80 };
        const pos  = this.owner.container.position;
        const polygon = this._allowedPolygon;

        // Swim mode: ask the owner for a polygon-constrained target if it offers one.
        // Fall back to rejection sampling inside the polygon's AABB.
        if (polygon) {
            if (typeof this.owner.pickRandomSwimTarget === 'function') {
                const picked = this.owner.pickRandomSwimTarget();
                if (picked && isPointSafe(picked.x, picked.y, level)) {
                    this.patrolTarget.set(picked.x, picked.y, pos.z);
                    this._hasPatrolTarget = true;
                    return;
                }
            }
            for (let i = 0; i < MAX_SAFE_TARGET_ATTEMPTS; i++) {
                const x = randomInRange(area.left, area.right);
                const y = randomInRange(area.bottom, area.top);
                if (pointInPolygon(x, y, polygon.points) && isPointSafe(x, y, level)) {
                    this.patrolTarget.set(x, y, pos.z);
                    this._hasPatrolTarget = true;
                    return;
                }
            }
            // Fall through: keep prior target rather than picking an unsafe one.
            this._hasPatrolTarget = false;
            return;
        }

        const x = randomInRange(area.left, area.right);
        const y = randomInRange(area.bottom, area.top);
        this.patrolTarget.set(x, y, pos.z);
        this._hasPatrolTarget = true;
    }

    _clampToArea(vec) {
        const area = this._area;
        if (!area) return;
        vec.x = Math.max(area.left, Math.min(area.right, vec.x));
        vec.y = Math.max(area.bottom, Math.min(area.top, vec.y));
        // Polygon-constrained mode: if the bounds-clamped point still lies outside
        // the polygon, nudge it toward the polygon centroid.
        const polygon = this._allowedPolygon;
        if (polygon && !pointInPolygon(vec.x, vec.y, polygon.points)) {
            const cx = (area.left + area.right) * 0.5;
            const cy = (area.bottom + area.top) * 0.5;
            vec.x = cx;
            vec.y = cy;
        }
    }

    _getDynoXY(dynoTarget) {
        if (!dynoTarget) return null;
        const hc = dynoTarget.getWorldCollisionCircle?.();
        if (hc && Number.isFinite(hc.centerX)) return { x: hc.centerX, y: hc.centerY };
        if (dynoTarget.getWorldPosition) {
            const tmp = new THREE.Vector3();
            dynoTarget.getWorldPosition(tmp);
            return { x: tmp.x, y: tmp.y };
        }
        return null;
    }
}
