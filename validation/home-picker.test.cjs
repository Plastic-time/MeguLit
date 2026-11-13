/* 2026-11-13 hand editor: a tab docked on the right edge (slides out on hover, tucks back) opens a window where library games are ticked
   into or out of the home hand; the old "全部作品" card and the "+" card are gone */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const WEB=path.join(__dirname,'..','web');

test('ticked games become the hand in order; nothing ticked goes back to recently played',async()=>{
 const {applyHandPick,HAND_MAX}=await import('../web/home-picker.js');
 const prev={mode:'auto',order:['x'],pinned:['a','z'],hidden:['b','q']};
 assert.deepEqual(applyHandPick(prev,['b','a','b','c']),{mode:'pick',order:['b','a','c'],pinned:['a'],hidden:['q']});
 assert.deepEqual(applyHandPick(prev,[]),{mode:'auto',order:[],pinned:[],hidden:['b','q']});
 assert.equal(applyHandPick({},Array.from({length:20},(_,i)=>'g'+i)).order.length,HAND_MAX);
 const {showcaseGames}=await import('../web/home-tv.js');
 const games=['a','b','c','d'].map((id,i)=>({id,title:id,lastPlayedAt:i}));
 assert.deepEqual(showcaseGames(games,applyHandPick({},['c','a'])).map(g=>g.id),['c','a'],'the home hand shows exactly the ticked games');
});

test('the window lists the current hand first, then the rest of the library by recent play; full hand blocks adding',async()=>{
 const {pickerRows,togglePick,HAND_MAX}=await import('../web/home-picker.js');
 const games=[{id:'a',lastPlayedAt:1},{id:'b',lastPlayedAt:5},{id:'c',lastPlayedAt:3},{id:'gone',available:false},{id:'d',lastLaunchedAt:9}];
 assert.deepEqual(pickerRows(games,['c','a']).map(g=>g.id),['c','a','d','b']);
 assert.deepEqual(togglePick(['a'],'b'),['a','b']);assert.deepEqual(togglePick(['a','b'],'a'),['b']);
 const full=Array.from({length:HAND_MAX},(_,i)=>'g'+i);assert.equal(togglePick(full,'new'),full);assert.equal(togglePick(full,'g0').length,HAND_MAX-1);
});

test('home page: no 全部作品 / + cards in the hand; a docked tab slides out on hover and opens the picker',()=>{
 const js=fs.readFileSync(path.join(WEB,'home-tv.js'),'utf8'),css=fs.readFileSync(path.join(WEB,'home-tv.css'),'utf8'),pick=fs.readFileSync(path.join(WEB,'home-picker.js'),'utf8');
 for(const gone of ['tv-hc-add','tv-hc-all','tv-drawer','hand.setExtras('])assert.ok(!js.includes(gone),gone+' is gone');
 assert.ok(js.includes('createDock(')&&js.includes('openHandPicker('));
 assert.match(css,/\.tv-dock\{[^}]*right:0;[^}]*border-radius:16px 0 0 16px!important;[^}]*transform:translateX\(calc\(100% - \d+px\)\)/,'rounded tab tucked into the right edge');
 assert.match(css,/\.tv-dock\.out\{transform:none\}/);
 assert.ok(pick.includes("addEventListener('pointerenter'")&&pick.includes("addEventListener('pointerleave'"),'opens on hover, tucks back when the pointer leaves');
 assert.ok(pick.includes('aria-modal="true"')&&pick.includes("e.key==='Escape'"),'the window is a modal that Escape closes');
});
