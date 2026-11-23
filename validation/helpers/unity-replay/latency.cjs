'use strict';
/* #468 time from the game's setter call to the reader line that holds its text (replay clock). Returns per piece {text, ms|null}. */
const fs=require('fs'),{replay}=require('../hook-replay.cjs');
const flat=s=>String(s||'').replace(/[\s　]+/g,'');
function latency(file,name){
 const rows=fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).map(l=>JSON.parse(l)).filter(r=>r.m.type==='hookSource');
 const r=replay(file,{name});const lines=[];for(let i=0;i<r.events.length;i++){const e=r.events[i];if(e&&typeof e.hookSource==='string'&&e.hookSource)lines.push({t:r.times[i],k:flat(e.hookSource)});}
 const out=[],seen=new Set();
 for(const row of rows){const parts=String(row.m.text).split('\n').map(flat).filter(Boolean);if(parts.length!==1)continue;/* one piece per call; whole-page redraws are not new text */
  const k=parts[0];if(seen.has(k))continue;seen.add(k);const hit=lines.find(l=>l.t>=row.t&&l.k.includes(k));out.push({text:k,ms:hit?hit.t-row.t:null});}
 return out;
}
module.exports={latency};
if(require.main===module){const o=latency(process.argv[2],process.argv[3]||'game.exe');const got=o.filter(x=>x.ms!=null).map(x=>x.ms).sort((a,b)=>a-b);
 console.log(JSON.stringify({pieces:o.length,lost:o.length-got.length,avg:Math.round(got.reduce((a,b)=>a+b,0)/(got.length||1)),p50:got[got.length>>1],max:got[got.length-1],lostText:o.filter(x=>x.ms==null).map(x=>x.text)}));}
