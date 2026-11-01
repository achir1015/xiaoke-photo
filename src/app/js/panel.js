// 右側「AI 與插件」面板
import { h, $, toast, busy } from './ui.js';
import { LOCAL_GROUPS, STYLES, RELIGHT_PRESETS } from './plugins.js';
import { apiError, removalPrompt, inpaintPrompt } from './ai.js';
import { openMasker } from './masker.js';

const TABS = [['gen', 'AI 生圖'], ['fix', 'AI 修補'], ...LOCAL_GROUPS.map((g) => [g.id, g.title])];

export class Panel {
  constructor({ engine, ai, run, settings, needKey }) {
    Object.assign(this, { engine, ai, run, settings, needKey });
    this.root = $('#panel');
    this.tab = 'gen';
    this.panes = {};
    this.previewToken = 0;
    this.build();
  }

  build() {
    const tabs = h('div', { class: 'tabs' }, TABS.map(([id, label]) => h('button', { 'data-tab': id, class: id === this.tab ? 'on' : '', onclick: () => this.show(id) }, label)));
    this.body = h('div', { class: 'pane' });
    this.root.append(tabs, this.body);
    this.show(this.tab);
  }

  show(id) {
    this.tab = id;
    this.root.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    this.body.replaceChildren(this.panes[id] || (this.panes[id] = this.makePane(id)));
  }

  makePane(id) {
    if (id === 'gen') return this.genPane();
    if (id === 'fix') return this.fixPane();
    const g = LOCAL_GROUPS.find((x) => x.id === id);
    return h('div', {}, g.items.map((it) => this.pluginCard(it)));
  }

  // ---------------- AI 生圖 ----------------
  genPane() {
    const prompt = h('textarea', { id: 'genPrompt', placeholder: '描述想要的畫面，例如：一隻戴圓框眼鏡的柴犬坐在台北街頭的咖啡店，午後陽光' });
    let style = '';
    const chips = h('div', { class: 'chips' }, STYLES.map(([label, en]) => {
      const b = h('button', { onclick: () => {
        style = style === en ? '' : en;
        chips.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b && !!style));
      } }, label);
      return b;
    }));
    const size = h('select', { id: 'genSize' },
      [['auto', '自動'], ['1024x1024', '方形 1024×1024'], ['1536x1024', '橫向 1536×1024'], ['1024x1536', '直向 1024×1536'], ['2048x1152', '寬銀幕 2048×1152'], ['doc', '與目前文件同比例']].map(([v, t]) => h('option', { value: v }, t)));
    const count = h('select', { id: 'genCount' }, [1, 2, 3, 4].map((n) => h('option', { value: n }, `${n} 張`)));
    const split = h('select', { id: 'genSplit' }, [['0', '不切圖'], ['2', '切成 2×2'], ['3', '切成 3×3']].map(([v, t]) => h('option', { value: v }, t)));
    const bg = h('select', { id: 'genBg' }, [['auto', '一般背景'], ['transparent', '透明背景']].map(([v, t]) => h('option', { value: v }, t)));
    const gallery = h('div', { class: 'gallery' });
    const go = async () => {
      const text = prompt.value.trim();
      if (!text) { toast('請先輸入提示詞', true); prompt.focus(); return; }
      if (!(await this.needKey())) return;
      const { model, quality } = this.settings().ai;
      const parts = +split.value;
      let want = size.value;
      const doc = await this.engine.documentInfo();
      if (want === 'doc') {
        if (!doc) { toast('還沒有開啟文件，改用自動尺寸'); want = 'auto'; } else {
          const { pickApiSize } = await import('./imaging.js');
          const s = pickApiSize(doc.width, doc.height, model);
          want = `${s.width}x${s.height}`;
        }
      }
      let full = text + (style ? `. Style: ${style}` : '');
      if (parts) full += `. Arrange ${parts * parts} separate variations in an even ${parts} by ${parts} grid with no borders or gaps.`;
      const done = busy('小柯正在請 OpenAI 繪圖，通常要 30 秒到 2 分鐘…', () => this.ai.cancel());
      try {
        const list = await this.ai.generate({ model, prompt: full, size: want, quality, n: +count.value, background: bg.value });
        let index = 1;
        const name = text.slice(0, 18);
        for (const item of list) {
          const tiles = parts ? await this.runSlice(item.img, parts) : [item.img];
          for (const tile of tiles) {
            await this.addResult(`AI 生圖 ${index++} ${name}`, tile, !doc && index === 2);
            await new Promise((r) => setTimeout(r, 120));
          }
          gallery.prepend(h('img', { src: URL.createObjectURL(new Blob([item.bytes], { type: 'image/png' })), title: '再加入一次到圖層', onclick: () => this.addResult(`AI 生圖 ${name}`, item.img) }));
        }
        toast(`完成，已加入 ${index - 1} 個圖層`);
      } catch (e) { toast(apiError(e), true); } finally { done(); this.engine.focus(); }
    };
    return h('div', {},
      h('div', { class: 'card' },
        h('h3', {}, '文字生成圖像', h('small', {}, 'CHARM AI 類')),
        prompt, chips,
        h('div', { class: 'two' },
          h('label', { class: 'row' }, h('span', {}, '尺寸'), size),
          h('label', { class: 'row' }, h('span', {}, '數量'), count),
          h('label', { class: 'row' }, h('span', {}, '自動切圖'), split),
          h('label', { class: 'row' }, h('span', {}, '背景'), bg)),
        h('div', { class: 'actions' }, h('button', { class: 'primary', id: 'genGo', onclick: go }, '產生並加入圖層')),
        h('p', { class: 'hint' }, '產生的圖會自動加入目前專案的圖層；還沒開檔時會開成新文件。切圖會把每一格分成獨立圖層。'),
        gallery));
  }

  async runSlice(img, n) {
    return this.run('sliceGrid', img, { cols: n, rows: n });
  }

  async addResult(name, img, asDocument = false) {
    if (asDocument) await this.engine.open(`${name}.png`, img);
    else await this.engine.place(name, img);
  }

  // ---------------- AI 修補 ----------------
  fixPane() {
    const relightPick = h('select', {}, RELIGHT_PRESETS.map(([t, en]) => h('option', { value: en }, t)));
    const whole = async (label, prompt, opts = {}) => {
      if (!(await this.requireDoc()) || !(await this.needKey())) return;
      const { model, quality } = this.settings().ai;
      const done = busy(`${label}中，通常要 30 秒到 2 分鐘…`, () => this.ai.cancel());
      try {
        // 透明背景在部分模型還是預覽功能：被拒絕時改用支援的模型再試一次
        const img = await this.ai.editWhole({ model, prompt, quality, ...opts }).catch((e) => {
          if (opts.background === 'transparent' && /transparent|background/i.test(e.message)) return this.ai.editWhole({ model: 'gpt-image-1.5', prompt, quality, ...opts });
          throw e;
        });
        if (opts.keepSize === false) await this.engine.open(`${label}.png`, img);
        else await this.engine.place(label, img);
        toast(`${label}完成，已加入圖層`);
      } catch (e) { toast(apiError(e), true); } finally { done(); this.engine.focus(); }
    };
    return h('div', {},
      h('div', { class: 'card' },
        h('h3', {}, '移除人物、物件、浮水印'),
        h('p', {}, '塗出要去除的地方，AI 會補完背景，結果放在新圖層，原圖不會被改動。'),
        h('div', { class: 'actions' }, h('button', { class: 'primary', id: 'fixRemove', onclick: () => this.startMask('remove') }, '開始移除'))),
      h('div', { class: 'card' },
        h('h3', {}, '局部重繪', h('small', {}, 'Stable Diffusion 類')),
        h('p', {}, '塗出範圍並描述想要的內容，例如把天空換成晚霞。'),
        h('div', { class: 'actions' }, h('button', { id: 'fixInpaint', onclick: () => this.startMask('inpaint') }, '開始重繪'))),
      h('div', { class: 'card' },
        h('h3', {}, 'AI 畫質提升', h('small', {}, 'Magnific 類')),
        h('p', {}, '重建細節並提高清晰度，結果開成新文件。'),
        h('div', { class: 'actions' }, h('button', { onclick: () => whole('AI 畫質提升', 'Enhance this image to a high resolution, sharp, detailed version. Keep the exact same composition, subjects, faces, text and colors. Do not change or add anything.', { keepSize: false, longest: 3200 }) }, '開始提升'))),
      h('div', { class: 'card' },
        h('h3', {}, 'AI 移除背景', h('small', {}, 'Magnific 類')),
        h('p', {}, '保留主體，背景變透明。不想用額度時可改用「摳圖特效」的髮絲摳圖。'),
        h('div', { class: 'actions' }, h('button', { onclick: () => whole('AI 移除背景', 'Remove the background completely and keep only the main subject with clean, precise edges including hair. Do not change the subject.', { background: 'transparent' }) }, '移除背景'))),
      h('div', { class: 'card' },
        h('h3', {}, 'AI 重新打光', h('small', {}, 'Magnific 類')),
        relightPick,
        h('div', { class: 'actions' }, h('button', { onclick: () => whole('AI 重新打光', `Relight this image with ${relightPick.value}. Keep the same composition, subjects and details; change only the lighting and shadows.`) }, '重新打光'))),
    );
  }

  async requireDoc() {
    const doc = await this.engine.documentInfo();
    if (!doc) { toast('請先開啟或新增一張圖片', true); return null; }
    return doc;
  }

  async startMask(mode) {
    if (!(await this.requireDoc()) || !(await this.needKey())) return;
    await openMasker({
      engine: this.engine, mode,
      onSubmit: async ({ mask, target, label, note }) => {
        const { model, quality } = this.settings().ai;
        const prompt = mode === 'remove' ? removalPrompt(target, note) : inpaintPrompt(note);
        const done = busy(mode === 'remove' ? `小柯正在移除${label}並補完背景…` : '小柯正在重繪…', () => this.ai.cancel());
        try {
          const img = await this.ai.inpaint({ model, prompt, quality, mask });
          await this.engine.place(mode === 'remove' ? `AI 移除${label}` : `AI 重繪 ${note.slice(0, 16)}`, img);
          await this.engine.command('select.deselect').catch(() => {});
          toast('完成，結果在新圖層，隱藏該圖層就能比對原圖');
        } catch (e) { toast(apiError(e), true); } finally { done(); this.engine.focus(); }
      },
    });
  }

  // ---------------- 本機插件 ----------------
  pluginCard(it) {
    const values = Object.fromEntries(it.params.map((p) => [p.k, p.def]));
    const canvas = h('canvas');
    const label = h('em', {}, '預覽');
    const preview = h('div', { class: 'preview' }, canvas, label);
    const content = h('div', { hidden: true });
    let src = null, shown = null;

    const draw = (img) => {
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
    };

    const params = async (image, full) => {
      const p = { ...values };
      if (it.needsMask) {
        p.mask = await this.subjectMask(image, full);
        p.contrast = values.contrast;
        p.radius = full ? 0 : values.radius;
      }
      return p;
    };

    let timer = 0;
    const refresh = () => {
      label.textContent = '處理中…';
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const token = ++this.previewToken;
        src = await this.engine.composite(420);
        if (!src) { label.textContent = '請先開啟圖片'; return; }
        try {
          const out = await this.run(it.op, src, await params(src, false));
          if (token !== this.previewToken) return;
          shown = out; draw(out); label.textContent = '按住看原圖';
        } catch (e) { if (token === this.previewToken) label.textContent = e.message; }
      }, 180);
    };
    const peek = (on) => { if (src && shown) draw(on ? src : shown); };
    preview.addEventListener('pointerdown', () => peek(true));
    preview.addEventListener('pointerup', () => peek(false));
    preview.addEventListener('pointerleave', () => peek(false));

    const apply = async () => {
      if (!(await this.requireDoc())) return;
      const done = busy(`${it.title}處理中…`);
      try {
        const img = await this.engine.composite(0);
        let out = await this.run(it.op, img, await params(img, true));
        const sel = it.needsMask || it.output === 'document' ? null : await this.engine.selection();
        if (sel && out.width === sel.width) out = await this.run('maskOut', out, { mask: sel.mask });
        if (it.output === 'document') await this.engine.open(`${it.title}.png`, out);
        else await this.engine.place(it.title, out);
        if (it.needsMask) await this.engine.command('select.deselect').catch(() => {});
        toast(`${it.title}完成，已加入${it.output === 'document' ? '新文件' : '新圖層'}`);
      } catch (e) { toast(e.message, true); } finally { done(); this.engine.focus(); }
    };

    for (const p of it.params) {
      if (p.options) {
        content.append(h('label', { class: 'row' }, h('span', {}, p.label), h('select', {
          onchange: (e) => { const raw = e.target.value; values[p.k] = Number.isNaN(+raw) ? raw : +raw; refresh(); },
        }, p.options.map(([v, t]) => h('option', { value: v }, t)))));
      } else {
        const num = h('b', {}, `${p.def}${p.unit}`);
        content.append(h('label', { class: 'row' }, h('span', {}, p.label, num), h('input', {
          type: 'range', min: p.min, max: p.max, value: p.def,
          oninput: (e) => { values[p.k] = +e.target.value; num.textContent = `${values[p.k]}${p.unit}`; refresh(); },
        })));
      }
    }
    content.prepend(h('p', {}, it.desc), preview);
    content.append(h('div', { class: 'actions' }, h('button', { class: 'primary', onclick: apply }, it.output === 'document' ? '放大成新文件' : '套用成新圖層')));
    const card = h('div', { class: 'card', 'data-plugin': it.id },
      h('h3', { onclick: () => { content.hidden = !content.hidden; if (!content.hidden) refresh(); } }, it.title, h('small', {}, it.like)),
      content);
    return card;
  }

  // 主體遮罩：有選取用選取；沒有就請引擎的「選取主體」；再不行回傳 undefined，由 Worker 依四角背景色判斷
  async subjectMask(image) {
    let sel = await this.engine.selection();
    if (!sel) {
      await this.engine.command('select.subject').catch(() => {});
      sel = await this.engine.selection();
    }
    if (!sel) return undefined;
    if (sel.width === image.width) return sel.mask;
    const m = new Float32Array(image.width * image.height);
    for (let y = 0; y < image.height; y++) {
      const sy = Math.floor((y + 0.5) * sel.height / image.height);
      for (let x = 0; x < image.width; x++) m[y * image.width + x] = sel.mask[sy * sel.width + Math.floor((x + 0.5) * sel.width / image.width)];
    }
    return m;
  }
}

