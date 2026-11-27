// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const cmvs = require('../services/original-engines/cmvs.cjs');
const original = require('../services/original-text.cjs');
const scenes = require('../services/original-engines/scenes.cjs');
const F = {...require('./helpers/engine-fixtures.cjs'), ...require('./helpers/engine-fixtures-d.cjs')};

function script(encode, body, label = 4, command = 0x2152, returnBytes = 28) {
  const code = [], strings = [], labels = Buffer.alloc((label + 1) * 4);
  let codeSize = 0, textSize = 0;
  function emit(...words) {
    const bytes = Buffer.alloc(words.length * 2);
    words.forEach((word, i) => bytes.writeUInt16LE(word & 0xffff, i * 2));
    code.push(bytes);
    codeSize += bytes.length;
  }
  function push(value) {
    if (typeof value === 'number') {
      emit(0x0200, 0x0100, value, value >>> 16, 0x020f, 0x0430);
      return;
    }
    const bytes = Buffer.concat([encode(value), Buffer.from([0])]);
    emit(0x0201, 0x0120, textSize, textSize >>> 16, 0x020f, 0x0430);
    strings.push(bytes);
    textSize += bytes.length;
  }
  function message(values, id = 42) {
    [...values, -1, 0, 0, id].forEach(push);
    emit(0x0410, label);
  }
  body({ emit, message, push });
  emit(0x0414, 0);
  labels.writeUInt32LE(codeSize, label * 4);
  emit(command, 0x2153, 0x0411, returnBytes);
  const header = Buffer.alloc(0x30);
  header.write('PS2A');
  header.writeUInt32LE(label + 1, 0x10);
  header.writeUInt32LE(codeSize, 0x14);
  header.writeUInt32LE(textSize, 0x1c);
  return Buffer.concat([header, labels, ...code, ...strings]);
}

const ja = ['テスト役', '本番に備えます。', '二つ目の例です。', '次へ進みましょう。', '古い窓が開きます。',
  '青い鉛筆を置きました。', '今の頁を読みましょう。', 'ここで話は終わります。'];
const zh = ['测试角色', '为正式测试做准备。', '这是第二个例子。', '继续往下进行。', '旧窗户打开了。',
  '我放下了蓝色铅笔。', '把这一页读完。', '故事到这里结束。'];

function classified(encode, texts, label) {
  return script(encode, ({ emit, message, push }) => {
    push('data\\pack\\demo.cpz');
    push(0);
    emit(0x2011);
    push(0);
    push('「');
    push('。');
    push(1);
    emit(0x211e);
    const [speaker, first, ...rest] = texts;
    message([first + '\\t' + first, 'voice001.ogg', speaker]);
    rest.forEach((text, i) => message([text, '', ''], 43 + i));
  }, label);
}

test('CMVS reads dialogue, speaker, voice and line number from the call, with a separate byte-for-byte identity projection', () => {
  for (const label of [1, 9]) {
    const parsed = cmvs.parse(classified(F.sjis, ja, label));
    assert.deepEqual(parsed.lines, [ja[1] + '\t' + ja[1], ...ja.slice(2)]);
    assert.deepEqual(parsed.records[0], {text: parsed.lines[0], speaker: ja[0], voice: 'voice001.ogg', lineId: 42});
    assert.deepEqual(parsed.records[1], {text: ja[2], speaker: '', voice: '', lineId: 43});
    assert.deepEqual(parsed.identityProjection.lines, ['data\\pack\\demo.cpz', '「', '。', ja[1] + '\\t' + ja[1], ja[0], ...ja.slice(2)]);
    assert.deepEqual(parsed.voices, ['voice001', ...ja.slice(2).map(() => null)]);
    assert.deepEqual(parsed.identityProjection.anchors, ['voice001.ogg']);
  }
});

test('CMVS keeps an asset-shaped message body and falls back on an unknown call or malformed bytecode', () => {
  const body = ({ message }) => message(['resource.ogg', 'clip.ogg', ja[0]]);
  const recognized = cmvs.parse(script(F.sjis, body));
  assert.deepEqual(recognized.lines, ['resource.ogg']);
  assert.deepEqual(recognized.identityProjection.lines, [ja[0]]);
  const unrelated = cmvs.parse(script(F.sjis, body, 2, 0x20b0));
  assert.deepEqual(unrelated.lines, [ja[0]]);
  const short = cmvs.parse(script(F.sjis, ({ emit, message }) => {
    message([ja[1], '', ja[0]]);
    emit(0x9999);
  }));
  assert.deepEqual(short.lines, [ja[1], ja[0]]);
  const mismatched = cmvs.parse(script(F.sjis, body, 4, 0x2152, 24));
  assert.deepEqual(mismatched.lines, [ja[0]]);
});


test('CVNS reads text and metadata with fewer control arguments', () => {
  for (const [argc, command] of [[4, 0x2117], [5, 0x212c]]) {
    const plain = script(F.sjis, ({ emit, push }) => {
      ['data\\pack\\old.cpz', 0].forEach(push);
      emit(0x2021);
      [ja[1], 'voice001', ja[0], -1, ...(argc === 5 ? [328] : [])].forEach(push);
      emit(0x0410, 3);
    }, 3, command, argc * 4);
    const header = Buffer.from(plain.subarray(0, 0x30));
    const packed = F.literals(plain.subarray(0x30));
    header.write('PSS0');
    header.writeUInt32LE(packed.length, 0x24);
    header.writeUInt32LE(plain.length - header.length, 0x28);
    const result = cmvs.parse(Buffer.concat([header, packed]));
    assert.deepEqual(result.lines, [ja[1]]);
    assert.deepEqual(result.records, [{text:ja[1], speaker:ja[0], voice:'voice001', lineId:argc === 5 ? 328 : null}]);
    assert.deepEqual(result.identityProjection.lines, ['data\\pack\\old.cpz', ja[1], ja[0]]);
  }
});


function makeGame(t, patch) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-cmvs-dialogue-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const game = path.join(root, 'game'), exe = path.join(game, 'cmvs32.exe'), id = 'cmvs-test';
  F.writeTree(game, {
    'cmvs32.exe': 'MZ',
    'data/pack/script.cpz': F.cpz7({'s1.ps3': classified(F.sjis, ja, 2)}),
    ...(patch ? {'FileHook/s1.ps3': classified(F.gbk, patch, 7)} : {})
  });
  return {root, game, exe, id};
}

function legacyPrint(lines) {
  const hash = input => createHash('sha256').update(input).digest('hex');
  return hash(lines.map(rows => hash(JSON.stringify(rows))).join('|original|'));
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));

test('CMVS FileHook pairs both versions by the original push slots and keeps the legacy runtime and adopted-original print', t => {
  const shiftedZh = zh.slice();
  shiftedZh[2] = '';
  const { root, game, exe, id } = makeGame(t, shiftedZh);
  const state = original.scanRunning(root, id, exe);
  assert.equal(state.status, 'ready');
  const legacy = cmvs.originalLines(game);
  const runtime = read(state.runtime.index);
  assert.equal(runtime.lines[4], zh[0]);
  assert.equal(original.contributionScript(root, exe, id), legacyPrint([runtime.lines, legacy]));
  const pairs = original.scriptPairs(root, exe);
  assert.deepEqual(pairs.ja, [ja[1] + '\t' + ja[1], ...ja.slice(3)]);
  assert.deepEqual(pairs.tr, [zh[1] + '\t' + zh[1], ...zh.slice(3)]);
  assert.equal(original.provider(root, exe).resolve(zh[3]).japanese, ja[3]);
  assert.equal(scenes.read('cmvs', game)[0].records[0].speaker, zh[0]);
});

test('CMVS status and the static provider rebuild a stale runtime and adopted original with the same source fingerprint', t => {
  for (const entry of ['status', 'provider', 'original-only']) {
    const {root, exe, id} = makeGame(t, zh);
    const fresh = original.scanRunning(root, id, exe);
    assert.equal(fresh.status, 'ready');
    const stateFile = path.join(root, 'data/config/original-text.json');
    function stale() {
      const states = read(stateFile), state = states[id];
      if (entry !== 'original-only') state.runtime.reader = 'older-reader';
      state.original.reader = 'older-reader';
      const rt = read(state.runtime.index), og = read(state.original.index);
      if (entry !== 'original-only') delete rt.display;
      delete og.displayLines;
      fs.writeFileSync(state.runtime.index, JSON.stringify(rt));
      fs.writeFileSync(state.original.index, JSON.stringify(og));
      fs.writeFileSync(stateFile, JSON.stringify(states));
    }
    const print = original.contributionScript(root, exe, id);
    stale();
    if (entry === 'status') {
      const db = {prepare: () => ({get: () => ({executable: exe})})};
      assert.equal(original.status(root, db, id).status, 'ready');
    } else {
      assert.equal(original.provider(root, exe).resolve(zh[3]).japanese, ja[3]);
    }
    const rebuilt = read(stateFile)[id];
    assert.equal(rebuilt.runtime.sha256, fresh.runtime.sha256);
    assert.equal(rebuilt.runtime.reader, fresh.runtime.reader);
    assert.equal(rebuilt.original.reader, fresh.runtime.reader);
    assert.equal(read(rebuilt.runtime.index).display.length, ja.length - 1);
    assert.equal(read(rebuilt.original.index).displayLines.length, ja.length - 1);
    assert.equal(original.contributionScript(root, exe, id), print);
  }
});

/* Replay private, previously collected indexes or scan the matching Japanese retail copy.
   The input manifest maps Seed names to {index} or {game, executable}. Only hashes are committed. */
const seedPrints = {
  amatsutsumi: '669541b08ce73f764832de33503bd748802997944a0dbfde8a943469a206fa8b',
  'akiiro-renka': '3c167be4bf71176644da4cbcd9d3200eb39507f455c4d05ba1a7ad137554a49c',
  'majipuri-wonder-cradle': 'c4b024cc42279ec13f1d9ed4004266705e8d1d0d697229ad82ab13aacf1c2eb9',
  'akiiro-ouka-akiiro-renka-fandisc': '757026fea17bc59322f2c260741949ade2fc88713544c2ceb85fb6e2e4dc803b',
};
const sampleManifest = process.env.MEGULIT_CMVS_SEED_WITNESSES;
test('CMVS reproduces four recorded Seed script fingerprints', {skip:!sampleManifest}, async t => {
  const manifest = read(sampleManifest);
  for (const [slug, expected] of Object.entries(seedPrints)) {
    await t.test(slug, test => {
      assert.equal(require('../The Seed/cmvs/' + slug + '/game.json').prints.script, expected);
      const sample = manifest[slug];
      assert.ok(sample, 'missing witness');
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'megulit-cmvs-seed-'));
      test.after(() => fs.rmSync(root, {recursive:true, force:true}));
      let executable;
      if (sample.game) {
        executable = path.join(sample.game, sample.executable);
        assert.equal(original.scanRunning(root, slug, executable).status, 'native-japanese');
      } else {
        const game = path.join(root, 'game');
        fs.mkdirSync(game);
        executable = path.join(game, 'cvns.exe');
        const index = path.join(root, 'original.json');
        const saved = read(sample.index);
        // Replay a pre-upgrade cache, with a different display view to detect any accidental use of it for identity.
        fs.writeFileSync(index, JSON.stringify({...saved, display:[{text:'different display', identityIndex:0}]}));
        const config = path.join(root, 'data/config');
        fs.mkdirSync(config, {recursive:true});
        const runtime = {file:game, engine:'cmvs', sha256:scenes.fingerprint('cmvs', game), index};
        fs.writeFileSync(path.join(config, 'original-text.json'), JSON.stringify({[slug]:{runtime, status:'native-japanese'}}));
      }
      assert.equal(original.contributionScript(root, executable, slug), expected);
    });
  }
});
