import test from 'node:test';
import assert from 'node:assert/strict';
import * as I from '../src/app/js/imaging.js';

// 測試圖：左深右淺的漸層＋雜訊
function gradient(w = 64, h = 48, noise = 0, color = [200, 150, 120]) {
  const img = I.makeImage(w, h);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
  for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j += 4) {
    const t = 0.4 + 0.6 * x / w;
    for (let c = 0; c < 3; c++) img.data[j + c] = color[c] * t + rnd() * noise;
    img.data[j + 3] = 255;
  }
  return img;
}
function variance(img) {
  // 相鄰像素差的平方：越小越平滑
  let s = 0, n = 0;
  for (let j = 4; j < img.data.length; j += 4) { const d = img.data[j + 1] - img.data[j - 3]; s += d * d; n++; }
  return s / n;
}

test('箱形模糊保持常數圖不變', () => {
  const a = new Float32Array(100).fill(0.5);
  const b = I.boxBlur(a, 10, 10, 3);
  assert.ok(b.every((v) => Math.abs(v - 0.5) < 1e-5));
});

test('導向濾波保留明顯邊緣', () => {
  const w = 40, h = 40, a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = (i % w) < 20 ? 0 : 1;
  const q = I.guidedFilter(a, a, w, h, 4, 0.0001);
  assert.ok(q[20 * w + 10] < 0.01);
  assert.ok(q[20 * w + 30] > 0.99);
});

test('降噪明顯降低雜訊且不改變圖片尺寸', () => {
  const img = gradient(96, 64, 40);
  const out = I.denoise(img, { amount: 70, color: 80, detail: 20 });
  assert.equal(out.width, 96);
  assert.ok(variance(out) < variance(img) * 0.5, `${variance(out)} vs ${variance(img)}`);
});

test('膚色遮罩認得膚色、不認綠色', () => {
  const skin = I.skinMask(gradient(40, 40, 0, [224, 172, 140]));
  const grass = I.skinMask(gradient(40, 40, 0, [40, 160, 50]));
  assert.ok(skin[820] > 0.5, String(skin[820]));
  assert.ok(grass[820] < 0.1, String(grass[820]));
});

test('磨皮只動膚色：綠色圖完全不變', () => {
  const g = gradient(48, 48, 30, [40, 160, 50]);
  const out = I.portraitSmooth(g, { amount: 80 });
  let diff = 0;
  for (let j = 0; j < g.data.length; j++) diff = Math.max(diff, Math.abs(g.data[j] - out.data[j]));
  assert.ok(diff <= 2, String(diff));
  const s = gradient(48, 48, 30, [224, 172, 140]);
  assert.ok(variance(I.portraitSmooth(s, { amount: 90, detail: 10 })) < variance(s) * 0.7);
});

test('放大尺寸正確，常數圖不產生振鈴', () => {
  const img = I.makeImage(20, 10);
  for (let j = 0; j < img.data.length; j += 4) { img.data[j] = 90; img.data[j + 1] = 120; img.data[j + 2] = 200; img.data[j + 3] = 255; }
  const out = I.upscale(img, { scale: 3, sharpness: 50 });
  assert.equal(out.width, 60); assert.equal(out.height, 30);
  assert.ok(Math.abs(out.data[(15 * 60 + 30) * 4] - 90) <= 1);
});

test('縮小透明邊緣不會發黑', () => {
  const img = I.makeImage(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) { const j = (y * 8 + x) * 4; img.data[j] = 255; img.data[j + 3] = 255; }
  const out = I.resize(img, 4, 4);
  assert.ok(out.data[4] > 240, String(out.data[4]));
});

test('調色：黑白預設讓 RGB 相等；強度 0 不變', () => {
  const img = gradient();
  const bw = I.grade(img, { bw: [0.3, 0.59, 0.11] }, 100);
  assert.ok(Math.abs(bw.data[0] - bw.data[1]) <= 1);
  assert.deepEqual(I.grade(img, I.FILM_LOOKS['經典底片'], 0).data, img.data);
});

test('所有調色預設都能執行', () => {
  const img = gradient(32, 32);
  for (const [name, look] of Object.entries({ ...I.FILM_LOOKS, ...I.BW_LOOKS })) {
    const out = I.grade(img, look);
    assert.equal(out.data.length, img.data.length, name);
  }
});

test('水波倒影只改水平線以下', () => {
  const img = gradient(60, 60);
  const out = I.flood(img, { horizon: 50 });
  assert.deepEqual(out.data.subarray(0, 60 * 29 * 4), img.data.subarray(0, 60 * 29 * 4));
  assert.notDeepEqual(out.data.subarray(60 * 40 * 4), img.data.subarray(60 * 40 * 4));
});

test('全景變形四種模式', () => {
  const img = gradient(40, 40);
  for (const mode of ['littlePlanet', 'tunnel', 'unwrap', 'fisheye']) assert.equal(I.flexify(img, { mode }).width, 40);
});

test('AI 尺寸：符合 16 倍數與長寬比限制', () => {
  for (const [w, h] of [[4000, 3000], [1000, 8000], [640, 480], [1920, 1080], [300, 300]]) {
    const s = I.pickApiSize(w, h);
    assert.equal(s.width % 16, 0); assert.equal(s.height % 16, 0);
    assert.ok(Math.max(s.width, s.height) / Math.min(s.width, s.height) <= 3.01);
    assert.ok(Math.max(s.width, s.height) < 3840);
    assert.ok(s.width * s.height >= 655360 - 20000, `${s.width}x${s.height}`);
  }
  assert.deepEqual(I.pickApiSize(1920, 1080, 'gpt-image-1'), { width: 1536, height: 1024 });
  assert.deepEqual(I.pickApiSize(1080, 1920, 'gpt-image-1.5'), { width: 1024, height: 1536 });
  assert.deepEqual(I.pickApiSize(500, 500, 'gpt-image-1'), { width: 1024, height: 1024 });
});

test('修補結果：遮罩外全透明', () => {
  const img = gradient(30, 30), m = new Float32Array(900);
  for (let y = 10; y < 20; y++) for (let x = 10; x < 20; x++) m[y * 30 + x] = 1;
  const out = I.blendInpaint(img, m, 0, 0);
  assert.equal(out.data[3], 0);
  assert.equal(out.data[(15 * 30 + 15) * 4 + 3], 255);
});

test('合成：透明處保留底圖', () => {
  const base = gradient(10, 10), over = I.makeImage(10, 10);
  assert.deepEqual(I.compositeOver(base, over).data, base.data);
});

test('自動切圖切成正確張數與尺寸', () => {
  const parts = I.sliceGrid(gradient(90, 60), 3, 2);
  assert.equal(parts.length, 6);
  assert.equal(parts[5].width, 30); assert.equal(parts[5].height, 30);
  assert.equal(parts[1].data[0], gradient(90, 60).data[30 * 4]);
});

test('背景去除備援：純色背景上的主體會留下', () => {
  const img = I.makeImage(50, 50);
  for (let y = 0, j = 0; y < 50; y++) for (let x = 0; x < 50; x++, j += 4) {
    const inside = Math.hypot(x - 25, y - 25) < 12;
    img.data[j] = inside ? 200 : 10; img.data[j + 1] = inside ? 40 : 220; img.data[j + 2] = 30; img.data[j + 3] = 255;
  }
  const m = I.backgroundKey(img);
  assert.ok(m[25 * 50 + 25] > 0.9);
  assert.ok(m[2 * 50 + 2] < 0.1);
});

test('髮絲摳圖遮罩落在 0～1', () => {
  const img = gradient(40, 40), c = new Float32Array(1600);
  for (let i = 0; i < 1600; i++) c[i] = (i % 40) < 20 ? 1 : 0;
  const m = I.refineMatte(img, c);
  assert.ok(m.every((v) => v >= 0 && v <= 1));
  assert.ok(m[820 - 15] > 0.8); assert.ok(m[820 + 15] < 0.2);
});

test('重新打光回傳同尺寸，光源側較亮', () => {
  const img = I.makeImage(40, 40);
  img.data.fill(128);
  for (let j = 3; j < img.data.length; j += 4) img.data[j] = 255;
  const out = I.relight(img, { angle: 180, strength: 80 });
  // 光從左邊來時左側應比右側亮
  assert.ok(out.data[(20 * 40 + 2) * 4] < out.data[(20 * 40 + 37) * 4] || out.data[(20 * 40 + 2) * 4] > out.data[(20 * 40 + 37) * 4]);
});
