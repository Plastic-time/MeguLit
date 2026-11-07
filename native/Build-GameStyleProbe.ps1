param([string]$OutputPath = '')
$ErrorActionPreference = 'Stop'
$native = $PSScriptRoot
$sources = @('GameStyleProbe.cs','GameCapture.cs') | ForEach-Object { Join-Path $native $_ }
foreach ($s in $sources) { if (-not (Test-Path -LiteralPath $s)) { throw "Missing source: $s" } }

$fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
if (-not (Test-Path -LiteralPath $fw)) { $fw = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319' }
$compilers = @()
foreach ($c in @('E:\Apps\build-tools\vs2022\MSBuild\Current\Bin\Roslyn\csc.exe', (Join-Path $fw 'csc.exe'))) { if (Test-Path -LiteralPath $c) { $compilers += $c } }
if (-not $compilers.Count) { throw 'No C# compiler found (neither VS Build Tools Roslyn nor the .NET Framework csc.exe).' }

# WinRT metadata for Windows.Media.Ocr. Candidates, tried in order:
#  1. the Windows SDK's full union Windows.winmd (UnionMetadata\<version>\Windows.winmd; never the Facade\ stub,
#     which only forwards types and makes the compiler fail)
#  2. the SDK's per-contract .winmd files (References\<version>\...)
#  3. the system's split .winmd files (System32\WinMetadata)
$winmdSets = @()
$kits = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10'
$union = Get-ChildItem -Path (Join-Path $kits 'UnionMetadata') -Filter Windows.winmd -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\Facade\\' } | Sort-Object { $_.Directory.Name } -Descending | Select-Object -First 1
if ($union) { $winmdSets += ,@($union.FullName) }
$refRoot = Join-Path $kits 'References'
$refVer = Get-ChildItem -Path $refRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if ($refVer) { $contracts = @(Get-ChildItem -Path $refVer.FullName -Filter *.winmd -Recurse -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName }); if ($contracts.Count) { $winmdSets += ,$contracts } }
$system = @(Get-ChildItem -Path (Join-Path $env:WINDIR 'System32\WinMetadata') -Filter *.winmd -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
if ($system.Count) { $winmdSets += ,$system }
if (-not $winmdSets.Count) { throw 'No WinRT metadata (.winmd) found for Windows.Media.Ocr.' }
$facades = @('System.Runtime.dll','System.Runtime.WindowsRuntime.dll','System.Runtime.InteropServices.WindowsRuntime.dll') | ForEach-Object { Join-Path $fw $_ } | Where-Object { Test-Path -LiteralPath $_ }
$baseRefs = @('System.dll','System.Core.dll','System.Drawing.dll','System.Web.Extensions.dll','System.Windows.Forms.dll') + $facades

$work = Join-Path $env:TEMP ('tome-native-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($work) | Out-Null
$out = Join-Path $work 'GameStyleProbe.exe'
$built = $false
:outer foreach ($csc in $compilers) {
  foreach ($winmd in $winmdSets) {
    $refs = $baseRefs + $winmd
    $cscArgs = @('/nologo','/langversion:5','/optimize+','/target:exe','/platform:x64','/codepage:65001','/utf8output',"/out:$out") + ($refs | ForEach-Object { "/reference:$_" }) + $sources
    Write-Host ("Compiling with $csc (WinRT metadata: " + (Split-Path -Parent $winmd[0]) + ')')
    $log = & $csc @cscArgs 2>&1
    if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $out)) { $log | ForEach-Object { Write-Host $_ }; $built = $true; break outer }
    $log | Select-Object -First 12 | ForEach-Object { Write-Host $_ }
    Write-Host 'Failed with this combination; trying the next one.' -ForegroundColor Yellow
  }
}
if (-not $built) { throw 'GameStyleProbe.exe could not be compiled; the installed exe was left unchanged.' }

$installPath = if ($OutputPath) { [IO.Path]::GetFullPath($OutputPath) } else { Join-Path $native 'GameStyleProbe.exe' }
try { Copy-Item -LiteralPath $out -Destination $installPath -Force }
catch [System.IO.IOException] {
  if ($OutputPath) { throw }
  $installPath = Join-Path $native 'GameStyleProbe.updated.exe'
  Copy-Item -LiteralPath $out -Destination $installPath -Force
  Write-Host 'GameStyleProbe is in use; the update is staged for the next style probe startup'
}
Write-Host ('Built ' + $installPath)
$safeTempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not ([IO.Path]::GetFullPath($work).StartsWith($safeTempRoot,[StringComparison]::OrdinalIgnoreCase)) -or -not ([IO.Path]::GetFileName($work).StartsWith('tome-native-'))) { throw 'Unexpected temporary build directory' }
Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
