// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pointerTable} = require('../services/original-engines/kit.cjs');
const {plain} = require('../services/original-engines/systemnnn.cjs');

const EXE = '483ac94cfcb943126cd85012948c097535303843411fffd2975a7ef5df51d278';
const SCRIPT = '5b4fafe328cf84a73ad8ea2de3525f7f06941ffc7d4ba8acbeb27c7d2ae3b67e';
const STYLE = 'f866e7976352f44956028b2d05a32fd00de81f24e857de2ca4c801b432d3a829';
const flat = text => String(text || '').replace(/[\r\n]/g, '');

// The trial's LPRINT starts a page and APPEND adds rows. Index literal rows only.
// Ambiguous occurrences must never place a sentence at the previous occurrence's Y.
function indexPages(script) {
  const data = plain(script);
  if (!data) return null;
  const word = i => data.readUInt32LE(i * 4);
  const message = pointerTable(data, word(5), word(4));
  const pages = new Map(), rows = new Map(), shapes = new Map(), redraws = new Set(), decode = new TextDecoder('shift_jis');
  let row = null, page = '', pageId = null;
  function add(text, y) {
    if (!text) return;
    const key = flat(text);
    pages.set(key, !pages.has(key) || pages.get(key) === pageId ? pageId : null);
    const lengths = text.split(/\r\n|\r|\n/).map(s => [...s].length);
    if (rows.has(key) && (rows.get(key) !== y || String(shapes.get(key)) !== String(lengths))) {
      rows.set(key, null);
    } else {
      rows.set(key, y);
      shapes.set(key, lengths);
    }
  }
  for (let i = 0; i + 3 < data.length / 4;) {
    const length = word(i), op = word(i + 2);
    if (length < 3 || i + length > data.length / 4 || (word(i + 1) >>> 4) !== 0x6666000) break;
    if (op === 0x22220002) { row = 0; page = ''; pageId = i; }
    if (op === 0x22220001 || op === 0x22220006) row = null;
    if (row !== null && (op === 0x22220002 || op === 0x22220003)) {
      const bytes = length >= 4 && message(word(i + 3));
      const text = bytes ? decode.decode(bytes) : '';
      const parts = text.split(/\r\n|\r|\n/);
      // Control codes, unusual spacing or an automatic wrap require runtime layout.
      if (row + parts.length > 6 || parts.some(s => !s || /[#\x00-\x1f]/.test(s) || s.length > 40)) row = null;
      else {
        add(text, row);
        for (const part of parts) { add(part, row++); page += part; redraws.add(page); }
      }
    }
    i += length;
  }
  return {
    row: text => rows.get(flat(text)),
    page: text => pages.get(flat(text)),
    grid(text, client) {
      const key = flat(text), first = origin(rows.get(key), client);
      if (!first || /[\x00-\x7f｡-ﾟ]/.test(key)) return null;
      const [x, y, w, h] = first, rects = [];
      for (const [line, length] of shapes.get(key).entries()) {
        for (let i = 0; i < length; i++) rects.push([x + i * w, y + line * 54 * client[1] / 720, w, h]);
      }
      return rects;
    },
    scanArea(text) {
      const rects = this.grid(text, [1280, 720]);
      if (!rects?.length) return null;
      const x = Math.min(...rects.map(r => r[0])) - 8;
      const y = rects[0][1] - 8;
      const right = Math.max(...rects.map(r => r[0] + r[2])) + 8;
      const bottom = rects.at(-1)[1] + 26 + 8;
      return {scanX: x / 12.8, scanY: y / 7.2, scanWidth: (right - x) / 12.8, scanHeight: (bottom - y) / 7.2};
    },
    isRedraw: text => redraws.has(flat(text)) || rows.has(flat(text)),
  };
}

function checkedFile(file, length, digest) {
  if (fs.statSync(file).size !== length) return null;
  const bytes = fs.readFileSync(file);
  return crypto.createHash('sha256').update(bytes).digest('hex') === digest ? bytes : null;
}

function load(exe, digest) {
  if (!exe || (digest && digest !== EXE)) return null;
  try {
    // The reader may bind before the self-check has fingerprinted the executable.
    if (!digest && (path.basename(exe).toLowerCase() !== 'sadisticblood_trial.exe' ||
        !checkedFile(exe, 1822208, EXE))) return null;
    const folder = path.dirname(exe);
    // The windowed control measured 1280x720. The style declares LPrintX/Y 224/190,
    // LNextY 54 and fontSize 26. A modified style has to be measured separately.
    if (!checkedFile(path.join(folder, 'init2', 'printmessage.fxf'), 1932, STYLE)) return null;
    const script = checkedFile(path.join(folder, 'spt', 'SDB_trial.spt'), 326900, SCRIPT);
    return script && indexPages(script);
  } catch { return null; }
}

function origin(row, client) {
  const [width, height] = client || [];
  if (!Number.isInteger(row) || !(width > 0 && height > 0) || Math.abs(width / height - 16 / 9) > .02) return null;
  return [224 * width / 1280, (190 + row * 54) * height / 720, 26 * width / 1280, 26 * height / 720];
}

// The opening pages use white ink on dark art. Inspect the native client's BGRA
// frame at the authored cells. Bright scenery and fades give no ownership proof.
function nativeInk(frame, client, rects) {
  if (!frame || frame.width !== client[0] || frame.height !== client[1] ||
      frame.data?.length !== frame.width * frame.height * 4) return null;
  const {width, height, data} = frame;
  let scene = false;
  for (let y = 0; y < height && !scene; y += 31) for (let x = 0; x < width; x += 31) {
    const i = 4 * (y * width + x);
    if (Math.max(data[i], data[i+1], data[i+2]) > 24) { scene = true; break; }
  }
  if (!scene) return null;
  const result = [];
  for (const [x, y, w, h] of rects) {
    const left = Math.round(x), right = Math.round(x+w), top = Math.round(y), bottom = Math.round(y+h);
    if (top < 3 || left < 0 || right > width || bottom > height || h < 12) return null;
    let bright = 0, mid = 0;
    for (let py = top-2; py < bottom; py++) for (let px = left; px < right; px++) {
      const i = 4 * (py * width + px);
      const lo = Math.min(data[i], data[i+1], data[i+2]), hi = Math.max(data[i], data[i+1], data[i+2]);
      if (py < top) { if (hi > 115) return null; continue; }
      if (lo >= 155 && hi-lo < 40) bright++;
      if (hi >= 110) mid++;
    }
    if (mid > w*h*.72 || (!bright && mid > w*h*.12)) return null;
    result.push(bright >= Math.max(2, Math.floor(w*h/240)));
  }
  return result;
}

module.exports = {EXE, load, origin, indexPages, nativeInk};
