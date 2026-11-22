// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');

const script=fs.readFileSync(path.join(__dirname,'../../native/krkrtext/script.inc'),'utf8');
function controlReplay(){
 const start=script.indexOf('st.ctlOff=function()'),end=script.indexOf('/* ---- roles:',start);
 assert.ok(start>=0&&end>start,'complete script.inc control reader found');
 const js=script.slice(start,end)
  .replace(/ incontextof st;/g,';')
  .replaceAll("%['roles'=>0,'embed'=>0,'zh'=>1]",'{roles:0,embed:0,zh:1}')
  .replaceAll('%[]','Object.create(null)')
  .replace('[].load(p)','load(p)')
  .replace("typeof p!='String'","typeof p!=='string'")
  .replace("typeof c.choiceFrames!='Object'","!Array.isArray(c.choiceFrames)")
  .replace(/(\ba|c\.choiceFrames)\.count/g,'$1.length')
  .replace(/#t==0xfeff/g,'t.charCodeAt(0)==0xfeff')
  .replace(/\.add\(/g,'.push(')
  .replace(/\bvoid\b/g,'undefined');
 const state={ctlRaw:'',embRestore(){}};
 let lines=[];
 new Function('st','global','load',js)(state,{__megulitKrkrCtlPath:'fixture',RegExp},()=>lines);
 return {state,read(text){lines=text.split(/\r?\n/);state.ctl();return state.cfg;}};
}

function readControlFile(file){
 const buf=fs.readFileSync(file);
 assert.deepEqual([...buf.subarray(0,2)],[0xff,0xfe],'UTF-16LE with BOM, as [].load reads it');
 return controlReplay().read(buf.subarray(2).toString('utf16le'));
}
module.exports={controlReplay,readControlFile};
