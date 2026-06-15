const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopShell', {
  getPlatformInfo: () => ipcRenderer.invoke('desktop:get-platform-info'),
  isFullscreen: () => ipcRenderer.invoke('desktop:is-fullscreen'),
  setFullscreen: (value) => ipcRenderer.invoke('desktop:set-fullscreen', value),
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  quit: () => ipcRenderer.invoke('desktop:quit')
});

contextBridge.exposeInMainWorld('steamBridge', {
  isAvailable: () => ipcRenderer.invoke('steam:is-available'),
  getPlayerName: () => ipcRenderer.invoke('steam:get-player-name'),
  unlockAchievement: (achievementId) => ipcRenderer.invoke('steam:unlock-achievement', achievementId),
  setRichPresence: (payload) => ipcRenderer.invoke('steam:set-rich-presence', payload),
  readCloudFile: (fileName) => ipcRenderer.invoke('steam:read-cloud-file', fileName),
  writeCloudFile: (fileName, contents) => ipcRenderer.invoke('steam:write-cloud-file', fileName, contents)
});
