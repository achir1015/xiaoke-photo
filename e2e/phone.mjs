// 手機實機測試（除錯版 APK）：透過 WebView 偵錯通道在 App 裡跑 JS
// 用法：node e2e/phone.mjs [eval "程式碼"]；無參數跑基本流程。需要 Node 22（內建 WebSocket）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
const props = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'android', 'local.properties'), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/\\:/g, ':').replace(/\\\\/g, '\\')]; }));
const ADB = path.join(props['sdk.dir'], 'platform-tools', 'adb.exe');
const SERIAL = process.env.ANDROID_SERIAL || 'R5CY236CQ3B';
const adb = (...a) => execFileSync(ADB, ['-s', SERIAL, ...a], { encoding: 'utf8' });

export async function connect() {
  const pid = adb('shell', 'pidof', 'com.achir.xiaokephoto').trim().split(/\s+/)[0];
  if (!pid) throw new Error('App 沒有在執行');
  const port = 9334;
  adb('forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`);
  const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = pages.find((p) => p.url.includes('index.html') && !p.url.includes('engine/')) || pages[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, no) => { ws.onopen = r; ws.onerror = no; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const send = (method, params) => new Promise((r) => { const i = ++id; waiting.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expression) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expression}})()`, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result.result.value;
  };
  return { run, close: () => ws.close() };
}

export function screenshot(name) {
  const file = path.join(OUT, `${name}.png`);
  const buf = execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 80 * 1024 * 1024 });
  fs.writeFileSync(file, buf);
  return file;
}

if (process.argv[1] && process.argv[1].endsWith('phone.mjs')) {
  const c = await connect();
  if (process.argv[2] === 'eval') {
    console.log(JSON.stringify(await c.run(process.argv[3]), null, 1));
  } else {
    console.log(JSON.stringify(await c.run(`
      const out = { ua: navigator.userAgent.slice(-60), inner: [innerWidth, innerHeight], dpr: devicePixelRatio, gpu: !!navigator.gpu };
      out.engine = !!(window.__xiaoke && __xiaoke.engine.api);
      if (out.engine) {
        const e = __xiaoke.engine;
        await e.command('file.new', { width: 800, height: 600, mode: 'rgb', depth: 8, background: 'white' });
        const c = new OffscreenCanvas(800, 600), g = c.getContext('2d');
        g.fillStyle = '#d9a07a'; g.fillRect(0, 0, 800, 600); g.fillStyle = '#3a6ea5'; g.fillRect(300, 150, 300, 300);
        const d = g.getImageData(0, 0, 800, 600);
        await e.place('手機測試', { data: d.data, width: 800, height: 600 });
        await new Promise((r) => setTimeout(r, 1500));
        out.layers = (await e.documentInfo()).layers.map((l) => l.name);
        const t = performance.now();
        const img = await e.composite(400);
        const r = await __xiaoke.run('portraitSmooth', img, { amount: 60 });
        out.pluginMs = Math.round(performance.now() - t); out.plugin = r.width;
        out.voice = (await __xiaoke.engine.call('ui.inspect')).status;
      }
      out.err = document.querySelector('#splashText') ? document.querySelector('#splashText').textContent : '';
      return out;
    `), null, 1));
  }
  c.close();
  console.log(screenshot('phone'));
}
