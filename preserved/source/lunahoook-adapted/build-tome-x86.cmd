@echo off
set PATH=E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin;E:\Apps\build-tools\vs2022\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%
call "E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat" -arch=x86 -no_logo >nul 2>nul
cd /d E:\Apps\ToMe\source\mages-embed-20261027
ninja -C build-x86-tome LunaHook > build-tome-x86.log 2>&1
echo exit %ERRORLEVEL% >> build-tome-x86.log
