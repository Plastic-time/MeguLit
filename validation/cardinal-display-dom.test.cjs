// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// These are explicit DOM-boundary unit nodes and the real backend contract, never a healthy game recording.
const test=require('node:test'),assert=require('node:assert/strict'),{DisplayPairs}=require('../core/cardinal/display-pairs.cjs'),DOM=require('../web/reader/modules/cardinal-pair.js');
function node(value,{tag='DIV',state='ready',parent=null}={}){const n={nodeType:1,tagName:tag,isConnected:true,hidden:false,parentElement:parent,dataset:{state},style:{display:'block',visibility:'visible',opacity:'1'},childNodes:[],getBoundingClientRect:()=>({left:0,top:0,right:400,bottom:30,width:400,height:30})};if(value!==null)n.childNodes=[{nodeType:3,textContent:value,parentElement:n}];return n;}
function harness(){const pairs=new DisplayPairs(),frames=[],messages=[],observers=[],events={},d={visibilityState:'visible',addEventListener:(k,f)=>events[k]=f},b={isEnabled:()=>h.enabled,isTranslationVisible:()=>h.visible,translationTarget:()=>h.target},h={pairs,frames,messages,b,d,enabled:true,visible:true,target:'zh',flush(){while(frames.length)frames.shift()();},change(){for(const o of observers)if(!o.closed)o.callback();this.flush();},source(text,sequence){const meta=pairs.source(text,{sequence,target:this.target});b.cardinalPair.source({cardinalPair:meta});return meta;}};
 h.observers=observers;const w={document:d,__tomoyoChinese:b,innerWidth:1000,innerHeight:700,getComputedStyle:n=>n.style,requestAnimationFrame:f=>frames.push(f),addEventListener:(k,f)=>events[k]=f,MutationObserver:class{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.closed=true;}},__tomoyoTranslateRequest:raw=>{const m=JSON.parse(raw);messages.push(m);if(m.type==='cardinalPairPolicy'){const result=pairs.setPolicy(m,h.target);if(result)b.cardinalPairScope(result);}else if(m.type==='cardinalPair')pairs.observe(m,h.target);}};
 d.createRange=()=>{let child;return {setStart(n){child=n;},setEnd(){},getClientRects:()=>child.parentElement?.inkRects||[child.parentElement?.getBoundingClientRect()],detach(){}};};DOM.install(w);return h;}
test('visible complete DOM pairs each occurrence, including normal cache-hit redraws',()=>{
 const h=harness(),jp=node('「これは本文です」'),cn=node('这是正文');h.pairs.availability('これは本文です','这是正文');const first=h.source('これは本文です',1);h.b.cardinalPair.bind(first,jp,cn);h.flush();assert.equal(h.pairs.snapshot(60).paired,1);const snapshot=h.pairs.snapshot(60);
 const second=h.source('これは本文です',2);assert.notEqual(second.episode,first.episode);assert.equal(h.pairs.snapshot(1).unobserved,1);h.b.cardinalPair.bind(second,jp,cn);h.flush();assert.equal(h.pairs.snapshot(60).paired,2);assert.equal(snapshot.paired,1);assert.equal(h.pairs.snapshot(60).reliable,true);
});
test('actual visible text excludes ruby readings and partial typewriter Japanese or Chinese',()=>{
 const h=harness(),meta=h.source('本文です',1),jp=node(null),base=node('本文です',{parent:jp}),ruby=node('ほんぶん',{tag:'RT',parent:jp}),cn=node('正');jp.childNodes=[base,ruby];h.pairs.availability('本文です','正文');h.b.cardinalPair.bind(meta,jp,cn);h.flush();assert.equal(h.pairs.snapshot(60).paired,0,'partial translation cannot pass backend content whitelist');
 cn.childNodes[0].textContent='正文';base.style.opacity='0';h.change();assert.equal(h.pairs.snapshot(60).paired,0,'hidden JP characters cannot count as complete');base.style.opacity='1';h.change();assert.equal(h.pairs.snapshot(60).paired,1,'visible ruby base matches without the reading');
});
test('hidden, disconnected, wrong-source and missing translations cannot borrow cache availability',()=>{
 for(const variant of ['hidden','disconnected','outside','wrong-source','missing','error']){const h=harness(),meta=h.source('これは本文です',1),jp=node('これは本文です'),cn=node('这是正文');h.pairs.availability(meta.body,'这是正文');if(variant==='hidden')cn.hidden=true;if(variant==='disconnected')cn.isConnected=false;if(variant==='outside')cn.getBoundingClientRect=()=>({left:0,top:800,right:400,bottom:830,width:400,height:30});if(variant==='wrong-source')jp.childNodes[0].textContent='別の本文';if(variant==='missing')cn.childNodes=[];if(variant==='error')cn.dataset.state='error';h.b.cardinalPair.bind(meta,jp,cn);h.flush();const result=h.pairs.snapshot(60);assert.equal(result.paired,0,variant);assert.equal(result.unpaired,variant==='wrong-source'?0:1);assert.equal(result.unobserved,variant==='wrong-source'?1:0);}
});
test('disabled occurrences are excluded without DOM; reenable and failed language switch need fresh observations',()=>{
 const h=harness();h.enabled=false;h.source('これは本文です',1);assert.equal(h.pairs.snapshot(1).excluded,1);h.enabled=true;h.b.cardinalPair.refresh();const jp=node('これは本文です'),cn=node('这是正文');h.pairs.availability('これは本文です','这是正文');h.b.cardinalPair.bind(null,jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).paired,1);
 const previous=h.messages.filter(m=>m.type==='cardinalPair').at(-1);h.target='en';h.b.cardinalPair.refresh();h.flush();assert.equal(h.pairs.snapshot(1).paired,0);assert.equal(h.pairs.snapshot(1).unobserved,1,'old Chinese DOM is not English evidence');assert.equal(h.pairs.observe(previous,'en'),false);
 cn.dataset.state='error';cn.childNodes=[];h.change();assert.equal(h.pairs.snapshot(1).unpaired,1);h.pairs.availability('これは本文です','This is text',{target:'en'});cn.dataset.state='ready';cn.childNodes=[{nodeType:3,textContent:'This is text',parentElement:cn}];h.change();assert.equal(h.pairs.snapshot(1).paired,1);
});
test('document visibility and ancestor styles are checked at observation time, with no perpetual animation loop',()=>{
 const h=harness(),meta=h.source('本文です',1),ancestor=node(''),jp=node('本文です',{parent:ancestor}),cn=node('正文');h.pairs.availability('本文です','正文');ancestor.hidden=true;h.b.cardinalPair.bind(meta,jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).unobserved,1);ancestor.hidden=false;h.d.visibilityState='hidden';h.change();assert.equal(h.pairs.snapshot(1).unobserved,1);h.d.visibilityState='visible';h.change();assert.equal(h.pairs.snapshot(1).paired,1);assert.equal(h.frames.length,0);h.flush();assert.equal(h.frames.length,0);
});

test('transparent source glyphs do not prove visible Japanese',()=>{const h=harness(),meta=h.source('本文です',1),jp=node('本文です'),cn=node('正文');h.pairs.availability('本文です','正文');jp.style.color='rgba(0, 0, 0, 0)';h.b.cardinalPair.bind(meta,jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).unobserved,1);jp.style.color='#fff';h.change();assert.equal(h.pairs.snapshot(1).paired,1);});

test('a fresh backend tape session renegotiates an unchanged UI policy',()=>{const h=harness(),jp=node('本文です'),cn=node('正文');h.pairs.availability('本文です','正文');h.b.cardinalPair.bind(h.source('本文です',1),jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).paired,1);Object.assign(h.pairs,new DisplayPairs());h.pairs.availability('本文です','正文');h.b.cardinalPair.bind(h.source('本文です',1),jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).paired,1);assert.equal(h.messages.filter(m=>m.type==='cardinalPairPolicy').length,2);});

test('a reused single-line DOM row owns one observer regardless of source count',()=>{const h=harness(),jp=node('本文です'),cn=node('正文');h.pairs.availability('本文です','正文');for(let i=1;i<=60;i++){h.b.cardinalPair.bind(h.source('本文です',i),jp,cn);h.flush();}assert.equal(h.pairs.snapshot(60).paired,60);assert.equal(h.observers.filter(o=>!o.closed).length,1);});

const rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
function clipped(which,ink,clip=null){const h=harness(),jp=node('本文です'),cn=node('正文'),target=which==='jp'?jp:cn;target.inkRects=[ink];target.getBoundingClientRect=()=>ink;if(clip)target.parentElement=clip;h.pairs.availability('本文です','正文');h.b.cardinalPair.bind(h.source('本文です',1),jp,cn);h.flush();const result=h.pairs.snapshot(1);assert.equal(result.paired,0,which);assert.equal(result.unobserved,which==='jp'?1:0,which);assert.equal(result.unpaired,which==='cn'?1:0,which);return h;}
test('all four viewport edges require the full Japanese and translation text ranges',()=>{
 for(const which of ['jp','cn'])for(const ink of [rect(-5,100,100,30),rect(950,100,100,30),rect(100,-5,100,30),rect(100,690,100,30)])clipped(which,ink);
});
test('overflow ancestors clip text independently on every edge and include their client box',()=>{
 for(const overflow of ['hidden','clip','auto','scroll'])for(const which of ['jp','cn'])for(const ink of [rect(90,120,30,20),rect(280,120,40,20),rect(120,90,30,20),rect(120,190,30,20)]){const clip=node('');clip.style.overflow=overflow;clip.getBoundingClientRect=()=>rect(100,100,200,100);clipped(which,ink,clip);}
 const clip=node('');clip.style.overflowX='hidden';clip.clientLeft=2;clip.clientWidth=180;clip.offsetWidth=200;clip.getBoundingClientRect=()=>rect(100,100,200,100);clipped('cn',rect(280,120,10,20),clip);
});
test('wrapped text and short complete sentences use text ranges instead of oversized container widths',()=>{
 const h=harness(),jp=node('本文'),cn=node('正文'),clip=node('');clip.style.overflow='hidden';clip.getBoundingClientRect=()=>rect(100,100,300,100);jp.parentElement=clip;cn.parentElement=clip;jp.getBoundingClientRect=cn.getBoundingClientRect=()=>rect(-1000,100,2500,100);jp.inkRects=[rect(110,110,80,20),rect(110,135,30,20)];cn.inkRects=[rect(110,160,90,20)];h.pairs.availability('本文','正文');h.b.cardinalPair.bind(h.source('本文',1),jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).paired,1,'all text is visible although the containers extend past viewport and clip');
});
test('a clipped fragment cannot masquerade as another complete cached translation',()=>{
 const h=harness(),jp=node('本文です'),cn=node(null),first=node('正文',{parent:cn}),tail=node('补充',{parent:cn});cn.childNodes=[first,tail];first.inkRects=[rect(0,0,40,20)];tail.inkRects=[rect(950,0,100,20)];h.pairs.availability('本文です','正文');h.pairs.availability('本文です','正文补充');h.b.cardinalPair.bind(h.source('本文です',1),jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).paired,0);assert.equal(h.pairs.snapshot(1).unpaired,1,'any clipped meaningful child invalidates the whole translation observation');
});

test('unknown, missing and throwing flag APIs cannot publish policy or observations, and can recover',()=>{
 for(const api of ['isEnabled','isTranslationVisible'])for(const kind of ['missing','undefined','string','throw']){const h=harness(),jp=node('本文です'),cn=node('正文');h.pairs.availability('本文です','正文');if(kind==='missing')delete h.b[api];if(kind==='undefined')h.b[api]=()=>undefined;if(kind==='string')h.b[api]=()=>'false';if(kind==='throw')h.b[api]=()=>{throw Error('injected API failure');};
  const meta=h.source('本文です',1);h.b.cardinalPair.bind(meta,jp,cn);assert.doesNotThrow(()=>h.flush());h.change();assert.deepEqual(h.messages,[],api+':'+kind);assert.equal(h.pairs.snapshot(1).unobserved,1);assert.equal(h.pairs.snapshot(1).reliable,false);
  h.b[api]=()=>true;h.b.cardinalPair.refresh();h.flush();assert.equal(h.pairs.snapshot(1).paired,1,api+':'+kind+' true recovery');assert.equal(h.pairs.snapshot(1).reliable,true);assert.equal(h.frames.length,0);
  h.b[api]=()=>false;h.b.cardinalPair.refresh();h.flush();assert.equal(h.pairs.snapshot(1).excluded,1,api+':'+kind+' false recovery');assert.equal(h.pairs.snapshot(1).shown,0);assert.equal(h.pairs.snapshot(1).reliable,true);
 }
});
test('flag API failure after policy negotiation suppresses measurements until event-driven recovery',()=>{
 const h=harness(),jp=node('本文です'),cn=node('正文'),meta=h.source('本文です',1);h.pairs.availability('本文です','正文');const policies=h.messages.length;h.b.isEnabled=()=>{throw Error('late API failure');};h.b.cardinalPair.bind(meta,jp,cn);h.flush();assert.equal(h.messages.length,policies);assert.equal(h.pairs.snapshot(1).unobserved,1);
 h.b.isEnabled=()=>true;h.b.cardinalPair.bind(null,jp,cn);h.flush();assert.equal(h.pairs.snapshot(1).paired,1);assert.equal(h.messages.filter(m=>m.type==='cardinalPairPolicy').length,2,'a valid existing event renegotiates instead of remaining locked');
});
