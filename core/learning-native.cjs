'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{createInterface}=require('node:readline');
const {createReadingResolver}=require('./reading.cjs');
const {kana}=require('./furigana.js');
const {InstallProgress}=require('./install-progress.cjs');
const {conjugation}=require('./morphology.cjs');
const {definitionGroups}=require('./definitions.cjs');
const tags={ 'Ichidan verb':'一段动词（二类动词）','transitive verb':'他动词','intransitive verb':'自动词','noun (common) (futsuumeishi)':'名词','pronoun':'代词','particle':'助词','auxiliary verb':'助动词','auxiliary':'助动词','adverb (fukushi)':'副词','adjective (keiyoushi)':'い形容词','adjectival nouns or quasi-adjectives (keiyodoshi)':'な形容词／形容动词','expressions (phrases, clauses, etc.)':'惯用表达／短语','pre-noun adjectival (rentaishi)':'连体词','conjunction':'接续词','interjection (kandoushi)':'感叹词','suffix':'接尾词','prefix':'接头词','counter':'量词','noun, used as a suffix':'名词（接尾用法）','unclassified':'未分类'};
function chinesePos(tag){
 if(tags[tag])return tags[tag];
 if(/Godan verb/i.test(tag)){const end=/with ['"]?([^'",]+)['"]? ending/i.exec(tag);return '五段动词（一类动词）'+(end?' · '+end[1]+'结尾':'');}
 if(/suru verb/i.test(tag))return 'サ变动词（三类动词）';if(/Kuru verb/i.test(tag))return 'カ变动词（三类动词）';
 if(/Ichidan/i.test(tag))return '一段动词（二类动词）';
 if(/Nidan/.test(tag))return (/upper class/.test(tag)?'上二段动词':'下二段动词')+'（古语）';if(/Yodan/.test(tag))return '四段动词（古语）';
 const extra={"'ku' adjective (archaic)":'ク活用形容词（古语）',"'shiku' adjective (archaic)":'シク活用形容词（古语）',"'taru' adjective":'タリ形容动词','adjective (keiyoushi) - yoi/ii class':'い形容词（良い／いい特殊型）','adverb taking the \'to\' particle':'副词（可接と）','archaic/formal form of na-adjective':'な形容词（古语／正式形式）','auxiliary adjective':'补助形容词','copula':'断定助动词','irregular nu verb':'ナ变动词（古语）','irregular ru verb, plain form ends with -ri':'ラ变动词（古语）','noun or participle which takes the aux. verb suru':'名词／サ变动词','noun or verb acting prenominally':'连体用名词／动词','noun, used as a prefix':'名词（接头用法）',"nouns which may take the genitive case particle 'no'":'名词（可接の）','numeric':'数词','su verb - precursor to the modern suru':'サ变动词（す，古语）','verb unspecified':'动词（类别未指定）'};
 return extra[tag]||tag;
}
class LocalLearning{
 constructor(folder,onStatus=()=>{}){this.folder=folder;this.onStatus=onStatus;this.pending=new Map();this.serial=0;this.cache=new Map();this.readings=createReadingResolver();this.progress={stage:this.installed()?'ready':'idle',percent:this.installed()?100:null};}
 python(){const own=require('./layout.cjs').python;return fs.existsSync(own)?own:'python.exe';}
 runtimeFolder(){return require('./layout.cjs').reading;}
 installed(){return fs.existsSync(path.join(this.runtimeFolder(),'sudachidict_full/resources/system.dic'));}
 async install(retry=false,force=false,only=null){
  const SPECS={sudachi:['sudachidict_full==20261015'],unidic:['unidic-lite==1.0.8']},ALL=['sudachipy==0.7.0','sudachidict_full==20261015','fugashi==1.5.2','unidic-lite==1.0.8'];
  const packages=Array.isArray(only)&&only.length?[...new Set(only.flatMap(id=>SPECS[id]||[]))]:ALL;
  if(this.installing)return this.installing;
  if(this.installError&&!retry)throw Error(this.installError);
  if(retry)this.installError='';
  if(!force&&await require('./python-installer.cjs').dictionariesReady(this.python(),this.runtimeFolder())){this.progress={stage:'ready',percent:100};this.onStatus({learningProgress:this.progress,learningInstalled:true,learningMessage:'SudachiDict Full 已安装，离线词典可用'});return;}
  await require('./python-installer.cjs').ensurePip(this.python(),require('./layout.cjs').root);
  // Repair overwrites the dictionary files; the worker keeps them open (locked on Windows), so stop it first.
  if(force&&this.worker){const old=this.worker;this.worker=null;await new Promise(r=>{old.once('exit',r);try{old.stdin.end();old.kill();}catch{r();}setTimeout(r,3000);});this.cache.clear();}
  const reporter=new InstallProgress(value=>{this.progress=value;this.onStatus({learningProgress:value,learningInstalled:value.stage==='ready'});});
  reporter.update({stage:'resolve',percent:null});
  this.onStatus({learningMessage:'正在安装 SudachiDict Full 本地组件，首次需要下载较大的词典；完成后分词、注音、查词均离线'});
  this.installing=new Promise((resolve,reject)=>{
   const child=spawn(this.python(),['-m','pip','install','--target',this.runtimeFolder(),'--upgrade','--no-compile','--disable-pip-version-check','--progress-bar','raw',...(force?['--force-reinstall','--no-deps','--no-cache-dir']:[]),...packages],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   // Keep pip's own output so a failed install says why (logs/dictionary-install.log and the error message).
   const logFile=path.join(require('./layout.cjs').logs,'dictionary-install.log');let tail='';const keep=(d)=>{const t=d.toString();tail=(tail+t).slice(-20000);try{fs.appendFileSync(logFile,t.replace(/\r(?!\n)/g,'\n').split('\n').filter(l=>!/^Progress \d+ of \d+/.test(l)).join('\n'));}catch{}};
   try{fs.appendFileSync(logFile,'\n===== '+new Date().toISOString()+' pip install '+(force?'(repair) ':'')+packages.join(' ')+'\n');}catch{}
   this.installer=child;child.stdout.on('data',data=>{reporter.feed(data,'out');keep(data);});child.stderr.on('data',data=>{reporter.feed(data,'err');keep(data);});
   child.on('error',()=>reject(Error('无法启动本地 Python，请安装 Python 3.13 并重启新版启动器')));
   child.on('exit',code=>{this.installer=null;if(code===0&&this.installed()){reporter.finish(true);this.onStatus({learningMessage:'SudachiDict Full 已安装，分词／注音／点读全部就绪'});resolve();}else{const lines=tail.split(/\r?\n/).map(l=>l.trim()).filter(l=>l&&!/^Progress \d+ of \d+/.test(l));const why=[...lines].reverse().find(l=>/error|could not|denied|permission|timed out|connection|ssl|winerror|拒绝|访问/i.test(l))||lines.at(-1)||'';reject(Error('词典下载或安装失败'+(why?'：'+why.slice(0,220):'')+'（完整输出见 logs\\dictionary-install.log）'));}});
  }).catch(e=>{reporter.finish(false);this.installError=e.message;this.onStatus({learningMessage:e.message});throw e;}).finally(()=>{this.installing=null;});return this.installing;
 }
 async ready(){
  if(this.closed)throw Error('本地辞书已关闭');
  if(this.installing)await this.installing.catch(()=>{});
  if(!this.installed())await this.install();if(this.worker)return this.starting;
  try{await this.spawnWorker();}
  catch(error){
   // User report (2026-11-09): the worker died on start (a half-finished install) and every lookup said
   // "reinstall in settings" without saying where. Repair the reading components once on our own, then retry.
   if(this.selfRepaired)throw this.workerError(error);
   this.selfRepaired=true;this.onStatus({learningMessage:'分词组件无法启动，正在自动修复（重新下载 Sudachi 组件）…'});
   try{await this.install(true,true);await this.spawnWorker();}catch(again){throw this.workerError(again);}
  }
 }
 workerError(error){const why=String(error?.message||'').slice(0,200);return Error('分词组件无法运行，自动修复后仍失败：请按 Alt+T → 设置 → 词典 → 「修复 / 重新下载」'+(why?'（'+why+'）':''));}
 // Starts reading-worker.py and resolves once it reports ready; a crash before that rejects with its last stderr
 // line, which is also kept in logs/reading-worker.log so a failed start can be diagnosed.
 spawnWorker(){
  const child=spawn(this.python(),[path.join(__dirname,'reading-worker.py')],{windowsHide:true,cwd:__dirname,env:{...process.env,TOMOYO_READING_RUNTIME:this.runtimeFolder()},stdio:['pipe','pipe','pipe']});this.worker=child;
  let stderr='',ready=false;child.stdin.on('error',()=>{});child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-6000);});
  const log=text=>{try{fs.appendFileSync(path.join(require('./layout.cjs').logs,'reading-worker.log'),'\n===== '+new Date().toISOString()+'\n'+text+'\n');}catch{}};
  this.starting=new Promise((resolve,reject)=>{
   const fail=error=>{if(this.worker===child)this.worker=null;const last=stderr.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).at(-1)||(error?.message||'');if(stderr||error)log((error?.message||'exit')+'\n'+stderr);
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(this.workerError(Error(last)));}this.pending.clear();if(!ready)reject(Error(last||'worker exited'));};
   child.on('error',fail);child.on('exit',code=>fail(code?Error('exit code '+code):null));
   createInterface({input:child.stdout}).on('line',line=>{let m;try{m=JSON.parse(line);}catch{return;}if(m.type==='ready'){ready=true;this.runtimeInfo=m;this.onStatus({learningMessage:'实际运行：'+m.dictionary+' '+m.dictionaryVersion+' / SudachiPy '+m.engineVersion+' ＋本机 JMdict'});resolve();return;}const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);m.error?p.reject(Error(m.error)):p.resolve(m.tokens);});
  });
  this.starting.catch(()=>{});return this.starting;
 }
 async tokenize(text){
  if(this.cache.has(text))return this.cache.get(text);await this.ready();
  const tokens=await new Promise((resolve,reject)=>{const id=++this.serial,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('本地分词等待超时，请检查 Full 组件状态'));},45000);this.pending.set(id,{resolve,reject,timer});this.worker.stdin.write(JSON.stringify({id,text})+'\n');});
  const corrected=this.dictionaryWords(tokens);this.cache.set(text,corrected);if(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);return corrected;
 }
 // Whole adjacent tokens that together spell one JMdict word with a single reading are that word: Sudachi split
 // 後一歩 into 後一 (ゴイチ) + 歩 (アユミ, a given name), so furigana and speech said ごいちあゆみ while the dictionary card
 // knew あといっぽ (user, 2026-11-03). Only when the joined guess differs from the dictionary reading; up to 4 tokens,
 // longest first, never across punctuation or a gap.
 dictionaryWords(tokens){
  if(!Array.isArray(tokens)||tokens.length<2)return tokens;this.load();const out=[];
  for(let i=0;i<tokens.length;i++){let best=null,stop=i;
   for(let j=Math.min(tokens.length,i+4)-1;j>i&&!best;j--){const part=tokens.slice(i,j+1);
    if(part.some((t,k)=>!t.surface?.trim()||t.pos==='補助記号'||(k&&part[k-1].end!==t.start)))continue;
    const surface=part.map(t=>t.surface).join('');if(!/[\p{Script=Han}々]/u.test(surface))continue;
    const readings=this.compoundReadings(surface);
    if(readings.length!==1||kana(part.map(t=>t.reading||'').join(''))===readings[0])continue;
    best={...tokens[i],surface,base_form:surface,normalized:surface,end:tokens[j].end,reading:readings[0],reading_source:'JMdict 词语读音',subtokens:part};stop=j;}
   out.push(best||tokens[i]);i=stop;}
  return out;
 }
 compounds(tokens){
  this.load();const output=[];
  for(let i=0;i<tokens.length;i++){
    let best=null,stop=i,surface=tokens[i].surface;
    const numeric=tokens[i].grammar?.[1]==='数詞'||/^[0-9０-９一二三四五六七八九十百千万]+$/.test(surface);
    if(numeric)for(let j=i+1;j<Math.min(tokens.length,i+5);j++){
      if(tokens[j-1].end!==tokens[j].start||!tokens[j].surface.trim())break;
      surface+=tokens[j].surface;
      const readings=this.compoundReadings(surface);
      if(readings.length===1){best={...tokens[i],surface,base_form:surface,normalized:surface,end:tokens[j].end,reading:readings[0],reading_source:'JMdict 复合词书写读音',subtokens:tokens.slice(i,j+1)};stop=j;}
    }
    output.push(best||tokens[i]);if(best)i=stop;
  }
  return output;
 }
 compoundReadings(surface){
  const entries=(this.index.get(surface)||[]).map(id=>this.byId.get(id));
  const headwords=entries.filter(e=>!e.spellings?.length||e.spellings[0]===surface);
  // A fully kanji compound can be a valid spelling variant of the same word.
  // Mixed spellings keep the headword rule so an inflected verb cannot borrow
  // the reading of a different verb that lists it as an alternative.
  const matches=headwords.length||!/^\p{Script=Han}+$/u.test(surface)?headwords:entries;
  return [...new Set(matches.flatMap(e=>e.readings).map(kana))];
 }
 load(){
  if(this.index)return;this.index=new Map();this.byId=new Map();this.english=new Map();const root=require('./paths.cjs').resources;
  for(const entry of JSON.parse(fs.readFileSync(path.join(root,'jmdict.json'),'utf8'))){this.byId.set(entry.id,entry);for(const key of [...entry.spellings,...entry.readings]){const ids=this.index.get(key)||[];ids.push(entry.id);this.index.set(key,ids);}}
  const backup=path.join(root,'jmdict.english.json'); // English senses for the English learner mode
  if(fs.existsSync(backup))for(const entry of JSON.parse(fs.readFileSync(backup,'utf8')))this.english.set(entry.id,entry);
 }
 adapt(entry,language){
  this.load();const selected=language==='en'?(this.english.get(entry.id)||entry):(this.byId.get(entry.id)||entry);
  return {...selected,pos:language==='en'?selected.pos:selected.pos.map(chinesePos),definition_groups:definitionGroups(selected)};
 }
 adaptResult(result,language){if(Array.isArray(result))return result.map(r=>this.adaptResult(r,language));if(!result)return result;return {...result,entries:(result.entries||[]).map(e=>this.adapt(e,language)),related_entries:(result.related_entries||[]).map(e=>this.adapt(e,language))};}
 entries(token,language){
  this.load();let ids=[];for(const key of [token.derived_from,token.lookup_from,token.base_form,token.normalized,token.surface].filter(Boolean)){ids=this.index.get(key)||[];if(ids.length)break;}
  const reading=kana(token.reading||'');
  ids=[...ids].sort((a,b)=>{
   const left=this.byId.get(a),right=this.byId.get(b),match=e=>e.readings.some(r=>kana(r)===reading)?0:1;
   return match(left)-match(right)||(left.freq_rank||999999)-(right.freq_rank||999999);
  });
  return ids.slice(0,20).map(id=>{
   const entry=this.adapt(this.byId.get(id),language),conjugation=token.grammar?.[4]||'';
   if(language==='zh'&&/上一段|下一段|五段/.test(conjugation)){
    const match=conjugation.match(/(上一段|下一段|五段)(?:-(.+))?/),label=match[1]+'动词（'+(match[1]==='五段'?'一类':'二类')+'动词'+(match[2]?' · '+match[2]:'')+'）';
    return {...entry,pos:entry.pos.map(p=>/一段动词|五段动词/.test(p)?label:p)};
   }return entry;
  });
 }
 // A noun that takes する (JMdict "takes the aux. verb suru", or Sudachi サ変可能) followed by する is one サ変 verb:
 // 検分して was explained as the noun 検分 plus する (user, 2026-11-03). Nouns that cannot take する stay separate.
 suruNoun(t,n){if(t?.pos!=='名詞'||n?.pos!=='動詞'||n.base_form!=='する'||n.start!==t.end)return false;if(t.grammar?.[2]==='サ変可能')return true;
  return (this.index?.get(t.base_form)||[]).some(id=>this.byId.get(id).pos.some(p=>/takes the aux. verb suru/.test(p)));}
 groups(tokens){
  const groups=[];
  for(let i=0;i<tokens.length;i++){
   let t=tokens[i];if(!t.surface.trim())continue;
   if(this.suruNoun(t,tokens[i+1])){const n=tokens[i+1];t={...n,start:t.start,surface:t.surface+n.surface,base_form:t.base_form+'する',normalized:(t.normalized||t.base_form)+'する',reading:(t.reading||'')+(n.reading||''),lookup_from:t.base_form,suru_noun:t};i++;}let end=t.end,surface=t.surface,aux=[],parts=[t];
   if(['動詞','形容詞','助動詞'].includes(t.pos))while(i+1<tokens.length){const n=tokens[i+1],connect=n.pos==='助詞'&&['て','で','ば'].includes(n.surface),support=parts.some(p=>['て','で'].includes(p.surface))&&n.pos==='動詞'&&n.grammar?.[1]==='非自立可能'&&['いる','居る','おく','置く','しまう','みる','見る','くる','来る','いく','行く'].includes(n.base_form);if(n.start!==end||!(n.pos==='助動詞'||connect||support||t.pos==='形容詞'&&n.pos==='形容詞'&&n.grammar?.[1]==='非自立可能'&&n.base_form==='ない'))break;i++;end=n.end;surface+=n.surface;aux.push(n.base_form);parts.push(n);}
   const group={...t,end,surface,aux,parts};if(!this.index?.has(t.base_form)&&/[上下]一段/.test(t.grammar?.[4]||'')&&t.base_form.endsWith('る')){const chars=[...t.base_form],e=chars.at(-2),map={'え':'う','け':'く','げ':'ぐ','せ':'す','て':'つ','ね':'ぬ','べ':'ぶ','め':'む','れ':'る'},last=map[e];if(last){const root=chars.slice(0,-2).join('')+last;const ids=this.index?.get(root)||[];if(ids.some(id=>this.byId.get(id).pos.some(p=>p.includes('Godan verb')))){group.derived_from=root;group.derivation='potential';}}}
   groups.push(group);
  }return groups;
 }
 async word(args,entryId){
  const result=await this.request('lookup_exact',args,'zh'),tokens=await this.tokenize(args.text),token=tokens.find(t=>t.start===args.start&&t.end===args.end),head=tokens.find(t=>t.start===args.start),entry=result.entries?.find(e=>e.id===entryId)||result.entries?.[0],m=result.morphology||{};
  let chosen=token,reading=token?.reading||m.reading||'',surface=result.surface,pronunciationForm='surface';
  if(!chosen&&head?.lexeme?.base===m.base&&entry?.readings?.some(r=>kana(r)===kana(head.lexeme.reading))){chosen=head;reading=head.lexeme.reading;surface=m.base;pronunciationForm='lemma';}
  // A selection spanning several tokens (e.g. 木曜日の空) reads as the sentence-context readings joined in order.
  let phrase=false;if(!chosen){const inside=tokens.filter(t=>t.start>=args.start&&t.end<=args.end).sort((a,b)=>a.start-b.start);if(inside.length>1&&inside[0].start===args.start&&inside.at(-1).end===args.end&&inside.every((t,i)=>i===0||inside[i-1].end===t.start)&&inside.every(t=>t.reading||!/[一-龯々]/.test(t.surface))){reading=inside.map(t=>t.reading||t.surface).join('');surface=[...args.text].slice(args.start,args.end).join('');phrase=true;pronunciationForm='phrase';}}
  const ambiguous=!reading||!!chosen?.reading_ambiguous||!phrase&&!!entry&&!entry.readings?.some(r=>kana(r)===kana(reading));
  return {surface,clickedSurface:result.surface,base:m.base||result.surface,reading,pitch:chosen?.pitch||[],pitchSource:chosen?.pitch_source||(phrase?'词组 · 音调由语音引擎估计':'UniDic 未匹配 · 音调由语音引擎估计'),pronunciationForm,ambiguous,pos:m.wordClass||entry?.pos?.join('、')||'',meaning:entry?.definition_groups?.map(g=>g.text).join('\n')||entry?.definitions?.join('\n')||'',sentence:args.text};
 }

 async request(command,args,language='zh'){
  const text=args.text;if(typeof text!=='string'||[...text].length>4000)throw Error('无效查词文本');
  const tokens=await this.tokenize(text);if(command==='tokenize_text')return tokens;
  this.load();const groups=this.groups(tokens).flatMap(t=>{
    const found=[t.base_form,t.normalized,t.surface].some(k=>this.index.has(k));
    return !found&&t.subtokens?.length>1?this.groups(t.subtokens):[t];
  });
  const make=t=>{const morphology=conjugation(t,language);return {start:t.start,end:t.end,surface:t.surface,entries:this.entries(t,language),related_entries:[],morphology,deconjugated_from:morphology.forms.length?[morphology.forms.join(' · '),morphology.rules.join('；')].filter(Boolean).join('｜'):null};};
  if(command==='scan_sentence')return groups.map(make).filter(r=>r.entries.length);
  let group=command==='lookup_exact'?groups.find(t=>t.start===args.start&&t.end===args.end):groups.find(t=>args.position>=t.start&&args.position<t.end);
  if(command==='lookup_at_position'&&group){const index=groups.indexOf(group);let best=group;for(let a=Math.max(0,index-5);a<=index;a++){let surface='',parts=[];for(let z=a;z<Math.min(groups.length,a+7);z++){const t=groups[z];if(z>a&&groups[z-1].end!==t.start||t.pos==='補助記号')break;surface+=t.surface;parts.push(...(t.parts||[t]));if(surface.length>60)break;if(z>=index&&surface.length>best.surface.length&&this.index.has(surface)){const readings=[...new Set(this.index.get(surface).flatMap(id=>this.byId.get(id).readings))];best={...groups[a],start:groups[a].start,end:t.end,surface,base_form:surface,normalized:surface,reading:readings.length===1?readings[0]:parts.map(p=>p.reading||'').join(''),parts,aux:[]};}}}group=best;}
  if(command==='lookup_at_position'&&Number(args.skip)>0)return null;
  if(command==='lookup_exact'){
   const length=[...text].length;if(!Number.isSafeInteger(args.start)||!Number.isSafeInteger(args.end)||args.start<0||args.end<=args.start||args.end>length)throw Error('无效选区');
   const surface=[...text].slice(args.start,args.end).join(''),inside=groups.filter(t=>t.end>args.start&&t.start<args.end);let analysis=inside.map(make),wholeMatch=!!group||this.index.has(surface),exact=group?make(group):make({surface,base_form:surface,start:args.start,end:args.end,aux:[],parts:[]});
   if(!exact.entries.length){const expressive=surface.replace(/っ(?=[か-こさ-そた-とは-ほ])/gu,'');if(expressive!==surface&&this.index.has(expressive)){exact=make({surface,base_form:expressive,start:args.start,end:args.end,parts:inside.flatMap(t=>t.parts||[t])});exact.match_note='口语促音强调写法；辞书原形：'+expressive;wholeMatch=true;}}
   if(!exact.entries.length)exact.entries=[...new Map(analysis.flatMap(a=>a.entries).map(e=>[e.id,e])).values()].slice(0,20);
   exact.selection_analysis={surface,exact:wholeMatch,parts:analysis,source:'SudachiDict Full ＋ JMdict（本地）'};return exact;
  }
  return group?make(group):null;
 }
 stop(){this.closed=true;this.worker?.stdin.end();this.installer?.kill();for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('本地辞书已关闭'));}this.pending.clear();}
}
module.exports={LocalLearning,chinesePos};
