// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: a separate effects panel in Settings — everything on/off, each effect on/off, each effect's
   strength). Adds 特效 to the 外观与主页 group of the settings nav and draws its own page in the settings column: a
   master switch, then one row per effect with its own switch and a strength slider (20–150%). Settings are kept on
   this PC (fx-prefs.js) and take effect immediately. */
import {FX,readFx,writeFx} from './fx-prefs.js';
const L=()=>{const l=String(document.documentElement.lang||'zh');return l.startsWith('ja')?'ja':l.startsWith('en')?'en':'zh';};
const W={zh:{nav:'特效',title:'特效',lead:'所有动效都可以一起关掉，也可以逐个开关、调强度。只影响画面，不影响学习数据。',all:'全部特效',allHint:'关掉后所有特效都不播放',strength:'强度',reset:'恢复默认'},
 ja:{nav:'エフェクト',title:'エフェクト',lead:'演出はまとめてオフにも、ひとつずつオン・オフや強さの調整もできます。画面だけの設定で、学習データには影響しません。',all:'すべてのエフェクト',allHint:'オフにするとすべての演出を再生しません',strength:'強さ',reset:'既定に戻す'},
 en:{nav:'Effects',title:'Effects',lead:'Turn every effect off at once, or switch each one and set its strength. Only the look changes; your study data does not.',all:'All effects',allHint:'Off plays no effects at all',strength:'Strength',reset:'Reset to default'}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function render(content){
 const l=L(),w=W[l],v=readFx();
 content.innerHTML=`<h2 class="settings-section-title">${w.title}</h2><p class="settings-help fx-lead">${w.lead}</p>
  <section class="fx-panel">
   <label class="settings-row fx-all"><span class="setting-description"><span class="settings-label">${w.all}</span><small class="settings-help">${w.allHint}</small></span><input class="switch" type="checkbox" data-fx-all ${v.all?'checked':''}></label>
   ${FX.map(f=>{const it=v.items[f.id]||{},on=it.on!==false,k=Math.round((Number(it.k)||1)*100);return `<div class="settings-row fx-row${v.all?'':' is-off'}" data-fx="${f.id}"><span class="setting-description"><span class="settings-label">${esc(f.name[l])}</span><small class="settings-help">${esc(f.desc[l])}</small></span>
    <span class="fx-controls"><span class="setting-slider"><input type="range" min="20" max="150" step="5" value="${k}" aria-label="${esc(f.name[l])} · ${w.strength}" ${on&&v.all?'':'disabled'}><output>${k}%</output></span><input class="switch" type="checkbox" ${on?'checked':''} ${v.all?'':'disabled'} aria-label="${esc(f.name[l])}"></span></div>`;}).join('')}
   <div class="fx-foot"><button type="button" class="secondary" data-fx-reset>${w.reset}</button></div>
  </section>`;
 const save=()=>{const next={all:content.querySelector('[data-fx-all]').checked,items:{}};for(const row of content.querySelectorAll('[data-fx]')){next.items[row.dataset.fx]={on:row.querySelector('.switch').checked,k:Number(row.querySelector('input[type=range]').value)/100};}writeFx(next);};
 content.querySelector('[data-fx-all]').onchange=()=>{save();render(content);};
 for(const row of content.querySelectorAll('[data-fx]')){const sw=row.querySelector('.switch'),rg=row.querySelector('input[type=range]'),out=row.querySelector('output');
  sw.onchange=()=>{rg.disabled=!sw.checked;save();};rg.oninput=()=>{out.textContent=rg.value+'%';rg.style.setProperty('--fill',((rg.value-20)/130*100)+'%');};rg.onchange=save;rg.style.setProperty('--fill',((rg.value-20)/130*100)+'%');}
 content.querySelector('[data-fx-reset]').onclick=()=>{writeFx({all:true,items:{}});render(content);};
}
function inject(){
 const nav=document.querySelector('.settings-nav');if(!nav||nav.querySelector('[data-fx-panel]'))return;
 const anchor=nav.querySelector('[data-section="background"]')||nav.querySelector('.settings-category-items [data-section]');if(!anchor)return;
 const b=document.createElement('button');b.type='button';b.dataset.fxPanel='';b.textContent=W[L()].nav;anchor.after(b);
 b.onclick=e=>{e.stopPropagation();const content=document.querySelector('.settings-layout>.settings-content');if(!content)return;
  nav.querySelectorAll('[data-section].active').forEach(x=>{x.classList.remove('active');x.removeAttribute('aria-current');});b.classList.add('active');b.setAttribute('aria-current','page');render(content);content.scrollTop=0;};
}
let raf=0;new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(()=>{raf=0;inject();});}).observe(document.body,{childList:true,subtree:true});
