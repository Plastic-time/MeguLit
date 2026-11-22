// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Live 素晴らしき日々 (BGI, 2026-11-19 integration): the selected EmbedBGI stream sent the label 「屋上と」 and the bridge
   switched the stream's embed off (416b2c63). Only the GDI probe is ever switched back on, so every later line went back
   unchanged: the game's text stayed under the reader (glyph hide placed=0 hidden=0, no more "guarded replace").
   A writable stream decides per line in OnEmbed and keeps its embed; only a probe stream is switched off.
   The short all-hiragana piece 「たばこと」 was a label to Hide (left on screen) but a line to the reader: drawn twice.
   Replay of the diagnostic order from that run: replace x7, passthrough たばこと, label 屋上と, then silence. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const bridge=fs.readFileSync(path.join(__dirname,'../native/HookBridge.cs'),'utf8');
const policy=fs.readFileSync(path.join(__dirname,'../native/EmbedTextPolicy.cs'),'utf8');

test('a label on the selected stream switches the embed off only for a probe stream',()=>{
 const label=/if\(selected&&EmbedTextPolicy\.Label\(text\)&&!SpokenPiece\(text\)\)\{([\s\S]*?)Diagnostic\("label not shown/.exec(bridge);
 assert.ok(label,'label branch');
 assert.match(label[1],/probeOnly=LabelStopsEmbed\(lc\)/);
 assert.match(label[1],/if\(probeOnly\)\{MarkEmbedDirty\(tp\.Key\(\)\);FlushEmbedSync\(\);\}/);
 assert.doesNotMatch(label[1].replace(/if\(probeOnly\)\{MarkEmbedDirty\(tp\.Key\(\)\);FlushEmbedSync\(\);\}/,''),/MarkEmbedDirty\(|_?Luna_UseEmbed\(/,'no unconditional embed off');
 const rule=/static bool LabelStopsEmbed\(Candidate c\)\{return (.*?);\}/.exec(bridge)[1];
 const stops=c=>Function('c','return '+rule)(c);
 assert.equal(stops({embed:true}),false,'writable EmbedBGI keeps its embed');
 assert.equal(stops({embed:true,gdiProbe:true}),true);
 assert.equal(stops({embed:true,hideOnly:true}),true);
 assert.equal(stops({embed:false}),true);
 assert.equal(stops(null),true);
 assert.match(bridge,/if\(!LabelEmbedSelfTest\(\)\)\{Console\.Error\.WriteLine/,'native self-test wired');
});

test('the reader and the hide use one rule for short pieces: all-hiragana, or inside an open quotation',()=>{
 const spoken=new RegExp(/ShortSpoken\(string value\) \{ return Regex\.IsMatch\(\(value \?\? ""\)\.Trim\(\), "(.*?)"\); \}/.exec(policy)[1]);
 for(const t of ['たばこと','なるほど','ふぅ'])assert.ok(spoken.test(t),t);
 for(const t of ['屋上と','ロード','最初から','選択ライン'])assert.ok(!spoken.test(t),t);
 assert.match(bridge,/static bool SpokenPiece\(string text\)\{return EmbedTextPolicy\.ShortSpoken\(text\)\|\|\(QuoteOpen&&EmbedTextPolicy\.QuotedPiece\(text\)\);\}/);
 assert.match(bridge,/if\(replacement\.Length==0&&!printer&&!veil&&!\(MarksMode&&MarksLive\(\)\)&&SpokenPiece\(text\)\)replacement=EmbedTextPolicy\.HideSpoken\(text\);/);
 assert.match(bridge,/label not shown "\+name\+" "\+Json\.Serialize\(text\)\);return;\}if\(selected\)QuoteOpen=QuoteState\(text,QuoteOpen\);\}/,'quote state follows the selected stream after the label decision');
 assert.ok(!bridge.includes('Regex.IsMatch(text.Trim(),"^[ぁ-ゖー～っ]+$")'),'the reader side uses the shared rule');
 /* replay of the live order: 「やっぱり……いい女には、 opens, たばこと and 屋上と are speech, the closing line ends it; a later 屋上と is a label again */
 const state=Function('text','open','const t=text||"";const o=Math.max(t.lastIndexOf("「"),t.lastIndexOf("『")),c=Math.max(t.lastIndexOf("」"),t.lastIndexOf("』"));return o<0&&c<0?open:o>c;');
 assert.match(bridge,/static bool QuoteState\(string text,bool open\)\{string t=text\?\?"";int o=t\.LastIndexOfAny\(new\[\]\{'「','『'\}\),c=t\.LastIndexOfAny\(new\[\]\{'」','』'\}\);return o<0&&c<0\?open:o>c;\}/);
 let open=false;const seen=[];
 for(const t of ['　たばこを吸う。','「やっぱり……いい女には、','たばこと','屋上と','ヒラヒラ服だわね……」','屋上と']){seen.push(open);open=state(t,open);}
 assert.deepEqual(seen,[false,false,true,true,true,false]);
});

test('a part that opens with a control mark stays with the part before it in a source batch (BGI \x05, live 素晴らしき日々)',()=>{
 /* 「そこに覆い被さる……重く真っ青な空は、」 and 「\x05いつでも当たり前の姿を…」 are one message; with the embed answering each
    part, LunaHost flushed both as one string and the batch kept only the newest, so the first half never reached the reader */
 const frames=fs.readFileSync(path.join(__dirname,'../native/HookSourceFrames.cs'),'utf8');
 assert.match(frames,/static bool Continues\(string s\)\{return !String\.IsNullOrEmpty\(s\)&&s\[0\]<' '&&!Char\.IsWhiteSpace\(s\[0\]\);\}/);
 assert.match(frames,/int first=end;while\(first>i&&Continues\(Lines\[first\]\)\)first--;if\(first<end\)return String\.Concat\(Lines\.GetRange\(first,end-first\+1\)\);/);
 assert.match(frames,/&&ContinueTest\(\)&&RepeatTest\(\)/,'native self-test wired');
 assert.match(frames,/for\(int k=parts\.Count-1;k>0;k--\)if\(Continues\(parts\[k\]\)\)\{parts\[k-1\]\+=parts\[k\];parts\.RemoveAt\(k\);\}if\(parts\.Count<2\)return null;/,'one message is one page, not two clicks (E542 page parts)');
 assert.match(fs.readFileSync(path.join(__dirname,'../core/hook-native.cjs'),'utf8'),/replace\(\/\\x05\/g,\/\^BGI/,'the reader turns the BGI mark into a line break');
});
