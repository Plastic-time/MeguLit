@echo off
rem MEGULIT_HOOK_TREE: the LunaHook tree and its build folders (default E:\Apps\work\megulithook; a private copy keeps one session's files out of another's build)
if "%MEGULIT_HOOK_TREE%"=="" set "MEGULIT_HOOK_TREE=E:\Apps\work\megulithook"
rem Builds native\megulithook\MeguLitHook32.dll and MeguLitHook64.dll (the shipped hook engine; HookNative.syncShippedHook
rem copies both into runtime\megulithook at the next game start, over the runtime pack's older copies). build-x86.cmd /
rem build-x64.cmd compile the LunaHook tree in %MEGULIT_HOOK_TREE%\src with this folder's changed files; a result is
rem copied here only when it carries the GDI hide version marker, so an old tree can never be packaged as a new build.
rem Called by Build.ps1 (native\native-builds.json).
setlocal
cd /d "%~dp0"
set "BUILT=%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\builds\Release_win10"
set "MARK=MeguLit_GDIHIDE armed version=2"
cmd /c "%~dp0build-x86.cmd" || exit /b 1
cmd /c "%~dp0build-x64.cmd" || exit /b 1
for %%B in (32 64) do (
 if not exist "%BUILT%\LunaHook%%B.dll" (echo LunaHook%%B.dll was not produced & exit /b 1)
 findstr /m /c:"%MARK%" "%BUILT%\LunaHook%%B.dll" >nul || (echo LunaHook%%B.dll lacks "%MARK%": the GDI hide sources were not compiled & exit /b 1)
 copy /y "%BUILT%\LunaHook%%B.dll" "%~dp0MeguLitHook%%B.dll" >nul || exit /b 1
 rem ninja leaves an up-to-date DLL unlinked and copy keeps its old time: a git checkout that only rewrote line endings
 rem then made native-stale.cjs refuse a current build. The copy is stamped with this build's time.
 copy /b "%~dp0MeguLitHook%%B.dll"+,, "%~dp0MeguLitHook%%B.dll" >nul
 echo MeguLitHook%%B.dll updated
)
endlocal
