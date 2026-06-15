function injectSettingsDialogStyles() {
    if (document.getElementById('dyno-settings-dialog-styles')) {
        return;
    }

    const style = document.createElement('style');
    style.id = 'dyno-settings-dialog-styles';
    style.textContent = `
        .dyno-settings-screen {
            position: fixed;
            inset: 0;
            z-index: 1200;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
            padding:
                max(24px, env(safe-area-inset-top))
                max(24px, env(safe-area-inset-right))
                max(24px, env(safe-area-inset-bottom))
                max(24px, env(safe-area-inset-left));
            background:
                radial-gradient(circle at top, rgba(255, 221, 132, 0.2), transparent 34%),
                linear-gradient(180deg, rgba(7, 43, 96, 0.68) 0%, rgba(16, 92, 168, 0.58) 42%, rgba(50, 35, 24, 0.5) 100%);
            backdrop-filter: blur(5px);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transition: opacity 180ms ease, visibility 180ms ease;
            font-family: "Orbitron";
            overflow: hidden;
        }

        .dyno-settings-screen.is-visible {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
        }

        .dyno-settings-card {
            width: min(478px, calc(100vw - 32px));
            max-height: calc(100dvh - 32px);
            box-sizing: border-box;
            padding: 28px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 24px;
            color: #f7fbff;
            background:
                linear-gradient(180deg, rgba(6, 24, 52, 0.96) 0%, rgba(12, 44, 87, 0.97) 100%);
            box-shadow:
                0 24px 70px rgba(3, 12, 27, 0.45),
                inset 0 1px 0 rgba(255, 255, 255, 0.14);
            transform-origin: center center;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            scrollbar-gutter: stable;
        }

        .dyno-settings-card::-webkit-scrollbar {
            width: 10px;
        }

        .dyno-settings-card::-webkit-scrollbar-track {
            background: rgba(255, 255, 255, 0.06);
            border-radius: 999px;
        }

        .dyno-settings-card::-webkit-scrollbar-thumb {
            background: rgba(160, 200, 255, 0.45);
            border-radius: 999px;
        }

        .dyno-settings-card::-webkit-scrollbar-thumb:hover {
            background: rgba(160, 200, 255, 0.68);
        }

        .dyno-settings-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            margin-bottom: 22px;
        }

        .dyno-settings-header > :first-child {
            min-width: 0;
            flex: 1 1 auto;
        }

        .dyno-settings-kicker {
            margin: 0 0 8px;
            font-size: clamp(10px, 2.4vw, 12px);
            font-weight: 700;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            color: rgba(215, 240, 255, 0.72);
        }

        .dyno-settings-title {
            margin: 0;
            font-size: clamp(24px, 7vw, 34px);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            line-height: 0.95;
        }

        .dyno-settings-close {
            flex: 0 0 auto;
            width: 44px;
            height: 44px;
            border: 1px solid rgba(224, 62, 62, 0.6);
            border-radius: 8px;
            cursor: pointer;
            font: inherit;
            font-size: 24px;
            line-height: 1;
            color: #e03e3e;
            background: rgba(255, 255, 255, 0.08);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
        }

        .dyno-settings-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 18px;
            min-height: 68px;
            padding: 14px 0;
            border-top: 1px solid rgba(255, 255, 255, 0.12);
        }

        .dyno-settings-row:last-of-type {
            border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        }

        .dyno-settings-label {
            min-width: 0;
            font-size: 15px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .dyno-settings-toggle {
            position: relative;
            flex: 0 0 auto;
            width: 76px;
            height: 38px;
            border: none;
            border-radius: 999px;
            cursor: pointer;
            background: rgba(255, 255, 255, 0.16);
            box-shadow:
                inset 0 2px 5px rgba(0, 0, 0, 0.34),
                inset 0 1px 0 rgba(255, 255, 255, 0.16);
        }

        .dyno-settings-toggle::before {
            content: "";
            position: absolute;
            top: 4px;
            left: 4px;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            background: #d7e9ff;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
            transition: transform 150ms ease, background 150ms ease;
        }

        .dyno-settings-toggle[aria-checked="true"] {
            background:
                linear-gradient(180deg, #fff4b8 0%, #ffb949 100%);
        }

        .dyno-settings-toggle[aria-checked="true"]::before {
            transform: translateX(38px);
            background: #14253a;
        }

        .dyno-settings-close:hover,
        .dyno-settings-close:focus-visible,
        .dyno-settings-toggle:hover,
        .dyno-settings-toggle:focus-visible {
            outline: none;
            filter: brightness(1.05);
        }

        .dyno-settings-select {
            flex: 0 0 auto;
            padding: 8px 12px;
            border: 1px solid rgba(255, 255, 255, 0.18);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.08);
            color: #f7fbff;
            font: inherit;
            font-size: 13px;
            font-weight: 700;
            letter-spacing: 0.06em;
            cursor: pointer;
            appearance: none;
            -webkit-appearance: none;
            background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%23a0c8ff' stroke-width='1.8' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
            background-repeat: no-repeat;
            background-position: right 10px center;
            padding-right: 30px;
        }

        .dyno-settings-select:focus {
            outline: none;
            border-color: rgba(255, 255, 255, 0.4);
        }

        .dyno-settings-restart-btn {
            flex: 0 0 auto;
            padding: 9px 18px;
            border: 1px solid rgba(255, 100, 80, 0.5);
            border-radius: 8px;
            background: rgba(255, 60, 40, 0.12);
            color: #ff8070;
            font: inherit;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            cursor: pointer;
            transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
        }

        .dyno-settings-restart-btn:hover,
        .dyno-settings-restart-btn:focus-visible {
            outline: none;
            background: rgba(255, 60, 40, 0.28);
            border-color: rgba(255, 100, 80, 0.9);
            color: #ffb0a0;
        }

        .dyno-settings-restart-btn.confirm {
            background: rgba(255, 60, 40, 0.5);
            border-color: #ff6050;
            color: #fff;
        }

        .dyno-settings-select option {
            background: #0c2457;
            color: #f7fbff;
        }

        @media (orientation: landscape) and (max-height: 720px) {
            .dyno-settings-screen {
                align-items: flex-start;
                padding:
                    max(12px, env(safe-area-inset-top))
                    max(12px, env(safe-area-inset-right))
                    max(12px, env(safe-area-inset-bottom))
                    max(12px, env(safe-area-inset-left));
            }

            .dyno-settings-card {
                width: min(60vw, calc(100vw - 24px));
                max-height: calc(100dvh - 24px);
                padding: 22px 24px;
            }

            .dyno-settings-header {
                margin-bottom: 16px;
            }

            .dyno-settings-kicker {
                margin-bottom: 6px;
            }

            .dyno-settings-title {
                font-size: clamp(22px, 5vw, 32px);
            }

            .dyno-settings-row {
                min-height: 58px;
                padding: 10px 0;
            }
        }

        @media (max-width: 520px) {
            .dyno-settings-card {
                width: min(100%, calc(100vw - 20px));
                padding: 20px 18px;
            }

            .dyno-settings-header {
                gap: 12px;
            }

            .dyno-settings-close {
                width: 40px;
                height: 40px;
                font-size: 22px;
            }

            .dyno-settings-title {
                font-size: clamp(22px, 6.2vw, 30px);
            }
        }

    `;

    document.head.appendChild(style);
}

import { getPlayerIdentity, hydratePlayerIdentityFromPlatform } from './PlayerIdentity.js';
import { loadLocalJson, saveJsonWithPlatformMirrors } from './PlatformBridge.js';
import { t, getLanguage, setLanguage, getSupportedLanguages } from './i18n.js';

export class SettingsDialog {
    constructor({
        sfxEnabled = true,
        ambienceEnabled = true,
        musicEnabled = true,
        qualityMode = 'auto',
        qualitySystemEnabled = true,
        onSfxEnabledChange,
        onAmbienceEnabledChange,
        onMusicEnabledChange,
        onQualityModeChange,
        onRestartMissions,
        onResetAll,
        onHide
    } = {}) {
        injectSettingsDialogStyles();
        this.visible = false;
        
        // Load settings from localStorage if available, otherwise use provided defaults
        const savedSettings = this.loadSettings();
        this.sfxEnabled = savedSettings.sfxEnabled !== undefined ? savedSettings.sfxEnabled : (sfxEnabled !== false);
        this.ambienceEnabled = savedSettings.ambienceEnabled !== undefined ? savedSettings.ambienceEnabled : (ambienceEnabled !== false);
        this.musicEnabled = savedSettings.musicEnabled !== undefined ? savedSettings.musicEnabled : (musicEnabled !== false);
        this.qualitySystemEnabled = qualitySystemEnabled !== false;
        this.qualityMode = this.qualitySystemEnabled
            ? (['auto', 'low', 'high'].includes(savedSettings.qualityMode) ? savedSettings.qualityMode : qualityMode)
            : 'high';
        this.desktopFullscreenAvailable = false;
        this.desktopFullscreen = false;
        
        this.onSfxEnabledChange = onSfxEnabledChange;
        this.onAmbienceEnabledChange = onAmbienceEnabledChange;
        this.onMusicEnabledChange = onMusicEnabledChange;
        this.onQualityModeChange = onQualityModeChange;
        this.onRestartMissions = onRestartMissions;
        this.onResetAll = onResetAll;
        this.onHide = onHide;

        this.root = document.createElement('div');
        this.root.className = 'dyno-settings-screen';

        this.card = document.createElement('div');
        this.card.className = 'dyno-settings-card';
        this.card.setAttribute('role', 'dialog');
        this.card.setAttribute('aria-modal', 'true');
        this.card.setAttribute('aria-labelledby', 'dyno-settings-title');

        const header = document.createElement('div');
        header.className = 'dyno-settings-header';

        const headingGroup = document.createElement('div');
        this.kicker = document.createElement('p');
        this.kicker.className = 'dyno-settings-kicker';
        this.kicker.textContent = 'DYNO THE DYNO';

        this.title = document.createElement('h2');
        this.title.id = 'dyno-settings-title';
        this.title.className = 'dyno-settings-title';
        this.title.textContent = t('settings_title');
        headingGroup.append(this.kicker, this.title);

        this.closeButton = document.createElement('button');
        this.closeButton.className = 'dyno-settings-close';
        this.closeButton.type = 'button';
        this.closeButton.setAttribute('aria-label', t('settings_close_label'));
        this.closeButton.textContent = 'x';
        header.append(headingGroup, this.closeButton);

        const nameRow = this.createNameRow();
        this._nameLabel = nameRow.querySelector('.dyno-settings-label');
        const qualityRow = this.qualitySystemEnabled ? this.createQualityRow() : null;
        this._qualityLabel = qualityRow?.querySelector('.dyno-settings-label') || null;
        const fullscreenRow = this.createDesktopFullscreenRow();
        this._fullscreenLabel = fullscreenRow?.label || null;
        this.desktopFullscreenToggle = fullscreenRow?.toggle || null;

        const sfxRow = this.createToggleRow(t('settings_sfx'), t('settings_sfx_label'));
        this.sfxToggle = sfxRow.toggle;
        this._sfxLabel = sfxRow.label;

        const ambienceRow = this.createToggleRow(t('settings_ambience'), t('settings_ambience_label'));
        this.ambienceToggle = ambienceRow.toggle;
        this._ambienceLabel = ambienceRow.label;

        const musicRow = this.createToggleRow(t('settings_music'), t('settings_music_label'));
        this.musicToggle = musicRow.toggle;
        this._musicLabel = musicRow.label;

        const languageRow = this.createLanguageRow();
        this._languageLabel = languageRow.querySelector('.dyno-settings-label');
        const quitRow = this.createDesktopQuitRow();
        this._quitLabel = quitRow?.querySelector('.dyno-settings-label') || null;
        const restartRow = this.createRestartRow();
        this._restartLabel = restartRow.querySelector('.dyno-settings-label');
        const resetAllRow = this.createResetAllRow();
        this._resetAllLabel = resetAllRow.querySelector('.dyno-settings-label');

        this.card.append(
            header,
            nameRow,
            ...(qualityRow ? [qualityRow] : []),
            ...(fullscreenRow ? [fullscreenRow.row] : []),
            sfxRow.row,
            ambienceRow.row,
            musicRow.row,
            languageRow,
            ...(quitRow ? [quitRow] : []),
            restartRow,
            resetAllRow
        );
        void this.refreshPlayerIdentityName();
        void this.initializeDesktopFullscreenState();
        this.root.appendChild(this.card);
        document.body.appendChild(this.root);

        this.closeButton.addEventListener('click', () => this.hide());
        this.sfxToggle.addEventListener('click', () => this.setSfxEnabled(!this.sfxEnabled, true));
        this.ambienceToggle.addEventListener('click', () => this.setAmbienceEnabled(!this.ambienceEnabled, true));
        this.musicToggle.addEventListener('click', () => this.setMusicEnabled(!this.musicEnabled, true));
        this.desktopFullscreenToggle?.addEventListener('click', () => {
            void this.toggleDesktopFullscreen();
        });
        this.root.addEventListener('pointerdown', (event) => {
            if (event.target === this.root) {
                this.hide();
            }
        });
        window.addEventListener('keydown', (event) => {
            if (this.visible && event.key === 'Escape') {
                this.hide();
            }
        });

        this.syncSfxToggle();
        this.syncAmbienceToggle();
        this.syncMusicToggle();
        this.syncQualitySelect();

        // Apply loaded settings to audio managers on initialization
        this.onSfxEnabledChange?.(this.sfxEnabled);
        this.onAmbienceEnabledChange?.(this.ambienceEnabled);
        this.onMusicEnabledChange?.(this.musicEnabled);
        if (this.qualitySystemEnabled) {
            this.onQualityModeChange?.(this.qualityMode);
        }

        this._onLanguageChange = () => { this._applyTranslations(); if (this.visible) requestAnimationFrame(() => this._scaleCard()); };
        window.addEventListener('languagechange', this._onLanguageChange);

        this._onResize = () => { if (this.visible) this._scaleCard(); };
        window.addEventListener('resize', this._onResize);
    }

    _scaleCard() {
        this.card.style.transform = 'none';
    }

    _applyTranslations() {
        this.title.textContent = t('settings_title');
        this.closeButton.setAttribute('aria-label', t('settings_close_label'));
        if (this._sfxLabel) this._sfxLabel.textContent = t('settings_sfx');
        if (this._ambienceLabel) this._ambienceLabel.textContent = t('settings_ambience');
        if (this._musicLabel) this._musicLabel.textContent = t('settings_music');
        if (this._nameLabel) this._nameLabel.textContent = t('settings_your_name');
        if (this._qualityLabel) this._qualityLabel.textContent = t('settings_quality');
        if (this._fullscreenLabel) this._fullscreenLabel.textContent = t('settings_fullscreen');
        if (this.qualitySelect) {
            for (const option of this.qualitySelect.options) {
                option.textContent = t(`settings_quality_${option.value}`);
            }
            this.qualitySelect.setAttribute('aria-label', t('settings_quality_label'));
        }
        if (this.desktopFullscreenToggle) {
            this.desktopFullscreenToggle.setAttribute('aria-label', t('settings_fullscreen_label'));
        }
        if (this._languageLabel) this._languageLabel.textContent = t('settings_language');
        if (this._quitLabel) this._quitLabel.textContent = t('settings_quit');
        if (this._quitBtn) this._quitBtn.textContent = t('settings_quit_btn');
        if (this._restartLabel) this._restartLabel.textContent = t('settings_restart_missions');
        if (this._restartBtn) this._restartBtn.textContent = t('settings_restart_btn');
        if (this._resetAllLabel) this._resetAllLabel.textContent = t('settings_reset_all');
        if (this._resetAllBtn) this._resetAllBtn.textContent = t('settings_reset_all_btn');
    }

    createNameRow() {
        const identity = getPlayerIdentity();

        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const labelGroup = document.createElement('div');
        labelGroup.style.cssText = 'min-width: 0; flex: 1 1 auto;';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_your_name');

        const sub = document.createElement('div');
        sub.style.cssText = `
            margin-top: 4px;
            font-size: 18px;
            font-weight: 700;
            letter-spacing: 0.06em;
            color: #ffcc44;
            font-family: "Orbitron";
        `;
        sub.textContent = identity.name;
        this._nameValue = sub;

        labelGroup.append(label, sub);
        row.appendChild(labelGroup);
        return row;
    }

    async refreshPlayerIdentityName() {
        const identity = await hydratePlayerIdentityFromPlatform();
        if (this._nameValue && identity?.name) {
            this._nameValue.textContent = identity.name;
        }
    }

    createDesktopFullscreenRow() {
        const desktopShell = window?.desktopShell;
        if (!desktopShell || typeof desktopShell.setFullscreen !== 'function' || typeof desktopShell.isFullscreen !== 'function') {
            return null;
        }

        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_fullscreen');

        const toggle = document.createElement('button');
        toggle.className = 'dyno-settings-toggle';
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', t('settings_fullscreen_label'));

        row.append(label, toggle);
        this.desktopFullscreenAvailable = true;
        return { row, toggle, label };
    }

    async initializeDesktopFullscreenState() {
        if (!this.desktopFullscreenAvailable || !window?.desktopShell?.isFullscreen) {
            return;
        }
        try {
            this.desktopFullscreen = await window.desktopShell.isFullscreen();
            this.syncDesktopFullscreenToggle();
        } catch (error) {
            console.warn('[SettingsDialog] Failed to read desktop fullscreen state:', error);
        }
    }

    syncDesktopFullscreenToggle() {
        this.desktopFullscreenToggle?.setAttribute('aria-checked', this.desktopFullscreen ? 'true' : 'false');
    }

    async toggleDesktopFullscreen() {
        if (!this.desktopFullscreenAvailable || !window?.desktopShell?.toggleFullscreen) {
            return;
        }
        try {
            this.desktopFullscreen = await window.desktopShell.toggleFullscreen();
            this.syncDesktopFullscreenToggle();
        } catch (error) {
            console.warn('[SettingsDialog] Failed to toggle desktop fullscreen:', error);
        }
    }

    createDesktopQuitRow() {
        const desktopShell = window?.desktopShell;
        if (!desktopShell || typeof desktopShell.quit !== 'function') {
            return null;
        }

        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_quit');

        this._quitBtn = document.createElement('button');
        this._quitBtn.className = 'dyno-settings-restart-btn';
        this._quitBtn.type = 'button';
        this._quitBtn.textContent = t('settings_quit_btn');
        this._quitBtn.addEventListener('click', () => {
            void desktopShell.quit();
        });

        row.append(label, this._quitBtn);
        return row;
    }

    createLanguageRow() {
        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_language');

        const select = document.createElement('select');
        select.className = 'dyno-settings-select';
        select.setAttribute('aria-label', t('settings_language'));

        const currentLang = getLanguage();
        for (const { code, label: langLabel } of getSupportedLanguages()) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = langLabel;
            option.selected = code === currentLang;
            select.appendChild(option);
        }

        select.addEventListener('change', () => {
            setLanguage(select.value);
        });

        row.append(label, select);
        return row;
    }

    createQualityRow() {
        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_quality');

        const select = document.createElement('select');
        select.className = 'dyno-settings-select';
        select.setAttribute('aria-label', t('settings_quality_label'));

        for (const mode of ['auto', 'high', 'low']) {
            const option = document.createElement('option');
            option.value = mode;
            option.textContent = t(`settings_quality_${mode}`);
            select.appendChild(option);
        }
        this.qualitySelect = select;

        select.addEventListener('change', () => {
            this.setQualityMode(select.value, true);
        });

        row.append(label, select);
        return row;
    }

    createRestartRow() {
        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_restart_missions');

        this._restartBtn = document.createElement('button');
        this._restartBtn.className = 'dyno-settings-restart-btn';
        this._restartBtn.type = 'button';
        this._restartBtn.textContent = t('settings_restart_btn');

        let confirmTimeout = null;
        this._restartBtn.addEventListener('click', () => {
            if (this._restartBtn.classList.contains('confirm')) {
                clearTimeout(confirmTimeout);
                this._restartBtn.classList.remove('confirm');
                this._restartBtn.textContent = t('settings_restart_btn');
                this.onRestartMissions?.();
                this.hide();
            } else {
                this._restartBtn.classList.add('confirm');
                this._restartBtn.textContent = t('settings_restart_confirm');
                clearTimeout(confirmTimeout);
                confirmTimeout = setTimeout(() => {
                    this._restartBtn.classList.remove('confirm');
                    this._restartBtn.textContent = t('settings_restart_btn');
                }, 3000);
            }
        });

        row.append(label, this._restartBtn);
        return row;
    }

    createResetAllRow() {
        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = t('settings_reset_all');

        this._resetAllBtn = document.createElement('button');
        this._resetAllBtn.className = 'dyno-settings-restart-btn';
        this._resetAllBtn.type = 'button';
        this._resetAllBtn.textContent = t('settings_reset_all_btn');

        let confirmTimeout = null;
        this._resetAllBtn.addEventListener('click', () => {
            if (this._resetAllBtn.classList.contains('confirm')) {
                clearTimeout(confirmTimeout);
                this._resetAllBtn.classList.remove('confirm');
                this._resetAllBtn.textContent = t('settings_reset_all_btn');
                this.onResetAll?.();
            } else {
                this._resetAllBtn.classList.add('confirm');
                this._resetAllBtn.textContent = t('settings_restart_confirm');
                clearTimeout(confirmTimeout);
                confirmTimeout = setTimeout(() => {
                    this._resetAllBtn.classList.remove('confirm');
                    this._resetAllBtn.textContent = t('settings_reset_all_btn');
                }, 3000);
            }
        });

        row.append(label, this._resetAllBtn);
        return row;
    }

    createToggleRow(labelText, ariaLabel) {
        const row = document.createElement('div');
        row.className = 'dyno-settings-row';

        const label = document.createElement('div');
        label.className = 'dyno-settings-label';
        label.textContent = labelText;

        const toggle = document.createElement('button');
        toggle.className = 'dyno-settings-toggle';
        toggle.type = 'button';
        toggle.setAttribute('role', 'switch');
        toggle.setAttribute('aria-label', ariaLabel);
        row.append(label, toggle);
        return { row, toggle, label };
    }

    setSfxEnabled(value, notify = false) {
        this.sfxEnabled = value !== false;
        this.saveSettings();
        this.syncSfxToggle();
        if (notify) {
            this.onSfxEnabledChange?.(this.sfxEnabled);
        }
    }

    syncSfxToggle() {
        this.sfxToggle.setAttribute('aria-checked', this.sfxEnabled ? 'true' : 'false');
    }

    setAmbienceEnabled(value, notify = false) {
        this.ambienceEnabled = value !== false;
        this.saveSettings();
        this.syncAmbienceToggle();
        if (notify) {
            this.onAmbienceEnabledChange?.(this.ambienceEnabled);
        }
    }

    syncAmbienceToggle() {
        this.ambienceToggle.setAttribute('aria-checked', this.ambienceEnabled ? 'true' : 'false');
    }

    setMusicEnabled(value, notify = false) {
        this.musicEnabled = value !== false;
        this.saveSettings();
        this.syncMusicToggle();
        if (notify) {
            this.onMusicEnabledChange?.(this.musicEnabled);
        }
    }

    syncMusicToggle() {
        this.musicToggle.setAttribute('aria-checked', this.musicEnabled ? 'true' : 'false');
    }

    setQualityMode(value, notify = false) {
        if (!this.qualitySystemEnabled) {
            this.qualityMode = 'high';
            this.syncQualitySelect();
            return;
        }
        const normalized = ['auto', 'low', 'high'].includes(value) ? value : 'auto';
        this.qualityMode = normalized;
        this.saveSettings();
        this.syncQualitySelect();
        if (notify) {
            this.onQualityModeChange?.(this.qualityMode);
        }
    }

    syncQualitySelect() {
        if (this.qualitySelect) {
            this.qualitySelect.value = this.qualityMode;
        }
    }

    saveSettings() {
        try {
            const settings = {
                sfxEnabled: this.sfxEnabled,
                ambienceEnabled: this.ambienceEnabled,
                musicEnabled: this.musicEnabled,
                ...(this.qualitySystemEnabled ? { qualityMode: this.qualityMode } : {})
            };
            void saveJsonWithPlatformMirrors('dynoSettings', settings);
        } catch (error) {
            console.warn('[SettingsDialog] Failed to save settings to localStorage:', error);
        }
    }

    loadSettings() {
        const settings = loadLocalJson('dynoSettings', {});
        return settings && typeof settings === 'object' ? settings : {};
    }

    getNavigableElements() {
        return [
            this.closeButton,
            this.qualitySelect,
            this.desktopFullscreenToggle,
            this.sfxToggle,
            this.ambienceToggle,
            this.musicToggle,
            this.languageSelect,
            this._quitBtn,
            this._restartBtn,
            this._resetAllBtn
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
        const elements = this.getNavigableElements();
        const preferred = this.qualitySelect ||
            this.desktopFullscreenToggle ||
            this.sfxToggle ||
            this.languageSelect ||
            this.closeButton;
        (preferred && elements.includes(preferred) ? preferred : elements[0])?.focus?.();
    }

    adjustFocusedElement(direction = 1) {
        const active = document.activeElement;
        if (!active) {
            this.focusInitialElement();
            return true;
        }
        if (active === this.qualitySelect || active === this.languageSelect) {
            const select = active;
            const options = Array.from(select.options || []);
            if (!options.length) {
                return false;
            }
            const currentIndex = Math.max(0, select.selectedIndex);
            const nextIndex = (currentIndex + direction + options.length) % options.length;
            if (nextIndex !== currentIndex) {
                select.selectedIndex = nextIndex;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
        }
        return false;
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

    show() {
        if (this.visible) {
            return;
        }

        this.visible = true;
        this.root.classList.add('is-visible');
        this.card.scrollTop = 0;
        requestAnimationFrame(() => this._scaleCard());
        this.focusInitialElement();
    }

    hide() {
        if (!this.visible) {
            return;
        }

        this.visible = false;
        this.root.classList.remove('is-visible');
        void this.onHide?.();
    }

    toggle() {
        if (this.visible) {
            this.hide();
        } else {
            this.show();
        }
    }
}
