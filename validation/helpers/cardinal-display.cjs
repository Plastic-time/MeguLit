// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Explicit synthetic transport acknowledgements for scheduler tests, never a live DOM baseline.
function display(Tape,text,translation,{sequence}={}){Tape.pairPolicy({schema:1,client:'synthetic-transport',revision:1,enabled:true,visible:true,target:'zh'},'zh');const descriptor=Tape.liveSource(text,{target:'zh',sequence});Tape.liveTranslation(text,translation,{target:'zh'});Tape.pairObserved({...descriptor,observed:true,paired:!!translation,enabled:true,visible:true,translation:translation||''},'zh');return descriptor;}
module.exports={display};
