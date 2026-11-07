// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Repeated-output streams, for every engine (E215, 2026-11-06). Some hooked streams deliver each displayed line several
// times in one callback block: サノバウィッチ's EmbedKrkrZ sends the Japanese line ×4 (twice with the game's line breaks,
// twice without), then the bundled Chinese ×2 and traditional Chinese ×2; other engines double every character. Instead
// of a per-game rule, each stream's repetition is learned from its recent lines and only a consistent factor is undone:
//  - a block is split into runs of consecutive identical units (compared without line breaks);
//  - a stream whose last lines (at least 3 of 5) all repeated their units by the same factor f is a repeating stream, and
//    every run there is divided by f, so a line the script itself repeats (「そうだ」「そうだ」 → 8 copies) keeps its 2;
//  - per-character doubling is learned the same way;
//  - when a block holds Japanese units, units without kana that follow them (other language tracks) are dropped.
// A stream that does not repeat consistently is passed through unchanged; nothing is removed on string equality alone.
const KANA=/[ぁ-ゟァ-ヺー]/u,HAN=/[㐀-鿿]/u;
function norm(s){return s.replace(/[\r\n]+/g,'');}
// Runs of consecutive equal units. Returns [{raw, count}] covering the whole text; non-repeating text is one run.
function runs(text){
 const N=[],map=[];for(let i=0;i<text.length;i++){if(text[i]!=='\n'&&text[i]!=='\r'){N.push(text[i]);map.push(i);}}
 const n=N.length,out=[];let i=0,plain=0;
 const flush=end=>{if(end>plain)out.push({raw:text.slice(map[plain],end<n?map[end]:text.length),count:1});};
 while(i<n){let best=0;
  for(let p=2;p<=(n-i)>>1&&!best;p++){let ok=true;for(let k=0;k<p;k++)if(N[i+k]!==N[i+p+k]){ok=false;break;}if(ok)best=p;}
  if(!best){i++;continue;}
  let count=2;while(i+(count+1)*best<=n){let same=true;for(let k=0;k<best;k++)if(N[i+k]!==N[i+count*best+k]){same=false;break;}if(!same)break;count++;}
  flush(i);out.push({raw:text.slice(map[i],i+best<n?map[i+best]:text.length),count});i+=count*best;plain=i;}
 flush(n);
 // Keep the copy that carries the game's own line breaks when the copies differ only in breaks.
 return out.map(r=>({raw:r.raw,count:r.count}));
}
function charFactor(text){const s=norm(text);if(s.length<4)return 1;for(const f of [2,3]){if(s.length%f)continue;let ok=true;for(let i=0;i<s.length&&ok;i+=f)for(let k=1;k<f;k++)if(s[i+k]!==s[i]){ok=false;break;}if(ok)return f;}return 1;}
class RepeatNormalizer{
 constructor({window=5,need=3}={}){this.streams=new Map();this.window=window;this.need=need;}
 // Learned factor for a stream: the run factor (or per-character factor) seen in at least `need` of its last lines.
 factor(history,key){const counts=new Map();for(const h of history){const v=h[key];if(v>1)counts.set(v,(counts.get(v)||0)+1);}
  let best=1,seen=0;for(const [v,c] of counts)if(c>seen){best=v;seen=c;}return seen>=this.need?best:1;}
 normalize(stream,text){
  if(typeof text!=='string'||!text)return text;const key=String(stream||'');let st=this.streams.get(key);if(!st){st=[];this.streams.set(key,st);if(this.streams.size>64)this.streams.delete(this.streams.keys().next().value);}
  const list=runs(text),japanese=list.some(r=>KANA.test(r.raw));
  // The repetition evidence of this block: the smallest repeat count among its Japanese (or all) runs.
  const repeated=list.filter(r=>r.count>1&&(!japanese||KANA.test(r.raw)));const runFactor=repeated.length?Math.min(...repeated.map(r=>r.count)):1;
  const cf=charFactor(text);st.push({run:runFactor,char:cf});if(st.length>this.window)st.shift();
  // One block is evidence enough when a long unit (10+ characters) repeats 3+ times in a row, or a whole 12+ character
  // line has every character doubled: scripts do not do that, so the stream's first lines are not shown repeated.
  const strong=repeated.filter(r=>norm(r.raw).length>=10&&r.count>=3).map(r=>r.count);
  const f=Math.max(this.factor(st,'run'),strong.length?Math.min(...strong):1),c=Math.max(this.factor(st,'char'),cf>1&&norm(text).length>=12?cf:1);
  if(c>1&&cf===c){let out='';const s=text;for(let i=0;i<s.length;){out+=s[i];let j=i+1;while(j<s.length&&j-i<c&&s[j]===s[i])j++;i=j;}return out;}
  if(f<=1)return text;
  let seenJapanese=false;const parts=[];
  for(const r of list){const isJp=KANA.test(r.raw);
   // Other language tracks follow the Japanese line in multilingual builds: drop kana-less Han units after it.
   if(japanese&&seenJapanese&&!isJp&&HAN.test(r.raw)&&r.count>1)continue;if(isJp)seenJapanese=true;
   const copies=Math.max(1,Math.round(r.count/f));for(let k=0;k<copies;k++)parts.push(r.raw);}
  return parts.join('');
 }
}
module.exports={RepeatNormalizer,runs,charFactor};
