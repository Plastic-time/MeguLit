@echo off
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "OUT=%TEMP%\megulit-yuris"
if not exist "%OUT%" mkdir "%OUT%"
node "%~dp0yurisdraw-control-fixture.cjs" "%OUT%" || exit /b 1
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo || exit /b 1
cl /nologo /O2 /EHsc /Oy- /std:c++17 /utf-8 /DYURIS_PERMISSION_FIXED /I"%~dp0..\..\shared\minhook\include" yurisdraw-control.cpp /Fe:"%OUT%\control32.exe" /Fo"%OUT%\\" /link user32.lib || exit /b 1
"%OUT%\control32.exe" "%OUT%\MeguLit\draw\733172.txt" || exit /b 1
cl /nologo /O2 /EHsc /Oy- /std:c++17 /utf-8 /DYURIS_PERMISSION_FIXED /I"%~dp0..\..\shared\minhook\include" yurisdraw-gate.cpp "%~dp0..\..\shared\minhook\src\hook.c" "%~dp0..\..\shared\minhook\src\buffer.c" "%~dp0..\..\shared\minhook\src\trampoline.c" "%~dp0..\..\shared\minhook\src\hde\hde32.c" /Fe:"%OUT%\gate32.exe" /Fo"%OUT%\\" /link user32.lib || exit /b 1
"%OUT%\gate32.exe" || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 yurisdraw.cpp /Fe:"%OUT%\sig32.exe" /Fo"%OUT%\\" || exit /b 1
"%OUT%\sig32.exe" || exit /b 1
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 yurisdraw.cpp /Fe:"%OUT%\sig64.exe" /Fo"%OUT%\\" || exit /b 1
"%OUT%\sig64.exe" || exit /b 1
