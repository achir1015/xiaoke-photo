// 使用教學：小柯機器人在迷你編輯器裡示範，每一步配語音與文字
import { h, modal } from './ui.js';
import { voice } from './voice.js';

const PHOTO = `<svg viewBox="0 0 400 260" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ff"/><stop offset="1" stop-color="#fbe7c6"/></linearGradient></defs>
  <rect width="400" height="260" fill="url(#sky)"/>
  <circle cx="320" cy="60" r="28" fill="#fff3b0"/>
  <path d="M0 190 L90 100 L170 170 L250 90 L400 200 V260 H0Z" fill="#5f8d6a"/>
  <path d="M0 220 Q200 190 400 225 V260 H0Z" fill="#3e6a4a"/>
</svg>`;
const PERSON = '<g class="sc-target"><circle cx="150" cy="150" r="14" fill="#f2c9a5"/><rect x="134" y="165" width="32" height="50" rx="10" fill="#c8403a"/></g>';
const MARK = '<text class="sc-target" x="238" y="244" font-size="26" fill="#ffffffaa" font-weight="700">SAMPLE</text>';

function scene() {
  const robot = h('img', { class: 'sc-robot', src: '../../build/robot.png', alt: '小柯' });
  const pic = h('div', { class: 'sc-canvas', html: PHOTO });
  const layers = h('div', { class: 'sc-layers' });
  const side = h('div', { class: 'sc-side' }, h('b', {}, '圖層'), layers);
  const top = h('div', { class: 'sc-top' }, ...['AI 與插件', '使用教學', '系統更新', 'OpenAI 金鑰'].map((t) => h('span', {}, t)));
  const win = h('div', { class: 'sc-win' }, top, pic, side);
  const root = h('div', {}, win, robot);
  const svg = () => pic.querySelector('svg');
  const api = {
    root, side, pic,
    // 把機器人移到某個元素上（比例座標相對於場景）
    go(el) {
      if (!el) return;
      const r = el.getBoundingClientRect(), s = root.parentElement.getBoundingClientRect();
      robot.style.left = `${r.left - s.left + r.width / 2 - 14}px`;
      robot.style.top = `${r.top - s.top + r.height / 2 - 8}px`;
    },
    hot(text) {
      const el = [...top.children].find((x) => x.textContent === text);
      top.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
      if (el) { el.classList.add('hot'); api.go(el); }
      return el;
    },
    layer(name, isNew = true) {
      layers.querySelectorAll('.new').forEach((x) => x.classList.remove('new'));
      const el = h('div', { class: 'sc-layer' + (isNew ? ' new' : '') }, name);
      layers.prepend(el);
      return el;
    },
    field(text) {
      const f = h('div', { class: 'sc-field' });
      side.append(f);
      api.go(f);
      let i = 0;
      const t = setInterval(() => { f.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(t); }, 60);
      return f;
    },
    button(text) {
      const b = h('div', { class: 'sc-btn' }, text);
      side.append(b);
      return b;
    },
    press(b) { api.go(b); b.classList.add('hot'); setTimeout(() => b.classList.remove('hot'), 420); },
    add(markup) { const g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.innerHTML = markup; svg().append(g); return g; },
    filter(css) { svg().style.transition = 'filter .9s'; svg().style.filter = css; },
    remove(g) { g.style.transition = 'opacity .9s'; g.style.opacity = 0; },
    brush(cx, cy, r) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      Object.entries({ cx, cy, r, fill: '#ff2846', opacity: 0.55 }).forEach(([k, v]) => c.setAttribute(k, v));
      svg().append(c);
      return c;
    },
    image(markup) { const g = api.add(markup); g.classList.add('fade-in'); return g; },
    wait: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
  return api;
}

// 每一步：{ say, run(s) }；run 跟語音同時開始
const CHAPTERS = [
  {
    title: '認識畫面', steps: [
      { say: '大家好，我是小柯機器人！這是圖像編輯助手，全部都是繁體中文。中間是畫布，左邊是工具列，右邊有圖層面板。', run: (s) => { s.layer('背景', false); s.go(s.pic); } },
      { say: '最上面右邊是系統工具，有 AI 與插件、使用教學、系統更新，最右邊就是 OpenAI 金鑰。', run: async (s) => { for (const t of ['AI 與插件', '使用教學', '系統更新', 'OpenAI 金鑰']) { s.hot(t); await s.wait(1100); } } },
    ],
  },
  {
    title: '開啟圖片與圖層', steps: [
      { say: '按上方的「開啟」選擇照片或 PSD 檔，也可以直接把檔案拖進畫布。', run: (s) => { s.layer('背景', false); s.go(s.pic); } },
      { say: '每個圖層都可以隱藏、調整不透明度和加上遮色片。修圖時多開新圖層，原圖就不會被改壞。', run: async (s) => { await s.wait(600); s.go(s.layer('色階調整')); s.filter('contrast(1.2) saturate(1.2)'); await s.wait(1200); s.go(s.layer('文字')); } },
    ],
  },
  {
    title: '設定 OpenAI 金鑰', steps: [
      { say: '按右上角的「OpenAI 金鑰」，貼上你在 OpenAI 網站建立的 API 金鑰，再按測試連線。', run: async (s) => { s.layer('背景', false); s.hot('OpenAI 金鑰'); await s.wait(1000); s.field('sk-••••••••••••'); } },
      { say: '金鑰只會加密存在這台電腦，不會傳給別人。指示燈變成綠色就設定完成了。使用 AI 功能時，OpenAI 會依用量向你的帳號計費。', run: async (s) => { const b = s.button('測試連線'); await s.wait(900); s.press(b); } },
    ],
  },
  {
    title: '文字生成圖像', steps: [
      { say: '打開「AI 生圖」，輸入你想要的畫面，選擇風格、尺寸和數量。', run: async (s) => { s.layer('背景', false); s.hot('AI 與插件'); await s.wait(800); s.field('海邊的小柯機器人，水彩風'); } },
      { say: '按下產生，圖片完成後會自動加入目前專案的圖層。選擇切圖時，每一格都會變成獨立圖層。', run: async (s) => {
        const b = s.button('產生並加入圖層'); await s.wait(900); s.press(b); await s.wait(1100);
        s.image('<circle cx="200" cy="120" r="46" fill="#4696f0"/><circle cx="200" cy="120" r="36" fill="#f0f6ff"/><rect x="176" y="104" width="48" height="30" rx="14" fill="#182440"/><circle cx="188" cy="118" r="4" fill="#5ae6ff"/><circle cx="212" cy="118" r="4" fill="#5ae6ff"/>');
        s.go(s.layer('AI 生圖 1'));
      } },
    ],
  },
  {
    title: '移除人物與浮水印', steps: [
      { say: '想去掉照片裡的人物、物件或浮水印，就到「AI 修補」按開始移除。', run: async (s) => { s.layer('背景', false); s.add(PERSON + MARK); s.hot('AI 與插件'); } },
      { say: '用筆刷塗出要去除的地方，紅色範圍就是 AI 要處理的區域。', run: async (s) => {
        const list = []; for (let i = 0; i < 6; i++) { list.push(s.brush(150, 140 + i * 16, 26)); s.go(s.pic); await s.wait(320); }
        s.brushes = list;
      } },
      { say: '按下開始移除，AI 會補完後面的背景。結果放在新圖層，隱藏新圖層就能和原圖比對。', run: async (s) => {
        await s.wait(1200);
        for (const c of s.brushes || []) s.remove(c);
        document.querySelectorAll('.sc-target').forEach((t, i) => { if (!i) s.remove(t); });
        s.go(s.layer('AI 移除人物'));
      } },
    ],
  },
  {
    title: '人像修圖', steps: [
      { say: '「人像修圖」有自動磨皮、人像精修和一鍵美顏。打開一個項目，拖動滑桿就會看到預覽，按住預覽圖可以看原圖。', run: async (s) => { s.layer('背景', false); s.filter('saturate(.9)'); await s.wait(1600); s.filter('brightness(1.1) saturate(1.1) blur(.4px)'); } },
      { say: '按「套用成新圖層」，結果就會放在新圖層。這些功能都在電腦上運算，不需要金鑰，也不用費用。', run: (s) => { s.go(s.layer('自動磨皮')); } },
    ],
  },
  {
    title: '摳圖與特效', steps: [
      { say: '髮絲摳圖會自動找出主體，把邊緣修到頭髮和毛皮，背景變成透明。', run: async (s) => { s.layer('背景', false); s.add('<rect width="400" height="260" fill="#0000"/>'); await s.wait(1200); s.go(s.layer('髮絲摳圖')); } },
      { say: '還有水波倒影、全景變形、底片調色和黑白暗房，每一種都可以先預覽再套用。', run: async (s) => { s.filter('sepia(.7) contrast(1.1)'); await s.wait(1700); s.filter('grayscale(1) contrast(1.3)'); await s.wait(1700); s.filter('hue-rotate(-15deg) saturate(1.4)'); } },
    ],
  },
  {
    title: '降噪與放大', steps: [
      { say: '夜拍的雜訊可以用智慧降噪去除。放大照片用無損放大，最多四倍，結果會開成新文件。', run: async (s) => { s.layer('背景', false); s.filter('contrast(1.4) blur(1px)'); await s.wait(1500); s.filter('none'); s.go(s.layer('智慧降噪')); } },
    ],
  },
  {
    title: '儲存與系統更新', steps: [
      { say: '按「儲存」會保留所有圖層，也可以用「檔案」選單匯出成 PNG、JPEG 或 PSD。', run: (s) => { s.layer('背景', false); s.go(s.pic); } },
      { say: '有新版本時，按「系統更新」就能自動下載並安裝，你的設定都會保留。教學到這裡結束，祝你創作愉快！', run: async (s) => { s.hot('系統更新'); } },
    ],
  },
];

export function openGuide({ onClose } = {}) {
  let chapter = 0, step = 0, token = 0, playing = true;
  const list = h('ol', {}, CHAPTERS.map((c, i) => h('li', { onclick: () => load(i, 0) }, `${i + 1}. ${c.title}`)));
  const stage = h('div', { class: 'scene' });
  const say = h('div', { class: 'say' });
  const count = h('span', { class: 'hint' });
  const playBtn = h('button', { onclick: () => { playing = !playing; playBtn.textContent = playing ? '暫停' : '繼續'; if (playing) play(); else { token++; voice.stop(); } } }, '暫停');
  const voiceBtn = h('button', { onclick: () => { voice.enabled = !voice.enabled; voiceBtn.textContent = voice.enabled ? '語音：開' : '語音：關'; if (!voice.enabled) voice.stop(); } }, '語音：開');
  const dialog = h('div', { class: 'dialog guide' },
    list, stage,
    h('div', { class: 'foot' }, say, h('div', { class: 'ctrl' },
      h('button', { id: 'guidePrev', onclick: () => jump(-1) }, '上一步'),
      playBtn,
      h('button', { id: 'guideNext', onclick: () => jump(1) }, '下一步'),
      voiceBtn, count, h('span', { class: 'grow' }),
      h('button', { id: 'guideClose', onclick: () => close() }, '關閉'))));

  let sc = null;
  const close = modal(dialog, { onClose: () => { token++; voice.stop(); onClose && onClose(); } });

  function load(c, s) {
    chapter = c; step = s;
    [...list.children].forEach((li, i) => li.classList.toggle('on', i === c));
    if (s === 0 || !sc) { sc = scene(); stage.replaceChildren(sc.root); }
    playing = true; playBtn.textContent = '暫停';
    play();
  }

  function jump(d) {
    let c = chapter, s = step + d;
    if (s < 0) { c = Math.max(0, c - 1); s = 0; }
    if (s >= CHAPTERS[c].steps.length) { if (c === CHAPTERS.length - 1) { s = CHAPTERS[c].steps.length - 1; } else { c++; s = 0; } }
    voice.stop();
    load(c, s);
  }

  async function play() {
    const my = ++token;
    voice.stop();
    const st = CHAPTERS[chapter].steps[step];
    say.textContent = st.say;
    count.textContent = `第 ${chapter + 1} 章　第 ${step + 1}／${CHAPTERS[chapter].steps.length} 步`;
    await new Promise((r) => setTimeout(r, 50));
    const anim = Promise.resolve(st.run(sc)).catch(() => {});
    await Promise.all([voice.speak(st.say), anim]);
    if (my !== token || !playing) return;
    await new Promise((r) => setTimeout(r, 700));
    if (my !== token || !playing) return;
    if (chapter === CHAPTERS.length - 1 && step === CHAPTERS[chapter].steps.length - 1) return;
    jump(1);
  }

  load(0, 0);
  return close;
}

export { CHAPTERS };
