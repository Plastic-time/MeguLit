# Self-test of the voice harvest (Voice.cpp in MeguLitDump32/64.dll) against a silent stand-in game (voicehost.cpp); no
# game is involved. Run ..\build.cmd first; then validation\voice-harvest.test.cjs checks the output (line -> clip).
# Work folder: MEGULIT_WORK (default H:\MeguLit-Work)\voice-selftest.
$ErrorActionPreference='Stop'
$vs=if($env:MEGULIT_VS){$env:MEGULIT_VS}else{'E:\Apps\build-tools\vs2022\Common7\Tools\VsDevCmd.bat'}
$base=if($env:MEGULIT_WORK){$env:MEGULIT_WORK}else{'H:\MeguLit-Work'}
$work=Join-Path $base 'voice-selftest';if(Test-Path $work){Remove-Item $work -Recurse -Force}
foreach($bit in '32','64'){
 $game=Join-Path $work "game$bit";$out=Join-Path $work "out$bit";New-Item -ItemType Directory $game,$out | Out-Null
 $arch=if($bit -eq '32'){'x86'}else{'x64'}
 cmd /c "call `"$vs`" -arch=$arch -host_arch=x64 -no_logo >nul && cd /d `"$PSScriptRoot`" && cl /nologo /O2 /MT /EHsc /utf-8 /DUNICODE /D_UNICODE /Fo`"$game/`" voicehost.cpp /Fe:`"$game\voicehost.exe`" /link dsound.lib winmm.lib xaudio2.lib ole32.lib user32.lib >nul"
 if($LASTEXITCODE){throw "build $bit failed"}
 Push-Location $game;try{& .\voicehost.exe (Join-Path $PSScriptRoot "..\..\MeguLitDump$bit.dll") $out;$code=$LASTEXITCODE}finally{Pop-Location}
 Get-ChildItem $out -Recurse -Filter voice.log | Get-Content | ForEach-Object {"  [$bit] $_"}
 if($code){throw "x$bit voice self-test failed ($code)"}
}
'voice self-test ran; check with: node --test validation/voice-harvest.test.cjs'
