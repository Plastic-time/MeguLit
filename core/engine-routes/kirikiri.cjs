// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Route ownership is independent of a sentence's hide proof. Waiting never certifies hidden glyphs. */
function decide(previous,{setting,engine,run,stream,active,hideActive,evidence}){
 if(setting!=='engine'||engine!=='kirikiri')return {keep:false,state:null,phase:'legacy'};
 const validRun=/^[1-9]\d*\|.+$/.test(run||''),sameRun=validRun&&previous?.run===run;
 const page=evidence?.run===run?evidence.page:null,chars=evidence?.run===run?evidence.chars:null;
 const pageSeen=!!(validRun&&page?.text&&Number.isSafeInteger(page.line)&&page.line>0);
 const state={run:validRun?run:'',seenPage:!!(sameRun&&previous.seenPage||pageSeen)};
 if(!active||!validRun)return {keep:false,state,phase:'inactive'};
 const confirmed=!!(hideActive===true&&pageSeen&&stream&&page.stream===stream&&chars?.stream===stream&&chars.line===page.line&&chars.text===page.text&&Number.isFinite(page.at)&&chars.at>=page.at&&chars.hidden===true);
 return {keep:true,state,phase:confirmed?'confirmed':'waiting'};
}
module.exports={decide};
