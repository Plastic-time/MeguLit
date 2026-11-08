// Exercise the original interaction reporter and the separate-HWND adapter together, without desktop windows.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function panel({x=100,y=80,width=400,height=300,hidden=false}={}){return {offsetParent:null,offsetLeft:x,offsetTop:y,offsetWidth:width,offsetHeight:height,closest:()=>hidden?{}:null,getClientRects:()=>[{}],getBoundingClientRect:()=>({left:x,top:y,right:x+width,bottom:y+height}),matches:()=>true};}
function environment(panels){return {document:{body:{classList:{contains:()=>false}},querySelectorAll:()=>panels},getComputedStyle:()=>({position:'fixed',display:'block',visibility:'visible'}),devicePixelRatio:1.5,innerWidth:1000,innerHeight:700};}
test('original normal-mode menu reporting gains only its actual panel region in the independent host',async()=>{
 const {hostRegionMessage}=await import('../web/reader/host-regions.js'),p=panel(),env=environment([p]),sent=[];let scheduled;
 const document={documentElement:{},body:env.document.body,querySelector:selector=>selector.includes('[open]')?p:null,querySelectorAll:()=>[],createElement:()=>({setAttribute(){},style:{},remove(){}}),addEventListener(){}};document.body.appendChild=()=>{};
 document.body.append=()=>{};const window={__tomoyoTranslateRequest:payload=>sent.push(hostRegionMessage(JSON.parse(payload),env))};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/reader/modules/interaction.js'),'utf8'),{window,document,devicePixelRatio:1.5,innerWidth:1000,innerHeight:700,queueMicrotask:fn=>{scheduled=fn;},ResizeObserver:class{observe(){}},MutationObserver:class{observe(){}},addEventListener(){},requestAnimationFrame:()=>1});
 scheduled();assert.equal(sent.length,1);assert.equal(sent[0].menuOpen,true);assert.deepEqual(sent[0].regions,[{x:150,y:120,width:600,height:450,menu:true}]);
});
test('native-mode and drag regions stay unchanged; hidden panels do not create an invisible click blocker',async()=>{
 const {hostRegionMessage}=await import('../web/reader/host-regions.js'),env=environment([panel({hidden:true})]),drag={type:'galHitRegions',menuOpen:true,regions:[{x:0,y:0,width:1500,height:1050}]};
 assert.equal(hostRegionMessage(drag,env),drag);const empty={type:'galHitRegions',menuOpen:true,regions:[]};assert.deepEqual(hostRegionMessage(empty,env).regions,[]);
 env.document.body.classList.contains=()=>true;assert.equal(hostRegionMessage(empty,env),empty);
});
test('normal panel bounds clip at viewport edges and retain display scaling',async()=>{
 const {hostRegionMessage}=await import('../web/reader/host-regions.js'),env=environment([panel({x:-50,y:600,width:400,height:300})]);
 assert.deepEqual(hostRegionMessage({type:'galHitRegions',menuOpen:true,regions:[]},env).regions,[{x:0,y:900,width:525,height:150,menu:true}]);
});

test('tab resizing updates host regions even when original normal-mode empty messages are deduplicated',async()=>{
 const {installHostRegions}=await import('../web/reader/host-regions.js'),p=panel(),env=environment([p]),sent=[];let changed,frame;
 env.ResizeObserver=class{constructor(callback){changed=callback;}observe(){}unobserve(){}};env.MutationObserver=class{observe(){}};env.document.documentElement={};env.document.addEventListener=()=>{};env.addEventListener=()=>{};env.requestAnimationFrame=fn=>{frame=fn;};
 installHostRegions(message=>sent.push(message),env);frame();assert.equal(sent.at(-1).regions[0].width,600);p.offsetWidth=600;changed();frame();assert.equal(sent.at(-1).regions[0].width,900);assert.equal(sent.length,2);changed();frame();assert.equal(sent.length,2);
});
