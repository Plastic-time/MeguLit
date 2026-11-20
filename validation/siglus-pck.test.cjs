// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const kit = require('../services/original-engines/kit.cjs');
const ss = require('../services/original-engines/siglus-source.cjs');
const core = require('../services/adapter-probe-core.cjs');
const scenes = require('../services/original-engines/scenes.cjs');

/* Literal-only Siglus LZSS encoder (8-byte header + 0xFF flag bytes) */
function siglusPack(raw) {
 const parts = [];
 for (let i = 0; i < raw.length; i += 8) {
  const c = raw.subarray(i, i + 8);
  parts.push(Buffer.from([(1 << c.length) - 1]), c);
 }
 const body = Buffer.concat(parts);
 const out = Buffer.alloc(8 + body.length);
 out.writeUInt32LE(out.length, 0);
 out.writeUInt32LE(raw.length, 4);
 body.copy(out, 8);
 return out;
}

/* Inverse of siglus-source.cjs chunk() for synthetic OS section tests */
const SA = {
 easy: Buffer.from('a9190f282d1b52395c36229f91736a35676a6f74ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097e5b62302dd384c2cc42d7f9b1f9ad549e9348956a79614be2ec5b17ed1b5e7e6d5f506d6babff3453ff161dd4c3e085f47a9df889fd4cc691f309fe7cd8045f3e72a1d16b2f154c86c2b0dd465f7e336d4a53bd1794c54f02ab4b256452eab7b88c5fa74ad03b89ed5f56fdcfa4422aad829b9163d1a76d0879b2d0c7bd1e1ada9190f282d1b52395c36229f4931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f2365c345', 'hex'),
 easyIndex: 173,
 last: Buffer.from('0edb274ca5f10e2d70c4405d4fdaa0c392489deadd312ce9e21022aad829b9163d1a76d0879b2d0c7bd1e1ad9ec5497bbde8dfeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097e5b62302dd384c2cc42d7f9b1f9ad549e9348956a79614be2ec5b17ed1b5e7e6d5f506d6babff3453ff161dd54c82eab7b88c5fa74ad03b89ed5f56f6c2b0dd465f7e336d4a53bd1794c54f02ab4b25645dcfa444931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f2365c345a01b52676a6f74ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfd829b9163d1a76d0879b2d0c7bd1e1adeeca', 'hex'),
 lastIndex: 13,
 name: Buffer.from('282d9173f506d6babff3453ff161b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f22aadd4c7f9b1f9ad549e9348956a7961b52676a6f74cd8045f3e72a1d16b2f154c86c2b0dd465f7e336d4a53bd1794c54f02ab4b256452eab2365c345a0c392489deadd312ce9e2107b88c5fa74ad03b89ed5f56fdcfa444931f68332ffc2b1e9e1983d6f310dacb108839d0d10d141f900ba1acf1371e486212f22aa6a35b17ed1b5e7ec7a6f26740edb274ca5f10e2d70c4405d4fda9ec5497bbde8dfd829b9163d1ababfdfd829b9163d1a76d0879b2d0c7bd1e1adeecaf492dee47610dd2a52dc734e548c303d9ab29bb8932955fa7ac9da1097', 'hex'),
 nameIndex: 59,
};
const xorAt = (b, code, st) => kit.xor(b, code, st);
function packOsChunk(name, raw) {
 const packed = xorAt(siglusPack(raw), SA.easy, SA.easyIndex);
 const lzsz = packed.length;
 const code = Buffer.alloc(68);
 ss._internal.smd5(packed).copy(code, 0);
 code.writeUInt32LE(lzsz, 64);
 const bh = Math.floor((lzsz + 1) / 2);
 const mapw = 32, dh = Math.floor((bh + 3) / 4), maph = Math.max(1, Math.floor((dh + mapw - 1) / mapw)), mapt = mapw * maph * 4;
 const dp1 = Buffer.alloc(mapt), dp2 = Buffer.alloc(mapt);
 packed.subarray(0, bh).copy(dp1);
 packed.subarray(bh).copy(dp2);
 const nb = xorAt(Buffer.from(name, 'utf16le'), SA.name, SA.nameIndex);
 const hdr = Buffer.alloc(76);
 hdr.writeUInt32LE(1, 0);
 code.copy(hdr, 4);
 hdr.writeUInt32LE(nb.length, 72);
 return xorAt(Buffer.concat([hdr, nb, dp1, dp2]), SA.last, SA.lastIndex);
}

/* Synthetic compiled Siglus .dat scene */
const EASY_ANGOU = Buffer.from('70f8a6b0a1a5284fb52f48fae1e94bdeb74f62958be00380e7cf0f6b9201ebf8a288ce630438d26d8cd28876a792718f4eb68d017988830af9e92cdb67db9114d59a4e79172308960e1d15f9a5a06f5817c8a946da22fffd871242fba9b8676c916764f9d11ee450646ff20bde40e747f103cc2aad7f3421a06426986ced69f4b523086e7d92f6eb93f07a895ef9f87aafe8a948c2ac116b2b33a7400ddc7da75bcfc831d177528d82ac41b873a54f267c0f39da5b374adea4490b7c17a343ae77066473c043a3185a0f9f024c7e8b019f2dae725413ff96ae0b3458cfe30078bee3f561e4877cfc80afc48d463a5dd036bce5607768084fbbabe27807e873bf', 'hex');
function buildCompiledDat(items) {
 // items: [{kind:'name'|'text'|'cmd', text}]
 const strs = items.map(x => x.text);
 const strBufs = strs.map((s, si) => {
  const b = Buffer.from(s, 'utf16le');
  const k = (0x7087 * si) & 0xffff;
  for (let i = 0; i < b.length; i += 2) b.writeUInt16LE(b.readUInt16LE(i) ^ k, i);
  return b;
 });
 const strIdx = Buffer.alloc(strs.length * 8);
 let charPos = 0;
 strs.forEach((s, si) => {
  strIdx.writeUInt32LE(charPos, si * 8);
  strIdx.writeUInt32LE(s.length, si * 8 + 4);
  charPos += s.length;
 });
 const strPool = Buffer.concat(strBufs);
 const ops = [];
 items.forEach((it, si) => {
  const push = Buffer.alloc(9);
  push[0] = 2; push.writeInt32LE(20, 1); push.writeInt32LE(si, 5);
  ops.push(push);
  if (it.kind === 'name') ops.push(Buffer.from([50]));
  else if (it.kind === 'text') { const t = Buffer.alloc(5); t[0] = 49; t.writeInt32LE(si, 1); ops.push(t); }
  else ops.push(Buffer.from([48, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20, 0, 0, 0]));
 });
 const scn = Buffer.concat(ops);
 const hdr = Buffer.alloc(132);
 hdr.writeUInt32LE(132, 0);
 hdr.writeUInt32LE(132 + strIdx.length + strPool.length, 4);
 hdr.writeUInt32LE(scn.length, 8);
 hdr.writeUInt32LE(132, 12);
 hdr.writeUInt32LE(strs.length, 16);
 hdr.writeUInt32LE(132 + strIdx.length, 20);
 hdr.writeUInt32LE(strs.length, 24);
 return Buffer.concat([hdr, strIdx, strPool, scn]);
}

function buildScenePck({ scenes: list = [], exeAngouMod = 0, osFiles = [] }) {
 const hdrSize = 92;
 const nameIdx = Buffer.alloc(list.length * 8);
 const nameBufs = [];
 let charOff = 0;
 list.forEach((s, i) => {
  nameIdx.writeUInt32LE(charOff, i * 8);
  nameIdx.writeUInt32LE(s.name.length, i * 8 + 4);
  nameBufs.push(Buffer.from(s.name, 'utf16le'));
  charOff += s.name.length;
 });
 const namePool = Buffer.concat(nameBufs);
 const dataIdx = Buffer.alloc(list.length * 8);
 const dataChunks = [];
 let dOff = 0;
 list.forEach((s, i) => {
  const chunk = s.blob;
  dataIdx.writeInt32LE(dOff, i * 8);
  dataIdx.writeInt32LE(chunk.length, i * 8 + 4);
  dataChunks.push(chunk);
  dOff += chunk.length;
 });
 const dataPool = Buffer.concat(dataChunks);
 let osBuf = Buffer.alloc(0), osHdrSize = 0;
 if (osFiles.length) {
  const osChunks = osFiles.map(f => packOsChunk(f.name, f.raw));
  const szTbl = Buffer.alloc(osChunks.length * 4);
  osChunks.forEach((c, i) => szTbl.writeUInt32LE(c.length, i * 4));
  const osHdr = packOsChunk('sizes', szTbl);
  osHdrSize = osHdr.length;
  osBuf = Buffer.concat([osHdr, ...osChunks]);
 }
 const scnNameIdxOfs = hdrSize;
 const scnNameStrOfs = scnNameIdxOfs + nameIdx.length;
 const scnDataIdxOfs = scnNameStrOfs + namePool.length;
 const scnDataOfs = scnDataIdxOfs + dataIdx.length;
 const hdr = Buffer.alloc(hdrSize);
 hdr.writeUInt32LE(hdrSize, 0);
 hdr.writeUInt32LE(scnNameIdxOfs, 13 * 4);
 hdr.writeUInt32LE(list.length, 14 * 4);
 hdr.writeUInt32LE(scnNameStrOfs, 15 * 4);
 hdr.writeUInt32LE(list.length, 16 * 4);
 hdr.writeUInt32LE(scnDataIdxOfs, 17 * 4);
 hdr.writeUInt32LE(list.length, 18 * 4);
 hdr.writeUInt32LE(scnDataOfs, 19 * 4);
 hdr.writeUInt32LE(list.length, 20 * 4);
 hdr.writeUInt32LE(exeAngouMod, 21 * 4);
 hdr.writeUInt32LE(osHdrSize, 22 * 4);
 return Buffer.concat([hdr, nameIdx, namePool, dataIdx, dataPool, osBuf]);
}

function withDir(fn) {
 const d = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-siglus-pck-'));
 try { return fn(d); } finally { fs.rmSync(d, { recursive: true, force: true }); }
}

test('siglus-pck reads unkeyed compiled scenes (exe_angou_mod=0) in order with speakers', () => withDir(dir => {
 const dat = buildCompiledDat([
  { kind: 'cmd', text: 'bgm001' },
  { kind: 'name', text: '吉野' },
  { kind: 'text', text: '"That is enough!"' },
  { kind: 'text', text: 'He glares across the classroom.' },
  { kind: 'name', text: '瑚太朗' },
  { kind: 'text', text: '"Hold on a second..."' },
 ]);
 const blob = kit.xor(siglusPack(dat), EASY_ANGOU);
 fs.writeFileSync(path.join(dir, 'SceneEN.pck'), buildScenePck({ scenes: [{ name: 'seen01', blob }], exeAngouMod: 0 }));
 fs.writeFileSync(path.join(dir, 'SiglusEngine_SteamEN.exe'), 'MZ');

 assert.equal(scenes.detect(dir), 'siglus-pck');
 const e = scenes.ENGINES['siglus-pck'];
 const sc = e.scenes(dir);
 assert.equal(sc.length, 1);
 const p = e.parse(sc[0].read());
 assert.deepEqual(p.lines, ['"That is enough!"', 'He glares across the classroom.', '"Hold on a second..."']);
 assert.deepEqual(p.speakers, ['吉野', '', '瑚太朗']);
}));

test('siglus-pck finds Scene.pck in a single game sub-folder (patched installs like 1st_beat/)', () => withDir(dir => {
 const dat = buildCompiledDat([{ kind: 'name', text: '音無' }, { kind: 'text', text: '「ここはどこだ」' }]);
 const sub = path.join(dir, '1st_beat'); fs.mkdirSync(sub); fs.mkdirSync(path.join(dir, 'readme'));
 fs.writeFileSync(path.join(sub, 'Scene.pck'), buildScenePck({ scenes: [{ name: 'seen01', blob: kit.xor(siglusPack(dat), EASY_ANGOU) }], exeAngouMod: 0 }));
 fs.writeFileSync(path.join(sub, 'Scene.chs'), Buffer.alloc(92));
 fs.writeFileSync(path.join(sub, 'SiglusEngine.exe'), 'MZ');
 const e = scenes.ENGINES['siglus-pck'];
 assert.equal(ss.scenePck(dir), path.join(sub, 'Scene.pck'));
 const sc = e.scenes(dir);
 assert.equal(sc.length, 1);
 assert.deepEqual(e.parse(sc[0].read()).lines, ['「ここはどこだ」']);
}));

test('siglus-pck falls back to OS .ss sources when exe_angou_mod!=0, supporting @mes, @lsv2_line, and quoted R lines', () => withDir(dir => {
 const ss1 = Buffer.from('\ufeff// comment\n/* 「コメント内の台詞」\n*/\n@KOE(1001,001)@mes(1, 【美佐枝】, 「おはよう」)\n', 'utf8');
 const ss2 = Buffer.from('\ufeff$lsv2_koe(1002,002)$lsv2_name("朱音") @lsv2_line(200, 「本当？」)R\n@lsv2_line(201, 世界は静かだった。)R\n', 'utf8');
 const ss3 = Buffer.from('\ufeffKOE(1003,003)【小鳥】"「こんにちは」"R;>>メモ\n"「次の行」"R\n', 'utf8');
 const fakeEncryptedBlob = Buffer.alloc(64, 0xaa);
 fs.writeFileSync(path.join(dir, 'Scene.pck'), buildScenePck({
  scenes: [{ name: 's1', blob: fakeEncryptedBlob }, { name: 's2', blob: fakeEncryptedBlob }, { name: 's3', blob: fakeEncryptedBlob }],
  exeAngouMod: 1,
  osFiles: [
   { name: 'seen01.ss', raw: ss1 },
   { name: 'seen02.ss', raw: ss2 },
   { name: 'seen03.ss', raw: ss3 },
  ],
 }));
 fs.writeFileSync(path.join(dir, 'SiglusEngine.exe'), 'MZ');

 const r = core.probeGame({ dir });
 assert.equal(r.step, 'ok');
 assert.equal(r.detected, 'siglus-pck');
 const e = scenes.ENGINES['siglus-pck'];
 const parsed = e.scenes(dir).map(s => e.parse(s.read()));
 assert.deepEqual(parsed[0].lines, ['「おはよう」']);
 assert.deepEqual(parsed[0].speakers, ['美佐枝']);
 assert.deepEqual(parsed[1].lines, ['「本当？」', '世界は静かだった。']);
 assert.deepEqual(parsed[1].speakers, ['朱音', '']);
 assert.deepEqual(parsed[2].lines, ['「こんにちは」', '「次の行」']);
 assert.deepEqual(parsed[2].speakers, ['小鳥', '']);
}));

test('siglus-pck reports decrypt-failed when exe_angou_mod!=0 and no OS section exists', () => withDir(dir => {
 fs.writeFileSync(path.join(dir, 'Scene.pck'), buildScenePck({
  scenes: [{ name: 'seen01', blob: Buffer.alloc(64, 0xaa) }],
  exeAngouMod: 1,
 }));
 fs.writeFileSync(path.join(dir, 'SiglusEngine.exe'), 'MZ');

 const r = core.probeGame({ dir });
 assert.equal(r.step, 'decrypt-failed');
 assert.equal(r.detail, 'siglus-pck:SIGLUS_EXE_KEY');
}));

test('judgeLanguage keeps an English game with stray Japanese scenes as not-japanese', () => {
 assert.equal(core.judgeLanguage({ lines: 102218, japaneseLines: 1284, dialogueLines: 98085, chineseLines: 0, title: 'Some English VN' }), 'not-japanese');
});

test('scanRunning marks an English siglus-pck build with stray Japanese lines as SCRIPT_NOT_JAPANESE', () => withDir(dir => {
 const ot = require('../services/original-text.cjs');
 const items = [];
 for (let i = 0; i < 120; i++) items.push({ kind: 'text', text: 'This is English dialogue line number ' + i + ' with — punctuation.' });
 for (let i = 0; i < 10; i++) items.push({ kind: 'text', text: '「これはおまけの日本語のセリフです' + i + '」' });
 const dat = buildCompiledDat(items);
 const blob = kit.xor(siglusPack(dat), EASY_ANGOU);
 fs.writeFileSync(path.join(dir, 'SceneEN.pck'), buildScenePck({ scenes: [{ name: 'seen01', blob }], exeAngouMod: 0 }));
 const exe = path.join(dir, 'SiglusEngine_SteamEN.exe');
 fs.writeFileSync(exe, 'MZ');
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-ot-'));
 try {
  const st = ot.scanRunning(root, 'g1', exe);
  assert.equal(st.status, 'unsupported');
  assert.equal(st.error, 'SCRIPT_NOT_JAPANESE');
 } finally {
  fs.rmSync(root, { recursive: true, force: true });
 }
}));

test('scanRunning keeps a Japanese script with many ASCII command lines as native-japanese', () => withDir(dir => {
 const ot = require('../services/original-text.cjs');
 const items = [];
 for (let i = 0; i < 120; i++) items.push({ kind: 'text', text: '@cmd arg one two ' + i });
 for (let i = 0; i < 20; i++) items.push({ kind: 'text', text: '「日本語のセリフです' + i + '」' });
 const dat = buildCompiledDat(items);
 const blob = kit.xor(siglusPack(dat), EASY_ANGOU);
 fs.writeFileSync(path.join(dir, 'Scene.pck'), buildScenePck({ scenes: [{ name: 'seen01', blob }], exeAngouMod: 0 }));
 const exe = path.join(dir, 'SiglusEngine.exe');
 fs.writeFileSync(exe, 'MZ');
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-ot-jp-'));
 try {
  const st = ot.scanRunning(root, 'g2', exe);
  assert.equal(st.status, 'native-japanese');
 } finally {
  fs.rmSync(root, { recursive: true, force: true });
 }
}));
