// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const scriptFile=s=>typeof s==='string'&&s.length>0&&s.length<=200&&!/[\\:\x00-\x1f]/.test(s)&&s.split('/').length<=4&&s.split('/').every(p=>p&&p!=='.'&&p!=='..'&&!/[. ]$/.test(p))&&/\.(xp3|pck|arc|dat|int|rpa|rpyc|ks|scr|nsa|bin|ykc|pack|mes|txt)$/i.test(s);
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const only = (v, keys) => object(v) && Object.keys(v).every(k => keys.includes(k));
const sources = ['operator', 'live-display', 'engine'];
const operations = ['read', 'hide', 'replace', 'pointRead'];

function validBox(box) {
 return only(box, ['source','x','y','width','height']) && sources.includes(box.source) &&
  ['x','y','width','height'].every(k => Number.isFinite(box[k]) && box[k] >= 0 && box[k] <= 1) &&
  box.width > 0 && box.height > 0 && box.x + box.width <= 1 + 1e-12 && box.y + box.height <= 1 + 1e-12;
}

// Box and client extent must use the same client-relative coordinate system.
function normalizeBox(box, client, source) {
 const normalized = {source, x:box.x/client.width, y:box.y/client.height,
  width:box.width/client.width, height:box.height/client.height};
 if (![client.width,client.height].every(n => Number.isFinite(n) && n > 0) || !validBox(normalized)) throw Error('SEED_CLIENT_BOX');
 return normalized;
}
function clientBox(box, client) {
 if (!validBox(box) || ![client.width,client.height].every(n => Number.isFinite(n) && n > 0)) throw Error('SEED_CLIENT_BOX');
 return {x:box.x*client.width,y:box.y*client.height,width:box.width*client.width,height:box.height*client.height};
}
const actions = ['restore-japanese','offline','advance','open-choices','select-choice','point-read'];
const expectations = ['original-hidden','translation-visible','local-pair','choices-complete','point-readable','original-visible'];
const boundedList = (v, max, check) => Array.isArray(v) && v.length > 0 && v.length <= max && v.every(check);
const index = n => Number.isSafeInteger(n) && n >= 0 && n < 1000000;
function scenario(s) {
 return only(s,['scene','textHash','choice','steps','expect']) &&
  (s.scene !== undefined || s.textHash !== undefined) && (s.scene === undefined || index(s.scene)) &&
  (s.textHash === undefined || hash(s.textHash)) && (s.choice === undefined || index(s.choice)) &&
  boundedList(s.steps,32,a=>actions.includes(a)) && (!s.steps.includes('select-choice') || index(s.choice)) &&
  boundedList(s.expect,8,e=>expectations.includes(e));
}
const observation = r => only(r,['passed','source']) && typeof r.passed === 'boolean' && sources.includes(r.source);
function trial(t) {
 return only(t,['reader','stream','revision','results']) && typeof t.reader === 'string' &&
  /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[a-z]|-(?:alpha|beta|rc)\.\d{1,4})?$/.test(t.reader) &&
  hash(t.stream) && Number.isSafeInteger(t.revision) && t.revision > 0 && only(t.results,operations) &&
  Object.keys(t.results).length > 0 && Object.values(t.results).every(r => {
   if (!only(r,['passed','source','failure'])) return false;
   const {failure,...result}=r;
   return observation(result) && (failure===undefined || !r.passed &&
    ['original-visible','missing-text','wrong-pair','misplaced','no-hit','unreadable'].includes(failure));
  });
}
const trialKey = t => [t.reader,t.stream,t.revision].join('/');
function valid(v) {
 if (!only(v,['originalExe','script','runtimeExe','scriptFile','results','textBox','scenarios','trials']) ||
     ![v.originalExe,v.script,v.runtimeExe].every(hash) || !scriptFile(v.scriptFile) || !only(v.results,operations)) return false;
 return (Object.keys(v.results).length > 0 || v.textBox !== undefined || v.scenarios || v.trials) &&
  (v.scenarios === undefined || boundedList(v.scenarios,32,scenario)) &&
  (v.trials === undefined || boundedList(v.trials,128,trial) && new Set(v.trials.map(trialKey)).size === v.trials.length) &&
  Object.values(v.results).every(observation) &&
  (v.textBox === undefined || validBox(v.textBox));
}
function merge(before, patch) {
 if (!valid(patch) || before !== undefined && (!valid(before) ||
  ['originalExe','script','runtimeExe','scriptFile'].some(k => before[k] !== patch[k]))) throw Error('SEED_EVIDENCE_IDENTITY');
 const merged = {...before,...patch,results:{...before?.results,...patch.results}};
 if (patch.trials) {
  const trials = new Map((before?.trials || []).map(t => [trialKey(t),t]));
  for (const t of patch.trials) {
   const key = trialKey(t);
   trials.set(key,{...t,results:{...trials.get(key)?.results,...t.results}});
  }
  merged.trials = [...trials.values()];
 }
 if (!valid(merged)) throw Error('SEED_EVIDENCE_LIMIT');
 return merged;
}
// Layout consumers supply hashes of the files in their current session, and its current client extent.
function forSession(v, identity, client) {
 if (!valid(v) || !identity || ['originalExe','script','runtimeExe'].some(k => identity[k] !== v[k])) return null;
 return {results:structuredClone(v.results), ...(v.textBox && client ? {textBox:{...clientBox(v.textBox,client),source:v.textBox.source}} : {})};
}
// Legacy capabilities have no scoped trials. A recorded capability needs a pass in this exact context.
function verdict(profile, context, capability) {
 const e = profile?.evidence;
 if (!e?.trials?.some(t=>Object.hasOwn(t.results,capability))) return 'legacy';
 if (['originalExe','runtimeExe','script'].some(k=>e[k]!==context?.[k])) return 'untested';
 const trial = e.trials.find(t=>t.revision===profile.rev && t.reader===context.reader && t.stream===context.stream);
 const result = trial?.results[capability];
 return result ? (result.passed ? 'passed' : 'failed') : 'untested';
}
function status(profile,context) {
 return Object.fromEntries(operations.map(k=>[k,verdict(profile,context,k)]));
}
function applyStatus(part, capabilityStatus) {
 const inactive=k=>['untested','failed'].includes(capabilityStatus[k]);
 const settings=structuredClone(part.settings || {});
 let mode=part.mode;
 if (inactive('hide') || inactive('read')) {
  mode='read';
  settings.hide={...settings.hide,drawsHidden:false,textEffectsRead:true};
 }
 if (inactive('replace') || inactive('read')) settings.draw={...settings.draw,embed:false,embedTranslation:false};
 return {...part,settings,mode};
}
module.exports={verdict,status,applyStatus,valid,merge,scriptFile,normalizeBox,clientBox,forSession};
