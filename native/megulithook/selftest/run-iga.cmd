@echo off
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_IGA_OUT%"=="" set "MEGULIT_IGA_OUT=%TEMP%\megulit-iga"
if not exist "%MEGULIT_IGA_OUT%" mkdir "%MEGULIT_IGA_OUT%"
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 igatext-gate.cpp /Fe:"%MEGULIT_IGA_OUT%\gate32.exe" /Fo"%MEGULIT_IGA_OUT%\\" || exit /b 1
"%MEGULIT_IGA_OUT%\gate32.exe" || exit /b 1
for %%A in (x86 x64) do (
 call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo >nul || exit /b 1
 cl /nologo /O2 /EHsc /std:c++17 /utf-8 igatext.cpp /Fe:"%MEGULIT_IGA_OUT%\sig-%%A.exe" /Fo"%MEGULIT_IGA_OUT%\\" || exit /b 1
 if "%MEGULIT_IGA_SAMPLE%"=="" ("%MEGULIT_IGA_OUT%\sig-%%A.exe") else ("%MEGULIT_IGA_OUT%\sig-%%A.exe" "%MEGULIT_IGA_SAMPLE%")
 if errorlevel 1 exit /b 1
)
