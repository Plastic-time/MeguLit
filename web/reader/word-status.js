// SPDX-License-Identifier: GPL-3.0-or-later
const api=(command,args={})=>window.__tomeInvoke(command,args);let prefs=window.__tomeNativePreferences||{},revision=0,queued=false;
const painted=new WeakMap();
function schedule(){if(queued)return;queued=true;setTimeout(()=>{queued=false;paint();},120);}
async function paint(){const b=window.__tomeChinese;if(!b?.localTokenize)return;for(const host of document.querySelectorAll('.sentence-text')){
 const chars=[...host.querySelectorAll('.char-token')],text=chars.map(char=>char.textContent).join(''),key=revision+':'+text;if(!text||painted.get(host)===key)continue;painted.set(host,key);
 try{const tokens=await b.localTokenize(text),rows=await api('word_states',{forms:tokens.map(token=>token.base_form||token.normalized||token.surface)});if(!host.isConnected||painted.get(host)!==key)continue;const states=new Map(rows.map(row=>[row.spelling,row.status]));
  for(const char of chars){char.style.removeProperty('text-decoration');char.style.removeProperty('text-decoration-color');char.style.removeProperty('text-decoration-thickness');delete char.dataset.wordStatus;}
  for(const token of tokens){const status=states.get(token.base_form||token.normalized||token.surface);if(status===undefined||!prefs.word_highlight_enabled||!prefs.underline_mined_words)continue;const color=prefs.word_level_colors?.[status];for(const char of chars.slice(token.start,token.end)){char.dataset.wordStatus=String(status);char.style.textDecoration='underline';if(/^#[a-f0-9]{6}$/i.test(color))char.style.textDecorationColor=color;char.style.textDecorationThickness=Math.max(0,Math.min(5,Number(prefs.status_underline_width)||1))+'px';}}
 }catch{painted.delete(host);}
}}
new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,characterData:true});addEventListener('tome-word-status-changed',()=>{api('get_settings').then(value=>{prefs=value;window.__tomeNativePreferences=value;revision++;schedule();}).catch(()=>{});});
addEventListener('storage',()=>{api('get_settings').then(value=>{prefs=value;window.__tomeNativePreferences=value;revision++;schedule();}).catch(()=>{});});schedule();
