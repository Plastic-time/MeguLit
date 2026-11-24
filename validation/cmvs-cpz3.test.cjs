'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { cpz, ps2a } = require('./helpers/engine-fixtures-d.cjs');
const { probeGame } = require('../services/adapter-probe-core.cjs');
const { locate, readScript } = require('../services/original-text.cjs');
const cmvs = require('../services/original-engines/cmvs.cjs');
const kit = require('../services/original-engines/kit.cjs');

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

function cpz3(entries, editIndex = () => {}) {
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
  const plainIndex = index.length ? Buffer.concat([...index, Buffer.alloc(3)]) : Buffer.alloc(0);
  editIndex(plainIndex);
  const packed = encrypt(plainIndex, indexKey);
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

test('CMVS bounds CPZ3 script reads while allowing the maximum packed size', t => {
  const { pack } = game(t);
  const limit = (72 << 20) + 0x30;
  const script = ps2a(['夕方になったらまた来よう。']);
  const archive = cpz3({ 'at-limit.ps2': script, 'over-limit.ps2': script }, index => {
    const next = index.readUInt32LE(0);
    index.writeUInt32LE(limit, 4);
    index.writeUInt32LE(limit + 1, next + 4);
    index.writeUInt32LE(0, next + 8);
  });
  const file = path.join(pack, 'script.cpz');
  fs.writeFileSync(file, archive);
  const indexSize = (archive.readUInt32LE(8) ^ 0xf32aed17) >>> 0;
  fs.truncateSync(file, 0x14 + indexSize + limit + 1);

  const [atLimit, overLimit] = cmvs.engine.archiveEntries(file);
  const readAt = kit.readAt;
  const largeReads = [];
  t.mock.method(kit, 'readAt', (filename, offset, length) => {
    if (filename === file && length >= limit) {
      largeReads.push(length);
      return Buffer.alloc(0);
    }
    return readAt(filename, offset, length);
  });

  atLimit.read();
  overLimit.read();
  assert.deepEqual(largeReads, [limit]);
});

test('a damaged same-name CPZ3 scene cannot hide a readable CPZ6 scene', t => {
  const { root, pack, executable } = game(t);
  const lines = ['明日も同じ時間に会おう。'];
  fs.writeFileSync(path.join(pack, 'a-readme.cpz'), cpz({ 'scene.ps2': ps2a(lines) }, { version: 6 }));
  const damaged = cpz3({ 'scene.ps2': ps2a(['駅まで迎えに行こう。']) });
  damaged[damaged.length - 1] ^= 1;
  fs.writeFileSync(path.join(pack, 'script.cpz'), damaged);

  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'ok');
  assert.equal(probe.engines.find(engine => engine.id === 'cmvs').scenes, 1);
  assert.equal(probe.japaneseLines, 1);
  assert.deepEqual(readScript(locate(root, 'cmvs')).lines, lines);

  const patch = path.join(root, 'FileHook');
  fs.mkdirSync(patch);
  fs.writeFileSync(path.join(patch, 'scene.ps2'), ps2a(['予定が変わった。']));
  assert.deepEqual(readScript(locate(root, 'cmvs')).lines, ['予定が変わった。']);
  assert.deepEqual(cmvs.engine.originalLines(root), lines);
});

test('CPZ3 code-only scenes cannot exhaust CMVS original detection ahead of existing scenes', t => {
  const { root, pack, executable } = game(t);
  const lines = ['まだ蝉の声が聞こえるね。'];
  fs.writeFileSync(path.join(pack, 'a-readme.cpz'), cpz({ 'zz-scene.ps2': ps2a(lines) }, { version: 6 }));
  const codeOnly = Buffer.alloc(0x30);
  codeOnly.write('PS2A');
  const entries = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [
    'a' + String(i).padStart(3, '0') + '.ps2', codeOnly
  ]));
  entries['z-new.ps2'] = ps2a(['帰り道で夕日が見えた。']);
  fs.writeFileSync(path.join(pack, 'script.cpz'), cpz3(entries));

  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'ok');
  assert.equal(probe.japaneseLines, 2);
  assert.deepEqual(readScript(locate(root, 'cmvs')).lines, [...lines, '帰り道で夕日が見えた。']);
});

test('CMVS accepts an empty, checksummed CPZ3 archive without a damage diagnostic', t => {
  const { root, pack, executable } = game(t);
  const file = path.join(pack, 'resources.cpz');
  fs.writeFileSync(file, cpz3({}));

  assert.deepEqual(cmvs.list(file), []);
  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'no-script');
});

test('CMVS rejects a short CPZ3 entry read even when its checksum matches', t => {
  const { pack } = game(t);
  const script = ps2a(['雨が降る前に帰ろう。']);
  const archive = cpz3({ 'main.ps2': script }, index => index.writeUInt32LE(script.length + 1, 4));
  const file = path.join(pack, 'script.cpz');
  fs.writeFileSync(file, Buffer.concat([archive, Buffer.alloc(1)]));

  const [scene] = cmvs.engine.archiveEntries(file);
  const readAt = kit.readAt;
  t.mock.method(kit, 'readAt', (filename, offset, length) => {
    const bytes = readAt(filename, offset, length);
    return filename === file && length === script.length + 1 ? bytes.subarray(0, -1) : bytes;
  });

  assert.equal(scene.read().length, 0);
});
