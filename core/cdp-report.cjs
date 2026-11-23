/* SPDX-License-Identifier: GPL-3.0-or-later */
'use strict';
const missingMethod=error=>error?.code===-32601||/^'[^']+' wasn't found$/.test(error?.message||'');
const BOOTSTRAP=String.raw`(function(){
 if(window.__megulitReport&&window.__megulitReport.__megulitQueue)return;
 var q=[];
 window.__megulitCdpTake=function(){var out=q;q=[];return JSON.stringify(out);};
 var report=function(s){if(typeof s!=='string')return;if(s.length>262144||q.length>=256){q=[];try{if(window.__megulitText)window.__megulitText.hide(false);if(window.__megulitRpgm)window.__megulitRpgm.config({roles:false,embed:false});}catch(e){}q.push(JSON.stringify({status:'CDP report queue exceeded; rendering disabled'}));return;}q.push(s);};
 report.__megulitQueue=true;window.__megulitReport=report;
})();`;
async function evaluate(c,expression){const r=await c.send('Runtime.evaluate',{expression,returnByValue:true});if(r?.exceptionDetails||r?.wasThrown)throw Error('CDP_SCRIPT_REJECTED');return r;}
/* Chrome 41 has Runtime.evaluate but no addBinding. Only a missing protocol method selects polling;
   an access denial or another runtime failure stays an error. No game files or global built-ins change. */
async function reporter(c,{report,active,status=()=>{}}){
 try{await c.send('Runtime.addBinding',{name:'__megulitReport'});return {legacy:false,bootstrap:async()=>{},drain:async()=>{}};}
 catch(error){if(!missingMethod(error))throw error;}
 let busy=false,timer;
 const drain=async()=>{if(busy||!active())return;busy=true;try{const r=await evaluate(c,'window.__megulitCdpTake?window.__megulitCdpTake():"[]"'),raw=r?.result?.value;if(typeof raw!=='string'||raw.length>67108864)throw Error('CDP_REPORT_INVALID');const items=JSON.parse(raw);if(!Array.isArray(items)||items.length>300||items.some(s=>typeof s!=='string'||s.length>262144))throw Error('CDP_REPORT_INVALID');if(active())for(const s of items)report(s);}finally{busy=false;}};
 const bootstrap=async()=>{if(!active())throw Error('READER_DISABLED');await evaluate(c,BOOTSTRAP);if(!timer){timer=setInterval(()=>drain().catch(e=>{if(active())status('legacy report '+e.message);}),200);timer.unref?.();}};
 c.closed.then(()=>clearInterval(timer));return {legacy:true,bootstrap,drain};
}
module.exports={reporter,evaluate,missingMethod,BOOTSTRAP};
