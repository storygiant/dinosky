const path = require('path');
const fs = require('fs');
const http = require('http');
const { app, BrowserWindow, ipcMain } = require('electron');

const isDev = process.argv.includes('--dev') || !app.isPackaged;
const steamAppId = process.env.STEAM_APP_ID || '480';
let steamClient = null;
let assetServer = null;
let assetServerOrigin = null;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.tsx': 'application/xml; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function normalizeRequestPath(requestPath) {
  const decoded = decodeURIComponent(requestPath || '/');
  const cleaned = decoded.split('?')[0].split('#')[0];
  if (cleaned === '/' || cleaned === '') {
    return 'desktop/desktop.html';
  }
  return cleaned.replace(/^\/+/, '');
}

function resolveStaticAssetPath(requestPath) {
  const appRoot = app.getAppPath();
  const normalizedPath = normalizeRequestPath(requestPath);
  const resolvedPath = path.resolve(appRoot, normalizedPath);
  const rootWithSep = appRoot.endsWith(path.sep) ? appRoot : `${appRoot}${path.sep}`;
  if (resolvedPath !== appRoot && !resolvedPath.startsWith(rootWithSep)) {
    return null;
  }
  return resolvedPath;
}

function startAssetServer() {
  if (assetServer && assetServerOrigin) {
    return Promise.resolve(assetServerOrigin);
  }

  return new Promise((resolve, reject) => {
    assetServer = http.createServer((req, res) => {
      try {
        const filePath = resolveStaticAssetPath(req.url);
        if (!filePath) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }

        fs.readFile(filePath, (error, data) => {
          if (error) {
            const statusCode = error.code === 'ENOENT' ? 404 : 500;
            res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(statusCode === 404 ? 'Not found' : 'Internal server error');
            return;
          }

          res.writeHead(200, {
            'Content-Type': getContentType(filePath),
            'Cache-Control': isDev ? 'no-store' : 'public, max-age=31536000'
          });
          res.end(data);
        });
      } catch (error) {
        console.error('[desktop] Static asset server error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Internal server error');
      }
    });

    assetServer.on('error', (error) => {
      console.error('[desktop] Failed to start asset server:', error);
      reject(error);
    });

    assetServer.listen(0, '127.0.0.1', () => {
      const address = assetServer.address();
      assetServerOrigin = `http://127.0.0.1:${address.port}`;
      console.log('[desktop] Asset server listening at', assetServerOrigin);
      resolve(assetServerOrigin);
    });
  });
}

function stopAssetServer() {
  if (!assetServer) return;
  assetServer.close();
  assetServer = null;
  assetServerOrigin = null;
}

function tryInitializeSteamClient() {
  if (steamClient) return steamClient;
  try {
    const steamworks = require('steamworks.js');
    steamClient = steamworks.init(Number(steamAppId));
    console.log('[desktop] Steam initialized with app id', steamAppId);
  } catch (error) {
    console.warn('[desktop] Steam unavailable, continuing without it:', error.message);
    steamClient = null;
  }
  return steamClient;
}

async function createWindow() {
  const origin = await startAssetServer();
  const mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 576,
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: '#6ec2f8',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  await mainWindow.loadURL(`${origin}/desktop/desktop.html`);

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

function registerIpc() {
  ipcMain.handle('desktop:get-platform-info', () => ({
    platform: process.platform,
    isDesktop: true,
    isSteamAvailable: !!tryInitializeSteamClient()
  }));

  ipcMain.handle('desktop:is-fullscreen', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window ? window.isFullScreen() : false;
  });

  ipcMain.handle('desktop:set-fullscreen', (event, value) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(value === true);
    return window.isFullScreen();
  });

  ipcMain.handle('desktop:toggle-fullscreen', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.setFullScreen(!window.isFullScreen());
    return window.isFullScreen();
  });

  ipcMain.handle('desktop:quit', () => {
    app.quit();
    return true;
  });

  ipcMain.handle('steam:is-available', () => {
    return !!tryInitializeSteamClient();
  });

  ipcMain.handle('steam:get-player-name', () => {
    const client = tryInitializeSteamClient();
    if (!client) return null;
    return client.localplayer?.getName?.() ?? null;
  });

  ipcMain.handle('steam:unlock-achievement', (_event, achievementId) => {
    const client = tryInitializeSteamClient();
    if (!client || !achievementId) return false;
    try {
      client.achievement.activate(String(achievementId));
      return true;
    } catch (error) {
      console.warn('[desktop] Failed to unlock achievement', achievementId, error);
      return false;
    }
  });

  ipcMain.handle('steam:set-rich-presence', (_event, payload) => {
    const client = tryInitializeSteamClient();
    if (!client || !payload || typeof payload !== 'object') return false;
    try {
      Object.entries(payload).forEach(([key, value]) => {
        if (typeof value === 'string' && value.length > 0) {
          client.localplayer?.setRichPresence?.(key, value);
        }
      });
      return true;
    } catch (error) {
      console.warn('[desktop] Failed to set rich presence', error);
      return false;
    }
  });

  ipcMain.handle('steam:read-cloud-file', (_event, fileName) => {
    const client = tryInitializeSteamClient();
    if (!client || !fileName) return null;
    try {
      const buffer = client.cloud?.readFile?.(String(fileName));
      if (buffer == null) return null;
      return Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer);
    } catch (error) {
      console.warn('[desktop] Failed to read cloud file', fileName, error);
      return null;
    }
  });

  ipcMain.handle('steam:write-cloud-file', (_event, fileName, contents) => {
    const client = tryInitializeSteamClient();
    if (!client || !fileName) return false;
    try {
      const payload = Buffer.from(String(contents ?? ''), 'utf8');
      client.cloud?.writeFile?.(String(fileName), payload);
      return true;
    } catch (error) {
      console.warn('[desktop] Failed to write cloud file', fileName, error);
      return false;
    }
  });
}

app.whenReady().then(async () => {
  tryInitializeSteamClient();
  registerIpc();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopAssetServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
