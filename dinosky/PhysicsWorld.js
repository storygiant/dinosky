import * as THREE from 'three';
import { CONFIG, MATTER_MASK_TERRAIN, MATTER_MASK_LEVEL_OBJECTS, MATTER_MASK_PLATFORMS, MATTER_MASK_BLOCK } from './config.js';
import { LEVEL_OBJECT_STATES } from './LevelObject.js';

const MATTER_CATEGORY_TERRAIN = MATTER_MASK_TERRAIN;
const MATTER_CATEGORY_LEVEL_OBJECT = MATTER_MASK_LEVEL_OBJECTS;
const MATTER_CATEGORY_PLATFORM = MATTER_MASK_PLATFORMS;
// All named object categories — used so terrain and platforms accept every typed object.
// Add new MATTER_MASK_* entries here as they are defined in config.js.
const MATTER_CATEGORY_ALL_NAMED = MATTER_MASK_BLOCK;
// Full mask accepted by terrain: generic level objects + platforms + every named type.
const MATTER_CATEGORY_ALL_LEVEL_OBJECTS =
    MATTER_CATEGORY_LEVEL_OBJECT | MATTER_CATEGORY_PLATFORM | MATTER_CATEGORY_ALL_NAMED;
const MAX_ACCUMULATED_MS = 250;
// The game camera sits at z=50 and looks toward z=0. Matter debug overlays need
// to live slightly in front of the gameplay plane, but still in front of the camera.
const DEBUG_Z = 49;

// Module-level scratch objects to avoid per-call allocation in hot Matter API paths.
const TMP_SET_VEL = { x: 0, y: 0 };
const TMP_SET_POS = { x: 0, y: 0 };

function getMatter() {
    return globalThis.Matter || null;
}

function yieldToFrame() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function yieldIfOverBudget(deadlineMs) {
    if (performance.now() < deadlineMs) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function getRectCornersFromBody(body) {
    if (!body?.vertices?.length) {
        return [];
    }

    return body.vertices.map((vertex) => ({ x: vertex.x, y: vertex.y }));
}

// For compound bodies (fromVertices decomposition), body.parts[0] is the parent and
// parts[1..] are the actual convex pieces. Build line-segment geometry for all real
// parts so the debug overlay shows the full decomposed collision shape.
function makeCompoundBodyGeometry(body, z = DEBUG_Z) {
    if (!body) return new THREE.BufferGeometry();
    const parts = (body.parts?.length > 1) ? body.parts.slice(1) : [body];
    const positions = [];
    for (const part of parts) {
        if (!part?.vertices?.length) continue;
        for (let i = 0; i < part.vertices.length; i += 1) {
            const current = part.vertices[i];
            const next = part.vertices[(i + 1) % part.vertices.length];
            if (!Number.isFinite(current.x) || !Number.isFinite(current.y) ||
                !Number.isFinite(next.x)    || !Number.isFinite(next.y)) continue;
            positions.push(current.x, current.y, z, next.x, next.y, z);
        }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
}

function pointInPolygon2D(point, polygon = []) {
    if (!point || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
    }

    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
        const current = polygon[index];
        const previous = polygon[previousIndex];
        const intersects = ((current.y > point.y) !== (previous.y > point.y)) &&
            (point.x < (((previous.x - current.x) * (point.y - current.y)) / ((previous.y - current.y) || 0.000001)) + current.x);
        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

function cross2d(a1, a2, b) {
    return ((a2.x - a1.x) * (b.y - a1.y)) - ((a2.y - a1.y) * (b.x - a1.x));
}

function segmentsCrossStrictly(a1, a2, b1, b2, epsilon = 0.0001) {
    const d1 = cross2d(a1, a2, b1);
    const d2 = cross2d(a1, a2, b2);
    const d3 = cross2d(b1, b2, a1);
    const d4 = cross2d(b1, b2, a2);

    return (
        ((d1 > epsilon && d2 < -epsilon) || (d1 < -epsilon && d2 > epsilon)) &&
        ((d3 > epsilon && d4 < -epsilon) || (d3 < -epsilon && d4 > epsilon))
    );
}

function getPolygonEdges(points = []) {
    const edges = [];
    if (!Array.isArray(points) || points.length < 2) {
        return edges;
    }

    for (let index = 0; index < points.length; index += 1) {
        edges.push([points[index], points[(index + 1) % points.length]]);
    }

    return edges;
}

function getRectCornersFromRect(rect) {
    if (!rect) {
        return [];
    }

    const angle = rect.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfWidth = Math.max(rect.halfWidth ?? 0, 0.0001);
    const halfHeight = Math.max(rect.halfHeight ?? 0, 0.0001);
    const axisX = { x: cos, y: sin };
    const axisY = { x: -sin, y: cos };
    const center = { x: rect.centerX ?? 0, y: rect.centerY ?? 0 };
    const corners = [
        { x: -halfWidth, y: -halfHeight },
        { x: halfWidth, y: -halfHeight },
        { x: halfWidth, y: halfHeight },
        { x: -halfWidth, y: halfHeight }
    ];

    return corners.map((corner) => ({
        x: center.x + (axisX.x * corner.x) + (axisY.x * corner.y),
        y: center.y + (axisX.y * corner.x) + (axisY.y * corner.y)
    }));
}

function getPlanarWorldAngle(object3D, fallbackAngle = 0) {
    if (!object3D?.getWorldQuaternion) {
        return fallbackAngle;
    }

    const quaternion = object3D.getWorldQuaternion(new THREE.Quaternion());
    const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    axisX.z = 0;
    if (axisX.lengthSq() <= 0.000001) {
        return fallbackAngle;
    }

    axisX.normalize();
    return Math.atan2(axisX.y, axisX.x);
}

function getAngleDeltaRadians(a = 0, b = 0) {
    return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function makeLineLoopGeometry(points = [], z = DEBUG_Z) {
    const positions = [];
    if (points.length >= 2) {
        for (let index = 0; index < points.length; index += 1) {
            const current = points[index];
            const next = points[(index + 1) % points.length];
            positions.push(current.x, current.y, z, next.x, next.y, z);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
}

function makeCrossGeometry(point, size = 0.18, z = DEBUG_Z) {
    const x = Number.isFinite(point?.x) ? point.x : 0;
    const y = Number.isFinite(point?.y) ? point.y : 0;
    const positions = [
        x - size, y, z,
        x + size, y, z,
        x, y - size, z,
        x, y + size, z
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
}

function makeJointGeometry(pointA, pointB, markerSize = 0.28, z = DEBUG_Z) {
    const ax = Number.isFinite(pointA?.x) ? pointA.x : 0;
    const ay = Number.isFinite(pointA?.y) ? pointA.y : 0;
    const bx = Number.isFinite(pointB?.x) ? pointB.x : ax;
    const by = Number.isFinite(pointB?.y) ? pointB.y : ay;
    const positions = [
        ax, ay, z,
        bx, by, z,
        ax - markerSize, ay, z,
        ax + markerSize, ay, z,
        ax, ay - markerSize, z,
        ax, ay + markerSize, z,
        bx - markerSize, by, z,
        bx + markerSize, by, z,
        bx, by - markerSize, z,
        bx, by + markerSize, z
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    return geometry;
}

/** Return only terrain bodies whose AABB overlaps the given body's AABB + margin. */
function nearbyTerrainBodies(body, terrainBodies, margin = 4) {
    if (terrainBodies.length < 16 || !body?.bounds) return terrainBodies;
    const minX = body.bounds.min.x - margin;
    const maxX = body.bounds.max.x + margin;
    const minY = body.bounds.min.y - margin;
    const maxY = body.bounds.max.y + margin;
    const result = [];
    for (let i = 0; i < terrainBodies.length; i++) {
        const tb = terrainBodies[i];
        const b = tb?.bounds;
        if (b && b.max.x >= minX && b.min.x <= maxX && b.max.y >= minY && b.min.y <= maxY) {
            result.push(tb);
        }
    }
    return result;
}

export class PhysicsWorld {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.options = options;
        this.Matter = null;
        this.engine = null;
        this.world = null;
        this.accumulatorMs = 0;
        this.terrainBodies = [];
        this.objectBodies = new Map();
        this.bodyToObject = new Map();
        this.dragConstraints = new Map();
        this.debugGroup = null;
        this.debugTerrainLine = null;
        this._startupSettlingMode = false;
        this.debugObjectLines = new Map();
        this.debugVisualRectLines = new Map();
        this.debugVisualAxisLines = new Map();
        this.debugGrabPointLines = new Map();
        this.debugDynoAnchorLines = new Map();
        this.debugJointLines = new Map();
        this.minTerrainY = Number.POSITIVE_INFINITY;
        this.maxTerrainY = Number.NEGATIVE_INFINITY;
        this.debugUpdateCounter = 0;
        this.collisionPolygons = [];
        this.debugRenderStatus = {
            groupCreatedLogged: false,
            terrainRebuildLogged: false,
            objectOverlayLogged: false
        };
    }

    getFixedStepHz() {
        return Math.max(
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterFixedHz)
                ? CONFIG.LEVEL_OBJECTS.matterFixedHz
                : 120,
            30
        );
    }

    getFixedStepMs() {
        return 1000 / this.getFixedStepHz();
    }

    getFixedStepSeconds() {
        return this.getFixedStepMs() / 1000;
    }

    getMatterGravityY() {
        return Math.max(
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterGravityY)
                ? CONFIG.LEVEL_OBJECTS.matterGravityY
                : 0.35,
            0
        );
    }

    getMaxFallSpeed() {
        return Math.max(
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterMaxFallSpeed)
                ? CONFIG.LEVEL_OBJECTS.matterMaxFallSpeed
                : 40,
            1
        );
    }

    getMaxDropVelocity() {
        return Math.max(
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterMaxDropVelocity)
                ? CONFIG.LEVEL_OBJECTS.matterMaxDropVelocity
                : 18,
            1
        );
    }

    getDropVelocityLimitForLevelObject(levelObject) {
        return this.getMaxDropVelocity();
    }

    shouldDebugDropDiagnostics() {
        return CONFIG.LEVEL_OBJECTS?.debugMatterDropDiagnostics === true;
    }

    shouldDebugRenderDiagnostics() {
        return CONFIG.LEVEL_OBJECTS?.debugRenderMatterPhysics === true;
    }

    getLevelObjectSleepThreshold() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectSleepThreshold)
            ? CONFIG.LEVEL_OBJECTS.levelObjectSleepThreshold
            : 60;
    }

    getVelocitySleepThreshold() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectVelocitySleepThreshold)
            ? CONFIG.LEVEL_OBJECTS.levelObjectVelocitySleepThreshold
            : 0.05;
    }

    getAngularSleepThreshold() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectAngularSleepThreshold)
            ? CONFIG.LEVEL_OBJECTS.levelObjectAngularSleepThreshold
            : 0.02;
    }

    getAngularDampingOnContact() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectAngularDampingOnContact)
            ? THREE.MathUtils.clamp(CONFIG.LEVEL_OBJECTS.levelObjectAngularDampingOnContact, 0, 1)
            : 0.98;
    }

    getMaxReleaseAngularVelocity() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.maxReleaseAngularVelocity)
            ? Math.max(CONFIG.LEVEL_OBJECTS.maxReleaseAngularVelocity, 0)
            : 0.5;
    }

    getDragConstraintStiffness() {
        return Number.isFinite(CONFIG.DYNO_DRAG?.matterConstraintStiffness)
            ? THREE.MathUtils.clamp(CONFIG.DYNO_DRAG.matterConstraintStiffness, 0, 1)
            : 0.85;
    }

    getDragConstraintDamping() {
        return Number.isFinite(CONFIG.DYNO_DRAG?.matterConstraintDamping)
            ? Math.max(CONFIG.DYNO_DRAG.matterConstraintDamping, 0)
            : 0.18;
    }

    getDragConstraintLength() {
        return Number.isFinite(CONFIG.DYNO_DRAG?.matterConstraintLength)
            ? Math.max(CONFIG.DYNO_DRAG.matterConstraintLength, 0)
            : 0.15;
    }

    getDragAnchorTerrainStretchMargin() {
        return Number.isFinite(CONFIG.DYNO_DRAG?.matterDragAnchorTerrainStretchMargin)
            ? Math.max(CONFIG.DYNO_DRAG.matterDragAnchorTerrainStretchMargin, 0)
            : 0.55;
    }

    getDragAngularDamping() {
        return Number.isFinite(CONFIG.DYNO_DRAG?.matterDragAngularDamping)
            ? THREE.MathUtils.clamp(CONFIG.DYNO_DRAG.matterDragAngularDamping, 0, 1)
            : 0.82;
    }

    getCarryAngularDamping() {
        return Number.isFinite(CONFIG.DYNO_DRAG?.matterCarryAngularDamping)
            ? THREE.MathUtils.clamp(CONFIG.DYNO_DRAG.matterCarryAngularDamping, 0, 1)
            : 0.6;
    }

    getDropEscapeMaxIterations() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectDropEscapeMaxIterations)
            ? Math.max(Math.floor(CONFIG.LEVEL_OBJECTS.levelObjectDropEscapeMaxIterations), 1)
            : 12;
    }

    getDropEscapePadding() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectDropEscapePadding)
            ? Math.max(CONFIG.LEVEL_OBJECTS.levelObjectDropEscapePadding, 0.001)
            : 0.02;
    }

    getDropEscapeStep() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.levelObjectDropEscapeStep)
            ? Math.max(CONFIG.LEVEL_OBJECTS.levelObjectDropEscapeStep, 0.01)
            : 0.1;
    }

    init() {
        if (this.engine) {
            return true;
        }

        this.Matter = getMatter();
        if (!this.Matter) {
            console.warn('[PhysicsWorld] Matter.js was not found. LevelObject Matter physics disabled.');
            return false;
        }



        this.engine = this.Matter.Engine.create({
            enableSleeping: true
        });
        this.engine.enableSleeping = true;
        this.engine.positionIterations = Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterPositionIterations)
            ? CONFIG.LEVEL_OBJECTS.matterPositionIterations
            : 8;
        this.engine.velocityIterations = Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterVelocityIterations)
            ? CONFIG.LEVEL_OBJECTS.matterVelocityIterations
            : 6;
        this.engine.constraintIterations = Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterConstraintIterations)
            ? CONFIG.LEVEL_OBJECTS.matterConstraintIterations
            : 4;
        this.world = this.engine.world;
        this.world.gravity.x = 0;
        // Three/world space is Y-up, while Matter examples usually use Y-down.
        // Keep the game coordinate system unchanged and make Matter gravity point down in world space.
        this.world.gravity.y = -this.getMatterGravityY();
        this.world.gravity.scale = Number.isFinite(CONFIG.LEVEL_OBJECTS?.matterGravityScale)
            ? CONFIG.LEVEL_OBJECTS.matterGravityScale
            : 0.001;

        this.Matter.Events.on(this.engine, 'collisionStart', (event) => {
            this.handleCollisionStart(event);
        });

        return true;
    }

    dispose() {
        this.disposeDebug();
        if (this.world && this.Matter) {
            this.Matter.Composite.clear(this.world, false, true);
        }
        this.terrainBodies = [];
        this.objectBodies.clear();
        this.bodyToObject.clear();
        this.engine = null;
        this.world = null;
        this.Matter = null;
        this.accumulatorMs = 0;
    }

    getTerrainThickness() {
        return Math.max(
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.terrainColliderThickness)
                ? CONFIG.LEVEL_OBJECTS.terrainColliderThickness
                : 0.2,
            0.01
        );
    }

    async addStaticTerrainFromLevelPolygons(polygons = []) {
        if (!this.init()) {
            return;
        }

        this.setCollisionPolygons(polygons);
        this.clearTerrainBodies();
        this._activeTerrainBodies = new Set();

        // Build bodies in time-budgeted batches but do NOT add them to the world yet —
        // _updateTerrainActivation will add only those near the focal point each frame.
        const BUDGET_MS = 8;
        let deadline = performance.now() + BUDGET_MS;

        for (const polygon of polygons) {
            if (!Array.isArray(polygon) || polygon.length < 3) continue;
            const body = this.createFilledTerrainConvexBody(polygon);
            if (body) {
                this.terrainBodies.push(body);
            }
            await yieldIfOverBudget(deadline);
            if (performance.now() >= deadline) {
                deadline = performance.now() + BUDGET_MS;
            }
        }

        // Compute terrain bounds and rebuild debug visuals after all bodies are built.
        this.minTerrainY = Number.POSITIVE_INFINITY;
        this.maxTerrainY = Number.NEGATIVE_INFINITY;
        for (const body of this.terrainBodies) {
            const bounds = body?.bounds;
            if (!bounds) continue;
            this.minTerrainY = Math.min(this.minTerrainY, bounds.min.y);
            this.maxTerrainY = Math.max(this.maxTerrainY, bounds.max.y);
        }
        this._buildTerrainSpatialIndex();
        this.rebuildTerrainDebug();
    }

    createFilledTerrainConvexBody(vertices = []) {
        if (!this.Matter || vertices.length < 3) return null;
        const rawPts = vertices.map((p) => ({ x: p.x, y: p.y }));
        const centre = this.Matter.Vertices.centre(rawPts);
        const body = this.Matter.Body.create({
            isStatic: true,
            friction: 1,
            frictionStatic: 1,
            restitution: 0,
            label: 'terrain-filled-convex',
            collisionFilter: {
                category: MATTER_CATEGORY_TERRAIN,
                mask: MATTER_CATEGORY_ALL_LEVEL_OBJECTS
            },
            position: { x: centre.x, y: centre.y }
        });
        // Use setVertices so Matter recomputes normals/axes from the actual vertex positions.
        // Pass world-space points; Matter will translate them to local space relative to centre.
        this.Matter.Body.setVertices(body, rawPts);
        this.Matter.Body.setPosition(body, centre);
        body.plugin = { ...(body.plugin || {}), physicsWorldKind: 'terrain', terrainKind: 'filled' };
        return body;
    }

    setCollisionPolygons(polygons = []) {
        this.collisionPolygons = Array.isArray(polygons)
            ? polygons
                .filter((polygon) => Array.isArray(polygon) && polygon.length >= 3)
                .map((polygon) => polygon.map((point) => ({ x: point.x, y: point.y })))
            : [];
    }

    setWaterPolygons(polygons = []) {
        if (!Array.isArray(polygons)) { this._waterPolyCache = []; return; }
        this._waterPolyCache = polygons.map((poly) => {
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
            return { pts, cx, cy, cr2: rx * rx + ry * ry };
        });
    }

    isPointInWater(x, y) {
        if (!this._waterPolyCache?.length) return false;
        for (const entry of this._waterPolyCache) {
            const dx = x - entry.cx, dy = y - entry.cy;
            if (dx * dx + dy * dy > entry.cr2) continue;
            const pts = entry.pts;
            let inside = false;
            for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i++) {
                const a = pts[i], b = pts[j];
                if (((a.y > y) !== (b.y > y)) &&
                    (x < (((b.x - a.x) * (y - a.y)) / (b.y - a.y || 0.0000001)) + a.x)) {
                    inside = !inside;
                }
            }
            if (inside) return true;
        }
        return false;
    }

    applyWaterFriction() {
        if (!this._waterPolyCache?.length || !this.objectBodies.size) return;
        const defaultWaterFriction = CONFIG.LEVEL_OBJECTS?.waterFrictionAir ?? 0.6;
        for (const [levelObject, body] of this.objectBodies) {
            if (!this.isActiveFallingBody(levelObject, body)) continue;
            if (levelObject._baseAirFrictionAir === undefined) {
                levelObject._baseAirFrictionAir = body.frictionAir;
            }
            const inWater = this.isPointInWater(body.position.x, body.position.y);
            const matterConfig = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
            const waterFriction = Number.isFinite(matterConfig.waterFrictionAir)
                ? matterConfig.waterFrictionAir
                : defaultWaterFriction;
            const wasInWater = body.plugin?.wasInWater === true;
            if (inWater && !wasInWater) {
                this.options?.onWaterSplash?.({
                    x: body.position.x,
                    y: body.position.y,
                    z: levelObject?.container?.position?.z ?? 3
                }, {
                    scale: 1.2,
                    particleCount: 22
                });
                levelObject.audioManager?.play?.('watersplash', { volume: 0.8 });
            }
            if (body.plugin) {
                body.plugin.wasInWater = inWater;
            }
            body.frictionAir = inWater ? waterFriction : levelObject._baseAirFrictionAir;
        }
    }

    clearTerrainBodies() {
        if (this.terrainBodies.length && this.Matter && this.world) {
            for (const body of this.terrainBodies) {
                this.Matter.Composite.remove(this.world, body);
            }
        }
        this.terrainBodies = [];
        this.minTerrainY = Number.POSITIVE_INFINITY;
        this.maxTerrainY = Number.NEGATIVE_INFINITY;
    }

    commitTerrainBodies(bodies = []) {
        this.terrainBodies = bodies;
        this._activeTerrainBodies = new Set();
        for (const body of bodies) {
            const bounds = body?.bounds;
            if (!bounds) continue;
            this.minTerrainY = Math.min(this.minTerrainY, bounds.min.y);
            this.maxTerrainY = Math.max(this.maxTerrainY, bounds.max.y);
        }
        this._buildTerrainSpatialIndex();
        // Don't add all terrain bodies upfront — _updateTerrainActivation handles it.
        this.rebuildTerrainDebug();
    }

    _buildTerrainSpatialIndex() {
        const CELL = 160;
        const grid = new Map();
        for (const body of this.terrainBodies) {
            const b = body.bounds;
            if (!b) continue;
            const cx = (b.min.x + b.max.x) * 0.5;
            const cy = (b.min.y + b.max.y) * 0.5;
            const gx = Math.floor(cx / CELL);
            const gy = Math.floor(cy / CELL);
            const key = `${gx},${gy}`;
            let cell = grid.get(key);
            if (!cell) { cell = []; grid.set(key, cell); }
            cell.push(body);
        }
        this._terrainGrid = grid;
        this._terrainGridCell = CELL;
    }

    _getTerrainBodiesNear(x, y, radius) {
        const CELL = this._terrainGridCell || 160;
        const grid = this._terrainGrid;
        if (!grid) return this.terrainBodies;
        const minGx = Math.floor((x - radius) / CELL);
        const maxGx = Math.floor((x + radius) / CELL);
        const minGy = Math.floor((y - radius) / CELL);
        const maxGy = Math.floor((y + radius) / CELL);
        const result = [];
        for (let gx = minGx; gx <= maxGx; gx++) {
            for (let gy = minGy; gy <= maxGy; gy++) {
                const cell = grid.get(`${gx},${gy}`);
                if (cell) for (const b of cell) result.push(b);
            }
        }
        return result;
    }

    activateAllTerrainBodies() {
        if (!this.Matter || !this.world || !this.terrainBodies?.length) {
            return;
        }

        if (!this._activeTerrainBodies) {
            this._activeTerrainBodies = new Set();
        }

        for (const body of this.terrainBodies) {
            if (this._activeTerrainBodies.has(body)) {
                continue;
            }
            this.Matter.Composite.add(this.world, body);
            this._activeTerrainBodies.add(body);
        }
    }

    restoreAllDistanceRemovedBodies() {
        if (!this._deactivatedBodies?.size) {
            return;
        }

        for (const [levelObject, savedMask] of this._deactivatedBodies.entries()) {
            const body = this.objectBodies.get(levelObject);
            if (!body) {
                continue;
            }
            body.collisionFilter.mask = savedMask;
        }
        this._deactivatedBodies.clear();
    }

    setStartupSettlingMode(enabled) {
        this._startupSettlingMode = enabled === true;
        if (!this._startupSettlingMode) {
            return;
        }

        // During startup warmup we want every terrain collider and every block collision to stay
        // active so fallOnLoad stacks settle exactly as if the dyno had been nearby all along.
        this.activateAllTerrainBodies();
        this.restoreAllDistanceRemovedBodies();
    }

    countUnsettledStartupBodies() {
        let unsettledCount = 0;
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (!levelObject || !body || body.isStatic) {
                continue;
            }
            if (this.isActiveFallingBody(levelObject, body)) {
                unsettledCount += 1;
            }
        }
        return unsettledCount;
    }

    _updateTerrainActivation() {
        if (!this.Matter || !this.world || !this.terrainBodies?.length) return;
        if (this._startupSettlingMode === true) {
            this.activateAllTerrainBodies();
            return;
        }
        const fx = this._focalX;
        const fy = this._focalY;
        if (fx === null || fx === undefined || fy === null || fy === undefined) {
            // No focal point yet — activate all.
            if (this._activeTerrainBodies?.size === 0) {
                for (const body of this.terrainBodies) {
                    this.Matter.Composite.add(this.world, body);
                    this._activeTerrainBodies.add(body);
                }
            }
            return;
        }
        const activateRadius = 160;
        const deactivateRadius = 200;
        const activateR2 = activateRadius * activateRadius;
        const deactivateR2 = deactivateRadius * deactivateRadius;

        // Build list of focal points: dyno + all unsettled falling object bodies.
        const focalPoints = [{ x: fx, y: fy }];
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (this.isActiveFallingBody(levelObject, body) && !body.isSleeping) {
                focalPoints.push({ x: body.position.x, y: body.position.y });
            }
        }

        // Activate: only check bodies near any focal point using spatial grid.
        for (const fp of focalPoints) {
            const candidates = this._getTerrainBodiesNear(fp.x, fp.y, activateRadius);
            for (const body of candidates) {
                if (this._activeTerrainBodies.has(body)) continue;
                const cx = (body.bounds.min.x + body.bounds.max.x) * 0.5;
                const cy = (body.bounds.min.y + body.bounds.max.y) * 0.5;
                const dx = cx - fp.x, dy = cy - fp.y;
                if (dx * dx + dy * dy <= activateR2) {
                    this.Matter.Composite.add(this.world, body);
                    this._activeTerrainBodies.add(body);
                }
            }
        }

        // Deactivate: only active bodies need checking — iterate snapshot to allow deletion.
        const toDeactivate = [];
        for (const body of this._activeTerrainBodies) {
            const cx = (body.bounds.min.x + body.bounds.max.x) * 0.5;
            const cy = (body.bounds.min.y + body.bounds.max.y) * 0.5;
            let minD2 = Infinity;
            for (const fp of focalPoints) {
                const dx = cx - fp.x, dy = cy - fp.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < minD2) minD2 = d2;
            }
            if (minD2 > deactivateR2) toDeactivate.push(body);
        }
        for (const body of toDeactivate) {
            this.Matter.Composite.remove(this.world, body, true);
            this._activeTerrainBodies.delete(body);
        }
    }

    shouldUseMatterForLevelObject(levelObject) {
        if (!levelObject || levelObject.config?.usePhysicsBody === false) {
            return false;
        }

        if (levelObject.container && !levelObject.container.visible) {
            return false;
        }

        const hasCollisionShape = Boolean(
            levelObject.configuredCollisionRect || levelObject.configuredCollisionPolygon || levelObject.configuredCollisionCircle
        );

        // Objects that have transitioned to a physics-driven falling wreck (e.g. choppers shot
        // down mid-air) always need a Matter body for gravity and ground-impact detection, even
        // if they normally use custom movement and would otherwise be excluded.
        if (levelObject.destroyedFalling === true) {
            return hasCollisionShape;
        }

        // Choppers and other air actors keep their existing custom movement. The dyno also
        // never gets a Matter body; Matter is only the replacement for LevelObject ground physics.
        if (levelObject.config?.snapToGroundOnLoad !== true && levelObject.config?.usePhysicsBody !== true) {
            return false;
        }

        return hasCollisionShape;
    }

    getBodyOptionsForLevelObject(levelObject) {
        const config = levelObject?.config || {};
        const matterConfig = config.matter || config.physicsBody || config.physics || {};
        const density = Number.isFinite(matterConfig.density)
            ? matterConfig.density
            : 0.01;
        const options = {
            density,
            friction: Number.isFinite(matterConfig.friction) ? matterConfig.friction : 0.6,
            frictionStatic: Number.isFinite(matterConfig.frictionStatic) ? matterConfig.frictionStatic : 0.7,
            restitution: Number.isFinite(matterConfig.restitution) ? matterConfig.restitution : 0,
            frictionAir: Number.isFinite(matterConfig.frictionAir) ? matterConfig.frictionAir : 0.25,
            sleepThreshold: Number.isFinite(matterConfig.sleepThreshold) ? matterConfig.sleepThreshold : this.getLevelObjectSleepThreshold()
        };
        return options;
    }

    getLevelObjectCategory(levelObject) {
        const config = levelObject?.config || {};
        // Named category (e.g. MATTER_MASK_BLOCK) takes priority — lets objects of the
        // same type collide with each other without colliding with all generic level objects.
        if (Number.isFinite(config.category) && config.category !== 0) return config.category;
        // Platform objects (e.g. zeppelin) get their own category so regular objects can
        // opt into landing on them without colliding with every other level object.
        if (config.isPlatform === true) return MATTER_CATEGORY_PLATFORM;
        return MATTER_CATEGORY_LEVEL_OBJECT;
    }

    getLevelObjectCollisionMask(levelObject) {
        const config = levelObject?.config || {};
        let mask = MATTER_CATEGORY_TERRAIN;
        if (config.isPlatform === true) {
            // Platforms accept collisions from regular level objects and all named categories.
            mask |= MATTER_CATEGORY_LEVEL_OBJECT | MATTER_CATEGORY_ALL_NAMED;
        }
        if (config.collideWithPlatforms === true) {
            mask |= MATTER_CATEGORY_PLATFORM;
        }
        // collideWithMask: explicit bitmask (use MATTER_MASK_* constants).
        // Legacy boolean collideWithLevelObjects kept for backwards compatibility.
        if (Number.isFinite(config.collideWithMask)) {
            mask |= config.collideWithMask;
        } else if (config.collideWithLevelObjects === true || CONFIG.LEVEL_OBJECTS?.collideLevelObjects === true) {
            mask |= MATTER_CATEGORY_LEVEL_OBJECT;
        }
        return mask;
    }

    _updateBodyAABB(body) {
        const parts = (body.parts?.length > 1) ? body.parts.slice(1) : [body];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const part of parts) {
            for (const v of (part.vertices ?? [])) {
                if (v.x < minX) minX = v.x;
                if (v.x > maxX) maxX = v.x;
                if (v.y < minY) minY = v.y;
                if (v.y > maxY) maxY = v.y;
            }
        }
        body.plugin = body.plugin || {};
        body.plugin.aabb = (minX <= maxX)
            ? { minX, maxX, minY, maxY }
            : null;
    }

    _getPolygonBodyAnchor(levelObject) {
        // Transform collisionPolygonOrigin (or [0,0]) through the same matrix as the
        // polygon points. This gives a fixed world reference point that is independent
        // of all other polygon coordinates — editing any point never moves this anchor.
        const raw = levelObject.config?.collisionPolygonOrigin;
        const ox = Array.isArray(raw) && Number.isFinite(raw[0]) ? raw[0] : 0;
        const oy = Array.isArray(raw) && Number.isFinite(raw[1]) ? raw[1] : 0;

        if (levelObject.sceneObject && levelObject.container) {
            levelObject.container.updateWorldMatrix(true, false);
            levelObject.sceneObject.updateWorldMatrix(true, false);
            const mat = levelObject.sceneObject.matrixWorld.clone();
            const cp = new THREE.Vector3();
            levelObject.container.getWorldPosition(cp);
            mat.elements[12] = cp.x;
            mat.elements[13] = cp.y;
            mat.elements[14] = cp.z;
            return new THREE.Vector3(ox, oy, 0).applyMatrix4(mat);
        }

        const cp = levelObject.container.position;
        return new THREE.Vector3(cp.x, cp.y, cp.z);
    }

    _buildPolygonBodyForLevelObject(levelObject, bodyOptions) {
        const worldPoints = levelObject.getCollisionPolygonWorldPoints?.();
        if (!worldPoints || worldPoints.length < 3) return null;

        // Bodies.fromVertices recenters and reorders vertices — input positions are lost.
        // Instead, build the body manually so each vertex lands at exactly the configured
        // world position. Matter requires vertices stored as offsets from body.position,
        // and body.position must be the area-weighted centroid of the polygon.
        let rawPts = worldPoints.map((p) => ({ x: p.x, y: p.y }));
        // A 180° Y-axis flip mirrors X coordinates, reversing winding order and flipping normals.
        // Reverse the vertex list to restore outward-facing normals for Matter's Y-down system.
        if ((levelObject.facingDirection ?? 1) < 0) rawPts = rawPts.reverse();
        const centre = this.Matter.Vertices.centre(rawPts);

        // Create a minimal body at the polygon centroid.
        const body = this.Matter.Body.create({ ...bodyOptions, position: { x: centre.x, y: centre.y } });

        // Build a proper vertex list (with body/index references) then overwrite positions.
        const localPts = rawPts.map((p) => ({ x: p.x - centre.x, y: p.y - centre.y }));
        const verts = this.Matter.Vertices.create(localPts, body);
        body.vertices = verts;
        for (let i = 0; i < body.vertices.length; i++) {
            body.vertices[i].x = rawPts[i].x;
            body.vertices[i].y = rawPts[i].y;
        }
        this.Matter.Bounds.update(body.bounds, body.vertices, body.velocity);

        // Store per-vertex offsets from body.position. setPosition translates both
        // body.position and all vertices by the same delta — so these offsets are
        // permanently stable. Each frame we call setPosition(anchor + centreOffset)
        // and every vertex lands at exactly its configured position relative to the anchor.
        const anchor = this._getPolygonBodyAnchor(levelObject);
        body.plugin = body.plugin || {};
        body.plugin.polygonBodyOffsetX = body.position.x - anchor.x;
        body.plugin.polygonBodyOffsetY = body.position.y - anchor.y;
        body.plugin.polygonFacingSign = levelObject.facingDirection ?? 1;
        this._updateBodyAABB(body);
        return body;
    }

    _rebuildPolygonBody(levelObject, oldBody) {
        const sharedOptions = {
            ...this.getBodyOptionsForLevelObject(levelObject),
            label: oldBody.label,
            collisionFilter: { ...oldBody.collisionFilter },
            isSleeping: oldBody.isSleeping
        };

        const newBody = this._buildPolygonBodyForLevelObject(levelObject, sharedOptions);
        if (!newBody) return;

        this.Matter.Composite.remove(this.world, oldBody);
        this.Matter.Composite.add(this.world, newBody);

        newBody.plugin = {
            ...(newBody.plugin || {}),   // preserves polygonBodyOffset/FacingSign from _buildPolygonBodyForLevelObject
            physicsWorldKind: 'levelObject',
            levelObject,
            hasImpactedTerrain: oldBody.plugin?.hasImpactedTerrain ?? false,
            hasMatterContact: oldBody.plugin?.hasMatterContact ?? false,
            dropStartY: oldBody.plugin?.dropStartY ?? null,
            wasInWater: oldBody.plugin?.wasInWater ?? false,
            tunnelWarningLogged: false,
            originalSleepThreshold: newBody.sleepThreshold,
            lastClampWorldVelocityY: null,
            settledFrameCount: 0,
            settleDebugCounter: 0,
            polygonFacingSign: levelObject.facingDirection ?? 1,
            // Preserve platform spring state so the body continues its spring motion after flip.
            platformRestY: oldBody.plugin?.platformRestY,
            platformRestX: oldBody.plugin?.platformRestX,
            platformSpringVelY: oldBody.plugin?.platformSpringVelY ?? 0,
            aabb: oldBody.plugin?.aabb
        };

        this.objectBodies.set(levelObject, newBody);
        this.bodyToObject.delete(oldBody);
        this.bodyToObject.set(newBody, levelObject);
        levelObject.matterBody = newBody;

        if (oldBody.isSleeping) {
            this.Matter.Sleeping.set(newBody, true);
        }
    }

    addLevelObject(levelObject) {
        if (!this.init() || !this.shouldUseMatterForLevelObject(levelObject)) {
            return null;
        }

        if (this.objectBodies.has(levelObject)) {
            return this.objectBodies.get(levelObject);
        }

        const rect = levelObject.getWorldCollisionRect?.();
        const configuredRect = levelObject.configuredCollisionRect;
        if (!rect || !configuredRect) {
            return null;
        }

        const sharedOptions = {
            ...this.getBodyOptionsForLevelObject(levelObject),
            label: `level-object:${levelObject.type}:${levelObject.id}`,
            collisionFilter: {
                category: this.getLevelObjectCategory(levelObject),
                mask: this.getLevelObjectCollisionMask(levelObject)
            }
        };

        let body;
        if (levelObject.configuredCollisionPolygon) {
            body = this._buildPolygonBodyForLevelObject(levelObject, sharedOptions);
        } else if (levelObject.configuredCollisionCircle) {
            const circle = levelObject.configuredCollisionCircle;
            const worldPos = levelObject.container?.position ?? { x: 0, y: 0 };
            const cx = worldPos.x + circle.offsetX;
            const cy = worldPos.y + circle.offsetY;
            const r  = Math.max(circle.radius, 0.001);
            if (Number.isFinite(circle.sides) && circle.sides >= 3) {
                // Matter.Bodies.circle caps sides to the radius value. Use Bodies.polygon directly
                // (same code path, but without the radius cap on side count).
                body = this.Matter.Bodies.polygon(cx, cy, Math.floor(circle.sides), r, { ...sharedOptions, circleRadius: r });
            } else {
                body = this.Matter.Bodies.circle(cx, cy, r, sharedOptions);
            }
        } else {
            body = this.Matter.Bodies.rectangle(
                rect.centerX,
                rect.centerY,
                Math.max(configuredRect.width, 0.001),
                Math.max(configuredRect.height, 0.001),
                { ...sharedOptions, angle: rect.angle ?? 0 }
            );
        }

        if (!body) return null;


        // Pre-seed wasInWater to the object's actual spawn position so the first
        // applyWaterFriction tick doesn't see a false "entering water" transition.
        const spawnInWater = this._waterPolyCache?.length
            ? this.isPointInWater(rect.centerX, rect.centerY)
            : false;
        body.plugin = {
            ...(body.plugin || {}),
            physicsWorldKind: 'levelObject',
            levelObject,
            hasImpactedTerrain: false,
            hasMatterContact: false,
            dropStartY: null,
            wasInWater: spawnInWater,
            tunnelWarningLogged: false,
            originalSleepThreshold: body.sleepThreshold,
            lastClampWorldVelocityY: null,
            settledFrameCount: 0,
            settleDebugCounter: 0
        };

        this.objectBodies.set(levelObject, body);
        this.bodyToObject.set(body, levelObject);
        levelObject.matterBody = body;
        levelObject.physicsWorld = this;

        this.Matter.Composite.add(this.world, body);
        this.syncBodyFromLevelObject(levelObject);

        if (levelObject.config?.isPlatform === true) {
            // Static body — solid surface for objects to land on, moved each step via setPosition
            // in applyPlatformBuoyancy to produce a visible spring/dip effect.
            this.Matter.Body.setStatic(body, true);
            body.friction = 1;
            body.frictionStatic = 1;
            body.restitution = 0;
            body.plugin.platformRestY = body.position.y;
            body.plugin.platformRestX = body.position.x;
            body.plugin.platformSpringVelY = 0;
        } else {
            this.sleepLevelObject(levelObject);
        }

        this.syncObjectFromBody(levelObject);
        return body;
    }

    removeLevelObject(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (!body || !this.Matter || !this.world) {
            return;
        }

        this.endLevelObjectDrag(levelObject);
        this.Matter.Composite.remove(this.world, body);
        this.objectBodies.delete(levelObject);
        this.bodyToObject.delete(body);
        if (levelObject.matterBody === body) {
            levelObject.matterBody = null;
        }
        if (levelObject.physicsWorld === this) {
            levelObject.physicsWorld = null;
        }
        this.removeObjectDebug(levelObject);
    }

    suspendLevelObject(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (!body || !this.Matter || !this.world) return;
        this.endLevelObjectDrag(levelObject);
        this.Matter.Body.setVelocity(body, { x: 0, y: 0 });
        this.Matter.Body.setAngularVelocity(body, 0);
        this.Matter.Composite.remove(this.world, body);
        // Keep objectBodies entry so the body can be re-added on resume.
    }

    resumeLevelObject(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (!body || !this.Matter || !this.world) return;
        this.syncBodyFromLevelObject(levelObject);
        this.Matter.Composite.add(this.world, body);
        this.Matter.Sleeping.set(body, false);
    }

    sleepLevelObject(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (!body) {
            return;
        }

        this.endLevelObjectDrag(levelObject);
        this.Matter.Body.setVelocity(body, { x: 0, y: 0 });
        this.Matter.Body.setAngularVelocity(body, 0);
        this.Matter.Sleeping.set(body, true);
        body.plugin.hasImpactedTerrain = false;
        body.plugin.hasMatterContact = false;
        body.plugin.restingOnPlatform = null;
        body.plugin.tunnelWarningLogged = false;
        body.plugin.settledFrameCount = 0;
        body.plugin.settleDebugCounter = 0;
    }

    enableLevelObject(levelObject, initialVelocity = null, options = {}) {
        const body = this.objectBodies.get(levelObject) || this.addLevelObject(levelObject);
        if (!body) {
            console.warn(
                `[PhysicsWorld] Could not enable Matter body for ${levelObject?.getDebugLabel?.() || levelObject?.type || 'unknown object'}.`
            );
            return;
        }

        const preserveBodyPose = options.preserveBodyPose === true;
        if (!preserveBodyPose) {
            this.syncBodyFromLevelObject(levelObject);
        }
        this.Matter.Body.setStatic(body, false);
        body.collisionFilter.mask = this.getLevelObjectCollisionMask(levelObject);
        if (options.skipInitialTerrainResolve === true) {
            // Drag starts from an existing visible/resting pose. Moving the body during enable
            // before the joint is attached can make the body and visible grab node disagree.
        } else if (options.forceOutsideTerrain === true) {
            // Drag release can happen while the object is partly inside a filled terrain chunk.
            // Prefer a deterministic upward/nearby search from the current release pose before
            // Matter collision normals get a chance to push the body deeper into a large chunk.
            if (!this.forceBodyOutsideTerrain(body, levelObject)) {
                this.resolveInitialTerrainOverlap(body, levelObject);
            }
        } else {
            this.resolveInitialTerrainOverlap(body, levelObject);
        }
        body.plugin.hasImpactedTerrain = false;
        body.plugin.hasMatterContact = false;
        body.plugin.restingOnPlatform = null;
        body.plugin.dropStartY = Number.isFinite(levelObject?.fallStartY)
            ? levelObject.fallStartY
            : body.position.y;
        body.plugin.wasInWater = this.isPointInWater(body.position.x, body.position.y);
        body.plugin.tunnelWarningLogged = false;
        body.plugin.lastClampWorldVelocityY = null;
        body.plugin.settledFrameCount = 0;
        body.plugin.settleDebugCounter = 0;
        body.plugin.launchVelocityX = null;
        body.plugin.launchFramesLeft = 0;
        body.sleepThreshold = Number.isFinite(body.plugin.originalSleepThreshold)
            ? body.plugin.originalSleepThreshold
            : body.sleepThreshold;

        const preserveBodyVelocity = options.preserveBodyVelocity === true;
        const velocity = initialVelocity || levelObject.velocity || new THREE.Vector3();
        const maxDropVelocity = this.getDropVelocityLimitForLevelObject(levelObject);
        const clampedDropVelocity = this.clampWorldVelocity({
            x: Number.isFinite(velocity.x) ? velocity.x : 0,
            y: Number.isFinite(velocity.y) ? velocity.y : 0
        }, maxDropVelocity);
        if (!preserveBodyVelocity) {
            this.Matter.Body.setVelocity(body, {
                x: clampedDropVelocity.x * this.getFixedStepSeconds(),
                y: clampedDropVelocity.y * this.getFixedStepSeconds()
            });
            this.Matter.Body.setAngularVelocity(
                body,
                THREE.MathUtils.clamp(
                    Number.isFinite(levelObject.angularVelocity) ? levelObject.angularVelocity : 0,
                    -this.getMaxReleaseAngularVelocity(),
                    this.getMaxReleaseAngularVelocity()
                ) * this.getFixedStepSeconds()
            );
            // frictionAir kills horizontal velocity within the first frame at 60Hz.
            // Store the intended X and re-apply it each substep for a short decay window.
            if (Math.abs(clampedDropVelocity.x) > 0.5) {
                body.plugin.launchVelocityX = clampedDropVelocity.x;
                body.plugin.launchFramesLeft = this.getFixedStepHz();
            }
        }
        this.Matter.Sleeping.set(body, false);
        // Enabling a body may push it out of terrain before simulation starts. Sync immediately
        // so later code, especially drag constraints, measures grab points from the same pose
        // the Matter body will use.
        this.syncObjectFromBody(levelObject);

        if (this.shouldDebugDropDiagnostics()) {
            console.log('[PhysicsWorld] Enabled dropped LevelObject body', {
                object: levelObject.getDebugLabel?.() || levelObject.type,
                preserveBodyPose,
                isStatic: body.isStatic,
                isSleeping: body.isSleeping,
                position: { x: body.position.x, y: body.position.y },
                bodyVelocity: { x: body.velocity.x, y: body.velocity.y },
                worldVelocity: {
                    x: body.velocity.x / this.getFixedStepSeconds(),
                    y: body.velocity.y / this.getFixedStepSeconds()
                },
                preserveBodyVelocity,
                dropStartY: body.plugin.dropStartY,
                clampedDropVelocity,
                maxDropVelocity,
                maxFallSpeed: this.getMaxFallSpeed(),
                collisionFilter: { ...body.collisionFilter }
            });
        }

    }

    // Blasts a single level object's body outward from (originX, originY) at worldSpeed
    // (world units/sec), with an upward bias so debris lofts. Wakes/enables a dynamic body as
    // needed and returns true if an impulse was applied. Safe no-op when Matter is unavailable
    // or the object has no usable body. Used by the Dyno Fury inferno blast.
    applyRadialImpulseToLevelObject(levelObject, originX, originY, worldSpeed, upBias = 0) {
        if (!this.init() || !levelObject || !(worldSpeed > 0)) {
            return false;
        }

        let body = this.objectBodies.get(levelObject);

        // Wake idle ground objects (blocks, vehicles, etc.) that have a static/sleeping body
        // but haven't been launched by physics yet. Mirror the minimal state changes that
        // LevelObject.drop() performs so the physics pipeline handles them correctly.
        if (
            levelObject.state === LEVEL_OBJECT_STATES.IDLE &&
            !levelObject.gravityEnabled &&
            this.shouldUseMatterForLevelObject(levelObject)
        ) {
            levelObject.gravityEnabled = true;
            levelObject.fallStartY = levelObject.container?.position?.y ?? 0;
            levelObject._sleepTimer = 0;
            levelObject._hasBeenDropped = true;
            levelObject.state = LEVEL_OBJECT_STATES.FALLING;
            try {
                this.enableLevelObject(levelObject, null, { skipInitialTerrainResolve: true });
            } catch (_e) { /* best-effort */ }
            body = this.objectBodies.get(levelObject);
        } else if (!body && levelObject.gravityEnabled && this.shouldUseMatterForLevelObject(levelObject)) {
            try {
                this.enableLevelObject(levelObject, levelObject.velocity || null);
            } catch (_e) { /* best-effort */ }
            body = this.objectBodies.get(levelObject);
        }

        if (!body || body.isStatic) {
            return false;
        }

        const cx = body.position?.x ?? originX;
        const cy = body.position?.y ?? originY;
        let dx = cx - originX;
        let dy = cy - originY;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.0001) {
            dx /= dist;
            dy /= dist;
        } else {
            // Object sitting exactly on the origin — launch it straight up.
            dx = 0;
            dy = 1;
        }
        // Bias the direction upward (world +Y) so the blast lofts rather than only scattering.
        dy += upBias;
        const norm = Math.hypot(dx, dy) || 1;
        dx /= norm;
        dy /= norm;

        const step = this.getFixedStepSeconds();
        this.Matter.Sleeping.set(body, false);
        TMP_SET_VEL.x = dx * worldSpeed * step;
        TMP_SET_VEL.y = dy * worldSpeed * step;
        this.Matter.Body.setVelocity(body, TMP_SET_VEL);
        // A little spin sells the impact.
        this.Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.4);
        if (body.plugin) body.plugin.hasImpactedTerrain = false;
        return true;
    }

    getBodyLocalPointFromWorld(body, worldPoint) {
        const dx = (worldPoint?.x ?? body.position.x) - body.position.x;
        const dy = (worldPoint?.y ?? body.position.y) - body.position.y;
        const cos = Math.cos(-body.angle);
        const sin = Math.sin(-body.angle);
        return {
            x: (dx * cos) - (dy * sin),
            y: (dx * sin) + (dy * cos)
        };
    }

    getBodyWorldPointFromLocal(body, localPoint = { x: 0, y: 0 }) {
        const localX = Number.isFinite(localPoint?.x) ? localPoint.x : 0;
        const localY = Number.isFinite(localPoint?.y) ? localPoint.y : 0;
        const cos = Math.cos(body?.angle ?? 0);
        const sin = Math.sin(body?.angle ?? 0);
        return {
            x: (body?.position?.x ?? 0) + (localX * cos) - (localY * sin),
            y: (body?.position?.y ?? 0) + (localX * sin) + (localY * cos)
        };
    }

    getConstraintPointWorld(constraint, side = 'A') {
        const body = side === 'A' ? constraint?.bodyA : constraint?.bodyB;
        const point = side === 'A' ? constraint?.pointA : constraint?.pointB;
        if (body) {
            return this.getBodyWorldPointFromLocal(body, point);
        }

        return {
            x: Number.isFinite(point?.x) ? point.x : 0,
            y: Number.isFinite(point?.y) ? point.y : 0
        };
    }

    isWorldPointInsideCollisionPolygon(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return false;
        }

        return this.collisionPolygons.some((polygon) => pointInPolygon2D(point, polygon));
    }

    isWorldPointBlockedForDragAnchor(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return false;
        }

        if (this.isWorldPointInsideCollisionPolygon(point)) {
            return true;
        }

        const margin = this.getDragAnchorTerrainStretchMargin();
        if (margin <= 0) {
            return false;
        }

        // Start stretching slightly before the dyno anchor is visibly buried. A zero-length
        // joint attached to one side of a rectangle creates strong torque; waiting until the
        // anchor is deeply inside terrain makes the object pop upright before the stretch kicks in.
        const samples = [
            { x: point.x, y: point.y - margin },
            { x: point.x, y: point.y + margin },
            { x: point.x - margin, y: point.y },
            { x: point.x + margin, y: point.y }
        ];
        return samples.some((sample) => this.isWorldPointInsideCollisionPolygon(sample));
    }

    getConstraintLengthForTightDrag(pointA, bodyAnchor) {
        const desiredLength = Math.max(
            Number.isFinite(CONFIG.DYNO_DRAG?.matterGroundDragRopeLength)
                ? CONFIG.DYNO_DRAG.matterGroundDragRopeLength
                : 0,
            0
        );
        if (this.isWorldPointBlockedForDragAnchor(pointA)) {
            // If the dyno anchor is pushed inside terrain, a zero-length constraint would
            // pull the object into solid ground. Let the rope stretch until the anchor exits.
            return Math.max(
                desiredLength,
                Math.hypot(pointA.x - bodyAnchor.x, pointA.y - bodyAnchor.y)
            );
        }

        return desiredLength;
    }

    beginLevelObjectDrag(levelObject, targetWorldPoint = null, grabWorldPoint = null, options = {}) {
        const body = this.objectBodies.get(levelObject) || this.addLevelObject(levelObject);
        if (!body || !this.Matter) {
            return false;
        }

        if (body.isStatic) {
            this.Matter.Body.setStatic(body, false);
        }
        body.collisionFilter.mask = this.getLevelObjectCollisionMask(levelObject);
        this.Matter.Sleeping.set(body, false);

        this.endLevelObjectDrag(levelObject);
        const pointA = {
            x: Number.isFinite(targetWorldPoint?.x) ? targetWorldPoint.x : body.position.x,
            y: Number.isFinite(targetWorldPoint?.y) ? targetWorldPoint.y : body.position.y
        };
        // Matter stores pointB as body.position + pointB with NO rotation applied.
        // So pointB must be the body-local vector pre-rotated by body.angle.
        const rawLocalPoint = options.usePickupRoot
            ? levelObject?.getPickupConstraintBodyLocalPoint?.()
            : levelObject?.getDragConstraintBodyLocalPoint?.();
        const namedLocalPoint = rawLocalPoint;
        const localPoint = (namedLocalPoint && Number.isFinite(namedLocalPoint.x) && Number.isFinite(namedLocalPoint.y))
            ? namedLocalPoint
            : this.getBodyLocalPointFromWorld(body, grabWorldPoint || pointA);
        const cos = Math.cos(body.angle);
        const sin = Math.sin(body.angle);
        const pointB = {
            x: localPoint.x * cos - localPoint.y * sin,
            y: localPoint.x * sin + localPoint.y * cos
        };
        const bodyAnchor = this.getBodyWorldPointFromLocal(body, localPoint);

        const configuredLength = Number.isFinite(options.length)
            ? Math.max(options.length, 0)
            : this.getDragConstraintLength();
        const stretchWhenTargetInsideTerrain = options.stretchWhenTargetInsideTerrain === true;

        // Start pointA at the body anchor world position so the constraint has
        // zero initial separation regardless of body rotation or slope angle.
        // The drag target (mouth/socket) takes over on the first update call.
        const startPointA = configuredLength === 0 && !stretchWhenTargetInsideTerrain
            ? { x: bodyAnchor.x, y: bodyAnchor.y }
            : pointA;

        const constraint = this.Matter.Constraint.create({
            pointA: startPointA,
            bodyB: body,
            pointB,
            length: stretchWhenTargetInsideTerrain
                ? this.getConstraintLengthForTightDrag(pointA, bodyAnchor)
                : configuredLength,
            stiffness: Number.isFinite(options.stiffness)
                ? THREE.MathUtils.clamp(options.stiffness, 0, 1)
                : this.getDragConstraintStiffness(),
            damping: Number.isFinite(options.damping)
                ? Math.max(options.damping, 0)
                : this.getDragConstraintDamping(),
            label: `drag-constraint:${levelObject?.type || 'object'}:${levelObject?.id || ''}`
        });
        constraint.plugin = {
            ...(constraint.plugin || {}),
            physicsWorldKind: 'levelObjectDrag',
            levelObject,
            stretchWhenTargetInsideTerrain
        };

        this.dragConstraints.set(levelObject, constraint);
        this.Matter.Composite.add(this.world, constraint);

        return true;
    }

    updateLevelObjectDragTarget(levelObject, targetWorldPoint = null) {
        const constraint = this.dragConstraints.get(levelObject);
        const body = this.objectBodies.get(levelObject);
        if (!constraint || !body || !targetWorldPoint) {
            return false;
        }

        const prevPointAY = constraint.plugin?.prevPointAY ?? constraint.pointA.y;
        constraint.pointA.x = Number.isFinite(targetWorldPoint.x) ? targetWorldPoint.x : constraint.pointA.x;
        constraint.pointA.y = Number.isFinite(targetWorldPoint.y) ? targetWorldPoint.y : constraint.pointA.y;
        constraint.plugin.prevPointAY = constraint.pointA.y;

        // When the drag target moves downward faster than the constraint spring can follow,
        // the body lags behind and then snaps — clamp body velocity to match target movement.
        // targetDeltaY is world-units/frame; body.velocity is world-units/substep.
        // Divide by substepsPerFrame to convert frame delta to per-substep delta.
        const targetDeltaY = constraint.pointA.y - prevPointAY;
        if (targetDeltaY < 0 && !constraint.plugin?.stretchWhenTargetInsideTerrain) {
            const fixedStepMs = this.getFixedStepMs();
            const substepsPerFrame = Math.max(1, Math.round(1000 / 60 / fixedStepMs));
            const targetVelYPerSubstep = targetDeltaY / substepsPerFrame;
            if (body.velocity.y > targetVelYPerSubstep) {
                this.Matter.Body.setVelocity(body, {
                    x: body.velocity.x,
                    y: targetVelYPerSubstep
                });
            }
        }

        if (constraint.plugin?.stretchWhenTargetInsideTerrain === true) {
            const fixedLocalPoint = levelObject?.isPhysicsCarried?.()
                ? levelObject?.getPickupConstraintBodyLocalPoint?.()
                : levelObject?.getDragConstraintBodyLocalPoint?.();
            const bodyAnchor = (fixedLocalPoint && Number.isFinite(fixedLocalPoint.x))
                ? this.getBodyWorldPointFromLocal(body, fixedLocalPoint)
                : this.getConstraintPointWorld(constraint, 'B');
            constraint.length = this.getConstraintLengthForTightDrag(constraint.pointA, bodyAnchor);
        }
        if (body.isSleeping) {
            this.Matter.Sleeping.set(body, false);
        }
        return true;
    }

    restoreDragConstraintBodyLocalPoints() {
        for (const [levelObject, constraint] of this.dragConstraints.entries()) {
            const body = this.objectBodies.get(levelObject);
            if (!body) continue;
            const fixedLocalPoint = levelObject?.isPhysicsCarried?.()
                ? levelObject?.getPickupConstraintBodyLocalPoint?.()
                : levelObject?.getDragConstraintBodyLocalPoint?.();
            if (fixedLocalPoint && Number.isFinite(fixedLocalPoint.x) && Number.isFinite(fixedLocalPoint.y)) {
                // Matter stores pointB as body.position + pointB with NO rotation applied.
                // Rotate our body-local point by body.angle before storing it.
                const cos = Math.cos(body.angle);
                const sin = Math.sin(body.angle);
                constraint.pointB.x = fixedLocalPoint.x * cos - fixedLocalPoint.y * sin;
                constraint.pointB.y = fixedLocalPoint.x * sin + fixedLocalPoint.y * cos;
            }
        }
    }

    endLevelObjectDrag(levelObject) {
        const constraint = this.dragConstraints.get(levelObject);
        if (!constraint || !this.Matter || !this.world) {
            return false;
        }

        // Clear any downward velocity bias accumulated by the drag velocity clamp.
        const body = this.objectBodies.get(levelObject);
        if (body && body.velocity.y < 0) {
            this.Matter.Body.setVelocity(body, { x: body.velocity.x, y: 0 });
        }

        this.Matter.Composite.remove(this.world, constraint);
        this.dragConstraints.delete(levelObject);
        return true;
    }

    resolveInitialTerrainOverlap(body, levelObject) {
        if (!body || !this.Matter || !this.terrainBodies.length) {
            return;
        }

        const collisions = () => this.Matter.Query.collides(body, nearbyTerrainBodies(body, this.terrainBodies)) || [];
        if (!collisions().length && this.doesBodyFitOutsideCollisionPolygons(body)) {
            return;
        }

        const padding = this.getDropEscapePadding();
        const maxIterations = this.getDropEscapeMaxIterations();
        const step = this.getDropEscapeStep();

        // If a dropped object starts inside terrain, do a small deterministic escape pass
        // before simulation starts. We prefer local separation from the current overlaps and
        // then fall back to short upward-biased probes so the object starts from the nearest
        // non-intersecting position instead of dropping down through solid space.
        for (let iteration = 0; iteration < maxIterations; iteration += 1) {
            const currentCollisions = collisions();
            if (!currentCollisions.length && this.doesBodyFitOutsideCollisionPolygons(body)) {
                return;
            }

            let correctionX = 0;
            let correctionY = 0;
            for (const collision of currentCollisions) {
                const normal = collision?.normal;
                const depth = Number.isFinite(collision?.depth) ? collision.depth : 0;
                if (!normal || depth <= 0) {
                    continue;
                }

                const normalScale = depth + padding;
                const normalSign = collision.bodyA === body ? -1 : 1;
                correctionX += normal.x * normalScale * normalSign;
                correctionY += normal.y * normalScale * normalSign;
            }

            if (Math.abs(correctionX) <= 0.000001 && Math.abs(correctionY) <= 0.000001) {
                break;
            }

            this.Matter.Body.setPosition(body, {
                x: body.position.x + correctionX,
                y: body.position.y + correctionY
            });
        }

        if (!collisions().length && this.doesBodyFitOutsideCollisionPolygons(body)) {
            return;
        }

        const origin = { x: body.position.x, y: body.position.y };

        for (const offset of this.buildDropEscapeProbeOffsets(step, maxIterations, body)) {
            this.Matter.Body.setPosition(body, {
                x: origin.x + offset.x,
                y: origin.y + offset.y
            });
            if (!collisions().length && this.doesBodyFitOutsideCollisionPolygons(body)) {
                if (this.shouldDebugDropDiagnostics()) {
                    console.log('[PhysicsWorld] Resolved initial terrain overlap for dropped object', {
                        object: levelObject?.getDebugLabel?.() || levelObject?.type || 'unknown',
                        resolvedPosition: { x: body.position.x, y: body.position.y },
                        appliedOffset: offset
                    });
                }
                return;
            }
        }

        this.Matter.Body.setPosition(body, origin);
        if (this.shouldDebugDropDiagnostics()) {
            console.warn('[PhysicsWorld] Dropped object still overlaps terrain after escape pass', {
                object: levelObject?.getDebugLabel?.() || levelObject?.type || 'unknown',
                position: { x: body.position.x, y: body.position.y }
            });
        }
    }

    forceBodyOutsideTerrain(body, levelObject) {
        if (!body || !this.Matter || !this.collisionPolygons.length) {
            return false;
        }

        if (this.doesBodyFitOutsideTerrain(body)) {
            return true;
        }

        const step = Math.max(this.getDropEscapeStep(), 0.2);
        const bodyHeight = body.bounds
            ? Math.max(body.bounds.max.y - body.bounds.min.y, 1)
            : 1;
        const bodyWidth = body.bounds
            ? Math.max(body.bounds.max.x - body.bounds.min.x, 1)
            : 1;
        // Pre-bias upward by half the body height so the search starts above the release
        // surface rather than from inside it. This matters when the dyno is pressing down
        // into a ledge at release — the body is already half-buried and small steps won't
        // escape in time before Matter pushes it back through.
        const upBias = bodyHeight * 0.5;
        this.Matter.Body.setPosition(body, { x: body.position.x, y: body.position.y + upBias });
        if (this.doesBodyFitOutsideTerrain(body)) {
            return true;
        }
        const origin = { x: body.position.x, y: body.position.y };
        const polygonMaxY = this.getCollisionPolygonsMaxY();
        const globalUpwardEscape = Number.isFinite(polygonMaxY)
            ? Math.max(0, polygonMaxY - origin.y + bodyHeight + this.getTerrainThickness() + 1)
            : 0;
        const maxDistance = Math.max(
            bodyHeight * 4,
            this.getTerrainThickness() + 8,
            globalUpwardEscape
        );
        const maxHorizontalDistance = Math.max(bodyWidth * 1.5, this.getTerrainThickness() + 2);
        const maxYSteps = Math.ceil(maxDistance / step);
        const maxXSteps = Math.ceil(maxHorizontalDistance / step);
        const horizontalOffsets = [0];
        for (let xStep = 1; xStep <= maxXSteps; xStep += 1) {
            horizontalOffsets.push(-step * xStep, step * xStep);
        }

        // Release should never leave a dragged object inside solid terrain. If the local
        // position is bad, search upward from the release pose and allow small sideways shifts.
        // In this Y-up world, upward is the most predictable way to get out of terrain, while
        // the horizontal sweep handles releases near vertical walls or large filled chunks.
        for (let yStep = 0; yStep <= maxYSteps; yStep += 1) {
            const y = origin.y + (step * yStep);
            for (const xOffset of horizontalOffsets) {
                if (yStep === 0 && Math.abs(xOffset) <= 0.000001) {
                    continue;
                }

                this.Matter.Body.setPosition(body, {
                    x: origin.x + xOffset,
                    y
                });

                if (this.doesBodyFitOutsideTerrain(body)) {
                    if (this.shouldDebugDropDiagnostics()) {
                        console.log('[PhysicsWorld] Forced released LevelObject outside terrain', {
                            object: levelObject?.getDebugLabel?.() || levelObject?.type || 'unknown',
                            origin,
                            resolvedPosition: { x: body.position.x, y: body.position.y },
                            yLift: y - origin.y,
                            xOffset
                        });
                    }
                    return true;
                }
            }
        }

        this.Matter.Body.setPosition(body, origin);
        if (this.shouldDebugDropDiagnostics()) {
            console.warn('[PhysicsWorld] Could not force released LevelObject outside terrain', {
                object: levelObject?.getDebugLabel?.() || levelObject?.type || 'unknown',
                origin
            });
        }
        return false;
    }

    doesBodyFitOutsideTerrain(body) {
        if (!this.doesBodyFitOutsideCollisionPolygons(body)) {
            return false;
        }

        // Filled Matter terrain can have its own convex chunk contacts. A release position is
        // only valid when it is outside both the source optimized polygons and the actual Matter
        // static bodies that will simulate the next frame.
        if (this.Matter && this.terrainBodies.length) {
            const collisions = this.Matter.Query.collides(body, nearbyTerrainBodies(body, this.terrainBodies)) || [];
            if (collisions.length > 0) {
                return false;
            }
        }

        return true;
    }

    getCollisionPolygonsMaxY() {
        let maxY = Number.NEGATIVE_INFINITY;
        for (const polygon of this.collisionPolygons) {
            for (const point of polygon || []) {
                if (Number.isFinite(point?.y)) {
                    maxY = Math.max(maxY, point.y);
                }
            }
        }
        return maxY;
    }

    buildDropEscapeProbeOffsets(step, maxIterations, body = null) {
        const offsets = [];
        const bodyHeight = body?.bounds
            ? Math.max(body.bounds.max.y - body.bounds.min.y, 0)
            : 0;
        const bodyWidth = body?.bounds
            ? Math.max(body.bounds.max.x - body.bounds.min.x, 0)
            : 0;
        const bodySize = Math.max(bodyHeight, bodyWidth, 1);
        const sizeBasedIterations = Math.ceil((bodySize + this.getTerrainThickness() + 2) / Math.max(step, 0.001));
        const totalIterations = Math.max(maxIterations, sizeBasedIterations);

        for (let ring = 1; ring <= totalIterations; ring += 1) {
            const distance = step * ring;
            offsets.push(
                { x: 0, y: distance },
                { x: -distance * 0.5, y: distance },
                { x: distance * 0.5, y: distance },
                { x: -distance, y: distance },
                { x: distance, y: distance },
                { x: 0, y: distance * 1.5 },
                { x: -distance, y: 0 },
                { x: distance, y: 0 }
            );
        }
        return offsets;
    }

    doesBodyFitOutsideCollisionPolygons(body) {
        if (!body || !this.collisionPolygons.length) {
            return true;
        }

        const bodyCorners = getRectCornersFromBody(body);
        const bodyEdges = getPolygonEdges(bodyCorners);
        for (const polygon of this.collisionPolygons) {
            if (!Array.isArray(polygon) || polygon.length < 3) {
                continue;
            }

            if (bodyCorners.some((corner) => pointInPolygon2D(corner, polygon))) {
                return false;
            }

            if (polygon.some((point) => pointInPolygon2D(point, bodyCorners))) {
                return false;
            }

            const polygonEdges = getPolygonEdges(polygon);
            for (const [bodyStart, bodyEnd] of bodyEdges) {
                for (const [polyStart, polyEnd] of polygonEdges) {
                    if (segmentsCrossStrictly(bodyStart, bodyEnd, polyStart, polyEnd)) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    syncBodyFromLevelObject(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (!body) return;

        if (levelObject.configuredCollisionPolygon) {
            // The zeppelin flips via a Y-axis rotation (3D mirror), not a 2D Z rotation.
            // Body.setAngle would rotate rather than mirror the shape. Body.setVertices only
            // updates the root part and breaks compound (decomposed concave) bodies.
            // Instead, detect a facing flip and rebuild the Matter body from the current
            // world vertices. Rebuilding only happens on flip (two states), not every frame.
            const facingSign = levelObject.facingDirection ?? 1;
            const lastFacing = body.plugin?.polygonFacingSign ?? facingSign;
            if (facingSign !== lastFacing) {
                this._rebuildPolygonBody(levelObject, body);
                return;
            }
            const anchor = this._getPolygonBodyAnchor(levelObject);
            const offX = body.plugin?.polygonBodyOffsetX ?? 0;
            const offY = body.plugin?.polygonBodyOffsetY ?? 0;
            this.Matter.Body.setPosition(body, { x: anchor.x + offX, y: anchor.y + offY });
            this._updateBodyAABB(body);
            return;
        }

        if (levelObject.configuredCollisionCircle) {
            const containerPosition = levelObject.container?.position;
            if (!containerPosition) return;
            const offset = this.getCircleWorldOffset(levelObject, levelObject.currentGroundAngle ?? 0);
            this.Matter.Body.setPosition(body, {
                x: containerPosition.x + offset.x,
                y: containerPosition.y + offset.y
            });
            this.Matter.Body.setAngle(body, levelObject.currentGroundAngle ?? 0);
            return;
        }

        const rect = levelObject?.getWorldCollisionRect?.();
        if (!rect) return;
        this.Matter.Body.setPosition(body, { x: rect.centerX, y: rect.centerY });
        this.Matter.Body.setAngle(body, rect.angle ?? 0);
    }

    syncPassiveBodyFromLevelObject(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (
            !body ||
            levelObject.state !== LEVEL_OBJECT_STATES.IDLE ||
            levelObject.gravityEnabled === true ||
            levelObject.isDestroyed ||
            levelObject.markedForRemoval
        ) {
            return;
        }

        // Platform bodies (e.g. zeppelin) are dynamic — Matter drives their position via buoyancy spring.
        // Never sync body from visual; syncObjectFromBody handles visual from body each frame.
        if (levelObject.config?.isPlatform === true) return;

        const platform = body.plugin?.restingOnPlatform;
        if (platform && !platform.isDestroyed && !platform.markedForRemoval) {
            // Check the object is still above the platform — if it slid off, release it.
            // Use AABB overlap since both bodies are static and Matter skips static-static checks.
            const platformBody = this.objectBodies.get(platform);
            const pa = platformBody?.plugin?.aabb;
            const ba = body.plugin?.aabb ?? (body.bounds ? {
                minX: body.bounds.min.x, maxX: body.bounds.max.x,
                minY: body.bounds.min.y, maxY: body.bounds.max.y
            } : null);
            const stillOnPlatform = pa && ba
                ? (ba.maxX >= pa.minX && ba.minX <= pa.maxX && ba.maxY >= pa.minY && ba.minY <= pa.maxY)
                : false;

            if (!stillOnPlatform) {
                body.plugin.restingOnPlatform = null;
                if (body.isStatic) this.Matter.Body.setStatic(body, false);
                levelObject.gravityEnabled = true;
                levelObject.state = LEVEL_OBJECT_STATES.FALLING;
                return;
            }

            // Ride the platform kinematically: translate by the platform's per-frame movement.
            const dx = platform.frameDeltaX ?? 0;
            const dy = platform.frameDeltaY ?? 0;
            if (dx !== 0 || dy !== 0) {
                const newX = body.position.x + dx;
                const newY = body.position.y + dy;

                // Drop the object if the platform would carry it outside the level bounds.
                const levelLeft  = platform._levelBoundsLeft;
                const levelRight = platform._levelBoundsRight;
                const bodyHalfW  = body.plugin?.aabb
                    ? (body.plugin.aabb.maxX - body.plugin.aabb.minX) * 0.5
                    : 0;
                if (
                    Number.isFinite(levelLeft) && Number.isFinite(levelRight) &&
                    (newX - bodyHalfW < levelLeft || newX + bodyHalfW > levelRight)
                ) {
                    body.plugin.restingOnPlatform = null;
                    if (body.isStatic) this.Matter.Body.setStatic(body, false);
                    levelObject.gravityEnabled = true;
                    levelObject.state = LEVEL_OBJECT_STATES.FALLING;
                    return;
                }

                this.Matter.Body.setPosition(body, { x: newX, y: newY });
                this._updateBodyAABB(body);
                this.syncVisualFromMatterBody(levelObject, body);
            }
            return;
        }

        // Platform gone (destroyed/removed) — restore dynamic body and fall.
        if (platform) {
            body.plugin.restingOnPlatform = null;
            if (body.isStatic) this.Matter.Body.setStatic(body, false);
            levelObject.gravityEnabled = true;
            levelObject.state = LEVEL_OBJECT_STATES.FALLING;
            return;
        }

        // Normal static idle: already sleeping — nothing to do.
        if (body.isSleeping) return;

        // First time reaching idle: zero velocity and sleep.
        this.syncBodyFromLevelObject(levelObject);
        this.Matter.Body.setVelocity(body, { x: 0, y: 0 });
        this.Matter.Body.setAngularVelocity(body, 0);
        this.Matter.Sleeping.set(body, true);
    }

    syncVisualFromMatterBody(levelObject, body) {
        const rectConfig = levelObject.configuredCollisionRect || {};
        const baseZ = Number.isFinite(levelObject.baseRotation?.z) ? levelObject.baseRotation.z : 0;
        const localRectAngle = Number.isFinite(rectConfig.angle) ? rectConfig.angle : 0;
        const visualAngleOffset = Number.isFinite(levelObject.config?.physicsVisualAngleOffset)
            ? levelObject.config.physicsVisualAngleOffset
            : 0;

        // Matter is 2D in the game's XY plane, so body.angle maps to rotation around Three's Z axis.
        // Keep currentGroundAngle as the raw physics angle and let LevelObject visual-facing code
        // apply only the intended visual mirror/offset once.
        levelObject.currentGroundAngle = body.angle - baseZ - localRectAngle + visualAngleOffset;
        levelObject.releaseDropVisualPose?.();
        levelObject.applyGroundAlignment?.();

        if (levelObject.configuredCollisionPolygon) {
            // body.position = anchor + polygonBodyOffset. Reverse: anchor = body.position - offset.
            // Anchor = container.position, so container.position = body.position - offset.
            const offX = body.plugin?.polygonBodyOffsetX ?? 0;
            const offY = body.plugin?.polygonBodyOffsetY ?? 0;
            const nx = body.position.x - offX;
            const ny = body.position.y - offY;
            if (Number.isFinite(nx)) levelObject.container.position.x = nx;
            if (Number.isFinite(ny)) levelObject.container.position.y = ny;
        } else if (levelObject.configuredCollisionCircle) {
            const offset = this.getCircleWorldOffset(levelObject, levelObject.currentGroundAngle ?? 0);
            const nx = body.position.x - offset.x;
            const ny = body.position.y - offset.y;
            if (Number.isFinite(nx)) levelObject.container.position.x = nx;
            if (Number.isFinite(ny)) levelObject.container.position.y = ny;
        } else {
            const currentRect = levelObject.getWorldCollisionRect?.();
            if (currentRect) {
                levelObject.container.position.x += body.position.x - currentRect.centerX;
                levelObject.container.position.y += body.position.y - currentRect.centerY;
            } else {
                levelObject.container.position.x = body.position.x;
                levelObject.container.position.y = body.position.y;
            }
        }

        const visualOffset = levelObject.config?.physicsVisualOffset;
        if (visualOffset && levelObject.sceneObject) {
            levelObject.sceneObject.position.x += Number.isFinite(visualOffset.x) ? visualOffset.x : 0;
            levelObject.sceneObject.position.y += Number.isFinite(visualOffset.y) ? visualOffset.y : 0;
            levelObject.sceneObject.updateMatrixWorld?.(true);
        }

        levelObject.restoreGroundLayerZ?.();
    }

    getCircleWorldOffset(levelObject, angle = 0) {
        const circle = levelObject?.configuredCollisionCircle;
        if (!circle) {
            return { x: 0, y: levelObject?.baseGroundOffset ?? 0 };
        }

        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const offsetX = Number.isFinite(circle.offsetX) ? circle.offsetX : 0;
        const offsetY = Number.isFinite(circle.offsetY) ? circle.offsetY : 0;
        return {
            x: (offsetX * cos) - (offsetY * sin),
            y: (levelObject?.baseGroundOffset ?? 0) + (offsetX * sin) + (offsetY * cos)
        };
    }

    syncObjectFromBody(levelObject) {
        const body = this.objectBodies.get(levelObject);
        if (!body || !levelObject || levelObject.isDestroyed || levelObject.markedForRemoval) {
            return;
        }

        if (
            levelObject.state === LEVEL_OBJECT_STATES.GRABBED ||
            (levelObject.state === LEVEL_OBJECT_STATES.CARRIED && levelObject.isPhysicsCarried?.() !== true) ||
            (levelObject.isMouthDragged?.() && levelObject.isPhysicsJointDragged?.() !== true)
        ) {
            return;
        }

        // Restore collision mask if this body was distance-disabled while IDLE.
        if (
            levelObject.state !== LEVEL_OBJECT_STATES.IDLE &&
            this._deactivatedBodies?.has(levelObject)
        ) {
            const savedMask = this._deactivatedBodies.get(levelObject);
            body.collisionFilter.mask = savedMask;
            this._deactivatedBodies.delete(levelObject);
        }

        // When a sleeping IDLE body is woken by a Matter collision (block-block push,
        // external impulse), re-enable gravity so it falls naturally instead of freezing.
        // Only for objects that opt in to dyno/object collision physics (collideWithDyno).
        if (
            levelObject.state === LEVEL_OBJECT_STATES.IDLE &&
            !levelObject.gravityEnabled &&
            !body.isSleeping &&
            !body.isStatic &&
            levelObject.config?.knockable !== false &&
            levelObject.config?.collideWithDyno === true
        ) {
            levelObject.gravityEnabled = true;
            levelObject.state = LEVEL_OBJECT_STATES.FALLING;
            levelObject.fallStartY = body.position.y;
            levelObject._hasBeenDropped = true;
            body.plugin.hasImpactedTerrain = false;
            body.plugin.hasMatterContact = false;
            body.plugin.settledFrameCount = 0;
            body.plugin.dropStartY = body.position.y;
            this._wakeNeighbourBlocks(body);
        }

        const matterShouldDriveObject =
            levelObject.state === LEVEL_OBJECT_STATES.FALLING ||
            levelObject.state === LEVEL_OBJECT_STATES.DRAGGED ||
            levelObject.isPhysicsCarried?.() === true ||
            levelObject.isPhysicsJointDragged?.() === true ||
            levelObject.gravityEnabled === true ||
            levelObject.config?.isPlatform === true;
        if (!matterShouldDriveObject) {
            return;
        }

        this.syncVisualFromMatterBody(levelObject, body);
        let worldVelocityX = body.velocity.x / this.getFixedStepSeconds();
        let worldVelocityY = body.velocity.y / this.getFixedStepSeconds();
        let worldAngularVelocity = body.angularVelocity / this.getFixedStepSeconds();

        this.inferPersistentMatterContact(levelObject, body);

        const hasContact = body.plugin?.hasMatterContact === true;
        const matterCfg = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
        if (hasContact) {
            if (Number.isFinite(matterCfg.groundHorizontalDamping)) {
                const horizontalDamping = THREE.MathUtils.clamp(matterCfg.groundHorizontalDamping, 0, 1);
                TMP_SET_VEL.x = body.velocity.x * horizontalDamping;
                TMP_SET_VEL.y = body.velocity.y;
                this.Matter.Body.setVelocity(body, TMP_SET_VEL);
                worldVelocityX = body.velocity.x / this.getFixedStepSeconds();
                worldVelocityY = body.velocity.y / this.getFixedStepSeconds();
            }
            // Angular damping applied independently while grounded — kills spin so blocks
            // settle flat instead of freezing at a tilted angle.
            if (Number.isFinite(matterCfg.groundAngularDamping) && Math.abs(body.angularVelocity) > 0.000001) {
                const angularDamping = THREE.MathUtils.clamp(matterCfg.groundAngularDamping, 0, 1);
                this.Matter.Body.setAngularVelocity(body, body.angularVelocity * angularDamping);
                worldAngularVelocity = body.angularVelocity / this.getFixedStepSeconds();
            }
        }

        levelObject.velocity?.set(worldVelocityX, worldVelocityY, 0);
        levelObject.angularVelocity = worldAngularVelocity;


        const settleLinearThreshold = Number.isFinite(matterCfg.settleSpeed)
            ? matterCfg.settleSpeed
            : this.getVelocitySleepThreshold();
        const settleAngularThreshold = Number.isFinite(matterCfg.settleAngularSpeed)
            ? Math.max(matterCfg.settleAngularSpeed, 0)
            : this.getAngularSleepThreshold();
        const settleVerticalThreshold = Number.isFinite(matterCfg.settleVerticalSpeed)
            ? Math.max(matterCfg.settleVerticalSpeed, 0)
            : settleLinearThreshold;
        const restitution = Number.isFinite(matterCfg.restitution) ? matterCfg.restitution : 0;
        const isBouncy = restitution > 0;
        // Bouncy objects need a higher threshold — the ball must be truly dead before settling,
        // not just briefly slow while sliding down a slope.
        const effectiveLinearThreshold = settleLinearThreshold;
        const useVerticalRestSettle = matterCfg.settleOnVerticalRest === true;
        const isTrulyStill = Math.hypot(worldVelocityX, worldVelocityY) <= effectiveLinearThreshold &&
            Math.abs(worldAngularVelocity) <= settleAngularThreshold;
        const isVerticallyRestingAfterContact = useVerticalRestSettle &&
            hasContact &&
            Math.abs(worldVelocityY) <= settleVerticalThreshold;
        const isSettleCandidate = isTrulyStill || isVerticallyRestingAfterContact;
        const isSlowAfterContact = hasContact && isSettleCandidate;

        // Objects touching a platform settle immediately — the static hull would slide them
        // along its curved surface during a longer settle window.
        const settleFramesRequired = Number.isFinite(matterCfg.settleFrames)
            ? Math.max(Math.floor(matterCfg.settleFrames), 1)
            : (body.plugin?.restingOnPlatform ? 1 : 8);

        if (levelObject.state === LEVEL_OBJECT_STATES.FALLING && hasContact) {
            body.plugin.settledFrameCount = isSlowAfterContact
                ? (body.plugin.settledFrameCount || 0) + 1
                : 0;
        } else if (body.plugin) {
            body.plugin.settledFrameCount = 0;
        }

        // Bouncy objects settle via frame-count only — Matter's sleep fires at collision impact
        // (velocity briefly zero during impulse resolution) which would freeze mid-bounce.
        // Non-bouncy objects settle via either sleep or frame-count, same as before.
        const worldSpeed = Math.hypot(worldVelocityX, worldVelocityY);
        const shouldSettleToIdle =
            levelObject.state === LEVEL_OBJECT_STATES.FALLING &&
            !levelObject.destroyedFalling &&
            isSettleCandidate &&
            (
                (!isBouncy && body.isSleeping) ||
                (hasContact && !isBouncy && (body.plugin?.settledFrameCount || 0) >= settleFramesRequired) ||
                (hasContact && isBouncy && worldSpeed < 0.05 && (body.plugin?.settledFrameCount || 0) >= settleFramesRequired)
            );

        // Wake body if Matter slept it while still moving (bouncy ball mid-bounce).
        if (body.isSleeping && levelObject.state === LEVEL_OBJECT_STATES.FALLING) {
            if (isBouncy || !isSettleCandidate) {
                this.Matter.Sleeping.set(body, false);
            }
        }

        if (shouldSettleToIdle) {
            this.Matter.Body.setVelocity(body, { x: 0, y: 0 });
            this.Matter.Body.setAngularVelocity(body, 0);
            // Ensure restingOnPlatform is set before deciding whether to sleep.
            // Matter's own sleep may fire before markLevelObjectBodyContact records the platform.
            if (!body.plugin?.restingOnPlatform) {
                const platformBodies = [...this.objectBodies.entries()]
                    .filter(([lo]) => lo?.config?.isPlatform === true)
                    .map(([, b]) => b);
                if (platformBodies.length) {
                    const hits = this.Matter.Query.collides(body, platformBodies);
                    if (hits?.length) {
                        const hitBody = hits[0].bodyA === body ? hits[0].bodyB : hits[0].bodyA;
                        const platform = hitBody?.plugin?.levelObject;
                        if (platform) body.plugin.restingOnPlatform = platform;
                    }
                }
            }
            // Bodies resting on a moving platform: freeze at current physics position, then make
            // static so Matter stops resolving penetration. syncPassiveBodyFromLevelObject rides it.
            // Bodies on terrain get the normal sleep treatment.
            // Snap to nearest 90° before sleeping so objects with snapAngleOnSettle
            // always land flat rather than freezing at a slight tilt.
            const matterCfgSettle = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
            if (matterCfgSettle.snapAngleOnSettle === true) {
                const snapped = Math.round(body.angle / (Math.PI * 0.5)) * (Math.PI * 0.5);
                this.Matter.Body.setAngle(body, snapped);
                this.Matter.Body.setAngularVelocity(body, 0);
                this.Matter.Body.setVelocity(body, { x: 0, y: 0 });
            }

            if (body.plugin?.restingOnPlatform) {
                this.Matter.Body.setStatic(body, true);
            } else {
                this.Matter.Sleeping.set(body, true);
            }
            levelObject.gravityEnabled = false;
            levelObject.state = LEVEL_OBJECT_STATES.IDLE;
            levelObject.velocity?.set(0, 0, 0);
            levelObject.angularVelocity = 0;
            levelObject.tryFinalizePendingDestroy?.();

            // When this body just became IDLE/static, Matter stops generating collisionStart
            // events for it. Any falling body that was resting on top of it will lose its
            // hasMatterContact signal and never settle. Scan immediate neighbours and mark them
            // so their settle counter can proceed normally.
            this._markContactForBodiesRestingOn(body);

            if (this.shouldDebugDropDiagnostics()) {
                console.log('[PhysicsWorld] Settled Matter body to idle', {
                    object: levelObject.getDebugLabel?.() || levelObject.type,
                    bodyWasSleeping: body.isSleeping,
                    settledFrameCount: body.plugin?.settledFrameCount || 0,
                    hadMatterContact: hasContact,
                    bodyAngleRadians: body.angle,
                    bodyAngleDegrees: THREE.MathUtils.radToDeg(body.angle),
                    visualAngleRadians: getPlanarWorldAngle(levelObject.sceneObject, 0),
                    visualAngleDegrees: THREE.MathUtils.radToDeg(getPlanarWorldAngle(levelObject.sceneObject, 0))
                });
            }
        }

        this.logPendingSleepDiagnostics(levelObject, body, {
            worldVelocityX,
            worldVelocityY,
            worldAngularVelocity,
            hasContact,
            settleLinearThreshold,
            settleAngularThreshold,
            settleVerticalThreshold,
            isVerticallyRestingAfterContact,
            isSlowAfterContact
        });
    }

    inferPersistentMatterContact(levelObject, body) {
        if (!body || !levelObject || !this.isActiveFallingBody(levelObject, body)) {
            return;
        }

        // Once hasMatterContact is set, keep it — the settle counter depends on it staying true.
        if (body.plugin?.hasMatterContact === true) {
            return;
        }

        const terrainCollisions = this.Matter.Query.collides(body, nearbyTerrainBodies(body, this.terrainBodies)) || [];
        if (terrainCollisions.length > 0) {
            this.markLevelObjectBodyContact(body, 'terrainQuery');
            return;
        }

        // Platform contact only — block-block and block-object contacts are detected via
        // Matter's collisionStart event (handleCollisionStart), which sets hasMatterContact
        // directly. The per-frame Query.collides scan over all objectBodies was O(n²) per
        // falling body and caused frame-rate drops with many blocks in the level.
        const collideWithMask = this.getLevelObjectCollisionMask(levelObject);
        const canCollideWithPlatforms = (collideWithMask & MATTER_CATEGORY_PLATFORM) !== 0;
        if (canCollideWithPlatforms) {
            const platformBodies = [];
            for (const [lo, pb] of this.objectBodies.entries()) {
                if (pb && pb !== body && lo?.config?.isPlatform === true) platformBodies.push(pb);
            }
            if (platformBodies.length) {
                const objectCollisions = this.Matter.Query.collides(body, platformBodies) || [];
                if (objectCollisions.length > 0) {
                    const contactedBody = objectCollisions[0]?.bodyA === body ? objectCollisions[0]?.bodyB : objectCollisions[0]?.bodyA;
                    this.markLevelObjectBodyContact(body, 'levelObjectQuery', contactedBody ?? null);
                }
            }
        }
    }

    setDynoState(pos, vel) {
        this._dynoPos = pos || null;
        this._dynoVel = vel || null;
    }

    setFocalPoint(x, y) {
        this._focalX = Number.isFinite(x) ? x : null;
        this._focalY = Number.isFinite(y) ? y : null;
    }

    _updateDistanceRemove() {
        if (this._focalX === null || this._focalY === null || !this.Matter) return;
        if (this._startupSettlingMode === true) {
            this.restoreAllDistanceRemovedBodies();
            return;
        }
        const fx = this._focalX;
        const fy = this._focalY;
        const activateRadius = 120;
        const deactivateRadius = 150;
        const activateR2 = activateRadius * activateRadius;
        const deactivateR2 = deactivateRadius * deactivateRadius;
        if (!this._deactivatedBodies) this._deactivatedBodies = new Map();

        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (levelObject.state === LEVEL_OBJECT_STATES.CARRIED || levelObject.state === LEVEL_OBJECT_STATES.GRABBED) continue;

            const isIdleCandidate =
                levelObject.state === LEVEL_OBJECT_STATES.IDLE &&
                !levelObject.gravityEnabled &&
                !body.isStatic &&
                levelObject.config?.collideWithDyno === true;

            const isSleepingFalling =
                this.isActiveFallingBody(levelObject, body) && body.isSleeping;

            if (!isIdleCandidate && !isSleepingFalling) continue;

            const dx = body.position.x - fx;
            const dy = body.position.y - fy;
            const d2 = dx * dx + dy * dy;
            const isDisabled = this._deactivatedBodies.has(levelObject);

            if (!isDisabled && d2 > deactivateR2) {
                // Disable collisions by zeroing the mask — body stays in the world.
                this._deactivatedBodies.set(levelObject, body.collisionFilter.mask);
                body.collisionFilter.mask = 0;
            } else if (isDisabled && d2 <= activateR2) {
                // Restore original collision mask.
                body.collisionFilter.mask = this._deactivatedBodies.get(levelObject);
                this._deactivatedBodies.delete(levelObject);
            }
        }
    }

    update(deltaSeconds = 0) {
        if (!this.engine || !this.Matter || CONFIG.disablePhysics) {
            return;
        }

        this._updateDistanceRemove();
        this._updateTerrainActivation();

        const maxAccMs = this.getFixedStepMs() * 2;
        this.accumulatorMs = Math.min(
            this.accumulatorMs + (Math.max(deltaSeconds, 0) * 1000),
            maxAccMs
        );

        const fixedStepMs = this.getFixedStepMs();
        let substeps = 0;
        while (this.accumulatorMs >= fixedStepMs) {
            this.keepAirborneDroppedBodiesAwake();
            this.restoreDragConstraintBodyLocalPoints();
            this.applyPlatformBuoyancy();
            this.applyWaterFriction();
            this.pushIdleBodiesFromMovingLevelObjects();
            this.applyLaunchVelocities();
            // Dyno push runs every substep so it fires reliably regardless of framerate.
            if (this._dynoPos) {
                this.pushLevelObjectsFromDyno(this._dynoPos, this._dynoVel);
            }
            this.Matter.Engine.update(this.engine, fixedStepMs);
            this.applyBouncyBodyRestitution();
            this.clampDynamicBodyVelocities();
            this.applyCarryAngleSpring();
            this.applyDraggedAngularDamping();
            this.applyContactAngularDamping();
            this.keepAirborneDroppedBodiesAwake();
            this.logTunnelingDiagnostics();
            this.accumulatorMs -= fixedStepMs;
            substeps += 1;
        }
        this.lastSubsteps = substeps;

        if (this.shouldDebugDropDiagnostics()) {
            this.debugUpdateCounter += 1;
            if (this.debugUpdateCounter % 30 === 0) {
                const activeFallingEntries = [...this.objectBodies.entries()].filter(
                    ([levelObject, body]) => this.isActiveFallingBody(levelObject, body)
                );
                console.log('[PhysicsWorld] Matter update status', {
                    deltaSeconds,
                    substeps,
                    accumulatorMs: this.accumulatorMs,
                    fixedStepMs,
                    activeFallingBodies: activeFallingEntries.length,
                    activeFallingBodyNames: activeFallingEntries.map(
                        ([levelObject]) => levelObject.getDebugLabel?.() || levelObject.type
                    )
                });
            }
        }

        for (const levelObject of this.objectBodies.keys()) {
            if (this._deactivatedBodies?.has(levelObject)) continue;
            this.syncObjectFromBody(levelObject);
        }

        this.updateDebug();
    }

    // Wake all sleeping collideWithDyno blocks within wakeRadius of the given body,
    // then recursively wake their neighbours. Prevents stacked blocks from staying asleep
    // when a block below or beside them is knocked out.
    _wakeNeighbourBlocks(body, wakeRadius = 6) {
        const cx = body.position.x;
        const cy = body.position.y;
        const r2 = wakeRadius * wakeRadius;

        for (const [lo, nb] of this.objectBodies.entries()) {
            if (nb === body) continue;
            if (!lo.config?.collideWithDyno) continue;
            if (lo.config?.knockable === false) continue;
            if (lo.state !== LEVEL_OBJECT_STATES.IDLE || lo.gravityEnabled) continue;
            if (nb.isStatic) continue;
            if (this._deactivatedBodies?.has(lo)) continue;

            const dx = nb.position.x - cx;
            const dy = nb.position.y - cy;
            if (dx * dx + dy * dy > r2) continue;

            // Wake and transition to FALLING.
            if (nb.isSleeping) this.Matter.Sleeping.set(nb, false);
            lo.gravityEnabled = true;
            lo.state = LEVEL_OBJECT_STATES.FALLING;
            lo.fallStartY = nb.position.y;
            lo._hasBeenDropped = true;
            nb.plugin.hasImpactedTerrain = false;
            nb.plugin.hasMatterContact = false;
            nb.plugin.settledFrameCount = 0;
            nb.plugin.dropStartY = nb.position.y;

            // Cascade — this newly-woken block wakes its own neighbours.
            this._wakeNeighbourBlocks(nb, wakeRadius);
        }
    }

    // When a body transitions to IDLE, Matter stops emitting collisionStart for it.
    // Any active-falling body that was resting on top of it will lose its hasMatterContact
    // signal and stall indefinitely. This method queries immediate neighbours of the
    // newly-idle body and marks the ones above it as having contact so their settle counters
    // keep incrementing.
    _markContactForBodiesRestingOn(idledBody) {
        if (!this.Matter || !idledBody) return;
        const cx = idledBody.position.x;
        const cy = idledBody.position.y;

        // Search a box roughly the size of the idled body plus one body-width margin.
        const halfW = (idledBody.bounds?.max?.x - idledBody.bounds?.min?.x) * 0.5 + 4 || 6;
        const halfH = (idledBody.bounds?.max?.y - idledBody.bounds?.min?.y) * 0.5 + 4 || 6;

        for (const [lo, nb] of this.objectBodies.entries()) {
            if (nb === idledBody) continue;
            if (!this.isActiveFallingBody(lo, nb)) continue;
            if (nb.isSleeping) continue;

            const dx = Math.abs(nb.position.x - cx);
            const dy = nb.position.y - cy;   // positive = nb is above idledBody
            if (dx > halfW) continue;
            if (dy < 0 || dy > halfH * 2) continue;

            // Confirm actual overlap via Matter.Query so we don't mark distant neighbours.
            const hits = this.Matter.Query.collides(nb, [idledBody]);
            if (!hits?.length) {
                // Allow bodies that are very close above (within 1 unit) even without
                // an overlap hit — the just-snapped body may have a small gap.
                if (dy > 1.5) continue;
            }

            this.markLevelObjectBodyContact(nb, 'idledNeighbour', idledBody);
        }
    }

    // Every substep: scan all IDLE level-object bodies and check if any moving level-object
    // body is overlapping them. If so, push the idle body away and wake it.
    // This catches dragged/carried block vs. resting block, which collisionStart misses
    // because the constraint keeps the moving body almost stationary in velocity terms.
    pushIdleBodiesFromMovingLevelObjects() {
        if (!this.Matter) return;

        // Collect moving bodies (FALLING, DRAGGED, CARRIED with physics joint).
        const movingBodies = [];
        for (const [lo, body] of this.objectBodies.entries()) {
            if (!lo.config?.collideWithDyno) continue;
            if (body.isStatic || body.isSleeping) continue;
            if (this._deactivatedBodies?.has(lo)) continue;
            const isMoving =
                lo.state === LEVEL_OBJECT_STATES.FALLING ||
                lo.state === LEVEL_OBJECT_STATES.DRAGGED ||
                lo.isPhysicsJointDragged?.() === true ||
                lo.isPhysicsCarried?.() === true;
            if (!isMoving) continue;
            movingBodies.push(body);
        }
        if (movingBodies.length === 0) return;

        for (const [idleLO, idleBody] of this.objectBodies.entries()) {
            if (!idleLO.config?.collideWithDyno) continue;
            if (idleLO.state !== LEVEL_OBJECT_STATES.IDLE || idleLO.gravityEnabled) continue;
            if (idleLO.config?.knockable === false) continue;
            if (idleBody.isStatic) continue;
            if (this._deactivatedBodies?.has(idleLO)) continue;

            const ibMinX = idleBody.bounds.min.x;
            const ibMaxX = idleBody.bounds.max.x;
            const ibMinY = idleBody.bounds.min.y;
            const ibMaxY = idleBody.bounds.max.y;
            const ibCX = (ibMinX + ibMaxX) * 0.5;
            const ibCY = (ibMinY + ibMaxY) * 0.5;

            for (const movingBody of movingBodies) {
                if (movingBody === idleBody) continue;

                // Broad AABB overlap check — small tolerance so touching (not yet penetrating) bodies are caught.
                const overlap = 0.05;
                if (
                    movingBody.bounds.max.x < ibMinX - overlap || movingBody.bounds.min.x > ibMaxX + overlap ||
                    movingBody.bounds.max.y < ibMinY - overlap || movingBody.bounds.min.y > ibMaxY + overlap
                ) continue;

                // Push direction: from moving body center toward idle body center.
                let nx = ibCX - movingBody.position.x;
                let ny = ibCY - movingBody.position.y;
                const nLen = Math.sqrt(nx * nx + ny * ny);
                if (nLen < 0.0001) continue;
                nx /= nLen; ny /= nLen;

                // Only push horizontally — skip stacked/vertical cases (falling onto, resting on).
                // This prevents a falling block from waking the block it lands on before settling.
                if (Math.abs(nx) <= Math.abs(ny)) continue;

                // Use the moving body's velocity; for drag-constrained bodies also factor in
                // the target-to-body delta as an effective push velocity.
                let pushVX = movingBody.velocity.x;
                let pushVY = movingBody.velocity.y;

                // If the body is drag-constrained (dragged/carried), supplement with the
                // constraint target direction so a slow-moving spring body still pushes.
                const movingLO = movingBody.plugin?.levelObject;
                const constraint = movingLO ? this.dragConstraints.get(movingLO) : null;
                if (constraint) {
                    const targetX = constraint.pointA.x;
                    const targetY = constraint.pointA.y;
                    const dtx = targetX - movingBody.position.x;
                    const dty = targetY - movingBody.position.y;
                    const dtLen = Math.sqrt(dtx * dtx + dty * dty);
                    if (dtLen > 0.0001) {
                        // Blend body velocity with target-approach direction.
                        // Use a fixed push speed matching the drag speed (approx).
                        const dragSpeed = Math.sqrt(
                            movingBody.velocity.x ** 2 + movingBody.velocity.y ** 2
                        );
                        const effectiveSpeed = Math.max(dragSpeed, 0.05);
                        pushVX = (dtx / dtLen) * effectiveSpeed;
                        pushVY = (dty / dtLen) * effectiveSpeed;
                    }
                }

                // Only push if effective velocity points toward idle body.
                const dot = pushVX * nx + pushVY * ny;
                if (dot <= 0) continue;

                // Wake and transition the idle body.
                if (idleBody.isSleeping) this.Matter.Sleeping.set(idleBody, false);

                // Velocity to give the idle body: the normal component of the push velocity.
                // Use momentum conservation for equal-mass elastic collision (same block type).
                const mA = movingBody.mass > 0 ? movingBody.mass : 1;
                const mB = idleBody.mass > 0 ? idleBody.mass : 1;
                const transferFraction = (2 * mA) / (mA + mB);
                const transferSpeed = dot * transferFraction;
                const currentDot = idleBody.velocity.x * nx + idleBody.velocity.y * ny;
                if (transferSpeed > currentDot) {
                    this.Matter.Body.setVelocity(idleBody, {
                        x: idleBody.velocity.x + (transferSpeed - currentDot) * nx,
                        y: idleBody.velocity.y + (transferSpeed - currentDot) * ny,
                    });
                }

                // Transition IDLE → FALLING.
                idleLO.gravityEnabled = true;
                idleLO.state = LEVEL_OBJECT_STATES.FALLING;
                idleLO.fallStartY = idleBody.position.y;
                idleLO._hasBeenDropped = true;
                idleBody.plugin.hasImpactedTerrain = false;
                idleBody.plugin.hasMatterContact = false;
                idleBody.plugin.settledFrameCount = 0;
                idleBody.plugin.dropStartY = idleBody.position.y;
                this._wakeNeighbourBlocks(idleBody);
                break; // One push per idle body per substep is enough.
            }
        }
    }

    handleCollisionStart(event) {
        for (const pair of event.pairs || []) {
            const terrainBody = this.getTerrainBodyFromPair(pair);
            const objectBody = this.getLevelObjectBodyFromPair(pair);
            const otherObjectBodies = this.getLevelObjectBodiesFromPair(pair);

            if (!terrainBody && otherObjectBodies.length === 0) {
                continue;
            }

            if (terrainBody && objectBody) {
                this.markLevelObjectBodyContact(objectBody, 'terrain');
            }

            if (otherObjectBodies.length === 2) {
                this.markLevelObjectBodyContact(otherObjectBodies[0], 'levelObject', otherObjectBodies[1]);
                this.markLevelObjectBodyContact(otherObjectBodies[1], 'levelObject', otherObjectBodies[0]);

                // Cascade-wake any IDLE collideWithDyno block hit by a moving one.
                for (const [idleBody, movingBody] of [
                    [otherObjectBodies[0], otherObjectBodies[1]],
                    [otherObjectBodies[1], otherObjectBodies[0]],
                ]) {
                    const idleLO = idleBody?.plugin?.levelObject;
                    if (!idleLO?.config?.collideWithDyno) continue;
                    if (idleLO.config?.knockable === false) continue;
                    if (idleLO.state !== LEVEL_OBJECT_STATES.IDLE || idleLO.gravityEnabled) continue;
                    if (idleBody.isStatic) continue;
                    if (idleBody.isSleeping) this.Matter.Sleeping.set(idleBody, false);
                    idleLO.gravityEnabled = true;
                    idleLO.state = LEVEL_OBJECT_STATES.FALLING;
                    idleLO.fallStartY = idleBody.position.y;
                    idleLO._hasBeenDropped = true;
                    idleBody.plugin.hasImpactedTerrain = false;
                    idleBody.plugin.hasMatterContact = false;
                    idleBody.plugin.settledFrameCount = 0;
                    idleBody.plugin.dropStartY = idleBody.position.y;
                    this._wakeNeighbourBlocks(idleBody);
                }

                // Apply impact damage when a falling object first hits a platform.
                for (const [droppedBody, platformBody] of [
                    [otherObjectBodies[0], otherObjectBodies[1]],
                    [otherObjectBodies[1], otherObjectBodies[0]]
                ]) {
                    const droppedLO = droppedBody?.plugin?.levelObject;
                    const platformLO = platformBody?.plugin?.levelObject;
                    if (!droppedLO || !platformLO?.config?.isPlatform) continue;
                    if (droppedBody.plugin.hasImpactedTerrain) continue;
                    if (droppedLO.state !== LEVEL_OBJECT_STATES.FALLING && droppedLO.gravityEnabled !== true) continue;
                    droppedBody.plugin.hasImpactedTerrain = true;
                    const dropStartY = Number.isFinite(droppedBody.plugin.dropStartY)
                        ? droppedBody.plugin.dropStartY
                        : (Number.isFinite(droppedLO.fallStartY) ? droppedLO.fallStartY : droppedBody.position.y);
                    const fallDistance = Math.max(0, dropStartY - droppedBody.position.y);
                    const impactSpeed = Math.max(0, -droppedBody.velocity.y / this.getFixedStepSeconds());
                    const damage = droppedLO.getImpactDamage?.(fallDistance) ?? 0;
                    if (damage > 0) droppedLO.applyDamage?.(damage, 'matterImpact');
                    droppedLO.playGroundImpactSoundIfSurvived?.(impactSpeed);
                    droppedLO.onGroundImpact?.(impactSpeed, fallDistance, droppedBody.position.y);

                    // Kick the platform spring downward. Use a fixed impulse scaled by fall
                    // distance so a light tap does little but a heavy drop gives a clear dip.
                    if (platformBody.plugin && Number.isFinite(platformBody.plugin.platformSpringVelY)) {
                        const kickStrength = platformLO.config?.buoyancyImpulseScale ?? 0.08;
                        const impulse = Math.min(impactSpeed * kickStrength, 3);
                        platformBody.plugin.platformSpringVelY -= impulse;
                    }

                }
            }

            if (!terrainBody || !objectBody) {
                continue;
            }

            const levelObject = objectBody.plugin?.levelObject;
            if (!levelObject || objectBody.plugin.hasImpactedTerrain) {
                continue;
            }
            if (levelObject.state !== LEVEL_OBJECT_STATES.FALLING && levelObject.gravityEnabled !== true) {
                continue;
            }

            objectBody.plugin.hasImpactedTerrain = true;
            const dropStartY = Number.isFinite(objectBody.plugin.dropStartY)
                ? objectBody.plugin.dropStartY
                : (Number.isFinite(levelObject.fallStartY) ? levelObject.fallStartY : objectBody.position.y);
            const fallDistance = Math.max(0, dropStartY - objectBody.position.y);
            const impactSpeed = Math.max(0, -objectBody.velocity.y / this.getFixedStepSeconds());
            const damage = levelObject.getImpactDamage?.(fallDistance) ?? 0;
            if (damage > 0) {
                levelObject.applyDamage?.(damage, 'matterImpact');
            }
            levelObject.playGroundImpactSoundIfSurvived?.(impactSpeed);
            levelObject.onGroundImpact?.(impactSpeed, fallDistance, objectBody.position.y);
            levelObject.fallStartY = objectBody.position.y;

            if (this.shouldDebugDropDiagnostics()) {
                console.log('[PhysicsWorld] Terrain collisionStart', {
                    object: levelObject.getDebugLabel?.() || levelObject.type,
                    bodyY: objectBody.position.y,
                    impactSpeed,
                    fallDistance,
                    terrainColliderThickness: this.getTerrainThickness()
                });
            }
        }
    }

    markLevelObjectBodyContact(body, contactKind, otherBody = null) {
        const levelObject = body?.plugin?.levelObject;
        if (!levelObject || !this.isActiveFallingBody(levelObject, body)) {
            return;
        }

        body.plugin.hasMatterContact = true;
        const _matterCfgContact = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
        const _restitutionContact = Number.isFinite(_matterCfgContact.restitution) ? _matterCfgContact.restitution : 0;
        if (_restitutionContact <= 0 && Number.isFinite(body.plugin.originalSleepThreshold)) {
            // Non-bouncy: allow Matter to sleep once settled. Bouncy bodies keep MAX_SAFE_INTEGER
            // (set in keepAirborneDroppedBodiesAwake) so Matter can't freeze them at impact.
            body.sleepThreshold = body.plugin.originalSleepThreshold;
        }

        // Track which platform we landed on so we can snap and ride it at settle time.
        const otherLevelObject = otherBody?.plugin?.levelObject;
        if (otherLevelObject?.config?.isPlatform === true) {
            body.plugin.restingOnPlatform = otherLevelObject;
        }

        if (this.shouldDebugDropDiagnostics()) {
            console.log('[PhysicsWorld] Matter contact registered', {
                object: levelObject.getDebugLabel?.() || levelObject.type,
                contactKind,
                position: { x: body.position.x, y: body.position.y },
                worldVelocity: {
                    x: body.velocity.x / this.getFixedStepSeconds(),
                    y: body.velocity.y / this.getFixedStepSeconds()
                }
            });
        }
    }

    clampWorldVelocity(worldVelocity, maxMagnitude) {
        const velocity = {
            x: Number.isFinite(worldVelocity?.x) ? worldVelocity.x : 0,
            y: Number.isFinite(worldVelocity?.y) ? worldVelocity.y : 0
        };
        const length = Math.hypot(velocity.x, velocity.y);
        if (!Number.isFinite(maxMagnitude) || maxMagnitude <= 0 || length <= maxMagnitude || length <= 0.000001) {
            return velocity;
        }

        const scale = maxMagnitude / length;
        return {
            x: velocity.x * scale,
            y: velocity.y * scale
        };
    }

applyLaunchVelocities() {
        const fixedStepSeconds = this.getFixedStepSeconds();
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (!body.plugin?.launchFramesLeft) continue;
            body.plugin.launchFramesLeft -= 1;
            const targetVX = body.plugin.launchVelocityX * fixedStepSeconds;
            // Only override X if frictionAir hasn't already accelerated past the launch speed.
            if (Math.abs(body.velocity.x) < Math.abs(targetVX)) {
                this.Matter.Body.setVelocity(body, { x: targetVX, y: body.velocity.y });
            }
            if (body.plugin.launchFramesLeft <= 0) {
                body.plugin.launchVelocityX = null;
            }
        }
    }

    clampDynamicBodyVelocities() {
        const fixedStepSeconds = this.getFixedStepSeconds();
        const globalMaxFallSpeed = this.getMaxFallSpeed();

        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (!this.isActiveFallingBody(levelObject, body)) continue;
            const matterCfg = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
            const maxFallSpeed = Number.isFinite(matterCfg.maxFallSpeed) ? matterCfg.maxFallSpeed : globalMaxFallSpeed;
            const maxFallVelocity = maxFallSpeed * fixedStepSeconds;
            // Only clamp downward velocity — upward (bounce) velocity must never be capped.
            if (body.velocity.y >= -maxFallVelocity) continue;
            TMP_SET_VEL.x = body.velocity.x;
            TMP_SET_VEL.y = -maxFallVelocity;
            this.Matter.Body.setVelocity(body, TMP_SET_VEL);
        }
    }

    applyBouncyBodyRestitution() {
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (!this.isActiveFallingBody(levelObject, body)) continue;
            const matterCfg = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
            const restitution = Number.isFinite(matterCfg.restitution) ? matterCfg.restitution : 0;
            if (restitution <= 0) continue;

            // Use pre-step velocity recorded before Engine.update.
            const preVX = body.plugin._preStepVelocityX;
            const preVY = body.plugin._preStepVelocityY;
            if (!Number.isFinite(preVY) || !Number.isFinite(preVX)) continue;

            const collisions = this.Matter.Query.collides(body, nearbyTerrainBodies(body, this.terrainBodies));
            if (!collisions || collisions.length === 0) continue;

            // Get the surface normal from the first collision.
            // Matter's normal always points from bodyA toward bodyB — flip based on which is the ball.
            const collision = collisions[0];
            let nx = collision.normal?.x ?? 0;
            let ny = collision.normal?.y ?? 1;
            // Matter's normal points from bodyA to bodyB. We want it pointing toward the ball.
            // Terrain is always bodyA in terrain vs object pairs, so if ball is bodyB, flip.
            if (collision.bodyA !== body) { nx = -nx; ny = -ny; }
            const len = Math.sqrt(nx * nx + ny * ny);
            if (len < 0.0001) continue;
            nx /= len; ny /= len;

            // Only bounce if moving into the surface.
            const dot = preVX * nx + preVY * ny;
            if (dot >= 0) continue;

            const normalSpeed = -dot; // incoming speed along normal (positive)
            const friction = Number.isFinite(matterCfg.friction) ? matterCfg.friction : 0.4;

            // Standard reflection: full outgoing velocity.
            const fullRx = preVX - (1 + restitution) * dot * nx;
            const fullRy = preVY - (1 + restitution) * dot * ny;

            // Damp only the horizontal (sideways) component — upward bounce height is preserved.
            const sideDamp = Math.max(0, 1 - friction * 1.0);
            let rx = fullRx * sideDamp;
            let ry = fullRy;

            // On a near-vertical normal (flat or gently sloped surface) with near-zero
            // lateral velocity, add a small random horizontal nudge for natural variation.
            const isNearVerticalNormal = Math.abs(nx) < 0.2;
            const hasNoLateral = Math.abs(rx) < 0.05;
            if (isNearVerticalNormal && hasNoLateral) {
                rx += (Math.random() - 0.5) * normalSpeed * 0.07;
            }

            TMP_SET_VEL.x = rx;
            TMP_SET_VEL.y = ry;
            this.Matter.Body.setVelocity(body, TMP_SET_VEL);
        }
    }

    keepAirborneDroppedBodiesAwake() {
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (!this.isActiveFallingBody(levelObject, body)) {
                continue;
            }

            const matterCfg = levelObject.config?.matter || levelObject.config?.physicsBody || levelObject.config?.physics || {};
            const restitution = Number.isFinite(matterCfg.restitution) ? matterCfg.restitution : 0;
            const isBouncy = restitution > 0;

            if (isBouncy) {
                // Record pre-step velocity every substep so applyBouncyBodyRestitution
                // always has the velocity from just before Engine.update.
                body.plugin._preStepVelocityX = body.velocity.x;
                body.plugin._preStepVelocityY = body.velocity.y;
                body.sleepThreshold = Number.MAX_SAFE_INTEGER;
                if (body.isSleeping) this.Matter.Sleeping.set(body, false);
                continue;
            }

            if (body.plugin?.hasMatterContact) {
                if (Number.isFinite(body.plugin.originalSleepThreshold)) {
                    body.sleepThreshold = body.plugin.originalSleepThreshold;
                }
                continue;
            }

            // Matter sleeping is fine once something has landed and settled, but letting
            // a dropped body sleep before first contact makes it appear to stop after a
            // short fixed fall distance. Keep airborne drops awake until collisionStart
            // confirms contact with terrain or another physics object.
            body.sleepThreshold = Number.MAX_SAFE_INTEGER;
            if (body.isSleeping) {
                this.Matter.Sleeping.set(body, false);
                if (this.shouldDebugDropDiagnostics()) {
                    console.log('[PhysicsWorld] Woke airborne Matter body before contact', {
                        object: levelObject.getDebugLabel?.() || levelObject.type,
                        position: { x: body.position.x, y: body.position.y },
                        worldVelocity: {
                            x: body.velocity.x / this.getFixedStepSeconds(),
                            y: body.velocity.y / this.getFixedStepSeconds()
                        }
                    });
                }
            }
        }
    }

    applyPlatformBuoyancy() {
        const dt = this.getFixedStepSeconds();
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (levelObject.config?.isPlatform !== true || !body.isStatic) continue;

            // Rebuild polygon body when facing direction flips (mirrors collision shape).
            if (levelObject.configuredCollisionPolygon) {
                const facingSign = levelObject.facingDirection ?? 1;
                const lastFacing = body.plugin?.polygonFacingSign ?? facingSign;
                if (facingSign !== lastFacing) {
                    this._rebuildPolygonBody(levelObject, body);
                    const newBody = this.objectBodies.get(levelObject);
                    if (newBody) {
                        this.Matter.Body.setStatic(newBody, true);
                        newBody.friction = 1;
                        newBody.frictionStatic = 1;
                        newBody.restitution = 0;
                    }
                    continue;
                }
            }

            const restY = body.plugin?.platformRestY;
            if (!Number.isFinite(restY)) continue;

            const stiffness = levelObject.config?.buoyancyStiffness ?? 40;
            const damping   = levelObject.config?.buoyancyDamping   ?? 20;

            let velY = body.plugin.platformSpringVelY ?? 0;
            velY += (stiffness * (restY - body.position.y) - damping * velY) * dt;
            body.plugin.platformSpringVelY = velY;

            const prevY = body.position.y;
            const prevX = body.position.x;
            const newY  = prevY + velY * dt;
            const newX  = body.plugin.platformRestX ?? prevX;

            const deltaY = newY - prevY;
            const deltaX = newX - prevX;
            levelObject.frameDeltaY = Number.isFinite(deltaY) ? deltaY : 0;
            levelObject.frameDeltaX = Number.isFinite(deltaX) ? deltaX : 0;

            this.Matter.Body.setPosition(body, { x: newX, y: newY });
            this._updateBodyAABB(body);
            this.syncVisualFromMatterBody(levelObject, body);
        }
    }

    applyContactAngularDamping() {
        const damping = this.getAngularDampingOnContact();
        if (damping >= 0.9999) {
            return;
        }

        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (!this.isActiveFallingBody(levelObject, body) || body.plugin?.hasMatterContact !== true) {
                continue;
            }

            if (Math.abs(body.angularVelocity) <= 0.000001) {
                continue;
            }

            this.Matter.Body.setAngularVelocity(body, body.angularVelocity * damping);
        }
    }

    applyCarryAngleSpring() {
        const carryStrength = Number.isFinite(CONFIG.DYNO_DRAG?.matterCarryAngleSpringStrength)
            ? CONFIG.DYNO_DRAG.matterCarryAngleSpringStrength : 0.02;
        const carryDamping = Number.isFinite(CONFIG.DYNO_DRAG?.matterCarryAngleSpringDamping)
            ? CONFIG.DYNO_DRAG.matterCarryAngleSpringDamping : 0.6;
        const carryTargetRad = THREE.MathUtils.degToRad(
            Number.isFinite(CONFIG.DYNO_DRAG?.matterCarryAngleSpringTargetDeg)
                ? CONFIG.DYNO_DRAG.matterCarryAngleSpringTargetDeg : 0
        );

        const dragStrength = Number.isFinite(CONFIG.DYNO_DRAG?.matterDragAngleSpringStrength)
            ? CONFIG.DYNO_DRAG.matterDragAngleSpringStrength : 0.02;
        const dragDamping = Number.isFinite(CONFIG.DYNO_DRAG?.matterDragAngleSpringDamping)
            ? CONFIG.DYNO_DRAG.matterDragAngleSpringDamping : 0.6;
        const dragTargetRad = THREE.MathUtils.degToRad(
            Number.isFinite(CONFIG.DYNO_DRAG?.matterDragAngleSpringTargetDeg)
                ? CONFIG.DYNO_DRAG.matterDragAngleSpringTargetDeg : 45
        );

        for (const [levelObject] of this.dragConstraints.entries()) {
            const isCarried = levelObject?.state === LEVEL_OBJECT_STATES.CARRIED;
            const isMouthDragged = levelObject?.isMouthDragged?.() === true;
            if (!isCarried && !isMouthDragged) continue;

            const body = this.objectBodies.get(levelObject);
            if (!body || body.isStatic) continue;

            const strength = isCarried ? carryStrength : dragStrength;
            const damping = isCarried ? carryDamping : dragDamping;
            if (strength <= 0) continue;

            // Per-object override (degrees) takes priority over global config.
            const objectTargetDeg = isCarried
                ? levelObject.config?.carryAngleSpringTargetDeg
                : levelObject.config?.dragAngleSpringTargetDeg;
            const globalTargetRad = isCarried ? carryTargetRad : dragTargetRad;
            const baseTargetRad = Number.isFinite(objectTargetDeg)
                ? THREE.MathUtils.degToRad(objectTargetDeg)
                : globalTargetRad;

            // Add the object's configured rect angle so the spring targets the correct
            // orientation for objects whose rest pose is not at 0 degrees.
            const targetAngle = baseTargetRad + (levelObject.configuredCollisionRect?.angle ?? 0);

            // Shortest angular distance to target.
            let angleDelta = targetAngle - body.angle;
            angleDelta = ((angleDelta + Math.PI) % (Math.PI * 2)) - Math.PI;

            const correction = angleDelta * strength - body.angularVelocity * damping;
            this.Matter.Body.setAngularVelocity(body, body.angularVelocity + correction);
        }
    }

    applyDraggedAngularDamping() {
        const dragDamping = this.getDragAngularDamping();
        const carryDamping = this.getCarryAngularDamping();

        for (const [levelObject] of this.dragConstraints.entries()) {
            const body = this.objectBodies.get(levelObject);
            if (!body || body.isStatic) {
                continue;
            }

            let damping;
            if (levelObject?.state === LEVEL_OBJECT_STATES.DRAGGED) {
                damping = dragDamping;
            } else if (levelObject?.state === LEVEL_OBJECT_STATES.CARRIED) {
                damping = carryDamping;
            } else {
                continue;
            }

            if (damping >= 0.9999 || Math.abs(body.angularVelocity) <= 0.000001) {
                continue;
            }

            this.Matter.Body.setAngularVelocity(body, body.angularVelocity * damping);
        }
    }

    isActiveFallingBody(levelObject, body) {
        return Boolean(
            body &&
            !body.isStatic &&
            levelObject &&
            levelObject.state === LEVEL_OBJECT_STATES.FALLING &&
            levelObject.gravityEnabled === true
        );
    }

    logPendingSleepDiagnostics(levelObject, body, diagnostics) {
        if (!this.shouldDebugDropDiagnostics() || !this.isActiveFallingBody(levelObject, body)) {
            return;
        }

        const plugin = body.plugin || {};
        plugin.settleDebugCounter = (plugin.settleDebugCounter || 0) + 1;
        body.plugin = plugin;

        if (plugin.settleDebugCounter % 20 !== 0) {
            return;
        }

        const speed = Math.hypot(diagnostics.worldVelocityX, diagnostics.worldVelocityY);
        const collisionCount = (this.Matter.Query.collides(body, nearbyTerrainBodies(body, this.terrainBodies)) || []).length;
        const overlapsSolidPolygons = !this.doesBodyFitOutsideCollisionPolygons(body);
        const worldRect = levelObject.getWorldCollisionRect?.();
        const visualRect = levelObject.getConfiguredCollisionWorldRectRaw?.();

        console.log('[PhysicsWorld] Falling body not yet settled', {
            object: levelObject.getDebugLabel?.() || levelObject.type,
            state: levelObject.state,
            gravityEnabled: levelObject.gravityEnabled,
            bodyIsSleeping: body.isSleeping,
            hasMatterContact: diagnostics.hasContact,
            settledFrameCount: plugin.settledFrameCount || 0,
            speed,
            velocity: {
                x: diagnostics.worldVelocityX,
                y: diagnostics.worldVelocityY
            },
            angularVelocity: diagnostics.worldAngularVelocity,
            settleLinearThreshold: diagnostics.settleLinearThreshold,
            settleAngularThreshold: diagnostics.settleAngularThreshold,
            isSlowAfterContact: diagnostics.isSlowAfterContact,
            terrainCollisionCount: collisionCount,
            overlapsSolidPolygons,
            bodyPosition: { x: body.position.x, y: body.position.y },
            bodyAngleRadians: body.angle,
            bodyAngleDegrees: THREE.MathUtils.radToDeg(body.angle),
            bodyBounds: body.bounds
                ? {
                    minX: body.bounds.min.x,
                    minY: body.bounds.min.y,
                    maxX: body.bounds.max.x,
                    maxY: body.bounds.max.y
                }
                : null,
            worldRect,
            visualRect
        });
    }

    logTunnelingDiagnostics() {
        if (!this.shouldDebugDropDiagnostics() || !Number.isFinite(this.minTerrainY)) {
            return;
        }

        const warningThreshold = this.minTerrainY - Math.max(this.getTerrainThickness(), 0.5);
        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (
                !body ||
                body.plugin?.hasImpactedTerrain ||
                body.plugin?.tunnelWarningLogged ||
                levelObject.state !== LEVEL_OBJECT_STATES.FALLING ||
                levelObject.gravityEnabled !== true
            ) {
                continue;
            }

            if (body.position.y >= warningThreshold) {
                continue;
            }

            body.plugin.tunnelWarningLogged = true;
            console.warn('[PhysicsWorld] Matter body moved below terrain without a terrain collisionStart.', {
                object: levelObject.getDebugLabel?.() || levelObject.type,
                bodyY: body.position.y,
                minTerrainY: this.minTerrainY,
                worldVelocityY: body.velocity.y / this.getFixedStepSeconds(),
                terrainColliderThickness: this.getTerrainThickness()
            });
        }
    }

    // Wake and impulse all sleeping physics bodies whose AABB overlaps the dyno's
    // collision circle. Call this once per frame from LevelObjectManager after the
    // physics update so blocks topple when the dyno flies into them.
    pushLevelObjectsFromDyno(dynoPos, dynoVelocity) {
        if (!this.Matter || !dynoPos) return;

        const velX = dynoVelocity?.x ?? 0;
        const velY = dynoVelocity?.y ?? 0;
        // Skip the O(n) body scan entirely when the dyno is barely moving —
        // it can't meaningfully push anything at low speed.
        if (velX * velX + velY * velY < 4) return;

        const dynoRadius = 1.1;
        const dx = dynoPos.x;
        const dy = dynoPos.y;
        const fixedStepSec = this.getFixedStepSeconds();
        // Minimum push in world units/sec — guarantees a visible shove even when
        // the dyno is hovering slowly into an object or the device is running slowly.
        const minPushSpeed = 8.0;

        for (const [levelObject, body] of this.objectBodies.entries()) {
            if (body.isStatic) continue;
            if (!levelObject.config?.collideWithDyno) continue;
            if (levelObject.config?.knockable === false) continue;
            if (
                levelObject.state !== LEVEL_OBJECT_STATES.IDLE &&
                levelObject.state !== LEVEL_OBJECT_STATES.FALLING
            ) continue;

            // AABB vs circle overlap.
            const bMinX = body.bounds.min.x;
            const bMaxX = body.bounds.max.x;
            const bMinY = body.bounds.min.y;
            const bMaxY = body.bounds.max.y;
            const closestX = Math.max(bMinX, Math.min(dx, bMaxX));
            const closestY = Math.max(bMinY, Math.min(dy, bMaxY));
            const distSq = (dx - closestX) ** 2 + (dy - closestY) ** 2;
            if (distSq > dynoRadius * dynoRadius) continue;

            // Derive the push direction. When the dyno is already inside the AABB
            // (closestX === dx, tunnelling on slow frames), use the body centre instead
            // so we always get a well-defined outward normal.
            let toNX, toNY;
            const bodyCx = (bMinX + bMaxX) * 0.5;
            const bodyCy = (bMinY + bMaxY) * 0.5;
            const sepX = bodyCx - dx;
            const sepY = bodyCy - dy;
            const sepLen = Math.sqrt(sepX * sepX + sepY * sepY);
            if (sepLen > 0.0001) {
                toNX = sepX / sepLen;
                toNY = sepY / sepLen;
            } else {
                // Dyno exactly at body centre — push upward as safe default.
                toNX = 0;
                toNY = 1;
            }

            // Skip if dyno is clearly moving away from this object already.
            const approachDot = velX * toNX + velY * toNY;
            const blockApproachDot = body.velocity.x * toNX + body.velocity.y * toNY;
            // Allow push even at zero velocity (contact without motion on slow devices).
            if (approachDot < -2 && blockApproachDot > approachDot) continue;

            // Wake the body.
            if (body.isSleeping) this.Matter.Sleeping.set(body, false);

            // Transfer the dyno's velocity component toward the block, with a floor
            // so slow devices still generate a visible push.
            const dynoDot = velX * toNX * fixedStepSec + velY * toNY * fixedStepSec;
            const blockDot = body.velocity.x * toNX + body.velocity.y * toNY;
            const minDot = minPushSpeed * fixedStepSec;
            const pushDot = Math.max(dynoDot, minDot);

            if (pushDot > blockDot) {
                TMP_SET_VEL.x = body.velocity.x + (pushDot - blockDot) * toNX;
                TMP_SET_VEL.y = body.velocity.y + (pushDot - blockDot) * toNY;
                this.Matter.Body.setVelocity(body, TMP_SET_VEL);
            }

            // Transition settled objects back to FALLING.
            if (levelObject.state === LEVEL_OBJECT_STATES.IDLE && !levelObject.gravityEnabled) {
                levelObject.gravityEnabled = true;
                levelObject.state = LEVEL_OBJECT_STATES.FALLING;
                levelObject.fallStartY = body.position.y;
                levelObject._hasBeenDropped = true;
                body.plugin.hasImpactedTerrain = false;
                body.plugin.hasMatterContact = false;
                body.plugin.settledFrameCount = 0;
                body.plugin.dropStartY = body.position.y;
                this._wakeNeighbourBlocks(body);
            }
        }
    }

    getTerrainBodyFromPair(pair) {
        if (pair.bodyA?.plugin?.physicsWorldKind === 'terrain') return pair.bodyA;
        if (pair.bodyB?.plugin?.physicsWorldKind === 'terrain') return pair.bodyB;
        return null;
    }

    getLevelObjectBodyFromPair(pair) {
        if (pair.bodyA?.plugin?.physicsWorldKind === 'levelObject') return pair.bodyA;
        if (pair.bodyB?.plugin?.physicsWorldKind === 'levelObject') return pair.bodyB;
        return null;
    }

    getLevelObjectBodiesFromPair(pair) {
        const result = [];
        if (pair.bodyA?.plugin?.physicsWorldKind === 'levelObject') {
            result.push(pair.bodyA);
        }
        if (pair.bodyB?.plugin?.physicsWorldKind === 'levelObject') {
            result.push(pair.bodyB);
        }
        return result;
    }

    ensureDebugGroup() {
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderMatterPhysics) {
            this.disposeDebug();
            return null;
        }

        if (!this.debugGroup) {
            this.debugGroup = new THREE.Group();
            this.debugGroup.name = 'MatterLevelObjectDebug';
            this.debugGroup.renderOrder = 1000006;
            this.scene?.add(this.debugGroup);

            if (this.shouldDebugRenderDiagnostics() && !this.debugRenderStatus.groupCreatedLogged) {
                console.log('[PhysicsWorld] Matter debug group created', {
                    hasScene: Boolean(this.scene),
                    sceneHasDebugGroup: this.scene?.children?.includes?.(this.debugGroup) === true,
                    debugGroupName: this.debugGroup.name,
                    renderOrder: this.debugGroup.renderOrder
                });
                this.debugRenderStatus.groupCreatedLogged = true;
            }
        }

        return this.debugGroup;
    }

    rebuildTerrainDebug() {
        const group = this.ensureDebugGroup();
        if (!group) {
            return;
        }

        this.debugTerrainLine?.geometry?.dispose?.();
        this.debugTerrainLine?.material?.dispose?.();
        this.debugTerrainLine?.removeFromParent?.();
        this.debugTerrainLine = null;

        const positions = [];
        for (const body of this.terrainBodies) {
            for (const point of getRectCornersFromBody(body)) {
                positions.push(point.x, point.y, DEBUG_Z);
            }
        }

        const linePositions = [];
        for (const body of this.terrainBodies) {
            const corners = getRectCornersFromBody(body);
            for (let index = 0; index < corners.length; index += 1) {
                const current = corners[index];
                const next = corners[(index + 1) % corners.length];
                linePositions.push(current.x, current.y, DEBUG_Z, next.x, next.y, DEBUG_Z);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        const material = new THREE.LineBasicMaterial({
            color: 0xffcc33,
            transparent: true,
            opacity: 0.8,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        this.debugTerrainLine = new THREE.LineSegments(geometry, material);
        this.debugTerrainLine.renderOrder = 1000006;
        this.debugTerrainLine.frustumCulled = false;
        group.add(this.debugTerrainLine);

        if (this.shouldDebugRenderDiagnostics()) {
            console.log('[PhysicsWorld] Rebuilt Matter terrain debug overlay', {
                terrainBodyCount: this.terrainBodies.length,
                lineSegmentCount: linePositions.length / 6,
                hasDebugTerrainLine: Boolean(this.debugTerrainLine),
                debugGroupChildCount: this.debugGroup?.children?.length ?? 0
            });
            this.debugRenderStatus.terrainRebuildLogged = true;
        }
    }

    updateDebug() {
        const group = this.ensureDebugGroup();
        if (!group) {
            return;
        }

        for (const [levelObject, line] of [...this.debugObjectLines.entries()]) {
            if (!this.objectBodies.has(levelObject)) {
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                line.removeFromParent?.();
                this.debugObjectLines.delete(levelObject);
            }
        }

        for (const [levelObject, line] of [...this.debugVisualRectLines.entries()]) {
            if (!this.objectBodies.has(levelObject)) {
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                line.removeFromParent?.();
                this.debugVisualRectLines.delete(levelObject);
            }
        }

        for (const [levelObject, line] of [...this.debugVisualAxisLines.entries()]) {
            if (!this.objectBodies.has(levelObject)) {
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                line.removeFromParent?.();
                this.debugVisualAxisLines.delete(levelObject);
            }
        }

        for (const [levelObject, lines] of [...this.debugGrabPointLines.entries()]) {
            if (!this.objectBodies.has(levelObject)) {
                for (const line of Object.values(lines)) {
                    line?.geometry?.dispose?.();
                    line?.material?.dispose?.();
                    line?.removeFromParent?.();
                }
                this.debugGrabPointLines.delete(levelObject);
            }
        }

        for (const [levelObject, lines] of [...this.debugDynoAnchorLines.entries()]) {
            if (!this.objectBodies.has(levelObject)) {
                for (const line of Object.values(lines)) {
                    line?.geometry?.dispose?.();
                    line?.material?.dispose?.();
                    line?.removeFromParent?.();
                }
                this.debugDynoAnchorLines.delete(levelObject);
            }
        }

        for (const [levelObject, line] of [...this.debugJointLines.entries()]) {
            if (!this.objectBodies.has(levelObject) || !this.dragConstraints.has(levelObject)) {
                line.geometry?.dispose?.();
                line.material?.dispose?.();
                line.removeFromParent?.();
                this.debugJointLines.delete(levelObject);
            }
        }

        for (const [levelObject, body] of this.objectBodies.entries()) {
            const geometry = levelObject.configuredCollisionPolygon
                ? makeCompoundBodyGeometry(body, DEBUG_Z + 0.1)
                : makeLineLoopGeometry(getRectCornersFromBody(body), DEBUG_Z + 0.1);
            const color = body.isSleeping ? 0x55ff99 : 0xff3355;
            let line = this.debugObjectLines.get(levelObject);
            if (!line) {
                line = new THREE.LineSegments(
                    geometry,
                    new THREE.LineBasicMaterial({
                        color,
                        transparent: true,
                        opacity: 0.95,
                        depthTest: false,
                        depthWrite: false,
                        toneMapped: false
                    })
                );
                line.renderOrder = 1000007;
                line.frustumCulled = false;
                group.add(line);
                this.debugObjectLines.set(levelObject, line);
            } else {
                line.geometry?.dispose?.();
                line.geometry = geometry;
                line.material.color.setHex(color);
            }

            if (!levelObject.configuredCollisionPolygon) {
                const visualPoints = getRectCornersFromRect(levelObject.getConfiguredCollisionWorldRectRaw?.() || levelObject.getWorldCollisionRect?.());
                const visualGeometry = makeLineLoopGeometry(visualPoints, DEBUG_Z + 0.2);
                let visualLine = this.debugVisualRectLines.get(levelObject);
                if (!visualLine) {
                    visualLine = new THREE.LineSegments(
                        visualGeometry,
                        new THREE.LineBasicMaterial({
                            color: 0x33ccff,
                            transparent: true,
                            opacity: 0.95,
                            depthTest: false,
                            depthWrite: false,
                            toneMapped: false
                        })
                    );
                    visualLine.renderOrder = 1000008;
                    visualLine.frustumCulled = false;
                    group.add(visualLine);
                    this.debugVisualRectLines.set(levelObject, visualLine);
                } else {
                    visualLine.geometry?.dispose?.();
                    visualLine.geometry = visualGeometry;
                }
            }

            const visualOrigin = levelObject.sceneObject?.getWorldPosition?.(new THREE.Vector3()) || new THREE.Vector3();
            const visualAngle = getPlanarWorldAngle(levelObject.sceneObject, 0);
            const visualAxisPoints = [
                { x: visualOrigin.x, y: visualOrigin.y },
                { x: visualOrigin.x + (Math.cos(visualAngle) * 2), y: visualOrigin.y + (Math.sin(visualAngle) * 2) }
            ];
            const axisPositions = [
                visualAxisPoints[0].x, visualAxisPoints[0].y, DEBUG_Z + 0.3,
                visualAxisPoints[1].x, visualAxisPoints[1].y, DEBUG_Z + 0.3
            ];
            const axisGeometry = new THREE.BufferGeometry();
            axisGeometry.setAttribute('position', new THREE.Float32BufferAttribute(axisPositions, 3));
            let axisLine = this.debugVisualAxisLines.get(levelObject);
            if (!axisLine) {
                axisLine = new THREE.LineSegments(
                    axisGeometry,
                    new THREE.LineBasicMaterial({
                        color: 0xffee00,
                        transparent: true,
                        opacity: 0.95,
                        depthTest: false,
                        depthWrite: false,
                        toneMapped: false
                    })
                );
                axisLine.renderOrder = 1000009;
                axisLine.frustumCulled = false;
                group.add(axisLine);
                this.debugVisualAxisLines.set(levelObject, axisLine);
            } else {
                axisLine.geometry?.dispose?.();
                axisLine.geometry = axisGeometry;
            }

            const grabLines = this.debugGrabPointLines.get(levelObject) || {};
            const activeConstraint = this.dragConstraints.get(levelObject);
            const getPhysicsGrabPoint = (name) => {
                const localPoint = levelObject.getDragConstraintBodyLocalPoint?.(name);
                if (Number.isFinite(localPoint?.x) && Number.isFinite(localPoint?.y)) {
                    return this.getBodyWorldPointFromLocal(body, localPoint);
                }
                return levelObject.getGrabPointWorldPosition?.(name, new THREE.Vector3());
            };
            const pickupLocalPoint = levelObject.getPickupConstraintBodyLocalPoint?.();
            const pickupPoint = Number.isFinite(pickupLocalPoint?.x) && Number.isFinite(pickupLocalPoint?.y)
                ? this.getBodyWorldPointFromLocal(body, pickupLocalPoint)
                : levelObject.getPickupRootWorldPosition?.(new THREE.Vector3());
            const markerSpecs = [
                {
                    key: 'grab_front',
                    color: 0x00ff66,
                    point: getPhysicsGrabPoint('grab_front')
                },
                {
                    key: 'grab_back',
                    color: 0xff9933,
                    point: getPhysicsGrabPoint('grab_back')
                },
                {
                    key: 'pickup_root',
                    color: 0xffffff,
                    point: pickupPoint
                }
            ];
            for (const marker of markerSpecs) {
                if (!marker.point || !Number.isFinite(marker.point.x) || !Number.isFinite(marker.point.y)) {
                    const staleLine = grabLines[marker.key];
                    staleLine?.geometry?.dispose?.();
                    staleLine?.material?.dispose?.();
                    staleLine?.removeFromParent?.();
                    delete grabLines[marker.key];
                    continue;
                }

                const markerGeometry = makeCrossGeometry(marker.point, 0.22, DEBUG_Z + 0.45);
                let markerLine = grabLines[marker.key];
                if (!markerLine) {
                    markerLine = new THREE.LineSegments(
                        markerGeometry,
                        new THREE.LineBasicMaterial({
                            color: marker.color,
                            transparent: true,
                            opacity: 1,
                            depthTest: false,
                            depthWrite: false,
                            toneMapped: false
                        })
                    );
                    markerLine.renderOrder = 1000010;
                    markerLine.frustumCulled = false;
                    group.add(markerLine);
                    grabLines[marker.key] = markerLine;
                } else {
                    markerLine.geometry?.dispose?.();
                    markerLine.geometry = markerGeometry;
                    markerLine.material.color.setHex(marker.color);
                }
            }
            this.debugGrabPointLines.set(levelObject, grabLines);

            const constraint = this.dragConstraints.get(levelObject);
            const dynoAnchorLines = this.debugDynoAnchorLines.get(levelObject) || {};
            const dynoMarkerSpecs = [];
            if (constraint) {
                const targetAnchor = this.getConstraintPointWorld(constraint, 'A');
                // constraint.pointB is mutated by Matter each step — use the cached
                // body-local point and rotate it ourselves to get the true fixed anchor.
                const fixedLocalPoint = levelObject.getDragConstraintBodyLocalPoint?.();
                const bodyAnchor = (fixedLocalPoint && Number.isFinite(fixedLocalPoint.x))
                    ? this.getBodyWorldPointFromLocal(body, fixedLocalPoint)
                    : this.getConstraintPointWorld(constraint, 'B');
                dynoMarkerSpecs.push({
                    key: 'constraint_target',
                    color: 0x3399ff,
                    point: targetAnchor
                });
                dynoMarkerSpecs.push({
                    key: 'constraint_body_anchor',
                    color: 0xff33ff,
                    point: bodyAnchor
                });
            }

            if (levelObject.state === LEVEL_OBJECT_STATES.CARRIED && typeof levelObject.getCarryTargetWorldPosition === 'function') {
                dynoMarkerSpecs.push({
                    key: 'carry_socket',
                    color: 0x66ddff,
                    point: levelObject.getCarryTargetWorldPosition(new THREE.Vector3())
                });
            }

            if (levelObject.state === LEVEL_OBJECT_STATES.DRAGGED && typeof levelObject.getDragTargetWorldPosition === 'function') {
                dynoMarkerSpecs.push({
                    key: 'mouth_drag_target',
                    color: 0x0066ff,
                    point: levelObject.getDragTargetWorldPosition(new THREE.Vector3())
                });
            }

            const activeDynoMarkerKeys = new Set();
            for (const marker of dynoMarkerSpecs) {
                activeDynoMarkerKeys.add(marker.key);
                if (!marker.point || !Number.isFinite(marker.point.x) || !Number.isFinite(marker.point.y)) {
                    continue;
                }

                const markerGeometry = makeCrossGeometry(marker.point, 0.34, DEBUG_Z + 0.65);
                let markerLine = dynoAnchorLines[marker.key];
                if (!markerLine) {
                    markerLine = new THREE.LineSegments(
                        markerGeometry,
                        new THREE.LineBasicMaterial({
                            color: marker.color,
                            transparent: true,
                            opacity: 1,
                            depthTest: false,
                            depthWrite: false,
                            toneMapped: false
                        })
                    );
                    markerLine.renderOrder = 1000012;
                    markerLine.frustumCulled = false;
                    group.add(markerLine);
                    dynoAnchorLines[marker.key] = markerLine;
                } else {
                    markerLine.geometry?.dispose?.();
                    markerLine.geometry = markerGeometry;
                    markerLine.material.color.setHex(marker.color);
                }
            }

            for (const [key, line] of Object.entries(dynoAnchorLines)) {
                if (activeDynoMarkerKeys.has(key)) {
                    continue;
                }

                line?.geometry?.dispose?.();
                line?.material?.dispose?.();
                line?.removeFromParent?.();
                delete dynoAnchorLines[key];
            }
            this.debugDynoAnchorLines.set(levelObject, dynoAnchorLines);

            if (this.shouldDebugDropDiagnostics() && (levelObject.state === LEVEL_OBJECT_STATES.FALLING || body.isSleeping)) {
                const visualAngleDelta = getAngleDeltaRadians(visualAngle, body.angle);
                const mirroredVisualAngleDelta = Math.abs(Math.abs(visualAngleDelta) - Math.PI);

                // Some meshes are authored with a 180deg facing offset relative to the physics
                // rectangle. That is visually correct, so only report a mismatch when the mesh
                // differs by something other than the expected half-turn.
                if (Math.abs(visualAngleDelta) > 0.15 && mirroredVisualAngleDelta > 0.15) {
                    console.log('[PhysicsWorld] Visual/body angle mismatch', {
                        object: levelObject.getDebugLabel?.() || levelObject.type,
                        bodyAngleRadians: body.angle,
                        bodyAngleDegrees: THREE.MathUtils.radToDeg(body.angle),
                        visualAngleRadians: visualAngle,
                        visualAngleDegrees: THREE.MathUtils.radToDeg(visualAngle),
                        visualAngleDeltaRadians: visualAngleDelta,
                        visualAngleDeltaDegrees: THREE.MathUtils.radToDeg(visualAngleDelta),
                        mirroredVisualAngleDeltaRadians: mirroredVisualAngleDelta,
                        mirroredVisualAngleDeltaDegrees: THREE.MathUtils.radToDeg(mirroredVisualAngleDelta),
                        bodyPosition: { x: body.position.x, y: body.position.y },
                        visualPosition: { x: visualOrigin.x, y: visualOrigin.y },
                        bodyVelocity: { x: body.velocity.x / this.getFixedStepSeconds(), y: body.velocity.y / this.getFixedStepSeconds() },
                        bodyAngularVelocity: body.angularVelocity / this.getFixedStepSeconds(),
                        bodyIsSleeping: body.isSleeping
                    });
                }
            }
        }

        if (this.shouldDebugRenderDiagnostics()) {
            this.debugUpdateCounter += 1;
            if (this.debugUpdateCounter % 60 === 0) {
                if (this.shouldDebugDropDiagnostics())
                {
                    console.log('[PhysicsWorld] Matter debug overlay status', {
                        terrainBodies: this.terrainBodies.length,
                        objectBodies: this.objectBodies.size,
                        objectOverlayCount: this.debugObjectLines.size,
                        visualRectOverlayCount: this.debugVisualRectLines.size,
                        visualAxisOverlayCount: this.debugVisualAxisLines.size,
                        grabPointOverlayCount: [...this.debugGrabPointLines.values()]
                            .reduce((sum, lines) => sum + Object.keys(lines || {}).length, 0),
                        dynoAnchorOverlayCount: [...this.debugDynoAnchorLines.values()]
                            .reduce((sum, lines) => sum + Object.keys(lines || {}).length, 0),
                        jointOverlayCount: this.debugJointLines.size,
                        debugGroupChildCount: this.debugGroup?.children?.length ?? 0,
                        sceneHasDebugGroup: this.scene?.children?.includes?.(this.debugGroup) === true
                    });
                }
                this.debugRenderStatus.objectOverlayLogged = true;
            }
        }
    }

    removeObjectDebug(levelObject) {
        const line = this.debugObjectLines.get(levelObject);
        line?.geometry?.dispose?.();
        line?.material?.dispose?.();
        line?.removeFromParent?.();
        this.debugObjectLines.delete(levelObject);

        const visualLine = this.debugVisualRectLines.get(levelObject);
        visualLine?.geometry?.dispose?.();
        visualLine?.material?.dispose?.();
        visualLine?.removeFromParent?.();
        this.debugVisualRectLines.delete(levelObject);

        const axisLine = this.debugVisualAxisLines.get(levelObject);
        axisLine?.geometry?.dispose?.();
        axisLine?.material?.dispose?.();
        axisLine?.removeFromParent?.();
        this.debugVisualAxisLines.delete(levelObject);

        const grabLines = this.debugGrabPointLines.get(levelObject);
        for (const grabLine of Object.values(grabLines || {})) {
            grabLine?.geometry?.dispose?.();
            grabLine?.material?.dispose?.();
            grabLine?.removeFromParent?.();
        }
        this.debugGrabPointLines.delete(levelObject);

        const dynoAnchorLines = this.debugDynoAnchorLines.get(levelObject);
        for (const dynoAnchorLine of Object.values(dynoAnchorLines || {})) {
            dynoAnchorLine?.geometry?.dispose?.();
            dynoAnchorLine?.material?.dispose?.();
            dynoAnchorLine?.removeFromParent?.();
        }
        this.debugDynoAnchorLines.delete(levelObject);

        const jointLine = this.debugJointLines.get(levelObject);
        jointLine?.geometry?.dispose?.();
        jointLine?.material?.dispose?.();
        jointLine?.removeFromParent?.();
        this.debugJointLines.delete(levelObject);
    }

    disposeDebug() {
        for (const line of this.debugObjectLines.values()) {
            line.geometry?.dispose?.();
            line.material?.dispose?.();
        }
        this.debugObjectLines.clear();
        for (const line of this.debugVisualRectLines.values()) {
            line.geometry?.dispose?.();
            line.material?.dispose?.();
        }
        this.debugVisualRectLines.clear();
        for (const line of this.debugVisualAxisLines.values()) {
            line.geometry?.dispose?.();
            line.material?.dispose?.();
        }
        this.debugVisualAxisLines.clear();
        for (const lines of this.debugGrabPointLines.values()) {
            for (const line of Object.values(lines || {})) {
                line?.geometry?.dispose?.();
                line?.material?.dispose?.();
            }
        }
        this.debugGrabPointLines.clear();
        for (const lines of this.debugDynoAnchorLines.values()) {
            for (const line of Object.values(lines || {})) {
                line?.geometry?.dispose?.();
                line?.material?.dispose?.();
            }
        }
        this.debugDynoAnchorLines.clear();
        for (const line of this.debugJointLines.values()) {
            line.geometry?.dispose?.();
            line.material?.dispose?.();
        }
        this.debugJointLines.clear();
        this.debugTerrainLine?.geometry?.dispose?.();
        this.debugTerrainLine?.material?.dispose?.();
        this.debugTerrainLine = null;
        this.debugGroup?.removeFromParent?.();
        this.debugGroup = null;
        this.debugRenderStatus.groupCreatedLogged = false;
        this.debugRenderStatus.terrainRebuildLogged = false;
        this.debugRenderStatus.objectOverlayLogged = false;
    }
}
