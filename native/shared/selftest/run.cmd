@echo off
rem Stress test of native\shared\MeguLitSafeUnhook.h (unhook-stress.cpp) with MinHook, x86 and x64: 100 hook/unhook
rem rounds (MEGULIT_SELFTEST_FULL=1: 1000) under calling threads, a parked thread (memory kept, not freed), RetryKept.
rem The old removal (--naive) must fail, so the test can see a regression. Exit code 0 = passed.
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set "WORK=%TEMP%\megulit-safe-unhook"
if not exist "%WORK%" mkdir "%WORK%"
set "MH=..\minhook"
set SRC=unhook-stress.cpp %MH%\src\hook.c %MH%\src\buffer.c %MH%\src\trampoline.c %MH%\src\hde\hde32.c %MH%\src\hde\hde64.c
set BENCH=minhook-bench.cpp %MH%\src\hook.c %MH%\src\buffer.c %MH%\src\trampoline.c %MH%\src\hde\hde32.c %MH%\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN /I%MH%\include
for %%B in (32 64 b32 b64) do if not exist "%WORK%\%%B" mkdir "%WORK%\%%B"
setlocal
call "%MEGULIT_VS%" -arch=x86 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%WORK%\32\\" %SRC% /Fe:"%WORK%\stress32.exe" >nul || (echo build x86 failed& exit /b 1)
cl %FLAGS% /Fo"%WORK%\b32\\" %BENCH% /Fe:"%WORK%\bench32.exe" >nul || (echo build bench x86 failed& exit /b 1)
endlocal
setlocal
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo >nul 2>&1
cl %FLAGS% /Fo"%WORK%\64\\" %SRC% /Fe:"%WORK%\stress64.exe" >nul || (echo build x64 failed& exit /b 1)
cl %FLAGS% /Fo"%WORK%\b64\\" %BENCH% /Fe:"%WORK%\bench64.exe" >nul || (echo build bench x64 failed& exit /b 1)
endlocal
for %%B in (32 64) do (
 echo [%%B-bit]
 rem MinHook freeze (native\shared\minhook, local patch): 30 hooks one by one and queued; fails when one freeze is slow again
 "%WORK%\bench%%B.exe" || exit /b 1
 "%WORK%\stress%%B.exe" || exit /b 1
 "%WORK%\stress%%B.exe" --naive >nul 2>&1
 if not errorlevel 1 (echo FAIL the old removal does not fail here: the test cannot see a regression& exit /b 1)
 echo ok   the old removal ^(MH_DisableHook + MH_RemoveHook^) fails this test
)
echo SAFE UNHOOK SELFTEST PASSED
endlocal
