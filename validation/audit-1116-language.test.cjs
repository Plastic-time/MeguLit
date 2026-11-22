// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 audit of 416b2c63 / b0bfa5dc (the hide gate's text language). The user's 千恋＊万花 folder holds ds.ini of a Steam
   emulator (AppId, AccountId, Language=schinese) while the game text is Japanese: every *.ini was scanned for a Chinese
   Language and all hiding was off from the first line. A multilingual build (千恋＊万花 Steam) also has a Chinese interface over
   Japanese text. Now no ini decides anything: the library ("zh!" known Chinese build, "zh" inferred, "ja") and the lines the
   dialogue stream gives do. A Japanese line makes the text Japanese at once unless the library knows the build is Chinese (a
   partial patch's untranslated line); two Chinese lines in a row make it Chinese. HookBridge --self-test (LanguageSelfTest)
   runs the native rules; this checks the wiring and replays the rules on the user's kind of lines. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const target = fs.readFileSync(path.join(__dirname, '../native/HookTarget.cs'), 'utf8');
const bridge = fs.readFileSync(path.join(__dirname, '../native/HookBridge.cs'), 'utf8');
const native = fs.readFileSync(path.join(__dirname, '../core/hook-native.cjs'), 'utf8');
const reader = fs.readFileSync(path.join(__dirname, '../services/reader.cjs'), 'utf8');

test('no ini decides the text language', () => {
  assert.doesNotMatch(target, /ReadChineseText|Directory\.GetFiles\(dir,"\*\.ini"\)/);
  assert.match(target, /ExePath=path\.ToString\(\);\s*ChineseText=false;SetSourceLanguage\(Environment\.GetEnvironmentVariable\("MEGULIT_SOURCE_LANGUAGE"\)\);/);
  assert.match(bridge, /if\(!HookTarget\.LanguageSelfTest\(\)\)\{Console\.Error\.WriteLine\("FAIL text language hide policy"\);return 3;\}/);
  assert.match(bridge, /\{bool wasZh=HookTarget\.ChineseText;HookTarget\.ObserveLanguage\(text\);if\(HookTarget\.ChineseText!=wasZh\)\{MarkAllEmbedDirty\(\);ScheduleEmbedSync\(\);\}\}ReceivedText=true;/, 'every selected source line is observed, and a language change reconciles the streams it hides');
});

test('the stream decides: one Japanese line, or two Chinese lines in a row', () => {
  const jp = /public static bool JapaneseLine\(string text\)\{return \(text\?\?""\)\.Length>=8&&System\.Text\.RegularExpressions\.Regex\.Matches\(text\?\?"","(\[[^"]+\])"\)\.Count>=2&&System\.Text\.RegularExpressions\.Regex\.IsMatch\(text\?\?"","(\[[^"]+\])"\);\}/.exec(target);
  const cn = /public static bool ChineseLine\(string text\)\{string t=text\?\?"";return !System\.Text\.RegularExpressions\.Regex\.IsMatch\(t,"(\[[^"]+\])"\)&&System\.Text\.RegularExpressions\.Regex\.Matches\(t,"(\[[^"]+\])"\)\.Count>=6&&System\.Text\.RegularExpressions\.Regex\.IsMatch\(t,"(\[[^"]+\])"\);\}/.exec(target);
  assert.ok(jp && cn, 'rules found');
  const japanese = t => t.length >= 8 && (t.match(new RegExp(jp[1], 'g')) || []).length >= 2 && new RegExp(jp[2]).test(t);
  const chinese = t => !new RegExp(cn[1]).test(t) && (t.match(new RegExp(cn[2], 'g')) || []).length >= 6 && new RegExp(cn[3]).test(t);
  assert.match(target, /public static void ObserveLanguage\(string text\)\{if\(ChineseKnown\)return;if\(JapaneseLine\(text\)\)\{ChineseRun=0;ChineseText=false;return;\}if\(ChineseLine\(text\)\)\{if\(\+\+ChineseRun>=2\)ChineseText=true;\}else ChineseRun=0;\}/);
  const run = (lines, known = false, start = false) => { let zh = start, n = 0; for (const t of lines) { if (known) continue; if (japanese(t)) { n = 0; zh = false; continue; } if (chinese(t)) { if (++n >= 2) zh = true; } else n = 0; } return zh; };
  /* 千恋＊万花 Steam: Chinese interface, Japanese text: never Chinese */
  assert.equal(run(['「おはようございます、将臣さん」', '穂織の町は今日も賑やかだった。', '三日後、穂織駅前。']), false);
  /* a Chinese build: Chinese after two lines */
  assert.equal(run(['早上好，将臣先生，我们走吧。']), false, 'one line is not enough');
  assert.equal(run(['早上好，将臣先生，我们走吧。', '穗织的街道今天也很热闹呢。']), true);
  /* a kana-less Japanese line between Chinese ones resets the run */
  assert.equal(run(['我们走吧，别说了。', '三日後、東京駅前広場。', '你说什么呢，没关系的吧。']), false);
  /* the library knows the build is Chinese: a Japanese line changes nothing */
  assert.equal(run(['これは日本語の台詞です。'], true, true), true);
});

test('a Chinese build the library knows stays Chinese', () => {
  assert.match(reader, /hooks\.setSourceLanguage\?\.\(lib\.contentLanguage==='zh'\?'zh!':/);
  assert.match(native, /const language=value==='zh'\|\|value==='zh!'\|\|value==='ja'\?value:'';/);
  assert.match(bridge, /if\(lang=="zh"\|\|lang=="zh!"\|\|lang=="ja"\)\{HookTarget\.SetSourceLanguage\(lang\);/);
  assert.match(target, /public static void ConfirmJapanese\(string text\)\{if\(ChineseText&&!ChineseKnown&&JapaneseLine\(text\)\)ChineseText=false;\}/);
});
