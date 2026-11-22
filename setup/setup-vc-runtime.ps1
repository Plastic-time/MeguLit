# SPDX-License-Identifier: GPL-3.0-or-later
function Get-VcRuntimePackageVersion([string]$Path) {
  $sig = Get-AuthenticodeSignature -LiteralPath $Path
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) -cne 'Microsoft Corporation') {
    throw 'VC_REDIST_INVALID_MICROSOFT_SIGNATURE'
  }
  $info = [Diagnostics.FileVersionInfo]::GetVersionInfo($Path)
  if ($info.OriginalFilename -ine 'VC_redist.x64.exe' -or $info.FileMajorPart -ne 14) { throw 'VC_REDIST_EXPECTED_V14_X64' }
  [version]::new($info.FileMajorPart, $info.FileMinorPart, $info.FileBuildPart, $info.FilePrivatePart)
}

function Get-InstalledVcRuntimeVersion {
  $latest = $null
  foreach ($view in 'Registry64','Registry32') {
    $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey('LocalMachine', $view)
    try {
      $key = $base.OpenSubKey('SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64')
      if (-not $key) { continue }
      try {
        $version = $null
        if ($key.GetValue('Installed') -eq 1 -and [version]::TryParse((([string]$key.GetValue('Version')) -replace '^v',''), [ref]$version) -and
            $version.Major -eq 14 -and (-not $latest -or $version -gt $latest)) { $latest = $version }
      } finally { $key.Dispose() }
    } finally { $base.Dispose() }
  }
  $latest
}

function Get-VcRuntimeAction([version]$Installed, [version]$Minimum) {
  if ($Installed -and $Installed -ge $Minimum) { return 'skip' }
  'install'
}

function Get-VcRuntimeOutcome([int]$ExitCode, [version]$Installed, [version]$Minimum) {
  if ($ExitCode -in 1223, 1602, -2147023673, -2147023294) { return 'cancelled' }
  $restart = $ExitCode -in 1641, 3010
  if ((Get-VcRuntimeAction $Installed $Minimum) -eq 'install') {
    if ($restart) { return 'restart-pending' }
    return 'failed'
  }
  if ($restart) { return 'restart-required' }
  if ($ExitCode -in 0, 1638, -2147023258) { return 'ready' }
  'failed'
}

function Invoke-SetupVcRuntime([string]$SetupDir, [switch]$Required) {
  if ($testLog -or $script:setupTestScope -or $env:MEGULIT_SETUP_PREVIEW) { return 'isolated' }
  $manifest = Join-Path $SetupDir 'vc-runtime.json'
  if (-not $Required -and -not [IO.File]::Exists($manifest)) { return 'unbundled' }
  $minimum = $null
  $meta = Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($meta.schemaVersion -ne 1 -or $meta.architecture -cne 'x64' -or $meta.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
      -not [version]::TryParse([string]$meta.minimumVersion, [ref]$minimum) -or $minimum.Major -ne 14 -or $minimum.Revision -lt 0) {
    throw 'VC_REDIST_INVALID_MANIFEST'
  }
  $installed = Get-InstalledVcRuntimeVersion
  Write-VcRuntimeLog "installed=$installed minimum=$minimum"
  if ((Get-VcRuntimeAction $installed $minimum) -eq 'skip') { return 'skip' }

  $exe = Join-Path $SetupDir 'vc_redist.x64.exe'
  # Keep the verified file open without write/delete sharing through the elevated launch.
  $hold = [IO.File]::Open($exe, 'Open', 'Read', 'Read')
  try {
    if ((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant() -cne $meta.sha256 -or
        (Get-VcRuntimePackageVersion $exe) -ne $minimum) { throw 'VC_REDIST_PACKAGE_MISMATCH' }
    try { $process = Start-Process -FilePath $exe -ArgumentList '/install','/passive','/norestart' -Verb RunAs -PassThru }
    catch {
      $errorCause = $_.Exception.GetBaseException()
      if ($errorCause -is [ComponentModel.Win32Exception] -and $errorCause.NativeErrorCode -eq 1223) { return 'cancelled' }
      throw
    }
    try {
      $null = $process.Handle
      while (-not $process.HasExited) { [Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 50 }
      $exitCode = $process.ExitCode
    } finally { $process.Dispose() }
  } finally { $hold.Dispose() }
  $installed = Get-InstalledVcRuntimeVersion
  Write-VcRuntimeLog "exit=$exitCode installed=$installed"
  Get-VcRuntimeOutcome $exitCode $installed $minimum
}
