// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-20 (CHAOS;CHILD froze when the log drive filled): logs were appended synchronously on MeguLit's main thread, the
   same thread that reads the hook bridge's stdout. A slow or full drive held that thread, the bridge's pipe filled and the
   game's hook thread waited behind it. Every log line now goes through here: queued per file, written by one async
   append at a time, never waited on. A write that fails (full, read-only, gone) drops the batch and counts it; the next
   successful write begins with "log: dropped N lines". A backlog over MAX_QUEUED lines is dropped and counted too. */
const fs=require('node:fs'),path=require('node:path');
const MAX_QUEUED=5000;
const sinks=new Map();
function sink(file){let s=sinks.get(file);if(!s){s={queue:[],busy:false,dropped:0,rotate:0};sinks.set(file,s);}return s;}
function lines(text){let n=0;for(let i=0;i<text.length;i++)if(text.charCodeAt(i)===10)n++;return n||1;}
function pump(file,s,io){
 if(s.busy||!s.queue.length)return;s.busy=true;
 let text=s.queue.join('');s.queue.length=0;
 if(s.dropped)text=new Date().toISOString()+' log: dropped '+s.dropped+' lines (log drive not writable)\n'+text;
 const sent=s.dropped;
 const write=()=>io.appendFile(file,text,error=>{
  if(error)s.dropped+=lines(text)-(sent?1:0);else s.dropped-=sent;
  s.busy=false;if(s.queue.length)setImmediate(()=>pump(file,s,io));
 });
 if(s.rotate>0)io.stat(file,(error,info)=>{if(!error&&info.size>=s.rotate)io.rename(file,file+(s.rotateSuffix||'.previous'),()=>write());else write();});
 else write();
}
/** Queues text for file; returns at once. options.rotate: size in bytes past which the file is renamed (suffix
    options.rotateSuffix, default ".previous") before the next write. */
function append(file,text,options={},io=fs){
 const s=sink(file);if(options.rotate){s.rotate=options.rotate;s.rotateSuffix=options.rotateSuffix;}
 if(s.queue.length>=MAX_QUEUED){s.dropped+=lines(text);return;}
 s.queue.push(text);pump(file,s,io);
}
function pending(file){const s=sinks.get(file);return s?{queued:s.queue.length,busy:s.busy,dropped:s.dropped}:null;}
module.exports={append,pending,MAX_QUEUED,_reset(){sinks.clear();}};
