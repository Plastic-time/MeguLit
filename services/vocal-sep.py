# SPDX-License-Identifier: GPL-3.0-or-later
# E455 vocal separation for game-sound clips (player: "anki 上的语音有时候加上 bgm"). A recorded line is the game's whole
# sound, voice and music mixed; an MDX-Net vocal model (UVR-MDX-NET-Voc_FT, MIT, run with onnxruntime on the CPU) keeps
# the voice. The inference follows the public MDX-Net recipe (STFT 7680/1024, 3072 bins, 256 frames per chunk); STFT and
# resampling are done here with numpy so no other package is needed.
# Usage: python -I vocal-sep.py <packages dir> <model.onnx> <in.wav> <out.wav>   (16-bit PCM mono or stereo in, 16-bit mono out at the input rate)
import sys, wave
if __name__ == '__main__' and len(sys.argv) > 4: sys.path.insert(0, sys.argv[1])
import numpy as np

SR, N_FFT, HOP, DIM_F, DIM_T, COMPENSATE = 44100, 7680, 1024, 3072, 256, 1.021

def read_wav(path):
    with wave.open(path, 'rb') as w:
        ch, rate, width, n = w.getnchannels(), w.getframerate(), w.getsampwidth(), w.getnframes()
        if width != 2: raise SystemExit('16-bit PCM only')
        x = np.frombuffer(w.readframes(n), dtype='<i2').astype(np.float32) / 32768.0
    return x.reshape(-1, ch).mean(axis=1), rate

def write_wav(path, x, rate):
    y = np.clip(np.round(x * 32767.0), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate); w.writeframes(y.tobytes())

def resample(x, src, dst):
    if src == dst or len(x) == 0: return x
    # band-limited by an FFT: exact for the clip lengths used here
    n = int(round(len(x) * dst / src)); spec = np.fft.rfft(x); m = n // 2 + 1
    out = np.zeros(m, dtype=complex); k = min(m, len(spec)); out[:k] = spec[:k]
    return np.fft.irfft(out, n) * (n / len(x))

WINDOW = (0.5 - 0.5 * np.cos(2 * np.pi * np.arange(N_FFT) / N_FFT)).astype(np.float32)

def stft(x):  # x: (channels, samples) -> (channels, bins, frames), centered with reflect padding like torch.stft
    pad = N_FFT // 2; x = np.pad(x, ((0, 0), (pad, pad)), mode='reflect')
    frames = 1 + (x.shape[1] - N_FFT) // HOP
    idx = np.arange(N_FFT)[None, :] + HOP * np.arange(frames)[:, None]
    return np.fft.rfft(x[:, idx] * WINDOW, axis=2).transpose(0, 2, 1)

def istft(spec, length):  # spec: (channels, bins, frames)
    frames = spec.shape[2]; y = np.fft.irfft(spec.transpose(0, 2, 1), n=N_FFT, axis=2) * WINDOW
    out = np.zeros((spec.shape[0], N_FFT + HOP * (frames - 1)), dtype=np.float32); norm = np.zeros(out.shape[1], dtype=np.float32)
    for t in range(frames):
        out[:, t * HOP:t * HOP + N_FFT] += y[:, t]; norm[t * HOP:t * HOP + N_FFT] += WINDOW ** 2
    out /= np.maximum(norm, 1e-8); pad = N_FFT // 2
    return out[:, pad:pad + length]

def separate(session, mono):
    chunk = HOP * (DIM_T - 1); trim = N_FFT // 2; gen = chunk - 2 * trim
    x = np.stack([mono, mono]).astype(np.float32)
    pad = gen - x.shape[1] % gen if x.shape[1] % gen else 0
    x = np.concatenate([np.zeros((2, trim), np.float32), x, np.zeros((2, pad + trim), np.float32)], axis=1)
    name = session.get_inputs()[0].name; parts = []
    for start in range(0, x.shape[1] - 2 * trim, gen):
        seg = x[:, start:start + chunk]
        if seg.shape[1] < chunk: seg = np.pad(seg, ((0, 0), (0, chunk - seg.shape[1])))
        s = stft(seg)[:, :DIM_F, :DIM_T]
        inp = np.stack([s.real[0], s.imag[0], s.real[1], s.imag[1]])[None].astype(np.float32)  # (1, 4, 3072, 256): L re, L im, R re, R im
        o = session.run(None, {name: inp})[0][0]
        spec = np.zeros((2, N_FFT // 2 + 1, DIM_T), dtype=complex)
        spec[0, :DIM_F] = o[0] + 1j * o[1]; spec[1, :DIM_F] = o[2] + 1j * o[3]
        parts.append(istft(spec, chunk)[:, trim:trim + gen])
    v = np.concatenate(parts, axis=1)[:, :mono.shape[0]] * COMPENSATE
    return v.mean(axis=0)

def main():
    model, src, dst = sys.argv[2:5]
    import onnxruntime as ort
    opts = ort.SessionOptions(); import os; opts.intra_op_num_threads = max(2, (os.cpu_count() or 4) // 2); opts.log_severity_level = 3
    session = ort.InferenceSession(model, opts, providers=['CPUExecutionProvider'])
    mono, rate = read_wav(src)
    voice = resample(separate(session, resample(mono, rate, SR).astype(np.float32)), SR, rate)
    peak = float(np.max(np.abs(voice))) if voice.size else 0.0
    if peak > 0.99: voice = voice * (0.99 / peak)
    write_wav(dst, voice, rate)

if __name__ == '__main__':
    main()
