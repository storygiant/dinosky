import { LevelObject } from './LevelObject.js';

const BOB_SPEED = 1.4;
const BOB_AMPLITUDE = 0.3;
const SPIN_SPEED = 1.2;

export class CollectibleObject extends LevelObject {
    constructor(options) {
        super(options);

        this.pickupRadius = Number.isFinite(this.config.pickupRadius) ? this.config.pickupRadius : 4;
        this.amount = Number.isFinite(this.config.amount) ? this.config.amount : 1;

        this._bobTime = Math.random() * Math.PI * 2;
        this._baseY = null;
        this._collected = false;

        // Collectibles have no collision rectangle — suppress the base class warning.
        this.missingConfiguredCollisionRectWarned = true;

        // Callback set by the game after creation: collectibleObject.onCollect = (type, amount) => {...}
        this.onCollect = null;
    }

    async load() {
        await super.load();
        this._baseY = this.container.position.y;
    }

    setWorldPosition(x, y, z) {
        super.setWorldPosition(x, y, z);
        this._baseY = y;
    }

    update(delta, _level, player) {
        if (this._collected || this.markedForRemoval) return;
        if (!this.loaded) return;
        if (!Number.isFinite(delta) || delta <= 0) return;

        this._bobTime += delta * BOB_SPEED;
        const bobY = (this._baseY ?? this.container.position.y) + Math.sin(this._bobTime) * BOB_AMPLITUDE;
        this.container.position.y = bobY;

        if (this.sceneObject) {
            this.sceneObject.rotation.y += SPIN_SPEED * delta;
        }

        if (player?.position) {
            const dx = player.position.x - this.container.position.x;
            const dy = player.position.y - this.container.position.y;
            if (dx * dx + dy * dy <= this.pickupRadius * this.pickupRadius) {
                this._collect();
            }
        }
    }

    _collect() {
        if (this._collected) return;
        this._collected = true;
        this.container.visible = false;
        this.markedForRemoval = true;

        if (typeof this.onCollect === 'function') {
            this.onCollect(this.type, this.amount, this.container.position.clone());
        }
    }
}
