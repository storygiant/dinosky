# Steam/Desktop Wrapper Scaffold

This project now includes a desktop wrapper scaffold so the game can be packaged as a native app and prepared for Steam.

## Added files

- `package.json`
- `desktop.html`
- `poki-sdk-stub.js`
- `electron/main.cjs`
- `electron/preload.cjs`
- `steam_appid.txt`

## What this scaffold does

- Runs the existing game locally in Electron instead of requiring a browser tab.
- Loads a local Poki SDK stub so the desktop build works offline and without Poki services.
- Exposes a safe preload bridge for desktop and Steam integration.
- Includes `steamworks.js` as the native Steam runtime package.
- Provides build scripts and `electron-builder` config for Windows packaging.

## Run locally

1. Install dependencies:
   `npm install`
2. Start the desktop shell:
   `npm run desktop`

For a development run with DevTools:

`npm run desktop:dev`

## Build outputs

- Unpacked build:
  `npm run desktop:pack`
- Installer / portable build:
  `npm run desktop:dist`

Build output goes to the `release/` folder.

## Steam integration next steps

This scaffold now includes `steamworks.js` and initializes it in `electron/main.cjs`.

Current bridge methods:

- `window.steamBridge.isAvailable()`
- `window.steamBridge.getPlayerName()`
- `window.steamBridge.unlockAchievement(id)`
- `window.steamBridge.setRichPresence({...})`

The intended next steps are:

1. Replace the development `steam_appid.txt` value (`480`) with your real Steam App ID.
2. Use `window.steamBridge` from game code for:
   - achievements
   - cloud save hooks
   - rich presence
   - player name
   - overlay-aware actions
3. Add real store/depot packaging and Steam launch testing.

## Why use a separate `desktop.html`

The web build still uses the live Poki SDK script in `index.html`.

The desktop wrapper uses `desktop.html` so:

- the web version stays unchanged
- the desktop build boots offline
- desktop-only SDK stubs or Steam scripts can be added safely
