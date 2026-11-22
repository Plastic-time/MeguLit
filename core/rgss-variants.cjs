// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const VARIANTS=Object.freeze({
 1:Object.freeze({generation:1,name:'XP',ruby:'1.8',scripts:'Data/Scripts.rxdata',archive:'.rgssad',archiveVersion:1}),
 2:Object.freeze({generation:2,name:'VX',ruby:'1.8',scripts:'Data/Scripts.rvdata',archive:'.rgss2a',archiveVersion:1}),
 3:Object.freeze({generation:3,name:'VX Ace',ruby:'1.9.2',scripts:'Data/Scripts.rvdata2',archive:'.rgss3a',archiveVersion:3})
});
/* A filename is a declaration, never a verified DLL version or permission to patch a game. */
function declaredVariant({library,scripts}){
 if(typeof library!=='string'||typeof scripts!=='string')throw Error('RGSS_VARIANT_DECLARATION');
 const match=/^RGSS([123])\d\d[JE]?\.dll$/i.exec(library),script=scripts.replace(/\\/g,'/');
 if(!match)throw Error('RGSS_VARIANT_DECLARATION');const variant=VARIANTS[match[1]];
 if(script.toLowerCase()!==variant.scripts.toLowerCase())throw Error('RGSS_VARIANT_CONFLICT');
 return Object.freeze({...variant,verified:false});
}
module.exports={declaredVariant};
