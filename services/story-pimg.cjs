// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// PSB layer/chunk layout independently implemented from GARbro ArcPSB.cs (morkt, MIT).
const {Worker,isMainThread,parentPort,workerData}=require('node:worker_threads');
const {createHash}=require('node:crypto');
const LIMITS=Object.freeze({inputBytes:64<<20,metadataBytes:2<<20,arrayItems:65536,nodes:16384,layers:256,pixels:8<<20,decodedPixels:32<<20,chunkBytes:16<<20,timeoutMs:5000});
const fail=code=>{throw Object.assign(Error(code),{code});};
function limits(lower={}){const out={...LIMITS};if(!lower||typeof lower!=='object'||Array.isArray(lower))fail('PIMG_LIMIT');for(const [k,v] of Object.entries(lower)){if(!(k in LIMITS)||!Number.isSafeInteger(v)||v<1||v>LIMITS[k])fail('PIMG_LIMIT');out[k]=v;}return out;}
function inspect(input,options={}){
 const cap=limits(options.limits);if(!Buffer.isBuffer(input)||input.length>cap.inputBytes||input.length<44)fail('PIMG_INPUT');
 const b=input;if(b.toString('latin1',0,4)!=='PSB\0'||b.readUInt16LE(4)!==3||b.readUInt16LE(6)!==0)fail('PIMG_FORMAT_UNSUPPORTED');
 const namesAt=b.readUInt32LE(12),stringsAt=b.readUInt32LE(16),stringData=b.readUInt32LE(20),offsetAt=b.readUInt32LE(24),lengthAt=b.readUInt32LE(28),dataAt=b.readUInt32LE(32),rootAt=b.readUInt32LE(36);
 if(dataAt>cap.metadataBytes||dataAt>b.length||[namesAt,stringsAt,stringData,offsetAt,lengthAt,rootAt].some(x=>x<44||x>=dataAt))fail('PIMG_HEADER');
 let arrays=0,nodes=0;const need=(at,n)=>{if(!Number.isSafeInteger(at)||!Number.isSafeInteger(n)||at<0||n<0||at+n>dataAt)fail('PIMG_RANGE');};
 const uint=(at,n)=>{need(at,n);if(n<1||n>4)fail('PIMG_WIDTH');return b.readUIntLE(at,n);};
 function array(at){need(at,1);const cw=b[at]-12;if(cw<1||cw>4)fail('PIMG_ARRAY');const count=uint(at+1,cw);need(at+1+cw,1);const w=b[at+1+cw]-12;if(w<1||w>4||(arrays+=count)>cap.arrayItems)fail('PIMG_ARRAY_BUDGET');const start=at+2+cw;need(start,count*w);return {values:Array.from({length:count},(_,i)=>uint(start+i*w,w)),end:start+count*w};}
 const cs=array(namesAt),nd=array(cs.end),ni=array(nd.end),names=[];
 for(const idx of ni.values){let at=nd.values[idx],n=0;const chars=[];if(at===undefined)fail('PIMG_NAMES');while(at!==0){if(++n>256||at>=nd.values.length)fail('PIMG_NAMES');const parent=nd.values[at],base=cs.values[parent],ch=at-base;if(!Number.isInteger(ch)||ch<1||ch>255)fail('PIMG_NAMES');chars.push(ch);at=parent;}names.push(Buffer.from(chars.reverse()).toString('utf8'));}
 if(new Set(names).size!==names.length||names.some(n=>!n||n.includes('\ufffd')))fail('PIMG_NAMES');
 const so=array(stringsAt).values,offsets=array(offsetAt).values,lengths=array(lengthAt).values;
 if(offsets.length!==lengths.length||offsets.length>cap.layers)fail('PIMG_CHUNKS');
 const chunks=offsets.map((off,i)=>{const len=lengths[i];if(len>cap.chunkBytes||dataAt+off+len>b.length)fail('PIMG_CHUNK_RANGE');return {offset:dataAt+off,length:len};});
 function value(at,depth=0){need(at,1);if(++nodes>cap.nodes||depth>64)fail('PIMG_NODE_BUDGET');const t=b[at];if(t===0||t===1)return null;if(t===2)return false;if(t===3)return true;
  if(t>=4&&t<=8){const w=t-4;if(!w)return 0;need(at+1,w);return b.readIntLE(at+1,w);}
  if(t>=21&&t<=24){const i=uint(at+1,t-20);if(i>=so.length)fail('PIMG_STRING');const start=stringData+so[i];need(start,1);const end=b.indexOf(0,start);if(end<start||end>=dataAt||end-start>4096)fail('PIMG_STRING');const s=b.toString('utf8',start,end);if(s.includes('\ufffd'))fail('PIMG_STRING');return s;}
  if(t>=25&&t<=28){const resource=uint(at+1,t-24);if(resource>=chunks.length)fail('PIMG_RESOURCE');return {resource};}
  if(t===32){const a=array(at+1),base=a.end;return a.values.map(off=>value(base+off,depth+1));}
  if(t===33){const keys=array(at+1),offs=array(keys.end),base=offs.end;if(keys.values.length!==offs.values.length)fail('PIMG_OBJECT');const obj=Object.create(null);keys.values.forEach((k,i)=>{if(k>=names.length||Object.hasOwn(obj,names[k]))fail('PIMG_OBJECT');obj[names[k]]=value(base+offs.values[i],depth+1);});return obj;}
  fail('PIMG_VALUE_UNSUPPORTED');
 }
 const root=value(rootAt),integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
 if(!root||!integer(root.width,1,16384)||!integer(root.height,1,16384)||root.width*root.height>cap.pixels||!Array.isArray(root.layers)||root.layers.length<1||root.layers.length>cap.layers)fail('PIMG_CANVAS');
 const ids=new Set();const layers=root.layers.map(l=>{if(!l||!integer(l.layer_id,0,0x7fffffff)||ids.has(l.layer_id))fail('PIMG_LAYER');ids.add(l.layer_id);
  if(typeof l.name!=='string'||!l.name||l.name.length>256)fail('PIMG_LAYER_UNSUPPORTED');
  if(!integer(l.left,-16384,16384)||!integer(l.top,-16384,16384)||!integer(l.width,1,16384)||!integer(l.height,1,16384)||l.width*l.height>cap.pixels||!integer(l.opacity,0,255)||![0,1].includes(l.visible)||l.layer_type!==0||l.type!==13)fail('PIMG_LAYER_UNSUPPORTED');
  const ref=root[l.layer_id+'.tlg'];if(!ref||!integer(ref.resource,0,chunks.length-1))fail('PIMG_LAYER_RESOURCE');return {id:l.layer_id,name:l.name,left:l.left,top:l.top,width:l.width,height:l.height,opacity:l.opacity,visible:l.visible,type:l.type,resource:ref.resource};});
 return {version:3,width:root.width,height:root.height,layers,chunks,sourceSHA256:createHash('sha256').update(b).digest('hex')};
}
function tlgShape(b,cap){let at=0;if(b.toString('latin1',0,11)==='TLG0.0\0sds\x1a')at=15;const sig=b.toString('latin1',at,at+11);at+=11;let width,height;
 if(sig==='TLG5.0\0raw\x1a'){if(b.length<at+13)fail('PIMG_TLG');width=b.readUInt32LE(at+1);height=b.readUInt32LE(at+5);const block=b.readUInt32LE(at+9);if(block<1||block>height)fail('PIMG_TLG');}
 else if(sig==='TLG6.0\0raw\x1a'){if(b.length<at+16||b[at+1]||b[at+2]||b[at+3])fail('PIMG_TLG');width=b.readUInt32LE(at+4);height=b.readUInt32LE(at+8);}
 else fail('PIMG_CODEC_UNSUPPORTED');
 if(!width||!height||width>16384||height>16384||width*height>cap.pixels)fail('PIMG_PIXEL_BUDGET');
 const take=(pos,len)=>{if(!Number.isSafeInteger(pos)||!Number.isSafeInteger(len)||pos<0||len<0||pos+len>b.length)fail('PIMG_TLG_RANGE');};
 const colors=b[at];if(![3,4].includes(colors))fail('PIMG_CODEC_UNSUPPORTED');
 if(sig==='TLG5.0\0raw\x1a'){const block=b.readUInt32LE(at+9);let pos=at+13+4*Math.ceil(height/block);take(at+13,4*Math.ceil(height/block));for(let y=0;y<height;y+=block)for(let c=0;c<colors;c++){take(pos,5);const len=b.readUInt32LE(pos+1);if(b[pos]>1)fail('PIMG_CODEC_UNSUPPORTED');take(pos+5,len);pos+=5+len;}}
 else {let pos=at+16;take(pos,4);const filterBytes=b.readUInt32LE(pos);take(pos+4,filterBytes);pos+=4+filterBytes;for(let y=0;y<height;y+=8)for(let c=0;c<colors;c++){take(pos,4);const bits=b.readUInt32LE(pos);if(bits>>>30)fail('PIMG_CODEC_UNSUPPORTED');const len=Math.ceil(bits/8);take(pos+4,len);pos+=4+len;}}
 return {width,height};
}
function decodeChunk(b,cap){return new Promise((resolve,reject)=>{const worker=new Worker(__filename,{workerData:{pimgTLG:b},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:16}});let result,error;
 const timer=setTimeout(()=>{error=Object.assign(Error('PIMG_DECODE_TIMEOUT'),{code:'PIMG_DECODE_TIMEOUT'});worker.terminate().catch(()=>{});},cap.timeoutMs);
 worker.on('message',m=>{if(m.error)error=Object.assign(Error(m.error),{code:'PIMG_DECODE_FAILED'});else result=m;});worker.on('error',e=>{error=e;});worker.on('exit',code=>{clearTimeout(timer);if(error)reject(error);else if(code||!result)reject(Object.assign(Error('PIMG_DECODE_EXIT'),{code:'PIMG_DECODE_EXIT'}));else resolve({...result,rgba:Buffer.from(result.rgba)});});
 });}
async function render(input,{layerIds,limits:lower}={}){
 const cap=limits(lower);if(!Buffer.isBuffer(input)||input.length>cap.inputBytes)fail('PIMG_INPUT');input=Buffer.from(input);const doc=inspect(input,{limits:lower});if(!Array.isArray(layerIds)||!layerIds.length||layerIds.length>cap.layers||new Set(layerIds).size!==layerIds.length)fail('PIMG_SELECTION_REQUIRED');
 const selected=layerIds.map(id=>{const l=doc.layers.find(x=>x.id===id);if(!l)fail('PIMG_SELECTION');return l;});if(selected.reduce((n,l)=>n+l.width*l.height,0)>cap.decodedPixels)fail('PIMG_AGGREGATE_PIXELS');
 const rgba=Buffer.alloc(doc.width*doc.height*4);
 for(const l of selected){const c=doc.chunks[l.resource],bytes=input.subarray(c.offset,c.offset+c.length),shape=tlgShape(bytes,cap);if(shape.width!==l.width||shape.height!==l.height)fail('PIMG_DIMENSION_MISMATCH');const im=await decodeChunk(bytes,cap);if(im.width!==l.width||im.height!==l.height||im.rgba.length!==l.width*l.height*4)fail('PIMG_DIMENSION_MISMATCH');
  for(let y=Math.max(0,-l.top);y<Math.min(l.height,doc.height-l.top);y++)for(let x=Math.max(0,-l.left);x<Math.min(l.width,doc.width-l.left);x++){const s=(y*l.width+x)*4,d=((y+l.top)*doc.width+x+l.left)*4,sa=im.rgba[s+3]/255*l.opacity/255,da=rgba[d+3]/255,oa=sa+da*(1-sa);if(!oa)continue;for(let k=0;k<3;k++)rgba[d+k]=Math.round((im.rgba[s+k]*sa+rgba[d+k]*da*(1-sa))/oa);rgba[d+3]=Math.round(oa*255);}
 }
 return {width:doc.width,height:doc.height,rgba,provenance:{sourceSHA256:doc.sourceSHA256,layerIds:[...layerIds],order:'explicit-bottom-to-top',blend:'straight-alpha-source-over',unlockEvidence:false}};
}
if(!isMainThread&&workerData?.pimgTLG){try{const b=Buffer.from(workerData.pimgTLG),im=require('./cg-decoders.cjs').tlg(b);parentPort.postMessage(im);}catch(e){parentPort.postMessage({error:String(e.code||e.message).slice(0,100)});}}
module.exports={LIMITS,inspect,render};
