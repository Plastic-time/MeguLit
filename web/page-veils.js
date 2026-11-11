/* Pages drawn on the dark "stage" (blurred cover over the wallpaper). Each keeps its own veil opacity and blur,
   adjustable in Settings → Appearance and home. A new page in the same style only needs a row here and in
   services/store.cjs PAGE_VEILS. */
export const PAGE_VEILS=[
 {key:'home',route:'home',a:.9,b:18,label:{zh:'首页',en:'Home',ja:'ホーム'}},
 {key:'detail',route:'game',a:.68,b:8,label:{zh:'作品详情',en:'Game detail',ja:'作品詳細'}},
 {key:'leaderboard',route:'leaderboard',a:.82,b:12,label:{zh:'排行榜',en:'Leaderboard',ja:'ランキング'}},
 {key:'history',route:'history',a:.82,b:12,label:{zh:'历史',en:'History',ja:'履歴'}}
];
export const stageFor=route=>PAGE_VEILS.find(p=>p.route===route)?.key||'';
export function veilOf(prefs,key){const d=PAGE_VEILS.find(p=>p.key===key);if(!d)return null;const v=(prefs?.pageVeils||{})[key]||{};const n=(x,f)=>Number.isFinite(Number(x))&&x!==''&&x!=null?Number(x):f;return {a:n(v.a,d.a),b:n(v.b,d.b)};}
export function applyVeil(prefs,key=document.documentElement.dataset.stage){const v=veilOf(prefs,key),r=document.documentElement.style;if(!v){r.removeProperty('--veil-a');r.removeProperty('--veil-b');return;}r.setProperty('--veil-a',v.a);r.setProperty('--veil-b',v.b+'px');}
export function veilSettingsHTML(prefs,locale){
 const t={zh:{title:'页面背景遮罩',help:'每个页面背景上的深色层和模糊，数值越大越暗、越糊',a:'遮罩不透明度',b:'背景模糊（像素）'},en:{title:'Page background veil',help:'The dark layer and blur over each page’s background; higher is darker or softer',a:'Veil opacity',b:'Background blur (px)'},ja:{title:'ページ背景のベール',help:'各ページの背景に重ねる暗い層とぼかし。大きいほど暗く、ぼやけます',a:'ベールの濃さ',b:'背景のぼかし（px）'}}[locale]||{};
 const row=(p,part,max)=>{const v=veilOf(prefs,p.key)[part],name=`veil_${p.key}_${part}`,label=`${p.label[locale]||p.label.zh} · ${t[part]}`;return `<label class="settings-row veil-row"><div><div class="settings-label">${label}</div></div><span class="setting-slider"><input type="range" name="${name}" min="0" max="${max}" step="any" value="${v}"><input type="number" data-basic-slider="${name}" min="0" max="${max}" step="any" value="${v}" aria-label="${label}"></span></label>`;};
 return `<div class="settings-row veil-head"><div><div class="settings-label">${t.title}</div><div class="settings-help">${t.help}</div></div></div>${PAGE_VEILS.map(p=>row(p,'a',1)+row(p,'b',40)).join('')}`;
}
export function veilsFromForm(form,prefs){const out={};for(const p of PAGE_VEILS){const a=form.elements[`veil_${p.key}_a`],b=form.elements[`veil_${p.key}_b`],cur=veilOf(prefs,p.key);out[p.key]={a:a?Number(a.value):cur.a,b:b?Number(b.value):cur.b};}return out;}
