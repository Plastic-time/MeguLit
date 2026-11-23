@echo off
rem Builds MeguLitGpu32.dll and MeguLitGpu64.dll into native\ (hide layer 4, see GpuHide.cpp and docs/hide-layers.md).
rem MEGULIT_GPU_OUT: another output folder (test builds; objects go there too), default native\.
setlocal
cd /d "%~dp0"
if "%MEGULIT_GPU_OUT%"=="" set "MEGULIT_GPU_OUT=%~dp0.."
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set SRC=GpuHide.cpp ..\shared\minhook\src\hook.c ..\shared\minhook\src\buffer.c ..\shared\minhook\src\trampoline.c ..\shared\minhook\src\hde\hde32.c ..\shared\minhook\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
if not exist "%MEGULIT_GPU_OUT%\objgpu32" mkdir "%MEGULIT_GPU_OUT%\objgpu32"
if not exist "%MEGULIT_GPU_OUT%\objgpu64" mkdir "%MEGULIT_GPU_OUT%\objgpu64"
call "%~dp0..\vsx86.cmd" || exit /b 1
cl %FLAGS% /Fo"%MEGULIT_GPU_OUT%\objgpu32\\" %SRC% /Fe:"%MEGULIT_GPU_OUT%\MeguLitGpu32.dll" /link user32.lib gdi32.lib || exit /b 1
endlocal & set "MEGULIT_GPU_OUT=%MEGULIT_GPU_OUT%"
setlocal
cd /d "%~dp0"
if "%MEGULIT_VS%"=="" set "MEGULIT_VS=E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat"
set SRC=GpuHide.cpp ..\shared\minhook\src\hook.c ..\shared\minhook\src\buffer.c ..\shared\minhook\src\trampoline.c ..\shared\minhook\src\hde\hde32.c ..\shared\minhook\src\hde\hde64.c
set FLAGS=/nologo /O2 /MT /EHsc /LD /W3 /utf-8 /DUNICODE /D_UNICODE /DWIN32_LEAN_AND_MEAN
call "%MEGULIT_VS%" -arch=x64 -host_arch=x64 -no_logo || exit /b 1
cl %FLAGS% /Fo"%MEGULIT_GPU_OUT%\objgpu64\\" %SRC% /Fe:"%MEGULIT_GPU_OUT%\MeguLitGpu64.dll" /link user32.lib gdi32.lib || exit /b 1
del /q "%MEGULIT_GPU_OUT%\MeguLitGpu32.exp" "%MEGULIT_GPU_OUT%\MeguLitGpu32.lib" "%MEGULIT_GPU_OUT%\MeguLitGpu64.exp" "%MEGULIT_GPU_OUT%\MeguLitGpu64.lib" 2>nul
endlocal
