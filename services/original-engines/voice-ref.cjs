// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* E450 The voice a script line plays, read from the command that comes before it (or a tag inside it).
   A reference is the voice file's name as the script writes it, without folder or extension; the game's archives
   are searched for it later (game-voice.cjs). Engines that number voices give "koe:<id>" instead. */
const VOICE_TAG=/^(?:voice|vo|v|cv|pv|playvoice|voiceplay|vplay|ps|playse_v|seplay_v|koe|talk|nm|name|ch|chara|char|n)$/i;
const VOICE_ATTR=/^(?:voice|vo|v|cv|vf|voicefile|koe)$/i;
const NAME_TAG=/^(?:nm|name|ch|chara|char|n|talk)$/i;
const clean=v=>{v=String(v||'').trim().replace(/^["']|["']$/g,'').replace(/\\/g,'/');v=v.slice(v.lastIndexOf('/')+1).replace(/\.(?:ogg|opus|wav|mp3|m4a|nwa|ovk|at3|aac|flac)$/i,'');return /^[\w.\-+~#!$]{1,80}$/.test(v)&&!/^(?:true|false|0|1|none|null|stop)$/i.test(v)?v:null;};
function attrs(body){const out=[];for(const m of body.matchAll(/([A-Za-z_][\w]*)\s*=\s*("[^"]*"|'[^']*'|[^\s\]]+)/g))out.push([m[1],m[2]]);return out;}
// One KAG tag ("@voice storage=a01" or "[vo s=a01]") -> the voice name, or null.
function fromTag(tag){const m=/^[@[]\s*([^\s\]=]+)\s*([^\]]*)/.exec(String(tag).trim());if(!m)return null;const name=m[1],list=attrs(m[2]);
 for(const [k,v] of list)if(VOICE_ATTR.test(k))return clean(v);
 if(/voice|^vo$|^cv$|^pv$|^koe$/i.test(name)){for(const [k,v] of list)if(/^(?:storage|file|s|f|name)$/i.test(k))return clean(v);const bare=/^\s*([^\s=\]]+)\s*$/.exec(m[2]);if(bare)return clean(bare[1]);}
 if(NAME_TAG.test(name))for(const [k,v] of list)if(/^s$/i.test(k))return clean(v);
 return null;}
// Every tag in a line, last voice wins.
function inLine(line){let found=null;for(const m of String(line).matchAll(/\[[^\]]*\]/g)){const v=fromTag(m[0]);if(v)found=v;}const t=String(line).trim();if(t[0]==='@'){const v=fromTag(t);if(v)found=v;}return found;}
// A tracker for scripts that set the voice before the text: take() hands the pending voice to the next line.
function tracker(){let pending=null;return {see(cmd){const v=typeof cmd==='string'?inLine(cmd):null;if(v)pending=v;return v;},set(v){if(v)pending=v;},take(){const v=pending;pending=null;return v;}};}
// A voices array is kept only when some line has one.
const keep=v=>v&&v.some(Boolean)?v:undefined;
module.exports={fromTag,inLine,tracker,clean,keep,VOICE_TAG};
