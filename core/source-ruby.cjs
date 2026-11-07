'use strict';
function extractSourceRuby(value){
 const raw=String(value||''),cut=raw.indexOf('\x1d'),ruby=[];let text=cut<0?raw:raw.slice(0,cut);
 const add=(base,reading)=>{if(base&&reading&&base.length<=80&&reading.length<=160&&/[ぁ-ヿー]/.test(reading)&&ruby.length<256)ruby.push([base,reading]);return base;};
 if(cut>=0)for(const item of raw.slice(cut+1).split('\x1d')){const pair=item.split('\x1c');if(pair.length===2)add(...pair);}
 text=text.replace(/<ruby\b[^>]*>([^<>]*?)<rt\b[^>]*>([^<>]*?)<\/rt>\s*<\/ruby>/gi,(_,base,reading)=>add(base,reading));
 text=text.replace(/<ruby\s*=\s*["']([^"']+)["']\s*>([^<>]*?)<\/ruby>/gi,(_,reading,base)=>add(base,reading));
 text=text.replace(/[｜|]([^\s《》|｜]+)《([^《》]+)》/g,(_,base,reading)=>add(base,reading));
 return {text,ruby};
}
module.exports={extractSourceRuby};
