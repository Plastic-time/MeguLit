// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 1.4.22 owner test, ファタモルガーナの館 (2026-11-21T02:15Z, E:\MeguLit-Test-1421\logs): after 女中「おはようございます、旦那さま……。」 the
   option box was empty but for its lines. The log: krkr `link=0`, `draws=1027 hidden=1027`, the option 「……おはよう………………」 on the
   KiriKiri4 stream and in tTVPNativeBaseBitmap::DrawText, next to 「選択肢」「選択ライン」. The game's own scripts (data_jp.xp3, read
   only) explain it: its [choice] macro (scenario/macro.ks) is
     [position layer="message0" frame="選択肢" …] … [history output="false"] [style align="center"] [delay speed="nowait"]
   and the options are plain message text with picture buttons on them (scenario/scenario.ks *朝の挨拶):
     [choice] [r][r][r][r][r] ……おはよう……[r] ………… [locate …][button graphic="選択ライン" …] … [s]
   so no [link] (inLink stays -1) and every option glyph went through the opacity-0 draw like dialogue. The engine layer
   (native/krkrtext/script.inc st.uiDraw) now knows the choice page: history writing off and the text centred. Dialogue with
   history off is left-aligned in this game (scenario4), centred monologues keep history on: both stay hidden. This test
   runs the script's own functions (TJS -> JS for the forms they use) through that real sequence. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'..','native','krkrtext','script.inc'),'utf8').replace(/\r\n/g,'\n');
function fn(start){const a=script.indexOf(start);assert.ok(a>=0,start);const b=script.indexOf('} incontextof st;',a);return script.slice(a,b+1);}
const js=t=>t.replace(/typeof ([\w.]+)!='undefined'/g,'$1!==undefined').replace(/!isvalid P/g,'false').replace(/\bvoid\b/g,'undefined').replace(/\(sh>0 && P\.height<sh\*0\.2\)/,'(sh>0 && P.height<sh*0.2)');

function rig(){
 const st={cfg:{roles:0,embed:0},screen:()=>[800,600],kag:{historyWriteEnabled:true},link:0,choiceDraws:0,hid:0};
 new Function('st',js(fn('st.choicePage=function(P)')).replace('st.choicePage=function(P)','st.choicePage=function(P)')+';'+js(fn('st.uiDraw=function(ll)'))+';')(st);
 /* the drawText wrapper's decision, as script.inc writes it */
 const draw=(layer,on=true)=>{const ui=st.uiDraw({parent:layer});if(ui==='link')st.link++;else if(ui==='choice')st.choiceDraws++;const hidden=on&&ui==='';if(hidden)st.hid++;return hidden;};
 return {st,draw};
}

test('the real sequence: the maid\'s line hidden, the [choice] page\'s option rows drawn by the game, then dialogue hidden again',()=>{
 const {st,draw}=rig(),message0={align:-1,inLink:-1,height:600};
 /* 女中 「おはようございます、旦那さま……。」: history on, left-aligned */
 for(const c of [...'おはようございます、旦那さま……。'])assert.equal(draw(message0),true,'dialogue stays hidden');
 /* [choice]: [history output="false"] [style align="center"] */
 st.kag.historyWriteEnabled=false;message0.align=0;
 const option=[...'……おはよう……'+'…………'].map(()=>draw(message0));
 assert.ok(option.every(h=>h===false),'the option rows are drawn as the game asks');
 assert.equal(st.link,0,'no KAG [link] on this page (as in the log: link=0)');assert.equal(st.choiceDraws,option.length);
 /* *おはよう: choice_start -> [history output="true"], the next chapter's message layer: dialogue again */
 st.kag.historyWriteEnabled=true;message0.align=-1;
 assert.equal(draw(message0),true);
});

test('what stays hidden: dialogue with history off (left-aligned, scenario4), centred monologues (history on), and name plates without draw.roles',()=>{
 const {st,draw}=rig();
 st.kag.historyWriteEnabled=false;assert.equal(draw({align:-1,inLink:-1,height:120}),true,'scenario4 [history output=false] dialogue');
 st.kag.historyWriteEnabled=true;assert.equal(draw({align:0,inLink:-1,height:120}),true,'@style align=center monologue');
 assert.equal(draw({align:-1,inLink:-1,height:60}),true,'a name plate: only with draw.roles');
 assert.equal(draw({align:-1,inLink:2,height:120}),false,'KAG [link] text: as before (74680da0)');
 st.kag.historyWriteEnabled=undefined;assert.equal(draw({align:0,inLink:-1,height:120}),true,'a KAG without the field: as before');
});

test('wiring: the wrapper counts it, the status line says choice=N, with draw.roles the option rows go out as role=choice items',()=>{
 assert.ok(script.includes("var ui=st.uiDraw(self);if(ui=='link') st.link++;else if(ui=='choice') st.choiceDraws++;"));
 assert.ok(script.includes("if(st.hideMsg() && ui=='') {"),'only dialogue is hidden');
 assert.ok(script.includes("' choice='+(+this.choiceDraws)")&&script.includes("'choiceDraws'=>0"));
 assert.ok(script.includes("if(this.choicePage(L)) {this.linkCh(rec,L,'R'+int(cy),ch,cx,cy,size,sw,sh);return;}"),'roles: one choice item a row');
 /* TextRender games (千恋＊万花) never pass through __megulitDraw: the rule cannot reach them */
 assert.ok(script.indexOf("st.choicePage=function(P)")<script.indexOf("global.__megulitDraw=function(args*)"));
});
