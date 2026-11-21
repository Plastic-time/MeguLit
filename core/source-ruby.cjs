'use strict';
function extractSourceRuby(value,positioned=false,stripTags=false){
 const raw=String(value||''),cut=raw.indexOf('\x1d'),ruby=[],inline=[];let text=cut<0?raw:raw.slice(0,cut);
 if(cut<0&&!text.includes('<')&&!text.includes('《'))return {text,ruby};
 const add=(base,reading,explicit=false)=>{if(!base||!reading||base.length>80||reading.length>160||(!explicit&&!/[ぁ-ヿー]/.test(reading))||ruby.length>=256)return;
  const pair=[base,reading];ruby.push(pair);return pair;};
 if(cut>=0)for(const item of raw.slice(cut+1).split('\x1d')){const pair=item.split('\x1c');if(pair.length===2)add(...pair);}
 function strip(pattern,readingFirst,allowLabel=false){
  /* Carry the offsets from earlier markup formats through this replacement pass. */
  const previous=inline.slice().sort((a,b)=>a.at-b.at);let i=0,removed=0;
  const advance=end=>{while(i<previous.length&&previous[i].at<end)previous[i++].at-=removed;};
  text=text.replace(pattern,(...match)=>{
   const [markup,a,b]=match,at=match.at(-2);advance(at);
   const base=readingFirst===undefined?'':readingFirst?b:a,pair=base&&add(base,readingFirst?a:b,positioned&&allowLabel);
   if(positioned&&pair)inline.push({pair,at:at-removed});
   removed+=markup.length-base.length;return base;
  });
  advance(Infinity);
 }
 strip(/<ruby\b[^>]*>([^<>]*?)<rt\b[^>]*>([^<>]*?)<\/rt>\s*<\/ruby>/gi,false);
 strip(/<ruby\s*=\s*["']([^"']+)["']\s*>([^<>]*?)<\/ruby>/gi,true);
 strip(/[｜|]([^\s《》|｜]+)《([^《》]+)》/g,false);
 /* HuneX puts the reading before the base in <rよみ>漢字</r>. */
 strip(/<r([^<>]*)>([^<>]*?)<\/r>/g,true,true);
 if(stripTags)strip(/<\/?[a-z][^>]*>/gi);
 if(!inline.length)return {text,ruby};
 /* Study pages can remove spaces and newlines. Anchor repeated bases in the whitespace-free line. */
 const compact=text.replace(/\s+/g,''),repeated=new Map();let offset=0,character=0;
 for(const {pair,at} of inline.sort((a,b)=>a.at-b.at)){
  const base=pair[0].replace(/\s+/g,'');
  if(!repeated.has(base)){const first=compact.indexOf(base);repeated.set(base,first>=0&&compact.indexOf(base,first+1)>=0);}
  if(!repeated.get(base)&&base===pair[0])continue;
  while(offset<at){const ch=String.fromCodePoint(text.codePointAt(offset));if(!/\s/.test(ch))character++;offset+=ch.length;}
  pair.push(character);
 }
 return {text,ruby};
}
module.exports={extractSourceRuby};
