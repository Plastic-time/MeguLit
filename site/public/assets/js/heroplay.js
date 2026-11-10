// SPDX-License-Identifier: GPL-3.0-or-later
// The hero headline plays like a galgame text box: a click (or Enter/Space on the ▼ button) types the next line
// character by character, with furigana on the Japanese; a click while it types shows the whole line at once, as in a
// game; after the last line the headline comes back. Lines are written as text with {漢字|かんじ} for ruby.

const LINES = {
  zh: ['台词上，{読|よ}み{方|かた}已经标好了', '{分|わ}からない的词，点一下就懂', '读过的词，它都帮你记着', '那么——{始|はじ}めようか'],
  ja: ['セリフには、{読|よ}み{方|かた}がもう{付|つ}いてる', '{分|わ}からない{言葉|ことば}は、クリックひとつ', '{読|よ}んだ{言葉|ことば}は、ちゃんと{覚|おぼ}えておく', 'さあ、{始|はじ}めよう'],
  en: ['Every line comes with its readings', 'Don’t know a word? One click', 'What you read, it remembers', 'Now — shall we begin?'],
};
const NEXT = { zh: '点击继续', ja: 'クリックで次へ', en: 'click to continue' };

// "{読|よ}み" -> pieces: a ruby group or a single character, each typed as one step
const pieces = line => {
  const out = [];
  for (const m of line.matchAll(/\{([^|}]+)\|([^}]+)\}|./gsu)) {
    if (m[1]) { const r = document.createElement('ruby'); r.append(m[1]); const rt = document.createElement('rt'); rt.textContent = m[2]; r.append(rt); out.push(r); }
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
  h1.classList.add('ht-play');
  const label = () => { btn.querySelector('.ht-next-k').textContent = NEXT[lang()] || NEXT.en; btn.setAttribute('aria-label', NEXT[lang()] || NEXT.en); };
  label();
  const finish = () => { clearTimeout(timer); typing = false; const say = h1.querySelector('.ht-say'); if (say) say.append(...rest); rest = []; h1.classList.remove('typing'); };
  const advance = () => {
    if (typing) { finish(); return; }
    const lines = LINES[lang()] || LINES.en;
    idx = (idx + 1) % (lines.length + 1);
    if (idx === 0) { h1.innerHTML = saved; h1.classList.remove('saying'); h1.style.removeProperty('min-height'); return; }
    if (!h1.classList.contains('saying')) h1.style.setProperty('min-height', `${h1.offsetHeight}px`);
    h1.classList.add('saying');
    const say = document.createElement('span'); say.className = 'ht-say'; say.lang = lang() === 'en' ? 'en' : 'ja';
    h1.replaceChildren(say);
    rest = pieces(lines[idx - 1]);
    if (reduce) { finish(); return; }
    typing = true; h1.classList.add('typing');
    const step = () => { if (!rest.length) { finish(); return; } say.append(rest.shift()); timer = setTimeout(step, 55); };
    step();
  };
  h1.addEventListener('click', e => { if (!e.target.closest('a, button')) advance(); });
  btn.addEventListener('click', advance);
  // a language change puts the headline back in the new language
  addEventListener('megulit:lang', () => { clearTimeout(timer); typing = false; rest = []; idx = 0; saved = h1.innerHTML; h1.classList.remove('saying', 'typing'); h1.style.removeProperty('min-height'); label(); });
}
