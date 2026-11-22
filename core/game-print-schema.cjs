// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// Shared fingerprint vocabulary and validation for the desktop and the Worker.
const LEVELS=['exe','head','pe','pack','script','steam','vndb','title'];
const VERSION_KINDS=['exe','head','pe'],GAME_KINDS=['pack','script','steam','vndb','title'];
const HEX=/^[0-9a-f]{64}$/;
const RULES={exe:HEX,head:HEX,pack:HEX,script:HEX,title:HEX,pe:/^\d{1,5}\.\d{1,5}\.\d{1,5}\.\d{1,5}@[0-9a-f]{8}$/,steam:/^\d{1,10}$/,vndb:/^v\d{1,7}$/,engine:/^[a-z0-9-]{1,32}$/};
function check(p){const out={};if(!p||typeof p!=='object')return out;for(const [k,re] of Object.entries(RULES)){const v=p[k]==null?'':String(p[k]).trim().toLowerCase();if(v&&re.test(v))out[k]=v;}return out;}
module.exports={LEVELS,VERSION_KINDS,GAME_KINDS,RULES,check};
