// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {cardinal}=require('../profiles/defaults.cjs');
function eligible(doc){const r=doc?.record,d=doc?.detail;return !!(r?.schema==='megulit.cardinal-score'&&r.version===1&&String(r.cardinalRev)===String(cardinal.rev)&&doc.unreliable===false&&Array.isArray(doc.errors)&&doc.errors.length===0&&d?.pairObservation?.source==='live-display'&&d.pairObservation.reliable===true&&d?.leakObservation?.observed===true&&d?.timeline?.source==='measured-delivery'&&d.timeline.reliable===true&&d?.choiceObservation?.reliable===true);}
module.exports={eligible};
