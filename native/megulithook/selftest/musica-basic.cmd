@echo off
setlocal
if "%~1"=="" exit /b 2
if not exist "%~1\." exit /b 2
set "TEMP=%~1"
set "TMP=%~1"
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x86 -host_arch=x64 -no_logo >nul
if errorlevel 1 exit /b %errorlevel%
pushd "%~1" || exit /b 2
cl /nologo /O2 /EHsc /std:c++17 /utf-8 /Fe:musica-basic-selftest.exe /Fo:musica-basic-selftest.obj "%~dp0musica-basic.cpp"
if errorlevel 1 (popd & exit /b 1)
node -e "const p=require('node:child_process').spawnSync('musica-basic-selftest.exe',[],{timeout:5000,maxBuffer:65536,windowsHide:true,encoding:'utf8'});process.stdout.write(p.stdout||'');process.stderr.write(p.stderr||'');if(p.error)console.error(p.error.code);process.exit(p.error?1:p.status===0?0:1)"
set "result=%errorlevel%"
popd
exit /b %result%
