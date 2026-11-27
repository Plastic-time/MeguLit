// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

/* System commands that take names for archives, scripts, images, audio, or text layout.
   The value is the number of stack arguments. CVNS has a different dispatch table. */
const CMVS_RESOURCES = {
  0x2010:2, 0x2011:2, 0x2012:2, 0x2013:2, 0x2014:2, 0x2015:1, 0x2016:1, 0x2019:2, 0x201a:2,
  0x2035:4, 0x2038:3, 0x2080:1, 0x2081:2, 0x2098:1, 0x20a0:3, 0x20a4:4,
  0x20b0:5, 0x20ba:6, 0x20c0:1, 0x211e:4, 0x2308:5, 0x23b8:4,
};
const CVNS_RESOURCES = {
  0x2010:1, 0x2020:2, 0x2021:2, 0x2022:2, 0x2023:2, 0x2024:2, 0x2025:2, 0x2026:2,
  0x20a0:3, 0x20b0:5, 0x20c0:1, 0x21d4:1,
};

const SCALAR = new Set([0x100, 0x103, 0x104, 0x106, 0x108, 0x10a, 0x10e, 0x10f, 0x129, 0x12a, 0x12c, 0x12e]);
const STRING = new Set([0x120, 0x122, 0x125, 0x127]);
const INDEXED = new Set([0x105, 0x109, 0x110, 0x112, 0x12d, 0x12f]);
const STRIDED = new Set([0x107, 0x10b, 0x111, 0x113]);
const NESTED = new Set([0x101, 0x102, 0x12b]);
const OPERANDS = {
  0x0400:4, 0x0401:4, 0x0402:4, 0x0403:8, 0x0405:2, 0x0407:8, 0x0410:2, 0x0411:2, 0x0412:2,
  0x0413:2, 0x0414:2, 0x0416:0, 0x0430:0, 0x0440:6, 0x0442:6,
};
const INVALID = new RangeError('Unknown CMVS bytecode');

function expressionEnd(code, start, depth = 0) {
  if (depth >= 64) throw INVALID;
  const kind = code.readUInt16LE(start);
  if (kind < 0x200 || kind > 0x202) throw INVALID;
  let pc = start + 2;
  for (let term = 0; term <= 128; term++) {
    const tag = code.readUInt16LE(pc);
    pc += 2;
    if (tag === 0x20f) return pc;
    if (tag >= 0x160 && tag <= (kind === 0x201 ? 0x172 : 0x17e)) continue;
    if ((kind === 0x201 ? STRING : SCALAR).has(tag)) { pc += 4; continue; }
    if (tag === 0x200 && kind !== 0x201) { pc = expressionEnd(code, pc - 2, depth + 1); continue; }
    if (kind === 0x201 ? tag === 0x121 : NESTED.has(tag)) { pc = expressionEnd(code, pc, depth + 1); continue; }
    if (kind !== 0x201 && (INDEXED.has(tag) || STRIDED.has(tag))) {
      pc = expressionEnd(code, pc + (STRIDED.has(tag) ? 6 : 4), depth + 1);
      if (tag === 0x111 || tag === 0x113) pc = expressionEnd(code, pc, depth + 1);
      continue;
    }
    throw INVALID;
  }
  throw INVALID;
}

function walk(code, labels, entry, resources, cvns) {
  const starts = new Uint8Array(code.length);
  const targets = new Set([entry, ...labels]);
  const consumers = [], returns = [], output = [], history = [], waits = [];
  let args = [];
  for (let pc = 0; pc < code.length;) {
    const at = pc, op = code.readUInt16LE(pc);
    starts[at] = 1;
    pc += 2;
    if (op >= 0x200 && op <= 0x202) {
      pc = expressionEnd(code, at);
      if (pc + 2 <= code.length && code.readUInt16LE(pc) === 0x0430) {
        const tag = code.readUInt16LE(at + 2);
        const literal = pc === at + 10 && (op === 0x200 && tag === 0x100 || op === 0x201 && tag === 0x120);
        args.push({at, push: pc, kind:op, literal, value:literal ? code.readUInt32LE(at + 4) : null});
        // Keep one extra argument so a longer call cannot look like a supported signature.
        if (args.length > 8) args.shift();
        starts[pc] = 1;
        pc += 2;
        continue;
      }
    } else if (op >= 0x2000 && op <= 0x27ff) {
      if (cvns ? op === 0x2112 || op === 0x2117 : op === 0x2152) output.push(at);
      if (op === (cvns ? 0x212c : 0x2136)) history.push(at);
      if (op === 0x2153 || op === 0x2158) waits.push(at);
      if (resources[op] && args.length >= resources[op]) consumers.push({at, args:args.slice(-resources[op])});
    } else {
      const len = OPERANDS[op];
      if (len === undefined || pc + len > code.length) throw INVALID;
      if (op >= 0x0400 && op <= 0x0403 || op === 0x0407) targets.add(code.readUInt32LE(pc + len - 4));
      if (op === 0x0410 || op === 0x0405) {
        const label = code.readUInt16LE(pc);
        if (label >= labels.length) throw INVALID;
        if (op === 0x0410 && args.length >= 3 && args.length <= 7) consumers.push({at, args, label});
      }
      if (op === 0x0411 || op === 0x0413 || op === 0x0414) returns.push(at);
      pc += len;
    }
    args = [];
  }
  for (const target of targets) if (!starts[target]) throw INVALID;
  return {targets, consumers, returns, output, history, waits};
}

/* Find the first instruction in one of the sorted opcode lists at or after pc. */
function nextAt(list, pc) {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const i = (lo + hi) >>> 1;
    if (list[i] < pc) lo = i + 1;
    else hi = i;
  }
  return list[lo] ?? Infinity;
}

function classify(script, cvns) {
  const count = script.readUInt32LE(0x10), codeSize = script.readUInt32LE(0x14);
  const codeAt = 0x30 + count * 4, codeEnd = codeAt + codeSize;
  // Damaged layouts and unusually large scripts still have the older string-push reader.
  if (!codeSize || codeSize > 4 * 1024 * 1024 || count > 65536 || codeEnd > script.length) return null;
  try {
    const labels = Array.from({length: count}, (_, i) => script.readUInt32LE(0x30 + i * 4));
    const code = script.subarray(codeAt, codeEnd);
    const {targets, consumers, returns, output, history, waits} = walk(code, labels, script.readUInt32LE(0x20),
      cvns ? CVNS_RESOURCES : CMVS_RESOURCES, cvns);
    const messages = new Map(), anchors = new Set();
    const messageLabels = labels.map(target => {
      const end = nextAt(returns, target);
      if (end === Infinity || code.readUInt16LE(end) === 0x0414) return 0;
      const argc = code.readUInt16LE(end + 2) / 4;
      const logs = nextAt(history, target) < end;
      const draws = nextAt(output, target) < end;
      if (cvns) return (argc === 4 || argc === 5) && (draws || logs) ? argc : 0;
      return (argc === 5 && logs || draws && (logs || nextAt(waits, target) < end)) ? argc : 0;
    });
    for (const {at, args, label} of consumers) {
      if (targets.has(at) || args.some((arg, i) => targets.has(arg.push) || i > 0 && targets.has(arg.at))) continue;
      if (label === undefined) {
        for (const arg of args) if (arg.kind === 0x201 && arg.literal) anchors.add(codeAt + arg.at);
        continue;
      }
      // Text, voice, speaker, then control integers. The four-argument CVNS demo has no line ID.
      if (messageLabels[label] !== args.length || args.length < (cvns ? 4 : 5) ||
          args.some((arg, i) => arg.kind !== (i < 3 ? 0x201 : 0x200) || !arg.literal)) continue;
      const [text, voice, speaker] = args.map(arg => codeAt + arg.at);
      const lineId = args[args.length === 7 ? 6 : 4]?.value ?? null;
      messages.set(text, {voice, speaker, lineId});
    }
    return {messages, anchors};
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

module.exports = { classify };
