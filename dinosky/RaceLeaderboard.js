import { getPlayerIdentity } from './PlayerIdentity.js';

const POKI_GAME_ID = '243cb571-38f5-4381-9be2-9e4febbc25f8';
const BASE = `https://auds.poki.io/v0/${POKI_GAME_ID}/userdata`;
const MY_ENTRIES_KEY = 'dinoMyLeaderboardEntries';
const DESKTOP_LEADERBOARD_KEY = 'dinoDesktopRaceLeaderboards';
const PAGE_SIZE = 100;
const MAX_PAGES = 20; // fetch at most 2000 entries before cutting off

function keyFor(missionId) {
    return `race_${missionId}_v2`;
}

function isDesktopRuntime() {
    try {
        return Boolean(window?.desktopShell);
    } catch {
        return false;
    }
}

function loadDesktopLeaderboards() {
    try {
        const raw = localStorage.getItem(DESKTOP_LEADERBOARD_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function saveDesktopLeaderboards(data) {
    try {
        localStorage.setItem(DESKTOP_LEADERBOARD_KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

function saveMyEntry(missionId, id, secret, timeMs) {
    try {
        const raw = localStorage.getItem(MY_ENTRIES_KEY);
        const map = raw ? JSON.parse(raw) : {};
        map[missionId] = { id, secret, timeMs };
        localStorage.setItem(MY_ENTRIES_KEY, JSON.stringify(map));
    } catch {
        // Storage unavailable — skip.
    }
}

function getMyEntry(missionId) {
    try {
        const raw = localStorage.getItem(MY_ENTRIES_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw)?.[missionId];
        return (entry?.id && entry?.secret) ? entry : null;
    } catch {
        return null;
    }
}

function clearMyEntry(missionId) {
    try {
        const raw = localStorage.getItem(MY_ENTRIES_KEY);
        if (!raw) return;
        const map = JSON.parse(raw);
        delete map[missionId];
        localStorage.setItem(MY_ENTRIES_KEY, JSON.stringify(map));
    } catch {
        // Ignore.
    }
}

async function deleteMyPreviousEntry(missionId) {
    const prev = getMyEntry(missionId);
    if (!prev) return;
    try {
        const res = await fetch(`${BASE}/${keyFor(missionId)}/${prev.id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ secret: prev.secret })
        });
        if (res.ok) {
            clearMyEntry(missionId);
        } else {
            console.warn(`[Leaderboard] DELETE failed: ${res.status} — old entry may remain`);
        }
    } catch (err) {
        console.warn('[Leaderboard] DELETE error:', err);
    }
}

/**
 * Fetches all AUDS entries using pagination (up to MAX_PAGES).
 * Returns the raw items array.
 */
async function fetchAllRawEntries(missionId) {
    const allItems = [];
    try {
        const firstRes = await fetch(`${BASE}/${keyFor(missionId)}?limit=${PAGE_SIZE}&offset=0`);
        if (!firstRes.ok) {
            console.warn(`[Leaderboard] GET failed: ${firstRes.status}`);
            return [];
        }
        const firstJson = await firstRes.json();
        const total = Number(firstJson?.total) || 0;
        allItems.push(...(Array.isArray(firstJson?.items) ? firstJson.items : []));

        if (total > PAGE_SIZE) {
            const offsets = [];
            for (let offset = PAGE_SIZE; offset < total && offsets.length < MAX_PAGES - 1; offset += PAGE_SIZE) {
                offsets.push(offset);
            }
            const pages = await Promise.all(
                offsets.map((offset) =>
                    fetch(`${BASE}/${keyFor(missionId)}?limit=${PAGE_SIZE}&offset=${offset}`)
                        .then((r) => (r.ok ? r.json() : null))
                        .catch(() => null)
                )
            );
            for (const page of pages) {
                if (Array.isArray(page?.items)) {
                    allItems.push(...page.items);
                }
            }
        }

        return allItems;
    } catch (err) {
        console.warn('[Leaderboard] GET error:', err);
        return [];
    }
}

function getDesktopMissionEntries(missionId) {
    const identity = getPlayerIdentity();
    const all = loadDesktopLeaderboards();
    const entries = Array.isArray(all?.[missionId]) ? all[missionId] : [];
    return entries
        .map((entry) => ({
            name: entry?.name ?? '???',
            timeMs: Number(entry?.timeMs) || 0,
            entryId: entry?.playerId ?? null,
            isMe: identity?.id != null && entry?.playerId === identity.id
        }))
        .filter((entry) => Number.isFinite(entry.timeMs) && entry.timeMs > 0)
        .sort((a, b) => a.timeMs - b.timeMs);
}

async function postDesktopRaceScore(missionId, { playerName, timeMs }) {
    if (!missionId || !Number.isFinite(timeMs) || timeMs <= 0) {
        return false;
    }

    const identity = getPlayerIdentity();
    const all = loadDesktopLeaderboards();
    const entries = Array.isArray(all?.[missionId]) ? [...all[missionId]] : [];
    const playerId = identity?.id ?? `desktop_${playerName}`;
    const existingIndex = entries.findIndex((entry) => entry?.playerId === playerId);
    const roundedTime = Math.round(timeMs);

    if (existingIndex >= 0) {
        const existing = entries[existingIndex];
        if (Number.isFinite(existing?.timeMs) && roundedTime >= existing.timeMs) {
            return false;
        }
        entries[existingIndex] = {
            ...existing,
            playerId,
            name: playerName,
            timeMs: roundedTime,
            updatedAt: Date.now()
        };
    } else {
        entries.push({
            playerId,
            name: playerName,
            timeMs: roundedTime,
            updatedAt: Date.now()
        });
    }

    entries.sort((a, b) => a.timeMs - b.timeMs);
    all[missionId] = entries.slice(0, 100);
    saveDesktopLeaderboards(all);
    return true;
}

async function fetchDesktopTopScores(missionId, displayLimit = 100) {
    return getDesktopMissionEntries(missionId).slice(0, displayLimit);
}

/**
 * Posts a new score only if it beats the player's previous best.
 * Each player keeps at most one entry.
 * Returns true if a new score was posted, false if the old one was kept.
 */
export async function postRaceScore(missionId, { playerName, timeMs }) {
    if (isDesktopRuntime()) {
        return postDesktopRaceScore(missionId, { playerName, timeMs });
    }

    const prev = getMyEntry(missionId);

    // Skip if previous score is already better or equal.
    if (prev && Number.isFinite(prev.timeMs) && timeMs >= prev.timeMs) {
        return false;
    }

    await deleteMyPreviousEntry(missionId);
    try {
        const res = await fetch(`${BASE}/${keyFor(missionId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                values: { name: playerName, time: timeMs }
            })
        });
        if (!res.ok) {
            console.warn(`[Leaderboard] POST failed: ${res.status}`);
            return false;
        }
        const json = await res.json();
        const id = json?.id ?? null;
        const secret = json?.secret ?? null;
        if (id && secret) saveMyEntry(missionId, id, secret, timeMs);
        return true;
    } catch (err) {
        console.warn('[Leaderboard] POST error:', err);
        return false;
    }
}

/**
 * Fetches top scores.
 * Desktop currently uses a local per-machine fallback leaderboard until a Steam
 * leaderboard bridge is added. Web/Poki keeps using the online AUDS leaderboard.
 */
export async function fetchTopScores(missionId, displayLimit = 100) {
    if (isDesktopRuntime()) {
        return fetchDesktopTopScores(missionId, displayLimit);
    }

    const myEntry = getMyEntry(missionId);
    const allItems = await fetchAllRawEntries(missionId);

    return allItems
        .map((e) => ({
            name: e?.values?.name ?? '???',
            timeMs: Number(e?.values?.time) || 0,
            entryId: e?.id ?? null,
            isMe: myEntry !== null && e?.id === myEntry.id
        }))
        .sort((a, b) => a.timeMs - b.timeMs)
        .slice(0, displayLimit);
}
