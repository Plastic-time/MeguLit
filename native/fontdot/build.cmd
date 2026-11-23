@echo off
rem Builds MeguLitFontDot32.dll and MeguLitFontDot64.dll (FontDot.cpp) into native\ or MEGULIT_FONTDOT_OUT.
setlocal
cd /d "%~dp0"
if "%MEGULIT_FONTDOT_OUT%"=="" set "MEGULIT_FONTDOT_OUT=%~dp0.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set SRC=FontDot.cpp ..\shared\minhook\src\hook.c ..\shared\minhook\src\buffer.c ..\shared\minhook\src\trampoline.c ..\shared\minhook\src\hde\hde32.c ..\shared\minhook\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /I..\shared\minhook\include
if not exist "%MEGULIT_FONTDOT_OUT%\fdobj32" mkdir "%MEGULIT_FONTDOT_OUT%\fdobj32"
if not exist "%MEGULIT_FONTDOT_OUT%\fdobj64" mkdir "%MEGULIT_FONTDOT_OUT%\fdobj64"
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%MEGULIT_FONTDOT_OUT%\fdobj32\\" %SRC% /Fe:"%MEGULIT_FONTDOT_OUT%\MeguLitFontDot32.dll" || exit /b 1
endlocal & set "MEGULIT_FONTDOT_OUT=%MEGULIT_FONTDOT_OUT%"
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set SRC=FontDot.cpp ..\shared\minhook\src\hook.c ..\shared\minhook\src\buffer.c ..\shared\minhook\src\trampoline.c ..\shared\minhook\src\hde\hde32.c ..\shared\minhook\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /I..\shared\minhook\include
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%MEGULIT_FONTDOT_OUT%\fdobj64\\" %SRC% /Fe:"%MEGULIT_FONTDOT_OUT%\MeguLitFontDot64.dll" || exit /b 1
del /q "%MEGULIT_FONTDOT_OUT%\MeguLitFontDot32.exp" "%MEGULIT_FONTDOT_OUT%\MeguLitFontDot32.lib" "%MEGULIT_FONTDOT_OUT%\MeguLitFontDot64.exp" "%MEGULIT_FONTDOT_OUT%\MeguLitFontDot64.lib" 2>nul
endlocal
