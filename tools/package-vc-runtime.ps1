# SPDX-License-Identifier: GPL-3.0-or-later
. (Join-Path $PSScriptRoot '../setup/setup-vc-runtime.ps1')

function New-VcRuntimeReleaseFiles([string]$Directory, [string]$OfflinePackage = $env:MEGULIT_VC_REDIST_X64) {
  $exe = Join-Path $Directory 'vc_redist.x64.exe'
  if ($OfflinePackage) {
    Copy-Item -LiteralPath $OfflinePackage -Destination $exe -Force
  } else {
    Invoke-WebRequest -Uri 'https://aka.ms/vc14/vc_redist.x64.exe' -UseBasicParsing -OutFile $exe -TimeoutSec 180
  }
  $version = Get-VcRuntimePackageVersion $exe
  $manifest = Join-Path $Directory 'vc-runtime.json'
  # Accept the verified bundle's version and later v14 builds as the supported baseline.
  $meta = @{ schemaVersion = 1; architecture = 'x64'; minimumVersion = $version.ToString(); sha256 = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() }
  [IO.File]::WriteAllText($manifest, ($meta | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
  @{ 'setup/vc_redist.x64.exe' = $exe; 'setup/vc-runtime.json' = $manifest }
}
