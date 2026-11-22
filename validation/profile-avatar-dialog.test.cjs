'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startWeb,startEdge}=require('./library-views-perf.cjs');
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(file=>file&&fs.existsSync(file));

test('the profile avatar crop accepts clicks above the profile and displays the approved upload',{skip:!hasEdge&&'Edge not installed',timeout:45000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-avatar-dialog-'));
 let server,browser;
 try{
  server=await startWeb({call:async()=>null});
  browser=await startEdge(path.join(temp,'edge'));
  const base=`http://127.0.0.1:${server.address().port}`;
  await browser.send('Page.navigate',{url:base+'/background-crop.css'});
  const crop=await browser.evaluate(`(async()=>{
   for(const name of ['background-crop.css','controls.css','leaderboard.css']){
    const link=Object.assign(document.createElement('link'),{rel:'stylesheet',href:'/'+name});
    await new Promise(resolve=>{link.onload=resolve;document.head.append(link);});
   }
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#ab4521';ctx.fillRect(0,0,64,64);
   const png=await new Promise(resolve=>canvas.toBlob(resolve));
   const originalClick=HTMLInputElement.prototype.click;
   HTMLInputElement.prototype.click=function(){
    if(this.type!=='file')return originalClick.call(this);
    const files=new DataTransfer();files.items.add(new File([png],'avatar.png',{type:'image/png'}));
    this.files=files.files;this.dispatchEvent(new Event('change'));
   };
   const profile=await import('/profile-panel.js');
   const name='Reader';
   const api=async(action,args)=>{
    if(action==='account_status')return {configured:true,loggedIn:true};
    if(action==='leaderboard_profile')return {configured:true,joined:true,name};
    if(action==='leaderboard_profile_get')return {state:'ok',joined:true,favorites:[]};
    if(action==='leaderboard_avatar_status')return {state:'ok',status:'none'};
    if(action==='leaderboard_avatar_set'){window.upload=args.data;return {state:'ok',status:'approved'};}
    if(action==='leaderboard_join'){window.savedName=args.name;return {state:'ok'};}
    return [];
   };
   const panel=await profile.openProfilePanel({api,locale:'en',esc:String,toast:()=>{}});
   const button=panel.querySelector('[data-hero-avatar]');button.click();
   for(let i=0;i<100&&!document.querySelector('.avatar-crop');i++)await new Promise(r=>setTimeout(r,20));
   const box=document.querySelector('.avatar-crop');
   const confirm=box?.querySelector('[data-ok]');
   if(!confirm)return null;
   const rect=confirm.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
   return {x,y,clickable:document.elementFromPoint(x,y)===confirm,focused:document.activeElement===confirm,panelOpen:panel.open};
  })()`);
  assert.ok(crop,'the normal avatar action opens the crop');
  assert.deepEqual({clickable:crop.clickable,focused:crop.focused,panelOpen:crop.panelOpen},{clickable:true,focused:true,panelOpen:true});
  await browser.send('Input.dispatchMouseEvent',{type:'mousePressed',x:crop.x,y:crop.y,button:'left',clickCount:1});
  await browser.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:crop.x,y:crop.y,button:'left',clickCount:1});
  const result=await browser.evaluate(`(async()=>{
   for(let i=0;i<100&&!document.querySelector('[data-hero-avatar] img');i++)await new Promise(r=>setTimeout(r,20));
   const img=document.querySelector('[data-hero-avatar] img');
   return {uploaded:window.upload?.startsWith('data:image/webp;base64,')===true,picture:!!img&&img.src===window.upload,
    cropClosed:!document.querySelector('.avatar-crop'),profileOpen:document.querySelector('.profile-panel').open};
  })()`);
  assert.deepEqual(result,{uploaded:true,picture:true,cropClosed:true,profileOpen:true});
  const rename=await browser.evaluate(`(async()=>{
   document.querySelector('[data-hero-name]').click();
   const input=document.querySelector('.profile-hero-name-input');
   input.value='New reader';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   const {navigation}=await import('/settings-layout.js');
   return {savedName:window.savedName,profileInSettings:navigation.some(category=>category.ids.includes('personal'))};
  })()`);
  assert.deepEqual(rename,{savedName:'New reader',profileInSettings:true});
 }finally{await browser?.stop();server?.close();fs.rmSync(temp,{recursive:true,force:true});}
});
