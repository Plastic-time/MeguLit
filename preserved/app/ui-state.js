// SPDX-License-Identifier: GPL-3.0-or-later
// Mirrors Tomoyo's own localStorage UI state (theme, interface mode, reader
// page, overlay settings) to ui-state.json so it survives a lost or temporary
// WebView2 profile. Runs before any page script.
(function installUiState(){
 'use strict';
 if(window.__tomoyoUiStateInstalled)return;window.__tomoyoUiStateInstalled=true;
 const wanted=key=>typeof key==='string'&&/^tomoyo-/.test(key)&&!/key|token|secret|password/i.test(key);
 let store;try{store=window.localStorage;}catch{return;}
 // Restore only keys the profile does not already have, so a working profile always wins.
 try{for(const [key,value]of Object.entries(window.__tomoyoUiState||{}))if(wanted(key)&&typeof value==='string'&&store.getItem(key)===null)store.setItem(key,value);}catch{}
 function snapshot(){const values={};try{for(let i=0;i<store.length;i++){const key=store.key(i);if(wanted(key)){const value=store.getItem(key);if(typeof value==='string'&&value.length<=50000)values[key]=value;}}}catch{}return sorted(values);}
 function sorted(values){const out={};for(const key of Object.keys(values).sort())if(wanted(key)&&typeof values[key]==='string')out[key]=values[key];return out;}
 let last=JSON.stringify(sorted(window.__tomoyoUiState||{})),timer=0;
 function flush(){clearTimeout(timer);timer=0;const values=snapshot(),text=JSON.stringify(values);if(text===last)return;try{window.__tomoyoTranslateRequest(JSON.stringify({type:'uiState',values}));last=text;}catch{}}
 function schedule(){if(!timer)timer=setTimeout(flush,400);}
 const proto=Storage.prototype,setItem=proto.setItem,removeItem=proto.removeItem,clear=proto.clear;
 proto.setItem=function(key,value){const r=setItem.call(this,key,value);if(this===store&&wanted(String(key)))schedule();return r;};
 proto.removeItem=function(key){const r=removeItem.call(this,key);if(this===store&&wanted(String(key)))schedule();return r;};
 proto.clear=function(){const r=clear.call(this);if(this===store)schedule();return r;};
 addEventListener('pagehide',flush);addEventListener('beforeunload',flush);
 // The profile may hold values the file has not seen yet (first run after upgrading).
 if(JSON.stringify(snapshot())!==last)schedule();
})();
