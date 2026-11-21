// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
/* 2026-11-21 the cold-test run in its own process (services/cold-test.cjs forks it): the hook state of this run never mixes
   with the game the user plays. One message in ({root, exe, runDir, budgetMs, profile}), one result out, then exit. */
process.on('message',async m=>{let r;try{r=await require('./cold-test-run.cjs').runOne(m||{});}catch(e){r={end:'worker '+String(e?.message||e).slice(0,120),lines:0,shots:[]};}
 try{process.send(r,()=>process.exit(0));}catch{process.exit(0);}});
process.on('disconnect',()=>process.exit(0));
