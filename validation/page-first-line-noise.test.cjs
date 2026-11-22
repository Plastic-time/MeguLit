// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 22:18 (user, 沙耶の唄 Steam, v1.4.17, whole-page text box): "换页后的第一句偶发不替换": the game's line stayed in the first
   row of the page and MeguLit drew the same line under it. E:\MeguLit\logs, 13:18:51Z:
     hook-events       script noise line kept "『ナニﾖｸC。凬5ﾕーとシタコトナﾁw蚪"   source chars=36 sequence=76   (the reader takes and draws it)
     hook-diagnostics  gpu page ToMe_PAGE ... awake=1 armed=0 gh=41 own=2 ownr=96,95,32;128,95,32  ... own=36   (the game draws it, nothing armed)
   Not the page turn: the turns at 13:19:22 and 13:19:28 had ordinary first lines, armed=1, hidden. The line is one the game writes as
   noise on purpose; the front end counted it as the script's text, the bridge did not and stood its layers down for it. And a page
   the layer does not hide left the reader's Japanese on screen, because the rule that hides it needed a class the same step removed. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('bridge: on a proven stream a line of dialogue length with kana is hidden whatever else is in it; labels are not', () => {
  const hb = read('native/HookBridge.cs');
  assert.ok(hb.includes('static bool ProvenStreamLine(string text){return SelectedReadableRun>=2&&DialogueLike(text);}'));
  assert.ok(hb.includes('||ProvenStreamLine(text));}}')&&hb.includes('lock(Gate){return Selected!=""&&DialogueHideReady.Contains(Selected)&&('), 'only a stream that was hidden before');
  assert.ok(hb.includes('string noise="『ナニﾖｸC。凬5ﾕーとシタコトナﾁw蚪/1ノガソンwP1麓ﾃ思議？』";SelectedReadableRun=2;if(!HideDialogueLine(noise)||HideDialogueLine("ロード")||HideDialogueLine("最初から")||HideDialogueLine("bgm01.ogg"))return false;'), 'self-test with the recorded line');
  /* the same measure the front end uses for "the stream speaks Japanese": kana in the line; here at least eight kana or kanji */
  const dialogueLike = t => t.length <= 600 && /[\u3040-\u30ff]/.test(t) && (t.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length >= 8;
  assert.ok(hb.includes('static bool DialogueLike(string text){return text!=null&&text.Length<=600&&System.Text.RegularExpressions.Regex.IsMatch(text,"[぀-ヿ]")&&System.Text.RegularExpressions.Regex.Matches(text,"[぀-ヿ一-鿿]").Count>=8;}'));
  assert.equal(dialogueLike('『ナニﾖｸC。凬5ﾕーとシタコトナﾁw蚪/1ノガソンwP1麓ﾃ思議？』'), true);
  assert.equal(dialogueLike('『二十Aﾅ像ナッテ初y(VQｳッテノハ、今日日ソウソウイ梁fA繙ャナイカナ？』'), true, 'the other recorded noise line (13:19:04, which was hidden)');
  for (const label of ['ロード', '最初から', 'bgm01.ogg', 'SAVE', 'Q.LOAD']) assert.equal(dialogueLike(label), false, label);
});
test('reader: a page the layer does not hide keeps the reader\'s Japanese out, and that ends with the page', () => {
  const js = read('web/reader/modules/text-place.js');
  assert.ok(js.includes("function briefSync(lineBrief) { const brief = lineBrief === true || pageOwn; if (document.body.classList.contains('megulit-game-line-brief') !== brief) document.body.classList.toggle('megulit-game-line-brief', brief); }"), 'one switch for the line model and the page model');
  assert.ok(js.includes('pageOwn = own === true && anchorMode === true; briefSync(false); if (own && sentence) underGameLine(win, sentence); return; }')&&js.includes('if (pageOwn) { pageOwn = false; briefSync(false); }'), 'set in the not-hidden branch, cleared as soon as the page is live again');
  assert.ok(js.includes("const own = on && page.awake;"), 'only an awake page: a layer that never woke (E610) does not hide the reader');
  assert.ok(js.includes("'body.megulit-place-game-drawn.megulit-game-line-brief .sentence-window.tomoyo-hook-reader .sentence-text:not(.megulit-old-line){visibility:hidden!important}',"), 'needs no megulit-placed');
  assert.ok(js.includes("'body.megulit-place-game-drawn .sentence-window.tomoyo-hook-reader .tomoyo-cn-row{visibility:visible!important}',"), 'the translation stays');
  const pageHandler = js.slice(js.indexOf('b.textPlacePage ='), js.indexOf('b.textPlaceMode ='));
  assert.match(pageHandler, /if \(m\?\.elsewhere === true \|\| !Array\.isArray\(m\?\.lines\)\)\s*\{\s*if \(pageOwn\) \{ pageOwn = false; briefSync\(false\); \}/, 'discarding a page clears its ownership');
  assert.ok(js.slice(js.indexOf('b.textPlaceMode =')).includes("if (!on) { document.body.classList.remove('megulit-place-gone'); if (pageOwn) { pageOwn = false; briefSync(false); } line = null;"), 'turning placement off clears page ownership and the current line');
});
