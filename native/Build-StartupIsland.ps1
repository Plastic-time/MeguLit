# Rebuild the startup animation while preserving its existing embedded artwork
param([string]$OutputPath='')
$ErrorActionPreference='Stop'
$native=$PSScriptRoot
$target=Join-Path $native 'StartupIsland.exe'
if(!$OutputPath){$OutputPath=Join-Path $native 'StartupIsland.updated.exe'}
$work=[IO.Path]::GetFullPath((Join-Path $env:TEMP ('tome-startup-'+[Guid]::NewGuid().ToString('N'))))
[IO.Directory]::CreateDirectory($work)|Out-Null
try {
  $assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($target))
  $input=$assembly.GetManifestResourceStream('MeguLit.MeguminFace')
  if(!$input){$input=$assembly.GetManifestResourceStream('ToMe.MeguminFace')}
  if(!$input){throw 'Existing startup artwork resource missing'}
  $face=Join-Path $work 'face.png';$output=[IO.File]::Create($face)
  try{$input.CopyTo($output)}finally{$output.Dispose();$input.Dispose()}
  $compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  if(!(Test-Path -LiteralPath $compiler)){$compiler=Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'}
  $built=Join-Path $work 'StartupIsland.exe'
  & $compiler /nologo /langversion:5 /optimize+ /target:winexe /platform:x64 /codepage:65001 /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll "/resource:$face,MeguLit.MeguminFace" "/out:$built" (Join-Path $native 'StartupIsland.cs')
  if($LASTEXITCODE -ne 0){throw 'Startup build failed'}
  $probe=Start-Process -FilePath $built -ArgumentList '--surface-self-test' -WindowStyle Hidden -PassThru -Wait
  if($probe.ExitCode -ne 0){throw 'Startup surface selection test failed'}
  Copy-Item -LiteralPath $built -Destination $OutputPath -Force
  Write-Output "Built and checked: $OutputPath"
} finally {
  $tempRoot=[IO.Path]::GetFullPath($env:TEMP).TrimEnd('\')+'\'
  if(!$work.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -or !(Split-Path -Leaf $work).StartsWith('tome-startup-')){throw 'Refusing to remove an unexpected build path'}
  Remove-Item -LiteralPath $work -Recurse -Force
}
