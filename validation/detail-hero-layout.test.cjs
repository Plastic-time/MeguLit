// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {launch}=require('../services/cardinal/cdp.cjs');
const web=path.join(__dirname,'../web'),read=f=>fs.readFileSync(path.join(web,f),'utf8');
const styles=[...read('index.html').matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(m=>m[1]).concat('detail-story.css');
const template=read('game-detail.js').split(/\r?\n/).find(line=>line.startsWith(' main.innerHTML='));
const labels=read('game-detail.js').slice(read('game-detail.js').indexOf('const labels='),read('game-detail.js').indexOf('export '));
const original={zh:'日文原版与恢复',ja:'日本語版と復元',en:'Japanese original & restore'};
const zero={zh:'零延迟翻译',ja:'ゼロ遅延翻訳',en:'Zero-latency translation'};
function hero(locale,title){
 const context={main:{},game:{title,available:true,engine:'KiriKiri',readingSeconds:137520,characters:412906,learnedWords:1284},data:{counts:{sessions:57}},locale,embed:{kind:'pending'},hook:'未测',esc:s=>String(s??''),cover:()=>'<div class="cover"></div>',icon:()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6Z"/></svg>',relativeTime:()=>'',originalLabel:()=>original[locale],zeroLatencyLabel:()=>zero[locale],zeroActivityLabel:()=>'',localeToggleHTML:()=>'',launchReason:()=>'',durHTML:()=> '38小时 12分',number:String};
 // The production template and its localized labels are used without starting the app or a game
 vm.runInNewContext(labels+'\nconst w=labels[locale];'+template,context);
 return context.main.innerHTML;
}
test('detail hero preserves title, tool labels and the complete rounded launch at four viewport widths',async()=>{
 const browser=await launch({viewport:{width:1360,height:900}}),page=browser.page;
 try{
  page.route(url=>{const u=new URL(url);if(u.origin!=='https://detail.invalid')return 'abort';const file=path.resolve(web,'.'+decodeURIComponent(u.pathname));if(!file.startsWith(web+path.sep)||!fs.existsSync(file))return 'abort';return {body:fs.readFileSync(file),headers:{'content-type':file.endsWith('.css')?'text/css':'application/octet-stream'}};});
  const html='<!doctype html><html data-theme="dark"><head>'+styles.map(f=>`<link rel="stylesheet" href="https://detail.invalid/${f}">`).join('')+'</head><body><main class="main" data-kids="dtv-bg" style="width:calc(100% - 64px);margin:0 32px;padding:0"></main></body></html>';
  await page.goto('data:text/html;charset=utf-8,'+encodeURIComponent(html));
  await page.evaluate(read('primary-buttons.js').replace('export function ','function '));
  await page.evaluate(()=>document.fonts.ready.then(()=>true));
  for(const width of [1360,1100,800,500]){
   await page.c.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   for(const locale of ['zh','ja','en'])for(const title of ['海市蜃楼之馆','ファタモルガーナの館 — The House in Fata Morgana — 長い作品名の折り返し確認']){
    await page.evaluate(html=>{document.querySelector('main').innerHTML=html;decoratePrimaryButtons(document.querySelector('main'));},hero(locale,title));
    await page.evaluate(()=>document.fonts.ready.then(()=>true));
    const result=await page.evaluate(()=>{
     const main=document.querySelector('main'),h=document.querySelector('.detail-title>h1'),actions=document.querySelector('.detail-actions'),b=actions.querySelector('[data-play]'),label=b.querySelector('span'),svg=b.querySelector('svg'),r=e=>e.getBoundingClientRect(),t=r(h),a=r(actions),p=r(b),l=r(label),i=r(svg),style=getComputedStyle(b);
     const tools=[...main.querySelectorAll('[data-edit],.detail-tool-links button')].map(e=>({width:e.clientWidth,scroll:e.scrollWidth,rect:r(e).toJSON(),font:parseFloat(getComputedStyle(e).fontSize)}));
     const stats=[...document.querySelectorAll('.detail-statistics .stat-card strong')].map(e=>{const range=document.createRange();range.selectNodeContents(e);return {box:r(e).toJSON(),text:range.getBoundingClientRect().toJSON()};});
     return {overflow:main.scrollWidth>main.clientWidth+1,titleScroll:h.scrollHeight,titleHeight:h.clientHeight,titleRight:t.right,mainRight:r(main).right,actionsTop:a.top,titleBottom:t.bottom,labelLeft:l.left,labelRight:l.right,iconRight:i.right,launchRight:p.right,launchHeight:p.height,clip:style.clipPath,radius:style.borderTopRightRadius,tools,stats};
    });
    const tag=width+'/'+locale+'/'+title;
    assert.equal(result.overflow,false,tag+' no hero overflow');assert.ok(result.titleScroll<=result.titleHeight+1,tag+' complete title height');assert.ok(result.titleRight<=result.mainRight+1,tag+' title inside main');assert.ok(result.actionsTop>=result.titleBottom,tag+' title does not overlap actions');
    assert.ok(result.iconRight+6<=result.labelLeft&&result.labelRight+8<=result.launchRight,tag+' star and complete launch label fit with padding');
    assert.equal(result.clip,'none',tag+' the launch label is unclipped');assert.equal(result.radius,'10px',tag+' rounded launch');
    assert.ok(result.launchHeight>=48,tag+' launch remains the primary action');
    for(const t of result.tools){assert.ok(t.scroll<=t.width+1,tag+' tool label fits');assert.ok(t.font>=13,tag+' tool text stays readable');assert.ok(t.rect.height>=40,tag+' tool has a full hit target');assert.ok(t.rect.right<=result.mainRight+1,tag+' tool stays inside main');}
    for(const s of result.stats)assert.ok(s.text.right<=s.box.right+1,tag+' statistic does not run into the next column');
   }
  }
 }finally{await browser.close();console.log('Detail layout headless browser closed: '+browser.pid);}
});
