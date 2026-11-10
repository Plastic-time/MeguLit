/* SPDX-License-Identifier: GPL-3.0-or-later */
/* When a line from a galgame was read (user, 2026-11-11: every example taken from a game says the date and minute it
   was read, not just "read"). `by` is for a script line that was not recorded itself: the time of the next recorded
   line after it, so it was read by then. */
const pad=n=>String(n).padStart(2,'0');
export function readTime(seconds,locale='zh',{by=false}={}){
 const s=Number(seconds);if(!Number.isFinite(s)||s<=0)return '';
 const d=new Date(s*1000),y=d.getFullYear(),m=d.getMonth()+1,day=d.getDate(),hm=`${pad(d.getHours())}:${pad(d.getMinutes())}`;
 if(locale==='en'){const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];return `${by?'Read by':'Read on'} ${month} ${day}, ${y}, ${hm}`;}
 if(locale==='ja')return `${y}年${m}月${day}日 ${hm}${by?' までに読了':' に読んだ'}`;
 return `${y}年${m}月${day}日 ${hm}${by?' 前读过':' 读到'}`;
}
