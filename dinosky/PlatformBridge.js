function canUseLocalStorage() {
    try {
        return typeof localStorage !== 'undefined';
    } catch {
        return false;
    }
}

export function loadLocalJson(key, fallback = null) {
    if (!canUseLocalStorage()) {
        return fallback;
    }
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

export function saveLocalJson(key, value) {
    if (!canUseLocalStorage()) {
        return false;
    }
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

function canUsePokiAccountsApi() {
    try {
        return typeof PokiSDK !== 'undefined'
            && PokiSDK
            && typeof PokiSDK.getUser === 'function';
    } catch {
        return false;
    }
}

export async function getSteamPlayerName() {
    try {
        if (!window?.steamBridge?.isAvailable || !window?.steamBridge?.getPlayerName) {
            return null;
        }
        const available = await window.steamBridge.isAvailable();
        if (!available) {
            return null;
        }
        const playerName = await window.steamBridge.getPlayerName();
        return typeof playerName === 'string' && playerName.trim() ? playerName.trim() : null;
    } catch {
        return null;
    }
}

export async function getPokiUser() {
    try {
        if (!canUsePokiAccountsApi()) {
            return null;
        }
        const user = await PokiSDK.getUser();
        return user && typeof user === 'object' ? user : null;
    } catch {
        return null;
    }
}

export async function getPokiPlayerName() {
    try {
        const user = await getPokiUser();
        const username = user?.username;
        return typeof username === 'string' && username.trim() ? username.trim() : null;
    } catch {
        return null;
    }
}

export async function loginPokiUser() {
    try {
        if (typeof PokiSDK === 'undefined' || !PokiSDK || typeof PokiSDK.login !== 'function') {
            return false;
        }
        await PokiSDK.login();
        return true;
    } catch {
        return false;
    }
}

export async function getPlatformPlayerName() {
    const steamName = await getSteamPlayerName();
    if (steamName) {
        return steamName;
    }

    const pokiName = await getPokiPlayerName();
    if (pokiName) {
        return pokiName;
    }

    return null;
}

export async function loadSteamCloudJson(key, fallback = null) {
    try {
        if (!window?.steamBridge?.isAvailable || !window?.steamBridge?.readCloudFile) {
            return fallback;
        }
        const available = await window.steamBridge.isAvailable();
        if (!available) {
            return fallback;
        }
        const raw = await window.steamBridge.readCloudFile(`${key}.json`);
        if (!raw) {
            return fallback;
        }
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export async function saveSteamCloudJson(key, value) {
    try {
        if (!window?.steamBridge?.isAvailable || !window?.steamBridge?.writeCloudFile) {
            return false;
        }
        const available = await window.steamBridge.isAvailable();
        if (!available) {
            return false;
        }
        return await window.steamBridge.writeCloudFile(`${key}.json`, JSON.stringify(value));
    } catch {
        return false;
    }
}

export async function saveJsonWithPlatformMirrors(key, value) {
    // Poki cloud save is automatic for logged-in users because the SDK syncs
    // localStorage/IndexedDB transparently. We keep localStorage as the source
    // of truth for the browser build, then mirror explicitly only for Steam.
    saveLocalJson(key, value);
    await saveSteamCloudJson(key, value);
}

export async function syncStorageKeysFromCloud(keys = []) {
    // Poki injects cloud-synced localStorage before the game starts, so there is
    // no explicit Poki cloud pull here. Steam needs an explicit mirror read.
    for (const key of keys) {
        const cloudValue = await loadSteamCloudJson(key, undefined);
        if (cloudValue !== undefined) {
            saveLocalJson(key, cloudValue);
        }
    }
}
