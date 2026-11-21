@echo off
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "OUT=%TEMP%\megulit-advhd"
if not exist "%OUT%" mkdir "%OUT%"
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo || exit /b 1
cl /nologo /O2 /EHsc /Oy- /std:c++17 /utf-8 advhddraw.cpp /Fe:"%OUT%\sig32.exe" /Fo"%OUT%\\" || exit /b 1
"%OUT%\sig32.exe" || exit /b 1
cl /nologo /O2 /EHsc /Oy- /std:c++17 /utf-8 /I"%~dp0..\..\shared\minhook\include" advhddraw-gate.cpp "%~dp0..\..\shared\minhook\src\hook.c" "%~dp0..\..\shared\minhook\src\buffer.c" "%~dp0..\..\shared\minhook\src\trampoline.c" "%~dp0..\..\shared\minhook\src\hde\hde32.c" /Fe:"%OUT%\gate32.exe" /Fo"%OUT%\\" /link user32.lib || exit /b 1
if "%MEGULIT_ADVHD_SAMPLE%"=="" ("%OUT%\gate32.exe") else ("%OUT%\gate32.exe" "%MEGULIT_ADVHD_SAMPLE%")
if errorlevel 1 exit /b 1
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 advhddraw.cpp /Fe:"%OUT%\sig64.exe" /Fo"%OUT%\\" || exit /b 1
"%OUT%\sig64.exe" || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 advhddraw-gate.cpp /Fe:"%OUT%\gate64.exe" /Fo"%OUT%\\" || exit /b 1
"%OUT%\gate64.exe" || exit /b 1
