// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const legacyExe = name => /^saya(?:\.exe)?$/i.test(name || '');
const normalize = value => String(value || '').normalize('NFKC').replace(/[\s\p{P}]+/gu, '');

// A visible fragment identifies a whole script line. Repeated or competing anchors
// cannot identify the page, even when the reader last visited one of the candidates.
function scriptLookup(lines) {
 const keys = lines.map(normalize);
 const postings = new Map(), exact = new Map();
 for (let i = 0; i < keys.length; i++) {
  const key = keys[i];
  if (!key) continue;
  exact.set(key, exact.has(key) && exact.get(key) !== lines[i] ? '' : lines[i]);
  for (let j = 0; j + 8 <= key.length; j++) {
   const anchor = key.slice(j, j + 8), indexes = postings.get(anchor);
   if (!indexes) postings.set(anchor, [i]);
   else if (indexes.at(-1) !== i) indexes.push(i);
  }
 }
 return (text, mode) => {
  const key = normalize(text);
  if (mode === true) return exact.get(key) || '';
  if (key.length < 4 || key.length > 400) return '';
  if (exact.has(key)) return exact.get(key);
  const candidates = new Set();
  for (let i = 0; i + 8 <= key.length; i++) {
   for (const index of postings.get(key.slice(i, i + 8)) || []) candidates.add(index);
  }
  let match = '';
  for (const i of candidates) {
   const candidate = keys[i];
   let pairs = 0;
   for (let j = 1; j < key.length; j++) if (candidate.includes(key.slice(j - 1, j + 1))) pairs++;
   if (pairs < (key.length - 1) * .65) continue;
   if (match && match !== lines[i]) return '';
   match = lines[i];
  }
  // A wait glyph on the last row can be read as an extra character inside a
  // short ending. Accept its removal only for a unique full script suffix.
  if (!match && mode === 'bottom' && key.length >= 9 && key.length <= 32) {
   for (let j = 0; j < key.length; j++) {
    const tail = key.slice(0, j) + key.slice(j + 1);
    for (const i of postings.get(tail.slice(-8)) || []) {
     if (!keys[i].endsWith(tail)) continue;
     if (match && match !== lines[i]) return '';
     match = lines[i];
    }
   }
  }
  return match;
 };
}

function currentPage(groups, lookup) {
 if (!lookup) return '';
 if (!groups.some(group => group.rows?.length)) {
  const lines = new Set(groups.map(group => lookup(group.text)).filter(Boolean));
  return lines.size === 1 ? [...lines][0] : '';
 }
 // Background shapes below the NVL panel were recognised as oversized kana.
 const rows = groups.flatMap(group => (group.rows || []).filter(row =>
  !(group.sh > 0 && row.y + row.h > group.sh * .93 && row.h > group.sh * .065)));
 if (!rows.length) return '';
 // Sections of the same screen row sometimes arrive in different OCR groups.
 rows.sort((a, b) => a.y - b.y || a.x - b.x);
 const bands = [];
 for (const row of rows) {
  const band = bands.at(-1);
  if (band && Math.abs(row.y - band[0].y) <= Math.min(row.h, band[0].h) / 2) band.push(row);
  else bands.push([row]);
 }
 const text = bands.map(band => band.sort((a, b) => a.x - b.x).map(row => row.text).join(''));
 const bottom = normalize(text.at(-1));
 let suffix = '';
 for (let i = text.length - 1; i >= 0; i--) {
  suffix = text[i] + suffix;
  const line = lookup(suffix, i === text.length - 1 ? 'bottom' : undefined);
  if (!line) continue;
  if (i === text.length - 1) return line;
  // An older verified paragraph cannot vouch for an unreadable new bottom row.
  const key = normalize(line);
  if (bottom.length < 4) return bottom && key.slice(-4).includes(bottom.at(-1)) ? line : '';
  let pairs = 0;
  for (let j = 1; j < bottom.length; j++) if (key.includes(bottom.slice(j - 1, j + 1))) pairs++;
  if (pairs >= (bottom.length - 1) * .5) return line;
 }
 return '';
}

// PageLocator reports a group after two observations. Its once events describe
// text already gone. Settle show/hide events from one scan together.
class SayaPageOcr {
 constructor(hook) { this.hook = hook; this.visible = new Map(); }
 stop() { clearTimeout(this.timer); this.visible.clear(); }
 providerReady() {
  if (this.visible.size && this.provider !== this.hook.originalText) this.flush();
 }
 update(m) {
  if (m.once || m.id == null) return;
  if (m.visible && m.text && !m.dialogSeen) this.visible.set(m.id, m);
  else this.visible.delete(m.id);
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.flush(), 80);
  this.timer.unref?.();
 }
 flush() {
  const h = this.hook;
  if (!legacyExe(h.target?.name) || !h.windowState?.bound) return;
  this.provider = h.originalText;
  const own = h.state.hookSourceEngine === 'saya-page-ocr' && h.state.hookSourceOrigin === 'ocr';
  const nativeRead = h.state.hookSourceEngine === 'saya-script-read';
  const quiet = h.now() - h.lastSourceAt;
  if (!own && h.lastSource && quiet < 5000) {
   if (this.visible.size) {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 5000 - quiet);
    this.timer.unref?.();
   }
   return;
  }
  const line = currentPage([...this.visible.values()], h.originalText?.sayaPageLine);
  if (line) {
   if (line === h.lastSource) return;
   h.originalTextFor(line);
   h.emitSource(line, 'ocr', 'saya-page-ocr');
  } else if ((own || (nativeRead && this.visible.size)) && h.lastSource) {
   h.lastSource = '';
   h.lastSourceAt = 0;
   h.notify({hookSource:'', hookSpeaker:'', hookSourceRuby:[], hookSourceEngine:'', hookSourceOrigin:'leave',
    hookSequence:(h.state.hookSequence || 0) + 1, receivedText:false});
  }
 }
}

module.exports = {legacyExe, scriptLookup, SayaPageOcr};
