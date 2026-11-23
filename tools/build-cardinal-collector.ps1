param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot
$out=[IO.Directory]::CreateDirectory($OutputDirectory).FullName
$csc=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$wv=Join-Path $root 'setup/webview2'
$refs=@('System.Drawing.dll','System.Windows.Forms.dll','System.Web.Extensions.dll')
foreach($name in 'Microsoft.Web.WebView2.WinForms.dll','Microsoft.Web.WebView2.Core.dll'){
    $src=Join-Path $wv $name
    Copy-Item -LiteralPath $src -Destination $out
    $refs+=$src
}
Copy-Item -LiteralPath (Join-Path $wv 'x64/WebView2Loader.dll') -Destination $out
& $csc /nologo /optimize+ /platform:x64 ("/out:"+ (Join-Path $out 'ColdCapture64.exe')) (Join-Path $root 'native/ColdCapture.cs')
if($LASTEXITCODE){throw 'Audio guard build failed'}
Copy-Item -LiteralPath (Join-Path $root 'native/CardinalDialogue.rpy') -Destination $out
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cardinal-native-tap.cjs') -Destination $out
& $csc /nologo /optimize+ /platform:x64 ("/out:"+ (Join-Path $out 'CardinalIsolationProbe.exe')) (Join-Path $root 'native/CardinalIsolationProbe.cs')
if($LASTEXITCODE){throw 'Isolation probe build failed'}
Copy-Item -LiteralPath (Join-Path $root 'tools/cardinal-live-host.cjs') -Destination $out
Copy-Item -LiteralPath (Join-Path $root 'web/reader/replay-probe.js') -Destination (Join-Path $out 'cardinal-dom-probe.js')
Copy-Item -LiteralPath (Get-Command node.exe -CommandType Application | Select-Object -First 1 -ExpandProperty Source) -Destination (Join-Path $out 'node.exe')
foreach($entry in (& git -C $root ls-files -- core services)){
    if($entry -notmatch '\.(cjs|js|json)$'){continue}
    $dest=Join-Path (Join-Path $out 'lib') $entry
    [void][IO.Directory]::CreateDirectory((Split-Path $dest))
    Copy-Item -LiteralPath (Join-Path $root $entry) -Destination $dest
}
$assets=@('CardinalDialogue.rpy','node.exe','ColdCapture64.exe','CardinalIsolationProbe.exe','cardinal-live-host.cjs','cardinal-native-tap.cjs','cardinal-dom-probe.js','WebView2Loader.dll','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll')
$assets+=Get-ChildItem -LiteralPath (Join-Path $out 'lib') -Recurse -File | ForEach-Object {$_.FullName.Substring($out.TrimEnd('\').Length+1)}
$manifest=[IO.Path]::GetTempFileName()
try {
    $lines=foreach($relative in ($assets | Sort-Object -Unique)){
        (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $out $relative)).Hash+' '+$relative
    }
    [IO.File]::WriteAllLines($manifest,[string[]]$lines)
    & $csc /nologo /optimize+ /platform:x64 /main:CardinalCollector ("/resource:"+$manifest+",cardinal-bundle.txt") ("/out:"+ (Join-Path $out 'CardinalCollector.exe')) @($refs|ForEach-Object{"/reference:"+$_}) (Join-Path $root 'native/CardinalCollector.cs') (Join-Path $root 'native/CardinalIsolationProbe.cs') (Join-Path $root 'native/CardinalGameCapture.cs') (Join-Path $root 'native/CardinalLiveReader.cs') (Join-Path $root 'native/ColdDesk.cs')
    if($LASTEXITCODE){throw 'Collector build failed'}
} finally {Remove-Item -LiteralPath $manifest}
