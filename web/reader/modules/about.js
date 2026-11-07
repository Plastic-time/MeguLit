// SPDX-License-Identifier: GPL-3.0-or-later
// About dialog: credits for MeguLit.V3, the original tomoyo and LunaTranslator (hook source).
(function installAbout(){
 'use strict';
 if(window.__tomeAbout)return;
 if(!document.documentElement||!document.body){document.addEventListener('DOMContentLoaded',installAbout,{once:true});return;}
 window.__tomeAbout=true;
 const T={
  zh:{date:'2026年10月26日',title:'MeguLit',credit:'基于 tomoyo 的改版',version:'版本',tome:'MeguLit',tomeBy:'魚魚棟',tomeDesc:'在 tomoyo 基础上加入 Galgame 覆盖翻译、原文隐藏、自动注音、AI 查词与义项归纳、Anki 制卡、语音朗读、游戏原版字体导入和多种翻译引擎',orig:'tomoyo',origBy:'46dai',origDesc:'日语阅读与学习工具，MeguLit 的基础',luna:'LunaTranslator',lunaBy:'HIllya51',lunaDesc:'Galgame 文本 Hook 引擎来源，MeguLit 的 Hook 基于 LunaHook 修改',license:'均以 GPL-3.0 许可发布',bili:'bilibili',based:(v,d)=>'MeguLit 基于 tomoyo '+(v||'')+(d?'（'+d+'）':'')},
  en:{date:'Oct 26, 2026',title:'MeguLit',credit:'A modified build of tomoyo',version:'Version',tome:'MeguLit',tomeBy:'魚魚棟',tomeDesc:'Adds galgame overlay translation, original-text hiding, auto furigana, AI lookups and sense summaries, Anki cards, text-to-speech, game font import and many translation engines on top of tomoyo',orig:'tomoyo',origBy:'46dai',origDesc:'Japanese reading and study tool that MeguLit is built on',luna:'LunaTranslator',lunaBy:'HIllya51',lunaDesc:'Source of the galgame text hook; MeguLit\'s hook is a modified LunaHook',license:'All released under GPL-3.0',bili:'bilibili',based:(v,d)=>'MeguLit is based on tomoyo '+(v||'')+(d?' ('+d+')':'')},
  ja:{date:'2026年10月26日',title:'MeguLit',credit:'tomoyo をベースにした改造版',version:'バージョン',tome:'MeguLit',tomeBy:'魚魚棟',tomeDesc:'tomoyo にギャルゲー用の翻訳オーバーレイ、原文隠し、自動ふりがな、AI 辞書引き・語義まとめ、Anki カード作成、読み上げ、ゲームフォント取り込み、多数の翻訳エンジンを追加',orig:'tomoyo',origBy:'46dai',origDesc:'MeguLit のベースになった日本語読書・学習ツール',luna:'LunaTranslator',lunaBy:'HIllya51',lunaDesc:'ギャルゲーのテキストフックの出典。MeguLit のフックは LunaHook の改造版',license:'すべて GPL-3.0 で公開',bili:'bilibili',based:(v,d)=>'MeguLit は tomoyo '+(v||'')+(d?'（'+d+'）':'')+' をベースにしています'}
 };
 const open=url=>{try{const inv=window.__TAURI_INTERNALS__?.invoke;if(inv){inv('plugin:opener|open_url',{url}).catch(()=>navigator.clipboard?.writeText(url));return;}}catch{}try{navigator.clipboard.writeText(url);}catch{}};
 const style=document.createElement('style');style.textContent=`
 .about-modal.tome-about{width:min(620px,calc(100vw - 32px))!important;max-width:none!important}
 .about-modal.tome-about .about-links{display:none!important}
 .about-modal.tome-about .about-logo{display:none!important}
 .about-modal.tome-about .about-body{display:block!important}
 .tome-credits{display:flex;flex-direction:column;gap:10px;margin-top:4px}
 .tome-credit{padding:12px 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--theme-text,#eee) 10%,transparent);background:color-mix(in srgb,var(--theme-text,#eee) 3%,transparent)}
 .tome-credit.main{border-color:color-mix(in srgb,var(--theme-primary,#e0495a) 45%,transparent);background:color-mix(in srgb,var(--theme-primary,#e0495a) 7%,transparent)}
 .tome-credit-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
 .tome-credit-head b{font-size:14.5px}
 .tome-credit-head span{font-size:12px;color:var(--theme-textSecondary,#999)}
 .tome-credit-head span strong{color:var(--theme-text,#eee)}
 .about-modal.tome-about .credit{display:none!important}
 .tome-credit{text-align:left}
 .tome-about-page{max-width:640px;padding:6px 0 48px}
 .tome-about-page h2{margin:0 0 10px;font-size:24px;font-weight:800;color:var(--theme-text,#eee)}
 .tome-about-version{display:flex;align-items:baseline;gap:10px;margin-bottom:18px;color:var(--theme-textSecondary,#999);font-size:12.5px}
 .tome-about-version b{font-size:20px;color:var(--theme-text,#eee)}
 .tome-credit-based{display:block;margin:-3px 0 8px;font-size:11px;color:var(--theme-textSecondary,#888);opacity:.85}
 .tome-credit p{margin:5px 0 8px;font-size:12px;line-height:1.6;color:var(--theme-textSecondary,#aaa)}
 .tome-credit-links{display:flex;gap:14px;flex-wrap:wrap}
 .tome-credit-links button{all:unset;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--theme-primary,#e0495a)}
 .tome-credit-links button:hover{text-decoration:underline}
 .tome-credit-note{font-size:11px;color:var(--theme-textSecondary,#888);margin-top:2px}`;
 (document.head||document.documentElement).appendChild(style);
 function card(main,name,by,desc,links,note){const c=document.createElement('div');c.className='tome-credit'+(main?' main':'');const head=document.createElement('div');head.className='tome-credit-head';const b=document.createElement('b');b.textContent=name;const s=document.createElement('span');s.append('by ');const st=document.createElement('strong');st.textContent=by;s.append(st);head.append(b,s);const p=document.createElement('p');p.textContent=desc;const l=document.createElement('div');l.className='tome-credit-links';for(const [label,url] of links){const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.title=url;btn.onclick=()=>open(url);l.append(btn);}c.append(head,p);if(note){const n=document.createElement('small');n.className='tome-credit-based';n.textContent=note;c.append(n);}c.append(l);return c;}
 function decorate(modal){
  const lang=window.__tomeI18n?.get?.()||'zh',t=T[lang]||T.zh;
  if(modal.dataset.tomeAboutLang===lang)return;modal.dataset.tomeAboutLang=lang;modal.classList.add('tome-about');
  const h=modal.querySelector('.modal-title');if(h)h.textContent=t.title;
  const credit=modal.querySelector('.credit');if(credit)credit.textContent=t.credit;
  const label=modal.querySelector('.version-label');if(label)label.textContent=t.version;
  // Show MeguLit's own version; remember the tomoyo version/date it is based on for the tomoyo card.
  const value=modal.querySelector('.version-value'),date=modal.querySelector('.version-date');
  if(value&&!modal.dataset.tomoyoVersion){modal.dataset.tomoyoVersion=value.textContent.trim();modal.dataset.tomoyoDate=(date?.textContent||'').trim();}
  for(const node of [label,value,date])if(node){node.textContent='';node.hidden=true;}
  if(modal.dataset.tomoyoVersion)try{localStorage.setItem('tome-tomoyo-version',JSON.stringify([modal.dataset.tomoyoVersion,modal.dataset.tomoyoDate||'']));}catch{}
  modal.querySelector('.tome-credits')?.remove();
  (modal.querySelector('.about-info')||modal.querySelector('.about-body')||modal).append(credits(t,modal.dataset.tomoyoVersion||'',modal.dataset.tomoyoDate||''));
 }
 function credits(t,ver,date){
  const box=document.createElement('div');box.className='tome-credits';box.dataset.noI18n='';
  const based=t.based(ver,date);
  box.append(card(false,t.tome,t.tomeBy,t.tomeDesc,[['GitHub','https://github.com/ilynthn'],[t.bili,'https://space.bilibili.com/10739534']]),
   card(false,t.orig,t.origBy,t.origDesc,[['GitHub','https://github.com/46daishi/tomoyo'],['X (Twitter)','https://x.com/46daishi']],based),
   card(false,t.luna,t.lunaBy,t.lunaDesc,[['GitHub','https://github.com/HIllya51/LunaTranslator']]));
  const note=document.createElement('div');note.className='tome-credit-note';note.textContent=t.license;box.append(note);
  return box;
 }
 // Settings page "关于" tab: title, version and the same credits.
 window.__tomeAboutPanel=()=>{const lang=window.__tomeI18n?.get?.()||'zh',t=T[lang]||T.zh;let ver='1.4.0',date='2026年 10月 18日';try{const v=JSON.parse(localStorage.getItem('tome-tomoyo-version')||'null');if(v){ver=v[0]||ver;date=v[1]||date;}}catch{}
  const wrap=document.createElement('div');wrap.className='tome-about-page';wrap.dataset.noI18n='';const h=document.createElement('h2');h.textContent=t.title;const vl=document.createElement('div');vl.className='tome-about-version';const lab=document.createElement('span');lab.textContent=t.version;const val=document.createElement('b');val.textContent='';const dt=document.createElement('span');dt.className='date';dt.textContent=t.date;vl.append(lab,val,dt);wrap.append(h,credits(t,ver,date));return wrap;};
 const scan=()=>{for(const m of document.querySelectorAll('.about-modal'))decorate(m);};
 new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true});
 const prev=window.__tomeI18n?.set;if(prev)window.__tomeI18n.set=v=>{prev(v);for(const m of document.querySelectorAll('.about-modal'))delete m.dataset.tomeAboutLang;scan();};
 scan();
})();
