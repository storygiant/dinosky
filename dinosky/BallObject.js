import { LevelObject, LEVEL_OBJECT_STATES } from './LevelObject.js';

export class BallObject extends LevelObject {
    constructor(options) {
        super(options);
        this.gravityEnabled   = true;
        this.pickupable       = this.config.pickupable ?? true;
        this.draggable        = this.config.draggable  ?? true;
    }

    async load() {
        await super.load();
        this.gravityEnabled = true;
        this.state = LEVEL_OBJECT_STATES.FALLING;
        return this;
    }

    update(delta, level) {
        if (!this.loaded) return;
        if (this.markedForRemoval || this.isDestroyed) return;
        if (this.state === LEVEL_OBJECT_STATES.CARRIED || this.carriedBy) return;
        super.update(delta, level);
    }
}
