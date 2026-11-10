# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the website's images and the heading font from repository sources.
#   images: docs/screenshots/*.jpg and docs/assets/* -> site/public/assets/img/*.webp (two widths each)
#   font:   Noto Serif SC (OFL, installed with Windows 11) subset to the characters the site's headings use
# Usage (from the repo root): python -I site/tools/build-assets.py
import json, os, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / 'site' / 'public'
IMG = PUB / 'assets' / 'img'
IMG.mkdir(parents=True, exist_ok=True)

SHOTS = ['home', 'library', 'game-detail', 'words', 'anki', 'stats', 'stats-trend', 'history', 'dialogue', 'auto-update', 'kana-home', 'kana-lesson']

def webp(src, name, widths, quality=82):
    im = Image.open(src)
    im = im.convert('RGBA' if im.mode in ('RGBA', 'LA', 'P') else 'RGB')
    for w in widths:
        h = round(im.height * w / im.width)
        im.resize((w, h), Image.LANCZOS).save(IMG / f'{name}-{w}.webp', 'WEBP', quality=quality, method=6)
    print(name, im.size)

for s in SHOTS:
    webp(ROOT / 'docs' / 'screenshots' / f'{s}.jpg', s, (1360, 720) if s != 'auto-update' else (1600, 800))
webp(ROOT / 'docs' / 'assets' / 'logo.png', 'logo', (720, 360), quality=90)
webp(ROOT / 'docs' / 'assets' / 'sponsor' / 'support-card.png', 'support-card', (720,), quality=88)

# Icons from the app's own .ico
ico = Image.open(ROOT / 'desktop' / 'icons' / 'icon.ico')
ico.size = (256, 256)
big = ico.convert('RGBA')
big.resize((180, 180), Image.LANCZOS).save(PUB / 'apple-touch-icon.png')
big.resize((64, 64), Image.LANCZOS).save(PUB / 'favicon.png')
big.save(PUB / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
# Social preview: the logo on the site's dark page colour
og = Image.new('RGB', (1200, 630), (23, 15, 17))
logo = Image.open(ROOT / 'docs' / 'assets' / 'logo.png').convert('RGBA')
logo = logo.resize((900, round(logo.height * 900 / logo.width)), Image.LANCZOS)
og.paste(logo, ((1200 - logo.width) // 2, (630 - logo.height) // 2), logo)
og.save(IMG / 'og.jpg', quality=88)

# ---- heading font subset ----------------------------------------------------------------------------------------------
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src = Path(os.environ.get('WINDIR', 'C:/Windows')) / 'Fonts' / 'NotoSerifSC-VF.ttf'
if not src.exists():
    sys.exit(f'missing {src}: install Noto Serif SC (OFL) or point WINDIR elsewhere')
# Characters in serif text only: headings and the translated lines, in all three languages (keys in i18n.js and the
# data-i texts in the pages). Body text uses system fonts, and release notes fall back to installed serifs.
SERIF_KEY = re.compile(r'(^|\.)(t|title|tr|notes|req|smart|alt|tested)$')
text = 'MeguLit v0123456789'
for key, value in re.findall(r"'([a-z0-9.]+)': '((?:[^'\\]|\\.)*)'", (PUB / 'assets' / 'js' / 'i18n.js').read_text('utf8')):
    if SERIF_KEY.search(key):
        text += value
for html in PUB.glob('*.html'):
    for key, value in re.findall(r'data-i="([a-z0-9.]+)"[^>]*>([^<]*)<', html.read_text('utf8')):
        if SERIF_KEY.search(key):
            text += value
    for value in re.findall(r'<h[1-4][^>]*>(.*?)</h[1-4]>', html.read_text('utf8'), re.S):
        text += re.sub(r'<[^>]+>', '', value)
chars = set(text) | set(chr(c) for c in range(0x20, 0x7f)) | set('、。，．・「」『』（）！？〜ー…—–　')
chars.update(chr(c) for c in range(0x3041, 0x3097))  # hiragana
chars.update(chr(c) for c in range(0x30a1, 0x30fb))  # katakana
font = TTFont(src, lazy=False)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['kern', 'liga', 'palt', 'vert', 'ruby']
opts.name_IDs = ['*']
sub = subset.Subsetter(opts)
sub.populate(text=''.join(sorted(chars)))
sub.subset(font)
# One static weight (600) is all the headings use; subset first, the instancer is much faster on a small font.
font = instancer.instantiateVariableFont(font, {'wght': 600})
dst = PUB / 'assets' / 'fonts' / 'megulit-serif.woff2'
font.flavor = 'woff2'
font.save(dst)
print('font', len(chars), 'chars', dst.stat().st_size // 1024, 'KB')

# ---- hero fonts from the megu-edit template (all OFL): Cormorant, IBM Plex Mono, Source Han Serif ------------------
# Sources live outside the repo (they are large); only the subsets are committed. MEGU_FONTS overrides the folder.
MEGU = Path(os.environ.get('MEGU_FONTS', 'E:/Apps/MeguLit-Tutorial/megu-edit/public/fonts'))
def subset_to(src, dst, chars, instance=None):
    f = TTFont(src, lazy=False)
    o = subset.Options(); o.flavor = 'woff2'; o.layout_features = ['kern', 'liga', 'palt']; o.name_IDs = ['*']
    sb = subset.Subsetter(o); sb.populate(text=''.join(sorted(set(chars)))); sb.subset(f)
    f.flavor = 'woff2'; f.save(dst); print('font', dst.name, dst.stat().st_size // 1024, 'KB')
if MEGU.exists():
    ascii_ = ''.join(chr(c) for c in range(0x20, 0x7f)) + '▮·—–✦↓→←…’'
    FD = PUB / 'assets' / 'fonts'
    subset_to(MEGU / 'IBMPlexMono-Light.ttf', FD / 'plex-mono.woff2', ascii_)
    subset_to(MEGU / 'Cormorant-Italic.ttf', FD / 'cormorant-italic.woff2', ascii_)
    hero_text = '玩学日语日本語を学ぼう下载备用免费开源続きを読もうがくにちごにほんごギャルゲーで、，。' + ascii_
    for html in PUB.glob('*.html'):
        m = re.search(r'<h1[^>]*hero-type.*?</h1>', html.read_text('utf8'), re.S)
        if m: hero_text += re.sub(r'<[^>]+>', '', m.group(0))
    for key in ('hero.title', 'dl.button', 'dl.alt'):
        for v in re.findall(r"'" + re.escape(key) + r"': '((?:[^'\\]|\\.)*)'", (PUB / 'assets' / 'js' / 'i18n.js').read_text('utf8')):
            hero_text += re.sub(r'<[^>]+>', '', v)
    subset_to(MEGU / 'SourceHanSerifCN-SemiBold.otf', FD / 'han-serif-hero.woff2', hero_text)
else:
    print('megu-edit fonts not found, hero fonts unchanged')

# ---- brush face for the Chinese hero title: Zhi Mang Xing (OFL), fetched from google/fonts when not cached ---------
import urllib.request
cache = Path.home() / '.cache' / 'megulit-fonts'
cache.mkdir(parents=True, exist_ok=True)
brush = cache / 'ZhiMangXing-Regular.ttf'
if not brush.exists():
    urllib.request.urlretrieve('https://raw.githubusercontent.com/google/fonts/main/ofl/zhimangxing/ZhiMangXing-Regular.ttf', brush)
subset_to(brush, PUB / 'assets' / 'fonts' / 'brush-hero.woff2', '学日语玩，, Galgame')

# ---- logo split into cape and the rest (hat + letters), from the megu-edit template, for the entrance's cape unfurl ----
MEGU_PUB = Path(os.environ.get('MEGU_PUBLIC', 'E:/Apps/MeguLit-Tutorial/megu-edit/public'))
if (MEGU_PUB / 'logo_cape.png').exists():
    webp(MEGU_PUB / 'logo_cape.png', 'logo-cape', (720,), quality=90)
    webp(MEGU_PUB / 'logo_rest.png', 'logo-rest', (720,), quality=90)

# ---- Anki deck backs: the exact frame where each card's line is on screen, from the template's game recordings ------
import subprocess, tempfile
REC = MEGU_PUB / 'rec'
FFMPEG = os.environ.get('FFMPEG', 'E:/Apps/MeguLit-Tutorial/.tools/bin/ffmpeg.exe')
CARDS = [('card', 2.0), ('lookup-long', 13.2), ('lookup-long', 4.0), ('ruby', 4.3), ('hook', 4.5), ('translate', 3.5)]
if REC.exists() and Path(FFMPEG).exists():
    with tempfile.TemporaryDirectory() as tmp:
        for k, (name, at) in enumerate(CARDS):
            png = Path(tmp) / f'{k}.png'
            subprocess.run([FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(at), '-i', str(REC / f'{name}.webm'), '-frames:v', '1', str(png)], check=True)
            im = Image.open(png).convert('RGB')   # 1280x720; the last one keeps clear of the settings panel on the right
            box = (0, 138, 1000, 700) if k == 5 else (0, 0, 1244, 700)
            im.crop(box).resize((800, 450), Image.LANCZOS).save(IMG / f'card-{k}-800.webp', 'WEBP', quality=80, method=6)
