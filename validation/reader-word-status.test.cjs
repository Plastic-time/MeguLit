'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../web/reader/word-status.js'),'utf8');

test('redrawing part of an unchanged sentence restores its word underlines',async()=>{
 const character=textContent=>({textContent,dataset:{},style:{removeProperty(){}}});
 const chars=[character('読'),character('む')],host={isConnected:true,querySelectorAll:()=>chars};
 let notify,timer,calls=0;const events={};
 const prefs={word_highlight_enabled:true,underline_mined_words:true,status_underline_width:3,word_level_colors:{2:'#8844AA'}};
 const window={__tomeNativePreferences:prefs,
  __tomeChinese:{localTokenize:async()=>[{surface:'読む',start:0,end:2}]},
  __tomeInvoke:async cmd=>{if(cmd==='get_settings')return {...prefs,status_underline_width:0};calls++;return [{spelling:'読む',status:2}];}};
 vm.runInNewContext(source,{window,document:{querySelectorAll:()=>[host],documentElement:{}},
  MutationObserver:class{constructor(fn){notify=fn;}observe(){}},addEventListener(name,fn){events[name]=fn;},setTimeout(fn){timer=fn;}});
 const flush=async()=>{timer();await new Promise(resolve=>setImmediate(resolve));};
 await flush();
 assert.equal(chars[1].dataset.wordStatus,'2');
 notify();await flush();assert.equal(calls,1);
 chars[1]=character('む');notify();await flush();
 assert.equal(chars[1].dataset.wordStatus,'2');
 assert.equal(chars[1].style.textDecoration,'underline');
 assert.equal(chars[1].style.textDecorationColor,'#8844AA');
 assert.equal(chars[1].style.textDecorationThickness,'3px');
 events['tome-word-status-changed']();await new Promise(resolve=>setImmediate(resolve));await flush();
 assert.equal(chars[1].dataset.wordStatus,'2');
 assert.equal(chars[1].style.textDecorationThickness,'0px');
 assert.equal(chars[1].style.textDecoration,'none');
});
