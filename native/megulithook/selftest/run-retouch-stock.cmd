@echo off
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "OUT=%TEMP%\megulit-retouch-stock"
if not exist "%OUT%" mkdir "%OUT%"
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 retouch-stock-contract.cpp /Fe:"%OUT%\contract32.exe" /Fo"%OUT%\\" || exit /b 1
"%OUT%\contract32.exe"
exit /b %errorlevel%
