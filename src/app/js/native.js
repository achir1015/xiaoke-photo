// 手機 App 的原生功能：Android（window.XiaokeAndroid）與 iOS（webkit.messageHandlers.xkp）
// 在 web-shim.js 之前執行，把差異包成 window.xkNative
const A = window.XiaokeAndroid;
const J = (s) => JSON.parse(s);

function bytesToBase64Chunks(bytes, size = 3 * 1024 * 256) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += size) {
    let s = '';
    const sub = bytes.subarray(i, i + size);
    for (let k = 0; k < sub.length; k += 8192) s += String.fromCharCode(...sub.subarray(k, k + 8192));
    parts.push(btoa(s));
  }
  return parts;
}

if (A) {
  const waiting = new Map();
  let seq = 0;
  window.__xkTtsDone = (id) => { const r = waiting.get(id); if (r) { waiting.delete(id); r(); } };
  window.xkNative = {
    platform: 'android',
    openExternal: (url) => A.openUrl(url),
    saveFile: async (name, bytes) => {
      const b = J(A.beginSave(name));
      if (b.status !== 'ok') throw new Error(b.message);
      for (const c of bytesToBase64Chunks(bytes)) {
        const w = J(A.writeChunk(b.token, c));
        if (w.status !== 'ok') throw new Error(w.message);
      }
      return J(A.endSave(b.token)).path;
    },
    tts: {
      available: () => A.ttsAvailable(),
      stop: () => A.ttsStop(),
      speak: (text, rate) => new Promise((resolve) => { const id = `t${++seq}`; waiting.set(id, resolve); A.ttsSpeak(text, rate, id); }),
    },
    update: {
      check: async () => {
        const r = J(A.checkUpdate());
        if (r.status !== 'ok') throw new Error(r.message);
        const cmp = (a, b) => { const p = (s) => s.split('.').map(Number); const [x, y] = [p(a), p(b)]; for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return x[i] - y[i]; return 0; };
        window.__xkApk = r;
        return { current: r.current, latest: r.latest, newer: cmp(r.latest, r.current) > 0, notes: r.notes, canInstall: true };
      },
      download: async () => {
        const r = window.__xkApk;
        A.installUpdate(r.url, r.latest);
        return 'apk';
      },
      install: async () => ({ manual: true, path: '手機通知列的安裝畫面' }),
      openPage: async () => A.openUrl('https://github.com/achir1015/xiaoke-photo/releases/latest'),
    },
  };
}

const ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.xkp;
if (ios) {
  const call = (cmd, ...args) => ios.postMessage({ cmd, args });
  window.xkNative = {
    platform: 'ios',
    openExternal: (url) => call('open_url', url),
    saveFile: async (name, bytes) => {
      const b = await call('begin_save', name);
      if (b.status !== 'ok') throw new Error(b.message);
      for (const c of bytesToBase64Chunks(bytes)) await call('write_chunk', b.token, c);
      const e = await call('end_save', b.token);
      return e.path || name;
    },
    update: {
      check: async () => {
        const res = await fetch('https://achir1015.github.io/xiaoke-photo/ios/manifest.plist', { cache: 'no-store' });
        const m = /<key>bundle-version<\/key>\s*<string>([^<]+)</.exec(await res.text());
        const current = window.XIAOKE_VERSION;
        return { current, latest: m ? m[1] : current, newer: !!m && m[1] !== current, notes: '', openPage: true };
      },
      openPage: async () => call('open_url', 'https://achir1015.github.io/xiaoke-photo/ios/'),
    },
  };
}
