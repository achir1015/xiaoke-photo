// 找出介面還沒翻譯的字串：打開所有對話框、切換所有工具，再讀引擎收集到的清單
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'e2e', 'out');
fs.mkdirSync(OUT, { recursive: true });
const app = await electron.launch({ executablePath: path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'), args: [ROOT, '--profile=e2e'] });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__xiaoke && window.__xiaoke.engine.api, null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { document.querySelectorAll('.modal').forEach((m) => m.remove()); __xiaoke.engine.api.missing(); return __xiaoke.engine.command('file.new', { width: 400, height: 300, mode: 'rgb', depth: 8, background: 'white' }); });
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const e = __xiaoke.engine;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const menu = await e.call('ui.menu.list');
  const flat = [];
  (function walk(n) { if (Array.isArray(n)) n.forEach(walk); else if (n && typeof n === 'object') { if (n.id && n.label) flat.push(n); Object.values(n).forEach((v) => v && typeof v === 'object' && walk(v)); } })(menu);
  const log = { opened: 0, failed: [] };
  for (const m of flat) {
    if (!m.label.endsWith('…') || /^file\.(open|print|close|quit|exit)|batch|app\.quit|file\.place/i.test(m.id)) continue;
    try {
      const r = await e.call('ui.dialog.open', { kind: 'command', command: m.id });
      await nap(120);
      log.opened++;
      const id = r && (r.dialog ?? r.id);
      if (id !== undefined) await e.call('ui.dialog.cancel', { dialog: id }).catch(() => {});
    } catch (err) { log.failed.push(`${m.id}: ${String(err.message).slice(0, 60)}`); }
  }
  const ins = await e.call('ui.inspect');
  for (const d of ins.dialogs || []) await e.call('ui.dialog.cancel', { dialog: d.id ?? d.dialog }).catch(() => {});
  log.tools = [];
  let tools = [];
  try { await e.call('ui.set', { tool: 'zz' }); } catch (err) { log.toolErr = err.message.slice(0, 300); tools = (err.message.match(/[a-zA-Z]+/g) || []); }
  return { log, count: flat.length, missing: await e.api.missing() };
});
fs.writeFileSync(path.join(OUT, 'missing.json'), JSON.stringify(result, null, 1));
console.log('開過對話框', result.log.opened, '失敗', result.log.failed.length, '未翻譯', result.missing.length);
console.log(result.log.toolErr || '');
await page.screenshot({ path: path.join(OUT, 'english.png') });
await app.close().catch(() => {});
process.exit(0);
