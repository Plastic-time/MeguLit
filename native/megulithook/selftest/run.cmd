@echo off
rem Builds and runs the MeguLitGdiHide.h and MeguLitEmbedWait.h (A6 embed wait replay) self-tests as a 32-bit and as a 64-bit host process (the hook ships for both),
rem then checks that both shipped hook DLLs carry the GDI hide version marker. Exit code = failures (1 for a DLL miss).
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
if not exist "%TEMP%\megulit-gdihide32" mkdir "%TEMP%\megulit-gdihide32"
if not exist "%TEMP%\megulit-gdihide64" mkdir "%TEMP%\megulit-gdihide64"
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:"%TEMP%\megulit-gdihide32\host.exe" /Fo"%TEMP%\megulit-gdihide32\\" /link gdi32.lib user32.lib >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 gdihide.cpp /Fe:"%TEMP%\megulit-gdihide64\host.exe" /Fo"%TEMP%\megulit-gdihide64\\" /link gdi32.lib user32.lib >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 embedwait.cpp /Fe:"%TEMP%\megulit-gdihide32\embedwait.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
cmd /c "call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 embedwait.cpp /Fe:"%TEMP%\megulit-gdihide64\embedwait.exe" /Fo"%TEMP%\megulit-gdihide64\\" >nul" || exit /b 1
rem A6 embed wait replay (MeguLitEmbedWait.h): must pass, and the old waiting (--old) must fail, so the test can see a regression
for %%B in (32 64) do (
 echo [embed wait %%B-bit]
 "%TEMP%\megulit-gdihide%%B\embedwait.exe"
 if errorlevel 1 exit /b 1
 "%TEMP%\megulit-gdihide%%B\embedwait.exe" --old >nul
 if not errorlevel 1 (echo FAIL embed wait replay does not catch the old waiting& exit /b 1)
 echo PASS embed wait replay catches the old waiting
)
echo [32-bit]
"%TEMP%\megulit-gdihide32\host.exe" || exit /b 1
echo [64-bit]
"%TEMP%\megulit-gdihide64\host.exe" || exit /b 1
for %%D in (MeguLitHook32.dll MeguLitHook64.dll) do (
 findstr /m /c:"MeguLit_GDIHIDE armed version=2" "%~dp0..\%%D" >nul && (echo PASS %%D carries MeguLit_GDIHIDE armed version=2) || (echo FAIL %%D lacks the GDI hide version marker & exit /b 1)
)
rem exact adapter match (MeguLitMatch.h): no other MAGES or CatSystem2 program reaches an adapter
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 match.cpp /Fe:"%TEMP%\megulit-gdihide32\match.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\match.exe"
 if errorlevel 1 exit /b 1
rem engine-draw YU-RIS signature (YurisDrawSig.h) on bytes of the four known builds
cmd /c "call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 yurisdraw.cpp /Fe:"%TEMP%\megulit-gdihide32\yurisdraw.exe" /Fo"%TEMP%\megulit-gdihide32\\" >nul" || exit /b 1
"%TEMP%\megulit-gdihide32\yurisdraw.exe"
 if errorlevel 1 exit /b 1
rem engine-draw Unity IL2CPP: the role rules and ranges on the owner's two IL2CPP games, and the runtime (fake il2cpp API, real unwind), 32- and 64-bit
for %%A in (x86 x64) do (
 cmd /c "call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 il2cppdraw.cpp /Fe:"%TEMP%\megulit-il2cpp-%%A-roles.exe" /Fo"%TEMP%\\" >nul" || exit /b 1
 "%TEMP%\megulit-il2cpp-%%A-roles.exe" || exit /b 1
 cmd /c "call "%MEGULIT_VS%" -arch=%%A -host_arch=x64 -no_logo >nul && cl /nologo /O2 /EHsc /std:c++17 /utf-8 il2cppgate.cpp /Fe:"%TEMP%\megulit-il2cpp-%%A-gate.exe" /Fo"%TEMP%\\" >nul" || exit /b 1
 "%TEMP%\megulit-il2cpp-%%A-gate.exe" || exit /b 1
)
rem one hook runtime (2026-11-19): the ISLAND, STEINS;GATE, euphoria HD adapters are part of MeguLitHook32
for %%M in (ToMeCS2_DRAW ToMeSG_EMBED EmbedEuphoria474_DrawHide_TEST2) do (
 findstr /m /c:"%%M" "%~dp0..\MeguLitHook32.dll" >nul && (echo PASS MeguLitHook32.dll carries %%M) || (echo FAIL MeguLitHook32.dll lacks %%M & exit /b 1)
)
