// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 NSFW setting, the page side. While the setting is off (default), a cover VNDB rates adult (services/nsfw.cjs says which
   cover files) is shown behind a veil: blur plus one line of text; a click shows that one cover until the app is closed. Every
   picture of the app passes through here, so no screen has to know about it: one observer finds the <img> (and inline
   background-image) of a flagged cover file wherever it is drawn. Turning the setting on asks "are you 18" first (confirmAdult). */
const W={
 zh:{veil:'成人内容 · 在设置里开启后显示',tip:'点击只临时查看这一张',askTitle:'你已满 18 岁吗？',askBody:'成人向封面可能包含裸露或暴力内容。只有已满 18 岁（或所在地区的法定成年年龄）才应该打开。',yes:'我已满 18 岁，打开',no:'取消'},
 en:{veil:'Adult content · shown when enabled in Settings',tip:'Click to see only this one for now',askTitle:'Are you 18 or older?',askBody:'Adult covers can contain nudity or violence. Turn this on only if you are 18 or older (or of legal age where you live).',yes:'I am 18 or older, turn on',no:'Cancel'},
 ja:{veil:'成人向け · 設定でオンにすると表示',tip:'クリックでこの 1 枚だけ一時的に表示',askTitle:'18 歳以上ですか？',askBody:'成人向けの表紙には露骨な表現や暴力表現が含まれることがあります。18 歳以上（またはお住まいの地域の成人年齢以上）の方だけオンにしてください。',yes:'18 歳以上です。オンにする',no:'キャンセル'}};
const state={on:false,flagged:new Set(),revealed:new Set()};
let words=W.zh,observer=null,timer=0,retries=0,started=false;
export const nsfwOn=()=>state.on;
const nameOf=src=>{try{const u=decodeURIComponent(String(src||'').split('#')[0].split('?')[0]);return u.slice(Math.max(u.lastIndexOf('/'),u.lastIndexOf('\\'))+1);}catch{return '';}};
const veiled=name=>!state.on&&state.flagged.has(name)&&!state.revealed.has(name);
function mask(img){
 const name=nameOf(img.currentSrc||img.getAttribute('src'));if(!name||!state.flagged.has(name))return;
 const shouldVeil=veiled(name);img.classList.toggle('nsfw-masked',shouldVeil);
 const next=img.nextElementSibling,has=next&&next.classList.contains('nsfw-veil')&&next.dataset.for===name;
 if(!shouldVeil){if(next&&next.classList.contains('nsfw-veil'))next.remove();return;}
 if(has)return;
 const parent=img.parentElement;if(!parent)return;if(getComputedStyle(parent).position==='static')parent.classList.add('nsfw-host');
 const veil=document.createElement('button');veil.type='button';veil.className='nsfw-veil';veil.dataset.for=name;veil.title=words.tip;veil.innerHTML=`<span></span>`;veil.firstChild.textContent=words.veil;
 veil.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();state.revealed.add(name);scan(document);},true);
 img.after(veil);
}
/* a cover used as a CSS background (the game page's backdrop): taken off while veiled, put back when shown */
function maskBackground(el){
 const style=el.getAttribute('style')||'',m=/url\((?:&quot;|"|')?([^)"']+?)(?:&quot;|"|')?\)/.exec(style)||(el.dataset.nsfwStyle?/url\((?:&quot;|"|')?([^)"']+?)(?:&quot;|"|')?\)/.exec(el.dataset.nsfwStyle):null);if(!m)return;
 const name=nameOf(m[1]);if(!name||!state.flagged.has(name))return;
 if(veiled(name)){if(el.dataset.nsfwStyle===undefined){el.dataset.nsfwStyle=style;el.setAttribute('style',style.replace(/url\([^)]*\)/g,'none'));}}
 else if(el.dataset.nsfwStyle!==undefined){el.setAttribute('style',el.dataset.nsfwStyle);delete el.dataset.nsfwStyle;}
}
function scan(root){
 if(!root.querySelectorAll)return;
 if(!state.flagged.size)return;
 for(const img of root.querySelectorAll('img'))mask(img);
 if(root.tagName==='IMG')mask(root);
 for(const el of root.querySelectorAll('[style*="url("],[data-nsfw-style]'))maskBackground(el);
 for(const v of root.querySelectorAll('.nsfw-veil')){const img=v.previousElementSibling;if(!img||img.tagName!=='IMG'||!veiled(v.dataset.for)){v.remove();img?.classList.remove('nsfw-masked');}}
}
function apply(){scan(document);}
async function load(api,{wait=false}={}){
 let s=null;try{s=await api('nsfw_state',{wait});}catch{s=null;}if(!s||typeof s!=='object')return;
 state.on=s.on===true;state.flagged=new Set(Array.isArray(s.flagged)?s.flagged.filter(x=>typeof x==='string'):[]);document.documentElement.classList.toggle('nsfw-on',state.on);apply();
 clearTimeout(timer);if(s.pending&&retries++<6)timer=setTimeout(()=>load(api),8000);
}
export function initNsfw({api,locale}){
 words=W[locale]||W.zh;if(started)return;started=true;
 observer=new MutationObserver(list=>{if(!state.flagged.size)return;for(const m of list){if(m.type==='attributes'){const t=m.target;if(t.tagName==='IMG')mask(t);else if(t.nodeType===1)maskBackground(t);continue;}for(const n of m.addedNodes)if(n.nodeType===1)scan(n);}});
 observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','style']});
 const again=()=>{retries=0;load(api);};
 addEventListener('megulit-nsfw-changed',again);setInterval(()=>{retries=0;load(api);},90000);load(api);
}
/* "are you 18": resolves true only when the player confirms */
export function confirmAdult({locale,esc=s=>String(s)}){
 const t=W[locale]||W.zh;
 return new Promise(resolve=>{const d=document.createElement('dialog');d.className='game-dialog nsfw-ask';
  d.innerHTML=`<div class="game-dialog-head"><h2>${esc(t.askTitle)}</h2><p>${esc(t.askBody)}</p></div><div class="dialog-actions"><button type="button" class="text-button" data-no>${esc(t.no)}</button><button type="button" class="primary" data-yes>${esc(t.yes)}</button></div>`;
  document.body.append(d);let done=false;const end=v=>{if(done)return;done=true;if(d.open)d.close();d.remove();resolve(v);};
  d.querySelector('[data-yes]').onclick=()=>end(true);d.querySelector('[data-no]').onclick=()=>end(false);d.addEventListener('cancel',e=>{e.preventDefault();end(false);});d.addEventListener('click',e=>{if(e.target===d)end(false);});
  d.showModal();d.querySelector('[data-no]').focus();});
}
