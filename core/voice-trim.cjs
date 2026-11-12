'use strict';
// SPDX-License-Identifier: GPL-3.0-or-later
// E454 (player, 2026-11-12: "anki 上的语音有时候加上 bgm 老长了"): a clip recorded from the game's sound runs from the
// line's start to the next line, so it carried seconds of music after the voice. Keep only the first spoken run: 20 ms
// frames of the high-passed signal, speech where a frame is well above the quiet floor, runs joined across short pauses,
// and the clip cut where a long pause follows or the line's text could no longer still be spoken.
function parse(buf){
 if(!Buffer.isBuffer(buf)||buf.length<44||buf.toString('ascii',0,4)!=='RIFF'||buf.toString('ascii',8,12)!=='WAVE')return null;
 let at=12,fmt=null,data=null;
 while(at+8<=buf.length){const id=buf.toString('ascii',at,at+4),size=buf.readUInt32LE(at+4),body=at+8;
  if(id==='fmt ')fmt={format:buf.readUInt16LE(body),channels:buf.readUInt16LE(body+2),rate:buf.readUInt32LE(body+4),bits:buf.readUInt16LE(body+14)};
  else if(id==='data'){data={start:body,length:Math.min(size,buf.length-body)};break;}
  at=body+size+(size&1);}
 if(!fmt||!data||fmt.format!==1||fmt.bits!==16||fmt.channels!==1)return null;
 return {rate:fmt.rate,samples:new Int16Array(buf.buffer.slice(buf.byteOffset+data.start,buf.byteOffset+data.start+(data.length&~1)))};
}
function wav(samples,rate){const bytes=samples.length*2,out=Buffer.alloc(44+bytes);out.write('RIFF',0,'ascii');out.writeUInt32LE(36+bytes,4);out.write('WAVEfmt ',8,'ascii');
 out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
 out.write('data',36,'ascii');out.writeUInt32LE(bytes,40);for(let i=0;i<samples.length;i++)out.writeInt16LE(samples[i],44+i*2);return out;}
// Longest a line can take to say: about 0.17 s a character plus room for breaths, never under 2 s or over 20 s.
function spokenLimit(text){const n=[...String(text||'').replace(/[\s「」『』（）()…―ー・、。！？!?,.]/g,'')].length;return Math.min(20,Math.max(2,1.2+n*0.17)*1.35);}
function trimWav(input,text,{gap=0.6}={}){
 const buf=Buffer.isBuffer(input)?input:Buffer.from(String(input||''),'base64');const p=parse(buf);if(!p)return null;
 const {rate,samples}=p,frame=Math.max(1,Math.round(rate/50)),n=Math.floor(samples.length/frame);if(n<8)return null;
 const db=new Float64Array(n);for(let f=0;f<n;f++){let sum=0;for(let i=f*frame+1;i<(f+1)*frame;i++){const d=samples[i]-samples[i-1];sum+=d*d;}db[f]=10*Math.log10(sum/frame+1);}
 const floor=[...db].sort((a,b)=>a-b)[Math.floor(n/5)],loud=f=>db[f]>floor+12;
 let first=-1;for(let f=0;f<n;f++)if(loud(f)){first=f;break;}if(first<0)return null;
 const maxGap=Math.round(gap*50),limit=first+Math.round(spokenLimit(text)*50);let last=first,quiet=0;
 for(let f=first+1;f<n&&f<=limit;f++){if(loud(f)){last=f;quiet=0;}else if(++quiet>maxGap)break;}
 const a=Math.max(0,(first-8)*frame),b=Math.min(samples.length,(last+15)*frame),out=samples.slice(a,b),fade=Math.min(out.length,Math.round(rate*0.04));
 for(let i=0;i<fade;i++)out[out.length-1-i]=Math.round(out[out.length-1-i]*i/fade);
 return {data:wav(out,rate),seconds:out.length/rate,cut:(samples.length-out.length)/rate};
}
module.exports={trimWav,spokenLimit,parse,wav};
