'use strict';
const POLICY=2;
const approved=source=>/^(?:VNDB|Official|官方|公式|Manual|用户|萌娘百科)/i.test(String(source||''));
const isMoegirl=source=>/^萌娘百科/.test(source||'');
const isVndb=source=>/^VNDB\b/i.test(source||'');
const languages={zh:['zh','ja','en'],en:['en','zh','ja'],ja:['ja','zh','en']};

function forWork(entry,{appid='',vndbId='',rejectLegacy=false}){
 if(!entry)return null;
 if(appid&&entry.steamIdentity!==appid+':'+vndbId)return null;
 if(entry.vndbId===undefined&&rejectLegacy&&!appid)return null;
 if(entry.vndbId!==undefined&&entry.vndbId!==String(vndbId||''))return null;
 return entry;
}

function synopsis(text,source,lang){
 const clean=String(text||'').replace(/<[^>]+>/g,'').trim();
 return {text:clean,source:clean?String(source||''):'',lang};
}

function views(entry,locale,moegirl,localText=''){
 const lang=Object.hasOwn(languages,locale)?locale:'zh',empty=synopsis('','',lang);
 const variants=languages[lang].map(l=>synopsis(entry?.[l],entry?.src?.[l],l)).filter(x=>x.text&&approved(x.source));
 const wiki=entry?.moegirl;
 const mg=isMoegirl(wiki?.src)?synopsis(wiki.text,wiki.src,'zh'):empty;
 const vndb=variants.find(x=>isVndb(x.source))||empty;
 const cached=vndb.text?vndb:variants.find(x=>!isMoegirl(x.source))||synopsis(localText,'',lang);
 return {
  synopsis:moegirl&&mg.text?mg:cached,
  synopsisChoices:{preferred:moegirl?'moegirl':'vndb',moegirl:mg,vndb},
 };
}

module.exports={POLICY,approved,forWork,views};
