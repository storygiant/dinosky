import { t } from './i18n.js';

export class CinematicOverlay {
    constructor() {
        this.isActive = false;
        this._skipHandler = null;

        this.root = document.createElement('div');
        this.root.className = 'cinematic-overlay';

        this.topBar = document.createElement('div');
        this.topBar.className = 'cinematic-overlay__bar cinematic-overlay__bar--top';

        this.bottomBar = document.createElement('div');
        this.bottomBar.className = 'cinematic-overlay__bar cinematic-overlay__bar--bottom';

        this.skipButton = document.createElement('button');
        this.skipButton.className = 'cinematic-overlay__skip';
        this.skipButton.type = 'button';
        this.skipButton.textContent = t('cinematic_skip');
        this.skipButton.addEventListener('click', () => this._skipHandler?.());

        this.root.append(this.topBar, this.bottomBar, this.skipButton);
        document.body.appendChild(this.root);
        this.injectStyles();

        window.addEventListener('languagechange', () => {
            this.skipButton.textContent = t('cinematic_skip');
        });
    }

    injectStyles() {
        if (document.getElementById('cinematic-overlay-styles')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'cinematic-overlay-styles';
        style.textContent = `
.cinematic-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 80;
}

.cinematic-overlay__bar {
    position: absolute;
    left: 0;
    width: 100%;
    height: clamp(26px, 5vh, 42px);
    background: #000;
    transition: transform 280ms ease;
    will-change: transform;
}

.cinematic-overlay__bar--top {
    top: 0;
    transform: translateY(-105%);
}

.cinematic-overlay__bar--bottom {
    bottom: 0;
    transform: translateY(105%);
}

.cinematic-overlay.is-active .cinematic-overlay__bar--top {
    transform: translateY(0);
}

.cinematic-overlay.is-active .cinematic-overlay__bar--bottom {
    transform: translateY(0);
}

.cinematic-overlay__skip {
    position: absolute;
    right: max(16px, env(safe-area-inset-right));
    bottom: max(calc(clamp(26px, 5vh, 42px) + 12px), calc(env(safe-area-inset-bottom) + 12px));
    padding: 6px 16px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.45);
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-family: "Orbitron";
    letter-spacing: 0.06em;
    cursor: pointer;
    pointer-events: none;
    opacity: 0;
    transition: opacity 200ms ease;
}

.cinematic-overlay.is-active .cinematic-overlay__skip {
    pointer-events: auto;
    opacity: 1;
}

.cinematic-overlay__skip:active {
    background: rgba(0, 0, 0, 0.65);
}
`;
        document.head.appendChild(style);
    }

    setActive(isActive) {
        this.isActive = isActive === true;
        this.root.classList.toggle('is-active', this.isActive);
    }

    setSkipHandler(handler) {
        this._skipHandler = handler ?? null;
    }

    dispose() {
        this.root.remove();
    }
}
