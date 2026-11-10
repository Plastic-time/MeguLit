// SPDX-License-Identifier: GPL-3.0-or-later
// The hero headline plays like a galgame text box: a click (or Enter/Space on the ▼ button) types the next line
// character by character, with furigana on the Japanese; a click while it types shows the whole line at once, as in a
// game; after the last line the headline comes back. Lines are written as text with {漢字|かんじ} for ruby.

const LINES = {
  zh: ['又卡在生词上了？', '别切出去查词典了，\n点一下就行', '「[[{好|す}き]]」', '读过的词它都记着，\n下次就认识了', '接下来，\n往下看看它还能做什么'],
  ja: ['また知らない単語で止まった？', '辞書はもういいよ。\nクリックひとつで', '「[[{好|す}き]]」', '読んだ言葉は、\nちゃんと覚えておくから', '次は、\nほかにできることも見ていって'],
  en: ['Stuck on a word again?', 'Skip the dictionary.\nJust click it', '「[[{好|す}き]]」', 'Every word you read,\nit remembers', 'Next up,\nsee what else it can do'],
};
// the word in [[...]] can be clicked: a small lookup card opens beside it, as MeguLit's own does in a game
const CARD = {
  zh: { pos: '形容动词', mean: '喜欢；喜爱', ex: 'エクスプロージョンが、一番好き！', exT: '最喜欢的，果然还是爆裂魔法！', hint: '点我', note: '游戏里的每个词，都能这样点开' },
  ja: { pos: '形容動詞', mean: '心がひかれる。気に入っている', ex: 'エクスプロージョンが、一番好き！', exT: '爆裂魔法こそ、至高にして最強', hint: '押して', note: 'ゲームの中の言葉も、全部こうして開ける' },
  en: { pos: 'na-adjective', mean: 'liked; fond of', ex: 'エクスプロージョンが、一番好き！', exT: 'Explosion magic is the best. Obviously.', hint: 'click me', note: 'Every word in the game opens just like this' },
};
// what the line goes on to say once the word has been clicked
const AFTER = { zh: '游戏里的每个词，\n都能这样点开', ja: 'ゲームの中の言葉は、\n全部こうして開ける', en: 'every word in the game\nopens like this' };
const NEXT = { zh: '点击继续', ja: 'クリックで次へ', en: 'click to continue' };

// "{読|よ}み" -> pieces: a ruby group or a single character, each typed as one step
const pieces = line => {
  const out = [];
  for (const m of line.matchAll(/\[\[(.+?)\]\]|\{([^|}]+)\|([^}]+)\}|./gsu)) {
    if (m[1]) { const w = document.createElement('span'); w.className = 'ht-word'; w.tabIndex = 0; w.setAttribute('role', 'button'); w.append(...pieces(m[1])); out.push(w); continue; }
    m[1] = m[2]; m[2] = m[3];
    if (m[1]) { const r = document.createElement('ruby'); r.append(m[1]); const rt = document.createElement('rt'); rt.textContent = m[2]; r.append(rt); out.push(r); }
    else if (m[0] === '\n') out.push(document.createElement('br'));
    else out.push(document.createTextNode(m[0]));
  }
  return out;
};

export function heroPlay(h1, { reduce = false } = {}) {
  if (!h1) return;
  const lang = () => (document.documentElement.lang || 'zh').slice(0, 2);
  let saved = h1.innerHTML, idx = 0, timer = 0, typing = false, rest = [];
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'ht-next';
  btn.innerHTML = '<span class="ht-next-k"></span><i aria-hidden="true">▼</i>';
  h1.after(btn);
  // the last line points down the page: an arrow that scrolls to the features
  const down = document.createElement('a');
  down.className = 'ht-down'; down.href = '#features'; down.hidden = true; down.setAttribute('aria-label', '↓');
  down.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v15m-6-6 6 6 6-6"/></svg>';
  down.addEventListener('click', e => { e.preventDefault(); document.getElementById('features')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); });
  btn.after(down);
  h1.classList.add('ht-play');
  const label = () => { btn.querySelector('.ht-next-k').textContent = NEXT[lang()] || NEXT.en; btn.setAttribute('aria-label', NEXT[lang()] || NEXT.en); };
  label();
  const finish = () => {
    clearTimeout(timer); typing = false; rest.forEach(n => n.classList?.remove('ht-hide')); rest = []; h1.classList.remove('typing');
    const w = h1.querySelector('.ht-word');
    if (w && !w.querySelector('.ht-hint')) { const h = document.createElement('span'); h.className = 'ht-hint'; h.textContent = (CARD[lang()] || CARD.en).hint; w.append(h); w.classList.add('ready'); }
  };
  // the words after the clickable one are laid out from the start (hidden), so nothing moves when they appear
  let later = [];
  const revealLater = () => {
    rest = later; later = [];
    if (reduce) { finish(); return; }
    typing = true; h1.classList.add('typing');
    const step = () => { if (!rest.length) { finish(); return; } rest.shift().classList.remove('ht-hide'); timer = setTimeout(step, 55); };
    step();
  };
  let continued = false;
  const advance = () => {
    continued = false;
    if (typing) { finish(); return; }
    card?.remove(); card = null;
    const lines = LINES[lang()] || LINES.en;
    idx = (idx + 1) % (lines.length + 1);
    if (idx === 0) { down.hidden = true; h1.innerHTML = saved; h1.classList.remove('saying'); h1.style.removeProperty('min-height'); return; }
    if (!h1.classList.contains('saying')) h1.style.setProperty('min-height', `${h1.offsetHeight}px`);
    h1.classList.add('saying');
    const say = document.createElement('span'); say.className = 'ht-say'; say.lang = lang() === 'en' ? 'en' : 'ja';
    h1.replaceChildren(say);
    // the whole line is laid out first, every piece hidden, then shown one by one: its lines never move while it types
    const text = lines[idx - 1], withAfter = text.includes('[[');
    let all = pieces(text).concat(withAfter ? pieces(AFTER[lang()] || AFTER.en).map(n => { n.later = true; return n; }) : []);
    rest = all.map(n => { const L = n.later; if (n.nodeType === 3) { const sp = document.createElement('span'); sp.append(n); n = sp; } n.later = L; if (n.tagName !== 'BR') n.classList.add('ht-hide'); return n; });
    // the words after the clickable one sit in their own smaller block under it
    const after = document.createElement('span'); after.className = 'ht-after';
    after.append(...rest.filter(n => n.later));
    say.append(...rest.filter(n => !n.later), ...(withAfter ? [after] : []));
    later = rest.filter(n => n.later && n.tagName !== 'BR');
    rest = rest.filter(n => !n.later && n.tagName !== 'BR');
    down.hidden = idx !== lines.length;
    if (reduce) { finish(); return; }
    typing = true; h1.classList.add('typing');
    const step = () => { if (!rest.length) { finish(); return; } rest.shift().classList.remove('ht-hide'); timer = setTimeout(step, 55); };
    step();
  };
  // the lookup card
  let card = null;
  const closeCard = () => { card?.remove(); card = null; h1.querySelector('.ht-word')?.classList.remove('on'); };
  const openCard = w => {
    const c = CARD[lang()] || CARD.en;
    card = document.createElement('span'); card.className = 'ht-card'; card.setAttribute('role', 'dialog');
    card.innerHTML = '<span class="hc-head"><b lang="ja">好き</b><i lang="ja">すき</i><em></em></span><span class="hc-mean"></span><span class="hc-ex"><span lang="ja"></span><small></small></span>';
    card.querySelector('em').textContent = c.pos; card.querySelector('.hc-mean').textContent = c.mean;
    card.querySelector('.hc-ex span').textContent = c.ex; card.querySelector('.hc-ex small').textContent = c.exT;
    h1.append(card);
    // under the word, kept inside the headline's width
    const hr = h1.getBoundingClientRect(), wr = w.getBoundingClientRect();
    w.classList.add('on');
    if (!continued && later.length) { continued = true; revealLater(); }
    // beside the word when there is room (the words typed after it stay readable), else under it
    // to the right of the whole line when there is room, else under it: never over the words
    const say = h1.querySelector('.ht-say'), range = document.createRange(); range.selectNodeContents(say);
    const textRight = Math.max(...[...range.getClientRects()].map(q => q.right)), sr = say.getBoundingClientRect();
    if (innerWidth - textRight - 40 >= card.offsetWidth) { card.style.setProperty('left', `${textRight - hr.left + 32}px`); card.style.setProperty('top', `${wr.top - hr.top}px`); }
    else { card.style.setProperty('left', '0px'); card.style.setProperty('top', `${sr.bottom - hr.top + 12}px`); }
  };
  h1.addEventListener('click', e => {
    if (e.target.closest('a, button, .ht-card')) return;
    const w = e.target.closest('.ht-word');
    if (w && !typing) { if (card) closeCard(); else openCard(w); return; }
    if (card) { closeCard(); return; }
    advance();
  });
  h1.addEventListener('keydown', e => { const w = e.target.closest?.('.ht-word'); if (w && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); if (card) closeCard(); else openCard(w); } });
  btn.addEventListener('click', () => { if (card) { card.remove(); card = null; return; } advance(); });
  // a language change puts the headline back in the new language
  addEventListener('megulit:lang', () => { card = null; down.hidden = true; clearTimeout(timer); typing = false; rest = []; idx = 0; saved = h1.innerHTML; h1.classList.remove('saying', 'typing'); h1.style.removeProperty('min-height'); label(); });
}
