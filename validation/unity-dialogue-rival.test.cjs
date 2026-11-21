'use strict';
// E609 (DDLC Plus in Japanese, beta.41): the remembered TMP_Text.set_text stream only carried labels, the story came through
// TextTypewriterEffect.StartText as aux. The bridge leaves a dialogue-less stream for one that carries dialogue, and hides the
// second setter that repeats the selected line.
const test=require('node:test');const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
const s=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');

test('a stream with three paced dialogue lines takes over a selected stream that gives none',()=>{
 assert.match(s,/leave dialogue-less stream/);
 assert.match(s,/\(now-LastSelectedLineAt\)\.TotalSeconds>=3/);
 assert.match(s,/\(now-r\.at\)\.TotalSeconds>=0\.35/,'a backlog dump does not count');
 assert.match(s,/rv\.embed\|\|!cur\.embed\?3:5\)\)\{/);
 assert.match(s,/!ManualPick&&!JaTwins\.Contains\(tp\.Key\(\)\)/,'a stream the player picked is kept');
 assert.match(s,/ManualPick=d\.ContainsKey\("manual"\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8'),/\.\.\.\(manual\?\{manual:true\}:\{\}\)/);
});

test('a second writable stream that repeats the selected line is hidden with it',()=>{
 assert.match(s,/japanese twin embedding on/);
 assert.match(s,/japanese twin hidden/);
 assert.match(s,/\(\(sel\.code\?\?""\)!=\(c\.code\?\?""\)\|\|\(\(c\.code\?\?""\)\.EndsWith\(":JIT:UNITY"\)&&c\.name==sel\.name\)\)&&JaTwins\.Add\(key\)/,'another hook, or a context of the selected Unity setter itself (Aokana sets each line twice through TMP_Text.set_text)');
 assert.match(s,/if\(id!=Selected\)\{DialogueRivals\.Clear\(\);JaTwins\.Clear\(\);/);
});

test('E610 the twin is hidden only after the selected stream wrote the same line back; the remembered stream comes back on its first line',()=>{
 assert.match(s,/DialogueLike\(text\)&&text==LastEmbedText&&\(DateTime\.UtcNow-LastEmbedAt\)\.TotalMilliseconds<1500/);
 assert.match(s,/RememberedCode!=""&&rv\.code==RememberedCode\?1:/);
 assert.match(s,/Emit\(new\{type="hookStreamLeft",id=was,code=wasCode,to=tp\.Key\(\)\}\)/);
 const n=fs.readFileSync(path.join(__dirname,'..','core','hook-native.cjs'),'utf8');
 assert.match(n,/gdilessSelected\(sel\)\{[^\n]*return \/:JIT:UNITY\$\|IL2CPP\/i\.test/);assert.match(n,/this\.ownTextFn\?\.\(\)===true&&!this\.gdilessSelected\(\)/,'calibration can pause a Unity stream under placement');assert.match(n,/own&&!this\.textPathActive&&!gdiless/);
 assert.match(n,/if\(m\.type==='hookStreamLeft'\)/);
 assert.match(fs.readFileSync(path.join(__dirname,'..','core','hook-control.cjs'),'utf8'),/x\.embeddable&&!left\.has\(x\.code\)/);
});
