/**
 * Lightweight zone trigger manager.
 *
 * This keeps the same cheap enter/leave/retrigger semantics as the original
 * dialog-zone system, but now a zone can also drive non-dialog effects such as
 * hiding authored layers while the dino is inside.
 *
 * AUTHORING
 *   Trigger zone:
 *     dialogId = skins
 *   or:
 *     layersToHide = ForegroundTrees,RoofObjects
 *   or:
 *     layersToShow = SecretRoom,InteriorProps
 *
 *   Optional:
 *     zoneId = skins_zone_roof
 *     dwellSeconds = 0.4
 *     requireGrounded = true
 *     hideZoneId = skins_hide_area
 *
 *   Optional effect-only zone:
 *     type/name = TriggerZone
 *     zoneId = skins_hide_area
 *
 * RUNTIME RULES
 *   - Dialog triggers still require enter + stop + dwell before opening.
 *   - After a dialog opens, that zone must be left before it can retrigger.
 *   - Layer-hide effects are active immediately while the dino remains inside.
 *   - All zone checks stay cheap: quick-radius reject first, exact shape second.
 */

import { isPointInsideZone, isPointNearZone } from './TiledLevel.js';
import { SpatialGrid } from './SpatialGrid.js';

export class ZoneTriggerManager {
    static get DEFAULT_DWELL_SECONDS() { return 0.4; }
    static get STILL_SPEED_THRESHOLD() { return 0.5; }
    static get DEFAULT_GRID_CELL_SIZE() { return 16; }

    constructor(game) {
        this.game = game;
        this.level = null;
        this.zones = [];
        this.effectZones = [];
        this.zoneGrid = null;
        this.runtimeZoneGrid = null;
        this.runtimeZones = [];
        this.runtimeZoneSignature = '';
        this.zoneGridCellSize = ZoneTriggerManager.DEFAULT_GRID_CELL_SIZE;
        this.zoneQueryPadding = this.zoneGridCellSize;
        this.currentZoneKey = null;
        this.armedZoneKey = null;
        this.suppressedZoneKey = null;
        this.dwellTimer = 0;
        this.hasObservedZoneState = false;
        this.activeEffectSignature = '';
        this._candidateZones = [];
        this._activeZoneIdSet = new Set();
    }

    setLevel(level) {
        this.level = level || null;
        const zones = this.level?.getZoneTriggerZones?.() || [];
        const zonesById = new Map(zones.map((zone) => [zone.zoneId, zone]));
        this.zones = zones.map((zone) => ({
            ...zone,
            effectZone: zone.effectZoneId
                ? (zonesById.get(zone.effectZoneId) || this.level?.getMissionZoneById?.(zone.effectZoneId) || zone)
                : zone
        }));
        this.effectZones = this.zones.filter((zone) => (
            (Array.isArray(zone?.layersToHide) && zone.layersToHide.length > 0) ||
            (Array.isArray(zone?.layersToShow) && zone.layersToShow.length > 0)
        ));
        for (const zone of this.effectZones) {
            zone.zoneEffectActive = false;
        }
        this.rebuildZoneGrid();
        this.runtimeZoneGrid = null;
        this.runtimeZones = [];
        this.runtimeZoneSignature = '';
        this.currentZoneKey = null;
        this.armedZoneKey = null;
        this.suppressedZoneKey = null;
        this.dwellTimer = 0;
        this.hasObservedZoneState = false;
        this.activeEffectSignature = '';
        this.game?.setActiveZoneHideTriggers?.([]);
    }

    rebuildZoneGrid() {
        this.zoneGrid = new SpatialGrid(this.zoneGridCellSize);
        for (const zone of this.zones) {
            if (!zone) {
                continue;
            }
            this.zoneGrid.insertAabb(
                zone,
                zone.left,
                zone.bottom,
                zone.right,
                zone.top
            );
        }
    }

    refreshRuntimeZoneGrid() {
        const nextRuntimeZones = this.game?.missionManager?.getTriggerableMissionZones?.() || [];

        // Build signature in a single string concatenation loop — no intermediate array allocs.
        let nextSignature = '';
        for (let i = 0; i < nextRuntimeZones.length; i++) {
            const z = nextRuntimeZones[i];
            nextSignature += `${z?.missionId ?? ''}:${z?.zoneId ?? ''}:${z?.left ?? ''}:${z?.bottom ?? ''}:${z?.right ?? ''}:${z?.top ?? ''}|`;
        }

        if (nextSignature === this.runtimeZoneSignature) {
            return this.runtimeZones;
        }

        this.runtimeZones = nextRuntimeZones;
        this.runtimeZoneSignature = nextSignature;
        this.runtimeZoneGrid = new SpatialGrid(this.zoneGridCellSize);
        for (const zone of this.runtimeZones) {
            if (!zone) {
                continue;
            }
            this.runtimeZoneGrid.insertAabb(
                zone,
                zone.left,
                zone.bottom,
                zone.right,
                zone.top
            );
        }

        return this.runtimeZones;
    }

    update(delta) {
        if (!this.game?.isReady || !Number.isFinite(delta) || delta < 0) {
            return;
        }

        const player = this.game?.player;
        const runtimeZones = this.refreshRuntimeZoneGrid();
        if (!player || (this.zones.length === 0 && runtimeZones.length === 0)) {
            return;
        }

        const activeZones = this.findPlayerZones(player);
        this.updateActiveZoneEffects(activeZones);

        const zone = this.getPrimaryTriggerZone(activeZones);
        const zoneKey = zone?.zoneId || null;

        if (!this.hasObservedZoneState) {
            this.hasObservedZoneState = true;
            this.currentZoneKey = zoneKey;
            this.armedZoneKey = null;
            this.dwellTimer = 0;
            return;
        }

        if (zoneKey !== this.currentZoneKey) {
            if (this.suppressedZoneKey && this.suppressedZoneKey !== zoneKey) {
                this.suppressedZoneKey = null;
            }

            this.currentZoneKey = zoneKey;
            this.armedZoneKey = zoneKey;
            this.dwellTimer = 0;
        }

        if (!zone || !zoneKey) {
            return;
        }

        if (this.suppressedZoneKey === zoneKey) {
            return;
        }

        if (this.game?.missionInputLocked || this.game?.sequencePresentationActive) {
            return;
        }

        if (this.game?.getActiveModalDialog?.()) {
            return;
        }

        if (!this.isZoneReadyForTrigger(zone, player)) {
            this.dwellTimer = 0;
            return;
        }

        if (this.armedZoneKey !== zoneKey) {
            return;
        }

        const dwellSeconds = Number.isFinite(zone.dwellSeconds)
            ? zone.dwellSeconds
            : ZoneTriggerManager.DEFAULT_DWELL_SECONDS;
        this.dwellTimer += delta;
        if (this.dwellTimer < dwellSeconds) {
            return;
        }

        this.dwellTimer = 0;
        this.armedZoneKey = null;
        const didOpen = this.triggerZone(zone);
        if (didOpen) {
            this.suppressedZoneKey = zoneKey;
        } else {
            this.armedZoneKey = zoneKey;
        }
    }

    updateActiveZoneEffects(activeZones) {
        const activeIds = this._activeZoneIdSet;
        activeIds.clear();
        for (let i = 0; i < activeZones.length; i++) {
            const id = activeZones[i]?.zoneId;
            if (id != null) activeIds.add(id);
        }

        let signature = '';
        for (let i = 0; i < this.effectZones.length; i++) {
            const zone = this.effectZones[i];
            zone.zoneEffectActive = activeIds.has(zone?.zoneId);
            signature += `${zone.zoneId}:${zone.zoneEffectActive ? 1 : 0}|`;
        }

        if (signature === this.activeEffectSignature) {
            return;
        }
        this.activeEffectSignature = signature;
        this.game?.setActiveZoneHideTriggers?.(this.effectZones);
    }

    findPlayerZones(player) {
        const circle = player.getWorldCollisionCircle?.();
        const px = circle ? circle.centerX : player.position?.x;
        const py = circle ? circle.centerY : player.position?.y;
        if (!Number.isFinite(px) || !Number.isFinite(py)) {
            return [];
        }

        const matches = [];
        this._candidateZones.length = 0;
        const authoredCandidates = this.zoneGrid?.queryAabb(
            px - this.zoneQueryPadding,
            py - this.zoneQueryPadding,
            px + this.zoneQueryPadding,
            py + this.zoneQueryPadding,
            this._candidateZones
        ) || this._candidateZones;
        for (const zone of authoredCandidates) {
            if (!isPointNearZone(zone, px, py)) {
                continue;
            }
            if (isPointInsideZone(zone, px, py)) {
                matches.push(zone);
            }
        }

        this._candidateZones.length = 0;
        const runtimeCandidates = this.runtimeZoneGrid?.queryAabb(
            px - this.zoneQueryPadding,
            py - this.zoneQueryPadding,
            px + this.zoneQueryPadding,
            py + this.zoneQueryPadding,
            this._candidateZones
        ) || this._candidateZones;
        for (const zone of runtimeCandidates) {
            if (!isPointNearZone(zone, px, py)) {
                continue;
            }
            if (isPointInsideZone(zone, px, py)) {
                matches.push(zone);
            }
        }

        return matches;
    }

    getPrimaryTriggerZone(activeZones) {
        return activeZones.find((entry) => Boolean(entry?.dialogId)) ||
            activeZones.find((entry) => Boolean(entry?.missionId)) ||
            null;
    }

    triggerZone(zone) {
        if (!zone) {
            return false;
        }
        if (zone.dialogId) {
            return this.game?.openDialogTriggerById?.(zone.dialogId, zone) === true;
        }
        if (zone.missionId) {
            return this.game?.missionManager?.handleZoneTriggeredMission?.(zone.missionId, zone) === true;
        }
        return false;
    }

    isZoneReadyForTrigger(zone, player) {
        if (zone.requireGrounded === true && !player.onGround) {
            return false;
        }

        const horizontalSpeed = Math.abs(player.actualHorizontalSpeed ?? 0);
        const verticalSpeed = Math.abs(player.velocity?.y ?? 0);
        return horizontalSpeed <= ZoneTriggerManager.STILL_SPEED_THRESHOLD &&
            verticalSpeed <= ZoneTriggerManager.STILL_SPEED_THRESHOLD;
    }
}

export class ZoneDialogTriggerManager extends ZoneTriggerManager {}
