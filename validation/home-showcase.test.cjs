const test=require('node:test'),assert=require('node:assert');
const store=require('../services/store.cjs');
test('home showcase keeps only ids and a known mode',()=>{
 assert.deepEqual(store.cleanHomeShowcase({mode:'pick',order:['a','a',3,'b'],pinned:['b'],hidden:null,extra:1}),{mode:'pick',order:['a','b'],pinned:['b'],hidden:[]});
 assert.deepEqual(store.cleanHomeShowcase('x'),{mode:'auto',order:[],pinned:[],hidden:[]});
});
test('home showcase order: pinned first, picks, recent fallback, hidden never',async()=>{
 const {showcaseGames}=await import('../web/home-tv.js');
 const games=[{id:'a',lastPlayedAt:3},{id:'b',lastPlayedAt:2},{id:'c',lastPlayedAt:1},{id:'d',lastPlayedAt:9,available:false}];
 assert.deepEqual(showcaseGames(games,null).map(g=>g.id),['a','b','c']);
 assert.deepEqual(showcaseGames(games,{pinned:['c'],hidden:['a']}).map(g=>g.id),['c','b']);
 assert.deepEqual(showcaseGames(games,{mode:'pick',order:['b','a'],pinned:['c']}).map(g=>g.id),['c','b','a']);
 assert.deepEqual(showcaseGames(games,{mode:'pick',order:['a'],hidden:['a']}).map(g=>g.id),['b','c']);
});
