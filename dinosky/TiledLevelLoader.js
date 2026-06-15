import { CONFIG } from './config.js';
import { TiledLevel, GAMEPLAY_TYPES } from './TiledLevel.js';
import { fetchWithRetry } from './fetchWithRetry.js';

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const FLIP_D = 0x20000000;
const FLIP_FLAG_MASK = FLIP_H | FLIP_V | FLIP_D;

function resolveUrl(url, baseUrl) {
    return new URL(url, baseUrl).href;
}

function getBaseUrl() {
    return typeof document !== 'undefined' && document.baseURI
        ? document.baseURI
        : window.location.href;
}

function getDirectChild(parentNode, tagName) {
    return Array.from(parentNode?.children || []).find((child) => child.tagName === tagName) || null;
}

function getDirectChildren(parentNode, tagName) {
    return Array.from(parentNode?.children || []).filter((child) => child.tagName === tagName);
}

function propertiesToObject(properties = []) {
    const output = {};
    for (const entry of properties) {
        output[entry.name] = entry.value;
    }
    return output;
}

function coerceNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function coerceBoolean(value, fallback) {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }

    return fallback;
}

function isLevelObjectsLayerName(name) {
    const configuredName = String(CONFIG.LEVEL_OBJECTS?.spawnLayerName || 'LevelObjects').trim().toLowerCase();
    return String(name || '').trim().toLowerCase() === configuredName;
}

function isBurnableObjectsLayerName(name) {
    const configuredName = String(CONFIG.BURNABLE_SCENERY?.layerName || 'BurnableObjects').trim().toLowerCase();
    return String(name || '').trim().toLowerCase() === configuredName;
}

function isGameplayLayerName(name) {
    return String(name || '').trim().toLowerCase() === 'gameplay';
}

function createTileDefinition(tilesetTile = {}, fallbackProps = {}) {
    const props = {
        ...fallbackProps,
        ...propertiesToObject(tilesetTile.properties)
    };
    const gameplayType = props.gameplayType || GAMEPLAY_TYPES.EMPTY;
    const defaultHeight = gameplayType === GAMEPLAY_TYPES.EMPTY ? 0 : 1;
    const startHeight = coerceNumber(props.startHeight, defaultHeight);
    const endHeight = coerceNumber(props.endHeight, defaultHeight);

    const takeoffAllowed = coerceBoolean(
        props.takeoffAllowed,
        gameplayType === GAMEPLAY_TYPES.GROUND
    );
    const breakable = coerceBoolean(
        props.breakable,
        gameplayType === GAMEPLAY_TYPES.BREAKABLE
    );
    const norender = coerceBoolean(props.norender, false);

    return {
        gid: 0,
        gameplayType,
        startHeight,
        endHeight,
        takeoffAllowed,
        breakable,
        norender,
        renderInfo: tilesetTile.renderInfo || null,
        broken: false,
        sourceLayer: null,
        tileProperties: props
    };
}

function decodeTiledGid(rawGid) {
    const horizontal = (rawGid & FLIP_H) !== 0;
    const vertical = (rawGid & FLIP_V) !== 0;
    const diagonal = (rawGid & FLIP_D) !== 0;
    const cleanGid = rawGid & ~FLIP_FLAG_MASK;

    return {
        rawGid,
        cleanGid,
        horizontal,
        vertical,
        diagonal
    };
}

function parseXmlProperties(parentNode) {
    const propertiesNode = getDirectChild(parentNode, 'properties');
    if (!propertiesNode) {
        return [];
    }

    return getDirectChildren(propertiesNode, 'property').map((propertyNode) => {
        const type = propertyNode.getAttribute('type') || 'string';
        const rawValue = propertyNode.getAttribute('value') ?? propertyNode.textContent ?? '';
        let value = rawValue;

        if (type === 'bool') {
            value = rawValue === 'true';
        } else if (type === 'float' || type === 'int') {
            const numericValue = Number(rawValue);
            value = Number.isFinite(numericValue) ? numericValue : rawValue;
        }

        return {
            name: propertyNode.getAttribute('name'),
            type,
            value
        };
    });
}

function parseTsxTileset(tsxText, tsxUrl) {
    const xml = new DOMParser().parseFromString(tsxText, 'application/xml');
    const parserError = xml.querySelector('parsererror');
    if (parserError) {
        throw new Error(`Failed to parse TSX "${tsxUrl}".`);
    }

    const tilesetNode = xml.querySelector('tileset');
    if (!tilesetNode) {
        throw new Error(`TSX "${tsxUrl}" does not contain a <tileset> root.`);
    }

    const tileWidth = Number(tilesetNode.getAttribute('tilewidth')) || 0;
    const tileHeight = Number(tilesetNode.getAttribute('tileheight')) || 0;
    const tileCount = Number(tilesetNode.getAttribute('tilecount')) || 0;
    const columns = Number(tilesetNode.getAttribute('columns')) || 0;
    const spacing = Number(tilesetNode.getAttribute('spacing')) || 0;
    const margin = Number(tilesetNode.getAttribute('margin')) || 0;
    const fallbackProps = propertiesToObject(parseXmlProperties(tilesetNode));
    const imageNode = getDirectChild(tilesetNode, 'image');
    const imageSource = imageNode?.getAttribute('source') || null;
    const imageWidth = Number(imageNode?.getAttribute('width')) || 0;
    const imageHeight = Number(imageNode?.getAttribute('height')) || 0;
    const imageUrl = imageSource ? resolveUrl(imageSource, tsxUrl) : null;
    const tiles = [];

    const createAtlasRenderInfo = (tileId) => {
        if (!imageUrl || tileWidth <= 0 || tileHeight <= 0 || columns <= 0) {
            return null;
        }

        const col = tileId % columns;
        const row = Math.floor(tileId / columns);
        return {
            imageUrl,
            imageWidth,
            imageHeight,
            tileWidth,
            tileHeight,
            x: margin + col * (tileWidth + spacing),
            y: margin + row * (tileHeight + spacing)
        };
    }

    for (const tileNode of getDirectChildren(tilesetNode, 'tile')) {
        const tileId = Number(tileNode.getAttribute('id')) || 0;
        const tileImageNode = getDirectChild(tileNode, 'image');
        let renderInfo = createAtlasRenderInfo(tileId);

        if (tileImageNode) {
            const tileImageSource = tileImageNode.getAttribute('source');
            const tileImageWidth = Number(tileImageNode.getAttribute('width')) || 0;
            const tileImageHeight = Number(tileImageNode.getAttribute('height')) || 0;
            renderInfo = tileImageSource ? {
                kind: 'image',
                imageUrl: resolveUrl(tileImageSource, tsxUrl),
                imageWidth: tileImageWidth,
                imageHeight: tileImageHeight
            } : null;
        } else if (renderInfo) {
            renderInfo = {
                kind: 'atlas',
                ...renderInfo
            };
        }

        tiles.push({
            id: tileId,
            properties: parseXmlProperties(tileNode),
            renderInfo
        });
    }

    if (tiles.length === 0 && imageUrl && tileCount > 0) {
        for (let tileId = 0; tileId < tileCount; tileId += 1) {
            tiles.push({
                id: tileId,
                properties: [],
                renderInfo: {
                    kind: 'atlas',
                    ...createAtlasRenderInfo(tileId)
                }
            });
        }
    }

    return {
        firstgid: 0,
        properties: Object.entries(fallbackProps).map(([name, value]) => ({ name, value })),
        tiles
    };
}

const EXPECTED_VERSION = 19;

function expandPhysicsData(obf) {
    const collisionEdgeGroups = [];
    const polygons = [];
    const convexPieces = [];

    for (const cp of obf.cp) {
        const pts = cp.p;
        const regionType = cp.rt || 'solid';
        const edgeMeta = cp.e || null;
        const rawPts = [];

        for (let i = 0; i < pts.length; i++) {
            rawPts.push({ x: pts[i].x, y: pts[i].y });
        }
        convexPieces.push(rawPts);

        // Bounding circle: center = average of vertices, radius = max distance from center.
        let cx = 0, cy = 0;
        for (let i = 0; i < pts.length; i++) { cx += pts[i].x; cy += pts[i].y; }
        cx /= pts.length; cy /= pts.length;
        let r = 0;
        for (let i = 0; i < pts.length; i++) {
            const dx = pts[i].x - cx, dy = pts[i].y - cy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > r) r = d;
        }

        // Build full edge objects for collision detection.
        const polyEdges = [];
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % pts.length];
            const meta = edgeMeta ? edgeMeta[i] : {};
            const type = meta.t || 'top';
            const takeoffAllowed = meta.ta !== false;
            polyEdges.push({
                start: { x: a.x, y: a.y },
                end:   { x: b.x, y: b.y },
                x1: a.x, y1: a.y,
                x2: b.x, y2: b.y,
                type,
                takeoffAllowed,
                regionType,
            });
        }
        collisionEdgeGroups.push({ cx, cy, r, edges: polyEdges });
        polygons.push({ edges: polyEdges, regionType });
    }

    return { collisionEdgeGroups, polygons, convexPieces };
}

function resolveParsedObjectShapeType(object) {
    const explicitShape = String(object?.shape || '').trim().toLowerCase();
    if (explicitShape) {
        return explicitShape;
    }
    if (Array.isArray(object?.polygon) && object.polygon.length >= 3) {
        return 'polygon';
    }
    if (object?.ellipse === true) {
        return 'ellipse';
    }
    return 'rectangle';
}

function transformTiledScreenPointToWorld(object, localX, localY, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY) {
    const rotationRad = ((object?.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rotationRad);
    const sin = Math.sin(rotationRad);
    const rotatedX = (localX * cos) - (localY * sin);
    const rotatedY = (localX * sin) + (localY * cos);
    const screenX = (object?.x || 0) + rotatedX;
    const screenY = (object?.y || 0) + rotatedY;
    return {
        x: worldOriginX + (screenX * scaleX),
        y: worldOriginY + (mapWorldHeight - (screenY * scaleY))
    };
}

function createEllipseWorldPoints(object, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY, segments = 20) {
    const width = Math.max(object?.width || 0, 0);
    const height = Math.max(object?.height || 0, 0);
    if (width <= 0 || height <= 0) {
        return [];
    }

    const radiusX = width * 0.5;
    const radiusY = height * 0.5;
    const centerX = radiusX;
    const centerY = radiusY;
    const points = [];
    for (let i = 0; i < segments; i += 1) {
        const t = (i / segments) * Math.PI * 2;
        points.push(
            transformTiledScreenPointToWorld(
                object,
                centerX + (Math.cos(t) * radiusX),
                centerY + (Math.sin(t) * radiusY),
                worldOriginX,
                worldOriginY,
                mapWorldHeight,
                scaleX,
                scaleY
            )
        );
    }
    return points;
}

function createCapsuleWorldPoints(object, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY, arcSegments = 8) {
    const width = Math.max(object?.width || 0, 0);
    const height = Math.max(object?.height || 0, 0);
    if (width <= 0 || height <= 0) {
        return [];
    }

    if (Math.abs(width - height) <= 0.0001) {
        return createEllipseWorldPoints(object, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY, arcSegments * 2);
    }

    const points = [];
    if (width > height) {
        const radius = height * 0.5;
        const leftCenterX = radius;
        const rightCenterX = width - radius;
        const centerY = radius;
        for (let i = 0; i <= arcSegments; i += 1) {
            const t = Math.PI * 0.5 + (i / arcSegments) * Math.PI;
            points.push(transformTiledScreenPointToWorld(
                object,
                leftCenterX + (Math.cos(t) * radius),
                centerY + (Math.sin(t) * radius),
                worldOriginX,
                worldOriginY,
                mapWorldHeight,
                scaleX,
                scaleY
            ));
        }
        for (let i = 0; i <= arcSegments; i += 1) {
            const t = -Math.PI * 0.5 + (i / arcSegments) * Math.PI;
            points.push(transformTiledScreenPointToWorld(
                object,
                rightCenterX + (Math.cos(t) * radius),
                centerY + (Math.sin(t) * radius),
                worldOriginX,
                worldOriginY,
                mapWorldHeight,
                scaleX,
                scaleY
            ));
        }
        return points;
    }

    const radius = width * 0.5;
    const centerX = radius;
    const topCenterY = radius;
    const bottomCenterY = height - radius;
    for (let i = 0; i <= arcSegments; i += 1) {
        const t = Math.PI + (i / arcSegments) * Math.PI;
        points.push(transformTiledScreenPointToWorld(
            object,
            centerX + (Math.cos(t) * radius),
            topCenterY + (Math.sin(t) * radius),
            worldOriginX,
            worldOriginY,
            mapWorldHeight,
            scaleX,
            scaleY
        ));
    }
    for (let i = 0; i <= arcSegments; i += 1) {
        const t = (i / arcSegments) * Math.PI;
        points.push(transformTiledScreenPointToWorld(
            object,
            centerX + (Math.cos(t) * radius),
            bottomCenterY + (Math.sin(t) * radius),
            worldOriginX,
            worldOriginY,
            mapWorldHeight,
            scaleX,
            scaleY
        ));
    }
    return points;
}

function createParsedObjectWorldShapePoints(object, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY) {
    const shapeType = resolveParsedObjectShapeType(object);
    if (shapeType === 'polygon') {
        return (object.polygon || []).map((point) => (
            transformTiledScreenPointToWorld(
                object,
                point.x || 0,
                point.y || 0,
                worldOriginX,
                worldOriginY,
                mapWorldHeight,
                scaleX,
                scaleY
            )
        ));
    }
    if (shapeType === 'ellipse' || shapeType === 'oval') {
        return createEllipseWorldPoints(object, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY);
    }
    if (
        shapeType === 'capsule' ||
        shapeType === 'roundrectangle' ||
        shapeType === 'roundedrectangle' ||
        shapeType === 'rounded-rectangle'
    ) {
        return createCapsuleWorldPoints(object, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY);
    }

    const width = Math.max(object?.width || 0, 0);
    const height = Math.max(object?.height || 0, 0);
    return [
        transformTiledScreenPointToWorld(object, 0, 0, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY),
        transformTiledScreenPointToWorld(object, width, 0, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY),
        transformTiledScreenPointToWorld(object, width, height, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY),
        transformTiledScreenPointToWorld(object, 0, height, worldOriginX, worldOriginY, mapWorldHeight, scaleX, scaleY)
    ];
}

export class TiledLevelLoader {
    async load(url) {
        const mapUrl = resolveUrl(url, getBaseUrl());
        const response = await fetchWithRetry(mapUrl).catch((err) => {
            throw new Error(`Failed to load Tiled map "${url}": ${err.message}`);
        });
        const mapJson = await response.json();

        let prebuiltCollisionData = null;
        let prebuiltWaterPolygons = null;
        try {
            const props = Array.isArray(mapJson.properties) ? mapJson.properties : [];
            const pProp = props.find((p) => p.name === '_p');
            if (pProp?.value) {
                const obf = JSON.parse(pProp.value);
                if (obf?.v === EXPECTED_VERSION &&
                    Array.isArray(obf.cp) && obf.cp.length > 0) {
                    prebuiltCollisionData = expandPhysicsData(obf);
                    console.info(`[TiledLevelLoader] Using embedded physics data (${prebuiltCollisionData.convexPieces.length} convex pieces, ${prebuiltCollisionData.collisionEdgeGroups.length} groups)`);
                }
            }
            const wProp = props.find((p) => p.name === '_w');
            if (wProp?.value) {
                const wobf = JSON.parse(wProp.value);
                if (wobf?.v === EXPECTED_VERSION && Array.isArray(wobf.wp)) {
                    prebuiltWaterPolygons = wobf.wp.map((wp) => ({ points: wp.p, concave: wp.cc === true }));
                    console.info(`[TiledLevelLoader] Using embedded water polygons (${prebuiltWaterPolygons.length} polygons)`);
                }
            }
        } catch (e) {
            console.warn('[TiledLevelLoader] Could not parse embedded physics data:', e);
        }

        return this.parse(mapJson, mapUrl, prebuiltCollisionData, prebuiltWaterPolygons);
    }

    async parse(mapJson, mapUrl = getBaseUrl(), prebuiltCollisionData = null, prebuiltWaterPolygons = null) {
        if (!mapJson || mapJson.type !== 'map') {
            throw new Error('TiledLevelLoader expected a Tiled map JSON object.');
        }

        const width = mapJson.width;
        const height = mapJson.height;
        const authoredTileWidth = mapJson.tilewidth;
        const authoredTileHeight = mapJson.tileheight;
        const mapProperties = propertiesToObject(mapJson.properties);
        const worldOriginX = coerceNumber(mapProperties.worldOriginX, 0);
        const worldOriginY = coerceNumber(mapProperties.worldOriginY, 0);
        const tileWidth = coerceNumber(
            mapProperties.worldTileWidth,
            CONFIG.LEVEL_WORLD_TILE_WIDTH
        );
        const tileHeight = coerceNumber(
            mapProperties.worldTileHeight,
            CONFIG.LEVEL_WORLD_TILE_HEIGHT
        );

        const tileDefinitionsByGid = await this.parseTilesets(mapJson.tilesets || [], mapUrl);
        const cells = new Array(width * height).fill(null).map(() => ({
            gid: 0,
            gameplayType: GAMEPLAY_TYPES.EMPTY,
            startHeight: 0,
            endHeight: 0,
            takeoffAllowed: false,
            breakable: false,
            norender: false,
            renderInfo: null,
            broken: false,
            sourceLayer: null
        }));
        const objectLayers = [];
        const renderLayers = [];

        for (const layer of mapJson.layers || []) {
            if (layer.type === 'tilelayer') {
                const tileData = this.readTileLayerData(layer, width, height);
                const isGameplayLayer = isGameplayLayerName(layer.name);
                const layerTiles = new Array(width * height).fill(null);
                for (let topRow = 0; topRow < height; topRow += 1) {
                    for (let col = 0; col < width; col += 1) {
                        const { gidInfo, definition } = this.resolveTileDefinitionFromGid(
                            tileData[topRow * width + col] || 0,
                            tileDefinitionsByGid
                        );
                        if (gidInfo.cleanGid === 0) {
                            continue;
                        }

                        const row = height - 1 - topRow;
                        if (!definition) {
                            continue;
                        }

                        const tile = {
                            ...definition,
                            gid: gidInfo.cleanGid,
                            flip: {
                                horizontal: gidInfo.horizontal,
                                vertical: gidInfo.vertical,
                                diagonal: gidInfo.diagonal
                            },
                            sourceLayer: layer.name || null,
                            broken: false
                        };

                        layerTiles[row * width + col] = tile;

                        // Only the Gameplay layer feeds collision and gameplay queries. Other
                        // tile layers keep their own tiles for rendering without tile properties.
                        if (isGameplayLayer) {
                            cells[row * width + col] = tile;
                        }
                    }
                }

                renderLayers.push({
                    type: 'tilelayer',
                    id: layer.id ?? null,
                    name: layer.name || 'Tile Layer',
                    visible: layer.visible !== false,
                    opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
                    tiles: layerTiles,
                    gameplay: isGameplayLayer
                });
                continue;
            }

            if (layer.type === 'objectgroup') {
                const isLevelObjectsLayer = isLevelObjectsLayerName(layer.name);
                const isBurnableObjectsLayer = isBurnableObjectsLayerName(layer.name);
                const parsedObjectLayer = this.parseObjectLayer(
                    layer,
                    mapJson,
                    worldOriginX,
                    worldOriginY,
                    tileWidth,
                    tileHeight,
                    authoredTileWidth,
                    authoredTileHeight,
                    tileDefinitionsByGid,
                    isLevelObjectsLayer,
                    isBurnableObjectsLayer
                );
                objectLayers.push(parsedObjectLayer);

                if (!parsedObjectLayer.spawnOnly) {
                    renderLayers.push({
                        type: 'objectgroup',
                        id: layer.id ?? null,
                        name: parsedObjectLayer.name,
                        visible: parsedObjectLayer.visible,
                        opacity: parsedObjectLayer.opacity,
                        objects: parsedObjectLayer.objects
                    });
                }
            }
        }

        return new TiledLevel({
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
            prebuiltCollisionData,
            prebuiltWaterPolygons
        });
    }

    async parseTilesets(tilesets, mapUrl) {
        const definitions = new Map();

        for (const tileset of tilesets) {
            const parsedTileset = tileset.source
                ? await this.loadExternalTileset(tileset, mapUrl)
                : tileset;
            const firstGid = tileset.firstgid;
            const fallbackProps = propertiesToObject(parsedTileset.properties);
            const tiles = parsedTileset.tiles || [];

            for (const tile of tiles) {
                const definition = createTileDefinition(tile, fallbackProps);
                definitions.set(firstGid + tile.id, definition);
            }
        }

        return definitions;
    }

    resolveTileDefinitionFromGid(rawGid, tileDefinitionsByGid) {
        const gidInfo = decodeTiledGid(rawGid);
        const definition = gidInfo.cleanGid > 0
            ? tileDefinitionsByGid.get(gidInfo.cleanGid) || null
            : null;

        return { gidInfo, definition };
    }

    async loadExternalTileset(tileset, mapUrl) {
        const tsxUrl = resolveUrl(tileset.source, mapUrl);
        const response = await fetchWithRetry(tsxUrl).catch((err) => {
            throw new Error(`Failed to load tileset "${tileset.source}": ${err.message}`);
        });

        const tsxText = await response.text();
        return parseTsxTileset(tsxText, tsxUrl);
    }

    readTileLayerData(layer, width, height) {
        if (Array.isArray(layer.data)) {
            return layer.data;
        }

        if (Array.isArray(layer.chunks)) {
            const merged = new Array(width * height).fill(0);
            for (const chunk of layer.chunks) {
                for (let row = 0; row < chunk.height; row += 1) {
                    for (let col = 0; col < chunk.width; col += 1) {
                        const worldCol = chunk.x + col;
                        const worldRow = chunk.y + row;
                        if (worldCol < 0 || worldCol >= width || worldRow < 0 || worldRow >= height) {
                            continue;
                        }
                        merged[worldRow * width + worldCol] = chunk.data[row * chunk.width + col];
                    }
                }
            }
            return merged;
        }

        throw new Error(`Unsupported Tiled layer encoding for "${layer.name || 'unnamed layer'}".`);
    }

    parseObjectLayer(
        layer,
        mapJson,
        worldOriginX,
        worldOriginY,
        tileWidth,
        tileHeight,
        authoredTileWidth,
        authoredTileHeight,
        tileDefinitionsByGid,
        isLevelObjectsLayer = false,
        isBurnableObjectsLayer = false
    ) {
        const scaleX = tileWidth / Math.max(authoredTileWidth, 0.0001);
        const scaleY = tileHeight / Math.max(authoredTileHeight, 0.0001);
        const mapWorldHeight = mapJson.height * tileHeight;
        return {
            name: layer.name || 'Objects',
            spawnOnly: isLevelObjectsLayer || isBurnableObjectsLayer,
            burnableScenery: isBurnableObjectsLayer,
            visible: layer.visible !== false,
            opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
            objects: (layer.objects || []).map((object) => ({
                ...this.parseObject(
                    object,
                    worldOriginX,
                    worldOriginY,
                    mapWorldHeight,
                    scaleX,
                    scaleY,
                    tileDefinitionsByGid,
                    layer.name || '',
                    isLevelObjectsLayer,
                    isBurnableObjectsLayer
                )
            })).filter(Boolean)
        };
    }

    parseObject(
        object,
        worldOriginX,
        worldOriginY,
        mapWorldHeight,
        scaleX,
        scaleY,
        tileDefinitionsByGid,
        layerName = '',
        isLevelObjectsLayer = false,
        isBurnableObjectsLayer = false
    ) {
        const { gidInfo, definition } = this.resolveTileDefinitionFromGid(
            object.gid || 0,
            tileDefinitionsByGid
        );
        const definitionRenderInfo = definition?.renderInfo || null;
        const renderInfo = isLevelObjectsLayer ? null : definitionRenderInfo;
        const fallbackWidth = definitionRenderInfo?.kind === 'image' ? definitionRenderInfo.imageWidth * scaleX : 0;
        const fallbackHeight = definitionRenderInfo?.kind === 'image' ? definitionRenderInfo.imageHeight * scaleY : 0;
        const width = (object.width || 0) > 0 ? object.width * scaleX : fallbackWidth;
        const height = (object.height || 0) > 0 ? object.height * scaleY : fallbackHeight;

        // Tiled tile objects store x/y from the map's top-left, with the object anchored at
        // its bottom-left corner. Convert that into the game's bottom-left world space.
        const worldX = worldOriginX + object.x * scaleX;
        const worldY = worldOriginY + (mapWorldHeight - object.y * scaleY);
        const spawnWorldX = worldOriginX + ((object.x + ((object.width || 0) * 0.5)) * scaleX);
        const spawnWorldY = worldY;
        const shapeType = resolveParsedObjectShapeType(object);
        const worldShapePoints = createParsedObjectWorldShapePoints(
            object,
            worldOriginX,
            worldOriginY,
            mapWorldHeight,
            scaleX,
            scaleY
        );

        return {
            id: object.id,
            gid: gidInfo.cleanGid,
            name: object.name || '',
            type: object.type || '',
            width,
            height,
            rotation: object.rotation || 0,
            opacity: typeof object.opacity === 'number' ? object.opacity : 1,
            visible: object.visible !== false,
            properties: { ...(definition?.tileProperties || {}), ...propertiesToObject(object.properties) },
            renderInfo,
            flip: {
                horizontal: gidInfo.horizontal,
                vertical: gidInfo.vertical,
                diagonal: gidInfo.diagonal
            },
            // GID flip flags live in the high bits. Strip them before tileset resolution.
            worldX,
            worldY,
            shapeType,
            worldShapePoints,
            // The dedicated LevelObjects layer is spawn-only. Tiled tile/image objects are
            // anchored at their bottom-left corner, so the 3D replacement uses the marker's
            // bottom-center as its spawn point. That keeps a centered GLB aligned with the
            // authored placeholder without rendering the dummy sprite itself.
            spawnWorldX: isLevelObjectsLayer ? spawnWorldX : worldX,
            spawnWorldY: isLevelObjectsLayer ? spawnWorldY : worldY,
            sourceLayer: isLevelObjectsLayer
                ? (CONFIG.LEVEL_OBJECTS?.spawnLayerName || 'LevelObjects')
                : (
                    isBurnableObjectsLayer
                        ? (CONFIG.BURNABLE_SCENERY?.layerName || 'BurnableObjects')
                        : (layerName || '')
                )
        };
    }
}
