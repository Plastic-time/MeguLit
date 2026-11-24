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

const key = Buffer.from('92cd97908cd78cd58b4b93fa9ad78cbf8cc98ceb8d698d8b8cd28cd68b6d8ce38cfb8cd08cc88cf08bfe8caa8cf48b4b9c588cd396c88ccb8cce8cf38cd68b52', 'hex');
const encryptCpz1 = data => Buffer.from(data.map((byte, i) => ((byte + 0x6c) & 0xff) ^ key[i % key.length]));

function pss0(lines) {
  const script = ps2a(lines, { plain: true });
  const chunks = [];
  for (let i = 0x30; i < script.length; i += 8) {
    chunks.push(Buffer.from([0xff]), script.subarray(i, i + 8));
  }
  const packed = Buffer.concat(chunks);
  const header = script.subarray(0, 0x30);
  header.write('PSS0');
  header.writeUInt32LE(0, 0x0c);
  header.writeUInt32LE(packed.length, 0x24);
  return Buffer.concat([header, packed]);
}

/* CVNS CPZ2 words from GARbro. The fixture applies the inverse of the reader. */
const cpz2Table = [
  0x3a68cdbf, 0xd3c3a711, 0x8414876e, 0x657befdb, 0xcdd7c125, 0x09328580, 0x288ffedd, 0x99ebf13a,
  0x5a471f95, 0x1ea3f4f1, 0xf4ff524e, 0xd358e8a9, 0xc5b71015, 0xa913046f, 0x2d6fd2bd, 0x68c8be19
];
function encryptCpz2(data, key) {
  const out = Buffer.alloc(data.length);
  const table = cpz2Table.map(word => (word + key) >>> 0);
  let xor = 5;
  for (let i = 0; i < 8; i++) xor ^= (key >>> (i * 4)) & 15;
  const shift = xor + 8;
  const words = data.length >>> 2;
  for (let i = 0; i < words; i++) {
    const value = data.readUInt32LE(i * 4);
    const rotated = (value << shift) | (value >>> (32 - shift));
    out.writeUInt32LE(((rotated + 0x15c3e7) ^ table[i & 15]) >>> 0, i * 4);
  }
  for (let i = words * 4; i < data.length; i++) {
    const mask = table[(words + (i & 3)) & 15] >>> ((i & 3) * 4);
    out[i] = (data[i] - 55) ^ mask;
  }
  return out;
}

function check(data) {
  let sum = 0x78341256;
  let pos = 0;
  for (; pos + 4 <= data.length; pos += 4) sum += data.readUInt32LE(pos);
  for (; pos < data.length; pos++) sum += data[pos];
  return sum >>> 0;
}

function cvnsPack(entries, version = 1, tweakIndex = () => {}) {
  const records = [];
  const payloads = [];
  let offset = 0;
  for (const [name, file] of Object.entries(entries)) {
    const record = Buffer.alloc(0x18 + name.length + 1);
    record.writeUInt32LE(record.length, 0);
    record.writeUInt32LE(file.length, 4);
    record.writeUInt32LE(offset, 8);
    record.write(name, 0x18);
    const entryKey = 0x12345678 + offset;
    const payload = version === 1 ? encryptCpz1(file) : encryptCpz2(file, entryKey);
    if (version === 2) {
      record.writeUInt32LE(check(payload), 0x10);
      record.writeUInt32LE((entryKey ^ 0x796c3afd) >>> 0, 0x14);
    }
    records.push(record);
    payloads.push(payload);
    offset += file.length;
  }
  const index = Buffer.concat([...records, Buffer.alloc(16)]);
  tweakIndex(index);
  const header = Buffer.alloc(version === 1 ? 0x10 : 0x14);
  header.write('CPZ' + version);
  if (version === 1) {
    header.writeUInt32LE(records.length, 4);
    header.writeUInt32LE(index.length, 8);
    return Buffer.concat([header, encryptCpz1(index), ...payloads]);
  }
  const indexKey = 0x3456789a;
  const cipher = encryptCpz2(index, indexKey);
  header.writeUInt32LE((records.length ^ 0xe47c59f3) >>> 0, 4);
  header.writeUInt32LE((index.length ^ 0x3f71de2a) >>> 0, 8);
  header.writeUInt32LE(check(cipher), 0x0c);
  header.writeUInt32LE((indexKey ^ 0x40de832c) >>> 0, 0x10);
  return Buffer.concat([header, cipher, ...payloads]);
}

function game(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cmvs-cpz1-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pack = path.join(root, 'data', 'pack');
  fs.mkdirSync(pack, { recursive: true });
  const executable = path.join(root, 'cvns.exe');
  fs.writeFileSync(executable, 'MZ');
  return { root, pack, executable };
}

test('CVNS CPZ1 reads Japanese PSS0 scripts through the probe and original reader', t => {
  const { root, pack, executable } = game(t);
  const first = ['「おはよう、今日もいい天気だね。」', '窓を開けると、鳥の声が聞こえた。'];
  const second = ['今から一緒に散歩へ行こう。', '帰ったら温かいお茶を入れよう。'];
  fs.writeFileSync(path.join(pack, 'script.cpz'), cvnsPack({
    'a01.pss': pss0([...first, { push: 'bgm01.ogg' }]),
    'a02.pss': pss0(second),
    'extra.bin': pss0(first)
  }));

  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'ok');
  assert.equal(probe.detected, 'cmvs');
  assert.equal(probe.engines.find(reader => reader.id === 'cmvs').scenes, 2);
  assert.equal(probe.japaneseLines, 4);
  assert.deepEqual(readScript(locate(root, 'cvns')).lines, [...first, ...second]);
});

test('CVNS CPZ1 rejects invalid names and offsets without dropping an intact neighboring pack', t => {
  const { root, pack } = game(t);
  const lines = ['廊下の先には小さな窓がある。'];
  const entries = { 'test.pss': pss0(lines) };
  fs.writeFileSync(path.join(pack, 'script.cpz'), cvnsPack(entries));
  fs.writeFileSync(path.join(pack, 'bad-name.cpz'), cvnsPack(entries, 1, index => {
    index[index.readUInt32LE(0) - 1] = 0x61;
  }));
  fs.writeFileSync(path.join(pack, 'bad-offset.cpz'), cvnsPack(entries, 1, index => {
    index.writeUInt32LE(0xffffffff, 8);
  }));

  assert.equal(cmvs.engine.archiveEntries(path.join(pack, 'bad-name.cpz')), null);
  assert.equal(cmvs.engine.archiveEntries(path.join(pack, 'bad-offset.cpz')), null);
  assert.deepEqual(readScript(locate(root, 'cvns')).lines, lines);
});

test('CVNS PSS0 rejects a short LZSS stream even if the packed length matches', () => {
  const source = pss0(['古い扉をゆっくり開けてみた。']);
  const short = source.subarray(0, source.length - 1);
  short.writeUInt32LE(short.length - 0x30, 0x24);
  assert.deepEqual(cmvs.parse(short).lines, []);
});

test('CVNS CPZ2 decrypts the index and each PSS0 with its own key', t => {
  const { root, pack, executable } = game(t);
  const first = ['夕方には、あの橋を渡って帰ろう。', '今日は雨が降りそうだね。'];
  const second = ['「それなら一緒に帰ろう。」', '雲の向こうに光が見えた。'];
  const script = pss0(first);
  assert.notEqual(script.length % 4, 0);
  fs.writeFileSync(path.join(pack, 'script.cpz'), cvnsPack({
    's01.pss': script,
    's02.pss': pss0(second)
  }, 2));

  const probe = probeGame({ dir: root, executable });
  assert.equal(probe.step, 'ok');
  assert.equal(probe.detected, 'cmvs');
  assert.equal(probe.japaneseLines, 4);
  assert.deepEqual(readScript(locate(root, 'cvns')).lines, [...first, ...second]);
});

test('CVNS CPZ2 discards a damaged index and a damaged script body', t => {
  const { pack } = game(t);
  const entry = { 'scene.pss': pss0(['音がやむまで、そこで待っていて。']) };
  const good = cvnsPack(entry, 2);
  const badIndex = Buffer.from(good);
  badIndex[0x0c] ^= 1;
  const badBody = Buffer.from(good);
  badBody[badBody.length - 1] ^= 1;
  const indexFile = path.join(pack, 'bad-index.cpz');
  const bodyFile = path.join(pack, 'bad-body.cpz');
  fs.writeFileSync(indexFile, badIndex);
  fs.writeFileSync(bodyFile, badBody);

  assert.equal(cmvs.engine.archiveEntries(indexFile), null);
  const [scene] = cmvs.engine.archiveEntries(bodyFile);
  assert.deepEqual(cmvs.engine.parse(scene.read()).lines, []);
});
