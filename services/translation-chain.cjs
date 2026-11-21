// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-19 (user rule, every game): a line the translation group's / official Chinese does not cover (no pairing, not
   recognised, a grown line) is never left as 「未翻译」 / 「翻译暂不可用」. It goes, in order, to
     1. the local model, when one is installed or chosen (a cold start is started here, as the chosen local engine is),
     2. an API the user bound (the chosen API engine, then any other API engine with a stored key),
     3. machine translation (Microsoft, then Google; both free and keyless).
   Only sources the user has set up are used; nothing new is switched on for them. Only when all fail does the line say so,
   and a background retry keeps going (Retries) and fills the translation in on screen and in the dialogue log.
   Per line, the same for every game; the result says which source gave it (never recorded as a group pairing). */
const {ENGINES}=require('../core/engines.cjs');
const API_BUILTIN=['gpt','deepseek','bing','deepl'];
const isLocal=p=>ENGINES[p]?.group==='local';
const isMt=p=>p==='google'||ENGINES[p]?.kind==='mt'&&ENGINES[p]?.keyless===true;
const isApi=p=>!isLocal(p)&&!isMt(p)&&(API_BUILTIN.includes(p)||!!ENGINES[p]);

/* The ordered option sets for one line.
   prefs: the reader preferences (provider, baseUrl, model, ...); hasKey(baseUrl): a key is stored for that API;
   localInstalled: a local model is installed (the runtime can start it). resolve: core/providers resolveOptions. */
function candidates(prefs,{hasKey=()=>false,localInstalled=false,resolve=require('../core/providers.cjs').resolveOptions}={}){
 const out=[],seen=new Set(),add=o=>{try{const r=resolve(o);const k=r.provider+'|'+(r.baseUrl||'')+'|'+(r.model||'');if(seen.has(k))return;seen.add(k);out.push(r);}catch{}};
 const chosen=String(prefs?.provider||'');
 if(isLocal(chosen))add({...prefs});else if(localInstalled)add({...prefs,provider:'sakura',baseUrl:'',model:''});
 const keyed=o=>{try{return ENGINES[o.provider]?.keyless===true||hasKey(resolve(o).baseUrl);}catch{return false;}};
 if(isApi(chosen)&&keyed(prefs))add({...prefs});
 for(const p of [...API_BUILTIN,...Object.keys(ENGINES)])if(p!==chosen&&isApi(p)&&!ENGINES[p]?.hidden){const o={...prefs,provider:p,baseUrl:'',model:''};if(ENGINES[p]?.keyless!==true&&keyed(o))add(o);}
 if(isMt(chosen))add({...prefs});
 add({...prefs,provider:'microsoft',baseUrl:'',model:''});add({...prefs,provider:'google',baseUrl:'',model:''});
 return out;
}
const sourceOf=o=>isLocal(o.provider)?'local':isMt(o.provider)?'mt':'api';

/* Tries each option until one gives a translation. attempt(options) -> string (throws or '' on failure). */
/* Tries each option until one gives a translation. attempt(options) -> string (throws or '' on failure).
   2026-11-21 (owner, 千恋＊万花 r34: fallback answers came 1 to 8 s late, after the line was gone): every attempt is timed (trace); with a
   budget, machine translation is started alongside once the budget is spent, its answer is shown first, and a better source that answers
   later replaces it (onLate). */
/* 2026-11-21 (owner, Fata 02:45Z: every line spent 0.5-0.7 s on deepseek "API 账户余额不足" before microsoft answered, the reader
   ran two or three lines behind): a provider whose account is out of balance, quota or key fails the same way on every line, so it
   is left out for PAUSE_MS after such an error; when every provider of the list is paused they are all tried as before. */
const PAUSE_MS=10*60*1000,paused=new Map();
const ACCOUNT=/余额不足|欠费|insufficient[ _-]?(balance|quota|funds)|quota|billing|balance|credit|invalid[ _-]?api[ _-]?key|unauthori[sz]ed|40[123]/i;
function pausedNow(provider,now=Date.now()){const t=paused.get(provider);if(t&&t>now)return true;if(t)paused.delete(provider);return false;}
async function translate(text,list,attempt,{isCurrent=()=>true,budgetMs=0,trace=null,onLate=null}={}){
 const errors=[];
 {const open=list.filter(o=>!pausedNow(o.provider));if(open.length&&open.length<list.length){try{trace?.('chain skipped '+list.filter(o=>pausedNow(o.provider)).map(o=>o.provider).join(',')+' (account error, paused)');}catch{}list=open;}}
 const timed=async options=>{const t0=Date.now();try{const t=String(await attempt(options)||'').trim();try{trace?.('chain '+options.provider+' '+(Date.now()-t0)+' ms '+(t?'ok':'empty'));}catch{}if(!t)errors.push(options.provider+': empty');return t;}catch(e){try{trace?.('chain '+options.provider+' '+(Date.now()-t0)+' ms failed '+String(e?.message||e).slice(0,60));}catch{}errors.push(options.provider+': '+(e?.message||e));if(ACCOUNT.test(String(e?.message||e)))paused.set(options.provider,Date.now()+PAUSE_MS);return '';}};
 const run=async items=>{for(const options of items){if(!isCurrent())break;const t=await timed(options);if(t)return {text:t,provider:options.provider,source:sourceOf(options),errors};}return null;};
 const fail=()=>{const e=Error('TRANSLATION_UNAVAILABLE');e.errors=errors;throw e;};
 const mt=list.filter(o=>isMt(o.provider));
 if(!(budgetMs>0)||!mt.length||list.every(o=>isMt(o.provider))){const r=await run(list);return r||fail();}
 const main=run(list);let timer=null;
 const quick=new Promise(res=>{timer=setTimeout(()=>{try{trace?.('chain budget '+budgetMs+' ms spent: machine translation alongside');}catch{}run(mt).then(res,()=>res(null));},budgetMs);});
 const first=await Promise.race([main.then(r=>({main:true,r})),quick.then(r=>({main:false,r}))]);
 if(first.main){clearTimeout(timer);return first.r||fail();}
 if(first.r){main.then(r=>{if(r&&r.source!=='mt'&&r.text!==first.r.text)try{onLate?.(r);}catch{}},()=>{});return {...first.r,early:true};}
 const r=await main;return r||fail();
}

/* Background retries for lines that got no translation: 5 s, 20 s, 1 min, then every 2 min, 8 times at most; a line that
   gets its translation is filled in (fill(text, result)) and forgotten. */
class Retries{
 constructor(run,fill,{delays=[5000,20000,60000,120000,120000,120000,120000,120000],timers={set:setTimeout,clear:clearTimeout}}={}){this.run=run;this.fill=fill;this.delays=delays;this.timers=timers;this.jobs=new Map();}
 add(text,context={}){const key=String(text||'').replace(/\s+/g,'');if(!key||this.jobs.has(key))return;const job={text,context,tries:0,timer:null};this.jobs.set(key,job);this.next(key,job);}
 next(key,job){if(job.tries>=this.delays.length){this.jobs.delete(key);return;}job.timer=this.timers.set(async()=>{job.tries++;try{const r=await this.run(job.text,job.context);if(r&&r.text){this.jobs.delete(key);this.fill(job.text,r,job.context);return;}}catch{}if(this.jobs.get(key)===job)this.next(key,job);},this.delays[job.tries]);job.timer?.unref?.();}
 clear(){for(const j of this.jobs.values())this.timers.clear(j.timer);this.jobs.clear();}
 get size(){return this.jobs.size;}
}
module.exports={candidates,translate,Retries,paused,PAUSE_MS,sourceOf,isLocal,isMt,isApi};
