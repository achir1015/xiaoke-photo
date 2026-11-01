// 影像演算法：全部是純函式，輸入輸出都是 { data: Uint8ClampedArray(RGBA), width, height }
// 畫面、Worker 與 node 測試共用，不碰 DOM

const clamp = (v, a = 0, b = 255) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };

export function makeImage(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; }
export function cloneImage(img) { return { data: new Uint8ClampedArray(img.data), width: img.width, height: img.height }; }

// 單通道箱形模糊（積分式，與半徑無關）
export function boxBlur(src, w, h, r) {
  if (r < 1) return Float32Array.from(src);
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    for (let x = -r; x <= r; x++) sum += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / (2 * r + 1);
      sum += src[row + Math.min(x + r + 1, w - 1)] - src[row + Math.max(x - r, 0)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / (2 * r + 1);
      sum += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
    }
  }
  return out;
}

export function gaussian(src, w, h, sigma) {
  const r = Math.max(1, Math.round(sigma * 0.8));
  return boxBlur(boxBlur(boxBlur(src, w, h, r), w, h, r), w, h, r);
}

// 導向濾波：邊緣保留的平滑，耗時與半徑無關；用 guide 的邊緣去濾 p
export function guidedFilter(guide, p, w, h, r, eps) {
  const n = w * h;
  const mean = (a) => boxBlur(a, w, h, r);
  const mI = mean(guide), mP = mean(p);
  const ii = new Float32Array(n), ip = new Float32Array(n);
  for (let i = 0; i < n; i++) { ii[i] = guide[i] * guide[i]; ip[i] = guide[i] * p[i]; }
  const mII = mean(ii), mIP = mean(ip);
  const a = new Float32Array(n), b = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const varI = mII[i] - mI[i] * mI[i], covIP = mIP[i] - mI[i] * mP[i];
    a[i] = covIP / (varI + eps);
    b[i] = mP[i] - a[i] * mI[i];
  }
  const mA = mean(a), mB = mean(b), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = mA[i] * guide[i] + mB[i];
  return q;
}

function channels(img) {
  const n = img.width * img.height, r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n), a = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    r[i] = img.data[j] / 255; g[i] = img.data[j + 1] / 255; b[i] = img.data[j + 2] / 255; a[i] = img.data[j + 3] / 255;
  }
  return { r, g, b, a };
}

function luma(c) {
  const y = new Float32Array(c.r.length);
  for (let i = 0; i < y.length; i++) y[i] = 0.299 * c.r[i] + 0.587 * c.g[i] + 0.114 * c.b[i];
  return y;
}

// 膚色機率（YCbCr 橢圓＋亮度），回傳 0～1；再做一次平滑避免斑點
export function skinMask(img) {
  const { width: w, height: h, data } = img;
  const m = new Float32Array(w * h);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) {
    const r = data[j], g = data[j + 1], b = data[j + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.1687 * r - 0.3313 * g + 0.5 * b, cr = 128 + 0.5 * r - 0.4187 * g - 0.0813 * b;
    const dx = (cb - 110) / 22, dy = (cr - 150) / 20;
    const d = dx * dx + dy * dy;
    m[i] = (1 - smooth(0.7, 1.5, d)) * smooth(35, 70, y) * (data[j + 3] / 255);
  }
  return gaussian(m, w, h, Math.max(1.5, Math.min(w, h) / 200));
}

function toImage(c, width, height) {
  const out = makeImage(width, height);
  for (let i = 0, j = 0; i < c.r.length; i++, j += 4) {
    out.data[j] = c.r[i] * 255 + 0.5; out.data[j + 1] = c.g[i] * 255 + 0.5; out.data[j + 2] = c.b[i] * 255 + 0.5;
    out.data[j + 3] = (c.a ? c.a[i] : 1) * 255 + 0.5;
  }
  return out;
}

// 自動磨皮：只動膚色區，保留毛孔與毛髮的高頻細節（amount、detail：0～100）
export function portraitSmooth(img, { amount = 60, detail = 40, radius = 0 } = {}) {
  const { width: w, height: h } = img;
  const r = radius || Math.max(3, Math.round(Math.min(w, h) / 90));
  const c = channels(img), mask = skinMask(img);
  const eps = 0.002 + (amount / 100) ** 2 * 0.02;
  const k = amount / 100, keep = 0.15 + (detail / 100) * 0.7;
  for (const ch of [c.r, c.g, c.b]) {
    const soft = guidedFilter(ch, ch, w, h, r, eps);
    const base = gaussian(ch, w, h, 1.2);
    for (let i = 0; i < ch.length; i++) {
      const fine = (ch[i] - base[i]) * keep;
      ch[i] = clamp(lerp(ch[i], soft[i] + fine, k * mask[i]), 0, 1);
    }
  }
  return toImage(c, w, h);
}

// 人像精修：膚色冷暖、提亮、去油光、臉部補光
export function portraitPro(img, { brighten = 30, warmth = 0, shine = 40, light = 30 } = {}) {
  const { width: w, height: h, data } = img;
  const mask = skinMask(img);
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) { const m = mask[i] * mask[i]; sx += x * m; sy += y * m; sw += m; }
  const cx = sw ? sx / sw : w / 2, cy = sw ? sy / sw : h / 2, rad = Math.max(w, h) * 0.45;
  const out = cloneImage(img);
  const lift = brighten / 100 * 0.22, wT = warmth / 100 * 18, sh = shine / 100, li = light / 100 * 0.3;
  for (let y = 0, i = 0, j = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++, j += 4) {
      const m = mask[i];
      let r = data[j] / 255, g = data[j + 1] / 255, b = data[j + 2] / 255;
      const yv = 0.299 * r + 0.587 * g + 0.114 * b;
      if (m > 0.001) {
        const gain = 1 + lift * m * (1 - yv);
        r *= gain; g *= gain; b *= gain;
        r += wT / 255 * m; b -= wT / 255 * m;
        const oily = smooth(0.72, 0.95, yv) * m * sh;
        r = lerp(r, r * 0.86, oily); g = lerp(g, g * 0.84, oily); b = lerp(b, b * 0.84, oily);
      }
      const d = Math.hypot(x - cx, y - cy) / rad;
      const spot = 1 + li * (1 - smooth(0, 1, d)) * (0.4 + 0.6 * m);
      out.data[j] = clamp(r * spot) * 255 / 1; out.data[j + 1] = clamp(g * spot) * 255; out.data[j + 2] = clamp(b * spot) * 255;
      out.data[j] = clamp(r * spot, 0, 1) * 255; out.data[j + 1] = clamp(g * spot, 0, 1) * 255; out.data[j + 2] = clamp(b * spot, 0, 1) * 255;
    }
  }
  return out;
}

// 一鍵美顏：磨皮＋亮膚＋微銳化
export function oneClickBeauty(img, { strength = 60 } = {}) {
  const s = portraitSmooth(img, { amount: strength, detail: 50 });
  const p = portraitPro(s, { brighten: strength * 0.6, warmth: 8, shine: strength * 0.6, light: strength * 0.3 });
  return sharpen(p, { amount: strength * 0.4, radius: 1.2 });
}

// 降噪：亮度保邊、色度強力平滑（amount、detail：0～100）
export function denoise(img, { amount = 50, color = 70, detail = 50 } = {}) {
  const { width: w, height: h } = img;
  const c = channels(img), Y = luma(c), n = Y.length;
  const cb = new Float32Array(n), cr = new Float32Array(n);
  for (let i = 0; i < n; i++) { cb[i] = c.b[i] - Y[i]; cr[i] = c.r[i] - Y[i]; }
  const r = Math.max(2, Math.round(2 + amount / 20));
  const eps = 0.0003 + (amount / 100) ** 2 * 0.012;
  const yS = guidedFilter(Y, Y, w, h, r, eps);
  const cR = Math.max(2, Math.round(2 + color / 12));
  const cbS = guidedFilter(Y, cb, w, h, cR, 0.002), crS = guidedFilter(Y, cr, w, h, cR, 0.002);
  const keep = detail / 100 * 0.6, kc = color / 100;
  for (let i = 0; i < n; i++) {
    const y = yS[i] + (Y[i] - yS[i]) * keep;
    const b = lerp(cb[i], cbS[i], kc), rr = lerp(cr[i], crS[i], kc);
    c.r[i] = clamp(y + rr, 0, 1);
    c.b[i] = clamp(y + b, 0, 1);
    c.g[i] = clamp((y - 0.299 * c.r[i] - 0.114 * c.b[i]) / 0.587, 0, 1);
  }
  return toImage(c, w, h);
}

export function sharpen(img, { amount = 50, radius = 1.2 } = {}) {
  const { width: w, height: h } = img;
  const c = channels(img), k = amount / 100 * 1.6;
  for (const ch of [c.r, c.g, c.b]) {
    const b = gaussian(ch, w, h, radius);
    for (let i = 0; i < ch.length; i++) ch[i] = clamp(ch[i] + (ch[i] - b[i]) * k, 0, 1);
  }
  return toImage(c, w, h);
}

const lanczos = (x, a) => {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  const p = Math.PI * x;
  return (a * Math.sin(p) * Math.sin(p / a)) / (p * p);
};

function resampleAxis(src, sw, sh, dw, dh, horizontal) {
  // 只算一個方向；預先算好每一列（行）的權重
  const dn = horizontal ? dw : dh, sn = horizontal ? sw : sh;
  const scale = dn / sn, f = Math.min(1, scale), a = 3, support = a / f;
  const weights = new Array(dn);
  for (let i = 0; i < dn; i++) {
    const center = (i + 0.5) / scale - 0.5;
    const from = Math.floor(center - support) + 1, to = Math.floor(center + support);
    const list = []; let sum = 0;
    for (let s = from; s <= to; s++) { const v = lanczos((s - center) * f, a); list.push([clamp(s, 0, sn - 1), v]); sum += v; }
    for (const p of list) p[1] /= sum;
    weights[i] = list;
  }
  const out = new Float32Array(dw * dh * 4);
  if (horizontal) {
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (const [s, v] of weights[x]) { const j = (y * sw + s) * 4; r += src[j] * v; g += src[j + 1] * v; b += src[j + 2] * v; al += src[j + 3] * v; }
      const k = (y * dw + x) * 4; out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = al;
    }
  } else {
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (const [s, v] of weights[y]) { const j = (s * sw + x) * 4; r += src[j] * v; g += src[j + 1] * v; b += src[j + 2] * v; al += src[j + 3] * v; }
      const k = (y * dw + x) * 4; out[k] = r; out[k + 1] = g; out[k + 2] = b; out[k + 3] = al;
    }
  }
  return out;
}

// Lanczos3 放大或縮小（alpha 參與運算，先乘 alpha 免得透明邊界發黑）
export function resize(img, dw, dh) {
  const { width: sw, height: sh, data } = img;
  if (dw === sw && dh === sh) return cloneImage(img);
  const pre = new Float32Array(data.length);
  for (let j = 0; j < data.length; j += 4) {
    const a = data[j + 3] / 255;
    pre[j] = data[j] * a; pre[j + 1] = data[j + 1] * a; pre[j + 2] = data[j + 2] * a; pre[j + 3] = data[j + 3];
  }
  const h = resampleAxis(pre, sw, sh, dw, sh, true);
  const v = resampleAxis(h, dw, sh, dw, dh, false);
  const out = makeImage(dw, dh);
  for (let j = 0; j < v.length; j += 4) {
    const a = clamp(v[j + 3]), k = a > 0 ? 255 / a : 0;
    out.data[j] = v[j] * k; out.data[j + 1] = v[j + 1] * k; out.data[j + 2] = v[j + 2] * k; out.data[j + 3] = a;
  }
  return out;
}

// 無損放大：Lanczos＋沿邊緣的細節重建
export function upscale(img, { scale = 2, sharpness = 40, denoiseFirst = 0 } = {}) {
  const base = denoiseFirst > 0 ? denoise(img, { amount: denoiseFirst, color: 60, detail: 60 }) : img;
  const out = resize(base, Math.round(img.width * scale), Math.round(img.height * scale));
  return sharpness > 0 ? sharpen(out, { amount: sharpness, radius: 0.8 + scale * 0.35 }) : out;
}

// 調色：底片與暗房都用同一組參數
export const FILM_LOOKS = {
  '經典底片': { contrast: 10, saturation: -8, temp: 6, tint: 2, fade: 8, shadow: [8, 4, -6], high: [6, 3, -4], grain: 18, vignette: 22 },
  '暖陽金調': { contrast: 8, saturation: 6, temp: 16, tint: 2, fade: 5, shadow: [10, 2, -8], high: [14, 8, -6], grain: 10, vignette: 16 },
  '清新日系': { contrast: -10, saturation: -6, temp: -4, tint: -2, fade: 16, shadow: [-2, 4, 8], high: [2, 3, 2], grain: 6, vignette: 0 },
  '青橘電影': { contrast: 14, saturation: 2, temp: 2, tint: 0, fade: 4, shadow: [-14, 2, 16], high: [16, 6, -14], grain: 8, vignette: 26 },
  '褪色復古': { contrast: -16, saturation: -24, temp: 10, tint: 4, fade: 24, shadow: [12, 6, 0], high: [8, 4, -8], grain: 24, vignette: 30 },
  '高飽和風景': { contrast: 14, saturation: 26, temp: 2, tint: 0, fade: 0, shadow: [0, 0, 4], high: [4, 2, 0], grain: 0, vignette: 10 },
};
export const BW_LOOKS = {
  '經典黑白': { contrast: 16, bw: [0.3, 0.59, 0.11], grain: 12, vignette: 14 },
  '高反差黑白': { contrast: 42, bw: [0.5, 0.45, 0.05], grain: 20, vignette: 26 },
  '柔和銀鹽': { contrast: -4, bw: [0.25, 0.55, 0.2], fade: 12, grain: 16, vignette: 8 },
  '紅濾鏡天空': { contrast: 26, bw: [0.9, 0.2, -0.1], grain: 10, vignette: 16 },
  '棕褐老照片': { contrast: 6, bw: [0.3, 0.59, 0.11], fade: 14, shadow: [18, 8, -8], high: [20, 12, -6], grain: 20, vignette: 34 },
  '硒色調': { contrast: 12, bw: [0.3, 0.59, 0.11], shadow: [6, -4, 10], high: [4, 0, 6], grain: 10, vignette: 18 },
};

// 可重現的雜訊（同一張圖預覽與套用結果相同）
function noiseAt(i) { const x = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x) - 0.5; }

export function grade(img, look, strength = 100) {
  const { width: w, height: h, data } = img;
  const out = cloneImage(img), k = strength / 100;
  const contrast = 1 + (look.contrast || 0) / 100, sat = 1 + (look.saturation || 0) / 100;
  const temp = (look.temp || 0) / 255, tint = (look.tint || 0) / 255, fade = (look.fade || 0) / 100;
  const sh = (look.shadow || [0, 0, 0]).map((v) => v / 255), hi = (look.high || [0, 0, 0]).map((v) => v / 255);
  const grainAmt = (look.grain || 0) / 100 * 0.14, vig = (look.vignette || 0) / 100;
  const scale = Math.max(w, h) / 1600;
  const cx = w / 2, cy = h / 2, maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0, j = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, j += 4, i++) {
      let r = data[j] / 255, g = data[j + 1] / 255, b = data[j + 2] / 255;
      if (look.bw) { const v = clamp(r * look.bw[0] + g * look.bw[1] + b * look.bw[2], 0, 1); r = g = b = v; }
      r += temp; g += tint; b -= temp;
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
      const c = (v) => (v - 0.5) * contrast + 0.5;
      r = c(r); g = c(g); b = c(b);
      const lo = 1 - clamp(l * 2, 0, 1), up = clamp(l * 2 - 1, 0, 1);
      r += sh[0] * lo + hi[0] * up; g += sh[1] * lo + hi[1] * up; b += sh[2] * lo + hi[2] * up;
      if (fade) { r = fade * 0.12 + r * (1 - fade * 0.28); g = fade * 0.12 + g * (1 - fade * 0.28); b = fade * 0.12 + b * (1 - fade * 0.28); }
      if (grainAmt) {
        const cell = (Math.floor(x / Math.max(1, scale)) + Math.floor(y / Math.max(1, scale)) * 7919);
        const n = noiseAt(cell) * grainAmt * (1 - Math.abs(l - 0.5));
        r += n; g += n; b += n;
      }
      if (vig) {
        const d = Math.hypot(x - cx, y - cy) / maxD, v = 1 - vig * smooth(0.45, 1.05, d);
        r *= v; g *= v; b *= v;
      }
      out.data[j] = lerp(data[j], clamp(r, 0, 1) * 255, k);
      out.data[j + 1] = lerp(data[j + 1], clamp(g, 0, 1) * 255, k);
      out.data[j + 2] = lerp(data[j + 2], clamp(b, 0, 1) * 255, k);
    }
  }
  return out;
}

function sample(img, x, y) {
  // 雙線性取樣，回傳 [r,g,b,a]
  const { width: w, height: h, data } = img;
  x = clamp(x, 0, w - 1.001); y = clamp(y, 0, h - 1.001);
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, p = (y0 * w + x0) * 4, q = p + w * 4;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    out[c] = lerp(lerp(data[p + c], data[p + 4 + c], fx), lerp(data[q + c], data[q + 4 + c], fx), fy);
  }
  return out;
}

// 水波倒影：在 horizon 以下畫出帶波紋的鏡像（horizon 0～100，從上往下算）
export function flood(img, { horizon = 62, waves = 45, size = 40, darken = 30 } = {}) {
  const { width: w, height: h } = img;
  const out = cloneImage(img), hy = Math.round(h * clamp(horizon, 5, 95) / 100);
  const amp = waves / 100 * h * 0.03, freq = (120 - size) / 100 * 0.35;
  for (let y = hy, j = hy * w * 4; y < h; y++) {
    const t = (y - hy) / Math.max(1, h - hy);
    const persp = 1 + t * 2.2;
    for (let x = 0; x < w; x++, j += 4) {
      const wave = Math.sin(y * freq / persp + x * 0.012) + 0.5 * Math.sin(y * freq * 2.3 / persp - x * 0.031 + 1.7) + 0.25 * Math.sin(y * freq * 5.1 / persp + x * 0.07);
      const dx = wave * amp * persp * 0.6, dy = wave * amp * 0.5;
      const sy = hy - (y - hy) * 0.92 + dy;
      const s = sample(img, x + dx, sy);
      const shade = 1 - (darken / 100) * (0.45 + 0.55 * t);
      const glint = Math.max(0, wave - 1.05) * 40 * (waves / 100);
      out.data[j] = s[0] * shade * 0.94 + glint; out.data[j + 1] = s[1] * shade * 0.98 + glint; out.data[j + 2] = s[2] * shade + glint;
      out.data[j + 3] = 255;
    }
  }
  return out;
}

// 全景變形：littlePlanet 小行星、tunnel 隧道、unwrap 把環形展開成長條、fisheye 魚眼
export function flexify(img, { mode = 'littlePlanet', rotate = 0, zoom = 100 } = {}) {
  const { width: w, height: h } = img;
  const out = makeImage(w, h), cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 * (zoom / 100);
  const rot = rotate / 360 * Math.PI * 2;
  for (let y = 0, j = 0; y < h; y++) {
    for (let x = 0; x < w; x++, j += 4) {
      let sx, sy;
      const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) / R;
      if (mode === 'unwrap') {
        const a = x / w * Math.PI * 2 + rot, rr = (1 - y / h) * R;
        sx = cx + Math.cos(a) * rr; sy = cy + Math.sin(a) * rr;
      } else if (mode === 'fisheye') {
        const k = d === 0 ? 1 : Math.atan(d * 1.4) / (d * 1.4) * 1.45;
        sx = cx + dx * k; sy = cy + dy * k;
      } else {
        const a = (Math.atan2(dy, dx) + Math.PI + rot) / (Math.PI * 2);
        const u = a - Math.floor(a);
        const v = mode === 'tunnel' ? clamp(d, 0, 1) : clamp(1 - d, 0, 1);
        sx = u * (w - 1); sy = v * (h - 1);
      }
      if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) { out.data[j + 3] = 0; continue; }
      const s = sample(img, sx, sy);
      out.data[j] = s[0]; out.data[j + 1] = s[1]; out.data[j + 2] = s[2]; out.data[j + 3] = s[3];
    }
  }
  return out;
}

// 重新打光：由亮度梯度估法線，依光源方向加亮／壓暗
export function relight(img, { angle = 315, elevation = 45, strength = 50, warmth = 10 } = {}) {
  const { width: w, height: h } = img;
  const c = channels(img), Y = gaussian(luma(c), w, h, Math.max(1, Math.min(w, h) / 300));
  const a = angle / 180 * Math.PI, el = elevation / 180 * Math.PI;
  const lx = Math.cos(a) * Math.cos(el), ly = Math.sin(a) * Math.cos(el), lz = Math.sin(el);
  const k = strength / 100 * 1.4, wT = warmth / 100 * 0.12, depth = 6;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      const gx = (Y[y * w + Math.min(x + 1, w - 1)] - Y[y * w + Math.max(x - 1, 0)]) * depth;
      const gy = (Y[Math.min(y + 1, h - 1) * w + x] - Y[Math.max(y - 1, 0) * w + x]) * depth;
      const n = Math.hypot(gx, gy, 1);
      const dot = (-gx * lx + -gy * ly + lz) / n;
      // 大範圍的方向光：離光源近的一側較亮
      const side = ((x / w - 0.5) * Math.cos(a) + (y / h - 0.5) * Math.sin(a)) * 0.7;
      const gain = 1 + k * (dot - lz + side);
      c.r[i] = clamp(c.r[i] * gain + wT * Math.max(0, gain - 1), 0, 1);
      c.g[i] = clamp(c.g[i] * gain, 0, 1);
      c.b[i] = clamp(c.b[i] * gain - wT * Math.max(0, gain - 1), 0, 1);
    }
  }
  return toImage(c, w, h);
}

// 髮絲摳圖：coarse 是粗略選取（0～1），用原圖當導向把邊緣細到毛髮
export function refineMatte(img, coarse, { radius = 0, feather = 0.0008, contrast = 30 } = {}) {
  const { width: w, height: h } = img;
  const r = radius || Math.max(4, Math.round(Math.min(w, h) / 60));
  const Y = luma(channels(img));
  const q = guidedFilter(Y, coarse, w, h, r, feather);
  const lo = contrast / 400, hi = 1 - lo;
  const out = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) out[i] = smooth(lo, hi, q[i]);
  return out;
}

// 只把四角附近的背景顏色摳掉，當作沒有主體選取時的備援（回傳 0～1 的前景遮罩）
export function backgroundKey(img, tolerance = 40) {
  const { width: w, height: h, data } = img;
  const pick = (x, y) => { const j = (y * w + x) * 4; return [data[j], data[j + 1], data[j + 2]]; };
  const s = Math.max(2, Math.round(Math.min(w, h) / 40)), seeds = [];
  for (const [x, y] of [[s, s], [w - 1 - s, s], [s, h - 1 - s], [w - 1 - s, h - 1 - s], [w >> 1, s]]) seeds.push(pick(x, y));
  const m = new Float32Array(w * h);
  for (let i = 0, j = 0; i < m.length; i++, j += 4) {
    let best = 1e9;
    for (const c of seeds) { const d = Math.hypot(data[j] - c[0], data[j + 1] - c[1], data[j + 2] - c[2]); if (d < best) best = d; }
    m[i] = smooth(tolerance * 0.6, tolerance * 1.4, best);
  }
  return m;
}

// 把遮罩（0～1）寫進 alpha
export function applyAlpha(img, mask) {
  const out = cloneImage(img);
  for (let i = 0, j = 3; i < mask.length; i++, j += 4) out.data[j] = img.data[j] * clamp(mask[i], 0, 1);
  return out;
}

// 羽化：把遮罩向外擴張 grow 像素後模糊 feather
export function featherMask(mask, w, h, grow = 0, feather = 0) {
  let m = Float32Array.from(mask);
  if (grow > 0) {
    const b = boxBlur(m, w, h, Math.round(grow));
    for (let i = 0; i < m.length; i++) m[i] = b[i] > 0.02 ? 1 : m[i];
  }
  return feather > 0 ? gaussian(m, w, h, feather) : m;
}

// AI 結果只留遮罩內：其他地方完全透明，疊回去像素不變
export function blendInpaint(result, mask, grow, feather) {
  return applyAlpha(result, featherMask(mask, result.width, result.height, grow, feather));
}

// 合成：over 蓋在 base 上（兩張同尺寸）
export function compositeOver(base, over) {
  const out = cloneImage(base);
  for (let j = 0; j < out.data.length; j += 4) {
    const a = over.data[j + 3] / 255;
    for (let c = 0; c < 3; c++) out.data[j + c] = lerp(base.data[j + c], over.data[j + c], a);
    out.data[j + 3] = Math.max(base.data[j + 3], over.data[j + 3]);
  }
  return out;
}

// 依 AI 模型規定挑尺寸：gpt-image-1 系列只有三種，gpt-image-2 系列可自訂（16 倍數、長邊上限、比例上限 3:1）
export function pickApiSize(w, h, model = 'gpt-image-2', longest = 2048) {
  if (!/^gpt-image-2/.test(model)) {
    const ratio = w / h;
    if (ratio > 1.2) return { width: 1536, height: 1024 };
    if (ratio < 0.83) return { width: 1024, height: 1536 };
    return { width: 1024, height: 1024 };
  }
  let ratio = clamp(w / h, 1 / 3, 3);
  let lw = ratio >= 1 ? longest : longest * ratio, lh = ratio >= 1 ? longest / ratio : longest;
  // 像素太少時放大到約 0.66 百萬像素以上
  const minPx = 655360;
  if (lw * lh < minPx) { const k = Math.sqrt(minPx / (lw * lh)); lw *= k; lh *= k; }
  const snap = (v) => Math.max(16, Math.round(v / 16) * 16);
  return { width: snap(lw), height: snap(lh) };
}

// 自動切圖：把一張網格圖切成 cols×rows 張
export function sliceGrid(img, cols, rows) {
  const out = [], tw = Math.floor(img.width / cols), th = Math.floor(img.height / rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = makeImage(tw, th);
      for (let y = 0; y < th; y++) {
        const from = ((r * th + y) * img.width + c * tw) * 4;
        t.data.set(img.data.subarray(from, from + tw * 4), y * tw * 4);
      }
      out.push(t);
    }
  }
  return out;
}

// Worker 與畫面用名稱呼叫
export const OPS = {
  portraitSmooth, portraitPro, oneClickBeauty, denoise, sharpen, upscale, flood, flexify, relight,
  film: (img, { look, strength }) => grade(img, FILM_LOOKS[look] || FILM_LOOKS['經典底片'], strength),
  darkroom: (img, { look, strength }) => grade(img, BW_LOOKS[look] || BW_LOOKS['經典黑白'], strength),
};
