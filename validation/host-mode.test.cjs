const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('dedicated reader mode does not poll legacy media routes or navigate on repeated status reports',()=>{
 const routes=[],intervals=[],values=new Map([['tomoyo-interface-mode','normal'],['tomoyo-reader-path','/media/9']]);
 const classes={toggle(){},remove(){},add(){},contains:()=>false},root={classList:classes},window={__tomeOverlayRoute:path=>routes.push(path),__tomeCreateTaskbarSync:()=>()=>{},__TAURI_INTERNALS__:{invoke:async()=>{}},dispatchEvent(){},__tomoyoChinese:{applyTransparency(){}}};
 const document={documentElement:root,body:{classList:classes},querySelectorAll:()=>[],querySelector:()=>({}),addEventListener(){},createElement:()=>({}),head:{appendChild(){}}};
 const context={window,document,location:{pathname:'/reader/index.html'},localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)},sessionStorage:{getItem:()=>1,setItem(){}},setInterval:fn=>intervals.push(fn),setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:()=>1,matchMedia:()=>({matches:false}),Event:class{},innerHeight:700};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/reader/modules/interface-mode-host.js'),'utf8'),context);
 window.__tomoyoMode.set('translation',false);for(let i=0;i<100;i++)window.__tomoyoMode.set('translation',false);
 /* E272: a game binding by itself (not Alt+M) does not move the home window away */
 assert.deepEqual(routes,[]);assert.equal(intervals.length,0);
 window.__tomoyoMode.set('normal',false);routes.length=0;window.__tomoyoMode.set('translation',true);assert.deepEqual(routes,['@reader']);
 window.__tomoyoMode.set('normal',true);for(let i=0;i<100;i++)window.__tomoyoMode.set('normal',false);assert.deepEqual(routes,['@reader','@home']);
});
