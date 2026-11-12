// SPDX-License-Identifier: GPL-3.0-or-later
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const {SCHEMA}=require('../services/store.cjs'),lines=require('../services/home-lines.cjs');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'home-lines-')),db=new DatabaseSync(':memory:');db.exec(SCHEMA);t.after(()=>{db.close();fs.rmSync(root,{recursive:true,force:true});});return {root,db};}

test('lists the lines read in one game, newest first, one row per text, saved ones marked, searchable',t=>{
 const {root,db}=fixture(t),ev=db.prepare("INSERT INTO reading_events(game_id,text,read_at) VALUES(?,?,?)"),sv=db.prepare("INSERT INTO saved_sentences(game_id,text,created_at,original) VALUES(?,?,?,'{}')");
 ev.run('g1','「まあ……、やっと、お目覚めになられましたのね。」',100);ev.run('g1','あなたに声をかける人物がいる。',200);ev.run('g1','あなたに声をかける人物がいる。',300);ev.run('g2','別のゲームの台詞',400);ev.run('g1','100%_の確率',150);
 sv.run('g1','瞳で見上げていたのだから。',250);
 const out=lines.list(db,root,'g1');
 assert.deepEqual(out.lines.map(r=>r.text),['あなたに声をかける人物がいる。','瞳で見上げていたのだから。','100%_の確率','「まあ……、やっと、お目覚めになられましたのね。」']);
 assert.equal(out.lines[0].at,300000);assert.equal(out.lines[1].saved,true);assert.deepEqual(out.chosen,[]);
 assert.deepEqual(lines.list(db,root,'g1',{query:'目覚め'}).lines.map(r=>r.text),['「まあ……、やっと、お目覚めになられましたのね。」']);
 assert.deepEqual(lines.list(db,root,'g1',{query:'%_'}).lines.map(r=>r.text),['100%_の確率'],'LIKE wildcards are literal');
 assert.equal(lines.list(db,root,'g1',{limit:2}).lines.length,2);
});

test('the choice is kept per game, at most five distinct lines, and an empty choice means automatic',t=>{
 const {root}=fixture(t);
 assert.deepEqual(lines.save(root,'g1',['a','b','a',' c ','','d','e','f']),['a','b','c','d','e']);
 lines.save(root,'g2',['x']);
 assert.deepEqual(lines.chosen(root,'g1'),['a','b','c','d','e']);assert.deepEqual(lines.chosen(root,'g2'),['x']);
 assert.deepEqual(lines.save(root,'g1',[]),[]);assert.deepEqual(lines.chosen(root,'g1'),[]);
 assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'data/config/home-lines.json'),'utf8'))),['g2']);
 assert.throws(()=>lines.save(root,'',['a']));
});

test('picker helpers: toggle with a cap of five, shown lines pre-checked even when not in the list',async()=>{
 const {toggleLine,mergeLines,pickedFrom}=await import('../web/home-lines.js');
 let p=[];for(const t of ['1','2','3','4','5'])p=toggleLine(p,t).picked;
 assert.deepEqual(toggleLine(p,'6'),{picked:p,full:true});
 assert.deepEqual(toggleLine(p,'3').picked,['1','2','4','5']);
 assert.deepEqual(toggleLine(['「あ」'],'あ').picked,[],'brackets do not make a different line');
 const rows=mergeLines([{text:'新しい',at:2},{text:'古い',at:1}],['「古い」','見えない行']);
 assert.deepEqual(rows.map(r=>r.text),['見えない行','新しい','古い']);
 assert.deepEqual(pickedFrom(rows,['「古い」','見えない行']),['古い','見えない行']);
});

test('home shows the chosen lines and falls back to the automatic ones',async()=>{
 const {homeLinesFor}=await import('../web/home-tv.js');
 const d={sentences:[{text:'保存'}],recentLines:[{text:'最近'}]};
 assert.deepEqual(homeLinesFor(d),{lines:['保存'],custom:false});
 assert.deepEqual(homeLinesFor({...d,sentences:[]}),{lines:['最近'],custom:false});
 assert.deepEqual(homeLinesFor({...d,homeLines:['a','b']}),{lines:['a','b'],custom:true});
 const bridge=fs.readFileSync(path.join(__dirname,'../services/bridge.cjs'),'utf8');assert.match(bridge,/case 'home_lines':/);assert.match(bridge,/case 'home_lines_save':/);
 assert.match(fs.readFileSync(path.join(__dirname,'../services/game-detail.cjs'),'utf8'),/homeLines:/);
 assert.match(fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8'),/home-lines\.css/);
});

test('background lines are story lines only: system prompts, glued prompts, mojibake, Chinese and paths are dropped',t=>{
 const drop=['全てのデータを削除しますか？','セーブしますか？','前のシーンまで戻りますか？','クイックロードしますか？','タイトルに戻りますか？','システムを初期化しますか？','データをコピーしますか？','上書きセーブしますか？ロードしますか？クイックセーブしますか？クイックロードしますか？','セーブ','這時，船外傳來了另一道聲音。','窶憺メ郤ｪ・碁鴎阨晏ｾ怜造・溪・','sound\郁紀イメージ1.ogg','E:\GAL\script.pac'];
 const keep=['「……誰っ！？」','「ふぅん、あいつ友達なんかいたんだ」','その瞬間、私は死体を見下ろしていた。','「あなたは、どうしてここにいるの？」','陽希「え？」','一面、白い世界…','「データの整理なら、もう終わったよ」'];
 for(const s of drop)assert.equal(lines.systemLine(s),true,s);for(const s of keep)assert.equal(lines.systemLine(s),false,s);
 const {root,db}=fixture(t),ev=db.prepare("INSERT INTO reading_events(session_id,game_id,text,read_at) VALUES(?,?,?,?)");let at=1;
 for(const s of ['「ナツくーーん」','「……寝てるのかな。呼び鈴付けてくんないかなぁ」',...drop.slice(0,7)])ev.run(1,'atri',s,at++);
 for(const k of [1,2,3])ev.run(k,'atri','もう一度やりますか？',at++);
 for(const k of [1,2,3,4])ev.run(k,'atri','その瞬間、私は死体を見下ろしていた。',at++);
 assert.deepEqual(lines.auto(db,'atri'),['「ナツくーーん」','「……寝てるのかな。呼び鈴付けてくんないかなぁ」','その瞬間、私は死体を見下ろしていた。'],'a replayed opening stays, a question asked every session goes');
 assert.deepEqual(lines.list(db,root,'atri').lines.map(r=>r.text),['その瞬間、私は死体を見下ろしていた。','「……寝てるのかな。呼び鈴付けてくんないかなぁ」','「ナツくーーん」']);
 assert.match(fs.readFileSync(path.join(__dirname,'../services/game-detail.cjs'),'utf8'),/homeAuto:/);
});

test('the background lines change with an opacity/transform stagger, not a glyph scramble',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../web/home-tv.js'),'utf8'),fn=src.slice(src.indexOf('function swapScript('),src.indexOf('function busy('));
 assert(fn.length>200);assert.doesNotMatch(src,/scrambleScript|GLYPHS|noise\(/);assert.match(fn,/\.animate\(/);
 for(const prop of fn.match(/\{opacity:[^}]*\}/g))assert.match(prop,/^\{opacity:[^,}]+(,transform:'translate3d\([^)]*\)')?\}$/,prop);
});
