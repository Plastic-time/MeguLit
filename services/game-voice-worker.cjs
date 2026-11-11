// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
// E450 A game's voice scan off the main thread: reading every archive (a Unity game's bundles are gigabytes) must not
// stall the app. The result goes back to game-voice.cjs, which reloads the line index the worker wrote.
const {workerData,parentPort}=require('node:worker_threads');
const gv=require('./game-voice.cjs');
let msg={};try{const g=gv.gameDir(workerData.start,1);if(g)msg={g,r:gv.scan(workerData.root,g.dir,{engine:g.engine})};}catch(e){msg={error:String(e?.message||e)};}
parentPort.postMessage(msg);
