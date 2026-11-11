// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 ranks and 转职 (class change). Lv.1–20 share one path of learning magic. At Lv.20 a reader must choose
   an element to keep levelling: until then the level holds at 20 and the experience gathered meanwhile waits, paid
   back in full when the element is chosen. Each element has its own ranks up to Lv.80; fire's top rank is
   爆裂魔法学徒. The element can be changed again later at no cost. The numbers match services/reader-class.cjs. */
export const SCHOOL_LEVEL=20;
const XP_EARLY=[100,150,200,250,300],XP_STEP=600;
const xpOf=s=>Math.floor((Number(s?.characters)||0)/50)+Math.floor((Number(s?.seconds)||0)/60)*2+(Number(s?.words)||0)*10;
const xpToReach=level=>{let x=0;for(let l=1;l<level;l++)x+=l<=XP_EARLY.length?XP_EARLY[l-1]:XP_STEP;return x;};
function levelOf(xp){let left=Math.max(0,Math.floor(xp)),level=1;
 for(const cost of XP_EARLY){if(left<cost)return {level,into:left,need:cost};left-=cost;level++;}
 const more=Math.floor(left/XP_STEP);return {level:level+more,into:left-more*XP_STEP,need:XP_STEP};}
export function readerLevel(stats,element=''){
 const xp=xpOf(stats),cap=xpToReach(SCHOOL_LEVEL);
 if(SCHOOLS[element]||xp<cap)return {...levelOf(xp),xp,pending:0,locked:false};
 return {level:SCHOOL_LEVEL,into:0,need:XP_STEP,xp:cap,pending:xp-cap,locked:true};
}
/* 2026-11-12 (user: names a Chinese reader finds cool, not plain or templated): before 转职 a short ladder of
   titles (启灵者 → 书咒师 → 御灵法师 → 玄阶法师 → 问道者); after it every element has six titles of its own, fire topping
   out, in Megumin's spirit, at 爆裂魔法学徒. No 魔导士, no 红魔族, no 练习生. */
const BASE={zh:[[1,'启灵者'],[5,'书咒师'],[10,'御灵法师'],[15,'玄阶法师'],[20,'问道者']],
 ja:[[1,'啓霊者'],[5,'書呪師'],[10,'御霊の法師'],[15,'玄階の法師'],[20,'問道者']],
 en:[[1,'Awakened'],[5,'Spell scribe'],[10,'Spirit-binding mage'],[15,'Mystic-rank mage'],[20,'Seeker at the gate']]};
const STEPS=[20,30,40,50,65,80];
const E=(color,glyph,name,line,zh,ja,en)=>({color,glyph,name,line,ranks:{zh,ja,en}});
export const SCHOOLS={
 fire:E('#e2423e',{zh:'火',ja:'火',en:'火'},{zh:'火 · 爆裂',ja:'火・爆裂',en:'Fire · Explosion'},{zh:'以全部魔力，换一声惊天轰鸣',ja:'全魔力を一撃に、天を揺るがす轟音を',en:'All your magic for one earth-shaking roar'},
  ['燃星术士','赤焰咒主','焚天者','业火君王','炎狱贤者','爆裂魔法学徒'],['燃星の術士','赤焔の呪主','焚天者','業火の君王','炎獄の賢者','爆裂魔法見習い'],['Star-kindler','Crimson hex lord','Sky burner','Hellfire monarch','Sage of the flame abyss','Explosion apprentice']),
 ice:E('#7fd3f2',{zh:'冰',ja:'氷',en:'氷'},{zh:'冰',ja:'氷',en:'Ice'},{zh:'万籁俱寂，唯余霜雪与真言',ja:'万物沈黙し、残るは霜と真言のみ',en:'All falls silent but frost and true words'},
  ['霜华术士','寒渊咒主','冰魄行者','雪域君王','极寒圣者','绝对零度'],['霜華の術士','寒淵の呪主','氷魄の行者','雪域の君王','極寒の聖者','絶対零度'],['Frost-bloom mage','Lord of the cold deep','Ice-soul wanderer','Monarch of the snow realm','Saint of the bitter cold','Absolute zero']),
 thunder:E('#f2d14a',{zh:'雷',ja:'雷',en:'雷'},{zh:'雷',ja:'雷',en:'Thunder'},{zh:'一念之间，九霄雷落',ja:'一念の間に、九天より雷落つ',en:'In a single thought, lightning from the ninth sky'},
  ['掌雷者','惊雷咒主','九霄雷使','天罚审判','雷殛君王','万雷之主'],['掌雷者','驚雷の呪主','九霄の雷使','天罰の審判者','雷殛の君王','万雷の主'],['Thunder holder','Lord of the sudden storm','Envoy of the ninth sky','Judge of divine wrath','Thunderstrike monarch','Lord of a thousand thunders']),
 wind:E('#8fe0c0',{zh:'风',ja:'風',en:'風'},{zh:'风',ja:'風',en:'Wind'},{zh:'无形无相，行于万里长空',ja:'形なく、万里の空を往く',en:'Formless, crossing ten thousand miles of sky'},
  ['御风者','流岚术士','逐云行者','苍穹风主','九天风圣','风神使徒'],['御風者','流嵐の術士','逐雲の行者','蒼穹の風主','九天の風聖','風神の使徒'],['Wind rider','Drifting-mist mage','Cloud chaser','Lord of the azure winds','Saint of the nine heavens','Apostle of the wind god']),
 water:E('#4f9de8',{zh:'水',ja:'水',en:'水'},{zh:'水',ja:'水',en:'Water'},{zh:'上善若水，润物无声',ja:'上善は水のごとく、静かに潤す',en:'Like water, the highest good nourishes without a sound'},
  ['听潮者','沧澜术士','镜湖占星师','怒涛君王','沧海圣者','水神眷属'],['聴潮者','滄瀾の術士','鏡湖の占星師','怒涛の君王','滄海の聖者','水神の眷属'],['Tide listener','Mage of the vast waves','Mirror-lake astrologer','Monarch of the raging sea','Saint of the boundless sea','Kin of the water goddess']),
 earth:E('#c08a52',{zh:'土',ja:'土',en:'土'},{zh:'土',ja:'土',en:'Earth'},{zh:'不动如山，根深者方能致远',ja:'動かざること山のごとし',en:'Unmoving as the mountain, deep roots reach far'},
  ['执岩者','磐石术士','地脉行者','镇岳君王','坤舆圣者','撼地之王'],['執岩者','磐石の術士','地脈の行者','鎮岳の君王','坤輿の聖者','撼地の王'],['Stone bearer','Bedrock mage','Ley-line walker','Mountain-binding monarch','Saint of the great earth','King who shakes the earth']),
 light:E('#fff1b8',{zh:'光',ja:'光',en:'光'},{zh:'光',ja:'光',en:'Light'},{zh:'破晓之刻，照见文字的真意',ja:'夜明けの刻、言葉の真意を照らす',en:'At daybreak, the true meaning of words comes to light'},
  ['执灯者','曦光术士','圣辉祭司','天穹审判','光耀圣者','永昼之主'],['執燈者','曦光の術士','聖輝の祭司','天穹の審判者','光耀の聖者','永昼の主'],['Lamp bearer','Dawnlight mage','Priest of holy radiance','Judge of the firmament','Saint of glory','Lord of the endless day']),
 dark:E('#a07ae0',{zh:'暗',ja:'闇',en:'闇'},{zh:'暗',ja:'闇',en:'Dark'},{zh:'长夜为幕，独守未尽的篇章',ja:'長き夜を帳に、終わらぬ物語を守る',en:'Night as the curtain, keeping the unfinished story'},
  ['夜行者','影缚术士','深渊凝视者','月蚀咒主','冥府司书','永夜之主'],['夜行者','影縛の術士','深淵を視る者','月蝕の呪主','冥府の司書','永夜の主'],['Night walker','Shadow binder','Abyss gazer','Eclipse hex lord','Librarian of the underworld','Lord of the endless night'])
};
const lang=locale=>locale==='ja'||locale==='en'?locale:'zh';
export const elementName=(element,locale)=>SCHOOLS[element]?.name[lang(locale)]||'';
export function rankTitle(level,locale,school=''){
 const l=lang(locale),s=SCHOOLS[school];
 if(s&&level>=SCHOOL_LEVEL){let t=s.ranks[l][0];STEPS.forEach((at,i)=>{if(level>=at)t=s.ranks[l][i];});return t;}
 let t=BASE[l][0][1];for(const [at,name] of BASE[l])if(level>=at)t=name;return t;
}
const W={zh:{open:'转职',again:'重新转职',locked:n=>`Lv.${n} 转职`,title:'转职仪式',sub:'选一个元素。转职后才能继续获得经验，之前攒下的经验会一次补发；以后还能换',subAgain:'换一个元素。等级和经验都不会变',confirm:'就决定是你了',cancel:'稍后',done:n=>`转职完成：${n}`,paid:n=>`补发 +${n} 经验`,fail:'转职没有成功，请稍后再试',top:'最高段位',
  due:'需要转职才能继续获得经验（转职后补发）',reached:'到达 Lv.20！',nudge:'你已经 Lv.20 了，转职后才能继续获得经验',nudgeGo:'去转职',nudgeLater:'稍后'},
 ja:{open:'転職',again:'もう一度転職',locked:n=>`Lv.${n} で転職`,title:'転職の儀',sub:'元素をひとつ選びます。転職すると経験値がまた貯まり、それまでの分はまとめて支給されます。あとで選び直せます',subAgain:'元素を選び直します。レベルと経験値はそのままです',confirm:'これに決めた',cancel:'あとで',done:n=>`転職しました：${n}`,paid:n=>`経験値 +${n} を支給`,fail:'転職できませんでした。しばらくしてからお試しください',top:'最高位',
  due:'転職すると経験値がまた貯まります（それまでの分は後で支給）',reached:'Lv.20 到達！',nudge:'Lv.20 になりました。転職すると経験値がまた貯まります',nudgeGo:'転職する',nudgeLater:'あとで'},
 en:{open:'Change class',again:'Change class again',locked:n=>`Class change at Lv.${n}`,title:'Class-change rite',sub:'Choose an element. XP only grows again after a class change; what you gathered meanwhile is paid back at once. You can switch later',subAgain:'Switch to another element. Level and XP stay',confirm:'This one',cancel:'Later',done:n=>`Class changed: ${n}`,paid:n=>`+${n} XP paid back`,fail:'The class change did not go through; try again later',top:'Top rank',
  due:'Change class to keep earning XP (paid back afterwards)',reached:'Lv.20 reached!',nudge:'You are Lv.20. Change class to keep earning XP',nudgeGo:'Change class',nudgeLater:'Later'}};
export const classWords=locale=>W[lang(locale)];

/* the rite: a slowly turning circle in the element's colour, the elements as ruled rows; on confirm the circle spins
   up, the glyph flares and the waiting experience is shown being paid back */
export function openRite({api,locale,esc,toast,current='',pending=0,headline='',onDone=()=>{}}){
 if(document.querySelector('dialog.class-rite'))return null;
 const w=classWords(locale),l=lang(locale),nf=new Intl.NumberFormat({zh:'zh-CN',ja:'ja-JP',en:'en-US'}[l]),dialog=document.createElement('dialog');dialog.className='class-rite';dialog.setAttribute('aria-label',w.title);
 let pick=SCHOOLS[current]?current:'fire';
 const ring=`<svg class="class-rite-circle" viewBox="-100 -100 200 200" aria-hidden="true"><circle r="92"/><circle r="78"/><circle r="40"/>${[0,1].map(k=>`<path d="${Array.from({length:6},(_,i)=>{const a=-Math.PI/2+k*Math.PI/6+i*Math.PI*2/6*2;return `${i?'L':'M'}${(Math.cos(a)*78).toFixed(1)} ${(Math.sin(a)*78).toFixed(1)}`;}).join(' ')}Z"/>`).join('')}${Array.from({length:16},(_,i)=>`<text transform="rotate(${i*22.5}) translate(0 -84)">${'火氷雷風水土光闇読む学ぶ詠う描く'[i]}</text>`).join('')}</svg>`;
 dialog.innerHTML=`<div class="class-rite-stage">${ring}<b class="class-rite-glyph" data-glyph></b><span class="class-rite-paid" data-paid hidden></span></div><div class="class-rite-body"><span class="class-rite-kicker">${headline?esc(headline)+' · ':''}${w.title}</span><h2 data-title></h2><p class="class-rite-sub">${current?w.subAgain:w.sub}</p>
  <div class="class-rite-schools" role="radiogroup">${Object.entries(SCHOOLS).map(([k,s])=>`<button type="button" role="radio" class="class-rite-school" data-school="${k}" style="--c:${s.color}"><b>${s.glyph[l]}</b><span><strong>${esc(s.name[l])}</strong><small>${esc(s.line[l])}</small></span><em>${esc(s.ranks[l][5])}</em></button>`).join('')}</div>
  <div class="class-rite-actions"><span>${pending>0?`<small class="class-rite-wait">${esc(w.paid(nf.format(pending)))}</small>`:''}</span><button type="button" class="secondary" data-cancel>${w.cancel}</button><button type="button" class="primary" data-go>${w.confirm}</button></div></div>`;
 (document.querySelector('.main')||document.body).append(dialog);
 const draw=()=>{const s=SCHOOLS[pick];dialog.style.setProperty('--c',s.color);dialog.querySelector('[data-glyph]').textContent=s.glyph[l];dialog.querySelector('[data-title]').textContent=s.name[l];
  dialog.querySelectorAll('[data-school]').forEach(b=>{const on=b.dataset.school===pick;b.classList.toggle('is-on',on);b.setAttribute('aria-checked',String(on));});};
 dialog.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{pick=b.dataset.school;draw();});
 const close=()=>{dialog.close();};
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('[data-cancel]').onclick=close;
 dialog.querySelector('[data-go]').onclick=async()=>{dialog.classList.add('is-casting');dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{await api('reader_class_set',{element:pick});}catch{dialog.classList.remove('is-casting');dialog.querySelectorAll('button').forEach(b=>b.disabled=false);toast(w.fail);return;}
  const paid=dialog.querySelector('[data-paid]');if(pending>0){paid.textContent=w.paid(nf.format(pending));paid.hidden=false;}
  document.dispatchEvent(new CustomEvent('megulit:reader-class',{detail:{element:pick}}));
  setTimeout(()=>{close();toast(w.done(SCHOOLS[pick].name[l]));onDone(pick);},pending>0?1700:1000);};
 draw();dialog.showModal();
 return dialog;
}
