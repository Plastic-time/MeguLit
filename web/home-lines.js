// SPDX-License-Identifier: GPL-3.0-or-later
/* (user 2026-11-12) choose the five vertical lines shown beside the cover on the home page. The window lists every
   story line read in that game (saved sentences and reading history, newest first) in one long virtualised list with a
   search box; a click toggles a line, at most five, the lines on show start checked, the picked ones sit in a small
   ordered tray, and the choice is kept per game (services/home-lines.cjs). */
const MAX = 5, ROW = 48;
const copy = {
  zh: { kicker: '首页台词', hint: '从读过的台词里挑最多 5 句，按挑选顺序竖排在封面旁；一句不选就自动显示最近的台词', search: '搜索读过的台词', count: n => `共 ${n} 句`, auto: '恢复自动', cancel: '取消', save: '保存', empty: '这部作品还没有读过的台词', none: '没有找到包含这段文字的台词', loading: '读取中…', saved: '收藏', full: '最多选 5 句，先取消一句再选', failed: '保存失败，请重试', tray: '还没有选台词，将自动显示最近读到的', remove: '移除' },
  ja: { kicker: 'ホームのセリフ', hint: '読んだセリフから最大 5 行を選ぶと、選んだ順に表紙の横へ縦書きで並びます。選ばなければ最近のセリフを自動で表示します', search: '読んだセリフを検索', count: n => `全 ${n} 行`, auto: '自動に戻す', cancel: 'キャンセル', save: '保存', empty: 'この作品で読んだセリフはまだありません', none: 'この文字を含むセリフは見つかりません', loading: '読み込み中…', saved: '保存済み', full: '選べるのは 5 行まで。ひとつ外してから選んでください', failed: '保存できませんでした。もう一度お試しください', tray: 'まだ選んでいません。最近のセリフを自動で表示します', remove: '外す' },
  en: { kicker: 'Home lines', hint: 'Pick up to 5 lines you have read; they stand beside the cover in the order you pick them. Pick none to show the latest lines automatically.', search: 'Search lines you have read', count: n => `${n} lines`, auto: 'Automatic', cancel: 'Cancel', save: 'Save', empty: 'No lines read in this game yet', none: 'No line contains that text', loading: 'Loading…', saved: 'Saved', full: 'At most 5 lines: remove one first', failed: 'Could not save, please try again', tray: 'Nothing picked: the latest lines show automatically', remove: 'Remove' }
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
/* the rows a virtual list draws for a scroll position: a few extra above and below the viewport */
export function visibleRange(scrollTop, height, total, row = ROW, extra = 6) {
  const first = Math.max(0, Math.floor(scrollTop / row) - extra);
  return { first, last: Math.min(total, Math.ceil((scrollTop + height) / row) + extra) };
}

export function openLinesPicker({ api, locale = 'zh', esc, game, shown = [], relativeTime, onSave }) {
  const t = copy[locale] || copy.zh, dialog = document.createElement('dialog');
  dialog.className = 'game-dialog lines-picker';
  dialog.innerHTML = `<div class="game-dialog-head"><span class="game-dialog-kicker">${esc(t.kicker)}</span><h2>${esc(game.title || '')}</h2><p>${esc(t.hint)}</p></div>
<div class="lp-tray" aria-live="polite"><div class="lp-tray-head"><span class="lp-count"></span><button type="button" class="lp-auto">${esc(t.auto)}</button></div><ol class="lp-picked"></ol></div>
<div class="lp-bar"><label class="lp-search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input type="search" placeholder="${esc(t.search)}" aria-label="${esc(t.search)}"></label><span class="lp-total"></span></div>
<div class="lp-list" role="listbox" aria-multiselectable="true" tabindex="-1"><div class="lp-space"></div><p class="lp-empty">${esc(t.loading)}</p></div>
<div class="dialog-actions"><span class="lp-note" role="status"></span><button type="button" class="text-button" data-cancel>${esc(t.cancel)}</button><button type="button" class="primary" data-save>${esc(t.save)}</button></div>`;
  document.body.append(dialog);
  const $ = s => dialog.querySelector(s), input = $('.lp-search input'), box = $('.lp-list'), space = $('.lp-space'), empty = $('.lp-empty'), note = $('.lp-note');
  let rows = [], view = [], picked = [], token = 0, timer = 0, closing = false, noteTimer = 0, frame = 0;
  const say = text => { clearTimeout(noteTimer); note.textContent = text; note.classList.toggle('on', !!text); if (text) noteTimer = setTimeout(() => say(''), 2600); };
  const when = at => at ? (relativeTime ? relativeTime(Math.floor(at / 1000)) : new Date(at).toLocaleDateString()) : '';
  const slot = text => picked.findIndex(p => same(p, text));
  const tray = () => {
    $('.lp-count').innerHTML = `<b>${picked.length}</b><span>/ ${MAX}</span>`;
    dialog.classList.toggle('is-full', picked.length >= MAX);
    $('.lp-picked').innerHTML = picked.length ? picked.map((p, i) => `<li data-i="${i}"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t" title="${esc(p)}">${esc(bare(p).replace(/^[…‥.・]+/, '') || bare(p))}</span><button type="button" aria-label="${esc(t.remove)}" title="${esc(t.remove)}">×</button></li>`).join('') : `<li class="lp-tray-empty">${esc(t.tray)}</li>`;
  };
  /* virtual list: only the rows near the viewport exist; each is absolutely placed on a fixed 48px grid */
  const paint = () => {
    frame = 0; const { first, last } = visibleRange(box.scrollTop, box.clientHeight || 420, view.length);
    const keep = new Map([...box.querySelectorAll('.lp-row')].map(el => [+el.dataset.k, el]));
    for (let k = first; k < last; k++) {
      const r = view[k], n = slot(r.text); let el = keep.get(k);
      if (el && el.dataset.text !== r.text) { el.remove(); el = null; }
      if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'lp-row'; el.setAttribute('role', 'option'); el.dataset.k = k; el.dataset.text = r.text; el.style.transform = `translateY(${k * ROW}px)`; el.title = r.text;
        el.innerHTML = `<span class="lp-check" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M3.5 8.4 6.6 11.3 12.5 4.9"/></svg><i></i></span><span class="lp-text">${esc(r.text)}</span><span class="lp-meta">${r.saved ? `<em>${esc(t.saved)}</em>` : ''}${esc(when(r.at))}</span>`; box.append(el); }
      keep.delete(k); el.classList.toggle('on', n >= 0); el.setAttribute('aria-selected', String(n >= 0)); el.querySelector('i').textContent = n >= 0 ? n + 1 : '';
    }
    keep.forEach(el => el.remove());
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  const filter = () => {
    const q = cleanLine(input.value).toLowerCase();
    view = q ? rows.filter(r => r.text.toLowerCase().includes(q)) : rows;
    space.style.height = view.length * ROW + 'px'; box.querySelectorAll('.lp-row').forEach(el => el.remove()); box.scrollTop = 0;
    empty.hidden = !!view.length; if (!view.length) empty.textContent = q ? t.none : (rows.length ? t.none : t.empty);
    $('.lp-total').textContent = rows.length ? t.count(view.length) : ''; paint();
  };
  box.addEventListener('scroll', schedule, { passive: true });
  box.addEventListener('click', e => {
    const row = e.target.closest('.lp-row'); if (!row) return;
    const out = toggleLine(picked, row.dataset.text);
    if (out.full) { say(t.full); row.classList.remove('deny'); void row.offsetWidth; row.classList.add('deny'); return; }
    picked = out.picked; tray(); paint();
  });
  $('.lp-picked').addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (!li || !e.target.closest('button')) return; picked = picked.filter((_, i) => i !== +li.dataset.i); tray(); paint(); });
  const load = async (query = '') => {
    const mine = ++token;
    try {
      const res = await api('home_lines', { id: game.id, query, limit: 5000 });
      if (mine !== token || !dialog.isConnected) return;
      const got = mergeLines(res?.lines || [], query ? [] : shown);
      if (query) { const known = new Set(rows.map(r => r.text)); rows = [...rows, ...got.filter(r => !known.has(r.text))]; }
      else { rows = got; picked = pickedFrom(rows, shown); tray(); }
      filter();
    } catch { if (mine === token && dialog.isConnected && !rows.length) { rows = mergeLines([], shown); picked = pickedFrom(rows, shown); tray(); filter(); } }
  };
  input.addEventListener('input', () => { filter(); clearTimeout(timer); const q = cleanLine(input.value); if (q) timer = setTimeout(() => load(q), 260); });
  $('.lp-auto').addEventListener('click', () => { picked = []; tray(); paint(); });
  const close = () => { if (closing) return; closing = true; dialog.classList.add('closing'); const done = () => { if (dialog.open) dialog.close(); }; if (matchMedia('(prefers-reduced-motion:reduce)').matches) done(); else { dialog.addEventListener('animationend', done, { once: true }); setTimeout(done, 400); } };
  dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
  dialog.addEventListener('click', e => { if (e.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); });
  dialog.addEventListener('close', () => { clearTimeout(timer); clearTimeout(noteTimer); cancelAnimationFrame(frame); dialog.remove(); }, { once: true });
  $('[data-cancel]').onclick = close;
  $('[data-save]').onclick = async () => {
    const btn = $('[data-save]'); btn.disabled = true;
    try { const res = await api('home_lines_save', { id: game.id, lines: picked }); onSave && onSave(Array.isArray(res?.chosen) ? res.chosen : picked); close(); }
    catch { say(t.failed); btn.disabled = false; }
  };
  tray();
  dialog.showModal();
  input.focus({ preventScroll: true });
  load();
  return dialog;
}
