// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Engine fingerprints for the adapter probe: which engine a folder of archives belongs to, from file names, folder
   markers and the first bytes of each archive. Used when no reader opens anything, so the probe can say
   "unsupported-engine: unity" instead of a bare "unknown-pack". Magics follow GARbro's format list
   (github.com/crskycode/GARbro, ArcFormats): only signatures that name one engine are here, generic containers
   (zip, rar, riff, ogg, png) are not. All-engine table, never a per-game rule.

   fingerprint(inventory) → {engine, evidence} | null
   archiveInfo(name, magicHex) → {format, engine, resource} */

/* [ascii magic or {hex}, format, engine] — longest first is not needed: every entry is matched as a prefix */
const MAGIC_ENGINES=[
 ['UnityFS\0','unityfs','unity'],['UnityWeb','unityweb','unity'],['UnityRaw','unityraw','unity'],['FSB5','fsb5','unity'],
 ['Filename','leaf-pck','leaf'],['KCAP','kcap','leaf'],['LAC\0','leaf-lac','leaf'],
 ['XP3\r\n','xp3','kirikiri'],['TJS2','tjs2','kirikiri'],
 ['pf8','pfs-pf8','artemis'],['pf6','pfs-pf6','artemis'],['pf2','pfs-pf2','artemis'],
 ['BURIKO ARC20','bgi-arc20','bgi'],['PackFile    ','bgi-packfile','bgi'],
 ['YPF\0','ypf','yu-ris'],['YKC001','ykc','yuka'],['KIF\0','kif','catsystem2'],['CatScene','catscene','catsystem2'],
 ['NPA\x01','npa','nitroplus'],['NPK2','npk2','nitroplus'],['NPK3','npk3','nitroplus'],
 ['MPK\0','mpk','mages'],['CPK ','cri-cpk','cri'],['AFS\0','cri-afs','cri'],['PSB\0','psb','emote'],['mdf\0','psb-mdf','emote'],
 ['IGA0','iga','innocent-grey'],['WARC','warc','shiina-rio'],['MajiroArcV','majiro-arc','majiro'],['CPZ','cpz','cmvs'],
 ['SM2MPX10','mpx','ikura'],['IFLS','ifl','silkys'],['Entis\x1a','entis','entis'],['vff\0','vff','livemaker'],['PAC ','softpal-pac','softpal'],
 ['LPK1','lpk','lucifen'],['GAMEDAT PAC','pjadv-pac','pjadv'],['DDP2','ddp','ddsystem'],['DDP3','ddp','ddsystem'],['ESC-ARC','escude-arc','escude'],
 ['HUNEXGGEFA10','hfa','hunex'],['SDTS','sdts','srpg'],['FORM','gamemaker','gamemaker'],['RPA-3.0','rpa','renpy'],['RPA-2.0','rpa','renpy'],
 ['RGSSAD\0','rgssad','rgss'],['WOLF','wolf','wolf-rpg'],['AFAH','afa','system4'],['ALK0','alk','system4'],['VERS','ain','system4'],
 ['ARC2','arc2','advhd'],['HyPack','hypack','kogado'],['ONS2','ons2','nscripter'],['AGAR','wad','spike-chunsoft'],['LINK','kaguya-link','kaguya'],['GPK2','gpk','gpk'],
 ['PACK','qlie-pack','qlie'],['FilePackVer','qlie-pack','qlie'],['EPK ','epk','ethornell'],['DXA','dxa','dxlib'],['AR2','ar2','tenco'],
 ['MRG\0','mrg','mrg'],['NNK','nnk','nnk'],['ARCX','arcx','arcx'],['SNPA','snpa','snpa'],['TCR','tcr','tcr'],
];
const MAGIC_HEX=MAGIC_ENGINES.map(([m,format,engine])=>[[...m].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join(''),format,engine]);

/* name rules: [regex on the relative path, engine, resource-only] — resource-only files never hold the script */
const NAME_ENGINES=[
 [/(^|\/)[^/]*_Data\/(resources|sharedassets\d*|globalgamemanagers|level\d+)(\.assets)?$/i,'unity',false],
 [/\.(ress|resource)$/i,'unity',true],
 [/(^|\/)[^/]*_Data\/(StreamingAssets\/)?.*\.(bundle|ab|unity3d)$/i,'unity',false],
 [/(^|\/)rio\d*\.arc$/i,'advhd',false],[/\.rio(\.\d+)?$/i,'age',false],[/\.rio\.(ici|ruo\d*)$/i,'age',true],[/\.ruo\d*$/i,'age',true],
 [/\.pck$/i,null,false],/* engine from the magic: Leaf Filename / Siglus scene.pck */
 [/(^|\/)scene\.pck$/i,'siglus',false],[/(^|\/)gameexe\.dat$/i,'siglus',false],
 [/\.rpa$/i,'renpy',false],[/\.rgss(ad|2a|3a)$/i,'rgss',false],[/\.wolf$/i,'wolf-rpg',false],[/\.xp3$/i,'kirikiri',false],
 [/\.ypf$/i,'yu-ris',false],[/\.ain$/i,'system4',false],[/\.(cpz)$/i,'cmvs',false],[/\.iga$/i,'innocent-grey',false],
];
/* markers seen while walking the folder (names only) */
const MARKERS=[[/^unityplayer\.dll$/i,'unity'],[/^gameassembly\.dll$/i,'unity'],[/_Data$/,'unity-data-dir'],[/^(siglusengine|siglus)[^/]*\.exe$/i,'siglus'],[/^nw\.dll$|^package\.nw$/i,'nwjs']];
/* documents shipped beside a game (manuals, readmes): never a script, never an archive */
/* plain .txt stays a possible script (NekoSDK, plaintext engines) unless its name says manual/readme */
const DOCUMENT=/\.(docx?|xlsx?|pptx?|odt|rtf|pdf|html?|mht|md|chm|url)$|(^|\/)([^/]*(readme|manual|license|licence|copying|changelog|eula|説明|マニュアル|使用|说明|說明|必读|必讀)[^/]*)$/i;
const MEDIA=new Set(['ogg','png','riff','zip','aar','afa','alk','qnt','fsb5']);

function archiveInfo(name,magic){const n=String(name||''),hex=String(magic||'').toLowerCase();let format='',engine=null,resource=false;
 for(const [h,f,e] of MAGIC_HEX)if(hex.length>=Math.min(h.length,16)&&hex.startsWith(h.slice(0,16))){format=f;engine=e;break;}
 for(const [re,e,res] of NAME_ENGINES)if(re.test(n)){if(e&&!engine)engine=e;if(res)resource=true;}
 if(format==='fsb5')resource=true;
 return {format,engine,resource};}

const markerOf=name=>{for(const [re,e] of MARKERS)if(re.test(name))return e;return null;};

/* → {engine, evidence:[...]} | null; votes across every archive and marker, resource-only files count half */
function fingerprint(inv){const votes=new Map(),evidence=new Map();const add=(e,w,why)=>{if(!e||e==='unity-data-dir')return;votes.set(e,(votes.get(e)||0)+w);if(!evidence.has(e))evidence.set(e,why);};
 for(const m of inv?.markers||[])add(m==='unity-data-dir'?'unity':m,2,'marker');
 for(const a of inv?.archives||[]){const i=archiveInfo(a.name,a.magic);add(i.engine,i.resource?1:3,i.format||'name');}
 let best=null;for(const [e,v] of votes)if(!best||v>best[1])best=[e,v];
 return best?{engine:best[0],evidence:evidence.get(best[0])}:null;}

/* the inventory's archives for display: resource-only files go last, identical (engine,format,magic) groups collapse */
function tidy(archives){const seen=new Map(),out=[];
 for(const a of archives){const i=archiveInfo(a.name,a.magic);const row={...a,format:a.format||i.format,engine:i.engine||'',resource:i.resource};
  const k=row.engine+'|'+row.format+'|'+(row.magic||'')+'|'+row.resource;if(row.engine&&row.format&&seen.has(k)){seen.get(k).count=(seen.get(k).count||1)+1;continue;}seen.set(k,row);out.push(row);}
 return out.sort((a,b)=>(a.resource-b.resource)||(b.size-a.size));}

module.exports={DOCUMENT,fingerprint,archiveInfo,markerOf,tidy,MAGIC_ENGINES,MEDIA};
