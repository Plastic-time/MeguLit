// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E409 Nitroplus N4 (Steam "The Song of Saya", Saya_Steam.exe): scene files media/script/nps/*.nps inside the NPK2
// script.npk. A text line is a line with text after its leading commands; <R TEXT="よみ">base</R> is the game's own
// reading. Command lines are the anchors. A Japanese script.npk made by the Saya port keeps every line where the
// English or Chinese one had it, so its backup (the translation) lines up scene by scene, line by line.
const fs=require('node:fs'),path=require('node:path');
const npk=require('../../core/nitroplus-npk.cjs'),{signature}=require('../../core/saya-script-port.cjs');

/* any .nps entry: another build keeps its scenes under a different folder */
const SCENE=/(?:^|\/)[^/]+\.nps$/i;
const LEAD=/^(?:[ \t]*<(?!\/?R[\s>])[^>]*>)*/i;
const memo=new Map(),BOM=new RegExp('^'+String.fromCharCode(0xfeff));
function archive(file){const st=fs.statSync(file),key=path.resolve(file).toLowerCase()+'|'+st.size+'|'+st.mtimeMs;
 if(memo.has(key))return memo.get(key);let arc=null;
 try{const head=Buffer.alloc(0x20),fd=fs.openSync(file,'r');try{fs.readSync(fd,head,0,0x20,0);}finally{fs.closeSync(fd);}if(npk.isNpk2(head))arc=npk.readNpkAny(fs.readFileSync(file));}catch{arc=null;}
 memo.clear();memo.set(key,arc);return arc;}
function scenesOf(file){const arc=archive(file);if(!arc)return [];
 return arc.entries.filter(e=>SCENE.test(e.name)).map(e=>({name:path.posix.basename(e.name),read:()=>npk.npkData(arc,e)}));}
const scriptFile=dir=>{const f=path.join(dir,'script.npk');return fs.existsSync(f)?f:'';};

function parse(buf){
 const text=buf.toString('utf8').replace(BOM,''),lines=[],anchors=[],ruby=[],voices=[];
 for(const raw of text.split(/\r\n|\r|\n/)){const sig=signature(raw);if(!sig)continue;
  if(sig.startsWith('T:')){anchors.push(sig.slice(2));continue;}
  if(!sig.startsWith('X:'))continue;
  const rest=raw.replace(BOM,'').slice(raw.replace(BOM,'').match(LEAD)[0].length),pairs=[];
  const line=rest.replace(/<R\s+TEXT="([^"]*)">([^<]*)<\/R>/gi,(_,reading,base)=>{pairs.push([base,reading]);return base;}).replace(/<[^>]*>/g,'').replace(/^[\s　]+|[\s　]+$/g,'');
  if(sig.startsWith('X:voice='))anchors.push(sig.slice(2));
  /* 2026-11-15 saved-line voice: <voice NAME="青海" SRC="3\000104"> plays media/voice/3/000104.ogg of voice.npk */
  const vs=/<voice\b[^>]*\bSRC="([^"]+)"/i.exec(raw);
  lines.push(line);ruby.push(pairs.length?pairs:null);voices.push(vs?require('./voice-ref.cjs').clean(vs[1]):null);}
 const v=require('./voice-ref.cjs').keep(voices);
 return v?{lines,anchors,ruby,voices:v}:{lines,anchors,ruby};}

function unsupported(dir){const f=scriptFile(dir);if(!f)return '';
 try{const h=Buffer.alloc(0x20),fd=fs.openSync(f,'r');try{fs.readSync(fd,h,0,0x20,0);}finally{fs.closeSync(fd);}if(!npk.isNpk2(h))return '';}catch{return '';}
 return archive(f)?'':'NPK_KEY';}
const REASONS={NPK_KEY:'这个 Nitro+ NPK2 游戏的 script.npk 使用了未知密钥加密，暂时读不了'};

module.exports={
 id:'nitroplus-n4',hint:'script.npk',
 scenes(dir){const f=scriptFile(dir);return f?scenesOf(f):[];},
 archives(dir){const f=scriptFile(dir);return f?scenesOf(f):[];},
 sources(dir){const f=scriptFile(dir);return f?[f]:[];},
 unsupported,REASONS,
 parse,test:()=>false,
};
