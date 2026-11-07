'use strict';
// Identity aliases only, never an inferred story order. Originals/remakes retain separate game IDs.
// Official identity sources: https://www.alicesoft.com/information/game/rance/
// https://www.alicesoft.com/support/ (product names and developer)
const catalog=[{key:'rance',name:'Rance',originalName:'ランスシリーズ',developer:'AliceSoft',aliases:['Rance','Rance Series','兰斯','蘭斯','兰斯系列','ランス','ランスシリーズ'],titles:[
 'Rance 01','ランス01 光をもとめて','Rance 01 Quest for Hikari','兰斯01 寻找小光','兰斯01 追寻光明','兰斯01 寻找光明',
 'Rance I','Rance 1','ランス 光をもとめて','Rance 光をもとめて','兰斯1','兰斯I',
 'Rance 02','Rance 02 Kai','ランス02 反逆の少女たち','ランス02改 反逆の少女たち','Rance 02 The Rebellious Maidens','兰斯02 反逆的少女们',
 'Rance II','Rance 2','Rance II 反逆の少女たち','Rance II 反逆の少女達','兰斯2',
 'Rance 03','ランス03 リーザス陥落','Rance 03 The Fall of Leazas','Rance 03 Fall of Leazas','兰斯03 利萨斯陷落','兰斯03 里萨斯陷落',
 'Rance III','Rance 3','Rance III リーザス陥落','兰斯3','Rance IV','Rance 4','Rance IV 教団の遺産','兰斯4',
 'Rance 4.1','ランス4.1 お薬工場を救え','Rance 4.2','ランス4.2 エンジェル組','Rance 5D','ランス5D ひとりぼっちの女の子','兰斯5D',
 'Rance VI','Rance 6','Rance VI ゼス崩壊','ランス6 ゼス崩壊','Rance VI Collapse of Zeth','兰斯6 赛斯崩坏','兰斯6 泽斯崩坏','兰斯6',
 'Sengoku Rance','戦国ランス','战国兰斯','戰國蘭斯','Rance Quest','Rance Quest Magnum','ランス クエスト','ランスクエスト マグナム','兰斯8','兰斯8 Quest','兰斯8 Quest Magnum',
 'Rance IX','Rance 9','ランス9 ヘルマン革命','Rance IX The Helmanian Revolution','兰斯9 赫尔曼革命','兰斯9',
 'Rance X','Rance 10','ランス10','ランス10 決戦','Rance X Showdown','兰斯10 决战','兰斯10','Kichikuou Rance','鬼畜王ランス','鬼畜王兰斯'
 ]}];
function normalized(value){return String(value||'').normalize('NFKC').toLowerCase().replace(/\.exe$/,'').replace(/(?:\[[^\]]*(?:汉化|漢化|中文|日文|english|japanese|chs|cht|jp|patch)[^\]]*\]|【[^】]*(?:汉化|漢化|中文|日文|english|japanese|chs|cht|jp|patch)[^】]*】)/gi,'').replace(/(?:汉化版|漢化版|中文版|日文版|日本語版|重制版|重製版|remastered|remake|english patch|japanese edition|\b(?:chs|cht|jpn|jp)\b)/gi,'').replace(/[\s\p{P}\p{S}]+/gu,'');}
function texts(game){let original={};try{original=typeof game.original==='string'?JSON.parse(game.original):game.original||{};}catch{}const lib=original.library||{},media=original.media||{};return [...new Set([game.title,...(lib.names||[]),...(game.aliases||[]),media.title,media.original_title,require('node:path').win32.basename(lib.dir||''),require('node:path').win32.basename(game.executable||lib.exe||'')].filter(v=>typeof v==='string'&&v.trim()))];}
function recognize(game,existing=[]){const values=texts(game),result=[];
 for(const rule of catalog){const names=new Set([...rule.titles,...rule.aliases].map(normalized));let exact=values.find(v=>names.has(normalized(v)));if(exact){result.push({key:rule.key,confidence:.99,evidence:exact,rule});continue;}
  const hint=values.find(v=>/(?:^|[^a-z])rance(?:[^a-z]|$)|^(?:ランス|兰斯|蘭斯)|^戦国ランス|^战国兰斯/i.test(v));if(hint)result.push({key:rule.key,confidence:.55,evidence:hint,rule});
 }
 // User aliases are explicit identity hints, not a license to group every substring.
 for(const series of existing){const aliases=[series.name,series.original_name,...JSON.parse(series.aliases||'[]')].filter(Boolean);const exact=values.find(v=>aliases.some(a=>normalized(v)===normalized(a)));if(exact&&!result.some(r=>r.key===series.recognition_key))result.push({key:series.recognition_key||series.id,seriesId:series.id,confidence:.97,evidence:exact});}
 const high=result.filter(r=>r.confidence>=.95);if(high.length>1)return result.map(r=>({...r,confidence:.7}));return result;
}
module.exports={catalog,normalized,texts,recognize};
