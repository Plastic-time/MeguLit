@echo off
setlocal
if "%~1"=="" exit /b 2
if "%~2"=="" exit /b 2
set "OUT=%~f1"
set "SAMPLES=%~f2"
if not exist "%OUT%" mkdir "%OUT%"
if errorlevel 1 exit /b 1
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
for %%A in (x86 x64) do (
 call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo
 if errorlevel 1 exit /b 1
 for %%S in (image boundary) do (
  cl /nologo /O2 /EHsc /std:c++17 /utf-8 "%~dp0magesdraw-%%S.cpp" /Fe:"%OUT%\%%S-%%A.exe" /Fo"%OUT%\%%S-%%A.obj"
  if errorlevel 1 exit /b 1
 )
 cl /nologo /O2 /EHsc /std:c++17 /utf-8 "%~dp0magesdraw.cpp" /Fe:"%OUT%\signature-%%A.exe" /Fo"%OUT%\signature-%%A.obj"
 if errorlevel 1 exit /b 1
 "%OUT%\signature-%%A.exe" > "%OUT%\signature-%%A.log"
 if errorlevel 1 exit /b 1
 "%OUT%\boundary-%%A.exe" > "%OUT%\boundary-%%A.log"
 if errorlevel 1 exit /b 1
 echo PASS MAGES %%A signature and byte-boundary checks
)
node "%~dp0..\..\..\tools\engine-sigs\verify-mages-samples.cjs" "%SAMPLES%" "%OUT%\image-x86.exe" "%OUT%\image-x64.exe" > "%OUT%\full-image-parity.json"
if errorlevel 1 exit /b 1
echo PASS MAGES five x86 samples agree on both scanner hosts
