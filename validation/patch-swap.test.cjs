// SPDX-License-Identifier: GPL-3.0-or-later
// Reversible patch/original swap on a temporary game folder; never touches real games.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const swap=require('../services/patch-swap.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-swap-')),game=path.join(root,'game'),bak=path.join(game,'clfvbak');
 fs.mkdirSync(path.join(bak,'G00'),{recursive:true});fs.mkdirSync(path.join(game,'g00'),{recursive:true});
 const w=(f,t)=>fs.writeFileSync(path.join(game,f),t);
 w('clfvbak/REALLIVE.EXE','jp-exe');w('clfvbak/SEEN.TXT','jp-script');w('clfvbak/GAMEEXE.INI','shared-config');w('clfvbak/G00/BG1.g00','jp-image');
 w('clannadFV_sc.exe','zh-exe');w('seen.txt','zh-script');w('gameexe.ini','shared-config');w('g00/bg1.g00','zh-image');w('g00/other.g00','shared');w('save.dat','my-save');
 return {root,game};}
const read=(g,f)=>fs.readFileSync(path.join(g,f),'utf8');
test('switching to Japanese copies originals in and keeps the patched files beside them',()=>{
 const {root,game}=fixture();const d=swap.detect(game);assert.equal(d.exe,'REALLIVE.EXE');
 const s=swap.toJapanese(root,'g',game,path.join(game,'clannadFV_sc.exe'));assert.equal(s.active,'ja');
 assert.equal(read(game,'REALLIVE.EXE'),'jp-exe');assert.equal(read(game,'seen.txt'),'jp-script');assert.equal(read(game,'seen.txt'+swap.SUFFIX),'zh-script');assert.equal(read(game,'g00/bg1.g00'),'jp-image');
 assert.equal(read(game,'clfvbak/SEEN.TXT'),'jp-script');assert.equal(read(game,'save.dat'),'my-save');assert.equal(read(game,'clannadFV_sc.exe'),'zh-exe');
 fs.rmSync(root,{recursive:true,force:true});
});
test('switching back restores the patch exactly and never discards a changed file',()=>{
 const {root,game}=fixture();swap.toJapanese(root,'g',game,'');fs.writeFileSync(path.join(game,'g00/bg1.g00'),'edited-by-user');
 const s=swap.toTranslated(root,'g',game);assert.equal(s.active,'zh');
 assert.equal(fs.existsSync(path.join(game,'REALLIVE.EXE')),false);assert.equal(read(game,'seen.txt'),'zh-script');assert.equal(read(game,'g00/bg1.g00'),'zh-image');
 assert.equal(read(game,'g00/bg1.g00.megulit-ja-modified'),'edited-by-user');assert.equal(fs.existsSync(path.join(game,'seen.txt'+swap.SUFFIX)),false);
 assert.equal(read(game,'clfvbak/REALLIVE.EXE'),'jp-exe');fs.rmSync(root,{recursive:true,force:true});
});
test('folders without a mirrored backup are not treated as patches',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'megulit-swap-none-'));fs.mkdirSync(path.join(root,'Save'));fs.writeFileSync(path.join(root,'Save','a.exe'),'x');fs.writeFileSync(path.join(root,'game.exe'),'x');
 assert.equal(swap.detect(root),null);fs.rmSync(root,{recursive:true,force:true});
});
