# SPDX-License-Identifier: GPL-3.0-or-later
# Build preflight: reports every tool Build.ps1 needs and exits 1 if one is missing.
. (Join-Path $PSScriptRoot 'build-env.ps1')
[pscustomobject]@{
 Layout = $(if ($taskLocalTools) { "local tools folder ($taskTools), offline" } else { "standard Windows setup$(if ($taskOffline) { ', offline' })" })
 Rust = $env:RUSTC; Cargo = $taskCargo; Linker = $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER
 MSVC = $(if ($taskMsvc) { $taskMsvc.FullName }); WindowsSDK = $(if ($taskSdk) { $taskSdk.FullName }); RC = $env:RC
 CSharp = $taskCsc; Node = $taskNode
} | Format-List | Out-String | Write-Output
if ($taskProblems.Count) { $taskProblems | ForEach-Object { Write-Output "MISSING: $_" }; exit 1 }
Write-Output 'Build environment OK'
