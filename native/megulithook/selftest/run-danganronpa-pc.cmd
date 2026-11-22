@echo off
setlocal
if "%MEGULIT_HOOK_TREE%"=="" exit /b 2
if "%MEGULIT_DANGAN_OUT%"=="" exit /b 2
if not exist "%MEGULIT_DANGAN_OUT%" mkdir "%MEGULIT_DANGAN_OUT%"
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x86 -host_arch=x64 -no_logo >nul || exit /b 1
cl /nologo /O2 /EHsc /std:c++17 /utf-8 /I"%MEGULIT_HOOK_TREE%\src\src\NativeImpl\LunaHook\include" "%~dp0danganronpa-pc.cpp" /Fe:"%MEGULIT_DANGAN_OUT%\callback.exe" /Fo"%MEGULIT_DANGAN_OUT%\\" /link advapi32.lib || exit /b 1
"%MEGULIT_DANGAN_OUT%\callback.exe" %*
