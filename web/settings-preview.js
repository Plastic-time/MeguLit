// SPDX-License-Identifier: GPL-3.0-or-later
/* Live previews in Settings (v1.1.5, user: "I change it and cannot see what it becomes").
   - 游戏中 → 文字与注音: a mock galgame dialogue box drawn with the reader's own style helpers (TomoyoGameStyle), so
     sizes, fonts, outline, gradient, furigana and spacing look as they will in game, scaled to the preview width.
   - 游戏中 → 游戏内面板: the Alt+T menu, dialogue log or lookup card (whichever tab is open) over a game scene.
   Both follow every input at once; nothing is saved by the preview itself. */
const SAMPLE={
 name:'めぐみん',
 ja:[['黒','くろ'],['より',''],['黒','くろ'],['く、',''],['闇','やみ'],['より',''],['暗','くら'],['き',''],['漆黒','しっこく'],['に、',''],['我','わ'],['が',''],['深紅','しんく'],['の',''],['混淆','こんこう'],['を',''],['望','のぞ'],['みたもう','']],
 zh:'比黑色更黑，比黑暗更暗的漆黑，在此寄托吾真红的金光吧'
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const hex=v=>/^#[0-9a-f]{6}$/i.test(String(v||''))?v:'';
const scene=()=>document.documentElement.dataset.theme==='light'?'assets/default-background-light.webp':'assets/default-background-dark.webp';
const T={zh:{title:'实时预览',hint:'改动会立刻显示在这里，确认满意再保存',menu:'阅读层菜单',log:'对话记录',card:'点读'},
 ja:{title:'プレビュー',hint:'変更はすぐここに反映されます',menu:'メニュー',log:'会話ログ',card:'辞書'},
 en:{title:'Live preview',hint:'Changes show here at once',menu:'Reader menu',log:'Dialogue log',card:'Lookup'}};

function readValues(form,values){
 const v={...values};
 for(const el of form.elements){const k=el.name;if(!k||!(k in values))continue;
  if(el.type==='checkbox')v[k]=el.checked;else if(el.type==='range'||el.type==='number')v[k]=Number(el.value);else if(el.type==='color')v[k]=el.dataset.empty==='true'&&!el.dataset.touched?values[k]:el.value;else v[k]=el.value;}
 return v;
}

function textPreview(box,s){
 const G=window.TomoyoGameStyle,d=G?.defaults||{},v={...d,...s};
 const k=Math.max(.4,Math.min(1.2,(box.clientWidth||900)/1000));
 const q=f=>String(f).replace(/"/g,"'"),jaFont=q(G?.japaneseFonts?.[v.japaneseFont]||"'Yu Mincho','MS Mincho',serif"),zhFont=q(G?.chineseFonts?.[v.chineseFont]||"'Microsoft YaHei',sans-serif");
 const outline=(on,color,width)=>G?.outlineFor?G.outlineFor(!!on,hex(color)||'#1a1010',Number(width)*k,window.devicePixelRatio||1):'none';
 const shadow=v.shadow==='soft'?'0 1px 3px #000c':v.shadow==='outline'?(G?.shadows?.outline||'none'):'none';
 const join=(a,b)=>[a,b].filter(x=>x&&x!=='none').join(',')||'none';
 const jaPaint=v.textGradient?`background:linear-gradient(180deg,${hex(v.textGradientTop)||'#fffaf2'} ${Number(v.textGradientStart)||0}%,${hex(v.textGradientBottom)||'#a8c8ff'});-webkit-background-clip:text;background-clip:text;color:transparent;`:`color:${hex(v.textColor)||'#fffaf2'};`;
 const lh=G?.lineHeightFor?G.lineHeightFor(v,!!v.furigana):1.95+(Number(v.lineHeight)||0);
 const ja=SAMPLE.ja.map(([b,r])=>r&&v.furigana?`<ruby>${esc(b)}<rt style="font-size:${v.rubyScale}em;position:relative;left:${(Number(v.rubyOffsetX)||0)*k}px;top:${(Number(v.rubyOffsetY)||0)*k}px;text-shadow:${outline(v.rubyOutline,v.rubyOutlineColor,v.rubyOutlineWidth)}">${esc(r)}</rt></ruby>`:esc(b)).join('');
 const show=v.display||'bilingual',inverted=false;
 const jaHtml=show==='chinese'?'':`<div class="sp-ja" style="font-family:${jaFont};font-size:${v.japaneseSize*k}px;font-weight:${v.japaneseBold?700:500};letter-spacing:${(Number(v.japaneseSpacingPx)||0)*k}px;line-height:${lh};${jaPaint}text-shadow:${join(outline(v.japaneseOutline,v.japaneseOutlineColor,v.japaneseOutlineWidth),shadow)}">「${ja}」</div>`;
 const zhHtml=show==='japanese'?'':`<div class="sp-zh" style="font-family:${zhFont};font-size:${v.translationSize*k}px;font-weight:${v.chineseBold?700:500};letter-spacing:${(Number(v.chineseSpacingPx)||0)*k}px;line-height:${1.5+(Number(v.translationLineHeight)||0)};margin-top:${(Number(v.gap)||0)*k}px;max-width:${Number(v.translationWidth)>0?v.translationWidth+'%':'none'};color:${hex(v.textColor)||'#fffaf2'};opacity:.92;text-shadow:${join(outline(v.chineseOutline,v.chineseOutlineColor,v.chineseOutlineWidth),shadow)}">「${esc(SAMPLE.zh)}」</div>`;
 box.querySelector('.sp-stage').innerHTML=`<div class="sp-scene" style="background-image:url(${scene()})"><div class="sp-window" style="padding:${Math.max(0,(Number(v.paddingY)||0)*k)+14}px ${Math.max(0,(Number(v.paddingX)||0)*k)+22}px"><div class="sp-name">${SAMPLE.name}</div>${inverted?zhHtml+jaHtml:jaHtml+zhHtml}</div></div>`;
}

function panelPreview(box,s,kind,locale){
 const t=T[locale]||T.zh,p=n=>Number(s[`panels.${kind}.${n}`]),surface=s[`surfaces.${kind}`]||'image';
 const image=surface==='image'||surface==='both',glass=surface==='glass'||surface==='both';
 const alpha=Math.max(0,Math.min(100,p('alpha')))/100,border=Math.max(0,Math.min(100,p('border')))/100;
 const pic=image?`<div class="sp-pic" style="background-image:url(${scene()});filter:blur(${p('blur')}px) brightness(${1-p('dim')/100}) saturate(${p('saturate')}%)"></div>`:'';
 const glassStyle=glass?`backdrop-filter:blur(${p('glassBlur')}px) brightness(${1-p('glassDim')/100}) saturate(${p('glassSaturate')}%);-webkit-backdrop-filter:blur(${p('glassBlur')}px) brightness(${1-p('glassDim')/100}) saturate(${p('glassSaturate')}%);`:'';
 const body={
  menu:`<div class="sp-p-title">MeguLit · ${t.menu}</div>${['启用中文翻译','结合前文翻译','逐字显示','假名注音'].map((l,i)=>`<div class="sp-p-row"><span>${l}</span><i class="${i!==2?'on':''}"></i></div>`).join('')}`,
  log:`<div class="sp-p-title">${t.log}</div>${[['めぐみん','「我が名はめぐみん！」','「吾名惠惠！」'],['','風が冷たい夜だった。','那是个寒风凛冽的夜晚。'],['カズマ','「またか……」','「又来了……」']].map(([n,j,z])=>`<div class="sp-p-log"><b>${n||'旁白'}</b><span>${j}<small>${z}</small></span></div>`).join('')}`,
  card:`<div class="sp-p-word">漆黒<small>しっこく</small></div><div class="sp-p-def">名詞・形容動詞 · 漆黑；乌黑发亮的黑色</div><div class="sp-p-def dim">例：漆黒の闇に包まれる</div>`
 }[kind];
 box.querySelector('.sp-stage').innerHTML=`<div class="sp-scene sp-scene-panel" style="background-image:url(${scene()})"><div class="sp-panel sp-${kind}" style="border-radius:${p('radius')}px;border:1px solid rgba(255,236,214,${(.05+border*.6).toFixed(3)});${glassStyle}">${pic}<div class="sp-tint" style="background:rgba(22,14,16,${alpha.toFixed(3)})"></div><div class="sp-body">${body}</div></div></div>`;
}

export function mountSettingsPreview({content,section,values,locale}){
 if(!['text','panels'].includes(section)||!values)return;
 const form=content.querySelector('#advanced-settings-form');if(!form)return;
 const t=T[locale]||T.zh,box=document.createElement('section');box.className='sp-preview';box.setAttribute('aria-label',t.title);
 box.innerHTML=`<div class="sp-head"><span>${t.title}</span><small>${t.hint}</small></div><div class="sp-stage"></div>`;
 (form.querySelector('.settings-page-tabs')||form.querySelector('.settings-section-title'))?.after(box);
 const activeKind=()=>form.querySelector('.settings-page-tabs [aria-selected="true"]')?.dataset.page||'menu';
 let frame=0;const draw=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!box.isConnected)return;const v=readValues(form,values);if(section==='text')textPreview(box,v);else panelPreview(box,v,activeKind(),locale);});};
 form.addEventListener('input',e=>{if(e.target.type==='color')e.target.dataset.touched='1';draw();});form.addEventListener('change',draw);
 form.querySelector('.settings-page-tabs')?.addEventListener('click',()=>setTimeout(draw,0));
 if(typeof ResizeObserver==='function')new ResizeObserver(draw).observe(box);
 draw();
}
