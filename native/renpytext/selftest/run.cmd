@echo off
rem Self-test of native\MeguLitRenpy64.dll and native\MeguLitRenpy.py against a stand-in Ren'Py (host.py, run by
rem a 64-bit CPython 3 on PATH); no game is involved. Run ..\build.cmd first.
setlocal
cd /d "%~dp0"
python -I host.py --dll "%~dp0..\..\MeguLitRenpy64.dll"
exit /b %ERRORLEVEL%
