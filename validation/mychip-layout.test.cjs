'use strict';
/* 2026-11-21 (user: 让问号在圈的正中心，注册和登录不要和上面的我的主页冲突): signed out, the 我的主页 chip on the
   leaderboard showed its default avatar's ? to the right of the circle (the rank value's .lb-mychip>span padding also hit the
   avatar <span>) and 注册 / 登录 ran into 我的主页 (the global button font sets line-height 1 on the chip, so both lines were
   only as tall as their font size). The real web/ UI runs in headless Edge. Skipped without Edge. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {startService,startWeb,startEdge}=require('./library-views-perf.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const hasEdge=[process.env.MEGULIT_EDGE,'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe','C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].some(p=>p&&fs.existsSync(p));
const OPEN=`(()=>{const b=[...document.querySelectorAll('button,a,[role=tab]')].find(e=>/排行榜/.test(e.textContent));if(!b)return false;b.click();return true;})()`;
const PROBE=`(()=>{const c=document.querySelector('.lb-mychip');if(!c)return null;const a=c.querySelector('.leaderboard-avatar'),s=c.querySelector('small'),t=c.querySelector('strong');
 const r=document.createRange();r.selectNodeContents(a);const g=r.getBoundingClientRect(),ab=a.getBoundingClientRect();
 const line=n=>{const b=n.getBoundingClientRect(),k=getComputedStyle(n);return {top:b.top,bottom:b.bottom,lineHeight:parseFloat(k.lineHeight),fontSize:parseFloat(k.fontSize)};};
 return {dx:(g.left+g.width/2)-(ab.left+ab.width/2),dy:(g.top+g.height/2)-(ab.top+ab.height/2),small:line(s),strong:line(t),chip:c.getBoundingClientRect().height,text:t.textContent};})()`;
test('我的主页 chip: the default avatar ? sits in the middle of the circle, 注册 / 登录 does not run into 我的主页',{skip:!hasEdge&&'Edge not installed',timeout:180000},async()=>{
 const temp=fs.mkdtempSync(path.join(process.env.MEGULIT_WORK||os.tmpdir(),'megulit-mychip-'));const root=path.join(temp,'root');fs.mkdirSync(root);
 const service=startService(root);let web,cdp;
 try{web=await startWeb(service);cdp=await startEdge(path.join(temp,'edge'));
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
  await cdp.send('Page.navigate',{url:`http://127.0.0.1:${web.address().port}/#%7B%7D`});
  let opened=false;for(let i=0;i<80&&!opened;i++){await sleep(250);opened=await cdp.evaluate(OPEN).catch(()=>false);}
  assert.ok(opened,'leaderboard tab found');
  let s=null;for(let i=0;i<40&&!s;i++){await sleep(250);s=await cdp.evaluate(PROBE).catch(()=>null);}
  assert.ok(s,'我的主页 chip rendered');
  assert.equal(s.text,'注册 / 登录','signed out');
  assert.ok(Math.abs(s.dx)<=1&&Math.abs(s.dy)<=1.5,'? in the middle of the circle: '+JSON.stringify({dx:s.dx,dy:s.dy}));
  for(const [name,l] of [['我的主页',s.small],['注册 / 登录',s.strong]])
   assert.ok(l.lineHeight>=l.fontSize*1.3,name+' has room for its glyphs (its own line-height, not the button font\'s 1): '+JSON.stringify(l));
  assert.ok(s.small.bottom<=s.strong.top+.5,'注册 / 登录 starts below 我的主页: '+JSON.stringify({small:s.small,strong:s.strong}));
  assert.ok(s.chip<=40,'chip keeps its one-avatar height, '+s.chip);
 }finally{cdp?.stop();web?.close();await service.stop();await sleep(400);try{fs.rmSync(temp,{recursive:true,force:true});}catch{}}
});
