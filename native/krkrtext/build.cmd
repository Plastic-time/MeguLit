@echo off
rem Builds MeguLitKrkr32.dll into native\ (see KrkrText.cpp). 32-bit only: every KiriKiri game checked so far is 32-bit
rem and the bundled SDK stub (sdk\tp_stub.*) is the 32-bit KiriKiri 2 one. Toolchain: MEGULIT_VS_X86 (setup_x86.bat).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
if not exist obj32 mkdir obj32
call "%MEGULIT_VS_X86%" || exit /b 1
cl /nologo /O2 /MT /EHsc /LD /W3 /wd4828 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /FIwindows.h /FIobjidl.h /Foobj32\ KrkrText.cpp sdk\tp_stub.cpp /Fe:..\MeguLitKrkr32.dll /link user32.lib || exit /b 1
del /q ..\MeguLitKrkr32.exp ..\MeguLitKrkr32.lib 2>nul
endlocal
