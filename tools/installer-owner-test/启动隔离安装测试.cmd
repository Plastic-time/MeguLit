@echo off
chcp 65001 >nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -File "%~dp0launch-installer-test.ps1"
echo.
echo 如有问题，请把 installer-owner-test\log 目录交给负责人
pause
