# 把 card.html 渲染成 docs/assets/sponsor/support-card.png（2x 清晰度）
# 二维码是原图直接嵌入，不经过任何重绘
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$html = Join-Path $PSScriptRoot 'card.html'
$out  = Join-Path $root 'docs\assets\sponsor\support-card.png'
$edge = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path $edge)) { $edge = 'C:\Program Files\Google\Chrome\Application\chrome.exe' }
$uri = ([System.Uri]$html).AbsoluteUri
& $edge --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files `
  --force-device-scale-factor=2 --window-size=1200,1000 --default-background-color=00000000 `
  "--screenshot=$out" $uri | Out-Null
Write-Host "rendered -> $out"
# 裁掉卡片下方的透明空白
python -c "import sys;from PIL import Image;p=sys.argv[1];im=Image.open(p);im.crop(im.getbbox()).save(p,optimize=True)" $out
