// 影像運算在背景執行，畫面不會卡住
import { OPS, resize, applyAlpha, blendInpaint, refineMatte, backgroundKey, sliceGrid } from './imaging.js';

const EXTRA = {
  resizeTo: (img, { width, height }) => resize(img, width, height),
  maskOut: (img, { mask }) => applyAlpha(img, mask),
  inpaintFinish: (img, { mask, grow, feather }) => blendInpaint(img, mask, grow, feather),
  cutout: (img, { mask, contrast, radius }) => applyAlpha(img, refineMatte(img, mask || backgroundKey(img), { contrast, radius })),
};

self.onmessage = (e) => {
  const { id, op, img, params } = e.data;
  try {
    if (op === 'sliceGrid') {
      const parts = sliceGrid(img, params.cols, params.rows);
      self.postMessage({ id, parts }, parts.map((p) => p.data.buffer));
      return;
    }
    const fn = EXTRA[op] || OPS[op];
    if (!fn) throw new Error(`沒有這個運算：${op}`);
    const out = fn(img, params || {});
    self.postMessage({ id, img: out }, [out.data.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
