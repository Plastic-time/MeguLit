// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');/* E577 shared engine kit */
/* Musica engine PAZ archives (ぱれっと ましろ色シンフォニー scr.dat), as in GARbro (MIT, ArcFormats/Musica/ArcPAZ.cs,
   keys from its GameData/Formats.dat PazScheme). Version 1+: a 32-byte header naming the game, then the index size
   (XOR-ed with its top byte when that is not 0), a Blowfish (index key) index: count, then per entry a C-string name,
   u64 offset, unpacked size, size, aligned size, packed flag. An entry is Blowfish (data key), then for an unpacked
   entry RC4 keyed "<name lower> <unpacked size %08X> <type password>", then zlib when packed.
   A .sc scenario is Shift-JIS text: ".message <id> <voice> <name> <text>" lines. */
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {Blowfish}=require('./blowfish.cjs');
const SCHEMES={
 mashiroiro:{title:'Mashiro Iro Symphony',version:1,scr:{index:'f423a8c4a322f6fdf976c34674b634e775802d382c06aa1085dccf0ce987e6ee',data:'85a52bbacf893da5b1da1a24a1d458243f4854edecb2c4afdecdd966b751b42a'},
  voice:{index:'e8f193099447008c77b43bba74e4f563b7392e6721d68d1628e051996f978098',data:'40a02109b3b4f74dc41af9adc30328d2cd61b79ae265f50a4e9ce8c23cc89625'},sc:'rytKRa38',ogg:'cQ5jhgpb'},
};
/* E452 every PazScheme GARbro knows (paz-schemes.json, from its Formats.dat: minori eden*, ef, Trinoline, Musica titles ...).
   A Steam build names itself in the header ("eden_en") but GARbro keys schemes by title, so an archive whose header has
   no built-in scheme takes the first scheme whose index key decrypts a sane index of that archive. */
/* E561 an adapter pack's paz schemes (params target "paz-scheme", same shape as a paz-schemes.json entry plus "title") come first */
const KNOWN_SCHEMES=(()=>{const out=[];let raw={};try{raw=JSON.parse(fs.readFileSync(path.join(__dirname,'paz-schemes.json'),'utf8'));}catch{}
 for(const [title,s] of Object.entries(raw)){const o={title,version:s.version|0,sc:s.type?.sc||'',ogg:s.type?.ogg||''};for(const [a,k] of Object.entries(s.arc||{}))if(k&&k[0]&&k[1])o[a]={index:k[0],data:k[1]};out.push(o);}
 return out;})();
let extraMemo={raw:null,list:[],fp:''};
function extraSchemes(){
 let raw=[];try{raw=require('../adapter-packs.cjs').params('paz-scheme');}catch{}
 if(extraMemo.raw===raw)return extraMemo;
 const list=[],fps=[];
 for(const p of raw){try{const s=p?.value;if(!s||typeof s.title!=='string')continue;
  const o={title:s.title,version:s.version|0,sc:s.type?.sc||'',ogg:s.type?.ogg||''},arcs=[];
  for(const [a,k] of Object.entries(s.arc||{}))if(Array.isArray(k)&&typeof k[0]==='string'&&typeof k[1]==='string'){o[a]={index:k[0],data:k[1]};arcs.push([a,k[0].toLowerCase(),k[1].toLowerCase()]);}
  arcs.sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0);list.push(o);fps.push([o.title,o.version,o.sc,o.ogg,arcs]);}catch{}}
 extraMemo={raw,list,fp:JSON.stringify(fps)};
 return extraMemo;
}
function schemes(extra=extraSchemes().list){return [...Object.values(SCHEMES),...extra,...KNOWN_SCHEMES];}
function rc4(key,skip=0){const S=new Uint8Array(256);for(let i=0;i<256;i++)S[i]=i;let j=0;for(let i=0;i<256;i++){j=(j+S[i]+key[i%key.length])&255;const t=S[i];S[i]=S[j];S[j]=t;}let a=0,b=0;
 for(let k=0;k<skip;k++){a=(a+1)&255;b=(b+S[a])&255;const t=S[a];S[a]=S[b];S[b]=t;} /* version 2: GARbro skips (crc32(key)>>12)&255 bytes */
 return buf=>{for(let i=0;i<buf.length;i++){a=(a+1)&255;b=(b+S[a])&255;const t=S[a];S[a]=S[b];S[b]=t;buf[i]^=S[(S[a]+S[b])&255];}return buf;};}
const {readAt}=require('./file-key.cjs');
/* the scheme whose index key opens this archive's index (count sane, first name readable) */
function opens(file,scheme,arc,total){if(!scheme[arc])return false;const start=scheme.version>0?0x20:0;if(total<start+12)return false;
 let size=readAt(file,start,4).readUInt32LE(0);const xor=size>>>24;if(xor)size=(size^(xor*0x01010101))>>>0;if(size&7||size<16||start+4+size>total)return false;
 const raw=readAt(file,start+4,16);if(xor)for(let i=0;i<16;i++)raw[i]^=xor;const d=new Blowfish(Buffer.from(scheme[arc].index,'hex')).decryptBuffer(raw),count=d.readUInt32LE(0);
 if(!count||count>100000)return false;for(let i=4;i<16;i++){const c=d[i];if(c===0)return i>4;if(c<0x20||c===0x7f)return false;}return true;}
const chosen=new Map();
function schemeOf(file){let st;try{st=fs.statSync(file);}catch{chosen.delete(file);return null;}
 const total=st.size,extra=extraSchemes(),key=total+':'+st.mtimeMs+':'+extra.fp,m=chosen.get(file);
 if(m&&m.key===key)return m.val;
 let head;try{head=readAt(file,0,32);}catch{chosen.delete(file);return null;}
 const arc=path.parse(file).name.toLowerCase();
 const name=head.toString('latin1',0,head.indexOf(0)>0?head.indexOf(0):0);let found=SCHEMES[name]&&SCHEMES[name][arc]?SCHEMES[name]:null;
 if(!found&&/\.(?:paz|dat)$/i.test(file))found=schemes(extra.list).find(s=>{try{return opens(file,s,arc,total);}catch{return false;}})||null;
 chosen.set(file,{key,val:found});return found;}
function list(file){const scheme=schemeOf(file),arc=path.parse(file).name.toLowerCase();if(!scheme||!scheme[arc])return null;
 // E450 the index is read, entries are read from the file when asked for (voice.dat is two gigabytes)
 const total=fs.statSync(file).size,at=(o,n)=>readAt(file,o,n);
 const start=scheme.version>0?0x20:0;let size=at(start,4).readUInt32LE(0);const xor=size>>>24;if(xor)size=(size^(xor*0x01010101))>>>0;
 const b={length:total,subarray:(s,e)=>at(s,e-s)};
 if(size&7||start+4+size>b.length)return null;const raw=Buffer.from(b.subarray(start+4,start+4+size));if(xor)for(let i=0;i<raw.length;i++)raw[i]^=xor;
 const idx=new Blowfish(Buffer.from(scheme[arc].index,'hex')).decryptBuffer(raw),count=idx.readUInt32LE(0),out=[];let p=4;
 if(count<=0||count>100000)return null;const dataKey=Buffer.from(scheme[arc].data,'hex');
 for(let i=0;i<count;i++){const z=idx.indexOf(0,p);if(z<0)return null;const name=kit.SJIS.decode(idx.subarray(p,z));p=z+1;
  const e={name,offset:Number(idx.readBigInt64LE(p)),unpacked:idx.readUInt32LE(p+8),size:idx.readUInt32LE(p+12),aligned:idx.readUInt32LE(p+16),packed:idx.readInt32LE(p+20)!==0};p+=24;
  if(e.offset+e.aligned>b.length)return null;
  out.push({name,read:()=>{let d=Buffer.from(b.subarray(e.offset,e.offset+e.aligned));if(xor)for(let k=0;k<d.length;k++)d[k]^=xor;d=new Blowfish(dataKey).decryptBuffer(d);
   /* E450 the type password: .sc scripts, and every entry of an audio archive (voice.dat) as GARbro GetTypePassword */
   const pw=e.packed?'':/\.sc$/i.test(name)?scheme.sc:(/\.ogg$/i.test(name)||/^(?:pm)?(?:voice|bgm|se)$/.test(arc))?scheme.ogg||'':'';
   if(scheme.version>0&&pw){const k=Buffer.from(name.toLowerCase()+' '+e.unpacked.toString(16).toUpperCase().padStart(8,'0')+' '+pw,'latin1');rc4(k,scheme.version>=2?(zlib.crc32(k)>>>12)&255:0)(d);}
   d=d.subarray(0,e.size);return e.packed?zlib.inflateSync(d):d;}});}
 return out;}
const voiceRef=require('./voice-ref.cjs');
// E450 the voice column (sk\sk1042.ogg) goes with the text of its row.
/* E452 a script is Japanese unless its messages have no kana and are either not plain ASCII (a Chinese patch in GBK
   over scr.paz, eden* on Steam) or many and all ASCII (an English release): those are not offered as originals. */
const KANA=/[぀-ヿ]/;
const messageRows=data=>kit.SJIS.decode(data).split(/\r?\n/).filter(row=>/^\.message[\t ]/.test(row));
function parse(data){const lines=[],voices=[],rows=messageRows(data);
 if(!rows.some(r=>KANA.test(r))&&(rows.length>=20||rows.some(r=>/[^\x00-\x7f]/.test(r))))return {lines,anchors:[]};
 for(const row of rows){
  const separator=/^\.message *\t/.test(row)?'\t':' ',f=row.split(separator);
  const name=f[3]||'',text=f.slice(4).join(separator).replace(/\\#[0-9A-Fa-f]{6}/g,'').replace(/\\n/g,'').replace(/\\[-+*A-Za-z]/g,'').trim();/* \#RRGGBB colour, \n break, \+ etc. */
  if(!text)continue;if(name){lines.push(name);voices.push(null);}lines.push(text);voices.push(voiceRef.clean(f[2]));}
 const v=voiceRef.keep(voices);return v?{lines,anchors:[],voices:v}:{lines,anchors:[]};}
/* scr.dat (Musica) or scr.paz / pmscr.paz (minori) */
function scrDat(dir){for(const n of ['scr.dat','scr.paz']){const f=path.join(dir,n);if(fs.existsSync(f)&&schemeOf(f))return f;}return null;}
/* E577 kit.engine: one script archive, entries keep their names and order */
const engine=kit.engine({id:'paz',hint:'scr.dat 或 scr.paz',overlay:false,
 archives:{find:dir=>scrDat(dir),list,entry:/\.sc$/i,keepPath:true,sort:false},parse,test:n=>/\.sc$/i.test(n),extra:{
 /* E452 the scenario opens but holds no Japanese (English Steam build, Chinese patch over scr.paz) */
 unsupported(dir){const f=scrDat(dir);if(!f)return '';const sc=(list(f)||[]).filter(e=>/\.sc$/i.test(e.name));if(!sc.length)return '';
  /* the language the scenario is in, so the answer is exact: minori's Steam eden* ships Chinese (eden_cn.dll) or English only, never the Japanese text;
     GBK bytes read as Shift-JIS are never plain ASCII, so a row that is not ASCII counts as Chinese */
  let han=0,ascii=0;
  for(const e of sc){try{const rows=messageRows(e.read());if(rows.some(r=>KANA.test(r)))return '';
   for(const r of rows){if(/^[\x00-\x7f]*$/.test(r))ascii++;else han++;}}catch{}}
  return han>ascii?'PAZ_CHINESE_ONLY':ascii?'PAZ_ENGLISH_ONLY':'PAZ_NO_JAPANESE';},
 REASONS:{PAZ_CHINESE_ONLY:'这个版本的剧本是中文（Steam 中文版或汉化补丁），里面没有日文原文，需要日文版的 scr 文件',PAZ_ENGLISH_ONLY:'这个版本的剧本是英文（Steam 英文版），里面没有日文原文，需要日文版的 scr 文件',PAZ_NO_JAPANESE:'这个版本的剧本里没有日文原文（英文版或装了汉化补丁），需要日文版的 scr 文件'},
}});
// E450 the clips of voice.dat, for game-voice.cjs.
function audio(file){if(!/[\\/](?:pm)?voice\.(?:dat|paz)$/i.test(file))return null;const l=list(file);return l?l.map(e=>({name:/\.\w{2,4}$/.test(e.name)?e.name:e.name+'.ogg',read:e.read})):null;}
module.exports={SCHEMES,list,parse,engine,audio};
