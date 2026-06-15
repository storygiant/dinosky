import { GLTFLoader } from './three/GLTFLoader.js';
import { DRACOLoader } from './three/DRACOLoader.js';

let sharedDracoLoader = null;

function getDracoLoader() {
    if (!sharedDracoLoader) {
        sharedDracoLoader = new DRACOLoader();
        sharedDracoLoader.setDecoderPath('./three/draco/');
    }
    return sharedDracoLoader;
}

export function createGLTFLoader(loadingManager) {
    const loader = new GLTFLoader(loadingManager);
    loader.setDRACOLoader(getDracoLoader());
    return loader;
}
