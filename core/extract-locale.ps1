param([Parameter(Mandatory=$true)][string]$Installer,[Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$installerPath=[IO.Path]::GetFullPath($Installer)
$outputPath=[IO.Path]::GetFullPath($OutputDirectory)
if ([IO.Path]::GetDirectoryName($installerPath) -ne $outputPath) { throw 'Installer and output must share the portable component directory' }
# Read the official installer's embedded byte arrays without running its UI or registering shell extensions
$assembly=[Reflection.Assembly]::LoadFile($installerPath)
$stream=$assembly.GetManifestResourceStream('LEInstaller.Properties.Resources.resources')
if ($null -eq $stream) { throw 'Official installer resources not found' }
$reader=New-Object Resources.ResourceReader($stream)
try {
  $found=0
  foreach ($entry in $reader) {
    if ($entry.Key -eq 'LECommonLibrary' -or $entry.Key -eq 'LEContextMenuHandler') {
      if ($entry.Value -isnot [byte[]]) { throw 'Unexpected installer resource type' }
      [IO.File]::WriteAllBytes((Join-Path $outputPath ($entry.Key+'.dll')),$entry.Value)
      $found++
    }
  }
  if ($found -ne 2) { throw 'Official installer resources incomplete' }
} finally { $reader.Dispose();$stream.Dispose() }
