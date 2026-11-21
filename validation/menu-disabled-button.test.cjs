'use strict';
/* a disabled Alt+T menu button must look disabled: its rule carries the same :not chain as the base button rule (else the base rule wins) */
const assert=require('assert'),fs=require('fs'),path=require('path');
const s=fs.readFileSync(path.join(__dirname,'..','web','reader','modules','controls-b.js'),'utf8');
/* the chain is read from the base rule itself, so adding an exclusion there never leaves this test behind */
const chains=[...s.matchAll(/\.tomoyo-cn-dialog button((?::not\([^)]*\))+)(?=:disabled|:hover|:active|\{|,)/g)].map(m=>m[1]);
assert(chains.length,'base rule found');
const chain=chains.reduce((a,b)=>b.length>a.length?b:a);
assert(chain.includes(':not(.tomoyo-menu-tabs button)')&&chain.includes(':not([type=submit])'),'base chain still excludes tabs and submit');
assert(s.includes('.tomoyo-cn-dialog button'+chain+':disabled'),'disabled rule needs the base rule\'s :not chain');
assert(/:disabled\{border-style:dashed!important[^}]*opacity:\.55!important/.test(s));
console.log('menu-disabled-button ok');
