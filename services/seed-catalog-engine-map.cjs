// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* VNDB release.engine names from https://vndb.org/r/engines and Kana release filters.
   Reader families come from docs/engine-coverage.md and services/original-engines/scenes.cjs.
   BGI and System4 also have readers in original-text.cjs. Entries describe native script
   readers, including families with per-game keys or several archive versions. */
const engines={
 kirikiri:{name:'KiriKiri',vndb:['KiriKiri','KRKR2/KAG3']},
 tyrano:{name:'TyranoScript',vndb:['TyranoScript']},
 nscripter:{name:'NScripter / ONScripter',vndb:['NScripter','ONScripter']},
 renpy:{name:"Ren'Py",vndb:["Ren'Py"]},
 yuris:{name:'YU-RIS',vndb:['YU-RIS']},
 artemis:{name:'Artemis',vndb:['Artemis Engine']},
 bgi:{name:'BGI / Ethornell',vndb:['BGI/Ethornell']},
 shiinario:{name:'ShiinaRio',vndb:['Shiina Rio']},
 catsystem2:{name:'CatSystem2',vndb:['CatSystem2']},
 majiro:{name:'Majiro',vndb:['Majiro']},
 siglus:{name:'SiglusEngine',vndb:['SiglusEngine']},
 reallive:{name:'RealLive',vndb:['RealLive']},
 avg32:{name:'AVG32',vndb:['AVG32']},
 malie:{name:'Malie',vndb:['Malie']},
 qlie:{name:'QLIE',vndb:['QLIE']},
 liar:{name:'codeX RScript',vndb:['codeX RScript']},
 system4:{name:'AliceSoft System4',vndb:['AliceSoft System4.X']},
 ikura:{name:'Ikura GDL',vndb:['Ikura GDL']},
 advhd:{name:'ADV Player HD / Willadv',vndb:['ADV Player HD','Willadv']},
 mages:{name:'MAGES.',vndb:['MAGES. Engine']},
 softpal:{name:'Softpal ADV System',vndb:['Softpal ADV System']},
 silkys:{name:"Silky's / AI5WIN / AI6WIN",vndb:['Silky Engine','AI5WIN','AI6WIN']},
 cmvs:{name:'CMVS',vndb:['CMVS']},
 fvp:{name:'FVP',vndb:['FVP']},
 rugp:{name:'rUGP',vndb:['rUGP']},
 stuff:{name:'Stuff Script',vndb:['Stuff Script Engine']},
 lucifen:{name:'Lucifen',vndb:['Lucifen']},
 wolf:{name:'Wolf RPG Editor',vndb:['Wolf RPG Editor']},
};

// Distinct Japanese works with 48abbb68 built-in VNDB ids excluded, measured 2026-11-24.
const snapshot={
 at:1795526075720,
 seedIds:'0a176c4d51f3a290998a40e629262cbbd344d9b64b1e00d8d819504b8bd99f5a',
 counts:{
  kirikiri:4492,
  tyrano:3669,
  nscripter:1446,
  renpy:811,
  yuris:513,
  artemis:252,
  bgi:117,
  shiinario:166,
  catsystem2:90,
  majiro:157,
  siglus:95,
  reallive:128,
  avg32:87,
  malie:62,
  qlie:86,
  liar:77,
  system4:75,
  ikura:62,
  advhd:78,
  mages:39,
  softpal:55,
  silkys:65,
  cmvs:19,
  fvp:11,
  rugp:29,
  stuff:9,
  lucifen:29,
  wolf:179,
 },
};
module.exports={engines,snapshot};
