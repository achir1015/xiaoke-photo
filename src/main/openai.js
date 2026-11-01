'use strict';
// OpenAI 影像 API：金鑰只留在主程序；畫面只傳提示詞與圖片，拿回 PNG
const BASE = process.env.XIAOKE_OPENAI_BASE || 'https://api.openai.com/v1'; // 測試時指向本機假伺服器

class OpenAIImages {
  constructor(getKey) {
    this.getKey = getKey;
    this.running = new Map(); // 請求編號 → AbortController
  }

  headers() {
    const key = this.getKey();
    if (!key) throw new Error('尚未設定 OpenAI API 金鑰');
    return { Authorization: `Bearer ${key}` };
  }

  async read(res) {
    let body = null;
    try { body = await res.json(); } catch { /* 下面用狀態碼回報 */ }
    if (res.ok) return body;
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('OpenAI API 金鑰無效，請到右上角「OpenAI 金鑰」重新設定');
    if (res.status === 429) throw new Error('OpenAI 額度不足或請求太頻繁：' + msg);
    if (res.status === 403) throw new Error('這個金鑰的組織尚未開通此模型：' + msg);
    throw new Error(msg);
  }

  images(body) {
    const list = (body && body.data) || [];
    if (!list.length) throw new Error('OpenAI 沒有回傳圖片');
    return { images: list.map((d) => d.b64_json), revised: list[0].revised_prompt || '', usage: body.usage || null };
  }

  track(id) {
    const ctl = new AbortController();
    this.running.set(id, ctl);
    return ctl;
  }

  // 文生圖
  async generate(id, { model, prompt, size, quality, n, background }) {
    const ctl = this.track(id);
    try {
      const payload = { model, prompt, size: size || 'auto', quality: quality || 'auto', n: n || 1 };
      if (background && background !== 'auto') payload.background = background;
      const res = await fetch(`${BASE}/images/generations`, {
        method: 'POST',
        headers: { ...this.headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      });
      return this.images(await this.read(res));
    } finally { this.running.delete(id); }
  }

  // 影像編輯（image／mask 是 PNG 的 Uint8Array；mask 透明處才會重畫）
  async edit(id, { model, prompt, size, quality, n, background, image, mask }) {
    const ctl = this.track(id);
    try {
      const form = new FormData();
      form.append('model', model);
      form.append('prompt', prompt);
      form.append('size', size || 'auto');
      form.append('quality', quality || 'auto');
      form.append('n', String(n || 1));
      if (background && background !== 'auto') form.append('background', background);
      form.append('image', new Blob([image], { type: 'image/png' }), 'image.png');
      if (mask) form.append('mask', new Blob([mask], { type: 'image/png' }), 'mask.png');
      const res = await fetch(`${BASE}/images/edits`, { method: 'POST', headers: this.headers(), body: form, signal: ctl.signal });
      return this.images(await this.read(res));
    } finally { this.running.delete(id); }
  }

  // 測試金鑰：列模型最便宜，也不會產生費用
  async test(key) {
    const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) throw new Error('金鑰無效');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    return (body.data || []).map((m) => m.id).filter((m) => /image/.test(m)).sort();
  }

  cancel(id) { const c = this.running.get(id); if (c) c.abort(); }
  cancelAll() { for (const c of this.running.values()) c.abort(); this.running.clear(); }
}

module.exports = { OpenAIImages };
