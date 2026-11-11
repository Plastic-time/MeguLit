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
/* 2026-11-12 (user: not so chuunibyou; think DNF and Mushoku Tensei; the top is just 神级): before 转职 见习 / 初级 / 中级 /
   上级魔术师 (staying 上级 until 转职); then a DNF-style job name for the element at Lv.20 and its Saint / King / Emperor /
   God ranks at Lv.35 / 50 / 65 / 80 — 神级 is the top. Fire alone goes on past it, 爆裂魔法初学者 → 爆裂魔法师 (Lv.90–130).
   Each element is described by the reading style it suits, plainly. No 魔导士, no 红魔族, no 练习生. */
const BASE={zh:[[1,'见习魔术师'],[5,'初级魔术师'],[10,'中级魔术师'],[15,'上级魔术师']],
 ja:[[1,'見習い魔術師'],[5,'初級魔術師'],[10,'中級魔術師'],[15,'上級魔術師']],
 en:[[1,'Apprentice magician'],[5,'Beginner-rank magician'],[10,'Intermediate-rank magician'],[15,'Advanced-rank magician']]};
const STEPS=[20,35,50,65,80];
/* 2026-11-12 (user): fire goes four ranks further than every other element — past 火神级魔术师 (Lv.80, the top for everyone else): 爆裂魔法初学者 at Lv.90 up to 爆裂魔法师 at Lv.130 */
const FIRE_STEPS=[...STEPS,90,100,110,120,130];
const E=(color,glyph,name,line,zh,ja,en)=>({color,glyph,name,line,ranks:{zh,ja,en}});
export const SCHOOLS={
 fire:E('#e2423e',{zh:'火',ja:'火',en:'火'},{zh:'火',ja:'火',en:'Fire'},{zh:'爆发型，一口气读很多',ja:'爆発型、一気にたくさん読む',en:'Burst reader: lots in one go'},
  ['火焰术士','火圣级魔术师','火王级魔术师','火帝级魔术师','火神级魔术师','爆裂魔法初学者','爆裂魔法学徒','爆裂魔法修习者','爆裂魔法术士','爆裂魔法师'],['火焔術士','火聖級魔術師','火王級魔術師','火帝級魔術師','火神級魔術師','爆裂魔法の初心者','爆裂魔法見習い','爆裂魔法の修行者','爆裂魔法の術士','爆裂魔法師'],['Pyromancer','Fire Saint-rank magician','Fire King-rank magician','Fire Emperor-rank magician','Fire God-rank magician','Explosion beginner','Explosion apprentice','Explosion student','Explosion caster','Explosion mage']),
 ice:E('#7fd3f2',{zh:'冰',ja:'氷',en:'氷'},{zh:'冰',ja:'氷',en:'Ice'},{zh:'稳健型，读得仔细',ja:'堅実型、丁寧に読む',en:'Steady reader: careful and thorough'},
  ['冰结师','冰圣级魔术师','冰王级魔术师','冰帝级魔术师','冰神级魔术师'],['氷結師','氷聖級魔術師','氷王級魔術師','氷帝級魔術師','氷神級魔術師'],['Cryomancer','Ice Saint-rank magician','Ice King-rank magician','Ice Emperor-rank magician','Ice God-rank magician']),
 thunder:E('#f2d14a',{zh:'雷',ja:'雷',en:'雷'},{zh:'雷',ja:'雷',en:'Thunder'},{zh:'速读型，追求阅读速度',ja:'速読型、読む速さを追う',en:'Speed reader: chasing pace'},
  ['引雷师','雷圣级魔术师','雷王级魔术师','雷帝级魔术师','雷神级魔术师'],['引雷師','雷聖級魔術師','雷王級魔術師','雷帝級魔術師','雷神級魔術師'],['Bolt caller','Thunder Saint-rank magician','Thunder King-rank magician','Thunder Emperor-rank magician','Thunder God-rank magician']),
 wind:E('#8fe0c0',{zh:'风',ja:'風',en:'風'},{zh:'风',ja:'風',en:'Wind'},{zh:'杂食型，几部作品轮着读',ja:'雑食型、何作も並行して読む',en:'Wide reader: several stories at once'},
  ['御风师','风圣级魔术师','风王级魔术师','风帝级魔术师','风神级魔术师'],['御風師','風聖級魔術師','風王級魔術師','風帝級魔術師','風神級魔術師'],['Aeromancer','Wind Saint-rank magician','Wind King-rank magician','Wind Emperor-rank magician','Wind God-rank magician']),
 water:E('#4f9de8',{zh:'水',ja:'水',en:'水'},{zh:'水',ja:'水',en:'Water'},{zh:'坚持型，每天读一点',ja:'継続型、毎日少しずつ読む',en:'Daily reader: a little every day'},
  ['潮汐师','水圣级魔术师','水王级魔术师','水帝级魔术师','水神级魔术师'],['潮汐師','水聖級魔術師','水王級魔術師','水帝級魔術師','水神級魔術師'],['Tidecaller','Water Saint-rank magician','Water King-rank magician','Water Emperor-rank magician','Water God-rank magician']),
 earth:E('#c08a52',{zh:'土',ja:'土',en:'土'},{zh:'土',ja:'土',en:'Earth'},{zh:'积累型，多查词多收录',ja:'積み上げ型、よく調べて語彙を増やす',en:'Builder: looks words up, grows vocabulary'},
  ['岩石术士','土圣级魔术师','土王级魔术师','土帝级魔术师','土神级魔术师'],['岩石術士','土聖級魔術師','土王級魔術師','土帝級魔術師','土神級魔術師'],['Geomancer','Earth Saint-rank magician','Earth King-rank magician','Earth Emperor-rank magician','Earth God-rank magician']),
 light:E('#fff1b8',{zh:'光',ja:'光',en:'光'},{zh:'光',ja:'光',en:'Light'},{zh:'理解型，每句都读懂',ja:'理解型、一文ずつ意味をつかむ',en:'Understander: gets every line'},
  ['圣光师','光圣级魔术师','光王级魔术师','光帝级魔术师','光神级魔术师'],['聖光師','光聖級魔術師','光王級魔術師','光帝級魔術師','光神級魔術師'],['Lightbringer','Light Saint-rank magician','Light King-rank magician','Light Emperor-rank magician','Light God-rank magician']),
 dark:E('#a07ae0',{zh:'暗',ja:'闇',en:'闇'},{zh:'暗',ja:'闇',en:'Dark'},{zh:'夜猫型，深夜里读',ja:'夜型、深夜に読む',en:'Night owl: reads late at night'},
  ['暗影师','暗圣级魔术师','暗王级魔术师','暗帝级魔术师','暗神级魔术师'],['暗影師','闇聖級魔術師','闇王級魔術師','闇帝級魔術師','闇神級魔術師'],['Shadowmancer','Dark Saint-rank magician','Dark King-rank magician','Dark Emperor-rank magician','Dark God-rank magician'])
};
const lang=locale=>locale==='ja'||locale==='en'?locale:'zh';
export const elementName=(element,locale)=>SCHOOLS[element]?.name[lang(locale)]||'';
export function rankTitle(level,locale,school=''){
 const l=lang(locale),s=SCHOOLS[school];
 if(s&&level>=SCHOOL_LEVEL){let t=s.ranks[l][0];(school==='fire'?FIRE_STEPS:STEPS).forEach((at,i)=>{if(level>=at)t=s.ranks[l][i];});return t;}
 let t=BASE[l][0][1];for(const [at,name] of BASE[l])if(level>=at)t=name;return t;
}
const W={zh:{open:'转职',again:'重新转职',locked:n=>`Lv.${n} 转职`,title:'转职',sub:'选一个元素。转职后才能继续获得经验，之前攒下的经验会一次补发；以后还能换',subAgain:'换一个元素。等级和经验都不会变',confirm:'确认转职',cancel:'稍后',done:n=>`转职完成：${n}`,paid:n=>`补发 +${n} 经验`,fail:'转职没有成功，请稍后再试',top:'最高段位',
  due:'需要转职才能继续获得经验（转职后补发）',reached:'到达 Lv.20！',nudge:'你已经 Lv.20 了，转职后才能继续获得经验',nudgeGo:'去转职',nudgeLater:'稍后'},
 ja:{open:'転職',again:'もう一度転職',locked:n=>`Lv.${n} で転職`,title:'転職',sub:'元素をひとつ選びます。転職すると経験値がまた貯まり、それまでの分はまとめて支給されます。あとで選び直せます',subAgain:'元素を選び直します。レベルと経験値はそのままです',confirm:'転職する',cancel:'あとで',done:n=>`転職しました：${n}`,paid:n=>`経験値 +${n} を支給`,fail:'転職できませんでした。しばらくしてからお試しください',top:'最高位',
  due:'転職すると経験値がまた貯まります（それまでの分は後で支給）',reached:'Lv.20 到達！',nudge:'Lv.20 になりました。転職すると経験値がまた貯まります',nudgeGo:'転職する',nudgeLater:'あとで'},
 en:{open:'Change class',again:'Change class again',locked:n=>`Class change at Lv.${n}`,title:'Class change',sub:'Choose an element. XP only grows again after a class change; what you gathered meanwhile is paid back at once. You can switch later',subAgain:'Switch to another element. Level and XP stay',confirm:'Change class',cancel:'Later',done:n=>`Class changed: ${n}`,paid:n=>`+${n} XP paid back`,fail:'The class change did not go through; try again later',top:'Top rank',
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
  <div class="class-rite-schools" role="radiogroup">${Object.entries(SCHOOLS).map(([k,s])=>`<button type="button" role="radio" class="class-rite-school" data-school="${k}" style="--c:${s.color}"><b>${s.glyph[l]}</b><span><strong>${esc(s.name[l])}</strong><small>${esc(s.line[l])}</small></span><em>${esc(s.ranks[l][s.ranks[l].length-1])}</em></button>`).join('')}</div>
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
