@echo off
rem Builds MeguLitDpDecline32.dll and MeguLitDpDecline64.dll into native\ (see Decline.c). Same toolchain as scncapture.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if "%MEGULIT_VS_X86%"=="" set "MEGULIT_VS_X86=E:\Apps\work\euphoria-test-build\toolchain\msvc\setup_x86.bat"
set FLAGS=/nologo /O1 /MT /LD /W3 /GS-
if not exist obj32 mkdir obj32
if not exist obj64 mkdir obj64
if exist "%MEGULIT_VS_X86%" (call "%MEGULIT_VS_X86%" || exit /b 1) else (call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo || exit /b 1)
cl %FLAGS% /Foobj32\ Decline.c /Fe:..\MeguLitDpDecline32.dll /link /NODEFAULTLIB /ENTRY:DllMain kernel32.lib || exit /b 1
endlocal & setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set FLAGS=/nologo /O1 /MT /LD /W3 /GS-
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo || exit /b 1
cl %FLAGS% /Foobj64\ Decline.c /Fe:..\MeguLitDpDecline64.dll /link /NODEFAULTLIB /ENTRY:DllMain kernel32.lib || exit /b 1
