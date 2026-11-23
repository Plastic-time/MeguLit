@echo off
rem Replay test of the ReadFile hook (readhost.cpp): x86 and x64 hosts against MeguLitFontDot32/64.dll in native\ (or %1).
rem Exit code 0 = both passed.
setlocal
cd /d "%~dp0"
set "DLLS=%~1"
if "%DLLS%"=="" set "DLLS=%~dp0..\.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "WORK=%TEMP%\megulit-fontdot-read"
if not exist "%WORK%" mkdir "%WORK%"
set FLAGS=/nologo /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE
setlocal
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%WORK%\read32.obj" readhost.cpp /Fe:"%WORK%\read32.exe" >nul || exit /b 1
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%WORK%\read64.obj" readhost.cpp /Fe:"%WORK%\read64.exe" >nul || exit /b 1
endlocal
echo x86:
"%WORK%\read32.exe" "%DLLS%\MeguLitFontDot32.dll" "%WINDIR%\Fonts\arial.ttf" || exit /b 1
echo x64:
"%WORK%\read64.exe" "%DLLS%\MeguLitFontDot64.dll" "%WINDIR%\Fonts\arial.ttf" || exit /b 1
endlocal
