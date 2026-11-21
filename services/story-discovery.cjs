// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Read-only engine discovery. Nothing from a player's save is included in the returned rule artifact. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const cg=require('./game-cg.cjs'),structure=require('./story-structure.cjs'),storyData=require('./story-data.cjs');
const list=dir=>{try{return fs.readdirSync(dir,{withFileTypes:true});}catch{return [];}};
const textDecoder=new TextDecoder('shift_jis');
function literal(arg){const b=arg?.data;if(!b||b.length<3||b[0]!==0x4d)return '';const n=b.readUInt16LE(1);if(n!==b.length-3)return '';const t=textDecoder.decode(b.subarray(3));return /^(["']).*\1$/s.test(t)?t.slice(1,-1):'';}
function integer(b){if(!Buffer.isBuffer(b)||b.length<4)return null;const n=b.readUInt16LE(1);if(b[0]===0x42&&n===1&&b.length===4)return b[3];if(b[0]===0x57&&n===2&&b.length===5)return b.readUInt16LE(3);return null;}
function arrayWrite(x){if(x.op!==39||x.args.length!==2||integer(x.args[1].data)!==1)return null;const b=x.args[0].data;if(b.length<13||b.subarray(0,4).toString('hex')!=='56030040'||b.subarray(-4).toString('hex')!=='29010000')return null;const index=integer(b.subarray(6,-4));if(index===null)return null;return {variable:b.readUInt16LE(4),index};}
function yurisLabels(b){if(b.length<1036||b.toString('latin1',0,4)!=='YSLB')return [];const count=b.readUInt32LE(8);if(count>100000)return [];let p=1036,out=[];
 for(let i=0;i<count;i++){if(p>=b.length)return [];const n=b[p++];if(p+n+12>b.length)return [];const label=textDecoder.decode(b.subarray(p,p+n));p+=n;out.push({label,id:b.readUInt32LE(p),index:b.readUInt32LE(p+4),script:b.readUInt16LE(p+8)});p+=12;}return p===b.length?out:[];}
function yurisSources(b){if(b.length<12||b.toString('latin1',0,4)!=='YSTL')return [];const count=b.readUInt32LE(8);if(count>5000)return [];let p=12,out=[];
 for(let i=0;i<count;i++){if(p+8>b.length)return [];const id=b.readUInt32LE(p),n=b.readUInt32LE(p+4);p+=8;if(n>2048||p+n+20>b.length)return [];const source=textDecoder.decode(b.subarray(p,p+n));p+=n+20;out.push({id,name:path.basename(source.replace(/\\/g,'/'))});}return p===b.length?out:[];}
function yuris(dir,budget){const y=require('./original-engines/yuris.cjs')._internal,archives=[];for(const rel of ['', 'pac'])for(const e of list(path.join(dir,rel)))if(e.isFile()&&/^(?:ysbin|update\d*)\.ypf$/i.test(e.name))archives.push({file:path.join(dir,rel,e.name),name:e.name,location:rel||undefined});
 const rules={locators:[{base:'game',relative:'save/gsd.sd',format:'yuris-yssd-v1'},{base:'game',relative:'savedata/gsd.sd',format:'yuris-yssd-v1'}],scripts:[],gallery:[],chapters:[],candidates:[],evidence:[],partial:true};
 let labels=[],sources=[];const scenes=new Map();
 for(const a of archives){rules.scripts.push({name:a.name,...(a.location?{location:a.location}:{}),sha256:storyData.digest(a.file)});const files=y.ypfList(a.file)||[];
  for(const e of files){if(/(?:^|[\\/])ysl\.ybn$/i.test(e.name))labels=yurisLabels(y.ypfRead(a.file,e));if(/yst_list\.ybn$/i.test(e.name))sources=yurisSources(y.ypfRead(a.file,e));}
  for(const s of y.ypfScenes(a.file)){if(scenes.size>=budget.maxDocuments)break;scenes.set(s.name,s);}
 }
 const persistence=new Map(),parsed=[];let galleryCalls=[];
 for(const s of scenes.values()){const b=s.read();if(b.length>budget.maxDocumentBytes)continue;const instructions=y.ystb(b);if(!instructions)continue;parsed.push({name:s.name,instructions});const calls=[];
  for(const x of instructions){const fn=literal(x.args[0]);if(/^es\.CGMODE\.(?:CG|DEF)\.SET$/i.test(fn))calls.push(/\.CG\.SET$/i.test(fn)?literal(x.args[1]):null);
   if(x.op===40&&literal(x.args[0])==='gsd.sd'){const section=integer(x.args[1]?.data),ref=x.args[2]?.data;if(section!==null&&ref?.length===6&&ref.subarray(0,4).toString('hex')==='76030040')persistence.set(ref.readUInt16LE(4),section);}
  }
  if(calls.length>galleryCalls.length)galleryCalls=calls;
 }
 if(galleryCalls.length){const slots=cg.esSlots(galleryCalls),groups=new Map();for(const [slot,n] of slots.slots){const name=path.basename(n.replace(/\\/g,'/')).replace(/\.[^.]+$/,'').toLowerCase(),gid='e'+slots.entry.get(slot);if(!groups.has(gid))groups.set(gid,{id:structure.id(gid),variants:[],unlockComplete:true});const group=groups.get(gid);if(!group.variants.some(v=>v.name===name))group.variants.push({name});}rules.gallery=[...groups.values()];rules.galleryComplete=true;}
 for(const s of parsed){const number=Number(s.name.match(/\d+/)?.[0]),localLabels=labels.filter(l=>l.script===number&&!l.label.includes('.')).sort((a,b)=>a.index-b.index);if(!localLabels.length)continue;
  const source=sources.find(x=>x.id===number)?.name||s.name;if(!/SCENARIO_MAIN|^[A-E]\d_/i.test(localLabels.map(l=>l.label).join(' ')))continue;
  const nodes=[],edges=[];for(let i=0;i<localLabels.length;i++){const l=localLabels[i],id=structure.id(s.name+':'+l.index);if(nodes.some(n=>n.id===id))continue;nodes.push({id,kind:'scene',label:{ja:l.label},source:{storage:s.name,label:l.label}});}
  /* All straight-line and conditional successors remain candidates until the command definition has been verified. */
  rules.chapters.push({id:structure.id(s.name),label:{ja:source.replace(/\.yst$/i,'')},nodes,edges,partial:true});
  for(let i=0;i<s.instructions.length;i++){const assignment=arrayWrite(s.instructions[i]);if(!assignment||!persistence.has(assignment.variable))continue;
   const section=persistence.get(assignment.variable),near=localLabels.filter(l=>l.index<=i).at(-1);rules.candidates.push({id:structure.id(s.name+':'+i),kind:'persistent-marker',read:{all:['yuris:'+section+':'+assignment.index]},node:near?structure.id(s.name+':'+near.index):undefined,confidence:'candidate',evidence:{file:s.name,instruction:i,variable:assignment.variable,section}});
  }
 }
 rules.evidence.push({kind:'engine-reader',adapter:'original-engines/yuris',notes:'Existing YSTB/YPF reader; persistence references and CG registration only. Candidate assignments are not automatically treated as endings'});return rules;
}
function kirikiri(dir,budget){const xp=require('./original-engines/xp3.cjs'),sc=require('./original-engines/scenes.cjs'),psb=require('./original-engines/psb.cjs'),rules={locators:[{base:'engine-config',relative:'datasu.ksd',format:'kag-system-v1'},{base:'game',relative:'SteamEmu/Saves/datasu.ksd',format:'kag-system-v1'}],scripts:[],gallery:[],chapters:[],candidates:[],evidence:[],partial:true};let documents=0;
 const archives=list(dir).filter(e=>e.isFile()&&/^(?:data(?:_jp)?|scn|scenario|patch\d*)\.xp3$/i.test(e.name)).slice(0,16);
 for(const a of archives){const file=path.join(dir,a.name),entries=xp.list(file)?.files||[],cx=entries.some(e=>e.encrypted)?require('./original-engines/cx-filter.cjs').forArchive(file):null;let used=false;
  for(const e of entries){if(documents>=budget.maxDocuments)break;if((e.size||0)>budget.maxDocumentBytes)continue;
   if(/cglist\.csv$/i.test(e.name)){try{rules.gallery=cg.galleryCsv(sc.decode(xp.read(file,e,cx))).map(s=>({id:structure.id(s.id),variants:s.names.map(name=>({name})),unlockComplete:true}));rules.galleryComplete=rules.gallery.length>0;used=true;}catch{}}
   else if(/\.scn$/i.test(e.name)){let doc;try{const raw=xp.read(file,e,cx);try{doc=psb.parse(raw);}catch{doc=psb.openCx(raw);}}catch{continue;}if(!doc?.root?.scenes)continue;rules.chapters.push(structure.psbGraph(doc.root));documents++;used=true;}
   else if(/^scenario[\\/](?!.*(?:macro|config|system|picture|saveload|title))[^\\/]+\.ks$/i.test(e.name)){try{const t=sc.decode(xp.read(file,e,cx)),graph=structure.kagGraph(path.basename(e.name),t);if(graph.nodes.length){rules.chapters.push(graph);documents++;used=true;}
    for(const m of t.matchAll(/\bsf\.([a-zA-Z_]\w*)\s*=\s*(?:true|1)\b/g))rules.candidates.push({id:structure.id(e.name+':'+m.index),kind:'persistent-marker',read:{all:[m[1]]},confidence:'candidate',evidence:{file:e.name,offset:m.index}});
   }catch{}}
  }
  if(used)rules.scripts.push({name:a.name,sha256:storyData.digest(file)});
 }
 rules.evidence.push({kind:'engine-reader',adapter:'original-engines/scenes+psb+xp3',notes:'Literal KAG/PSB structure. Unsupported expressions remain partial. Save locations derive from engine config, not personal paths'});return rules;
}
function discover(executable,options={}){const dir=path.dirname(executable),names=list(dir).map(e=>e.name),budget={maxDocuments:Math.min(options.maxDocuments||128,512),maxDocumentBytes:8*1024*1024};let engine='unknown',rules;
 if(names.some(n=>/\.xp3$/i.test(n))){engine='kirikiri';rules=kirikiri(dir,budget);}else if(names.some(n=>/^yscfg\.dat$/i.test(n))||list(path.join(dir,'pac')).some(e=>/^ysbin\.ypf$/i.test(e.name))){engine='yuris';rules=yuris(dir,budget);}
 else rules={locators:[],scripts:[],gallery:[],chapters:[],candidates:[],evidence:[],partial:true};
 const build=storyData.digest(executable);return {schema:'megulit.story-rules',version:1,ruleVersion:1,engine,builds:[build],...rules};
}
/* This is the Cardinal handoff contract: only constrained locations and static mapping candidates, no player data. */
function validateRuleDocument(d){if(d?.schema!=='megulit.story-rules'||d.version!==1||d.ruleVersion!==1||!['kirikiri','yuris','unknown'].includes(d.engine))return false;
 if(!storyData.validatePrivacy(d)||typeof d.partial!=='boolean'||d.galleryComplete!==undefined&&typeof d.galleryComplete!=='boolean')return false;
 if(!Array.isArray(d.builds)||!Array.isArray(d.scripts)||!Array.isArray(d.gallery)||!Array.isArray(d.chapters)||!Array.isArray(d.candidates)||!Array.isArray(d.evidence)||d.chapters.length>500||d.candidates.length>10000||JSON.stringify(d).length>8*1024*1024)return false;
 let nodes=0,edges=0;for(const c of d.chapters){if(!c||!Array.isArray(c.nodes)||!Array.isArray(c.edges)||c.nodes.some(n=>!n||typeof n.id!=='string'))return false;nodes+=c.nodes.length;edges+=c.edges.length;if(nodes>50000||edges>200000)return false;}
 const allowed=new Set(['schema','version','ruleVersion','engine','builds','locators','scripts','gallery','chapters','candidates','evidence','partial','galleryComplete']);if(Object.keys(d).some(k=>!allowed.has(k)))return false;
 if(!Array.isArray(d.locators)||d.locators.length>16||d.locators.some(l=>!l||Object.keys(l).some(k=>!['base','relative','format'].includes(k))||!['game','engine-config','appdata','documents'].includes(l.base)||!['kag-system-v1','yuris-yssd-v1'].includes(l.format)||typeof l.relative!=='string'||l.relative.length>240||l.relative.split(/[\\/]/).some(p=>p==='..'||p==='')||/[:*?\x00]/.test(l.relative)||!(l.format==='kag-system-v1'?/(?:^|[\\/])[^\\/]*datasu\.ksd$/i:/(?:^|[\\/])gsd\.sd$/i).test(l.relative)))return false;
 const ids=new Set(d.chapters.flatMap(c=>c.nodes.map(n=>n.id))),staticDoc={schema:'megulit.story',version:1,gameKey:'discovery',builds:d.builds,scripts:d.scripts,sources:d.evidence,gallery:d.gallery,endings:[],chapters:d.chapters};
 const candidateValid=c=>{if(!c||Object.keys(c).some(k=>!['id','kind','read','node','confidence','evidence'].includes(k))||typeof c.id!=='string'||c.id.length>240||c.kind!=='persistent-marker'||c.confidence!=='candidate'||!c.read||typeof c.read!=='object'||Array.isArray(c.read)||Object.keys(c.read).some(k=>!['any','all'].includes(k)))return false;const sets=[c.read.any,c.read.all].filter(v=>v!==undefined);if(sets.length!==1||sets.some(a=>!Array.isArray(a)||!a.length||a.length>64||a.some(k=>typeof k!=='string'||k.length>240||/[\x00-\x1f]/.test(k))))return false;const e=c.evidence;if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).some(k=>!['file','instruction','variable','section','offset'].includes(k))||typeof e.file!=='string'||e.file.length>240||e.file.split(/[\\/]/).includes('..'))return false;for(const [k,v] of Object.entries(e))if(k!=='file'&&(!Number.isSafeInteger(v)||v<0||v>100000000))return false;return c.node===undefined||ids.has(c.node);};
 if(!storyData.validate(staticDoc).ok||d.candidates.some(c=>!candidateValid(c)))return false;
 return !JSON.stringify(d).match(/(?:^|[\s"'=])[A-Za-z]:[\\/]|\\\\|\\Users\\|data:image|UserSID|saveValue|playerProgress|currentValue/i);
}
function validateRules(d){try{return validateRuleDocument(d);}catch{return false;}}
/* Cardinal verifies the signed outer reference. This boundary verifies only its bounded static body and anchors. */
function verifyArtifact(body,reference){try{
 if(!reference||Object.keys(reference).some(k=>!['schema','version','ruleVersion','sha256','bytes','compat'].includes(k))||reference.schema!=='megulit.story-rules'||reference.version!==1||reference.ruleVersion!==1||!/^[a-f0-9]{64}$/.test(reference.sha256)||!Number.isSafeInteger(reference.bytes)||reference.bytes<1||reference.bytes>8*1024*1024)return {ok:false,error:'STORY_ARTIFACT_REFERENCE'};
 const compat=reference.compat;if(!compat||Object.keys(compat).some(k=>!['exe','script'].includes(k))||!['exe','script'].every(k=>/^[a-f0-9]{64}$/.test(compat[k])))return {ok:false,error:'STORY_ARTIFACT_COMPAT'};
 if(!Buffer.isBuffer(body)&&typeof body!=='string')return {ok:false,error:'STORY_ARTIFACT_BODY'};const bytes=Buffer.isBuffer(body)?body:Buffer.from(body,'utf8');if(bytes.length!==reference.bytes||bytes.length>8*1024*1024||crypto.createHash('sha256').update(bytes).digest('hex')!==reference.sha256)return {ok:false,error:'STORY_ARTIFACT_DIGEST'};
 const rules=JSON.parse(bytes.toString('utf8'));if(!validateRules(rules))return {ok:false,error:'STORY_RULES_INVALID'};if(!rules.builds.includes(compat.exe)||!rules.scripts.some(s=>s.sha256===compat.script))return {ok:false,error:'STORY_ARTIFACT_COMPAT'};return {ok:true,rules};
 }catch{return {ok:false,error:'STORY_ARTIFACT_BODY'};}}
module.exports={discover,validateRules,verifyArtifact,literal,integer,arrayWrite,yurisLabels,yurisSources};
