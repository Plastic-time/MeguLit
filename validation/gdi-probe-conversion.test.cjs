'use strict';
/* #470: the GDI hide probe never arms a string conversion / C runtime hook (only punctuation was left on screen) */
const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const cs=fs.readFileSync(path.join(__dirname,'..','native','HookBridge.cs'),'utf8');
test('gdi hide probe skips kernel32/CRT conversion hooks',()=>{
 const m=cs.match(/static bool ConversionHook\(string code\)\{return System\.Text\.RegularExpressions\.Regex\.IsMatch\(code\?\?"",@"([^"]+)"\);\}/);
 assert.ok(m,'ConversionHook present');
 const re=new RegExp(m[1].replace('(?i)',''),'i');
 for(const c of ['HQ-4C@0:kernel32.dll:WideCharToMultiByte','HS-4C@0:kernel32.dll:MultiByteToWideChar','HQ-24@0:KernelBase.dll:GetStringTypeW','HS8@0:msvcr100.dll:strcpy','HQ@0:ucrtbase.dll:wcscpy'])assert.ok(re.test(c),c);
 for(const c of ['HS30@0:gdi32.dll:ExtTextOutA','HA-24@0:gdi32.dll:GetGlyphOutlineA','HQ@0:user32.dll:DrawTextW','HS-4:-10@B1E0:SACT2.dll'])assert.ok(!re.test(c),c);
 assert.match(cs,/static bool GdiProbeable\(Candidate c\)\{return c!=null&&!c\.embed&&!ConversionHook\(c\.code\)&&/);
});
