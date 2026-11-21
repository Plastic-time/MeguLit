// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const S=require('../tools/engine-sigs/draw-sites.cjs'),fixture=require('./fixtures/engine-sigs/nscripter-stack.json');
function pushes(instructions){let bytes=0;
 for(const instruction of instructions){const b=Buffer.from(instruction.hex,'hex');
  if((b[0]>=0x50&&b[0]<=0x57)||b[0]===0x68||b[0]===0x6a)bytes+=4;
  else if(b[0]===0x81&&b[1]===0xec)bytes+=b.readUInt32LE(2);
  else assert.match(instruction.hex,/^(64a1|648925|a1|898424|8b8424|8be9|8d9424|be|8d4424)/,'unexpected stack instruction must be reviewed');
 }return bytes;
}
function simulatedStack(){const memory=new Map(),entry=0x100000,expectedReturn=0x40fea2,args=[0x900000,0x123456,22,24];memory.set(entry,expectedReturn);args.forEach((v,i)=>memory.set(entry+4+i*4,v));
 let sp=entry;
 for(const instruction of fixture.prologue){const b=Buffer.from(instruction.hex,'hex');if((b[0]>=0x50&&b[0]<=0x57)||b[0]===0x68||b[0]===0x6a){sp-=4;memory.set(sp,0x77777777);}else if(b[0]===0x81&&b[1]===0xec)sp-=b.readUInt32LE(2);}
 const steady=sp;for(const instruction of fixture.apiSetup){const b=Buffer.from(instruction.hex,'hex');if(b[0]>=0x50&&b[0]<=0x57||b[0]===0x6a){sp-=4;memory.set(sp,0x88888888);}}
 return {memory,entry,sp,steady,expectedReturn,args,read:frame=>({ret:memory.get(sp+frame),args:Array.from({length:4},(_,i)=>memory.get(sp+frame+4+i*4))})};
}
test('NScripter captured instructions recover the actual return address and four arguments',()=>{
 const stack=simulatedStack(),frame=pushes(fixture.prologue)+pushes(fixture.apiSetup),sig=S.sigs().find(s=>s.id==='nscripter');
 assert.equal(stack.entry-stack.sp,frame,'the independent push simulation agrees with the instruction-derived stack depth');
 assert.equal(sig.frame,frame,'signature must address the original return slot');assert.deepEqual(stack.read(sig.frame),{ret:stack.expectedReturn,args:stack.args});
 const old=stack.read(0xff8);assert.equal(old.ret,stack.args[0],'old frame mistakes input text pointer for return address');assert.equal(old.args[0],stack.args[1]);assert.notDeepEqual(old.args,stack.args);
});
test('NScripter stack evidence is contiguous and matches the real executable bytes when present',()=>{
 const files=require('./fixtures/engine-sigs/draw-sites-files.json').filter(f=>f.id==='nscripter');
 for(const chunk of [fixture.prologue,fixture.apiSetup])for(let i=1;i<chunk.length;i++)assert.equal(+chunk[i].va,+chunk[i-1].va+chunk[i-1].hex.length/2);
 assert.equal(+fixture.apiSetup.at(-1).va+fixture.apiSetup.at(-1).hex.length/2,+fixture.apiCall);
 assert.equal(Buffer.from(fixture.return.hex,'hex').readUInt16LE(1),10*4,'actual ret pops ten routine arguments');
 for(const file of files){if(!fs.existsSync(file.path))continue;const bytes=fs.readFileSync(file.path);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),fixture.sha256);const pe=S.pe(bytes);
  for(const instruction of [...fixture.prologue,...fixture.apiSetup,fixture.return]){const address=+instruction.va,section=pe.secs.find(s=>address>=pe.base+s.rva&&address<pe.base+s.rva+s.raw);assert.ok(section);const off=section.ptr+address-pe.base-section.rva;assert.equal(bytes.subarray(off,off+instruction.hex.length/2).toString('hex'),instruction.hex,file.name+' '+instruction.va);}
 }
});
