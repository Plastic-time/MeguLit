// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const {execFile}=require('node:child_process');
function registryString(key,name,timeout=10000){return new Promise(resolve=>{execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command','[Console]::OutputEncoding=[Text.Encoding]::UTF8;(Get-ItemProperty -LiteralPath ("Registry::"+$env:MEGULIT_REG_KEY) -Name $env:MEGULIT_REG_NAME -ErrorAction Stop).($env:MEGULIT_REG_NAME)'],{windowsHide:true,timeout,encoding:'utf8',env:{...process.env,MEGULIT_REG_KEY:key,MEGULIT_REG_NAME:name}},(error,out)=>resolve(error?'':String(out||'').replace(/^﻿/,'').trim()));});}
module.exports={registryString};
