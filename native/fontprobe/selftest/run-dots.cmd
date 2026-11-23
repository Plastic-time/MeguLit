@echo off
rem Builds the glyph dot self-test host (dothost.cpp) for both bitnesses and runs each against its MeguLitFont DLL:
rem off-screen DIB, no window, no game. Every case is saved as PNG (dots-<case>-x86/x64.png) in the shot folder.
rem Fails when either DLL is older than version 3 (glyph dots) or any dot check fails.
rem Usage: run-dots.cmd [folder with MeguLitFont32/64.dll] [shot folder]   (defaults: native\ and %TEMP%\megulit-glyphdots)
setlocal
cd /d "%~dp0"
set "DLLDIR=%~1"
if "%DLLDIR%"=="" set "DLLDIR=%~dp0..\.."
set "SHOTS=%~2"
if "%SHOTS%"=="" set "SHOTS=%TEMP%\megulit-glyphdots"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set LIBS=gdi32.lib user32.lib gdiplus.lib d2d1.lib dwrite.lib ole32.lib
if not exist "%TEMP%\megulit-glyphdots64" mkdir "%TEMP%\megulit-glyphdots64"
if not exist "%TEMP%\megulit-glyphdots32" mkdir "%TEMP%\megulit-glyphdots32"
if not exist "%SHOTS%" mkdir "%SHOTS%"
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul 2>nul
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE dothost.cpp /Fe:"%TEMP%\megulit-glyphdots64\host.exe" /Fo"%TEMP%\megulit-glyphdots64\\" /link %LIBS% >nul || exit /b 1
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE earlyhost.cpp /Fe:"%TEMP%\megulit-glyphdots64\early.exe" /Fo"%TEMP%\megulit-glyphdots64\\" /link gdi32.lib >nul || exit /b 1
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul 2>nul
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE dothost.cpp /Fe:"%TEMP%\megulit-glyphdots32\host.exe" /Fo"%TEMP%\megulit-glyphdots32\\" /link %LIBS% >nul || exit /b 1
cl /nologo /O2 /EHsc /utf-8 /DUNICODE /D_UNICODE earlyhost.cpp /Fe:"%TEMP%\megulit-glyphdots32\early.exe" /Fo"%TEMP%\megulit-glyphdots32\\" /link gdi32.lib >nul || exit /b 1
endlocal
echo [64-bit]
"%TEMP%\megulit-glyphdots64\host.exe" "%DLLDIR%\MeguLitFont64.dll" "%SHOTS%" || exit /b 1
echo [32-bit]
"%TEMP%\megulit-glyphdots32\host.exe" "%DLLDIR%\MeguLitFont32.dll" "%SHOTS%" || exit /b 1
rem Early injection must keep startup/title glyphs intact until a dialogue line is confirmed.
rem The legacy blind-mode environment request grants no permission to hide them.
set "MEGULIT_GLYPH_MODE=dot-blind"
set "MEGULIT_GLYPH_FONT=28 MS Gothic"
for %%B in (64 32) do (
 echo [early %%B-bit]
 del /q "%TEMP%\megulit-glyphdots%%B\early.result" 2>nul
 "%DLLDIR%\MeguLitLaunch%%B.exe" "%DLLDIR%\MeguLitFont%%B.dll" "%TEMP%\megulit-glyphdots%%B\early.exe" "MS Gothic" "%TEMP%\megulit-glyphdots%%B\early.result" >nul || (echo FAIL launcher %%B-bit & exit /b 1)
 powershell -NoProfile -Command "$f='%TEMP%\megulit-glyphdots%%B\early.result'; for($i=0;$i -lt 60 -and -not (Test-Path $f);$i++){Start-Sleep -Milliseconds 250}; if(-not (Test-Path $f)){'FAIL no result'; exit 1}; $r=Get-Content $f; $r; if($r -match '^PASS'){exit 0}else{exit 1}" || (echo FAIL early injection %%B-bit & exit /b 1)
)
