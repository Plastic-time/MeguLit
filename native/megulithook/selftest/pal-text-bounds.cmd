@echo off
setlocal
if "%MEGULIT_TEST_OUT%"=="" (echo Set MEGULIT_TEST_OUT to an owned temporary folder & exit /b 2)
if not exist "%MEGULIT_TEST_OUT%" mkdir "%MEGULIT_TEST_OUT%" || exit /b 1
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
call "%MEGULIT_VS%" -arch=x86 -no_logo >nul 2>nul || exit /b 1
cl /nologo /EHsc /std:c++17 /O2 /W4 /WX /Fe:"%MEGULIT_TEST_OUT%\pal-text-bounds.exe" /Fo:"%MEGULIT_TEST_OUT%\pal-text-bounds.obj" "%~dp0pal-text-bounds.cpp" /link /INCREMENTAL:NO > "%MEGULIT_TEST_OUT%\compile.log" 2>&1 || (type "%MEGULIT_TEST_OUT%\compile.log" & exit /b 1)
"%MEGULIT_TEST_OUT%\pal-text-bounds.exe"
