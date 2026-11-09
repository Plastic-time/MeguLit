@echo off
rem Self-test of native\MeguLitKrkr32.dll against a stand-in KiriKiri host (host.cpp); no game is involved.
rem Run ..\build.cmd first. Toolchain: MEGULIT_VS_X86 (setup_x86.bat).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
set "WORK=%TEMP%\megulit-krkr-selftest"
if not exist "%WORK%" mkdir "%WORK%"
call "%MEGULIT_VS_X86%" >nul || exit /b 1
cl /nologo /O2 /MT /EHsc /W3 /wd4828 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /FIwindows.h /FIobjidl.h /Fo"%WORK%\\" host.cpp ..\sdk\tp_stub.cpp /Fe:"%WORK%\host.exe" /link user32.lib >nul || exit /b 1
"%WORK%\host.exe" "%~dp0..\..\MeguLitKrkr32.dll"
exit /b %ERRORLEVEL%
