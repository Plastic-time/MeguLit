# SPDX-License-Identifier: GPL-3.0-or-later
# Finds the drum hits in the background song so the page can move with them.
# Kicks: onsets in the low band (40-160 Hz); snares/claps: onsets in the 1.5-5 kHz band. Each hit gets a strength in
# (0, 1]. Output: site/public/assets/audio/megulit-bgm.beats.json {"kick": [[t, s], ...], "snare": [[t, s], ...], "bpm": n}
# Usage (from the repo root): python -I site/tools/beats.py [path/to/audio] (default: the site's own mp3)
import json, os, subprocess, sys
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'site' / 'public' / 'assets' / 'audio' / 'megulit-bgm.mp3'
OUT = ROOT / 'site' / 'public' / 'assets' / 'audio' / 'megulit-bgm.beats.json'
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
SR, HOP, N = 22050, 256, 2048

raw = subprocess.run([FFMPEG, '-v', 'error', '-i', str(SRC), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
win = np.hanning(N).astype(np.float32)
frames = 1 + (len(x) - N) // HOP
spec = np.empty((frames, N // 2 + 1), dtype=np.float32)
for i in range(frames):
    spec[i] = np.abs(np.fft.rfft(x[i * HOP:i * HOP + N] * win))
freqs = np.fft.rfftfreq(N, 1 / SR)
fps = SR / HOP

def onsets(lo, hi, min_gap, K=1.6):
    band = np.log1p(spec[:, (freqs >= lo) & (freqs < hi)] * 10).sum(axis=1)
    flux = np.maximum(0, np.diff(band, prepend=band[0]))
    # adaptive threshold: local median + a share of the local spread
    w = int(fps * .5)
    pad = np.pad(flux, w, mode='edge')
    med = np.array([np.median(pad[i:i + 2 * w]) for i in range(len(flux))])
    thr = med + K * np.std(flux)
    peaks, last = [], -1e9
    for i in range(1, len(flux) - 1):
        if flux[i] > thr[i] and flux[i] >= flux[i - 1] and flux[i] >= flux[i + 1] and (i - last) / fps >= min_gap:
            peaks.append(i); last = i
    if not peaks: return []
    s = flux[peaks]; s = s / np.percentile(s, 95)
    return [[round(i / fps, 3), round(float(min(1, v)), 2)] for i, v in zip(peaks, s)]

kick = onsets(40, 160, .3, 1.6)
snare = onsets(1500, 5000, .3, 2.2)
iv = np.diff([t for t, _ in kick])
iv = iv[(iv > .25) & (iv < 1.2)]
bpm = round(60 / float(np.median(iv)), 1) if len(iv) else 0
OUT.write_text(json.dumps({'bpm': bpm, 'kick': kick, 'snare': snare}, separators=(',', ':')), 'utf8')
print(f'{len(kick)} kicks, {len(snare)} snares, ~{bpm} bpm -> {OUT}')
