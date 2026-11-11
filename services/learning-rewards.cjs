// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 学习 → 奖励 (2026-11-11, user: 多给点正向反馈): magic points (魔力) for learning, titles that rise with them, and
   the 台词收藏册 — a line from your own games joins it the first time you answer it right. Local only. */
const KINDS={answer:5,learned:50,find:2,clear:120,practice:15};
const TITLES=[[0,'见习魔法使'],[150,'红魔族学徒'],[500,'中级魔法使'],[1200,'上级魔法使'],[2500,'大魔法使'],[5000,'爆裂魔法使'],[10000,'红魔族第一的魔法使']];
function ensure(db){db.exec(`CREATE TABLE IF NOT EXISTS learning_mana(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,points INTEGER NOT NULL,ref TEXT,at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS learning_album(text TEXT PRIMARY KEY,title TEXT,translation TEXT,point TEXT,read_at INTEGER,at INTEGER NOT NULL);`);}
function titleOf(mana){let i=0;for(let k=0;k<TITLES.length;k++)if(mana>=TITLES[k][0])i=k;const next=TITLES[i+1];return {rank:i+1,title:TITLES[i][1],floor:TITLES[i][0],next:next?next[0]:null,nextTitle:next?next[1]:null};}
function state(db){ensure(db);const mana=db.prepare('SELECT COALESCE(SUM(points),0) AS m FROM learning_mana').get().m,album=db.prepare('SELECT COUNT(*) AS n FROM learning_album').get().n;return {mana,album,...titleOf(mana)};}
/* One reward: kind (answer / learned / find / clear / practice), a streak bonus for answers, and a line to collect. */
function add(db,{kind,ref='',streak=0,line=null}={}){
  if(!KINDS[kind])throw Error('INVALID_REWARD');ensure(db);const before=state(db),now=Math.floor(Date.now()/1000);
  const bonus=kind==='answer'?Math.min(20,Math.max(0,(Number(streak)||0)-1)*2):0,points=KINDS[kind]+bonus;
  db.prepare('INSERT INTO learning_mana(kind,points,ref,at) VALUES(?,?,?,?)').run(kind,points,String(ref).slice(0,80),now);
  let collected=false;
  if(kind==='answer'&&line&&['history','script'].includes(line.origin)&&typeof line.text==='string'&&line.text){
    const r=db.prepare('INSERT OR IGNORE INTO learning_album(text,title,translation,point,read_at,at) VALUES(?,?,?,?,?,?)').run(line.text.slice(0,300),String(line.title||'').slice(0,200),String(line.translation||'').slice(0,500),String(ref).slice(0,80),Number(line.readAt)||null,now);collected=r.changes>0;}
  const after=state(db);return {...after,gained:points,bonus,collected,levelUp:after.rank>before.rank};
}
function album(db,{limit=300}={}){ensure(db);return db.prepare('SELECT text,title,translation,point,read_at AS readAt,at FROM learning_album ORDER BY at DESC LIMIT ?').all(limit);}
module.exports={KINDS,TITLES,titleOf,state,add,album,ensure};
