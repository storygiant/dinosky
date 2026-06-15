import * as THREE from 'three';

const COMPLETABLE_OBJECT_STATES = new Set(['idle']);

function pointInZone(point, zone) {
    return Boolean(
        point &&
        zone &&
        point.x >= zone.left &&
        point.x <= zone.right &&
        point.y >= zone.bottom &&
        point.y <= zone.top
    );
}

function getObjectMissionPoint(levelObject) {
    const rect = levelObject?.getWorldCollisionRect?.() || levelObject?.getExplosionDamageRect?.();
    if (rect && Number.isFinite(rect.centerX) && Number.isFinite(rect.centerY)) {
        return { x: rect.centerX, y: rect.centerY };
    }

    const position = levelObject?.container?.position || levelObject?.position || null;
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
        return { x: position.x, y: position.y };
    }

    return null;
}

// For mission completion checks (object in zone, etc.), only count idle objects
function getMissionObjects(game, objectType) {
    return (game?.levelObjectManager?.objects || []).filter((levelObject) => (
        levelObject?.type === objectType &&
        !levelObject.isDestroyed &&
        !levelObject.markedForRemoval &&
        COMPLETABLE_OBJECT_STATES.has(levelObject.state)
    ));
}

// For mission completion checks with multiple types
function getMissionObjectsOfTypes(game, objectTypes) {
    if (!Array.isArray(objectTypes)) return [];
    const typeSet = new Set(objectTypes);
    return (game?.levelObjectManager?.objects || []).filter((levelObject) => (
        typeSet.has(levelObject?.type) &&
        !levelObject.isDestroyed &&
        !levelObject.markedForRemoval &&
        COMPLETABLE_OBJECT_STATES.has(levelObject.state)
    ));
}

// For mission viability checks (can mission still be completed), count any non-destroyed objects
function getAvailableMissionObjects(game, objectType) {
    return (game?.levelObjectManager?.objects || []).filter((levelObject) => (
        levelObject?.type === objectType &&
        !levelObject.isDestroyed &&
        !levelObject.markedForRemoval
    ));
}

// For mission viability checks with multiple types
function getAvailableMissionObjectsOfTypes(game, objectTypes) {
    if (!Array.isArray(objectTypes)) return [];
    const typeSet = new Set(objectTypes);
    return (game?.levelObjectManager?.objects || []).filter((levelObject) => (
        typeSet.has(levelObject?.type) &&
        !levelObject.isDestroyed &&
        !levelObject.markedForRemoval
    ));
}

function countAvailableMissionObjects(game, objectType) {
    return getAvailableMissionObjects(game, objectType).length;
}

function countAvailableMissionObjectsOfTypes(game, objectTypes) {
    return getAvailableMissionObjectsOfTypes(game, objectTypes).length;
}

function countObjectsInZones(game, objectType, zones, requireSettled = false) {
    if (!zones?.length) {
        return 0;
    }

    let count = 0;
    for (const levelObject of getMissionObjects(game, objectType)) {
        if (requireSettled && levelObject.isMotionSettled?.() === false) continue;
        const point = getObjectMissionPoint(levelObject);
        if (zones.some((zone) => pointInZone(point, zone))) {
            count += 1;
        }
    }
    return count;
}

function countObjectsOfTypesInZones(game, objectTypes, zones, requireSettled = false) {
    if (!zones?.length) {
        return 0;
    }

    let count = 0;
    for (const levelObject of getMissionObjectsOfTypes(game, objectTypes)) {
        if (requireSettled && levelObject.isMotionSettled?.() === false) continue;
        const point = getObjectMissionPoint(levelObject);
        if (zones.some((zone) => pointInZone(point, zone))) {
            count += 1;
        }
    }
    return count;
}

// Get a level object by its sourceObjectName (Tiled object name).
function getObjectBySourceName(game, name) {
    return (game?.levelObjectManager?.objects || []).find(
        (o) => o?.sourceObjectName === name && !o.isDestroyed && !o.markedForRemoval
    ) || null;
}

// Same as getObjectBySourceName but only returns the object when it is idle and motion-settled
// (not carried, not falling, not still bouncing). Use for completion checks.
function getSettledObjectBySourceName(game, name) {
    return (game?.levelObjectManager?.objects || []).find(
        (o) => o?.sourceObjectName === name &&
            !o.isDestroyed &&
            !o.markedForRemoval &&
            COMPLETABLE_OBJECT_STATES.has(o.state) &&
            o.isMotionSettled?.() !== false
    ) || null;
}

// Resolve zoneIds list to zone objects, returning null for missing zones.
function resolveZones(game, zoneIds) {
    return zoneIds.map((id) => game?.getMissionZoneById?.(id) || null);
}


// For objectType + zoneIds: check that each zone has at least one idle, settled object of that type.
function allZonesHaveObjectOfType(game, objectType, zones) {
    const objects = getMissionObjects(game, objectType).filter((o) => o.isMotionSettled?.() !== false);
    return zones.every((zone) => {
        if (!zone) return false;
        return objects.some((o) => pointInZone(getObjectMissionPoint(o), zone));
    });
}

// For objectTypes + zoneIds: check that each zone has at least one idle, settled object of any of the types.
function allZonesHaveObjectOfTypes(game, objectTypes, zones) {
    const objects = getMissionObjectsOfTypes(game, objectTypes).filter((o) => o.isMotionSettled?.() !== false);
    return zones.every((zone) => {
        if (!zone) return false;
        return objects.some((o) => pointInZone(getObjectMissionPoint(o), zone));
    });
}

export class MissionTypeHandler {
    start() {}
    update() {}
    cleanup() {}
    isComplete() {
        return false;
    }
    isStillCompletable(mission, game) {
        // By default, check if required objects still exist in the level
        const params = mission.params || {};
        const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
        const availableCount = countAvailableMissionObjects(game, params.objectType);
        return availableCount >= requiredCount;
    }
}

function getZoneDurationSeconds(mission) {
    const params = mission?.params || {};
    const configuredDuration = params.zoneDuration ??
        params.requiredDuration ??
        params.duration ??
        mission?.zoneDuration ??
        mission?.requiredDuration;

    return Number.isFinite(configuredDuration)
        ? Math.max(0.1, configuredDuration)
        : 1;
}

export class PlaceObjectOnTargetMission extends MissionTypeHandler {
    start(mission, game) {
        const zones = game?.getMissionZonesByType?.(mission.params?.targetType) || [];
        if (!zones.length) {
            console.warn(`[Mission] No zones found for targetType "${mission.params?.targetType}".`);
        }
    }

    isComplete(mission, game) {
        const params = mission.params || {};
        const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
        const zones = game?.getMissionZonesByType?.(params.targetType) || [];
        return countObjectsInZones(game, params.objectType, zones) >= requiredCount;
    }
}

export class DeliverObjectToZoneMission extends MissionTypeHandler {
    start(mission, game) {
        const params = mission.params || {};
        const zoneIds = Array.isArray(params.zoneIds) ? params.zoneIds
            : (params.zoneId ? [params.zoneId] : []);
        for (const id of zoneIds) {
            if (!game?.getMissionZoneById?.(id)) {
                console.warn(`[Mission] No zone found for zoneId "${id}".`);
            }
        }
        if (Array.isArray(params.objectNames)) {
            for (const name of params.objectNames) {
                if (!getObjectBySourceName(game, name)) {
                    console.warn(`[Mission] No object found for objectName "${name}".`);
                }
            }
        }
    }

    isComplete(mission, game) {
        const params = mission.params || {};
        const zoneIds = Array.isArray(params.zoneIds) ? params.zoneIds
            : (params.zoneId ? [params.zoneId] : []);
        const zones = resolveZones(game, zoneIds);

        // objectNames mode: each named object must be idle, settled, and in its paired zone.
        if (Array.isArray(params.objectNames) && params.objectNames.length > 0) {
            return params.objectNames.every((name, i) => {
                const obj = getSettledObjectBySourceName(game, name);
                const zone = zones[Math.min(i, zones.length - 1)];
                if (!obj || !zone) return false;
                return pointInZone(getObjectMissionPoint(obj), zone);
            });
        }

        // objectTypes + zoneIds mode: every zone must contain at least one settled object of any of the types.
        if (Array.isArray(params.objectTypes) && params.objectTypes.length > 0 && zones.length > 1) {
            return allZonesHaveObjectOfTypes(game, params.objectTypes, zones);
        }

        // objectTypes + single zone: count objects of any type in the zone.
        if (Array.isArray(params.objectTypes) && params.objectTypes.length > 0) {
            const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
            return countObjectsOfTypesInZones(game, params.objectTypes, zones.filter(Boolean), true) >= requiredCount;
        }

        // objectType + zoneIds mode: every zone must contain at least one settled object of that type.
        if (params.objectType && zones.length > 1) {
            return allZonesHaveObjectOfType(game, params.objectType, zones);
        }

        // Legacy: objectType + single zone (zoneId or zoneIds[0]).
        const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
        return countObjectsInZones(game, params.objectType, zones.filter(Boolean), true) >= requiredCount;
    }

    isStillCompletable(mission, game) {
        const params = mission.params || {};

        if (Array.isArray(params.objectNames) && params.objectNames.length > 0) {
            // Every named object must still exist (not destroyed).
            return params.objectNames.every((name) => Boolean(getObjectBySourceName(game, name)));
        }

        // Check if objectTypes are specified
        if (Array.isArray(params.objectTypes) && params.objectTypes.length > 0) {
            const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
            const availableCount = countAvailableMissionObjectsOfTypes(game, params.objectTypes);
            return availableCount >= requiredCount;
        }

        // Fall back to base class logic (checks objectType count).
        return super.isStillCompletable(mission, game);
    }
}

export class LiftObjectForDurationMission extends MissionTypeHandler {
    start(mission, game) {
        this.mission = mission;
        this.game = game;
        this.objectLiftDurations = new Map(); // Maps object id to accumulated lift duration
    }

    update(deltaTime, mission, game) {
        if (game?.gameplayPaused) {
            return;
        }

        const params = mission.params || {};
        const objectType = params.objectType;

        // Check if current attached object (held/lifted) matches our mission object type
        const attachedObject = game?.player?.getAttachedObject?.();
        if (attachedObject && attachedObject.type === objectType) {
            const objectId = attachedObject.id;
            const currentDuration = this.objectLiftDurations.get(objectId) || 0;
            this.objectLiftDurations.set(objectId, currentDuration + deltaTime);
        }
    }

    isComplete(mission, game) {
        const params = mission.params || {};
        const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
        const requiredDuration = Math.max(0.1, Number.isFinite(params.duration) ? params.duration : 5);

        // Count how many objects have lifted for the required duration
        let completedCount = 0;
        for (const duration of this.objectLiftDurations.values()) {
            if (duration >= requiredDuration) {
                completedCount += 1;
            }
        }

        return completedCount >= requiredCount;
    }

    cleanup() {
        this.objectLiftDurations.clear();
    }
}

export class DragObjectForDurationMission extends MissionTypeHandler {
    start(mission, game) {
        this.mission = mission;
        this.game = game;
        this.objectDragDurations = new Map(); // Maps object id to accumulated drag duration
    }

    update(deltaTime, mission, game) {
        if (game?.gameplayPaused) {
            return;
        }

        const params = mission.params || {};
        const objectType = params.objectType;
        const requiredDuration = Math.max(0.1, Number.isFinite(params.duration) ? params.duration : 5);

        // Check if current dragged object matches our mission object type
        const draggedObject = game?.player?.draggedObject;
        if (draggedObject && draggedObject.type === objectType) {
            const objectId = draggedObject.id;
            const currentDuration = this.objectDragDurations.get(objectId) || 0;
            this.objectDragDurations.set(objectId, currentDuration + deltaTime);
        }
    }

    isComplete(mission, game) {
        const params = mission.params || {};
        const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
        const requiredDuration = Math.max(0.1, Number.isFinite(params.duration) ? params.duration : 5);

        // Count how many objects have dragged for the required duration
        let completedCount = 0;
        for (const duration of this.objectDragDurations.values()) {
            if (duration >= requiredDuration) {
                completedCount += 1;
            }
        }

        return completedCount >= requiredCount;
    }

    cleanup() {
        this.objectDragDurations.clear();
    }
}

export class FlyToZoneMission extends MissionTypeHandler {
    start(mission, game) {
        this.timeInsideZone = 0;
        const zone = game?.getMissionZoneById?.(mission.params?.zoneId);
        if (!zone) {
            console.warn(`[Mission] No zone found for zoneId "${mission.params?.zoneId}".`);
        }
    }

    update(deltaTime, mission, game) {
        if (game?.gameplayPaused) {
            return;
        }

        const zone = game?.getMissionZoneById?.(mission.params?.zoneId);
        const player = game?.player;
        const playerPoint = player?.position
            ? { x: player.position.x, y: player.position.y }
            : null;

        if (!zone || !playerPoint) {
            this.timeInsideZone = 0;
            return;
        }

        if (pointInZone(playerPoint, zone)) {
            this.timeInsideZone += Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
        } else {
            this.timeInsideZone = 0;
        }
    }

    isComplete(mission) {
        return this.timeInsideZone >= getZoneDurationSeconds(mission);
    }

    isStillCompletable() {
        return true;
    }

    cleanup() {
        this.timeInsideZone = 0;
    }
}

// Glowing particle trail that follows the race route.
// Uses cheap untextured InstancedMesh quads with the same depth/renderOrder rules
// as DynoFireBreath so it stays in front of the same level layers.
class RaceTrail {
    constructor(scene, pathPoints, z = 1, renderOrder = 6.5) {
        this.scene = scene;
        this.z = z;
        this.renderOrder = renderOrder;
        this.widthDeviation = 1.15;

        // Compute cumulative distances along the path for uniform sampling.
        this.path = pathPoints;
        this.segments = [];
        this.totalLength = 0;
        for (let i = 0; i < pathPoints.length - 1; i++) {
            const dx = pathPoints[i + 1].x - pathPoints[i].x;
            const dy = pathPoints[i + 1].y - pathPoints[i].y;
            const len = Math.sqrt(dx * dx + dy * dy);
            this.segments.push({ dx, dy, len, start: this.totalLength });
            this.totalLength += len;
        }

        const PARTICLES_PER_UNIT = 1.5;
        const AVG_LIFETIME = 2.5;
        const steadyCount = Math.max(1, Math.ceil(PARTICLES_PER_UNIT * this.totalLength));
        const POOL_SIZE = Math.min(Math.max(steadyCount + Math.ceil(steadyCount * 0.25), 20), 600);
        this._spawnInterval = AVG_LIFETIME / steadyCount;
        this._poolSize = POOL_SIZE;

        // InstancedMesh with a tiny procedurally-generated circular texture: still very cheap,
        // but visually round instead of square.
        const geo = new THREE.PlaneGeometry(1, 1);
        this._particleTexture = this._createParticleTexture();
        const mat = new THREE.MeshBasicMaterial({
            map: this._particleTexture,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            vertexColors: false
        });

        this._root = new THREE.Group();
        this._root.name = 'RaceTrail';
        this._root.renderOrder = renderOrder;

        this._mesh = new THREE.InstancedMesh(geo, mat, POOL_SIZE);
        this._mesh.name = 'RaceTrailParticles';
        this._mesh.frustumCulled = false;
        this._mesh.renderOrder = renderOrder;
        this._mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

        // Initialise all instances to black (invisible under additive blending).
        const black = new THREE.Color(0, 0, 0);
        for (let i = 0; i < POOL_SIZE; i++) {
            this._mesh.setColorAt(i, black);
        }
        if (this._mesh.instanceColor) {
            this._mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        }

        // Scale all instances to zero so invisible ones don't show as dots.
        const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < POOL_SIZE; i++) {
            this._mesh.setMatrixAt(i, zeroMatrix);
        }
        this._mesh.instanceMatrix.needsUpdate = true;

        this._root.add(this._mesh);
        scene.add(this._root);

        // Particle state array (no THREE objects per particle — just data).
        this._particles = [];
        for (let i = 0; i < POOL_SIZE; i++) {
            this._particles.push({ active: false, age: 0, life: 0, x: 0, y: 0 });
        }
        this._spawnAccum = 0;
        this._dummy = new THREE.Object3D();
    }

    _createParticleTexture() {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        const gradient = ctx.createRadialGradient(
            size * 0.5,
            size * 0.5,
            0,
            size * 0.5,
            size * 0.5,
            size * 0.5
        );
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.45, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.8, 'rgba(255,255,255,0.35)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, size, size);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
    }

    setRenderOrder(renderOrder) {
        if (!Number.isFinite(renderOrder) || renderOrder === this.renderOrder) {
            return;
        }

        this.renderOrder = renderOrder;
        this._root.renderOrder = renderOrder;
        this._mesh.renderOrder = renderOrder;
    }

    setRenderDepth(z) {
        if (Number.isFinite(z)) {
            this.z = z;
        }
    }

    _samplePath(t) {
        if (this.totalLength <= 0 || this.segments.length === 0) {
            return { x: this.path[0]?.x || 0, y: this.path[0]?.y || 0 };
        }
        const dist = THREE.MathUtils.clamp(t, 0, 1) * this.totalLength;
        for (let i = 0; i < this.segments.length; i++) {
            const seg = this.segments[i];
            const segEnd = seg.start + seg.len;
            if (dist <= segEnd || i === this.segments.length - 1) {
                const local = seg.len > 0 ? (dist - seg.start) / seg.len : 0;
                return {
                    x: this.path[i].x + seg.dx * local,
                    y: this.path[i].y + seg.dy * local
                };
            }
        }
        const last = this.path[this.path.length - 1];
        return { x: last.x, y: last.y };
    }

    update(dt) {
        this._spawnAccum += dt;
        while (this._spawnAccum >= this._spawnInterval) {
            this._spawnAccum -= this._spawnInterval;
            const slot = this._particles.find((p) => !p.active);
            if (slot) {
                const pos = this._samplePath(Math.random());
                slot.active = true;
                slot.age = 0;
                slot.life = 2.0 + Math.random() * 1.0;
                slot.x = pos.x + (Math.random() - 0.5) * this.widthDeviation;
                slot.y = pos.y + (Math.random() - 0.5) * this.widthDeviation;
            }
        }

        let colorDirty = false;
        let matrixDirty = false;
        const color = new THREE.Color();
        const black = new THREE.Color(0, 0, 0);

        for (let i = 0; i < this._poolSize; i++) {
            const p = this._particles[i];
            if (!p.active) continue;

            p.age += dt;
            const progress = p.age / p.life;

            if (progress >= 1) {
                p.active = false;
                // Hide by zeroing scale.
                this._mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
                this._mesh.setColorAt(i, black);
                matrixDirty = true;
                colorDirty = true;
                continue;
            }

            const fadeIn = Math.min(progress / 0.15, 1);
            const fadeOut = progress > 0.7 ? 1 - ((progress - 0.7) / 0.3) : 1;
            const alpha = fadeIn * fadeOut;

            // Cyan-white tint — visible against brown terrain.
            const bright = (1 - progress * 0.3) * alpha;
            color.setRGB(bright * 0.4, bright, bright);
            this._mesh.setColorAt(i, color);

            const size = 0.6 * (1 - progress * 0.4);
            this._dummy.position.set(p.x, p.y, this.z);
            this._dummy.scale.setScalar(size);
            this._dummy.updateMatrix();
            this._mesh.setMatrixAt(i, this._dummy.matrix);

            matrixDirty = true;
            colorDirty = true;
        }

        if (matrixDirty) this._mesh.instanceMatrix.needsUpdate = true;
        if (colorDirty && this._mesh.instanceColor) this._mesh.instanceColor.needsUpdate = true;
    }

    dispose() {
        this.scene.remove(this._root);
        this._mesh.geometry.dispose();
        this._mesh.material.dispose();
        this._particleTexture?.dispose?.();
        this._particles = [];
    }
}

// Build a smooth path through waypoints using Catmull-Rom sampling.
function buildSmoothedPath(waypoints, samplesPerSegment = 8) {
    if (waypoints.length < 2) return waypoints.slice();
    const pts = waypoints.map((p) => new THREE.Vector2(p.x, p.y));
    const curve = new THREE.SplineCurve(pts);
    const total = (waypoints.length - 1) * samplesPerSegment;
    return curve.getPoints(total).map((p) => ({ x: p.x, y: p.y }));
}

export class RaceMission extends MissionTypeHandler {
    start(mission, game) {
        const params = mission.params || {};
        const ringIds = Array.isArray(params.rings) ? params.rings : [];

        // Resolve ring IDs to RingObject instances
        // Matches against: Tiled object name (sourceObjectName), object id, or string form of numeric id
        this._rings = ringIds
            .map((id) => (game?.levelObjectManager?.objects || []).find(
                (o) => (o?.type === 'ring' || o?.type === 'ringhorizontal') && (
                    o?.sourceObjectName === id ||
                    o?.id === id ||
                    String(o?.id) === String(id)
                )
            ))
            .filter(Boolean);

        this._currentRingIndex = 0;
        this._raceElapsedMs = 0;
        this._raceTimeMs = 0;
        this._running = false;
        this._trail = null;

        if (!this._rings.length) {
            console.warn(`[Mission RACE] No rings resolved from params.rings: ${JSON.stringify(ringIds)}`);
        } else {
            console.log(`[Mission RACE] Starting with ${this._rings.length} rings`);
        }

        // Intercept onRingPassed to handle our ring sequence
        this._originalOnRingPassed = game?.levelObjectManager?.onRingPassed || null;
        if (game?.levelObjectManager) {
            game.levelObjectManager.onRingPassed = (ring) => {
                this._originalOnRingPassed?.(ring);
                this._handleRingPassed(ring, mission, game);
            };
        }

        this._mission = mission;
        this._missionId = mission?.id ?? null;
        const hasMissionVisibilityList = Array.isArray(mission.visibleDuringMission);
        const configuredAhead = Number.isFinite(mission.raceRollingVisibilityAhead)
            ? Math.max(0, Math.floor(mission.raceRollingVisibilityAhead))
            : null;
        const configuredBehind = Number.isFinite(mission.raceRollingVisibilityBehind)
            ? Math.max(0, Math.floor(mission.raceRollingVisibilityBehind))
            : null;
        this._rollingVisibility = hasMissionVisibilityList && (
            configuredAhead !== null ||
            configuredBehind !== null ||
            mission.raceRollingVisibility === true
        );
        // `ahead` counts from the current target ring inclusively, so:
        // ahead=2, behind=1 means: previous ring + current ring + next ring.
        this._rollingVisibilityAhead = configuredAhead ?? (mission.raceRollingVisibility === true ? 2 : 0);
        this._rollingVisibilityBehind = configuredBehind ?? (mission.raceRollingVisibility === true ? 1 : 0);

        this._running = true;
        this._raceElapsedMs = 0;
        mission.missionResult = null;
        mission.raceTimeMs = 0;
        mission.currentRingIndex = 0;
        mission.totalRings = this._rings.length > 0 ? this._rings.length : ringIds.length;

        if (this._rollingVisibility) {
            this._updateRollingVisibility();
        }

        // Build trail using the smoothed path (build it now if preview didn't already).
        if (!this._smoothedPath) {
            this.buildSmoothedRacePath(game, mission);
        }
        if (game?.scene && this._smoothedPath?.length >= 2) {
            const trailZ = Number.isFinite(game.player?.position?.z) ? game.player.position.z : 1;
            const trailRenderOrder = game.player?.visualRenderOrder ??
                game.levelRenderer?.getDynoRenderOrder?.() ??
                6.5;
            this._trail = new RaceTrail(game.scene, this._smoothedPath, trailZ, trailRenderOrder);
            // Hide trail visually if requested (top-level or params).
            if (mission.raceTrailVisible === false || mission.params?.raceTrailVisible === false) {
                this._trail._root.visible = false;
            }
        }
    }

    _updateRollingVisibility() {
        const i = this._currentRingIndex;
        const rings = this._rings;
        const visibleRings = new Set();
        const firstVisibleIndex = Math.max(0, i - this._rollingVisibilityBehind);
        const lastVisibleIndex = Math.min(
            rings.length - 1,
            i + Math.max(0, this._rollingVisibilityAhead - 1)
        );
        for (let ringIndex = firstVisibleIndex; ringIndex <= lastVisibleIndex; ringIndex += 1) {
            const ring = rings[ringIndex];
            if (ring) {
                visibleRings.add(ring);
            }
        }

        const uniqueRings = new Set(rings);
        for (const ring of uniqueRings) {
            ring?.setVisible?.(visibleRings.has(ring));
        }
    }

    // Build the ring waypoints and smoothed path, storing on this instance so
    // the camera preview and trail both use the same curve.
    buildSmoothedRacePath(game, mission) {
        const params = mission?.params || {};
        const ringIds = Array.isArray(params.rings) ? params.rings : [];
        // Resolve rings if not yet done (called before start()).
        if (!this._rings) {
            this._rings = ringIds
                .map((id) => (game?.levelObjectManager?.objects || []).find(
                    (o) => (o?.type === 'ring' || o?.type === 'ringhorizontal') && (
                        o?.sourceObjectName === id ||
                        o?.id === id ||
                        String(o?.id) === String(id)
                    )
                ))
                .filter(Boolean);
        }
        if (!this._rings.length) return [];

        const waypoints = [];
        const dynoPos = game?.player?.position;
        if (dynoPos) waypoints.push({ x: dynoPos.x, y: dynoPos.y });

        for (const ring of this._rings) {
            ring.container?.updateWorldMatrix?.(true, true);
            ring.sceneObject?.updateWorldMatrix?.(true, true);
            const line = ring.getRingPassLine?.();
            if (line?.horizontal) {
                waypoints.push({ x: (line.x0 + line.x1) * 0.5, y: line.y });
            } else if (line) {
                waypoints.push({ x: line.x, y: (line.y0 + line.y1) * 0.5 });
            } else {
                const pos = ring.container?.position;
                if (pos) waypoints.push({ x: pos.x, y: pos.y });
            }
        }

        // Extend slightly past the last ring.
        if (waypoints.length >= 2) {
            const n = waypoints.length;
            const dx = waypoints[n - 1].x - waypoints[n - 2].x;
            const dy = waypoints[n - 1].y - waypoints[n - 2].y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            waypoints.push({
                x: waypoints[n - 1].x + (dx / len) * 4,
                y: waypoints[n - 1].y + (dy / len) * 4
            });
        }

        this._smoothedPath = waypoints.length >= 2 ? buildSmoothedPath(waypoints, 10) : waypoints;
        return this._smoothedPath;
    }

    _handleRingPassed(ring, mission, game) {
        if (!this._running) return;

        const targetRing = this._rings[this._currentRingIndex];
        if (!targetRing || ring !== targetRing) return;

        this._currentRingIndex += 1;
        mission.currentRingIndex = this._currentRingIndex;
        console.log(`[Mission RACE] Ring ${this._currentRingIndex}/${this._rings.length} passed`);

        if (this._rollingVisibility) {
            this._updateRollingVisibility();
        }

        if (this._currentRingIndex >= this._rings.length) {
            this._raceTimeMs = this._raceElapsedMs;
            mission.raceTimeMs = this._raceTimeMs;
            mission.missionResult = { raceTimeMs: this._raceTimeMs, ringsCompleted: this._rings.length };
            this._running = false;
            console.log(`[Mission RACE] Finished! Time: ${this._raceTimeMs.toFixed(0)}ms`);
        }
    }

    update(deltaTime, mission, game) {
        if (this._running) {
            this._raceElapsedMs += deltaTime * 1000;
            mission.raceTimeMs = this._raceElapsedMs;
        }
        this._trail?.setRenderOrder(
            game?.player?.visualRenderOrder ??
            game?.levelRenderer?.getDynoRenderOrder?.()
        );
        this._trail?.setRenderDepth(
            game?.player?.position?.z
        );
        this._trail?.update(deltaTime);
    }

    isComplete(mission) {
        return !this._running && this._rings?.length > 0 && this._currentRingIndex >= this._rings.length;
    }

    isStillCompletable() {
        return true;
    }

    cleanup(mission, game) {
        // Restore original onRingPassed
        if (game?.levelObjectManager) {
            game.levelObjectManager.onRingPassed = this._originalOnRingPassed;
        }
        this._trail?.dispose();
        this._trail = null;
        this._running = false;
        this._rings = null;
        this._smoothedPath = null;
        this._currentRingIndex = 0;
        this._raceElapsedMs = 0;
        this._mission = null;
        this._missionId = null;
        this._rollingVisibility = false;
        this._rollingVisibilityAhead = 0;
        this._rollingVisibilityBehind = 0;
    }

    getCurrentTargetRing(mission) {
        return this._rings?.[this._currentRingIndex] ?? null;
    }

    isTrackingMission(mission) {
        return Boolean(mission?.id) && mission.id === this._missionId;
    }

    getCompletedRingCount() {
        return Math.max(0, this._currentRingIndex || 0);
    }

    getTotalRingCount() {
        return Math.max(0, this._rings?.length || 0);
    }
}

export const raceMission = new RaceMission();

// ─── Destroy Object Mission ───────────────────────────────────────────────────
//
// Params:
//   targets: string | string[]  — sourceObjectName(s) of objects to destroy
//   noExplode: boolean          — if true, objects freeze at health=0 (no explosion)
//
// All listed targets must reach health=0 to complete the mission.

function findTargetObjects(game, targets) {
    const names = Array.isArray(targets) ? targets : [targets];
    return (game?.levelObjectManager?.objects || []).filter(
        (o) => !o.markedForRemoval && names.includes(o.sourceObjectName)
    );
}

function findTargetObjectsByType(game, objectType) {
    return (game?.levelObjectManager?.objects || []).filter(
        (o) => o?.type === objectType && !o.markedForRemoval
    );
}

function countDestroyedTargets(targets) {
    return targets.reduce((count, obj) => (
        (obj?.isDestroyed || obj?.health <= 0) ? count + 1 : count
    ), 0);
}

class DestroyObjectMission extends MissionTypeHandler {
    constructor() {
        super();
        this._targets = [];
    }

    start(mission, game) {
        const params = mission.params || {};
        const noExplode = params.noExplode === true;
        this._targets = findTargetObjects(game, params.targets ?? []);
        if (this._targets.length === 0) {
            console.warn('[Mission] DESTROY: no target objects found for', params.targets);
        }
        if (noExplode) {
            for (const obj of this._targets) {
                obj.freezeAtZeroHealth = true;
            }
        }
    }

    isComplete(mission, game) {
        if (this._targets.length === 0) return false;
        return this._targets.every((obj) => obj.isDestroyed || obj.health <= 0);
    }

    cleanup() {
        // Only clear the freeze flag on objects that still have health — objects already
        // frozen at zero health must keep the flag so they don't explode after cleanup.
        for (const obj of this._targets) {
            if (obj.health > 0) obj.freezeAtZeroHealth = false;
        }
        this._targets = [];
    }

    isStillCompletable(mission, game) {
        return this._targets.length > 0;
    }
}

class TimedDestroyMission extends DestroyObjectMission {
    constructor() {
        super();
        this._elapsedMs = 0;
        this._requiredCount = 0;
    }

    start(mission, game) {
        const params = mission.params || {};
        const noExplode = params.noExplode === true;
        const namedTargets = params.targets ?? [];
        const hasNamedTargets = Array.isArray(namedTargets)
            ? namedTargets.length > 0
            : Boolean(namedTargets);

        this._targets = hasNamedTargets
            ? findTargetObjects(game, namedTargets)
            : findTargetObjectsByType(game, params.objectType);
        this._requiredCount = Math.max(
            1,
            Number.isFinite(params.requiredCount)
                ? params.requiredCount
                : (hasNamedTargets ? this._targets.length : 1)
        );

        if (this._targets.length === 0) {
            console.warn('[Mission] DESTROY_TIMED: no target objects found for', params.targets ?? params.objectType);
        }

        if (noExplode) {
            for (const obj of this._targets) {
                obj.freezeAtZeroHealth = true;
            }
        }

        this._elapsedMs = 0;
        this._updateMissionResult(mission);
    }

    update(deltaTime, mission, game) {
        this._elapsedMs += deltaTime * 1000;
        this._updateMissionResult(mission);
    }

    _updateMissionResult(mission) {
        const raceTimeMs = Math.max(0, this._elapsedMs);
        const destroyedCount = countDestroyedTargets(this._targets);
        mission.raceTimeMs = raceTimeMs;
        mission.missionResult = {
            ...(mission.missionResult || {}),
            raceTimeMs,
            destroyedCount,
            requiredCount: this._requiredCount
        };
    }

    isComplete(mission, game) {
        if (this._targets.length === 0) return false;
        this._updateMissionResult(mission);
        const destroyedCount = mission.missionResult?.destroyedCount ?? 0;
        return destroyedCount >= this._requiredCount;
    }

    cleanup(mission, game) {
        this._updateMissionResult(mission);
        super.cleanup(mission, game);
        this._elapsedMs = 0;
        this._requiredCount = 0;
    }

    isStillCompletable(mission, game) {
        if (this._targets.length === 0) {
            return false;
        }

        const destroyedCount = countDestroyedTargets(this._targets);
        const aliveCount = this._targets.length - destroyedCount;
        return destroyedCount + aliveCount >= this._requiredCount;
    }
}

// Mission handlers are intentionally registered by type. To add a mission, create a new
// handler class with start/update/isComplete/cleanup and add it to this registry.
export const missionHandlers = {
    PLACE_OBJECT_ON_TARGET: new PlaceObjectOnTargetMission(),
    DELIVER_OBJECT_TO_ZONE: new DeliverObjectToZoneMission(),
    LIFT_OBJECT_FOR_DURATION: new LiftObjectForDurationMission(),
    DRAG_OBJECT_FOR_DURATION: new DragObjectForDurationMission(),
    FLY_TO_ZONE: new FlyToZoneMission(),
    RACE: raceMission,
    DESTROY: new DestroyObjectMission(),
    DESTROY_TIMED: new TimedDestroyMission()
};
