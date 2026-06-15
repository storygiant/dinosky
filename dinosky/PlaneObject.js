import { LevelObject, LEVEL_OBJECT_STATES } from './LevelObject.js';
import { FlyingAIController } from './FlyingAIController.js';

export class PlaneObject extends LevelObject {
    constructor(options) {
        super(options);

        this.pickupable = false;
        this.draggable  = false;

        // Allow per-instance zoneId from Tiled object properties to override the flyAI block.
        if (options.rawProperties?.zoneId) {
            this.config = {
                ...this.config,
                flyAI: { ...this.config.flyAI, zoneId: options.rawProperties.zoneId }
            };
        }

        this.flyingAI = new FlyingAIController(this);

        this.alwaysUpdate = true;
        this.propellerNode    = null;
        const flyAI = this.config.flyAI || {};
        this.propellerSpeed   = Number.isFinite(flyAI.propellerSpeed ?? this.config.propellerSpeed)
            ? (flyAI.propellerSpeed ?? this.config.propellerSpeed)
            : 20;
        this.propellerAxis    = ['x', 'y', 'z'].includes(flyAI.propellerAxis ?? this.config.propellerAxis)
            ? (flyAI.propellerAxis ?? this.config.propellerAxis)
            : 'z';
    }

    async load() {
        await super.load();

        const flyAICfg = this.config.flyAI || {};
        this.propellerNode = this._findNamedNode(flyAICfg.propellerNodeName ?? this.config.propellerNodeName ?? 'propeller');
        this.gravityEnabled = false;
        this.state = LEVEL_OBJECT_STATES.IDLE;
        return this;
    }

    _findNamedNode(name) {
        if (!this.sceneObject || !name) return null;
        let found = null;
        this.sceneObject.traverse((child) => {
            if (!found && child?.isObject3D && child.name === name) found = child;
        });
        return found;
    }

    _updatePropeller(delta) {
        if (this.health <= 0 || !this.propellerNode) return;
        this.propellerNode.rotation[this.propellerAxis] += this.propellerSpeed * delta;
    }

    destroy() {
        if (this.isDestroyed) return;
        super.destroy();
    }

    update(delta, level, dynoTarget = null) {
        if (!this.loaded) return;

        this._updatePropeller(delta);
        this.updateHealthBarVisual?.();
        this.updateDestructionSequence?.(delta);

        if (this.markedForRemoval || this.isDestroyed) return;

        this.state = LEVEL_OBJECT_STATES.IDLE;
        this.gravityEnabled = false;
        this.flyingAI.update(delta, level, dynoTarget);
    }
}
