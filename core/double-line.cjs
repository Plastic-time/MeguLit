// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E408 (群友: 纯白交响曲 / マガルミナ showed short lines twice in one go, 「うん。うん。」): an engine that redraws a line (shadow
   layer, voice end, repaint) can hand the hook one string holding the line twice. The C# side only collapses quoted lines
   or 3+ copies, so two plain copies passed, and short lines are the ones drawn fast enough to merge. A line a script really
   says twice arrives as two callbacks (two frames), so one frame that is exactly X+X is collapsed only with evidence from
   the same stream and time, never on the text alone:
    - X is the line shown just before (a redraw of it),
    - the same stream sent X alone in the last 3 s,
    - the same stream already sent a doubled frame in its last 8 frames (it draws twice).
   Kept: 「はい。はい。」 the first time from a stream that never doubled. */
const plain=s=>String(s||'').replace(/\s+/g,'');
class DoubleLine{
 constructor(now=()=>Date.now()){this.now=now;this.streams=new Map();}
 state(stream){const key=String(stream||'');let s=this.streams.get(key);if(!s){s={singles:[],frames:[]};this.streams.set(key,s);if(this.streams.size>64)this.streams.delete(this.streams.keys().next().value);}return s;}
 /* returns {text, collapsed, reason} */
 fix(stream,text,previous=''){
  const now=this.now(),s=this.state(stream),p=plain(text);s.singles=s.singles.filter(x=>now-x.at<3000);
  let unit='';if(p.length>=4&&p.length%2===0&&p.slice(0,p.length/2)===p.slice(p.length/2))unit=p.slice(0,p.length/2);
  s.frames.push(!!unit);if(s.frames.length>8)s.frames.shift();
  if(!unit){s.singles.push({key:p,at:now});if(s.singles.length>20)s.singles.shift();return {text,collapsed:false,reason:''};}
  const reason=plain(previous)===unit?'redraw of previous line':s.singles.some(x=>x.key===unit)?'stream sent it alone just before':s.frames.slice(0,-1).some(Boolean)?'stream draws lines twice':'';
  if(!reason)return {text,collapsed:false,reason:''};
  /* keep the first copy as drawn (its own line breaks) */let cut=text.length;for(let i=1,seen='';i<=text.length;i++){seen=plain(text.slice(0,i));if(seen===unit){cut=i;break;}}
  return {text:text.slice(0,cut).trim(),collapsed:true,reason};
 }
}
module.exports={DoubleLine};
