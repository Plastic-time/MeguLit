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
function valid(v) {
 if (!only(v,['originalExe','script','runtimeExe','scriptFile','results','textBox']) ||
     ![v.originalExe,v.script,v.runtimeExe].every(hash) || !scriptFile(v.scriptFile) || !only(v.results,operations)) return false;
 return (Object.keys(v.results).length > 0 || v.textBox !== undefined) &&
  Object.values(v.results).every(r => only(r,['passed','source']) && typeof r.passed === 'boolean' && sources.includes(r.source)) &&
  (v.textBox === undefined || validBox(v.textBox));
}
function merge(before, patch) {
 if (!valid(patch) || before !== undefined && (!valid(before) ||
  ['originalExe','script','runtimeExe','scriptFile'].some(k => before[k] !== patch[k]))) throw Error('SEED_EVIDENCE_IDENTITY');
 return {...before,...patch,results:{...before?.results,...patch.results}};
}
// Layout consumers supply hashes of the files in their current session, and its current client extent.
function forSession(v, identity, client) {
 if (!valid(v) || !identity || ['originalExe','script','runtimeExe'].some(k => identity[k] !== v[k])) return null;
 return {results:structuredClone(v.results), ...(v.textBox && client ? {textBox:{...clientBox(v.textBox,client),source:v.textBox.source}} : {})};
}
module.exports={valid,merge,scriptFile,normalizeBox,clientBox,forSession};
