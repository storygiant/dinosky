import * as THREE from 'three';
import { LevelObject } from './LevelObject.js';
import { ICON_PATHS } from './MissionDialog.js';
import { CONFIG } from './config.js';

const BOB_PERIOD = 2.2;
const BOB_AMPLITUDE = 0.18;
const CALLOUT_BG_URL = './gfx/UI/missioncallout.webp';
const ZONE_SHOW_RADIUS = 30;   // world units — zone appears when dino is within this distance
const ZONE_OPACITY = 0.18;
// The speech bubble body occupies roughly the top 78% of the image; the pointer is below.
const BUBBLE_BODY_RATIO = 0.78;

/**
 * MissionCalloutObject — a world-space icon marker placed in Tiled.
 *
 * HOW IT WORKS
 * - The Tiled object sets `missionId` in its custom properties.
 * - That links the marker to a mission definition in MissionData.js.
 * - The callout icon and text come from the mission definition's `callout` field,
 *   not from the Tiled object itself.
 * - Visibility is driven by MissionManager.isMissionCalloutVisible() every frame,
 *   so it automatically appears/disappears as dependencies and replay rules change.
 *
 * The sprite mesh is parented directly to the Gameplay layer group from LevelRenderer
 * so it inherits the exact same renderOrder and Z depth as gameplay tiles, placing it
 * behind the dino and all foreground layers automatically.
 */
export class MissionCalloutObject extends LevelObject {
    constructor(options) {
        super(options);

        // missionId links this marker to the mission definition — set via Tiled properties.
        this.missionId = options.rawProperties?.missionId
            || options.spawnData?.properties?.missionId
            || null;

        // Injected by LevelObjectFactory; may also be updated via setMissionManager().
        this.missionManager = options.missionManager || null;

        this._sprite = null;
        this._zoneMesh = null;
        this._bobAge = Math.random() * Math.PI * 2;
        this._lastVisible = null;
        this._bgImage = null;
        this._iconImage = null;
        this._layerGroup = null;
    }

    _loadImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = src;
        });
    }

    async load() {
        const spriteSize = 128;

        this._bgImage = await this._loadImage(CALLOUT_BG_URL);

        this._iconImage = await this._loadImage('./gfx/UI/missions/generic.webp');

        const canvas = document.createElement('canvas');
        canvas.width = spriteSize;
        canvas.height = spriteSize;
        const ctx = canvas.getContext('2d');
        this._drawCalloutCanvas(ctx, spriteSize);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;

        const w = this.config.width ?? 6;
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            depthTest: true,
            depthWrite: false,
            transparent: true,
            toneMapped: false,
            side: THREE.DoubleSide,
        });

        this._sprite = new THREE.Mesh(new THREE.PlaneGeometry(w, w), material);
        this._halfHeight = w / 2;

        this._sprite.position.set(
            this.container.position.x,
            this.container.position.y + this._halfHeight,
            this.container.position.z
        );
        this._sprite.visible = false;
        this.container.add(this._sprite);

        // Zone rect — transparent gray rectangle showing the mission landing area.
        const zw = (this.config.landingZoneRadiusX ?? 8) * 2;
        const zh = (this.config.landingZoneRadiusY ?? 6) * 2;
        const zoneMat = new THREE.MeshBasicMaterial({
            color: 0x888888,
            transparent: true,
            opacity: ZONE_OPACITY,
            depthTest: false,
            depthWrite: false,
            toneMapped: false,
            side: THREE.DoubleSide,
        });
        this._zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(zw, zh), zoneMat);
        this._zoneMesh.position.set(0, 0, 0);
        this._zoneMesh.visible = false;
        this.container.add(this._zoneMesh);

        this._lastVisible = false;
        this.loaded = true;
        return this;
    }

    // Called from main.js after the level renderer is ready.
    // Moves the sprite from this.container into the named layer group so it
    // inherits that layer's renderOrder and Z depth exactly.
    attachToLayerGroup(layerGroup) {
        if (!this._sprite || !layerGroup) return;
        this._layerGroup = layerGroup;

        // Remove from container, re-parent to the layer group.
        this.container.remove(this._sprite);
        layerGroup.add(this._sprite);

        // Set world-space XY position; Z comes from the layer group.
        // Offset by half-height so the bottom edge anchors to the Tiled position.
        this._sprite.position.set(
            this.container.position.x,
            this.container.position.y + this._halfHeight,
            0
        );

        if (this._zoneMesh) {
            this.container.remove(this._zoneMesh);
            layerGroup.add(this._zoneMesh);
            this._zoneMesh.position.set(
                this.container.position.x,
                this.container.position.y,
                0
            );
        }
    }

    _drawCalloutCanvas(ctx, size) {
        ctx.clearRect(0, 0, size, size);

        if (this._bgImage) {
            ctx.drawImage(this._bgImage, 0, 0, size, size);
        }

        // Draw icon centered in the bubble body (above the pointer), preserving aspect ratio.
        const bubbleHeight = size * BUBBLE_BODY_RATIO;
        const iconScale = this.missionManager?.getMissionCalloutIconScale?.(this.missionId) ?? 1;
        const maxIconSize = size * 0.62 * iconScale;

        if (this._iconImage) {
            const natW = this._iconImage.naturalWidth || this._iconImage.width || 1;
            const natH = this._iconImage.naturalHeight || this._iconImage.height || 1;
            const aspect = natW / natH;
            let drawW, drawH;
            if (aspect >= 1) {
                drawW = maxIconSize;
                drawH = maxIconSize / aspect;
            } else {
                drawH = maxIconSize;
                drawW = maxIconSize * aspect;
            }
            const iconX = (size - drawW) / 2;
            const iconY = (bubbleHeight - drawH) / 2;
            ctx.drawImage(this._iconImage, iconX, iconY, drawW, drawH);
        } else {
            // Fallback: exclamation mark.
            ctx.fillStyle = '#555';
            ctx.font = `bold ${Math.round(maxIconSize * 0.9)}px "Orbitron"`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', size / 2, bubbleHeight / 2);
        }
    }

    update(delta, level, dinoTarget, allObjects) {
        if (!this.loaded || !this._sprite) return;

        const visible = this.missionId
            ? (this.missionManager?.isMissionCalloutVisible?.(this.missionId) ?? false)
            : false;

        if (visible !== this._lastVisible) {
            this._sprite.visible = visible;
            this._lastVisible = visible;
        }

        // Zone visibility — show when callout is visible and dino is nearby.
        if (this._zoneMesh) {
            let zoneVisible = false;
            if (visible && dinoTarget?.position) {
                const dx = dinoTarget.position.x - this.container.position.x;
                const dy = dinoTarget.position.y - this.container.position.y;
                zoneVisible = (dx * dx + dy * dy) <= ZONE_SHOW_RADIUS * ZONE_SHOW_RADIUS;
            }
            this._zoneMesh.visible = zoneVisible;
        }

        if (!visible) return;

        // Gentle bob animation.
        this._bobAge += delta;
        const bobOffset = Math.sin((this._bobAge / BOB_PERIOD) * Math.PI * 2) * BOB_AMPLITUDE;
        // Y is relative to world position — keep X fixed, only animate Y.
        this._sprite.position.y = this.container.position.y + this._halfHeight + bobOffset;

        if (CONFIG?.LEVEL_OBJECTS?.debugRenderMatterPhysics) {
            this._debugLog();
        }
    }

    _debugLog() {
        if (!this.missionId || !this.missionManager) return;
        const mm = this.missionManager;
        console.log('[MissionCallout] status', {
            missionId: this.missionId,
            calloutVisible: mm.isMissionCalloutVisible?.(this.missionId),
            available: mm.isMissionAvailable?.(this.missionId),
            activeMissionId: mm.currentMission?.id ?? null,
            position: {
                x: this.container.position.x.toFixed(1),
                y: this.container.position.y.toFixed(1)
            }
        });
    }

    dispose() {
        this._sprite?.material?.map?.dispose();
        this._sprite?.material?.dispose();
        this._sprite?.geometry?.dispose();
        this._sprite?.removeFromParent();
        this._sprite = null;
        this._zoneMesh?.material?.dispose();
        this._zoneMesh?.geometry?.dispose();
        this._zoneMesh?.removeFromParent();
        this._zoneMesh = null;
        this._layerGroup = null;
        super.dispose?.();
    }
}
