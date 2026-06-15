import * as THREE from 'three';
import { CONFIG } from './config.js';
import { t } from './i18n.js';

const RENDER_ORDER = 3000;
const HUD_FONT_STACK = '"Orbitron"';
const FALLBACK_BAR_SIZE = { width: 1270, height: 400 };
const RAGE_BAR_ASSETS = {
    background: './gfx/UI/rage_bg.webp',
    progress: './gfx/UI/rage_progress.webp',
    progressGlow: './gfx/UI/rage_progress_glow.webp',
    rimDark: './gfx/UI/rage_rim_dark.webp',
//    rimLit: './gfx/UI/rage_rim_lit.webp',
    icon: './gfx/UI/rage_icon.webp'
};

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function nowMs() {
    return typeof performance !== 'undefined' && performance?.now
        ? performance.now()
        : Date.now();
}

function makeCanvasTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}

function fitAspect(width, height, aspect) {
    if (!(width > 0) || !(height > 0) || !(aspect > 0)) {
        return { width: 1, height: 1 };
    }
    const boxAspect = width / height;
    if (boxAspect > aspect) {
        return {
            width: height * aspect,
            height
        };
    }
    return {
        width,
        height: width / aspect
    };
}

function easeOutCubic(value) {
    const t = clamp(value, 0, 1);
    return 1 - Math.pow(1 - t, 3);
}

function getCanvasTextCenterY(ctx, text, targetCenterY) {
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent ?? 0;
    const descent = metrics.actualBoundingBoxDescent ?? 0;
    if (ascent > 0 || descent > 0) {
        return targetCenterY + (ascent - descent) * 0.5;
    }
    return targetCenterY;
}

export class FuryBar {
    constructor({ onPress, domElement = null, joystick = null } = {}) {
        this.onPress = onPress;
        this.domElement = domElement;
        this.joystick = joystick;

        this._progress = 0;
        this._ready = false;
        this._visible = false;
        this._inputMode = 'touch';
        this._dirty = true;
        this._lastProgress = 0;
        this._chargePulse = 0;
        this._lastRenderMs = nowMs();
        this._lastDebugSignature = null;

        this.lastLayoutWidth = 1;
        this.lastLayoutHeight = 1;
        this.bounds = { left: 0, right: 0, top: 0, bottom: 0 };
        this._drawWidth = 1;
        this._drawHeight = 1;
        this._cx = 0;
        this._cy = 0;

        this._canvas = document.createElement('canvas');
        this._canvas.width = 1024;
        this._canvas.height = Math.round(1024 / this._getBarAspect());
        this._texture = makeCanvasTexture(this._canvas);

        this.uiScene = new THREE.Scene();
        this.uiCamera = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
        this.uiCamera.position.z = 1;

        this._sprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this._texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        }));
        this._sprite.renderOrder = RENDER_ORDER;
        this._sprite.center.set(0.5, 0.5);
        this.uiScene.add(this._sprite);

        this._images = {};
        for (const [key, url] of Object.entries(RAGE_BAR_ASSETS)) {
            this._images[key] = this._loadImage(url);
        }

        this._handlePointerDown = (event) => this._onPointerDown(event);
        this.domElement?.addEventListener('pointerdown', this._handlePointerDown, { capture: true });
    }

    update(progress, inputMode, ready) {
        const nextProgress = clamp(progress ?? 0, 0, 1);
        const previousProgress = this._progress;

        this._progress = nextProgress;
        this._inputMode = inputMode ?? 'touch';
        this._ready = Boolean(ready);

        if (nextProgress > previousProgress + 1e-6) {
            // Progress/glow layers are always clipped from the left so the icon overlap never
            // leaks fiery pixels underneath it. Restarting the pulse here reuses that same clip.
            this._chargePulse = 1;
        }

        this._lastProgress = nextProgress;
        this._dirty = true;
    }

    setVisible(visible) {
        this._visible = Boolean(visible);
        this._sprite.visible = this._visible;
        this._dirty = true;
    }

    layout(width, height) {
        this.lastLayoutWidth = Math.max(width, 1);
        this.lastLayoutHeight = Math.max(height, 1);

        this.uiCamera.right = this.lastLayoutWidth;
        this.uiCamera.top = this.lastLayoutHeight;
        this.uiCamera.updateProjectionMatrix();

        const isPortrait = width < height;
        const aspect = this._getBarAspect();
        const rageBarConfig = this._getRageBarConfig();
        const sharedFitBase = fitAspect(
            Math.min(width * (rageBarConfig.landscapeWidthFactor ?? 0.44), rageBarConfig.landscapeMaxWidth ?? 540),
            Math.min(height * (rageBarConfig.landscapeHeightFactor ?? 0.14), rageBarConfig.landscapeMaxHeight ?? 104),
            aspect
        );
        const sharedScale = isPortrait
            ? (rageBarConfig.portraitScale ?? rageBarConfig.globalScale ?? 1.5)
            : (rageBarConfig.landscapeScale ?? rageBarConfig.globalScale ?? 1.5);
        const sharedFit = {
            width: sharedFitBase.width * sharedScale,
            height: sharedFitBase.height * sharedScale
        };
        let drawWidth = 1;
        let drawHeight = 1;
        let cx = width * 0.5;
        let cy = height * 0.5;

        if (isPortrait) {
            const joystickBounds = this.joystick?.portraitFuryBarScreenBounds;
            if (joystickBounds) {
                // In portrait the bar width should stay visually locked to the three-button
                // cluster. Reuse the same FuryBar instance, but size it from the reserved
                // joystick anchor width instead of recomputing a viewport-based width.
                const anchoredWidth = Math.max(1, joystickBounds.right - joystickBounds.left);
                const portraitAnchorWidthScale = rageBarConfig.portraitAnchorWidthScale ?? 1;
                drawWidth = anchoredWidth * portraitAnchorWidthScale;
                drawHeight = drawWidth / Math.max(aspect, 0.001);
                cx = joystickBounds.left + (joystickBounds.right - joystickBounds.left) * 0.5;
                // Keep the same visual gap above the right-side buttons by pinning the bar's
                // bottom edge to the reserved portrait anchor band.
                cy = joystickBounds.bottom + drawHeight * 0.2;
            } else {
                const shortSide = Math.min(width, height);
                drawWidth = sharedFit.width;
                drawHeight = sharedFit.height;
                cx = width * 0.5;
                cy = Math.max(drawHeight * 0.5, shortSide * 0.12);
            }
        } else {
            drawWidth = sharedFit.width;
            drawHeight = sharedFit.height;
            cx = width * 0.5;
            cy = Math.max(drawHeight * 0.58, (rageBarConfig.landscapeBottomMargin ?? 22) + drawHeight * 0.5);
        }

        this._drawWidth = drawWidth;
        this._drawHeight = drawHeight;
        this._cx = cx;
        this._cy = cy;

        this._sprite.position.set(cx, cy, 0);
        this._sprite.scale.set(drawWidth, drawHeight, 1);

        this.bounds.left = cx - drawWidth * 0.5;
        this.bounds.right = cx + drawWidth * 0.5;
        this.bounds.bottom = cy - drawHeight * 0.5;
        this.bounds.top = cy + drawHeight * 0.5;

        this._resizeCanvas();
        this._dirty = true;
    }

    render(renderer) {
        if (!this._visible) return;

        if (this.lastLayoutWidth < this.lastLayoutHeight) {
            const portraitBounds = this.joystick?.portraitFuryBarScreenBounds;
            if (portraitBounds) {
                const expectedCx = portraitBounds.left + (portraitBounds.right - portraitBounds.left) * 0.5;
                const expectedCy = portraitBounds.bottom + (portraitBounds.top - portraitBounds.bottom) * 0.5;
                if (Math.abs(expectedCx - this._cx) > 0.5 || Math.abs(expectedCy - this._cy) > 0.5) {
                    this.layout(this.lastLayoutWidth, this.lastLayoutHeight);
                }
            }
        }

        const now = nowMs();
        const dt = Math.max(0, (now - this._lastRenderMs) / 1000);
        this._lastRenderMs = now;

        if (this._chargePulse > 0) {
            const duration = Math.max(0.01, this._getRageBarConfig().glowPulseDurationSeconds ?? 0.55);
            this._chargePulse = Math.max(0, this._chargePulse - dt / duration);
            this._dirty = true;
        }

        if (this._ready) {
            this._dirty = true;
        }

        if (this._dirty) {
            this._drawComposite(now);
            this._dirty = false;
        }

        renderer.clearDepth();
        renderer.render(this.uiScene, this.uiCamera);
    }

    dispose() {
        this.domElement?.removeEventListener('pointerdown', this._handlePointerDown, { capture: true });
        this._sprite.material.map?.dispose();
        this._sprite.material.dispose();
        this._texture.dispose();
    }

    _loadImage(url) {
        const image = new Image();
        image.decoding = 'async';
        image.onload = () => {
            this._resizeCanvas();
            this.layout(this.lastLayoutWidth, this.lastLayoutHeight);
            this._dirty = true;
        };
        image.src = url;
        return image;
    }

    _getRageBarConfig() {
        return CONFIG.FURY?.rageBar ?? {};
    }

    _getBarSourceSize() {
        const image = this._images?.background;
        if (image?.naturalWidth > 0 && image?.naturalHeight > 0) {
            return {
                width: image.naturalWidth,
                height: image.naturalHeight
            };
        }
        return FALLBACK_BAR_SIZE;
    }

    _getBarAspect() {
        const size = this._getBarSourceSize();
        return size.width / Math.max(size.height, 1);
    }

    _resizeCanvas() {
        const aspect = this._getBarAspect();
        const pixelRatio = typeof window !== 'undefined' ? Math.max(window.devicePixelRatio || 1, 1) : 1;
        const nextWidth = clamp(Math.round(this._drawWidth * pixelRatio * 1.35), 512, 2048);
        const nextHeight = clamp(Math.round(nextWidth / Math.max(aspect, 0.001)), 160, 1024);
        if (this._canvas.width === nextWidth && this._canvas.height === nextHeight) {
            return;
        }
        const previousWidth = this._canvas.width;
        const previousHeight = this._canvas.height;
        if (previousWidth > 0 && previousHeight > 0) {
            const previousContext = this._canvas.getContext('2d');
            previousContext?.clearRect(0, 0, previousWidth, previousHeight);
        }
        this._canvas.width = nextWidth;
        this._canvas.height = nextHeight;
        // Recreate the CanvasTexture after a size change so mobile Safari cannot keep sampling
        // from an older larger GPU allocation after orientation changes.
        const previousTexture = this._texture;
        this._texture = makeCanvasTexture(this._canvas);
        this._sprite.material.map = this._texture;
        this._sprite.material.needsUpdate = true;
        previousTexture?.dispose?.();
        this._texture.needsUpdate = true;
        this._dirty = true;
    }

    _drawComposite(now) {
        const canvas = this._canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const metrics = this._getRenderMetrics(canvas.width, canvas.height, now);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        this._drawImage(ctx, this._images.background, metrics.barRect);

        if (metrics.progress > 0) {
            // Keep the progress art at its authored size and slide it underneath a fixed
            // left-side mask. That hides the portion that would otherwise appear under the icon
            // while avoiding any right-side crop/stretch artifacts.
            this._drawClippedLayer(ctx, this._images.progress, metrics.progressDrawRect, metrics.clipRect, 'source-over', 1);
        }

        if (metrics.glowAlpha > 0 && metrics.progress > 0) {
            // Glow uses the exact same clip rectangle as the fill so every pulse stays confined
            // to the visible charge strip and never bleeds under the icon, even when fully ready.
            this._drawClippedLayer(ctx, this._images.progressGlow, metrics.progressDrawRect, metrics.clipRect, 'lighter', metrics.glowAlpha);
        }

        this._drawImage(ctx, this._images.rimDark, metrics.barRect);

/*        
        if (!metrics.isEmpty) {
            const rimAlpha = metrics.isFull
                ? 0.8 + 0.2 * metrics.fullPulse
                : 1;
            this._drawImage(ctx, this._images.rimLit, metrics.barRect, { alpha: rimAlpha });
        }
*/
        const iconOptions = metrics.isEmpty
            ? { grayscale: true, alpha: 1 }
            : { brightness: 1 + metrics.iconPulse * 0.16, alpha: 1 };
        this._drawImage(ctx, this._images.icon, metrics.iconRect, iconOptions);

        this._drawText(ctx, metrics);

        if (metrics.debugEnabled) {
            this._drawDebug(ctx, metrics);
            const debugSignature = JSON.stringify({
                progress: Number(metrics.progress.toFixed(4)),
                clipX: Math.round(metrics.clipRect.x),
                clipWidth: Math.round(metrics.clipRect.width),
                progressStartOffset: Math.round(metrics.progressStartOffset),
                progressEndOffset: Math.round(metrics.progressEndOffset),
                isFull: metrics.isFull
            });
            if (debugSignature !== this._lastDebugSignature) {
                this._lastDebugSignature = debugSignature;
                console.log('RageBar render', {
                    progress: metrics.progress,
                    clipX: metrics.clipRect.x,
                    clipWidth: metrics.clipRect.width,
                    progressStartOffset: metrics.progressStartOffset,
                    progressEndOffset: metrics.progressEndOffset,
                    isFull: metrics.isFull
                });
            }
        } else {
            this._lastDebugSignature = null;
        }

        this._texture.needsUpdate = true;
    }

    _getRenderMetrics(canvasWidth, canvasHeight, now) {
        const rageBarConfig = this._getRageBarConfig();
        const sourceSize = this._getBarSourceSize();
        const barRect = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };
        const barScale = barRect.width / Math.max(sourceSize.width, 1);
        const iconSource = this._images.icon;
        const iconAspect = iconSource?.naturalWidth > 0 && iconSource?.naturalHeight > 0
            ? iconSource.naturalWidth / iconSource.naturalHeight
            : 1;
        const iconHeight = barRect.height * (rageBarConfig.iconHeightFactor ?? 0.86);
        const iconWidth = iconHeight * iconAspect;
        const iconRect = {
            x: barRect.x,
            y: barRect.y + (barRect.height - iconHeight) * 0.5,
            width: iconWidth,
            height: iconHeight
        };

        const progressStartOffset = (rageBarConfig.progressStartOffset ?? 140) * (barRect.width / Math.max(sourceSize.width, 1));
        const progressEndOffset = (rageBarConfig.progressEndOffset ?? 28) * (barRect.width / Math.max(sourceSize.width, 1));
        const progressSource = this._images.progress;
        const progressWidth = progressSource?.naturalWidth > 0
            ? progressSource.naturalWidth * barScale
            : barRect.width;
        const progressHeight = progressSource?.naturalHeight > 0
            ? progressSource.naturalHeight * barScale
            : barRect.height;
        const progressBaseX = (barRect.x + barRect.width - progressEndOffset) - progressWidth;
        const progressBaseY = barRect.y + (barRect.height - progressHeight) * 0.5;
        const progressAvailableWidth = Math.max(0, (progressBaseX + progressWidth) - (barRect.x + progressStartOffset));
        const slideDistance = progressAvailableWidth * (1 - this._progress);
        const clipRect = {
            x: barRect.x + progressStartOffset,
            y: progressBaseY,
            width: progressAvailableWidth,
            height: progressHeight
        };
        const progressDrawRect = {
            x: progressBaseX - slideDistance,
            y: progressBaseY,
            width: progressWidth,
            height: progressHeight
        };

        const chargePulseAlpha = easeOutCubic(this._chargePulse);
        const fullPhase = (now / 1000) * (rageBarConfig.fullPulseCyclesPerSecond ?? 1.15) * Math.PI * 2;
        const fullPulse = this._ready ? (0.5 + 0.5 * Math.sin(fullPhase)) : 0;
        const glowAlpha = this._ready
            ? clamp((rageBarConfig.fullGlowBaseAlpha ?? 0.34) + fullPulse * (rageBarConfig.fullGlowPulseAlpha ?? 0.42), 0, 1)
            : clamp(chargePulseAlpha * (rageBarConfig.chargeGlowAlpha ?? 0.95), 0, 1);
        const iconPulse = this._ready ? fullPulse : chargePulseAlpha * 0.25;

        const isFull = this._ready || this._progress >= 1 - 1e-6;
        const isEmpty = this._progress <= 1e-6;
        const percentageText = `${Math.round(this._progress * 100)}%`;
        const readyText = t('rage.ready');

        return {
            progress: this._progress,
            isFull,
            isEmpty,
            barRect,
            iconRect,
            clipRect,
            clipWidth: clipRect.width,
            progressDrawRect,
            progressStartOffset,
            progressEndOffset,
            progressAvailableWidth,
            slideDistance,
            glowAlpha,
            fullPulse,
            iconPulse,
            percentageText,
            readyText,
            debugEnabled: rageBarConfig.debug === true
        };
    }

    _drawImage(ctx, image, rect, options = {}) {
        if (!image?.complete || !(rect.width > 0) || !(rect.height > 0)) {
            return;
        }
        ctx.save();
        ctx.globalAlpha = options.alpha ?? 1;
        const filters = [];
        if (options.grayscale) {
            filters.push('grayscale(1)', 'saturate(0)', 'brightness(1.12)');
        }
        if (options.brightness) {
            filters.push(`brightness(${options.brightness})`);
        }
        if (filters.length > 0) {
            ctx.filter = filters.join(' ');
        }
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
        ctx.restore();
    }

    _drawClippedLayer(ctx, image, drawRect, clipRect, composite = 'source-over', alpha = 1) {
        if (!image?.complete || !(clipRect.width > 0) || !(clipRect.height > 0)) {
            return;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(clipRect.x, clipRect.y, clipRect.width, clipRect.height);
        ctx.clip();
        ctx.globalCompositeOperation = composite;
        ctx.globalAlpha = alpha;

        // We always draw the full source art and rely on the shared clip rectangle so the left
        // hidden region stays masked off in every state, including full charge.
        ctx.drawImage(image, drawRect.x, drawRect.y, drawRect.width, drawRect.height);
        ctx.restore();
    }

    _drawText(ctx, metrics) {
        const barRect = metrics.barRect;
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
        ctx.shadowBlur = barRect.height * 0.08;
        ctx.shadowOffsetY = barRect.height * 0.02;

        if (metrics.isFull) {
            const fontSize = Math.round(barRect.height * 0.18);
            ctx.font = `800 ${fontSize}px ${HUD_FONT_STACK}`;
            ctx.textAlign = 'center';
            ctx.lineWidth = Math.max(4, fontSize * 0.16);
            ctx.fillStyle = '#fff7da';
            const textY = getCanvasTextCenterY(ctx, metrics.readyText, barRect.y + barRect.height * 0.5);
            ctx.strokeText(metrics.readyText, barRect.x + barRect.width * 0.6, textY);
            ctx.fillText(metrics.readyText, barRect.x + barRect.width * 0.6, textY);
            ctx.restore();
            return;
        }

        const fontSize = Math.round(barRect.height * 0.24);
        const rightInset = barRect.width * 0.1;
        const textX = barRect.x + barRect.width - rightInset;
        ctx.font = `800 ${fontSize}px ${HUD_FONT_STACK}`;
        const textY = getCanvasTextCenterY(ctx, metrics.percentageText, barRect.y + barRect.height * 0.5);
        ctx.textAlign = 'right';
        ctx.lineWidth = Math.max(4, fontSize * 0.16);
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(metrics.percentageText, textX, textY);
        ctx.fillText(metrics.percentageText, textX, textY);
        ctx.restore();
    }

    _drawDebug(ctx, metrics) {
        const barRect = metrics.barRect;
        const clipRect = metrics.clipRect;
        const drawRect = metrics.progressDrawRect;

        ctx.save();
        ctx.lineWidth = 2;

        ctx.strokeStyle = 'rgba(0, 255, 255, 0.95)';
        ctx.strokeRect(barRect.x + 1, barRect.y + 1, barRect.width - 2, barRect.height - 2);

        ctx.strokeStyle = 'rgba(255, 0, 128, 0.95)';
        ctx.strokeRect(clipRect.x + 1, clipRect.y + 1, Math.max(clipRect.width - 2, 1), clipRect.height - 2);

        ctx.strokeStyle = 'rgba(255, 255, 0, 0.95)';
        ctx.beginPath();
        ctx.moveTo(barRect.x + metrics.progressStartOffset, barRect.y);
        ctx.lineTo(barRect.x + metrics.progressStartOffset, barRect.y + barRect.height);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(0, 255, 0, 0.95)';
        ctx.strokeRect(drawRect.x + 1, drawRect.y + 1, Math.max(drawRect.width - 2, 1), drawRect.height - 2);

        const text = metrics.isFull ? metrics.readyText : metrics.percentageText;
        const fontSize = metrics.isFull
            ? Math.round(barRect.height * 0.18)
            : Math.round(barRect.height * 0.24);
        ctx.font = `800 ${fontSize}px ${HUD_FONT_STACK}`;
        const measured = ctx.measureText(text);
        const textWidth = measured.width;
        const textHeight = fontSize;
        const textX = metrics.isFull
            ? barRect.x + barRect.width * 0.5 - textWidth * 0.5
            : barRect.x + barRect.width - barRect.width * 0.06 - textWidth;
        const textY = barRect.y + barRect.height * 0.55 - textHeight * 0.5;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.strokeRect(textX, textY, textWidth, textHeight);
        ctx.restore();
    }

    _onPointerDown(event) {
        if (!this._visible || !this._ready) return;
        const rect = this.domElement?.getBoundingClientRect?.();
        if (!rect) return;
        const x = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * this.lastLayoutWidth;
        const y = this.lastLayoutHeight - ((event.clientY - rect.top) / Math.max(rect.height, 1)) * this.lastLayoutHeight;
        if (x < this.bounds.left || x > this.bounds.right ||
            y < this.bounds.bottom || y > this.bounds.top) {
            return;
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        this.onPress?.();
    }
}
