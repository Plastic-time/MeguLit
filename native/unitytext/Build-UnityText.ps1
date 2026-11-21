param([string]$OutputPath,[string]$Managed=$env:MEGULIT_UNITY_MANAGED,[string]$BepInEx=$env:MEGULIT_BEPINEX_CORE)
$ErrorActionPreference='Stop'
# Builds MeguLitUnityText.dll (BepInEx 5 plugin, .NET 3.5 profile so one build serves every Unity Mono game).
# References only, nothing of them is shipped: a Unity Mono "Managed" folder with mscorlib 2.0 and the single
# UnityEngine.dll of Unity 5 / 2017 (newer Unity forwards those types from UnityEngine.dll at run time; BepInEx's
# reference package UnityEngine.Modules 5.6 works the same), and BepInEx\core of BepInEx 5.4.23.
if(-not $Managed -or -not (Test-Path (Join-Path $Managed 'UnityEngine.dll'))){throw 'Set MEGULIT_UNITY_MANAGED to a Unity 5/2017 Managed folder (mscorlib 2.0, UnityEngine.dll)'}
if(-not $BepInEx -or -not (Test-Path (Join-Path $BepInEx 'BepInEx.dll'))){throw 'Set MEGULIT_BEPINEX_CORE to BepInEx 5.4.23 BepInEx\core'}
$candidates=@($env:MEGULIT_ROSLYN_CSC,(Join-Path (Split-Path (Split-Path (Split-Path $PSScriptRoot))) 'build-tools\vs2022\MSBuild\Current\Bin\Roslyn\csc.exe'),'E:\Apps\build-tools\vs2022\MSBuild\Current\Bin\Roslyn\csc.exe')
$compiler=$candidates|Where-Object{$_ -and (Test-Path -LiteralPath $_)}|Select-Object -First 1
if(-not $compiler){throw 'Roslyn csc not found (MEGULIT_ROSLYN_CSC)'}
if(-not $OutputPath){$OutputPath=Join-Path (Split-Path $PSScriptRoot) 'MeguLitUnityText.dll'}
$refs=@('mscorlib.dll','System.dll','System.Core.dll','UnityEngine.dll')|ForEach-Object{'/reference:'+(Join-Path $Managed $_)}
& $compiler /nologo /noconfig /nostdlib+ /langversion:7.3 /optimize+ /target:library /platform:anycpu /codepage:65001 "/out:$OutputPath" @refs ('/reference:'+(Join-Path $BepInEx 'BepInEx.dll')) (Join-Path $PSScriptRoot 'MeguLitUnityText.cs') (Join-Path $PSScriptRoot 'KemcoSpriteSnapshot.cs')
if($LASTEXITCODE -ne 0){throw 'MeguLitUnityText compilation failed'}
