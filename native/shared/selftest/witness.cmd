@echo off
rem Self-test of native\shared\MeguLitCrashWitness.h (crash-witness.cpp), x86 and x64. Exit code 0 = passed.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "WORK=%TEMP%\megulit-crash-witness-build"
if not exist "%WORK%" mkdir "%WORK%"
set FLAGS=/nologo /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
setlocal
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%WORK%\w32.obj" crash-witness.cpp /Fe:"%WORK%\witness32.exe" /link user32.lib >nul || (echo build x86 failed& exit /b 1)
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%WORK%\w64.obj" crash-witness.cpp /Fe:"%WORK%\witness64.exe" /link user32.lib >nul || (echo build x64 failed& exit /b 1)
endlocal
for %%B in (32 64) do (
 echo [%%B-bit]
 "%WORK%\witness%%B.exe" || exit /b 1
)
echo CRASH WITNESS SELFTEST PASSED
endlocal
