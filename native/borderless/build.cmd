@echo off
rem Builds MeguLitBorderless32/64.dll, MeguLitBorderlessLaunch32/64.exe into native\ and the self-test hosts, then runs the
rem self-tests (fake COM objects only: no real fullscreen mode is ever requested). Same toolchain as scncapture.
rem Objects go to %MEGULIT_BUILD_OUT% (default obj32\ obj64\ here).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
if "%MEGULIT_BUILD_OUT%"=="" set "MEGULIT_BUILD_OUT=%~dp0obj"
set MH=..\shared\minhook\src\hook.c ..\shared\minhook\src\buffer.c ..\shared\minhook\src\trampoline.c ..\shared\minhook\src\hde\hde32.c ..\shared\minhook\src\hde\hde64.c
set FLAGS=/nologo /std:c++17 /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
set LIBS=user32.lib gdi32.lib ole32.lib uuid.lib dxguid.lib
if not exist "%MEGULIT_BUILD_OUT%\b32" mkdir "%MEGULIT_BUILD_OUT%\b32"
if not exist "%MEGULIT_BUILD_OUT%\b64" mkdir "%MEGULIT_BUILD_OUT%\b64"
if exist "%MEGULIT_VS_X86%" (call "%MEGULIT_VS_X86%" >nul || exit /b 1) else (call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul || exit /b 1)
cl %FLAGS% /LD /Fo"%MEGULIT_BUILD_OUT%\b32\\" Borderless.cpp %MH% /Fe:..\MeguLitBorderless32.dll /link %LIBS% >"%MEGULIT_BUILD_OUT%\b32\build.log" || (type "%MEGULIT_BUILD_OUT%\b32\build.log" & exit /b 1)
cl %FLAGS% /Fo"%MEGULIT_BUILD_OUT%\b32\\" Launch.cpp /Fe:..\MeguLitBorderlessLaunch32.exe /link user32.lib >>"%MEGULIT_BUILD_OUT%\b32\build.log" || (type "%MEGULIT_BUILD_OUT%\b32\build.log" & exit /b 1)
cl %FLAGS% /Fo"%MEGULIT_BUILD_OUT%\b32\\" selftest\bltest.cpp /Fe:"%MEGULIT_BUILD_OUT%\b32\bltest.exe" /link /OPT:NOICF %LIBS% >>"%MEGULIT_BUILD_OUT%\b32\build.log" || (type "%MEGULIT_BUILD_OUT%\b32\build.log" & exit /b 1)
"%MEGULIT_BUILD_OUT%\b32\bltest.exe" "%~dp0..\MeguLitBorderless32.dll" || exit /b 1
endlocal & setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_BUILD_OUT%"=="" set "MEGULIT_BUILD_OUT=%~dp0obj"
set MH=..\shared\minhook\src\hook.c ..\shared\minhook\src\buffer.c ..\shared\minhook\src\trampoline.c ..\shared\minhook\src\hde\hde32.c ..\shared\minhook\src\hde\hde64.c
set FLAGS=/nologo /std:c++17 /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
set LIBS=user32.lib gdi32.lib ole32.lib uuid.lib dxguid.lib
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul || exit /b 1
cl %FLAGS% /LD /Fo"%MEGULIT_BUILD_OUT%\b64\\" Borderless.cpp %MH% /Fe:..\MeguLitBorderless64.dll /link %LIBS% >"%MEGULIT_BUILD_OUT%\b64\build.log" || (type "%MEGULIT_BUILD_OUT%\b64\build.log" & exit /b 1)
cl %FLAGS% /Fo"%MEGULIT_BUILD_OUT%\b64\\" Launch.cpp /Fe:..\MeguLitBorderlessLaunch64.exe /link user32.lib >>"%MEGULIT_BUILD_OUT%\b64\build.log" || (type "%MEGULIT_BUILD_OUT%\b64\build.log" & exit /b 1)
cl %FLAGS% /Fo"%MEGULIT_BUILD_OUT%\b64\\" selftest\bltest.cpp /Fe:"%MEGULIT_BUILD_OUT%\b64\bltest.exe" /link /OPT:NOICF %LIBS% >>"%MEGULIT_BUILD_OUT%\b64\build.log" || (type "%MEGULIT_BUILD_OUT%\b64\build.log" & exit /b 1)
"%MEGULIT_BUILD_OUT%\b64\bltest.exe" "%~dp0..\MeguLitBorderless64.dll" || exit /b 1
del /q ..\MeguLitBorderless32.exp ..\MeguLitBorderless32.lib ..\MeguLitBorderless64.exp ..\MeguLitBorderless64.lib 2>nul
endlocal
