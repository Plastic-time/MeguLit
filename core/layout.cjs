// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT)?path.resolve(process.env.MEGULIT_ROOT||process.env.TOME_FINAL_ROOT):path.resolve(__dirname,'..'),at=(...parts)=>path.join(root,...parts);
const layout={root,app:__dirname,launcher:at('native','KeyVault.exe'),native:at('native'),config:at('data','config'),logs:at('logs'),cache:at('cache'),runtime:at('runtime'),reading:at('runtime','reading'),hook:at('runtime','hook'),python:at('runtime','python','python.exe'),aivis:at('runtime','aivis','run.exe'),resources:at('runtime','dictionaries')};
for(const folder of [layout.config,layout.logs,layout.cache])fs.mkdirSync(folder,{recursive:true});
module.exports=layout;
