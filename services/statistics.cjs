// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function period(range='month',date=key(new Date())){
 if(!['year','month','week','day'].includes(range)||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('INVALID_STATISTICS_RANGE');
 const [y,m,d]=date.split('-').map(Number),anchor=new Date(y,m-1,d);
 if(key(anchor)!==date||y<1970||y>2200)throw Error('INVALID_STATISTICS_RANGE');
 const start=new Date(anchor),end=new Date(anchor);
 if(range==='year'){start.setMonth(0,1);end.setFullYear(y+1,0,1);}
 else if(range==='month'){start.setDate(1);end.setMonth(m,1);}
 else if(range==='week'){start.setDate(d-(start.getDay()+6)%7);end.setTime(start.getTime());end.setDate(end.getDate()+7);}
 else end.setDate(d+1);
 const buckets=[];for(const at=new Date(start);at<end;){const day=key(at),slot=range==='year'?day.slice(0,7):range==='day'?day+'T'+String(at.getHours()).padStart(2,'0'):day;buckets.push({day:slot,seconds:0,characters:0,sentences:0,lookups:0});if(range==='year')at.setMonth(at.getMonth()+1);else if(range==='day')at.setHours(at.getHours()+1);else at.setDate(at.getDate()+1);}
 return {range,date,start:key(start),end:key(new Date(end.getTime()-1)),from:Math.floor(start/1000),until:Math.floor(end/1000),buckets};
}
function statistics(db,request={}){
 const p=period(request.range,request.date),format=p.range==='year'?'%Y-%m':p.range==='day'?'%Y-%m-%dT%H':'%Y-%m-%d',byDay=new Map(p.buckets.map(r=>[r.day,r]));
 const rows=db.prepare(`SELECT strftime('${format}',started_at,'unixepoch','localtime') day,SUM(active_seconds) seconds,SUM(characters) characters,SUM(sentences) sentences FROM reading_sessions WHERE started_at>=? AND started_at<? GROUP BY day`).all(p.from,p.until);
 for(const row of rows)if(byDay.has(row.day))Object.assign(byDay.get(row.day),row);
 for(const row of db.prepare(`SELECT strftime('${format}',occurred_at,'unixepoch','localtime') day,COUNT(*) lookups FROM lookup_events WHERE occurred_at>=? AND occurred_at<? GROUP BY day`).all(p.from,p.until))if(byDay.has(row.day))byDay.get(row.day).lookups=row.lookups;
 const games=db.prepare(`SELECT g.id,COALESCE(g.title,'—') title,SUM(r.active_seconds) readingSeconds,SUM(r.characters) characters,SUM(r.sentences) sentences FROM reading_sessions r LEFT JOIN games g ON g.id=r.game_id WHERE r.started_at>=? AND r.started_at<? GROUP BY r.game_id ORDER BY readingSeconds DESC,characters DESC`).all(p.from,p.until);
 const totals=p.buckets.reduce((a,r)=>{for(const k of ['seconds','characters','sentences','lookups'])a[k]+=r[k]||0;return a;},{seconds:0,characters:0,sentences:0,lookups:0});
 const last=db.prepare("SELECT date(MAX(started_at),'unixepoch','localtime') day FROM reading_sessions WHERE started_at>=? AND started_at<?").get(p.from,p.until).day||'';
 const {buckets,from,until,...selection}=p;return {period:selection,buckets,games,totals,last};
}
module.exports={period,statistics};
