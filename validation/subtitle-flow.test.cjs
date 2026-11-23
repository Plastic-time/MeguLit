'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..','web','reader');
const island=fs.readFileSync(path.join(root,'modules','island-page.js'),'utf8');
const css=fs.readFileSync(path.join(root,'reader.css'),'utf8');
/* Japanese must not wait long for furigana before the reveal starts */
const wait=/new Promise\(r=>setTimeout\(r,(\d+)\)\)/.exec(island.slice(island.indexOf('function revealWithRuby')));
assert(wait&&Number(wait[1])<=100,'furigana wait before reveal must stay <= 100 ms');
/* translation row keeps its height while pending, and fades in when ready */
assert(/\.tomoyo-cn-output\[data-state="pending"\]:not\(\[hidden\]\)\{min-height:1\.6em/.test(css));
assert(/\.tomoyo-cn-output\[data-state="ready"\]\{animation:tm-cn-ready/.test(css));
console.log('subtitle-flow ok');
