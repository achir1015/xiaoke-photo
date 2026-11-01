// 準備 engine/：優先用本機編譯好的引擎（../photocraft-src/dist/web），否則下載 Release 上的 engine.zip
// 引擎是 PhotoCraft 加上 engine-patch/ 的補丁編譯而成，字型放在 engine/fonts/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'engine');
const LOCAL = path.join(ROOT, '..', 'photocraft-src', 'dist', 'web');
const FONTS = path.join(ROOT, 'fonts-build');
const REMOTE = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine-patch', 'engine.json'), 'utf8'));

// Node 22 的 fs.cpSync 在中文路徑會當掉，自己遞迴複製
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

function addFonts() {
  const dir = path.join(OUT, 'fonts');
  fs.mkdirSync(dir, { recursive: true });
  const list = [
    ['Noto Sans TC', 'Regular', 'NotoSansTC-Regular.ttf', 'Hant'],
    ['Noto Sans TC', 'Bold', 'NotoSansTC-Bold.ttf', 'Hant'],
    ['Noto Serif TC', 'Regular', 'NotoSerifTC-Regular.ttf', 'Hant'],
  ];
  for (const [, , file] of list) fs.copyFileSync(path.join(FONTS, file), path.join(dir, file));
  fs.copyFileSync(path.join(ROOT, 'assets-src', 'OFL.txt'), path.join(dir, 'OFL.txt'));
  fs.writeFileSync(path.join(dir, 'manifest.txt'), list.map(([f, s, file, sc]) => `${f} | ${s} | fonts/${file} | ${sc} | OFL-1.1 | fonts/OFL.txt`).join('\n') + '\n');
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  if (fs.existsSync(path.join(LOCAL, 'index.html'))) {
    copyDir(LOCAL, OUT);
    addFonts();
    console.log('已使用本機編譯的引擎');
    return;
  }
  console.log('下載引擎', REMOTE.url);
  // 剛上傳的 Release 檔案可能要等一下才查得到
  let res;
  for (let i = 0; i < 6; i++) {
    res = await fetch(REMOTE.url);
    if (res.ok) break;
    await new Promise((r) => setTimeout(r, 10000));
  }
  if (!res.ok) throw new Error(`下載失敗 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== REMOTE.sha256) throw new Error(`引擎校驗碼不符：${sha}`);
  const zip = path.join(ROOT, 'engine.zip');
  fs.writeFileSync(zip, buf);
  fs.mkdirSync(OUT, { recursive: true });
  if (process.platform === 'win32') execFileSync('C:\\Windows\\System32\\tar.exe', ['-xf', zip, '-C', OUT]);
  else execFileSync('unzip', ['-q', zip, '-d', OUT]);
  fs.rmSync(zip);
  console.log('引擎已就緒');
}

main().catch((e) => { console.error(e); process.exit(1); });
