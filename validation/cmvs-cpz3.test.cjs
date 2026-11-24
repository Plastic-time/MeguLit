'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ps2a } = require('./helpers/engine-fixtures-d.cjs');
const { probeGame } = require('../services/adapter-probe-core.cjs');
const { locate, readScript } = require('../services/original-text.cjs');
const cmvs = require('../services/original-engines/cmvs.cjs');

// Synthetic index and entries. The CPZ3 constants and inverse cipher follow the cmvs-rs format notes.
const cipherWords = [
  0x4d0d4a5e, 0xb3abf3e1, 0x3c37336d, 0x86c3f5f3, 0x7d4f9b89, 0x58d7de11, 0x6367778d, 0xa5f34629,
  0x067fa4b5, 0xed0ae742, 0xb19450cc, 0xe7204a5a, 0xd9af04f5, 0x5d3b687f, 0xc1c7a6fd, 0xfc502289
];

function encrypt(data, key) {
  const words = cipherWords.map(word => (word + key) >>> 0);
  const out = Buffer.alloc(data.length);
  let shift = 13;
  for (let nibble = 0; nibble < 8; nibble++) shift ^= (key >>> (4 * nibble)) & 15;
  shift += 8;
  let offset = 0;
  let slot = 3;
  for (; offset + 4 <= data.length; offset += 4, slot++) {
    const value = data.readUInt32LE(offset);
    const rotated = (value >>> shift) | (value << (32 - shift));
    out.writeUInt32LE(((rotated - 0x6e58a5c2) ^ words[slot & 15]) >>> 0, offset);
  }
  for (; offset < data.length; offset++, slot++) {
    const mask = words[slot & 15] >>> (4 * (data.length - offset));
    out[offset] = (data[offset] - 0x52) ^ mask;
  }
  return out;
}

function checksum(data) {
  let result = 0x78341256;
  let offset = 0;
  for (; offset + 4 <= data.length; offset += 4) result = (result + data.readUInt32LE(offset)) >>> 0;
  for (; offset < data.length; offset++) result = (result + data[offset]) >>> 0;
  return result;
}

function cpz3(entries) {
  const index = [];
  const payload = [];
  let offset = 0;
  for (const [name, script] of Object.entries(entries)) {
    const key = 0x12345678 + offset;
    const encrypted = encrypt(script, key);
    const entry = Buffer.alloc(0x18 + name.length + 1);
    entry.writeUInt32LE(entry.length);
    entry.writeUInt32LE(encrypted.length, 4);
    entry.writeUInt32LE(offset, 8);
    entry.writeUInt32LE(checksum(encrypted), 0x10);
    entry.writeUInt32LE((key ^ 0xc7f5da63) >>> 0, 0x14);
    entry.write(name, 0x18);
    index.push(entry);
    payload.push(encrypted);
    offset += encrypted.length;
  }
  const indexKey = 0x89abcdef;
  const packed = encrypt(Buffer.concat([...index, Buffer.alloc(3)]), indexKey);
  const head = Buffer.alloc(0x14);
  head.write('CPZ3');
  head.writeUInt32LE((index.length ^ 0x5e9c4f37) >>> 0, 4);
  head.writeUInt32LE((packed.length ^ 0xf32aed17) >>> 0, 8);
  head.writeUInt32LE(checksum(packed), 0x0c);
  head.writeUInt32LE((indexKey ^ 0xdddddddd ^ 0x7bf4a539) >>> 0, 0x10);
  return Buffer.concat([head, packed, ...payload]);
}

function game(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cmvs-cpz3-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pack = path.join(root, 'data', 'pack');
  fs.mkdirSync(pack, { recursive: true });
  const executable = path.join(root, 'cmvs.exe');
  fs.writeFileSync(executable, 'MZ');
  return { root, pack, executable };
}

test('CMVS reads CPZ3 PS2A scenes through the probe and original reader', t => {
  const { root, pack, executable } = game(t);
  const first = ['海から冷たい風が吹いてくる。', '「ここで待ち合わせしよう。」'];
  const second = ['今日は何を持って行こうか。', '歩きながらゆっくり話した。'];
  const scripts = { 'a01.ps2': ps2a(first), 'a02.ps2': ps2a(second) };
  assert.ok(Object.values(scripts).some(script => script.length % 4));
  fs.writeFileSync(path.join(pack, 'script.cpz'), cpz3(scripts));

  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'ok');
  assert.equal(probe.detected, 'cmvs');
  assert.equal(probe.engines.find(engine => engine.id === 'cmvs').scenes, 2);
  assert.equal(probe.japaneseLines, 4);
  assert.deepEqual(readScript(locate(root, 'cmvs')).lines, [...first, ...second]);
});

test('CMVS rejects a CPZ3 index or script entry with the wrong checksum', t => {
  const { root, pack, executable } = game(t);
  const entries = { 'scene.ps2': ps2a(['風が止むまでここにいよう。']) };
  const archive = cpz3(entries);
  archive[0x0c] ^= 1;
  const file = path.join(pack, 'script.cpz');
  fs.writeFileSync(file, archive);
  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'parse-failed');
  assert.equal(probe.detail, 'cmvs:CMVS_CPZ3_ARCHIVE');

  const wrongEntry = cpz3(entries);
  wrongEntry[wrongEntry.length - 1] ^= 1;
  const other = path.join(pack, 'entry.cpz');
  fs.writeFileSync(other, wrongEntry);
  const [scene] = cmvs.engine.archiveEntries(other);
  assert.deepEqual(cmvs.engine.parse(scene.read()).lines, []);
});
