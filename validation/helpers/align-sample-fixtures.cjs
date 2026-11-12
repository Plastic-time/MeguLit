// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Synthetic Japanese script / Chinese translation pairs for the import sampling check (align-sample.cjs). No game text:
   lines are built from a small phrase table where each Japanese phrase has its Chinese rendering, with the usual things a
   translation keeps (shared kanji/hanzi, numbers, ？！…, quotes) and lengths of a real script. Deterministic per seed. */
const PHRASES=[
 ['学校に行く','去学校'],['先輩が来た','学长来了'],['時間がない','没有时间了'],['今日は雨だ','今天下雨'],['電話をかける','打电话'],
 ['花火を見に行こう','去看烟花吧'],['料理を作ってあげる','给你做料理'],['海まで歩いた','走到了海边'],['本を読んでいた','在读书'],['名前を呼んだ','叫了名字'],
 ['部屋の窓を開けた','打开了房间的窗户'],['駅前で待ち合わせ','在车站前碰头'],['猫が庭で寝ている','猫在院子里睡觉'],['夏祭りの夜','夏日祭的夜晚'],['約束を守る','遵守约定'],
 ['空が赤く染まる','天空被染红'],['教室には誰もいない','教室里一个人也没有'],['手紙を書いた','写了信'],['神社の階段を上る','登上神社的台阶'],['先生に怒られた','被老师骂了'],
 ['心臓が高鳴る','心跳加速'],['雪が降り始めた','开始下雪了'],['写真を撮ろう','拍照吧'],['夢を見ていた','做了个梦'],['妹が笑った','妹妹笑了'],
 ['図書館で勉強する','在图书馆学习'],['電車に乗り遅れた','没赶上电车'],['風が冷たい','风很冷'],['音楽室でピアノを弾く','在音乐室弹钢琴'],['屋上で弁当を食べる','在天台吃便当'],
 ['秘密を話した','说出了秘密'],['未来のことを考える','思考未来的事'],['病院へ急いだ','赶往医院'],['毎日が楽しい','每天都很开心'],['花を買って帰る','买花回家'],
 ['星を数えた','数星星'],['湖の近くの家','湖边的房子'],['朝から晩まで働く','从早到晚工作'],['昔の友達に会った','见到了以前的朋友'],['春休みの計画','春假的计划']];
function rng(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296;};}
/* n lines: {ja, zh} */
function script(n,seed=1){
 const r=rng(seed),out=[];
 for(let i=0;i<n;i++){
  const k=1+Math.floor(r()*3),parts=[];for(let p=0;p<k;p++)parts.push(PHRASES[Math.floor(r()*PHRASES.length)]);
  let ja=parts.map(p=>p[0]).join('、'),zh=parts.map(p=>p[1]).join('，');
  if(r()<.3){const d=1+Math.floor(r()*12);ja=String.fromCharCode(...[...String(d)].map(c=>c.charCodeAt(0)+0xfee0))+'時に'+ja;zh=d+'点'+zh;}
  const end=r();if(end<.2){ja+='？';zh+='？';}else if(end<.4){ja+='！';zh+='！';}else if(end<.55){ja+='……';zh+='……';}else{ja+='。';zh+='。';}
  if(r()<.55){ja='「'+ja+'」';zh='「'+zh+'」';}
  out.push({ja,zh});
 }
 return out;
}
/* the three cases: a right pair, the same script with one line missing in the Chinese build early and one extra line late
   (every line between is one off), and another script entirely */
function cases(n=300){
 const base=script(n,7),ja=base.map(x=>x.ja),zh=base.map(x=>x.zh);
 const shifted=[...zh.slice(0,80),...zh.slice(81,240),'「多出来的一句，原版里没有」',...zh.slice(240)];
 const other=script(n,99).map(x=>x.zh);
 return {ja,zh,shifted,other};
}
module.exports={script,cases};
