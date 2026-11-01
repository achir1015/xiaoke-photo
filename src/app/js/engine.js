// 引擎包裝：iframe 裡的影像引擎（window.xiaokeEngine）與像素工具
const LANGUAGE = 'zh-hant';

export async function decodePng(bytes) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: 'image/png' });
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { data: d.data, width: d.width, height: d.height };
}

export async function encodePng(img) {
  const c = new OffscreenCanvas(img.width, img.height);
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  const blob = await c.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

export function base64ToBytes(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export class Engine {
  constructor(iframe) { this.frame = iframe; this.api = null; }

  // 等引擎第一個畫格跑起來，並固定成繁體中文
  async ready(timeoutMs = 120000) {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const w = this.frame.contentWindow;
      if (w && w.xiaokeEngine) { this.api = w.xiaokeEngine; break; }
      if (Date.now() > end) throw new Error('影像引擎啟動逾時');
      await new Promise((r) => setTimeout(r, 100));
    }
    await this.command('prefs.set', { path: 'interface.language', value: LANGUAGE }).catch(() => {});
    return this;
  }

  async call(method, params) {
    const raw = await this.api.call(method, params === undefined ? undefined : JSON.stringify(params));
    const r = JSON.parse(raw);
    if (!r.ok) throw new Error(r.error || '引擎沒有回應');
    return r.result;
  }

  command(command, params = {}) { return this.call('engine.execute', { command, params }); }
  menu(id) { return this.call('ui.menu.invoke', { command: id }); }
  focus() { this.frame.contentWindow && this.frame.contentWindow.focus(); }

  async documentInfo() {
    try { return await this.command('document.inspect'); } catch { return null; }
  }

  // 合成圖；maxSide 0 表示原尺寸
  async composite(maxSide = 0) {
    const bytes = await this.api.render(maxSide);
    return bytes ? decodePng(bytes) : null;
  }

  // 選取範圍 → 0～1 的遮罩（文件尺寸），沒有選取回傳 null
  async selection() {
    const bytes = await this.api.selection();
    if (!bytes) return null;
    const img = await decodePng(bytes);
    const m = new Float32Array(img.width * img.height);
    let any = false;
    for (let i = 0, j = 0; i < m.length; i++, j += 4) { m[i] = img.data[j] / 255; if (m[i] > 0) any = true; }
    return any ? { mask: m, width: img.width, height: img.height } : null;
  }

  // 置入成新圖層：檔名就是圖層名稱
  async place(name, img) {
    const bytes = img instanceof Uint8Array ? img : await encodePng(img);
    this.api.place(`${name}.png`, bytes);
  }

  async open(name, bytes) { this.api.open(name, bytes instanceof Uint8Array ? bytes : await encodePng(bytes)); }
}
