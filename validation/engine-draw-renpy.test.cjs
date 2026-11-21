// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* engine-draw, Ren'Py (native/MeguLitRenpy.py): the script against the stand-in Ren'Py (native/renpytext/selftest/host.py
   --sink-draw) with a control file asking for roles and embed. No game. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const TP=require('../core/text-paths.cjs');
const root=path.join(__dirname,'..');
function python(){for(const [cmd,args] of [['python',['-I']],['py',['-3','-I']]]){const r=spawnSync(cmd,[...args,'-c','import sys;print(sys.version_info[0])'],{encoding:'utf8',windowsHide:true});if(r.status===0&&r.stdout.trim()==='3')return [cmd,args];}return null;}
const py=python();

test('Ren\'Py: name and menu captions as UI items, the say Text redrawn by Ren\'Py with ruby tags and the Chinese, emb=2 with the Japanese only',{skip:!py&&'no Python 3'},()=>{
 const dir=fs.mkdtempSync(path.join(process.env.MEGULIT_TEST_TMP||os.tmpdir(),'megulit-renpy-draw-')),ctl=path.join(dir,'ctl.txt');
 const r=spawnSync(py[0],[...py[1],path.join(root,'native/renpytext/selftest/host.py'),'--sink-draw',path.join(root,'native/MeguLitRenpy.py'),ctl],{encoding:'utf8',windowsHide:true});
 assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
 const recs=out.filter(l=>l.startsWith('ToMe_CHARS ')).map(l=>TP.parseChars(l.replace(/\x1f/g,'\n')));
 assert.ok(recs.every(Boolean),'every record parses');
 const lines=recs.filter(x=>!x.role);
 assert.deepEqual(lines.map(x=>[x.text,x.hidden,x.emb,x.rects.length]),[['今日は晴れ',false,undefined,5],['今日は晴れ',false,2,5]],'never hidden while embedding; then emb=2, the Japanese only');
 assert.deepEqual(recs.filter(x=>x.role).map(x=>[x.role,x.id,x.text,x.box]),[['name','N:0','Eileen',[160,490,120,30]],['choice','C:0','はい',[500,250,48,34]],['choice','C:1','いいえ',[500,330,72,34]],['choice','C:','',[0,0,0,0]]],
  'name box, the captions that lead somewhere (a None caption is a heading), an empty snapshot when the menu returns');
 const host=out.find(l=>l.startsWith('HOST '));
 assert.ok(host.includes('{rb}\\u4eca\\u65e5{/rb}{rt}\\u304d\\u3087\\u3046{/rt}\\u306f\\u6674\\u308c\\n{size=-4}\\u4eca\\u5929\\u6674\\u6717{/size}'),host);
 assert.ok(/restarts=1$/.test(host),'one restart_interaction');
});

test('Ren\'Py: without a control file nothing changes (the old scenario still passes), braces and brackets are escaped',()=>{
 const s=fs.readFileSync(path.join(root,'native/MeguLitRenpy.py'),'utf8');
 assert.ok(s.includes("return t.replace(u'{', u'{{').replace(u'[', u'[[')"));
 assert.ok(s.includes("if self.cfg.get('embed'):\n                return False")||s.includes("if self.cfg.get('embed'):\r\n                return False"),'no hiding while embedding');
 const hn=fs.readFileSync(path.join(root,'core/hook-native.cjs'),'utf8');assert.ok(hn.includes("if(rec.engine!=='krkr'&&rec.engine!=='renpy')return;"),'Ren\'Py lines ask for their replacement too');
});
