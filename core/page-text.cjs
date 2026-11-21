// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-20 (user, CHAOS;CHILD: "游戏里的一句话经常被拆成两句"; live log of the MAGES text stream). Games that keep several
   clicks on one page give the reader two kinds of text besides the line just added:
   - the page so far: when the page is turned, redrawn or skipped through, the stream sends every line of the page again
     in one piece ("西暦…。 発生は、突然だった。", "けれど、今は違う。【大谷】「…」"), the lines joined with a space or nothing;
   - the rest of a sentence: one sentence typed out over two clicks ("チーズを切ろうと包丁を取り出して、" then
     "妙な音が響いた。"); the game shows the second part after the first, on the same page.
   Decided by behaviour only, for every engine:
   - a text made of lines shown a moment ago, in their order, is the page drawn again: nothing new (dropped); a text
     that starts with such lines and goes on is the page plus its new part: only the new part is the line;
   - a line shown a moment ago that comes back alone, while it is no longer the current line, is a redraw (dropped);
   - a line that follows one ending in a comma (、，,) is the rest of that sentence: the reader shows both parts as one
     sentence (`continues`: how many characters of the shown text came before). */
const { unfinished } = require('./sentence-pieces.cjs');
const key = s => String(s || '').replace(/【[^【】\n]{1,16}】/g, '').replace(/[\s　]+/g, '');
const COMMA = /[、，,]$/, ENDED = /[。．！？!?」』）)】…‥―－ー〜～♪]$/;
const RECENT = 12, RECENT_MS = 30 * 60 * 1000, REDRAW_MS = 3 * 60 * 1000;

class PageText {
  constructor() { this.recent = []; this.display = ''; this.displayAt = 0; this.ended = true; }
  reset() { this.recent = []; this.display = ''; this.displayAt = 0; this.ended = true; this.paging = false; }
  /* the next line joins the page of the lines shown before it: the game sends its page again when it turns it (verified
     live, CHAOS;CHILD: "…。 発生は、突然だった。" came with the click that cleared that page), so no such resend since the last
     line means the page is still on screen */
  /* #468 a page another stream shows the game holding (hook-native auxPage) is turned by that evidence, not after six lines */
  cap(now = Date.now()) { return this.auxPageAt && now - this.auxPageAt < 120000 ? 40 : 6; }
  samePage(now = Date.now()) { return !this.ended && (this.onPage || 0) < this.cap(now) && now - this.displayAt >= 900; } /* skipping (lines under 0.9 s apart, live 2026-11-20 Ctrl-skip piled a wall of lines): no page is stacked */ /* a text page holds a few lines: more in a row came without a resend (skipping), so a new page */
  /* only a stream that has sent a page again is a page stream; others (ADV games) get no page reports at all */
  get pages() { return this.paging === true; }
  /* what part of `text` is new: { drop: reason } or { text } (the new part, original spacing kept) */
  take(text, now = Date.now()) {
    const raw = String(text || ''), k = key(raw);
    this.recent = this.recent.filter(r => now - r.at < RECENT_MS);
    if (!k || !this.recent.length) return { text: raw };
    /* longest run of consecutive recent lines that the text starts with */
    let best = 0, parts = 0, lastPart = -1;
    for (let s = 0; s < this.recent.length; s++) {
      let acc = '';
      for (let e = s; e < this.recent.length; e++) {
        acc += this.recent[e].key;
        if (acc.length > k.length || !k.startsWith(acc)) break;
        if (acc.length > best || (acc.length === best && e - s + 1 > parts)) { best = acc.length; parts = e - s + 1; lastPart = e; }
      }
    }
    if (!best) {
      /* the page sent whole with lines never shown (skipping): its newest line is the one from the last speaker tag on */
      const tagAt = raw.lastIndexOf('【'); if (tagAt > 0 && raw.indexOf('】', tagAt) > tagAt && key(raw.slice(0, tagAt)).length >= 4) { const nxt = raw.slice(tagAt); if (key(nxt)) return { text: nxt, page: 0 }; }
      /* the page drawn again with its first lines unseen (MeguLit attached mid-page): it ends with the lines just shown */
      let acc = '';
      for (let e = this.recent.length - 1; e >= 0; e--) { acc = this.recent[e].key + acc; if (acc.length >= k.length || !k.endsWith(acc)) break; if (acc.length >= 6) return this.ended = true, this.paging = true, { drop: 'page drawn again (earlier part unseen)' }; }
      return { text: raw };
    }
    const newest = lastPart === this.recent.length - 1;
    if (best === k.length) {
      if (parts >= 2) return this.ended = true, this.paging = true, { drop: 'page drawn again (' + parts + ' lines)' };
      /* the current line again (its new part, after it was shown joined to the line before) */
      if (newest && (k.length >= 6 || now - this.recent[lastPart].at < 650)) return this.ended = true, this.paging = true, { drop: 'current line again' };
      /* one earlier line alone again: the current line is another one, and it was shown only a moment ago */
      /* (only the line just before: a game started again from the title shows its first lines again, and they are read) */
      if (lastPart === this.recent.length - 2 && k.length >= 6 && now - this.recent[lastPart].at < REDRAW_MS) return { drop: 'earlier line drawn again' };
      return { text: raw };
    }
    /* the page so far, then the new part: a page of at least one whole earlier line of some length */
    if (best < 6) return { text: raw };
    /* the shown line grown (a sentence the game adds to piece by piece, core/sentence-pieces.cjs): the whole of it is the line */
    if (parts === 1 && newest && (!ENDED.test(this.recent[lastPart].key) || unfinished(this.recent[lastPart].key))) return { text: raw };
    /* the page came whole with its new part (skipping): the lines shown before it are no longer what the reader stacks above
       it (live, Ctrl-skip piled every skipped line into one wall); the new part starts the stack again */
    this.ended = true; this.paging = true;
    return { text: tail(raw, best), page: parts };
  }
  /* the text the reader shows for `text` (the new part), and how much of it came before */
  continuation(text, now = Date.now()) {
    const t = String(text || '');
    if (!this.display || now - this.displayAt > RECENT_MS || !COMMA.test(this.display.replace(/[\s　]+$/, ''))) return null;
    /* a new paragraph (indent), a quotation or a name opens a new line, never the rest of the sentence */
    if (/^(?:　|\s*[「『（(【［[])/.test(t) || !key(t)) return null;
    /* already the whole sentence (grown by the engine or by core/sentence-pieces.cjs) */
    if (key(t).startsWith(key(this.display))) return null;
    const before = this.display.replace(/[\s　]+$/, '');
    /* inside an open 「『 the engine's pieces are core/sentence-pieces.cjs's (it knows the speakers and streams) */
    if (unfinished(before)) return null;
    return { text: before + t.replace(/^[\s　]+/, ''), continues: before.length };
  }
  /* a line was shown: `part` is what the stream added, `shown` the whole text the reader shows */
  shown(part, shown, now = Date.now()) {
    const k = key(part);
    if (k) { this.recent.push({ key: k, at: now }); if (this.recent.length > RECENT) this.recent.shift(); }
    this.display = String(shown || part || ''); this.displayAt = now; this.onPage = this.ended || (this.onPage || 0) >= this.cap(now) ? 1 : (this.onPage || 0) + 1; this.ended = false;
  }
}
/* the original text after its first `n` key characters (spaces and speaker tags not counted) */
function tail(raw, n) {
  let i = 0, seen = 0;
  while (i < raw.length && seen < n) {
    if (raw[i] === '【') { const close = raw.indexOf('】', i); if (close > i && close - i <= 17) { i = close + 1; continue; } }
    if (!/[\s　]/.test(raw[i])) seen++;
    i++;
  }
  return raw.slice(i).replace(/^[\s　]+/, '');
}
module.exports = { PageText, key, tail };
