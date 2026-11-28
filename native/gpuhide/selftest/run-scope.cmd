@echo off
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
call :scope x86 32 || exit /b 1
call :scope x64 64 || exit /b 1
exit /b 0

:scope
setlocal
if "%~1"=="x86" (
 call "%~dp0..\..\vsx86.cmd" >nul || exit /b 1
) else (
 call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
)
set "SCOPE=%TEMP%\megulit-dialogue-scope%~2"
echo Dialogue scope %~1
cl /nologo /O2 /EHsc /W3 /utf-8 scope.cpp /Fe:"%SCOPE%.exe" /Fo:"%SCOPE%.obj" >nul || exit /b 1
"%SCOPE%.exe"
exit /b %errorlevel%
