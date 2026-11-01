// 產生手機版（Android／iPhone／iPad）與線上版用的網頁：mobile/www
// 和桌面版同一份程式；把 ../../ 的路徑改成相對路徑，放進引擎。用法：node scripts/build-mobile.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'mobile', 'www');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Node 22 的 fs.cpSync 在中文路徑會當掉，自己遞迴複製
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(ROOT, 'src', 'app'), OUT);
fs.rmSync(path.join(OUT, 'package.json'), { force: true });
copyDir(path.join(ROOT, 'engine'), path.join(OUT, 'engine'));
fs.copyFileSync(path.join(ROOT, 'build', 'icon.png'), path.join(OUT, 'icon.png'));

const walk = (d, fn) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, fn); else fn(p); } };
for (const f of ['index.html', 'js/app.js', 'js/guide.js']) {
  const p = path.join(OUT, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replaceAll('../../build/icon.png', 'icon.png').replaceAll('../../build/robot.png', 'robot.png').replaceAll('../../engine/', 'engine/'));
}
fs.copyFileSync(path.join(ROOT, 'build', 'robot.png'), path.join(OUT, 'robot.png'));

// 版本號
fs.writeFileSync(path.join(OUT, 'js', 'version.js'), `window.XIAOKE_VERSION = ${JSON.stringify(pkg.version)};\n`);
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ version: pkg.version }) + '\n'); // 線上版檢查更新用
let html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
html = html.replace('<script type="module" src="js/app.js"></script>', '<script src="js/version.js"></script>\n<script type="module" src="js/app.js"></script>');
html = html.replace('<link rel="stylesheet" href="style.css">', '<link rel="stylesheet" href="style.css">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icon.png">');
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), JSON.stringify({
  name: '小柯機器人圖像編輯助手', short_name: '小柯圖像編輯', start_url: './', scope: './', display: 'fullscreen', orientation: 'landscape',
  background_color: '#20232b', theme_color: '#20232b', lang: 'zh-Hant',
  icons: [{ src: 'icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' }],
}, null, 1));

let n = 0, bytes = 0;
walk(OUT, (p) => { n++; bytes += fs.statSync(p).size; });
console.log(`手機版網頁 v${pkg.version}：${n} 個檔案、${(bytes / 1048576).toFixed(1)} MB → ${OUT}`);
