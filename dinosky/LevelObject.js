import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { CONFIG } from './config.js';
import { LevelObjectDestructionEffect } from './LevelObjectEffects.js';
import { loaderLoadAsyncWithRetry } from './fetchWithRetry.js';

export const LEVEL_OBJECT_STATES = Object.freeze({
    IDLE: 'idle',
    CARRIED: 'carried',
    GRABBED: 'grabbed',
    DRAGGED: 'dragged',
    FALLING: 'falling',
    DESTROYED: 'destroyed'
});

const SHARED_LEVEL_OBJECT_TEXTURE_PROMISES = new Map();

function toVector3Tuple(values = [], fallback = [0, 0, 0]) {
    return new THREE.Vector3(
        Number.isFinite(values[0]) ? values[0] : fallback[0],
        Number.isFinite(values[1]) ? values[1] : fallback[1],
        Number.isFinite(values[2]) ? values[2] : fallback[2]
    );
}

function normalizeTypeName(value) {
    return String(value || '').trim().toLowerCase();
}

function getRectAxis(angle = 0) {
    return new THREE.Vector2(Math.cos(angle), Math.sin(angle));
}

function getRectPerpendicularAxis(angle = 0) {
    return new THREE.Vector2(-Math.sin(angle), Math.cos(angle));
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

function getPlanarWorldAxes(object3D, fallbackAngle = 0) {
    if (!object3D?.getWorldQuaternion) {
        const cos = Math.cos(fallbackAngle);
        const sin = Math.sin(fallbackAngle);
        return {
            axisX: new THREE.Vector2(cos, sin),
            axisY: new THREE.Vector2(-sin, cos)
        };
    }

    const quaternion = object3D.getWorldQuaternion(new THREE.Quaternion());
    const axisX3 = new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion);
    const axisY3 = new THREE.Vector3(0, 1, 0).applyQuaternion(quaternion);
    const axisX = new THREE.Vector2(axisX3.x, axisX3.y);
    const axisY = new THREE.Vector2(axisY3.x, axisY3.y);

    if (axisX.lengthSq() <= 0.000001 || axisY.lengthSq() <= 0.000001) {
        const cos = Math.cos(fallbackAngle);
        const sin = Math.sin(fallbackAngle);
        return {
            axisX: new THREE.Vector2(cos, sin),
            axisY: new THREE.Vector2(-sin, cos)
        };
    }

    axisX.normalize();
    axisY.normalize();
    return { axisX, axisY };
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

function getPolygonCenter(points = []) {
    if (!Array.isArray(points) || points.length === 0) {
        return new THREE.Vector2();
    }

    let sumX = 0;
    let sumY = 0;
    for (const point of points) {
        sumX += point.x;
        sumY += point.y;
    }

    return new THREE.Vector2(sumX / points.length, sumY / points.length);
}

function getPolygonBounds2D(points = []) {
    if (!Array.isArray(points) || points.length === 0) {
        return null;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const point of points) {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
    }

    return { minX, maxX, minY, maxY };
}

function boundsOverlap(a, b, padding = 0) {
    return Boolean(
        a &&
        b &&
        a.minX <= b.maxX + padding &&
        a.maxX >= b.minX - padding &&
        a.minY <= b.maxY + padding &&
        a.maxY >= b.minY - padding
    );
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

function cross2D(a, b) {
    return (a.x * b.y) - (a.y * b.x);
}

function segmentsIntersect2D(a, b, c, d, epsilon = 0.000001) {
    const r = new THREE.Vector2(b.x - a.x, b.y - a.y);
    const s = new THREE.Vector2(d.x - c.x, d.y - c.y);
    const denominator = cross2D(r, s);
    const cMinusA = new THREE.Vector2(c.x - a.x, c.y - a.y);

    if (Math.abs(denominator) <= epsilon) {
        if (Math.abs(cross2D(cMinusA, r)) > epsilon) {
            return false;
        }

        const rr = Math.max(r.lengthSq(), epsilon);
        const t0 = cMinusA.dot(r) / rr;
        const t1 = t0 + (s.dot(r) / rr);
        return Math.max(Math.min(t0, t1), 0) <= Math.min(Math.max(t0, t1), 1);
    }

    const t = cross2D(cMinusA, s) / denominator;
    const u = cross2D(cMinusA, r) / denominator;
    return t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon;
}

function closestPointOnSegment2D(point, a, b) {
    const segment = new THREE.Vector2(b.x - a.x, b.y - a.y);
    const lengthSq = segment.lengthSq();
    if (lengthSq <= 0.000001) {
        return new THREE.Vector2(a.x, a.y);
    }

    const pointDelta = new THREE.Vector2(point.x - a.x, point.y - a.y);
    const t = THREE.MathUtils.clamp(pointDelta.dot(segment) / lengthSq, 0, 1);
    return new THREE.Vector2(a.x + (segment.x * t), a.y + (segment.y * t));
}

function getPointBoundaryCorrection(point, boundaryPolygon, movePointOut = true, padding = 0.01) {
    let best = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (let index = 0; index < boundaryPolygon.length; index += 1) {
        const start = boundaryPolygon[index];
        const end = boundaryPolygon[(index + 1) % boundaryPolygon.length];
        const closest = closestPointOnSegment2D(point, start, end);
        const delta = movePointOut
            ? closest.clone().sub(point)
            : new THREE.Vector2(point.x - closest.x, point.y - closest.y);
        const distanceSq = delta.lengthSq();

        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            best = delta;
        }
    }

    if (!best) {
        return null;
    }

    if (best.lengthSq() <= 0.000001) {
        const center = getPolygonCenter(boundaryPolygon);
        best = movePointOut
            ? new THREE.Vector2(point.x - center.x, point.y - center.y)
            : new THREE.Vector2(center.x - point.x, center.y - point.y);
        if (best.lengthSq() <= 0.000001) {
            best.set(0, padding);
        }
    }

    const distance = Math.sqrt(bestDistanceSq);
    return best.normalize().multiplyScalar(distance + padding);
}

// Edge-based depenetration: for a single exposed terrain edge, find the maximum penetration
// of any rect corner through the surface (along the outward normal) and return a correction
// vector that pushes the rect back outside + padding.
function getRectEdgePenetrationCorrection(rectPoints, edge, padding = 0.01) {
    const x1 = edge.x1, y1 = edge.y1, x2 = edge.x2, y2 = edge.y2;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.000001) return null;

    // Falling objects can't meaningfully penetrate bottom edges — skip them.
    if (edge.type === 'bottom') return null;

    // Outward normal: for a CCW polygon the interior is to the LEFT of each edge direction,
    // so the outward normal is the RIGHT perpendicular: (dy, -dx) / len.
    // We then verify the sign matches the expected facing direction for each edge type.
    let nx = dy / len, ny = -dx / len;

    if (edge.type === 'top' && ny < 0) { nx = -nx; ny = -ny; }       // must face up
    else if (edge.type === 'left' && nx > 0) { nx = -nx; ny = -ny; } // must face left
    else if (edge.type === 'right' && nx < 0) { nx = -nx; ny = -ny; } // must face right

    // For each rect corner, compute its signed distance along the outward normal.
    // Negative distance = corner is inside the solid (penetrating).
    // Edge tangent direction (along the edge, normalized).
    const tx = dx / len, ty = dy / len;
    // Edge extent along its tangent (with tolerance so corners near the endpoints are caught).
    const edgeExtent = len * 0.5 + 0.5;
    const edgeMidX = (x1 + x2) * 0.5, edgeMidY = (y1 + y2) * 0.5;

    let maxPenetration = 0; // depth of deepest penetrating corner (positive = deeper)
    let anyInRange = false;

    for (const p of rectPoints) {
        // Project corner onto edge tangent; skip if outside the edge's extent.
        const proj = tx * (p.x - edgeMidX) + ty * (p.y - edgeMidY);
        if (Math.abs(proj) > edgeExtent) continue;

        // Signed distance from edge line along outward normal.
        // signedDist > 0 → outside (safe), < 0 → inside (penetrating).
        const signedDist = nx * (p.x - x1) + ny * (p.y - y1);
        anyInRange = true;
        if (signedDist < 0) {
            const penetration = -signedDist;
            if (penetration > maxPenetration) maxPenetration = penetration;
        }
    }

    if (!anyInRange || maxPenetration <= 0) return null;

    const pushLen = maxPenetration + padding;
    return new THREE.Vector2(nx * pushLen, ny * pushLen);
}

export function levelObjectRectsIntersect(a, b) {
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

const TMP_GRAB_WORLD = new THREE.Vector3();
const TMP_COLLISION_WORLD_POSITION = new THREE.Vector3();
const TMP_COLLISION_AXIS_X = new THREE.Vector3();
const TMP_COLLISION_AXIS_Y = new THREE.Vector3();
const TMP_COLLISION_LOCAL_POSITION = new THREE.Vector3();

export class LevelObject {
    constructor({
        id,
        type,
        config,
        scene,
        loadingManager,
        spawnData = {},
        audioManager = null
    }) {
        this.id = id;
        this.type = type;
        this.scene = scene;
        this.config = config || {};
        this.spawnData = spawnData;
        this.sourceLayer = String(spawnData.sourceLayer || '').trim();
        this.sourceObjectName = String(spawnData.name || '').trim();
        this.sourceObjectType = String(spawnData.markerType || '').trim();
        this.initialVisible = spawnData.visible !== false;
        this.loadingManager = loadingManager;
        this.audioManager = audioManager;
        this.sceneObject = null;
        this.rootNode = null;
        this.pickupRootNodes = {
            root: null,
            root_top: null,
            root_bottom: null
        };
        this.pickupRootAlignmentOffsets = new Map();
        this.pickupRootLocalOffsets = new Map();
        this.grabPointNodes = {
            grab_front: null,
            grab_back: null
        };
        this.grabPointLocalOffsets = new Map();
        this.physicsAnchorBodyLocalPoints = new Map();
        this.mouthDragEnabled = this.config.mouthDrag === true || this.config.mouthDraggable === true;
        this.pickupable = this.config.pickupable !== false;
        this.draggable = this.config.draggable === true;
        this.weight = Number.isFinite(this.config.weight) ? this.config.weight : 0;
        this.maxHealth = Number.isFinite(this.config.maxHealth) ? this.config.maxHealth : 100;
        this.snapToGroundOnLoad = this.config.snapToGroundOnLoad === true;
        this.isGroundObject = this.snapToGroundOnLoad;
        this.groundOffset = Number.isFinite(this.config.groundOffset) ? this.config.groundOffset : 0;
        this.health = this.maxHealth;
        this._explicitVisible = this.initialVisible;
        this._visibilitySuppressors = new Set();
        this._visualOpacity = 1;
        // For initially-hidden objects, defer fallOnLoad/snapToGroundOnLoad until setVisible(true).
        const fallOnLoad = this.config.fallOnLoad === true && this.initialVisible;
        this._pendingOnLoadInit = !this.initialVisible && (this.config.fallOnLoad === true || this.config.snapToGroundOnLoad === true);
        this.state = fallOnLoad ? LEVEL_OBJECT_STATES.FALLING : LEVEL_OBJECT_STATES.IDLE;
        this.velocity = new THREE.Vector3();
        this.angularVelocity = 0;
        this.gravityEnabled = fallOnLoad;
        this.fallStartY = null;
        this.isDestroyed = false;
        this.freezeAtZeroHealth = false; // set by mission handler to suppress explosion
        this.pendingDestroy = false;
        this.destructionStage = 'none';
        this.destructionEffect = null;
        this.detachedDestructionEffects = [];
        this.markedForRemoval = false;
        this.explosionDamageReported = false;
        this.explosionDamageHandler = null;
        this.wreckedMorphName = this.config.wreckedMorphName || 'wrecked';
        this.wreckedBlendMeshNames = this.buildWreckedBlendMeshSet(this.config.wreckedBlendMeshes);
        this.pickupOffset = {
            position: toVector3Tuple(this.config.pickupOffset?.position),
            rotation: toVector3Tuple(this.config.pickupOffset?.rotation)
        };
        this.baseRotation = toVector3Tuple(this.config.rotation?.slice?.() || this.config.rotation, [0, 0, 0]);

        this.loader = createGLTFLoader(loadingManager);
        this.textureLoader = new THREE.TextureLoader(loadingManager);
        this.container = new THREE.Group();
        this.container.name = `LevelObject:${this.type}:${this.id}`;
        this.container.visible = this.initialVisible;
        this.scene.add(this.container);

        this.scale = Number.isFinite(this.config.modelScale) ? this.config.modelScale : 12;
        this.baseGroundOffset = 0;
        this.carryTurnYOffset = 0;
        this.meshBounds = {
            minX: -0.5,
            maxX: 0.5,
            minY: -0.5,
            maxY: 0.5
        };
        this.rootAlignmentOffset = new THREE.Vector3();
        this.collisionShellRadius = 0;
        this.collisionHorizontalRange = { minX: 0, maxX: 0 };
        this.collisionHeight = 0;
        this.collisionSupportPoints = [];
        this.configuredCollisionRect = null;
        this.configuredCollisionPolygon = null;
        this.configuredCollisionCircle = null;
        this.missingConfiguredCollisionRectWarned = false;
        this.stableRestAngles = [];
        this.currentGroundAngle = 0;
        this.currentFacingDirection = Number.isFinite(this.config.facingDirection)
            ? (this.config.facingDirection >= 0 ? 1 : -1)
            : 1;
        this.debugCollisionShell = null;
        this.debugCollisionRectBody = null;
        this.cachedConfiguredCollisionLocalRectPose = null;
        this.healthBarGroup = null;
        this.healthBarFill = null;
        this.healthBarEnabled =
            this.config.showHealthBar !== false &&
            Number.isFinite(this.config.maxHealth) &&
            this.maxHealth > 0;
        this.loaded = false;
        this.carriedBy = null;
        this.carriedSocket = null;
        this.draggedBy = null;
        this.dragGrabPointName = null;
        this.matterCarryJointActive = false;
        this.matterDragJointActive = false;
        this.animationMixer = null;
        this.animationClips = new Map();
        this.animationClipActions = new Map();
        this.animationClipActionsNormalized = new Map();
        this.activeInteractionAnimationAction = null;
        this.activeInteractionAnimationName = null;
        this.timelineAnimationControlled = false;
        this.dropVisualPoseLocked = false;
        this.polygonTerrainContactLastFrame = false;
        this._sleepTimer = 0;
        this.missingRuntimeCollisionRectWarned = false;
        this.wreckedMorphTargets = [];
        this.visualHideTimer = undefined;
        this.physicsWorld = null;
        this.levelObjectManager = null;
        this.matterBody = null;
        this.missingMatterBodyWarned = false;
        this.carryFacingYaw = 0;

        const spawnX = Number.isFinite(spawnData.x) ? spawnData.x : 0;
        const spawnY = Number.isFinite(spawnData.y) ? spawnData.y : 0;
        const spawnZ = Number.isFinite(spawnData.z) ? spawnData.z : 0;
        const layerZOffset = Number.isFinite(this.config.layerZOffset) ? this.config.layerZOffset : 0;
        this.groundLayerZ = spawnZ + layerZOffset;
        this.container.position.set(spawnX, spawnY, this.groundLayerZ);
    }

    getDebugLabel() {
        const sourceDetails = [];
        if (this.sourceObjectName) {
            sourceDetails.push(`name="${this.sourceObjectName}"`);
        }
        if (this.sourceObjectType && this.sourceObjectType !== this.type) {
            sourceDetails.push(`markerType="${this.sourceObjectType}"`);
        }

        return `${this.type}#${this.id}${sourceDetails.length ? ` (${sourceDetails.join(', ')})` : ''}`;
    }

    async load() {
        const [gltf, texture] = await Promise.all([
            loaderLoadAsyncWithRetry(this.loader, this.config.modelPath),
            this.loadConfiguredTexture()
        ]);
        this.sceneObject = gltf.scene;
        this.sceneObject.name = `${this.type}:${this.id}:scene`;
        this.sceneObject.scale.setScalar(this.scale);
        this.sceneObject.visible = this.initialVisible;
        this.container.add(this.sceneObject);
        this.sceneObject.updateMatrixWorld(true);
        this.setupAnimationClips(gltf.animations);

        this.pickupRootNodes = this.findPickupRootNodes(this.sceneObject);
        this.rootNode = this.findRootNode(this.sceneObject);
        this.grabPointNodes = this.findGrabPointNodes(this.sceneObject);
        this.wreckedMorphTargets = this.findWreckedMorphTargets(this.sceneObject);
        this.warnIfWreckedBlendFilterHasNoMatches();
        this.prepareSceneObject(this.sceneObject, texture);
        this.setVisualOpacity(this._visualOpacity);

        this.container.updateMatrixWorld(true);
        const containerWorldPosition = this.container.getWorldPosition(new THREE.Vector3());
        const bounds = new THREE.Box3().setFromObject(this.sceneObject);
        const boundsSize = bounds.getSize(new THREE.Vector3());
        const localMinX = bounds.min.x - containerWorldPosition.x;
        const localMaxX = bounds.max.x - containerWorldPosition.x;
        const localMinY = bounds.min.y - containerWorldPosition.y;
        const localMaxY = bounds.max.y - containerWorldPosition.y;
        this.baseGroundOffset = Number.isFinite(bounds.min.y)
            ? (containerWorldPosition.y - bounds.min.y)
            : 0;
        this.buildCollisionShapeData({
            width: boundsSize.x,
            height: boundsSize.y,
            localMinX,
            localMaxX,
            localMinY,
            localMaxY
        });

        this.cachePickupRootAlignmentOffsets();

        this.setupDebugCollisionShell();
        this.setupHealthBar();
        this.applyGroundAlignment();
        this.cacheGrabPointLocalOffsets();
        this.cachePhysicsAnchorBodyLocalPoints();
        this.stableRestAngles = this.buildStableRestAngles();
        this.updateWreckedMorph();
        this.loaded = true;
        return this;
    }

    setupDebugCollisionShell() {
        this.disposeDebugCollisionShell();

        if (!CONFIG.LEVEL_OBJECTS?.debugRenderCollisionShell || this.collisionShellRadius <= 0.0001) {
            return;
        }

        this.debugCollisionShell = new THREE.LineSegments(
            new THREE.BufferGeometry(),
            new THREE.LineBasicMaterial({
                color: 0x00ff88,
                transparent: true,
                opacity: 0.9,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        this.debugCollisionShell.name = `${this.type}:${this.id}:CollisionShell`;
        this.debugCollisionShell.renderOrder = 9999;
        this.scene.add(this.debugCollisionShell);
        this.syncDebugCollisionShellTransform();
    }

    disposeDebugCollisionShell() {
        this.debugCollisionShell?.traverse((child) => {
            child.geometry?.dispose?.();

            if (Array.isArray(child.material)) {
                for (const material of child.material) {
                    material?.dispose?.();
                }
            } else {
                child.material?.dispose?.();
            }
        });
        this.debugCollisionShell?.removeFromParent();
        this.debugCollisionShell = null;
        this.debugCollisionRectBody = null;
    }

    setupHealthBar() {
        this.disposeHealthBar();
        if (!this.healthBarEnabled) {
            return;
        }

        const width = Math.max((this.meshBounds.maxX - this.meshBounds.minX) * 0.85, 1.4);
        const height = 0.34;
        const fillInset = 0.04;
        const fillWidth = Math.max(width - (fillInset * 2), 0.001);
        const fillHeight = Math.max(height - (fillInset * 2), 0.001);
        const yOffset = this.baseGroundOffset + Math.max(this.collisionHeight * 1.05, 2.2);
        const zOffset = 0.35;

        const group = new THREE.Group();
        group.name = `${this.type}:${this.id}:HealthBar`;
        group.position.set(0, yOffset, zOffset);
        group.renderOrder = 9500;

        const background = new THREE.Mesh(
            new THREE.PlaneGeometry(width, height),
            new THREE.MeshBasicMaterial({
                color: 0x111111,
                transparent: true,
                opacity: 0.82,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        background.renderOrder = 9500;
        group.add(background);

        const fill = new THREE.Mesh(
            new THREE.PlaneGeometry(fillWidth, fillHeight),
            new THREE.MeshBasicMaterial({
                color: 0x56e05e,
                transparent: true,
                opacity: 0.95,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        fill.position.set(-(fillWidth * 0.5), 0, 0.001);
        fill.renderOrder = 9501;
        group.add(fill);

        this.container.add(group);
        this.healthBarGroup = group;
        this.healthBarFill = fill;
        this.updateHealthBarVisual();
    }

    disposeHealthBar() {
        this.healthBarGroup?.traverse((child) => {
            child.geometry?.dispose?.();
            if (Array.isArray(child.material)) {
                for (const material of child.material) {
                    material?.dispose?.();
                }
            } else {
                child.material?.dispose?.();
            }
        });
        this.healthBarGroup?.removeFromParent();
        this.healthBarGroup = null;
        this.healthBarFill = null;
    }

    updateHealthBarVisual() {
        if (!this.healthBarFill || !this.healthBarGroup || this.maxHealth <= 0) {
            return;
        }

        const healthRatio = THREE.MathUtils.clamp(this.health / this.maxHealth, 0, 1);
        const hiddenByInteraction =
            this.state === LEVEL_OBJECT_STATES.CARRIED ||
            this.state === LEVEL_OBJECT_STATES.GRABBED ||
            this.state === LEVEL_OBJECT_STATES.DRAGGED;
        this.healthBarGroup.visible =
            !this.markedForRemoval &&
            this.state !== LEVEL_OBJECT_STATES.DESTROYED &&
            !hiddenByInteraction;
        this.healthBarFill.scale.x = Math.max(healthRatio, 0.0001);
        const fillWidth = this.healthBarFill.geometry.parameters.width;
        // Keep the fill left edge locked to the bar's left edge while scaling.
        this.healthBarFill.position.x = -((fillWidth * (1 - this.healthBarFill.scale.x)) * 0.5);

        const fullColor = new THREE.Color(0x56e05e);
        const lowColor = new THREE.Color(0xe05b5b);
        this.healthBarFill.material.color.copy(lowColor).lerp(fullColor, healthRatio);
    }

    createDebugCollisionMaterial() {
        return new THREE.MeshBasicMaterial({
            color: 0x00ff88,
            wireframe: true,
            transparent: true,
            opacity: 0.75,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
    }

    setupAnimationClips(clips = []) {
        this.animationMixer = null;
        this.animationClips.clear();
        this.animationClipActions.clear();
        this.animationClipActionsNormalized.clear();
        this.activeInteractionAnimationAction = null;
        this.activeInteractionAnimationName = null;

        if (!this.sceneObject || !Array.isArray(clips) || clips.length === 0) {
            return;
        }

        this.animationMixer = new THREE.AnimationMixer(this.sceneObject);
        for (const clip of clips) {
            if (!clip?.name) {
                continue;
            }

            this.animationClips.set(clip.name, clip);
            const action = this.animationMixer.clipAction(clip);
            action.enabled = true;
            action.setEffectiveTimeScale(1);
            action.setEffectiveWeight(1);
            this.animationClipActions.set(clip.name, action);
            const normalizedName = normalizeTypeName(clip.name).replace(/[^a-z0-9]+/g, '');
            if (normalizedName && !this.animationClipActionsNormalized.has(normalizedName)) {
                this.animationClipActionsNormalized.set(normalizedName, action);
            }
        }
    }

    normalizeAnimationClipName(name) {
        return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    resolveTimelineClipAction(animationName) {
        const exactName = String(animationName || '').trim();
        if (!exactName) {
            return null;
        }

        const exactAction = this.animationClipActions.get(exactName);
        if (exactAction) {
            return exactAction;
        }

        const normalizedName = this.normalizeAnimationClipName(exactName);
        if (!normalizedName) {
            return null;
        }

        return this.animationClipActionsNormalized.get(normalizedName) || null;
    }

    getInteractionAnimationName(anchorName) {
        const normalizedAnchorName = normalizeTypeName(anchorName);
        if (!normalizedAnchorName) {
            return null;
        }

        return `${normalizedAnchorName}-loop`;
    }

    playInteractionAnimationByName(animationName) {
        if (!animationName || !this.animationMixer) {
            this.stopInteractionAnimation();
            return false;
        }

        const clip = this.animationClips.get(animationName);
        if (!clip) {
            this.stopInteractionAnimation();
            return false;
        }

        if (this.activeInteractionAnimationName === animationName && this.activeInteractionAnimationAction) {
            return true;
        }

        this.stopInteractionAnimation();

        const action = this.animationMixer.clipAction(clip);
        action.reset();
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.enabled = true;
        action.play();

        this.activeInteractionAnimationAction = action;
        this.activeInteractionAnimationName = animationName;
        return true;
    }

    playTimelineAnimation(animationName, options = {}) {
        if (!this.animationMixer) {
            return false;
        }

        const action = this.resolveTimelineClipAction(animationName);
        if (!action) {
            this.stopInteractionAnimation();
            return false;
        }

        const loop = options.loop !== false;
        if (this.activeInteractionAnimationAction && this.activeInteractionAnimationAction !== action) {
            this.activeInteractionAnimationAction.stop();
        }

        action.reset();
        action.enabled = true;
        action.setEffectiveTimeScale(1);
        action.setEffectiveWeight(1);
        action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
        action.clampWhenFinished = !loop;
        action.play();

        this.activeInteractionAnimationAction = action;
        this.activeInteractionAnimationName = String(animationName || '').trim();
        return true;
    }

    setTimelineAnimationControlled(isControlled) {
        this.timelineAnimationControlled = isControlled === true;
        if (!this.timelineAnimationControlled) {
            return;
        }

        this.stopInteractionAnimation();
    }

    playInteractionAnimationForAnchor(anchorName) {
        const animationName = this.getInteractionAnimationName(anchorName);
        return this.playInteractionAnimationByName(animationName);
    }

    getFallingAnimationName() {
        if (typeof this.config?.fallingAnimationName === 'string' && this.config.fallingAnimationName.trim()) {
            return this.config.fallingAnimationName.trim();
        }

        return 'falling-loop';
    }

    getAirborneAnimationSlop() {
        return Math.max(
            0,
            Number.isFinite(this.config?.airborneAnimationSlop)
                ? this.config.airborneAnimationSlop
                : 0.08
        );
    }

    isAboveGround(level) {
        if (!this.sceneObject) {
            return false;
        }

        const rectPoints = this.getPhysicsCollisionRectWorldPoints();
        const collisionEdges = this.getLevelCollisionEdges(level);
        if (!rectPoints.length || !collisionEdges.length) {
            return true;
        }

        const slop = this.getAirborneAnimationSlop();
        for (const edge of collisionEdges) {
            if (getRectEdgePenetrationCorrection(rectPoints, edge, slop)) {
                return false;
            }
        }

        return true;
    }

    shouldPlayAirborneAnimation(level) {
        if (this.state === LEVEL_OBJECT_STATES.CARRIED || this.isMouthDragged()) {
            return false;
        }

        return this.state === LEVEL_OBJECT_STATES.FALLING &&
            this.gravityEnabled &&
            this.isAboveGround(level);
    }

    restoreInteractionAnimationForCurrentState() {
        if (this.state === LEVEL_OBJECT_STATES.DRAGGED && this.dragGrabPointName) {
            this.playInteractionAnimationForAnchor(this.dragGrabPointName);
            return;
        }

        if (
            this.state === LEVEL_OBJECT_STATES.CARRIED ||
            this.state === LEVEL_OBJECT_STATES.GRABBED
        ) {
            this.playInteractionAnimationForAnchor(this.getSelectedPickupRootName());
            return;
        }

        this.stopInteractionAnimation();
    }

    updateAirborneInteractionAnimation(level) {
        const fallingAnimationName = this.getFallingAnimationName();
        if (!fallingAnimationName || !this.animationMixer) {
            return;
        }

        if (!this.animationClips.has(fallingAnimationName)) {
            if (this.activeInteractionAnimationName === fallingAnimationName) {
                this.restoreInteractionAnimationForCurrentState();
            }
            return;
        }

        if (this.shouldPlayAirborneAnimation(level)) {
            this.playInteractionAnimationByName(fallingAnimationName);
            return;
        }

        if (this.activeInteractionAnimationName === fallingAnimationName) {
            this.restoreInteractionAnimationForCurrentState();
        }
    }

    stopInteractionAnimation() {
        if (this.activeInteractionAnimationAction) {
            this.activeInteractionAnimationAction.stop();
        }

        this.activeInteractionAnimationAction = null;
        this.activeInteractionAnimationName = null;
    }

    updateInteractionAnimation(delta) {
        if (!this.animationMixer || !Number.isFinite(delta) || delta <= 0) {
            return;
        }

        if (this.isOffScreen) {
            return;
        }

        this.animationMixer.update(delta);
        this.syncCarriedPickupRootToSocket();
    }

    createDebugCollisionRectShell() {
        const rect = this.configuredCollisionRect;
        if (!rect) {
            return null;
        }

        const depth = Number.isFinite(rect.debugDepth) ? Math.max(rect.debugDepth, 0.01) : 0.8;
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(rect.width, rect.height, depth),
            this.createDebugCollisionMaterial()
        );
        body.name = `${this.type}:${this.id}:ConfiguredHitRect`;
        body.renderOrder = 9999;
        this.debugCollisionRectBody = body;
        return body;
    }

    getConfiguredCollisionWorldRectRaw() {
        const rect = this.configuredCollisionRect;
        const collisionBasisNode = this.sceneObject;
        if (!rect || !collisionBasisNode) {
            return null;
        }

        if (this.state === LEVEL_OBJECT_STATES.CARRIED && this.carriedSocket) {
            this.syncCarriedPickupRootToSocket();
        }

        this.container?.updateWorldMatrix?.(true, true);
        collisionBasisNode.updateWorldMatrix(true, true);
        collisionBasisNode.getWorldPosition(TMP_COLLISION_WORLD_POSITION);

        // Collision rect offsets are authored in sceneObject-local space, so use the sceneObject
        // transform as the world-space basis. Importantly, derive local X and Y from the actual
        // projected world axes instead of inventing Y as a perpendicular to X. A 180deg facing
        // flip reverses projected X, but it does not invert the object's authored local-up axis.
        const { axisX: baseAxisX, axisY: baseAxisY } = getPlanarWorldAxes(
            collisionBasisNode,
            this.currentGroundAngle ?? 0
        );
        const localRectAngle = Number.isFinite(rect.angle) ? rect.angle : 0;
        const rectCos = Math.cos(localRectAngle);
        const rectSin = Math.sin(localRectAngle);
        const rectAxisX = baseAxisX.clone().multiplyScalar(rectCos).add(baseAxisY.clone().multiplyScalar(rectSin));
        const rectAxisY = baseAxisX.clone().multiplyScalar(-rectSin).add(baseAxisY.clone().multiplyScalar(rectCos));
        TMP_COLLISION_AXIS_X.set(rectAxisX.x, rectAxisX.y, 0);
        TMP_COLLISION_AXIS_Y.set(rectAxisY.x, rectAxisY.y, 0);
        const angle = Math.atan2(rectAxisX.y, rectAxisX.x);

        return {
            centerX:
                TMP_COLLISION_WORLD_POSITION.x +
                (TMP_COLLISION_AXIS_X.x * rect.offsetX) +
                (TMP_COLLISION_AXIS_Y.x * rect.offsetY),
            centerY:
                TMP_COLLISION_WORLD_POSITION.y +
                (TMP_COLLISION_AXIS_X.y * rect.offsetX) +
                (TMP_COLLISION_AXIS_Y.y * rect.offsetY),
            halfWidth: Math.max(rect.width * 0.5, 0.001),
            halfHeight: Math.max(rect.height * 0.5, 0.001),
            angle
        };
    }

    syncDebugCollisionShellTransform() {
        if (!this.sceneObject) {
            return;
        }

        const rect = this.getConfiguredCollisionWorldRect();
        if (!rect) {
            return;
        }

        TMP_COLLISION_LOCAL_POSITION.set(rect.centerX, rect.centerY, this.container.position.z);
        this.container.worldToLocal(TMP_COLLISION_LOCAL_POSITION);
        const containerWorldAngle = getPlanarWorldAngle(this.container, 0);
        const localAngle = rect.angle - containerWorldAngle;

        this.cachedConfiguredCollisionLocalRectPose = {
            centerX: TMP_COLLISION_LOCAL_POSITION.x,
            centerY: TMP_COLLISION_LOCAL_POSITION.y,
            angle: localAngle
        };

        if (!this.debugCollisionShell) {
            return;
        }

        const worldPoints = this.getCollisionPolygonWorldPoints();
        const z = (this.container?.position?.z ?? 0) + 0.25;
        const linePoints = [];

        for (let index = 0; index < worldPoints.length; index += 1) {
            const point = worldPoints[index];
            const nextPoint = worldPoints[(index + 1) % worldPoints.length];
            linePoints.push(
                new THREE.Vector3(point.x, point.y, z),
                new THREE.Vector3(nextPoint.x, nextPoint.y, z)
            );
        }

        if (worldPoints.length === 4) {
            linePoints.push(
                new THREE.Vector3(worldPoints[0].x, worldPoints[0].y, z),
                new THREE.Vector3(worldPoints[2].x, worldPoints[2].y, z),
                new THREE.Vector3(worldPoints[1].x, worldPoints[1].y, z),
                new THREE.Vector3(worldPoints[3].x, worldPoints[3].y, z)
            );
        }

        this.debugCollisionShell.geometry?.dispose?.();
        this.debugCollisionShell.geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        this.debugCollisionShell.position.set(0, 0, 0);
        this.debugCollisionShell.rotation.set(0, 0, 0);
        this.debugCollisionShell.scale.set(1, 1, 1);
    }

    readConfiguredCollisionRect(boundsData = {}) {
        // `collisionRect` is the canonical authored rectangle shape. Older aliases stay as a
        // compatibility fallback for any legacy or externally-authored data that still uses them.
        const explicitRectConfig = this.config.collisionRect || this.config.hitRect;
        const physicsRectConfig = this.config.physics;
        const rectConfig = explicitRectConfig || physicsRectConfig;
        if (!rectConfig || typeof rectConfig !== 'object') {
            return null;
        }

        // collisionRectInModelSpace: true means width/height/offset are authored in the
        // model's local unit space and should be multiplied by modelScale to get world units.
        const rectScale = rectConfig.modelSpace === true ? (this.scale ?? 1) : 1;

        const width = Number.isFinite(rectConfig.width) ? Math.max(rectConfig.width * rectScale, 0.001) : null;
        const height = Number.isFinite(rectConfig.height) ? Math.max(rectConfig.height * rectScale, 0.001) : null;
        if (width == null || height == null) {
            return null;
        }

        const derivedCenterX = (
            Number.isFinite(boundsData.localMinX) &&
            Number.isFinite(boundsData.localMaxX)
        )
            ? (boundsData.localMinX + boundsData.localMaxX) * 0.5
            : 0;
        const derivedCenterY = (
            Number.isFinite(boundsData.localMinY) &&
            Number.isFinite(boundsData.localMaxY)
        )
            ? (boundsData.localMinY + boundsData.localMaxY) * 0.5
            : 0;
        const offset = Array.isArray(rectConfig.offset)
            ? rectConfig.offset
            : (Array.isArray(rectConfig.center)
                ? rectConfig.center
                : rectConfig.bodyOffset);

        return {
            width,
            height,
            offsetX: Number.isFinite(offset?.[0]) ? offset[0] * rectScale : derivedCenterX,
            offsetY: Number.isFinite(offset?.[1]) ? offset[1] * rectScale : derivedCenterY,
            angle: Number.isFinite(rectConfig.angle) ? rectConfig.angle : 0,
            debugDepth: Number.isFinite(rectConfig.debugDepth) ? rectConfig.debugDepth : null
        };
    }

    applyConfiguredCollisionRect(rect) {
        this.configuredCollisionRect = rect;

        const halfWidth = rect.width * 0.5;
        const halfHeight = rect.height * 0.5;
        const minX = rect.offsetX - halfWidth;
        const maxX = rect.offsetX + halfWidth;
        const minY = rect.offsetY - halfHeight;
        const maxY = rect.offsetY + halfHeight;

        this.meshBounds = { minX, maxX, minY, maxY };
        this.collisionHorizontalRange = { minX, maxX };
        this.collisionHeight = rect.height;
        this.collisionSupportPoints = [
            new THREE.Vector2(minX, minY),
            new THREE.Vector2(maxX, minY),
            new THREE.Vector2(maxX, maxY),
            new THREE.Vector2(minX, maxY)
        ];
        this.collisionShellRadius = Math.max(
            Math.abs(minX),
            Math.abs(maxX),
            Math.abs(minY),
            Math.abs(maxY)
        );
    }

    // Read collisionPolygon from config. Points are in model-local units at modelScale 1,
    // same convention as deckPolygon. sceneObject.matrixWorld encodes modelScale at runtime.
    readConfiguredCollisionPolygon() {
        const raw = this.config.collisionPolygon;
        if (!Array.isArray(raw) || raw.length < 3) return null;
        return raw.map(([x, y]) => ({ x, y }));
    }

    applyConfiguredCollisionPolygon(localPoints) {
        this.configuredCollisionPolygon = localPoints;

        // localPoints are in model-local units at modelScale 1. Compute bounds in local space.
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        let maxR = 0;
        for (const { x, y } of localPoints) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            maxR = Math.max(maxR, Math.hypot(x, y));
        }

        this.meshBounds = { minX, maxX, minY, maxY };
        this.collisionHorizontalRange = { minX, maxX };
        this.collisionHeight = maxY - minY;
        this.collisionSupportPoints = localPoints.map((p) => new THREE.Vector2(p.x, p.y));
        this.collisionShellRadius = maxR;

        // Provide a scaled bounding rect so rect-based systems (explosion damage, etc.) still work.
        // getConfiguredCollisionWorldRectRaw adds offsetX/Y along world-space axes without scaling,
        // so pre-apply modelScale here to match what matrixWorld encodes for the polygon path.
        const s = this.scale ?? 1;
        const w = (maxX - minX) * s;
        const h = (maxY - minY) * s;
        this.configuredCollisionRect = {
            width: w,
            height: h,
            offsetX: (minX + maxX) * 0.5 * s,
            offsetY: (minY + maxY) * 0.5 * s,
            angle: 0,
            debugDepth: null
        };
    }

    readConfiguredCollisionCircle() {
        const cfg = this.config.collisionCircle;
        if (!cfg || typeof cfg !== 'object') return null;
        // Radius and offset are always authored in model-local units at modelScale 1,
        // matching the convention used by collisionPolygon. Always multiply by this.scale.
        const s = this.scale ?? 1;
        const radius = Number.isFinite(cfg.radius) ? Math.max(cfg.radius * s, 0.001) : null;
        if (radius == null) return null;
        return {
            radius,
            offsetX: Number.isFinite(cfg.offset?.[0]) ? cfg.offset[0] * s : 0,
            offsetY: Number.isFinite(cfg.offset?.[1]) ? cfg.offset[1] * s : 0,
            sides: Number.isFinite(cfg.sides) ? Math.max(3, Math.floor(cfg.sides)) : undefined
        };
    }

    applyConfiguredCollisionCircle(circle) {
        this.configuredCollisionCircle = circle;
        const r = circle.radius;
        const ox = circle.offsetX;
        const oy = circle.offsetY;
        this.meshBounds = { minX: ox - r, maxX: ox + r, minY: oy - r, maxY: oy + r };
        this.collisionHorizontalRange = { minX: ox - r, maxX: ox + r };
        this.collisionHeight = r * 2;
        this.collisionShellRadius = r + Math.hypot(ox, oy);
        this.collisionSupportPoints = [
            new THREE.Vector2(ox - r, oy - r),
            new THREE.Vector2(ox + r, oy - r),
            new THREE.Vector2(ox + r, oy + r),
            new THREE.Vector2(ox - r, oy + r)
        ];
        // Provide rect fallback so explosion/damage/placement code still works.
        this.configuredCollisionRect = {
            width: r * 2,
            height: r * 2,
            offsetX: ox,
            offsetY: oy,
            angle: 0,
            debugDepth: null
        };
    }

    buildCollisionShapeData(boundsData) {
        this.meshBounds = {
            minX: Number.isFinite(boundsData.localMinX) ? boundsData.localMinX : -0.5,
            maxX: Number.isFinite(boundsData.localMaxX) ? boundsData.localMaxX : 0.5,
            minY: Number.isFinite(boundsData.localMinY) ? boundsData.localMinY : -0.5,
            maxY: Number.isFinite(boundsData.localMaxY) ? boundsData.localMaxY : 0.5
        };
        this.collisionHeight = 0;
        this.collisionSupportPoints = [];
        this.configuredCollisionRect = null;
        this.configuredCollisionPolygon = null;
        this.configuredCollisionCircle = null;
        this.collisionHorizontalRange = { minX: 0, maxX: 0 };
        this.collisionShellRadius = 0;

        const configuredPolygon = this.readConfiguredCollisionPolygon();
        if (configuredPolygon) {
            this.applyConfiguredCollisionPolygon(configuredPolygon);
            return;
        }

        const configuredCircle = this.readConfiguredCollisionCircle();
        if (configuredCircle) {
            this.applyConfiguredCollisionCircle(configuredCircle);
            return;
        }

        const configuredRect = this.readConfiguredCollisionRect(boundsData);
        if (configuredRect) {
            // LevelObjects use explicit authored rectangle data only. We no longer derive
            // collision shapes from the mesh because that made placement and runtime behavior
            // too implicit and hard to tune.
            this.applyConfiguredCollisionRect(configuredRect);
            return;
        }

        if (!this.missingConfiguredCollisionRectWarned) {
            this.missingConfiguredCollisionRectWarned = true;
            console.warn(
                `[LevelObject] No collision rectangle defined for ${this.getDebugLabel()}; collision shape disabled until a rect is authored.`
            );
        }
    }

    async loadConfiguredTexture() {
        if (!this.config.texturePath) {
            return null;
        }

        try {
            let texturePromise = SHARED_LEVEL_OBJECT_TEXTURE_PROMISES.get(this.config.texturePath);
            if (!texturePromise) {
                texturePromise = this.textureLoader.loadAsync(this.config.texturePath).then((texture) => {
                    // GLB UVs expect externally loaded textures to use glTF sampling conventions.
                    texture.colorSpace = THREE.SRGBColorSpace;
                    texture.flipY = false;
                    return texture;
                });
                SHARED_LEVEL_OBJECT_TEXTURE_PROMISES.set(this.config.texturePath, texturePromise);
            }
            const texture = await texturePromise;
            // GLB UVs expect externally loaded textures to use glTF sampling conventions.
            return texture;
        } catch (error) {
            SHARED_LEVEL_OBJECT_TEXTURE_PROMISES.delete(this.config.texturePath);
            console.warn(`[LevelObject] Failed to load texture for ${this.type}:`, this.config.texturePath, error);
            return null;
        }
    }

    prepareSceneObject(sceneObject, texture = null) {
        sceneObject.traverse((child) => {
            if (!child?.isMesh) {
                return;
            }

            child.frustumCulled = true;
            if (child.geometry) {
                child.geometry.computeBoundingBox();
                child.geometry.computeBoundingSphere();
            }
            child.castShadow = false;
            child.receiveShadow = false;

            const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
            const nextMaterials = sourceMaterials.map((material) => {
                if (!material) {
                    return material;
                }

                return new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    map: texture ?? material.map ?? null,
                    transparent: material.transparent === true,
                    opacity: material.opacity ?? 1,
                    alphaTest: material.alphaTest ?? 0,
                    side: material.side ?? THREE.FrontSide,
                    depthTest: true,
                    depthWrite: true,
                    toneMapped: false,
                    fog: false
                });
            });

            child.material = Array.isArray(child.material) ? nextMaterials : nextMaterials[0];
        });
    }

    findPickupRootNodes(sceneObject = this.sceneObject) {
        const nodes = {
            root: null,
            root_top: null,
            root_bottom: null
        };

        sceneObject?.traverse((child) => {
            const normalizedName = normalizeTypeName(child?.name);
            if (normalizedName === 'root') {
                nodes.root = child;
            } else if (normalizedName === 'root_top') {
                nodes.root_top = child;
            } else if (normalizedName === 'root_bottom') {
                nodes.root_bottom = child;
            }
        });

        return nodes;
    }

    findRootNode(sceneObject = this.sceneObject) {
        if (!sceneObject) {
            return null;
        }

        const pickupRootNodes = this.pickupRootNodes || this.findPickupRootNodes(sceneObject);
        // New vehicle GLBs expose root_top/root_bottom for pickup. Keep the old root fallback
        // so older objects still load safely.
        return pickupRootNodes.root || pickupRootNodes.root_top || pickupRootNodes.root_bottom || sceneObject;
    }

    findGrabPointNodes(sceneObject = this.sceneObject) {
        const nodes = {
            grab_front: null,
            grab_back: null
        };

        sceneObject?.traverse((child) => {
            if (!child?.name) {
                return;
            }

            if (child.name === 'grab_front') {
                nodes.grab_front = child;
            } else if (child.name === 'grab_back') {
                nodes.grab_back = child;
            }
        });

        return nodes;
    }

    findWreckedMorphTargets(sceneObject = this.sceneObject) {
        const normalizedMorphName = normalizeTypeName(this.wreckedMorphName);
        const targets = [];

        sceneObject?.traverse((child) => {
            if (!child?.isMesh || !child.morphTargetDictionary || !child.morphTargetInfluences) {
                return;
            }

            const matchingEntry = Object.entries(child.morphTargetDictionary).find(([name]) => (
                normalizeTypeName(name) === normalizedMorphName
            ));

            if (!matchingEntry) {
                return;
            }

            targets.push({
                mesh: child,
                index: matchingEntry[1]
            });
        });

        return targets;
    }

    buildWreckedBlendMeshSet(meshNames) {
        if (!Array.isArray(meshNames) || meshNames.length === 0) {
            return null;
        }

        const validNames = meshNames
            .map((name) => normalizeTypeName(name))
            .filter((name) => name.length > 0);
        if (validNames.length === 0) {
            return null;
        }

        return new Set(validNames);
    }

    shouldApplyPartialWreckedBlendToMesh(mesh) {
        // Default behavior: when no filter is configured, all meshes blend as damage increases.
        if (!this.wreckedBlendMeshNames || this.wreckedBlendMeshNames.size === 0) {
            return true;
        }

        // Configured behavior: only explicitly listed mesh names receive partial damage blending.
        // We check mesh and full ancestor chain names so authored node names still work even if
        // the final render mesh is nested under helper groups.
        const candidates = [
            normalizeTypeName(mesh?.name),
            normalizeTypeName(mesh?.geometry?.name),
            normalizeTypeName(mesh?.userData?.name),
            normalizeTypeName(mesh?.userData?.originalName)
        ];
        let node = mesh?.parent || null;
        let safety = 0;
        while (node && safety < 48) {
            candidates.push(normalizeTypeName(node?.name));
            node = node.parent || null;
            safety += 1;
        }
        return candidates.some((name) => name.length > 0 && this.wreckedBlendMeshNames.has(name));
    }

    warnIfWreckedBlendFilterHasNoMatches() {
        if (!this.wreckedBlendMeshNames || this.wreckedBlendMeshNames.size === 0) {
            return;
        }

        const hasAnyMatch = this.wreckedMorphTargets.some((target) => this.shouldApplyPartialWreckedBlendToMesh(target.mesh));
        if (hasAnyMatch) {
            return;
        }

        const availableNames = new Set();
        for (const target of this.wreckedMorphTargets) {
            const meshName = normalizeTypeName(target?.mesh?.name);
            const parentName = normalizeTypeName(target?.mesh?.parent?.name);
            if (meshName) {
                availableNames.add(meshName);
            }
            if (parentName) {
                availableNames.add(parentName);
            }
        }

        console.warn(
            `[LevelObject] wreckedBlendMeshes for "${this.type}" matched no wrecked morph meshes.`,
            {
                configured: Array.from(this.wreckedBlendMeshNames),
                available: Array.from(availableNames)
            }
        );
    }

    applyGroundAlignment() {
        if (!this.sceneObject) {
            return;
        }

        const visualGroundAngle = this.getVisualGroundAngle();
        this.sceneObject.position.set(
            0,
            this.baseGroundOffset,
            0
        );
        this.sceneObject.rotation.set(
            this.baseRotation.x,
            this.baseRotation.y + this.getFacingYawOffset() + (this.carryTurnYOffset ?? 0),
            this.baseRotation.z + visualGroundAngle
        );
        this.syncDebugCollisionShellTransform();
    }

    getFacingYawOffset() {
        return this.currentFacingDirection < 0 ? Math.PI : 0;
    }

    shouldStayUprightOnSlope() {
        return (
            this.config?.behavior === 'human' &&
            this.config?.uprightOnSlope === true &&
            this.state === LEVEL_OBJECT_STATES.IDLE &&
            !this.gravityEnabled
        );
    }

    getVisualGroundAngle() {
        if (this.shouldStayUprightOnSlope()) {
            return 0;
        }

        // The physics body still uses currentGroundAngle as the real world slope. The visual
        // model is yaw-flipped for left-facing cars, so its displayed Z slope is mirrored.
        return this.currentFacingDirection < 0
            ? -this.currentGroundAngle
            : this.currentGroundAngle;
    }

    setFacingDirection(direction) {
        if (!Number.isFinite(direction) || direction === 0) {
            return;
        }

        const prev = this.currentFacingDirection >= 0 ? 1 : -1;
        const next = direction >= 0 ? 1 : -1;
        this.currentFacingDirection = next;

        if (prev !== next) {
            for (const [, offset] of this.grabPointLocalOffsets) {
                offset.x = -offset.x;
            }
            for (const [, offset] of this.pickupRootLocalOffsets) {
                offset.x = -offset.x;
            }
            this.cachePhysicsAnchorBodyLocalPoints();
        }
    }

    applyCarryAlignment() {
        if (!this.sceneObject) {
            return;
        }

        // Use the authored pickup root as the carry anchor. Carry pose should be a fixed local
        // pose under the dino, then the dino's carry socket provides the world-facing turn.
        // That keeps lifting consistent regardless of how the object was lying on the ground or
        // which way the dino is facing when it picks the object up.
        this.sceneObject.position.set(0, 0, 0);
        this.sceneObject.rotation.set(
            this.baseRotation.x + this.pickupOffset.rotation.x,
            this.baseRotation.y + this.pickupOffset.rotation.y + Math.PI/2,
            this.baseRotation.z + this.pickupOffset.rotation.z
        );
        this.container.updateMatrixWorld(true);
        this.sceneObject.updateMatrixWorld(true);

        const selectedRootPosition = this.container.worldToLocal(
            this.getPickupRootWorldPosition(new THREE.Vector3())
        );
        this.sceneObject.position.copy(this.pickupOffset.position).sub(selectedRootPosition);
        this.sceneObject.updateMatrixWorld(true);
        this.syncDebugCollisionShellTransform();
    }

    applyPreservedCarryRotationOffset() {
        if (!this.sceneObject) {
            return;
        }

        if (this.pickupOffset.rotation.lengthSq() <= 0.000001) {
            return;
        }

        this.sceneObject.rotation.set(
            this.sceneObject.rotation.x + this.pickupOffset.rotation.x,
            this.sceneObject.rotation.y + this.pickupOffset.rotation.y,
            this.sceneObject.rotation.z + this.pickupOffset.rotation.z
        );
        this.sceneObject.updateMatrixWorld(true);
    }

    applyMouthDragFacingCorrection() {
        if (!this.sceneObject) {
            return;
        }

        // Human locomotion uses a visual Y flip for left-facing movement. During mouth drag,
        // keeping that flip applies an extra 180deg yaw on left-facing grabs.
        if (this.config?.behavior !== 'human') {
            return;
        }

        const facingYawOffset = this.getFacingYawOffset();
        if (Math.abs(facingYawOffset) <= 0.000001) {
            return;
        }

        this.sceneObject.rotation.y -= facingYawOffset;
        this.sceneObject.updateMatrixWorld(true);
    }

    syncCarriedPickupRootToSocket() {
        if (this.isPhysicsCarried()) {
            return false;
        }

        if (this.state !== LEVEL_OBJECT_STATES.CARRIED || !this.carriedSocket) {
            return false;
        }

        return this.snapPickupRootToCarrySocket(this.carriedSocket);
    }

    onCarryFacingFlipped(newFacingDirection) {
        this.setFacingDirection(newFacingDirection);
        this.cachePhysicsAnchorBodyLocalPoints();
    }

    getVisibleWorldCenter(target = new THREE.Vector3()) {
        if (!this.sceneObject) {
            return this.container.getWorldPosition(target);
        }

        const bounds = new THREE.Box3().setFromObject(this.sceneObject);
        if (bounds.isEmpty()) {
            return this.sceneObject.getWorldPosition(target);
        }

        return bounds.getCenter(target);
    }

    setSceneObjectWorldTransform(position, quaternion, scale) {
        if (!this.sceneObject) {
            return;
        }

        this.container.updateMatrixWorld(true);

        const worldMatrix = new THREE.Matrix4().compose(position, quaternion, scale);
        const localMatrix = this.container.matrixWorld.clone().invert().multiply(worldMatrix);
        const localPosition = new THREE.Vector3();
        const localQuaternion = new THREE.Quaternion();
        const localScale = new THREE.Vector3();
        localMatrix.decompose(localPosition, localQuaternion, localScale);

        this.sceneObject.position.copy(localPosition);
        this.sceneObject.quaternion.copy(localQuaternion);
        this.sceneObject.scale.copy(localScale);
        this.syncDebugCollisionShellTransform();
    }

    shouldPreserveDropVisualPose() {
        return this.dropVisualPoseLocked &&
            this.state === LEVEL_OBJECT_STATES.FALLING &&
            this.gravityEnabled;
    }

    releaseDropVisualPose() {
        this.dropVisualPoseLocked = false;
    }

    setWorldPosition(x, y, z = this.container.position.z) {
        this.container.position.set(x, y, z);
    }

    _applyComputedVisibility(nextVisible) {
        if (!this.container) return;
        const wasVisible = this.container.visible;
        this.container.visible = nextVisible;
        if (this.sceneObject) this.sceneObject.visible = nextVisible;

        if (nextVisible && !wasVisible) {
            if (this._pendingOnLoadInit) {
                this._pendingOnLoadInit = false;
                if (this.config.snapToGroundOnLoad === true) {
                    const collisionPolygons = this.levelObjectManager?.level?.getCollisionPolygons?.() ?? [];
                    this.levelObjectManager?.placeLevelObjectsOnPolygons?.([this], collisionPolygons);
                }
                if (this.config.fallOnLoad === true) {
                    this.state = LEVEL_OBJECT_STATES.FALLING;
                    this.gravityEnabled = true;
                }
            }
            // Re-add the body to the physics world if it was suspended.
            if (this.physicsWorld?.objectBodies?.has(this)) {
                this.physicsWorld.resumeLevelObject(this);
            }
        }

        if (!nextVisible && wasVisible) {
            // Fully remove the body from the Matter composite — zero CPU cost while hidden.
            this.physicsWorld?.suspendLevelObject?.(this);
            this.state = LEVEL_OBJECT_STATES.IDLE;
            this.gravityEnabled = false;
            this.velocity.set(0, 0, 0);
            this.angularVelocity = 0;
        }
    }

    setVisible(visible) {
        this._explicitVisible = visible !== false;
        this._applyComputedVisibility(this._explicitVisible && this._visibilitySuppressors.size === 0);
    }

    setVisualOpacity(opacity = 1) {
        this._visualOpacity = Math.max(0, Math.min(1, opacity));
        this.sceneObject?.traverse?.((child) => {
            if (!child?.isMesh || !child.material) {
                return;
            }
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            for (const material of materials) {
                if (!material?.isMaterial) {
                    continue;
                }
                if (!Number.isFinite(material.userData.__levelObjectBaseOpacity)) {
                    material.userData.__levelObjectBaseOpacity = typeof material.opacity === 'number' ? material.opacity : 1;
                }
                const baseOpacity = material.userData.__levelObjectBaseOpacity;
                material.transparent = true;
                material.opacity = baseOpacity * this._visualOpacity;
                material.needsUpdate = true;
            }
        });
    }

    setVisibilitySuppressed(key, suppressed) {
        const token = String(key || '').trim();
        if (!token) {
            return;
        }
        if (suppressed) {
            this._visibilitySuppressors.add(token);
        } else {
            this._visibilitySuppressors.delete(token);
        }
        this._applyComputedVisibility(this._explicitVisible && this._visibilitySuppressors.size === 0);
    }

    restoreGroundLayerZ() {
        if (!Number.isFinite(this.groundLayerZ)) {
            return;
        }

        // While held by the dino, keep the object at dino Z rather than snapping
        // back to groundLayerZ — otherwise physics re-sync drops it behind other objects.
        if (this.draggedBy || this.carriedBy) {
            this.syncDraggedLayerZ();
            return;
        }

        this.container.position.z = this.groundLayerZ;
        this.velocity.z = 0;
    }

    getDraggedLayerZ() {
        const dino = this.draggedBy ?? this.carriedBy;
        if (!dino) {
            return null;
        }

        const fallbackDinoZ = Number.isFinite(dino.position?.z)
            ? dino.position.z
            : (Number.isFinite(dino.mesh?.position?.z) ? dino.mesh.position.z : null);
        const dinoBackMostZ = typeof dino.getBackMostVisualZ === 'function'
            ? dino.getBackMostVisualZ()
            : fallbackDinoZ;
        if (!Number.isFinite(dinoBackMostZ)) {
            return null;
        }

        const behindDinoOffset = Number.isFinite(CONFIG.DINO_DRAG?.draggedBehindDinoZOffset)
            ? CONFIG.DINO_DRAG.draggedBehindDinoZOffset
            : 0.02;
        const inFrontOfObjectsOffset = Number.isFinite(CONFIG.DINO_DRAG?.draggedInFrontOfObjectsZOffset)
            ? CONFIG.DINO_DRAG.draggedInFrontOfObjectsZOffset
            : 0.01;
        const targetBehindDino = dinoBackMostZ - behindDinoOffset;
        const minInFrontOfObjects = this.groundLayerZ + inFrontOfObjectsOffset;
        return Math.max(minInFrontOfObjects, targetBehindDino);
    }

    syncDraggedLayerZ() {
        if (!this.isBeingDragged() && !this.carriedBy) {
            return;
        }

        const dragLayerZ = this.getDraggedLayerZ();
        if (!Number.isFinite(dragLayerZ)) {
            return;
        }

        this.container.position.z = dragLayerZ;
        this.velocity.z = 0;
    }

    getGroundAngleForFacing(slopeAngle = 0, facingDirection = this.getFacingDirection()) {
        this.setFacingDirection(facingDirection);
        return slopeAngle - this.baseRotation.z;
    }

    cachePickupRootAlignmentOffsets() {
        this.pickupRootAlignmentOffsets.clear();
        this.pickupRootLocalOffsets.clear();
        this.container.updateMatrixWorld(true);

        const nodes = this.pickupRootNodes || {};
        for (const [name, node] of Object.entries(nodes)) {
            if (!node) {
                continue;
            }

            const rootWorldPosition = node.getWorldPosition(new THREE.Vector3());
            const localPosition = this.container.worldToLocal(rootWorldPosition);
            this.pickupRootAlignmentOffsets.set(
                name,
                localPosition.clone().multiplyScalar(-1)
            );
            this.pickupRootLocalOffsets.set(
                name,
                new THREE.Vector2(
                    localPosition.x,
                    localPosition.y - this.baseGroundOffset
                )
            );
        }

        const selectedOffset = this.getPickupRootAlignmentOffset(new THREE.Vector3());
        this.rootAlignmentOffset.copy(selectedOffset);
    }

    getSelectedPickupRootName() {
        const topNode = this.pickupRootNodes?.root_top;

        if (topNode) {
            return 'root_top';
        }

        const bottomNode = this.pickupRootNodes?.root_bottom;
        if (bottomNode) {
            return 'root_bottom';
        }

        return 'root';
    }

    getSelectedPickupRootNode() {
        const selectedName = this.getSelectedPickupRootName();
        return this.pickupRootNodes?.[selectedName] || this.rootNode || this.sceneObject || this.container;
    }

    getPickupRootAlignmentOffset(target = new THREE.Vector3()) {
        const selectedName = this.getSelectedPickupRootName();
        const cachedOffset = this.pickupRootAlignmentOffsets.get(selectedName) ||
            this.pickupRootAlignmentOffsets.get('root');

        if (cachedOffset) {
            return target.copy(cachedOffset);
        }

        return target.copy(this.rootAlignmentOffset);
    }

    getRotatedCollisionSupportProfile(rotation = this.currentGroundAngle) {
        if (!this.collisionSupportPoints.length) {
            return null;
        }

        const sin = Math.sin(rotation);
        const cos = Math.cos(rotation);
        let centroidX = 0;
        const rotatedPoints = this.collisionSupportPoints.map((point) => new THREE.Vector2(
            (point.x * cos) - (point.y * sin),
            ((point.x * sin) + (point.y * cos)) + this.baseGroundOffset
        ));
        for (const point of rotatedPoints) {
            centroidX += point.x;
        }
        centroidX /= Math.max(rotatedPoints.length, 1);

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const point of rotatedPoints) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
            return null;
        }

        const sampleCount = Math.max(
            12,
            Number.isFinite(this.config.collisionMeshSamples) ? this.config.collisionMeshSamples : 24
        );
        const bottomProfile = [];
        const topProfile = [];
        const bandWidth = Math.max((maxX - minX) / Math.max(sampleCount - 1, 1), 0.0001);

        for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
            const x = THREE.MathUtils.lerp(minX, maxX, sampleIndex / Math.max(sampleCount - 1, 1));
            let nearestDistance = Number.POSITIVE_INFINITY;
            let nearestPointY = 0;
            let bottomY = Number.POSITIVE_INFINITY;
            let topY = Number.NEGATIVE_INFINITY;

            for (const point of rotatedPoints) {
                const distance = Math.abs(point.x - x);
                if (distance < nearestDistance) {
                    nearestDistance = distance;
                    nearestPointY = point.y;
                }

                if (distance <= (bandWidth * 0.8)) {
                    bottomY = Math.min(bottomY, point.y);
                    topY = Math.max(topY, point.y);
                }
            }

            if (!Number.isFinite(bottomY)) {
                bottomY = nearestPointY;
            }

            if (!Number.isFinite(topY)) {
                topY = nearestPointY;
            }

            bottomProfile.push({ x, y: bottomY });
            topProfile.push({ x, y: topY });
        }

        return {
            minX,
            maxX,
            minY,
            maxY,
            centroidX,
            bottomProfile,
            topProfile
        };
    }

    getSupportContactPatch(supportProfile) {
        if (!supportProfile?.bottomProfile?.length) {
            return null;
        }

        const contactHeightThreshold = Number.isFinite(CONFIG.LEVEL_OBJECTS?.stableRestContactHeightThreshold)
            ? CONFIG.LEVEL_OBJECTS.stableRestContactHeightThreshold
            : 0.08;
        const contactPoints = supportProfile.bottomProfile.filter((point) => (
            point.y <= (supportProfile.minY + contactHeightThreshold)
        ));

        if (!contactPoints.length) {
            return null;
        }

        const minX = Math.min(...contactPoints.map((point) => point.x));
        const maxX = Math.max(...contactPoints.map((point) => point.x));
        return {
            minX,
            maxX,
            width: maxX - minX
        };
    }

    advanceAngularMotion(delta) {
        if (!Number.isFinite(this.angularVelocity) || Math.abs(this.angularVelocity) <= 0.0001) {
            return;
        }

        this.currentGroundAngle += this.angularVelocity * delta;
        if (this.shouldPreserveDropVisualPose()) {
            return;
        }

        this.applyGroundAlignment();
    }

    buildStableRestAngles() {
        if (!this.collisionSupportPoints.length) {
            return [0];
        }

        const sampleCount = Math.max(
            48,
            Number.isFinite(CONFIG.LEVEL_OBJECTS?.stableRestAngleSamples)
                ? CONFIG.LEVEL_OBJECTS.stableRestAngleSamples
                : 96
        );
        const samples = [];

        for (let index = 0; index < sampleCount; index += 1) {
            const angle = (index / sampleCount) * Math.PI * 2;
            const supportProfile = this.getRotatedCollisionSupportProfile(angle);
            if (!supportProfile) {
                continue;
            }

            const contactPatch = this.getSupportContactPatch(supportProfile);

            samples.push({
                angle,
                height: -supportProfile.minY,
                width: supportProfile.maxX - supportProfile.minX,
                contactPatch,
                centroidX: supportProfile.centroidX
            });
        }

        if (!samples.length) {
            return [0];
        }

        const minima = [];
        const mergeThreshold = Number.isFinite(CONFIG.LEVEL_OBJECTS?.stableRestAngleMergeThreshold)
            ? CONFIG.LEVEL_OBJECTS.stableRestAngleMergeThreshold
            : 0.18;
        const heightThreshold = Number.isFinite(CONFIG.LEVEL_OBJECTS?.stableRestHeightThreshold)
            ? CONFIG.LEVEL_OBJECTS.stableRestHeightThreshold
            : 0.015;
        const minSupportWidthRatio = Number.isFinite(CONFIG.LEVEL_OBJECTS?.stableRestMinSupportWidthRatio)
            ? CONFIG.LEVEL_OBJECTS.stableRestMinSupportWidthRatio
            : 0.2;
        const centroidMarginRatio = Number.isFinite(CONFIG.LEVEL_OBJECTS?.stableRestCentroidMarginRatio)
            ? CONFIG.LEVEL_OBJECTS.stableRestCentroidMarginRatio
            : 0.04;

        for (let index = 0; index < samples.length; index += 1) {
            const previous = samples[(index - 1 + samples.length) % samples.length];
            const current = samples[index];
            const next = samples[(index + 1) % samples.length];
            const isLocalMinimum =
                (current.height <= previous.height + heightThreshold) &&
                (current.height <= next.height + heightThreshold) &&
                (current.height <= previous.height || current.height <= next.height);

            if (!isLocalMinimum) {
                continue;
            }

            const contactPatch = current.contactPatch;
            const minSupportWidth = current.width * minSupportWidthRatio;
            const centroidMargin = current.width * centroidMarginRatio;
            const hasStableSupport = (
                contactPatch &&
                contactPatch.width >= minSupportWidth &&
                current.centroidX >= (contactPatch.minX - centroidMargin) &&
                current.centroidX <= (contactPatch.maxX + centroidMargin)
            );

            if (!hasStableSupport) {
                continue;
            }

            const normalizedAngle = THREE.MathUtils.euclideanModulo(current.angle + Math.PI, Math.PI * 2) - Math.PI;
            const existingIndex = minima.findIndex((entry) => (
                Math.abs(this.getShortestAngleDelta(entry.angle, normalizedAngle)) <= mergeThreshold
            ));

            if (existingIndex === -1) {
                minima.push({
                    angle: normalizedAngle,
                    height: current.height
                });
                continue;
            }

            if (current.height < minima[existingIndex].height) {
                minima[existingIndex] = {
                    angle: normalizedAngle,
                    height: current.height
                };
            }
        }

        if (!minima.length) {
            return [0];
        }

        return minima
            .sort((left, right) => left.height - right.height)
            .map((entry) => entry.angle);
    }

    getShortestAngleDelta(fromAngle, toAngle) {
        return Math.atan2(
            Math.sin(toAngle - fromAngle),
            Math.cos(toAngle - fromAngle)
        );
    }

    getNearestStableRestAngle(baseSlopeAngle = 0) {
        if (!this.stableRestAngles.length) {
            return baseSlopeAngle;
        }

        let bestAngle = baseSlopeAngle + this.stableRestAngles[0];
        let bestDelta = Math.abs(this.getShortestAngleDelta(this.currentGroundAngle, bestAngle));

        for (const restAngle of this.stableRestAngles) {
            const candidateAngle = baseSlopeAngle + restAngle;
            const delta = Math.abs(this.getShortestAngleDelta(this.currentGroundAngle, candidateAngle));
            if (delta >= bestDelta) {
                continue;
            }

            bestAngle = candidateAngle;
            bestDelta = delta;
        }

        return bestAngle;
    }

    getLinearSettleThreshold() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.settleVelocityThreshold)
            ? CONFIG.LEVEL_OBJECTS.settleVelocityThreshold
            : 0.45;
    }

    getAngularSettleThreshold() {
        return Number.isFinite(CONFIG.LEVEL_OBJECTS?.angularSettleThreshold)
            ? CONFIG.LEVEL_OBJECTS.angularSettleThreshold
            : 0.2;
    }

    isMotionSettled() {
        if (this.matterBody) {
            return this.matterBody.isSleeping === true ||
                (
                    Math.hypot(this.matterBody.velocity?.x ?? 0, this.matterBody.velocity?.y ?? 0) <= 0.01 &&
                    Math.abs(this.matterBody.angularVelocity ?? 0) <= 0.01
                );
        }

        return (
            Math.abs(this.velocity.x) <= this.getLinearSettleThreshold() &&
            Math.abs(this.velocity.y) <= this.getLinearSettleThreshold() &&
            Math.abs(this.angularVelocity) <= this.getAngularSettleThreshold()
        );
    }

    tryFinalizePendingDestroy() {
        if (!this.pendingDestroy || this.state !== LEVEL_OBJECT_STATES.IDLE || !this.isMotionSettled()) {
            return false;
        }

        this.destroy();
        return true;
    }

    getWorldPosition(target = new THREE.Vector3()) {
        return this.container.getWorldPosition(target);
    }

    setExplosionDamageHandler(handler) {
        this.explosionDamageHandler = typeof handler === 'function' ? handler : null;
    }

    reportExplosionDamageCenter(worldCenter = this.getVisibleWorldCenter(new THREE.Vector3())) {
        if (this.explosionDamageReported || typeof this.explosionDamageHandler !== 'function') {
            return;
        }

        this.explosionDamageReported = true;
        this.explosionDamageHandler(this, worldCenter.clone());
    }

    getConfiguredCollisionWorldRect() {
        const rect = this.configuredCollisionRect;
        if (!rect || !this.sceneObject) {
            return null;
        }

        return this.getConfiguredCollisionWorldRectRaw();
    }

    getCollisionPolygonWorldPoints() {
        if (this.configuredCollisionPolygon && this.sceneObject && this.container) {
            this.container.updateWorldMatrix(true, false);
            this.sceneObject.updateWorldMatrix(true, false);

            // Use sceneObject rotation/scale but container world position as translation,
            // so local (0,0) = container.position in world space. This matches the anchor
            // used in PhysicsWorld (_getPolygonBodyAnchor uses container position).
            const mat = this.sceneObject.matrixWorld.clone();
            const cp = new THREE.Vector3();
            this.container.getWorldPosition(cp);
            mat.elements[12] = cp.x;
            mat.elements[13] = cp.y;
            mat.elements[14] = cp.z;

            return this.configuredCollisionPolygon.map(({ x, y }) => {
                const wp = new THREE.Vector3(x, y, 0).applyMatrix4(mat);
                return new THREE.Vector2(wp.x, wp.y);
            });
        }

        const configuredRect = this.getConfiguredCollisionWorldRect();
        if (configuredRect) {
            const axisX = getRectAxis(configuredRect.angle);
            const axisY = getRectPerpendicularAxis(configuredRect.angle);
            const center = new THREE.Vector2(configuredRect.centerX, configuredRect.centerY);
            const corners = [
                { x: -configuredRect.halfWidth, y: -configuredRect.halfHeight },
                { x: configuredRect.halfWidth, y: -configuredRect.halfHeight },
                { x: configuredRect.halfWidth, y: configuredRect.halfHeight },
                { x: -configuredRect.halfWidth, y: configuredRect.halfHeight }
            ];

            return corners.map((corner) => center.clone()
                .add(axisX.clone().multiplyScalar(corner.x))
                .add(axisY.clone().multiplyScalar(corner.y)));
        }

        if (!this.collisionSupportPoints.length) {
            return [];
        }

        const angle = this.currentGroundAngle ?? 0;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        const points = this.collisionSupportPoints.map((point) => new THREE.Vector2(
            this.container.position.x + (point.x * cosAngle) - (point.y * sinAngle),
            this.container.position.y + (point.x * sinAngle) + (point.y * cosAngle)
        ));

        if (points.length <= 3) {
            return points;
        }

        points.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
        const cross = (origin, pointA, pointB) => (
            ((pointA.x - origin.x) * (pointB.y - origin.y)) -
            ((pointA.y - origin.y) * (pointB.x - origin.x))
        );
        const lower = [];
        for (const point of points) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
                lower.pop();
            }
            lower.push(point);
        }

        const upper = [];
        for (let index = points.length - 1; index >= 0; index -= 1) {
            const point = points[index];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
                upper.pop();
            }
            upper.push(point);
        }

        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    getCollisionPolygonBounds(points = this.getCollisionPolygonWorldPoints()) {
        if (!Array.isArray(points) || points.length === 0) {
            return null;
        }

        let minX = Number.POSITIVE_INFINITY;
        let maxX = Number.NEGATIVE_INFINITY;
        let minY = Number.POSITIVE_INFINITY;
        let maxY = Number.NEGATIVE_INFINITY;
        for (const point of points) {
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
        }

        return { minX, maxX, minY, maxY };
    }

    translateContainerWorld(delta) {
        if (!delta || delta.lengthSq() <= 0.000001) {
            return false;
        }

        const parent = this.container.parent;
        if (!parent?.worldToLocal) {
            this.container.position.add(delta);
            return true;
        }

        const startWorld = this.container.getWorldPosition(new THREE.Vector3());
        const endWorld = startWorld.clone().add(delta);
        const localStart = parent.worldToLocal(startWorld.clone());
        const localEnd = parent.worldToLocal(endWorld);
        this.container.position.add(localEnd.sub(localStart));
        this.container.updateMatrixWorld(true);
        return true;
    }


    getLevelCollisionEdges(level) {
        const groups = level?.getCollisionEdgeGroups?.();
        if (groups) {
            const pos = this.container?.position;
            const cx = pos?.x ?? 0;
            const margin = (this.configuredCollisionRect?.width ?? 4) * 0.5 + 1;
            const result = [];
            for (const group of groups) {
                if (cx - margin > group.cx + group.r || cx + margin < group.cx - group.r) continue;
                for (const edge of group.edges) result.push(edge);
            }
            return result;
        }
        const edges = level?.getCollisionEdges?.();
        return Array.isArray(edges) ? edges : [];
    }

    getPhysicsCollisionRectWorldPoints() {
        const rect = this.configuredCollisionRect;
        if (!rect) {
            if (!this.missingRuntimeCollisionRectWarned) {
                this.missingRuntimeCollisionRectWarned = true;
                console.warn(
                    `[LevelObject] No collision rectangle defined for ${this.getDebugLabel()}; dropped polygon physics disabled.`
                );
            }
            return [];
        }

        // During falling/dragging with dropVisualPoseLocked, the sceneObject world transform
        // reflects the carry visual pose, not the physics body.  Use container.position and
        // currentGroundAngle directly so the collision rect tracks the physics body correctly.
        const usePhysicsBasis = this.dropVisualPoseLocked ||
            this.state === LEVEL_OBJECT_STATES.FALLING ||
            this.state === LEVEL_OBJECT_STATES.DRAGGED;

        let angle, centerX, centerY;
        if (usePhysicsBasis) {
            angle = (this.currentGroundAngle ?? 0) + (rect.angle ?? 0);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            // rect.offsetX/offsetY are in sceneObject-local space; baseGroundOffset lifts
            // sceneObject above container when applyGroundAlignment is active.
            const totalOffsetX = rect.offsetX ?? 0;
            const totalOffsetY = (rect.offsetY ?? 0) + (this.baseGroundOffset ?? 0);
            centerX = this.container.position.x + cos * totalOffsetX - sin * totalOffsetY;
            centerY = this.container.position.y + sin * totalOffsetX + cos * totalOffsetY;
        } else {
            const configuredRect = this.getConfiguredCollisionWorldRect();
            if (!configuredRect) return [];
            angle = configuredRect.angle;
            centerX = configuredRect.centerX;
            centerY = configuredRect.centerY;
        }

        const axisX = getRectAxis(angle);
        const axisY = getRectPerpendicularAxis(angle);
        const center = new THREE.Vector2(centerX, centerY);
        const halfWidth = Math.max(rect.width * 0.5, 0.001);
        const halfHeight = Math.max(rect.height * 0.5, 0.001);
        const corners = [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ];

        return corners.map((corner) => center.clone()
            .add(axisX.clone().multiplyScalar(corner.x))
            .add(axisY.clone().multiplyScalar(corner.y)));
    }

    getCollisionRectBottomSamples(rect = this.getConfiguredCollisionWorldRect()) {
        if (!rect) {
            return [];
        }

        const axisX = getRectAxis(rect.angle);
        const axisY = getRectPerpendicularAxis(rect.angle);
        const center = new THREE.Vector2(rect.centerX, rect.centerY);
        const halfWidth = Math.max(rect.halfWidth ?? 0, 0.001);
        const halfHeight = Math.max(rect.halfHeight ?? 0, 0.001);

        return [-halfWidth, 0, halfWidth].map((localX) => center.clone()
            .add(axisX.clone().multiplyScalar(localX))
            .add(axisY.clone().multiplyScalar(-halfHeight)));
    }

    getExplosionDamageRect() {
        const configuredRect = this.getConfiguredCollisionWorldRect();
        if (configuredRect) {
            return configuredRect;
        }

        const supportProfile = this.getRotatedCollisionSupportProfile(this.currentGroundAngle);
        if (supportProfile) {
            return {
                centerX: this.container.position.x + ((supportProfile.minX + supportProfile.maxX) * 0.5),
                centerY: this.container.position.y + ((supportProfile.minY + supportProfile.maxY) * 0.5),
                halfWidth: Math.max((supportProfile.maxX - supportProfile.minX) * 0.5, 0.001),
                halfHeight: Math.max((supportProfile.maxY - supportProfile.minY) * 0.5, 0.001),
                angle: 0
            };
        }

        const halfWidth = Math.max((this.collisionHorizontalRange.maxX - this.collisionHorizontalRange.minX) * 0.5, 0.001);
        const halfHeight = Math.max(this.collisionHeight * 0.5, 0.001);
        return {
            centerX: this.container.position.x + ((this.collisionHorizontalRange.minX + this.collisionHorizontalRange.maxX) * 0.5),
            centerY: this.container.position.y + this.baseGroundOffset,
            halfWidth,
            halfHeight,
            angle: 0
        };
    }

    getWorldCollisionRect() {
        return this.getExplosionDamageRect();
    }

    getPickupRootWorldPosition(target = new THREE.Vector3()) {
        return this.getSelectedPickupRootNode().getWorldPosition(target);
    }

    getFacingDirection() {
        if (Number.isFinite(this.config.facingDirection)) {
            return this.currentFacingDirection;
        }

        return this.currentFacingDirection;
    }

    getVisualWorldFacingDirection(fallbackDirection = this.getFacingDirection()) {
        this.container.updateMatrixWorld(true);

        const frontNode = this.grabPointNodes?.grab_front;
        const backNode = this.grabPointNodes?.grab_back;
        if (frontNode && backNode) {
            const frontWorld = frontNode.getWorldPosition(new THREE.Vector3());
            const backWorld = backNode.getWorldPosition(new THREE.Vector3());
            const grabDeltaX = frontWorld.x - backWorld.x;
            if (Math.abs(grabDeltaX) > 0.001) {
                return grabDeltaX >= 0 ? 1 : -1;
            }
        }

        if (this.sceneObject) {
            const worldQuaternion = this.sceneObject.getWorldQuaternion(new THREE.Quaternion());
            const baseQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                this.baseRotation.x,
                this.baseRotation.y,
                this.baseRotation.z
            ));
            const localRightFacingAxis = new THREE.Vector3(1, 0, 0)
                .applyQuaternion(baseQuaternion.invert());
            const visualFacingAxis = localRightFacingAxis.applyQuaternion(worldQuaternion);
            if (Math.abs(visualFacingAxis.x) > 0.001) {
                return visualFacingAxis.x >= 0 ? 1 : -1;
            }
        }

        return fallbackDirection >= 0 ? 1 : -1;
    }

    getGrabPointNode(name) {
        return this.grabPointNodes?.[name] || this.rootNode || this.sceneObject || this.container;
    }

    getGrabPointWorldPosition(name = this.dragGrabPointName, target = new THREE.Vector3()) {
        return this.getGrabPointNode(name).getWorldPosition(target);
    }

    getPickupRootLocalOffset(target = new THREE.Vector2()) {
        const selectedName = this.getSelectedPickupRootName();
        const cached = this.pickupRootLocalOffsets.get(selectedName) ||
            this.pickupRootLocalOffsets.get('root');
        if (cached) {
            return target.copy(cached);
        }

        const node = this.getSelectedPickupRootNode();
        if (!node) {
            return target.set(0, 0);
        }

        this.container.updateMatrixWorld(true);
        const worldPosition = node.getWorldPosition(new THREE.Vector3());
        const localPosition = this.container.worldToLocal(worldPosition);
        return target.set(
            localPosition.x,
            localPosition.y - this.baseGroundOffset
        );
    }

    cacheGrabPointLocalOffsets() {
        this.grabPointLocalOffsets.clear();
        this.container.updateMatrixWorld(true);

        for (const name of ['grab_front', 'grab_back']) {
            const node = this.getGrabPointNode(name);
            const worldPosition = node.getWorldPosition(new THREE.Vector3());
            const localPosition = this.container.worldToLocal(worldPosition);
            this.grabPointLocalOffsets.set(name, new THREE.Vector2(
                localPosition.x,
                localPosition.y - this.baseGroundOffset
            ));
        }
    }

    getGrabPointLocalOffset(name = this.dragGrabPointName, target = new THREE.Vector2()) {
        const cached = this.grabPointLocalOffsets.get(name);
        if (cached) {
            return target.copy(cached);
        }

        const node = this.getGrabPointNode(name);
        if (!node) {
            return target.set(0, 0);
        }

        this.container.updateMatrixWorld(true);
        const worldPosition = node.getWorldPosition(TMP_GRAB_WORLD);
        const localPosition = this.container.worldToLocal(worldPosition);
        return target.set(
            localPosition.x,
            localPosition.y - this.baseGroundOffset
        );
    }

    cachePhysicsAnchorBodyLocalPoints() {
        this.physicsAnchorBodyLocalPoints.clear();
        if (!this.configuredCollisionRect || !this.sceneObject) {
            return;
        }

        for (const name of ['grab_front', 'grab_back']) {
            const grabLocal = this.getGrabPointLocalOffset(name, new THREE.Vector2());
            this.physicsAnchorBodyLocalPoints.set(
                name,
                this.convertAttachmentLocalOffsetToBodyLocal(grabLocal)
            );
        }

        const pickupRootLocal = this.getPickupRootLocalOffset(new THREE.Vector2());
        this.physicsAnchorBodyLocalPoints.set(
            'pickup_root',
            this.convertAttachmentLocalOffsetToBodyLocal(pickupRootLocal)
        );
    }

    getDefaultCollisionRectAnchorBodyLocalPoint(name) {
        const rect = this.configuredCollisionRect;
        if (!rect) {
            return { x: 0, y: 0 };
        }

        const configuredAnchor = this.config?.collisionRect?.anchors?.[name] ||
            this.config?.physics?.anchors?.[name];
        if (Array.isArray(configuredAnchor)) {
            return {
                x: Number.isFinite(configuredAnchor[0]) ? configuredAnchor[0] : 0,
                y: Number.isFinite(configuredAnchor[1]) ? configuredAnchor[1] : 0
            };
        }
        if (configuredAnchor && typeof configuredAnchor === 'object') {
            return {
                x: Number.isFinite(configuredAnchor.x) ? configuredAnchor.x : 0,
                y: Number.isFinite(configuredAnchor.y) ? configuredAnchor.y : 0
            };
        }

        // Matter joints attach to the collision rectangle itself. These are body-local points:
        // they rotate with the Matter body and never depend on the current visual/model pose.
        if (name === 'grab_front') {
            return { x: rect.width * 0.5, y: 0 };
        }
        if (name === 'grab_back') {
            return { x: -rect.width * 0.5, y: 0 };
        }
        if (name === 'pickup_root') {
            return { x: 0, y: rect.height * 0.5 };
        }

        return { x: 0, y: 0 };
    }

    getPhysicsAnchorWorldPosition(name, target = new THREE.Vector3()) {
        const localPoint = name === 'pickup_root'
            ? this.getPickupConstraintBodyLocalPoint()
            : this.getDragConstraintBodyLocalPoint(name);
        const rect = this.getWorldCollisionRect?.();
        if (!rect || !Number.isFinite(localPoint?.x) || !Number.isFinite(localPoint?.y)) {
            return this.getGrabPointWorldPosition(name, target);
        }

        const cos = Math.cos(rect.angle ?? 0);
        const sin = Math.sin(rect.angle ?? 0);
        target.set(
            rect.centerX + (localPoint.x * cos) - (localPoint.y * sin),
            rect.centerY + (localPoint.x * sin) + (localPoint.y * cos),
            this.container.position.z
        );
        return target;
    }

    convertAttachmentLocalOffsetToBodyLocal(localOffset) {
        const rect = this.configuredCollisionRect;
        const localX = Number.isFinite(localOffset?.x) ? localOffset.x : 0;
        const localY = Number.isFinite(localOffset?.y) ? localOffset.y : 0;
        if (!rect) {
            return { x: localX, y: localY };
        }

        const localDx = localX - (rect.offsetX ?? 0);
        const localDy = localY - (rect.offsetY ?? 0);
        const localRectAngle = Number.isFinite(rect.angle) ? rect.angle : 0;
        const cos = Math.cos(-localRectAngle);
        const sin = Math.sin(-localRectAngle);

        return {
            x: (localDx * cos) - (localDy * sin),
            y: (localDx * sin) + (localDy * cos)
        };
    }

    getDragConstraintBodyLocalPoint(name = this.dragGrabPointName) {
        const cached = this.physicsAnchorBodyLocalPoints.get(name);
        if (cached && Number.isFinite(cached.x) && Number.isFinite(cached.y)) {
            return { x: cached.x, y: cached.y };
        }

        const grabLocal = this.getGrabPointLocalOffset(name, new THREE.Vector2());
        // Use the authored node position cached at load time, then convert that stable local
        // point into the Matter body frame. This keeps the joint attached to the same place on
        // the model regardless of current slope, upside-down rest pose, or terrain escape nudges.
        return this.convertAttachmentLocalOffsetToBodyLocal(grabLocal);
    }

    getPickupConstraintBodyLocalPoint() {
        const cached = this.physicsAnchorBodyLocalPoints.get('pickup_root');
        if (cached && Number.isFinite(cached.x) && Number.isFinite(cached.y)) {
            return { x: cached.x, y: cached.y };
        }

        const pickupRootLocal = this.getPickupRootLocalOffset(new THREE.Vector2());
        return this.convertAttachmentLocalOffsetToBodyLocal(pickupRootLocal);
    }

    canBeDraggedBy(dino) {
        return Boolean(
            dino &&
            this.loaded &&
            this.draggable &&
            this.configuredCollisionRect &&
            !this.isDestroyed &&
            (this.state === LEVEL_OBJECT_STATES.IDLE || this.state === LEVEL_OBJECT_STATES.FALLING)
        );
    }

    isBeingDragged() {
        return Boolean(this.draggedBy) && this.state === LEVEL_OBJECT_STATES.DRAGGED;
    }

    isMouthDragged() {
        return this.mouthDragEnabled && this.isBeingDragged();
    }

    isPhysicsCarried() {
        return this.matterCarryJointActive === true && this.state === LEVEL_OBJECT_STATES.CARRIED;
    }

    isPhysicsJointDragged() {
        return this.matterDragJointActive === true && this.state === LEVEL_OBJECT_STATES.DRAGGED;
    }

    getCarryTargetWorldPosition(target = new THREE.Vector3(), socket = this.carriedSocket) {
        const carrySocket = socket || this.carriedBy?.getCarrySocket?.() || null;
        if (carrySocket?.localToWorld) {
            carrySocket.updateWorldMatrix?.(true, false);
            return carrySocket.localToWorld(target.copy(this.pickupOffset.position));
        }

        return this.getPickupRootWorldPosition(target);
    }

    canBePickedUpBy(dino) {
        if (!dino || !this.loaded || this.isDestroyed || !this.container.visible) {
            return false;
        }

        if (this.state !== LEVEL_OBJECT_STATES.IDLE && this.state !== LEVEL_OBJECT_STATES.FALLING) {
            return false;
        }

        if (!this.pickupable) {
            return false;
        }

        if (typeof dino.canPickupObject === 'function' && !dino.canPickupObject(this)) {
            return false;
        }

        return true;
    }

    pickUp(dino, socket, options = {}) {
        if (!this.canBePickedUpBy(dino) || !socket) {
            return false;
        }

        const pickupRootName = this.getSelectedPickupRootName();
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.gravityEnabled = true;
        this.fallStartY = null;
        this._sleepTimer = 0;
        this.pendingDestroy = false;
        this.dropVisualPoseLocked = false;
        this.carriedBy = dino;
        this.carriedSocket = socket;
        this.draggedBy = null;
        this.dragGrabPointName = null;
        this.matterCarryJointActive = true;
        this.matterDragJointActive = false;
        this.state = LEVEL_OBJECT_STATES.CARRIED;
        this.physicsWorld?.enableLevelObject?.(this, this.velocity, {
            forceOutsideTerrain: true
        });
        this.physicsWorld?.beginLevelObjectDrag?.(
            this,
            this.getCarryTargetWorldPosition(new THREE.Vector3(), socket),
            null,
            {
                stiffness: Number.isFinite(CONFIG.DINO_DRAG?.matterCarryConstraintStiffness)
                    ? CONFIG.DINO_DRAG.matterCarryConstraintStiffness
                    : 1,
                damping: Number.isFinite(CONFIG.DINO_DRAG?.matterCarryConstraintDamping)
                    ? CONFIG.DINO_DRAG.matterCarryConstraintDamping
                    : 0.5,
                length: 0,
                usePickupRoot: true
            }
        );
        this.syncDebugCollisionShellTransform();
        this.playInteractionAnimationForAnchor(pickupRootName);
        return true;
    }

    attachToCarrySocketPreservingWorldVisual(socket) {
        const worldPosition = new THREE.Vector3();
        const worldQuaternion = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();

        this.container.updateMatrixWorld(true);
        this.sceneObject?.updateMatrixWorld(true);
        this.sceneObject?.getWorldPosition(worldPosition);
        this.sceneObject?.getWorldQuaternion(worldQuaternion);
        this.sceneObject?.getWorldScale(worldScale);

        // Auto-pickup has already moved the dino so the foot socket reaches the object's
        // root. Keep the container locked directly to that socket, then restore the visible
        // object pose underneath it. This avoids socket.attach() producing a different local
        // offset under the scaled dino rig, which made carried objects drift during turns.
        socket.updateWorldMatrix(true, false);
        socket.add(this.container);
        this.container.position.set(0, 0, 0);
        this.container.rotation.set(0, 0, 0);
        this.container.scale.set(1, 1, 1);
        this.container.updateMatrixWorld(true);

        if (!this.sceneObject) {
            return;
        }

        this.setSceneObjectWorldTransform(worldPosition, worldQuaternion, worldScale);
        this.applyPreservedCarryRotationOffset();
        this.snapPickupRootToCarrySocket(socket);
    }

    snapPickupRootToCarrySocket(socket) {
        if (!this.sceneObject || !socket) {
            return false;
        }

        this.container.updateMatrixWorld(true);
        socket.updateWorldMatrix(true, false);
        const rootWorld = this.getPickupRootWorldPosition(new THREE.Vector3());
        const targetRootWorld = socket.localToWorld(this.pickupOffset.position.clone());
        const correction = targetRootWorld.sub(rootWorld);
        if (correction.lengthSq() <= 0.000001) {
            return false;
        }

        const worldPosition = this.sceneObject.getWorldPosition(new THREE.Vector3()).add(correction);
        const worldQuaternion = this.sceneObject.getWorldQuaternion(new THREE.Quaternion());
        const worldScale = this.sceneObject.getWorldScale(new THREE.Vector3());
        this.setSceneObjectWorldTransform(worldPosition, worldQuaternion, worldScale);
        return true;
    }

    grab(dino, socket) {
        if (!this.canBePickedUpBy(dino) || !socket) {
            return false;
        }

        const pickupRootName = this.getSelectedPickupRootName();
        // Too-heavy objects keep their exact world transform. The dino enters a grabbed/struggle
        // state, but the object itself stays in Matter as a normal sleeping body. We do not
        // disable collision here; the dino simply cannot move the object because it is too heavy.
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.gravityEnabled = false;
        this.fallStartY = null;
        this.pendingDestroy = false;
        this.dropVisualPoseLocked = false;
        this.carriedBy = dino;
        this.carriedSocket = socket;
        this.state = LEVEL_OBJECT_STATES.GRABBED;
        this.physicsWorld?.sleepLevelObject?.(this);
        this.playInteractionAnimationForAnchor(pickupRootName);
        return true;
    }

    startDrag(dino, grabPointName) {
        if (!this.canBeDraggedBy(dino) || !grabPointName) {
            return false;
        }

        if (this.mouthDragEnabled) {
            return this.startMouthDrag(dino, grabPointName);
        }

        this.draggedBy = dino;
        this.dragGrabPointName = grabPointName;
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.gravityEnabled = false;
        this.fallStartY = null;
        this.dropVisualPoseLocked = false;
        this.matterCarryJointActive = false;
        this.matterDragJointActive = true;
        // Enable Matter while the object is still in its current visual/rest pose. If we switch
        // to DRAGGED first, the visual sync path can apply drag-state alignment immediately and
        // flip an upside-down object upright before the rope is even attached.
        this.physicsWorld?.enableLevelObject?.(this, this.velocity, {
            skipInitialTerrainResolve: true
        });
        this.state = LEVEL_OBJECT_STATES.DRAGGED;
        this.physicsWorld?.beginLevelObjectDrag?.(
            this,
            this.getDragTargetWorldPosition(new THREE.Vector3()),
            this.getGrabPointWorldPosition(grabPointName, new THREE.Vector3()),
            {
                stretchWhenTargetInsideTerrain: true,
                stiffness: Number.isFinite(CONFIG.DINO_DRAG?.matterGroundDragConstraintStiffness)
                    ? CONFIG.DINO_DRAG.matterGroundDragConstraintStiffness
                    : undefined,
                damping: Number.isFinite(CONFIG.DINO_DRAG?.matterGroundDragConstraintDamping)
                    ? CONFIG.DINO_DRAG.matterGroundDragConstraintDamping
                    : undefined,
                length: Number.isFinite(CONFIG.DINO_DRAG?.matterGroundDragRopeLength)
                    ? Math.max(CONFIG.DINO_DRAG.matterGroundDragRopeLength, 0)
                    : 0
            }
        );
        this.playInteractionAnimationForAnchor(grabPointName);
        return true;
    }

    startMouthDrag(dino, grabPointName) {
        const mouthSocket = dino?.getMouthAttachmentObject?.() || dino?.mouthObject || null;
        if (!mouthSocket) {
            return false;
        }

        this.draggedBy = dino;
        this.dragGrabPointName = grabPointName;
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.gravityEnabled = true;
        this.fallStartY = null;
        this.pendingDestroy = false;
        this.dropVisualPoseLocked = false;
        this.matterCarryJointActive = false;
        this.matterDragJointActive = true;
        this.physicsWorld?.enableLevelObject?.(this, this.velocity, {
            skipInitialTerrainResolve: true
        });
        this.state = LEVEL_OBJECT_STATES.DRAGGED;
        this.physicsWorld?.beginLevelObjectDrag?.(
            this,
            this.getDragTargetWorldPosition(new THREE.Vector3(), mouthSocket),
            this.getGrabPointWorldPosition(grabPointName, new THREE.Vector3()),
            {
                stiffness: Number.isFinite(CONFIG.DINO_DRAG?.matterGroundDragConstraintStiffness)
                    ? CONFIG.DINO_DRAG.matterGroundDragConstraintStiffness
                    : undefined,
                damping: Number.isFinite(CONFIG.DINO_DRAG?.matterGroundDragConstraintDamping)
                    ? CONFIG.DINO_DRAG.matterGroundDragConstraintDamping
                    : undefined,
                length: Number.isFinite(CONFIG.DINO_DRAG?.matterGroundDragRopeLength)
                    ? Math.max(CONFIG.DINO_DRAG.matterGroundDragRopeLength, 0)
                    : 0
            }
        );
        this.playInteractionAnimationForAnchor(grabPointName);
        return true;
    }

    getDragTargetWorldPosition(target = new THREE.Vector3(), mouthAttachment = null) {
        const dragTarget = mouthAttachment ||
            this.draggedBy?.getMouthAttachmentObject?.() ||
            this.draggedBy?.mouthObject ||
            null;

        if (dragTarget?.localToWorld) {
            dragTarget.updateWorldMatrix?.(true, false);
            return dragTarget.localToWorld(target.set(0, 0, 0));
        }

        if (this.draggedBy?.getMouthWorldPosition) {
            return this.draggedBy.getMouthWorldPosition(target);
        }

        return target.set(this.container.position.x, this.container.position.y, this.container.position.z);
    }

    releaseDrag() {
        if (this.state !== LEVEL_OBJECT_STATES.DRAGGED) {
            return false;
        }

        this.physicsWorld?.endLevelObjectDrag?.(this);
        this.draggedBy = null;
        this.dragGrabPointName = null;
        this.matterDragJointActive = false;
        this.fallStartY = this.container.position.y;
        this._hasBeenDropped = true;
        this.state = LEVEL_OBJECT_STATES.FALLING;
        this.gravityEnabled = true;

        // The body is already active (mouthDrag keeps it non-static). Just reset the damage
        // detection flags and wake the body so damage triggers correctly on ground impact.
        const body = this.physicsWorld?.objectBodies?.get(this);
        if (body?.plugin) {
            body.plugin.hasImpactedTerrain = false;
            body.plugin.hasMatterContact = false;
            body.plugin.dropStartY = this.fallStartY;
            body.plugin.settledFrameCount = 0;
        }
        if (body) {
            this.physicsWorld.Matter?.Sleeping?.set(body, false);
        }

        this.stopInteractionAnimation();
        return true;
    }

    drop(initialVelocity = new THREE.Vector3(), options = {}) {
        if (this.state !== LEVEL_OBJECT_STATES.CARRIED) {
            return false;
        }

        if (this.isPhysicsCarried()) {
            this.physicsWorld?.endLevelObjectDrag?.(this);
            this.angularVelocity = 0;
            this.gravityEnabled = true;
            // Re-parent container back to the scene before recording fallStartY so the
            // position is in scene-space. During carry the container was a child of the socket.
            if (this.container.parent !== this.scene) {
                this.scene.attach(this.container);
            }
            this.fallStartY = this.container.position.y;
            this.carriedBy = null;
            this.carriedSocket = null;
            this.matterCarryJointActive = false;
            this.state = LEVEL_OBJECT_STATES.FALLING;
            this.dropVisualPoseLocked = false;
            this.polygonTerrainContactLastFrame = false;
            this._sleepTimer = 0;
            this._lastGroundNormal = null;
            this._hasBeenDropped = true;
            this._physDebugCount = 0;
            this._physUpdateCount = 0;
            this.stopInteractionAnimation();
            // Inherit dino velocity so the object carries forward momentum on release.
            if (initialVelocity && (initialVelocity.x !== 0 || initialVelocity.y !== 0)) {
                this.velocity.copy(initialVelocity);
            }
            this.physicsWorld?.enableLevelObject?.(this, this.velocity, {
                preserveBodyPose: true,
                preserveBodyVelocity: false,
                forceOutsideTerrain: true
            });
            return true;
        }

        const carriedCollisionRect = this.getConfiguredCollisionWorldRectRaw();
        const configuredRect = this.configuredCollisionRect || {};
        const releasedWorldQuaternion = new THREE.Quaternion();
        const releasedWorldPosition = new THREE.Vector3();
        const releasedWorldScale = new THREE.Vector3();
        const releasedVisibleCenter = this.getVisibleWorldCenter(new THREE.Vector3());
        this.sceneObject?.getWorldPosition(releasedWorldPosition);
        this.sceneObject?.getWorldQuaternion(releasedWorldQuaternion);
        this.sceneObject?.getWorldScale(releasedWorldScale);
        const dropFacingDirection = Number.isFinite(options.facingDirection)
            ? (options.facingDirection >= 0 ? 1 : -1)
            : this.getVisualWorldFacingDirection(this.getFacingDirection());
        this.setFacingDirection(dropFacingDirection);

        this.scene.attach(this.container);
        // Reset the container to the physics basis, then restore the visible pose so release
        // starts from the exact hanging transform instead of snapping into the rest pose. The
        // dropped physics angle should match the carried collision rect we just had in world
        // space, not the old slope angle from before pickup.
        this.container.rotation.set(0, 0, 0);
        this.container.scale.set(1, 1, 1);
        this.currentGroundAngle = 0;
        if (carriedCollisionRect) {
            const rectLocalAngle = Number.isFinite(configuredRect.angle) ? configuredRect.angle : 0;
            const baseCandidate = carriedCollisionRect.angle - rectLocalAngle;
            const candidateAngles = [baseCandidate, baseCandidate + Math.PI, baseCandidate - Math.PI];
            let bestGroundAngle = candidateAngles[0];
            let bestAngleDelta = Number.POSITIVE_INFINITY;

            for (const candidateGroundAngle of candidateAngles) {
                this.currentGroundAngle = candidateGroundAngle;
                this.applyGroundAlignment();
                const candidateRect = this.getConfiguredCollisionWorldRectRaw();
                if (!candidateRect) {
                    continue;
                }

                const angleDelta = Math.abs(this.getShortestAngleDelta(candidateRect.angle, carriedCollisionRect.angle));
                if (angleDelta < bestAngleDelta) {
                    bestAngleDelta = angleDelta;
                    bestGroundAngle = candidateGroundAngle;
                }
            }

            this.currentGroundAngle = bestGroundAngle;
        }
        this.applyGroundAlignment();
        const alignedVisibleCenter = this.getVisibleWorldCenter(new THREE.Vector3());
        this.container.position.add(releasedVisibleCenter.sub(alignedVisibleCenter));
        this.container.updateMatrixWorld(true);
        this.setSceneObjectWorldTransform(releasedWorldPosition, releasedWorldQuaternion, releasedWorldScale);
        this.velocity.copy(initialVelocity);
        this.angularVelocity = 0;
        this.gravityEnabled = true;
        this.fallStartY = this.container.position.y;
        this.carriedBy = null;
        this.carriedSocket = null;
        this.matterCarryJointActive = false;
        this.state = LEVEL_OBJECT_STATES.FALLING;
        this.dropVisualPoseLocked = true;
        this.polygonTerrainContactLastFrame = false;
        this._sleepTimer = 0;
        this._lastGroundNormal = null;
        this._hasBeenDropped = true;
        this._physDebugCount = 0;
        this._physUpdateCount = 0;
        this.stopInteractionAnimation();
        this.physicsWorld?.enableLevelObject?.(this, this.velocity);
        return true;
    }

    releaseGrab() {
        if (this.state !== LEVEL_OBJECT_STATES.GRABBED) {
            return false;
        }

        this.carriedBy = null;
        this.carriedSocket = null;
        this.dropVisualPoseLocked = false;
        this.draggedBy = null;
        this.dragGrabPointName = null;
        this.matterCarryJointActive = false;
        this.matterDragJointActive = false;
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.gravityEnabled = false;
        this.polygonTerrainContactLastFrame = false;
        this.state = LEVEL_OBJECT_STATES.IDLE;
        this.stopInteractionAnimation();
        this.physicsWorld?.enableLevelObject?.(this, this.velocity);
        this.physicsWorld?.sleepLevelObject?.(this);
        return true;
    }

    applyDamage(amount, type = 'generic') {
        if (this.isDestroyed || amount <= 0) {
            return;
        }

        // Damage stays centralized here so all sources (impact, explosion, fireball, flame)
        // share one health/destruction pipeline.
        this.health = Math.max(0, this.health - amount);
        this.updateHealthBarVisual();
        if (this.health <= 0) {
            this.pickupable = false;
            if (this.freezeAtZeroHealth) {
                // Freeze in place — no explosion, no removal, stays in scene for end animations.
                this.draggable = false;
                this.gravityEnabled = false;
                this.velocity.set(0, 0, 0);
                this.angularVelocity = 0;
                this.state = LEVEL_OBJECT_STATES.IDLE;
            } else {
                this.destroy();
            }
        }
        this.updateWreckedMorph();
    }

    hasTakenDamage() {
        if (!Number.isFinite(this.maxHealth) || this.maxHealth <= 0) {
            return false;
        }

        // Combat aggro can key off this helper so enemies stay passive until the player has
        // damaged them at least once. Small epsilon avoids float precision edge cases.
        return this.health < this.maxHealth - 0.0001;
    }

    getImpactDamage(fallDistance) {
        const sharedConfig = CONFIG.LEVEL_OBJECTS || {};
        const minimumHeightDamage = Math.max(
            0,
            Number.isFinite(this.config.minimumHeightDamage)
                ? this.config.minimumHeightDamage
                : (
                    Number.isFinite(sharedConfig.minimumHeightDamage)
                        ? sharedConfig.minimumHeightDamage
                        : 0
                )
        );
        // minimumHeightDamage is a hard gate only: short drops do no damage, while drops that
        // pass the gate keep using the existing impact formula instead of being re-scaled.
        if (fallDistance < minimumHeightDamage) {
            return 0;
        }

        const minDamagingFallDistance = Number.isFinite(sharedConfig.minDamagingFallDistance)
            ? sharedConfig.minDamagingFallDistance
            : 0;
        if (fallDistance <= minDamagingFallDistance) {
            return 0;
        }

        const damageMultiplier = Number.isFinite(sharedConfig.impactDamageMultiplier)
            ? sharedConfig.impactDamageMultiplier
            : 0.18;
        const weightMultiplier = Number.isFinite(sharedConfig.impactWeightMultiplier)
            ? sharedConfig.impactWeightMultiplier
            : 0.012;
        const impactResistance = Math.max(
            0.01,
            Number.isFinite(this.config.impactResistance)
                ? this.config.impactResistance
                : 1
        );

        // Fase 1 damage is height-driven and weight-biased so heavier drops feel riskier,
        // while staying simple enough to reuse later for object-vs-object impact events.
        // Per-type impactResistance lets heavier classes (like tanks) visibly shrug off
        // short drops without changing global fall tuning for all objects.
        return Math.max(
            0,
            (
                (fallDistance - minDamagingFallDistance) *
                this.weight *
                damageMultiplier *
                (1 + (this.weight * weightMultiplier))
            ) / impactResistance
        );
    }

    update(delta, level) {
        if (!this.loaded) {
            return;
        }

        if (!this.container.visible) {
            return;
        }

        if (this.timelineAnimationControlled) {
            this.updateInteractionAnimation(delta);
            this.updateHealthBarVisual();
            this.updateDestructionSequence(delta);
            return;
        }

        this.updateInteractionAnimation(delta);
        this.updateAirborneInteractionAnimation(level);

        // Keep bar visibility in sync with interaction state (dragged/carried/grabbed) even
        // when health is unchanged.
        this.updateHealthBarVisual();

        this.updateDestructionSequence(delta);
        if (this.markedForRemoval || this.isDestroyed) {
            return;
        }

        if (this.isMouthDragged()) {
            this.velocity.set(0, 0, 0);
            this.angularVelocity = 0;
            this.gravityEnabled = false;
            return;
        }

        if (
            this.state === LEVEL_OBJECT_STATES.CARRIED ||
            this.state === LEVEL_OBJECT_STATES.GRABBED ||
            this.state === LEVEL_OBJECT_STATES.DESTROYED
        ) {
            return;
        }

        if (this.state === LEVEL_OBJECT_STATES.IDLE) {
            this.tryFinalizePendingDestroy();
            return;
        }

        if (!this.gravityEnabled) {
            return;
        }

        if (!this.matterBody && this.physicsWorld?.enableLevelObject) {
            this.physicsWorld.enableLevelObject(this, this.velocity);
        }

        if (this.matterBody) {
            return;
        }

        // Only warn if this object was expected to have a Matter body.
        const shouldHaveBody = this.physicsWorld?.shouldUseMatterForLevelObject?.(this) ?? false;
        if (shouldHaveBody && !this.missingMatterBodyWarned) {
            this.missingMatterBodyWarned = true;
            console.warn(
                `[LevelObject] No Matter body available for falling object ${this.getDebugLabel?.() || this.type}.`
            );
        }
    }

    updateWreckedMorph() {
        if (!this.wreckedMorphTargets.length || this.maxHealth <= 0) {
            return;
        }

        const damageRatio = this.isDestroyed
            ? 1
            : THREE.MathUtils.clamp(1 - (this.health / this.maxHealth), 0, 1);
        const applyToAllMeshes = this.isDestroyed;
        for (const target of this.wreckedMorphTargets) {
            if (!target.mesh?.morphTargetInfluences) {
                continue;
            }

            // While taking partial damage, optionally filter by mesh name.
            // At final destruction, force full wrecked influence on every mesh target.
            if (!applyToAllMeshes && !this.shouldApplyPartialWreckedBlendToMesh(target.mesh)) {
                continue;
            }

            target.mesh.morphTargetInfluences[target.index] = damageRatio;
        }
    }

    destroy() {
        if (this.isDestroyed) {
            return;
        }

        if (this.freezeAtZeroHealth && this.health <= 0) {
            return;
        }

        if (this.carriedBy && typeof this.carriedBy.dropCarriedObject === 'function') {
            this.carriedBy.dropCarriedObject();
        }

        if (this.draggedBy && typeof this.draggedBy.releaseDraggedObject === 'function') {
            this.draggedBy.releaseDraggedObject();
        }

        this.isDestroyed = true;
        this.pendingDestroy = false;
        this.explosionDamageReported = false;
        this.health = 0;
        this.pickupable = false;
        this.draggable = false;
        this.gravityEnabled = false;
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.state = LEVEL_OBJECT_STATES.DESTROYED;
        this.stopInteractionAnimation();
        this.updateHealthBarVisual();

        this.updateWreckedMorph();
        this.physicsWorld?.removeLevelObject?.(this);
        this.startDestructionSequence();
    }

    getDestructionSettings() {
        const destructionConfig = this.config.destruction || {};
        return {
            explosionDuration: Number.isFinite(destructionConfig.explosionDuration)
                ? destructionConfig.explosionDuration
                : 0.65,
            explosionScale: Number.isFinite(destructionConfig.explosionScale)
                ? destructionConfig.explosionScale
                : 1,
            particleCount: Number.isFinite(destructionConfig.particleCount)
                ? destructionConfig.particleCount
                : 32,
            debrisCount: Number.isFinite(destructionConfig.debrisCount)
                ? destructionConfig.debrisCount
                : 7,
            explosionForce: Number.isFinite(destructionConfig.explosionForce)
                ? destructionConfig.explosionForce
                : undefined,
            gravity: Number.isFinite(destructionConfig.gravity)
                ? destructionConfig.gravity
                : undefined,
            upwardBias: Number.isFinite(destructionConfig.upwardBias)
                ? destructionConfig.upwardBias
                : undefined,
            particleSpeedMin: Number.isFinite(destructionConfig.particleSpeedMin)
                ? destructionConfig.particleSpeedMin
                : undefined,
            particleSpeedMax: Number.isFinite(destructionConfig.particleSpeedMax)
                ? destructionConfig.particleSpeedMax
                : undefined,
            debrisSpeedMin: Number.isFinite(destructionConfig.debrisSpeedMin)
                ? destructionConfig.debrisSpeedMin
                : undefined,
            debrisSpeedMax: Number.isFinite(destructionConfig.debrisSpeedMax)
                ? destructionConfig.debrisSpeedMax
                : undefined,
            debrisForceScale: Number.isFinite(destructionConfig.debrisForceScale)
                ? destructionConfig.debrisForceScale
                : undefined,
            debrisGravityMultiplier: Number.isFinite(destructionConfig.debrisGravityMultiplier)
                ? destructionConfig.debrisGravityMultiplier
                : undefined,
            debrisLinearDamping: Number.isFinite(destructionConfig.debrisLinearDamping)
                ? destructionConfig.debrisLinearDamping
                : undefined,
            debrisWeightMin: Number.isFinite(destructionConfig.debrisWeightMin)
                ? destructionConfig.debrisWeightMin
                : undefined,
            debrisWeightMax: Number.isFinite(destructionConfig.debrisWeightMax)
                ? destructionConfig.debrisWeightMax
                : undefined,
            explosionColors: destructionConfig.explosionColors || [0xffaa00, 0xff5500, 0x333333],
            flameTextureUrl: destructionConfig.flameTextureUrl || CONFIG.LEVEL_OBJECTS?.explosionTextureUrl,
            loadingManager: this.loadingManager,
            effectOffsetY: Number.isFinite(destructionConfig.effectOffsetY)
                ? destructionConfig.effectOffsetY
                : Math.max(this.baseGroundOffset + (this.collisionHeight * 0.35), 0.8),
            effectOffsetZ: Number.isFinite(destructionConfig.effectOffsetZ)
                ? destructionConfig.effectOffsetZ
                : 3,
            debrisStartDelay: Number.isFinite(destructionConfig.debrisStartDelay)
                ? destructionConfig.debrisStartDelay
                : 0.3,
            visualHideDelay: Number.isFinite(destructionConfig.visualHideDelay)
                ? destructionConfig.visualHideDelay
                : 0.4,
            emissionDuration: Number.isFinite(destructionConfig.emissionDuration)
                ? destructionConfig.emissionDuration
                : undefined,
            spawnSpreadX: Number.isFinite(destructionConfig.spawnSpreadX)
                ? destructionConfig.spawnSpreadX
                : this.collisionWidth,
            spawnSpreadY: Number.isFinite(destructionConfig.spawnSpreadY)
                ? destructionConfig.spawnSpreadY
                : Math.max(this.collisionHeight * 0.75, 0)
        };
    }

    ensureDestructionEffect() {
        if (this.destructionEffect) {
            return this.destructionEffect;
        }

        this.destructionEffect = new LevelObjectDestructionEffect(
            this.scene,
            this.getDestructionSettings()
        );
        this.destructionEffect.setWorldPosition(this.getVisibleWorldCenter(new THREE.Vector3()));
        return this.destructionEffect;
    }

    startDestructionSequence() {
        if (this.destructionStage !== 'none' && this.destructionStage !== 'finished') {
            return;
        }

        // Destruction is explosion-only now: the effect is detached from the object so the
        // object can leave gameplay immediately while the burst masks its removal.
        const effect = this.ensureDestructionEffect();
        const destructionSettings = this.getDestructionSettings();
        effect.start();
        const killSoundNames = this.getConfiguredKillSoundNames();
        if (killSoundNames.length) {
            this.audioManager?.playRandom?.(killSoundNames, {
                volume: this.getDestructionSoundVolume(),
                detune: (Math.random() * 120) - 60,
                cooldown: 0.02
            });
        } else {
            this.audioManager?.playRandom?.(['explosion', 'explosion2', 'explosionCar'], {
                volume: this.getDestructionSoundVolume(),
                detune: (Math.random() * 120) - 60,
                cooldown: 0.02
            });
        }
        this.detachedDestructionEffects.push(effect);
        this.destructionEffect = null;
        // Explosion gameplay damage is evaluated exactly once from the detonation center.
        // This uses each target's collision rectangle, not center-to-center distance.
        this.reportExplosionDamageCenter(this.getVisibleWorldCenter(new THREE.Vector3()));
        
        // Ensure the wrecked visual is visible during the explosion
        if (this.sceneObject) {
            this.sceneObject.visible = true;
        }
        
        // Hide the wrecked visuals after a delay so the fire explosion shows first
        this.visualHideTimer = destructionSettings.visualHideDelay;
    }

    getConfiguredKillSoundNames() {
        const killSounds = Array.isArray(this.config?.killSounds)
            ? this.config.killSounds
            : (typeof this.config?.killSound === 'string' ? [this.config.killSound] : []);
        return killSounds
            .map((soundUrl, index) => (typeof soundUrl === 'string' && soundUrl.trim()
                ? `objectKill:${this.type}:${index}`
                : null))
            .filter(Boolean);
    }

    getConfiguredGroundImpactSoundName() {
        return typeof this.config?.groundImpactSound === 'string' && this.config.groundImpactSound.trim()
            ? `objectGroundImpact:${this.type}`
            : null;
    }

    playGroundImpactSoundIfSurvived(impactSpeed = 0) {
        if (this.isDestroyed) {
            return;
        }

        const groundImpactSoundName = this.getConfiguredGroundImpactSoundName();
        if (!groundImpactSoundName) {
            return;
        }

        const normalizedImpact = THREE.MathUtils.clamp(impactSpeed / 18, 0, 1);
        this.audioManager?.play?.(groundImpactSoundName, {
            volume: THREE.MathUtils.lerp(0.45, 0.9, normalizedImpact),
            detune: (Math.random() * 70) - 35,
            cooldown: 0.06
        });
    }

    getDestructionSoundVolume() {
        return this.type === 'tank' || this.type === 'car' || this.type === 'chopper' ? 0.95 : 0.8;
    }

    updateDestructionSequence(delta) {
        // Handle delayed visual hiding
        if (this.visualHideTimer !== undefined && this.visualHideTimer > 0) {
            this.visualHideTimer -= delta;
            if (this.visualHideTimer <= 0) {
                this.hideDestroyedObjectVisuals();
                this.visualHideTimer = undefined;
                // Queue removal now that the visual is hidden and debris is exploding
                this.queueRemovalAfterExplosion();
            }
        }

        if (!this.destructionEffect || this.destructionStage === 'none' || this.markedForRemoval) {
            return;
        }

        this.destructionEffect.update(delta);

        if (this.destructionEffect.isFinished()) {
            this.queueRemovalAfterExplosion();
        }
    }

    queueRemovalAfterExplosion() {
        if (this.markedForRemoval) {
            return;
        }

        this.markedForRemoval = true;
        this.gravityEnabled = false;
        this.velocity.set(0, 0, 0);
        this.angularVelocity = 0;
        this.state = LEVEL_OBJECT_STATES.DESTROYED;
        this.destructionStage = 'finished';
    }

    hideDestroyedObjectVisuals() {
        if (this.sceneObject) {
            this.sceneObject.visible = false;
        }

        if (this.debugCollisionShell) {
            this.debugCollisionShell.visible = false;
        }
    }

    dequeueDetachedEffects() {
        if (!this.detachedDestructionEffects.length) {
            return [];
        }

        return this.detachedDestructionEffects.splice(0);
    }

    shouldRemoveFromLevel() {
        return this.markedForRemoval;
    }

    disposeDestructionEffect() {
        this.destructionEffect?.dispose();
        this.destructionEffect = null;
        for (const effect of this.detachedDestructionEffects) {
            effect.dispose();
        }
        this.detachedDestructionEffects = [];
    }

    dispose() {
        this.physicsWorld?.removeLevelObject?.(this);
        this.stopInteractionAnimation();
        this.animationMixer?.stopAllAction();
        this.animationMixer?.uncacheRoot?.(this.sceneObject);
        this.animationMixer = null;
        this.animationClips.clear();
        this.animationClipActions.clear();
        this.animationClipActionsNormalized.clear();
        this.disposeDestructionEffect();
        this.disposeDebugCollisionShell();
        this.disposeHealthBar();

        this.sceneObject?.traverse((child) => {
            if (!child?.isMesh) {
                return;
            }

            child.geometry?.dispose?.();

            if (Array.isArray(child.material)) {
                for (const material of child.material) {
                    material?.dispose?.();
                }
            } else {
                child.material?.dispose?.();
            }
        });

        this.container.removeFromParent();
    }
}
