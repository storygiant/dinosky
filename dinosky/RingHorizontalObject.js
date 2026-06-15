import * as THREE from 'three';
import { RingObject } from './RingObject.js';

export class RingHorizontalObject extends RingObject {
    async load() {
        await super.load();
        return this;
    }

    // Horizontal ring: pass zone is a horizontal line at a fixed Y,
    // checked against a width range [x0, x1] instead of height [y0, y1].
    getRingPassLine() {
        const zone = this.config.passZone || {};
        const width = Number.isFinite(zone.width) ? zone.width : 16;
        const offset = Array.isArray(zone.offset) ? zone.offset : [0, 0];
        const worldPos = new THREE.Vector3();
        const ringNode = this.findNamedNode(this.config.ringNodeName || 'ringhorizontal');
        (ringNode || this.sceneObject || this.container).getWorldPosition(worldPos);
        const cx = worldPos.x + (Number.isFinite(offset[0]) ? offset[0] : 0);
        const cy = worldPos.y + (Number.isFinite(offset[1]) ? offset[1] : 0);
        const halfWidth = Math.max(width * 0.5, 0.0001);
        return {
            horizontal: true,
            y: cy,
            x0: cx - halfWidth,
            x1: cx + halfWidth
        };
    }

    _createPassLineDebug() {
        const zone = this.config.passZone || {};
        const width = Number.isFinite(zone.width) ? zone.width : 16;
        const offset = Array.isArray(zone.offset) ? zone.offset : [0, 0];
        const ox = Number.isFinite(offset[0]) ? offset[0] : 0;
        const oy = Number.isFinite(offset[1]) ? offset[1] : 0;
        const hw = width * 0.5;

        const ringNode = this.findNamedNode(this.config.ringNodeName || 'ringhorizontal');
        const ringLocalPos = new THREE.Vector3();
        if (ringNode) {
            ringNode.getWorldPosition(ringLocalPos);
            this.sceneObject?.worldToLocal(ringLocalPos);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute([
            ringLocalPos.x + ox - hw, ringLocalPos.y + oy, 0,
            ringLocalPos.x + ox + hw, ringLocalPos.y + oy, 0
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
}
