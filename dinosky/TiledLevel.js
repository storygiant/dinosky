import { SpatialGrid } from './SpatialGrid.js';

// Pre-built excluded-type sets for the most common call sites — avoids per-call allocation.
const EXCLUDE_FLY_THROUGH = new Set(['fly_through']);
const EXCLUDE_NONE = new Set();

const POLYGON_GRID_CELL_SIZE = 32;

const GAMEPLAY_TYPES = Object.freeze({
    EMPTY: 'EMPTY',
    SOLID: 'SOLID',
    GROUND: 'GROUND',
    BREAKABLE: 'BREAKABLE'
});

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function makeContourPoint(x, y) {
    return {
        x: Number(x),
        y: Number(y)
    };
}

function pointInPolygon(point, polygon = []) {
    if (!point || !Array.isArray(polygon) || polygon.length < 3) {
        return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
        const a = polygon[i];
        const b = polygon[j];
        // Standard ray-cast: only cross edges that straddle point.y, divide by the
        // actual signed dy so the intersection X is computed correctly regardless of
        // whether the edge runs upward or downward.
        if ((a.y > point.y) !== (b.y > point.y)) {
            const intersectX = a.x + (b.x - a.x) * (point.y - a.y) / (b.y - a.y);
            if (point.x < intersectX) {
                inside = !inside;
            }
        }
    }

    return inside;
}


function createEmptyTile() {
    return {
        gid: 0,
        gameplayType: GAMEPLAY_TYPES.EMPTY,
        startHeight: 0,
        endHeight: 0,
        takeoffAllowed: false,
        breakable: false,
        broken: false,
        sourceLayer: null
    };
}

function isMissionZoneObject(object) {
    const type = String(object?.type || '').trim().toLowerCase();
    const name = String(object?.name || '').trim().toLowerCase();
    const props = object?.properties || {};
    return type === 'missionzone' ||
        name === 'missionzone' ||
        Boolean(props.zoneId || props.zoneType);
}

function isDialogTriggerZoneObject(object) {
    const type = String(object?.type || '').trim().toLowerCase();
    const name = String(object?.name || '').trim().toLowerCase();
    const props = object?.properties || {};
    return type === 'dialogzone' ||
        name === 'dialogzone' ||
        Boolean(props.dialogId);
}

function isZoneTriggerObject(object) {
    const type = String(object?.type || '').trim().toLowerCase();
    const name = String(object?.name || '').trim().toLowerCase();
    const props = object?.properties || {};
    return type === 'dialogzone' ||
        type === 'triggerzone' ||
        type === 'hidezone' ||
        name === 'dialogzone' ||
        name === 'triggerzone' ||
        name === 'hidezone' ||
        Boolean(props.dialogId) ||
        Boolean(props.layersToHide) ||
        Boolean(props.layersToShow) ||
        Boolean(props.triggerType);
}

function parseTokenList(value) {
    if (Array.isArray(value)) {
        return value
            .map((entry) => String(entry || '').trim())
            .filter(Boolean);
    }

    return String(value || '')
        .split(/[,\n;\r]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
}

function getZoneWorldPoints(object) {
    if (Array.isArray(object?.worldShapePoints) && object.worldShapePoints.length >= 3) {
        return object.worldShapePoints
            .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.y))
            .map((point) => ({ x: point.x, y: point.y }));
    }

    const left = Math.min(object.worldX, object.worldX + object.width);
    const right = Math.max(object.worldX, object.worldX + object.width);
    const bottom = Math.min(object.worldY, object.worldY - object.height);
    const top = Math.max(object.worldY, object.worldY - object.height);
    return [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom }
    ];
}

function getZoneBoundsFromPoints(points) {
    let left = Infinity;
    let right = -Infinity;
    let bottom = Infinity;
    let top = -Infinity;
    for (const point of points) {
        left = Math.min(left, point.x);
        right = Math.max(right, point.x);
        bottom = Math.min(bottom, point.y);
        top = Math.max(top, point.y);
    }
    return { left, right, bottom, top };
}

function getZoneCenterAndRadius(points, fallbackBounds) {
    let centerX = 0;
    let centerY = 0;
    for (const point of points) {
        centerX += point.x;
        centerY += point.y;
    }
    if (points.length > 0) {
        centerX /= points.length;
        centerY /= points.length;
    } else {
        centerX = fallbackBounds.left + ((fallbackBounds.right - fallbackBounds.left) * 0.5);
        centerY = fallbackBounds.bottom + ((fallbackBounds.top - fallbackBounds.bottom) * 0.5);
    }

    let quickRadiusSq = 0;
    for (const point of points) {
        const dx = point.x - centerX;
        const dy = point.y - centerY;
        quickRadiusSq = Math.max(quickRadiusSq, (dx * dx) + (dy * dy));
    }
    return {
        centerX,
        centerY,
        quickRadius: Math.sqrt(quickRadiusSq)
    };
}

function createBaseZoneFromObject(object) {
    const worldPoints = getZoneWorldPoints(object);
    if (worldPoints.length < 3) {
        return null;
    }
    const bounds = getZoneBoundsFromPoints(worldPoints);
    const width = bounds.right - bounds.left;
    const height = bounds.top - bounds.bottom;
    const { centerX, centerY, quickRadius } = getZoneCenterAndRadius(worldPoints, bounds);

    return {
        shapeType: String(object?.shapeType || 'rectangle').trim().toLowerCase(),
        worldPoints,
        left: bounds.left,
        right: bounds.right,
        bottom: bounds.bottom,
        top: bounds.top,
        width,
        height,
        centerX,
        centerY,
        quickRadius
    };
}

export function isPointNearZone(zone, x, y) {
    const radius = zone?.quickRadius;
    if (!Number.isFinite(radius) || radius <= 0) {
        return true;
    }

    const dx = x - (zone.centerX ?? 0);
    const dy = y - (zone.centerY ?? 0);
    return (dx * dx) + (dy * dy) <= radius * radius;
}

export function isPointInsideZone(zone, x, y) {
    if (!zone || !Number.isFinite(x) || !Number.isFinite(y)) {
        return false;
    }

    if (x < zone.left || x > zone.right || y < zone.bottom || y > zone.top) {
        return false;
    }

    const shapeType = String(zone.shapeType || 'rectangle').trim().toLowerCase();
    if (shapeType === 'rectangle' || shapeType === 'rect' || shapeType === 'box') {
        return true;
    }

    if (shapeType === 'ellipse' || shapeType === 'oval') {
        const halfWidth = Math.max((zone.right - zone.left) * 0.5, 0.0001);
        const halfHeight = Math.max((zone.top - zone.bottom) * 0.5, 0.0001);
        const centerX = zone.left + halfWidth;
        const centerY = zone.bottom + halfHeight;
        const dx = (x - centerX) / halfWidth;
        const dy = (y - centerY) / halfHeight;
        return (dx * dx) + (dy * dy) <= 1.0001;
    }

    const points = Array.isArray(zone.worldPoints) ? zone.worldPoints : null;
    if (!points || points.length < 3) {
        return true;
    }

    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
        const ax = points[i].x;
        const ay = points[i].y;
        const bx = points[j].x;
        const by = points[j].y;

        const edgeDx = bx - ax;
        const edgeDy = by - ay;
        const relDx = x - ax;
        const relDy = y - ay;
        const cross = (edgeDx * relDy) - (edgeDy * relDx);
        if (Math.abs(cross) <= 0.0001) {
            const dot = (relDx * edgeDx) + (relDy * edgeDy);
            if (dot >= -0.0001) {
                const edgeLenSq = (edgeDx * edgeDx) + (edgeDy * edgeDy);
                if (dot <= edgeLenSq + 0.0001) {
                    return true;
                }
            }
        }

        const intersects = ((ay > y) !== (by > y)) &&
            (x < (((bx - ax) * (y - ay)) / ((by - ay) || 0.0000001)) + ax);
        if (intersects) {
            inside = !inside;
        }
    }
    return inside;
}

function createMissionZoneFromObject(object) {
    const props = object.properties || {};
    const baseZone = createBaseZoneFromObject(object);
    if (!baseZone) {
        return null;
    }
    const zoneId = String(props.zoneId || object.name || object.id || '').trim();
    const zoneType = String(props.zoneType || props.targetType || object.type || object.name || '').trim();

    if (!zoneId && !zoneType) {
        return null;
    }

    return {
        id: object.id ?? zoneId,
        zoneId,
        zoneType,
        name: object.name || zoneId,
        ...baseZone,
        sourceLayer: object.sourceLayer || ''
    };
}

function createDialogTriggerZoneFromObject(object) {
    const props = object?.properties || {};
    const dialogId = String(props.dialogId || '').trim().toLowerCase();
    if (!dialogId) {
        return null;
    }

    const baseZone = createBaseZoneFromObject(object);
    if (!baseZone) {
        return null;
    }
    const zoneId = String(
        props.zoneId ||
        object.name ||
        object.id ||
        `${dialogId}_${baseZone.left}_${baseZone.bottom}`
    ).trim();
    const dwellSeconds = Number.isFinite(props.dwellSeconds)
        ? Math.max(0, props.dwellSeconds)
        : null;
    const requireGrounded = props.requireGrounded === true;

    return {
        id: object.id ?? zoneId,
        zoneId,
        dialogId,
        ...baseZone,
        dwellSeconds,
        requireGrounded,
        sourceLayer: object.sourceLayer || ''
    };
}

function createZoneTriggerFromObject(object) {
    const props = object?.properties || {};
    const dialogId = String(props.dialogId || '').trim().toLowerCase();
    const triggerType = String(props.triggerType || '').trim().toLowerCase();
    const layersToHide = parseTokenList(props.layersToHide);
    const layersToShow = parseTokenList(props.layersToShow);

    const baseZone = createBaseZoneFromObject(object);
    if (!baseZone) {
        return null;
    }

    const zoneId = String(
        props.zoneId ||
        object.name ||
        object.id ||
        dialogId ||
        triggerType ||
        `${baseZone.left}_${baseZone.bottom}`
    ).trim();

    if (!zoneId && !dialogId && !triggerType && layersToHide.length === 0 && layersToShow.length === 0) {
        return null;
    }

    const dwellSeconds = Number.isFinite(props.dwellSeconds)
        ? Math.max(0, props.dwellSeconds)
        : null;
    const requireGrounded = props.requireGrounded === true;
    const effectZoneId = String(
        props.hideZoneId ||
        props.effectZoneId ||
        props.hideAreaZoneId ||
        ''
    ).trim();

    return {
        id: object.id ?? zoneId,
        zoneId,
        dialogId,
        triggerType,
        layersToHide,
        layersToShow,
        effectZoneId: effectZoneId || null,
        dwellSeconds,
        requireGrounded,
        ...baseZone,
        sourceLayer: object.sourceLayer || ''
    };
}

export class TiledLevel {
    constructor({
        width,
        height,
        authoredTileWidth,
        authoredTileHeight,
        tileWidth,
        tileHeight,
        worldOriginX,
        worldOriginY,
        cells,
        objectLayers,
        renderLayers,
        mapProperties,
        prebuiltCollisionData = null,
        prebuiltWaterPolygons = null
    }) {
        this.width = width;
        this.height = height;
        this.authoredTileWidth = authoredTileWidth;
        this.authoredTileHeight = authoredTileHeight;
        this.tileWidth = tileWidth;
        this.tileHeight = tileHeight;
        this.worldOriginX = worldOriginX;
        this.worldOriginY = worldOriginY;
        this.cells = cells;
        this.objectLayers = objectLayers;
        this.renderLayers = renderLayers || [];
        this.mapProperties = mapProperties;
        this.missionZones = this.collectMissionZones();
        this.zoneTriggerZones = this.collectZoneTriggerZones();
        this.dialogTriggerZones = this.zoneTriggerZones.filter((zone) => Boolean(zone?.dialogId));
        this._collisionEdgeGroups = null;
        this.dynamicCollisionEdges = [];
        this.collisionPolygons = [];
        this.collisionPolygonRegions = [];
        this._polygonSpatialGrid = null;
        this._polygonGridCandidates = [];
        this.collisionContourCleanupDebug = [];
        this.changeListeners = new Set();
        this.emptyTile = createEmptyTile();
        this.flightHeight = this.height * this.tileHeight;
        this.flightCeilingY = this.worldOriginY + this.flightHeight;
        this.waterPolygons = Array.isArray(prebuiltWaterPolygons) ? prebuiltWaterPolygons : [];
        if (prebuiltCollisionData) {
            this.setPrebuiltCollisionData(prebuiltCollisionData.polygons, prebuiltCollisionData.convexPieces, prebuiltCollisionData.collisionEdgeGroups);
        }
    }

    collectMissionZones() {
        // Mission zones can be authored as closed Tiled shape objects. Mark them as
        // type/name "MissionZone", or add zoneId / zoneType properties to any object.
        const zones = [];
        for (const layer of this.objectLayers || []) {
            for (const object of layer.objects || []) {
                if (!isMissionZoneObject(object)) {
                    continue;
                }

                const zone = createMissionZoneFromObject(object);
                if (zone) {
/*                    
                    console.log(
                        '[TiledLevel] MissionZone:',
                        zone.zoneId || '(no zoneId)',
                        zone.zoneType || '(no zoneType)',
                        `x=${zone.left.toFixed(2)}..${zone.right.toFixed(2)}`,
                        `y=${zone.bottom.toFixed(2)}..${zone.top.toFixed(2)}`
                    );
*/                    
                    zones.push(zone);
                }
            }
        }
        return zones;
    }

    collectZoneTriggerZones() {
        const zones = [];
        for (const layer of this.objectLayers || []) {
            for (const object of layer.objects || []) {
                if (!isZoneTriggerObject(object)) {
                    continue;
                }

                const zone = createZoneTriggerFromObject(object);
                if (zone) {
                    zones.push(zone);
                }
            }
        }
        return zones;
    }

    collectDialogTriggerZones() {
        return this.collectZoneTriggerZones().filter((zone) => Boolean(zone?.dialogId));
    }

    addMissionZones(zones = []) {
        for (const zone of zones) {
            if (!zone?.zoneId && !zone?.zoneType) {
                continue;
            }

            const duplicate = this.missionZones.some((existingZone) => (
                zone.zoneId &&
                existingZone.zoneId === zone.zoneId &&
                existingZone.source === zone.source
            ));
            if (!duplicate) {
/*                
                console.log(
                    '[TiledLevel] MissionZone:',
                    zone.zoneId || '(no zoneId)',
                    zone.zoneType || '(no zoneType)',
                    `x=${zone.left.toFixed(2)}..${zone.right.toFixed(2)}`,
                    `y=${zone.bottom.toFixed(2)}..${zone.top.toFixed(2)}`
                );
*/                
                this.missionZones.push({ ...zone });
            }
        }
    }

    getMissionZones() {
        return this.missionZones.slice();
    }

    getMissionZoneById(id) {
        return this.missionZones.find((zone) => zone.zoneId === id) || null;
    }

    getMissionZonesByType(type) {
        return this.missionZones.filter((zone) => zone.zoneType === type);
    }

    getDialogTriggerZones() {
        return this.dialogTriggerZones.slice();
    }

    getZoneTriggerZones() {
        return this.zoneTriggerZones.slice();
    }

    getZoneTriggerById(id) {
        return this.zoneTriggerZones.find((zone) => zone.zoneId === id) || null;
    }

    isCollisionTile(tile) {
        return Boolean(
            tile &&
            !tile.broken &&
            tile.gameplayType !== GAMEPLAY_TYPES.EMPTY
        );
    }

    getCollisionTileHeightsAtCell(col, row) {
        const tile = this.getTileAtCell(col, row);
        if (!this.isCollisionTile(tile)) {
            return null;
        }

        if (tile.gameplayType === GAMEPLAY_TYPES.SOLID || tile.gameplayType === GAMEPLAY_TYPES.BREAKABLE) {
            return { start: 1, end: 1 };
        }

        return {
            start: clamp01(tile.startHeight),
            end: clamp01(tile.endHeight)
        };
    }

    getCollisionSurfaceHeightsAtCell(col, row) {
        const heights = this.getCollisionTileHeightsAtCell(col, row);
        if (!heights) {
            return null;
        }

        const cellWorld = this.cellToWorld(col, row);
        return {
            left: cellWorld.y + (heights.start * this.tileHeight),
            right: cellWorld.y + (heights.end * this.tileHeight),
            bottom: cellWorld.y,
            top: cellWorld.y + this.tileHeight
        };
    }

    getCollisionRegionTypeAtCell(col, row) {
        const tile = this.getTileAtCell(col, row);
        if (!this.isCollisionTile(tile)) {
            return null;
        }

        if (tile.gameplayType === GAMEPLAY_TYPES.GROUND) {
            const aboveTile = row < this.height - 1 ? this.getTileAtCell(col, row + 1) : null;
            const belowTile = row > 0 ? this.getTileAtCell(col, row - 1) : null;
            const aboveEmpty = !this.isCollisionTile(aboveTile);
            const belowEmpty = !this.isCollisionTile(belowTile);
            if (aboveEmpty && belowEmpty) {
                return 'fly_through';
            }
        }

        return 'solid';
    }

    setPrebuiltCollisionData(polygons, convexPieces, collisionEdgeGroups) {
        const DEFAULT_REGION_TYPE = 'solid';

        // Closed polygon contours — used for pointInPolygon (object placement, ray tests).
        const polygonPoints  = [];
        const polygonRegions = [];
        for (const poly of (polygons || [])) {
            const polyRegionType = poly.regionType || DEFAULT_REGION_TYPE;
            const points = (poly.edges || []).map((e) => ({ x: e.start.x, y: e.start.y }));
            if (points.length >= 3) {
                polygonPoints.push(points);
                polygonRegions.push({ type: polyRegionType, points });
            }
        }
        this.collisionPolygons = polygonPoints;
        this.collisionPolygonRegions = polygonRegions;
        this.collisionContourCleanupDebug = [];

        // Build spatial grid over polygon regions for fast point-in-polygon queries.
        const grid = new SpatialGrid(POLYGON_GRID_CELL_SIZE);
        for (let i = 0; i < polygonRegions.length; i++) {
            const pts = polygonRegions[i].points;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const p of pts) {
                if (p.x < minX) minX = p.x;
                if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.y > maxY) maxY = p.y;
            }
            grid.insertAabb(polygonRegions[i], minX, minY, maxX, maxY);
        }
        this._polygonSpatialGrid = grid;
        this._prebuiltConvexPieces = Array.isArray(convexPieces) ? convexPieces : null;
        if (Array.isArray(collisionEdgeGroups)) {
            this._collisionEdgeGroups = collisionEdgeGroups;
            // Build sorted index for fast X-range lookup: sorted by (cx - r), binary-searchable.
            this._collisionEdgeGroupsSorted = collisionEdgeGroups
                .map((g, i) => ({ minX: g.cx - g.r, maxX: g.cx + g.r, index: i }))
                .sort((a, b) => a.minX - b.minX);
        } else {
            this._collisionEdgeGroups = null;
            this._collisionEdgeGroupsSorted = null;
        }
    }

    getCollisionEdgeGroups() {
        return this._collisionEdgeGroups;
    }

    forEachEdgeGroupNearX(x, margin, callback) {
        const sorted = this._collisionEdgeGroupsSorted;
        const groups = this._collisionEdgeGroups;
        if (!sorted || !groups) return;
        const queryMin = x - margin;
        const queryMax = x + margin;
        // Binary search for first group whose minX <= queryMax.
        let lo = 0, hi = sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (sorted[mid].minX > queryMax) hi = mid;
            else lo = mid + 1;
        }
        // lo = first index where minX > queryMax, so scan [0, lo).
        // Early-exit: once minX > queryMax no further groups can overlap.
        for (let i = 0; i < lo; i++) {
            const s = sorted[i];
            if (s.maxX >= queryMin) callback(groups[s.index]);
        }

        // Also include dynamic edges (e.g. zeppelin deck) — they are not in the static index.
        for (const edge of this.dynamicCollisionEdges) {
            callback({ cx: (edge.x1 + edge.x2) * 0.5, r: Math.abs(edge.x2 - edge.x1) * 0.5 + margin, edges: [edge] });
        }
    }

    forEachEdgeGroupOverlappingXRange(minX, maxX, callback) {
        const sorted = this._collisionEdgeGroupsSorted;
        const groups = this._collisionEdgeGroups;
        if (!sorted || !groups) {
            return;
        }

        const queryMin = Math.min(minX, maxX);
        const queryMax = Math.max(minX, maxX);
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (sorted[mid].minX > queryMax) {
                hi = mid;
            } else {
                lo = mid + 1;
            }
        }

        for (let i = 0; i < lo; i += 1) {
            const entry = sorted[i];
            if (entry.maxX >= queryMin) {
                callback(groups[entry.index]);
            }
        }
    }

    setDynamicCollisionEdges(edges) {
        this.dynamicCollisionEdges = Array.isArray(edges) ? edges : [];
    }

    getCollisionEdges() {
        const groups = this._collisionEdgeGroups;
        const base = groups ? groups.flatMap((g) => g.edges) : [];
        return this.dynamicCollisionEdges.length > 0
            ? base.concat(this.dynamicCollisionEdges)
            : base;
    }

    getCollisionPolygons() {
        return this.collisionPolygons.map((polygon) => polygon.map((point) => ({ ...point })));
    }

    getCollisionPolygonRegions() {
        return this.collisionPolygonRegions.map((region) => ({
            type: region.type,
            points: region.points.map((point) => ({ ...point }))
        }));
    }

    getCollisionPolygonContainingPoint(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return null;
        }

        const candidates = this._polygonGridCandidates;
        candidates.length = 0;
        if (this._polygonSpatialGrid) {
            this._polygonSpatialGrid.queryPoint(point.x, point.y, candidates);
            for (let i = 0; i < candidates.length; i++) {
                const region = candidates[i];
                if (pointInPolygon(point, region.points)) return region.points;
            }
            return null;
        }

        for (const polygon of this.collisionPolygons) {
            if (pointInPolygon(point, polygon)) return polygon;
        }
        return null;
    }

    getCollisionPolygonRegionContainingPoint(point, options = {}) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            return null;
        }

        // Use pre-built sets for the common call sites to avoid per-call allocation.
        let excludedTypes;
        if (!options.excludeTypes || options.excludeTypes.length === 0) {
            excludedTypes = EXCLUDE_NONE;
        } else if (options.excludeTypes.length === 1 && options.excludeTypes[0] === 'fly_through') {
            excludedTypes = EXCLUDE_FLY_THROUGH;
        } else {
            excludedTypes = new Set(
                options.excludeTypes.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
            );
        }

        const candidates = this._polygonGridCandidates;
        candidates.length = 0;
        if (this._polygonSpatialGrid) {
            this._polygonSpatialGrid.queryPoint(point.x, point.y, candidates);
            for (let i = 0; i < candidates.length; i++) {
                const region = candidates[i];
                if (excludedTypes.has(String(region?.type || '').trim().toLowerCase())) continue;
                if (pointInPolygon(point, region.points)) return region;
            }
            return null;
        }

        for (const region of this.collisionPolygonRegions) {
            if (excludedTypes.has(String(region?.type || '').trim().toLowerCase())) continue;
            if (pointInPolygon(point, region?.points || [])) return region;
        }
        return null;
    }

    isPointInsideAnyCollisionPolygon(point) {
        return Boolean(this.getCollisionPolygonContainingPoint(point));
    }

    isPointInsideBlockingCollisionPolygon(point, options = {}) {
        return Boolean(this.getCollisionPolygonRegionContainingPoint(point, options));
    }

    // ── Water polygon helpers ─────────────────────────────────────────────
    // Water polygons have shape { points: [{x,y}, ...], concave?: bool }.
    // We assign each polygon a stable index id (waterPolygonIndex) on first query
    // so AI controllers can detect "same polygon" across frames cheaply.

    _ensureWaterPolygonIds() {
        if (!Array.isArray(this.waterPolygons)) return;
        for (let i = 0; i < this.waterPolygons.length; i++) {
            const poly = this.waterPolygons[i];
            if (poly && poly.id === undefined) poly.id = i;
        }
    }

    getWaterPolygonAt(point) {
        if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
        if (!Array.isArray(this.waterPolygons) || this.waterPolygons.length === 0) return null;
        this._ensureWaterPolygonIds();
        for (const poly of this.waterPolygons) {
            if (pointInPolygon(point, poly?.points)) return poly;
        }
        return null;
    }

    isPointInsideWater(point) {
        return Boolean(this.getWaterPolygonAt(point));
    }

    // Returns the polygon's axis-aligned bounding box. Cached on the polygon.
    getWaterPolygonBounds(poly) {
        if (!poly || !Array.isArray(poly.points) || poly.points.length === 0) return null;
        if (poly._bounds) return poly._bounds;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of poly.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
        }
        poly._bounds = { minX, maxX, minY, maxY };
        return poly._bounds;
    }

    // Pick a random point inside the given water polygon via rejection sampling.
    // Optional depthRange = [minFrac, maxFrac] biases the Y toward a depth band
    // below the polygon's top edge (0 = surface, 1 = bottom of bounding box).
    getRandomPointInsideWaterPolygon(poly, options = {}) {
        const bounds = this.getWaterPolygonBounds(poly);
        if (!bounds) return null;
        const depthRange = Array.isArray(options.depthRange) ? options.depthRange : null;
        const maxAttempts = Number.isFinite(options.maxAttempts) ? options.maxAttempts : 24;
        const { minX, maxX, minY, maxY } = bounds;
        const height = maxY - minY;
        // Tiled Y grows downward; polygon "surface" is the smallest Y in world coords.
        // The water rendering uses world coords so the surface is at maxY in world space
        // when world Y is up. We default to "anywhere inside" and treat depthRange as
        // fraction below the top of the bounds.
        for (let i = 0; i < maxAttempts; i++) {
            const x = minX + Math.random() * (maxX - minX);
            let y;
            if (depthRange && Number.isFinite(depthRange[0]) && Number.isFinite(depthRange[1])) {
                const a = Math.max(0, Math.min(1, depthRange[0]));
                const b = Math.max(0, Math.min(1, depthRange[1]));
                const lo = Math.min(a, b);
                const hi = Math.max(a, b);
                const frac = lo + Math.random() * (hi - lo);
                y = maxY - frac * height;
            } else {
                y = minY + Math.random() * height;
            }
            if (pointInPolygon({ x, y }, poly.points)) return { x, y };
        }
        // Fallback: bounds center if inside, otherwise first vertex.
        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        if (pointInPolygon({ x: cx, y: cy }, poly.points)) return { x: cx, y: cy };
        return { x: poly.points[0].x, y: poly.points[0].y };
    }

    getCollisionEdgeNormal(edge) {
        if (!edge) {
            return null;
        }

        const dx = Number(edge.x2) - Number(edge.x1);
        const dy = Number(edge.y2) - Number(edge.y1);
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

        return makeContourPoint(normalX, normalY);
    }

    getRayEdgeIntersection(start, direction, edge, maxDistance = Number.POSITIVE_INFINITY, epsilon = 0.0001) {
        if (
            !start ||
            !direction ||
            !edge ||
            !Number.isFinite(start.x) ||
            !Number.isFinite(start.y) ||
            !Number.isFinite(direction.x) ||
            !Number.isFinite(direction.y)
        ) {
            return null;
        }

        const edgeStartX = Number(edge.x1);
        const edgeStartY = Number(edge.y1);
        const edgeDeltaX = Number(edge.x2) - edgeStartX;
        const edgeDeltaY = Number(edge.y2) - edgeStartY;
        const denominator = (direction.x * edgeDeltaY) - (direction.y * edgeDeltaX);
        if (Math.abs(denominator) <= epsilon) {
            return null;
        }

        const diffX = edgeStartX - start.x;
        const diffY = edgeStartY - start.y;
        const rayDistance = ((diffX * edgeDeltaY) - (diffY * edgeDeltaX)) / denominator;
        const edgeT = ((diffX * direction.y) - (diffY * direction.x)) / denominator;

        if (rayDistance <= epsilon || rayDistance > maxDistance + epsilon || edgeT < -epsilon || edgeT > 1 + epsilon) {
            return null;
        }

        const clampedEdgeT = Math.max(0, Math.min(1, edgeT));
        return {
            distance: rayDistance,
            point: makeContourPoint(
                start.x + (direction.x * rayDistance),
                start.y + (direction.y * rayDistance)
            ),
            edge,
            edgeT: clampedEdgeT,
            normal: this.getCollisionEdgeNormal(edge)
        };
    }

    findRayExitPointFromPolygon(point, direction, polygon, maxDistance = Number.POSITIVE_INFINITY) {
        if (
            !point ||
            !direction ||
            !Array.isArray(polygon) ||
            polygon.length < 3
        ) {
            return null;
        }

        let nearestHit = null;

        for (let index = 0; index < polygon.length; index += 1) {
            const start = polygon[index];
            const end = polygon[(index + 1) % polygon.length];
            if (!start || !end) {
                continue;
            }
            const edge = { start, end, x1: start.x, y1: start.y, x2: end.x, y2: end.y, type: 'polygon_boundary' };

            const hit = this.getRayEdgeIntersection(point, direction, edge, maxDistance);
            if (!hit) {
                continue;
            }

            if (!nearestHit || hit.distance < nearestHit.distance) {
                nearestHit = hit;
            }
        }

        return nearestHit;
    }

    shouldCollideFlameOrFireballWithEdge(edge, options = {}) {
        if (!edge) {
            return false;
        }

        if (edge.type === 'bottom') {
            return options.includeBottomEdges === true;
        }

        return edge.type === 'top' || edge.type === 'left' || edge.type === 'right';
    }

    findNearestRayTerrainHit(start, direction, maxDistance = Number.POSITIVE_INFINITY, options = {}) {
        if (
            !start ||
            !direction ||
            !Number.isFinite(direction.x) ||
            !Number.isFinite(direction.y)
        ) {
            return null;
        }

        let nearestHit = null;

        const testEdge = (edge) => {
            if (!this.shouldCollideFlameOrFireballWithEdge(edge, options)) return;
            if (typeof options.edgeFilter === 'function' && options.edgeFilter(edge) !== true) return;
            const hit = this.getRayEdgeIntersection(start, direction, edge, maxDistance);
            if (hit && (!nearestHit || hit.distance < nearestHit.distance)) {
                nearestHit = hit;
            }
        };

        const hasFiniteDistance = Number.isFinite(maxDistance);
        const queryEndX = hasFiniteDistance
            ? start.x + (direction.x * maxDistance)
            : start.x;
        const queryMinX = Math.min(start.x, queryEndX);
        const queryMaxX = Math.max(start.x, queryEndX);

        if (this._collisionEdgeGroups) {
            const visitGroup = (group) => {
                for (const edge of group.edges) testEdge(edge);
            };
            if (hasFiniteDistance) {
                this.forEachEdgeGroupOverlappingXRange(queryMinX, queryMaxX, visitGroup);
            } else {
                for (const group of this._collisionEdgeGroups) {
                    visitGroup(group);
                }
            }
        }

        for (const edge of this.dynamicCollisionEdges) testEdge(edge);

        return nearestHit;
    }

    getCollisionContourCleanupDebug() {
        return this.collisionContourCleanupDebug.map((entry) => ({
            type: entry.type,
            original: entry.original.map((point) => ({ ...point })),
            simplified: entry.simplified.map((point) => ({ ...point })),
            cleaned: entry.cleaned.map((point) => ({ ...point })),
            removedPoints: entry.removedPoints.map((point) => ({ ...point })),
            simplifyThreshold: entry.simplifyThreshold
        }));
    }

    addChangeListener(listener) {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    notifyTileChanged(col, row, tile) {
        for (const listener of this.changeListeners) {
            listener({ col, row, tile });
        }
    }

    worldToCell(x, y) {
        return {
            col: Math.floor((x - this.worldOriginX) / this.tileWidth),
            row: Math.floor((y - this.worldOriginY) / this.tileHeight)
        };
    }

    cellToWorld(col, row) {
        return {
            x: this.worldOriginX + col * this.tileWidth,
            y: this.worldOriginY + row * this.tileHeight
        };
    }

    tiledToWorld(x, y) {
        const scaleX = this.tileWidth / Math.max(this.authoredTileWidth, 0.0001);
        const scaleY = this.tileHeight / Math.max(this.authoredTileHeight, 0.0001);
        return {
            x: this.worldOriginX + (x * scaleX),
            y: this.worldOriginY + (this.height * this.tileHeight) - (y * scaleY)
        };
    }

    isCellInside(col, row) {
        return col >= 0 && col < this.width && row >= 0 && row < this.height;
    }

    getCellIndex(col, row) {
        return row * this.width + col;
    }

    getTileAtCell(col, row) {
        if (!this.isCellInside(col, row)) {
            return null;
        }

        return this.cells[this.getCellIndex(col, row)] || this.emptyTile;
    }

    getTileAtWorld(x, y) {
        const { col, row } = this.worldToCell(x, y);
        return this.getTileAtCell(col, row);
    }

    isWalkableTile(tile) {
        return Boolean(
            tile &&
            !tile.broken &&
            (
                tile.gameplayType === GAMEPLAY_TYPES.GROUND
            )
        );
    }

    usesHeightBasedCollision(tile) {
        return Boolean(
            tile &&
            !tile.broken &&
            (
                tile.gameplayType === GAMEPLAY_TYPES.SOLID ||
                tile.gameplayType === GAMEPLAY_TYPES.GROUND
            )
        );
    }

    getSurfaceHeightAtCell(col, row, worldX) {
        const tile = this.getTileAtCell(col, row);
        if (!this.usesHeightBasedCollision(tile)) {
            return null;
        }

        const cellWorld = this.cellToWorld(col, row);
        const localX = (worldX - cellWorld.x) / this.tileWidth;
        const normalizedX = clamp01(localX);
        const surfaceNormalizedHeight =
            tile.startHeight + (tile.endHeight - tile.startHeight) * normalizedX;

        return cellWorld.y + clamp01(surfaceNormalizedHeight) * this.tileHeight;
    }

    getSurfaceAngleAtCell(col, row) {
        const tile = this.getTileAtCell(col, row);
        if (!this.usesHeightBasedCollision(tile)) {
            return 0;
        }

        const rise = (tile.endHeight - tile.startHeight) * this.tileHeight;
        const run = Math.max(this.tileWidth, 0.0001);
        return Math.atan2(rise, run);
    }

    isBlockedAtWorld(x, y) {
        const { col, row } = this.worldToCell(x, y);

        // Keep space above the map open; local layout below is owned by Tiled.
        if (row >= this.height) {
            return false;
        }

        // Stop leaving the authored world from the sides or falling below the level.
        if (col < 0 || col >= this.width || row < 0) {
            return true;
        }

        const tile = this.getTileAtCell(col, row);
        if (!tile || tile.gameplayType === GAMEPLAY_TYPES.EMPTY || tile.broken) {
            return false;
        }

        if (tile.gameplayType === GAMEPLAY_TYPES.BREAKABLE) {
            return true;
        }

        if (this.usesHeightBasedCollision(tile)) {
            // SOLID tiles can now use start/end heights too. That lets partial or sloped solid
            // shapes block only up to their resolved surface instead of acting like a full cell.
            const surfaceHeight = this.getSurfaceHeightAtCell(col, row, x);
            return surfaceHeight != null ? y <= surfaceHeight + 0.0001 : false;
        }

        return false;
    }

    isFlyableAtWorld(x, y) {
        return !this.isBlockedAtWorld(x, y);
    }

    getGroundInfoAtWorld(x, y = Number.POSITIVE_INFINITY) {
        const { col } = this.worldToCell(x, y);
        if (col < 0 || col >= this.width) {
            return null;
        }

        const unclampedRow = Math.floor((y - this.worldOriginY) / this.tileHeight);
        const startRow = Number.isFinite(unclampedRow)
            ? Math.min(Math.max(unclampedRow + 1, 0), this.height - 1)
            : this.height - 1;

        for (let row = startRow; row >= 0; row -= 1) {
            const tile = this.getTileAtCell(col, row);
            if (!this.isWalkableTile(tile)) {
                continue;
            }

            const surfaceHeight = this.getSurfaceHeightAtCell(col, row, x);
            if (surfaceHeight == null) {
                continue;
            }

            const cellWorld = this.cellToWorld(col, row);
            return {
                col,
                row,
                tile,
                worldX: x,
                cellWorldX: cellWorld.x,
                cellWorldY: cellWorld.y,
                surfaceHeight,
                angle: this.getSurfaceAngleAtCell(col, row),
                takeoffAllowed: Boolean(tile.takeoffAllowed)
            };
        }

        return null;
    }

    getGroundInfoBelowWorld(x, y = Number.POSITIVE_INFINITY) {
        const { col } = this.worldToCell(x, y);
        if (col < 0 || col >= this.width) {
            return null;
        }

        const unclampedRow = Math.floor((y - this.worldOriginY) / this.tileHeight);
        const startRow = Number.isFinite(unclampedRow)
            ? Math.min(Math.max(unclampedRow, 0), this.height - 1)
            : this.height - 1;
        const maxSurfaceHeight = Number.isFinite(y) ? y + 0.0001 : y;

        for (let row = startRow; row >= 0; row -= 1) {
            const tile = this.getTileAtCell(col, row);
            if (!this.isWalkableTile(tile)) {
                continue;
            }

            const surfaceHeight = this.getSurfaceHeightAtCell(col, row, x);
            if (surfaceHeight == null || surfaceHeight > maxSurfaceHeight) {
                continue;
            }

            const cellWorld = this.cellToWorld(col, row);
            return {
                col,
                row,
                tile,
                worldX: x,
                cellWorldX: cellWorld.x,
                cellWorldY: cellWorld.y,
                surfaceHeight,
                angle: this.getSurfaceAngleAtCell(col, row),
                takeoffAllowed: Boolean(tile.takeoffAllowed)
            };
        }

        return null;
    }

    getSurfaceHeightAtWorld(x, y = Number.POSITIVE_INFINITY) {
        return this.getGroundInfoAtWorld(x, y)?.surfaceHeight ?? null;
    }

    getFlightMaxSpeedUpFullHeightY(fullHeightRatio) {
        const ratio = clamp01(fullHeightRatio);
        return this.worldOriginY + this.flightHeight * ratio;
    }

    canTakeoffAtWorld(x, y = Number.POSITIVE_INFINITY) {
        const groundInfo = this.getGroundInfoAtWorld(x, y);
        return Boolean(groundInfo?.takeoffAllowed);
    }

    breakTileAtCell(col, row) {
        const tile = this.getTileAtCell(col, row);
        if (!tile || tile.broken || !tile.breakable) {
            return false;
        }

        const index = this.getCellIndex(col, row);
        const emptyTile = createEmptyTile();
        this.cells[index] = emptyTile;
        for (const layer of this.renderLayers || []) {
            if (layer?.gameplay === true && Array.isArray(layer.tiles)) {
                layer.tiles[index] = emptyTile;
            }
        }
        this.notifyTileChanged(col, row, emptyTile);
        return true;
    }
}

export { GAMEPLAY_TYPES };
