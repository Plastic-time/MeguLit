# Crash stress of MeguLitDump32/64.dll (stress.cpp); no game is involved. Run ..\..\build.cmd first.
# .\run.ps1 [-Rounds 3000] [-Dll32 path] [-Dll64 path]   Work folder: MEGULIT_WORK (default H:\MeguLit-Work)\dump-probe-crash
param([int]$Rounds=3000,[string]$Dll32,[string]$Dll64)
$ErrorActionPreference='Stop'
$vs=if($env:MEGULIT_VS){$env:MEGULIT_VS}else{'E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat'}
$base=if($env:MEGULIT_WORK){$env:MEGULIT_WORK}else{'H:\MeguLit-Work'}
$work=Join-Path $base 'dump-probe-crash'
$native=Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$fail=0
foreach($bit in '32','64'){
 $dll=if($bit -eq '32' -and $Dll32){$Dll32}elseif($bit -eq '64' -and $Dll64){$Dll64}else{Join-Path $native "MeguLitDump$bit.dll"}
 $game=Join-Path $work "stress$bit";$out=Join-Path $work "stress$bit-out"
 foreach($d in $game,$out){if(Test-Path $d){Remove-Item $d -Recurse -Force};New-Item -ItemType Directory $d | Out-Null}
 $arch=if($bit -eq '32'){'x86'}else{'x64'}
 cmd /c "call `"$vs`" -arch=$arch -host_arch=x64 -no_logo >nul 2>nul && cd /d `"$PSScriptRoot`" && cl /nologo /O2 /MT /EHsc /utf-8 /Fo`"$game/`" stress.cpp /Fe:`"$game\stress.exe`" >nul"
 if($LASTEXITCODE){throw "build $bit failed"}
 Push-Location $game;try{$line=& .\stress.exe $dll $out $Rounds;$code=$LASTEXITCODE}finally{Pop-Location}
 $hex='0x{0:X8}' -f $code
 "[$bit] exit=$hex $line"
 if($code){$fail++}
}
if($fail){throw "stress failed ($fail)"}
'runtime-dump stress passed'
