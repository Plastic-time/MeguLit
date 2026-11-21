/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const {ENC,OP,objHeader}=require('./majiro.cjs');
const widths={f:2,h:4,o:2,'0':4,i:4,r:4,a:2,j:4,l:2};

/* Static bytecode order cannot prove execution, speaker or choice roles. Keep literals out
   of script-text records and require explicit opt-in until a caller handles that distinction. */
function readRecords(input,{enabled=false}={}){
 const result={enabled:enabled===true,live:false,order:'bytecode',complete:false,messages:[],literals:[],controls:[],error:null};
 if(!result.enabled)return result;
 if(!Buffer.isBuffer(input)){result.error={offset:0,reason:'not-buffer'};return result;}
 const header=objHeader(input);
 if(!header){result.error={offset:0,reason:'invalid-object'};return result;}
 const code=header.code,decoder=new TextDecoder('shift_jis',{fatal:true});let p=0,pending=[];
 const fail=(offset,reason)=>{result.error={offset,reason};return result;};
 const flush=boundary=>{
  if(pending.length){const text=pending.map(x=>x.text).join('').trim();
   if(text)result.messages.push({kind:'script-text',role:'unknown',offset:pending[0].offset,end:boundary,text,fragments:pending.map(x=>x.offset)});
   pending=[];}
 };
 while(p<code.length){
  const start=p;if(p+2>code.length)return fail(start,'truncated-opcode');
  const op=code.readUInt16LE(p);p+=2;const encoding=ENC.get(op);
  if(encoding===undefined)return fail(start,'unknown-opcode');
  const strings=[];
  for(const operand of encoding){
   if(Object.hasOwn(widths,operand)){p+=widths[operand];if(p>code.length)return fail(start,'truncated-operand');continue;}
   if(p+2>code.length)return fail(start,'truncated-length');
   const count=code.readUInt16LE(p);p+=2;
   if(operand==='t'||operand==='c'){p+=count*(operand==='c'?4:1);if(p>code.length)return fail(start,'truncated-table');continue;}
   if(operand!=='s')return fail(start,'unknown-operand');
   if(count<1||p+count>code.length||code[p+count-1]!==0)return fail(start,'invalid-string');
   const bytes=code.subarray(p,p+count-1);if(bytes.includes(0))return fail(start,'embedded-nul');
   try{strings.push(decoder.decode(bytes));}catch{return fail(start,'invalid-cp932');}
   p+=count;
  }
  if(op===OP.TEXT)pending.push({offset:start,text:strings[0]});
  else if(op===OP.PROC)flush(p);
  else if(op===OP.LDSTR)result.literals.push({kind:'literal',role:'unknown',offset:start,end:p,text:strings[0]});
  else if(op===OP.CTRL){
   const value=strings[0];result.controls.push({offset:start,end:p,value});
   if(value==='n'&&pending.length)pending.push({offset:start,text:'\n'});
   else if(/^[pwr]$/.test(value))flush(p);
  }
 }
 flush(p);result.complete=true;return result;
}
module.exports={readRecords};
