# SPDX-License-Identifier: GPL-3.0-or-later
# Adds a song to the website's background-music library (site/public/assets/audio/).
#   - audio: 16 dB quieter, 96 kbps stereo MP3 (about 0.7 MB a minute), metadata stripped
#   - lyrics: the .lrc next to the song (or --lrc); Chinese translation lines are dropped automatically (a line with Han
#     characters but no kana, or a second line at the same timestamp that has no kana, is treated as a translation)
#   - beats: kicks and snares for the page's motion (beats.py)
#   - playlist.json: the song's entry is added or updated (title/artist from the file's tags unless given)
# Only add music you may share: the licence fields go into the credit the site shows while the song plays.
# Usage (from the repo root):
#   python -I site/tools/add-song.py "D:/MUSIC/Artist - Title.flac" --license "CC BY-NC 4.0" \
#     --license-url https://creativecommons.org/licenses/by-nc/4.0/ --artist-url https://... [--album ... --album-url ... --label ...]
import argparse, json, os, re, subprocess, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
AUDIO = ROOT / 'site' / 'public' / 'assets' / 'audio'
PLAYLIST = AUDIO / 'playlist.json'
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
FFPROBE = os.environ.get('FFPROBE', str(Path(FFMPEG).with_name('ffprobe' + Path(FFMPEG).suffix)) if os.environ.get('FFMPEG') else 'ffprobe')

ap = argparse.ArgumentParser()
ap.add_argument('src')
ap.add_argument('--lrc'); ap.add_argument('--id'); ap.add_argument('--title'); ap.add_argument('--artist')
ap.add_argument('--artist-url', default=''); ap.add_argument('--album', default=''); ap.add_argument('--label', default='')
ap.add_argument('--album-url', default=''); ap.add_argument('--license', default=''); ap.add_argument('--license-url', default='')
ap.add_argument('--bitrate', default='96k'); ap.add_argument('--gain', default='-16dB')
a = ap.parse_args()
src = Path(a.src)

tags = json.loads(subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format_tags', '-of', 'json', str(src)], capture_output=True, text=True, encoding='utf8').stdout or '{}').get('format', {}).get('tags', {})
tags = {k.lower(): v for k, v in tags.items()}
title = a.title or tags.get('title') or src.stem
artist = a.artist or tags.get('artist') or ''
album = a.album or tags.get('album') or ''
slug = a.id or re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', f'{artist} {title}').encode('ascii', 'ignore').decode().lower()).strip('-')[:60] or 'song'

# audio
mp3 = AUDIO / f'{slug}.mp3'
subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', str(src), '-vn', '-map_metadata', '-1', '-af', f'volume={a.gain}', '-ac', '2', '-ar', '44100',
                '-c:a', 'libmp3lame', '-b:a', a.bitrate, str(mp3)], check=True)
dur = float(subprocess.run([FFPROBE, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(mp3)], capture_output=True, text=True).stdout.strip() or 0)

# lyrics, without Chinese translation lines
lrc_src = Path(a.lrc) if a.lrc else src.with_suffix('.lrc')
has_lrc = False
if lrc_src.exists():
    raw = lrc_src.read_bytes()
    for enc in ('utf-8-sig', 'gb18030', 'shift_jis', 'utf-16'):
        try: text = raw.decode(enc); break
        except UnicodeDecodeError: continue
    KANA = re.compile(r'[\u3040-\u30ff]'); HAN = re.compile(r'[\u4e00-\u9fff]')
    out, seen, dropped = [], set(), 0
    for line in text.splitlines():
        m = re.match(r'^((?:\[\d+:\d+(?:\.\d+)?\])+)(.*)$', line.strip())
        if not m: continue
        stamps, words = m.group(1), m.group(2).strip()
        if not words: continue
        if HAN.search(words) and not KANA.search(words): dropped += 1; continue          # Chinese only: a translation
        if stamps in seen and not KANA.search(words): dropped += 1; continue           # second line at the same time
        seen.add(stamps); out.append(stamps + words)
    (AUDIO / f'{slug}.lrc').write_text('\n'.join(out) + '\n', 'utf8')
    has_lrc = bool(out)
    print(f'lyrics: {len(out)} lines kept, {dropped} translation lines dropped')

# beats
subprocess.run([sys.executable, '-I', str(ROOT / 'site' / 'tools' / 'beats.py'), str(mp3), str(AUDIO / f'{slug}.beats.json')], check=True,
               env={**os.environ, 'FFMPEG': FFMPEG})

# playlist
pl = json.loads(PLAYLIST.read_text('utf8')) if PLAYLIST.exists() else {'tracks': []}
entry = {'id': slug, 'title': title, 'artist': artist, 'artistUrl': a.artist_url, 'album': album, 'label': a.label, 'albumUrl': a.album_url,
         'license': a.license, 'licenseUrl': a.license_url, 'lyrics': has_lrc, 'duration': round(dur, 1)}
pl['tracks'] = [t for t in pl.get('tracks', []) if t.get('id') != slug] + [entry]
PLAYLIST.write_text(json.dumps(pl, ensure_ascii=False, indent=2) + '\n', 'utf8')
print(f'{slug}: {mp3.stat().st_size / 1e6:.1f} MB, {dur:.0f} s, playlist now {len(pl["tracks"])} songs')
if not a.license: print('warning: no licence given; fill it in playlist.json before publishing')
