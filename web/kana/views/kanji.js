/* SPDX-License-Identifier: GPL-3.0-or-later
   MeguLit kana module · view: kanji (汉字读音 · 漢字でGO!)
   Shows PLiCy's official page unmodified, ads and credit included, in a borderless window owned by MeguLit
   that is kept exactly over the frame below. Nothing from the game is copied or cached by MeguLit. */
export function view(el,ctx){
el.className='v-kanji';
el.innerHTML=`<div class="wrap">
  <div class="kg-head">
    <div><a class="back" href="index.html">← 学习</a><h1>汉字读音<small>漢字でGO!</small></h1></div>
    <div class="kg-actions"><button class="kg-btn" id="kg-browser">在浏览器打开 ↗</button><button class="kg-btn" id="kg-window">独立窗口</button></div>
  </div>
  <p class="kg-note"><b>外部网站 · 与 MeguLit 无关</b>　下面是 PLiCy 上的《漢字でGO!》（作者 Micelle）官方页面，原样显示。MeguLit 只是推荐这款汉字读音游戏，不运营、不控制这个网站；页面里的内容、广告和链接由 PLiCy 及其广告商负责</p>
  <div class="kg-frame" id="kg-frame"><p>正在打开 plicy.net …</p></div>
</div>`;
const frame=el.querySelector('#kg-frame'),invoke=ctx.invoke;
if(!invoke)frame.innerHTML='<p>当前环境不能内嵌网页，请用「在浏览器打开」</p>';
let last='',stopped=false,open=false,busy=false,queued=false;
/* 外层 MeguLit 页面在这一页不滚动（离开时恢复） */
let locked=null;
function lockScroll(on){const main=document.querySelector('#main')||document.scrollingElement;if(!main)return;if(on){main.scrollTop=0;locked={main,overflow:main.style.overflow};main.style.overflow='hidden';}else if(locked){locked.main.style.overflow=locked.overflow;locked=null;}}
/* 让整页正好占满窗口，不出现外层滚动条，网页区域就不会跟着滚走 */
function fit(){const r=frame.getBoundingClientRect();frame.style.height=Math.max(260,innerHeight-r.top-18)+'px';}
function send(){
 if(stopped||!invoke)return;
 if(!frame.isConnected){stop();return;}
 fit();
 const r=frame.getBoundingClientRect(),visible=r.width>40&&r.height>40&&document.visibilityState==='visible';
 if(!visible){if(open){open=false;last='';invoke('kanji_go_hide').catch(()=>{});}return;}
 /* 边框内缩 1px，网页正好落在圆角框里 */
 /* PLiCy 页面最宽的部分约 1180px：按边框宽度放大，让游戏填满并居中 */
 const box={x:Math.round(r.left)+1,y:Math.round(r.top)+1,width:Math.round(r.width)-2,height:Math.round(r.height)-2};box.zoom=Math.round(Math.min(1.5,Math.max(1,box.width/1180))*100)/100;/* 主窗口被拖动或换屏时，贴着的小窗口也要跟着走 */
 const key=Object.values(box).join(',')+'|'+screenX+','+screenY+','+devicePixelRatio;
 if(key===last)return;
 if(busy){queued=true;return;}
 busy=true;last=key;
 invoke('kanji_go_embed',box).then(()=>{open=true;}).catch(error=>{last='';ctx.toast('网页区域打开失败：'+String(error?.message||error));}).finally(()=>{busy=false;if(queued){queued=false;send();}});
}
function stop(){if(stopped)return;stopped=true;lockScroll(false);clearInterval(timer);removeEventListener('resize',send);document.removeEventListener('visibilitychange',send);if(invoke)invoke('kanji_go_hide').catch(()=>{});}
const timer=invoke?setInterval(send,120):0;
if(invoke){addEventListener('resize',send);document.addEventListener('visibilitychange',send);requestAnimationFrame(()=>{lockScroll(true);send();});}
/* 鼠标在这一页上滚轮时不滚动 MeguLit 外层页面 */
el.addEventListener('wheel',e=>e.preventDefault(),{passive:false});
el.querySelector('#kg-browser').onclick=()=>ctx.api('open_source',{url:'https://plicy.net/GamePlay/155561'}).catch(()=>ctx.toast('无法打开浏览器'));
el.querySelector('#kg-window').onclick=()=>{stop();(invoke?invoke('kanji_go_open'):Promise.reject()).catch(()=>ctx.toast('无法打开窗口'));ctx.go('index.html');};
ctx.onLeave?.(stop);
}
