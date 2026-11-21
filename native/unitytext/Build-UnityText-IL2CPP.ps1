param([string]$OutputPath,[string]$Runtime=$env:MEGULIT_IL2CPP_RUNTIME,[string]$Shadow=$env:MEGULIT_IL2CPP_SHADOW)
$ErrorActionPreference='Stop'
# Builds against official BepInEx 6 core and .NET references. The normal first game launch generates interop;
# this source-only plugin discovers its setters at runtime and needs no game-generated assembly at compile time.
if(-not $Runtime){$Runtime=$Shadow}
if(-not $Runtime -or -not (Test-Path (Join-Path $Runtime 'BepInEx\core\BepInEx.Unity.IL2CPP.dll'))){throw 'Set MEGULIT_IL2CPP_RUNTIME to an official BepInEx 6 IL2CPP runtime folder'}
$csc=@($env:MEGULIT_ROSLYN_CSC,'E:\Apps\build-tools\vs2022\MSBuild\Current\Bin\Roslyn\csc.exe')|?{$_ -and (Test-Path $_)}|select -First 1
if(-not $OutputPath){$OutputPath=Join-Path (Split-Path $PSScriptRoot) 'MeguLitUnityText.IL2CPP.dll'}
$net=Join-Path $Runtime 'dotnet'; $core=Join-Path $Runtime 'BepInEx\core'
$refs=@()
foreach($f in Get-ChildItem $net -Filter 'System*.dll'){ if($f.Name -notmatch 'Native|IO.Compression.Native'){ $refs+='/reference:'+$f.FullName } }
$refs+='/reference:'+(Join-Path $net 'netstandard.dll')
foreach($n in 'BepInEx.Core','BepInEx.Unity.IL2CPP','Il2CppInterop.Runtime','Il2CppInterop.Common','0Harmony'){ $refs+='/reference:'+(Join-Path $core "$n.dll") }
if(-not $csc){throw 'Roslyn csc.exe not found'}
& $csc /nologo /noconfig /nostdlib+ /langversion:10 /optimize+ /deterministic+ /target:library /platform:anycpu /nowarn:CS1701,CS1702 "/out:$OutputPath" @refs (Join-Path $PSScriptRoot 'MeguLitUnityText.IL2CPP.cs') (Join-Path $PSScriptRoot 'UnityIl2CppWire.cs')
if($LASTEXITCODE -ne 0){throw 'MeguLitUnityText.IL2CPP compilation failed'}
