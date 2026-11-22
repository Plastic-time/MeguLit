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
  if (key.length < 4) continue;
  exact.set(key, exact.has(key) && exact.get(key) !== lines[i] ? '' : lines[i]);
  for (let j = 0; j + 8 <= key.length; j++) {
   const anchor = key.slice(j, j + 8), indexes = postings.get(anchor);
   if (!indexes) postings.set(anchor, [i]);
   else if (indexes.at(-1) !== i) indexes.push(i);
  }
 }
 return text => {
  const key = normalize(text);
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
  return match;
 };
}

// PageLocator reports a group after two observations. Its once events describe
// text already gone. Settle show/hide events from one scan together.
class SayaPageOcr {
 constructor(hook) { this.hook = hook; this.visible = new Map(); }
 stop() { clearTimeout(this.timer); this.visible.clear(); }
 update(m) {
  if (m.once || m.id == null) return;
  if (m.visible && m.text && !m.dialogSeen) this.visible.set(m.id, m.text);
  else this.visible.delete(m.id);
  clearTimeout(this.timer);
  this.timer = setTimeout(() => this.flush(), 80);
  this.timer.unref?.();
 }
 flush() {
  const h = this.hook;
  if (!legacyExe(h.target?.name) || !h.windowState?.bound) return;
  const own = h.state.hookSourceEngine === 'saya-page-ocr' && h.state.hookSourceOrigin === 'ocr';
  if (!own && h.lastSource && h.now() - h.lastSourceAt < 5000) return;
  const lines = new Set();
  for (const text of this.visible.values()) {
   const line = h.originalText?.sayaPageLine?.(text);
   if (line) lines.add(line);
  }
  if (lines.size === 1) {
   const [line] = lines;
   if (line === h.lastSource) return;
   h.originalTextFor(line);
   h.emitSource(line, 'ocr', 'saya-page-ocr');
  } else if (own && h.lastSource) {
   h.lastSource = '';
   h.lastSourceAt = 0;
   h.notify({hookSource:'', hookSpeaker:'', hookSourceRuby:[], hookSourceEngine:'', hookSourceOrigin:'leave',
    hookSequence:(h.state.hookSequence || 0) + 1, receivedText:false});
  }
 }
}

module.exports = {legacyExe, scriptLookup, SayaPageOcr};
