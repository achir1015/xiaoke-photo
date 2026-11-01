'use strict';
const { app, BrowserWindow, ipcMain, protocol, dialog, shell, safeStorage, screen, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { Updater } = require('./updater');
const { OpenAIImages } = require('./openai');

const APP_TITLE = '小柯機器人圖像編輯助手';
const APP_ROOT = path.join(__dirname, '..', '..');
const argv = process.argv.slice(1);
const argVal = (name) => { const a = argv.find((s) => s.startsWith(`--${name}=`)); return a ? a.split('=').slice(1).join('=') : null; };
const PROFILE = argVal('profile');

app.setName(APP_TITLE);
app.setPath('userData', path.join(app.getPath('appData'), 'xiaoke-photo' + (PROFILE ? '-' + PROFILE.replace(/[^\w-]/g, '') : '')));
// 系統對話框與引擎都走繁體中文，不看作業系統語言
app.commandLine.appendSwitch('lang', 'zh-TW');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
if (!PROFILE && !app.requestSingleInstanceLock()) app.quit();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

// ---------------- 設定 ----------------
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
function defaults() {
  return {
    autoUpdate: true,
    panelOpen: true,
    guideSeen: false,
    ai: { apiKeyEnc: '', model: 'gpt-image-2', quality: 'auto', size: 'auto' },
  };
}
let settings = defaults();
function loadSettings() {
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
    const d = defaults();
    settings = { ...d, ...raw, ai: { ...d.ai, ...(raw.ai || {}) } };
  } catch { settings = defaults(); saveSettings(); }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2), 'utf8');
}
// 給畫面用的設定（不含金鑰本身）
function publicSettings() {
  const s = JSON.parse(JSON.stringify(settings));
  s.ai = { model: settings.ai.model, quality: settings.ai.quality, size: settings.ai.size, hasKey: !!getApiKey() };
  return s;
}
function getApiKey() {
  const enc = settings.ai.apiKeyEnc;
  if (enc) {
    try {
      if (enc.startsWith('plain:')) return Buffer.from(enc.slice(6), 'base64').toString('utf8');
      return safeStorage.decryptString(Buffer.from(enc, 'base64'));
    } catch { /* 解密失敗視同沒有 */ }
  }
  return process.env.OPENAI_API_KEY || '';
}
function setApiKey(key) {
  key = String(key || '').trim();
  if (!key) { settings.ai.apiKeyEnc = ''; return; }
  settings.ai.apiKeyEnc = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key).toString('base64')
    : 'plain:' + Buffer.from(key, 'utf8').toString('base64');
}

// ---------------- 視窗 ----------------
let win = null;
const openai = new OpenAIImages(getApiKey);
const updater = new Updater();
let pendingFile = argv.find((a) => !a.startsWith('-') && fs.existsSync(a) && /\.(psd|psb|pcraft|png|jpe?g|webp|tiff?|bmp|gif)$/i.test(a)) || null;

function iconPath() {
  const p = path.join(APP_ROOT, 'build', 'icon.png');
  return fs.existsSync(p) ? p : undefined;
}
// 視窗大小不能超過螢幕可用範圍（螢幕縮放 150%、175% 時可用範圍很小）
function fitWindow() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const width = Math.min(1560, wa.width), height = Math.min(960, wa.height);
  return { width, height, minWidth: Math.min(960, width), minHeight: Math.min(600, height) };
}
function createWindow() {
  win = new BrowserWindow({
    ...fitWindow(),
    title: APP_TITLE + (PROFILE ? ` [${PROFILE}]` : ''),
    icon: iconPath(),
    backgroundColor: '#20232b',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://local/src/app/index.html');
  win.once('ready-to-show', () => {
    if (argv.includes('--hidden')) return;
    if (!PROFILE) win.maximize();
    win.show();
  });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  // 引擎在有未儲存內容時會擋住關閉：問使用者，不要讓視窗關不掉
  win.webContents.on('will-prevent-unload', (e) => {
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', title: APP_TITLE, message: '有尚未儲存的內容，確定要關閉嗎？',
      buttons: ['不儲存，關閉', '返回繼續編輯'], defaultId: 1, cancelId: 1, noLink: true,
    });
    if (r === 0) e.preventDefault();
  });
  win.on('closed', () => { win = null; openai.cancelAll(); });
  // 視窗太小（螢幕縮放 150%～250%）時整體縮小內容，版面維持至少 1280×720 的空間
  const fitZoom = () => {
    if (!win || win.isDestroyed()) return;
    const [w, h] = win.getContentSize();
    const z = Math.max(0.5, Math.min(1, w / 1280, h / 720));
    if (Math.abs(win.webContents.getZoomFactor() - z) > 0.01) win.webContents.setZoomFactor(z);
  };
  win.on('resize', fitZoom);
  win.webContents.on('did-finish-load', fitZoom);
  win.once('ready-to-show', () => setTimeout(fitZoom, 50));
}

// ---------------- app:// 協定 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
};
function resolveAppUrl(u) {
  const url = new URL(u);
  if (url.host !== 'local') return null;
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const abs = path.normalize(path.join(APP_ROOT, rel));
  // 只允許程式自己的檔案
  if (!/^(src|engine|build)[\\/]/.test(path.relative(APP_ROOT, abs))) return null;
  return abs;
}
function registerProtocol() {
  protocol.handle('app', async (req) => {
    const abs = resolveAppUrl(req.url);
    if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) return new Response('not found', { status: 404 });
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const res = await net.fetch(pathToFileURL(abs).toString());
    return new Response(res.body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } });
  });
}

// ---------------- 畫面呼叫的功能 ----------------
function registerIpc() {
  ipcMain.handle('settings:get', () => publicSettings());
  ipcMain.handle('settings:set', (e, patch) => {
    const { ai, ...rest } = patch || {};
    Object.assign(settings, rest);
    if (ai) for (const k of ['model', 'quality', 'size']) if (ai[k] !== undefined) settings.ai[k] = ai[k];
    saveSettings();
    return publicSettings();
  });
  ipcMain.handle('sys:info', () => ({ version: app.getVersion(), platform: process.platform, packaged: app.isPackaged }));
  ipcMain.handle('app:openExternal', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

  ipcMain.handle('ai:setKey', (e, key) => { setApiKey(key); saveSettings(); return publicSettings(); });
  ipcMain.handle('ai:test', async (e, key) => openai.test(String(key || getApiKey()).trim()));
  ipcMain.handle('ai:generate', (e, id, req) => openai.generate(id, req));
  ipcMain.handle('ai:edit', (e, id, req) => openai.edit(id, req));
  ipcMain.handle('ai:cancel', (e, id) => openai.cancel(id));

  ipcMain.handle('update:check', () => updater.check());
  ipcMain.handle('update:download', (e) => updater.download((got, total) => { if (!e.sender.isDestroyed()) e.sender.send('update:progress', { got, total }); }));
  ipcMain.handle('update:install', (e, file) => updater.install(file));
  ipcMain.handle('update:openPage', () => { if (updater.info && updater.info.page) shell.openExternal(updater.info.page); });
}

function sendPendingFile() {
  if (!pendingFile || !win) return;
  const file = pendingFile;
  pendingFile = null;
  try { win.webContents.send('app:openFile', { name: path.basename(file), bytes: fs.readFileSync(file) }); } catch { /* 檔案不見就略過 */ }
}

app.on('second-instance', (e, args) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const file = args.slice(1).find((a) => !a.startsWith('-') && fs.existsSync(a));
  if (file) { pendingFile = file; sendPendingFile(); }
});

app.whenReady().then(() => {
  loadSettings();
  registerProtocol();
  registerIpc();
  ipcMain.on('app:ready', sendPendingFile);
  createWindow();
});
app.on('window-all-closed', () => app.quit());
