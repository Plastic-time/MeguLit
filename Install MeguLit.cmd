@echo off
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0setup\setup-runtime.ps1" -Root "%~dp0." -InstallFromPackage
if errorlevel 1 if not errorlevel 3 pause
