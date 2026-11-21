// SPDX-License-Identifier: GPL-3.0-or-later
/* every reference to a text API's IAT slot in a PE file (x86): call = FF 15 slot, load = anything else (mov reg, [slot]: a call through a register). Usage: node tools/engine-sigs/slot-refs.cjs <file> ... */
const S=require('./draw-sites.cjs'),fs=require('fs');
const APIS=['TextOutA','TextOutW','ExtTextOutA','ExtTextOutW','DrawTextA','DrawTextW','GetGlyphOutlineA','GetGlyphOutlineW','DrawTextExW','PolyTextOutW'];
for(const f of process.argv.slice(2)){let p;try{p=S.pe(fs.readFileSync(f));}catch(e){console.log(f.split('/').pop(),'ERR',e.message);continue;}
 const out=[];for(const n of APIS){const sl=p.slots(n);if(!sl.length)continue;let call=0,load=0;for(const s of sl){const le=Buffer.alloc(4);le.writeUInt32LE(s);for(const c of p.code){let k=-1;while((k=c.bytes.indexOf(le,k+1))>=0){if(c.bytes[k-2]===0xff&&c.bytes[k-1]===0x15)call++;else load++;}}}out.push(n+' call'+call+' load'+load);}
 console.log(f.split('/').slice(-2).join('/'),'|',out.join(', ')||'-');}
