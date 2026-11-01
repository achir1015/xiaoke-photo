// 更新流程：用假舊版（electron-builder -c.extraMetadata.version=0.9.9 --dir）實際查詢、下載、安裝 GitHub 上的新版
// 用法：node e2e/update-flow.mjs <舊版 exe> [install]
import { _electron as electron } from 'playwright-core';

const exe = process.argv[2];
const app = await electron.launch({ executablePath: exe, args: ['--profile=e2e'] });
const page = await app.firstWindow();
await page.waitForFunction(() => window.__xiaoke && window.__xiaoke.engine.api, null, { timeout: 120000 });
await page.evaluate(() => document.querySelectorAll('.modal').forEach((m) => m.remove()));
const info = await page.evaluate(() => window.xk.update.check());
console.log(JSON.stringify({ current: info.current, latest: info.latest, newer: info.newer, canInstall: info.canInstall, flavor: info.flavor, asset: info.asset && info.asset.name }));
await page.click('#btnUpdate');
await page.waitForSelector('#updateGo', { timeout: 20000 });
console.log('對話框：', await page.textContent('.dialog h2'));
await page.screenshot({ path: 'e2e/out/update.png' });
if (process.argv[3] === 'install') {
  // 按下「立即更新」：下載、靜默安裝，舊版自己關閉
  const t = Date.now();
  await page.click('#updateGo');
  const closed = new Promise((r) => app.once('close', r));
  const last = setInterval(() => page.textContent('.dialog p').then((x) => console.log(x)).catch(() => {}), 15000);
  await Promise.race([closed, new Promise((r) => setTimeout(r, 240000))]);
  clearInterval(last);
  console.log('舊版已結束', Math.round((Date.now() - t) / 1000), '秒');
  process.exit(0);
}
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((w) => w.destroy())).catch(() => {});
await app.close().catch(() => {});
process.exit(0);
