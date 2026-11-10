/* SPDX-License-Identifier: GPL-3.0-or-later */
/* 活用演示 (2026-11-11): the four N5 forms of a verb or adjective, split into the part that stays and the part that
   changes, so the page can animate only the ending. */
const ROW={'う':['わ','い'],'く':['か','き'],'ぐ':['が','ぎ'],'す':['さ','し'],'つ':['た','ち'],'ぬ':['な','に'],'ぶ':['ば','び'],'む':['ま','み'],'る':['ら','り']};
const TE={'う':'って','つ':'って','る':'って','む':'んで','ぶ':'んで','ぬ':'んで','く':'いて','ぐ':'いで','す':'して'};
export const WORDS=[
 {word:'書く',reading:'かく',type:'godan',zh:'写'},{word:'読む',reading:'よむ',type:'godan',zh:'读'},{word:'話す',reading:'はなす',type:'godan',zh:'说话'},
 {word:'待つ',reading:'まつ',type:'godan',zh:'等'},{word:'会う',reading:'あう',type:'godan',zh:'见面'},{word:'帰る',reading:'かえる',type:'godan',zh:'回去',note:'る 结尾但属于一类（例外）'},
 {word:'遊ぶ',reading:'あそぶ',type:'godan',zh:'玩'},{word:'泳ぐ',reading:'およぐ',type:'godan',zh:'游泳'},{word:'行く',reading:'いく',type:'godan',zh:'去',note:'て形・た形是例外：行って／行った'},
 {word:'食べる',reading:'たべる',type:'ichidan',zh:'吃'},{word:'見る',reading:'みる',type:'ichidan',zh:'看'},{word:'起きる',reading:'おきる',type:'ichidan',zh:'起床'},
 {word:'する',reading:'する',type:'suru',zh:'做'},{word:'来る',reading:'くる',type:'kuru',zh:'来'},
 {word:'高い',reading:'たかい',type:'i',zh:'高；贵'},{word:'優しい',reading:'やさしい',type:'i',zh:'温柔'},{word:'いい',reading:'いい',type:'i',zh:'好',note:'变形时用 よ：よくない／よかった'},
 {word:'静か',reading:'しずか',type:'na',zh:'安静'},{word:'好き',reading:'すき',type:'na',zh:'喜欢'},{word:'きれい',reading:'きれい',type:'na',zh:'漂亮；干净',note:'い 结尾但是 な形容词'}
];
export const FORMS=['dict','masu','te','nai','ta'];
export const FORM_LABEL={dict:{zh:'原形',ja:'辞書形',en:'Dictionary'},masu:{zh:'ます形',ja:'ます形',en:'ます form'},te:{zh:'て形',ja:'て形',en:'て form'},nai:{zh:'ない形',ja:'ない形',en:'ない form'},ta:{zh:'た形',ja:'た形',en:'た form'}};
/* {stem, ending, rule}: stem + ending is the form; stem is what stays from the dictionary form. */
export function conjugate(entry,form){
 const w=entry.word,t=entry.type,last=w.slice(-1),base=w.slice(0,-1);
 if(form==='dict')return {stem:w,ending:'',rule:''};
 if(t==='godan'){
  if(form==='masu')return {stem:base,ending:ROW[last][1]+'ます',rule:`${last} → ${ROW[last][1]}＋ます`};
  if(form==='nai')return {stem:base,ending:ROW[last][0]+'ない',rule:`${last} → ${ROW[last][0]}＋ない`};
  const te=(w==='行く'||w==='いく')?'って':TE[last],ending=form==='te'?te:te.replace(/て$/,'た').replace(/で$/,'だ');
  return {stem:base,ending,rule:(w==='行く'||w==='いく')?'行く 是例外：く → って／った':`${last} → ${ending}`};
 }
 if(t==='ichidan'){const end={masu:'ます',te:'て',nai:'ない',ta:'た'}[form];return {stem:base,ending:end,rule:`去掉 る ＋ ${end}`};}
 if(t==='suru'){const end={masu:'します',te:'して',nai:'しない',ta:'した'}[form];return {stem:'',ending:end,rule:'する 整个变：'+end};}
 if(t==='kuru'){const end={masu:'ます',te:'て',nai:'ない',ta:'た'}[form],r={masu:'き',te:'き',nai:'こ',ta:'き'}[form];return {stem:'来',ending:end,rule:`来る 读音也变：${r}${end}`,reading:r+end};}
 if(t==='i'){const stem=w==='いい'?'よ':base,end={masu:'いです',te:'くて',nai:'くない',ta:'かった'}[form];if(w==='いい'&&form==='masu')return {stem:'い',ending:'いです',rule:'いい＋です'};return {stem,ending:end,rule:form==='masu'?'＋です':`い → ${end}`};}
 if(t==='na'){const end={masu:'です',te:'で',nai:'じゃない',ta:'だった'}[form];return {stem:w,ending:end,rule:`＋${end}`};}
 return {stem:w,ending:'',rule:''};
}
export const formText=(entry,form)=>{const c=conjugate(entry,form);return c.stem+c.ending;};
