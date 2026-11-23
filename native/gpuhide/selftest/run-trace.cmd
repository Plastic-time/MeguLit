@echo off
rem Self-test of the glyph trace (GlyphTrace.h) in MeguLitGpu32/64.dll: ggohost plays a GetGlyphOutline engine that copies
rem glyph bitmaps into its own Direct3D 9 texture (per-glyph upload, whole-atlas write, system-memory texture + UpdateTexture,
rem surface lock, MeguLitFont blank mode with and without the mark pixel). Usage: run-trace.cmd [dll folder]. Exit 0 = passed.
setlocal
cd /d "%~dp0"
set "DLLS=%~1"
if "%DLLS%"=="" set "DLLS=%~dp0..\.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "OUT=%TEMP%\megulit-gputrace-selftest"
if not exist "%OUT%\32" mkdir "%OUT%\32"
if not exist "%OUT%\64" mkdir "%OUT%\64"
set FLAGS=/nologo /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE
set M=..\..\shared\minhook\src
set MH=%M%\hook.c %M%\buffer.c %M%\trampoline.c %M%\hde\hde32.c %M%\hde\hde64.c
setlocal
call "%~dp0..\..\vsx86.cmd" >nul || exit /b 1
cl %FLAGS% /Fo"%OUT%\32\\" ggohost.cpp %MH% /Fe:"%OUT%\ggohost32.exe" /link d3d9.lib user32.lib gdi32.lib >nul || exit /b 1
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl %FLAGS% /Fo"%OUT%\64\\" ggohost.cpp %MH% /Fe:"%OUT%\ggohost64.exe" /link d3d9.lib user32.lib gdi32.lib >nul || exit /b 1
endlocal
set FAIL=0
for %%m in (upload whole sysmem surface blank marker) do (
 "%OUT%\ggohost32.exe" "%DLLS%\MeguLitGpu32.dll" %%m || set FAIL=1
 "%OUT%\ggohost64.exe" "%DLLS%\MeguLitGpu64.dll" %%m || set FAIL=1
)
if %FAIL%==1 (echo GLYPH TRACE SELFTEST FAILED & exit /b 1)
echo GLYPH TRACE SELFTEST PASSED
endlocal
