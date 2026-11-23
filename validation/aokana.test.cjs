'use strict';
// Synthetic regression tests for Aokana / Sprite PRead (.dat) archives and .bs5 multi-language scripts (#327).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const scenes = require('../services/original-engines/scenes.cjs');
const registry = require('../services/original-engines/registry.cjs');
const { probeGame } = require('../services/adapter-probe-core.cjs');
const { catalog } = require('../services/game-voice.cjs');

function keyTable(k0) {
  k0 = k0 >>> 0;
  let a = (Math.imul(k0, 7391) + 42828) >>> 0;
  let c = ((a << 17) ^ a) >>> 0;
  const b = Buffer.alloc(256);
  for (let i = 0; i < 256; i++) {
    a = (a - k0 + c) >>> 0;
    c = (a + 56) >>> 0;
    a = Math.imul(a, c & 239) >>> 0;
    b[i] = a & 0xff;
    a = a >>> 1;
  }
  return b;
}

function encrypt(buf, k0) {
  const out = Buffer.from(buf), key = keyTable(k0);
  for (let i = 0; i < out.length; i++) {
    let v = out[i];
    v = (v ^ 153) & 0xff;
    v = (v - key[i % 89]) & 0xff;
    v = (v - 3) & 0xff;
    v = (v ^ key[i % 253]) & 0xff;
    out[i] = v;
  }
  return out;
}

// Synthetic PRead .dat encoder matching Assembly-CSharp PRead::Init / Init2 / dd.
function packPRead(entries, { tocKey = 0x11223344, pathKey = 0x55667788 } = {}) {
  const count = entries.length;
  const hdr = Buffer.alloc(1024);
  hdr.writeUInt32LE(pathKey >>> 0, 92);
  hdr.writeUInt32LE(tocKey >>> 0, 212);
  // Real PRead headers sum int32s[4..254] including the key slots at +92 and +212.
  hdr.writeInt32LE((count - (pathKey | 0) - (tocKey | 0)) | 0, 16);

  const pathParts = entries.map(e => Buffer.from(e.name + '\0', 'ascii'));
  const rpaths = Buffer.concat(pathParts);
  const tocSize = 16 * count;
  const dataStart = 1024 + tocSize + rpaths.length;

  const rtoc = Buffer.alloc(tocSize);
  const payloads = [];
  let pathOff = 0;
  let dataOff = dataStart;
  for (let i = 0; i < count; i++) {
    const e = entries[i];
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const k = (e.key ?? (0x1010101 * (i + 1))) >>> 0;
    rtoc.writeUInt32LE(data.length, i * 16);
    rtoc.writeUInt32LE(pathOff, i * 16 + 4);
    rtoc.writeUInt32LE(k, i * 16 + 8);
    rtoc.writeUInt32LE(dataOff, i * 16 + 12);
    payloads.push(encrypt(data, k));
    pathOff += pathParts[i].length;
    dataOff += data.length;
  }
  return Buffer.concat([hdr, encrypt(rtoc, tocKey), encrypt(rpaths, pathKey), ...payloads]);
}

function put(dir, files) {
  for (const [rel, data] of Object.entries(files)) {
    const f = path.join(dir, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, data);
  }
}

test('Aokana PRead: system.dat + patch.dat layering, bs5 dialogue/choices/voices/tags, patchLines and foreign lookup', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aokana-'));
  try {
    const oldEp01 = [
      '// comment',
      'voice0\tCHARA_0001',
      '\u2402【Hanako】：Good morning.\u2402【花子】：「おはようございます」\u2402【花子】：「早上好（旧）」\u2402【花子】：「早安」',
    ].join('\r\n');

    const filler = Array.from({ length: 60 }, (_, i) =>
      `\u2402　Line ${i}\u2402テスト行その${i}です。\u2402测试句第${i}行。\u2402測試句第${i}行。`
    );

    const newEp01 = [
      '// synthetic episode',
      'scene BG_01 TIME:500',
      'voice0\tCHARA_0001//note',
      '\u2402【Hanako】：Good morning.\u2402【花子】：「おはようございます」//memo\u2402【花子】：「早上好」\u2402【花子】：「早安」',
      '\u2402　@delete\u2402　<color=#FF0000>赤い</color>空を見上げた。<T 0>\\n風が吹く。\u2402　看着<color=#FF0000>红色</color>的天空。<T 0>\\n微风吹拂。\u2402　看著紅色的天空。\\n微風吹拂。',
      '\u2405select 0:"Go left" 1:"Go right" OUTLINE:"Which way?"\u2405select 0:"左へ行く" 1:"右へ行く" OUTLINE:"【選択肢】どちらへ？"\u2405select 0:"往左走" 1:"往右走" OUTLINE:"去哪边？"\u2405select 0:"往左走" 1:"往右走" OUTLINE:"去哪邊？"',
      'voice0 stop',
      '\u2402　Quiet narration.\u2402　静かな夜だ。\u2402　安静的夜晚。\u2402　安靜的夜晚。',
      ...filler,
    ].join('\r\n');

    const ep02 = [
      'voice1\tCHARA_0002',
      '\u2402【Taro】：Hello!\u2402【太郎】：「こんにちは！」\u2402【太郎】：「你好！」\u2402【太郎】：「你好！」',
    ].join('\r\n');

    const fakeOgg = Buffer.from('OggS\x00\x02synthetic-ogg-stream', 'latin1');

    put(dir, {
      'SampleGame.exe': 'MZ',
      'UnityPlayer.dll': 'MZ',
      'SampleGame_Data/globalgamemanagers': Buffer.alloc(64),
      'SampleGame_Data/system.dat': packPRead([
        { name: 'def/arcs.txt', data: 'patch.dat\r\nvoice.dat\r\n' },
        { name: 'scripts/main.bs5', data: 'call ep01\r\n' },
        { name: 'scripts/merge/ep01.bs5', data: oldEp01 },
        { name: 'scripts/merge/ep02.bs5', data: ep02 },
      ]),
      'SampleGame_Data/patch.dat': packPRead([
        { name: 'scripts/merge/ep01.bs5', data: newEp01 },
      ]),
      'SampleGame_Data/voice.dat': packPRead([
        { name: 'voice/CHARA_0001.ogg', data: fakeOgg },
        { name: 'voice/CHARA_0002.ogg', data: fakeOgg },
      ]),
    });

    assert.equal(registry.engineOf(dir)?.name, 'Unity (Aokana)');
    assert.deepEqual(registry.readersFor(dir), ['aokana']);
    assert.equal(scenes.detect(dir), 'aokana');

    const list = scenes.read('aokana', dir);
    assert.deepEqual(list.map(s => s.name), ['ep01.bs5', 'ep02.bs5']);

    const s1 = list[0];
    assert.equal(s1.lines[0], '「おはようございます」');
    assert.equal(s1.lines[1], '赤い空を見上げた。\n風が吹く。');
    assert.equal(s1.lines[2], 'どちらへ？');
    assert.equal(s1.lines[3], '左へ行く');
    assert.equal(s1.lines[4], '右へ行く');
    assert.equal(s1.lines[5], '静かな夜だ。');

    assert.equal(s1.speakers[0], '花子');
    assert.equal(s1.speakers[1], '');
    assert.equal(s1.voices[0], 'CHARA_0001');
    assert.equal(s1.voices[1], null);
    assert.equal(s1.voices[5], null);

    // patch.dat overrides system.dat for ep01.
    const patched = scenes.ENGINES.aokana.patchLines(list, { dirs: [dir] });
    assert.ok(patched);
    assert.equal(patched[0].lines[0], '「早上好」');
    assert.equal(patched[0].lines[1], '看着红色的天空。\n微风吹拂。');
    assert.equal(patched[0].lines[2], '去哪边？');
    assert.equal(patched[0].lines[3], '往左走');
    assert.equal(patched[0].lines[4], '往右走');
    assert.equal(patched[1].lines[0], '「你好！」');
    assert.equal(list[1].voices[0], 'CHARA_0002');

    // Foreign lookup maps Chinese/English back to Japanese.
    const fmap = scenes.ENGINES.aokana.foreign(dir);
    assert.equal(fmap.get('早上好'), '「おはようございます」');
    assert.equal(fmap.get('goodmorning'), '「おはようございます」');

    // Probe classifies as ok with aokana.
    const probe = probeGame({ dir, executable: path.join(dir, 'SampleGame.exe') });
    assert.equal(probe.step, 'ok');
    assert.equal(probe.detected, 'aokana');
    assert.equal(probe.lines, 67);
    assert.equal(probe.japaneseLines, 67);

    // Voice catalog reads Ogg clips from voice.dat.
    const cat = catalog(dir);
    const clip = cat.get('CHARA_0001');
    assert.ok(clip, 'CHARA_0001 should exist in voice catalog');
    assert.deepEqual(clip(), fakeOgg);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Aokana PRead: malformed archives return null and single-language scripts fall back cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aokana-edge-'));
  try {
    const aokana = require('../services/original-engines/aokana.cjs');
    const bad = path.join(dir, 'bad.dat');
    fs.writeFileSync(bad, Buffer.alloc(1200, 0xaa));
    assert.equal(aokana.listArchive(bad), null);

    const jpOnly = [
      'voice0\tVOICE_10',
      '【春子】：「これは単言語のテストです」',
      '　@delete',
      '　次の行です。',
    ].join('\n');

    put(dir, {
      'SampleGame.exe': 'MZ',
      'SampleGame_Data/system.dat': packPRead([
        { name: 'scripts/jp/scene01.bs5', data: jpOnly },
      ]),
    });

    assert.equal(registry.engineOf(dir)?.name, 'Unity (Aokana)');
    const list = scenes.read('aokana', dir);
    assert.deepEqual(list.map(s => s.name), ['scene01.bs5']);
    assert.deepEqual(list[0].lines, ['「これは単言語のテストです」', '次の行です。']);
    assert.deepEqual(list[0].speakers, ['春子', '']);
    assert.deepEqual(list[0].voices, ['VOICE_10', null]);
    assert.equal(scenes.ENGINES.aokana.patchLines(list), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
