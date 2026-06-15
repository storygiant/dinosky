/**
 * CANVAS-RENDERED MISSION DIALOG
 * 
 * Renders all mission dialogs directly to canvas for Poki video recording.
 * Supports:
 * - Mission start dialogs
 * - Mission completion dialogs  
 * - Mission failure dialogs
 * - Two fixed artboard layouts (portrait and landscape), scaled to fit
 * 
 * All visual styling matches the CSS version but is drawn on canvas.
 */

import { getPlayerIdentity } from './PlayerIdentity.js';
import { t } from './i18n.js';

const COIN_ICON_PATH = './gfx/UI/coin.webp';
let _coinIconCache = null;
function preloadCoinIcon() {
    if (_coinIconCache) return _coinIconCache;
    _coinIconCache = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = COIN_ICON_PATH;
    });
    return _coinIconCache;
}

const AD_ICON_PATH = './gfx/UI/ad.webp';
let _adIconCache = null;
function preloadAdIcon() {
    if (_adIconCache) return _adIconCache;
    _adIconCache = new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = AD_ICON_PATH;
    });
    return _adIconCache;
}

export const ICON_PATHS = {
    buttonBackground: './gfx/UI/mission_side.webp',
    missionPointer: './gfx/UI/mission_pointer.webp',
    canister: './gfx/UI/missions/canister.webp',
    car: './gfx/UI/missions/car.webp',
    chopper: './gfx/UI/missions/chopper.webp',
    couch: './gfx/UI/missions/couch.webp',
    groundsam: './gfx/UI/missions/groundsam.webp',
    groundturret: './gfx/UI/missions/groundturret.webp',
    male: './gfx/UI/missions/male.webp',
    missile: './gfx/UI/missions/missile.webp',
    oildrum: './gfx/UI/missions/oildrum.webp',
    statue: './gfx/UI/missions/statue.webp',
    tank: './gfx/UI/missions/tank.webp',
    treetop: './gfx/UI/missions/treetop.webp',
    ring: './gfx/UI/missions/ring.webp',
    shark: './gfx/UI/missions/shark.webp',
    cow: './gfx/UI/missions/cow.webp',
    plane: './gfx/UI/missions/plane.webp',
};

// Load all icon images once
const PRELOADED_ICONS = {};
async function preloadIcon(objectType) {
    if (PRELOADED_ICONS[objectType]) {
        return PRELOADED_ICONS[objectType];
    }
    
    const path = ICON_PATHS[objectType];
    if (!path) return null;
    
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            PRELOADED_ICONS[objectType] = img;
            resolve(img);
        };
        img.onerror = () => resolve(null);
        img.src = path;
    });
}

const DIALOG_ARTBOARDS = {
    portrait: {
        width: 480,
        height: 700,
        sideSpace: 36,
        topBottomSpace: 10,
        radius: 26
    },
    widescreen: {
        width: 760,
        height: 360,
        sideSpace: 18,
        topBottomSpace: 36,
        radius: 22
    }
};

export class MissionDialog {
    constructor() {
        this.visible = false;
        this.pendingResolve = null;
        
        // Create overlay container
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 1150;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding: 0;
            background: rgba(8, 28, 54, 0.46);
            backdrop-filter: blur(6px);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 180ms ease, visibility 180ms ease;
            overflow: visible;
        `;
        
        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.cssText = `
            display: block;
            border-radius: 24px;
        `;
        
        this.container.appendChild(this.canvas);
        document.body.appendChild(this.container);
        
        this.ctx = this.canvas.getContext('2d');
        
        // Dialog state
        this.state = {
            title: '',
            description: '',
            buttonText: '',
            iconObjectType: null,
            isFailed: false,
            isComplete: false,
            icon: null,
            coinIcon: null,
            adIcon: null,
            coinReward: null,
            raceTimes: null,
            raceTimeMs: null,
            globalScores: null
        };

        // HTML scroll overlay for global leaderboard list
        this._globalScrollEl = null;
        this._globalListCanvasX = 0;
        this._globalListCanvasY = 0;
        this._globalListCanvasW = 0;
        this._globalListCanvasH = 0;

        // Layout state. The canvas is drawn at one of two fixed artboard sizes and then
        // scaled uniformly to fit the viewport. This keeps start/win/lose dialogs visually
        // predictable instead of reflowing at every screen size.
        this.layout = {
            padding: 34,
            cardBg: 'rgba(5, 25, 56, 0.98)',
            cardBorder: 'rgba(255, 255, 255, 0.16)',
            textColor: '#f8fbff',
            descriptionColor: '#d8ecff',
            buttonColor: '#17263a',
            buttonBg: '#fff6bb',
            buttonBgEnd: '#ffbc4d',
            failCardBg: 'rgba(54, 28, 8, 0.96)',
            failButtonColor: '#3a1717',
            failButtonBg: '#ff9d7d',
            failButtonBgEnd: '#ff6b4d',
            buttonHeight: 58
        };
        this.canvasWidth = DIALOG_ARTBOARDS.portrait.width;
        this.canvasHeight = DIALOG_ARTBOARDS.portrait.height;
        this.displayScale = 1;
        this.isWidescreen = false;
        
        // Two-button mode state (used by showCancel).
        this._twoButtonMode = false;
        this._buttonYesRect = null;
        this._buttonNoRect  = null;

        // Coin reward button mode (used by showComplete with coinReward).
        this._coinButtonMode = false;
        this._coinButtonNormalRect = null;
        this._coinButtonAdRect = null;
        this._selectedAction = 'primary';

        // Bind input handler
        this.handleCanvasClick = this.handleCanvasClick.bind(this);
        this.canvas.addEventListener('click', this.handleCanvasClick);
        
        // Window resize handler for responsive layout
        this.handleWindowResize = this.handleWindowResize.bind(this);
        window.addEventListener('resize', this.handleWindowResize);
        
        // Initial size
        this.updateCanvasSize();
    }
    
    updateCanvasSize() {
        const dpr = window.devicePixelRatio || 1;

        const portrait = this.getArtboardFit(DIALOG_ARTBOARDS.portrait);
        const widescreen = this.getArtboardFit(DIALOG_ARTBOARDS.widescreen);
        const viewportAspect = window.innerWidth / Math.max(window.innerHeight, 1);
        const preferWidescreen = viewportAspect >= 1.05;
        const selected = preferWidescreen
            ? (widescreen.scale >= 0.58 ? widescreen : portrait)
            : (portrait.scale >= 0.58 ? portrait : widescreen);

        const width = selected.artboard.width;
        const height = selected.artboard.height;

        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);

        this.canvas.style.width = `${Math.round(width * selected.scale)}px`;
        this.canvas.style.height = `${Math.round(height * selected.scale)}px`;
        this.canvas.style.borderRadius = `${Math.round(selected.artboard.radius * selected.scale)}px`;

        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.canvasWidth = width;
        this.canvasHeight = height;
        this.displayScale = selected.scale;
        this.isWidescreen = selected.artboard === DIALOG_ARTBOARDS.widescreen;
        
        if (this.visible) {
            if (this._twoButtonMode) {
                this._redrawCancel();
            } else if (this._coinButtonMode) {
                this.redraw();
            } else {
                this.redraw();
            }
        }
    }

    getArtboardFit(artboard) {
        const availableWidth = Math.max(1, window.innerWidth - artboard.sideSpace * 2);
        const availableHeight = Math.max(1, window.innerHeight - artboard.topBottomSpace * 2);
        return {
            artboard,
            scale: Math.min(1, availableWidth / artboard.width, availableHeight / artboard.height)
        };
    }
    
    handleWindowResize() {
        this.updateCanvasSize();
    }
    
    handleCanvasClick(event) {
        if (!this.visible) return;

        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvasWidth / Math.max(rect.width, 1);
        const scaleY = this.canvasHeight / Math.max(rect.height, 1);
        const x = (event.clientX - rect.left) * scaleX;
        const y = (event.clientY - rect.top) * scaleY;

        if (this._twoButtonMode) {
            if (this._buttonYesRect && this._isInRect(x, y, this._buttonYesRect)) {
                this._hideTwoButton(true);
            } else if (this._buttonNoRect && this._isInRect(x, y, this._buttonNoRect)) {
                this._hideTwoButton(false);
            }
            return;
        }

        if (this._coinButtonMode) {
            if (this._coinButtonAdRect && this._isInRect(x, y, this._coinButtonAdRect)) {
                this._hideCoinButtons('ad');
            } else if (this._coinButtonNormalRect && this._isInRect(x, y, this._coinButtonNormalRect)) {
                this._hideCoinButtons('normal');
            }
            return;
        }

        if (this.isClickInButton(x, y)) {
            this.hide(true);
        }
    }

    _isInRect(x, y, r) {
        return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    }

    _getAvailableActions() {
        if (this._twoButtonMode) return ['yes', 'no'];
        if (this._coinButtonMode) return ['normal', 'ad'];
        return ['primary'];
    }

    _syncSelectedAction(preferred = null) {
        const actions = this._getAvailableActions();
        if (!actions.length) {
            this._selectedAction = null;
            return;
        }
        if (preferred && actions.includes(preferred)) {
            this._selectedAction = preferred;
            return;
        }
        if (!actions.includes(this._selectedAction)) {
            this._selectedAction = actions[0];
        }
    }

    focusDialogElement(direction = 1) {
        const actions = this._getAvailableActions();
        if (!actions.length) {
            return;
        }
        let index = actions.indexOf(this._selectedAction);
        if (index < 0) {
            index = 0;
        } else {
            index = (index + direction + actions.length) % actions.length;
        }
        this._selectedAction = actions[index];
        if (this._twoButtonMode) {
            this._redrawCancel();
        } else {
            this.redraw();
        }
    }

    activateFocusedElement() {
        if (!this.visible) {
            return;
        }
        if (this._twoButtonMode) {
            this._hideTwoButton(this._selectedAction === 'yes');
            return;
        }
        if (this._coinButtonMode) {
            this._hideCoinButtons(this._selectedAction === 'ad' ? 'ad' : 'normal');
            return;
        }
        this.hide(true);
    }

    handleUiBack() {
        if (!this.visible) {
            return false;
        }
        if (this._twoButtonMode) {
            this._hideTwoButton(false);
            return true;
        }
        return false;
    }

    isClickInButton(x, y) {
        const isRaceWidescreen = this.isWidescreen && !!this.state.raceTimes;
        const buttonH = isRaceWidescreen ? 44 : this.layout.buttonHeight;
        const buttonY = this.canvasHeight - this.layout.padding - buttonH;
        const buttonX = this.layout.padding;
        const buttonW = isRaceWidescreen
            ? this.canvasWidth * 0.42 * 0.78
            : this.canvasWidth - this.layout.padding * 2;

        return x >= buttonX && x <= buttonX + buttonW &&
               y >= buttonY && y <= buttonY + buttonH;
    }
    
    async showStart(mission) {
        const coinReward = Number.isFinite(mission.coinReward) && mission.coinReward > 0
            ? mission.coinReward
            : null;
        const [icon, coinIcon] = await Promise.all([
            mission.iconObjectType ? preloadIcon(mission.iconObjectType) : Promise.resolve(null),
            coinReward ? preloadCoinIcon() : Promise.resolve(null)
        ]);

        return this.show({
            title: mission.title || t('mission_default_title'),
            description: mission.description || '',
            buttonText: t('mission_go'),
            icon,
            coinIcon,
            coinReward,
            isFailed: false,
            isComplete: false
        });
    }
    
    async showComplete(mission, options = {}) {
        const isFailed = options.isFailed === true;
        const failReason = options.failReason || 'generic';
        const isRace = !!options.raceTimes;
        const coinReward = (!isFailed && !isRace && Number.isFinite(options.coinReward) && options.coinReward > 0)
            ? options.coinReward
            : null;
        const [icon, coinIcon] = await Promise.all([
            mission.iconObjectType ? preloadIcon(mission.iconObjectType) : Promise.resolve(null),
            coinReward ? preloadCoinIcon() : Promise.resolve(null)
        ]);
        const desc = mission.description || t('mission_default_title');
        const failureDescription = failReason === 'objects'
            ? (mission.objectsFailDescription || `${desc} ${t('mission_failed_suffix')}`)
            : (failReason === 'timeout'
                ? `${t('mission_timeout_prefix')} ${desc}`
                : `${desc} ${t('mission_failed_suffix')}`);

        // For successful non-race missions with a coin reward, use coin-button mode.
        if (coinReward) {
            return this._showCoinComplete({
                title: mission.title || t('mission_default_title'),
                description: `${desc} ${t('mission_complete_suffix')}`,
                icon,
                coinIcon,
                coinReward,
                isComplete: true
            });
        }

        return this.show({
            title: isFailed ? t('mission_failed_title') : (mission.title || t('mission_default_title')),
            description: isFailed
                ? failureDescription
                : `${desc} ${t('mission_complete_suffix')}`,
            buttonText: isFailed ? t('mission_retry') : t('mission_continue'),
            icon,
            coinIcon: null,
            coinReward: null,
            isFailed,
            isComplete: true,
            raceTimes: (!isFailed && Array.isArray(options.raceTimes)) ? options.raceTimes : null,
            raceTimeMs: (!isFailed && Number.isFinite(options.raceTimeMs)) ? options.raceTimeMs : null,
            globalScores: (!isFailed && Array.isArray(options.globalScores)) ? options.globalScores : null
        });
    }

    async _showCoinComplete({ title, description, icon, coinIcon, coinReward, isComplete }) {
        const adIcon = await preloadAdIcon();
        this.state = {
            title,
            description,
            buttonText: '',
            icon: icon || null,
            coinIcon: coinIcon || null,
            adIcon: adIcon || null,
            coinReward,
            isFailed: false,
            isComplete,
            raceTimes: null,
            raceTimeMs: null,
            globalScores: null
        };

        this._coinButtonMode = true;
        this._coinButtonNormalRect = null;
        this._coinButtonAdRect = null;
        this._syncSelectedAction('normal');

        this.visible = true;
        this.container.style.opacity = '1';
        this.container.style.visibility = 'visible';
        this.container.style.pointerEvents = 'auto';

        this.redraw();

        return new Promise((resolve) => {
            this.pendingResolve = resolve;
        });
    }
    
    /**
     * showCancel(currentMission) → Promise<boolean>
     * Shows a YES / NO dialog asking the player to cancel the active mission.
     * Resolves true if YES (cancel + switch), false if NO (keep current mission).
     */
    async showCancel(currentMission) {
        const icon = currentMission?.iconObjectType
            ? await preloadIcon(currentMission.iconObjectType)
            : null;

        this.state = {
            title: t('mission_abandon_title'),
            description: currentMission?.title
                ? t('mission_abandon_named', currentMission.title)
                : t('mission_abandon_generic'),
            buttonText: '',
            icon: icon || null,
            coinIcon: null,
            adIcon: null,
            coinReward: null,
            isFailed: false,
            isComplete: false
        };

        this._twoButtonMode = true;
        this._buttonYesRect = null;
        this._buttonNoRect  = null;
        this._syncSelectedAction('no');

        this.visible = true;
        this.container.style.opacity = '1';
        this.container.style.visibility = 'visible';
        this.container.style.pointerEvents = 'auto';

        this._redrawCancel();

        return new Promise((resolve) => {
            this.pendingResolve = resolve;
        });
    }

    _hideTwoButton(result) {
        this._twoButtonMode = false;
        this._buttonYesRect = null;
        this._buttonNoRect  = null;
        this.visible = false;
        this.container.style.opacity = '0';
        this.container.style.visibility = 'hidden';
        this.container.style.pointerEvents = 'none';

        if (this.pendingResolve) {
            const resolve = this.pendingResolve;
            this.pendingResolve = null;
            resolve(result);
        }
    }

    getCanvasScreenCenter() {
        const rect = this.canvas.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    _hideCoinButtons(result) {
        this._coinButtonMode = false;
        this._coinButtonNormalRect = null;
        this._coinButtonAdRect = null;
        this.visible = false;
        this.container.style.opacity = '0';
        this.container.style.visibility = 'hidden';
        this.container.style.pointerEvents = 'none';
        this._removeGlobalScrollList();

        if (this.pendingResolve) {
            const resolve = this.pendingResolve;
            this.pendingResolve = null;
            resolve(result);
        }
    }

    _redrawCancel() {
        const ctx = this.ctx;
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const p = this.layout.padding;

        ctx.clearRect(0, 0, w, h);

        // Card background
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, this.layout.cardBg);
        gradient.addColorStop(1, 'rgba(7, 37, 76, 0.98)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = this.layout.cardBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

        // Title — scale font down so it always fits with generous side padding
        const titleSidePad = p + 28;
        const titleMaxW = w - titleSidePad * 2;
        let titleSize = 42;
        ctx.font = `bold ${titleSize}px "Orbitron"`;
        while (titleSize > 18 && ctx.measureText(this.state.title).width > titleMaxW) {
            titleSize -= 1;
            ctx.font = `bold ${titleSize}px "Orbitron"`;
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(this.state.title, w / 2, p + 3);
        ctx.fillStyle = '#ffcc44';
        ctx.fillText(this.state.title, w / 2, p);

        // Description
        const descY = p + Math.max(titleSize + 18, 68);
        ctx.font = 'bold 20px "Orbitron"';
        const descLines = this.getWrappedTextLines(ctx, this.state.description, w - p * 2 - 20);
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        this.drawTextLines(ctx, descLines, w / 2, descY + 3, 28, true);
        ctx.fillStyle = this.layout.descriptionColor;
        this.drawTextLines(ctx, descLines, w / 2, descY, 28, true);

        // Icon centered
        if (this.state.icon) {
            const iconCenterY = h * 0.5 - 10;
            this.drawIcon(ctx, this.state.icon, w / 2, iconCenterY, 120, 120);
        }

        // Two buttons side by side at the bottom
        const btnH = this.layout.buttonHeight;
        const btnY = h - p - btnH;
        const gap = 12;
        const btnW = (w - p * 2 - gap) / 2;

        // YES button (amber/gold — same as normal)
        const yesX = p;
        this.drawButton(ctx, yesX, btnY, btnW, btnH, t('mission_yes'), this.layout.buttonBg, this.layout.buttonBgEnd, this.layout.buttonColor, this._selectedAction === 'yes');
        this._buttonYesRect = { x: yesX, y: btnY, w: btnW, h: btnH };

        // NO button (muted grey-blue)
        const noX = p + btnW + gap;
        this.drawButton(ctx, noX, btnY, btnW, btnH, t('mission_no'), 'rgba(80,110,160,0.9)', 'rgba(50,80,130,0.9)', '#d8ecff', this._selectedAction === 'no');
        this._buttonNoRect = { x: noX, y: btnY, w: btnW, h: btnH };
    }

    show({ title, description, buttonText, icon, coinIcon = null, adIcon = null, coinReward = null, isFailed, isComplete, raceTimes = null, raceTimeMs = null, globalScores = null }) {
        this.state = {
            title,
            description,
            buttonText,
            icon: icon || null,
            coinIcon: coinIcon || null,
            adIcon: adIcon || null,
            coinReward: coinReward || null,
            isFailed,
            isComplete,
            raceTimes,
            raceTimeMs,
            globalScores
        };

        this._syncSelectedAction('primary');
        this.visible = true;
        this.container.style.opacity = '1';
        this.container.style.visibility = 'visible';
        this.container.style.pointerEvents = 'auto';

        this.redraw();

        return new Promise((resolve) => {
            this.pendingResolve = resolve;
        });
    }

    hide(resolve = true) {
        this._coinButtonMode = false;
        this._coinButtonNormalRect = null;
        this._coinButtonAdRect = null;
        this.visible = false;
        this.container.style.opacity = '0';
        this.container.style.visibility = 'hidden';
        this.container.style.pointerEvents = 'none';
        this._removeGlobalScrollList();

        if (resolve && this.pendingResolve) {
            const pendingResolve = this.pendingResolve;
            this.pendingResolve = null;
            pendingResolve();
        }
    }

    redraw() {
        const ctx = this.ctx;
        const w = this.canvasWidth;
        const h = this.canvasHeight;
        const p = this.layout.padding;
        
        // Clear canvas
        ctx.clearRect(0, 0, w, h);
        
        // Determine colors based on state
        const isFailed = this.state.isFailed;
        const cardBg = isFailed ? this.layout.failCardBg : this.layout.cardBg;
        const buttonBg = isFailed ? this.layout.failButtonBg : this.layout.buttonBg;
        const buttonBgEnd = isFailed ? this.layout.failButtonBgEnd : this.layout.buttonBgEnd;
        const buttonColor = isFailed ? this.layout.failButtonColor : this.layout.buttonColor;
        
        // Draw card background with gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, cardBg);
        const endColor = isFailed 
            ? 'rgba(87, 44, 12, 0.97)' 
            : 'rgba(7, 37, 76, 0.98)';
        gradient.addColorStop(1, endColor);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, w, h);
        
        // Draw border
        ctx.strokeStyle = this.layout.cardBorder;
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
        
        this._globalListCanvasX = this.layout.padding;
        this._globalListCanvasY = 0;
        this._globalListCanvasW = 0;
        this._globalListCanvasH = 0;

        if (this.isWidescreen) {
            this.redrawWidescreen(ctx, w, h, p, isFailed, buttonBg, buttonBgEnd, buttonColor);
        } else {
            this.redrawPortrait(ctx, w, h, p, isFailed, buttonBg, buttonBgEnd, buttonColor);
        }

        this._syncGlobalScrollList();
    }

    _syncGlobalScrollList() {
        if (!this.state.globalScores?.length || this._globalListCanvasH <= 0) {
            this._removeGlobalScrollList();
            return;
        }

        const s = this.displayScale;
        const canvasRect = this.canvas.getBoundingClientRect();

        const left = canvasRect.left + this._globalListCanvasX * s;
        const top  = canvasRect.top  + this._globalListCanvasY * s;
        const width = (this._globalListCanvasW || (this.canvasWidth - this.layout.padding * 2)) * s;
        const height = this._globalListCanvasH * s;

        if (!this._globalScrollEl) {
            this._buildGlobalScrollList();
        }

        Object.assign(this._globalScrollEl.style, {
            left:   `${left}px`,
            top:    `${top}px`,
            width:  `${width}px`,
            height: `${height}px`,
        });
    }

    _buildGlobalScrollList() {
        this._removeGlobalScrollList();
        const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];

        const el = document.createElement('div');
        el.style.cssText = `
            position: fixed;
            z-index: 1152;
            overflow-y: auto;
            overscroll-behavior: contain;
            box-sizing: border-box;
            font-family: "Orbitron";
        `;

        this.state.globalScores.forEach((entry, i) => {
            const isMe = entry.isMe === true;
            const row = document.createElement('div');
            row.style.cssText = `
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 3px 8px;
                font-size: 11px;
                background: ${isMe ? 'rgba(255,220,60,0.13)' : (i % 2 === 0 ? 'rgba(255,255,255,0.04)' : 'transparent')};
            `;

            const rank = document.createElement('span');
            rank.style.cssText = `flex:0 0 24px; font-weight:700; font-size:11px; color:${i < 3 ? medals[i] : 'rgba(215,240,255,0.5)'};`;
            rank.textContent = `#${i + 1}`;

            const name = document.createElement('span');
            name.style.cssText = `flex:1 1 auto; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${isMe ? '#FFD700' : '#d8ecff'}; font-weight:${isMe ? '700' : '400'};`;
            name.textContent = entry.name;

            const time = document.createElement('span');
            time.style.cssText = `flex:0 0 auto; font-family:"Orbitron"; font-size:11px; color:${isMe ? '#FFD700' : 'rgba(215,240,255,0.8)'};`;
            time.textContent = this._formatRaceTime(entry.timeMs);

            row.append(rank, name, time);
            el.appendChild(row);
        });

        document.body.appendChild(el);
        this._globalScrollEl = el;
    }

    _removeGlobalScrollList() {
        if (this._globalScrollEl) {
            this._globalScrollEl.remove();
            this._globalScrollEl = null;
        }
    }
    
    redrawPortrait(ctx, w, h, p, isFailed, buttonBg, buttonBgEnd, buttonColor) {
        const isRace = !!this.state.raceTimes;
        const textPadding = 22;
        // Race completion: compact header to give max room to scores
        const titleFontSize = isRace ? 36 : 54;
        const titleStep = isRace ? 52 : 80;
        const descFontSize = isRace ? 16 : 25;
        const descLineH = isRace ? 22 : 34;
        let contentStartY = p + (isRace ? 16 : 34);

        ctx.font = `bold ${titleFontSize}px "Orbitron"`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillText(this.state.title, w / 2, contentStartY + 3);
        ctx.fillStyle = isFailed ? '#ffa882' : this.layout.textColor;
        ctx.fillText(this.state.title, w / 2, contentStartY);
        contentStartY += titleStep;

        ctx.font = `bold ${descFontSize}px "Orbitron"`;
        const descMaxWidth = w - (p + textPadding) * 2;
        const descLines = this.getWrappedTextLines(ctx, this.state.description, descMaxWidth);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
        this.drawTextLines(ctx, descLines, w / 2, contentStartY + 3, descLineH, true);
        ctx.fillStyle = this.layout.descriptionColor;
        this.drawTextLines(ctx, descLines, w / 2, contentStartY, descLineH, true);
        contentStartY += Math.max(descLines.length, 1) * descLineH + (isRace ? 12 : 34);

        const hasCoinButtons = this._coinButtonMode && this.state.coinReward;
        const totalButtonH = hasCoinButtons
            ? this.layout.buttonHeight * 2 + 10
            : this.layout.buttonHeight;
        const buttonAreaBottom = h - p;
        const buttonY = buttonAreaBottom - totalButtonH;
        const previewAreaHeight = Math.max(80, buttonY - contentStartY - 22);

        if (isRace) {
            const lbWidth = w - p * 2;
            let y = contentStartY;
            y = this.drawPlayerNameLabel(ctx, p, y, lbWidth, this.state.raceTimes, this.state.raceTimeMs);
            y = this.drawLocalLeaderboard(ctx, p, y, lbWidth, this.state.raceTimes, this.state.raceTimeMs);
            if (this.state.globalScores?.length) {
                // Draw the section header on canvas; the scroll list is an HTML overlay
                y += 8;
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(p, y, lbWidth, 1);
                y += 8;
                ctx.font = 'bold 10px "Orbitron"';
                ctx.fillStyle = 'rgba(215,240,255,0.55)';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(t('mission_global_top'), p + 10, y + 6);
                y += 16;
                // Record where the scroll list should go (canvas coords → display px)
                this._globalListCanvasY = y;
                this._globalListCanvasH = buttonY - y - 4;
            }
        } else if (this.state.isComplete) {
            this.drawSuccessFailSymbol(ctx, w / 2, contentStartY + previewAreaHeight / 2, isFailed);
        } else if (this.state.icon) {
            this.drawIcon(ctx, this.state.icon, w / 2, contentStartY + previewAreaHeight / 2, previewAreaHeight, 170);
        }

        if (hasCoinButtons) {
            const adBtnY = buttonAreaBottom - this.layout.buttonHeight;
            const normalBtnY = adBtnY - this.layout.buttonHeight - 10;
            const btnW = w - p * 2;
            // Normal continue button (top, green)
            this.drawButton(ctx, p, normalBtnY, btnW, this.layout.buttonHeight,
                '', '#00ff11', '#00a824', this.layout.buttonColor, this._selectedAction === 'normal');
            this._drawButtonTextWithCoin(ctx, p, normalBtnY, btnW, this.layout.buttonHeight,
                t('mission_continue_coins', this.state.coinReward), this.layout.buttonColor);
            this._coinButtonNormalRect = { x: p, y: normalBtnY, w: btnW, h: this.layout.buttonHeight };
            // Ad-doubled button (bottom, accent color)
            this.drawCoinAdButton(ctx, p, adBtnY, btnW, this.layout.buttonHeight,
                t('mission_double_coins', this.state.coinReward * 2), this._selectedAction === 'ad');
            this._coinButtonAdRect = { x: p, y: adBtnY, w: btnW, h: this.layout.buttonHeight };
        } else {
            // Draw coin reward label on start dialog
            if (!this.state.isComplete && this.state.coinReward) {
                this.drawCoinRewardLabel(ctx, w / 2, buttonY - 26, this.state.coinReward);
            }
            this.drawButton(ctx, p, buttonY, w - p * 2, this.layout.buttonHeight, this.state.buttonText, buttonBg, buttonBgEnd, buttonColor, true);
        }
    }
    
    redrawWidescreen(ctx, w, h, p, isFailed, buttonBg, buttonBgEnd, buttonColor) {
        // Widescreen layout: text on left, scores on right
        const textColWidth = w * 0.42;
        const iconColX = w * 0.46;
        const iconColWidth = w - iconColX - p;
        
        let contentStartY = p + 20;
        
        // Draw title
        ctx.font = 'bold 42px "Orbitron"';
        ctx.fillStyle = isFailed ? '#ffa882' : this.layout.textColor;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Add text shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillText(this.state.title, p + 3, contentStartY + 3);
        
        ctx.fillStyle = isFailed ? '#ffa882' : this.layout.textColor;
        ctx.fillText(this.state.title, p, contentStartY);
        
        contentStartY += 58;
        
        // Draw description with text wrapping
        ctx.font = 'bold 18px "Orbitron"';
        const descLines = this.getWrappedTextLines(ctx, this.state.description, textColWidth - p * 0.5);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
        this.drawTextLines(ctx, descLines, p + 3, contentStartY + 3, 26, false);
        
        ctx.fillStyle = this.layout.descriptionColor;
        this.drawTextLines(ctx, descLines, p, contentStartY, 26, false);
        
        // Draw icon / leaderboard / success symbol on the right side
        const iconCenterY = p + (h - p * 2 - this.layout.buttonHeight) / 2;
        const maxIconHeight = h - p * 2 - this.layout.buttonHeight - 10;

        const hasCoinButtons = this._coinButtonMode && this.state.coinReward;
        const buttonY = h - p - this.layout.buttonHeight;

        if (this.state.raceTimes) {
            const raceButtonH = 44;
            const raceButtonY = h - p - raceButtonH;
            let y = p;
            y = this.drawPlayerNameLabel(ctx, iconColX, y, iconColWidth, this.state.raceTimes, this.state.raceTimeMs);
            y = this.drawLocalLeaderboard(ctx, iconColX, y, iconColWidth, this.state.raceTimes, this.state.raceTimeMs);
            if (this.state.globalScores?.length) {
                y += 6;
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(iconColX, y, iconColWidth, 1);
                y += 8;
                ctx.font = 'bold 10px "Orbitron"';
                ctx.fillStyle = 'rgba(215,240,255,0.55)';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(t('mission_global_top'), iconColX + 10, y + 6);
                y += 16;
                this._globalListCanvasX = iconColX;
                this._globalListCanvasY = y;
                this._globalListCanvasW = iconColWidth;
                // Bottom of list aligns with bottom of button
                this._globalListCanvasH = raceButtonY + raceButtonH - y;
            }
            // Narrow button: left-aligned, slightly less wide than the text column
            this.drawButton(ctx, p, raceButtonY, textColWidth * 0.78, raceButtonH, this.state.buttonText, buttonBg, buttonBgEnd, buttonColor, true);
        } else if (this.state.isComplete) {
            this.drawSuccessFailSymbol(ctx, iconColX + iconColWidth / 2, iconCenterY, isFailed);
            if (hasCoinButtons) {
                const btnW = textColWidth * 0.88;
                const adBtnY = h - p - this.layout.buttonHeight;
                const normalBtnY = adBtnY - this.layout.buttonHeight - 10;
                this.drawButton(ctx, p, normalBtnY, btnW, this.layout.buttonHeight,
                    '', '#00ff11', '#00a824', this.layout.buttonColor, this._selectedAction === 'normal');
                this._drawButtonTextWithCoin(ctx, p, normalBtnY, btnW, this.layout.buttonHeight,
                    t('mission_continue_coins', this.state.coinReward), this.layout.buttonColor);
                this._coinButtonNormalRect = { x: p, y: normalBtnY, w: btnW, h: this.layout.buttonHeight };
                this.drawCoinAdButton(ctx, p, adBtnY, btnW, this.layout.buttonHeight,
                    t('mission_double_coins', this.state.coinReward * 2), this._selectedAction === 'ad');
                this._coinButtonAdRect = { x: p, y: adBtnY, w: btnW, h: this.layout.buttonHeight };
            } else {
                this.drawButton(ctx, p, buttonY, w - p * 2, this.layout.buttonHeight, this.state.buttonText, buttonBg, buttonBgEnd, buttonColor, true);
            }
        } else if (this.state.icon) {
            this.drawIcon(ctx, this.state.icon, iconColX + iconColWidth / 2, iconCenterY, maxIconHeight, 190);
            if (!this.state.isComplete && this.state.coinReward) {
                this.drawCoinRewardLabel(ctx, p + textColWidth * 0.44, buttonY - 26, this.state.coinReward);
            }
            this.drawButton(ctx, p, buttonY, w - p * 2, this.layout.buttonHeight, this.state.buttonText, buttonBg, buttonBgEnd, buttonColor, true);
        } else {
            if (!this.state.isComplete && this.state.coinReward) {
                this.drawCoinRewardLabel(ctx, p + textColWidth * 0.44, buttonY - 26, this.state.coinReward);
            }
            this.drawButton(ctx, p, buttonY, w - p * 2, this.layout.buttonHeight, this.state.buttonText, buttonBg, buttonBgEnd, buttonColor, true);
        }
    }
    
    getWrappedTextLines(ctx, text, maxWidth) {
        const words = text.split(' ');
        let line = '';
        const lines = [];
        
        for (let i = 0; i < words.length; i++) {
            const testLine = line + (line ? ' ' : '') + words[i];
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && i > 0) {
                lines.push(line);
                line = words[i];
            } else {
                line = testLine;
            }
        }
        
        if (line) {
            lines.push(line);
        }

        return lines;
    }

    drawTextLines(ctx, lines, x, y, lineHeight, centered = false) {
        ctx.textAlign = centered ? 'center' : 'left';
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y + i * lineHeight);
        }
    }
    
    
    drawIcon(ctx, image, centerX, centerY, maxHeight, maxWidth = 190) {
        if (!image) return;
        
        const scale = Math.min(
            maxWidth / image.width,
            maxHeight / image.height
        );
        
        const width = image.width * scale;
        const height = image.height * scale;
        
        ctx.drawImage(
            image,
            centerX - width / 2,
            centerY - height / 2,
            width,
            height
        );
    }
    
    drawSuccessFailSymbol(ctx, centerX, centerY, isFailed) {
        const size = 128;
        const radius = size / 2;
        
        if (isFailed) {
            // Draw red X
            const lineWidth = 10;
            ctx.strokeStyle = '#ff4338';
            ctx.lineWidth = lineWidth;
            ctx.lineCap = 'round';
            
            const offset = radius * 0.4;
            ctx.beginPath();
            ctx.moveTo(centerX - offset, centerY - offset);
            ctx.lineTo(centerX + offset, centerY + offset);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(centerX + offset, centerY - offset);
            ctx.lineTo(centerX - offset, centerY + offset);
            ctx.stroke();
        } else {
            // Draw green checkmark circle
            ctx.strokeStyle = '#1cff00';
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.stroke();
            
            // Draw checkmark
            ctx.strokeStyle = '#1cff00';
            ctx.lineWidth = 12;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            const checkStartX = centerX - radius * 0.35;
            const checkStartY = centerY + radius * 0.05;
            const checkMidX = centerX - radius * 0.05;
            const checkMidY = centerY + radius * 0.35;
            const checkEndX = centerX + radius * 0.3;
            const checkEndY = centerY - radius * 0.2;
            
            ctx.beginPath();
            ctx.moveTo(checkStartX, checkStartY);
            ctx.lineTo(checkMidX, checkMidY);
            ctx.lineTo(checkEndX, checkEndY);
            ctx.stroke();
        }
    }
    
    _formatRaceTime(ms) {
        const total = Math.max(0, Math.round(ms));
        const m = Math.floor(total / 60000);
        const s = Math.floor((total % 60000) / 1000);
        const cs = Math.floor((total % 1000) / 10);
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
    }

    // Draws "YOUR NAME" label + player name (+ current time if not already in top-3). Returns next y.
    drawPlayerNameLabel(ctx, x, y, width, raceTimes, currentTimeMs) {
        const name = getPlayerIdentity()?.name ?? '';
        const timeInTop3 = Number.isFinite(currentTimeMs) && Array.isArray(raceTimes) && raceTimes.includes(currentTimeMs);
        const showTime = Number.isFinite(currentTimeMs) && !timeInTop3;

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        ctx.font = 'bold 10px "Orbitron"';
        ctx.fillStyle = 'rgba(215,240,255,0.55)';
        ctx.fillText(t('mission_your_name'), x + 10, y + 9);

        ctx.font = 'bold 15px "Orbitron"';
        ctx.fillStyle = '#ffcc44';
        ctx.fillText(name, x + 10, y + 26);

        if (showTime) {
            ctx.font = 'bold 10px "Orbitron"';
            ctx.fillStyle = 'rgba(215,240,255,0.55)';
            ctx.textAlign = 'right';
            ctx.fillText(t('mission_your_time'), x + width - 10, y + 9);

            ctx.font = 'bold 15px "Orbitron"';
            ctx.fillStyle = '#d8ecff';
            ctx.textAlign = 'right';
            ctx.fillText(this._formatRaceTime(currentTimeMs), x + width - 10, y + 26);
        }

        return y + 40;
    }

    // Draws local top-3. Returns next y.
    drawLocalLeaderboard(ctx, x, y, width, raceTimes, currentTimeMs) {
        const ROW_H = 30;
        const ROWS = 3;
        const medals = ['#FFD700', '#C0C0C0', '#CD7F32'];

        ctx.textBaseline = 'middle';

        ctx.font = 'bold 10px "Orbitron"';
        ctx.fillStyle = 'rgba(215,240,255,0.55)';
        ctx.textAlign = 'left';
        ctx.fillText(t('mission_your_best_times'), x + 10, y + 8);
        y += 16;

        for (let i = 0; i < ROWS; i++) {
            const rowY = y + i * ROW_H + ROW_H / 2;
            const timeMs = raceTimes[i];
            const hasTime = Number.isFinite(timeMs);
            const isNew = hasTime && Number.isFinite(currentTimeMs) && timeMs === currentTimeMs && i === raceTimes.indexOf(currentTimeMs);

            ctx.fillStyle = isNew ? 'rgba(255,220,60,0.13)' : 'rgba(255,255,255,0.05)';
            ctx.fillRect(x, y + i * ROW_H, width, ROW_H - 2);

            ctx.font = 'bold 13px "Orbitron"';
            ctx.fillStyle = medals[i];
            ctx.textAlign = 'left';
            ctx.fillText(`#${i + 1}`, x + 10, rowY);

            ctx.font = 'bold 15px "Orbitron"';
            ctx.fillStyle = isNew ? '#FFD700' : (hasTime ? '#d8ecff' : 'rgba(255,255,255,0.3)');
            ctx.textAlign = 'right';
            ctx.fillText(hasTime ? this._formatRaceTime(timeMs) : '--:--:--', x + width - 10, rowY);

            if (isNew) {
                ctx.font = 'bold 10px "Orbitron"';
                ctx.fillStyle = '#FFD700';
                ctx.textAlign = 'center';
                ctx.fillText(t('mission_new_record'), x + width / 2, rowY);
            }
        }

        return y + ROWS * ROW_H;
    }

    drawCoinRewardLabel(ctx, centerX, y, amount) {
        const coinIcon = this.state.coinIcon;
        const iconSize = 22;
        const label = t('mission_reward_label', amount);
        ctx.font = 'bold 16px "Orbitron"';
        const textW = ctx.measureText(label).width;
        const gap = coinIcon ? 6 : 0;
        const totalW = (coinIcon ? iconSize + gap : 0) + textW;
        let curX = centerX - totalW / 2;

        if (coinIcon) {
            ctx.drawImage(coinIcon, curX, y - iconSize / 2, iconSize, iconSize);
            curX += iconSize + gap;
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillText(label, curX + 1, y + 1);
        ctx.fillStyle = '#ffdd44';
        ctx.fillText(label, curX, y);
    }

    drawCoinAdButton(ctx, x, y, width, height, text, isSelected = false) {
        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, '#4ec3ff');
        gradient.addColorStop(1, '#1a7acd');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = isSelected ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        if (isSelected) {
            ctx.save();
            ctx.shadowColor = 'rgba(120, 220, 255, 0.75)';
            ctx.shadowBlur = 18;
            ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
            ctx.restore();
        }

        const adIcon = this.state.adIcon;
        if (adIcon) {
            const iconH = height * 0.7;
            const iconW = adIcon.width * (iconH / adIcon.height);
            const iconX = x + 10;
            const iconY = y + height / 2 - iconH / 2;
            ctx.drawImage(adIcon, iconX, iconY, iconW, iconH);
        }

        this._drawButtonTextWithCoin(ctx, x, y, width, height, text, '#ffffff');
    }

    _drawButtonTextWithCoin(ctx, x, y, width, height, text, textColor) {
        const coinIcon = this.state.coinIcon;
        const iconSize = 20;
        ctx.font = 'bold 16px "Orbitron"';
        const textW = ctx.measureText(text).width;
        const gap = coinIcon ? 6 : 0;
        const totalW = textW + (coinIcon ? gap + iconSize : 0);
        let curX = x + width / 2 - totalW / 2;
        const midY = y + height / 2;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillText(text, curX + 1, midY + 1);
        ctx.fillStyle = textColor;
        ctx.fillText(text, curX, midY);
        curX += textW;

        if (coinIcon) {
            ctx.drawImage(coinIcon, curX + gap, midY - iconSize / 2, iconSize, iconSize);
        }
    }

    drawButton(ctx, x, y, width, height, text, bgStart, bgEnd, textColor, isSelected = false) {
        // Button background gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + height);
        gradient.addColorStop(0, bgStart);
        gradient.addColorStop(1, bgEnd);
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, width, height);
        
        // Button border
        ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.98)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = isSelected ? 3 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
        if (isSelected) {
            ctx.save();
            ctx.shadowColor = 'rgba(255, 230, 120, 0.85)';
            ctx.shadowBlur = 18;
            ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
            ctx.restore();
        }
        
        // Button text
        ctx.font = 'bold 16px "Orbitron"';
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + width / 2, y + height / 2);
    }
}
