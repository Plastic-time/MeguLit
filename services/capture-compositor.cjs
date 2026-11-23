// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Capture compositor bridge (docs/text-architecture.md, ②). Runs native/MeguLitCompositor.exe for the bound game window
   and turns what MeguLit knows about the current line into its stdin protocol:
     - part ①'s hookGlyphDots events (core/hook-native.cjs re-emits them): state 'line' → a new line (①'s text is
       blank-stripped; dot i = character i of it), state 'dots' → per-character metrics (cell height, ascent, advance,
       dot offset) so MeguLit's glyphs sit on the game's own cells and baselines;
     - the reader's translation and furigana for that line (often later than the line itself) → 'annotate';
     - the reader's style (mode bilingual / Japanese / translation only, fonts, furigana on/off) → 'style';
     - menu choices → 'choices'.
   Events back: 'ready', 'line' (status per line), 'undot' (a line or a menu cannot be matched: the caller hands it back
   to the game / old overlay), 'lookup' (a click on one of MeguLit's glyphs: line id + character index into ①'s
   text), 'fallback' (capture could not start: keep the old overlay window), 'stats', 'exit'.
   Not wired into runtime.cjs yet: it waits for ① (feat/glyph-dots) to land. */
const path = require('node:path'), fs = require('node:fs'), { spawn: realSpawn } = require('node:child_process');

const BLANK = /[\u0000- 　​﻿]/u;
// Index map full line text → ①'s blank-stripped text (furigana spans from the reader index the full text).
function strip(text) {
  const chars = [...String(text || '')], map = []; let out = '';
  for (const c of chars) { map.push([...out].length); if (!BLANK.test(c)) out += c; }
  map.push([...out].length);
  return { text: out, map };
}
function rubyToStripped(text, ruby) {
  const { map } = strip(text);
  return (ruby || []).map(r => [map[r[0]] ?? r[0], map[r[1]] ?? r[1], String(r[2] || '')]).filter(r => r[1] > r[0] && r[2]);
}

class CaptureCompositor {
  constructor({ root, spawn = realSpawn, onEvent = () => {}, exe } = {}) {
    this.root = root; this.spawnFn = spawn; this.onEvent = onEvent;
    this.exe = exe || path.join(root || '', 'native', 'MeguLitCompositor.exe');
    this.proc = null; this.buf = ''; this.lines = new Map(); this.current = 0;
  }
  available() { return fs.existsSync(this.exe); }
  start({ hwnd, scale = false } = {}) {
    if (this.proc) return true;
    if (!hwnd) return false;
    const args = ['--hwnd', String(hwnd)]; if (scale) args.push('--scale');
    /* test aid: extra switches, e.g. "--shots <dir> --shot-every 120" */if (process.env.MEGULIT_COMPOSITOR_ARGS) args.push(...process.env.MEGULIT_COMPOSITOR_ARGS.split('|'));
    try { this.proc = this.spawnFn(this.exe, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true }); }
    catch (e) { this.onEvent({ e: 'fallback', reason: 'spawn', message: String(e && e.message || e) }); return false; }
    this.proc.stdout.on('data', d => this.read(d));
    this.proc.on('exit', code => { this.proc = null; this.onEvent({ e: 'exit', code }); });
    this.proc.on('error', e => { this.proc = null; this.onEvent({ e: 'fallback', reason: 'spawn', message: String(e && e.message || e) }); });
    return true;
  }
  read(d) {
    this.buf += d; let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
      if (!l) continue; let e; try { e = JSON.parse(l); } catch { continue; }
      if (e.e === 'lookup') { const line = this.lines.get(e.id); if (line) e.char = [...line.text][e.index] ?? ''; }
      this.onEvent(e);
    }
  }
  send(o) { if (this.proc && this.proc.stdin && !this.proc.stdin.destroyed) this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  // ①'s events, unchanged from HookBridge / hook-native.
  hookGlyphDots(m) {
    if (!m || m.type !== 'hookGlyphDots') return;
    if (m.state === 'line') {
      const id = Number(m.seq) || 0, text = String(m.text || '');
      this.lines.set(id, { text }); this.current = id;
      if (this.lines.size > 64) this.lines.delete(this.lines.keys().next().value);
      this.send({ t: 'line', id, text, expected: [...text].length });
    } else if (m.state === 'dots') {
      // d: dotted, c: cached dot, b: blind dot (drawn before its line arrived, mapped to a character by reading order)
      const glyphs = (m.dots || []).filter(d => d && (d.k === 'd' || d.k === 'c' || d.k === 'b') && Number.isInteger(d.i) && d.i >= 0)
        .map(d => ({ i: d.i, h: d.h, b: d.b, a: d.a, x: d.x, y: d.y, k: d.k }));
      if (glyphs.length) this.send({ t: 'glyphs', id: Number(m.seq) || this.current, glyphs });
    }
  }
  // The reader's translation / furigana of a line (full text as the reader has it: ruby spans are re-indexed).
  annotate({ id = this.current, fullText, tl, ruby } = {}) {
    const o = { t: 'annotate', id };
    if (tl !== undefined) o.tl = String(tl || '');
    if (ruby) o.ruby = rubyToStripped(fullText ?? this.lines.get(id)?.text ?? '', ruby);
    this.send(o);
  }
  choices(items, color) { this.send({ t: 'choices', items: (items || []).map(x => ({ text: String(x.text || ''), tl: String(x.tl || '') })), ...(color ? { color } : {}) }); }
  choicesEnd() { this.send({ t: 'choicesEnd' }); }
  style(p = {}) {
    const mode = p.mode === 'translation' || p.mode === 'jp' ? p.mode : 'bilingual';
    const o = { t: 'style', mode };
    for (const k of ['jpFont', 'tlFont', 'rubyFont', 'tlColor', 'jpColor']) if (p[k]) o[k] = String(p[k]);
    for (const k of ['ruby', 'shadow', 'plate', 'lookup']) if (typeof p[k] === 'boolean') o[k] = p[k];
    if (p.tlPlace === 'below' || p.tlPlace === 'above') o.tlPlace = p.tlPlace;
    if (Number.isFinite(p.tlScale)) o.tlScale = p.tlScale;
    this.send(o);
  }
  clear() { this.send({ t: 'clear' }); }
  undot(id) { this.send({ t: 'undot', id }); }
  shot(file) { this.send({ t: 'shot', path: file }); }
  stop() {const p=this.proc;const result=require('../core/owned-exit.cjs').trackStop(this,p,()=>{this.send({t:'quit'});p.stdin?.end();});this.proc=null;return result;}
}

module.exports = { CaptureCompositor, strip, rubyToStripped };
