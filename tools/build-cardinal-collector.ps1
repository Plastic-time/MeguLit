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
& $csc /nologo /optimize+ /platform:x64 /main:CardinalCollector ("/out:"+ (Join-Path $out 'CardinalCollector.exe')) @($refs|ForEach-Object{"/reference:"+$_}) (Join-Path $root 'native/CardinalCollector.cs') (Join-Path $root 'native/ColdDesk.cs')
if($LASTEXITCODE){throw 'Collector build failed'}
& $csc /nologo /optimize+ /platform:x64 ("/out:"+ (Join-Path $out 'ColdCapture64.exe')) (Join-Path $root 'native/ColdCapture.cs')
if($LASTEXITCODE){throw 'Audio guard build failed'}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'cardinal-native-tap.cjs') -Destination $out
& $csc /nologo /optimize+ /platform:x64 ("/out:"+ (Join-Path $out 'CardinalIsolationProbe.exe')) (Join-Path $root 'native/CardinalIsolationProbe.cs')
if($LASTEXITCODE){throw 'Isolation probe build failed'}
