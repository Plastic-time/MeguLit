# SPDX-License-Identifier: GPL-3.0-or-later
param([string]$Unused,[string]$Flag,[string]$Lang='zh')
& (Join-Path $PSScriptRoot '..\native\StartupIsland.exe') $Flag $Lang '#e0495a'
exit $LASTEXITCODE
