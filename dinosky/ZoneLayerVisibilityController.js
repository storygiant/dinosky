import { isPointInsideZone } from './TiledLevel.js';

const ZONE_HIDE_VISIBILITY_KEY = 'zone-layer-hide';
const ZONE_SHOW_VISIBILITY_KEY = 'zone-layer-show';
const DEFAULT_FADE_DURATION = 0.22;

function normalizeToken(value) {
    return String(value || '').trim().toLowerCase();
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function isTileFullyInsideZone(level, zone, col, row) {
    const world = level.cellToWorld(col, row);
    const left = world.x;
    const right = world.x + level.tileWidth;
    const bottom = world.y;
    const top = world.y + level.tileHeight;

    return (
        isPointInsideZone(zone, left, bottom) &&
        isPointInsideZone(zone, right, bottom) &&
        isPointInsideZone(zone, left, top) &&
        isPointInsideZone(zone, right, top)
    );
}

export class ZoneLayerVisibilityController {
    constructor({ fadeDuration = DEFAULT_FADE_DURATION } = {}) {
        this.level = null;
        this.levelRenderer = null;
        this.levelObjectManager = null;
        this.burnableSceneryManager = null;
        this.fadeDuration = Math.max(0.01, fadeDuration);
        this.entries = new Map();
        this.effectZones = [];
        this.showLayerStates = new Map();
        this._desiredVisible = new Map();
        this.activeSignature = '';
    }

    setContext({ level = null, levelRenderer = null, levelObjectManager = null, burnableSceneryManager = null } = {}) {
        this.clear();
        this.level = level;
        this.levelRenderer = levelRenderer;
        this.levelObjectManager = levelObjectManager;
        this.burnableSceneryManager = burnableSceneryManager;
    }

    clear() {
        for (const entry of this.entries.values()) {
            entry.ensureVisible?.();
            entry.apply?.(1, false);
        }
        this.entries.clear();
        for (const layerName of this.showLayerStates.keys()) {
            this.setShowLayerVisible(layerName, false);
        }
        this.showLayerStates.clear();
        this.effectZones = [];
        this.activeSignature = '';
    }

    update(dt = 0) {
        if (this.entries.size === 0) {
            this.syncShowLayers();
            return;
        }

        const step = this.fadeDuration > 0
            ? Math.max(0, dt) / this.fadeDuration
            : 1;

        for (const [key, entry] of this.entries) {
            const direction = entry.targetHidden ? -1 : 1;
            entry.opacity = clamp01(entry.opacity + (step * direction));
            const atHidden = entry.opacity <= 0.001;
            const atVisible = entry.opacity >= 0.999;

            if (!entry.targetHidden) {
                entry.ensureVisible?.();
            }

            entry.apply?.(entry.opacity, entry.targetHidden && atHidden);

            if (entry.targetHidden && atHidden) {
                entry.finalizeHidden?.();
                continue;
            }

            if (!entry.targetHidden && atVisible) {
                entry.finalizeVisible?.();
                this.entries.delete(key);
            }
        }

        this.syncShowLayers();
    }

    applyZones(zones = []) {
        const effectZones = (Array.isArray(zones) ? zones : [])
            .filter((zone) => (
                (Array.isArray(zone?.layersToHide) && zone.layersToHide.length > 0) ||
                (Array.isArray(zone?.layersToShow) && zone.layersToShow.length > 0)
            ));
        this.effectZones = effectZones;
        const signature = effectZones
            .map((zone) => `${zone.zoneId}:${zone?.zoneEffectActive ? 1 : 0}`)
            .sort()
            .join('|');
        if (signature === this.activeSignature) {
            this.syncShowLayers();
            return;
        }

        this.activeSignature = signature;
        const nextEntries = new Map();
        for (const zone of effectZones) {
            this.collectZoneEntries(zone, nextEntries);
        }

        for (const [key, entry] of nextEntries) {
            entry.targetHidden = (entry.hideActiveCount || 0) > 0;
        }

        for (const [key, entry] of this.entries) {
            const nextEntry = nextEntries.get(key);
            entry.targetHidden = nextEntry
                ? nextEntry.targetHidden
                : false;
        }

        for (const [key, nextEntry] of nextEntries) {
            const existing = this.entries.get(key);
            if (existing) {
                existing.targetHidden = nextEntry.targetHidden;
                continue;
            }
            nextEntry.apply?.(1, false);
            this.entries.set(key, nextEntry);
        }

        this.syncShowLayers();
    }

    collectZoneEntries(zone, into) {
        const effectZone = zone?.effectZone || zone;
        if (!effectZone) {
            return;
        }

        for (const layerName of zone?.layersToHide || []) {
            const startCount = into.size;
            this.collectTileEntries(layerName, effectZone, into, { mode: 'hide', active: zone?.zoneEffectActive === true, zoneId: zone?.zoneId });
            this.collectRenderedObjectEntries(layerName, effectZone, into, { mode: 'hide', active: zone?.zoneEffectActive === true, zoneId: zone?.zoneId });
            this.collectLevelObjectEntries(layerName, effectZone, into, { mode: 'hide', active: zone?.zoneEffectActive === true, zoneId: zone?.zoneId });
            this.collectBurnableObjectEntries(layerName, effectZone, into, { mode: 'hide', active: zone?.zoneEffectActive === true, zoneId: zone?.zoneId });
            if (into.size === startCount) {
                console.warn('[ZoneLayerVisibility] No tiles or objects matched layersToHide entry.', {
                    zoneId: zone?.zoneId ?? null,
                    effectZoneId: effectZone?.zoneId ?? null,
                    layerName
                });
            }
        }
    }

    upsertEntry(into, key, createEntry, effect = {}) {
        let entry = into.get(key);
        if (!entry) {
            entry = {
                ...createEntry(),
                hideActiveCount: 0,
                zoneIds: new Set()
            };
            into.set(key, entry);
        }

        if (effect.zoneId != null) {
            entry.zoneIds.add(effect.zoneId);
        }
        if (effect.mode === 'hide' && effect.active) {
            entry.hideActiveCount += 1;
        }

        return entry;
    }

    syncShowLayers() {
        const desiredVisible = this._desiredVisible;
        desiredVisible.clear();

        for (const zone of this.effectZones) {
            const shouldBeVisible = zone?.zoneEffectActive === true || this.hasPendingHideForZone(zone?.zoneId);
            for (const layerName of zone?.layersToShow || []) {
                const normalizedLayerName = normalizeToken(layerName);
                if (!normalizedLayerName) {
                    continue;
                }
                desiredVisible.set(normalizedLayerName, desiredVisible.get(normalizedLayerName) === true || shouldBeVisible);
            }
        }

        for (const [layerName, visible] of desiredVisible) {
            if (this.showLayerStates.get(layerName) === visible) {
                continue;
            }
            this.setShowLayerVisible(layerName, visible);
            this.showLayerStates.set(layerName, visible);
        }

        for (const [layerName, visible] of this.showLayerStates) {
            if (desiredVisible.has(layerName)) {
                continue;
            }
            if (visible) {
                this.setShowLayerVisible(layerName, false);
            }
            this.showLayerStates.delete(layerName);
        }
    }

    hasPendingHideForZone(zoneId) {
        if (zoneId == null) {
            return false;
        }
        for (const entry of this.entries.values()) {
            if (entry.zoneIds?.has(zoneId)) {
                return true;
            }
        }
        return false;
    }

    setShowLayerVisible(layerName, visible) {
        const matchedRendererLayer = this.levelRenderer?.setLayerVisibilityByName?.(layerName, visible) === true;
        let matchedLevelObject = false;
        for (const object of this.levelObjectManager?.objects || []) {
            if (normalizeToken(object?.spawnData?.sourceLayer || object?.sourceLayer) !== layerName) {
                continue;
            }
            object.setVisualOpacity?.(1);
            object.setVisibilitySuppressed?.(ZONE_SHOW_VISIBILITY_KEY, !visible);
            matchedLevelObject = true;
        }

        let matchedBurnable = false;
        for (const object of this.burnableSceneryManager?.objects || []) {
            if (normalizeToken(object?.sourceLayer) !== layerName) {
                continue;
            }
            object.setVisualOpacity?.(1);
            object.setVisibilitySuppressed?.(ZONE_SHOW_VISIBILITY_KEY, !visible);
            matchedBurnable = true;
        }

        if (!matchedRendererLayer && !matchedLevelObject && !matchedBurnable) {
            console.warn('[ZoneLayerVisibility] No layer matched layersToShow entry.', {
                layerName
            });
        }
    }

    collectTileEntries(layerName, zone, into, effect) {
        const level = this.level;
        const layer = this.levelRenderer?.getTileRenderLayerByName?.(layerName);
        if (!level || !layer || !Array.isArray(layer.tiles)) {
            return;
        }

        const minCell = level.worldToCell(zone.left, zone.bottom);
        const maxCell = level.worldToCell(zone.right, zone.top);
        const startCol = Math.max(0, Math.min(minCell.col, maxCell.col) - 1);
        const endCol = Math.min(level.width - 1, Math.max(minCell.col, maxCell.col) + 1);
        const startRow = Math.max(0, Math.min(minCell.row, maxCell.row) - 1);
        const endRow = Math.min(level.height - 1, Math.max(minCell.row, maxCell.row) + 1);

        for (let row = startRow; row <= endRow; row += 1) {
            for (let col = startCol; col <= endCol; col += 1) {
                const tile = layer.tiles[row * level.width + col];
                if (!tile || tile.broken || tile.norender || !tile.renderInfo || !tile.gid) {
                    continue;
                }
                if (!isTileFullyInsideZone(level, zone, col, row)) {
                    continue;
                }
                const key = `tile:${normalizeToken(layerName)}:${col}:${row}`;
                this.upsertEntry(into, key, () => ({
                    key,
                    opacity: 1,
                    ensureVisible: () => {
                        this.levelRenderer?.setTileLayerCellFade?.(layerName, col, row, 0, false);
                    },
                    apply: (opacity, hidden) => {
                        this.levelRenderer?.setTileLayerCellFade?.(layerName, col, row, opacity, hidden);
                    },
                    finalizeHidden: () => {
                        this.levelRenderer?.setTileLayerCellFade?.(layerName, col, row, 0, true);
                    },
                    finalizeVisible: () => {
                        this.levelRenderer?.setTileLayerCellFade?.(layerName, col, row, 1, false);
                    }
                }), effect);
            }
        }
    }

    collectRenderedObjectEntries(layerName, zone, into, effect) {
        const entries = this.levelRenderer?.getObjectLayerEntriesByName?.(layerName) || [];
        for (const entry of entries) {
            const object = entry?.object;
            const node = entry?.node;
            if (!object || !node) {
                continue;
            }
            const centerX = object.worldX + Math.max(object.width || 0, 0.001) * 0.5;
            const centerY = object.worldY + Math.max(object.height || 0, 0.001) * 0.5;
            if (!isPointInsideZone(zone, centerX, centerY)) {
                continue;
            }
            const key = `render-object:${normalizeToken(layerName)}:${object.id ?? object.name ?? `${centerX}:${centerY}`}`;
            this.upsertEntry(into, key, () => ({
                key,
                opacity: 1,
                ensureVisible: () => {
                    this.levelRenderer?.setRenderedObjectNodeFade?.(node, 0, false);
                },
                apply: (opacity, hidden) => {
                    this.levelRenderer?.setRenderedObjectNodeFade?.(node, opacity, hidden);
                },
                finalizeHidden: () => {
                    this.levelRenderer?.setRenderedObjectNodeFade?.(node, 0, true);
                },
                finalizeVisible: () => {
                    this.levelRenderer?.setRenderedObjectNodeFade?.(node, 1, false);
                }
            }), effect);
        }
    }

    collectLevelObjectEntries(layerName, zone, into, effect) {
        const normalizedLayer = normalizeToken(layerName);
        const objects = this.levelObjectManager?.objects || [];
        for (const object of objects) {
            if (normalizeToken(object?.spawnData?.sourceLayer || object?.sourceLayer) !== normalizedLayer) {
                continue;
            }
            const point = object?.container?.position;
            if (!point || !isPointInsideZone(zone, point.x, point.y)) {
                continue;
            }
            const key = `level-object:${object.id ?? object.getDebugLabel?.() ?? normalizedLayer}`;
            this.upsertEntry(into, key, () => ({
                key,
                opacity: 1,
                ensureVisible: () => {
                    object.setVisibilitySuppressed?.(ZONE_HIDE_VISIBILITY_KEY, false);
                    object.setVisualOpacity?.(0);
                },
                apply: (opacity) => {
                    object.setVisualOpacity?.(opacity);
                },
                finalizeHidden: () => {
                    object.setVisualOpacity?.(0);
                    object.setVisibilitySuppressed?.(ZONE_HIDE_VISIBILITY_KEY, true);
                },
                finalizeVisible: () => {
                    object.setVisualOpacity?.(1);
                    object.setVisibilitySuppressed?.(ZONE_HIDE_VISIBILITY_KEY, false);
                }
            }), effect);
        }
    }

    collectBurnableObjectEntries(layerName, zone, into, effect) {
        const normalizedLayer = normalizeToken(layerName);
        const objects = this.burnableSceneryManager?.objects || [];
        for (const object of objects) {
            if (normalizeToken(object?.sourceLayer) !== normalizedLayer) {
                continue;
            }
            if (!isPointInsideZone(zone, object.centerX, object.centerY)) {
                continue;
            }
            const key = `burnable:${object.id ?? `${object.centerX}:${object.centerY}`}`;
            this.upsertEntry(into, key, () => ({
                key,
                opacity: 1,
                ensureVisible: () => {
                    object.setVisibilitySuppressed?.(ZONE_HIDE_VISIBILITY_KEY, false);
                    object.setVisualOpacity?.(0);
                },
                apply: (opacity) => {
                    object.setVisualOpacity?.(opacity);
                },
                finalizeHidden: () => {
                    object.setVisualOpacity?.(0);
                    object.setVisibilitySuppressed?.(ZONE_HIDE_VISIBILITY_KEY, true);
                },
                finalizeVisible: () => {
                    object.setVisualOpacity?.(1);
                    object.setVisibilitySuppressed?.(ZONE_HIDE_VISIBILITY_KEY, false);
                }
            }), effect);
        }
    }
}
