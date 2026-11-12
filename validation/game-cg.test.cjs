process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 card back CGs (services/game-cg, services/cg-decoders): each engine's save and image formats on small
   synthetic files, plus whole fake game folders read the way the detail card does. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const dec=require('../services/cg-decoders.cjs'),cg=require('../services/game-cg.cjs');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'megulit-cg-'));
const u32=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0);return b;},u16=n=>{const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;};
/* literal-only Siglus LZSS: every flag byte 0xFF */
function siglusPack(raw){const parts=[];for(let i=0;i<raw.length;i+=8){const c=raw.subarray(i,i+8);parts.push(Buffer.from([0xff]),c);}const body=Buffer.concat(parts);return Buffer.concat([u32(body.length+8),u32(raw.length),body]);}
const xorKey=b=>{const o=Buffer.from(b);for(let i=0;i<o.length;i++)o[i]^=cg.SIGLUS_KEY[i&255];return o;};
/* reads a PNG back: size and RGBA pixels, checking every chunk CRC */
function readPng(buf){
 assert.equal(buf.toString('latin1',1,4),'PNG');let p=8,w=0,h=0,type=0;const idat=[];
 while(p<buf.length){const n=buf.readUInt32BE(p),t=buf.toString('latin1',p+4,p+8),data=buf.subarray(p+8,p+8+n);
  assert.equal(buf.readInt32BE(p+8+n),~dec.crc32(data,dec.crc32(buf.subarray(p+4,p+8)))|0,'CRC of '+t);
  if(t==='IHDR'){w=data.readUInt32BE(0);h=data.readUInt32BE(4);type=data[9];}if(t==='IDAT')idat.push(data);p+=12+n;}
 const raw=zlib.inflateSync(Buffer.concat(idat)),ch=type===6?4:3,rgba=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++){assert.equal(raw[y*(w*ch+1)],0);for(let x=0;x<w;x++){const s=y*(w*ch+1)+1+x*ch;rgba[(y*w+x)*4]=raw[s];rgba[(y*w+x)*4+1]=raw[s+1];rgba[(y*w+x)*4+2]=raw[s+2];rgba[(y*w+x)*4+3]=ch===4?raw[s+3]:255;}}
 return {width:w,height:h,rgba};}

test('PNG writer: opaque pictures as RGB, others as RGBA, valid CRCs',()=>{
 const rgba=Buffer.from([255,0,0,255, 0,255,0,255, 0,0,255,255, 9,8,7,255]);
 assert.deepEqual(readPng(dec.png({width:2,height:2,rgba})).rgba,rgba);
 const half=Buffer.from(rgba);half[3]=128;const back=readPng(dec.png({width:2,height:2,rgba:half}));assert.deepEqual(back.rgba,half);
 const big={width:8,height:4,rgba:Buffer.alloc(8*4*4,200)},small=dec.fit(big,4);assert.equal(small.width,4);assert.equal(small.height,2);assert.equal(small.rgba[0],200);
});

test('HuneX MZX0: literal words, the ring of literals, repeats and back-references',()=>{
 /* literal 2 words AB CD, repeat last word once, back-ref 2 words from 2 back, ring word 0 */
 const body=Buffer.from([(1<<2)|3,0x41,0x42,0x43,0x44, (0<<2)|0, (1<<2)|1,1, (0<<2)|2]);
 const out=dec.mzx(Buffer.concat([Buffer.from('MZX0'),u32(12),body]));
 assert.equal(out.toString('latin1'),'ABCDCDCDCDAB');
});

/* one-tile MZP: header (16 bytes) then MZX tiles stored as literals */
function mzpOf(width,height,type,depth,tile){
 const mz=t=>{const words=[];for(let i=0;i<t.length;i+=2)words.push(t.subarray(i,i+2));const parts=[];for(let i=0;i<words.length;i+=64){const c=words.slice(i,i+64);parts.push(Buffer.from([((c.length-1)<<2)|3]),...c);}return Buffer.concat([Buffer.from('MZX0'),u32(t.length),...parts]);};
 const head=Buffer.alloc(16);head.writeUInt16LE(width,0);head.writeUInt16LE(height,2);head.writeUInt16LE(width,4);head.writeUInt16LE(height,6);head.writeUInt16LE(1,8);head.writeUInt16LE(1,10);head.writeUInt16LE(type,12);head[14]=depth;head[15]=0;
 const entries=[head,mz(tile)];let off=0;const index=[],data=[];
 for(const e of entries){index.push(u16(off>>11),u16(off&0x7ff),u16(Math.ceil((off+e.length)/0x800)-Math.floor(off/0x800)),u16(e.length&0xffff));data.push(e);off+=e.length;}
 return Buffer.concat([Buffer.from('mrgd00'),u16(entries.length),...index,...data]);}
test('HuneX MZP: RGB565 + offset byte tiles and HEP palette tiles',()=>{
 /* 2x1, true colour: (255,0,0) and (0,0,255) */
 const tile=Buffer.concat([u16(0xf800),u16(0x001f),Buffer.from([0xe0,0x07])]);
 const img=dec.mzp(mzpOf(2,1,8,0x14,tile));assert.deepEqual([...img.rgba],[255,0,0,255, 0,0,255,255]);
 /* HEP: indices 1,0, palette 0 = transparent, 1 = green opaque */
 const hep=Buffer.alloc(0x20+2+1024);hep.writeUInt32LE(0x504548,0);hep.writeUInt32LE(0x20+2+1024,4);hep.writeUInt32LE(2,0x14);hep.writeUInt32LE(1,0x18);hep.writeUInt32LE(1,0x1c);hep[0x20]=1;hep[0x21]=0;
 hep[0x22+4+1]=255;hep[0x22+4+3]=0x80;
 const h=dec.mzp(mzpOf(2,1,0x0c,0x11,hep));assert.deepEqual([...h.rgba],[0,255,0,255, 0,0,0,0]);
});

/* SDC FORMAT 1.00: literal-only packing, each byte plus the LCG key byte */
function sdcOf(raw,seed=0x300){const lz=[];for(let i=0;i<raw.length;i+=128){const c=raw.subarray(i,i+128);lz.push(Buffer.from([c.length-1]),c);}const plain=Buffer.concat(lz),enc=Buffer.alloc(plain.length);let s=seed,sum=0,x=0;
 for(let i=0;i<plain.length;i++){s=(Math.imul(s,0x15a4e35)+1)>>>0;enc[i]=(plain[i]+((s>>>16)&0xff))&0xff;sum=(sum+enc[i])&0xffff;x^=enc[i];}
 const head=Buffer.alloc(32);head.write('SDC FORMAT 1.00');head.writeUInt32LE(seed,16);head.writeUInt32LE(enc.length,20);head.writeUInt32LE(raw.length,24);head.writeUInt16LE(sum,28);head.writeUInt16LE(x,30);return Buffer.concat([head,enc]);}
test('HuneX global save: SDC unpacks; the counted set of shown images is read',()=>{
 const names=['img0001.mzp','img0002.mzp'],raw=Buffer.concat([Buffer.from('WitchProject_03\0'),Buffer.alloc(16),u32(2),...names.map(n=>Buffer.from(n+'\0')),Buffer.alloc(8)]);
 const back=cg.sdcUnpack(sdcOf(raw));assert.deepEqual(back,raw);
 assert.deepEqual([...cg.mzpNameSets(back)],['img0001','img0002']);
 const bad=sdcOf(raw);bad[40]^=1;assert.equal(cg.sdcUnpack(bad),null,'checksum guards a damaged save');
});

test('HuneX folder: seen images the exe gallery lists, decoded from the .hfa',()=>{
 const dir=tmp();
 fs.writeFileSync(path.join(dir,'Witch.gdb'),sdcOf(Buffer.concat([Buffer.alloc(16),u32(2),Buffer.from('img0001.mzp\0img0002.mzp\0')])));
 const gallery=Buffer.concat(['IMG0001.MZP',...Array.from({length:24},(_,i)=>'IMG'+String(100+i).padStart(4,'0')+'.MZP')].map(n=>{const b=Buffer.alloc(16);b.write(n);return b;}));
 fs.writeFileSync(path.join(dir,'Game.exe'),Buffer.concat([Buffer.from('MZ'),Buffer.alloc(30),gallery]));
 const pic=mzpOf(2,1,8,0x14,Buffer.concat([u16(0xf800),u16(0x001f),Buffer.from([0xe0,0x07])]));
 const ents=['img0001.mzp','img0002.mzp'],head=Buffer.alloc(16+0x80*ents.length);head.write('HUNEXGGEFA10');head.writeUInt32LE(ents.length,12);
 ents.forEach((n,i)=>{head.write(n,16+i*0x80);head.writeUInt32LE(i*pic.length,16+i*0x80+0x60);head.writeUInt32LE(pic.length,16+i*0x80+0x64);});
 fs.writeFileSync(path.join(dir,'data02000.hfa'),Buffer.concat([head,pic,pic]));
 const l=cg.list(path.join(dir,'Game.exe'));
 assert.equal(l.engine,'HuneX');assert.deepEqual(l.items,['img0001'],'img0002 was seen but is not in the gallery');assert.equal(l.total,25);
 const r=cg.image(dir,path.join(dir,'Game.exe'),'img0001');assert.equal(r.mime,'image/png');
 assert.deepEqual([...readPng(Buffer.from(r.data,'base64')).rgba],[255,0,0,255, 0,0,255,255]);
});

test('Siglus LZSS and g00 types 0, 1 and 2',()=>{
 /* flags: 2 literals then one back-reference of 17 bytes from 2 back */
 const w=(2<<4)|(17-2),body=Buffer.from([0b011,0x61,0x62,w&255,w>>8]);
 assert.equal(dec.siglusLz(Buffer.concat([u32(body.length+8),u32(19),body])).toString(),'ab'.repeat(10).slice(0,19));
 /* type 0: 2x1 BGR literals */
 const t0body=Buffer.from([0b11,1,2,3,4,5,6]);const t0=Buffer.concat([Buffer.from([0]),u16(2),u16(1),u32(t0body.length+8),u32(8),t0body]);
 assert.deepEqual([...dec.g00(t0).rgba],[3,2,1,255,6,5,4,255]);
 /* type 1: palette of 2 BGRA colours, indices 1,0 */
 const t1raw=Buffer.concat([u16(2),Buffer.from([10,20,30,255, 40,50,60,128]),Buffer.from([1,0])]);
 assert.deepEqual([...dec.g00(Buffer.concat([Buffer.from([1]),u16(2),u16(1),siglusPack(t1raw)])).rgba],[60,50,40,128, 30,20,10,255]);
 /* type 2: one region 0..1 x 0..0, one chunk at x=1 of 1x1 */
 const block=Buffer.alloc(0x74+0x5c+4);block.writeUInt16LE(1,0);block.writeUInt16LE(1,2);block.writeUInt16LE(1,0x74);block.writeUInt16LE(1,0x74+6);block.writeUInt16LE(1,0x74+8);Buffer.from([7,8,9,255]).copy(block,0x74+0x5c);
 const t2raw=Buffer.concat([u32(1),u32(12),u32(block.length),block]);
 const region=Buffer.concat([u32(0),u32(0),u32(1),u32(0),u32(0),u32(0)]);
 assert.deepEqual([...dec.g00(Buffer.concat([Buffer.from([2]),u16(2),u16(1),u32(1),region,siglusPack(t2raw)])).rgba],[0,0,0,0, 9,8,7,255]);
});

test('Siglus folder: mode.cgm names and flags, the CG table found in global.sav',()=>{
 const dir=tmp();fs.mkdirSync(path.join(dir,'dat'));fs.mkdirSync(path.join(dir,'g00'));fs.mkdirSync(path.join(dir,'savedata'));
 const rec=(name,flag)=>{const r=Buffer.alloc(0x3c);r.write(name);r.writeInt32LE(flag,32);return r;};
 const table=Buffer.concat([rec('EV01A',0),rec('EV01B',1),rec('EV02A',5)]),head=Buffer.alloc(0x20);head.write('CGTABLE2');head.writeUInt32LE(3,16);
 fs.writeFileSync(path.join(dir,'dat','mode.cgm'),Buffer.concat([head,xorKey(siglusPack(table))]));
 /* global tables: 8 bytes, then {next, count, values}: G flags (10, set 1 and 7: 7 is no CG flag), the CG table (8, set 0 and 5) */
 const sec=(at,values)=>{const b=Buffer.concat(values.map(u32));return {b:Buffer.concat([u32(at+8+b.length),u32(values.length),b]),len:8+b.length};};
 const g=sec(8,[0,1,0,0,0,0,0,1,0,0]),c=sec(8+g.len,[1,0,0,0,0,1,0,0]);
 const raw=Buffer.concat([Buffer.alloc(8),g.b,c.b,Buffer.alloc(16)]),packed=xorKey(siglusPack(raw));
 fs.writeFileSync(path.join(dir,'savedata','global.sav'),Buffer.concat([u32(2),u32(0),u32(packed.length),packed]));
 const t0body=Buffer.from([0b1,1,2,3]);fs.writeFileSync(path.join(dir,'g00','EV01A.g00'),Buffer.concat([Buffer.from([0]),u16(1),u16(1),u32(t0body.length+8),u32(4),t0body]));
 fs.writeFileSync(path.join(dir,'g00','EV02A.g00'),fs.readFileSync(path.join(dir,'g00','EV01A.g00')));
 const l=cg.list(path.join(dir,'SiglusEngine.exe'));
 assert.equal(l.engine,'Siglus');assert.equal(l.total,3);assert.deepEqual(l.items.sort(),['ev01a','ev02a']);
 assert.equal(cg.image(dir,path.join(dir,'SiglusEngine.exe'),'ev01a').mime,'image/png');
});

test('YU-RIS: es.CGMODE slots and the YSSD array they fit',()=>{
 /* entry 1: a, a_1 ; entry 2: b -> slot 1 head, 2 a, 3 a_1, 4 head, 5 b */
 const g=cg.esSlots(['a','a_1',null,'b',null]);
 assert.deepEqual([...g.slots],[[2,'a'],[3,'a_1'],[5,'b']]);assert.deepEqual([...g.heads],[1,4]);assert.equal(g.size,6);
 const arr=(id,values)=>{const d=Buffer.alloc(16+values.length*8);d.writeUInt32LE(1,0);d.writeUInt32LE(1,4);d.writeUInt32LE(values.length,8);d.writeUInt32LE(values.length*8,12);values.forEach((v,i)=>d.writeBigInt64LE(BigInt(v),16+i*8));
  const z=zlib.deflateSync(d);return Buffer.concat([u32(id),u32(0x100),u32(z.length),u32(d.length),z]);};
 const a=arr(11,[0,0,1,0,0,1,0]),b=arr(12,[0,1,0]),head=Buffer.alloc(0x40);head.write('YSSD');head.writeUInt32LE(0x40,8);head.writeUInt32LE(0x40+a.length,12);
 const got=cg.yssdArrays(Buffer.concat([head,a,b]));
 assert.deepEqual(got.map(x=>[x.id,x.count,x.set]),[[11,7,[2,5]],[12,3,[1]]]);
});

test('KiriKiri KBAD100: MessagePack with little-endian counts and UTF-16 strings',()=>{
 const s=t=>Buffer.concat([Buffer.from([0xa0|t.length]),Buffer.from(t,'utf16le')]);
 const buf=Buffer.concat([Buffer.from('KBAD100\0'),Buffer.from([0xde]),u16(3),s('cg_EV001_002'),Buffer.from([1]),s('x'),Buffer.from([0xc1]),s('events'),Buffer.from([0x92]),s('a'),Buffer.from([0xcd]),u16(300)]);
 const v=cg.kbad(buf).value;assert.deepEqual(v,{cg_EV001_002:1,x:null,events:['a',300]});
});

test('KiriKiri TLG5 (LZSS and raw channels) and the TLG0 wrapper',()=>{
 /* 2x2, 3 colours, one block; B and R are stored minus G, then summed along the row and added to the row above */
 const W=2,H=2,head=Buffer.concat([Buffer.from('TLG5.0\0raw\x1a','latin1'),Buffer.from([3]),u32(W),u32(H),u32(2),u32(0)]);
 const G=[10,5,1,2],B=[0,0,0,0],R=[20,0,0,0];
 const raw=c=>Buffer.concat([Buffer.from([1]),u32(4),Buffer.from(c)]);
 /* B channel LZSS: four literals */
 const lz=Buffer.from([0x00,...B]),chB=Buffer.concat([Buffer.from([0]),u32(lz.length),lz]);
 const file=Buffer.concat([head,chB,raw(G),raw(R)]);
 const want=[30,10,10, 35,15,15, 31,11,11, 38,18,18];/* R,G,B per pixel */
 const img=dec.tlg(file);assert.deepEqual([...img.rgba].filter((_,i)=>i%4!==3),want);
 const wrapped=Buffer.concat([Buffer.from('TLG0.0\0sds\x1a','latin1'),u32(file.length),file]);assert.deepEqual(dec.tlg(wrapped).rgba,img.rgba);
});

test('KiriKiri folder: KBAD save + loose event picture',()=>{
 const dir=tmp();fs.mkdirSync(path.join(dir,'savedata'));fs.mkdirSync(path.join(dir,'evimage'));
 const s=t=>Buffer.concat([Buffer.from([0xa0|t.length]),Buffer.from(t,'utf16le')]);
 fs.writeFileSync(path.join(dir,'savedata','datasu.ksd'),Buffer.concat([Buffer.from('KBAD100\0'),Buffer.from([0x82]),s('cg_EV001'),Buffer.from([1]),s('cg_TITLE'),Buffer.from([1])]));
 fs.writeFileSync(path.join(dir,'evimage','ev001.png'),dec.png({width:1,height:1,rgba:Buffer.from([1,2,3,255])}));
 fs.writeFileSync(path.join(dir,'evimage','ev002.png'),dec.png({width:1,height:1,rgba:Buffer.from([1,2,3,255])}));
 const l=cg.list(path.join(dir,'game.exe'));assert.equal(l.engine,'KiriKiri');assert.deepEqual(l.items,['ev001']);
});

test('a folder with no reader stays unsupported',()=>{assert.equal(cg.list(path.join(tmp(),'x.exe')).supported,false);});

test('R18 filter: only CGs rated safe are listed or served; the rest wait for the background rating',()=>{
 process.env.MEGULIT_RATING_NO_FETCH='1';
 const dir=tmp(),root=tmp();fs.mkdirSync(path.join(dir,'savedata'));fs.mkdirSync(path.join(dir,'evimage'));
 const s=t=>Buffer.concat([Buffer.from([0xa0|t.length]),Buffer.from(t,'utf16le')]);
 fs.writeFileSync(path.join(dir,'savedata','datasu.ksd'),Buffer.concat([Buffer.from('KBAD100\0'),Buffer.from([0x83]),s('cg_EV001'),Buffer.from([1]),s('cg_EV002'),Buffer.from([1]),s('cg_EV003'),Buffer.from([1])]));
 for(const n of ['ev001','ev002','ev003'])fs.writeFileSync(path.join(dir,'evimage',n+'.png'),dec.png({width:1,height:1,rgba:Buffer.from([1,2,3,255])}));
 const exe=path.join(dir,'game.exe'),cacheDir=path.join(root,'data','cg-cache',require('node:crypto').createHash('sha1').update(dir.toLowerCase()).digest('hex').slice(0,16));
 fs.mkdirSync(cacheDir,{recursive:true});fs.writeFileSync(path.join(cacheDir,'ratings.json'),JSON.stringify({ev001:{label:'safe'},ev002:{label:'r18'}}));
 const l=cg.list(exe,{root,safe:true});assert.deepEqual(l.items,['ev001']);assert.equal(l.pending,1,'ev003 is not rated yet');
 assert.deepEqual(cg.list(exe,{root}).items.sort(),['ev001','ev002','ev003'],'switch off: every seen CG');
 assert.equal(cg.image(root,exe,'ev001',{safe:true}).mime,'image/png');
 assert.throws(()=>cg.image(root,exe,'ev002',{safe:true}),/CG_HIDDEN/);assert.throws(()=>cg.image(root,exe,'ev003',{safe:true}),/CG_HIDDEN/);
 const {fields}=require('../services/settings-schema.cjs');assert.ok(fields.some(f=>f.key==='safe_cg'&&f.type==='boolean'));
 assert.equal(require('../services/native-defaults.cjs').safe_cg,false);
 assert.equal(require('../services/cg-rating.cjs').MODELS.length,2);
});

test('cold run for CGs: the kirikiri-cg hook asks the game for pictures into cg\, apart from voices',()=>{
 const vc=require('../services/voice-cold.cjs');
 assert.equal(vc.hookFor('kirikiri'),vc.HOOKS.kirikiri);assert.equal(vc.hookFor('kirikiri-cg'),vc.HOOKS['kirikiri-cg']);
 assert.deepEqual(vc.HOOKS['kirikiri-cg'].want('ev101a'),['ev101a.png','ev101a.tlg','ev101a.jpg']);
 const src=fs.readFileSync(path.join(__dirname,'..','native','scncapture','ScnCapture.cpp'),'utf8');assert.match(src,/IsPicture\(name\.c_str\(\)\) \? L"cg\\\\"/);
});
