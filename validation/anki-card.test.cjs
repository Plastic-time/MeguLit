const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function renderer(){
 const handlers={},events={},sent=[],moved=[],classes=new Set();let replacements=0,played=0,paused=0;
 const audio={hidden:false,controls:true,addEventListener(){},pause(){paused++;},async play(){played++;}},media={querySelector:()=>audio};
 const button={parentElement:media,setAttribute(){},hasAttribute:()=>false},fallback={hasAttribute:()=>true};
 const destination={closest:()=>({}),querySelector:()=>null,append:node=>moved.push(node)};
 // The word audio is in BackSide, while its visible placeholder is in FrontSide.
 const source={querySelector:()=>media,querySelectorAll:()=>[media]};
 const phrase={cloneNode:()=>({querySelectorAll:()=>[],textContent:'縁もゆかりもない'})};
 const frontList={dataset:{},querySelectorAll:()=>[phrase],querySelector:()=>null},backList={querySelectorAll:()=>[phrase]};
 const front={contains:node=>node===destination,querySelector:()=>frontList},back={querySelector:()=>backList};
 const root={style:{setProperty(){}},classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},replaceChildren(){replacements++;},
  querySelector:s=>s==='#FrontSide.CardSide'?front:back,
  querySelectorAll:s=>s==='.VocabAudio'?[destination,source]:s==='[data-anki-play]'?[button]:s==='[data-anki-replay]'?[fallback]:s==='audio'||s==='audio[src]'||s==='img,video,audio'?[audio]:[],
  addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
 fallback.setAttribute=()=>{};
 const document={querySelector:s=>s==='#card-content'?root:s==='#card-viewport'?{scrollTop:0}:s==='#card-stage'?{}:{hidden:true},createElement:()=>({content:{querySelectorAll:()=>[]}})};
 const parent={postMessage:message=>sent.push(message)};
 const context={document,parent,location:{hash:'#frame-123'},addEventListener:(name,fn)=>handlers[name]=fn,requestAnimationFrame(){},ResizeObserver:class{observe(){}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/anki-card.js'),'utf8'),context);
 const load=source=>handlers.message({source,data:{type:'tome-anki-card',nonce:'frame-123',html:'fixture'}});
 return {parent,load,handlers,events,sent,moved,classes,audio,button,fallback,frontList,get replacements(){return replacements;},get played(){return played;},get paused(){return paused;}};
}
test('isolated card only accepts its parent and restores the hidden BackSide word player to the visible front',()=>{
 const r=renderer();r.load({});assert.equal(r.replacements,0);r.load(r.parent);assert.equal(r.replacements,1);assert.equal(r.moved.length,1);assert(r.classes.has('compact-eggroll'));assert.equal(r.frontList.dataset.tomeDuplicate,'true');assert.equal(r.audio.hidden,true);assert.equal(r.audio.controls,false);
});
test('a card play click starts its own audio; only the explicit fallback asks the parent to replay',async()=>{
 const r=renderer();r.load(r.parent);const before=r.paused,click=async button=>{for(const fn of r.events.click)await fn({target:{closest:selector=>selector==='a'?null:button},preventDefault(){}});};
 assert.equal(r.played,0);
 await click(r.button);assert.equal(r.played,1);assert.equal(r.paused,before+1);assert.equal(r.audio.currentTime,0);assert.equal(r.sent.length,0);
 await click(r.fallback);assert.equal(r.played,1);assert.equal(r.sent.length,1);assert.equal(r.sent[0].type,'tome-anki-replay');assert.equal(r.sent[0].nonce,'frame-123');
});
test('playing all managed audio requires the authenticated explicit play message',()=>{
 const r=renderer(),data={type:'tome-anki-play-all',nonce:'frame-123'};
 r.load(r.parent);r.handlers.message({source:{},data});assert.equal(r.played,0);
 r.handlers.message({source:r.parent,data});assert.equal(r.played,1);
});
test('card volume combines master and track gains without replaying audio',()=>{
 const r=renderer();
 r.audio.dataset={ankiChannel:'game'};
 r.load(r.parent);
 const data={type:'tome-anki-mix',nonce:'frame-123',mix:{master:50,game:20,word:100}};
 r.handlers.message({source:{},data});assert.equal(r.audio.volume,1);
 r.handlers.message({source:r.parent,data});assert.equal(r.audio.volume,.1);
 assert.equal(r.played,0);
});
