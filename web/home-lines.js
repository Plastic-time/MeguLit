// SPDX-License-Identifier: GPL-3.0-or-later
/* (user 2026-11-12) choose the five vertical lines shown beside the cover on the home page. The window lists the lines
   read in that game (saved sentences and reading history, newest first) with a search box; a click toggles a line, at
   most five, the lines on show start checked, and the choice is kept per game (services/home-lines.cjs). */
const MAX = 5;
const copy = {
  zh: { kicker: '首页台词', hint: '最多选 5 句，显示在封面旁的竖排里，按勾选顺序排列。不选则自动显示最近的台词', search: '搜索读过的台词', picked: (n, m) => `已选 ${n} / ${m}`, auto: '恢复自动', cancel: '取消', save: '保存', empty: '这部作品还没有读过的台词', none: '没有找到包含这段文字的台词', loading: '读取中…', saved: '收藏', full: '最多只能选 5 句', failed: '保存失败，请重试', now: '刚刚' },
  ja: { kicker: 'ホームのセリフ', hint: '最大 5 行まで選べます。表紙の横に縦書きで、選んだ順に並びます。選ばなければ最近のセリフを自動で表示します', search: '読んだセリフを検索', picked: (n, m) => `${n} / ${m} 選択中`, auto: '自動に戻す', cancel: 'キャンセル', save: '保存', empty: 'この作品で読んだセリフはまだありません', none: 'この文字を含むセリフは見つかりません', loading: '読み込み中…', saved: '保存済み', full: '選べるのは 5 行までです', failed: '保存できませんでした。もう一度お試しください', now: 'たった今' },
  en: { kicker: 'Home lines', hint: 'Pick up to 5 lines to show vertically beside the cover, in the order you pick them. Pick none to show the latest lines automatically.', search: 'Search lines you have read', picked: (n, m) => `${n} / ${m} picked`, auto: 'Back to automatic', cancel: 'Cancel', save: 'Save', empty: 'No lines read in this game yet', none: 'No line contains that text', loading: 'Loading…', saved: 'Saved', full: 'You can pick at most 5 lines', failed: 'Could not save, please try again', now: 'just now' }
};
export const cleanLine = t => String(t || '').replace(/\s+/g, ' ').trim();
const bare = t => cleanLine(t).replace(/^[「『（("](.*)[」』）)"]$/s, '$1');
const same = (a, b) => bare(a) === bare(b);

/* pure helpers, exported for the tests */
export function toggleLine(picked, text, max = MAX) {
  const at = picked.findIndex(t => same(t, text));
  if (at >= 0) return { picked: picked.filter((_, i) => i !== at), full: false };
  if (picked.length >= max) return { picked, full: true };
  return { picked: [...picked, cleanLine(text)], full: false };
}
export function mergeLines(rows, shown) {
  const list = (rows || []).map(r => ({ ...r, text: cleanLine(r.text) })).filter(r => r.text);
  const missing = (shown || []).map(cleanLine).filter(t => t && !list.some(r => same(r.text, t))).map(text => ({ text, at: 0, saved: false }));
  return [...missing, ...list];
}
export function pickedFrom(list, shown) {
  return (shown || []).map(t => (list.find(r => same(r.text, t)) || {}).text || cleanLine(t)).filter(Boolean).slice(0, MAX);
}

export function openLinesPicker({ api, locale = 'zh', esc, game, shown = [], relativeTime, onSave }) {
  const t = copy[locale] || copy.zh, dialog = document.createElement('dialog');
  dialog.className = 'game-dialog lines-picker';
  dialog.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(game.title || '')}</h2><p>${esc(t.hint)}</p></div>
<div class="lp-tools"><label class="lp-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"></label><span class="lp-count" role="status" aria-live="polite"></span><button type="button" class="lp-auto">${esc(t.auto)}</button></div>
<ol class="lp-picked" aria-hidden="true"></ol>
<div class="lp-list" role="listbox" aria-multiselectable="true" tabindex="-1"><p class="lp-empty">${esc(t.loading)}</p></div>
<div class="dialog-actions"><span class="lp-note" role="status"></span><button type="button" class="text-button" data-cancel>${esc(t.cancel)}</button><button type="button" class="primary" data-save>${esc(t.save)}</button></div>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s), input = $('.lp-search input'), box = $('.lp-list'), note = $('.lp-note');
  let rows = [], picked = [], token = 0, timer = 0, closing = false, noteTimer = 0;
  const say = text => { clearTimeout(noteTimer); note.textContent = text; note.classList.toggle('on', !!text); if (text) noteTimer = setTimeout(() => say(''), 2400); };
  const when = at => at ? (Date.now() - at < 60e3 ? t.now : relativeTime ? relativeTime(Math.floor(at / 1000)) : new Date(at).toLocaleDateString()) : '';
  const count = () => {
    $('.lp-count').innerHTML = `<b>${picked.length}</b><small>/ ${MAX}</small>`;
    $('.lp-count').setAttribute('aria-label', t.picked(picked.length, MAX));
    dialog.classList.toggle('is-full', picked.length >= MAX);
    $('.lp-picked').innerHTML = Array.from({ length: MAX }, (_, i) => `<li class="${picked[i] ? 'on' : ''}"><span>${String(i + 1).padStart(2, '0')}</span><em>${picked[i] ? esc(bare(picked[i])) : ''}</em></li>`).join('');
  };
  const draw = () => {
    const q = cleanLine(input.value);
    const view = q ? rows.filter(r => r.text.toLowerCase().includes(q.toLowerCase())) : rows;
    if (!view.length) { box.innerHTML = `<p class="lp-empty">${esc(q ? t.none : t.empty)}</p>`; return; }
    box.innerHTML = view.map(r => { const n = picked.findIndex(p => same(p, r.text)); return `<button type="button" role="option" class="lp-row${n >= 0 ? ' on' : ''}" aria-selected="${n >= 0}" data-text="${esc(r.text)}"><span class="lp-mark">${n >= 0 ? String(n + 1).padStart(2, '0') : ''}</span><span class="lp-text">${esc(r.text)}</span><span class="lp-meta">${r.saved ? `<i>${esc(t.saved)}</i>` : ''}${esc(when(r.at))}</span></button>`; }).join('');
  };
  const refresh = () => { count(); for (const el of box.querySelectorAll('.lp-row')) { const n = picked.findIndex(p => same(p, el.dataset.text)); el.classList.toggle('on', n >= 0); el.setAttribute('aria-selected', String(n >= 0)); el.querySelector('.lp-mark').textContent = n >= 0 ? String(n + 1).padStart(2, '0') : ''; } };
  box.addEventListener('click', e => {
    const row = e.target.closest('.lp-row'); if (!row) return;
    const out = toggleLine(picked, row.dataset.text);
    if (out.full) { say(t.full); row.classList.remove('deny'); void row.offsetWidth; row.classList.add('deny'); return; }
    picked = out.picked; refresh();
  });
  const load = async (query = '') => {
    const mine = ++token;
    try {
      const res = await api('home_lines', { id: game.id, query, limit: query ? 600 : 800 });
      if (mine !== token || !dialog.isConnected) return;
      const got = mergeLines(res?.lines || [], query ? [] : shown);
      if (query) { const known = new Set(rows.map(r => r.text)); rows = [...rows, ...got.filter(r => !known.has(r.text))]; }
      else { rows = got; picked = pickedFrom(rows, shown); }
      count(); draw();
    } catch { if (mine === token && dialog.isConnected) { if (!rows.length) { rows = mergeLines([], shown); picked = pickedFrom(rows, shown); count(); } draw(); } }
  };
  input.addEventListener('input', () => { draw(); clearTimeout(timer); const q = cleanLine(input.value); if (q) timer = setTimeout(() => load(q), 220); });
  $('.lp-auto').addEventListener('click', () => { picked = []; refresh(); });
  const close = () => { if (closing) return; closing = true; dialog.classList.add('closing'); const done = () => { if (dialog.open) dialog.close(); }; if (matchMedia('(prefers-reduced-motion:reduce)').matches) done(); else { dialog.addEventListener('animationend', done, { once: true }); setTimeout(done, 400); } };
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); } });
  dialog.addEventListener('close', () => { clearTimeout(timer); clearTimeout(noteTimer); dialog.remove(); }, { once: true });
  $('[data-cancel]').onclick = close;
  $('[data-save]').onclick = async () => {
    const btn = $('[data-save]'); btn.disabled = true;
    try { const res = await api('home_lines_save', { id: game.id, lines: picked }); onSave && onSave(Array.isArray(res?.chosen) ? res.chosen : picked); close(); }
    catch { say(t.failed); btn.disabled = false; }
  };
  count();
  dialog.showModal();
  input.focus({ preventScroll: true });
  load();
  return dialog;
}
