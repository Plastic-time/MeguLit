// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 FMOD FSB5 sound banks (Unity AudioClips) to something a browser plays. PCM16 becomes WAV; Vorbis is remuxed into
   Ogg without decoding: FSB5 keeps raw Vorbis audio packets (u16 size each) and only the CRC-32 of the stream's setup
   header, so the setup header comes from a table of the setups FMOD's encoder emits (fsb-vorbis-setups.bin, from fsbex
   by Jake Laforgia et al., MIT OR Apache-2.0, src/encode/vorbis_lookup.rs; every entry checked against its CRC-32).
   The identification header is rebuilt (channels, rate, block sizes 256 / 2048 as FMOD uses), the setup header is read
   far enough to know each mode's block flag, and every packet's granule position is counted from its block size. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const FREQ={1:8000,2:11000,3:11025,4:16000,5:22050,6:24000,7:32000,8:44100,9:48000};
let setups=null;
function setupFor(crc){if(!setups){setups=new Map();const b=zlib.inflateRawSync(fs.readFileSync(path.join(__dirname,'fsb-vorbis-setups.bin')));for(let p=0;p+8<=b.length;){const c=b.readUInt32LE(p),n=b.readUInt32LE(p+4);setups.set(c,b.subarray(p+8,p+8+n));p+=8+n;}}return setups.get(crc>>>0)||null;}
// FSB5 bank -> [{name, channels, rate, samples, codec, crc, data}]
function parse(b,at=0){if(b.toString('latin1',at,at+4)!=='FSB5')return null;const ver=b.readUInt32LE(at+4),num=b.readUInt32LE(at+8),shs=b.readUInt32LE(at+12),nts=b.readUInt32LE(at+16),ds=b.readUInt32LE(at+20),codec=b.readUInt32LE(at+24);
 const head=at+(ver===0?0x40:0x3c),dataAt=head+shs+nts;let p=head;const out=[];
 for(let i=0;i<num;i++){const lo=b.readUInt32LE(p),hi=b.readUInt32LE(p+4);p+=8;let rate=FREQ[(lo>>>1)&15]||44100,channels=((lo>>>5)&1)+1;const offset=((lo>>>6)|((hi&3)<<26))*16,samples=hi>>>2;let crc=null,next=lo&1;
  while(next){const c=b.readUInt32LE(p);p+=4;next=c&1;const size=(c>>>1)&0xffffff,type=(c>>>25)&0x7f;if(type===1)channels=b[p];else if(type===2)rate=b.readUInt32LE(p);else if(type===11)crc=b.readUInt32LE(p);p+=size;}
  out.push({channels,rate,samples,codec,crc,offset});}
 for(let i=0;i<out.length;i++){const end=i+1<out.length?out[i+1].offset:ds;out[i].data=b.subarray(dataAt+out[i].offset,dataAt+end);}
 if(nts)for(let i=0;i<out.length;i++){const o=b.readUInt32LE(head+shs+i*4),z=b.indexOf(0,head+shs+o);out[i].name=b.toString('utf8',head+shs+o,z);}
 return out;}
// LSB-first bit reader over a Vorbis header packet.
function bits(buf){let p=0;return {read(n){let v=0;for(let i=0;i<n;i++){const byte=buf[p>>3];v+=((byte>>(p&7))&1)*2**i;p++;}return v;},get pos(){return p;}};}
const ilog=v=>{let n=0;while(v>0){n++;v=Math.floor(v/2);}return n;};
function lookup1(entries,dims){let r=Math.floor(Math.pow(entries,1/dims));while(Math.pow(r+1,dims)<=entries)r++;while(Math.pow(r,dims)>entries)r--;return r;}
// The block flag of each mode, read from a setup header packet (codebooks, floors, residues and mappings are skipped).
function modeFlags(setup,channels){const r=bits(setup);for(let i=0;i<7;i++)r.read(8);
 const books=r.read(8)+1;for(let i=0;i<books;i++){if(r.read(24)!==0x564342)throw Error('VORBIS_CODEBOOK');const dims=r.read(16),entries=r.read(24),ordered=r.read(1);
  if(!ordered){const sparse=r.read(1);for(let e=0;e<entries;e++){if(sparse){if(r.read(1))r.read(5);}else r.read(5);}}
  else{r.read(5);for(let e=0;e<entries;){e+=r.read(ilog(entries-e));}}
  const lt=r.read(4);if(lt===1||lt===2){r.read(32);r.read(32);const vb=r.read(4)+1;r.read(1);const n=lt===1?lookup1(entries,dims):entries*dims;for(let k=0;k<n;k++)r.read(vb);}else if(lt!==0)throw Error('VORBIS_LOOKUP');}
 const times=r.read(6)+1;for(let i=0;i<times;i++)r.read(16);
 const floors=r.read(6)+1;for(let i=0;i<floors;i++){const t=r.read(16);
  if(t===0){r.read(8);r.read(16);r.read(16);r.read(6);r.read(8);const nb=r.read(4)+1;for(let k=0;k<nb;k++)r.read(8);}
  else if(t===1){const parts=r.read(5),cls=[];let max=-1;for(let k=0;k<parts;k++){const c=r.read(4);cls.push(c);if(c>max)max=c;}const dims=[];
   for(let c=0;c<=max;c++){dims.push(r.read(3)+1);const sub=r.read(2);if(sub)r.read(8);for(let k=0;k<(1<<sub);k++)r.read(8);}
   r.read(2);const rb=r.read(4);for(const c of cls)for(let k=0;k<dims[c];k++)r.read(rb);}
  else throw Error('VORBIS_FLOOR');}
 const residues=r.read(6)+1;for(let i=0;i<residues;i++){r.read(16);r.read(24);r.read(24);r.read(24);const classes=r.read(6)+1;r.read(8);const casc=[];
  for(let c=0;c<classes;c++){const low=r.read(3),hi=r.read(1)?r.read(5):0;casc.push(hi*8+low);}for(const c of casc)for(let k=0;k<8;k++)if(c&(1<<k))r.read(8);}
 const maps=r.read(6)+1;for(let i=0;i<maps;i++){r.read(16);const sub=r.read(1)?r.read(4)+1:1;if(r.read(1)){const steps=r.read(8)+1;for(let k=0;k<steps;k++){r.read(ilog(channels-1));r.read(ilog(channels-1));}}
  r.read(2);if(sub>1)for(let c=0;c<channels;c++)r.read(4);for(let k=0;k<sub;k++){r.read(8);r.read(8);r.read(8);}}
 const modes=r.read(6)+1,flags=[];for(let i=0;i<modes;i++){flags.push(r.read(1));r.read(16);r.read(16);r.read(8);}return flags;}
const CRC=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i<<24;for(let k=0;k<8;k++)c=c&0x80000000?(c<<1)^0x04c11db7:c<<1;t[i]=c>>>0;}return t;})();
function oggCrc(b){let c=0;for(const x of b)c=((c<<8)^CRC[((c>>>24)^x)&255])>>>0;return c;}
function page(packets,granule,serial,seq,flags){const segs=[];for(const p of packets.data){let n=p.length;while(n>=255){segs.push(255);n-=255;}if(p.partial)continue;segs.push(n);}
 const h=Buffer.alloc(27+segs.length);h.write('OggS',0,'latin1');h[5]=flags;h.writeBigInt64LE(BigInt(granule),6);h.writeUInt32LE(serial,14);h.writeUInt32LE(seq,18);h[26]=segs.length;Buffer.from(segs).copy(h,27);
 const pg=Buffer.concat([h,...packets.data.map(p=>p.buf||p)]);pg.writeUInt32LE(oggCrc(pg),22);return pg;}
// One FSB5 Vorbis sample -> an Ogg Vorbis file, or null.
function toOgg(s){const setup=s.crc!==null?setupFor(s.crc):null;if(!setup)return null;const flags=modeFlags(setup,s.channels),modeBits=ilog(flags.length-1);
 const id=Buffer.alloc(30);id[0]=1;id.write('vorbis',1,'latin1');id.writeUInt32LE(0,7);id[11]=s.channels;id.writeUInt32LE(s.rate,12);id[28]=0xb8;id[29]=1;
 const vendor=Buffer.from('MeguLit FSB5 remux','latin1'),cm=Buffer.alloc(7+4+vendor.length+4+1);cm[0]=3;cm.write('vorbis',1,'latin1');cm.writeUInt32LE(vendor.length,7);vendor.copy(cm,11);cm.writeUInt32LE(0,11+vendor.length);cm[cm.length-1]=1;
 const serial=0x4d47554c,pages=[page({data:[id]},0,serial,0,2),page({data:[cm,Buffer.from(setup)]},0,serial,1,0)];let seq=2;
 const packets=[];for(let p=0;p+2<=s.data.length;){const n=s.data.readUInt16LE(p);p+=2;if(!n||p+n>s.data.length)break;packets.push(s.data.subarray(p,p+n));p+=n;}
 let granule=0,prev=0,cur=[],size=0;const flush=last=>{if(!cur.length)return;pages.push(page({data:cur},last?Math.min(granule,s.samples||granule):granule,serial,seq++,last?4:0));cur=[];size=0;};
 packets.forEach((pk,i)=>{const mode=(pk[0]>>1)&((1<<modeBits)-1),bs=flags[mode]?2048:256;if(prev)granule+=prev/4+bs/4;prev=bs;
  if(pk.length>255*254)return;if(size+pk.length>4096||cur.length>=200)flush(false);cur.push(pk);size+=pk.length;if(i===packets.length-1)flush(true);});
 return Buffer.concat(pages);}
function toWav(s){const pcm=s.data,h=Buffer.alloc(44);h.write('RIFF',0,'latin1');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8,'latin1');h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(s.channels,22);h.writeUInt32LE(s.rate,24);h.writeUInt32LE(s.rate*s.channels*2,28);h.writeUInt16LE(s.channels*2,32);h.writeUInt16LE(16,34);h.write('data',36,'latin1');h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
// The first sample of an FSB5 bank as playable bytes (Ogg for Vorbis, WAV for PCM16), or null.
function playable(b,at=0){const list=parse(b,at);if(!list||!list.length)return null;const s=list[0];try{if(s.codec===15)return toOgg(s);if(s.codec===2)return toWav(s);}catch{}return null;}
const duration=(b,at=0)=>{const l=parse(b,at);return l&&l[0]?l[0].samples/l[0].rate:null;};
module.exports={parse,toOgg,toWav,playable,duration,modeFlags,setupFor,_internal:{oggCrc}};
