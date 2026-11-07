param([string]$OutputPath)
$ErrorActionPreference='Stop'
$compiler='E:\Apps\build-tools\vs2022\MSBuild\Current\Bin\Roslyn\csc.exe'
if(-not(Test-Path -LiteralPath $compiler)){throw 'C# compiler missing'}
if(-not $OutputPath){$OutputPath=Join-Path $PSScriptRoot 'HookBridge.exe';if(Get-Process HookBridge -ErrorAction SilentlyContinue){throw 'Stop Hook through ToMe before installing a new bridge'}}
$sources=@('HookBridge.cs','EmbedTextPolicy.cs','HookSourceFrames.cs','WaitRenderHook.cs','HookTarget.cs')|ForEach-Object{Join-Path $PSScriptRoot $_}
& $compiler /nologo /langversion:5 /optimize+ /target:exe /platform:x64 /codepage:65001 "/out:$OutputPath" /reference:System.dll /reference:System.Core.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll @sources
if($LASTEXITCODE -ne 0){throw 'HookBridge compilation failed'}
# 32-bit helper that locates the system Direct3D9 functions for the wait-marker draw hook (see WaitRenderHook.cs).
& $compiler /nologo /langversion:5 /optimize+ /target:exe /platform:x86 /codepage:65001 ("/out:"+(Join-Path (Split-Path $OutputPath) 'D3D9Probe.exe')) /reference:System.Windows.Forms.dll (Join-Path $PSScriptRoot 'D3D9Probe.cs')
if($LASTEXITCODE -ne 0){throw 'D3D9Probe compilation failed'}
& $OutputPath --self-test
if($LASTEXITCODE -ne 0){throw 'HookBridge self-test failed'}
