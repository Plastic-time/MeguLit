// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* Developer-only engine discovery to reviewable Seed draft. No player save is read. */
const fs=require('node:fs'),discovery=require('../services/story-discovery.cjs'),data=require('../services/story-data.cjs');
function compile(executable,game){
 const r=discovery.discover(executable);if(!discovery.validateRules(r))throw Error('STORY_RULES_INVALID');
 const ids=new Set(r.chapters.flatMap(c=>c.nodes.map(n=>n.id)));
 const story={schema:'megulit.story',version:1,gameKey:game.key,builds:r.builds,scripts:r.scripts,sources:r.evidence,galleryComplete:!!r.galleryComplete,gallery:r.gallery,endingsComplete:false,endings:[],chapters:r.chapters.map(c=>({...c,partial:true,edges:c.edges.filter(e=>ids.has(e.from)&&ids.has(e.to))}))};
 const v=data.validate(story);if(!v.ok)throw Error(v.errors.join(', '));return {story,candidates:r.candidates};
}
if(require.main===module){const [exe,gameFile,out]=process.argv.slice(2);if(!exe||!gameFile||!out)throw Error('Usage: node tools/story-seed.cjs <game.exe> <game.json> <draft.json>');const result=compile(exe,JSON.parse(fs.readFileSync(gameFile,'utf8')));fs.writeFileSync(out,JSON.stringify(result.story,null,1)+'\n');fs.writeFileSync(out+'.candidates.json',JSON.stringify(result.candidates,null,1)+'\n');console.log(JSON.stringify({chapters:result.story.chapters.length,candidates:result.candidates.length,progressIncluded:false}));}
module.exports={compile};
