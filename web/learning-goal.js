/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 学习 → 学习目标 (2026-11-12). Asked right after the level: what you learn for (several allowed). JLPT and EJU ask the
   level / band / parts and the sitting; 娱乐 and 交流 only the directions to push. The learning page shows the goals with a
   countdown and pulls the matching lessons forward; change it from the learning page or 设置 → 常规 any time. */
export const GOAL_TEXT={
 zh:{kicker:'学习 · 目标',title:'你学日语是为了？',lead:'可以多选。选好之后，学习页会显示倒计时，并把和目标最相关的课排到前面。随时可以改。',
  goals:{jlpt:['JLPT','日本语能力考试','検'],eju:['EJU','日本留学考试','留'],fun:['娱乐','看懂 gal 和动画','遊'],talk:['交流','日常会话','話']},
  level:'想考到',score:'目标分数',full:'追求满分',sitting:'考试时间',jul:'7 月',dec:'12 月',jun:'6 月',nov:'11 月',
  subjects:'科目',subj:{ja:'日本語',sci:'理科',hum:'综合科目（文科）',math1:'数学 コース1',math2:'数学 コース2'},subjNote:'日本語之外的科目只记录，不出题',
  band:'日本語目标分数',parts:'重点部分',part:{read:'读解',listen:'听解·听读解',write:'记述'},
  focus:'想重点提高',fun:{story:'读懂剧情',voice:'听懂语音',shadow:'跟读口语',slang:'看懂梗和黑话'},talk:{daily:'日常常用表达',shadow:'跟读口语',slang:'年轻人流行语',polite:'敬语分寸'},
  later:'以后再说',cancel:'取消',ok:'定下目标！',none:'还没设学习目标',set:'设定目标',edit:'改目标',days:n=>n===0?'就是今天！':`还有 ${n} 天`,past:'这次考试已经过去了——改一下目标吧',
  bar:'目标',first:'按目标排在前面',saved:'目标已保存',settings:'学习目标',settingsLead:'决定学习页的倒计时和课程顺序，随账号同步'},
 ja:{kicker:'学習 · 目標',title:'日本語を学ぶ目的は？',lead:'複数選べます。学習ページにカウントダウンが出て、目標に近いレッスンが先に並びます。いつでも変更できます。',
  goals:{jlpt:['JLPT','日本語能力試験','検'],eju:['EJU','日本留学試験','留'],fun:['エンタメ','ギャルゲ・アニメを楽しむ','遊'],talk:['会話','日常会話','話']},
  level:'目標レベル',score:'目標点数',full:'満点を目指す',sitting:'受験時期',jul:'7 月',dec:'12 月',jun:'6 月',nov:'11 月',
  subjects:'科目',subj:{ja:'日本語',sci:'理科',hum:'総合科目',math1:'数学コース1',math2:'数学コース2'},subjNote:'日本語以外は記録のみ',
  band:'日本語の目標点',parts:'重点',part:{read:'読解',listen:'聴解・聴読解',write:'記述'},
  focus:'伸ばしたいところ',fun:{story:'ストーリー読解',voice:'ボイス聞き取り',shadow:'シャドーイング',slang:'ネタ・スラング'},talk:{daily:'日常表現',shadow:'シャドーイング',slang:'若者言葉',polite:'敬語の加減'},
  later:'あとで',cancel:'キャンセル',ok:'これで決まり！',none:'学習目標が未設定',set:'目標を決める',edit:'目標を変更',days:n=>n===0?'今日が本番！':`あと ${n} 日`,past:'この試験は終わりました。目標を更新しましょう',
  bar:'目標',first:'目標に合わせて先頭に',saved:'目標を保存しました',settings:'学習目標',settingsLead:'学習ページのカウントダウンとレッスン順を決めます。アカウントと同期'},
 en:{kicker:'Learning · Goal',title:'What are you learning Japanese for?',lead:'Pick any number. The learning page then shows a countdown and puts the lessons closest to your goals first. Change it any time.',
  goals:{jlpt:['JLPT','Japanese-Language Proficiency Test','検'],eju:['EJU','Exam for Japanese University Admission','留'],fun:['Fun','Understand visual novels and anime','遊'],talk:['Talk','Everyday conversation','話']},
  level:'Target level',score:'Target score',full:'Aim for full marks',sitting:'Sitting',jul:'July',dec:'December',jun:'June',nov:'November',
  subjects:'Subjects',subj:{ja:'Japanese',sci:'Science',hum:'Japan and the World',math1:'Math Course 1',math2:'Math Course 2'},subjNote:'Subjects other than Japanese are only recorded',
  band:'Japanese target score',parts:'Focus parts',part:{read:'Reading',listen:'Listening',write:'Writing'},
  focus:'What to push',fun:{story:'Follow the story',voice:'Understand voices',shadow:'Shadowing',slang:'Memes and slang'},talk:{daily:'Everyday phrases',shadow:'Shadowing',slang:'Youth slang',polite:'Politeness'},
  later:'Later',cancel:'Cancel',ok:'Set my goal!',none:'No learning goal yet',set:'Set a goal',edit:'Change goal',days:n=>n===0?'Today is the day!':`${n} days left`,past:'That sitting has passed. Update your goal',
  bar:'Goal',first:'Put first for your goal',saved:'Goal saved',settings:'Learning goal',settingsLead:'Sets the countdown and lesson order on the learning page; synced with your account'}
};
const T=locale=>GOAL_TEXT[locale]||GOAL_TEXT.zh;
const chip=(name,value,label,on,type='checkbox')=>`<label class="lg-chip"><input type="${type}" name="${name}" value="${value}"${on?' checked':''}><span>${label}</span></label>`;
export function goalPickerHTML(goal,{locale='zh',esc,now=Date.now()}={}){
 const t=T(locale),g=goal||{goals:[]},has=k=>(g.goals||[]).includes(k),y=new Date(now).getFullYear(),years=[y,y+1,y+2];
 const j=g.jlpt||{level:'N3',score:120,full:false,month:7,year:y},e=g.eju||{subjects:['ja'],band:300,parts:['read','listen','write'],month:6,year:y};
 const year=(name,v)=>`<select name="${name}">${years.map(x=>`<option value="${x}"${x===v?' selected':''}>${x}</option>`).join('')}</select>`;
 const jlpt=`<fieldset class="lg-more" data-more="jlpt"${has('jlpt')?'':' hidden'}><legend>JLPT</legend><div class="lg-row"><span>${esc(t.level)}</span>${['N5','N4','N3','N2','N1'].map(l=>chip('jlpt-level',l,l,j.level===l,'radio')).join('')}</div><div class="lg-row"><span>${esc(t.score)}</span><input type="range" name="jlpt-score" min="80" max="180" step="5" value="${j.score}"><output data-score>${j.score}</output><b>/180</b>${chip('jlpt-full','1',esc(t.full),j.full)}</div><div class="lg-row"><span>${esc(t.sitting)}</span>${chip('jlpt-month','7',esc(t.jul),j.month===7,'radio')}${chip('jlpt-month','12',esc(t.dec),j.month===12,'radio')}${year('jlpt-year',j.year)}</div></fieldset>`;
 const eju=`<fieldset class="lg-more" data-more="eju"${has('eju')?'':' hidden'}><legend>EJU</legend><div class="lg-row"><span>${esc(t.subjects)}</span>${Object.entries(t.subj).map(([k,v])=>chip('eju-subj',k,esc(v),k==='ja'||e.subjects.includes(k))).join('')}<small>${esc(t.subjNote)}</small></div><div class="lg-row"><span>${esc(t.band)}</span>${[250,300,350,400].map(b=>chip('eju-band',b,`${b}+`,e.band===b,'radio')).join('')}<b>/450</b></div><div class="lg-row"><span>${esc(t.parts)}</span>${Object.entries(t.part).map(([k,v])=>chip('eju-part',k,esc(v),e.parts.includes(k))).join('')}</div><div class="lg-row"><span>${esc(t.sitting)}</span>${chip('eju-month','6',esc(t.jun),e.month===6,'radio')}${chip('eju-month','11',esc(t.nov),e.month===11,'radio')}${year('eju-year',e.year)}</div></fieldset>`;
 const focus=k=>`<fieldset class="lg-more" data-more="${k}"${has(k)?'':' hidden'}><legend>${esc(t.goals[k][0])}</legend><div class="lg-row"><span>${esc(t.focus)}</span>${Object.entries(t[k]).map(([f,v])=>chip(k+'-focus',f,esc(v),(g[k]?.focus||[]).includes(f))).join('')}</div></fieldset>`;
 return `<div class="lv-dialog lg-dialog" role="dialog" aria-modal="true" aria-labelledby="lg-title"><header><p class="lv-kicker">${esc(t.kicker)}</p><h2 id="lg-title">${esc(t.title)}</h2><p class="lv-lead">${esc(t.lead)}</p></header><form class="lg-form"><div class="lv-grid lg-goals">${Object.entries(t.goals).map(([k,[name,sub,seal]],i)=>`<label class="lv-opt lg-goal${has(k)?' active':''}" style="--i:${i}"><input type="checkbox" name="goal" value="${k}"${has(k)?' checked':''}><span class="lv-seal" aria-hidden="true">${seal}</span><b>${esc(name)}</b><small>${esc(sub)}</small></label>`).join('')}</div>${jlpt}${eju}${focus('fun')}${focus('talk')}</form><footer><p class="lv-note"></p><button type="button" class="secondary" data-lg-later>${esc(g.goals?.length?t.cancel:t.later)}</button><button type="button" class="primary" data-lg-ok${g.goals?.length?'':' disabled'}>${esc(t.ok)}</button></footer></div>`;
}
/* the form → the goal object the backend normalizes */
export function readGoalForm(form){
 const all=n=>[...form.querySelectorAll(`input[name="${n}"]:checked`)].map(x=>x.value),one=n=>all(n)[0],val=n=>form.querySelector(`[name="${n}"]`)?.value;
 const goals=all('goal'),out={goals};
 if(goals.includes('jlpt'))out.jlpt={level:one('jlpt-level'),score:Number(val('jlpt-score')),full:all('jlpt-full').length>0,month:Number(one('jlpt-month')),year:Number(val('jlpt-year'))};
 if(goals.includes('eju'))out.eju={subjects:all('eju-subj'),band:Number(one('eju-band')),parts:all('eju-part'),month:Number(one('eju-month')),year:Number(val('eju-year'))};
 for(const k of ['fun','talk'])if(goals.includes(k))out[k]={focus:all(k+'-focus')};
 return out;
}
export function openGoalPicker({api,esc,toast,locale='zh',current=null}){
 return new Promise(resolve=>{
  const t=T(locale),back=document.createElement('div');back.className='lv-backdrop';back.innerHTML=goalPickerHTML(current,{locale,esc});document.body.appendChild(back);
  const form=back.querySelector('form'),ok=back.querySelector('[data-lg-ok]');
  const close=v=>{document.removeEventListener('keydown',key);back.classList.add('out');setTimeout(()=>back.remove(),160);resolve(v);};
  const key=e=>{if(e.key==='Escape')close(null);};document.addEventListener('keydown',key);
  const sync=()=>{const goals=readGoalForm(form).goals;ok.disabled=!goals.length;back.querySelectorAll('.lg-goal').forEach(l=>l.classList.toggle('active',l.querySelector('input').checked));back.querySelectorAll('[data-more]').forEach(f=>f.hidden=!goals.includes(f.dataset.more));
   const s=form.querySelector('[name="jlpt-score"]'),full=form.querySelector('[name="jlpt-full"]');if(s){if(full?.checked)s.value=180;s.disabled=!!full?.checked;back.querySelector('[data-score]').textContent=s.value;}
   const ja=form.querySelector('[name="eju-subj"][value="ja"]');if(ja){ja.checked=true;ja.disabled=true;}};
  form.addEventListener('input',sync);form.addEventListener('change',sync);sync();
  back.querySelector('[data-lg-later]').onclick=()=>close(null);back.addEventListener('click',e=>{if(e.target===back)close(null);});
  ok.onclick=async()=>{ok.disabled=true;const ja=form.querySelector('[name="eju-subj"][value="ja"]');if(ja)ja.disabled=false;try{const r=await api('learning_goal_set',{goal:readGoalForm(form)});toast?.(t.saved);close(r);}catch(error){ok.disabled=false;toast?.(String(error?.message||error));}};
  back.querySelector('.lg-goal input')?.focus();
 });
}
/* the strip on the learning page: each goal, its countdown, a button to change it */
export function goalBarHTML(state,{locale='zh',esc}){
 const t=T(locale),g=state?.goal;
 if(!g?.goals?.length)return `<aside class="lg-bar empty"><span class="lg-bar-k">${esc(t.bar)}</span><span>${esc(t.none)}</span><button type="button" class="gm-link" data-goal-edit>${esc(t.set)} →</button></aside>`;
 const cd=Object.fromEntries((state.countdown||[]).map(c=>[c.kind,c])),when=c=>c?`<em class="${c.past?'past':''}">${esc(c.past?t.past:t.days(c.days))}</em>`:'';
 const item=k=>{const name=t.goals[k][0];
  if(k==='jlpt'){const j=g.jlpt;return `<li><b>${esc(name)} ${esc(j.level)}</b><small>${j.full?esc(t.full):`${j.score}/180`} · ${j.year}.${j.month}</small>${when(cd.jlpt)}</li>`;}
  if(k==='eju'){const e=g.eju;return `<li><b>${esc(name)} ${esc(t.subj.ja)} ${e.band}+</b><small>${e.parts.map(p=>esc(t.part[p])).join(' · ')} · ${e.year}.${e.month}</small>${when(cd.eju)}</li>`;}
  return `<li><b>${esc(name)}</b><small>${(g[k]?.focus||[]).map(f=>esc(t[k][f])).join(' · ')||esc(t.goals[k][1])}</small></li>`;};
 return `<aside class="lg-bar"><span class="lg-bar-k">${esc(t.bar)}</span><ul>${g.goals.map(item).join('')}</ul><button type="button" class="gm-link" data-goal-edit>${esc(t.edit)}</button></aside>`;
}
/* grammar categories: the goal's ones first, in the goal's order, the rest as they were */
export function orderByGoal(keys,plan){const first=(plan?.groups||[]).filter(g=>keys.includes(g));return [...first,...keys.filter(k=>!first.includes(k))];}
/* 设置 → 常规: a small card that shows the goal and opens the picker */
export async function mountGoalSettings({target,api,esc,toast,locale='zh'}){
 const t=T(locale),box=document.createElement('section');box.className='lg-settings';target.append(box);
 const draw=async()=>{const s=await api('learning_goal').catch(()=>null);box.innerHTML=`<h3>${esc(t.settings)}</h3><p class="lv-lead">${esc(t.settingsLead)}</p>${goalBarHTML(s,{locale,esc})}`;box.querySelector('[data-goal-edit]').onclick=async()=>{const r=await openGoalPicker({api,esc,toast,locale,current:s?.goal});if(r)draw();};};
 await draw();
}
let asked=false;
export async function ensureGoal({api,esc,toast,locale}){
 if(asked)return null;asked=true;
 const cur=await api('learning_goal').catch(()=>null);if(!cur||cur.goal?.goals?.length)return cur;
 return openGoalPicker({api,esc,toast,locale});
}
