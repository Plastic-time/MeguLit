// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.bmp':'image/bmp','.avif':'image/avif'};
/* E274 (user: some pictures could not be used as a background): browsers save JPEGs as .jfif / .jpe and AVIF is common;
   the file's content decides what it is, the extension only has to look like an image. */
const IMAGE_EXT=/\.(png|jpe?g|jfif|jpe|pjpeg|pjp|webp|gif|bmp|dib|avif)$/i;
const names={home:'background',panels:'background-game',avatar:'avatar'};
function imageType(bytes){const h=bytes.subarray(0,16);return h.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'.png':h[0]===255&&h[1]===216?'.jpg':h.toString('ascii',0,4)==='RIFF'&&h.toString('ascii',8,12)==='WEBP'?'.webp':/^GIF8[79]a/.test(h.toString('ascii'))?'.gif':h.toString('ascii',0,2)==='BM'?'.bmp':h.toString('ascii',4,8)==='ftyp'&&/^avi[fs]$/.test(h.toString('ascii',8,12))?'.avif':'';}
function readImage(source){
 if(typeof source!=='string'||!path.isAbsolute(source)||!IMAGE_EXT.test(source))throw Error('INVALID_IMAGE');
 let bytes;try{const stat=fs.statSync(source);if(!stat.isFile()||stat.size>40*1024*1024)throw Error();bytes=fs.readFileSync(source);}catch{throw Error('INVALID_IMAGE');}
 const ext=imageType(bytes);if(!ext)throw Error('INVALID_IMAGE');return {bytes,ext,src:'data:'+mime[ext]+';base64,'+bytes.toString('base64')};
}
function directory(root){const folder=path.join(root,'data','assets','custom');fs.mkdirSync(folder,{recursive:true});return folder;}
function find(root,slot){
 const name=names[slot];if(!name)throw Error('INVALID_ASSET_SLOT');
 if(fs.existsSync(path.join(directory(root),'.disabled-'+slot)))return '';
 for(const folder of [directory(root),path.join(root,'data','config'),path.join(root,'migration','baseline-20261103','config')]){
  for(const ext of Object.keys(mime)){const file=path.join(folder,name+ext);if(fs.existsSync(file))return file;}
 }
 if(slot==='avatar'){const native=require('./store.cjs').readJSON(path.join(root,'data','config','native-preferences.json'));const name=path.win32.basename(native.profile_picture||'');if(name&&name===path.basename(name)){const file=path.join(root,'data','assets','profile',name);if(fs.existsSync(file))return file;}}
 return '';
}
function get(root,slot){const file=find(root,slot);if(!file)return '';try{return readImage(file).src;}catch{return '';}}
function set(root,slot,source){
 if(!names[slot])throw Error('INVALID_ASSET_SLOT');const {bytes,ext,src}=readImage(source);
 const folder=directory(root),file=path.join(folder,names[slot]+ext),temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,bytes);fs.renameSync(temp,file);
 for(const other of Object.keys(mime))if(other!==ext){const old=path.join(folder,names[slot]+other);if(fs.existsSync(old))fs.unlinkSync(old);}
 const disabled=path.join(folder,'.disabled-'+slot);if(fs.existsSync(disabled))fs.unlinkSync(disabled);return {saved:true,...(slot==='home'?{src}:{})};
}
function clear(root,slot){if(!names[slot])throw Error('INVALID_ASSET_SLOT');fs.writeFileSync(path.join(directory(root),'.disabled-'+slot),'1');return {cleared:true};}
function preview(source){return readImage(source).src;}
module.exports={get,set,find,clear,preview};
