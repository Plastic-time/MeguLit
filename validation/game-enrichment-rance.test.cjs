'use strict';
// rance02.exe is looked up by a fixed Japanese title. VNDB's title for that work is 「ランス02改 反逆の少女たち」,
// so the old fixed title found it but never matched it, and the game got no VNDB entry or cover.
const test=require('node:test'),assert=require('node:assert/strict');
const {candidates,pickVn}=require('../services/game-enrichment.cjs');

// VNDB search results for the fixed title (2026-11-08).
const RESULTS=[
 {id:'v18970',title:'Rance 02 Kai - Hangyaku no Shoujo-tachi -',alttitle:'ランス02改 反逆の少女たち',titles:[{title:'Rance 02 Kai -The Rebellious Maidens-'},{title:'ランス02改 反逆の少女たち'},{title:'兰斯02 -反叛的少女们'}],aliases:['Rance 02改','R02']},
 {id:'v1427',title:'Rance II -Hangyaku no Shoujo-tachi-',alttitle:'ランスII　－反逆の少女たち－',titles:[{title:'ランスII　－反逆の少女たち－'}],aliases:[]},
];

test('rance02.exe is matched to its VNDB entry',()=>{
 const game={row:{title:'Rance02',executable:'D:\\Games\\Rance02\\rance02.exe'},original:{library:{names:['Rance02']}}};
 const titles=candidates(game);
 assert.equal(titles.map(title=>pickVn(RESULTS,title)).find(Boolean)?.id,'v18970');
});
