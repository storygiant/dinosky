import * as THREE from 'three';
import { CONFIG } from './config.js';
import { t } from './i18n.js';

const HUD_FONT_FAMILY = '"Orbitron"';

export class Joystick {
    constructor(domElement) {
        this.domElement = domElement;

        this.input = { x: 0, y: 0 };
        this.targetInput = { x: 0, y: 0 };
        this.active = false;
        this.pointerId = null;
        this.deadzone = 0.1;
        this.keyboard = {
            left: false,
            right: false,
            up: false,
            down: false,
            speedLeft: false,
            speedRight: false
        };
        this.gamepad = {
            connected: false,
            active: false,
            index: -1,
            moveX: 0,
            moveY: 0,
            fireDown: false,
            pickupDropDown: false,
            speedDown: false,
            furyDown: false,
            uiAcceptDown: false,
            uiBackDown: false,
            uiLeftDown: false,
            uiRightDown: false,
            uiUpDown: false,
            uiDownDown: false,
            menuSettingsDown: false,
            menuSkinsDown: false,
            prevActive: false,
            prevFireDown: false,
            prevPickupDropDown: false,
            prevSpeedDown: false,
            prevFuryDown: false,
            prevUiAcceptDown: false,
            prevUiBackDown: false,
            prevUiLeftDown: false,
            prevUiRightDown: false,
            prevUiUpDown: false,
            prevUiDownDown: false,
            prevMenuSettingsDown: false,
            prevMenuSkinsDown: false
        };
        this.uiAcceptPressed = false;
        this.uiBackPressed = false;
        this.uiLeftPressed = false;
        this.uiRightPressed = false;
        this.uiUpPressed = false;
        this.uiDownPressed = false;
        this.menuSettingsPressed = false;
        this.menuSkinsPressed = false;
        this.keyboardSmoothing = 1;

        // UI stays in fixed screen space so gameplay camera zoom never changes button size.
        this.uiShortSideUnits = CONFIG.VIEW_HEIGHT;
        // Keep joystick geometry in joystick UI units.
        this.size = 0;
        this.paddingLeft = 9;
        this.paddingBottom = 9;
        this.baseRadius = 6.5;
        this.stickRadius = 2;
        this.maxDistance = 6.5;
        this.stickOffsetX = 0;
        this.stickOffsetY = 0;

        this.fireButtonDown = false;
        this.firePointerId = null;
        this.fireEnabled = true;
        this.fireRadius = 3;
        this.firePaddingRight = 2;
        this.firePaddingBottom = 2;
        this.pickupDropButtonDown = false;
        this.pickupDropPointerId = null;
        this.pickupDropPressed = false;
        this.debugRebuildCarryPolygonPressed = false;
        this.furyPressed = false;
        this.gameplayInputSuppressed = false;
        this.pickupDropEnabled = true;
        this.pickupDropMode = 'lift';
        this.pickupDropRadius = this.fireRadius;
        this.speedButtonDown = false;
        this.speedPointerId = null;
        this.speedRadius = this.fireRadius;
        this.speedEnabled = true;
        this.inputMode = this.getInitialInputMode();
        this.abilityInputMode = this.inputMode;
        this.keyboardKeyButtons = {};
        this.abilityKeyLabels = {};
        this.uiVisible = true;
        this.dragDirectionHint = null; // null | 1 (right) | -1 (left)

        this.uiScene = new THREE.Scene();
        this.uiCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
        this.uiCamera.position.z = 1;

        this.root = new THREE.Group();
        this.uiScene.add(this.root);

        this.setupVisuals();
        this.setupEvents();
        this.setupKeyboardMovement();
        this.handleResize();
        this.scheduleHudFontRefresh();

        window.addEventListener('resize', () => this.handleResize());
    }

    getGamepadSnapshot() {
        if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
            return null;
        }

        const pads = navigator.getGamepads();
        if (!pads) {
            return null;
        }

        if (Number.isInteger(this.gamepad.index) && this.gamepad.index >= 0) {
            const preferred = pads[this.gamepad.index];
            if (preferred?.connected) {
                return preferred;
            }
        }

        for (const pad of pads) {
            if (pad?.connected) {
                return pad;
            }
        }

        return null;
    }

    applyAxisDeadzone(value) {
        if (!Number.isFinite(value)) {
            return 0;
        }

        const magnitude = Math.abs(value);
        if (magnitude <= this.deadzone) {
            return 0;
        }

        const scaled = (magnitude - this.deadzone) / Math.max(1 - this.deadzone, 0.0001);
        return Math.sign(value) * THREE.MathUtils.clamp(scaled, 0, 1);
    }

    isGamepadButtonPressed(gamepad, index) {
        const button = gamepad?.buttons?.[index];
        if (!button) {
            return false;
        }

        if (typeof button === 'object') {
            return button.pressed === true || (Number.isFinite(button.value) && button.value > 0.5);
        }

        return button === 1;
    }

    updateGamepadState() {
        const pad = this.getGamepadSnapshot();
        if (!pad) {
            this.gamepad.connected = false;
            this.gamepad.active = false;
            this.gamepad.index = -1;
            this.gamepad.moveX = 0;
            this.gamepad.moveY = 0;
            this.gamepad.fireDown = false;
            this.gamepad.pickupDropDown = false;
            this.gamepad.speedDown = false;
            this.gamepad.furyDown = false;
            this.gamepad.uiAcceptDown = false;
            this.gamepad.uiBackDown = false;
            this.gamepad.uiLeftDown = false;
            this.gamepad.uiRightDown = false;
            this.gamepad.uiUpDown = false;
            this.gamepad.uiDownDown = false;
            this.gamepad.menuSettingsDown = false;
            this.gamepad.menuSkinsDown = false;
            this.gamepad.prevActive = false;
            this.gamepad.prevFireDown = false;
            this.gamepad.prevPickupDropDown = false;
            this.gamepad.prevSpeedDown = false;
            this.gamepad.prevFuryDown = false;
            this.gamepad.prevUiAcceptDown = false;
            this.gamepad.prevUiBackDown = false;
            this.gamepad.prevUiLeftDown = false;
            this.gamepad.prevUiRightDown = false;
            this.gamepad.prevUiUpDown = false;
            this.gamepad.prevUiDownDown = false;
            this.gamepad.prevMenuSettingsDown = false;
            this.gamepad.prevMenuSkinsDown = false;
            return;
        }

        this.gamepad.connected = true;
        this.gamepad.index = pad.index;

        let moveX = this.applyAxisDeadzone(pad.axes?.[0] ?? 0);
        let moveY = this.applyAxisDeadzone(-(pad.axes?.[1] ?? 0));

        if (moveX === 0 && moveY === 0) {
            const dpadLeft = this.isGamepadButtonPressed(pad, 14);
            const dpadRight = this.isGamepadButtonPressed(pad, 15);
            const dpadUp = this.isGamepadButtonPressed(pad, 12);
            const dpadDown = this.isGamepadButtonPressed(pad, 13);
            moveX = (dpadRight ? 1 : 0) - (dpadLeft ? 1 : 0);
            moveY = (dpadUp ? 1 : 0) - (dpadDown ? 1 : 0);
            const dpadLength = Math.hypot(moveX, moveY);
            if (dpadLength > 1) {
                moveX /= dpadLength;
                moveY /= dpadLength;
            }
        }

        this.gamepad.moveX = moveX;
        this.gamepad.moveY = moveY;
        this.gamepad.fireDown =
            this.isGamepadButtonPressed(pad, 7) ||
            this.isGamepadButtonPressed(pad, 6) ||
            this.isGamepadButtonPressed(pad, 2);
        this.gamepad.pickupDropDown = this.isGamepadButtonPressed(pad, 1);
        this.gamepad.speedDown =
            this.isGamepadButtonPressed(pad, 0) ||
            this.isGamepadButtonPressed(pad, 4);
        this.gamepad.furyDown = this.isGamepadButtonPressed(pad, 3);
        this.gamepad.uiAcceptDown =
            this.isGamepadButtonPressed(pad, 0) ||
            this.isGamepadButtonPressed(pad, 2);
        this.gamepad.uiBackDown = this.isGamepadButtonPressed(pad, 3);
        this.gamepad.menuSkinsDown = this.isGamepadButtonPressed(pad, 8);
        this.gamepad.menuSettingsDown = this.isGamepadButtonPressed(pad, 9);
        this.gamepad.uiLeftDown =
            this.isGamepadButtonPressed(pad, 14) ||
            ((pad.axes?.[0] ?? 0) < -0.6);
        this.gamepad.uiRightDown =
            this.isGamepadButtonPressed(pad, 15) ||
            ((pad.axes?.[0] ?? 0) > 0.6);
        this.gamepad.uiUpDown =
            this.isGamepadButtonPressed(pad, 12) ||
            ((pad.axes?.[1] ?? 0) < -0.6);
        this.gamepad.uiDownDown =
            this.isGamepadButtonPressed(pad, 13) ||
            ((pad.axes?.[1] ?? 0) > 0.6);
        this.gamepad.active =
            Math.abs(moveX) > 0.001 ||
            Math.abs(moveY) > 0.001 ||
            this.gamepad.fireDown ||
            this.gamepad.pickupDropDown ||
            this.gamepad.speedDown ||
            this.gamepad.furyDown ||
            this.gamepad.uiAcceptDown ||
            this.gamepad.uiBackDown ||
            this.gamepad.uiLeftDown ||
            this.gamepad.uiRightDown ||
            this.gamepad.uiUpDown ||
            this.gamepad.uiDownDown ||
            this.gamepad.menuSettingsDown ||
            this.gamepad.menuSkinsDown;
    }

    update() {
        this.updateGamepadState();
        this.uiAcceptPressed = this.gamepad.uiAcceptDown && !this.gamepad.prevUiAcceptDown;
        this.uiBackPressed = this.gamepad.uiBackDown && !this.gamepad.prevUiBackDown;
        this.uiLeftPressed = this.gamepad.uiLeftDown && !this.gamepad.prevUiLeftDown;
        this.uiRightPressed = this.gamepad.uiRightDown && !this.gamepad.prevUiRightDown;
        this.uiUpPressed = this.gamepad.uiUpDown && !this.gamepad.prevUiUpDown;
        this.uiDownPressed = this.gamepad.uiDownDown && !this.gamepad.prevUiDownDown;
        this.menuSettingsPressed = this.gamepad.menuSettingsDown && !this.gamepad.prevMenuSettingsDown;
        this.menuSkinsPressed = this.gamepad.menuSkinsDown && !this.gamepad.prevMenuSkinsDown;

        if (this.gameplayInputSuppressed) {
            this.targetInput.x = 0;
            this.targetInput.y = 0;
            this.updateKeyboardMovementInput();
            this.releaseFireButton();
            this.setPickupDropButtonDown(false);
            this.pickupDropPressed = false;
            this.setSpeedButtonDown(false);
            this.furyPressed = false;
            this.gamepad.prevActive = this.gamepad.active;
            this.gamepad.prevFireDown = this.gamepad.fireDown;
            this.gamepad.prevPickupDropDown = this.gamepad.pickupDropDown;
            this.gamepad.prevSpeedDown = this.gamepad.speedDown;
            this.gamepad.prevFuryDown = this.gamepad.furyDown;
            this.gamepad.prevUiAcceptDown = this.gamepad.uiAcceptDown;
            this.gamepad.prevUiBackDown = this.gamepad.uiBackDown;
            this.gamepad.prevUiLeftDown = this.gamepad.uiLeftDown;
            this.gamepad.prevUiRightDown = this.gamepad.uiRightDown;
            this.gamepad.prevUiUpDown = this.gamepad.uiUpDown;
            this.gamepad.prevUiDownDown = this.gamepad.uiDownDown;
            this.gamepad.prevMenuSettingsDown = this.gamepad.menuSettingsDown;
            this.gamepad.prevMenuSkinsDown = this.gamepad.menuSkinsDown;
            return;
        }

        if (this.gamepad.active) {
            this.setInputMode('keyboard');
            this.setAbilityInputMode('keyboard');

            if (!this.active) {
                this.targetInput.x = this.gamepad.moveX;
                this.targetInput.y = this.gamepad.moveY;
                this.applyKeyboardInput();
            }

            if (this.fireEnabled) {
                this.setFireButtonDown(this.gamepad.fireDown);
            } else {
                this.setFireButtonDown(false);
            }

            if (this.pickupDropEnabled) {
                this.setPickupDropButtonDown(this.gamepad.pickupDropDown);
                if (this.gamepad.pickupDropDown && !this.gamepad.prevPickupDropDown) {
                    this.pickupDropPressed = true;
                }
            } else {
                this.setPickupDropButtonDown(false);
            }

            if (this.speedEnabled) {
                this.setSpeedButtonDown(this.gamepad.speedDown);
            } else {
                this.setSpeedButtonDown(false);
            }

            if (this.gamepad.furyDown && !this.gamepad.prevFuryDown) {
                this.furyPressed = true;
            }
        } else if (!this.active) {
            this.updateKeyboardMovementInput();
            if (this.gamepad.prevFireDown) {
                this.setFireButtonDown(false);
            }
            if (this.gamepad.prevPickupDropDown) {
                this.setPickupDropButtonDown(false);
            }
            if (this.gamepad.prevSpeedDown) {
                this.setSpeedButtonDown(false);
            }
        }

        this.gamepad.prevActive = this.gamepad.active;
        this.gamepad.prevFireDown = this.gamepad.fireDown;
        this.gamepad.prevPickupDropDown = this.gamepad.pickupDropDown;
        this.gamepad.prevSpeedDown = this.gamepad.speedDown;
        this.gamepad.prevFuryDown = this.gamepad.furyDown;
        this.gamepad.prevUiAcceptDown = this.gamepad.uiAcceptDown;
        this.gamepad.prevUiBackDown = this.gamepad.uiBackDown;
        this.gamepad.prevUiLeftDown = this.gamepad.uiLeftDown;
        this.gamepad.prevUiRightDown = this.gamepad.uiRightDown;
        this.gamepad.prevUiUpDown = this.gamepad.uiUpDown;
        this.gamepad.prevUiDownDown = this.gamepad.uiDownDown;
        this.gamepad.prevMenuSettingsDown = this.gamepad.menuSettingsDown;
        this.gamepad.prevMenuSkinsDown = this.gamepad.menuSkinsDown;
    }

    getInitialInputMode() {
        const hasFinePointer = window.matchMedia?.('(hover: hover) and (pointer: fine)')?.matches === true;
        return hasFinePointer ? 'keyboard' : 'touch';
    }

    _buildPieSliceGeometry(direction, radius) {
        // direction: 1 = right, -1 = left. 20-degree half-angle wedge.
        const halfAngle = THREE.MathUtils.degToRad(40);
        const centerAngle = direction >= 0 ? 0 : Math.PI;
        const segments = 24;
        const positions = [];
        const indices = [];

        positions.push(0, 0, 0);
        for (let i = 0; i <= segments; i++) {
            const a = centerAngle - halfAngle + (i / segments) * halfAngle * 2;
            positions.push(Math.cos(a) * radius, Math.sin(a) * radius, 0);
            if (i > 0) {
                indices.push(0, i, i + 1);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setIndex(indices);
        return geo;
    }

    setDragDirectionHint(direction) {
        if (this.dragDirectionHint === direction) return;
        this.dragDirectionHint = direction;

        if (direction === null) {
            this.pieSliceMesh.visible = false;
        } else {
            this.pieSliceMesh.geometry.dispose();
            this.pieSliceMesh.geometry = this._buildPieSliceGeometry(direction, this.baseRadius);
            this.pieSliceMesh.visible = true;
        }

        this.updateKeyboardKeyVisuals();
    }

    setupVisuals() {
        const fillMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.08,
            depthTest: false,
            depthWrite: false
        });

        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.62,
            depthTest: false,
            depthWrite: false
        });

        const joystickTexture = new THREE.TextureLoader().load('./gfx/UI/joystick.webp');
        joystickTexture.colorSpace = THREE.SRGBColorSpace;
        joystickTexture.minFilter = THREE.LinearMipmapLinearFilter;
        joystickTexture.magFilter = THREE.LinearFilter;
        joystickTexture.generateMipmaps = true;
        this.joystickTexture = joystickTexture;

        const stickSpriteMaterial = new THREE.SpriteMaterial({
            map: joystickTexture,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false
        });

        const uiTextureLoader = new THREE.TextureLoader();
        const buttonTexture = uiTextureLoader.load('./gfx/UI/button.webp');
        const squareButtonTexture = uiTextureLoader.load('./gfx/UI/button_square.webp');
        const fireIconTexture = uiTextureLoader.load('./gfx/UI/icon_fire.webp');
        const grabIconTexture = uiTextureLoader.load('./gfx/UI/icon_grab_uo.webp');
        const grabDownIconTexture = uiTextureLoader.load('./gfx/UI/icon_grab_down.webp');
        const speedIconTexture = uiTextureLoader.load('./gfx/UI/icon_speed.webp');
        for (const texture of [buttonTexture, squareButtonTexture, fireIconTexture, grabIconTexture, grabDownIconTexture, speedIconTexture]) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.minFilter = THREE.LinearMipmapLinearFilter;
            texture.magFilter = THREE.LinearFilter;
            texture.generateMipmaps = true;
        }
        this.abilityButtonTexture = buttonTexture;
        this.keyboardButtonTexture = squareButtonTexture;
        this.abilityFireIconTexture = fireIconTexture;
        this.abilityGrabIconTexture = grabIconTexture;
        this.abilityGrabDownIconTexture = grabDownIconTexture;
        this.abilitySpeedIconTexture = speedIconTexture;

        this.baseFill = new THREE.Mesh(new THREE.CircleGeometry(this.baseRadius, 48), fillMaterial);
        this.baseFill.renderOrder = 1000;

        this.baseRing = new THREE.Mesh(new THREE.RingGeometry(this.baseRadius - 0.12, this.baseRadius, 64), ringMaterial);
        this.baseRing.renderOrder = 1001;

        const pieSliceMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.28,
            depthTest: false,
            depthWrite: false,
        });
        this.pieSliceMesh = new THREE.Mesh(this._buildPieSliceGeometry(1, this.baseRadius), pieSliceMaterial);
        this.pieSliceMesh.renderOrder = 1002;
        this.pieSliceMesh.visible = false;
        this.root.add(this.pieSliceMesh);

        this.stickSprite = new THREE.Sprite(stickSpriteMaterial);
        this.stickSprite.scale.set(this.stickRadius * 3, this.stickRadius * 3, 1);
        this.stickSprite.renderOrder = 1004;

        this.stickGroup = new THREE.Group();
        this.stickGroup.add(this.stickSprite);

        this.root.add(this.baseFill);
        this.root.add(this.baseRing);
        this.root.add(this.stickGroup);

        this.fireRoot = this.createAbilityButton(this.abilityFireIconTexture, 1010);
        this.pickupDropRoot = this.createAbilityButton(this.abilityGrabIconTexture, 1020);
        this.speedRoot = this.createAbilityButton(this.abilitySpeedIconTexture, 1030);

        this.uiScene.add(this.fireRoot);
        this.uiScene.add(this.pickupDropRoot);
        this.uiScene.add(this.speedRoot);

        this.keyboardRoot = new THREE.Group();
        this.keyboardRoot.visible = false;
        this.keyboardKeyButtons = {
            up: this.createKeyboardKeyButton('W', 1040),
            left: this.createKeyboardKeyButton('A', 1050),
            down: this.createKeyboardKeyButton('S', 1060),
            right: this.createKeyboardKeyButton('D', 1070)
        };
        for (const keyButton of Object.values(this.keyboardKeyButtons)) {
            this.keyboardRoot.add(keyButton);
        }
        this.uiScene.add(this.keyboardRoot);

        // Portrait fury bar anchor only. The actual rendering lives in FuryBar.js so we do not
        // keep a second drawable bar here — only the reserved screen bounds above the buttons.
        this._furyBarLeft = undefined;
        this._furyBarRight = undefined;
        this._furyBarBottom = undefined;
        this._furyBarTop = undefined;

        this.abilityKeyLabels = {
            fire: this.createKeyboardKeyButton(t('key_fire'), 1080, 3.2),
            pickupDrop: this.createKeyboardKeyButton('E', 1090),
            speed: this.createKeyboardKeyButton(t('key_speed'), 1100, 3.2)
        };
        for (const label of Object.values(this.abilityKeyLabels)) {
            label.visible = false;
            this.uiScene.add(label);
        }

        this._furyKeyLabel = this.createKeyboardKeyButton('R', 1110);
        this._furyKeyLabel.visible = false;
        this._furyKeyLabelScene = new THREE.Scene();
        this._furyKeyLabelScene.add(this._furyKeyLabel);
        this._furyKeyLabelReady = false;

        window.addEventListener('languagechange', () => this._rebuildKeyLabels());
    }

    createAbilityButton(iconTexture, renderOrderBase) {
        const backgroundMaterial = new THREE.SpriteMaterial({
            map: this.abilityButtonTexture,
            transparent: true,
            opacity: 0.95,
            depthTest: false,
            depthWrite: false
        });
        const iconMaterial = new THREE.SpriteMaterial({
            map: iconTexture,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false
        });

        const backgroundSprite = new THREE.Sprite(backgroundMaterial);
        backgroundSprite.renderOrder = renderOrderBase;
        const iconSprite = new THREE.Sprite(iconMaterial);
        iconSprite.renderOrder = renderOrderBase + 1;

        const root = new THREE.Group();
        root.add(backgroundSprite);
        root.add(iconSprite);
        root.userData.background = backgroundSprite;
        root.userData.icon = iconSprite;
        root.userData.iconMaterial = iconMaterial;
        return root;
    }

    scheduleHudFontRefresh() {
        if (typeof document === 'undefined' || !document.fonts?.ready) {
            return;
        }

        document.fonts.ready.then(() => {
            this._rebuildKeyLabels();
        }).catch(() => {
            // If the browser does not fully support the Font Loading API lifecycle,
            // keep the initial textures instead of throwing during UI setup.
        });
    }

    _setKeyButtonLabel(keyButton, label) {
        const textSprite = keyButton?.userData?.text;
        if (!textSprite) return;

        const oldTexture = textSprite.material.map;
        const { texture, aspect } = this.createKeyTextTexture(label);
        textSprite.material.map = texture;
        textSprite.material.needsUpdate = true;
        keyButton.userData.textAspect = aspect;
        oldTexture?.dispose?.();
        if (Number.isFinite(keyButton.userData.baseSize) && keyButton.userData.baseSize > 0) {
            this.setKeyboardKeyButtonSize(keyButton, keyButton.userData.baseSize);
        }
    }

    _rebuildKeyLabels() {
        this._setKeyButtonLabel(this.keyboardKeyButtons.up, 'W');
        this._setKeyButtonLabel(this.keyboardKeyButtons.left, 'A');
        this._setKeyButtonLabel(this.keyboardKeyButtons.down, 'S');
        this._setKeyButtonLabel(this.keyboardKeyButtons.right, 'D');
        this._setKeyButtonLabel(this.abilityKeyLabels.fire, t('key_fire'));
        this._setKeyButtonLabel(this.abilityKeyLabels.pickupDrop, 'E');
        this._setKeyButtonLabel(this.abilityKeyLabels.speed, t('key_speed'));
        this._setKeyButtonLabel(this._furyKeyLabel, 'R');
    }

    createKeyboardKeyButton(label, renderOrderBase, widthUnits = 1) {
        const { texture, aspect } = this.createKeyTextTexture(label);
        const textMaterial = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            opacity: 1,
            depthTest: false,
            depthWrite: false
        });

        const background = widthUnits > 1
            ? this.createKeyboardKeyThreeSliceBackground(renderOrderBase)
            : this.createKeyboardKeySingleBackground(renderOrderBase);
        const textSprite = new THREE.Sprite(textMaterial);
        textSprite.renderOrder = renderOrderBase + 1;

        const root = new THREE.Group();
        root.add(background);
        root.add(textSprite);
        root.userData.background = background;
        root.userData.text = textSprite;
        root.userData.widthUnits = Math.max(widthUnits, 1);
        root.userData.textAspect = aspect;
        root.userData.baseSize = null;
        return root;
    }

    createKeyboardKeySingleBackground(renderOrder) {
        const backgroundSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: this.keyboardButtonTexture,
            transparent: true,
            opacity: 0.96,
            depthTest: false,
            depthWrite: false
        }));
        backgroundSprite.renderOrder = renderOrder;
        backgroundSprite.userData.parts = [backgroundSprite];
        return backgroundSprite;
    }

    createKeyboardKeyThreeSliceBackground(renderOrder) {
        const group = new THREE.Group();
        const parts = ['left', 'middle', 'right'].map((part, index) => {
            const texture = this.keyboardButtonTexture.clone();
            texture.needsUpdate = true;
            texture.repeat.set(1 / 3, 1);
            texture.offset.set(index / 3, 0);
            texture.wrapS = THREE.ClampToEdgeWrapping;
            texture.wrapT = THREE.ClampToEdgeWrapping;

            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture,
                transparent: true,
                opacity: 0.96,
                depthTest: false,
                depthWrite: false
            }));
            sprite.renderOrder = renderOrder;
            sprite.userData.slicePart = part;
            group.add(sprite);
            return sprite;
        });

        group.userData.parts = parts;
        return group;
    }

    createKeyTextTexture(label) {
        const text = String(label ?? '');
        const baseCanvasHeight = 128;
        const horizontalPadding = text.length > 1 ? 72 : 24;
        const trialCanvas = document.createElement('canvas');
        trialCanvas.width = 16;
        trialCanvas.height = 16;
        const trialContext = trialCanvas.getContext('2d');
        const maxFontSize = text.length > 1 ? 132 : 140;
        trialContext.font = `700 ${maxFontSize}px ${HUD_FONT_FAMILY}`;
        const measuredWidth = trialContext.measureText(text).width;
        const desiredWidth = Math.max(
            text.length > 1 ? 256 : 128,
            Math.ceil((measuredWidth + horizontalPadding) / 64) * 64
        );

        const canvas = document.createElement('canvas');
        canvas.width = desiredWidth;
        canvas.height = baseCanvasHeight;
        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);

        const maxTextWidth = canvas.width - horizontalPadding;
        let fontSize = maxFontSize;
        context.font = `700 ${fontSize}px ${HUD_FONT_FAMILY}`;
        if (text.length > 0) {
            const widthAtMax = context.measureText(text).width;
            if (widthAtMax > maxTextWidth) {
                fontSize = Math.max(64, Math.floor(fontSize * (maxTextWidth / widthAtMax)));
                context.font = `700 ${fontSize}px ${HUD_FONT_FAMILY}`;
            }
        }

        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = '#000000';
        context.fillText(text, canvas.width * 0.5, canvas.height * 0.54);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        return {
            texture,
            aspect: canvas.width / canvas.height
        };
    }

    setupEvents() {
        const forceReleaseAll = () => {
            // iOS can occasionally miss pointerup/pointercancel during gesture interruptions.
            // Always clear held controls on lifecycle/cancel signals to prevent stuck movement.
            this.reset();
            this.releaseFireButton();
            this.releasePickupDropButton();
            this.releaseSpeedButton();
        };

        const handleStart = (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) {
                return;
            }

            let handled = false;

            if (!this.active && this.isInsideBase(e.clientX, e.clientY)) {
                this.setInputMode('touch');
                this.active = true;
                this.pointerId = e.pointerId;
                this.handlePointerMove(e);
                handled = true;
            }

            if (this.fireEnabled && this.firePointerId === null && this.isInsideFireButton(e.clientX, e.clientY)) {
                this.firePointerId = e.pointerId;
                this.setFireButtonDown(true);
                handled = true;
            }

            if (
                this.pickupDropEnabled &&
                this.pickupDropPointerId === null &&
                this.isInsidePickupDropButton(e.clientX, e.clientY)
            ) {
                this.pickupDropPointerId = e.pointerId;
                this.setPickupDropButtonDown(true);
                this.pickupDropPressed = true;
                handled = true;
            }

            if (this.speedEnabled && this.speedPointerId === null && this.isInsideSpeedButton(e.clientX, e.clientY)) {
                this.speedPointerId = e.pointerId;
                this.setSpeedButtonDown(true);
                handled = true;
            }

            if (handled) {
                this.domElement.setPointerCapture?.(e.pointerId);
                e.preventDefault?.();
            }
        };

        const handleMove = (e) => {
            let handled = false;

            if (this.active && e.pointerId === this.pointerId) {
                this.handlePointerMove(e);
                handled = true;
            }

            if (this.firePointerId !== null && e.pointerId === this.firePointerId) {
                handled = true;
            }

            if (this.pickupDropPointerId !== null && e.pointerId === this.pickupDropPointerId) {
                handled = true;
            }

            if (this.speedPointerId !== null && e.pointerId === this.speedPointerId) {
                handled = true;
            }

            if (handled) {
                e.preventDefault?.();
            }
        };

        const handleEnd = (e) => {
            let handled = false;

            if (this.active && e.pointerId === this.pointerId) {
                this.reset();
                handled = true;
            }

            if (this.firePointerId !== null && e.pointerId === this.firePointerId) {
                this.releaseFireButton();
                handled = true;
            }

            if (this.pickupDropPointerId !== null && e.pointerId === this.pickupDropPointerId) {
                this.releasePickupDropButton();
                handled = true;
            }

            if (this.speedPointerId !== null && e.pointerId === this.speedPointerId) {
                this.releaseSpeedButton();
                handled = true;
            }

            if (handled) {
                e.preventDefault?.();
            }
        };

        const handleLostPointerCapture = (e) => {
            if (this.active && e.pointerId === this.pointerId) {
                this.reset();
            }

            if (this.firePointerId !== null && e.pointerId === this.firePointerId) {
                this.releaseFireButton();
            }

            if (this.pickupDropPointerId !== null && e.pointerId === this.pickupDropPointerId) {
                this.releasePickupDropButton();
            }

            if (this.speedPointerId !== null && e.pointerId === this.speedPointerId) {
                this.releaseSpeedButton();
            }
        };

        const handleTouchLifecycle = (e) => {
            // If all touches are gone, ensure every virtual control is released.
            if ((e.touches?.length ?? 0) === 0) {
                forceReleaseAll();
            }
        };

        this.domElement.addEventListener('pointerdown', handleStart, { passive: false });
        this.domElement.addEventListener('lostpointercapture', handleLostPointerCapture, { passive: true });
        window.addEventListener('pointermove', handleMove, { passive: false });
        window.addEventListener('pointerup', handleEnd, { passive: false });
        window.addEventListener('pointercancel', handleEnd, { passive: false });
        window.addEventListener('touchcancel', handleTouchLifecycle, { passive: true });
        window.addEventListener('touchend', handleTouchLifecycle, { passive: true });
        window.addEventListener('blur', forceReleaseAll, { passive: true });
        window.addEventListener('pagehide', forceReleaseAll, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                forceReleaseAll();
            }
        });
    }

    setupKeyboardMovement() {
        const movementKeys = new Map([
            ['ArrowLeft', 'left'],
            ['KeyA', 'left'],
            ['ArrowRight', 'right'],
            ['KeyD', 'right'],
            ['ArrowUp', 'up'],
            ['KeyW', 'up'],
            ['ArrowDown', 'down'],
            ['KeyS', 'down']
        ]);

        const isEditableTarget = (target) => {
            if (!target || typeof target !== 'object') {
                return false;
            }
            const tagName = typeof target.tagName === 'string' ? target.tagName.toUpperCase() : '';
            return tagName === 'INPUT' ||
                tagName === 'TEXTAREA' ||
                tagName === 'SELECT' ||
                target.isContentEditable === true;
        };

        const updateKeyState = (code, isPressed) => {
            const key = movementKeys.get(code);
            if (!key) {
                return false;
            }

            if (isPressed) {
                this.setInputMode('keyboard');
                this.setAbilityInputMode('keyboard');
            }
            this.keyboard[key] = isPressed;
            this.updateKeyboardMovementInput();
            this.updateKeyboardKeyVisuals();
            return true;
        };

        const updateSpeedKeyState = (code, isPressed) => {
            if (code !== 'ShiftLeft' && code !== 'ShiftRight') {
                return false;
            }

            if (!this.speedEnabled) {
                if (!isPressed) {
                    if (code === 'ShiftLeft') {
                        this.keyboard.speedLeft = false;
                    } else {
                        this.keyboard.speedRight = false;
                    }
                    this.setSpeedButtonDown(this.keyboard.speedLeft || this.keyboard.speedRight);
                }
                return true;
            }

            if (isPressed) {
                this.setInputMode('keyboard');
                this.setAbilityInputMode('keyboard');
            }
            if (code === 'ShiftLeft') {
                this.keyboard.speedLeft = isPressed;
            } else {
                this.keyboard.speedRight = isPressed;
            }

            this.setSpeedButtonDown(this.keyboard.speedLeft || this.keyboard.speedRight);
            return true;
        };

        window.addEventListener('keydown', (event) => {
            if (isEditableTarget(event.target)) {
                return;
            }
            const handledMovement = updateKeyState(event.code, true);
            if (handledMovement) {
                event.preventDefault?.();
                return;
            }
            if (updateSpeedKeyState(event.code, true)) {
                event.preventDefault?.();
                return;
            }

            if (event.code === 'Space' && this.fireEnabled) {
                this.setInputMode('keyboard');
                this.setAbilityInputMode('keyboard');
                this.setFireButtonDown(true);
                event.preventDefault?.();
                return;
            }

            if (event.code === 'KeyE' && !event.repeat && this.pickupDropEnabled) {
                this.setInputMode('keyboard');
                this.setAbilityInputMode('keyboard');
                this.setPickupDropButtonDown(true);
                this.pickupDropPressed = true;
                event.preventDefault?.();
                return;
            }

            if (event.code === 'KeyQ' && !event.repeat) {
                this.setInputMode('keyboard');
                this.setAbilityInputMode('keyboard');
                this.debugRebuildCarryPolygonPressed = true;
                event.preventDefault?.();
            }

            if (event.code === 'KeyR' && !event.repeat) {
                this.setInputMode('keyboard');
                this.setAbilityInputMode('keyboard');
                this.furyPressed = true;
                event.preventDefault?.();
            }
        });

        window.addEventListener('keyup', (event) => {
            if (isEditableTarget(event.target)) {
                return;
            }
            const handledMovement = updateKeyState(event.code, false);
            if (handledMovement) {
                event.preventDefault?.();
                return;
            }
            if (updateSpeedKeyState(event.code, false)) {
                event.preventDefault?.();
                return;
            }

            if (event.code === 'Space') {
                this.releaseFireButton();
                event.preventDefault?.();
                return;
            }

            if (event.code === 'KeyE') {
                this.setPickupDropButtonDown(false);
                event.preventDefault?.();
            }
        });

        window.addEventListener('blur', () => {
            this.clearAllInputState();
        });
    }

    handleResize() {
        const width = Math.max(window.innerWidth, 1);
        const height = Math.max(window.innerHeight, 1);
        const shortSide = Math.max(Math.min(width, height), 1);

        const pixelsPerUiUnit = shortSide / this.uiShortSideUnits;
        const uiViewWidth = width / pixelsPerUiUnit;
        const uiViewHeight = height / pixelsPerUiUnit;

        this.uiCamera.left = -uiViewWidth / 2;
        this.uiCamera.right = uiViewWidth / 2;
        this.uiCamera.top = uiViewHeight / 2;
        this.uiCamera.bottom = -uiViewHeight / 2;
        this.uiCamera.updateProjectionMatrix();

        this.baseFill.geometry.dispose();
        this.baseRing.geometry.dispose();

        this.baseFill.geometry = new THREE.CircleGeometry(this.baseRadius, 48);
        this.baseRing.geometry = new THREE.RingGeometry(this.baseRadius - 0.12, this.baseRadius, 64);
        this.stickSprite.scale.set(this.stickRadius * 3, this.stickRadius * 3, 1);
        const buttonDiameter = this.fireRadius * 2.35;
        const iconDiameter = this.fireRadius * 1.2;
        this.fireRoot.userData.background.scale.set(buttonDiameter, buttonDiameter, 1);
        this.fireRoot.userData.icon.scale.set(iconDiameter, iconDiameter, 1);
        this.pickupDropRoot.userData.background.scale.set(buttonDiameter, buttonDiameter, 1);
        this.pickupDropRoot.userData.icon.scale.set(iconDiameter, iconDiameter, 1);
        this.speedRoot.userData.background.scale.set(buttonDiameter, buttonDiameter, 1);
        this.speedRoot.userData.icon.scale.set(iconDiameter, iconDiameter, 1);

        // Keep the joystick in a fixed UI-space corner, independent of pixel resolution.
        this.root.position.set(
            this.uiCamera.left + this.paddingLeft + this.size / 2,
            this.uiCamera.bottom + this.paddingBottom + this.size / 2,
            0
        );

        const clusterCenterX = this.uiCamera.right - this.firePaddingRight - (this.fireRadius * 1.8);
        const isPortrait = width < height;
        const furyBarH = this.fireRadius * 0.8;
        const furyBarGap = this.fireRadius * 0.4;
        const clusterBaseY = this.uiCamera.bottom + this.firePaddingBottom + (this.fireRadius * 1.05);
        const buttonSpacingX = this.fireRadius * 2.25;
        const buttonSpacingY = this.fireRadius * 1.95;

        this.fireRoot.position.set(
            clusterCenterX - (buttonSpacingX * 0.5),
            clusterBaseY,
            0
        );
        this.pickupDropRoot.position.set(
            clusterCenterX,
            clusterBaseY + buttonSpacingY,
            0
        );
        this.speedRoot.position.set(
            clusterCenterX + (buttonSpacingX * 0.5),
            clusterBaseY,
            0
        );

        this.updateStickVisual();
        this.updateFireVisual();
        this.updatePickupDropVisual();
        this.updateSpeedVisual();
        this.layoutKeyboardControls();
        this.updatePortraitFuryBarAnchor();
        this.updateKeyboardKeyVisuals();
        this.updateInputModeVisuals();
    }

    updatePortraitFuryBarAnchor() {
        const isPortrait = window.innerWidth < window.innerHeight;
        if (!isPortrait) {
            this._furyBarLeft = undefined;
            this._furyBarRight = undefined;
            this._furyBarBottom = undefined;
            this._furyBarTop = undefined;
            return;
        }

        const furyBarGap = this.fireRadius * 0.4;
        const furyBarH = this.fireRadius * 0.8;
        const leftButtonX = this.fireRoot.position.x;
        const rightButtonX = this.speedRoot.position.x;
        const topButtonY = this.pickupDropRoot.position.y + this.pickupDropRadius;

        // Anchor from the final laid-out button positions so portrait gap stays identical
        // across touch/keyboard ability modes and across desktop/mobile viewport profiles.
        this._furyBarLeft = leftButtonX - this.fireRadius;
        this._furyBarRight = rightButtonX + this.fireRadius;
        this._furyBarBottom = topButtonY + furyBarGap;
        this._furyBarTop = this._furyBarBottom + furyBarH;
    }

    layoutKeyboardControls() {
        if (!this.keyboardRoot) {
            return;
        }

        const keySize = 3;
        const keyGap = -0.4;
        const keyStep = keySize + keyGap;
        const keyOriginX = this.uiCamera.left + 5;
        const keyOriginY = this.uiCamera.bottom + 3.2;

        for (const keyButton of Object.values(this.keyboardKeyButtons)) {
            this.setKeyboardKeyButtonSize(keyButton, keySize);
        }

        this.keyboardKeyButtons.left.position.set(keyOriginX - keyStep, keyOriginY, 0);
        this.keyboardKeyButtons.down.position.set(keyOriginX, keyOriginY, 0);
        this.keyboardKeyButtons.right.position.set(keyOriginX + keyStep, keyOriginY, 0);
        this.keyboardKeyButtons.up.position.set(keyOriginX, keyOriginY + keyStep, 0);

        if (this.abilityInputMode !== 'keyboard') {
            return;
        }

        const abilityDiameter = this.fireRadius * 2.35;
        const abilityIconDiameter = this.fireRadius * 1.2;
        const clusterCenterX = this.uiCamera.right - this.firePaddingRight - (this.fireRadius * 1.8);
        const isPortraitKb = window.innerWidth < window.innerHeight;
        const clusterBaseY = this.uiCamera.bottom + this.firePaddingBottom + (this.fireRadius * 1.05);
        const buttonSpacingX = this.fireRadius * 2.25;
        const buttonSpacingY = this.fireRadius * 1.95;

        this.fireRoot.userData.background.scale.set(abilityDiameter, abilityDiameter, 1);
        this.fireRoot.userData.icon.scale.set(abilityIconDiameter, abilityIconDiameter, 1);
        this.pickupDropRoot.userData.background.scale.set(abilityDiameter, abilityDiameter, 1);
        this.pickupDropRoot.userData.icon.scale.set(abilityIconDiameter, abilityIconDiameter, 1);
        this.speedRoot.userData.background.scale.set(abilityDiameter, abilityDiameter, 1);
        this.speedRoot.userData.icon.scale.set(abilityIconDiameter, abilityIconDiameter, 1);

        this.fireRoot.position.set(clusterCenterX - (buttonSpacingX * 0.5), clusterBaseY + 0.7, 0);
        this.pickupDropRoot.position.set(clusterCenterX, clusterBaseY + buttonSpacingY + 0.95, 0);
        this.speedRoot.position.set(clusterCenterX + (buttonSpacingX * 0.5), clusterBaseY + 0.7, 0);

        const labelSize = 1.75;
        const labelOffsetY = -abilityDiameter * 0.38;
        this.setKeyboardKeyButtonSize(this.abilityKeyLabels.fire, labelSize);
        this.setKeyboardKeyButtonSize(this.abilityKeyLabels.pickupDrop, labelSize);
        this.setKeyboardKeyButtonSize(this.abilityKeyLabels.speed, labelSize);
        this.abilityKeyLabels.fire.position.set(this.fireRoot.position.x, this.fireRoot.position.y + labelOffsetY, 0);
        this.abilityKeyLabels.pickupDrop.position.set(this.pickupDropRoot.position.x, this.pickupDropRoot.position.y + labelOffsetY, 0);
        this.abilityKeyLabels.speed.position.set(this.speedRoot.position.x, this.speedRoot.position.y + labelOffsetY, 0);
    }

    setKeyboardKeyButtonSize(button, baseSize) {
        if (!button) {
            return;
        }

        button.userData.baseSize = baseSize;
        const widthUnits = button.userData.widthUnits || 1;
        const totalWidth = baseSize * widthUnits;
        const backgroundParts = button.userData.background.userData.parts;
        if (backgroundParts?.length === 3) {
            const capWidth = baseSize / 3;
            const middleWidth = Math.max(totalWidth - (capWidth * 2), capWidth);
            backgroundParts[0].scale.set(capWidth, baseSize, 1);
            backgroundParts[0].position.x = (middleWidth * -0.5) - (capWidth * 0.5);
            backgroundParts[1].scale.set(middleWidth, baseSize, 1);
            backgroundParts[1].position.x = 0;
            backgroundParts[2].scale.set(capWidth, baseSize, 1);
            backgroundParts[2].position.x = (middleWidth * 0.5) + (capWidth * 0.5);
        } else {
            button.userData.background.scale.set(totalWidth, baseSize, 1);
        }
        const textAspect = button.userData.textAspect || 1;
        const textWidth = widthUnits > 1 ? totalWidth * 0.78 : baseSize * 0.62;
        button.userData.text.scale.set(textWidth, textWidth / textAspect, 1);
    }

    setInputMode(mode) {
        const nextMode = mode === 'keyboard' ? 'keyboard' : 'touch';
        if (this.inputMode === nextMode) {
            return;
        }

        this.inputMode = nextMode;
        this.handleResize();
    }

    setAbilityInputMode(mode) {
        const nextMode = mode === 'keyboard' ? 'keyboard' : 'touch';
        if (this.abilityInputMode === nextMode) {
            return;
        }

        this.abilityInputMode = nextMode;
        this.handleResize();
    }

    updateInputModeVisuals() {
        const isKeyboardMode = this.inputMode === 'keyboard';
        const isAbilityKeyboardMode = this.abilityInputMode === 'keyboard';
        this.root.visible = !isKeyboardMode;
        this.keyboardRoot.visible = isKeyboardMode;
        for (const label of Object.values(this.abilityKeyLabels)) {
            label.visible = isAbilityKeyboardMode;
        }
        if (!isAbilityKeyboardMode) {
            this._furyKeyLabel.visible = false;
        }
    }

    updateKeyboardKeyVisuals() {
        const hint = this.dragDirectionHint;
        const leftEnabled  = hint === null || hint < 0;
        const rightEnabled = hint === null || hint > 0;
        const vertEnabled  = hint === null;
        this.updateKeyboardKeyButtonVisual(this.keyboardKeyButtons.left,  this.keyboard.left,  leftEnabled);
        this.updateKeyboardKeyButtonVisual(this.keyboardKeyButtons.right, this.keyboard.right, rightEnabled);
        this.updateKeyboardKeyButtonVisual(this.keyboardKeyButtons.up,    this.keyboard.up,    vertEnabled);
        this.updateKeyboardKeyButtonVisual(this.keyboardKeyButtons.down,  this.keyboard.down,  vertEnabled);
    }

    updateKeyboardKeyButtonVisual(button, isDown, isEnabled = true) {
        if (!button) {
            return;
        }

        const background = button.userData.background;
        const text = button.userData.text;
        const backgroundParts = background.userData.parts || [background];
        if (isDown) {
            button.scale.setScalar(0.94);
            for (const part of backgroundParts) {
                part.material.opacity = 1;
            }
            text.material.opacity = 1;
        } else if (!isEnabled) {
            button.scale.setScalar(1);
            for (const part of backgroundParts) {
                part.material.opacity = 0.42;
            }
            text.material.opacity = 0.5;
        } else {
            button.scale.setScalar(1);
            for (const part of backgroundParts) {
                part.material.opacity = 0.96;
            }
            text.material.opacity = 1;
        }
    }

    setAbilityButtonVisual(root, { isDown = false, isEnabled = true } = {}) {
        if (!root?.userData) {
            return;
        }

        const background = root.userData.background;
        const icon = root.userData.icon;
        if (!background || !icon) {
            return;
        }

        if (isDown && isEnabled) {
            root.scale.setScalar(0.94);
            background.material.opacity = 1;
            icon.material.opacity = 1;
            return;
        }

        root.scale.setScalar(1);
        if (!isEnabled) {
            background.material.opacity = 0.26;
            icon.material.opacity = 0.3;
            return;
        }

        background.material.opacity = 0.95;
        icon.material.opacity = 1;
    }

    screenToUi(clientX, clientY) {
        const rect = this.domElement.getBoundingClientRect();
        const xNdc = ((clientX - rect.left) / rect.width) * 2 - 1;
        const yNdc = -(((clientY - rect.top) / rect.height) * 2 - 1);

        return new THREE.Vector3(
            THREE.MathUtils.lerp(this.uiCamera.left, this.uiCamera.right, (xNdc + 1) * 0.5),
            THREE.MathUtils.lerp(this.uiCamera.bottom, this.uiCamera.top, (yNdc + 1) * 0.5),
            0
        );
    }

    isInsideBase(clientX, clientY) {
        const point = this.screenToUi(clientX, clientY);
        const dx = point.x - this.root.position.x;
        const dy = point.y - this.root.position.y;
        return Math.hypot(dx, dy) <= this.baseRadius;
    }

    isInsideFireButton(clientX, clientY) {
        const point = this.screenToUi(clientX, clientY);
        const dx = point.x - this.fireRoot.position.x;
        const dy = point.y - this.fireRoot.position.y;
        return Math.hypot(dx, dy) <= this.fireRadius;
    }

    isInsidePickupDropButton(clientX, clientY) {
        const point = this.screenToUi(clientX, clientY);
        const dx = point.x - this.pickupDropRoot.position.x;
        const dy = point.y - this.pickupDropRoot.position.y;
        return Math.hypot(dx, dy) <= this.pickupDropRadius;
    }

    isInsideSpeedButton(clientX, clientY) {
        const point = this.screenToUi(clientX, clientY);
        const dx = point.x - this.speedRoot.position.x;
        const dy = point.y - this.speedRoot.position.y;
        return Math.hypot(dx, dy) <= this.speedRadius;
    }

    handlePointerMove(pointerEvent) {
        const point = this.screenToUi(pointerEvent.clientX, pointerEvent.clientY);
        const dx = point.x - this.root.position.x;
        const dy = point.y - this.root.position.y;

        const distance = Math.hypot(dx, dy);
        const cappedDistance = Math.min(distance, this.maxDistance);
        const angle = Math.atan2(dy, dx);

        this.stickOffsetX = Math.cos(angle) * cappedDistance;
        this.stickOffsetY = Math.sin(angle) * cappedDistance;

        let nx = this.stickOffsetX / this.maxDistance;
        let ny = this.stickOffsetY / this.maxDistance;

        if (Math.abs(nx) < this.deadzone) {
            nx = 0;
        }
        if (Math.abs(ny) < this.deadzone) {
            ny = 0;
        }

        this.setInputState(nx, ny);
        this.updateStickVisual();
    }

    updateKeyboardMovementInput() {
        let x = 0;
        let y = 0;

        if (this.keyboard.left) x -= 1;
        if (this.keyboard.right) x += 1;
        if (this.keyboard.up) y += 1;
        if (this.keyboard.down) y -= 1;

        const length = Math.hypot(x, y);
        if (length > 1) {
            x /= length;
            y /= length;
        }

        this.targetInput.x = x;
        this.targetInput.y = y;

        // Touch joystick remains the authoritative movement source while it is active.
        if (!this.active) {
            this.applyKeyboardInput();
        }
    }

    applyKeyboardInput() {
        const nextX = THREE.MathUtils.lerp(this.input.x, this.targetInput.x, this.keyboardSmoothing);
        const nextY = THREE.MathUtils.lerp(this.input.y, this.targetInput.y, this.keyboardSmoothing);
        this.setInputState(nextX, nextY);
        this.stickOffsetX = this.input.x * this.maxDistance;
        this.stickOffsetY = this.input.y * this.maxDistance;
        this.updateStickVisual();
    }

    setInputState(x, y) {
        const nextX = Math.abs(x) < 0.0001 ? 0 : x;
        const nextY = Math.abs(y) < 0.0001 ? 0 : y;

        if (this.input.x === nextX && this.input.y === nextY) {
            return;
        }

        this.input.x = nextX;
        this.input.y = nextY;
//        console.debug('[Joystick] input', this.input.x, this.input.y);
    }

    get x() {
        return this.input.x;
    }

    get y() {
        return this.input.y;
    }

    updateStickVisual() {
        this.stickGroup.position.set(this.stickOffsetX, this.stickOffsetY, 0);
    }

    setFireButtonDown(isDown) {
        if (this.fireButtonDown === isDown) {
            return;
        }

        this.fireButtonDown = isDown;
        this.updateFireVisual();
    }

    updateFireVisual() {
        this.updateKeyboardKeyButtonVisual(this.abilityKeyLabels.fire, this.fireButtonDown, this.fireEnabled);
        this.setAbilityButtonVisual(this.fireRoot, {
            isDown: this.fireButtonDown,
            isEnabled: this.fireEnabled
        });
    }

    setFireEnabled(isEnabled) {
        if (this.fireEnabled === isEnabled) {
            return;
        }

        this.fireEnabled = isEnabled;
        if (!isEnabled) {
            this.firePointerId = null;
            this.fireButtonDown = false;
        }
        this.updateFireVisual();
    }

    releaseFireButton() {
        this.firePointerId = null;
        this.setFireButtonDown(false);
    }

    setPickupDropButtonDown(isDown) {
        if (this.pickupDropButtonDown === isDown) {
            return;
        }

        this.pickupDropButtonDown = isDown;
        this.updatePickupDropVisual();
    }

    updatePickupDropVisual() {
        this.updateKeyboardKeyButtonVisual(
            this.abilityKeyLabels.pickupDrop,
            this.pickupDropButtonDown,
            this.pickupDropEnabled
        );

        const background = this.pickupDropRoot.userData.background;
        const icon = this.pickupDropRoot.userData.icon;
        const iconMaterial = this.pickupDropRoot.userData.iconMaterial;
        iconMaterial.map = this.pickupDropMode === 'drag'
            ? this.abilityGrabDownIconTexture
            : this.abilityGrabIconTexture;
        iconMaterial.needsUpdate = true;
        this.setAbilityButtonVisual(this.pickupDropRoot, {
            isDown: this.pickupDropButtonDown,
            isEnabled: this.pickupDropEnabled
        });
    }

    setPickupDropMode(mode) {
        const nextMode = mode === 'drag' ? 'drag' : 'lift';
        if (this.pickupDropMode === nextMode) {
            return;
        }

        this.pickupDropMode = nextMode;
        this.updatePickupDropVisual();
    }

    setPickupDropEnabled(isEnabled) {
        if (this.pickupDropEnabled === isEnabled) {
            return;
        }

        this.pickupDropEnabled = isEnabled;
        if (!isEnabled) {
            this.pickupDropPressed = false;
            this.pickupDropPointerId = null;
            this.pickupDropButtonDown = false;
        }
        this.updatePickupDropVisual();
    }

    releasePickupDropButton() {
        this.pickupDropPointerId = null;
        this.setPickupDropButtonDown(false);
    }

    setSpeedButtonDown(isDown) {
        if (this.speedButtonDown === isDown) {
            return;
        }

        this.speedButtonDown = isDown;
        this.updateSpeedVisual();
    }

    updateSpeedVisual() {
        this.updateKeyboardKeyButtonVisual(this.abilityKeyLabels.speed, this.speedButtonDown, this.speedEnabled);
        this.setAbilityButtonVisual(this.speedRoot, {
            isDown: this.speedButtonDown,
            isEnabled: this.speedEnabled
        });
    }

    setSpeedEnabled(isEnabled) {
        if (this.speedEnabled === isEnabled) {
            return;
        }

        this.speedEnabled = isEnabled;
        if (!isEnabled) {
            this.keyboard.speedLeft = false;
            this.keyboard.speedRight = false;
            this.speedPointerId = null;
            this.speedButtonDown = false;
        }
        this.updateSpeedVisual();
    }

    releaseSpeedButton() {
        this.speedPointerId = null;
        this.setSpeedButtonDown(false);
    }

    setUiVisible(isVisible) {
        this.uiVisible = isVisible !== false;
        if (!this.uiVisible) {
            this.clearAllInputState();
        }
    }

    setGameplayInputSuppressed(isSuppressed) {
        const next = isSuppressed === true;
        if (this.gameplayInputSuppressed === next) {
            return;
        }
        this.gameplayInputSuppressed = next;
        if (next) {
            this.clearAllInputState();
        }
    }

    consumePickupDropPressed() {
        if (!this.pickupDropEnabled || !this.pickupDropPressed) {
            return false;
        }

        this.pickupDropPressed = false;
        return true;
    }

    consumeDebugRebuildCarryPolygonPressed() {
        if (!this.debugRebuildCarryPolygonPressed) {
            return false;
        }

        this.debugRebuildCarryPolygonPressed = false;
        return true;
    }

    // One-shot read of the Dino Fury trigger (KeyR). Returns true once per press.
    consumeFuryPressed() {
        if (!this.furyPressed) {
            return false;
        }

        this.furyPressed = false;
        return true;
    }

    consumeUiAcceptPressed() {
        if (!this.uiAcceptPressed) return false;
        this.uiAcceptPressed = false;
        return true;
    }

    consumeUiBackPressed() {
        if (!this.uiBackPressed) return false;
        this.uiBackPressed = false;
        return true;
    }

    consumeUiLeftPressed() {
        if (!this.uiLeftPressed) return false;
        this.uiLeftPressed = false;
        return true;
    }

    consumeUiRightPressed() {
        if (!this.uiRightPressed) return false;
        this.uiRightPressed = false;
        return true;
    }

    consumeUiUpPressed() {
        if (!this.uiUpPressed) return false;
        this.uiUpPressed = false;
        return true;
    }

    consumeUiDownPressed() {
        if (!this.uiDownPressed) return false;
        this.uiDownPressed = false;
        return true;
    }

    consumeMenuSettingsPressed() {
        if (!this.menuSettingsPressed) return false;
        this.menuSettingsPressed = false;
        return true;
    }

    consumeMenuSkinsPressed() {
        if (!this.menuSkinsPressed) return false;
        this.menuSkinsPressed = false;
        return true;
    }

    // --- Fury bar API (called by main.js instead of FuryBar) -------------------

    setFuryBarVisible(_visible) {
        // Intentionally a no-op. FuryBar.js owns the single runtime Fury/Rage bar instance.
    }

    updateFuryBar(_progress, _inputMode, _ready) {
        // Intentionally a no-op. Kept only for compatibility with older call sites.
    }

    updateFuryKeyLabel(ready, furyBarBounds) {
        const isAbilityKeyboardMode = this.abilityInputMode === 'keyboard';
        this._furyKeyLabelReady = Boolean(ready);
        const show = isAbilityKeyboardMode && this._furyKeyLabelReady && !!furyBarBounds;
        this._furyKeyLabel.visible = show;
        if (!show || !furyBarBounds) return;

        // FuryBar.bounds is in FuryBar pixel space (origin bottom-left, range 0..screenW/H).
        // Convert to Joystick UI camera world units (origin center).
        const screenW = Math.max(window.innerWidth, 1);
        const screenH = Math.max(window.innerHeight, 1);
        const uiW = this.uiCamera.right - this.uiCamera.left;
        const uiH = this.uiCamera.top - this.uiCamera.bottom;
        const toUiX = (px) => this.uiCamera.left + (px / screenW) * uiW;
        const toUiY = (py) => this.uiCamera.bottom + (py / screenH) * uiH;

        const barLeft = toUiX(furyBarBounds.left);
        const barRight = toUiX(furyBarBounds.right);
        const barBot  = toUiY(furyBarBounds.bottom);

        const labelSize = 1.75;
        this.setKeyboardKeyButtonSize(this._furyKeyLabel, labelSize);

        // Icon occupies roughly the leftmost 20% of the bar; center at ~13%.
        const barBottom = toUiY(furyBarBounds.bottom);
        const iconCx = barLeft + (barRight - barLeft) * 0.14;
        const labelY = barBottom + labelSize * 0.3;
        this._furyKeyLabel.position.set(iconCx, labelY, 0);
    }

    get portraitFuryBarBounds() {
        if (this._furyBarLeft === undefined) {
            return null;
        }
        return {
            left: this._furyBarLeft,
            right: this._furyBarRight,
            bottom: this._furyBarBottom,
            top: this._furyBarTop
        };
    }

    get portraitFuryBarScreenBounds() {
        const bounds = this.portraitFuryBarBounds;
        if (!bounds) {
            return null;
        }
        const visualViewport = window.visualViewport;
        const width = Math.max(
            Math.round(visualViewport?.width || 0) || 0,
            Math.round(window.innerWidth || 0) || 0,
            1
        );
        const height = Math.max(
            Math.round(visualViewport?.height || 0) || 0,
            Math.round(window.innerHeight || 0) || 0,
            1
        );
        const uiWidth = this.uiCamera.right - this.uiCamera.left;
        const uiHeight = this.uiCamera.top - this.uiCamera.bottom;
        if (!(uiWidth > 0) || !(uiHeight > 0)) {
            return null;
        }
        const toScreenX = (x) => ((x - this.uiCamera.left) / uiWidth) * width;
        const toScreenY = (y) => ((y - this.uiCamera.bottom) / uiHeight) * height;
        return {
            left: toScreenX(bounds.left),
            right: toScreenX(bounds.right),
            bottom: toScreenY(bounds.bottom),
            top: toScreenY(bounds.top)
        };
    }

    reset() {
        this.active = false;
        this.pointerId = null;
        this.applyKeyboardInput();
    }

    clearAllInputState() {
        this.reset();
        this.keyboard.left = false;
        this.keyboard.right = false;
        this.keyboard.up = false;
        this.keyboard.down = false;
        this.keyboard.speedLeft = false;
        this.keyboard.speedRight = false;
        this.targetInput.x = 0;
        this.targetInput.y = 0;
        this.updateKeyboardMovementInput();
        this.updateKeyboardKeyVisuals();
        this.releaseFireButton();
        this.setPickupDropButtonDown(false);
        this.setSpeedButtonDown(false);
        this.furyPressed = false;
        this.gamepad.active = false;
        this.gamepad.moveX = 0;
        this.gamepad.moveY = 0;
        this.gamepad.fireDown = false;
        this.gamepad.pickupDropDown = false;
        this.gamepad.speedDown = false;
        this.gamepad.furyDown = false;
        this.gamepad.prevActive = false;
        this.gamepad.prevFireDown = false;
        this.gamepad.prevPickupDropDown = false;
        this.gamepad.prevSpeedDown = false;
        this.gamepad.prevFuryDown = false;
        this.gamepad.uiAcceptDown = false;
        this.gamepad.uiBackDown = false;
        this.gamepad.uiLeftDown = false;
        this.gamepad.uiRightDown = false;
        this.gamepad.uiUpDown = false;
        this.gamepad.uiDownDown = false;
        this.gamepad.menuSettingsDown = false;
        this.gamepad.menuSkinsDown = false;
        this.gamepad.prevUiAcceptDown = false;
        this.gamepad.prevUiBackDown = false;
        this.gamepad.prevUiLeftDown = false;
        this.gamepad.prevUiRightDown = false;
        this.gamepad.prevUiUpDown = false;
        this.gamepad.prevUiDownDown = false;
        this.gamepad.prevMenuSettingsDown = false;
        this.gamepad.prevMenuSkinsDown = false;
        this.uiAcceptPressed = false;
        this.uiBackPressed = false;
        this.uiLeftPressed = false;
        this.uiRightPressed = false;
        this.uiUpPressed = false;
        this.uiDownPressed = false;
        this.menuSettingsPressed = false;
        this.menuSkinsPressed = false;
        this.setInputState(0, 0);
        this.updateStickVisual();
    }

    render(renderer) {
        if (!this.uiVisible) {
            return;
        }

        renderer.clearDepth();
        renderer.render(this.uiScene, this.uiCamera);
    }

    renderFuryKeyLabel(renderer) {
        if (!this.uiVisible || !this._furyKeyLabel?.visible) return;
        renderer.clearDepth();
        renderer.render(this._furyKeyLabelScene, this.uiCamera);
    }
}
