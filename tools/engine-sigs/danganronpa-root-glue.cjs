// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Pure integration transform for root's current HookNative: never writes a shared working tree. */
function once(source,from,to){if(source.split(from).length!==2)throw Error('DR1_GLUE_ANCHOR '+from);return source.replace(from,to);}
function hookSource(source){
 source=once(source,"if(m.type==='hookSource'&&typeof m.text==='string'&&m.text.length<=4000){this.sourcePage(m,name);return;}","if(m.type==='hookSource'&&typeof m.text==='string'&&m.text.length<=4000){if(!require('./danganronpa-pc-source.cjs').receive(this,m,name))this.sourcePage(m,name);return;}");
 source=once(source,'source(m,name){',"source(m,name){if(require('./danganronpa-pc-source.cjs').shouldBlock(this,m))return;");
 source=once(source,"deliverSource(text,origin,engine='',nativeLine=0,authority){", "deliverSource(text,origin,engine='',nativeLine=0,authority){if(require('./danganronpa-pc-source.cjs').shouldBlock(this,authority,origin))return;");
 source=once(source,"emitSource(text,origin,engine='',nativeLine=0,authority){", "emitSource(text,origin,engine='',nativeLine=0,authority){if(require('./danganronpa-pc-source.cjs').shouldBlock(this,authority,origin))return;");
 source=once(source,'if(pid&&(cfg.roles||cfg.embed||cfg.clear||cfg.advhdInput===true||', 'if(pid&&(cfg.roles||cfg.embed||cfg.clear||cfg.spikechunsoftInput===true||cfg.advhdInput===true||');
 source=once(source,'HookNative.syncShippedHook(this.folder);',"if(this.profile?.draw?.spikechunsoftInput===true){const draw=this.ensureEngineDraw(pid);draw.transport.flush(draw.cfg,draw.entries);}HookNative.syncShippedHook(this.folder);");
 if(source.includes('this.ownerTestGrant=null;this.profile=O.apply'))source=once(source,'this.ownerTestGrant=null;this.profile=O.apply',"this.ownerTestGrant=null;require('./danganronpa-pc-source.cjs').clear(this);this.profile=O.apply");
 return source;
}
function ownerSource(source){return once(source,'const DRAW=new Set([',"const DRAW=new Set(['spikechunsoftInput',");}
module.exports={hookSource,ownerSource};
