// AI 流程：文生圖、局部重繪／移除、整張編輯。金鑰由 xk.ai 保管，這裡只處理影像
import { encodePng, decodePng, base64ToBytes } from './engine.js';
import { pickApiSize } from './imaging.js';

let seq = 0;
const newId = () => `ai-${Date.now()}-${++seq}`;

export class AI {
  constructor(engine, run) { this.engine = engine; this.run = run; this.current = null; }

  cancel() { if (this.current) window.xk.ai.cancel(this.current); }

  async withId(fn) {
    const id = this.current = newId();
    try { return await fn(id); } finally { this.current = null; }
  }

  // 文生圖：回傳 [{ bytes, img }]
  async generate({ model, prompt, size, quality, n, background }) {
    const r = await this.withId((id) => window.xk.ai.generate(id, { model, prompt, size, quality, n, background }));
    const list = [];
    for (const b64 of r.images) { const bytes = base64ToBytes(b64); list.push({ bytes, img: await decodePng(bytes) }); }
    return list;
  }

  // 整張編輯：回傳已還原成文件尺寸的影像
  async editWhole({ model, prompt, quality, background, longest, keepSize = true }) {
    const doc = await this.engine.composite(0);
    if (!doc) throw new Error('請先開啟或新增一張圖片');
    const size = pickApiSize(doc.width, doc.height, model, longest || 2048);
    const image = await encodePng(await this.run('resizeTo', doc, size));
    const r = await this.withId((id) => window.xk.ai.edit(id, {
      model, prompt, quality, background, n: 1, size: `${size.width}x${size.height}`, image,
    }));
    const out = await decodePng(base64ToBytes(r.images[0]));
    return keepSize ? this.run('resizeTo', out, { width: doc.width, height: doc.height }) : out;
  }

  // 局部編輯：mask 是文件尺寸、1＝要重畫的地方；結果只留遮罩內，蓋回去其他像素完全不變
  async inpaint({ model, prompt, quality, mask }) {
    const doc = await this.engine.composite(0);
    if (!doc) throw new Error('請先開啟或新增一張圖片');
    const { width: W, height: H } = doc;
    const size = pickApiSize(W, H, model);
    const image = await encodePng(await this.run('resizeTo', doc, size));
    const hole = await encodePng(alphaMask(mask, W, H, size.width, size.height));
    const r = await this.withId((id) => window.xk.ai.edit(id, {
      model, prompt, quality, n: 1, size: `${size.width}x${size.height}`, image, mask: hole,
    }));
    const out = await decodePng(base64ToBytes(r.images[0]));
    const full = await this.run('resizeTo', out, { width: W, height: H });
    const edge = Math.max(2, Math.round(Math.min(W, H) / 200));
    return this.run('inpaintFinish', full, { mask, grow: edge, feather: edge });
  }
}

// OpenAI 的遮罩：透明處才會重畫；稍微外擴，避免邊緣留下物件殘影
export function alphaMask(mask, W, H, w, h) {
  const out = { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  const r = Math.max(2, Math.round(Math.min(w, h) / 120));
  const hit = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(H - 1, Math.floor((y + 0.5) * H / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(W - 1, Math.floor((x + 0.5) * W / w));
      if (mask[sy * W + sx] > 0.3) hit[y * w + x] = 1;
    }
  }
  for (let y = 0, j = 0; y < h; y++) {
    for (let x = 0; x < w; x++, j += 4) {
      let on = false;
      for (let dy = -r; dy <= r && !on; dy += r) for (let dx = -r; dx <= r && !on; dx += r) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < h && xx >= 0 && xx < w && hit[yy * w + xx]) on = true;
      }
      out.data[j] = out.data[j + 1] = out.data[j + 2] = 255;
      out.data[j + 3] = on ? 0 : 255;
    }
  }
  return out;
}

export function removalPrompt(target, note) {
  const what = note ? `${target} (${note})` : target;
  return `Remove the ${what} in the masked area and rebuild what is behind it so the picture looks complete and natural. `
    + 'Continue the surrounding background, textures, lighting and perspective seamlessly. Do not add any new objects or text. Keep everything outside the mask unchanged.';
}

export function inpaintPrompt(text) {
  return `In the masked area only: ${text}. Match the lighting, color, perspective and style of the rest of the picture. Keep everything outside the mask unchanged.`;
}

export function apiError(e) {
  const m = String((e && e.message) || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  if (/abort/i.test(m)) return '已取消';
  if (/fetch failed|Failed to fetch|ENOTFOUND|ETIMEDOUT/i.test(m)) return '連不上 OpenAI，請檢查網路';
  return m;
}
