@echo off
rem Self-test of the glyph trace's per-line colour (tracecolor.cpp): header only, no DLL, no GPU, no game. 32 and 64 bit.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "OUT=%TEMP%\megulit-gpucolor-selftest"
if not exist "%OUT%\32" mkdir "%OUT%\32"
if not exist "%OUT%\64" mkdir "%OUT%\64"
set FLAGS=/nologo /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE /DNOMINMAX
cmd /c "call "%~dp0..\..\vsx86.cmd" >nul && cl %FLAGS% /Fo"%OUT%\32\\" tracecolor.cpp /Fe:"%OUT%\32\tracecolor.exe" >nul" || exit /b 1
"%OUT%\32\tracecolor.exe" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl %FLAGS% /Fo"%OUT%\64\\" tracecolor.cpp /Fe:"%OUT%\64\tracecolor.exe" >nul" || exit /b 1
"%OUT%\64\tracecolor.exe" || exit /b 1
endlocal
