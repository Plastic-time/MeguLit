'use strict';
function extractSourceRuby(value,positioned=false){
 const raw=String(value||''),cut=raw.indexOf('\x1d'),ruby=[],inline=[];let text=cut<0?raw:raw.slice(0,cut);
 if(cut<0&&!text.includes('<')&&!text.includes('《'))return {text,ruby};
 const add=(base,reading)=>{if(!base||!reading||base.length>80||reading.length>160||!/[ぁ-ヿー]/.test(reading)||ruby.length>=256)return;
  const pair=[base,reading];ruby.push(pair);return pair;};
 if(cut>=0)for(const item of raw.slice(cut+1).split('\x1d')){const pair=item.split('\x1c');if(pair.length===2)add(...pair);}
 function strip(pattern,readingFirst){
  /* Carry the offsets from earlier markup formats through this replacement pass. */
  const previous=inline.slice().sort((a,b)=>a.at-b.at);let i=0,removed=0;
  const advance=end=>{while(i<previous.length&&previous[i].at<end)previous[i++].at-=removed;};
  text=text.replace(pattern,(markup,a,b,at)=>{
   advance(at);const base=readingFirst?b:a,pair=add(base,readingFirst?a:b);
   if(positioned&&pair)inline.push({pair,at:at-removed});
   removed+=markup.length-base.length;return base;
  });
  advance(Infinity);
 }
 strip(/<ruby\b[^>]*>([^<>]*?)<rt\b[^>]*>([^<>]*?)<\/rt>\s*<\/ruby>/gi,false);
 strip(/<ruby\s*=\s*["']([^"']+)["']\s*>([^<>]*?)<\/ruby>/gi,true);
 strip(/[｜|]([^\s《》|｜]+)《([^《》]+)》/g,false);
 /* HuneX puts the reading before the base in <rよみ>漢字</r>. */
 strip(/<r([^<>]*)>([^<>]*?)<\/r>/g,true);
 if(!inline.length)return {text,ruby};
 /* The occurrence number survives removal of whitespace between words on study pages. */
 const cursors=new Map();
 for(const {pair,at} of inline.sort((a,b)=>a.at-b.at)){
  const base=pair[0];let cursor=cursors.get(base);
  if(!cursor){const first=text.indexOf(base);cursor={at:first,n:0,repeated:first>=0&&text.indexOf(base,first+1)>=0};cursors.set(base,cursor);}
  if(!cursor.repeated)continue;
  while(cursor.at>=0&&cursor.at<at){cursor.at=text.indexOf(base,cursor.at+1);cursor.n++;}
  if(cursor.at===at)pair.push(cursor.n);
 }
 return {text,ruby};
}
module.exports={extractSourceRuby};
