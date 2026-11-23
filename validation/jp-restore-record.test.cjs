// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-15 night test (死に逝く君 汉化硬盘版): 恢复日文 turned the Chinese overlay (patch.xp3) off but kept the same program,
   so the record still said contentLanguage zh and the next launch was refused with JAPANESE_EXECUTABLE_REQUIRED. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
test('a restore that changed files marks the program on record Japanese; its undo marks it translated again',()=>{
 const m=/const changedFiles=r=>(.+?);\r?\n/.exec(src);assert.ok(m,'changedFiles defined');
 const changedFiles=eval('r=>'+m[1]);
 assert.equal(changedFiles({added:0,exe:'',imported:1,removed:1,replaced:0}),true);
 assert.equal(changedFiles({added:0,removed:0,replaced:0,imported:0}),false);assert.equal(changedFiles(null),false);
 // overlay patch turned off: the same program becomes the verified Japanese original
 assert.match(src,/jio\.apply\(dir,dir,row\.executable\)\.then\(r=>\{if\(changedFiles\(r\)\)importedExecutable\(db,id,r\.exe\|\|row\.executable,'ja'\);return withPatch\(\{\.\.\.r,applied:r\.imported,cells:0\}\);\}\)/);
 // import from a Japanese original that keeps the program name
 assert.match(src,/else if\(changedFiles\(r\)\)importedExecutable\(db,id,row\.executable,'ja'\);return withPatch\(r\);/);
 // undo of the generic import / overlay removal: back to the translated program, also when the name is the same
 assert.match(src,/const r=jio\.restore\(dir\);if\(!r\.archive&&!r\.skipped\.length\)importedExecutable\(db,id,r\.exe&&r\.exe\.toLowerCase\(\)!==row\.executable\.toLowerCase\(\)\?r\.exe:row\.executable,'zh'\);return r;/);
});
test('the launch preflight lets a verified Japanese program through and stops a translated one',()=>{
 const gl=fs.readFileSync(path.join(__dirname,'..','services','game-language.cjs'),'utf8');
 assert.match(gl,/!lib\.originalExecutableVerified&&\(localTranslated\|\|lib\.contentLanguage==='zh'\)/);
 assert.match(src,/original\.library=\{\.\.\.lib,exe:file,contentLanguage:'zh',originalExecutableVerified:false\}/);
});
