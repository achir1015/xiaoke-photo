// 教學語音：桌面版用系統語音；手機 App 沒有網頁語音時改用原生文字轉語音（window.xk.tts）
class Voice {
  constructor() {
    this.voice = null;
    this.enabled = true;
    this.rate = 1.02;
    if ('speechSynthesis' in window) {
      speechSynthesis.addEventListener('voiceschanged', () => this.pick());
      let n = 0;
      const poll = () => { if (this.voice || ++n > 30) return; this.pick(); setTimeout(poll, 200); };
      poll();
    }
  }

  pick() {
    if (!('speechSynthesis' in window)) return;
    const vs = speechSynthesis.getVoices();
    const pref = [/Yating/i, /Hanhan/i, /Mei-?Jia/i, /Zhiwei/i];
    this.voice = pref.map((re) => vs.find((v) => re.test(v.name))).find(Boolean)
      || vs.find((v) => /zh[-_]TW/i.test(v.lang)) || vs.find((v) => /zh[-_]HK/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) || null;
  }

  get native() { return (window.xk && window.xk.tts) || null; }
  get available() { if (this.native) return this.native.available(); if (!this.voice) this.pick(); return 'speechSynthesis' in window && !!this.voice; }

  stop() { if (this.native) this.native.stop(); else if ('speechSynthesis' in window) speechSynthesis.cancel(); }

  // 說完才 resolve；沒有語音時依字數等待，讓動畫有時間跑完
  speak(text) {
    const plain = String(text).replace(/[「」（）()【】]/g, ' ');
    const wait = () => new Promise((r) => setTimeout(r, Math.min(9000, 800 + plain.length * 170)));
    if (!this.enabled || !this.available) return wait();
    if (this.native) return this.native.speak(plain, this.rate);
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(plain);
      u.voice = this.voice; u.lang = this.voice.lang; u.rate = this.rate; u.pitch = 1;
      let done = false;
      const end = () => { if (!done) { done = true; clearTimeout(t); resolve(); } };
      const t = setTimeout(end, 4000 + plain.length * 300);
      u.onend = end; u.onerror = end;
      speechSynthesis.speak(u);
    });
  }
}

export const voice = new Voice();
