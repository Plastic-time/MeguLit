// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const KEYS=['row','stable','clean','clear','choice','pair','leak'];
function toPoints(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)return null;return value===1?10:Math.min(9.99,Math.round(value*1000)/100);}
function format(value){const points=toPoints(value);return points===null?'未知':points+' / 10';}
function summary(result){return {scale:10,total:toPoints(result?.total),scores:Object.fromEntries(KEYS.map(key=>[key,toPoints(result?.scores?.[key])]))};}
module.exports={toPoints,format,summary};
