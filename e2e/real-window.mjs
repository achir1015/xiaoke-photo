// 真實視窗測試：不用 Playwright 截圖（縮放時會失真），直接取視窗實際畫面，確認版面鋪滿
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
await page.waitForTimeout(2000);
await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
await page.waitForTimeout(800);
const info = await page.evaluate(() => ({
  inner: [innerWidth, innerHeight], dpr: devicePixelRatio,
  panel: document.querySelector('#panel').getBoundingClientRect().toJSON(),
  stage: document.querySelector('#stage').getBoundingClientRect().toJSON(),
}));
const win = await app.evaluate(async ({ BrowserWindow, screen }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const img = await w.webContents.capturePage();
  return { content: w.getContentSize(), zoom: w.webContents.getZoomFactor(), scale: screen.getPrimaryDisplay().scaleFactor, work: screen.getPrimaryDisplay().workAreaSize, png: img.toPNG().toString('base64'), size: img.getSize() };
});
fs.writeFileSync(path.join(OUT, 'real-window.png'), Buffer.from(win.png, 'base64'));
delete win.png;
console.log(JSON.stringify({ info, win }));
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {}); // 測試文件沒存檔，不跳確認框
await app.close().catch(() => {});
process.exit(0);
