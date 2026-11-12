# SPDX-License-Identifier: GPL-3.0-or-later
# 2026-11-12 (user: a switch that keeps R18 pictures off the card back). Rates a picture with the anime rating models of
# deepghs/anime_rating (MIT), on the CPU with onnxruntime: the small mobilenetv3 first; a picture it leans to call safe is
# checked again by caformer_s36_plus, which caught every H scene in a 40-picture sample where the small one let 5 through.
# Preprocessing as the models' own imgutils: RGB, resized to 384x384 (bilinear), (x / 255 - 0.5) / 0.5, NCHW.
# Usage: python -I cg-rating.py <packages dir> <small.onnx> <large.onnx>, then one picture path per line on stdin; one JSON
# line per path on stdout: {"label":"safe"|"r15"|"r18","safe":p,"r15":p,"r18":p,"model":"small"|"large"} or {"error":...}.
import sys, json
if __name__ == '__main__' and len(sys.argv) > 3: sys.path.insert(0, sys.argv[1])
import numpy as np
import onnxruntime as ort
from PIL import Image

LABELS = ('safe', 'r15', 'r18')

def session(path):
    o = ort.SessionOptions(); o.intra_op_num_threads = 2; o.inter_op_num_threads = 1; o.log_severity_level = 3
    s = ort.InferenceSession(path, o, providers=['CPUExecutionProvider'])
    return s, s.get_inputs()[0].name

def encode(path):
    with Image.open(path) as im:
        im = im.convert('RGBA')
        bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im)
        x = np.asarray(bg.convert('RGB').resize((384, 384), Image.BILINEAR), dtype=np.float32)
    return ((x / 255.0 - 0.5) / 0.5).transpose(2, 0, 1)[None]

def scores(model, x):
    s, name = model
    y = np.asarray(s.run(None, {name: x})[0], dtype=np.float64).reshape(-1)[:3]
    if abs(y.sum() - 1) > 1e-3 or (y < 0).any():
        e = np.exp(y - y.max()); y = e / e.sum()
    return y

def main():
    small, large = session(sys.argv[2]), session(sys.argv[3])
    sys.stdout.write(json.dumps({'ready': True}) + '\n'); sys.stdout.flush()
    for line in sys.stdin:
        path = line.strip()
        if not path: continue
        try:
            x = encode(path); y = scores(small, x); used = 'small'
            if y[0] >= 0.3 or int(np.argmax(y)) == 0: y = scores(large, x); used = 'large'
            label = LABELS[int(np.argmax(y))]
            if label == 'safe' and (used != 'large' or y[0] < 0.5): label = 'r15'
            out = {k: round(float(v), 4) for k, v in zip(LABELS, y)}
            out['label'] = label; out['model'] = used
        except Exception as e:
            out = {'error': str(e)[:200]}
        sys.stdout.write(json.dumps(out) + '\n'); sys.stdout.flush()

if __name__ == '__main__': main()
