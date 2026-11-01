// 沒有 Electron 主程序時（線上版、手機 App 內的網頁）用瀏覽器功能提供同一組 window.xk
if (!window.xk) {
  const STORE = 'xiaoke-photo';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const save = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* 無痕模式存不了 */ } };
  const defaults = { autoUpdate: true, panelOpen: true, guideSeen: false, ai: { apiKey: '', model: 'gpt-image-2', quality: 'auto', size: 'auto' } };
  const raw = load();
  const state = { ...defaults, ...raw, ai: { ...defaults.ai, ...(raw.ai || {}) } };
  const pub = () => { const s = JSON.parse(JSON.stringify(state)); s.ai.hasKey = !!state.ai.apiKey; delete s.ai.apiKey; return s; };
  const native = window.xkNative || {};
  const running = new Map();
  const BASE = 'https://api.openai.com/v1';

  async function read(res) {
    let body = null;
    try { body = await res.json(); } catch { /* 用狀態碼回報 */ }
    if (res.ok) return { images: body.data.map((d) => d.b64_json) };
    const msg = (body && body.error && body.error.message) || `HTTP ${res.status}`;
    if (res.status === 401) throw new Error('OpenAI API 金鑰無效，請到右上角「OpenAI 金鑰」重新設定');
    throw new Error(msg);
  }
  const auth = () => { if (!state.ai.apiKey) throw new Error('尚未設定 OpenAI API 金鑰'); return { Authorization: `Bearer ${state.ai.apiKey}` }; };

  window.xk = {
    platform: native.platform || 'web',
    tts: native.tts,
    settings: {
      get: async () => pub(),
      set: async (patch) => {
        const { ai, ...rest } = patch || {};
        Object.assign(state, rest);
        if (ai) Object.assign(state.ai, ai);
        save(state);
        return pub();
      },
    },
    sys: { info: async () => ({ version: window.XIAOKE_VERSION || '1.0.0', platform: native.platform || 'web', packaged: false }) },
    openExternal: async (url) => { if (native.openExternal) native.openExternal(url); else window.open(url, '_blank', 'noopener'); },
    ai: {
      setKey: async (key) => { state.ai.apiKey = String(key || '').trim(); save(state); return pub(); },
      test: async (key) => {
        const res = await fetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${key || state.ai.apiKey}` } });
        if (!res.ok) throw new Error(res.status === 401 ? '金鑰無效' : `HTTP ${res.status}`);
        return ((await res.json()).data || []).map((m) => m.id).filter((m) => /image/.test(m)).sort();
      },
      generate: async (id, { model, prompt, size, quality, n, background }) => {
        const ctl = new AbortController();
        running.set(id, ctl);
        try {
          const payload = { model, prompt, size: size || 'auto', quality: quality || 'auto', n: n || 1 };
          if (background && background !== 'auto') payload.background = background;
          return await read(await fetch(`${BASE}/images/generations`, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal }));
        } finally { running.delete(id); }
      },
      edit: async (id, { model, prompt, size, quality, n, background, image, mask }) => {
        const ctl = new AbortController();
        running.set(id, ctl);
        try {
          const f = new FormData();
          f.append('model', model); f.append('prompt', prompt); f.append('size', size || 'auto'); f.append('quality', quality || 'auto'); f.append('n', String(n || 1));
          if (background && background !== 'auto') f.append('background', background);
          f.append('image', new Blob([image], { type: 'image/png' }), 'image.png');
          if (mask) f.append('mask', new Blob([mask], { type: 'image/png' }), 'mask.png');
          return await read(await fetch(`${BASE}/images/edits`, { method: 'POST', headers: auth(), body: f, signal: ctl.signal }));
        } finally { running.delete(id); }
      },
      cancel: async (id) => { const c = running.get(id); if (c) c.abort(); },
    },
    update: {
      check: async () => {
        if (native.update) return native.update.check();
        const current = window.XIAOKE_VERSION || '1.0.0';
        const res = await fetch('version.json', { cache: 'no-store' });
        const latest = res.ok ? (await res.json()).version : current;
        return { current, latest, newer: latest !== current, notes: '', openPage: true };
      },
      openPage: async () => { if (native.update) return native.update.openPage(); location.reload(); },
      download: async () => { if (native.update && native.update.download) return native.update.download(); throw new Error('請到下載頁更新'); },
      install: async (f) => (native.update && native.update.install ? native.update.install(f) : {}),
      onProgress: () => () => {},
    },
  };
}
