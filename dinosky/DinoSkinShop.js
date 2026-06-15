/**
 * DINO SKIN SHOP
 *
 * HTML-overlay dialog (matching SettingsDialog style) for browsing, buying,
 * and equipping dino skins.
 *
 * HOW SKIN CONFIG WORKS
 *   Skins are defined in CONFIG.dinoSkins (config.js).  Each entry has:
 *     id            – unique string key
 *     nameKey       – i18n key for the localized display name
 *     texture       – path to the full dino texture used in gameplay
 *     price         – coin cost (0 = free / default-owned)
 *     unlockedByDefault – true → owned from first session
 *
 * HOW LOCALIZATION WORKS
 *   All visible strings go through t() from i18n.js.
 *   The dialog listens to the window 'languagechange' event and calls
 *   _applyTranslations() so the UI stays in sync after a language switch.
 *
 * HOW TEXTURES ARE SWAPPED
 *   The game passes an onEquip(skinId, texturePath) callback on construction.
 *   Equipping calls that callback, which in main.js calls
 *   player.setDinoTexture(texturePath) – a method we add to Player.js.
 *
 * HOW OWNERSHIP PERSISTENCE WORKS
 *   Owned skin ids and the equipped skin id are stored together with the coin
 *   count in localStorage under the key 'dinoPlayerData'.
 *   DinoSkinShop.loadPlayerData() / savePlayerData() handle serialization.
 *   The game reads / writes coinCount through get/setCoinCount() so both the
 *   HUD and the shop stay in sync.
 *
 * HOW REWARDED ADS WORK
 *   The game passes an onWatchAd() callback.  The shop calls it and awaits a
 *   boolean – true means the ad completed and coins should be awarded.
 *   If PokiSDK is not available the callback returns true immediately so
 *   local testing still works.
 *
 * HOW RESPONSIVE LAYOUTS ARE HANDLED
 *   A CSS media query switches between a single-column portrait card and a
 *   two-column landscape card.  The dino preview sits in a <canvas> element
 *   whose size is recalculated on every resize via ResizeObserver.
 */

import * as THREE from 'three';
import { createGLTFLoader } from './createGLTFLoader.js';
import { loaderLoadWithRetry } from './fetchWithRetry.js';
import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { loadLocalJson, saveJsonWithPlatformMirrors } from './PlatformBridge.js';

const STORAGE_KEY = 'dinoPlayerData';

// ── Persistence helpers ───────────────────────────────────────────────────────

export function loadPlayerData() {
    return loadLocalJson(STORAGE_KEY, null);
}

export function savePlayerData(data) {
    void saveJsonWithPlatformMirrors(STORAGE_KEY, data);
}

/** Returns the initial player-data object seeded from the skin config. */
function defaultPlayerData() {
    const ownedByDefault = (CONFIG.dinoSkins ?? [])
        .filter((s) => s.unlockedByDefault)
        .map((s) => s.id);
    const firstId = CONFIG.dinoSkins?.[0]?.id ?? 'classic';
    return {
        coins: 0,
        ownedDinoSkins: ownedByDefault.length > 0 ? ownedByDefault : [firstId],
        equippedDinoSkinId: firstId
    };
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function injectStyles() {
    if (document.getElementById('dino-skin-shop-styles')) return;
    const style = document.createElement('style');
    style.id = 'dino-skin-shop-styles';
    style.textContent = `
        .dss-screen {
            position: fixed;
            inset: 0;
            z-index: 1200;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            background:
                radial-gradient(circle at top, rgba(60, 180, 255, 0.18), transparent 40%),
                linear-gradient(180deg, rgba(7, 43, 96, 0.72) 0%, rgba(16, 92, 168, 0.62) 42%, rgba(4, 18, 40, 0.7) 100%);
            backdrop-filter: blur(6px);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 200ms ease, visibility 200ms ease;
            font-family: "Orbitron";
        }
        .dss-screen.is-visible {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }

        /* ── Card — fixed design size, scaled to fit via JS transform ── */
        .dss-card {
            position: absolute;
            top: 50%;
            left: 50%;
            flex-shrink: 0;
            box-sizing: border-box;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 24px;
            background: linear-gradient(180deg, rgba(6, 24, 52, 0.97) 0%, rgba(12, 44, 87, 0.98) 100%);
            box-shadow: 0 24px 70px rgba(3, 12, 27, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.14);
            color: #f7fbff;
            transform-origin: center center;
            transform: translate(-50%, -50%);
        }

        /* Portrait layout — fixed 480×auto, stacked */
        .dss-card.portrait {
            width: 480px;
            padding: 18px 20px 16px;
        }

        /* Landscape layout — fixed 820px wide, two-column grid */
        .dss-card.landscape {
            width: 820px;
            padding: 20px 24px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            grid-template-rows: auto 1fr auto;
            column-gap: 20px;
            row-gap: 0;
            grid-template-areas:
                "header  header"
                "preview right"
                "ad      ad";
            align-items: start;
        }

        /* ── Right column wrapper ── */
        .dss-right {
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            padding: 10px 12px;
            background: rgba(255, 255, 255, 0.03);
            gap: 6px;
        }
        .dss-card.landscape .dss-right {
            grid-area: right;
        }
        .dss-card.landscape .dss-preview-wrap {
            grid-area: preview;
            margin-bottom: 0;
            align-self: stretch;
            display: flex;
            flex-direction: column;
            justify-content: center;
        }
        .dss-card.landscape .dss-skin-info   { margin-bottom: 0; text-align: left; }
        .dss-card.landscape .dss-thumbs-wrap { max-width: none; overflow: visible; margin-bottom: 0; }
        .dss-card.landscape .dss-thumbs      { margin-bottom: 0; padding-right: 0; }
        .dss-card.landscape .dss-action      { margin-bottom: 0; }
        .dss-card.landscape .dss-ad-banner   { margin-top: 14px; }
        .dss-card.landscape .dss-header      { margin-bottom: 12px; }

        /* ── Header ── */
        .dss-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 10px;
            grid-area: header;
        }
        .dss-title {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }
        .dss-header-right {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .dss-coin-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border: 1px solid rgba(255, 204, 68, 0.4);
            border-radius: 999px;
            background: rgba(255, 204, 68, 0.1);
            font-size: 15px;
            font-weight: 700;
            color: #ffcc44;
        }
        .dss-coin-icon {
            width: 18px;
            height: 18px;
            object-fit: contain;
        }
        .dss-close {
            flex: 0 0 auto;
            width: 40px;
            height: 40px;
            border: 1px solid rgba(224,62,62,0.6);
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-size: 22px;
            line-height: 1;
            color: #e03e3e;
            background: rgba(255,255,255,0.08);
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.12);
        }
        .dss-close:hover,
        .dss-close:focus-visible { filter: brightness(1.1); }

        /* ── Dino preview ── */
        .dss-preview-wrap {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            grid-area: preview;
            margin-bottom: 6px;
        }
        .dss-preview-canvas {
            display: block;
            width: 432px;
            height: auto;
            aspect-ratio: 864 / 500;
            max-width: 100%;
            border-radius: 16px;
            background: radial-gradient(circle at 50% 60%, rgba(40, 100, 220, 0.22), transparent 72%);
        }
        .dss-card.landscape .dss-preview-canvas {
            width: 340px;
            height: auto;
            aspect-ratio: 864 / 500;
            max-width: 100%;
        }
        .dss-nav {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            width: 44px;
            height: 44px;
            border: 1px solid rgba(255,255,255,0.22);
            border-radius: 10px;
            background: rgba(10, 30, 70, 0.72);
            cursor: pointer;
            font: inherit;
            font-size: 22px;
            font-weight: 700;
            color: #d8ecff;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 120ms, filter 120ms;
        }
        .dss-nav:hover,
        .dss-nav:focus-visible { background: rgba(40, 90, 180, 0.7); filter: brightness(1.1); outline: 2px solid rgba(255,255,255,0.95); outline-offset: 2px; }
        .dss-nav-prev { left: 0; }
        .dss-nav-next { right: 0; }

        /* ── Skin info ── */
        .dss-skin-info {
            grid-area: info;
            text-align: center;
            margin-bottom: 4px;
        }
        .dss-skin-name {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            color: #f7fbff;
            margin: 0 0 6px;
        }
        .dss-skin-status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }
        .dss-skin-status.equipped {
            background: rgba(40, 210, 80, 0.18);
            border: 1px solid rgba(40, 210, 80, 0.4);
            color: #44ff88;
        }
        .dss-skin-status.owned {
            background: rgba(60, 160, 255, 0.14);
            border: 1px solid rgba(60, 160, 255, 0.3);
            color: #88ccff;
        }
        .dss-skin-status.locked {
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.14);
            color: rgba(215, 240, 255, 0.5);
        }

        /* ── Thumbnail row ── */
        .dss-thumbs-wrap {
            position: relative;
            overflow: hidden;
            margin-bottom: 4px;
        }
        .dss-thumbs-wrap::before,
        .dss-thumbs-wrap::after {
            content: '';
            position: absolute;
            top: 0; bottom: 6px;
            width: 20px;
            pointer-events: none;
            opacity: 0;
            transition: opacity 150ms;
            z-index: 1;
        }
        .dss-thumbs-wrap::before {
            left: 0;
            background: linear-gradient(to left, transparent, rgba(8, 22, 54, 0.95));
        }
        .dss-thumbs-wrap::after {
            right: 0;
            background: linear-gradient(to right, transparent, rgba(8, 22, 54, 0.95));
        }
        .dss-thumbs-wrap.has-left::before  { opacity: 1; }
        .dss-thumbs-wrap.has-right::after  { opacity: 1; }
        .dss-thumbs {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            overscroll-behavior-x: contain;
            padding-bottom: 6px;
            scrollbar-width: none;
            touch-action: pan-x;
            cursor: grab;
            user-select: none;
        }
        .dss-thumbs.is-dragging { cursor: grabbing; }
        .dss-thumbs::-webkit-scrollbar { display: none; }
        .dss-thumb {
            flex: 0 0 auto;
            width: 100px;
            cursor: pointer;
            border-radius: 12px;
            border: 2px solid rgba(255,255,255,0.12);
            background: rgba(10, 30, 70, 0.7);
            padding: 7px 7px 6px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            transition: border-color 120ms, box-shadow 120ms;
        }
        .dss-thumb:hover { border-color: rgba(100, 180, 255, 0.5); }
        .dss-thumb.selected {
            border-color: #4499ff;
            box-shadow: 0 0 10px rgba(68, 153, 255, 0.5);
        }
        .dss-thumb canvas {
            display: block;
            width: 76px;
            height: 76px;
            border-radius: 8px;
        }
        .dss-thumb-label {
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: rgba(215, 240, 255, 0.7);
            text-align: center;
            line-height: 1.2;
            width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .dss-thumb-price {
            font-size: 12px;
            font-weight: 700;
            color: #ffcc44;
            display: flex;
            align-items: center;
            gap: 3px;
        }
        .dss-lock-icon {
            font-size: 16px;
            line-height: 1;
            opacity: 0.55;
        }

        /* ── Action button ── */
        .dss-action {
            grid-area: action;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
            margin-bottom: 4px;
        }
        .dss-btn {
            width: 100%;
            padding: 18px 24px;
            border: none;
            border-radius: 12px;
            cursor: pointer;
            font-family: "Orbitron";
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            transition: filter 120ms, transform 80ms;
        }
        .dss-btn:active { transform: scale(0.97); }
        .dss-btn:hover,
        .dss-btn:focus-visible { filter: brightness(1.08); outline: 2px solid rgba(255,255,255,0.95); outline-offset: 2px; }
        .dss-btn.buy {
            background: linear-gradient(180deg, #fff6bb 0%, #ffbc4d 100%);
            color: #17263a;
        }
        .dss-btn.unlock-ad {
            background: linear-gradient(180deg, rgba(160, 100, 255, 0.9) 0%, rgba(90, 40, 200, 0.9) 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .dss-btn.equip {
            background: linear-gradient(180deg, rgba(60, 190, 255, 0.9) 0%, rgba(20, 100, 220, 0.9) 100%);
            color: #ffffff;
        }
        .dss-btn.equipped-state {
            background: rgba(40, 210, 80, 0.15);
            border: 1px solid rgba(40, 210, 80, 0.4);
            color: #44ff88;
            cursor: default;
        }
        .dss-not-enough {
            font-size: 12px;
            font-weight: 700;
            color: #ff8877;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            min-height: 18px;
        }

        /* ── Ad banner ── */
        .dss-ad-banner {
            grid-area: ad;
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            border-radius: 14px;
            border: 1px solid rgba(100, 80, 200, 0.3);
            background: rgba(60, 40, 140, 0.18);
        }
        .dss-ad-icon {
            width: 36px;
            height: 36px;
            object-fit: contain;
            flex: 0 0 auto;
        }
        .dss-ad-text { flex: 1 1 auto; min-width: 0; }
        .dss-ad-title {
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            color: #ffcc44;
            margin: 0 0 2px;
        }
        .dss-ad-sub {
            font-size: 11px;
            font-weight: 400;
            color: rgba(215, 240, 255, 0.65);
            margin: 0;
        }
        .dss-ad-cta {
            flex: 0 0 auto;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
        }
        .dss-ad-reward {
            font-size: 28px;
            font-weight: 900;
            color: #ffcc44;
            white-space: nowrap;
        }
        .dss-ad-btn {
            flex: 0 0 auto;
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            background: linear-gradient(180deg, #8866ff 0%, #5533cc 100%);
            color: #fff;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: filter 120ms;
        }
        .dss-ad-btn:hover,
        .dss-ad-btn:focus-visible { filter: brightness(1.1); outline: 2px solid rgba(255,255,255,0.95); outline-offset: 2px; }

    `;
    document.head.appendChild(style);
}

// ── DinoSkinShop ────────────────────────────────────────────────────────────

export class DinoSkinShop {
    /**
     * @param {object} options
     * @param {() => number}         options.getCoinCount   – returns current coins
     * @param {(n: number) => void}  options.setCoinCount   – sets coin count in game + HUD
     * @param {(id: string, texturePath: string) => void} options.onEquip – apply texture to dino
     * @param {() => Promise<boolean>} options.onWatchAd   – trigger rewarded ad; resolves with reward
     * @param {() => void | Promise<void>} options.onHide  – optional hook when dialog closes
     */
    constructor({ getCoinCount, setCoinCount, onEquip, onWatchAd, onHide } = {}) {
        injectStyles();

        this.getCoinCount = getCoinCount ?? (() => 0);
        this.setCoinCount = setCoinCount ?? (() => {});
        this.onEquip = onEquip ?? (() => {});
        this.onWatchAd = onWatchAd ?? (() => Promise.resolve(true));
        this.onHide = onHide;

        this.visible = false;
        this._adInProgress = false;
        this._coinPunchRaf = null;

        // Load or seed player data (coins + owned skins + equipped skin).
        // Merge with defaults so old/partial saved data never has missing fields.
        const saved = loadPlayerData();
        const defaults = defaultPlayerData();
        this._data = saved ? {
            coins: Number.isFinite(saved.coins) ? saved.coins : defaults.coins,
            ownedDinoSkins: Array.isArray(saved.ownedDinoSkins) ? saved.ownedDinoSkins : defaults.ownedDinoSkins,
            equippedDinoSkinId: saved.equippedDinoSkinId ?? defaults.equippedDinoSkinId,
        } : defaults;
        // Sync coin count from the live game value on open (handled in show()).

        this.skins = CONFIG.dinoSkins ?? [];
        this._selectedIndex = Math.max(0, this.skins.findIndex(
            (s) => s.id === this._data.equippedDinoSkinId
        ));

        // THREE.js mini-renderer for the dino preview.
        this._previewRenderer = null;
        this._previewScene = null;
        this._previewCamera = null;
        this._previewMixer = null;
        this._previewDinoModel = null;
        this._previewAnimFrameId = null;
        this._previewClock = new THREE.Clock(false);
        this._previewTextureLoader = new THREE.TextureLoader();
        this._previewTexturePromises = {};
        this._previewDinoAssetPromise = null;
        this._previewDinoAsset = null;
        this._previewTextures = {};  // cached: texturePath → THREE.Texture
        this._thumbCanvases = [];    // one per skin, drawn via previewRenderer snapshots
        this._previewWrap = null;

        this._buildDOM();

        this._onLanguageChange = () => this._applyTranslations();
        window.addEventListener('languagechange', this._onLanguageChange);

        this._onResize = () => { if (this.visible) this._scaleCard(); };
        window.addEventListener('resize', this._onResize);
    }

    // ── DOM ───────────────────────────────────────────────────────────────────

    _buildDOM() {
        this.root = document.createElement('div');
        this.root.className = 'dss-screen';

        this.card = document.createElement('div');
        this.card.className = 'dss-card';
        this.card.setAttribute('role', 'dialog');
        this.card.setAttribute('aria-modal', 'true');

        // Header
        const header = document.createElement('div');
        header.className = 'dss-header';

        this._titleEl = document.createElement('h2');
        this._titleEl.className = 'dss-title';
        this._titleEl.textContent = t('skins.title');

        const headerRight = document.createElement('div');
        headerRight.className = 'dss-header-right';

        this._coinBadge = document.createElement('div');
        this._coinBadge.className = 'dss-coin-badge';
        const coinImg = document.createElement('img');
        coinImg.className = 'dss-coin-icon';
        coinImg.src = './gfx/UI/coin.webp';
        coinImg.alt = '';
        this._coinCountEl = document.createElement('span');
        this._coinBadge.append(coinImg, this._coinCountEl);

        this._closeBtn = document.createElement('button');
        this._closeBtn.className = 'dss-close';
        this._closeBtn.type = 'button';
        this._closeBtn.setAttribute('aria-label', t('skins.close'));
        this._closeBtn.textContent = '×';

        headerRight.append(this._coinBadge, this._closeBtn);
        header.append(this._titleEl, headerRight);

        // Preview wrap (canvas + nav arrows)
        const previewWrap = document.createElement('div');
        previewWrap.className = 'dss-preview-wrap';
        this._previewWrap = previewWrap;

        this._previewCanvas = this._createPreviewCanvas();

        this._prevBtn = document.createElement('button');
        this._prevBtn.className = 'dss-nav dss-nav-prev';
        this._prevBtn.type = 'button';
        this._prevBtn.setAttribute('aria-label', t('skins.prev'));
        this._prevBtn.textContent = '‹';

        this._nextBtn = document.createElement('button');
        this._nextBtn.className = 'dss-nav dss-nav-next';
        this._nextBtn.type = 'button';
        this._nextBtn.setAttribute('aria-label', t('skins.next'));
        this._nextBtn.textContent = '›';

        previewWrap.append(this._prevBtn, this._previewCanvas, this._nextBtn);

        // Skin info
        const skinInfo = document.createElement('div');
        skinInfo.className = 'dss-skin-info';
        this._skinNameEl = document.createElement('p');
        this._skinNameEl.className = 'dss-skin-name';
        this._skinStatusEl = document.createElement('span');
        this._skinStatusEl.className = 'dss-skin-status';
        skinInfo.append(this._skinNameEl, this._skinStatusEl);

        // Thumbnails
        this._thumbsEl = document.createElement('div');
        this._thumbsEl.className = 'dss-thumbs';
        this._buildThumbs();
        const thumbsWrap = document.createElement('div');
        thumbsWrap.className = 'dss-thumbs-wrap';
        thumbsWrap.appendChild(this._thumbsEl);
        this._thumbsWrap = thumbsWrap;

        const updateThumbFades = () => {
            const el = this._thumbsEl;
            thumbsWrap.classList.toggle('has-left',  el.scrollLeft > 2);
            thumbsWrap.classList.toggle('has-right', el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
        };
        this._thumbsEl.addEventListener('scroll', updateThumbFades, { passive: true });
        this._updateThumbFades = updateThumbFades;

        // Mouse-drag scroll (touch scrolls natively via overflow-x: auto)
        let dragStartX = 0, dragScrollLeft = 0, isDragging = false;
        this._thumbsEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            isDragging = false;
            dragStartX = e.clientX;
            dragScrollLeft = this._thumbsEl.scrollLeft;
            e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (dragStartX === null) return;
            const dx = e.clientX - dragStartX;
            if (!isDragging && Math.abs(dx) > 6) {
                isDragging = true;
                this._thumbsEl.classList.add('is-dragging');
            }
            if (isDragging) this._thumbsEl.scrollLeft = dragScrollLeft - dx;
        });
        window.addEventListener('mouseup', () => {
            if (isDragging) this._thumbsEl.classList.remove('is-dragging');
            isDragging = false;
            dragStartX = null;
        });
        // Suppress click if a drag actually happened
        this._thumbsEl.addEventListener('click', (e) => {
            if (isDragging) e.stopImmediatePropagation();
        }, true);

        // Action area
        const action = document.createElement('div');
        action.className = 'dss-action';
        this._actionBtn = document.createElement('button');
        this._actionBtn.className = 'dss-btn';
        this._actionBtn.type = 'button';
        this._notEnoughEl = document.createElement('div');
        this._notEnoughEl.className = 'dss-not-enough';
        action.append(this._actionBtn, this._notEnoughEl);

        // Ad banner
        const adBanner = document.createElement('div');
        adBanner.className = 'dss-ad-banner';
        const adIcon = document.createElement('img');
        adIcon.className = 'dss-ad-icon';
        adIcon.src = './gfx/UI/coin.webp';
        adIcon.alt = '';
        const adText = document.createElement('div');
        adText.className = 'dss-ad-text';
        this._adTitleEl = document.createElement('p');
        this._adTitleEl.className = 'dss-ad-title';
        this._adSubEl = document.createElement('p');
        this._adSubEl.className = 'dss-ad-sub';
        adText.append(this._adTitleEl, this._adSubEl);
        this._adRewardEl = document.createElement('div');
        this._adRewardEl.className = 'dss-ad-reward';
        this._adBtn = document.createElement('button');
        this._adBtn.className = 'dss-ad-btn';
        this._adBtn.type = 'button';
        const adCta = document.createElement('div');
        adCta.className = 'dss-ad-cta';
        adCta.append(this._adRewardEl, this._adBtn);
        adBanner.append(adIcon, adText, adCta);

        const rightCol = document.createElement('div');
        rightCol.className = 'dss-right';
        rightCol.append(skinInfo, thumbsWrap, action);

        this.card.append(header, previewWrap, rightCol, adBanner);
        this.root.appendChild(this.card);
        document.body.appendChild(this.root);

        // Events
        this._closeBtn.addEventListener('click', () => this.hide());
        this._prevBtn.addEventListener('click', () => this._navigate(-1));
        this._nextBtn.addEventListener('click', () => this._navigate(1));
        this._actionBtn.addEventListener('click', () => this._handleAction());
        this._adBtn.addEventListener('click', () => this._handleWatchAd());
        this.root.addEventListener('pointerdown', (e) => {
            if (e.target === this.root) this.hide();
        });
        window.addEventListener('keydown', (e) => {
            if (!this.visible) return;
            if (e.key === 'Escape') this.hide();
            if (e.key === 'ArrowLeft') this._navigate(-1);
            if (e.key === 'ArrowRight') this._navigate(1);
        });

        this._applyTranslations();
        this._refreshUI();
    }

    _buildThumbs() {
        this._thumbsEl.innerHTML = '';
        this._thumbCanvases = [];
        this.skins.forEach((skin, i) => {
            const thumb = document.createElement('div');
            thumb.className = 'dss-thumb';
            if (i === this._selectedIndex) thumb.classList.add('selected');

            const tc = document.createElement('canvas');
            tc.width = 120;
            tc.height = 120;
            this._thumbCanvases.push(tc);

            const label = document.createElement('div');
            label.className = 'dss-thumb-label';
            label.textContent = t(skin.nameKey) || skin.id;

            const bottom = document.createElement('div');
            if (this._data.ownedDinoSkins.includes(skin.id)) {
                bottom.className = 'dss-lock-icon';
                bottom.textContent = '✓';
            } else {
                bottom.className = 'dss-thumb-price';
                if (skin.unlockByAd) {
                    const adImg = document.createElement('img');
                    adImg.src = './gfx/UI/ad.webp';
                    adImg.alt = '';
                    adImg.title = t('skins.watchAd');
                    adImg.style.cssText = 'width:18px;height:18px;object-fit:contain;';
                    bottom.append(adImg);
                } else {
                    const ci = document.createElement('img');
                    ci.src = './gfx/UI/coin.webp';
                    ci.alt = '';
                    ci.style.cssText = 'width:13px;height:13px;object-fit:contain;';
                    bottom.append(ci, String(skin.price));
                }
            }

            thumb.append(tc, label, bottom);
            thumb.addEventListener('click', () => {
                this._selectedIndex = i;
                this._refreshUI();
            });
            this._thumbsEl.appendChild(thumb);

            // Render the skin texture onto the thumbnail canvas.
            this._renderThumbnail(skin, tc);
        });
    }

    _renderThumbnail(skin, canvas) {
        this._loadPreviewTexture(skin.buttonTexture ?? skin.texture, (tex) => {
            // Draw the texture into the small thumbnail canvas using 2D context.
            const img = tex.image;
            if (!img) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Force parent repaint
            canvas.style.opacity = '0.999';
            requestAnimationFrame(() => { canvas.style.opacity = '1'; });
        });
    }

    // ── Navigation ────────────────────────────────────────────────────────────

    _navigate(dir) {
        const len = this.skins.length;
        if (len === 0) return;
        this._selectedIndex = ((this._selectedIndex + dir) % len + len) % len;
        this._refreshUI();
        this._notEnoughEl.textContent = '';
    }

    // ── Refresh UI ────────────────────────────────────────────────────────────

    _refreshUI() {
        const skin = this.skins[this._selectedIndex];
        if (!skin) return;

        const isOwned = this._data.ownedDinoSkins.includes(skin.id);
        const isEquipped = this._data.equippedDinoSkinId === skin.id;

        // Skin name
        this._skinNameEl.textContent = t(skin.nameKey) || skin.id;

        // Status badge
        this._skinStatusEl.className = 'dss-skin-status ' + (isEquipped ? 'equipped' : isOwned ? 'owned' : 'locked');
        if (isEquipped) {
            this._skinStatusEl.textContent = t('skins.equipped');
        } else if (isOwned) {
            this._skinStatusEl.textContent = t('skins.owned');
        } else if (skin.unlockByAd) {
            this._skinStatusEl.textContent = '🔒 📺';
        } else {
            this._skinStatusEl.textContent = `🔒 ${skin.price.toLocaleString()}`;
        }

        // Action button
        this._notEnoughEl.textContent = '';
        if (isEquipped) {
            this._actionBtn.className = 'dss-btn equipped-state';
            this._actionBtn.textContent = t('skins.equipped');
        } else if (isOwned) {
            this._actionBtn.className = 'dss-btn equip';
            this._actionBtn.textContent = t('skins.equip');
        } else if (skin.unlockByAd) {
            this._actionBtn.className = 'dss-btn unlock-ad';
            const adImg = document.createElement('img');
            adImg.src = './gfx/UI/ad.webp';
            adImg.alt = '';
            adImg.style.cssText = 'height:1.2em;width:auto;object-fit:contain;vertical-align:middle;flex-shrink:0;';
            this._actionBtn.textContent = '';
            this._actionBtn.append(adImg, ` ${t('skins.watchAd')}`);
        } else {
            this._actionBtn.className = 'dss-btn buy';
            const coinImg = document.createElement('img');
            coinImg.src = './gfx/UI/coin.webp';
            coinImg.alt = '';
            coinImg.style.cssText = 'width:34px;height:34px;object-fit:contain;vertical-align:middle;margin:0 6px;';
            this._actionBtn.textContent = '';
            this._actionBtn.append(t('skins.buy'), ' ', coinImg, ' ', skin.price.toLocaleString());
        }

        // Coin display
        this._coinCountEl.textContent = this._data.coins.toLocaleString();

        // Thumb highlight
        this._thumbsEl.querySelectorAll('.dss-thumb').forEach((el, i) => {
            el.classList.toggle('selected', i === this._selectedIndex);
        });

        // Scroll selected thumb into view, then update fades after scroll settles
        const thumbEl = this._thumbsEl.children[this._selectedIndex];
        thumbEl?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
        requestAnimationFrame(() => this._updateThumbFades?.());

        // Update 3D preview with correct texture
        this._setPreviewTexture(skin.texture);
    }

    getNavigableElements() {
        return [
            this._closeBtn,
            this._prevBtn,
            this._nextBtn,
            this._actionBtn,
            this._adBtn
        ].filter((element) => element && !element.disabled);
    }

    focusDialogElement(direction = 1) {
        const elements = this.getNavigableElements();
        if (!elements.length) {
            return;
        }
        const active = document.activeElement;
        let index = elements.indexOf(active);
        if (index < 0) {
            index = direction >= 0 ? 0 : elements.length - 1;
        } else {
            index = (index + direction + elements.length) % elements.length;
        }
        elements[index]?.focus?.();
    }

    focusInitialElement() {
        (this._actionBtn || this._nextBtn || this._closeBtn)?.focus?.();
    }

    activateFocusedElement() {
        const active = document.activeElement;
        if (!active) {
            this.focusInitialElement();
            return;
        }
        active.click?.();
    }

    handleUiBack() {
        if (!this.visible) {
            return false;
        }
        this.hide();
        return true;
    }

    // ── Action handlers ───────────────────────────────────────────────────────

    _handleAction() {
        const skin = this.skins[this._selectedIndex];
        if (!skin) return;
        const isOwned = this._data.ownedDinoSkins.includes(skin.id);
        const isEquipped = this._data.equippedDinoSkinId === skin.id;

        if (isEquipped) return;

        if (isOwned) {
            this._equipSkin(skin.id);
            return;
        }

        if (skin.unlockByAd) {
            this._handleAdUnlock();
            return;
        }

        // Buy with coins
        if (this._data.coins < skin.price) {
            this._notEnoughEl.textContent = t('skins.notEnoughCoins');
            return;
        }
        this._data.coins -= skin.price;
        this._data.ownedDinoSkins.push(skin.id);
        this.setCoinCount(this._data.coins);
        this._saveData();
        this._equipSkin(skin.id);
        console.log('Dino skin purchased', skin.id);
    }

    async _handleAdUnlock() {
        if (this._adInProgress) return;
        const skin = this.skins[this._selectedIndex];
        if (!skin) return;
        this._adInProgress = true;
        this._actionBtn.disabled = true;
        this._actionBtn.textContent = '…';
        try {
            const rewarded = await this.onWatchAd();
            if (rewarded) {
                this._data.ownedDinoSkins.push(skin.id);
                this._saveData();
                this._equipSkin(skin.id);
                console.log('Dino skin unlocked via ad', skin.id);
            }
        } finally {
            this._adInProgress = false;
            this._actionBtn.disabled = false;
            this._refreshUI();
        }
    }

    _equipSkin(skinId) {
        const skin = this.skins.find((s) => s.id === skinId);
        if (!skin) return;
        this._data.equippedDinoSkinId = skinId;
        this._saveData();
        this.onEquip(skinId, skin.texture);
        this._buildThumbs();
        this._refreshUI();
        console.log('Dino skin equipped', skinId);
    }

    async _handleWatchAd() {
        if (this._adInProgress) return;
        this._adInProgress = true;
        this._adBtn.disabled = true;
        this._adBtn.textContent = '…';
        try {
            const rewarded = await this.onWatchAd();
            if (rewarded) {
                const reward = CONFIG.rewardedAdCoins ?? 1000;
                this._data.coins += reward;
                this.setCoinCount(this._data.coins);
                this._saveData();
                this._refreshUI();
                this._spawnAdCoinFly(reward);
                console.log('Rewarded ad completed', reward);
            }
        } finally {
            this._adInProgress = false;
            this._adBtn.disabled = false;
            this._applyTranslations();
        }
    }

    _spawnAdCoinFly(reward) {
        const srcEl = this._adBtn;
        const dstEl = this._coinBadge;
        if (!srcEl || !dstEl) return;

        const srcRect = srcEl.getBoundingClientRect();
        const dstRect = dstEl.getBoundingClientRect();
        const startX = srcRect.left + srcRect.width * 0.5;
        const startY = srcRect.top + srcRect.height * 0.5;
        const endX = dstRect.left + dstRect.width * 0.5;
        const endY = dstRect.top + dstRect.height * 0.5;

        const count = Math.min(Math.max(Math.round(reward / 100), 4), 10);
        const baseCoins = Math.floor(reward / count);
        let visualRemaining = reward;

        for (let i = 0; i < count; i++) {
            const isLast = i === count - 1;
            const visualThisCoin = isLast ? visualRemaining : baseCoins;
            visualRemaining -= visualThisCoin;

            const delay = i * 70;
            const duration = 480 + Math.random() * 120;

            setTimeout(() => {
                const size = 28;
                const el = document.createElement('img');
                el.src = './gfx/UI/coin.webp';
                el.style.cssText = `
                    position:fixed;
                    width:${size}px;height:${size}px;
                    left:${startX - size * 0.5}px;top:${startY - size * 0.5}px;
                    pointer-events:none;z-index:99999;
                    border-radius:50%;
                `;
                document.body.appendChild(el);

                const t0 = performance.now();
                const animate = (now) => {
                    const t = Math.min((now - t0) / duration, 1);
                    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                    const cx = startX + (endX - startX) * ease;
                    const cy = startY + (endY - startY) * ease;
                    const scale = 1 + Math.sin(ease * Math.PI) * 0.35;
                    const opacity = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15;
                    el.style.left = `${cx - size * 0.5}px`;
                    el.style.top = `${cy - size * 0.5}px`;
                    el.style.transform = `scale(${scale})`;
                    el.style.opacity = String(opacity);
                    if (t < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        el.remove();
                        this._punchCoinBadge();
                    }
                };
                requestAnimationFrame(animate);
            }, delay);
        }
    }

    _punchCoinBadge() {
        const el = this._coinBadge;
        if (!el) return;
        if (this._coinPunchRaf) {
            cancelAnimationFrame(this._coinPunchRaf);
            this._coinPunchRaf = null;
        }
        const PEAK = 1.35, DURATION = 260;
        const t0 = performance.now();
        const tick = (now) => {
            const p = Math.min((now - t0) / DURATION, 1);
            const s = p < 0.25
                ? 1 + (PEAK - 1) * (p / 0.25)
                : 1 + (PEAK - 1) * Math.cos((p - 0.25) / 0.75 * Math.PI * 0.5);
            el.style.transform = `scale(${s})`;
            if (p < 1) {
                this._coinPunchRaf = requestAnimationFrame(tick);
            } else {
                el.style.transform = '';
                this._coinPunchRaf = null;
            }
        };
        this._coinPunchRaf = requestAnimationFrame(tick);
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    _saveData() {
        savePlayerData(this._data);
    }

    // Called by main.js to sync the authoritative coin count into the shop.
    syncCoins(count) {
        this._data.coins = count;
        this._coinCountEl.textContent = count.toLocaleString();
    }

    preloadPreviewAssets() {
        void this._ensurePreviewDinoAsset();
        const skin = this.skins[this._selectedIndex];
        if (skin?.texture) {
            void this._loadPreviewTextureAsync(skin.texture);
        }
        if (skin?.buttonTexture) {
            void this._loadPreviewTextureAsync(skin.buttonTexture);
        }
    }

    hasAffordableLockedSkin(currentCoins = this._data.coins) {
        const coins = Number.isFinite(currentCoins) ? currentCoins : 0;
        const owned = new Set(this._data.ownedDinoSkins || []);
        return this.skins.some((skin) => (
            !owned.has(skin.id) &&
            Number.isFinite(skin.price) &&
            skin.price > 0 &&
            skin.price <= coins
        ));
    }

    // ── THREE.js preview renderer ─────────────────────────────────────────────

    _createPreviewCanvas() {
        const canvas = document.createElement('canvas');
        canvas.className = 'dss-preview-canvas';
        canvas.width = 864;
        canvas.height = 500;
        return canvas;
    }

    _resetPreviewCanvas() {
        const nextCanvas = this._createPreviewCanvas();
        this._previewCanvas?.replaceWith?.(nextCanvas);
        this._previewCanvas = nextCanvas;
    }

    _initPreviewRenderer() {
        if (this._previewRenderer) return;

        // Internal resolution matches the CSS display aspect (432×130 ≈ 3.32:1).
        const W = 576, H = 333;
        this._previewCanvas.width = W;
        this._previewCanvas.height = H;

        this._previewRenderer = new THREE.WebGLRenderer({
            canvas: this._previewCanvas,
            antialias: false,
            alpha: true,
            powerPreference: 'default'
        });
        // setSize with updateStyle=true so Three.js owns the canvas pixel dimensions.
        this._previewRenderer.setPixelRatio(1);
        this._previewRenderer.setSize(W, H, false);
        this._previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
        this._previewRenderer.setClearColor(0x000000, 0);

        this._previewScene = new THREE.Scene();

        const ambient = new THREE.AmbientLight(0xffffff, 2.0);
        const dirKey = new THREE.DirectionalLight(0xffffff, 2.5);
        dirKey.position.set(3, 5, 4);
        this._previewScene.add(ambient, dirKey);

        this._previewCamera = new THREE.PerspectiveCamera(30, W / H, 0.01, 100);
        this._previewCamera.position.set(0, 0, 18);
        this._previewCamera.lookAt(0, 0, 0);

        this._loadPreviewDino();
        this._previewClock.start();
        this._tickPreview();
    }

    _ensurePreviewDinoAsset() {
        if (this._previewDinoAsset) {
            return Promise.resolve(this._previewDinoAsset);
        }
        if (this._previewDinoAssetPromise) {
            return this._previewDinoAssetPromise;
        }

        const loader = createGLTFLoader();
        this._previewDinoAssetPromise = loaderLoadWithRetry(loader, './gfx/mesh/dino/dino.glb')
            .then((gltf) => {
                this._previewDinoAsset = gltf;
                return gltf;
            })
            .catch((err) => {
                this._previewDinoAssetPromise = null;
                throw err;
            });
        return this._previewDinoAssetPromise;
    }

    _loadPreviewTextureAsync(texturePath) {
        if (!texturePath) {
            return Promise.resolve(null);
        }
        if (this._previewTextures[texturePath]) {
            return Promise.resolve(this._previewTextures[texturePath]);
        }
        if (this._previewTexturePromises[texturePath]) {
            return this._previewTexturePromises[texturePath];
        }

        this._previewTexturePromises[texturePath] = new Promise((resolve) => {
            this._previewTextureLoader.load(
                texturePath,
                (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.flipY = false;
                    this._previewTextures[texturePath] = tex;
                    resolve(tex);
                },
                undefined,
                (err) => {
                    console.warn('[DinoSkinShop] Texture load error', texturePath, err);
                    delete this._previewTexturePromises[texturePath];
                    resolve(null);
                }
            );
        }).then((tex) => {
            if (tex) {
                delete this._previewTexturePromises[texturePath];
            }
            return tex;
        });

        return this._previewTexturePromises[texturePath];
    }

    async _loadPreviewDino() {
        let gltf;
        try {
            gltf = await this._ensurePreviewDinoAsset();
        } catch (err) {
            console.warn('[DinoSkinShop] Preview dino load error', err);
            return;
        }

        console.log('[DinoSkinShop] Dino loaded for preview');

        const model = gltf.scene;
        model.scale.setScalar(1);

        // Replace materials with unlit versions (same as Player.js approach).
        model.traverse((child) => {
            if (!child.isMesh) return;
            child.frustumCulled = false;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const next = mats.map((m) => {
                if (!m) return m;
                return new THREE.MeshBasicMaterial({
                    map: m.map ?? null,
                    transparent: m.transparent === true,
                    opacity: m.opacity ?? 1,
                    side: THREE.FrontSide,
                    depthTest: true,
                    depthWrite: true,
                    toneMapped: false,
                    color: 0xffffff
                });
            });
            child.material = Array.isArray(child.material) ? next : next[0];
        });

        // Auto-fit: center the model and scale it to fill roughly 60% of the view.
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fitScale = (3.5 * 1.3 * 1.3 * 3) / maxDim;
        model.scale.setScalar(fitScale);
        // Re-center after scaling
        box.setFromObject(model);
        box.getCenter(center);
        model.position.sub(center);
        model.position.y -= 0.5;
        model.rotation.y = 0.4;

        this._previewScene.add(model);
        this._previewDinoModel = model;

        // Animations — try idle-loop first, then idle, breathe, first available.
        if (gltf.animations?.length) {
            this._previewMixer = new THREE.AnimationMixer(model);
            const idleClip =
                THREE.AnimationClip.findByName(gltf.animations, 'idle-loop') ??
                THREE.AnimationClip.findByName(gltf.animations, 'idle_loop') ??
                THREE.AnimationClip.findByName(gltf.animations, 'idle') ??
                THREE.AnimationClip.findByName(gltf.animations, 'breathe') ??
                gltf.animations[0];
            console.log('[DinoSkinShop] Playing animation:', idleClip?.name);
            if (idleClip) {
                this._previewMixer.clipAction(idleClip).play();
            }
        }

        // Apply the currently-selected skin texture.
        // Also restart the tick loop in case it exited while the model was loading.
        const skin = this.skins[this._selectedIndex];
        if (skin) {
            this._loadPreviewTexture(skin.texture, () => {
                this._applyTextureToPreviewModel(skin.texture);
            });
        }
        if (this.visible && this._previewAnimFrameId === null) {
            this._previewClock.start();
            this._tickPreview();
        }
    }

    _loadPreviewTexture(texturePath, callback) {
        this._loadPreviewTextureAsync(texturePath).then((tex) => {
            if (tex) {
                callback(tex);
            }
        });
    }

    _setPreviewTexture(texturePath) {
        this._loadPreviewTexture(texturePath, () => {
            this._applyTextureToPreviewModel(texturePath);
        });
    }

    _applyTextureToPreviewModel(texturePath) {
        const tex = this._previewTextures[texturePath];
        if (!tex || !this._previewDinoModel) return;
        this._previewDinoModel.traverse((child) => {
            if (!child.isMesh) return;
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            for (const m of mats) {
                if (!m) continue;
                m.map = tex;
                m.needsUpdate = true;
            }
        });
    }

    _tickPreview() {
        if (!this.visible) return;
        this._previewAnimFrameId = requestAnimationFrame(() => this._tickPreview());
        const delta = this._previewClock.getDelta();
        this._previewMixer?.update(delta);
        if (this._previewDinoModel) {
            this._previewDinoModel.rotation.y += delta * 0.35;
        }
        this._previewRenderer?.render(this._previewScene, this._previewCamera);
    }

    _stopPreview() {
        if (this._previewAnimFrameId !== null) {
            cancelAnimationFrame(this._previewAnimFrameId);
            this._previewAnimFrameId = null;
        }
        this._previewClock.stop();
    }

    _destroyPreviewRenderer() {
        if (!this._previewRenderer) return;
        try {
            this._previewRenderer.forceContextLoss?.();
        } catch {
            // Ignore browsers/drivers that do not support explicit context loss.
        }
        this._previewRenderer.dispose?.();
        this._previewRenderer = null;
        this._previewScene = null;
        this._previewCamera = null;
        this._previewMixer = null;
        this._previewDinoModel = null;
        this._resetPreviewCanvas();
    }

    // ── Translations ──────────────────────────────────────────────────────────

    _applyTranslations() {
        this._titleEl.textContent = t('skins.title');
        this._closeBtn.setAttribute('aria-label', t('skins.close'));
        this._prevBtn.setAttribute('aria-label', t('skins.prev'));
        this._nextBtn.setAttribute('aria-label', t('skins.next'));
        this._adTitleEl.textContent = t('skins.getExtraCoins');
        this._adSubEl.textContent = t('skins.watchAdSub');
        const reward = CONFIG.rewardedAdCoins ?? 1000;
        const rewardCoinImg = document.createElement('img');
        rewardCoinImg.src = './gfx/UI/coin.webp';
        rewardCoinImg.alt = '';
        rewardCoinImg.style.cssText = 'width:28px;height:28px;object-fit:contain;vertical-align:middle;margin-left:6px;';
        this._adRewardEl.textContent = '';
        this._adRewardEl.append(`+${reward.toLocaleString()} `, rewardCoinImg);
        const adBtnImg = document.createElement('img');
        adBtnImg.src = './gfx/UI/ad.webp';
        adBtnImg.alt = '';
        adBtnImg.style.cssText = 'height:1.2em;width:auto;object-fit:contain;vertical-align:middle;flex-shrink:0;';
        this._adBtn.textContent = '';
        this._adBtn.append(adBtnImg, ` ${t('skins.watchAd')}`);
        this._refreshUI();
    }

    // ── Layout scaling ────────────────────────────────────────────────────────

    _scaleCard() {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isLandscape = vw > vh;

        // Apply layout class and reset transform so we measure natural dimensions.
        this.card.classList.toggle('landscape', isLandscape);
        this.card.classList.toggle('portrait', !isLandscape);
        this.card.style.transform = 'translate(-50%, -50%)';

        // Force reflow so offsetWidth/Height reflect the new layout class.
        void this.card.offsetHeight;

        const cardW = this.card.offsetWidth;
        const cardH = this.card.offsetHeight;
        const margin = 16;
        const scale = Math.min(
            (vw - margin * 2) / cardW,
            (vh - margin * 2) / cardH,
            1
        );

        this.card.style.transform = `translate(-50%, -50%) scale(${scale})`;
    }

    // ── Show / Hide ───────────────────────────────────────────────────────────

    show(currentCoins) {
        if (this.visible) return;
        this.visible = true;

        // Sync live coin count from game before opening.
        if (Number.isFinite(currentCoins)) this._data.coins = currentCoins;
        this._saveData();

        this.root.classList.add('is-visible');
        this._buildThumbs();
        this._refreshUI();
        this.focusInitialElement();

        // Init THREE preview on first open (deferred so DOM has layout).
        requestAnimationFrame(() => {
            this._updateThumbFades?.();
            this._initPreviewRenderer();
            this._previewClock.start();
            this._tickPreview();
            // Scale after the renderer has sized the canvas so offsetHeight is final.
            requestAnimationFrame(() => this._scaleCard());
        });
    }

    hide() {
        if (!this.visible) return;
        this.visible = false;
        this.root.classList.remove('is-visible');
        this._stopPreview();
        this._destroyPreviewRenderer();
        void this.onHide?.();
    }

    toggle(currentCoins) {
        if (this.visible) this.hide();
        else this.show(currentCoins);
    }

    // Returns the currently equipped skin id (used by main.js on startup).
    getEquippedSkinId() {
        return this._data.equippedDinoSkinId;
    }

    // Returns the persisted coin count — used by main.js to seed its authoritative coinCount.
    getPersistedCoins() {
        return this._data.coins;
    }

    // Returns the texture path for a given skin id.
    getTexturePath(skinId) {
        return this.skins.find((s) => s.id === skinId)?.texture ?? null;
    }

    dispose() {
        this._stopPreview();
        this._destroyPreviewRenderer();
        window.removeEventListener('languagechange', this._onLanguageChange);
        window.removeEventListener('resize', this._onResize);
    }
}
