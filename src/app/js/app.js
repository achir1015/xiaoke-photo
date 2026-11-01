// 主程式：啟動引擎，接上工具列、金鑰、更新與教學
import './native.js';
import './web-shim.js';
import { h, $, toast, busy, modal } from './ui.js';
import { Engine } from './engine.js';
import { AI, apiError } from './ai.js';
import { Panel } from './panel.js';
import { AI_MODELS } from './plugins.js';
import { openGuide } from './guide.js';

const engine = new Engine($('#engine'));
let settings = await window.xk.settings.get();

// ---------------- 影像 Worker ----------------
const worker = new Worker('js/imaging-worker.js', { type: 'module' });
const waiting = new Map();
let jobId = 0;
worker.onmessage = (e) => {
  const { id, img, parts, error } = e.data, w = waiting.get(id);
  if (!w) return;
  waiting.delete(id);
  if (error) w.reject(new Error(error)); else w.resolve(parts || img);
};
function run(op, img, params) {
  const id = ++jobId;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    const copy = { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height };
    worker.postMessage({ id, op, img: copy, params }, [copy.data.buffer]);
  });
}

const ai = new AI(engine, run);

// ---------------- OpenAI 金鑰 ----------------
function paintKey() {
  $('#btnKey').classList.toggle('set', !!settings.ai.hasKey);
  $('#btnKey').title = settings.ai.hasKey ? `已設定 OpenAI 金鑰，模型：${settings.ai.model}` : '尚未設定 OpenAI API 金鑰';
}

function keyDialog() {
  return new Promise((resolve) => {
    const input = h('input', { type: 'password', id: 'keyInput', placeholder: settings.ai.hasKey ? '已設定（留空保持不變）' : 'sk-…', autocomplete: 'off' });
    const models = [...new Set([settings.ai.model, ...AI_MODELS])];
    const model = h('select', { id: 'keyModel' }, models.map((m) => h('option', { value: m }, m)));
    model.value = settings.ai.model;
    const quality = h('select', { id: 'keyQuality' }, [['auto', '自動'], ['low', '低（最省）'], ['medium', '中'], ['high', '高（最貴）']].map(([v, t]) => h('option', { value: v }, t)));
    quality.value = settings.ai.quality;
    const status = h('p', {}, settings.ai.hasKey ? '目前已設定金鑰。' : '尚未設定金鑰。');
    const test = async () => {
      status.textContent = '測試中…';
      try {
        const list = await window.xk.ai.test(input.value.trim());
        for (const m of list) if (![...model.options].some((o) => o.value === m)) model.append(h('option', { value: m }, m));
        status.textContent = `連線成功，這把金鑰可用的影像模型：${list.join('、') || '（沒有列出）'}`;
      } catch (e) { status.textContent = `測試失敗：${apiError(e)}`; }
    };
    const save = async () => {
      if (input.value.trim()) settings = await window.xk.ai.setKey(input.value.trim());
      settings = await window.xk.settings.set({ ai: { model: model.value, quality: quality.value } });
      paintKey();
      close();
      toast('OpenAI 設定已儲存');
    };
    const clear = async () => { settings = await window.xk.ai.setKey(''); paintKey(); status.textContent = '金鑰已清除。'; input.placeholder = 'sk-…'; };
    const close = modal(h('div', { class: 'dialog' },
      h('h2', {}, 'OpenAI API 金鑰'),
      h('p', {}, '文生圖、AI 移除、局部重繪等功能會用這把金鑰呼叫 OpenAI，費用由你的 OpenAI 帳號計算。金鑰加密存在這台裝置，只會傳給 OpenAI。'),
      h('p', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); window.xk.openExternal('https://platform.openai.com/api-keys'); } }, '到 OpenAI 網站建立金鑰')),
      input, status,
      h('div', { class: 'two' },
        h('label', { class: 'row' }, h('span', {}, '模型 '), model),
        h('label', { class: 'row' }, h('span', {}, '品質 '), quality)),
      h('div', { class: 'actions' },
        h('button', { onclick: clear }, '清除金鑰'),
        h('button', { id: 'keyTest', onclick: test }, '測試連線'),
        h('button', { onclick: () => close() }, '取消'),
        h('button', { class: 'primary', id: 'keySave', onclick: save }, '儲存'))), { onClose: () => resolve(!!settings.ai.hasKey) });
    input.focus();
  });
}

async function needKey() {
  if (settings.ai.hasKey) return true;
  toast('請先設定 OpenAI API 金鑰');
  return keyDialog();
}

// ---------------- 系統更新 ----------------
function fmtMB(n) { return (n / 1048576).toFixed(1); }

async function checkUpdate(silent) {
  let info;
  try { info = await window.xk.update.check(); } catch (e) { if (!silent) toast(`檢查更新失敗：${e.message.replace(/^.*Error: /, '')}`, true); return; }
  if (!info.newer) { if (!silent) toast(`目前已是最新版本 v${info.current}`); return; }
  const bar = h('i');
  const note = h('p', {}, `目前 v${info.current}，最新 v${info.latest}。`);
  const go = async () => {
    try {
      if (info.openPage || !info.canInstall) { await window.xk.update.openPage(); close(); return; }
      goBtn.disabled = true;
      note.textContent = '下載中…';
      const off = window.xk.update.onProgress(({ got, total }) => {
        bar.style.width = total ? `${got / total * 100}%` : '30%';
        note.textContent = total ? `下載中 ${fmtMB(got)}／${fmtMB(total)} MB` : `下載中 ${fmtMB(got)} MB`;
      });
      const file = await window.xk.update.download();
      off();
      note.textContent = '安裝中，程式會自動重新開啟…';
      const r = await window.xk.update.install(file);
      if (r && r.manual) note.textContent = `已下載到：${r.path}，請開啟它完成安裝。`;
    } catch (e) { note.textContent = `更新失敗：${e.message}`; goBtn.disabled = false; }
  };
  const goBtn = h('button', { class: 'primary', id: 'updateGo', onclick: go }, info.canInstall || info.openPage ? '立即更新' : '開啟下載頁');
  const close = modal(h('div', { class: 'dialog' },
    h('h2', {}, `發現新版本 v${info.latest}`), note,
    info.notes ? h('p', { style: 'white-space:pre-wrap;max-height:220px;overflow:auto' }, info.notes) : null,
    h('div', { class: 'progress' }, bar),
    h('div', { class: 'actions' }, h('button', { onclick: () => close() }, '稍後再說'), goBtn)));
}

async function about() {
  const sys = await window.xk.sys.info();
  modal(h('div', { class: 'dialog' },
    h('img', { src: '../../build/icon.png', style: 'width:84px;height:84px;float:right', alt: '' }),
    h('h2', {}, '小柯機器人圖像編輯助手'),
    h('p', {}, `版本 v${sys.version}`),
    h('p', {}, '系統開發：吳玉柱 先生 與 Claude AI Opus 5.5'),
    h('p', {}, '影像引擎修改自開源的 PhotoCraft（MIT／Apache-2.0），與 Adobe、ArtCraft 無隸屬關係。AI 繪圖由 OpenAI 提供。'),
    h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: (e) => e.target.closest('.modal').remove() }, '關閉'))));
}

// ---------------- 面板與工具列 ----------------
const panelEl = $('#panel');
function setPanel(open) {
  panelEl.hidden = !open;
  $('#btnPanel').classList.toggle('on', open);
}
setPanel(settings.panelOpen !== false && innerWidth > 760);
$('#btnPanel').onclick = () => { const open = panelEl.hidden; setPanel(open); window.xk.settings.set({ panelOpen: open }); };
$('#btnKey').onclick = () => keyDialog();
$('#btnUpdate').onclick = () => checkUpdate(false);
$('#btnAbout').onclick = about;
$('#btnGuide').onclick = () => openGuide();
paintKey();

const panel = new Panel({ engine, ai, run, settings: () => settings, needKey });
for (const b of document.querySelectorAll('#quick [data-menu]')) {
  b.onclick = async () => {
    try { await engine.menu(b.dataset.menu); } catch (e) { toast(e.message, true); }
    engine.focus();
  };
}

// 手機的 WebView 接不住 blob 下載：攔下引擎的存檔，改交給原生存檔
function hookDownloads() {
  const save = window.xkNative && window.xkNative.saveFile;
  const w = $('#engine').contentWindow;
  if (!save || !w) return;
  const original = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function click() {
    if (!this.download || !this.href.startsWith('blob:')) { original.call(this); return; }
    const name = this.download;
    fetch(this.href).then((r) => r.arrayBuffer()).then((b) => save(name, new Uint8Array(b)))
      .then((where) => toast(`已儲存：${where}`)).catch((e) => toast(`儲存失敗：${e.message}`, true));
  };
}

// ---------------- 啟動 ----------------
try {
  await engine.ready();
  $('#splash').classList.add('done');
  setTimeout(() => $('#splash').remove(), 500);
  engine.focus();
  window.xk.ready && window.xk.ready();
  hookDownloads();
  window.xk.onOpenFile && window.xk.onOpenFile(({ name, bytes }) => engine.open(name, new Uint8Array(bytes)));
  if (!settings.guideSeen) {
    window.xk.settings.set({ guideSeen: true });
    const close = modal(h('div', { class: 'dialog' },
      h('h2', {}, '歡迎使用！'),
      h('p', {}, '要讓小柯用語音和動畫帶你認識這個工具嗎？之後隨時可以從右上角「使用教學」再看一次。'),
      h('div', { class: 'actions' },
        h('button', { onclick: () => close() }, '先不用'),
        h('button', { class: 'primary', onclick: () => { close(); openGuide(); } }, '開始教學'))));
  }
  if (settings.autoUpdate !== false) setTimeout(() => checkUpdate(true), 4000);
} catch (e) {
  $('#splashText').textContent = `啟動失敗：${e.message}`;
}

// Android 返回鍵：先關對話框，再收面板
window.__xkBack = () => {
  const m = document.querySelector('.modal');
  if (m) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); return true; }
  if (innerWidth <= 900 && !panelEl.hidden) { setPanel(false); return true; }
  return false;
};

window.__xiaoke = { engine, panel, ai, run, get settings() { return settings; } };
addEventListener('pagehide', () => { ai.cancel(); worker.terminate(); });
export { busy };
