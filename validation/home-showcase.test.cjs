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
test('home and detail veil defaults and clamping',()=>{
 const fs=require('fs'),os=require('os'),path=require('path'),root=fs.mkdtempSync(path.join(os.tmpdir(),'veil-'));fs.mkdirSync(path.join(root,'data'),{recursive:true});
 let p=store.publicPreferences(root);assert.equal(p.homeVeil,.9);assert.equal(p.homeVeilBlur,18);assert.equal(p.detailVeil,.68);assert.equal(p.detailVeilBlur,8);
 fs.writeFileSync(path.join(root,'data','preferences.json'),JSON.stringify({homeVeil:3,homeVeilBlur:-5,detailVeil:.4,detailVeilBlur:99}));
 p=store.publicPreferences(root);assert.equal(p.homeVeil,1);assert.equal(p.homeVeilBlur,0);assert.equal(p.detailVeil,.4);assert.equal(p.detailVeilBlur,40);
});
