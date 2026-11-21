// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* #376 (CLANNAD HD, 1.4.16): after 恢复日语 the record said localeMode japanese and the Steam build (steam_api.dll beside
   SiglusEngine_Steam.exe) was started through the Japanese-environment helper: 「Steam の初期化に失敗しました」, no window.
   A Steam folder is never started through the helper; restore keeps its start mode and undo puts back the old one. */
const test=require('node:test'),assert=require('node:assert'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const LE=require('../core/locale-emulator.cjs');
const x86=()=>{const b=Buffer.alloc(0x100);b.write('MZ',0);b.writeUInt32LE(0x80,60);b.write('PE\0\0',0x80,'binary');b.writeUInt16LE(0x14c,0x84);return b;};
test('a folder with steam_api is a Steam build: never recommended for, nor started through, the helper',()=>{
 const steam=fs.mkdtempSync(path.join(os.tmpdir(),'steam-')),plain=fs.mkdtempSync(path.join(os.tmpdir(),'plain-'));
 for(const d of [steam,plain])fs.writeFileSync(path.join(d,'SiglusEngine.exe'),x86());fs.writeFileSync(path.join(steam,'steam_api.dll'),'');
 assert.strictEqual(LE.steamApi(path.join(steam,'SiglusEngine.exe')),true);assert.strictEqual(LE.steamApi(path.join(plain,'SiglusEngine.exe')),false);assert.strictEqual(LE.steamApi(''),false);
 assert.strictEqual(LE.recommended({engine:'BGI'},path.join(plain,'SiglusEngine.exe')),true);assert.strictEqual(LE.recommended({engine:'BGI'},path.join(steam,'SiglusEngine.exe')),false);
});
test('launch, restore, undo and shared records check it',()=>{
 const src=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),bridge=src('services/bridge.cjs');
 assert.match(bridge,/x86\(game\.executable\)&&!\(require\('\.\.\/core\/locale-emulator\.cjs'\)\.steamApi\(game\.executable\)/,'locale start skipped');
 assert.match(bridge,/fallbackExe=textPath\?\.path==='rgss'\?textPath\.exe:game\.executable/,'only RGSS retries its patched shadow');
 assert.match(bridge,/!LE\.x86\(fallbackExe\)\|\|LE\.steamApi\(fallbackExe\)\)throw error;/,'quick-exit retry checks the program actually launched');
 assert.match(bridge,/LE\.x86\(file\)&&!LE\.steamApi\(file\)\?'japanese'/,'restore keeps the mode');
 assert.match(bridge,/if\(lib\.localeBeforeJapanese!==undefined\)\{original\.library\.localeMode=lib\.localeBeforeJapanese;/,'undo puts it back');
 assert.match(src('services/game-language.cjs'),/x86\(file\)&&!require\('\.\.\/core\/locale-emulator\.cjs'\)\.steamApi\(file\)\?'japanese'/);
 assert.match(src('services/shared-adaptation.cjs'),/record\.localeMode==='japanese'&&require\('\.\.\/core\/locale-emulator\.cjs'\)\.steamApi\(executable\)/);
});
