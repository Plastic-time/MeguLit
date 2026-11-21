// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* owner incr9 2026-11-21 (22:54Z): once the KiriKiri TextRender path placed a line hidden at the game's own box (374,707 in 1535x863),
   the glyph lines that follow are only the fallback and send no `visible` note that keeps the reader's Japanese away. */
module.exports=async({assert})=>{
 const {OverlayPlacement}=require('../../../../core/overlay-placement.cjs');
 const sent=[],p=new OverlayPlacement({send:m=>sent.push(m)});p.wanted=()=>true;
 p.configure({hookProfile:'embed'},{bound:true,clientWidth:1535,clientHeight:863,gameProcessId:1});sent.length=0;
 const text='電車を降りて',rects=[...text].map((c,i)=>[374+i*31,707,31,31]);
 p.hook({type:'hookCharRects',engine:'krkr',line:100004,hidden:true,sw:1535,sh:863,viewport:[0,0,1535,863],rects,text});
 assert.deepEqual(sent.shift().rects[0],[374,707,31,31]);
 for(const seq of [7,8,9])p.glyph({seq,text:'「え？　あ、そうでしたね」',dots:[]});
 assert.deepEqual(sent,[]);
};
