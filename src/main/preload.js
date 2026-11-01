'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const inv = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);

contextBridge.exposeInMainWorld('xk', {
  platform: 'desktop',
  settings: { get: inv('settings:get'), set: inv('settings:set') },
  sys: { info: inv('sys:info') },
  openExternal: inv('app:openExternal'),
  ready: () => ipcRenderer.send('app:ready'),
  ai: {
    setKey: inv('ai:setKey'), test: inv('ai:test'),
    generate: inv('ai:generate'), edit: inv('ai:edit'), cancel: inv('ai:cancel'),
  },
  update: {
    check: inv('update:check'), download: inv('update:download'), install: inv('update:install'), openPage: inv('update:openPage'),
    onProgress: (fn) => { const h = (e, d) => fn(d); ipcRenderer.on('update:progress', h); return () => ipcRenderer.off('update:progress', h); },
  },
  onOpenFile: (fn) => { const h = (e, d) => fn(d); ipcRenderer.on('app:openFile', h); return () => ipcRenderer.off('app:openFile', h); },
});
