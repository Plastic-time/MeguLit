@echo off
for %%D in ("%~dp0.") do "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -STA -File "%~dp0setup\setup-runtime.ps1" -Root "%%~fD" -InstallFromPackage
exit /b %errorlevel%
