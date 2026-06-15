import * as THREE from 'three';
import { ICON_PATHS } from './MissionDialog.js';
import { raceMission } from './MissionHandlers.js';
import { t } from './i18n.js';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function createSpriteMaterial(texture, opacity = 1) {
    return new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity,
        depthTest: false,
        depthWrite: false,
        toneMapped: false
    });
}


function wrapMissionText(context, text, maxWidth, maxLines = 2) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
        return [''];
    }

    const lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i += 1) {
        const candidate = `${currentLine} ${words[i]}`;
        if (context.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
            continue;
        }

        lines.push(currentLine);
        currentLine = words[i];

        if (lines.length === maxLines - 1) {
            break;
        }
    }

    if (lines.length < maxLines) {
        const consumedWordCount = lines.join(' ').split(/\s+/).filter(Boolean).length;
        const remainingWords = words.slice(consumedWordCount);
        if (remainingWords.length) {
            lines.push(remainingWords.join(' '));
        }
    }

    if (lines.length > maxLines) {
        lines.length = maxLines;
    }

    if (lines.length === maxLines) {
        const lastIndex = lines.length - 1;
        while (context.measureText(lines[lastIndex]).width > maxWidth && lines[lastIndex].length > 1) {
            lines[lastIndex] = lines[lastIndex].slice(0, -2).trimEnd() + '…';
        }
    }

    return lines;
}

function createTextTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 220;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '700 48px "Orbitron"';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    context.lineWidth = 10;
    context.fillStyle = '#ffffff';

    const textX = 24;
    const lines = wrapMissionText(context, text, canvas.width - textX - 24, 2);
    const lineHeight = 62;
    const centerY = canvas.height * 0.52;
    const startY = centerY - (((lines.length - 1) * lineHeight) * 0.5);

    lines.forEach((line, index) => {
        const y = startY + (index * lineHeight);
        context.strokeText(line, textX, y);
        context.fillText(line, textX, y);
    });

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}

function formatRaceTime(ms) {
    const totalMs = Math.max(0, Math.round(ms));
    const minutes = Math.floor(totalMs / 60000);
    const seconds = Math.floor((totalMs % 60000) / 1000);
    const centiseconds = Math.floor((totalMs % 1000) / 10);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(centiseconds).padStart(2, '0')}`;
}

function isTimedMission(mission) {
    return mission?.type === 'RACE' || mission?.type === 'DESTROY_TIMED';
}

function drawStableTimerText(ctx, text, centerY, options = {}) {
    const {
        left = 0,
        width = 100,
        font = 'bold 64px "Orbitron"',
        fillStyle = 'rgba(255,255,255,0.95)',
        strokeStyle = 'rgba(0,0,0,0.7)',
        lineWidth = 4
    } = options;

    ctx.save();
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fillStyle;
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = lineWidth;

    // Draw each glyph in a fixed slot so proportional digits in the embedded font
    // cannot shift the timer horizontally as the value changes.
    const characters = String(text ?? '').split('');
    const digitSlotCount = characters.reduce((count, char) => count + (char === ':' ? 0 : 1), 0);
    const colonSlotCount = characters.length - digitSlotCount;
    const colonWeight = 0.62;
    const totalWeight = digitSlotCount + (colonSlotCount * colonWeight);
    const baseSlotWidth = totalWeight > 0 ? width / totalWeight : width;

    let cursorX = left;
    for (const char of characters) {
        const slotWidth = baseSlotWidth * (char === ':' ? colonWeight : 1);
        const charCenterX = cursorX + (slotWidth * 0.5);
        ctx.strokeText(char, charCenterX, centerY);
        ctx.fillText(char, charCenterX, centerY);
        cursorX += slotWidth;
    }
    ctx.restore();
}

function createMissionTimerTexture(timeMs, statusText, layoutMode = 'portrait') {
    const isLandscape = layoutMode === 'landscape';
    const canvas = document.createElement('canvas');
    canvas.width = isLandscape ? 900 : 512;
    canvas.height = isLandscape ? 104 : 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const timeText = formatRaceTime(timeMs);
    if (isLandscape) {
        ctx.textBaseline = 'middle';
        // Keep the timer centered inside its own fixed left-hand region so digit-width
        // changes do not shift the whole timer horizontally while it counts.
        const timeRegionLeft = canvas.width * 0.04;
        const timeRegionWidth = canvas.width * 0.48;
        const centerY = canvas.height * 0.52;
        drawStableTimerText(ctx, timeText, centerY, {
            left: timeRegionLeft,
            width: timeRegionWidth,
            font: 'bold 74px "Orbitron"',
            fillStyle: 'rgba(255,255,255,0.95)',
            strokeStyle: 'rgba(0,0,0,0.7)',
            lineWidth: 5
        });

        if (statusText) {
            ctx.font = 'bold 40px "Orbitron"';
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(255,255,255,0.98)';
            ctx.strokeStyle = 'rgba(0,0,0,0.78)';
            ctx.lineWidth = 4;
            ctx.strokeText(statusText, canvas.width * 0.54, centerY);
            ctx.fillText(statusText, canvas.width * 0.54, centerY);
        }
    } else {
        drawStableTimerText(ctx, timeText, canvas.height * 0.38, {
            left: canvas.width * 0.12,
            width: canvas.width * 0.76,
            font: 'bold 64px "Orbitron"',
            fillStyle: 'rgba(255,255,255,0.95)',
            strokeStyle: 'rgba(0,0,0,0.7)',
            lineWidth: 4
        });

        ctx.font = 'bold 28px "Orbitron"';
        ctx.fillStyle = 'rgba(255,255,255,0.98)';
        ctx.strokeStyle = 'rgba(0,0,0,0.78)';
        ctx.lineWidth = 3;
        if (statusText) {
            ctx.strokeText(statusText, canvas.width * 0.5, canvas.height * 0.78);
            ctx.fillText(statusText, canvas.width * 0.5, canvas.height * 0.78);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}


export class ActiveMissionUI {
    constructor({ domElement = null, loadingManager = null, game = null } = {}) {
        this.domElement = domElement;
        this.loadingManager = loadingManager || undefined;
        this.game = game;
        this.currentMission = null;
        this.uiVisible = true;
        this.isExpanded = false;
        this.expandProgress = 0;
        this.expandSpeed = 9;
        this.autoCollapseDuration = 3;
        this.autoCollapseRemaining = 0;
        this.lastDescription = '';
        this.lastLayoutWidth = 1;
        this.lastLayoutHeight = 1;
        this.pointerTargetAngle = 0;
        this.pointerVisible = false;
        this.bounds = { left: 0, right: 0, top: 0, bottom: 0 };
        this._guideTargetCache = null;
        this._guideTargetFrameSkip = 0;
        this._scratchWorldVec3 = new THREE.Vector3();

        this.textureLoader = new THREE.TextureLoader(this.loadingManager);
        this.textures = {};
        for (const [key, url] of Object.entries(ICON_PATHS)) {
            this.textures[key] = this.loadTexture(url);
        }

        this.uiScene = new THREE.Scene();
        this.uiCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
        this.uiCamera.position.z = 1;

        this.root = new THREE.Group();
        this.panelRoot = new THREE.Group();
        this.iconRoot = new THREE.Group();
        this.uiScene.add(this.root);
        this.root.add(this.panelRoot, this.iconRoot);

        this.panelMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({
                color: 0x061a34,
                transparent: true,
                opacity: 0.62,
                depthTest: false,
                depthWrite: false,
                toneMapped: false
            })
        );
        this.panelMesh.renderOrder = 2300;
        this.textSprite = new THREE.Sprite(createSpriteMaterial(createTextTexture(''), 1));
        this.textSprite.renderOrder = 2310;
        this.panelRoot.add(this.panelMesh, this.textSprite);

        this.iconBackground = new THREE.Sprite(createSpriteMaterial(this.textures.buttonBackground, 0.96));
        this.iconBackground.renderOrder = 2320;
        this.iconSprite = new THREE.Sprite(createSpriteMaterial(this.textures.tank, 1));
        this.iconSprite.renderOrder = 2330;
        this.pointerSprite = new THREE.Sprite(createSpriteMaterial(this.textures.missionPointer, 1));
        this.pointerSprite.renderOrder = 2340;
        this.iconRoot.add(this.iconBackground, this.iconSprite, this.pointerSprite);

        // Timed mission overlay (shown during RACE and DESTROY_TIMED missions)
        this.raceTimerSprite = new THREE.Sprite(createSpriteMaterial(createMissionTimerTexture(0, ''), 0));
        this.raceTimerSprite.renderOrder = 2295;
        this.raceTimerSprite.visible = false;
        this.uiScene.add(this.raceTimerSprite);
        this._lastRaceTimeMs = -1;
        this._lastRaceRingIndex = -1;
        this._lastRaceTotalRings = -1;
        this._lastRaceTimerLayoutMode = '';

        this.handlePointerDown = (event) => this.onPointerDown(event);
        this.domElement?.addEventListener?.('pointerdown', this.handlePointerDown, { capture: true });
        this.root.visible = false;
        this.layout(window.innerWidth, window.innerHeight);
    }

    loadTexture(url) {
        const texture = this.textureLoader.load(url, () => {
            this.layout(this.lastLayoutWidth, this.lastLayoutHeight);
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        return texture;
    }

    getTextureAspect(texture, fallback = 1) {
        const image = texture?.image;
        if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height) || image.height <= 0) {
            return fallback;
        }

        return image.width / image.height;
    }

    setMission(mission) {
        this.currentMission = mission || null;
        this._guideTargetCache = null;
        this._guideTargetFrameSkip = 0;
        this.root.visible = Boolean(this.currentMission) && this.uiVisible;
        this.isExpanded = false;
        this.expandProgress = 0;
        this.autoCollapseRemaining = 0;

        const iconTexture = this.textures[this.currentMission?.iconObjectType] || this.textures.tank;
        this.iconSprite.material.map = iconTexture;
        this.iconSprite.material.needsUpdate = true;
        this.setDescription(this.currentMission?.description || '');
        this._lastRaceTimeMs = -1;
        this._lastRaceRingIndex = -1;
        this._lastRaceTotalRings = -1;
        this._lastRaceTimerLayoutMode = '';
        this.raceTimerSprite.visible = isTimedMission(this.currentMission);
        this.layout(this.lastLayoutWidth, this.lastLayoutHeight);
        if (this.currentMission) {
            this.expandTemporarily();
        }
    }

    setUiVisible(isVisible) {
        this.uiVisible = isVisible !== false;
        this.root.visible = Boolean(this.currentMission) && this.uiVisible;
    }

    expandTemporarily(duration = this.autoCollapseDuration) {
        this.isExpanded = true;
        this.autoCollapseRemaining = Math.max(0, Number.isFinite(duration) ? duration : this.autoCollapseDuration);
    }

    setDescription(description) {
        if (this.lastDescription === description) {
            return;
        }

        this.lastDescription = description;
        const previousTexture = this.textSprite.material.map;
        this.textSprite.material.map = createTextTexture(description);
        this.textSprite.material.needsUpdate = true;
        previousTexture?.dispose?.();
    }

    update(dt = 0) {
        if (!this.currentMission) {
            return;
        }

        const safeDt = Math.max(0, Number.isFinite(dt) ? dt : 0);
        if (this.isExpanded && this.autoCollapseRemaining > 0) {
            this.autoCollapseRemaining = Math.max(0, this.autoCollapseRemaining - safeDt);
            if (this.autoCollapseRemaining <= 0) {
                this.isExpanded = false;
            }
        }

        const target = this.isExpanded ? 1 : 0;
        const delta = safeDt * this.expandSpeed;
        this.expandProgress = this.expandProgress < target
            ? Math.min(target, this.expandProgress + delta)
            : Math.max(target, this.expandProgress - delta);
        this.updatePointerTarget();
        this.applyExpansionLayout();
        this._updateRaceTimer();
    }

    layout(width, height) {
        this.lastLayoutWidth = Math.max(width, 1);
        this.lastLayoutHeight = Math.max(height, 1);

        this.uiCamera.left = 0;
        this.uiCamera.right = this.lastLayoutWidth;
        this.uiCamera.top = this.lastLayoutHeight;
        this.uiCamera.bottom = 0;
        this.uiCamera.updateProjectionMatrix();

        const isPortrait = this.lastLayoutWidth / this.lastLayoutHeight < 1.4;
        const shortLandscape = !isPortrait && this.lastLayoutHeight <= 520;
        const shortSide = Math.max(Math.min(this.lastLayoutWidth, this.lastLayoutHeight), 1);
        const pixelsPerUiUnit = shortSide / 35;
        const sideButtonUiWidth = 3 * (isPortrait ? 2.05 : (shortLandscape ? 1.87 : 1.98));
        this.iconSize = sideButtonUiWidth * pixelsPerUiUnit;
        this.panelHeight = this.iconSize * 0.7;
        this.panelWidth = Math.min(
            this.lastLayoutWidth * (isPortrait ? 0.72 : 0.56),
            this.iconSize * 6.5
        );
        // Match the mirrored side-boost button position on the left.
        const leftPadding = 8;
        this.iconX = leftPadding + (this.iconSize * 0.5);
        const hudIsPortrait = this.lastLayoutWidth / this.lastLayoutHeight < 1.4;
        const hudTopOffset = hudIsPortrait ? 75 : 0;
        const hudRowHeight = 106 * (this.lastLayoutHeight / 760);
        const missionGap = this.iconSize * 0.04;
        this.iconY = this.lastLayoutHeight - hudTopOffset - hudRowHeight - missionGap - (this.iconSize * 0.5);
        this.iconRoot.position.set(this.iconX, this.iconY, 0);
        const backgroundAspect = this.getTextureAspect(this.iconBackground.material.map, 1);
        this.iconBackground.scale.set(this.iconSize * backgroundAspect, this.iconSize, 1);
        const iconAspect = this.getTextureAspect(this.iconSprite.material.map, 1.45);
        const iconWidth = this.iconSize * 0.82;
        this.iconSprite.scale.set(iconWidth, iconWidth / iconAspect, 1);
        this.iconSprite.position.set(0, 0, 0);
        const pointerSize = this.iconSize * 0.3;
        const pointerRadius = this.iconSize * 0.48;
        const pointerAspect = this.getTextureAspect(this.pointerSprite.material.map, 1);
        this.pointerSprite.scale.set(pointerSize * pointerAspect, pointerSize, 1);
        this.pointerSprite.position.set(
            Math.cos(this.pointerTargetAngle) * pointerRadius,
            Math.sin(this.pointerTargetAngle) * pointerRadius,
            0
        );
        this.pointerSprite.material.rotation = this.pointerTargetAngle;

        // Panel extends to the right of the icon on the left side
        this.panelRoot.position.set(
            this.iconX + (this.iconSize * 0.36),
            this.iconY - (this.iconSize * -0.02),
            0
        );
        const panelAttachOffset = this.iconSize * 0.3;
        this.panelMesh.position.set((this.panelWidth * 0.5) - panelAttachOffset, 0, 0);
        this.panelMesh.scale.set(this.panelWidth, this.panelHeight, 1);
        const textSpriteWidth = this.panelWidth * 0.86;
        this.textSprite.position.set(this.panelWidth - panelAttachOffset - (textSpriteWidth * 0.5), 0, 0);
        this.textSprite.scale.set(textSpriteWidth, this.panelHeight * 0.92, 1);

        this.bounds.left = this.iconX - (this.iconSize * 0.5);
        this.bounds.right = this.iconX + (this.iconSize * 0.5) + this.panelWidth;
        this.bounds.top = this.lastLayoutHeight - (this.iconY + (this.iconSize * 0.5));
        this.bounds.bottom = this.lastLayoutHeight - (this.iconY - (this.iconSize * 0.5));

        // Race/timed mission timer: anchored from the actual top HUD row so the gap stays
        // visually identical across devices. Landscape uses a single horizontal line; portrait
        // keeps the existing stacked layout.
        const hudRowBounds = this.game?.topBarUI?.getHudRowBounds?.() ?? null;
        const raceTimerLayoutMode = hudIsPortrait ? 'portrait' : 'landscape';
        const raceTimerWidth = hudIsPortrait
            ? Math.min(this.lastLayoutWidth * 0.56, 520)
            : Math.min(this.lastLayoutWidth * 0.46, 760);
        const raceTimerHeight = hudIsPortrait ? (raceTimerWidth * 0.25) : (raceTimerWidth * 0.115);
        const raceTimerGap = hudIsPortrait ? -7 : -7;
        const fallbackHudBottom = hudTopOffset + hudRowHeight;
        const hudBottomScreenY = hudRowBounds?.bottom ?? fallbackHudBottom;
        const raceTimerTopPx = hudBottomScreenY + raceTimerGap;
        const raceTimerY = this.lastLayoutHeight - raceTimerTopPx - raceTimerHeight * 0.5;
        this.raceTimerSprite.scale.set(raceTimerWidth, raceTimerHeight, 1);
        this.raceTimerSprite.position.set(this.lastLayoutWidth * 0.5, raceTimerY, 0);
        if (this._lastRaceTimerLayoutMode !== raceTimerLayoutMode) {
            this._lastRaceTimerLayoutMode = raceTimerLayoutMode;
            this._lastRaceTimeMs = -1;
        }

        this.applyExpansionLayout();
    }

    applyExpansionLayout() {
        const t = this.expandProgress;
        this.panelRoot.scale.set(t, 1, 1);
        this.panelRoot.visible = t > 0.001;
        this.panelMesh.material.opacity = 0.62 * t;
        this.textSprite.material.opacity = t;
        const pointerRadius = this.iconSize * 0.48;
        this.pointerSprite.position.set(
            Math.cos(this.pointerTargetAngle) * pointerRadius,
            Math.sin(this.pointerTargetAngle) * pointerRadius,
            0
        );
        this.pointerSprite.material.rotation = this.pointerTargetAngle;
        this.pointerSprite.visible = this.pointerVisible;
        this.pointerSprite.material.opacity = this.pointerVisible ? 1 : 0;
    }

    _updateRaceTimer() {
        const mission = this.currentMission;
        if (!mission || !isTimedMission(mission)) {
            this.raceTimerSprite.visible = false;
            return;
        }

        const timeMs = mission.raceTimeMs ?? 0;
        let progressIndex = 0;
        let progressTotal = 0;
        let statusText = '';

        if (mission.type === 'RACE') {
            const configuredRingCount = Array.isArray(mission.params?.rings) ? mission.params.rings.length : 0;
            const liveTotalRings = raceMission.isTrackingMission?.(mission)
                ? raceMission.getTotalRingCount?.()
                : 0;
            progressTotal = Number.isFinite(liveTotalRings) && liveTotalRings > 0
                ? liveTotalRings
                : (Number.isFinite(mission.totalRings) && mission.totalRings > 0
                    ? mission.totalRings
                    : configuredRingCount);
            const liveRingIndex = raceMission.isTrackingMission?.(mission)
                ? raceMission.getCompletedRingCount?.()
                : null;
            const completedRingCount = Number.isFinite(mission.missionResult?.ringsCompleted)
                ? mission.missionResult.ringsCompleted
                : 0;
            const rawRingIndex = Number.isFinite(liveRingIndex)
                ? liveRingIndex
                : (Number.isFinite(mission.currentRingIndex)
                    ? mission.currentRingIndex
                    : completedRingCount);
            progressIndex = THREE.MathUtils.clamp(rawRingIndex, 0, Math.max(progressTotal, 0));
            statusText = t('race_ring', progressIndex, progressTotal);
        } else if (mission.type === 'DESTROY_TIMED') {
            progressIndex = Math.max(0, mission.missionResult?.destroyedCount ?? 0);
            progressTotal = Math.max(
                progressIndex,
                mission.missionResult?.requiredCount ?? mission.params?.requiredCount ?? 0
            );
            statusText = `Destroy ${progressIndex}/${progressTotal}`;
        }

        // Only redraw when values change (cap timer refresh to ~20fps worth of change)
        const timeBucket = Math.floor(timeMs / 50);
        const layoutMode = this.lastLayoutWidth / this.lastLayoutHeight < 1.4 ? 'portrait' : 'landscape';
        if (timeBucket === Math.floor(this._lastRaceTimeMs / 50) &&
            progressIndex === this._lastRaceRingIndex &&
            progressTotal === this._lastRaceTotalRings &&
            layoutMode === this._lastRaceTimerLayoutMode) {
            return;
        }

        this._lastRaceTimeMs = timeMs;
        this._lastRaceRingIndex = progressIndex;
        this._lastRaceTotalRings = progressTotal;
        this._lastRaceTimerLayoutMode = layoutMode;

        const previousTexture = this.raceTimerSprite.material.map;
        this.raceTimerSprite.material.map = createMissionTimerTexture(timeMs, statusText, layoutMode);
        this.raceTimerSprite.material.opacity = 1;
        this.raceTimerSprite.material.needsUpdate = true;
        previousTexture?.dispose?.();
        this.raceTimerSprite.visible = true;
    }

    getMissionObjectCandidates(objectType) {
        return (this.game?.levelObjectManager?.objects || []).filter((levelObject) => (
            levelObject?.type === objectType &&
            !levelObject.isDestroyed &&
            !levelObject.markedForRemoval
        ));
    }

    getMissionObjectCandidatesOfTypes(objectTypes) {
        if (!Array.isArray(objectTypes)) return [];
        const typeSet = new Set(objectTypes);
        return (this.game?.levelObjectManager?.objects || []).filter((levelObject) => (
            typeSet.has(levelObject?.type) &&
            !levelObject.isDestroyed &&
            !levelObject.markedForRemoval
        ));
    }

    getObjectMissionPoint(levelObject) {
        const rect = levelObject?.getWorldCollisionRect?.() || levelObject?.getExplosionDamageRect?.();
        if (rect && Number.isFinite(rect.centerX) && Number.isFinite(rect.centerY)) {
            return { x: rect.centerX, y: rect.centerY };
        }

        const worldPosition = levelObject?.getWorldPosition?.(new THREE.Vector3());
        if (worldPosition && Number.isFinite(worldPosition.x) && Number.isFinite(worldPosition.y)) {
            return { x: worldPosition.x, y: worldPosition.y };
        }

        const position = levelObject?.container?.position || levelObject?.position || null;
        if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
            return { x: position.x, y: position.y };
        }

        return null;
    }

    getZoneMissionPoint(zone) {
        if (!zone) {
            return null;
        }

        return {
            x: (zone.left + zone.right) * 0.5,
            y: (zone.top + zone.bottom) * 0.5
        };
    }

    isPointInZone(point, zone) {
        return Boolean(
            point && zone &&
            point.x >= zone.left && point.x <= zone.right &&
            point.y >= zone.bottom && point.y <= zone.top
        );
    }

    getObjectsAlreadyDeliveredToZones(objectType, zones = []) {
        return this.getMissionObjectCandidates(objectType).filter((object) => {
            const point = this.getObjectMissionPoint(object);
            return zones.some((zone) => this.isPointInZone(point, zone));
        });
    }

    getObjectsAlreadyDeliveredToZonesOfTypes(objectTypes, zones = []) {
        return this.getMissionObjectCandidatesOfTypes(objectTypes).filter((object) => {
            const point = this.getObjectMissionPoint(object);
            return zones.some((zone) => this.isPointInZone(point, zone));
        });
    }

    getCurrentMissionPayloadObject(objectType) {
        const attachedObject = this.game?.player?.getAttachedObject?.();
        if (attachedObject?.type === objectType) {
            return attachedObject;
        }

        const draggedObject = this.game?.player?.draggedObject;
        if (draggedObject?.type === objectType) {
            return draggedObject;
        }

        return null;
    }

    findNearestPoint(referencePoint, points) {
        let nearestPoint = null;
        let nearestDistance = Number.POSITIVE_INFINITY;

        for (const point of points) {
            if (!point) {
                continue;
            }

            const distance = Math.hypot(point.x - referencePoint.x, point.y - referencePoint.y);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPoint = point;
            }
        }

        return nearestPoint;
    }

    // Returns an ordered list of {x, y} waypoints for the camera preview pan.
    // Used when mission.cameraPreview === true.
    getMissionPreviewWaypoints(mission) {
        const game = this.game;
        if (!mission || !game) return [];

        const params = mission.params || {};
        const objects = game?.levelObjectManager?.objects || [];
        const points = [];

        const addObj = (obj) => {
            // Use getPreviewCenter if available (e.g. rings use their node world pos).
            const p = obj?.getPreviewCenter?.() || this.getObjectMissionPoint(obj);
            if (p) points.push(p);
        };
        const addZoneId = (id) => {
            const zone = game.getMissionZoneById?.(id);
            const p = this.getZoneMissionPoint(zone);
            if (p) points.push(p);
        };
        const addZone = (zone) => {
            const p = this.getZoneMissionPoint(zone);
            if (p) points.push(p);
        };

        if (mission.type === 'FLY_TO_ZONE') {
            addZoneId(params.zoneId);

        } else if (mission.type === 'RACE') {
            const ringIds = Array.isArray(params.rings) ? params.rings : [];
            for (const id of ringIds) {
                const ring = objects.find((o) =>
                    (o?.type === 'ring' || o?.type === 'ringhorizontal') && (
                        o?.sourceObjectName === id || String(o?.id) === String(id)
                    )
                );
                if (ring) addObj(ring);
            }

        } else if (mission.type === 'DESTROY' || mission.type === 'DESTROY_TIMED') {
            const targets = Array.isArray(params.targets) ? params.targets : (params.targets ? [params.targets] : []);
            if (targets.length > 0) {
                for (const name of targets) {
                    const obj = objects.find((o) => o.sourceObjectName === name && !o.isDestroyed);
                    if (obj) addObj(obj);
                }
            } else if (params.objectType) {
                for (const obj of this.getMissionObjectCandidates(params.objectType)) {
                    addObj(obj);
                }
            }

        } else if (mission.type === 'DELIVER_OBJECT_TO_ZONE') {
            const zoneIds = Array.isArray(params.zoneIds) ? params.zoneIds
                : (params.zoneId ? [params.zoneId] : []);
            const zones = zoneIds.map((id) => game.getMissionZoneById?.(id) || null).filter(Boolean);

            if (Array.isArray(params.objectNames) && params.objectNames.length > 0) {
                // Show each named object then its paired zone.
                for (let i = 0; i < params.objectNames.length; i++) {
                    const obj = objects.find((o) => o?.sourceObjectName === params.objectNames[i] && !o.isDestroyed);
                    if (obj) addObj(obj);
                    const zoneId = zoneIds[Math.min(i, zoneIds.length - 1)];
                    if (zoneId) addZoneId(zoneId);
                }
            } else if (Array.isArray(params.objectTypes) && params.objectTypes.length > 0) {
                // Show the nearest object of any of the types that still needs delivering.
                const candidates = this.getMissionObjectCandidatesOfTypes(params.objectTypes).filter((object) => {
                    const point = this.getObjectMissionPoint(object);
                    return !zones.some((zone) => this.isPointInZone(point, zone));
                });
                const playerPos = game.player?.position || { x: 0, y: 0 };
                const nearest = this.findNearestPoint(playerPos, candidates.map((o) => this.getObjectMissionPoint(o)));
                if (nearest) points.push(nearest);
                for (const id of zoneIds) addZoneId(id);
            } else if (params.objectType) {
                // Show the nearest object that still needs delivering, not one that already
                // counts inside the end zone(s).
                const candidates = this.getMissionObjectCandidates(params.objectType).filter((object) => {
                    const point = this.getObjectMissionPoint(object);
                    return !zones.some((zone) => this.isPointInZone(point, zone));
                });
                const playerPos = game.player?.position || { x: 0, y: 0 };
                const nearest = this.findNearestPoint(playerPos, candidates.map((o) => this.getObjectMissionPoint(o)));
                if (nearest) points.push(nearest);
                for (const id of zoneIds) addZoneId(id);
            }

        } else if (mission.type === 'PLACE_OBJECT_ON_TARGET') {
            if (params.objectType) {
                const candidates = this.getMissionObjectCandidates(params.objectType);
                const playerPos = game.player?.position || { x: 0, y: 0 };
                const nearest = this.findNearestPoint(playerPos, candidates.map((o) => this.getObjectMissionPoint(o)));
                if (nearest) points.push(nearest);
            }
            const zones = game.getMissionZonesByType?.(params.targetType) || [];
            for (const zone of zones) addZone(zone);

        } else {
            // Generic fallback: show object candidates then any zones.
            if (params.objectType) {
                const candidates = this.getMissionObjectCandidates(params.objectType);
                for (const obj of candidates) addObj(obj);
            }
            const zoneIds = Array.isArray(params.zoneIds) ? params.zoneIds
                : (params.zoneId ? [params.zoneId] : []);
            for (const id of zoneIds) addZoneId(id);
        }

        // Deduplicate adjacent identical points.
        return points.filter((p, i) =>
            i === 0 || Math.hypot(p.x - points[i - 1].x, p.y - points[i - 1].y) > 0.5
        );
    }

    // Arrow guidance for DELIVER_OBJECT_TO_ZONE — handles all three param modes.
    _getDeliverObjectGuideTarget(mission, params, game, playerPosition) {
        const objects = game?.levelObjectManager?.objects || [];
        const zoneIds = Array.isArray(params.zoneIds) ? params.zoneIds
            : (params.zoneId ? [params.zoneId] : []);
        const zones = zoneIds.map((id) => game?.getMissionZoneById?.(id) || null);
        const objPoint = (o) => this.getObjectMissionPoint(o);

        // --- objectNames mode ---
        if (Array.isArray(params.objectNames) && params.objectNames.length > 0) {
            const getObj = (name) => objects.find(
                (o) => o?.sourceObjectName === name && !o.isDestroyed && !o.markedForRemoval
            ) || null;

            const attachedObj = this.game?.player?.getAttachedObject?.();
            const draggedObj = this.game?.player?.draggedObject;
            const carriedName = params.objectNames.find((name) => {
                const o = getObj(name);
                return o && (o === attachedObj || o === draggedObj);
            });

            if (carriedName) {
                // Point to the zone assigned to the object being carried.
                const idx = params.objectNames.indexOf(carriedName);
                const zone = zones[Math.min(idx, zones.length - 1)];
                return this.getZoneMissionPoint(zone);
            }

            // Point to the first undelivered object.
            for (let i = 0; i < params.objectNames.length; i++) {
                const name = params.objectNames[i];
                const obj = getObj(name);
                if (!obj) continue;
                const zone = zones[Math.min(i, zones.length - 1)];
                if (!this.isPointInZone(objPoint(obj), zone)) {
                    return objPoint(obj);
                }
            }
            return null;
        }

        // --- objectTypes + zoneIds: one object per zone ---
        if (Array.isArray(params.objectTypes) && params.objectTypes.length > 0 && zones.length > 1) {
            const attachedObj = this.game?.player?.getAttachedObject?.();
            const draggedObj = this.game?.player?.draggedObject;
            const carriedObj = (attachedObj && params.objectTypes.includes(attachedObj?.type) ? attachedObj : null)
                || (draggedObj && params.objectTypes.includes(draggedObj?.type) ? draggedObj : null);

            if (carriedObj) {
                // Find first zone that doesn't yet have an object of any of the types.
                const idleObjects = this.getMissionObjectCandidatesOfTypes(params.objectTypes)
                    .filter((o) => o !== carriedObj);
                const freeZone = zones.find((zone) => zone && !idleObjects.some(
                    (o) => this.isPointInZone(objPoint(o), zone)
                ));
                return this.getZoneMissionPoint(freeZone || zones[zones.length - 1]);
            }

            // Point to an object that still needs to be delivered to a free zone.
            const idleObjects = this.getMissionObjectCandidatesOfTypes(params.objectTypes);
            const freeZone = zones.find((zone) => zone && !idleObjects.some(
                (o) => this.isPointInZone(objPoint(o), zone)
            ));
            if (!freeZone) return null;

            // Point to the nearest object not already in a zone.
            const undelivered = idleObjects.filter(
                (o) => !zones.some((z) => z && this.isPointInZone(objPoint(o), z))
            );
            const pts = undelivered.map(objPoint).filter(Boolean);
            return this.findNearestPoint(playerPosition, pts);
        }

        // --- objectType + zoneIds: one object per zone ---
        if (params.objectType && zones.length > 1) {
            const attachedObj = this.game?.player?.getAttachedObject?.();
            const draggedObj = this.game?.player?.draggedObject;
            const carriedObj = (attachedObj?.type === params.objectType ? attachedObj : null)
                || (draggedObj?.type === params.objectType ? draggedObj : null);

            if (carriedObj) {
                // Find first zone that doesn't yet have an object of this type.
                const idleObjects = this.getMissionObjectCandidates(params.objectType)
                    .filter((o) => o !== carriedObj);
                const freeZone = zones.find((zone) => zone && !idleObjects.some(
                    (o) => this.isPointInZone(objPoint(o), zone)
                ));
                return this.getZoneMissionPoint(freeZone || zones[zones.length - 1]);
            }

            // Point to an object that still needs to be delivered to a free zone.
            const idleObjects = this.getMissionObjectCandidates(params.objectType);
            const freeZone = zones.find((zone) => zone && !idleObjects.some(
                (o) => this.isPointInZone(objPoint(o), zone)
            ));
            if (!freeZone) return null;

            // Point to the nearest object not already in a zone.
            const undelivered = idleObjects.filter(
                (o) => !zones.some((z) => z && this.isPointInZone(objPoint(o), z))
            );
            const pts = undelivered.map(objPoint).filter(Boolean);
            return this.findNearestPoint(playerPosition, pts);
        }

        // --- objectTypes + single zone ---
        if (Array.isArray(params.objectTypes) && params.objectTypes.length > 0) {
            const validZones = zones.filter(Boolean);
            const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
            const deliveredObjects = this.getObjectsAlreadyDeliveredToZonesOfTypes(params.objectTypes, validZones);
            if (deliveredObjects.length >= requiredCount) {
                return null;
            }

            const attachedObj = this.game?.player?.getAttachedObject?.();
            const draggedObj = this.game?.player?.draggedObject;
            const carriedObj = (attachedObj && params.objectTypes.includes(attachedObj?.type) ? attachedObj : null)
                || (draggedObj && params.objectTypes.includes(draggedObj?.type) ? draggedObj : null);

            if (carriedObj) {
                const zonePoints = validZones.map((z) => this.getZoneMissionPoint(z)).filter(Boolean);
                return this.findNearestPoint(this.getObjectMissionPoint(carriedObj) || playerPosition, zonePoints);
            }

            const deliveredSet = new Set(deliveredObjects);
            const pts = this.getMissionObjectCandidatesOfTypes(params.objectTypes)
                .filter((object) => !deliveredSet.has(object))
                .map((o) => this.getObjectMissionPoint(o))
                .filter(Boolean);
            return this.findNearestPoint(playerPosition, pts);
        }

        // --- Legacy: objectType + single zone ---
        if (!params.objectType) return null;
        const validZones = zones.filter(Boolean);
        const requiredCount = Math.max(1, Number.isFinite(params.requiredCount) ? params.requiredCount : 1);
        const deliveredObjects = this.getObjectsAlreadyDeliveredToZones(params.objectType, validZones);
        if (deliveredObjects.length >= requiredCount) {
            return null;
        }

        const carriedObj = this.getCurrentMissionPayloadObject(params.objectType);
        if (carriedObj) {
            const zonePoints = validZones.map((z) => this.getZoneMissionPoint(z)).filter(Boolean);
            return this.findNearestPoint(this.getObjectMissionPoint(carriedObj) || playerPosition, zonePoints);
        }

        const deliveredSet = new Set(deliveredObjects);
        const pts = this.getMissionObjectCandidates(params.objectType)
            .filter((object) => !deliveredSet.has(object))
            .map((o) => this.getObjectMissionPoint(o))
            .filter(Boolean);
        return this.findNearestPoint(playerPosition, pts);
    }

    getMissionGuideTargetPoint() {
        const mission = this.currentMission;
        const game = this.game;
        const playerPosition = game?.player?.position;
        const params = mission?.params || {};
        if (!mission || !game || !playerPosition) {
            return null;
        }

        if (mission.type === 'FLY_TO_ZONE') {
            return this.getZoneMissionPoint(game?.getMissionZoneById?.(params.zoneId));
        }

        if (mission.type === 'RACE') {
            const targetRing = raceMission.getCurrentTargetRing(mission);
            return targetRing ? this.getObjectMissionPoint(targetRing) : null;
        }

        if (mission.type === 'DESTROY' || mission.type === 'DESTROY_TIMED') {
            const targets = Array.isArray(params.targets) ? params.targets : (params.targets ? [params.targets] : []);
            const objects = game?.levelObjectManager?.objects || [];
            if (targets.length > 0) {
                const first = targets
                    .map((name) => objects.find((o) => o.sourceObjectName === name && !o.isDestroyed && o.health > 0))
                    .find(Boolean);
                return first ? this.getObjectMissionPoint(first) : null;
            }

            if (!params.objectType) {
                return null;
            }

            const aliveObjects = this.getMissionObjectCandidates(params.objectType)
                .filter((levelObject) => levelObject.health > 0);
            const alivePoints = aliveObjects
                .map((levelObject) => this.getObjectMissionPoint(levelObject))
                .filter(Boolean);
            return this.findNearestPoint(playerPosition, alivePoints);
        }

        if (mission.type === 'DELIVER_OBJECT_TO_ZONE') {
            return this._getDeliverObjectGuideTarget(mission, params, game, playerPosition);
        }

        if (!params.objectType) {
            return null;
        }

        const carriedMissionObject = this.getCurrentMissionPayloadObject(params.objectType);
        const shouldGuideToZone = carriedMissionObject && mission.type === 'PLACE_OBJECT_ON_TARGET';

        if (shouldGuideToZone) {
            const originPoint = this.getObjectMissionPoint(carriedMissionObject) || playerPosition;
            const zones = game?.getMissionZonesByType?.(params.targetType) || [];
            const zonePoints = zones.map((zone) => this.getZoneMissionPoint(zone)).filter(Boolean);
            return this.findNearestPoint(originPoint, zonePoints);
        }

        if (carriedMissionObject) {
            return null;
        }

        const objectPoints = this.getMissionObjectCandidates(params.objectType)
            .map((levelObject) => this.getObjectMissionPoint(levelObject))
            .filter(Boolean);
        return this.findNearestPoint(playerPosition, objectPoints);
    }

    updatePointerTarget() {
        // Recompute guide target every 3 frames — position accuracy at 60fps is ~50ms lag, imperceptible.
        if (this._guideTargetFrameSkip <= 0) {
            this._guideTargetCache = this.getMissionGuideTargetPoint();
            this._guideTargetFrameSkip = 3;
        } else {
            this._guideTargetFrameSkip--;
        }
        const targetPoint = this._guideTargetCache;
        const camera = this.game?.camera;
        const viewport = this.game?.sceneViewport;
        if (!targetPoint || !camera || !viewport) {
            this.pointerVisible = false;
            return;
        }

        const worldPoint = this._scratchWorldVec3.set(targetPoint.x, targetPoint.y, 0).project(camera);
        const targetScreenX = viewport.x + ((worldPoint.x + 1) * 0.5 * viewport.width);
        const targetScreenY = viewport.y + ((1 - ((worldPoint.y + 1) * 0.5)) * viewport.height);
        const buttonCenterX = this.iconX;
        const buttonCenterY = this.lastLayoutHeight - this.iconY;
        const deltaX = targetScreenX - buttonCenterX;
        const deltaY = buttonCenterY - targetScreenY;
        if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (Math.abs(deltaX) < 0.001 && Math.abs(deltaY) < 0.001)) {
            this.pointerVisible = false;
            return;
        }

        this.pointerTargetAngle = Math.atan2(deltaY, deltaX);
        this.pointerVisible = true;
    }

    containsClientPoint(clientX, clientY) {
        return clientX >= this.bounds.left &&
            clientX <= this.bounds.right &&
            clientY >= this.bounds.top &&
            clientY <= this.bounds.bottom;
    }

    onPointerDown(event) {
        if (!this.uiVisible || !this.currentMission || !this.containsClientPoint(event.clientX, event.clientY)) {
            return;
        }

        if (this.isExpanded) {
            this.isExpanded = false;
            this.autoCollapseRemaining = 0;
        } else {
            this.expandTemporarily();
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
    }

    render(renderer) {
        if (!this.uiVisible || !this.currentMission || !this.root.visible) {
            return;
        }

        renderer.clearDepth();
        renderer.render(this.uiScene, this.uiCamera);
    }

    dispose() {
        this.domElement?.removeEventListener?.('pointerdown', this.handlePointerDown, { capture: true });
        this.root.traverse((child) => {
            child.material?.map?.dispose?.();
            child.material?.dispose?.();
            child.geometry?.dispose?.();
        });
        this.raceTimerSprite.material.map?.dispose?.();
        this.raceTimerSprite.material.dispose?.();
        for (const texture of Object.values(this.textures)) {
            texture?.dispose?.();
        }
    }
}
