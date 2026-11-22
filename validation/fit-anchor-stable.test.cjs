'use strict';
/* Recorded 千恋 geometry. A late translation can shrink or report independent overflow;
   the Japanese stays at its calibrated top. The legacy whole-block caller is retained. */
const test=require('node:test'),assert=require('node:assert/strict');const fit=require('../web/reader/modules/game-fit.js');
const client={top:0,bottom:1080},LIMIT=1080-fit.MARGIN,ROW=87.6,PAD=18.9,CN=46;
/* the reader's loop: measure, plan, apply (only tightening within the sentence), until stable */
function place(anchor,rows,cnRows){let f=1,shift=0,room=0;
 for(let i=0;i<10;i++){const jp={top:anchor,bottom:anchor+PAD+rows*ROW},win={top:anchor,bottom:jp.bottom+cnRows*CN*f};const p=fit.plan(win,client,f,jp);
  const nf=Math.min(f,p.fit),ns=Math.min(shift,p.shift),nr=Math.max(room,p.room);if(nf===f&&ns===shift&&nr===room)break;f=nf;shift=ns;room=nr;}
 const jpBottom=anchor+PAD+rows*ROW+shift;return {textTop:anchor+shift,fit:f,room,bottom:jpBottom+cnRows*CN*f-room};}
const SEQ=[[1,1],[2,1],[1,1],[3,2],[2,1],[1,1],[1,1],[2,2],[3,1],[1,1],[2,1],[2,1],[1,1],[3,2],[1,1],[2,1],[1,1],[1,1],[2,1],[3,2]];
const fitsAtMin=(anchor,j,c)=>anchor+PAD+j*ROW+c*CN*fit.MIN<=LIMIT;
test('box at 70 %: the first row stays on its anchor wherever the sentence can fit, full size wherever it fits as is',()=>{
 const r=SEQ.map(([j,c])=>place(756,j,c));
 for(const [i,[j,c]] of SEQ.entries()){assert.ok(r[i].bottom<=LIMIT+.5,'fully visible '+i);if(fitsAtMin(756,j,c))assert.equal(r[i].textTop,756,'anchor '+i);if(756+PAD+j*ROW+c*CN<=LIMIT)assert.equal(r[i].fit,1,'full size '+i);}
 assert.ok(r.filter(x=>x.textTop===756).length>=17,JSON.stringify(r.map(x=>x.textTop)));
});
test('box at 82 %: the translation is smaller only for sentences that do not fit, the next one is back to full size',()=>{
 const r=SEQ.map(([j,c])=>place(852,j,c));
 for(const [i,x] of r.entries()){assert.ok(x.bottom<=LIMIT+.5,'translation overflow accounted for '+i+': '+JSON.stringify(x));assert.equal(x.textTop,852,'Japanese never moves for translation '+i);}
 for(const [i,[j,c]] of SEQ.entries())if(j<=2&&c<=1)assert.equal(r[i].textTop,852,'one and two rows with a one-row translation keep the anchor: '+i);
 assert.ok(r.some(x=>x.fit<1)&&r.some(x=>x.fit===1),'smaller only where it does not fit');
 for(let i=1;i<r.length;i++)if(r[i-1].fit<1&&SEQ[i][0]===1)assert.equal(r[i].fit,1,'the next short sentence is back to full size');
});
test('box at 82 %, long translation leaves Japanese on its anchor and reports overflow for the translation alone',()=>{
 const long=place(852,3,3);assert.ok(Math.abs(long.bottom-LIMIT)<=1,JSON.stringify(long));assert.equal(long.fit,fit.MIN);assert.equal(long.textTop,852);assert.ok(long.room>0);
 assert.equal(place(852,1,1).textTop,852);
});
test('within one sentence the plan only tightens: a translation arriving in parts never flips the size back',()=>{
 let f=1,shift=0;const steps=[];for(const cnRows of [1,2,3,2,3]){const jp={top:852,bottom:852+PAD+2*ROW},win={top:852,bottom:jp.bottom+cnRows*CN*f};const p=fit.plan(win,client,f,jp);f=Math.min(f,p.fit);shift=Math.min(shift,p.shift);steps.push(f);}
 for(let i=1;i<steps.length;i++)assert.ok(steps[i]<=steps[i-1]);
});
test('without the Japanese extent the old rule still applies (callers that pass only the block)',()=>{
 assert.deepStrictEqual(fit.plan({top:700,bottom:1100},client,fit.MIN),{fit:fit.MIN,shift:-24,room:0});
});
