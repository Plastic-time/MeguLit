// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Runtime CG unlock: the reading side of RuntimeCg.cpp (inside MeguLitDump32/64.dll). The DLL writes a CG only after the
// game's own window showed it (signature match on two polls; preloaded, gallery-table and never-shown pictures stay in
// memory and are dropped), so everything listed here is a picture the player saw, in play or in the game's CG gallery.
// Layout: <runtime-dump dir for the game>/cg.jsonl (one line per CG: file, source, how, crc, w, h, fmt, size, at) and
// cg/<crc>_<w>x<h>.<ext>. card-wall.cjs offers these as kind 'cg', source 'memory', id 'mem:<crc>'.
const fs=require('node:fs'),path=require('node:path');
const rd=()=>require('./runtime-dump.cjs');
/* formats the card picture step can open (TLG is never confirmed by the DLL; listed defensively anyway) */
const OPEN=new Set(['png','jpg','bmp','webp']);

/* every recorded CG of a game, oldest first, one per CRC: [{crc,file,source,how,w,h,fmt,at}] */
function list(exe){
 if(!exe)return [];const dir=rd().dirFor(path.dirname(String(exe)));let raw='';
 try{raw=fs.readFileSync(path.join(dir,'cg.jsonl'),'utf8');}catch{return [];}
 const seen=new Set(),out=[];
 for(const line of raw.split('\n')){if(!line.trim())continue;let e;try{e=JSON.parse(line);}catch{continue;}
  const crc=String(e.crc||'').toLowerCase();if(!/^[0-9a-f]{8}$/.test(crc)||seen.has(crc))continue;
  /* the file must sit inside the game's cg folder (no paths out of it) */
  const rel=String(e.file||'');if(!/^cg\/[0-9a-f]{8}_\d{1,5}x\d{1,5}\.(?:png|jpg|bmp|webp|tlg)$/i.test(rel))continue;
  const file=path.join(dir,...rel.split('/'));if(!fs.existsSync(file))continue;
  seen.add(crc);out.push({crc,file,source:String(e.source||''),how:String(e.how||''),w:+e.w||0,h:+e.h||0,fmt:String(e.fmt||'').toLowerCase(),at:+e.at||0});}
 return out;}

/* card wall sources (card-wall.cjs sources()): pictures the page can show */
function sources(exe){return list(exe).filter(c=>OPEN.has(c.fmt)).map(c=>({id:'mem:'+c.crc,kind:'cg',source:'memory',file:c.file}));}

module.exports={list,sources};
