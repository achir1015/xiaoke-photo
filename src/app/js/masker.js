// AI 移除／局部重繪的塗抹視窗：看著圖塗出要處理的地方；若引擎已有選取範圍會先帶入
import { h, modal, toast } from './ui.js';
import { REMOVE_TARGETS } from './plugins.js';

export function openMasker({ engine, mode, onSubmit }) {
  return new Promise(async (resolve) => {
    const base = await engine.composite(1400);
    if (!base) { toast('請先開啟或新增一張圖片', true); resolve(); return; }
    const sel = await engine.selection();
    const info = await engine.documentInfo();
    const W = info.width, H = info.height;

    const view = h('canvas'), paint = h('canvas');
    view.width = paint.width = base.width;
    view.height = paint.height = base.height;
    view.getContext('2d').putImageData(new ImageData(base.data, base.width, base.height), 0, 0);
    const g = paint.getContext('2d');
    paint.style.opacity = 0.55;

    if (sel) {
      const im = new ImageData(base.width, base.height);
      for (let y = 0, j = 0; y < base.height; y++) {
        const sy = Math.floor((y + 0.5) * H / base.height);
        for (let x = 0; x < base.width; x++, j += 4) {
          const sx = Math.floor((x + 0.5) * W / base.width);
          im.data[j] = 255; im.data[j + 1] = 40; im.data[j + 2] = 70; im.data[j + 3] = sel.mask[sy * W + sx] * 255;
        }
      }
      g.putImageData(im, 0, 0);
    }

    let brush = Math.round(Math.max(base.width, base.height) / 30), erasing = false, drawing = false, last = null;
    const undo = [];
    const snapshot = () => { undo.push(g.getImageData(0, 0, paint.width, paint.height)); if (undo.length > 20) undo.shift(); };

    const pos = (e) => {
      const r = paint.getBoundingClientRect();
      return [(e.clientX - r.left) * paint.width / r.width, (e.clientY - r.top) * paint.height / r.height];
    };
    const stroke = (a, b) => {
      g.globalCompositeOperation = erasing ? 'destination-out' : 'source-over';
      g.strokeStyle = g.fillStyle = 'rgb(255,40,70)';
      g.lineCap = 'round'; g.lineWidth = brush;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    };
    paint.addEventListener('pointerdown', (e) => { paint.setPointerCapture(e.pointerId); snapshot(); drawing = true; last = pos(e); stroke(last, last); });
    paint.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); stroke(last, p); last = p; });
    const stop = () => { drawing = false; };
    paint.addEventListener('pointerup', stop);
    paint.addEventListener('pointercancel', stop);

    const box = h('div', { class: 'stagebox' }, view, paint);
    const fit = () => {
      const r = box.getBoundingClientRect(), k = Math.min(r.width / base.width, r.height / base.height);
      for (const c of [view, paint]) { c.style.width = `${base.width * k}px`; c.style.height = `${base.height * k}px`; }
    };

    const removing = mode === 'remove';
    let target = REMOVE_TARGETS[0];
    const chips = h('span', { class: 'chips' }, REMOVE_TARGETS.map((t, i) => {
      const b = h('button', { class: i ? '' : 'on', onclick: () => { target = t; chips.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); } }, t[0]);
      return b;
    }));
    const note = h('input', { type: 'text', placeholder: removing ? '補充說明（可不填），例如：左邊穿紅衣的人' : '要畫成什麼？例如：換成一片花田' });
    const eraser = h('button', { onclick: () => { erasing = !erasing; eraser.textContent = erasing ? '擦除中' : '塗抹中'; } }, '塗抹中');

    const submit = () => {
      const data = g.getImageData(0, 0, paint.width, paint.height).data;
      // 放大回文件尺寸
      const mask = new Float32Array(W * H);
      let any = false;
      for (let y = 0; y < H; y++) {
        const sy = Math.floor((y + 0.5) * paint.height / H);
        for (let x = 0; x < W; x++) {
          const sx = Math.floor((x + 0.5) * paint.width / W), v = data[(sy * paint.width + sx) * 4 + 3] / 255;
          mask[y * W + x] = v;
          if (v > 0.3) any = true;
        }
      }
      if (!any) { toast('請先塗出要處理的範圍', true); return; }
      const text = note.value.trim();
      if (!removing && !text) { toast('請輸入要畫成什麼', true); note.focus(); return; }
      close();
      onSubmit({ mask, target: target[1], label: target[0], note: text });
      resolve();
    };

    const dialog = h('div', { class: 'dialog masker' },
      h('h2', {}, removing ? 'AI 移除：塗出要去除的地方' : 'AI 局部重繪：塗出要改變的地方'),
      box,
      h('div', { class: 'tools' },
        removing ? chips : null, note,
      ),
      h('div', { class: 'tools' },
        eraser,
        h('label', {}, '筆刷 ', h('input', { type: 'range', min: 4, max: Math.round(Math.max(base.width, base.height) / 6), value: brush, oninput: (e) => { brush = +e.target.value; } })),
        h('button', { onclick: () => { const s = undo.pop(); if (s) g.putImageData(s, 0, 0); } }, '復原'),
        h('button', { onclick: () => { snapshot(); g.clearRect(0, 0, paint.width, paint.height); } }, '清除'),
        h('span', { class: 'grow' }),
        h('button', { onclick: () => close() }, '取消'),
        h('button', { class: 'primary', onclick: submit }, removing ? '開始移除' : '開始重繪'),
      ));
    const close = modal(dialog, { onClose: () => { removeEventListener('resize', fit); resolve(); } });
    addEventListener('resize', fit);
    requestAnimationFrame(fit);
  });
}
