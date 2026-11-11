'use strict';
/* 学习 → 日语水平 and the grammar redesign (2026-11-11): the first-visit level choice marks what lies below it as known,
   lessons are six guided steps, practice drags the answer into the gap, the page is kept between visits, and the
   kana chart on the learning home can be clicked to hear a kana and set its familiarity. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const L=require('../services/learning-level.cjs'),G=require('../services/grammar.cjs'),K=require('../services/kana.cjs'),{openStore}=require('../services/store.cjs');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>'&#'+c.charCodeAt(0)+';');
function temp(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-level-'));return root;}

test('levels: none → N0, unset at first, and where each one starts',()=>{
 assert.deepEqual(L.LEVELS,['none','kana','N5','N4','N3','N2','N1','N0']);
 const root=temp();assert.equal(L.get(root).level,null,'first visit has no level, so the picker is shown');
 assert.equal(L.recommend('none').tab,'kana');assert.equal(L.recommend('kana').tab,'kana');
 assert.deepEqual([L.recommend('N5').tab,L.recommend('N5').grammar],['grammar','N4']);
 assert.equal(L.recommend('N2').grammar,'N1');assert.equal(L.recommend('N0').reason,'native');
});

test('choosing a level marks what lies below it as known, and never lowers anything',()=>{
 const root=temp(),db=openStore(path.join(root,'test.sqlite'));
 try{
  K.save(root,{mastery:{'あ':1}});
  let r=L.set(db,root,{level:'kana',kana:['あ','い']});assert.deepEqual(r.applied,{kana:0,grammar:0},'partial kana marks nothing');
  assert.equal(L.get(root).level,'kana');
  r=L.set(db,root,{level:'N5',kana:['あ','い','ア','きゃ','bad!']});assert.equal(r.applied.kana,4);assert.equal(r.applied.grammar,0,'N5 itself is still to learn');
  assert.deepEqual(K.read(root).mastery,{'あ':3,'い':3,'ア':3,'きゃ':3});
  r=L.set(db,root,{level:'N4',kana:[]});assert.equal(r.applied.grammar,G.POINTS.length,'from N4 up every N5 point is learned');
  assert.ok(G.POINTS.every(p=>G.progress(db)[p].learned));
  r=L.set(db,root,{level:'none',kana:['あ']});assert.equal(K.read(root).mastery['あ'],3,'a lower level later erases nothing');assert.ok(G.progress(db).wa.learned);
  assert.throws(()=>L.set(db,root,{level:'N9'}),/INVALID_LEARNING_LEVEL/);
  const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');assert.match(bridge,/case 'learning_level':/);assert.match(bridge,/case 'learning_level_set':/);
 }finally{db.close?.();}
});

test('the picker offers all eight levels and is asked from the learning page',async()=>{
 const lv=await import('../web/learning-level.js');
 assert.deepEqual(lv.LEVEL_CHOICES.map(l=>l.id),L.LEVELS);
 const html=lv.pickerHTML(null,esc);for(const id of L.LEVELS)assert.match(html,new RegExp(`data-level-pick="${id}"`));assert.match(html,/完全不懂/);assert.match(html,/母语/);
 const kana=lv.allKana();assert.ok(kana.includes('あ')&&kana.includes('ア')&&kana.includes('きゃ')&&kana.includes('ぱ'));
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8'),/import\('\.\/learning-level\.js'\)\.then\(m=>m\.ensureLevel/);
});

test('a lesson is six guided steps with Megumin, built from your own games when it can',async()=>{
 const {N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js'),wo=N5.find(p=>p.id==='wo');
 const real=[{text:'本を閉じた。',start:1,end:2,title:'魔法使いの夜',readAt:1794300000,origin:'history'}];
 const html=g.lessonHTML(wo,{examples:{wo:real},progress:{}},{locale:'zh',esc,step:2});
 assert.deepEqual(g.STEPS,['intro','form','play','uses','games','practice']);
 assert.equal((html.match(/data-stepbody=/g)||[]).length,6);assert.match(html,/data-stepbody="2">/,'the chosen step is shown');assert.match(html,/data-stepbody="0" hidden/);
 assert.match(html,/gm-step-dot active[^"]*" data-step="2"/);assert.match(html,/第 3 \/ 6 步/);
 assert.match(g.meguminIntro(wo,real,'zh'),/吾名惠惠/);assert.match(g.meguminIntro(wo,real,'zh'),/《魔法使いの夜》/,'names the game you met it in');
 assert.match(g.meguminIntro(wo,[],'zh'),/还没捉到它/,'falls back to built-in lines');
 assert.match(html,/<span class="gm-block" style="--i:0">名词<\/span>/,'how it attaches is drawn as blocks');
 const desu=g.lessonHTML(N5.find(p=>p.id==='kosoado'),{progress:{}},{locale:'zh',esc});assert.match(desu,/data-split-toggle/,'points without a lab take a line apart');
});

test('practice drags the answer into the gap; the list says what to learn next',async()=>{
 const {N5}=await import('../web/grammar-n5.js'),g=await import('../web/grammar.js'),wo=N5.find(p=>p.id==='wo');
 const q=g.exercisesFor(wo,[])[0],open=g.quizHTML(wo,q,{locale:'zh',esc});
 assert.match(open,/data-drop>拖到这里/);assert.match(open,/draggable="true" data-choice=/);assert.match(open,/把答案拖进空里/);
 assert.doesNotMatch(g.quizHTML(wo,q,{locale:'zh',esc,answered:q.answer}),/draggable/,'answered chips stop dragging');
 assert.equal(g.nextPoint({}).id,N5[0].id);assert.equal(g.nextPoint({[N5[0].id]:{learned:true}}).id,N5[1].id);
 const list=g.listHTML({progress:{},completion:g.completion({})},{locale:'zh',esc,userLevel:'N5'});
 assert.match(list,/class="gm-hero"/);assert.match(list,/class="primary gm-hero-go" data-point="wa"/);assert.match(list,/gm-hero-level">N5</);assert.match(list,/data-change-level/);
 assert.match(list,/gm-card next" data-point="wa"/);
});

test('the grammar page is kept between visits instead of loading again',async()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','grammar.js'),'utf8');
 assert.match(src,/const memo=\{data:null/);assert.match(src,/if\(!data\)await load\(false\)/,'the report is fetched only when nothing is kept');
 const g=await import('../web/grammar.js');assert.equal(typeof g.grammarMemo,'function');
});

test('the 平假名熟悉度 chart on the learning home can be clicked, heard and set',()=>{
 const src=fs.readFileSync(path.join(__dirname,'..','web','kana','views','index.js'),'utf8');
 assert.match(src,/<button type="button" class="m\$\{lv\(c\)\}" data-mk=/);assert.match(src,/ctx\.speech\.say\(k\)/);assert.match(src,/data-mk-lv/);assert.match(src,/S\.put\(KEY\.m,m\)/);
 assert.match(src,/\['未学','见过','熟悉','掌握'\]/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','kana','kana.css'),'utf8'),/\.mk-card\{/);
});

test('the system map is real lines to take apart, covering all nine parts, in the megu-edit look',async()=>{
 const g=await import('../web/grammar.js'),{MAP}=await import('../web/grammar-map.js');
 const used=new Set(g.SCENES.flatMap(s=>s.pieces.map(p=>p[2])));for(const n of MAP)assert.ok(used.has(n.id),n.id+' appears in some line');
 for(const s of g.SCENES)assert.equal(s.pieces.map(p=>p[0]).join(''),s.ja,'pieces spell the line');
 const html=g.mapHTML({progress:{}},{locale:'zh',esc,open:'conjugation',piece:8});
 assert.match(html,/gm-piece n-conjugation on picked" data-piece="8"/);assert.match(html,/<i class="gm-piece-no">IV<\/i><b>読み<\/b>/);assert.match(html,/词干不动，只换尾巴/,'Megumin explains the tapped piece');
 assert.match(html,/megulit · grammar lab/);assert.match(g.mapHTML({progress:{}},{locale:'zh',esc,open:'clauses'}),/gm-scene active" data-scene="3"/,'a part opens the line it is in');
 for(const k of ['invert','glitch','push','focus','type','burst'])assert.equal(typeof g.fx[k],'function');
 assert.match(fs.readFileSync(path.join(__dirname,'..','web','grammar.css'),'utf8'),/--mg-red:#c8323c/);
});

test('the map takes apart lines you read in your games, cut by the tokenizer and cached',async()=>{
 const T=spec=>{let at=0;return spec.map(([surface,base,p1,p2,norm])=>{const t={surface,base_form:base,normalized:norm||base,pos:p1,grammar:[p1,p2||'*'],start:at,end:at+[...surface].length};at=t.end;return t;});};
 const line=T([['雨','雨','名詞','普通名詞'],['が','が','助詞','格助詞'],['降っ','降る','動詞','一般'],['て','て','助詞','接続助詞'],['いる','いる','動詞','非自立可能','居る'],['から','から','助詞','接続助詞'],['、','、','補助記号','読点'],['待ち','待つ','動詞','一般'],['ます','ます','助動詞'],['。','。','補助記号','句点']]);
 const cut=G.cutLine(line);assert.deepEqual(cut.map(p=>[p[0],p[2]]),[['雨','classes'],['が','particles'],['降っ','conjugation'],['て','conjugation'],['いる','aspect'],['から','clauses'],['、','order'],['待ち','conjugation'],['ます','politeness'],['。','order']]);
 const root=temp(),db=openStore(path.join(root,'t.sqlite'));
 try{let calls=0;const list=[{text:'雨が降っているから、待ちます。',title:'サクラノ詩',gameId:'g1',origin:'history',translation:'在下雨，我等着。'}];
  const sc=await G.scenes(db,list,async()=>{calls++;return line;});assert.equal(sc.length,1);assert.equal(sc[0].label,'サクラノ詩');assert.equal(sc[0].real,true);
  await G.scenes(db,list,async()=>{calls++;return line;});assert.equal(calls,1,'a cut line is cached');
  const g=await import('../web/grammar.js');const html=g.mapHTML({progress:{},scenes:sc},{locale:'zh',esc});assert.match(html,/title="サクラノ詩"/);assert.match(html,/data-piece="4" data-node="aspect"/);
  assert.match(g.mapHTML({progress:{}},{locale:'zh',esc}),/普通的一句/,'built-in lines only before anything is read');
 }finally{db.close?.();}
});

test('假名游戏 is part of 五十音: no own tab, old links open the practice block',()=>{
 const app=fs.readFileSync(path.join(__dirname,'..','web','app.js'),'utf8');
 assert.doesNotMatch(app.match(/const LEARNING_TABS=\[[^\]]*\]/)[0],/kanagames/);
 assert.match(app,/if\(subtab==='kanagames'\)\{subtab='kana';kanaFocus='practice';\}/);
 const kana=fs.readFileSync(path.join(__dirname,'..','web','kana','kana.js'),'utf8');assert.doesNotMatch(kana,/openTab\('kanagames'\)/);
 const idx=fs.readFileSync(path.join(__dirname,'..','web','kana','views','index.js'),'utf8');
 for(const g of ['pos','seq','conv'])assert.ok(idx.includes(`['${g}',`),g);assert.match(idx,/id="practice"/);assert.match(idx,/ctx\.go\(`play\.html\?g=\$\{b\.dataset\.game\}&d=\$\{diff\}/);
});
