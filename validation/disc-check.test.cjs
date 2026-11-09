// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E299 (魔法使いの夜): a boxed KiriKiri release whose protection plug-in needs the original DVD is named as such when
// its start fails, instead of the generic "exited before its window was ready".
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {discProtected}=require('../services/disc-check.cjs');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-disc-'));
test.after(()=>fs.rmSync(tmp,{recursive:true,force:true}));
function game(name,tpm){const dir=path.join(tmp,name);fs.mkdirSync(path.join(dir,'plugin'),{recursive:true});if(tpm!==null)fs.writeFileSync(path.join(dir,'plugin','game.tpm'),Buffer.concat([Buffer.alloc(64),Buffer.from(tpm,'latin1'),Buffer.alloc(64)]));return dir;}

test('a protection plug-in that checks the drive for the disc is recognised',()=>{
 assert.strictEqual(discProtected(game('boxed','\0GetDriveTypeA\0RegOpenKeyExA\0in disc\0no disc\0')),true);
 assert.strictEqual(discProtected(game('plain','\0GetDriveTypeA\0V2Link\0')),false);
 assert.strictEqual(discProtected(game('none',null)),false);
 assert.strictEqual(discProtected(path.join(tmp,'missing')),false);
});

test('a failed start of such a game reports GAME_DISC_REQUIRED, with a message in every language',()=>{
 const bridge=fs.readFileSync(path.join(__dirname,'..','services','bridge.cjs'),'utf8');
 assert.match(bridge,/\['GAME_PROCESS_EXITED','GAME_WINDOW_NOT_READY'\]\.includes\(error\.message\)&&game\.executable&&require\('\.\/disc-check\.cjs'\)\.discProtected\(path\.dirname\(game\.executable\)\)\)error=Object\.assign\(Error\('GAME_DISC_REQUIRED'\)/);
 const feedback=fs.readFileSync(path.join(__dirname,'..','web','launch-feedback.js'),'utf8'),row=feedback.split(/\r?\n/).find(l=>l.trim().startsWith('GAME_DISC_REQUIRED:'));
 assert.ok(row,'message row');
 const texts=row.match(/'(?:[^'\\]|\\.)*'/g);
 assert.strictEqual(texts.length,3);
 assert.match(texts[0],/原版光盘/);assert.match(texts[1],/original disc/);assert.match(texts[2],/ディスク/);
});
