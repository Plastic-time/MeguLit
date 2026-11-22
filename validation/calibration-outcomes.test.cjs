process.env.MEGULIT_RELAY_BASE??='off';/* tests never reach the real relay */
// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-19 (user, 素晴らしき日々 / BGI 1.647, windowed): "校准像一坨屎，黑字白描边变成全黑了", "莫名其妙点了校准之后字就不替换了".
   Log: the writable EmbedBGI stream was written back hidden until the first calibration showed the original; the font layer then saw
   GDI glyphs, one hit "proved" the glyph pass-through, every later line reached the game unchanged, and BGI, which keeps the glyphs it
   rasterised, left kana and common kanji on screen (some as the black outline pass alone). The calibration and the per-line pixel
   sample measured that leftover: black. Whatever a calibration ends with, the hide state is the one from before it. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {HookNative}=require('../core/hook-native.cjs');
const {HookControl}=require('../core/hook-control.cjs');
const {GameStyleSync,combine}=require('../core/game-style-sync.cjs');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

function rig({placement=true,engine='krkr',publish=true}={}){
 const sent=[],hook=new HookNative({native:__dirname,hook:__dirname,logs:'Z:/no-fixture-log'},()=>{},()=>{},()=>1000);
 clearInterval(hook.timer);
 hook.send=m=>sent.push(m);hook.trace=()=>{};
 hook.ownTextFn=()=>placement;hook.compositedFn=()=>false;hook.pageMode=engine?{engine}:null;
 const state={bound:true,gameProcessId:123,gameStarted:'1',gameHwnd:'456',coverEnabled:true};
 const preferences={hookProfile:'embed',hookHide:true,hookAutoStart:true,bindEnabled:true,maskMode:'hook',autoGameStyle:true};
 hook.process={kill(){}};hook.pid=123;hook.started='1';hook.enabled=true;hook.route='embed';
 const style={statuses:[],status(s){this.statuses.push(s);},begin(){},request(){},publish(){return publish;},cancel(){this.cancelled=true;}};
 const host={state,preferences,hooks:hook,styleSync:style,onEvent(){},notify(){},send(){},save(){}};
 const control=new HookControl(host,()=>1000);control.plan='embed';control.running=true;
 hook.configure(preferences,state);sent.length=0;
 return {hook,control,style,sent,switches:()=>sent.filter(m=>m.type==='enable'||m.type==='disable'),hide:()=>({enabled:hook.enabled,route:hook.route,preflight:hook.preflight,calibrating:hook.calibrating===true})};
}
const outcomes={
 'measured':r=>r.control.finishStyleSync(true),
 'not found':r=>r.control.finishStyleSync(false),
 'cancelled by the user':r=>r.control.finishStyleSync(false,true),
 'cancelled twice':r=>{r.control.finishStyleSync(false,true);r.control.finishStyleSync(false,true);},
 'the game was closed and started again':r=>{r.control.host.state.gameStarted='2';r.control.finishStyleSync(false);r.control.host.state.gameStarted='1';},
};
for(const engine of ['krkr','']) for(const placement of [true,false]) for(const manual of [true,false]) for(const [name,end] of Object.entries(outcomes)){
 test('a calibration that ends "'+name+'" leaves hiding as it was ('+(engine||'no engine page')+', '+(placement?'overlay placement':'reader box')+', '+(manual?'manual':'automatic')+')',()=>{
  const r=rig({engine,placement});const before=r.hide();
  r.control.beginStyleSync(manual,'all');
  /* 2026-11-21 (owner, test pack v5 Fata): the KiriKiri page reports every character's box: calibration follows it, never gives way */
  if(engine==='krkr'){assert.deepEqual(r.switches(),[],'no give way on a KiriKiri page');assert.equal(r.style.statuses.at(-1),'following');end(r);assert.deepEqual(r.hide(),before);assert.deepEqual(r.switches(),[]);return;}
  assert.deepEqual(r.switches(),[{type:'disable',reason:'reader-preflight'}],'every hide layer gives way while the probe measures');
  end(r);
  if(name==='the game was closed and started again'){assert.equal(r.hook.preflight,false);assert.equal(r.hook.calibrating===true,false);return;} /* another process: its own start decides */
  assert.deepEqual(r.hide(),before,'hide state after = hide state before');
  assert.deepEqual(r.switches().map(m=>m.type),['disable','enable'],'one give-way, one return; nothing in between, nothing after');
 });}
test('a second calibration started while one runs does not leave the first one\'s give-way behind',()=>{const r=rig({engine:''});const before=r.hide();
 r.control.beginStyleSync(true,'all');r.control.beginStyleSync(true,'text');r.control.finishStyleSync(false);
 assert.deepEqual(r.hide(),before);assert.equal(r.switches().at(-1).type,'enable');assert.equal(r.switches().filter(m=>m.type==='disable').length,1);});

test('colours: light on dark, dark on light, plain and gradient are written; a fill that does not stand out from its background is not',()=>{
 const sample=(style,read=false)=>({read,lineKind:'narration',style:{x:10,y:70,width:60,height:10,japaneseSize:30,japaneseSpacingPx:0,lineHeight:1.4,...style},width:1280,height:720,inkHeight:30,advance:30,lineStep:42,wrapWidth:700,inkLeft:130,inkTop:500,rows:1});
 const run=style=>{const sync=new GameStyleSync({native:__dirname,config:null},()=>{},()=>null);sync.p={textColor:'#f8f8f8',japaneseOutline:true,japaneseOutlineColor:'#000000',shadow:'outline'};sync.status=()=>{};sync.samples=[sample(style),sample(style)];assert.equal(sync.publish(),true);return sync;};
 /* light text, dark outline (measured on the user's 死に逝く君 frame: #fdf479 / #060201 on #49296a) */
 {const s=run({textColor:'#fdf479',textEdgeColor:'#060201',textBackColor:'#49296a'}).latest;assert.equal(s.style.textColor,'#fdf479');assert.equal(s.style.outlineColor,'#060201');assert.equal(s.colourRejected,undefined);}
 /* dark text, white halo too thin to measure (the user's 素晴らしき日々 frame: #000001 on #799ebe, no edge): black is written, with a white outline, not the saved black one */
 {const s=run({textColor:'#000001',textBackColor:'#799ebe'}).latest;assert.equal(s.style.textColor,'#000001');assert.equal(s.style.outlineColor,'#ffffff');}
 /* dark text with a measured light outline keeps the measured one */
 {const s=run({textColor:'#101018',textEdgeColor:'#f4f4ff',textBackColor:'#799ebe'}).latest;assert.equal(s.style.outlineColor,'#f4f4ff');}
 /* dark text on a light text box, no outline: legitimate, written */
 {const s=run({textColor:'#282430',textBackColor:'#f0ece1'}).latest;assert.equal(s.style.textColor,'#282430');assert.equal(s.style.outlineColor,'#ffffff');}
 /* plain light text without an outline keeps the saved outline */
 {const s=run({textColor:'#fefefe',textBackColor:'#101820'}).latest;assert.equal(s.style.textColor,'#fefefe');assert.equal(s.style.outlineColor,undefined);}
 /* a gradient is passed as measured */
 {const s=run({textColor:'#fffaf2',textGradient:true,textGradientTop:'#fffaf2',textGradientBottom:'#a8c8ff',textBackColor:'#101820'}).latest;assert.equal(s.style.textGradient,true);assert.equal(s.style.textGradientTop,'#fffaf2');assert.equal(s.style.textGradientBottom,'#a8c8ff');}
 /* the fill is the background: nothing of the colours is written, position and size are */
 {const sync=run({textColor:'#7a9cba',textBackColor:'#799ebe'}),st=sync.latest.style;for(const k of ['textColor','narrationTextColor','speechTextColor','readTextColor','outlineColor'])assert.equal(st[k],undefined,k+' is not written');
  assert.equal(sync.latest.colourRejected,true);assert.equal(sync.rejected.background,'#799ebe');assert.ok(Number.isFinite(st.x)&&Number.isFinite(st.japaneseSize));}
 assert.equal(combine.lostInBackground({textColor:'#000001',textBackColor:'#799ebe'}),'');assert.equal(combine.lostInBackground({textColor:'#fefefe'}),'','no background known: not judged');
 /* the reader takes the outline for the Japanese line, its translation and the furigana, only together with a colour */
 assert.ok(read('web/reader/modules/game-style-sync-ui.js').includes("if(/^#[0-9a-f]{6}$/i.test(s.outlineColor||'')&&out.textColor!==undefined){out.japaneseOutlineColor=out.chineseOutlineColor=out.rubyOutlineColor=s.outlineColor;}"));});

test('a dark sentence sampled from the game window brings its own outline; a light one keeps the saved outline',async t=>{
 const os=require('node:os'),{PassThrough}=require('node:stream');
 const native=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-line-outline-'));fs.writeFileSync(path.join(native,'GameStyleProbe.exe'),'');t.after(()=>fs.rmSync(native,{recursive:true,force:true}));
 const requests=[],events=[],stdout=new PassThrough();const child={stdin:{write:l=>requests.push(JSON.parse(l)),on(){},end(){}},stdout,on(){},kill(){}};
 const sync=new GameStyleSync({native,config:null},m=>events.push(m),()=>child);sync.lineDelay=0;sync.configure({autoGameStyle:true},{bound:true,gameHwnd:'100',gameProcessId:7,gameStarted:1});t.after(()=>sync.stop());
 const wait=()=>new Promise(r=>setTimeout(r,15));
 const once=async(text,style)=>{const before=events.length,asked=requests.length;assert.equal(sync.lineStyle(text,true,false),true);await wait();assert.equal(requests.length,asked+1,'the helper was asked');stdout.write(JSON.stringify({id:requests.at(-1).id,result:{valid:true,style}})+'\n');await wait();return events.slice(before).find(m=>m.type==='lineStyleSample')||null;};
 const dark=await once('やっぱり……いい女になったなと屋上で思う。',{textColor:'#000001',textBackColor:'#799ebe'});
 assert.ok(dark);assert.equal(dark.style.fill,'#000001');assert.equal(dark.style.edge,'#ffffff');
 const light=await once('そして――殺人――――。',{textColor:'#fdf479',textEdgeColor:'#060201',textBackColor:'#49296a'});
 assert.ok(light);assert.equal(light.style.fill,'#fdf479');assert.equal(light.style.edge,undefined);
 assert.equal(await once('空の下で、街は静かに息をしている。',{textColor:'#7a9cba',textBackColor:'#799ebe'}),null,'a fill that is its background is no sample');});

test('no per-line pixel sample while MeguLit hides the game text: what is found then is a leftover of the hide',()=>{
 const sync=new GameStyleSync({native:__dirname,config:null},()=>{},()=>null);sync.lineDelay=0;sync.configure({autoGameStyle:true},{bound:true,gameHwnd:'100',gameProcessId:7,gameStarted:1});
 try{assert.equal(sync.lineStyle('当たり前と言えば当たり前……、',true,true),false);assert.equal(sync.lineStyle('当たり前と言えば当たり前……、',true,false),true);}finally{sync.stop();}
 assert.ok(read('core/gal-native.cjs').includes("this.styleSync.lineStyle(message.hookSource,message.hookSourceOrigin!=='history',this.hooks.enabled===true&&this.hooks.preflight!==true);"));});

test('the glyph pass-through is taken back by a cache report or a line with unblanked glyphs; the writable stream is written back hidden again',()=>{const hb=read('native/HookBridge.cs');
 const ok=hb.slice(hb.indexOf('public static bool GlyphAllOk(string text){'));
 assert.ok(ok.indexOf('if(GlyphPassLeaked)return false;')>0&&ok.indexOf('if(GlyphPassLeaked)return false;')<ok.indexOf('if(GlyphProven)return true;'),'the verdict outranks the proof');
 assert.ok(hb.includes('static void GlyphAllProof(string by){if(GlyphProven||GlyphPassLeaked)return;'),'a later hit does not prove it again');
 assert.ok(hb.includes('if(GlyphMode!="dot")GlyphPassLeak("cache "+s.Substring(6));'),'the cache report on the dots channel counts in blank mode');
 assert.ok(hb.includes('static void GlyphReport(string s){Diagnostic("glyph hide "+s);GlyphLineReport(s);'));
 assert.ok(hb.includes('Interlocked.Increment(ref GlyphLeakLines);GlyphPassLeak("a line with glyphs that were not blanked ("+s.Substring(5)+")");'),'the first leaking line is enough');
 assert.ok(hb.includes('if(!GlyphLeakSelfTest()){'));
 /* the recorded lines of that session */
 assert.ok(hb.includes('GlyphLineReport("line seq=6 chars=13 placed=2 hidden=2 requested=3 repeat=2 missing=2");')&&hb.includes('GlyphDots("cache seq=15 missing=3 of 3");'));});

test('discarding the new settings also drops the colour painted on the current sentence; the probe knows white text on a light sky',()=>{
 assert.ok(read('web/reader/modules/game-style-sync-ui.js').includes('const before=session.cancel();apply(before.prefs,before.map);/* the colour painted on the current sentence from a sample taken during the discarded calibration goes with it */b.lineColorReset?.();'));
 {const probe=read('native/GameStyleProbe.cs');for(const c of ['new[]{Color.FromArgb(120,170,230),Color.White,Color.FromArgb(16,16,24)}','new[]{Color.FromArgb(121,158,190),Color.Black,Color.White}','new[]{Color.FromArgb(240,236,225),Color.FromArgb(40,36,48),Color.Transparent}','style["textBackColor"]=backColor;','Text background colour mismatch'])assert.ok(probe.includes(c),c);}});

test('a calibration changes only what it was asked for: text keeps the place, position keeps colours and size',()=>{
 const tools=require('../core/game-profile.js');
 const measured={x:19.4,y:79.3,width:64,anchorDX:0,anchorDY:0,japaneseSize:30.9,translationSize:30.9,japaneseSpacingPx:0,lineHeight:-1.25,lineHeightMode:'offset',textColor:'#fdf479',japaneseOutlineColor:'#060201',chineseOutlineColor:'#060201',rubyOutlineColor:'#060201',paddingX:0,paddingY:0,autoScale:true};
 const text=tools.pick(measured,'text'),position=tools.pick(measured,'position');
 for(const k of ['x','y','width','anchorDX','anchorDY','paddingX','paddingY'])assert.equal(text[k],undefined,'仅校准文字 leaves '+k);
 for(const k of ['textColor','japaneseOutlineColor','chineseOutlineColor','rubyOutlineColor','japaneseSize','translationSize','lineHeight','japaneseSpacingPx'])assert.equal(position[k],undefined,'仅校准位置 leaves '+k);
 assert.deepEqual(Object.keys(position).sort(),['anchorDX','anchorDY','paddingX','paddingY','width','x','y']);
 assert.equal(text.textColor,'#fdf479');assert.equal(text.japaneseOutlineColor,'#060201');assert.equal(text.japaneseSize,30.9);
 const ui=read('web/reader/modules/game-style-sync-ui.js');
 assert.ok(ui.includes("apply(pick(out,part));message=t('measured');aligning=part!=='text';"),'the measured style goes through the part filter');
 assert.ok(ui.includes("if(part!=='text'){const target={...r,"),'the position map is only finished for a calibration that includes the position');});

test('a position calibration of an anchored line goes through the one entry that moves it onto the game\'s ink',()=>{
 /* live 死に逝く君 2026-11-19 08:07:13Z: "placement placed: line 100006, 12 characters, first box 322,743,31,34 in client 1671x939";
    the reader's first glyph was at client y 868 (layoutDiagnostic firstGlyphTop 940.8, clientY 73), the game's own at about 750.
    The saved offset is corrected by b.alignToGameInk (fix/no-repeat 94f5ddfa); this side measures and hands the ink over, in client pixels. */
 const ui=read('web/reader/modules/game-style-sync-ui.js');
 assert.ok(ui.includes('alignToGameInk=target=>new Promise(done=>runCorrection(target,done))'),'one entry');
 assert.ok(!ui.includes('out.anchorDX=0'),'no second writer of the offset');
 assert.ok(ui.includes("if(part!=='text'&&Number.isFinite(r.inkLeft)&&Number.isFinite(r.inkTop)"),'the measured ink reaches it; 仅校准文字 never moves the line');
 const engineTop=743,gameTop=750,readerTopBefore=940.8-73;assert.ok(Math.abs(engineTop-gameTop)<=10&&readerTopBefore-gameTop>100,'the engine place was right, the offset was the error');});

test('taking the glyph pass-through back tells the user once what to do about the first lines',()=>{const hb=read('native/HookBridge.cs');
 const leak=hb.slice(hb.indexOf('static void GlyphPassLeak(string why){'),hb.indexOf('static void GlyphLineReport(string s){'));
 assert.ok(leak.startsWith('static void GlyphPassLeak(string why){if(GlyphPassLeaked)return;'),'once a run');
 assert.ok(leak.includes('{"allFailed",GlyphVersion}'),'and remembered for the game, so not on the next run');
 assert.ok(leak.includes('Status("这款游戏首次适配时前几句可能显示不全：开个新存档推进几句，再回标题重新开始即可");'),'through the existing status line');});

/* 2026-11-19 17:45 (user, 素晴らしき日々 on a build with 256db869): "现在原文为什么还是断断续续的在后面", "汉字描边…一下这么丑一下又正常了", "校准还是很大问题" */
test('after the pass-through is taken back the font layer gets no more lines of the writable stream, and the verdict outlives a new build',()=>{const hb=read('native/HookBridge.cs');
 /* log 08:46:05.63 verdict; 08:46:13 "glyph hide line seq=5 chars=24 placed=0 hidden=0 requested=2", 08:46:19 "seq=7 placed=1 requested=1": still served */
 assert.ok(hb.includes('static bool GlyphLeakStandDown(Candidate c){return GlyphPassLeaked&&c!=null&&c.embed&&!c.hideOnly;}'));
 assert.ok(hb.includes('GpuLine(text);if(GlyphWanted()&&!GlyphLeakDown()){lock(GlyphGate){GlyphSent=true;}'),'no LINE to the font layer: no blank glyphs into the cache, no one-character places for the reader');
 assert.ok(hb.includes('else if(d.ContainsKey("leak")){')&&hb.indexOf('else if(d.ContainsKey("leak")){')<hb.indexOf('else if(here&&d.TryGetValue("allFailed",out v)){'),'the leak is read before the build-bound verdicts, and before the remembered face that used to prove the pass-through at launch');
 assert.ok(hb.includes('{"leak",why}'),'what is saved');});
test('dark text never gets a dark outline, whatever set the two colours; the translation follows the sentence\'s own outline',()=>{const gal=read('web/reader/modules/gal.js');
 assert.ok(gal.includes("readable=color=>fillDark&&(luma(color)===null?false:luma(color)<.35)?'#ffffff':color;"));
 for(const line of ["stroke('jp',preferences.japaneseOutline,preferences.japaneseOutlineWidth,readable(preferences.japaneseOutlineColor));","stroke('cn',preferences.chineseOutline,preferences.chineseOutlineWidth,readable(preferences.chineseOutlineColor));","stroke('ruby',preferences.rubyOutline,preferences.rubyOutlineWidth,readable(preferences.rubyOutlineColor));"])assert.ok(gal.includes(line),line);
 /* the rule itself, on the pairs of that session: saved profile black on black; light text keeps its dark outline; a gradient is not judged */
 const luma=c=>{const m=/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c||'');return m?(.2126*parseInt(m[1],16)+.7152*parseInt(m[2],16)+.0722*parseInt(m[3],16))/255:null;};
 const outline=(p,color)=>{const fillDark=p.textGradient!==true&&luma(p.textColor)!==null&&luma(p.textColor)<.35;return fillDark&&(luma(color)===null?false:luma(color)<.35)?'#ffffff':color;};
 assert.equal(outline({textColor:'#000001'},'#000000'),'#ffffff');assert.equal(outline({textColor:'#f8f8f8'},'#000000'),'#000000');assert.equal(outline({textColor:'#000001'},'#f4f4ff'),'#f4f4ff');assert.equal(outline({textColor:'#000001',textGradient:true},'#000000'),'#000000');
 /* frames 2 and 6 of the recording: the Japanese line had its white outline, the translation under it the saved black one */
 assert.ok(gal.includes('--tomoyo-jp-stroke-color:var(--tomoyo-gal-line-edge); --tomoyo-ruby-stroke-color:var(--tomoyo-gal-line-edge); --tomoyo-cn-stroke-color:var(--tomoyo-gal-line-edge); }'));});

/* 2026-11-21 (owner, test pack v5 ファタ 03:32:53Z: the measurement was cancelled and hiding never came back): a give way lasts
   HookNative.GIVE_WAY_MS at most, whatever the measurement does: then the hide and the replacement are back, the calibration ends */
test('a stalled calibration restores hiding at its deadline, including a manual wait for the next line',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 for(const manual of [true,false]){const r=rig({engine:'',publish:false});const before=r.hide();r.control.beginStyleSync(manual,'all');
  assert.deepEqual(r.switches(),[{type:'disable',reason:'reader-preflight'}]);
  t.mock.timers.tick((manual?90000:2000)-1);assert.equal(r.hook.enabled,false,'still waiting for the player or the probe');
  t.mock.timers.tick(1);assert.deepEqual(r.hide(),before,'hide state restored');assert.equal(r.switches().at(-1).type,'enable');
  assert.equal(r.control.styleCalibration,false);assert.equal(r.style.statuses.at(-1),'timeout');}
 /* the screen baseline preflight is capped the same way */
 const r=rig({engine:''});r.hook.preflight=true;r.hook.calibrating=true;r.hook.configure(r.control.host.preferences,r.control.host.state);assert.equal(r.hook.enabled,false);
 t.mock.timers.tick(2000);assert.equal(r.hook.preflight,false);assert.equal(r.hook.enabled,true);
});
test('saving the calibrated translation gap and its undo through Reader survives reopening the work',async t=>{
 const {GameStyleSync}=require('../core/game-style-sync.cjs'),{Reader}=require('../services/reader.cjs');
 const config=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'mgl-calibration-')),key='a'.repeat(64);
 t.after(()=>fs.rmSync(config,{recursive:true,force:true}));
 const open=()=>{const sync=new GameStyleSync({config},()=>{});sync.configure({},{gameProcessId:123,gameStarted:'1',gameStyleKey:key});return sync;};
 const reader=Object.assign(Object.create(Reader.prototype),{active:()=>true,gal:{styleSync:open()},saveWorkPrompt(){}});
 const original={japaneseSize:39,furigana:false,rubyScale:.61,hookHide:false,anchorDX:4,gap:15};
 for(const gap of [15,-2,15]){
  await reader.message({type:'gameStyleConfirm',key,part:'all',prefs:{...original,gap},saveId:String(gap)});
  reader.gal.styleSync=open();
  assert.deepEqual(reader.gal.styleSync.profile.prefs,{...original,gap});
 }
});
