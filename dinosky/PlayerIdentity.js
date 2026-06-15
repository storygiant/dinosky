import { getPlatformPlayerName, loadLocalJson, saveJsonWithPlatformMirrors, saveLocalJson } from './PlatformBridge.js';

const STORAGE_KEY = 'dinoPlayerIdentity';

const ADJECTIVES = [
    'Swift', 'Bold', 'Brave', 'Calm', 'Dark', 'Epic', 'Fast', 'Fierce',
    'Grim', 'Iron', 'Jade', 'Keen', 'Lone', 'Mighty', 'Noble', 'Proud',
    'Quick', 'Rapid', 'Sharp', 'Sly', 'Storm', 'True', 'Wild', 'Wise'
];

const ANIMALS = [
    'Bear', 'Cobra', 'Crane', 'Dino', 'Eagle', 'Falcon', 'Fox', 'Hawk',
    'Jaguar', 'Lion', 'Lynx', 'Panda', 'Panther', 'Phoenix', 'Raven',
    'Shark', 'Tiger', 'Viper', 'Wolf', 'Wolverine'
];

function pickFromSeed(arr, seed) {
    return arr[Math.abs(seed) % arr.length];
}

function generateName(seed) {
    const adj = pickFromSeed(ADJECTIVES, seed);
    const animal = pickFromSeed(ANIMALS, Math.floor(seed / ADJECTIVES.length));
    return `${adj}${animal}`;
}

function generateId() {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

let _identity = null;

function persistIdentity(identity) {
    saveLocalJson(STORAGE_KEY, identity);
    void saveJsonWithPlatformMirrors(STORAGE_KEY, identity);
}

export function getPlayerIdentity() {
    if (_identity) return _identity;

    const parsed = loadLocalJson(STORAGE_KEY, null);
    if (parsed?.id && parsed?.name) {
        _identity = parsed;
        return _identity;
    }

    const seed = Math.floor(Math.random() * ADJECTIVES.length * ANIMALS.length);
    _identity = { id: generateId(), name: generateName(seed) };
    persistIdentity(_identity);
    return _identity;
}

export async function hydratePlayerIdentityFromPlatform() {
    const identity = getPlayerIdentity();
    const platformName = await getPlatformPlayerName();
    if (platformName && identity.name !== platformName) {
        _identity = { ...identity, name: platformName };
        persistIdentity(_identity);
    }
    return _identity;
}
