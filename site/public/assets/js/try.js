// SPDX-License-Identifier: GPL-3.0-or-later
// "Try it" section: three small hands-on widgets.
//   1. reader: a game dialogue box with real lines from the recordings; tap a word for its reading and meaning, add it
//      to a little Anki deck (the card flies into the deck counter); tap the box for the next line, like in a game.
//   2. before/after: one real game frame (text erased), the plain line on one side and MeguLit's furigana + translation
//      on the other; drag the divider (or use the arrow keys on it).
//   3. kana challenge: ten kana, three seconds each, pick the reading; streak, score and a link to the kana course.
// Strings for all three languages live here; the page's own language switch re-renders them.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const h = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

const T = {
  zh: { hint: '点台词里的词看读音和意思；点对话框空白处读下一句', add: '加入 Anki', added: '已加入', deck: n => `我的卡组 · ${n} 张`, next: '下一句', pos: '词性', base: '原形',
        before: '游戏原样', after: '开着 MeguLit', drag: '拖动分界线',
        kStart: '开始挑战', kAgain: '再来一次', kRound: (i, n) => `第 ${i} / ${n} 题`, kStreak: n => `连对 ${n}`, kHint: '三秒内选出它的读音',
        kDone: (s, n, b) => `答对 ${s} / ${n} · 最长连对 ${b}`, kGood: '五十音挺熟了！去游戏里读真台词吧', kMore: '还不熟也没关系：MeguLit 里有 25 课五十音和三种小游戏', kCta: '下载 MeguLit 学完整套', kTimeout: '时间到' },
  ja: { hint: 'セリフの言葉をタップすると読みと意味が出ます。空いている所をタップで次のセリフへ', add: 'Anki に追加', added: '追加済み', deck: n => `マイデッキ · ${n} 枚`, next: '次へ', pos: '品詞', base: '原形',
        before: 'ゲームそのまま', after: 'MeguLit あり', drag: '境界線をドラッグ',
        kStart: 'チャレンジ開始', kAgain: 'もう一回', kRound: (i, n) => `${i} / ${n} 問`, kStreak: n => `${n} 連続正解`, kHint: '3 秒以内に読みを選んでください',
        kDone: (s, n, b) => `正解 ${s} / ${n} · 最長 ${b} 連続`, kGood: 'かなはばっちり！ゲームで本物のセリフを読んでみよう', kMore: 'まだ不安でも大丈夫。MeguLit には 25 課の五十音と 3 つのミニゲームがあります', kCta: 'MeguLit をダウンロード', kTimeout: '時間切れ' },
  en: { hint: 'Tap a word in the line for its reading and meaning; tap an empty spot in the box for the next line', add: 'Add to Anki', added: 'Added', deck: n => `My deck · ${n} card${n === 1 ? '' : 's'}`, next: 'Next', pos: 'Part of speech', base: 'Dictionary form',
        before: 'The game as is', after: 'With MeguLit', drag: 'Drag the divider',
        kStart: 'Start', kAgain: 'Again', kRound: (i, n) => `${i} / ${n}`, kStreak: n => `${n} in a row`, kHint: 'Pick its reading within three seconds',
        kDone: (s, n, b) => `${s} / ${n} right · best streak ${b}`, kGood: 'Your kana are solid. Time to read real lines in a game!', kMore: 'Not there yet? MeguLit has 25 kana lessons and three mini games', kCta: 'Download MeguLit', kTimeout: 'Time’s up' },
};

// words: reading, dictionary form (when inflected), part of speech and meanings in three languages
const POS = { n: { zh: '名词', ja: '名詞', en: 'noun' }, pron: { zh: '代词', ja: '代名詞', en: 'pronoun' }, v5: { zh: '五段动词', ja: '五段動詞', en: 'godan verb' },
  v1: { zh: '下一段动词', ja: '下一段動詞', en: 'ichidan verb' }, prt: { zh: '助词', ja: '助詞', en: 'particle' }, adj: { zh: '形容词', ja: '形容詞', en: 'i-adjective' }, adv: { zh: '副词', ja: '副詞', en: 'adverb' } };
const DICT = {
  '雪': { r: 'ゆき', p: 'n', m: { zh: ['雪'], ja: ['空から降る氷の結晶'], en: ['snow'] } },
  'に': { p: 'prt', m: { zh: ['表示位置、对象或结果'], ja: ['場所・対象・結果を示す'], en: ['marks a place, target or result'] } },
  '埋もれた': { r: 'うもれた', b: '埋もれる', p: 'v1', m: { zh: ['被埋住；被掩埋', '（才能等）被埋没'], ja: ['物の下にすっかり隠れる', '世に知られずにいる'], en: ['to be buried', '(of talent) to go unnoticed'] } },
  '僕': { r: 'ぼく', p: 'pron', m: { zh: ['我（男性自称）'], ja: ['男性の自称'], en: ['I, me (said by men)'] } },
  'の': { p: 'prt', m: { zh: ['的（表示所属）'], ja: ['所有・所属を示す'], en: ['of; ’s (possession)'] } },
  '手': { r: 'て', p: 'n', m: { zh: ['手'], ja: ['手'], en: ['hand'] } },
  'それ': { p: 'pron', m: { zh: ['那个；它'], ja: ['相手の近くの物を指す'], en: ['that; it'] } },
  'が': { p: 'prt', m: { zh: ['表示主语'], ja: ['主語を示す'], en: ['marks the subject'] } },
  '何か': { r: 'なにか', p: 'pron', m: { zh: ['什么东西；某物'], ja: ['はっきりしない物事'], en: ['something'] } },
  'を': { p: 'prt', m: { zh: ['表示动作的对象'], ja: ['動作の対象を示す'], en: ['marks the object'] } },
  '掴んでいた': { r: 'つかんでいた', b: '掴む', p: 'v5', m: { zh: ['抓住；揪住', '抓住（机会）'], ja: ['手でしっかり握る', '（機会などを）とらえる'], en: ['to grab, to grip', 'to seize (a chance)'] } },
  '彼女': { r: 'かのじょ', p: 'pron', m: { zh: ['她', '女朋友'], ja: ['女性を指す三人称', '恋人である女性'], en: ['she, her', 'girlfriend'] } },
  '顔': { r: 'かお', p: 'n', m: { zh: ['脸'], ja: ['顔'], en: ['face'] } },
  '覆う': { r: 'おおう', p: 'v5', m: { zh: ['覆盖；遮住'], ja: ['上からかぶせて隠す'], en: ['to cover'] } },
  '払う': { r: 'はらう', p: 'v5', m: { zh: ['拂去；掸掉', '支付'], ja: ['手などで取り除く', '代金を渡す'], en: ['to brush off', 'to pay'] } },
  '今なお': { r: 'いまなお', p: 'adv', m: { zh: ['至今仍然'], ja: ['今でもまだ'], en: ['even now, still'] } },
  'は': { p: 'prt', m: { zh: ['表示话题'], ja: ['話題を示す'], en: ['marks the topic'] } },
  '降り続け': { r: 'ふりつづけ', b: '降り続ける', p: 'v1', m: { zh: ['（雨、雪）一直下个不停'], ja: ['やまずに降る'], en: ['(of rain, snow) to keep falling'] } },
  '体': { r: 'からだ', p: 'n', m: { zh: ['身体'], ja: ['体'], en: ['body'] } },
  '白く': { r: 'しろく', b: '白い', p: 'adj', m: { zh: ['白（的）；雪白地'], ja: ['白い色であるさま'], en: ['white; whitely'] } },
  '覆っていく': { r: 'おおっていく', b: '覆う', p: 'v5', m: { zh: ['渐渐覆盖'], ja: ['だんだん覆う'], en: ['to gradually cover'] } },
};
// lines from the game in the recordings, with the game's own translation (Chinese) and an English one
const LINES = [
  { w: ['雪', 'に', '埋もれた', '…', '僕', 'の', '手', '。'], tr: { zh: '被雪掩埋的……我的手。', en: 'My hand… buried in the snow.' } },
  { w: ['それ', 'が', '、', '何か', 'を', '掴んでいた', '。'], tr: { zh: '它似乎抓住了什么。', en: 'It was holding on to something.' } },
  { w: ['彼女', 'の', '顔', 'を', '覆う', '雪', 'を', '払う', '。'], tr: { zh: '拂去覆盖在她脸上的雪。', en: 'I brush away the snow that covers her face.' } },
];
const SLIDER_LINE = [['今', 'いま'], ['なお、それは'], ['降', 'ふ'], ['り'], ['続', 'つづ'], ['け、'], ['僕', 'ぼく'], ['の'], ['体', 'からだ'], ['を'], ['白', 'しろ'], ['く'], ['覆', 'おお'], ['っていく。']];
const SLIDER_TR = { zh: '它至今仍在不停地下着，将我的身体渐渐覆成一片雪白。', en: 'Even now it keeps falling, covering my body in white.' };

const ruby = (text, reading) => {
  if (!reading) return document.createTextNode(text);
  const r = h('ruby'); r.append(text, h('rt', null, reading)); return r;
};

export function tryIt({ lang, reduce }) {
  const root = $('.try');
  if (!root) return;
  const t = () => T[lang()] || T.zh;
  const tr = o => o[lang()] || o.en || o.zh;   // Japanese visitors get the English translation

  // ---- 1. reader ------------------------------------------------------------------------------------------------------
  const reader = $('.tr-reader', root), lineEl = $('.tr-line', reader), transEl = $('.tr-trans', reader), card = $('.tr-card', reader);
  const deckEl = $('.tr-deck', root), deckLabel = $('.tr-deck-n', root), hintEl = $('.tr-hint', root), nextBtn = $('.tr-next', root);
  let li = 0, deck = new Set(), open = null;
  const paintLine = () => {
    const line = LINES[li];
    lineEl.replaceChildren(...line.w.map(w => {
      const d = DICT[w];
      if (!d) return document.createTextNode(w);
      const b = h('button', 'tr-w'); b.type = 'button'; b.dataset.w = w;
      // furigana only over the kanji part: the reading is shown whole above the word, like MeguLit's ruby
      // furigana over the kanji only: a kana ending shared by word and reading (okurigana) stays outside the ruby
      const tail = (w.match(/[぀-ゟ]+$/) || [''])[0];
      if (/[一-鿿]/.test(w) && d.r && tail && d.r.endsWith(tail)) b.append(ruby(w.slice(0, -tail.length), d.r.slice(0, -tail.length)), tail);
      else b.append(/[一-鿿]/.test(w) && d.r ? ruby(w, d.r) : document.createTextNode(w));
      if (deck.has(w)) b.classList.add('in-deck');
      return b;
    }));
    transEl.textContent = tr(line.tr);
    lineEl.classList.remove('enter'); void lineEl.offsetWidth; lineEl.classList.add('enter');
  };
  const paintCard = (w, anchor) => {
    const d = DICT[w], L = lang();
    card.replaceChildren();
    // the word as it appears, its reading, its part of speech; inflected words also show their dictionary form
    const head = h('p', 'tc-head');
    head.append(h('span', 'tc-word', w), h('span', 'tc-read', d.r || ''), h('span', 'tc-pos', POS[d.p][L] || POS[d.p].en));
    card.append(head);
    if (d.b) card.append(h('p', 'tc-base', `${t().base} · ${d.b}`));
    const ol = h('ol', 'tc-means');
    (d.m[L] || d.m.en).forEach(m => ol.append(h('li', null, m)));
    card.append(ol);
    const add = h('button', 'tc-add', deck.has(w) ? t().added : t().add); add.type = 'button'; add.disabled = deck.has(w);
    add.addEventListener('click', e => { e.stopPropagation(); addToDeck(w, add); });
    card.append(add);
    card.hidden = false;
    // place the card above the word, kept inside the scene
    const sr = reader.getBoundingClientRect(), ar = anchor.getBoundingClientRect(), cw = card.offsetWidth, ch = card.offsetHeight;
    const x = Math.min(Math.max(8, ar.left - sr.left + ar.width / 2 - cw / 2), sr.width - cw - 8);
    const y = Math.max(8, ar.top - sr.top - ch - 12);
    card.style.left = `${x}px`; card.style.top = `${y}px`;
    if (!reduce) card.animate([{ opacity: 0, transform: 'translateY(6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' });
    open = w;
  };
  const closeCard = () => { card.hidden = true; open = null; $$('.tr-w.on', lineEl).forEach(b => b.classList.remove('on')); };
  const addToDeck = (w, btn) => {
    if (deck.has(w)) return;
    deck.add(w);
    btn.textContent = t().added; btn.disabled = true;
    $$(`.tr-w[data-w="${w}"]`, lineEl).forEach(b => b.classList.add('in-deck'));
    paintDeck(true);
    if (reduce) return;
    // a small card flies from the word card into the deck
    const from = card.getBoundingClientRect(), to = deckEl.getBoundingClientRect();
    const fly = h('div', 'tr-fly', DICT[w].b || w);
    document.body.append(fly);
    fly.animate([
      { transform: `translate(${from.left + from.width / 2}px, ${from.top + from.height / 2}px) translate(-50%, -50%) scale(1)`, opacity: 1 },
      { transform: `translate(${to.left + 24}px, ${to.top + to.height / 2}px) translate(-50%, -50%) scale(.4) rotate(-8deg)`, opacity: .2 },
    ], { duration: 650, easing: 'cubic-bezier(.6,0,.3,1)' }).finished.then(() => fly.remove());
  };
  const paintDeck = bump => {
    deckLabel.textContent = t().deck(deck.size);
    $('.tr-stack', deckEl).replaceChildren(...[...deck].slice(-5).map((w, i) => { const c = h('span', 'tr-mini', DICT[w].b || w); c.style.setProperty('--i', i); return c; }));
    if (bump && !reduce) deckEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 320, delay: 520 });
  };
  lineEl.addEventListener('click', e => {
    const b = e.target.closest('.tr-w');
    if (!b) return;
    e.stopPropagation();
    $$('.tr-w.on', lineEl).forEach(x => x.classList.remove('on'));
    if (open === b.dataset.w) { closeCard(); return; }
    b.classList.add('on');
    paintCard(b.dataset.w, b);
  });
  card.addEventListener('click', e => e.stopPropagation());
  const next = () => { closeCard(); li = (li + 1) % LINES.length; paintLine(); };
  $('.tr-scene', reader).addEventListener('click', () => { if (open) closeCard(); else next(); });
  nextBtn.addEventListener('click', next);
  addEventListener('keydown', e => { if (e.key === 'Escape' && open) closeCard(); });

  // ---- 2. before / after ------------------------------------------------------------------------------------------------
  const ba = $('.ba', root), range = $('.ba-range', ba);
  const afterLine = $('.ba-after .ba-text', ba), afterTr = $('.ba-after .ba-tr', ba);
  afterLine.replaceChildren(...SLIDER_LINE.map(([s, r]) => ruby(s, r)));
  const setX = v => { ba.style.setProperty('--x', `${v}%`); range.value = v; };
  const fromPointer = e => { const r = ba.getBoundingClientRect(); setX(Math.round(Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)))); };
  let dragging = false;
  ba.addEventListener('pointerdown', e => { dragging = true; ba.setPointerCapture(e.pointerId); fromPointer(e); });
  ba.addEventListener('pointermove', e => { if (dragging) fromPointer(e); });
  ba.addEventListener('pointerup', () => { dragging = false; });
  ba.addEventListener('pointercancel', () => { dragging = false; });
  range.addEventListener('input', () => setX(Number(range.value)));
  setX(50);
  // once, when it first comes into view: the divider sweeps across to show what it does
  if (!reduce) new IntersectionObserver(([e], io) => {
    if (!e.isIntersecting) return;
    io.disconnect();
    const t0 = performance.now();
    const step = now => { const k = Math.min(1, (now - t0) / 1800); setX(Math.round(50 + Math.sin(k * Math.PI * 2) * 32 * (1 - k * .3))); if (k < 1 && !dragging) requestAnimationFrame(step); else if (!dragging) setX(50); };
    requestAnimationFrame(step);
  }, { threshold: .6 }).observe(ba);

  // ---- 3. kana challenge ------------------------------------------------------------------------------------------------
  const KANA = 'あa いi うu えe おo かka きki くku けke こko さsa しshi すsu せse そso たta ちchi つtsu てte とto なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa をwo んn '
    + 'アa イi ウu エe オo カka キki クku ケke コko サsa シshi スsu セse ソso タta チchi ツtsu テte トto ナna ニni ヌnu ネne ノno ハha ヒhi フfu ヘhe ホho マma ミmi ムmu メme モmo ヤya ユyu ヨyo ラra リri ルru レre ロro ワwa ヲwo ンn';
  const pool = KANA.trim().split(/\s+/).map(s => [s[0], s.slice(1)]);
  const kq = $('.kq', root), glyph = $('.kq-kana', kq), opts = $('.kq-opts', kq), info = $('.kq-info', kq), bar = $('.kq-bar i', kq), end = $('.kq-end', kq), startBtn = $('.kq-start', kq);
  const N = 10, LIMIT = 3000;
  let round = 0, score = 0, streak = 0, best = 0, timer = 0, t0 = 0, raf2 = 0, answer = '', busy = false;
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const paintInfo = () => { info.replaceChildren(h('span', null, t().kRound(Math.min(round + 1, N), N)), h('span', 'kq-streak', t().kStreak(streak))); };
  const ask = () => {
    busy = false;
    const [k, ro] = pool[Math.floor(Math.random() * pool.length)];
    answer = ro;
    const wrong = shuffle([...new Set(pool.map(p => p[1]).filter(x => x !== ro))]).slice(0, 3);
    glyph.textContent = k;
    if (!reduce) glyph.animate([{ opacity: 0, transform: 'scale(1.3)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
    opts.replaceChildren(...shuffle([ro, ...wrong]).map(x => { const b = h('button', 'kq-opt', x); b.type = 'button'; b.addEventListener('click', () => pick(b, x)); return b; }));
    paintInfo();
    t0 = performance.now();
    cancelAnimationFrame(raf2);
    const tick = now => { const k = Math.min(1, (now - t0) / LIMIT); bar.style.transform = `scaleX(${1 - k})`; if (k < 1) raf2 = requestAnimationFrame(tick); };
    raf2 = requestAnimationFrame(tick);
    clearTimeout(timer);
    timer = setTimeout(() => pick(null, null), LIMIT);
  };
  const pick = (btn, x) => {
    if (busy) return;
    busy = true;
    clearTimeout(timer); cancelAnimationFrame(raf2);
    const ok = x === answer;
    if (ok) { score++; streak++; best = Math.max(best, streak); } else streak = 0;
    $$('.kq-opt', opts).forEach(b => { b.disabled = true; if (b.textContent === answer) b.classList.add('right'); });
    if (btn && !ok) { btn.classList.add('wrong'); if (!reduce) btn.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 240 }); }
    if (!btn) glyph.dataset.note = t().kTimeout; else delete glyph.dataset.note;
    paintInfo();
    round++;
    setTimeout(() => { delete glyph.dataset.note; if (round >= N) finish(); else ask(); }, ok ? 450 : 900);
  };
  const finish = () => {
    kq.classList.remove('playing'); kq.classList.add('done');
    end.hidden = false;
    end.replaceChildren(h('p', 'kq-score', t().kDone(score, N, best)), h('p', 'kq-msg', score >= 8 ? t().kGood : t().kMore));
    const a = h('a', 'kq-cta', t().kCta); a.href = '#download';
    end.append(a);
    startBtn.textContent = t().kAgain; startBtn.hidden = false;
  };
  startBtn.addEventListener('click', () => {
    round = 0; score = 0; streak = 0; best = 0;
    kq.classList.add('playing'); kq.classList.remove('done');
    end.hidden = true; startBtn.hidden = true;
    ask();
  });
  addEventListener('keydown', e => {
    if (!kq.classList.contains('playing') || busy) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) { const b = $$('.kq-opt', opts)[n - 1]; if (b) pick(b, b.textContent); }
  });

  // ---- language ---------------------------------------------------------------------------------------------------------
  const paintLang = () => {
    hintEl.textContent = t().hint; nextBtn.textContent = t().next;
    $('.ba-before .ba-tag', ba).textContent = t().before; $('.ba-after .ba-tag', ba).textContent = t().after;
    range.setAttribute('aria-label', t().drag);
    afterTr.textContent = tr(SLIDER_TR);
    if (!kq.classList.contains('playing')) { startBtn.textContent = kq.classList.contains('done') ? t().kAgain : t().kStart; info.textContent = t().kHint; }
    if (kq.classList.contains('done')) finish();
    paintDeck(false);
    paintLine();
    if (open) closeCard();
  };
  paintLang();
  addEventListener('megulit:lang', paintLang);
}
