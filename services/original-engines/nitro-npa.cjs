// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const kit=require('./kit.cjs');
/* Nitro+ NPA ("NPA\x01", N2System: Chaos;Head, Muramasa, Demonbane, DRAMAtical Murder ...). The container and its per-title
   ciphers are core/nitroplus-npa.cjs (GARbro ArcNPA, scheme table from Formats.dat); with no title known every scheme is
   tried. Scripts are the .nss text entries. A line of text is what is left of a script line after its <...> tags and
   // comments; <VOICE name="..."> names the speaker and <RUBY text="よみ">漢字</RUBY> is the game's own reading. */
const fs=require('node:fs'),path=require('node:path'),npa=require('../../core/nitroplus-npa.cjs');
const memo=new Map();
function open(file){const st=fs.statSync(file),key=path.resolve(file).toLowerCase()+'|'+st.size+'|'+st.mtimeMs;if(memo.has(key))return memo.get(key);
 let arc=null;try{arc=npa.openNpa(file);}catch{arc=null;}memo.clear();memo.set(key,arc);return arc;}
function list(file){const arc=open(file);if(!arc)return null;return arc.entries.map(e=>({name:e.name,read:()=>npa.npaData(arc,e)}));}
function decode(buf){return kit.decodeText(buf).replace(/^\ufeff/,'');}
const JP=/[ぁ-ゖァ-ヺ一-龯]/;
const speaker=n=>{const t=n.trim().split(/[／/]/).pop().trim();return t||n.trim();};
function rubyText(t,pairs){return t.replace(/<RUBY\s+text="([^"]*)">([^<]*)<\/RUBY>/gi,(_,r,b)=>{pairs.push([b,r]);return b;}).replace(/<[^>]*>/g,'').trim();}
/* N2System scripts (Muramasa, Chaos;Head ...): the text is in <PRE @box>...</PRE> blocks, between script code. Inside one,
   [text0010] is the line label, //【name】 and <voice name="..."> name the speaker, and a blank line ends what one click
   shows: the wrapped lines of a paragraph are one line of text. */
function parsePre(src){const lines=[],ruby=[],anchors=[];
 for(const m of src.matchAll(/<PRE\b[^>]*>([\s\S]*?)<\/PRE>/gi)){let name=null,buf=[],pairs=[];
  const flush=()=>{const t=buf.join('').trim();if(t&&JP.test(t)){if(name){lines.push(name);ruby.push(null);}lines.push(t);ruby.push(pairs.length?pairs:null);}buf=[];pairs=[];name=null;};
  for(const raw of m[1].split(/\r\n|\r|\n/)){const t=raw.trim();
   if(/^\[[A-Za-z_]*\d+\]$/.test(t)){anchors.push(t);continue;}
   const cm=/^\/\/\s*【([^】]+)】/.exec(t);if(cm){if(buf.length)flush();name=speaker(cm[1]);continue;}
   if(t.startsWith('//'))continue;
   const vn=/<voice\b[^>]*\bname="([^"]*)"/i.exec(t);if(vn){if(buf.length)flush();name=speaker(vn[1]);}
   const text=rubyText(t,pairs).replace(/^[\u3000\s]+$/,'');
   if(!text){if(buf.length)flush();continue;}buf.push(text);}
  flush();}
 return {lines,anchors,ruby};}
/* Steins;Gate ships its scripts compiled (.nsb): records of u32 line, u16 opcode, u16 argument count, then each argument as
   u32 length + bytes. The text is the <PRE @box>…</PRE> argument, the same source as an .nss. → those blocks, or null
   when the buffer is not a record list that ends exactly at its end */
const PRE_OPEN=Buffer.from('<PRE','latin1');
function nsbText(buf){if(buf.length<8)return null;let q=0;const out=[];
 while(q+8<=buf.length){const n=buf.readUInt16LE(q+6);q+=8;
  for(let k=0;k<n;k++){if(q+4>buf.length)return null;const l=buf.readUInt32LE(q);q+=4;if(q+l>buf.length)return null;const a=buf.subarray(q,q+l);q+=l;
   if(a.subarray(0,8).includes(PRE_OPEN))out.push(a);}}
 return q===buf.length?out:null;}
function parse(buf){const nsb=nsbText(buf);if(nsb)return nsb.length?parsePre(decode(Buffer.concat(nsb.flatMap(b=>[b,Buffer.from('\n')])))):{lines:[],anchors:[],ruby:[]};
 const src=decode(buf);if(/<\/PRE>/i.test(src))return parsePre(src);
 const lines=[],ruby=[],anchors=[];
 for(const raw of src.split(/\r\n|\r|\n/)){const t=raw.trim();if(!t||t.startsWith('//')){continue;}
  const name=(/<VOICE\b[^>]*\bname="([^"]*)"/i.exec(t)||[])[1];const pairs=[];
  const text=rubyText(t,pairs);
  if(!text||!JP.test(text)){anchors.push(t.slice(0,40));continue;}
  if(name){lines.push(name);ruby.push(null);}lines.push(text);ruby.push(pairs.length?pairs:null);}
 return {lines,anchors,ruby};}
// For replacement, preserve every command, label, speaker tag and control outside plain PRE text.
function importLayout(bytes){
 if(bytes[0]===0xfe&&bytes[1]===0xfe&&bytes[2]<=2)throw Error('IMPORT_NPA_UNSUPPORTED');
 const text=decode(bytes).replace(/\r\n?/g,'\n');
 if(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/.test(text))throw Error('IMPORT_NPA_UNSUPPORTED');
 const dialogue=[];
 const block=/<PRE\b[^>]*>([\s\S]*?)<\/PRE>/gi;
 const code=text.replace(block,'');
 if(/<\/?PRE\b/i.test(code))throw Error('IMPORT_NPA_UNSUPPORTED');
 const commands=code.replace(/^\s*\/\/.*$/gm,'');
 const references=[...new Set([...commands.matchAll(/\b[A-Za-z_]\w*\s*\([^()\r\n]*"([^"\r\n]{8,})"/g)]
  .map(match=>match[1]).filter(value=>/[\\/]|\.[a-z0-9]{2,5}$/i.test(value)))];
 const structure=text.replace(block,(section,body)=>{
  if(/<\/?PRE\b/i.test(body))throw Error('IMPORT_NPA_UNSUPPORTED');
  const shape=body.split('\n').map(line=>{
   const tags=[];
   const prose=line.trim().replace(/^(<voice\b[^>]+>)/i,(_,tag)=>{tags.push(tag);return '';}).trim()
    .replace(/<RUBY\s+text="[ぁ-ゖァ-ヺー・ ]+">([^<>]+)<\/RUBY>/gi,'$1');
   if(!/^[\p{L}\p{M}\p{N}\p{Zs}\p{P}\p{S}]+$/u.test(prose)||!JP.test(prose)||/[<>\[\]{}\\@%$&]/.test(prose)||prose.startsWith('//'))return ['literal',line];
   dialogue.push(prose);return ['dialogue',tags];
  });
  return section.slice(0,section.indexOf('>')+1)+JSON.stringify(shape)+'</PRE>';
 });
 return {dialogue,structure,references};
}
const engine=kit.engine({id:'nitro-npa',hint:'nss.npa',overlay:false,
 archives:{name:/\.npa$/i,subs:['','..'],list,entry:/\.ns[sb]$/i,sort:false},parse,test:n=>/\.ns[sb]$/i.test(n)});
module.exports={list,parse,nsbText,importLayout,engine};
