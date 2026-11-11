// SPDX-License-Identifier: GPL-3.0-or-later
// E450 A sentence read aloud: the game's own voice when MeguLit has it (marked CV on the button), else the synthesized
// voice. Shared by the grammar lessons (examples, "your lines") and the saved sentences page.
let current=null;
const CSS='.cv-badge{display:inline-block;margin-left:6px;padding:0 5px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:.04em;line-height:16px;vertical-align:middle;background:var(--mg-accent,#c04a5a);color:#fff}';
function style(){if(document.getElementById('cv-badge-style'))return;const s=document.createElement('style');s.id='cv-badge-style';s.textContent=CSS;document.head.append(s);}
export function markSource(button,source,estimated=false){if(!button)return;style();button.querySelector('.cv-badge')?.remove();button.dataset.voiceSource=source||'';
 if(source==='game'){const b=document.createElement('span');b.className='cv-badge';b.textContent=estimated?'CV?':'CV';b.title=estimated?'游戏原声（按台词顺序与长度推定的对应）· Game voice, matched by order and length':'游戏原声 · Game voice';button.append(b);}}
export async function playSentence(api,text,button){
 const r=await api('sentence_voice',{text:String(text||'').slice(0,400)});
 current?.pause();const bytes=Uint8Array.from(atob(r.data),c=>c.charCodeAt(0));
 current=new Audio(URL.createObjectURL(new Blob([bytes],{type:r.mime||'audio/wav'})));markSource(button,r.source,r.estimated);await current.play();return r.source;}
