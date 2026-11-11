@echo off
rem Builds MeguLitScn32.dll and MeguLitScn64.dll into native\ (see ScnCapture.cpp). Toolchain paths: the local
rem offline tools folder; override with MEGULIT_VS (VsDevCmd.bat) and MEGULIT_VS_X86 (setup_x86.bat).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
set SRC=ScnCapture.cpp minhook\src\hook.c minhook\src\buffer.c minhook\src\trampoline.c minhook\src\hde\hde32.c minhook\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
if not exist obj32 mkdir obj32
if not exist obj64 mkdir obj64
if exist "%MEGULIT_VS_X86%" (call "%MEGULIT_VS_X86%" || exit /b 1) else (call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo || exit /b 1)
cl %FLAGS% /Foobj32\ %SRC% /Fe:..\MeguLitScn32.dll /link user32.lib || exit /b 1
endlocal & setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set SRC=ScnCapture.cpp minhook\src\hook.c minhook\src\buffer.c minhook\src\trampoline.c minhook\src\hde\hde32.c minhook\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo || exit /b 1
cl %FLAGS% /Foobj64\ %SRC% /Fe:..\MeguLitScn64.dll /link user32.lib || exit /b 1
del /q ..\MeguLitScn32.exp ..\MeguLitScn32.lib ..\MeguLitScn64.exp ..\MeguLitScn64.lib 2>nul
endlocal
