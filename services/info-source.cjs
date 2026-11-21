// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 (owner: 作品和游戏社的介绍默认中文界面取萌娘百科、其他语言取 VNDB，并且能手动切换) where the introductions come from.
   library.json infoSource: 'auto' (default: the Chinese UI asks Moegirlpedia first and falls back to VNDB when it has no page; every other
   language uses VNDB), 'moegirl' (Moegirlpedia first in any UI language) or 'vndb' (VNDB only). The setting is independent of the UI language. */
const fs=require('node:fs'),path=require('node:path');
const VALUES=['auto','moegirl','vndb'];
function get(root){try{const v=JSON.parse(fs.readFileSync(path.join(root,'data','config','library.json'),'utf8')).infoSource;return VALUES.includes(v)?v:'auto';}catch{return 'auto';}}
const prefersMoegirl=(source,locale)=>source==='moegirl'||(source==='auto'&&locale==='zh');
module.exports={get,VALUES,prefersMoegirl,forRoot:(root,locale)=>prefersMoegirl(get(root),locale)};
