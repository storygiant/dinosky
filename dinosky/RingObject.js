import * as THREE from 'three';
import { ChopperObject } from './ChopperObject.js';
import { CONFIG } from './config.js';

export class RingObject extends ChopperObject {
    constructor(options) {
        super(options);
        this.missileConfig.enabled = false;
        this.fixedYawOffset = Number.isFinite(this.config.fixedYawOffset)
            ? this.config.fixedYawOffset
            : (Number.isFinite(this.config.yawOffset) ? this.config.yawOffset : 0);
        this.rotorNodeName = this.config.rotorNodeName || this.config.mainRotorNodeName || 'ring_rotor';
        this.mainRotorAxis = ['x', 'y', 'z'].includes(this.config.ringRotorAxis)
            ? this.config.ringRotorAxis
            : (['x', 'y', 'z'].includes(this.config.mainRotorAxis) ? this.config.mainRotorAxis : 'z');
        this.frontRingOverlay = null;
        this._ringPassCooldownUntil = 0;
        this._passPulseT = -1; // negative = inactive
    }

    async load() {
        await super.load();
        this.mainRotorNode = this.findNamedNode(this.rotorNodeName);
        this.tailRotorNode = null;
        this.createFrontRingOverlay();
        this.applyFacingRotation(0, true);
        if (CONFIG.LEVEL_OBJECTS?.debugRenderLevelCollisionContours) {
            this._createPassLineDebug();
        }
        return this;
    }

    _createPassLineDebug() {
        const zone = this.config.passZone || {};
        const height = Number.isFinite(zone.height) ? zone.height : 16;
        const offset = Array.isArray(zone.offset) ? zone.offset : [0, 0];
        const ox = Number.isFinite(offset[0]) ? offset[0] : 0;
        const oy = Number.isFinite(offset[1]) ? offset[1] : 0;
        const h = height * 0.5;

        // Find the ring node's local position relative to sceneObject so the
        // debug line is drawn at the visual ring center, not the model pivot.
        const ringNode = this.findNamedNode(this.config.ringNodeName || 'ring');
        const ringLocalPos = new THREE.Vector3();
        if (ringNode) {
            ringNode.getWorldPosition(ringLocalPos);
            this.sceneObject?.worldToLocal(ringLocalPos);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
            ringLocalPos.x + ox, ringLocalPos.y + oy - h, 0,
            ringLocalPos.x + ox, ringLocalPos.y + oy + h, 0
        ], 3));
        const mat = new THREE.LineBasicMaterial({
            color: 0xffdd00,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        this._passLineDebugMesh = new THREE.Line(geo, mat);
        this._passLineDebugMesh.name = `${this.type}:${this.id}:pass-line-debug`;
        this._passLineDebugMesh.renderOrder = 1000004;
        this._passLineDebugMesh.frustumCulled = false;
        (this.sceneObject || this.container).add(this._passLineDebugMesh);
    }

    createFrontRingOverlay() {
        if (this.config.frontRingOverlay === false) {
            return;
        }

        const ringNode = this.findNamedNode(this.config.ringNodeName || 'ring');
        if (!ringNode?.isMesh || !ringNode.geometry) {
            return;
        }

        const geometry = this.createHalfRingGeometry(ringNode.geometry);
        if (!geometry) {
            return;
        }

        const material = Array.isArray(ringNode.material)
            ? ringNode.material.map((item) => item?.clone?.() || item)
            : ringNode.material?.clone?.();
        const materials = Array.isArray(material) ? material : [material];
        for (const item of materials) {
            if (!item) {
                continue;
            }
            item.depthTest = false;
            item.depthWrite = false;
            item.needsUpdate = true;
        }

        this.frontRingOverlay = new THREE.Mesh(geometry, material);
        this.frontRingOverlay.name = `${this.type}:${this.id}:front-ring-overlay`;
        this.frontRingOverlay.position.copy(ringNode.position);
        this.frontRingOverlay.rotation.copy(ringNode.rotation);
        this.frontRingOverlay.quaternion.copy(ringNode.quaternion);
        this.frontRingOverlay.scale.copy(ringNode.scale);
        this.frontRingOverlay.frustumCulled = true;
        this.frontRingOverlay.renderOrder = Number.isFinite(this.config.frontRingRenderOrder)
            ? this.config.frontRingRenderOrder
            : 20;
        this.sceneObject.add(this.frontRingOverlay);
    }

    createHalfRingGeometry(sourceGeometry) {
        const position = sourceGeometry.getAttribute('position');
        if (!position) {
            return null;
        }

        const sourceIndex = sourceGeometry.getIndex();
        const indices = sourceIndex
            ? Array.from(sourceIndex.array)
            : Array.from({ length: position.count }, (_, index) => index);
        const axisName = ['x', 'y', 'z'].includes(this.config.frontRingAxis)
            ? this.config.frontRingAxis
            : 'x';
        const axisIndex = axisName === 'y' ? 1 : (axisName === 'z' ? 2 : 0);
        const side = this.config.frontRingSide === 'negative' ? -1 : 1;
        const threshold = Number.isFinite(this.config.frontRingThreshold)
            ? this.config.frontRingThreshold
            : 0;
        const frontIndices = [];

        for (let index = 0; index < indices.length; index += 3) {
            const a = indices[index];
            const b = indices[index + 1];
            const c = indices[index + 2];
            const center = (
                position.getComponent(a, axisIndex) +
                position.getComponent(b, axisIndex) +
                position.getComponent(c, axisIndex)
            ) / 3;
            if ((center - threshold) * side >= 0) {
                frontIndices.push(a, b, c);
            }
        }

        if (!frontIndices.length) {
            return null;
        }

        const geometry = sourceGeometry.clone();
        geometry.setIndex(frontIndices);
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return geometry;
    }

    getMissileConfig() {
        return {
            ...super.getMissileConfig(),
            enabled: false
        };
    }

    getPreviewCenter() {
        const worldPos = new THREE.Vector3();
        const ringNode = this.findNamedNode(this.config.ringNodeName || 'ring');
        (ringNode || this.sceneObject || this.container).getWorldPosition(worldPos);
        return { x: worldPos.x, y: worldPos.y };
    }

    getRingPassLine() {
        const zone = this.config.passZone || {};
        const height = Number.isFinite(zone.height) ? zone.height : 16;
        const offset = Array.isArray(zone.offset) ? zone.offset : [0, 0];
        const worldPos = new THREE.Vector3();
        const ringNode = this.findNamedNode(this.config.ringNodeName || 'ring');
        (ringNode || this.sceneObject || this.container).getWorldPosition(worldPos);
        const cx = worldPos.x + (Number.isFinite(offset[0]) ? offset[0] : 0);
        const cy = worldPos.y + (Number.isFinite(offset[1]) ? offset[1] : 0);
        const halfHeight = Math.max(height * 0.5, 0.0001);
        return {
            x: cx,
            y0: cy - halfHeight,
            y1: cy + halfHeight
        };
    }

    triggerPassPulse() {
        this._passPulseT = 0;
    }

    update(delta) {
        super.update(delta);
        if (this._passPulseT < 0 || !this.sceneObject) return;

        this._passPulseT += delta;
        const duration = 0.5;
        const baseScale = this.scale ?? 1;
        if (this._passPulseT >= duration) {
            this.sceneObject.scale.setScalar(baseScale);
            this._passPulseT = -1;
            return;
        }

        // Scale up then back down: peak at midpoint, back to base at end.
        const t = this._passPulseT / duration;
        const scale = baseScale * (1 + 0.18 * Math.sin(t * Math.PI));
        this.sceneObject.scale.setScalar(scale);
    }

    updateFacingTarget() {
        // Rings keep their authored yaw instead of tracking the dyno.
    }

    applyFacingRotation() {
        if (!this.sceneObject) {
            return;
        }

        this.currentYaw = this.fixedYawOffset;
        this.targetYaw = this.fixedYawOffset;
        this.sceneObject.rotation.y = this.baseRotation.y + this.fixedYawOffset;
        this.syncDebugCollisionShellTransform();
    }

    applyDamage() {
        // Rings are scenery/launchers, not destructible targets.
    }

    hasTakenDamage() {
        return false;
    }

    getWorldCollisionRect() {
        return null;
    }

    getExplosionDamageRect() {
        return null;
    }
}
