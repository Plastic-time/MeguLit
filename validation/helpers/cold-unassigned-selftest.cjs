// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const compiler=process.argv[2];assert.ok(compiler,'pass the installed csc.exe path');
let source=fs.readFileSync(path.join(__dirname,'../../native/ColdDesk.cs'),'utf8');
assert.match(source,/if\(!AssignProcessToJobObject\(Job,pi\.hProcess\)\)\{[^\n]+if\(!StopUnassigned\(pi\.hProcess\)\)CleanupSafe=false;[^\n]+return 1;/);
const replace=(from,to)=>{assert.equal(source.split(from).length,2,'native boundary must occur once');source=source.replace(from,to);};
// Compile the production method unchanged, replacing only the two OS calls with controlled failures.
replace('[DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr process,uint code);',`internal static bool Terminated,ThrowTerminate,ThrowWait;internal static uint Waited;internal static string Calls;
 static bool TerminateProcess(IntPtr process,uint code){if(process!=(IntPtr)4660||code!=1)throw new Exception("wrong owned handle");Calls+="terminate;";if(ThrowTerminate)throw new Exception("terminate failure");return Terminated;}`);
replace('[DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);',`static uint WaitForSingleObject(IntPtr handle,uint milliseconds){if(handle!=(IntPtr)4660||milliseconds!=4000)throw new Exception("wrong wait handle/budget");Calls+="wait;";if(ThrowWait)throw new Exception("wait failure");return Waited;}`);
source+=`
static class ColdUnassignedTest{
 static void Case(bool terminated,uint waited,bool throwTerminate,bool throwWait,bool expected,string calls){ColdDesk.Terminated=terminated;ColdDesk.Waited=waited;ColdDesk.ThrowTerminate=throwTerminate;ColdDesk.ThrowWait=throwWait;ColdDesk.Calls="";
  var method=typeof(ColdDesk).GetMethod("StopUnassigned",System.Reflection.BindingFlags.Static|System.Reflection.BindingFlags.NonPublic);bool got=(bool)method.Invoke(null,new object[]{(IntPtr)4660});if(got!=expected||ColdDesk.Calls!=calls)throw new Exception("unconfirmed exit accepted or wrong handle/order: "+ColdDesk.Calls);}
 static int Main(){Case(true,0,false,false,true,"terminate;wait;");Case(false,0,false,false,true,"terminate;wait;");Case(true,258,false,false,false,"terminate;wait;");Case(false,0xffffffff,false,false,false,"terminate;wait;");Case(true,0,true,false,false,"terminate;");Case(true,0,false,true,false,"terminate;wait;");Console.WriteLine("owned-handle cleanup: 6/6 pass; no OS process created");return 0;}
}`;
const base=path.resolve(os.tmpdir()),dir=fs.mkdtempSync(path.join(base,'cold-unassigned-'));
try{const input=path.join(dir,'ColdDeskFixture.cs'),output=path.join(dir,'ColdDeskFixture.exe');fs.writeFileSync(input,source);
 const built=spawnSync(compiler,['/nologo','/target:exe','/optimize+','/platform:x64','/reference:System.Drawing.dll','/main:ColdUnassignedTest','/out:'+output,input],{windowsHide:true,encoding:'utf8'});assert.equal(built.status,0,built.stdout+built.stderr);
 const run=spawnSync(output,[],{windowsHide:true,encoding:'utf8'});assert.equal(run.status,0,run.stdout+run.stderr);process.stdout.write(run.stdout);
}finally{assert.ok(path.resolve(dir).startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
