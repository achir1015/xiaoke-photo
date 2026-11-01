// 實機測試：啟動 Electron，把真的引擎跑起來，走過開圖、圖層、插件、AI（假伺服器）流程
// 用法：node e2e/smoke.mjs；XK_EXE=<exe 路徑> 測打包版
import { _electron as electron } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (ok, name, extra = '') => { if (ok) { pass++; console.log('ok  ', name); } else { fail++; console.log('FAIL', name, extra); } };

// 假的 OpenAI：回傳引擎自己產生不了的純色 PNG，同時記錄收到的內容
const PNG = fs.readFileSync(path.join(ROOT, 'build', 'icon.png')).toString('base64');
const calls = [];
const mock = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    calls.push({ url: req.url, auth: req.headers.authorization, type: req.headers['content-type'], size: body.length, text: body.toString('latin1') });
    res.setHeader('Content-Type', 'application/json');
    if (req.url.endsWith('/models')) res.end(JSON.stringify({ data: [{ id: 'gpt-image-2' }, { id: 'gpt-image-9-test' }, { id: 'o1' }] }));
    else res.end(JSON.stringify({ data: [{ b64_json: PNG }] }));
  });
});
await new Promise((r) => mock.listen(0, '127.0.0.1', r));
process.env.XIAOKE_OPENAI_BASE = `http://127.0.0.1:${mock.address().port}/v1`;

const exe = process.env.XK_EXE;
const app = await electron.launch(exe
  ? { executablePath: exe, args: ['--profile=e2e'] }
  : { executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [ROOT, '--profile=e2e'], env: { ...process.env } });
const page = await app.firstWindow();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const J = (fn, arg) => page.evaluate(fn, arg);
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.waitForFunction(() => window.__xiaoke && window.__xiaoke.engine.api, null, { timeout: 120000 });
  check(true, '引擎啟動，window.xiaokeEngine 可用');
  await wait(1500);
  await J(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
  await shot('01-start');

  const lang = await J(async () => (await __xiaoke.engine.command('prefs.get', { path: 'interface.language' })));
  check(/zh-hant/.test(JSON.stringify(lang)), '介面語言是繁體中文', JSON.stringify(lang));

  const cmds = await J(async () => { const list = await __xiaoke.engine.call('engine.commands'); return list.length; });
  check(cmds > 400, `引擎命令 ${cmds} 個`);

  // 新文件
  await J(() => __xiaoke.engine.command('file.new', { width: 800, height: 600, mode: 'rgb', depth: 8, background: 'white' }));
  await wait(600);
  let doc = await J(() => __xiaoke.engine.documentInfo());
  check(doc && doc.width === 800 && doc.layers.length === 1, '新增文件 800×600，一個圖層', JSON.stringify(doc && doc.layers));

  // 合成圖
  const comp = await J(async () => { const c = await __xiaoke.engine.composite(0); return { w: c.width, h: c.height, p: Array.from(c.data.slice(0, 4)) }; });
  check(comp.w === 800 && comp.p[0] === 255, '讀回合成圖', JSON.stringify(comp));

  // 置入成圖層
  const before = doc.layers.length;
  await J(async () => {
    const { data, width, height } = await (async () => {
      const c = new OffscreenCanvas(800, 600), g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, 800, 0); grd.addColorStop(0, '#d9a07a'); grd.addColorStop(1, '#3a6ea5');
      g.fillStyle = grd; g.fillRect(0, 0, 800, 600);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${i % 255},${(i * 7) % 255},${(i * 13) % 255},.25)`; g.fillRect((i * 37) % 800, (i * 91) % 600, 3, 3); }
      const d = g.getImageData(0, 0, 800, 600); return { data: d.data, width: 800, height: 600 };
    })();
    await __xiaoke.engine.place('測試圖層', { data, width, height });
  });
  await wait(1500);
  doc = await J(() => __xiaoke.engine.documentInfo());
  check(doc.layers.length === before + 1, '置入後多一個圖層', JSON.stringify(doc.layers.map((l) => l.name)));
  check(doc.layers.some((l) => /測試圖層/.test(l.name)), '圖層名稱是繁中檔名', JSON.stringify(doc.layers.map((l) => l.name)));
  const pending = await J(() => __xiaoke.engine.call('ui.inspect'));
  await shot('02-placed');
  console.log('dialogs', JSON.stringify(pending.dialogs || []).slice(0, 200));

  // 本機插件
  for (const [op, params] of [['denoise', { amount: 60 }], ['portraitSmooth', { amount: 60 }], ['film', { look: '青橘電影', strength: 100 }], ['flood', {}], ['flexify', { mode: 'littlePlanet' }], ['upscale', { scale: 2 }]]) {
    const r = await J(async ([o, p]) => { const c = await __xiaoke.engine.composite(300); const t = performance.now(); const out = await __xiaoke.run(o, c, p); return { w: out.width, ms: performance.now() - t }; }, [op, params]);
    check(r.w > 0, `插件 ${op}`, JSON.stringify(r));
  }

  // UI：開面板分頁
  for (const t of ['portrait', 'effects', 'clean', 'fix', 'gen']) await page.click(`#panel .tabs button[data-tab="${t}"]`);
  check(true, '面板分頁可切換');

  // 插件卡片：預覽＋套用
  await page.click('#panel .tabs button[data-tab="portrait"]');
  await page.click('[data-plugin="smooth"] h3');
  await page.waitForFunction(() => document.querySelector('[data-plugin="smooth"] .preview em').textContent === '按住看原圖', null, { timeout: 30000 }).catch(() => {});
  const lab = await page.textContent('[data-plugin="smooth"] .preview em');
  check(lab === '按住看原圖', '插件預覽完成', lab);
  await shot('03-plugin');
  const n1 = (await J(() => __xiaoke.engine.documentInfo())).layers.length;
  await page.click('[data-plugin="smooth"] .actions button');
  await page.waitForFunction(() => document.querySelector('#busy').hidden, null, { timeout: 60000 });
  await wait(1200);
  check((await J(() => __xiaoke.engine.documentInfo())).layers.length === n1 + 1, '套用插件新增圖層');

  // 髮絲摳圖（選取主體）
  await page.click('#panel .tabs button[data-tab="effects"]');
  await page.click('[data-plugin="cutout"] h3');
  await page.waitForFunction(() => document.querySelector('[data-plugin="cutout"] .preview em').textContent !== '處理中…', null, { timeout: 40000 }).catch(() => {});
  const cut = await page.textContent('[data-plugin="cutout"] .preview em');
  check(cut === '按住看原圖', '摳圖預覽', cut);
  await shot('03b-cutout');
  await J(() => __xiaoke.engine.command('select.deselect').catch(() => {}));

  // 金鑰（假伺服器）
  await page.click('#btnKey');
  await page.fill('#keyInput', 'sk-test-e2e');
  await page.click('#keyTest');
  await wait(600);
  await shot('04-key');
  const opts = await J(() => [...document.querySelectorAll('#keyModel option')].map((o) => o.value));
  check(opts.includes('gpt-image-9-test'), '測試金鑰列出帳號可用模型', opts.join());
  await page.click('#keySave');
  await wait(300);
  check(await J(() => document.querySelector('#btnKey').classList.contains('set')), '金鑰指示燈變綠');
  const userData = await app.evaluate(({ app: a }) => a.getPath('userData'));
  const stored = fs.readFileSync(path.join(userData, 'settings.json'), 'utf8');
  check(!stored.includes('sk-test-e2e'), '金鑰沒有明文存檔');

  // 文生圖 → 圖層
  await page.click('#panel .tabs button[data-tab="gen"]');
  await page.fill('#genPrompt', '小柯機器人在海邊');
  const n2 = (await J(() => __xiaoke.engine.documentInfo())).layers.length;
  await page.click('#genGo');
  await page.waitForFunction(() => document.querySelector('#busy').hidden && document.querySelector('.gallery img'), null, { timeout: 30000 });
  await wait(1200);
  const d2 = await J(() => __xiaoke.engine.documentInfo());
  check(d2.layers.length === n2 + 1, '文生圖結果加入圖層', JSON.stringify(d2.layers.map((l) => l.name)));
  check(calls.some((c) => c.url.endsWith('/images/generations') && c.auth === 'Bearer sk-test-e2e'), '文生圖有帶金鑰呼叫 API');
  await shot('05-gen');

  // AI 移除：塗抹 → 遮罩 → 新圖層
  await page.click('#panel .tabs button[data-tab="fix"]');
  await page.click('#fixRemove');
  await page.waitForSelector('.masker canvas');
  await wait(300);
  const box = await page.locator('.masker canvas').nth(1).boundingBox();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await shot('06-mask');
  const n3 = d2.layers.length;
  await page.click('.masker .primary');
  await page.waitForFunction(() => document.querySelector('#busy').hidden && !document.querySelector('.masker'), null, { timeout: 30000 });
  await wait(1500);
  const d3 = await J(() => __xiaoke.engine.documentInfo());
  check(d3.layers.length === n3 + 1 && d3.layers.some((l) => /AI 移除/.test(l.name)), 'AI 移除結果加入圖層', JSON.stringify(d3.layers.map((l) => l.name)));
  const edit = calls.find((c) => c.url.endsWith('/images/edits'));
  check(edit && /multipart/.test(edit.type) && edit.text.includes('name="mask"') , 'AI 移除用 multipart 並附遮罩', edit && edit.type);
  await shot('07-removed');

  // 教學
  await page.click('#btnGuide');
  await wait(900);
  check(await page.isVisible('.guide .scene .sc-robot'), '教學視窗出現小柯');
  await page.click('#guideNext'); await wait(500); await page.click('#guideNext'); await wait(700);
  const say = await page.textContent('.guide .say');
  check(say.length > 10, '教學顯示說明文字', say);
  await shot('08-guide');
  await page.click('#guideClose');

  const leftovers = errors.filter((e) => !/ResizeObserver|favicon|version.json/.test(e));
  check(leftovers.length === 0, '沒有頁面錯誤', leftovers.slice(0, 4).join(' | ').slice(0, 500));
} catch (e) {
  fail++;
  console.log('FAIL 例外', e.message);
  await shot('99-error').catch(() => {});
  console.log(errors.slice(0, 6).join('\n').slice(0, 800));
}
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {}); // 測試文件沒存檔，不跳確認框
await app.close().catch(() => {});
mock.close();
console.log(`\n通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
