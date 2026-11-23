@echo off
rem Wipes the trial install folder and the resume cache (only under try-install, never a real install).
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Users\Megumin\AppData\Local\hermes\node\node.exe"
"%NODE%" "%~dp0try-server.cjs" --reset
pause
