// 共用的小工具：建立元素、提示、忙碌遮罩、對話框
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export const $ = (s) => document.querySelector(s);

let toastTimer = 0;
export function toast(text, bad = false) {
  const t = $('#toast');
  t.textContent = text;
  t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, bad ? 6500 : 3200);
}

export function busy(text, onCancel) {
  const b = $('#busy'), c = $('#busyCancel');
  $('#busyText').textContent = text;
  b.hidden = false;
  c.hidden = !onCancel;
  c.onclick = onCancel || null;
  return () => { b.hidden = true; };
}

export function modal(content, { onClose } = {}) {
  const m = h('div', { class: 'modal' }, content);
  const close = () => { m.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  document.body.append(m);
  return close;
}
