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
const gameVoice = require('../services/game-voice.cjs');
const F = {...require('./helpers/engine-fixtures.cjs'), ...require('./helpers/engine-fixtures-d.cjs')};

function script(encode, body, label = 4, command = 0x2152, returnBytes = 28, functions) {
  const code = [], strings = [], labels = Buffer.alloc((label + 1) * 4);
  let codeSize = 0, textSize = 0;
  function emit(...words) {
    const bytes = Buffer.alloc(words.length * 2);
    words.forEach((word, i) => bytes.writeUInt16LE(word & 0xffff, i * 2));
    code.push(bytes);
    codeSize += bytes.length;
    return bytes;
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
  function message(values, id = 42, callee = label) {
    [...values, -1, 0, 0, id].forEach(push);
    emit(0x0410, callee);
  }
  function setLabel(index) { labels.writeUInt32LE(codeSize, index * 4); }
  function jump(op) {
    const bytes = op === 0x0403 || op === 0x0407 ? emit(op, 0, 0, 0, 0) : emit(op, 0, 0);
    return (offset = 0) => bytes.writeUInt32LE(codeSize + offset, bytes.length - 4);
  }
  const builder = {emit, message, push, setLabel, jump};
  body(builder);
  emit(0x0414, 0);
  setLabel(label);
  if (functions) functions(builder);
  else emit(command, 0x2153, 0x0411, returnBytes);
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
    assert.deepEqual(parsed.identityProjection.anchors, ['voice001.ogg']);
  }
});

test('CMVS keeps an asset-shaped message body and falls back on an unknown call or malformed bytecode', () => {
  const body = ({emit, message}) => {
    emit(0x0200, 0x0104, 1, 0, 0x020f); // A condition evaluated without pushing a call operand.
    message(['resource.ogg', 'clip.ogg', ja[0]]);
  };
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

test('CMVS keeps all options when their function jumps over dialogue commands', t => {
  const options = ['ひとつめの選択肢。', 'ふたつめの選択肢。', 'みっつめの選択肢。'];
  for (const op of [0x0400, 0x0405, 0x0407]) {
    const {root, game, exe, id} = makeGame(t);
    const bytes = script(F.sjis, ({message}) => {
      message(options, 1, 1);
      message([ja[1], '', ja[0]], 2, 2);
    }, 3, undefined, undefined, ({emit, jump, setLabel, push}) => {
      setLabel(1);
      let toOptions;
      if (op === 0x0405) emit(op, 3);
      else toOptions = jump(op);
      setLabel(2);
      const frameString = offset => emit(0x0201, 0x0122, offset, 0, 0x020f, 0x0430);
      frameString(32); push(-1); push(0); emit(0x2152);
      push(-1); push(0); push(0); emit(0x2153);
      const toEnd = jump(0x0400);
      toOptions?.();
      setLabel(3);
      [32, 28, 24].forEach((offset, i) => { frameString(offset); push(i); emit(0x2154); });
      toEnd();
      emit(0x0411, 28);
    });
    F.writeTree(game, {'data/pack/script.cpz': F.cpz7({'s1.ps3': bytes})});
    assert.equal(original.scanRunning(root, id, exe).status, 'native-japanese');
    assert.deepEqual(original.scriptPairs(root, exe).ja, [...options, ja[1]]);
    assert.equal(cmvs.parse(bytes).records.at(-1).speaker, ja[0]);
  }
});

test('CMVS keeps options when no returning path both draws and waits for a message', () => {
  const options = ['前へすすむ。', 'こちらへすすむ。', 'もうすこし待ちましょう。'];
  const bytes = script(F.sjis, ({message}) => message(options), 4, undefined, undefined, ({emit, jump, push}) => {
    const frameString = offset => emit(0x0201, 0x0122, offset, 0, 0x020f, 0x0430);
    [32, 28, 24].forEach((offset, i) => { frameString(offset); push(i); emit(0x2154); });
    emit(0x0200, 0x0104, 1, 0, 0x020f);
    const wait = jump(0x0403);
    frameString(32); push(-1); push(0); emit(0x2152, 0x0411, 28);
    wait();
    push(-1); push(0); push(0); emit(0x2153, 0x0411, 28);
  });
  assert.deepEqual(cmvs.parse(bytes).lines, options);
});

test('CMVS leaves backslashes intact in ASCII and Japanese voice paths', () => {
  const refs = ['voice\\take01.ogg', '音声！\\next02.ogg'];
  const bytes = script(F.sjis, ({message}) => {
    for (const [i, voice] of refs.entries()) message([ja[i + 1], voice, ja[0]]);
  });
  const parsed = cmvs.parse(bytes);
  assert.deepEqual(parsed.lines, ja.slice(1, 3));
  assert.deepEqual(parsed.records.map(row => row.voice), refs);
});

test('CMVS only hides archive paths consumed by a complete registration command', () => {
  const paths = ['data\\pack\\しおり.cpz', 'data\\pack\\はじめ.cpz'];
  for (let op = 0x2268; op <= 0x226e; op++) {
    const bytes = script(F.sjis, ({emit, push}) => {
      [paths[0], 0].forEach(push);
      emit(0x2010);
      [0, 0, 0, 0, paths[1], 0].forEach(push);
      emit(op);
      push(ja[2]);
      emit(0x211e); // A short operand run cannot identify a complete call.
    });
    const parsed = cmvs.parse(bytes);
    assert.deepEqual(parsed.lines, [ja[2]]);
    assert.deepEqual(parsed.anchors, paths);
    assert.deepEqual(parsed.identityProjection.lines, [...paths, ja[2]]);
  }
});

test('CMVS keeps archive-shaped dialogue with computed controls and on unknown calls', () => {
  const body = 'demo.cpz';
  const bytes = script(F.sjis, ({emit, message, push}) => {
    message([body, '', '']);
    [body, '', ''].forEach(push);
    emit(0x0200, 0x0104, 1, 0, 0x020f, 0x0430);
    push(0);
    push(0);
    emit(0x0200, 0x0104, 2, 0, 0x020f, 0x0430);
    emit(0x0410, 4);
  });
  assert.deepEqual(cmvs.parse(bytes).records.map(row => [row.text, row.lineId]), [[body, 42], [body, null]]);
  const fallback = script(F.sjis, ({message}) => message([body, '', '']), 4, 0x2154);
  assert.deepEqual(cmvs.parse(fallback).lines, [body]);
});

test('CMVS classifies only calls with a single straight run of operands', () => {
  for (const [op, entry, recognized] of [
    [0x0400, 'first', true], [0x0401, 'second', false], [0x0402, 'push', false],
    [0x0403, 'call', false], [0x0407, 'second', false], [0x0400, 'midword', false],
  ]) {
    const bytes = script(F.sjis, ({jump, push, emit, message}) => {
      const branch = jump(op);
      if (entry === 'first' || entry === 'midword') branch(entry === 'midword' ? 1 : 0);
      push(ja[1]);
      if (entry === 'second') branch();
      push('voice.ogg');
      if (entry === 'push') branch(-2);
      [ja[0], -1, 0, 0, 12].forEach(push);
      if (entry === 'call') branch();
      emit(0x0410, 4);
      message([ja[2], '', ja[0]]);
    });
    const parsed = cmvs.parse(bytes);
    const first = recognized ? [ja[1]] : [ja[1], ja[0]];
    assert.deepEqual(parsed.lines, [...first, ja[2], ...(entry === 'midword' ? [ja[0]] : [])], entry);
    assert.equal(parsed.records[0].lineId, recognized ? 12 : null, entry);
  }
});

test('CMVS resolves conditional paths, loops and alternate returns inside a message function', () => {
  for (const [opcode, shouldClassify] of [[0x0401, true], [0x0402, true], [0x0403, true],
    [0x0413, false], [0x0414, false]]) {
    const bytes = script(F.sjis, ({message}) => message([ja[1], '', ja[0]]), 4, undefined, undefined,
      ({emit, jump}) => {
        if (shouldClassify) {
          const loop = jump(opcode);
          loop(opcode === 0x0403 ? -10 : -6);
        } else emit(opcode, 28);
        emit(0x2152, 0x2153, 0x0411, 28);
      });
    assert.deepEqual(cmvs.parse(bytes).lines, shouldClassify ? [ja[1]] : [ja[1], ja[0]], opcode.toString(16));
  }
});

test('CMVS skips valid complex expressions and falls back on malformed expressions and instructions', () => {
  const int = [0x0200, 0x0100, 0, 0, 0x020f];
  const nested = depth => [...Array.from({length:depth}, () => [0x0200, 0x0101]).flat(), ...int,
    ...Array(depth).fill(0x020f)];
  const terms = count => [0x0200, ...Array(count).fill(0x0160), 0x020f];
  for (const [tail, recognized] of [
    [[0x0200, 0x0105, 0, 0, ...int, 0x020f], true],
    [[0x0200, 0x0111, 0, 0, 0, ...int, ...int, 0x020f], true],
    [[0x0200, 0x0113, 0, 0, 0, ...int, ...int, 0x020f], true],
    [[0x0200, 0x0111, 0, 0, 0, ...int, 0x020f], false],
    [[0x0200, 0x0113, 0, 0, 0, ...int, 0x020f], false],
    [[0x0200, 0xbeef, 0, 0, ...int, 0x020f], false],
    [nested(63), true], [nested(64), false], [terms(128), true], [terms(129), false],
    [[0x0200, 0x0101, 0x01ff, 0x0100, 0, 0, 0x020f, 0x020f], false],
    [[0x0200, 0x0101, 0x0203, 0x0100, 0, 0, 0x020f, 0x020f], false],
    [[0x0200, 0xbeef, 0x020f], false], [[0x0201, 0x0105, 0, 0, ...int, 0x020f], false],
    [[0x0000], false], [[0x0440], false], [[0x0405, 99], false],
  ]) {
    const bytes = script(F.sjis, ({message}) => message([ja[1], '', ja[0]]), 4, undefined, undefined, ({emit}) => {
      emit(0x2152, 0x2158, 0x0411, 28);
      emit(...tail);
    });
    assert.deepEqual(cmvs.parse(bytes).lines, recognized ? [ja[1]] : [ja[1], ja[0]], tail[0].toString(16));
  }
});

test('CMVS keeps legacy slots when a message points outside the text pool', () => {
  for (const slot of [0, 1, 2]) {
    const bytes = script(F.sjis, ({message}) => message([ja[1], 'voice.ogg', ja[0]]));
    const code = 0x30 + 4 * bytes.readUInt32LE(0x10);
    bytes.writeUInt32LE(bytes.readUInt32LE(0x1c), code + slot * 12 + 4);
    const parsed = cmvs.parse(bytes);
    const legacy = slot === 0 ? [ja[0]] : slot === 1 ? [ja[1], ja[0]] : [ja[1]];
    assert.deepEqual(parsed.lines, legacy);
    assert.deepEqual(parsed.records.map(row => row.lineId), legacy.map(() => null));
  }
});

test('CMVS reserves classification for supported calls with a consistent return layout', () => {
  for (const tail of ['fall-through', 'different-arity', 'no-arguments', 'eight-arguments', 'jump-by-label']) {
    const bytes = script(F.sjis, ({emit, message, push}) => {
      message([ja[1], '', ja[0]]);
      if (tail === 'eight-arguments' || tail === 'jump-by-label') {
        [ja[2], '', ja[0], -1, 0, 0, 1].forEach(push);
        if (tail === 'eight-arguments') push(1);
        emit(tail === 'jump-by-label' ? 0x0405 : 0x0410, 1);
      } else message([ja[2], '', ja[0]], 15, 1);
    }, 4, undefined, undefined, ({emit, jump, setLabel}) => {
      emit(0x2152, 0x2153, 0x0411, 28);
      setLabel(1);
      emit(0x2152, 0x2153);
      if (tail === 'fall-through') return;
      if (tail === 'different-arity' || tail === 'no-arguments') {
        const branch = jump(0x0402);
        emit(0x0411, tail === 'different-arity' ? 24 : 0);
        branch();
        emit(0x0411, 28);
      } else emit(0x0411, tail === 'eight-arguments' ? 32 : 28);
    });
    assert.deepEqual(cmvs.parse(bytes).lines, [ja[1], ja[2], ja[0]], tail);
  }
});

test('CMVS falls back above its bytecode size and label limits', () => {
  const body = ({message}) => message([ja[1], '', ja[0]], 42, 1);
  const originalScript = script(F.sjis, body, 1);
  const codeEnd = 0x38 + originalScript.readUInt32LE(0x14);
  const codeLimit = 4 * 1024 * 1024;
  for (const size of [codeLimit, codeLimit + 2]) {
    const bytes = Buffer.concat([originalScript.subarray(0, codeEnd),
      Buffer.alloc(size - originalScript.readUInt32LE(0x14), Buffer.from([0x16, 0x04])), originalScript.subarray(codeEnd)]);
    bytes.writeUInt32LE(size, 0x14);
    assert.deepEqual(cmvs.parse(bytes).lines, size === codeLimit ? [ja[1]] : [ja[1], ja[0]]);
  }
  for (const count of [65536, 65537]) {
    const bytes = script(F.sjis, body, count - 1, undefined, undefined, ({emit, setLabel}) => {
      setLabel(1);
      emit(0x2152, 0x2153, 0x0411, 28);
    });
    assert.deepEqual(cmvs.parse(bytes).lines, count === 65536 ? [ja[1]] : [ja[1], ja[0]]);
  }
});


test('CVNS reads text and metadata with fewer control arguments', () => {
  for (const [argc, command] of [[4, 0x2117], [5, 0x212c]]) {
    const plain = script(F.sjis, ({ emit, push }) => {
      ['data\\pack\\old.cpz', 0].forEach(push);
      emit(0x2021);
      [ja[1], 'voice001', ja[0], -1, ...(argc === 5 ? [328] : [])].forEach(push);
      emit(0x0410, 3);
    }, 3, command, argc * 4, ({emit}) => emit(command, 0x0411, argc * 4));
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

test('CMVS falls back when the callee exhausts its control flow budget', () => {
  const bytes = script(F.sjis, ({message}) => message([ja[1], '', ja[0]]), 1);
  const target = bytes.readUInt32LE(0x34), at = 0x38 + target;
  for (const count of [99999, 100000]) {
    const jumps = Buffer.alloc(6 * count);
    for (let i = 0; i < jumps.length; i += 6) {
      jumps.writeUInt16LE(0x0400, i);
      jumps.writeUInt32LE(target + i + 6, i + 2);
    }
    const expanded = Buffer.concat([bytes.subarray(0, at), jumps, bytes.subarray(at)]);
    expanded.writeUInt32LE(bytes.readUInt32LE(0x14) + jumps.length, 0x14);
    assert.deepEqual(cmvs.parse(expanded).lines, count === 99999 ? [ja[1]] : [ja[1], ja[0]]);
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

test('CMVS voice references in a CPZ and unknown calls leave existing runtime recordings playable', t => {
  const {root, game} = makeGame(t);
  const clip = Buffer.from('OggS test audio');
  const piece = 'ひとつ目です。', incomplete = 'こちらも音声つきです。';
  const scene = script(F.sjis, ({emit, message, push}) => {
    message(['「' + piece + '次の言葉です。」', 'clip.ogg', ja[0]]);
    [incomplete, 'other-clip.ogg', ja[0]].forEach(push);
    emit(0x0200, 0x0104, 1, 0, 0x020f, 0x0430); // A variable control argument.
    [0, 0, 2].forEach(push);
    emit(0x0410, 1);
  }, 4, undefined, undefined, ({emit, setLabel}) => {
    emit(0x2152, 0x2153, 0x0411, 28);
    setLabel(1);
    emit(0x2154, 0x0411, 28);
  });
  F.writeTree(game, {'data/pack/script.cpz': F.cpz7({'s1.ps3': scene}),
    'data/pack/voice.cpz': F.cpz7({'clip.ogg': clip, 'other-clip.ogg': clip})});
  const texts = [piece, incomplete];
  for (const text of texts) assert.equal(gameVoice.remember(root, text, clip), true);
  assert.equal(gameVoice.scan(root, game).engine, 'cmvs');
  for (const text of texts) {
    assert.equal(gameVoice.find(root, text)?.source, 'runtime');
    assert.equal(fs.existsSync(gameVoice.runtimeFile(root, gameVoice.keyOf(text), '.ogg')), true);
  }
});

test('CMVS FileHook pairs both versions by the original push slots and keeps the legacy runtime and adopted-original print', t => {
  const shiftedZh = zh.slice();
  shiftedZh[2] = '';
  const { root, game, exe, id } = makeGame(t, shiftedZh);
  const state = original.scanRunning(root, id, exe);
  assert.equal(state.status, 'ready');
  const legacy = cmvs.originalLines(game);
  const runtime = read(state.runtime.index);
  assert.equal(runtime.lines[4], zh[0]);
  assert.equal(runtime.roles, undefined);
  assert.equal(read(state.original.index).roles, undefined);
  assert.equal(original.contributionScript(root, exe, id), legacyPrint([runtime.lines, legacy]));
  const pairs = original.scriptPairs(root, exe);
  assert.deepEqual(pairs.ja, [ja[1] + '\t' + ja[1], ...ja.slice(3)]);
  assert.deepEqual(pairs.tr, [zh[1] + '\t' + zh[1], ...zh.slice(3)]);
  const provider = original.provider(root, exe);
  assert.equal(provider.resolve(zh[3]).japanese, ja[3]);
  assert.equal(provider.resolveChoice(ja[3]).translation, zh[3]);
  const literalJa = ja[1] + '\\t' + ja[1], literalZh = zh[1] + '\\t' + zh[1];
  const captured = provider.resolve(literalZh);
  assert.equal(captured.status, 'exact');
  assert.equal(captured.japanese, pairs.ja[0]);
  assert.equal(captured.captured, literalZh);
  assert.equal(provider.resolveJapanese(literalJa).translation, pairs.tr[0]);
  assert.equal(scenes.read('cmvs', game)[0].records[0].speaker, zh[0]);
});

test('the CMVS hook distinguishes different source lines that normalize to the same text', t => {
  const {root, game, exe, id} = makeGame(t);
  const originals = [ja[3], ja[4], ja[1] + ja[2], ja[1] + '\\t' + ja[2], ...ja.slice(5)];
  const localized = [zh[1] + zh[2], zh[1] + '\\t' + zh[2], zh[3], zh[4], ...zh.slice(5)];
  const make = (encode, rows, speaker) => script(encode, ({message}) => {
    rows.forEach((text, i) => message([text, '', speaker], i));
  });
  F.writeTree(game, {
    'data/pack/script.cpz': F.cpz7({'s1.ps3': make(F.sjis, originals, ja[0])}),
    'FileHook/s1.ps3': make(F.gbk, localized, zh[0])
  });
  assert.equal(original.scanRunning(root, id, exe).status, 'ready');
  const {HookNative, cleanSource} = require('../core/hook-native.cjs');
  const hook = Object.assign(Object.create(HookNative.prototype), {
    originalText:original.provider(root, exe), trace() {}, emit() {}
  });
  for (const i of [1, 0]) assert.equal(hook.originalTextFor(cleanSource(localized[i], 'CMVS')), originals[i]);
  for (const i of [3, 2]) assert.equal(hook.scriptTranslation(cleanSource(originals[i], 'CMVS')), localized[i]);
});

test('CMVS keeps a paired message even when neither side had a legacy identity row', t => {
  const {root, game, exe, id} = makeGame(t);
  const jp = ja.slice(), cn = zh.slice();
  jp[2] = 'japanese.ogg';
  cn[2] = 'chinese.ogg';
  F.writeTree(game, {'data/pack/script.cpz': F.cpz7({'s1.ps3': classified(F.sjis, jp, 2)})});
  assert.equal(original.scanRunning(root, id, exe).status, 'native-japanese');
  const native = original.provider(root, exe).resolve(jp[2]);
  assert.equal(native.method, 'untranslated');
  assert.deepEqual(native.indices, [1]);
  F.writeTree(game, {'FileHook/s1.ps3': classified(F.gbk, cn, 7)});
  assert.equal(original.scanRunning(root, id, exe).status, 'ready');
  assert.equal(original.scriptPairs(root, exe).ja[1], jp[2]);
  assert.equal(original.provider(root, exe).resolve(cn[2]).japanese, jp[2]);
});

test('display rows keep saved choice roles and ruby attached to their identity slots', t => {
  for (const view of ['original', 'patch']) {
    const {root, exe, id} = makeGame(t, view === 'original' ? zh : null);
    const state = original.scanRunning(root, id, exe);
    if (view === 'patch') {
      const patch = path.join(root, 'patch');
      F.writeTree(patch, {'s1.ps3': classified(F.gbk, zh, 7)});
      assert.equal(original.importPatch(root, null, id, patch, {executable:exe}).patchStatus, 'ready');
      assert.equal(original.provider(root, exe).resolve(ja[1] + '\\t' + ja[1]).translation, zh[1] + '\t' + zh[1]);
    }
    // CMVS itself has no roles or ruby. Model the metadata of an index that does.
    const indexPath = view === 'original' ? state.original.index : state.runtime.index;
    const index = read(indexPath), body = ja[1] + '\\t' + ja[1], choices = ja.slice(2, 4), ruby = ['二', 'に'];
    index.roles = index.lines.map(text => text === body ? 'b' : choices.includes(text) ? 'c' : '?').join('');
    index.ruby = index.lines.map(text => text === choices[0] ? [ruby] : null);
    fs.writeFileSync(indexPath, JSON.stringify(index));
    const provider = original.provider(root, exe);
    assert.equal(provider.resolveChoice(body).status, 'none', view);
    assert.deepEqual(choices.map(text => provider.resolveChoice(text).translation), zh.slice(2, 4), view);
    assert.deepEqual(provider.resolve(view === 'original' ? zh[2] : ja[2]).ruby, [ruby], view);
    if (view === 'patch') {
      assert.deepEqual(provider.choiceGroupAfter(body, choices.slice().reverse()), choices);
      provider.resolve(body);
      assert.equal(provider.matchedBody(body), true);
    }
    index.roles = index.lines.map(text => text === ja[0] ? 'c' : '?').join('');
    fs.writeFileSync(indexPath, JSON.stringify(index));
    assert.equal(original.provider(root, exe).resolveChoice(choices[0]).status, 'none', view);
  }
});

test('CMVS looks up local patch text by identity slot across scenes', t => {
  const {root, game, exe, id} = makeGame(t);
  const nextJa = ja.map(text => '次の' + text), nextZh = zh.map(text => '新的' + text);
  const patch = path.join(root, 'patch');
  F.writeTree(game, {'data/pack/script.cpz': F.cpz7({
    's1.ps3': classified(F.sjis, ja, 2), 's2.ps3': classified(F.sjis, nextJa, 2)
  })});
  F.writeTree(patch, {'s1.ps3': classified(F.gbk, zh, 7), 's2.ps3': classified(F.gbk, nextZh, 7)});
  assert.equal(original.scanRunning(root, id, exe).status, 'native-japanese');
  const japanese = original.scriptPairs(root, exe);
  assert.equal(japanese.source, '');
  assert.deepEqual(japanese.tr, []);
  assert.equal(japanese.ja.at(-1), nextJa.at(-1));
  assert.equal(original.importPatch(root, null, id, patch, {executable:exe}).patchStatus, 'ready');
  const paired = original.scriptPairs(root, exe);
  assert.equal(paired.source, 'group');
  assert.equal(paired.tr.at(-1), nextZh.at(-1));
  const provider = original.provider(root, exe);
  assert.equal(provider.resolve(nextJa.at(-1)).translation, nextZh.at(-1));
  assert.deepEqual(provider.pageBetween(ja.at(-1), nextJa[1] + '\\t' + nextJa[1], nextJa[2]), [nextJa[1] + '\t' + nextJa[1]]);
  const state = read(path.join(root, 'data/config/original-text.json'))[id];
  const stamp = new Date(fs.statSync(state.runtime.file).mtimeMs + 5000);
  fs.utimesSync(path.join(game, 'data/pack/script.cpz'), stamp, stamp);
  assert.equal(original.provider(root, exe), null); // A changed installation cannot use its old live provider.
  assert.equal(original.provider(root, exe, {indexOnly:true}).resolve(nextJa.at(-1)).translation, nextZh.at(-1));
});

test('CMVS status and the static provider rebuild a stale runtime and adopted original with the same source fingerprint', t => {
  for (const entry of ['status', 'provider', 'original-only', 'runtime-only']) {
    const {root, exe, id} = makeGame(t, zh);
    const fresh = original.scanRunning(root, id, exe);
    assert.equal(fresh.status, 'ready');
    const stateFile = path.join(root, 'data/config/original-text.json');
    function stale() {
      const states = read(stateFile), state = states[id];
      if (entry !== 'original-only') state.runtime.reader = 'older-reader';
      if (entry !== 'runtime-only') state.original.reader = 'older-reader';
      const rt = read(state.runtime.index), og = read(state.original.index);
      if (entry !== 'original-only') delete rt.display;
      if (entry !== 'runtime-only') delete og.displayLines;
      fs.writeFileSync(state.runtime.index, JSON.stringify(rt));
      fs.writeFileSync(state.original.index, JSON.stringify(og));
      fs.writeFileSync(stateFile, JSON.stringify(states));
    }
    const print = original.contributionScript(root, exe, id), key = original.providerKey(root, exe, id);
    stale();
    assert.notEqual(original.providerKey(root, exe, id), key);
    if (entry === 'provider') {
      assert.ok(original.scriptPairs(root, exe).ja.includes(ja[0])); // This API only reads the saved snapshot.
      assert.equal(read(stateFile)[id].runtime.reader, 'older-reader');
    }
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
    assert.ok(!original.scriptPairs(root, exe).ja.includes(ja[0]));
    assert.equal(original.contributionScript(root, exe, id), print);
    assert.equal(original.providerKey(root, exe, id), key);
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
