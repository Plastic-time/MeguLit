// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 ranks and 转职 (class change). Lv.1–15 share one path of learning magic; from Lv.20 a reader may choose a
   school, and the ranks from there follow it to its own Lv.80 title. Without a school the shared titles go on; the
   level and experience never depend on the choice, and the school can be changed again at any time. */
export const SCHOOL_LEVEL=20;
const BASE={zh:[[1,'魔法见习生'],[3,'识字咒学徒'],[5,'魔法书抄写员'],[10,'咏唱练习生'],[15,'魔法阵描绘者'],[20,'元素见习术士'],[30,'咒文研究员'],[40,'高阶咏唱者'],[50,'大魔法使候补'],[65,'禁咒研读者'],[80,'爆裂魔法学徒']],
 ja:[[1,'魔法見習い'],[3,'文字呪文の徒弟'],[5,'魔導書の写字生'],[10,'詠唱の練習生'],[15,'魔法陣の描き手'],[20,'元素術の見習い'],[30,'呪文研究員'],[40,'高位詠唱者'],[50,'大魔法使い候補'],[65,'禁呪の読み手'],[80,'爆裂魔法見習い']],
 en:[[1,'Magic novice'],[3,'Rune-reading pupil'],[5,'Grimoire copyist'],[10,'Chant trainee'],[15,'Circle drawer'],[20,'Elemental apprentice'],[30,'Spell scholar'],[40,'High chanter'],[50,'Archmage candidate'],[65,'Forbidden-spell reader'],[80,'Explosion apprentice']]};
const STEPS=[20,30,40,50,65,80];
export const SCHOOLS={
 explosion:{color:'#e2423e',glyph:'爆',
  name:{zh:'爆裂系',ja:'爆裂系',en:'Explosion'},
  line:{zh:'一天一发，全力以赴',ja:'一日一発、全力で',en:'One cast a day, everything in it'},
  ranks:{zh:['爆炎见习术士','火焰咒文研究员','灼热咏唱者','爆裂魔法候补','爆裂禁咒研读者','爆裂魔法学徒'],
   ja:['爆炎術の見習い','火炎呪文研究員','灼熱の詠唱者','爆裂魔法の候補','爆裂禁呪の読み手','爆裂魔法見習い'],
   en:['Blaze apprentice','Flame-spell scholar','Searing chanter','Explosion candidate','Reader of the forbidden blast','Explosion apprentice']}},
 frost:{color:'#7fd3f2',glyph:'氷',
  name:{zh:'冰结系',ja:'氷結系',en:'Frost'},
  line:{zh:'冷静地读，一字不差',ja:'冷静に、一字も違えず',en:'Read calmly, every word exact'},
  ranks:{zh:['霜之见习术士','冰晶咒文研究员','寒冰咏唱者','冰结魔法候补','永冻禁咒研读者','冰结魔法学徒'],
   ja:['霜術の見習い','氷晶呪文研究員','寒氷の詠唱者','氷結魔法の候補','永久凍土の禁呪の読み手','氷結魔法見習い'],
   en:['Frost apprentice','Ice-crystal scholar','Glacial chanter','Frost candidate','Reader of the eternal freeze','Frost apprentice mage']}},
 healing:{color:'#9fe0a8',glyph:'癒',
  name:{zh:'治愈系',ja:'治癒系',en:'Healing'},
  line:{zh:'读错了也没关系，再读一遍',ja:'間違えても大丈夫、もう一度',en:'Wrong is fine; read it again'},
  ranks:{zh:['治愈见习术士','祝福咒文研究员','圣光咏唱者','大治愈术候补','复活禁咒研读者','治愈魔法学徒'],
   ja:['治癒術の見習い','祝福呪文研究員','聖光の詠唱者','大治癒術の候補','蘇生禁呪の読み手','治癒魔法見習い'],
   en:['Healing apprentice','Blessing scholar','Holy-light chanter','Great-heal candidate','Reader of the forbidden revival','Healing apprentice mage']}},
 summon:{color:'#b48cf0',glyph:'召',
  name:{zh:'召唤系',ja:'召喚系',en:'Summoning'},
  line:{zh:'把读过的词都叫回身边',ja:'読んだ言葉をそばに呼び戻す',en:'Call every word you read back to you'},
  ranks:{zh:['契约见习术士','召唤阵研究员','使魔咏唱者','大召唤术候补','禁忌召唤研读者','召唤魔法学徒'],
   ja:['契約術の見習い','召喚陣研究員','使い魔の詠唱者','大召喚術の候補','禁忌召喚の読み手','召喚魔法見習い'],
   en:['Pact apprentice','Summoning-circle scholar','Familiar chanter','Great-summon candidate','Reader of the forbidden summons','Summoning apprentice mage']}}
};
const lang=locale=>locale==='ja'||locale==='en'?locale:'zh';
export function rankTitle(level,locale,school=''){
 const l=lang(locale),s=SCHOOLS[school];
 if(s&&level>=SCHOOL_LEVEL){let t=s.ranks[l][0];STEPS.forEach((at,i)=>{if(level>=at)t=s.ranks[l][i];});return t;}
 let t=BASE[l][0][1];for(const [at,name] of BASE[l])if(level>=at)t=name;return t;
}
const W={zh:{open:'转职',again:'重新转职',locked:n=>`Lv.${n} 解锁转职`,title:'转职仪式',sub:'选一个流派。等级和经验不会变，以后还能再换',confirm:'就决定是你了',cancel:'再想想',current:'现在的流派',none:'不选流派',done:n=>`转职完成：${n}`,fail:'转职没有成功，请稍后再试',top:'最高段位'},
 ja:{open:'転職',again:'もう一度転職',locked:n=>`Lv.${n} で転職できます`,title:'転職の儀',sub:'系統をひとつ選びます。レベルと経験値はそのまま、あとで選び直せます',confirm:'これに決めた',cancel:'もう少し考える',current:'今の系統',none:'系統を選ばない',done:n=>`転職しました：${n}`,fail:'転職できませんでした。しばらくしてからお試しください',top:'最高位'},
 en:{open:'Change class',again:'Change class again',locked:n=>`Class change at Lv.${n}`,title:'Class-change rite',sub:'Choose a school. Your level and XP stay; you can choose again later',confirm:'This one',cancel:'Not yet',current:'Current school',none:'No school',done:n=>`Class changed: ${n}`,fail:'The class change did not go through; try again later',top:'Top rank'}};
export const classWords=locale=>W[lang(locale)];

/* the rite: a slowly turning circle, four schools around it, the chosen one lights the circle in its colour */
export function openRite({api,locale,esc,toast,current='',onDone=()=>{}}){
 const w=classWords(locale),l=lang(locale),dialog=document.createElement('dialog');dialog.className='class-rite';dialog.setAttribute('aria-label',w.title);
 let pick=current||'explosion';
 const ring=`<svg class="class-rite-circle" viewBox="-100 -100 200 200" aria-hidden="true"><circle r="92"/><circle r="78"/><circle r="40"/>${[0,1].map(k=>`<path d="${Array.from({length:6},(_,i)=>{const a=-Math.PI/2+k*Math.PI/6+i*Math.PI*2/6*2;return `${i?'L':'M'}${(Math.cos(a)*78).toFixed(1)} ${(Math.sin(a)*78).toFixed(1)}`;}).join(' ')}Z"/>`).join('')}${Array.from({length:16},(_,i)=>`<text transform="rotate(${i*22.5}) translate(0 -84)">${'読む学ぶ詠う描く呼ぶ凍る燃す癒す'[i]}</text>`).join('')}</svg>`;
 dialog.innerHTML=`<div class="class-rite-stage">${ring}<b class="class-rite-glyph" data-glyph></b></div><div class="class-rite-body"><span class="class-rite-kicker">${w.title}</span><h2 data-title></h2><p class="class-rite-sub">${w.sub}</p>
  <div class="class-rite-schools" role="radiogroup">${Object.entries(SCHOOLS).map(([k,s])=>`<button type="button" role="radio" class="class-rite-school" data-school="${k}" style="--c:${s.color}"><b>${s.glyph}</b><span><strong>${esc(s.name[l])}</strong><small>${esc(s.line[l])}</small><em>${w.top} · ${esc(s.ranks[l][5])}</em></span></button>`).join('')}</div>
  <div class="class-rite-actions">${current?`<button type="button" class="text-button" data-none>${w.none}</button>`:''}<span></span><button type="button" class="secondary" data-cancel>${w.cancel}</button><button type="button" class="primary" data-go>${w.confirm}</button></div></div>`;
 (document.querySelector('.main')||document.body).append(dialog);
 const draw=()=>{const s=SCHOOLS[pick];dialog.style.setProperty('--c',s.color);dialog.querySelector('[data-glyph]').textContent=s.glyph;dialog.querySelector('[data-title]').textContent=s.name[l];
  dialog.querySelectorAll('[data-school]').forEach(b=>{const on=b.dataset.school===pick;b.classList.toggle('is-on',on);b.setAttribute('aria-checked',String(on));});};
 dialog.querySelectorAll('[data-school]').forEach(b=>b.onclick=()=>{pick=b.dataset.school;draw();});
 const close=()=>{dialog.close();};
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});
 dialog.querySelector('[data-cancel]').onclick=close;
 const save=async school=>{dialog.classList.add('is-casting');
  try{await api('reader_class_set',{school});}catch{dialog.classList.remove('is-casting');toast(w.fail);return;}
  setTimeout(()=>{close();toast(school?w.done(SCHOOLS[school].name[l]):w.none);onDone(school);},school?900:0);};
 dialog.querySelector('[data-go]').onclick=()=>save(pick);
 dialog.querySelector('[data-none]')?.addEventListener('click',()=>save(''));
 draw();dialog.showModal();
 return dialog;
}
