// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
function furiganaHtml(text,tokens,start,end){
  const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hira=v=>String(v||'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-96));const chars=[...text];let out='',pos=0;
  const sorted=[...(tokens||[])].filter(t=>Number.isInteger(t.start)&&Number.isInteger(t.end)).sort((x,y)=>x.start-y.start);
  for(const t of sorted){if(t.start<pos)continue;if(t.start>pos){out+=wrap(chars.slice(pos,t.start).join(''),pos,t.start);}const surface=chars.slice(t.start,t.end).join('');
    let piece=esc(surface);if(/[一-龯々〆ヶ]/.test(surface)&&t.reading){const r=hira(t.reading);if(r&&r!==surface){const head=surface.match(/^[ぁ-ゖ]*/)[0],tail=surface.match(/[ぁ-ゖ]*$/)[0];const core=surface.slice(head.length,surface.length-tail.length);
      if(core&&r.startsWith(head)&&r.endsWith(tail)&&r.length>head.length+tail.length)piece=esc(head)+'<ruby>'+esc(core)+'<rt>'+esc(r.slice(head.length,r.length-tail.length))+'</rt></ruby>'+esc(tail);else piece='<ruby>'+esc(surface)+'<rt>'+esc(r)+'</rt></ruby>';}}
    out+=t.start<end&&t.end>start?'<b class="tm-hl">'+piece+'</b>':piece;pos=t.end;}
  if(pos<chars.length)out+=wrap(chars.slice(pos).join(''),pos,chars.length);return out;
  function wrap(str,a0,a1){if(!(a0<end&&a1>start))return esc(str);const s=Math.max(start,a0)-a0,e=Math.min(end,a1)-a0,c=[...str];return esc(c.slice(0,s).join(''))+'<b class="tm-hl">'+esc(c.slice(s,e).join(''))+'</b>'+esc(c.slice(e).join(''));}
}
module.exports={furiganaHtml};
