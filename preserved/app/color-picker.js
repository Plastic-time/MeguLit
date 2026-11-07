// SPDX-License-Identifier: GPL-3.0-or-later
// ToMe colour field and picker (user, 2026-11-02). In ToMe's own panels every input[type=color] becomes a swatch, one
// complete colour value that can be copied or pasted as a whole (#RRGGBB, #RGB, rgb(r,g,b), r,g,b) and a copy button.
// Everywhere else (the home settings' vocabulary colours) the input keeps its own look, but a click opens the same themed
// picker instead of the system dialog. The original input stays the value store: every change is dispatched on it as
// input/change events, so existing settings code (and the host app's bindings) need no change.
(function installColorPicker(){
 'use strict';
 if(!document.body){document.addEventListener('DOMContentLoaded',installColorPicker,{once:true});return;}
 if(window.__tomeColorPicker)return;window.__tomeColorPicker=true;
 const words={
  zh:{copy:'复制',copied:'已复制',pick:'选择颜色',value:'颜色值，可整段粘贴',invalid:'无法识别的颜色值',drop:'从屏幕取色',close:'关闭',revert:'恢复打开前的颜色',recent:'最近使用'},
  en:{copy:'Copy',copied:'Copied',pick:'Pick colour',value:'Colour value; paste a whole value',invalid:'Colour value not recognised',drop:'Pick from screen',close:'Close',revert:'Restore the colour before opening',recent:'Recent'},
  ja:{copy:'コピー',copied:'コピー済み',pick:'色を選択',value:'色の値（まとめて貼り付け可）',invalid:'色の値を認識できません',drop:'画面から色を取得',close:'閉じる',revert:'開く前の色に戻す',recent:'最近使った色'}};
 const t=k=>(words[(window.__tomeI18n?.get?.()||'zh').slice(0,2)]||words.zh)[k];
 const hex2=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
 const toHex=(r,g,b)=>'#'+hex2(r)+hex2(g)+hex2(b);
 function parse(text){const s=String(text||'').trim().toLowerCase();let m;
  if((m=/^#?([0-9a-f]{6})$/.exec(s)))return '#'+m[1];
  if((m=/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s)))return '#'+m[1]+m[1]+m[2]+m[2]+m[3]+m[3];
  if((m=/^(?:rgba?\s*\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[, ]\s*[\d.]+\s*)?\)?$/.exec(s))&&[m[1],m[2],m[3]].every(v=>+v<=255))return toHex(+m[1],+m[2],+m[3]);
  return null;}
 const rgbOf=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
 function hsv(h){const [r,g,b]=rgbOf(h).map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let hue=0;if(d)hue=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;return [(hue*60+360)%360,max?d/max:0,max];}
 function fromHsv(h,s,v){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return toHex((r+m)*255,(g+m)*255,(b+m)*255);}
 function commit(input,value,type){if(!value||input.value===value&&type==='input')return;input.value=value;input.dispatchEvent(new Event(type,{bubbles:true}));}
 async function copy(text){try{await navigator.clipboard.writeText(text);return true;}catch{}const area=document.createElement('textarea');area.value=text;area.style.cssText='position:fixed;left:-9999px';document.body.append(area);area.select();let ok=false;try{ok=document.execCommand('copy');}catch{}area.remove();return ok;}
 const RECENT='tome-color-recent',PRESETS=['#ffffff','#fffaf2','#e8e9ec','#a8c8ff','#bbeeff','#ffd6e0','#ffe9a8','#1b1b1f'];
 const recent=()=>{try{const list=JSON.parse(localStorage.getItem(RECENT)||'[]');return Array.isArray(list)?list.map(parse).filter(Boolean).slice(0,8):[];}catch{return [];}};
 const remember=value=>{try{localStorage.setItem(RECENT,JSON.stringify([value,...recent().filter(v=>v!==value)].slice(0,8)));}catch{}};
 const DROP='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5.5 4 4M4 20l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/></svg>';
 let panel=null,owner=null,opened='';
 const regions=()=>window.__tomoyoHitRegionsRefresh?.(true);
 function close(){if(!panel)return;const input=owner,start=opened;panel.remove();panel=null;owner=null;regions();if(!input)return;const value=parse(input.value);if(value&&value!==start)remember(value);input.dispatchEvent(new Event('change',{bubbles:true}));}
 function open(input,anchor,field){
  close();owner=input;opened=parse(input.value)||'#ffffff';let [h,s,v]=hsv(opened);
  panel=document.createElement('div');panel.className='tome-color-panel';panel.dataset.noI18n='';panel.setAttribute('role','dialog');panel.setAttribute('aria-label',t('pick'));
  panel.innerHTML='<header class="tome-color-head"><span></span><button type="button" class="tome-color-close">×</button></header><div class="tome-color-sv" tabindex="0"><i></i></div><div class="tome-color-row"><button type="button" class="tome-color-drop">'+DROP+'</button><span class="tome-color-compare"><button type="button" data-old></button><span data-new></span></span><div class="tome-color-hue" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="359"><i></i></div></div><div class="tome-color-inputs"><label class="tome-color-hex"><input data-k="hex" maxlength="32" spellcheck="false" autocomplete="off"><span>HEX</span></label><label><input data-k="0" inputmode="numeric" maxlength="3"><span>R</span></label><label><input data-k="1" inputmode="numeric" maxlength="3"><span>G</span></label><label><input data-k="2" inputmode="numeric" maxlength="3"><span>B</span></label></div><div class="tome-color-swatches"></div>';
  const $=q=>panel.querySelector(q),sv=$('.tome-color-sv'),dot=sv.querySelector('i'),hue=$('.tome-color-hue'),knob=hue.querySelector('i'),old=$('[data-old]'),now=$('[data-new]'),drop=$('.tome-color-drop'),hexBox=$('[data-k=hex]'),rgbBoxes=[0,1,2].map(i=>$('[data-k="'+i+'"]')),list=$('.tome-color-swatches');
  const head=$('.tome-color-head');head.firstChild.textContent=t('pick');$('.tome-color-close').setAttribute('aria-label',t('close'));$('.tome-color-close').onclick=close;drop.title=t('drop');drop.setAttribute('aria-label',t('drop'));old.title=t('revert');old.setAttribute('aria-label',t('revert'));const cmp=$('.tome-color-compare');
  if(!('EyeDropper' in window))drop.hidden=true;
  const paint=(push,skip)=>{const value=fromHsv(h,s,v);sv.style.background='linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl('+h+',100%,50%))';dot.style.left=(s*100)+'%';dot.style.top=((1-v)*100)+'%';dot.style.background=value;knob.style.left=(h/360*100)+'%';knob.style.background='hsl('+h+',100%,50%)';hue.setAttribute('aria-valuenow',String(Math.round(h)));cmp.style.background='linear-gradient(90deg,'+opened+' 0 50%,'+value+' 50% 100%)';
   if(skip!==hexBox&&document.activeElement!==hexBox)hexBox.value=value.toUpperCase();rgbOf(value).forEach((n,i)=>{if(skip!==rgbBoxes[i]&&document.activeElement!==rgbBoxes[i])rgbBoxes[i].value=String(n);});
   if(push){commit(input,value,'input');if(field)refresh(field);}};
  const set=(value,skip)=>{const p=parse(value);if(!p)return false;const [nh,ns,nv]=hsv(p);if(ns&&nv)h=nh;s=ns;v=nv;paint(true,skip);return true;};
  const track=(el,fn)=>el.addEventListener('pointerdown',e=>{e.preventDefault();el.focus({preventScroll:true});try{el.setPointerCapture(e.pointerId);}catch{}fn(e);const move=ev=>fn(ev),up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);});
  track(sv,e=>{const r=sv.getBoundingClientRect();s=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));v=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height));paint(true);});
  track(hue,e=>{const r=hue.getBoundingClientRect();h=Math.max(0,Math.min(359.9,(e.clientX-r.left)/r.width*360));paint(true);});
  sv.addEventListener('keydown',e=>{const d=e.shiftKey?.1:.02,k={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,d],ArrowDown:[0,-d]}[e.key];if(!k)return;e.preventDefault();s=Math.max(0,Math.min(1,s+k[0]));v=Math.max(0,Math.min(1,v+k[1]));paint(true);});
  hue.addEventListener('keydown',e=>{const d=(e.shiftKey?10:1)*({ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[e.key]||0);if(!d)return;e.preventDefault();h=(h+d+360)%360;paint(true);});
  hexBox.addEventListener('input',()=>{if(set(hexBox.value,hexBox))hexBox.removeAttribute('aria-invalid');});
  hexBox.addEventListener('change',()=>{if(!set(hexBox.value))hexBox.setAttribute('aria-invalid','true');else{hexBox.removeAttribute('aria-invalid');hexBox.value=fromHsv(h,s,v).toUpperCase();}});
  hexBox.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();hexBox.dispatchEvent(new Event('change'));}});
  for(const box of rgbBoxes)box.addEventListener('input',()=>{const n=rgbBoxes.map(b=>b.value.trim());if(n.every(x=>/^\d{1,3}$/.test(x)&&+x<=255))set(n.join(','),box);});
  old.onclick=()=>set(opened);
  drop.onclick=async()=>{try{const r=await new window.EyeDropper().open();if(r?.sRGBHex)set(r.sRGBHex);}catch{}};
  const chips=recent();list.title=chips.length?t('recent'):'';for(const value of chips.length?chips:PRESETS){const chip=document.createElement('button');chip.type='button';chip.style.background=value;chip.title=value.toUpperCase();chip.setAttribute('aria-label',value.toUpperCase());chip.onclick=()=>set(value);list.append(chip);}
  // A window of its own on the page body, like the Alt+T menu (user, 2026-11-02). Inside the menu it was offset and cut
  // off: the menu keeps will-change:scale, which makes it the containing block of position:fixed children. The window
  // opens beside the menu (or under the anchor on the home page), stays in the viewport and is dragged by its title.
  document.body.append(panel);paint(false);
  const w=panel.offsetWidth,ph=panel.offsetHeight,r=anchor.getBoundingClientRect(),menu=anchor.closest('.tomoyo-cn-dialog')?.getBoundingClientRect();
  const fit=(x,y)=>[Math.max(8,Math.min(x,innerWidth-w-8)),Math.max(8,Math.min(y,innerHeight-ph-8))];
  let [left,top]=menu?fit(menu.right+12+w<=innerWidth-8?menu.right+12:menu.left-12-w>=8?menu.left-12-w:r.left,r.top-40):fit(r.left,r.bottom+8+ph<=innerHeight-8?r.bottom+8:r.top-ph-8);
  const place=()=>{panel.style.left=left+'px';panel.style.top=top+'px';regions();};place();
  head.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;e.preventDefault();try{head.setPointerCapture(e.pointerId);}catch{}const dx=e.clientX-left,dy=e.clientY-top;panel.classList.add('tome-dragging');const move=ev=>{[left,top]=fit(ev.clientX-dx,ev.clientY-dy);place();},up=()=>{panel.classList.remove('tome-dragging');head.removeEventListener('pointermove',move);head.removeEventListener('pointerup',up);regions();};head.addEventListener('pointermove',move);head.addEventListener('pointerup',up);});
 }
 function refresh(field){const input=field.__tomeInput,text=field.querySelector('.tome-color-text'),swatch=field.querySelector('.tome-color-swatch'),value=(parse(input.value)||'#000000').toUpperCase();if(document.activeElement!==text&&text.value!==value)text.value=value;swatch.style.background=value;input.disabled?field.setAttribute('data-disabled',''):field.removeAttribute('data-disabled');}
 function enhance(input){
  if(input.__tomeColorField||input.closest('.tome-color-panel'))return;
  const field=document.createElement('span');field.className='tome-color-field';field.dataset.noI18n='';field.__tomeInput=input;input.__tomeColorField=field;
  const swatch=document.createElement('button');swatch.type='button';swatch.className='tome-color-swatch';
  const text=document.createElement('input');text.type='text';text.className='tome-color-text';text.spellcheck=false;text.autocomplete='off';text.maxLength=32;
  const copyButton=document.createElement('button');copyButton.type='button';copyButton.className='tome-color-copy';
  const label=()=>{swatch.title=t('pick');swatch.setAttribute('aria-label',t('pick'));text.title=t('value');text.setAttribute('aria-label',t('value'));if(!copyButton.dataset.busy)copyButton.textContent=t('copy');};label();field.__tomeLabel=label;
  swatch.onclick=e=>{e.preventDefault();e.stopPropagation();if(panel&&owner===input)close();else open(input,field,field);};
  const take=type=>{const value=parse(text.value);if(value){text.removeAttribute('aria-invalid');commit(input,value,'input');if(type==='change')input.dispatchEvent(new Event('change',{bubbles:true}));refresh(field);}else{text.setAttribute('aria-invalid','true');text.title=t('invalid');}};
  text.addEventListener('input',()=>{if(parse(text.value))take('input');});
  text.addEventListener('change',()=>take('change'));
  text.addEventListener('blur',()=>{text.removeAttribute('aria-invalid');refresh(field);});
  text.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();take('change');text.blur();}});
  copyButton.onclick=async e=>{e.preventDefault();e.stopPropagation();const ok=await copy((parse(input.value)||'#000000').toUpperCase());copyButton.dataset.busy='1';copyButton.textContent=ok?t('copied'):t('copy');setTimeout(()=>{delete copyButton.dataset.busy;label();},1200);};
  field.append(swatch,text,copyButton);input.classList.add('tome-color-native');input.after(field);refresh(field);
 }
 // ToMe's own panels get the full field; the host app's rows (vocabulary level colours) keep their compact swatches.
 const SCOPE='.tomoyo-cn-dialog input[type=color],.tomoyo-learning-panel input[type=color],.tome-bg-menu input[type=color],.tome-backlog input[type=color]';
 function scan(){for(const input of document.querySelectorAll(SCOPE))enhance(input);for(const field of document.querySelectorAll('.tome-color-field')){if(!field.__tomeInput?.isConnected){field.remove();continue;}refresh(field);}}
 // Programmatic value changes (style sync, profile restore, history preview) fire no events: keep the field in step.
 setInterval(scan,400);new MutationObserver(()=>scan()).observe(document.body,{childList:true,subtree:true});scan();
 // Any other colour input: same picker instead of the system dialog (cancelling the click keeps the dialog closed).
 // A click on a field's label reaches its hidden native input (label activation): that opened the system picker at the
 // screen's top-left in the overlay. Cancel it and open ToMe's window for that field instead (user, 2026-11-02).
 document.addEventListener('click',e=>{const input=e.target.closest?.('input[type=color]');if(!input||input.disabled)return;e.preventDefault();if(input.classList.contains('tome-color-native')){const field=input.__tomeColorField;if(field&&!(panel&&owner===input))open(input,field,field);return;}if(panel&&owner===input)close();else open(input,input,null);},true);
 document.addEventListener('keydown',e=>{const input=e.target.closest?.('input[type=color]');if(input&&!input.classList.contains('tome-color-native')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open(input,input,null);}},true);
 // Working in the Alt+T menu keeps the window open (it is a window, not a popup); anywhere else closes it, and it also
 // closes when its colour input goes away (menu closed or rebuilt).
 document.addEventListener('pointerdown',e=>{if(panel&&!panel.contains(e.target)&&!e.target.closest?.('.tome-color-swatch,.tomoyo-cn-dialog')&&e.target!==owner)close();},true);
 setInterval(()=>{if(panel&&(!owner?.isConnected||owner.closest('dialog:not([open])')))close();},300);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel){e.stopPropagation();close();}},true);
 addEventListener('tome-language-change',()=>{for(const field of document.querySelectorAll('.tome-color-field'))field.__tomeLabel?.();});
 const style=document.createElement('style');style.textContent=`
 input[type=color].tome-color-native{display:none!important}
 .tome-color-field{display:inline-flex;align-items:center;gap:6px;width:100%;min-width:0;margin-top:6px;vertical-align:middle}
 .tome-color-swatch{flex:none;width:30px!important;height:30px!important;min-width:0!important;padding:0!important;margin:0!important;border-radius:9px!important;border:0!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--theme-text,#eee) 22%,transparent),0 0 0 1px color-mix(in srgb,#000 30%,transparent)!important;cursor:pointer}
 .tome-color-text{flex:1;min-width:0;height:30px;box-sizing:border-box;padding:0 9px!important;margin:0!important;border-radius:9px!important;border:1px solid var(--menu-border,var(--theme-border,#444))!important;background:color-mix(in srgb,var(--theme-text,#eee) 5%,transparent)!important;color:var(--theme-text,#eee)!important;font:12.5px/1 Consolas,'Cascadia Mono',monospace!important;letter-spacing:.04em;text-transform:uppercase}
 .tome-color-text[aria-invalid=true]{border-color:#e6a56f!important}
 .tome-color-copy{flex:none;height:30px!important;margin:0!important;padding:0 11px!important;border-radius:9px!important;font-size:12px!important;white-space:nowrap}
 .tome-color-field[data-disabled]{opacity:.5;pointer-events:none}
 .tome-color-panel{position:fixed;z-index:2147483000;box-sizing:border-box;width:252px;padding:12px;border-radius:16px;background:var(--theme-surface,#18181b);color:var(--theme-text,#eee);border:1px solid color-mix(in srgb,var(--theme-text,#eee) 12%,transparent);box-shadow:0 20px 48px rgba(0,0,0,.42),0 2px 8px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:12px;font-size:12px;line-height:1.2;animation:tome-color-in .14s ease-out}
 @keyframes tome-color-in{from{opacity:0;transform:translateY(-4px)}}
 .tome-color-panel button{all:unset;box-sizing:border-box;cursor:pointer}
 .tome-color-panel :focus-visible{outline:2px solid var(--theme-primary,#e0495a);outline-offset:2px}
 .tome-color-head{display:flex;align-items:center;justify-content:space-between;margin:-2px -2px -2px 2px;cursor:grab;user-select:none;font-size:13px;font-weight:700}
 .tome-color-panel.tome-dragging .tome-color-head{cursor:grabbing}
 .tome-color-panel .tome-color-close{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;font-size:17px;line-height:1;color:var(--theme-textSecondary,#aaa)}
 .tome-color-panel .tome-color-close:hover{background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent);color:var(--theme-text,#eee)}
 .tome-color-sv{position:relative;height:150px;border-radius:11px;cursor:crosshair;touch-action:none;box-shadow:inset 0 0 0 1px color-mix(in srgb,#000 25%,transparent)}
 .tome-color-sv i{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;box-sizing:border-box;border-radius:50%;border:2.5px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35),0 2px 6px rgba(0,0,0,.35);pointer-events:none}
 .tome-color-row{display:flex;align-items:center;gap:10px}
 .tome-color-panel .tome-color-drop{flex:none;display:grid;place-items:center;width:30px;height:30px;border-radius:9px;color:var(--theme-textSecondary,#aaa);transition:background .15s,color .15s}
 .tome-color-panel .tome-color-drop:hover{background:color-mix(in srgb,var(--theme-text,#eee) 8%,transparent);color:var(--theme-text,#eee)}
 .tome-color-drop svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
 .tome-color-drop[hidden]{display:none!important}
 .tome-color-compare{flex:none;display:flex;width:34px;height:34px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 1px color-mix(in srgb,var(--theme-text,#eee) 18%,transparent);transform:translateZ(0)}
 .tome-color-panel .tome-color-compare>*{flex:1;display:block;height:100%}
 .tome-color-hue{position:relative;flex:1;height:12px;border-radius:6px;background:linear-gradient(to right,#f00 0%,#ff0 16.66%,#0f0 33.33%,#0ff 50%,#00f 66.66%,#f0f 83.33%,#f00 100%);cursor:ew-resize;touch-action:none;margin:0 8px}
 .tome-color-hue i{position:absolute;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;box-sizing:border-box;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.3),0 2px 6px rgba(0,0,0,.35);pointer-events:none}
 .tome-color-inputs{display:grid;grid-template-columns:1.9fr 1fr 1fr 1fr;gap:6px}
 .tome-color-inputs label{display:flex!important;flex-direction:column;align-items:stretch;gap:5px;margin:0!important;min-width:0}
 .tome-color-inputs input{box-sizing:border-box!important;width:100%!important;min-width:0!important;height:30px!important;margin:0!important;padding:0 4px!important;border-radius:8px!important;border:1px solid var(--theme-border,#34343b)!important;background:color-mix(in srgb,var(--theme-text,#eee) 5%,transparent)!important;color:var(--theme-text,#eee)!important;font:12px/1 Consolas,'Cascadia Mono',monospace!important;text-align:center;outline:none}
 .tome-color-inputs input:focus{border-color:var(--theme-primary,#e0495a)!important}
 .tome-color-inputs input[aria-invalid=true]{border-color:#e6a56f!important}
 .tome-color-inputs span{text-align:center;font-size:10.5px;letter-spacing:.06em;color:var(--theme-textSecondary,#999)}
 .tome-color-swatches{display:grid;grid-template-columns:repeat(8,1fr);gap:6px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--theme-text,#eee) 8%,transparent)}
 .tome-color-panel .tome-color-swatches button{aspect-ratio:1;border-radius:50%;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--theme-text,#eee) 20%,transparent);transition:transform .12s}
 .tome-color-panel .tome-color-swatches button:hover{transform:scale(1.12)}`;
 document.head.append(style);
})();
