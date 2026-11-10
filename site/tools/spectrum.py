# SPDX-License-Identifier: GPL-3.0-or-later
# The song's spectrum over time, for the page's equalisers and the spectrum scrollbar. The songs stream from SoundCloud
# or NetEase, whose audio a page cannot analyse (cross-origin), so it is measured here once from a local copy and played
# back in step with the song's position.
# 16 bands, log-spaced 40 Hz - 12 kHz, 24 frames a second; each band is scaled to its own range in this song (5th to
# 99.5th percentile of its level in dB), so every band moves.
# Output (binary): b'MSP1', bands (u8), fps (u8), then frames x bands bytes (0-255)
# Usage (from the repo root): python -I site/tools/spectrum.py <audio> <out.spec>   (add-song.py runs it for every song)
import os, subprocess, sys
from pathlib import Path
import numpy as np

SRC, OUT = Path(sys.argv[1]), Path(sys.argv[2])
FFMPEG = os.environ.get('FFMPEG', 'ffmpeg')
SR, FPS, N, BANDS = 22050, 24, 2048, 16

raw = subprocess.run([FFMPEG, '-v', 'error', '-i', str(SRC), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
x = np.frombuffer(raw, dtype=np.float32)
hop = SR / FPS
starts = (np.arange(int((len(x) - N) / hop) + 1) * hop).astype(np.int64)
win = np.hanning(N).astype(np.float32)
freqs = np.fft.rfftfreq(N, 1 / SR)
edges = np.geomspace(40, 12000, BANDS + 1)
idx = [np.where((freqs >= edges[i]) & (freqs < edges[i + 1]))[0] for i in range(BANDS)]
idx = [ix if len(ix) else np.array([np.argmin(abs(freqs - edges[i]))]) for i, ix in enumerate(idx)]
out = np.empty((len(starts), BANDS), dtype=np.float32)
for c in range(0, len(starts), 512):
    s = starts[c:c + 512]
    fr = np.stack([x[i:i + N] for i in s]) * win
    mag = np.abs(np.fft.rfft(fr, axis=1))
    out[c:c + len(s)] = np.stack([mag[:, ix].mean(axis=1) for ix in idx], axis=1)
db = 20 * np.log10(out + 1e-6)
lo, hi = np.percentile(db, 5, axis=0), np.percentile(db, 99.5, axis=0)
v = np.clip((db - lo) / np.maximum(hi - lo, 1e-3), 0, 1) ** 1.4
q = np.round(v * 255).astype(np.uint8)
OUT.write_bytes(b'MSP1' + bytes([BANDS, FPS]) + q.tobytes())
print(f'{OUT.name}: {len(q)} frames, {OUT.stat().st_size / 1024:.0f} KB')
