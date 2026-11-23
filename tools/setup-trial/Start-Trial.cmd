@echo off
rem MeguLit installer TRIAL. Real download of the published packages into a test folder, never touches E:\MeguLit.
rem Double-click to start. --full = no speed limit, --rate N = N MB/s, --prefetch = start downloading before Install is pressed.
if not defined MEGU_TRIAL_HIDDEN (
  set MEGU_TRIAL_HIDDEN=1
  start "" /min "%~f0" %*
  exit /b
)
set "NODE=node"
where node >nul 2>nul || set "NODE=C:\Users\Megumin\AppData\Local\hermes\node\node.exe"
"%NODE%" "%~dp0try-server.cjs" %*
