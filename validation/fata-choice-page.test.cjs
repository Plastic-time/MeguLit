// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 1.4.22 owner tests, ファタモルガーナの館 (E:\MeguLit-Test-1421\logs):
   - 02:15Z: after 女中「おはようございます、旦那さま……。」 the option box was empty but for its lines (krkr link=0, every glyph hidden).
     The game's own scripts (data_jp.xp3, read only): its [choice] macro (scenario/macro.ks) puts the frame 「選択肢」 on message0
     ([position layer="message0" frame="選択肢" …]) and the options are plain message text with picture buttons on them
     (scenario/scenario.ks *朝の挨拶: [choice] [r]×5 ……おはよう……[r] ………… [button graphic="選択ライン"]…[s]); no [link].
   - 02:25Z (429950e4, the first rule "history off + centred"): the owner saw the opening 「聖なるかな」 mistranslated. That
     screen is no message text at all: 聖なるかな / 聖なるかな2…5 are background pictures ([image storage="聖なるかな" layer="base"]),
     read by the OCR art scan (hook-events: "ocr line 型なるかな" -> translated, then "ocr line refused (a list)"), and the status
     line said choice=0 throughout. Still, text layout alone is no proof of a choice page: the rule is now the frame picture the
     game's diff names (choice.pageFrames, ファタ: ^選択肢$). In all of the game's scripts that frame appears once, in [choice].
   This test runs the script's own decision (native/krkrtext/script.inc st.choicePage / st.uiDraw, TJS -> JS for the forms
   they use) through the real sequence, and the profile / control-file wiring. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),script=fs.readFileSync(path.join(root,'native','krkrtext','script.inc'),'utf8').replace(/\r\n/g,'\n');
function fn(start){const a=script.indexOf(start);assert.ok(a>=0,start);const b=script.indexOf('} incontextof st;',a);return script.slice(a,b+1);}
const js=t=>t.replace(/typeof rs!='Object'/g,"(rs===null||typeof rs!=='object')").replace(/\brs\.count\b/g,'rs.length')
 .replace(/typeof ([\w.]+)=='undefined'/g,'$1===undefined').replace(/typeof ([\w.]+)!='undefined'/g,'$1!==undefined').replace(/!isvalid P/g,'false').replace(/\bvoid\b/g,'undefined');

function rig(frames){
 const st={cfg:{roles:0,embed:0,...(frames?{choiceFrames:frames.map(f=>new RegExp(f))}:{})},screen:()=>[800,600],kag:{historyWriteEnabled:true},link:0,choiceDraws:0,hid:0};
 new Function('st',js(fn('st.choicePage=function(P)'))+';'+js(fn('st.uiDraw=function(ll)'))+';')(st);
 /* the drawText wrapper's decision as script.inc writes it: only '' is hidden */
 const draw=layer=>{const ui=st.uiDraw({parent:layer});if(ui==='link')st.link++;else if(ui==='choice')st.choiceDraws++;const hidden=ui==='';if(hidden)st.hid++;return hidden;};
 return {st,draw};
}
const SEED=JSON.parse(fs.readFileSync(path.join(root,'The Seed','kirikiri','fata-morgana','game.json'),'utf8')).settings.choice.pageFrames;

test('the real sequence: the maid\'s line hidden, the 「選択肢」 page drawn by the game, the next dialogue hidden again',()=>{
 const {st,draw}=rig(SEED),message0={frameGraphic:'meserei0',align:-1,inLink:-1,height:600};
 for(const c of [...'おはようございます、旦那さま……。'])assert.equal(draw(message0),true,'dialogue (frame meserei0) stays hidden');
 /* [choice]: [position layer="message0" frame="選択肢" …] [history output="false"] [style align="center"] */
 message0.frameGraphic='選択肢';message0.align=0;st.kag.historyWriteEnabled=false;
 const rows=[...'……おはよう……'+'…………'].map(()=>draw(message0));
 assert.ok(rows.every(h=>h===false),'the option rows are drawn as the game asks: text and picture buttons stay');
 assert.equal(st.link,0,'no KAG [link] on this page (log: link=0)');assert.equal(st.choiceDraws,rows.length);
 /* *おはよう / choice_start, the chapter's own frame again */
 message0.frameGraphic='meserei0';message0.align=-1;st.kag.historyWriteEnabled=true;
 assert.equal(draw(message0),true);
});

test('text layout alone is no choice page: centred / history-off text in other frames stays hidden and goes to the reader as before',()=>{
 const {draw}=rig(SEED);
 assert.equal(draw({frameGraphic:'meserei0',align:0,inLink:-1,height:600}),true,'centred monologue (@style align=center), history off too');
 assert.equal(draw({frameGraphic:'meserei_4th',align:-1,inLink:-1,height:600}),true,'scenario4 dialogue with [history output=false]');
 assert.equal(draw({frameGraphic:'',align:0,inLink:-1,height:600}),true,'no frame');
 assert.equal(draw({frameGraphic:'meserei0',align:-1,inLink:2,height:600}),false,'KAG [link] text: as before (74680da0)');
});

test('without the game\'s list nothing is a choice page (every other game, 千恋＊万花 included)',()=>{
 const {draw}=rig(null);assert.equal(draw({frameGraphic:'選択肢',align:0,inLink:-1,height:600}),true);
 const {draw:d2}=rig([]);assert.equal(d2({frameGraphic:'選択肢',align:0,inLink:-1,height:600}),true);
});

test('wiring: the key, the seed, the control file, the script',()=>{
 const P=require('../core/profiles/index.cjs'),E=require('../core/engine-draw.cjs');
 assert.deepEqual(P.DEFAULTS?P.get(P.profileFor({}),'choice.pageFrames',null):[],[],'kernel default: off');
 assert.deepEqual(SEED,['^選択肢$']);
 const fata=P.profileFor({exe:'E:/GAL/海市蜃楼之馆/fata_jp.exe',engine:'KiriKiri'}),senren=P.profileFor({exe:'D:/Games/SenrenBanka/SenrenBanka.exe',engine:'KiriKiri'});
 assert.deepEqual(E.settings(fata).choiceFrames,['^選択肢$']);assert.deepEqual(E.settings(senren).choiceFrames,[]);
 assert.equal(E.krkrControlText(E.settings(fata),new Map()),'#cfg roles=0 embed=0 zh=1\r\n#choiceframe ^選択肢$\r\n');
 const t=require('../core/engine-draw.cjs');const ed=new t.EngineDraw({profile:fata,transport:{write(){},stop(){}}});assert.equal(ed.active,true,'the control file is written for ファタ');
 assert.ok(require('node:fs').readFileSync(path.join(root,'core','hook-native.cjs'),'utf8').includes('if(pid&&(cfg.roles||cfg.embed||(cfg.choiceFrames||[]).length))this.ensureEngineDraw(pid)'));
 assert.ok(script.includes("else if(t.indexOf('#choiceframe ')==0) {try {if(typeof c.choiceFrames!='Object') c.choiceFrames=[];c.choiceFrames.add(new RegExp(t.substring(13)));} catch(e) {}}"));
 assert.ok(script.includes("var ui=st.uiDraw(self);if(ui=='link') st.link++;else if(ui=='choice') st.choiceDraws++;")&&script.includes("if(st.hideMsg() && ui=='') {"));
 assert.ok(!/historyWriteEnabled/.test(fn('st.choicePage=function(P)')),'no layout guess left');
});
