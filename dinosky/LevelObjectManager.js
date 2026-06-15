import * as THREE from 'three';
import { CONFIG } from './config.js';
import { LevelObjectFactory } from './LevelObjectFactory.js';
import { LevelObjectDestructionEffect, WaterSplashEffect } from './LevelObjectEffects.js';
import { PhysicsWorld } from './PhysicsWorld.js';
import { CollectibleObject } from './CollectibleObject.js';
import { SpatialGrid } from './SpatialGrid.js';

function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
}

function resolveObjectTypeFromMarker(object = {}) {
    const knownTypes = Object.keys(CONFIG.LEVEL_OBJECT_TYPES || {});
    const props = object.properties || {};
//    if (Object.keys(props).length > 0 || object.name || object.type) console.log('[resolveObjectType]', { name: object.name, type: object.type, objectType: props.objectType, propsKeys: Object.keys(props), propsJSON: JSON.stringify(props) });
    const candidates = [
//        props.levelObjectType,
        props.objectType,
//        props.vehicleType,
//        props.spawnType,
//        object.type,
//        object.name
    ];

    for (const candidate of candidates) {
        const normalized = normalizeToken(candidate);
        if (!normalized) {
            continue;
        }
        if (knownTypes.includes(normalized)) {
            return normalized;
        }
        // Fall back to longest config key that appears as a prefix in the candidate.
        // e.g. "car3" → "car", "supercar1" → "supercar" (longer prefix wins over "car").
        const match = knownTypes
            .filter(k => normalized.startsWith(k))
            .sort((a, b) => b.length - a.length)[0];
        if (match) {
            return match;
        }
    }

    return null;
}

function isSpawnLayer(layer) {
    const configuredName = String(CONFIG.LEVEL_OBJECTS?.spawnLayerName || 'LevelObjects').trim().toLowerCase();
    return layer?.spawnOnly === true || normalizeToken(layer?.name) === configuredName;
}

function pointToRectDistance(point, rect) {
    if (!rect) {
        return Number.POSITIVE_INFINITY;
    }

    const halfWidth = Math.max(rect.halfWidth ?? 0, 0.0001);
    const halfHeight = Math.max(rect.halfHeight ?? 0, 0.0001);
    const angle = rect.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localX = ((point.x - rect.centerX) * cos) + ((point.y - rect.centerY) * sin);
    const localY = (-(point.x - rect.centerX) * sin) + ((point.y - rect.centerY) * cos);
    const outsideX = Math.max(Math.abs(localX) - halfWidth, 0);
    const outsideY = Math.max(Math.abs(localY) - halfHeight, 0);
    return Math.hypot(outsideX, outsideY);
}

function pointToCircleDistance(point, circle) {
    if (!circle) {
        return Number.POSITIVE_INFINITY;
    }

    const radius = Math.max(circle.radius ?? 0, 0.0001);
    const dx = point.x - circle.centerX;
    const dy = point.y - circle.centerY;
    const distance = Math.hypot(dx, dy);
    return Math.max(distance - radius, 0);
}

function pointToSegmentDistanceSq(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq <= 0.000001) {
        const px = point.x - start.x;
        const py = point.y - start.y;
        return (px * px) + (py * py);
    }

    const t = THREE.MathUtils.clamp(
        (((point.x - start.x) * dx) + ((point.y - start.y) * dy)) / lengthSq,
        0,
        1
    );
    const closestX = start.x + (dx * t);
    const closestY = start.y + (dy * t);
    const px = point.x - closestX;
    const py = point.y - closestY;
    return (px * px) + (py * py);
}

function segmentIntersectsAxisAlignedRect(start, end, rect) {
    if (!rect) {
        return false;
    }

    const minX = rect.centerX - rect.halfWidth;
    const maxX = rect.centerX + rect.halfWidth;
    const minY = rect.centerY - rect.halfHeight;
    const maxY = rect.centerY + rect.halfHeight;

    if (start.x >= minX && start.x <= maxX && start.y >= minY && start.y <= maxY) {
        return true;
    }
    if (end.x >= minX && end.x <= maxX && end.y >= minY && end.y <= maxY) {
        return true;
    }

    let tMin = 0;
    let tMax = 1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const tests = [
        { p: -dx, q: start.x - minX },
        { p: dx, q: maxX - start.x },
        { p: -dy, q: start.y - minY },
        { p: dy, q: maxY - start.y }
    ];

    for (const test of tests) {
        if (Math.abs(test.p) <= 0.000001) {
            if (test.q < 0) {
                return false;
            }
            continue;
        }

        const t = test.q / test.p;
        if (test.p < 0) {
            tMin = Math.max(tMin, t);
        } else {
            tMax = Math.min(tMax, t);
        }
        if (tMin > tMax) {
            return false;
        }
    }

    return true;
}

// Returns true if segment (p1→p2) crosses the vertical ring pass line (x, y0→y1).
function segmentCrossesRingLine(p1, p2, line) {
    if (line.horizontal) {
        // Horizontal ring: fixed Y line, check X range [x0, x1].
        const dy = p2.y - p1.y;
        if (Math.abs(dy) < 0.000001) return false;
        const t = (line.y - p1.y) / dy;
        if (t < 0 || t > 1) return false;
        const x = p1.x + t * (p2.x - p1.x);
        return x >= line.x0 && x <= line.x1;
    }
    // Vertical ring: fixed X line, check Y range [y0, y1].
    const { x, y0, y1 } = line;
    const dx = p2.x - p1.x;
    if (Math.abs(dx) < 0.000001) return false;
    const t = (x - p1.x) / dx;
    if (t < 0 || t > 1) return false;
    const y = p1.y + t * (p2.y - p1.y);
    return y >= y0 && y <= y1;
}

function isPointInsideRect(point, rect, epsilon = 0.0001) {
    if (
        !point ||
        !rect ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
    ) {
        return false;
    }

    return pointToRectDistance(point, rect) <= Math.max(epsilon, 0);
}

function isPointStrictlyInsideRect(point, rect, epsilon = 0.0001) {
    if (
        !point ||
        !rect ||
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y)
    ) {
        return false;
    }

    const halfWidth = Math.max(rect.halfWidth ?? 0, 0.0001);
    const halfHeight = Math.max(rect.halfHeight ?? 0, 0.0001);
    const angle = rect.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localX = ((point.x - rect.centerX) * cos) + ((point.y - rect.centerY) * sin);
    const localY = (-(point.x - rect.centerX) * sin) + ((point.y - rect.centerY) * cos);

    return Math.abs(localX) < halfWidth - epsilon && Math.abs(localY) < halfHeight - epsilon;
}

function getRectAxis(angle = 0) {
    return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
}

function getRectPerpendicularAxis(angle = 0) {
    return new THREE.Vector2(-Math.sin(angle), Math.cos(angle));
}

function projectRectHalfExtentOnAxis(rect, axis) {
    const rectAngle = rect?.angle ?? 0;
    const rectAxisX = getRectAxis(rectAngle);
    const rectAxisY = getRectPerpendicularAxis(rectAngle);
    const halfWidth = Math.max(rect?.halfWidth ?? 0, 0.0001);
    const halfHeight = Math.max(rect?.halfHeight ?? 0, 0.0001);
    return (
        Math.abs(axis.dot(rectAxisX)) * halfWidth +
        Math.abs(axis.dot(rectAxisY)) * halfHeight
    );
}

function rectIntersectsRect(a, b) {
    if (!a || !b) {
        return false;
    }

    const centerDelta = new THREE.Vector2(
        (b.centerX ?? 0) - (a.centerX ?? 0),
        (b.centerY ?? 0) - (a.centerY ?? 0)
    );
    const axes = [
        getRectAxis(a.angle ?? 0),
        getRectPerpendicularAxis(a.angle ?? 0),
        getRectAxis(b.angle ?? 0),
        getRectPerpendicularAxis(b.angle ?? 0)
    ];

    for (const axis of axes) {
        const centerDistance = Math.abs(centerDelta.dot(axis));
        const aProjection = projectRectHalfExtentOnAxis(a, axis);
        const bProjection = projectRectHalfExtentOnAxis(b, axis);
        if (centerDistance > aProjection + bProjection) {
            return false;
        }
    }

    return true;
}

function pointInPolygon(point, polygon = []) {
    if (!point || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
    }

    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
        const current = polygon[index];
        const previous = polygon[previousIndex];
        const intersects = ((current.y > point.y) !== (previous.y > point.y)) &&
            (point.x < (((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y)) + current.x);
        if (intersects) {
            inside = !inside;
        }
    }

    return inside;
}

// Minimum distance from point to the boundary of a convex/concave polygon.
// Returns 0 (not negative) when the point is inside.
function pointToPolygonDistance(point, polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return Number.POSITIVE_INFINITY;
    if (pointInPolygon(point, polygon)) return 0;
    let minDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const abx = b.x - a.x, aby = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((point.x - a.x) * abx + (point.y - a.y) * aby) / (abx * abx + aby * aby + 1e-12)));
        const dx = point.x - (a.x + t * abx);
        const dy = point.y - (a.y + t * aby);
        minDist = Math.min(minDist, Math.hypot(dx, dy));
    }
    return minDist;
}

// Returns the collision parts for a level object.
// Each part is an array of {x,y} vertices forming a convex polygon.
// For a simple (non-compound) body this is a single-element array.
// Returns null when no polygon collision is configured.
function getObjectCollisionParts(levelObject) {
    if (!levelObject?.configuredCollisionPolygon) return null;
    const body = levelObject.matterBody;
    if (body) {
        const bodyParts = (body.parts?.length > 1) ? body.parts.slice(1) : [body];
        const result = [];
        for (const part of bodyParts) {
            const pts = (part.vertices ?? []).map((v) => ({ x: v.x, y: v.y }));
            if (pts.length >= 3) result.push(pts);
        }
        return result.length ? result : null;
    }
    const worldPts = levelObject.getCollisionPolygonWorldPoints?.();
    return worldPts?.length >= 3 ? [worldPts.map((p) => ({ x: p.x, y: p.y }))] : null;
}

// Flat list of all vertices across all parts — used only for AABB computation.
function getObjectCollisionPolygon(levelObject) {
    const parts = getObjectCollisionParts(levelObject);
    if (!parts) return null;
    const points = [];
    for (const part of parts) for (const v of part) points.push(v);
    return points.length >= 3 ? points : null;
}

// Returns the cached AABB from the Matter body plugin, or computes it from polygon points.
function getObjectAABB(levelObject, polygon) {
    const cached = levelObject.matterBody?.plugin?.aabb;
    if (cached) {
        return {
            centerX: (cached.minX + cached.maxX) * 0.5,
            centerY: (cached.minY + cached.maxY) * 0.5,
            halfWidth: (cached.maxX - cached.minX) * 0.5,
            halfHeight: (cached.maxY - cached.minY) * 0.5,
            angle: 0
        };
    }
    // Fallback: compute from polygon points (used before the body is created).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of polygon) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return {
        centerX: (minX + maxX) * 0.5,
        centerY: (minY + maxY) * 0.5,
        halfWidth: (maxX - minX) * 0.5,
        halfHeight: (maxY - minY) * 0.5,
        angle: 0
    };
}

// Unified point-to-object distance. Polygon parts give exact distance; no AABB shortcut.
function pointToObjectDistance(point, levelObject) {
    const parts = getObjectCollisionParts(levelObject);
    if (parts) {
        let minDist = Number.POSITIVE_INFINITY;
        for (const part of parts) minDist = Math.min(minDist, pointToPolygonDistance(point, part));
        return minDist;
    }
    const rect = levelObject?.getWorldCollisionRect?.() ?? levelObject?.getExplosionDamageRect?.();
    return rect ? pointToRectDistance(point, rect) : Number.POSITIVE_INFINITY;
}

// Unified point-inside check. AABB broad-phase, then per-part polygon test.
function isPointInsideObject(point, levelObject, epsilon = 0.0001) {
    const parts = getObjectCollisionParts(levelObject);
    if (parts) {
        const aabb = getObjectAABB(levelObject, parts[0]);
        if (!isPointInsideRect(point, aabb, epsilon)) return false;
        return parts.some((part) => pointInPolygon(point, part));
    }
    const rect = levelObject?.getWorldCollisionRect?.() ?? levelObject?.getExplosionDamageRect?.();
    return rect ? isPointInsideRect(point, rect, epsilon) : false;
}

// Unified rect-intersects-object. AABB broad-phase, then per-part polygon test.
function rectIntersectsObject(flameRect, levelObject) {
    const parts = getObjectCollisionParts(levelObject);
    if (parts) {
        const aabb = getObjectAABB(levelObject, parts[0]);
        if (!rectIntersectsRect(flameRect, aabb)) return false;
        const corners = getRectCorners(flameRect);
        for (const part of parts) {
            if (corners.some((c) => pointInPolygon(c, part))) return true;
            if (part.some((p) => isPointInsideRect(p, flameRect))) return true;
        }
        return false;
    }
    const rect = levelObject?.getWorldCollisionRect?.() ?? levelObject?.getExplosionDamageRect?.();
    return rect ? rectIntersectsRect(flameRect, rect) : false;
}

function getRectCorners(rect) {
    if (!rect) {
        return [];
    }

    const halfWidth = Math.max(rect.halfWidth ?? 0, 0.0001);
    const halfHeight = Math.max(rect.halfHeight ?? 0, 0.0001);
    const angle = rect.angle ?? 0;
    const axisX = getRectAxis(angle);
    const axisY = getRectPerpendicularAxis(angle);
    const center = new THREE.Vector2(rect.centerX ?? 0, rect.centerY ?? 0);

    return [
        center.clone().addScaledVector(axisX, -halfWidth).addScaledVector(axisY, -halfHeight),
        center.clone().addScaledVector(axisX, halfWidth).addScaledVector(axisY, -halfHeight),
        center.clone().addScaledVector(axisX, halfWidth).addScaledVector(axisY, halfHeight),
        center.clone().addScaledVector(axisX, -halfWidth).addScaledVector(axisY, halfHeight)
    ];
}

function getRectBottomSamples(rect) {
    if (!rect) {
        return [];
    }

    const halfWidth = Math.max(rect.halfWidth ?? 0, 0.0001);
    const halfHeight = Math.max(rect.halfHeight ?? 0, 0.0001);
    const angle = rect.angle ?? 0;
    const axisX = getRectAxis(angle);
    const axisY = getRectPerpendicularAxis(angle);
    const center = new THREE.Vector2(rect.centerX ?? 0, rect.centerY ?? 0);

    return [-halfWidth, 0, halfWidth].map((localX) => center.clone()
        .addScaledVector(axisX, localX)
        .addScaledVector(axisY, -halfHeight));
}

function getPolygonEdges(polygon = []) {
    const edges = [];
    if (!Array.isArray(polygon) || polygon.length < 2) {
        return edges;
    }

    for (let index = 0; index < polygon.length; index += 1) {
        edges.push([
            polygon[index],
            polygon[(index + 1) % polygon.length]
        ]);
    }

    return edges;
}

function cross2d(a, b, c) {
    return ((b.x - a.x) * (c.y - a.y)) - ((b.y - a.y) * (c.x - a.x));
}

function onSegment(a, b, point, epsilon = 0.0001) {
    return (
        point.x >= Math.min(a.x, b.x) - epsilon &&
        point.x <= Math.max(a.x, b.x) + epsilon &&
        point.y >= Math.min(a.y, b.y) - epsilon &&
        point.y <= Math.max(a.y, b.y) + epsilon
    );
}

function segmentsIntersect(a1, a2, b1, b2, epsilon = 0.0001) {
    const d1 = cross2d(a1, a2, b1);
    const d2 = cross2d(a1, a2, b2);
    const d3 = cross2d(b1, b2, a1);
    const d4 = cross2d(b1, b2, a2);

    if (((d1 > epsilon && d2 < -epsilon) || (d1 < -epsilon && d2 > epsilon)) &&
        ((d3 > epsilon && d4 < -epsilon) || (d3 < -epsilon && d4 > epsilon))) {
        return true;
    }

    if (Math.abs(d1) <= epsilon && onSegment(a1, a2, b1, epsilon)) return true;
    if (Math.abs(d2) <= epsilon && onSegment(a1, a2, b2, epsilon)) return true;
    if (Math.abs(d3) <= epsilon && onSegment(b1, b2, a1, epsilon)) return true;
    if (Math.abs(d4) <= epsilon && onSegment(b1, b2, a2, epsilon)) return true;

    return false;
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

function doesRectFitOutsidePolygons(rect, collisionPolygons = []) {
    if (!rect) {
        return false;
    }

    const rectCorners = getRectCorners(rect);
    const rectEdges = getPolygonEdges(rectCorners);

    for (const polygon of collisionPolygons) {
        if (!Array.isArray(polygon) || polygon.length < 3) {
            continue;
        }

        if (rectCorners.some((corner) => pointInPolygon(corner, polygon))) {
            return false;
        }

        if (polygon.some((point) => isPointStrictlyInsideRect(point, rect))) {
            return false;
        }

        const polygonEdges = getPolygonEdges(polygon);
        for (const [rectStart, rectEnd] of rectEdges) {
            for (const [polyStart, polyEnd] of polygonEdges) {
                // Resting on the surface should be valid. Only reject true crossing
                // intersections that imply penetration, not simple boundary contact.
                if (segmentsCrossStrictly(rectStart, rectEnd, polyStart, polyEnd)) {
                    return false;
                }
            }
        }
    }

    return true;
}

export const LEVEL_OBJECT_PRELOAD_ASSET_URLS = Object.values(CONFIG.LEVEL_OBJECT_TYPES || {})
    .flatMap((entry) => ([
        entry?.modelPath,
        entry?.texturePath,
        entry?.tankCombat?.bulletTexturePath,
        entry?.missileModelPath,
        entry?.missile?.modelPath,
        entry?.missiles?.modelPath,
        entry?.missileTexturePath,
        entry?.missile?.texturePath,
        entry?.missiles?.texturePath
    ]))
    .concat(CONFIG.LEVEL_OBJECTS?.explosionTextureUrl)
    .filter(Boolean);

export class LevelObjectManager {
    static get DEFAULT_OBJECT_GRID_CELL_SIZE() { return 16; }

    constructor(scene, level, options = {}) {
        this.scene = scene;
        this.level = level;
        this.levelUrl = options.levelUrl || null;
        this.loadingManager = options.loadingManager;
        this.audioManager = options.audioManager || null;
        this.onRingPassed = typeof options.onRingPassed === 'function' ? options.onRingPassed : null;
        this.onObjectKilled = typeof options.onObjectKilled === 'function' ? options.onObjectKilled : null;
        this.onCollectiblePickup = typeof options.onCollectiblePickup === 'function' ? options.onCollectiblePickup : null;
        this.factory = new LevelObjectFactory(scene, {
            loadingManager: options.loadingManager,
            audioManager: this.audioManager,
            missionManager: options.missionManager || null
        });
        this.objects = [];
        this.objectsById = new Map();
        this.activeEffects = [];
        this.fireballHitRegistry = new Map();
        this._activeFireballIds = new Set();
        this._scratchFireballPoint = { x: 0, y: 0 };
        this.objectSpatialGrid = new SpatialGrid(LevelObjectManager.DEFAULT_OBJECT_GRID_CELL_SIZE);
        this.dynoTarget = null;
        this.projectileRenderBand = null;
        this.respawnQueue = [];
        this.levelSpawnTemplates = [];
        this.cameraViewRect = null;
        this.lastRingPassDynoPoint = null;
        this.chopperLoopActive = false;
        this.chopperLoopVolume = 0;
        this.planeLoopActive = false;
        this.planeLoopVolume = 0;
        this.loadPlacementDebug = null;
        this.physicsWorld = new PhysicsWorld(scene, {
            audioManager: this.audioManager,
            onWaterSplash: (position, splashOptions = {}) => this.spawnWaterSplashEffect(position, splashOptions)
        });
        this.physicsWorld.init();
    }

    spawnWaterSplashEffect(position, options = {}) {
        if (!position) {
            return null;
        }

        const effect = new WaterSplashEffect(this.scene, options);
        effect.setWorldPosition({
            x: position.x,
            y: position.y,
            z: Number.isFinite(position.z) ? position.z : 3
        });
        effect.start();
        this.activeEffects.push(effect);
        return effect;
    }

    rebuildObjectSpatialGrid() {
        this.objectSpatialGrid.clear();
        for (const object of this.objects) {
            if (!object || object.isDestroyed || object.markedForRemoval) {
                continue;
            }

            const rect = object.getWorldCollisionRect?.() || object.getExplosionDamageRect?.();
            if (!rect) {
                continue;
            }

            this.objectSpatialGrid.insertAabb(
                object,
                rect.centerX - rect.halfWidth,
                rect.centerY - rect.halfHeight,
                rect.centerX + rect.halfWidth,
                rect.centerY + rect.halfHeight
            );
        }
    }

    queryObjectSpatialCandidates(minX, minY, maxX, maxY) {
        const out = this._scratchSpatialCandidates || (this._scratchSpatialCandidates = []);
        out.length = 0;
        this.objectSpatialGrid.queryAabb(minX, minY, maxX, maxY, out);
        return out;
    }

    queryNearbyObjects(position, radius) {
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
            const out = this._scratchNearbyCandidates || (this._scratchNearbyCandidates = []);
            out.length = 0;
            return out;
        }

        return this.queryObjectSpatialCandidates(
            position.x - radius,
            position.y - radius,
            position.x + radius,
            position.y + radius
        );
    }

    disposeLoadPlacementDebug() {
        this.loadPlacementDebug?.traverse((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                child.material.forEach((material) => material?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        });
        this.loadPlacementDebug?.removeFromParent?.();
        this.loadPlacementDebug = null;
    }

    ensureLoadPlacementDebug() {
        if (!CONFIG.LEVEL_OBJECTS?.debugRenderLoadPlacement) {
            return null;
        }

        if (!this.loadPlacementDebug) {
            this.loadPlacementDebug = new THREE.Group();
            this.loadPlacementDebug.name = 'LevelObjectLoadPlacementDebug';
            this.scene.add(this.loadPlacementDebug);
        }

        return this.loadPlacementDebug;
    }

    addLoadPlacementDebugRay(start, end, color = 0xffaa33, z = 60) {
        const group = this.ensureLoadPlacementDebug();
        if (!group || !start || !end) {
            return;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            start.x, start.y, z,
            end.x, end.y, z
        ], 3));
        const material = new THREE.LineBasicMaterial({
            color,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 1000004;
        line.frustumCulled = false;
        group.add(line);
    }

    addLoadPlacementDebugPoint(point, color = 0xffffff, z = 60.1, size = 0.22) {
        const group = this.ensureLoadPlacementDebug();
        if (!group || !point) {
            return;
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute([
            point.x, point.y, z
        ], 3));
        const material = new THREE.PointsMaterial({
            color,
            size,
            sizeAttenuation: false,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const points = new THREE.Points(geometry, material);
        points.renderOrder = 1000005;
        points.frustumCulled = false;
        group.add(points);
    }

    addLoadPlacementDebugRect(rect, color = 0x00ffaa, z = 60.05) {
        const group = this.ensureLoadPlacementDebug();
        if (!group || !rect) {
            return;
        }

        const corners = getRectCorners(rect);
        if (corners.length < 4) {
            return;
        }

        const positions = [];
        corners.forEach((corner) => positions.push(corner.x, corner.y, z));
        positions.push(corners[0].x, corners[0].y, z);

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({
            color,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const line = new THREE.Line(geometry, material);
        line.renderOrder = 1000004;
        line.frustumCulled = false;
        group.add(line);
    }

    getLevelObjectPlacementSearchDistance() {
        const tileWorldSize = Math.min(
            Math.max(this.level?.tileWidth ?? 1, 0.001),
            Math.max(this.level?.tileHeight ?? 1, 0.001)
        );
        return {
            tileWorldSize,
            maxDistance: tileWorldSize * 4
        };
    }

    findFirstOutsidePolygonHitDown(startPoint, collisionPolygons, maxDistance) {
        if (!startPoint || !this.level || maxDistance <= 0) {
            return null;
        }

        const direction = { x: 0, y: -1 };
        const epsilon = 0.01;
        const rayStart = { x: startPoint.x, y: startPoint.y };
        let remainingDistance = maxDistance;
        let guard = 0;

        this.addLoadPlacementDebugRay(
            rayStart,
            { x: rayStart.x, y: rayStart.y - maxDistance },
            0xffaa33
        );

        while (remainingDistance > 0.0001 && guard < collisionPolygons.length + 8) {
            guard += 1;

            const containingPolygon = collisionPolygons.find((polygon) => pointInPolygon(rayStart, polygon)) || null;
            if (containingPolygon) {
                // Objects can be authored inside terrain. Those inside-facing hits are ignored so
                // the search only stops once it reaches an exterior surface below the object.
                const exitHit = this.level.findRayExitPointFromPolygon(
                    rayStart,
                    direction,
                    containingPolygon,
                    remainingDistance
                );
                if (!exitHit) {
                    return null;
                }

                rayStart.y = exitHit.point.y - epsilon;
                remainingDistance -= exitHit.distance + epsilon;
                continue;
            }

            const hit = this.level.findNearestRayTerrainHit(
                rayStart,
                direction,
                remainingDistance,
                {
                    includeBottomEdges: false,
                    edgeFilter: (edge) => edge.type === 'top'
                }
            );
            if (!hit) {
                return null;
            }

            return hit;
        }

        return null;
    }

    findGroundPlacementForObject(levelObject, collisionPolygons, maxDistance) {
        const originalPosition = levelObject?.getWorldPosition?.(new THREE.Vector3()) || levelObject?.container?.position;
        const originalRect = levelObject?.getWorldCollisionRect?.() || levelObject?.getExplosionDamageRect?.();
        if (!originalPosition || !originalRect) {
            return null;
        }

        const { tileWorldSize } = this.getLevelObjectPlacementSearchDistance();
        const probeLift = Math.max(tileWorldSize * 0.5, 0.05);
        const bottomSamples = getRectBottomSamples(originalRect);
        let bestPlacement = null;

        // The editor/world origin for many models is not the bottom of the collision rect.
        // Cast from the authored rect bottom instead; otherwise an origin placed exactly on
        // terrain can be treated as starting inside the polygon and the nearby top edge is ignored.
        for (const sample of bottomSamples) {
            const hit = this.findFirstOutsidePolygonHitDown(
                { x: sample.x, y: sample.y + probeLift },
                collisionPolygons,
                maxDistance + probeLift
            );
            if (!hit) {
                continue;
            }

            const deltaY = hit.point.y - sample.y;
            // Initial load placement is a downward snap. Allow only tiny upward correction for
            // authored points that are numerically on the terrain boundary.
            if (deltaY > 0.05) {
                continue;
            }

            if (!bestPlacement || deltaY > bestPlacement.deltaY) {
                bestPlacement = {
                    hit,
                    deltaY
                };
            }
        }

        if (!bestPlacement) {
            return null;
        }

        return {
            hit: bestPlacement.hit,
            x: originalPosition.x,
            y: originalPosition.y + bestPlacement.deltaY,
            z: originalPosition.z
        };
    }

    placeLevelObjectsOnPolygons(levelObjects = [], collisionPolygons = []) {
        const { maxDistance } = this.getLevelObjectPlacementSearchDistance();

        for (const levelObject of levelObjects) {
            if (!levelObject?.snapToGroundOnLoad) {
                continue;
            }

            const originalPosition = levelObject.getWorldPosition?.(new THREE.Vector3());
            const placement = this.findGroundPlacementForObject(levelObject, collisionPolygons, maxDistance);
            if (!placement) {
                console.warn(
                    `Could not place LevelObject on polygon within 4 tiles: ${levelObject.getDebugLabel?.() || levelObject.type || levelObject.id}`
                );
                this.addLoadPlacementDebugPoint(originalPosition, 0xff3355);
                continue;
            }

            levelObject.setWorldPosition(placement.x, placement.y, placement.z);
            const placedRect = levelObject.getWorldCollisionRect?.() || levelObject.getExplosionDamageRect?.();
            const rectFits = doesRectFitOutsidePolygons(placedRect, collisionPolygons);

            this.addLoadPlacementDebugPoint(placement.hit.point, rectFits ? 0x00ff88 : 0xff3355);
            this.addLoadPlacementDebugRect(placedRect, rectFits ? 0x00ffaa : 0xff3355);

            // rectFits being false is not fatal — physics resolves minor overlaps at runtime.
        }
    }

    getTemplateSignature(template) {
        if (!template?.type || template?.markerId == null) {
            return null;
        }

        return `${template.type}:${template.markerId}`;
    }

    static getSupportedTypeForObjectMarker(object) {
        return resolveObjectTypeFromMarker(object);
    }

    static collectModelUrlsForLevel(level) {
        const urls = new Set();

        for (const layer of level?.objectLayers || []) {
            if (!isSpawnLayer(layer)) {
                continue;
            }

            for (const object of layer.objects || []) {
                const type = LevelObjectManager.getSupportedTypeForObjectMarker(object);
                const objectConfig = CONFIG.LEVEL_OBJECT_TYPES?.[type];
                const modelPath = objectConfig?.modelPath;
                const texturePath = objectConfig?.texturePath;
                const bulletTexturePath = objectConfig?.tankCombat?.bulletTexturePath;
                const missileModelPath =
                    objectConfig?.missileModelPath ||
                    objectConfig?.missile?.modelPath ||
                    objectConfig?.missiles?.modelPath;
                const missileTexturePath =
                    objectConfig?.missileTexturePath ||
                    objectConfig?.missile?.texturePath ||
                    objectConfig?.missiles?.texturePath;
                if (modelPath) {
                    urls.add(modelPath);
                }
                if (texturePath) {
                    urls.add(texturePath);
                }
                if (bulletTexturePath) {
                    urls.add(bulletTexturePath);
                }
                if (missileModelPath) {
                    urls.add(missileModelPath);
                }
                if (missileTexturePath) {
                    urls.add(missileTexturePath);
                }
            }
        }

        if (CONFIG.LEVEL_OBJECTS?.explosionTextureUrl) {
            urls.add(CONFIG.LEVEL_OBJECTS.explosionTextureUrl);
        }

        return urls;
    }

    shouldManageObjectMarker(object) {
        return Boolean(LevelObjectManager.getSupportedTypeForObjectMarker(object));
    }

    async loadFromLevel() {
        this.levelSpawnTemplates = [];
        this.disposeLoadPlacementDebug();
        const loadedObjects = [];

        for (const layer of this.level.objectLayers || []) {
            if (!isSpawnLayer(layer)) {
                continue;
            }

            for (const object of layer.objects || []) {
                const type = LevelObjectManager.getSupportedTypeForObjectMarker(object);
                if (!type) {
                    continue;
                }

                const levelObject = this.createLevelObject(type, object);
                if (!levelObject) {
                    continue;
                }

                if (levelObject.respawnTemplate) {
                    this.levelSpawnTemplates.push({
                        type: levelObject.respawnTemplate.type,
                        markerId: levelObject.respawnTemplate.markerId,
                        spawnData: { ...levelObject.respawnTemplate.spawnData },
                        propertyOverrides: { ...(levelObject.respawnTemplate.propertyOverrides || {}) }
                    });
                }

/*                
                console.log(
                    '[LevelObjectManager] Spawning object:',
                    type,
                    levelObject.spawnData?.x ?? 0,
                    levelObject.spawnData?.y ?? 0
                );
*/
                try {
                    await levelObject.load();
                    loadedObjects.push(levelObject);
                } catch (err) {
                    const detail = err instanceof Error
                        ? err.message
                        : (err?.message || err?.url || err?.filename || String(err));
                    const stack = err?.stack ? `\n${err.stack}` : '';
                    console.error(`[LevelObjectManager] Failed to load object "${type}" (id=${object.id}): ${detail}${stack}`);
                }
            }
        }

        const prebuiltConvexPieces = this.level._prebuiltConvexPieces || null;
        let collisionPolygons = this.level.getCollisionPolygons?.() || [];

        if (CONFIG.debugFlatFloorPolygon) {
            const ox = this.level.worldOriginX ?? 0;
            const oy = this.level.worldOriginY ?? 0;
            const tw = this.level.tileWidth ?? 2;
            const th = this.level.tileHeight ?? 2;
            const floorTop    = oy + (this.level.height - 10) * th;
            const floorBottom = oy + this.level.height * th;
            const floorLeft   = ox;
            const floorRight  = ox + this.level.width * tw;
            collisionPolygons = [[
                { x: floorLeft,  y: floorTop    },
                { x: floorRight, y: floorTop    },
                { x: floorRight, y: floorBottom },
                { x: floorLeft,  y: floorBottom },
            ]];
            // Replace edge groups with a single group for the flat floor so all collision checks use it.
            const topEdge = { start: { x: floorLeft, y: floorTop }, end: { x: floorRight, y: floorTop }, x1: floorLeft, y1: floorTop, x2: floorRight, y2: floorTop, type: 'top', takeoffAllowed: true };
            const cx = (floorLeft + floorRight) / 2, cy = (floorTop + floorBottom) / 2;
            const r = Math.hypot(floorRight - cx, floorBottom - cy);
            this.level._collisionEdgeGroups = [{ cx, cy, r, edges: [topEdge] }];
        }

        this.placeLevelObjectsOnPolygons(loadedObjects, collisionPolygons);
        this.physicsWorld.setCollisionPolygons(collisionPolygons);
        this.physicsWorld.setWaterPolygons(this.level?.waterPolygons ?? []);

        if (!CONFIG.disablePhysics) {
            const terrainBodies = prebuiltConvexPieces || collisionPolygons;
            await this.physicsWorld.addStaticTerrainFromLevelPolygons(terrainBodies);
        }

        for (const levelObject of loadedObjects) {
            this.add(levelObject);
            await new Promise((resolve) => setTimeout(resolve, 0));
        }
    }

    createLevelObject(type, object) {
        let props = object.properties || {};
        if (!Number.isFinite(props.facingDirection) && !Number.isFinite(props.walkDirection)) {
            props = { ...props, facingDirection: object.flip?.horizontal ? -1 : 1 };
        }
        const spawnX = Number.isFinite(object.spawnWorldX) ? object.spawnWorldX : object.worldX;
        const spawnY = Number.isFinite(props.spawnY)
            ? props.spawnY
            : (Number.isFinite(object.spawnWorldY) ? object.spawnWorldY : object.worldY);
        const spawnZ = Number.isFinite(props.spawnZ) ? props.spawnZ : 0;
        const levelObject = this.factory.createLevelObject(type, {
            id: object.id ?? `${type}-${this.objects.length}`,
            spawnData: {
                x: spawnX,
                y: spawnY,
                z: spawnZ,
                name: object.name,
                markerType: object.type,
                visible: object.visible !== false
            },
            propertyOverrides: props,
            audioManager: this.audioManager
        });

        if (!levelObject) {
            return null;
        }
        levelObject.setWorldPosition(spawnX, spawnY, levelObject.groundLayerZ ?? spawnZ);
        levelObject.respawnTemplate = {
            type,
            markerId: object.id ?? `${type}-${this.objects.length}`,
            spawnData: {
                x: spawnX,
                y: spawnY,
                z: spawnZ,
                name: object.name,
                markerType: object.type,
                visible: object.visible !== false
            },
            propertyOverrides: { ...props }
        };
        return levelObject;
    }

    add(levelObject) {
        levelObject?.setExplosionDamageHandler?.((source, worldCenter) => {
            this.applyExplosionDamage(source, worldCenter);
        });
        levelObject?.setProjectileRenderBand?.(this.projectileRenderBand);
        if (levelObject instanceof CollectibleObject && typeof this.onCollectiblePickup === 'function') {
            levelObject.onCollect = this.onCollectiblePickup;
        }
        this.objects.push(levelObject);
        this.objectsById.set(levelObject.id, levelObject);
        if (levelObject && levelObject.physicsWorld === null) {
            levelObject.physicsWorld = this.physicsWorld;
        }
        if (levelObject) {
            levelObject.levelObjectManager = this;
        }
        this.physicsWorld.addLevelObject(levelObject);
        if (CONFIG.disableLevelObjectRendering && levelObject.container) {
            levelObject.container.visible = false;
        }
    }

    remove(levelObject) {
        if (levelObject?.isDestroyed && this.onObjectKilled) {
            this.onObjectKilled(levelObject);
        }
        this.scheduleRespawn(levelObject);
        this.physicsWorld.removeLevelObject(levelObject);

        const index = this.objects.indexOf(levelObject);
        if (index >= 0) {
            this.objects.splice(index, 1);
        }

        this.objectsById.delete(levelObject.id);
        levelObject?.setExplosionDamageHandler?.(null);
        if (levelObject?.levelObjectManager === this) {
            levelObject.levelObjectManager = null;
        }
        levelObject.dispose?.();
    }

    isObjectOffScreen(object, margin = 10) {
        const rect = this.cameraViewRect;
        if (!rect) return false;
        const pos = object.container?.position;
        if (!pos) return false;
        return (
            pos.x < rect.left - margin ||
            pos.x > rect.right + margin ||
            pos.y < rect.bottom - margin ||
            pos.y > rect.top + margin
        );
    }

    setCameraViewRect(rect) {
        if (!rect) {
            this.cameraViewRect = null;
            return;
        }

        const dst = this.cameraViewRect || (this.cameraViewRect = { left: 0, right: 0, top: 0, bottom: 0 });
        dst.left = Number.isFinite(rect.left) ? rect.left : 0;
        dst.right = Number.isFinite(rect.right) ? rect.right : 0;
        dst.top = Number.isFinite(rect.top) ? rect.top : 0;
        dst.bottom = Number.isFinite(rect.bottom) ? rect.bottom : 0;
    }

    getRespawnConfigForObject(levelObject) {
        const config = levelObject?.config || {};
        const respawnEnabled = config.respawn === true;
        const respawnDelay = Number.isFinite(config.respawnDelay) ? Math.max(0, config.respawnDelay) : null;
        return {
            enabled: respawnEnabled && respawnDelay != null,
            delay: respawnDelay ?? 0
        };
    }

    scheduleRespawn(levelObject) {
        const respawnConfig = this.getRespawnConfigForObject(levelObject);
        if (!respawnConfig.enabled) {
            return;
        }

        const template = levelObject?.respawnTemplate;
        if (!template?.type || !template?.spawnData) {
            return;
        }

        const signature = `${template.type}:${template.markerId}`;
        if (this.respawnQueue.some((entry) => entry.signature === signature)) {
            return;
        }

        this.respawnQueue.push({
            signature,
            elapsed: 0,
            delay: respawnConfig.delay,
            loading: false,
            template: {
                type: template.type,
                markerId: template.markerId,
                spawnData: { ...template.spawnData },
                propertyOverrides: { ...(template.propertyOverrides || {}) }
            }
        });
    }

    isPointVisibleInCameraView(x, y) {
        const rect = this.cameraViewRect;
        if (!rect) {
            return false;
        }

        return x >= rect.left && x <= rect.right && y >= rect.bottom && y <= rect.top;
    }

    async spawnRespawnEntry(entry) {
        if (!entry || entry.loading) {
            return;
        }

        entry.loading = true;
        try {
            const levelObject = this.factory.createLevelObject(entry.template.type, {
                id: entry.template.markerId,
                spawnData: { ...entry.template.spawnData },
                propertyOverrides: { ...(entry.template.propertyOverrides || {}) }
            });
            levelObject?.setWorldPosition(
                entry.template.spawnData.x,
                entry.template.spawnData.y,
                levelObject.groundLayerZ ?? entry.template.spawnData.z
            );
            levelObject.respawnTemplate = {
                type: entry.template.type,
                markerId: entry.template.markerId,
                spawnData: { ...entry.template.spawnData },
                propertyOverrides: { ...(entry.template.propertyOverrides || {}) }
            };

            await levelObject.load();

            if (levelObject.snapToGroundOnLoad) {
                const collisionPolygons = this.level?.getCollisionPolygons?.() || [];
                this.placeLevelObjectsOnPolygons([levelObject], collisionPolygons);
            }

            this.add(levelObject);

            const index = this.respawnQueue.indexOf(entry);
            if (index >= 0) {
                this.respawnQueue.splice(index, 1);
            }
        } catch (error) {
            console.warn('[LevelObjectManager] Failed to respawn object:', entry?.signature, error);
            entry.loading = false;
        }
    }

    countAvailableObjectsByType(objectType) {
        return this.objects.filter((object) => (
            object?.type === objectType &&
            !object.isDestroyed &&
            !object.markedForRemoval
        )).length;
    }

    async spawnTemplateImmediately(template) {
        const signature = this.getTemplateSignature(template);
        if (!signature) {
            return false;
        }

        const existingEntry = this.respawnQueue.find((entry) => entry.signature === signature);
        if (existingEntry) {
            await this.spawnRespawnEntry(existingEntry);
            return true;
        }

        const entry = {
            signature,
            elapsed: 0,
            delay: 0,
            loading: false,
            template: {
                type: template.type,
                markerId: template.markerId,
                spawnData: { ...template.spawnData },
                propertyOverrides: { ...(template.propertyOverrides || {}) }
            }
        };

        await this.spawnRespawnEntry(entry);
        return true;
    }

    async ensureObjectTypeCount(objectType, requiredCount) {
        const normalizedRequiredCount = Math.max(0, Math.floor(Number.isFinite(requiredCount) ? requiredCount : 0));
        if (!objectType || normalizedRequiredCount <= 0) {
            return 0;
        }

        let availableCount = this.countAvailableObjectsByType(objectType);
        if (availableCount >= normalizedRequiredCount) {
            return availableCount;
        }

        const activeSignatures = new Set(
            this.objects
                .filter((object) => object?.type === objectType && object?.respawnTemplate)
                .map((object) => this.getTemplateSignature(object.respawnTemplate))
                .filter(Boolean)
        );

        const queuedEntries = this.respawnQueue
            .filter((entry) => entry?.template?.type === objectType)
            .slice()
            .sort((a, b) => (a.elapsed || 0) - (b.elapsed || 0));

        for (const entry of queuedEntries) {
            if (availableCount >= normalizedRequiredCount) {
                break;
            }

            await this.spawnRespawnEntry(entry);
            activeSignatures.add(entry.signature);
            availableCount = this.countAvailableObjectsByType(objectType);
        }

        if (availableCount >= normalizedRequiredCount) {
            return availableCount;
        }

        for (const template of this.levelSpawnTemplates) {
            if (template?.type !== objectType) {
                continue;
            }

            const signature = this.getTemplateSignature(template);
            if (!signature || activeSignatures.has(signature)) {
                continue;
            }

            await this.spawnTemplateImmediately(template);
            activeSignatures.add(signature);
            availableCount = this.countAvailableObjectsByType(objectType);
            if (availableCount >= normalizedRequiredCount) {
                break;
            }
        }

        return availableCount;
    }

    updateRespawns(delta) {
        if (!Number.isFinite(delta) || delta <= 0 || !this.respawnQueue.length) {
            return;
        }

        for (const entry of this.respawnQueue) {
            if (entry.loading) {
                continue;
            }

            entry.elapsed += delta;
            if (entry.elapsed < entry.delay) {
                continue;
            }

            const spawnX = entry.template.spawnData.x;
            const spawnY = entry.template.spawnData.y;
            if (this.isPointVisibleInCameraView(spawnX, spawnY)) {
                continue;
            }

            this.spawnRespawnEntry(entry);
        }
    }

    updateRingPassProgress() {
        const dynoCircle = this.dynoTarget?.getWorldCollisionCircle?.();
        if (
            !dynoCircle ||
            !Number.isFinite(dynoCircle.centerX) ||
            !Number.isFinite(dynoCircle.centerY)
        ) {
            this.lastRingPassDynoPoint = null;
            return;
        }

        const currentPoint = {
            x: dynoCircle.centerX,
            y: dynoCircle.centerY
        };
        const previousPoint = this.lastRingPassDynoPoint || currentPoint;

        const now = performance.now();
        for (const object of this.objects) {
            if (
                (object?.type !== 'ring' && object?.type !== 'ringhorizontal') ||
                object.isDestroyed ||
                object.markedForRemoval ||
                !object.container?.visible
            ) {
                continue;
            }
            // Cooldown prevents the same pass triggering multiple times in consecutive frames.
            if (object._ringPassCooldownUntil && now < object._ringPassCooldownUntil) {
                continue;
            }

            const ringPosition = object.container?.position;
            if (!ringPosition) {
                continue;
            }

            const quickCheckRadius = Math.max(
                Number.isFinite(object.config?.passCheckRadius) ? object.config.passCheckRadius : 18,
                0
            );
            const distanceSq = pointToSegmentDistanceSq(
                { x: ringPosition.x, y: ringPosition.y },
                previousPoint,
                currentPoint
            );
            if (distanceSq > quickCheckRadius * quickCheckRadius) {
                continue;
            }

            const line = object.getRingPassLine?.();
            if (!line) {
                continue;
            }

            if (!segmentCrossesRingLine(previousPoint, currentPoint, line)) {
                continue;
            }

            object._ringPassCooldownUntil = now + 1000;
            this.onRingPassed?.(object);
        }

        this.lastRingPassDynoPoint = currentPoint;
    }

    applyAreaDamage(explosionCenter, maxExplosionDistance, maxExplosionDamage, damageType = 'explosion', sourceObject = null) {
        if (maxExplosionDamage <= 0 || maxExplosionDistance <= 0 || !explosionCenter) {
            return;
        }

        for (const target of this.objects) {
            if (!target || target === sourceObject || target.isDestroyed || target.markedForRemoval) {
                continue;
            }

            const targetRect = target.getWorldCollisionRect?.() || target.getExplosionDamageRect?.();
            if (!targetRect) {
                continue;
            }

            const distanceToRect = pointToObjectDistance(explosionCenter, target);
            if (distanceToRect >= maxExplosionDistance) {
                continue;
            }

            const falloff = 1 - (distanceToRect / maxExplosionDistance);
            const damage = THREE.MathUtils.clamp(
                maxExplosionDamage * falloff,
                0,
                maxExplosionDamage
            );
            if (damage <= 0) {
                continue;
            }

            target.applyDamage(damage, damageType);
        }
    }

    applyExplosionDamage(sourceObject, explosionCenter) {
        const destructionConfig = sourceObject?.config?.destruction || {};
        const maxExplosionDamage = Number.isFinite(destructionConfig.maxExplosionDamage)
            ? Math.max(destructionConfig.maxExplosionDamage, 0)
            : 0;
        const maxExplosionDistance = Number.isFinite(destructionConfig.maxExplosionDistance)
            ? Math.max(destructionConfig.maxExplosionDistance, 0)
            : (
                Number.isFinite(destructionConfig.maxExplosionRadius)
                    ? Math.max(destructionConfig.maxExplosionRadius, 0)
                    : 0
            );
        this.applyAreaDamage(explosionCenter, maxExplosionDistance, maxExplosionDamage, 'explosion', sourceObject);
    }

    triggerDynoFaintCrashExplosion(position, faintConfig = {}) {
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
            return;
        }

        const radius = Math.max(faintConfig.faintCrashExplosionRadius ?? 8, 0);
        const damage = Math.max(faintConfig.faintCrashExplosionDamage ?? 120, 0);

        this.onFaintCrashExplosion?.(position, faintConfig);
        this.applyAreaDamage({ x: position.x, y: position.y }, radius, damage, 'faintCrashExplosion');
    }

    applyDynoFireDamage(player, delta) {
        void player;
        void delta;
    }

    applyTankBulletDamage(player) {
        if (!player || player.isDead?.() === true) {
            return;
        }

        const dynoCircle = player.getWorldCollisionCircle?.();
        if (!dynoCircle) {
            return;
        }

        for (const object of this.objects) {
            if (!object || object.isDestroyed || object.markedForRemoval) {
                continue;
            }

            const bullets = object.getActiveBulletsForCollision?.() || [];
            if (!bullets.length) {
                continue;
            }

                for (const bullet of bullets) {
                    if (!Number.isFinite(bullet?.id) || !Number.isFinite(bullet?.x) || !Number.isFinite(bullet?.y)) {
                        continue;
                }

                const bulletRadius = Math.max(
                    0,
                    Number.isFinite(bullet.radius) ? bullet.radius : 0
                );

                const distanceToDyno = pointToCircleDistance(
                    { x: bullet.x, y: bullet.y },
                    dynoCircle
                );
                if (distanceToDyno > bulletRadius) {
                    continue;
                }

                const damage = Math.max(
                    0,
                    Number.isFinite(bullet.damageToDyno) ? bullet.damageToDyno : 0
                );
                if (damage <= 0) {
                    object.consumeBulletById?.(bullet.id);
                    continue;
                }

                player.applyDamage?.(damage, 'tankBullet', {
                    projectileDirection: {
                        x: Number.isFinite(bullet.directionX) ? bullet.directionX : 0,
                        y: Number.isFinite(bullet.directionY) ? bullet.directionY : 0
                    },
                    impactPosition: {
                        x: bullet.x,
                        y: bullet.y,
                        z: Number.isFinite(bullet.z) ? bullet.z : 0
                    }
                });
                object.consumeBulletById?.(bullet.id);

                if (player.isDead?.() === true) {
                    return;
                }
            }
        }
    }

    applyDynoFireballDamage(player) {
        void player;
    }

    applyDynoContinuousFlameDamage(player, delta) {
        void player;
        void delta;
    }

    getObjectHitSoundName(object) {
        return typeof object?.config?.objectHitSound === 'string' && object.config.objectHitSound.trim()
            ? `objectHit:${object.type}`
            : 'fireHit';
    }

    playObjectHitSound(object, options = {}) {
        this.audioManager?.play?.(this.getObjectHitSoundName(object), options);
    }

    // Dyno Fury — single-shot radial inferno blast. Damages every enemy within `radius`
    // (full strength at the origin, falling off to `falloffMinFactor` at the rim), flings
    // physics props outward, and shatters breakable terrain. Returns the number of objects hit.
    // Orchestrated by main.js; the expanding visual lives in InfernoShockwave.
    detonateInferno(originX, originY, options = {}) {
        const fury = CONFIG.FURY || {};
        const radius = options.radius ?? fury.blastRadius ?? 24;
        const baseDamage = options.damage ?? fury.blastDamage ?? 9999;
        const falloffMin = options.falloffMinFactor ?? fury.falloffMinFactor ?? 0.5;
        const knockback = options.knockbackSpeed ?? fury.knockbackSpeed ?? 30;
        const upBias = options.knockbackUpBias ?? fury.knockbackUpBias ?? 0.3;
        const radiusSq = radius * radius;
        let hitCount = 0;

        const objs = this.objects;
        for (let i = 0, n = objs.length; i < n; i++) {
            const obj = objs[i];
            if (!obj || obj.isDestroyed || obj.markedForRemoval) continue;
            if (obj === this.dynoTarget) continue;
            // Skip purely logical / non-combat world objects.
            if (obj.type === 'missioncallout' || obj.type === 'ring') continue;
            const pos = obj.container?.position;
            if (!pos) continue;

            const dx = pos.x - originX;
            const dy = pos.y - originY;
            const distSq = dx * dx + dy * dy;
            if (distSq > radiusSq) continue;

            const dist = Math.sqrt(distSq);
            // 1.0 at the centre, easing down to falloffMin at the rim.
            const factor = falloffMin + (1 - falloffMin) * (1 - dist / radius);

            // Apply knockback first so the body is awake and flung before applyDamage
            // potentially destroys the object and cleans up its physics body.
            this.physicsWorld?.applyRadialImpulseToLevelObject?.(
                obj, originX, originY, knockback * factor, upBias
            );

            // Damage only real combat targets (those with a health pool) so the blast doesn't
            // silently vaporise coins / decorative props.
            if (obj.maxHealth > 0 && typeof obj.applyDamage === 'function') {
                obj.applyDamage(baseDamage * factor, 'inferno');
                hitCount++;
            }
        }

        this.shatterBreakableTilesInRadius(originX, originY, radius);
        return hitCount;
    }

    // Breaks every breakable, unbroken tile whose centre falls within `radius` of the origin.
    shatterBreakableTilesInRadius(originX, originY, radius) {
        const level = this.level;
        if (!level?.worldToCell || !level?.breakTileAtCell || !level?.cellToWorld) {
            return;
        }
        const tw = level.tileWidth || 1;
        const th = level.tileHeight || 1;
        const colRadius = Math.ceil(radius / tw) + 1;
        const rowRadius = Math.ceil(radius / th) + 1;
        const center = level.worldToCell(originX, originY);
        const radiusSq = radius * radius;

        for (let dc = -colRadius; dc <= colRadius; dc++) {
            for (let dr = -rowRadius; dr <= rowRadius; dr++) {
                const col = center.col + dc;
                const row = center.row + dr;
                const tile = level.getTileAtCell?.(col, row);
                if (!tile || !tile.breakable || tile.broken) continue;
                const cell = level.cellToWorld(col, row);
                const cx = cell.x + tw * 0.5;
                const cy = cell.y + th * 0.5;
                const ddx = cx - originX;
                const ddy = cy - originY;
                if (ddx * ddx + ddy * ddy > radiusSq) continue;
                level.breakTileAtCell(col, row);
            }
        }
    }

    dispose() {
        for (const object of this.objects) {
            object.dispose?.();
        }
        this.objects = [];
        this.objectsById.clear();
        this.respawnQueue = [];
        this.levelSpawnTemplates = [];
        this.cameraViewRect = null;

        for (const effect of this.activeEffects) {
            effect.dispose();
        }
        this.activeEffects = [];
        this.fireballHitRegistry.clear();
        this.dynoTarget = null;
        this.audioManager?.stopLoop?.('chopper');
        this.chopperLoopActive = false;
        this.audioManager?.stopLoop?.('plane');
        this.planeLoopActive = false;
        this.physicsWorld.dispose();
    }

    setDynoTarget(target) {
        this.dynoTarget = target || null;
    }

    // Called after MissionManager is constructed so mission world objects can call back.
    setMissionManager(missionManager) {
        this.factory.missionManager = missionManager || null;
        for (const obj of this.objects) {
            if (obj?.missionManager !== undefined) {
                obj.missionManager = missionManager || null;
            }
        }
    }

    attachCalloutsToLayerGroup(layerGroup) {
        for (const obj of this.objects) {
            if (obj?.type === 'missioncallout') {
                obj.attachToLayerGroup?.(layerGroup);
            }
        }
    }

    setProjectileRenderBand(band) {
        this.projectileRenderBand = band || null;
        for (const object of this.objects) {
            object?.setProjectileRenderBand?.(this.projectileRenderBand);
        }
    }

    update(delta) {
        const objectsToRemove = this._scratchObjectsToRemove || (this._scratchObjectsToRemove = []);
        objectsToRemove.length = 0;

        const dynoPos = this.dynoTarget?.position;
        if (dynoPos) this.physicsWorld.setFocalPoint(dynoPos.x, dynoPos.y);

        if (!CONFIG.disableLevelObjectUpdate) {
            this._offScreenCheckFrame = ((this._offScreenCheckFrame || 0) + 1) % 6;
            const recheck = this._offScreenCheckFrame === 0;
            const objs = this.objects;
            const activeEffects = this.activeEffects;
            for (let i = 0, n = objs.length; i < n; i++) {
                const object = objs[i];
                if (recheck || object.isOffScreen === undefined) {
                    object.isOffScreen = this.isObjectOffScreen(object, 20);
                }
                if (!object.isOffScreen || object.alwaysUpdate) {
                    object.update(delta, this.level, this.dynoTarget, objs);
                    this.physicsWorld.syncPassiveBodyFromLevelObject(object);
                    const detached = object.dequeueDetachedEffects?.();
                    if (detached && detached.length) {
                        for (let j = 0, m = detached.length; j < m; j++) activeEffects.push(detached[j]);
                    }
                }
                if (object.shouldRemoveFromLevel?.()) {
                    objectsToRemove.push(object);
                }
            }
        }

        this.updateRingPassProgress();
        this.applyTankBulletDamage(this.dynoTarget);

        for (let i = 0, n = objectsToRemove.length; i < n; i++) {
            this.remove(objectsToRemove[i]);
        }
        objectsToRemove.length = 0;
        this.rebuildObjectSpatialGrid();

        // Rebuild dynamic walkable edges from objects that expose a top surface.
        // TiledLevel retains the array reference (read later during collision queries),
        // so we must allocate a fresh one each frame.
        if (this.level?.setDynamicCollisionEdges) {
            const dynamicEdges = [];
            const dPos = this.dynoTarget?.position;
            const objs = this.objects;
            for (let i = 0, n = objs.length; i < n; i++) {
                const object = objs[i];
                if (!object.getWalkableTopEdge) continue;
                if (dPos && object.container) {
                    const activationRadius = object.walkableEdgeActivationRadius ?? 60;
                    const dx = object.container.position.x - dPos.x;
                    const dy = object.container.position.y - dPos.y;
                    if (dx * dx + dy * dy > activationRadius * activationRadius) continue;
                }
                const result = object.getWalkableTopEdge();
                if (Array.isArray(result)) {
                    for (let j = 0, m = result.length; j < m; j++) {
                        const edge = result[j];
                        if (edge) dynamicEdges.push(edge);
                    }
                } else if (result) {
                    dynamicEdges.push(result);
                }
            }
            this.level.setDynamicCollisionEdges(dynamicEdges);
        }

        // Carry the player along with any moving platform they are standing on.
        const dyno = this.dynoTarget;
        const groundEdge = dyno?.groundContact?.edge;
        if (groundEdge?._object && dyno?.onGround && !dyno?.carriedBy) {
            const platform = groundEdge._object;
            if (Number.isFinite(platform.frameDeltaX) || Number.isFinite(platform.frameDeltaY)) {
                dyno.position.x += platform.frameDeltaX ?? 0;
                dyno.position.y += platform.frameDeltaY ?? 0;

                // If the platform carried the dyno outside level bounds, slide them off.
                const lvl = this.level;
                if (lvl) {
                    const levelLeft  = lvl.worldOriginX ?? 0;
                    const levelRight = levelLeft + (lvl.width ?? 0) * (lvl.tileWidth ?? 1);
                    if (dyno.position.x < levelLeft || dyno.position.x > levelRight) {
                        dyno.position.x = Math.max(levelLeft, Math.min(levelRight, dyno.position.x));
                        dyno.setAirborneState?.();
                    }
                }
            }
        }

        for (let index = this.activeEffects.length - 1; index >= 0; index -= 1) {
            const effect = this.activeEffects[index];
            effect.update(delta);
            if (effect.isFinished()) {
                effect.dispose();
                this.activeEffects.splice(index, 1);
            }
        }

        // Feed dyno position/velocity before the physics update so pushLevelObjectsFromDyno
        // runs every substep rather than once per frame — reliable on slow/mobile devices.
        this.physicsWorld.setDynoState(
            this.dynoTarget?.position ?? null,
            this.dynoTarget?.velocity ?? null
        );
        this.physicsWorld.update(delta);

        this.updateRespawns(delta);
        this.updateChopperAudioLoop(delta);
        this.updatePlaneAudioLoop(delta);
    }

    updateChopperAudioLoop(delta = 0) {
        const targetPosition = this.dynoTarget?.position || null;
        const minDistance = 8;
        const maxDistance = 48;
        const maxVolume = 0.45;
        let nearestDistance = Number.POSITIVE_INFINITY;
        const nearbyObjects = targetPosition
            ? this.queryNearbyObjects(targetPosition, maxDistance)
            : this.objects;

        for (const object of nearbyObjects) {
            if (object?.type !== 'chopper' || object.isDestroyed || object.markedForRemoval || object.destroyedFalling) {
                continue;
            }

            if (!targetPosition) {
                nearestDistance = minDistance;
                break;
            }

            const objectPosition = object.container?.position;
            if (!objectPosition) {
                continue;
            }

            nearestDistance = Math.min(nearestDistance, Math.hypot(
                objectPosition.x - targetPosition.x,
                objectPosition.y - targetPosition.y
            ));
        }

        const hasAudibleChopper = nearestDistance <= maxDistance;
        const distanceRatio = hasAudibleChopper
            ? THREE.MathUtils.clamp((maxDistance - nearestDistance) / Math.max(maxDistance - minDistance, 0.001), 0, 1)
            : 0;
        const targetVolume = maxVolume * distanceRatio * distanceRatio;
        const smoothing = 1 - Math.exp(-Math.max(delta, 0) * 6);
        this.chopperLoopVolume = THREE.MathUtils.lerp(this.chopperLoopVolume, targetVolume, smoothing);

        if (this.chopperLoopVolume <= 0.01 && !hasAudibleChopper) {
            if (this.chopperLoopActive) {
                this.audioManager?.stopLoop?.('chopper');
                this.chopperLoopActive = false;
            }
            this.chopperLoopVolume = 0;
            return;
        }

        this.chopperLoopActive = true;
        this.audioManager?.startLoop?.('chopper', { volume: this.chopperLoopVolume });
    }

    updatePlaneAudioLoop(delta = 0) {
        const targetPosition = this.dynoTarget?.position || null;
        const minDistance = 8;
        const maxDistance = 48;
        const maxVolume = 0.45;
        let nearestDistance = Number.POSITIVE_INFINITY;
        const nearbyObjects = targetPosition
            ? this.queryNearbyObjects(targetPosition, maxDistance)
            : this.objects;

        for (const object of nearbyObjects) {
            if (object?.type !== 'plane' || object.isDestroyed || object.markedForRemoval || object.destroyedFalling) {
                continue;
            }

            if (!targetPosition) {
                nearestDistance = minDistance;
                break;
            }

            const objectPosition = object.container?.position;
            if (!objectPosition) {
                continue;
            }

            nearestDistance = Math.min(nearestDistance, Math.hypot(
                objectPosition.x - targetPosition.x,
                objectPosition.y - targetPosition.y
            ));
        }

        const hasAudiblePlane = nearestDistance <= maxDistance;
        const distanceRatio = hasAudiblePlane
            ? THREE.MathUtils.clamp((maxDistance - nearestDistance) / Math.max(maxDistance - minDistance, 0.001), 0, 1)
            : 0;
        const targetVolume = maxVolume * distanceRatio * distanceRatio;
        const smoothing = 1 - Math.exp(-Math.max(delta, 0) * 6);
        this.planeLoopVolume = THREE.MathUtils.lerp(this.planeLoopVolume, targetVolume, smoothing);

        if (this.planeLoopVolume <= 0.01 && !hasAudiblePlane) {
            if (this.planeLoopActive) {
                this.audioManager?.stopLoop?.('plane');
                this.planeLoopActive = false;
            }
            this.planeLoopVolume = 0;
            return;
        }

        this.planeLoopActive = true;
        this.audioManager?.startLoop?.('plane', { volume: this.planeLoopVolume });
    }

    findNearestPickupableObject(position, radius, dyno) {
        let nearestObject = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const object of this.queryNearbyObjects(position, radius)) {
            if (!object.canBePickedUpBy(dyno)) {
                continue;
            }

            const objectPosition = object.getWorldPosition(new THREE.Vector3());
            const distance = Math.hypot(
                objectPosition.x - position.x,
                objectPosition.y - position.y
            );
            if (distance > radius || distance >= nearestDistance) {
                continue;
            }

            nearestObject = object;
            nearestDistance = distance;
        }

        return nearestObject;
    }

    getInteractionAnchorWorldPosition(object, dyno, useGrabPoints, scratch) {
        if (useGrabPoints && typeof object.getGrabPointWorldPosition === 'function' && typeof dyno?.selectDragGrabPoint === 'function') {
            const grabPointName = dyno.selectDragGrabPoint(object);
            return object.getGrabPointWorldPosition(grabPointName, scratch);
        }
        if (!useGrabPoints && typeof object.getPickupRootWorldPosition === 'function') {
            return object.getPickupRootWorldPosition(scratch);
        }
        return object.getWorldPosition(scratch);
    }

    findNearestInteractableObject(position, radius, dyno, useGrabPoints = false) {
        let nearestObject = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        if (!this._scratchVec3) this._scratchVec3 = new THREE.Vector3();

        for (const object of this.queryNearbyObjects(position, radius)) {
            const worldPos = object.getWorldPosition(this._scratchVec3);
            const dx = worldPos.x - position.x;
            const dy = worldPos.y - position.y;
            const centerDist = Math.sqrt(dx * dx + dy * dy);

            // Fast bounding-circle pre-reject using the object's collision rect diagonal.
            const rect = object.configuredCollisionRect;
            const objectBoundingRadius = rect ? Math.hypot(rect.width, rect.height) * 0.5 : 0;
            if (centerDist - objectBoundingRadius > radius) continue;

            if (!dyno?.canUsePickupDropButton?.(object)) continue;

            const anchorPos = this.getInteractionAnchorWorldPosition(object, dyno, useGrabPoints, this._scratchVec3);
            const adx = anchorPos.x - position.x;
            const ady = anchorPos.y - position.y;
            const effectiveDistance = Math.sqrt(adx * adx + ady * ady);

            if (effectiveDistance > radius || effectiveDistance >= nearestDistance) continue;

            nearestObject = object;
            nearestDistance = effectiveDistance;
        }

        return nearestObject;
    }
}
