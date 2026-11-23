// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {launchTarget}=require('./original-engines/krkr-lang.cjs');

// These small launchers start the shared executable with a literal language argument.
function launchPlan(launcher){
 const target=launchTarget(launcher);
 if(!target)return null;
 const args=new Set();
 for(const encoding of target.encodings){
  for(const hit of target.bytes.toString(encoding).matchAll(/(-language=(?:jp|ja|zh|cn|chs|cht|tw|en|ru))\0/gi))args.add(hit[1].toLowerCase());
 }
 // KiriKiri 2's DirectInput wheel can advance the game while the overlay consumes Windows mouse input.
 return args.size===1?{executable:target.executable,args:[...args,'-wheel=message']}:null;
}

module.exports={launchPlan};
