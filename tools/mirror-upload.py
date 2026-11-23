# SPDX-License-Identifier: GPL-3.0-or-later
"""Puts MeguLit's runtime packs on ModelScope and Hugging Face, so mainland players get two more download sources
(ModelScope's own Aliyun CDN in mainland China, and hf-mirror.com in front of Hugging Face).

Both are free; each needs the owner's own account and an access token (never stored by this script):
  ModelScope:   https://modelscope.cn/my/myaccesstoken   ->  set MODELSCOPE_TOKEN
  Hugging Face: https://huggingface.co/settings/tokens (write)  ->  set HF_TOKEN
  pip install -U modelscope huggingface_hub

  python -I tools/mirror-upload.py --namespace <account> [--only modelscope|hf] [--dir <folder with the zips>]

What it does, per pack in setup/runtime.json that is MeguLit's own file (base, reading, voice, runtime-dump):
  1. takes the zip from --dir, or downloads it from dl.megulit.com (then GitHub), and checks size + SHA-256
  2. creates the public repository <namespace>/MeguLit-runtime (model type) if it is not there yet
  3. uploads it as <release tag>/<file name>, the same path the {tag}/{file} templates in runtime.json use
  4. downloads the first and last MB back through the public URL (ModelScope, hf-mirror.com) and compares them
  5. prints the runtime.json "mirrors" entries to switch on (remove "off": true), with the namespace filled in
Nothing in the repository is changed by this script; the switch is one reviewed edit of setup/runtime.json.
"""
import argparse, hashlib, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWN = 'https://github.com/ilynthn/MeguLit/releases/download/'
REPO = 'MeguLit-runtime'
UA = {'User-Agent': 'MeguLit-mirror-upload'}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 20), b''):
            h.update(block)
    return h.hexdigest().upper()


def fetch(url, dest):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as res, open(dest + '.part', 'wb') as out:
        while True:
            block = res.read(1 << 20)
            if not block:
                break
            out.write(block)
    os.replace(dest + '.part', dest)


def get_range(url, start, end):
    req = urllib.request.Request(url, headers={**UA, 'Range': 'bytes=%d-%d' % (start, end)})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read()


def local_zip(pack, folder):
    url = pack['urls'][0]
    tag, name = url.split('/')[-2], url.split('/')[-1]
    path = os.path.join(folder, name)
    if not (os.path.exists(path) and os.path.getsize(path) == pack['size'] and sha256(path) == pack['sha256'].upper()):
        for src in ('https://dl.megulit.com/files/%s/%s' % (tag, name), url):
            try:
                print('  downloading', src)
                fetch(src, path)
                if os.path.getsize(path) == pack['size'] and sha256(path) == pack['sha256'].upper():
                    break
                print('  wrong file from', src)
            except Exception as e:  # next source
                print('  failed', src, e)
        else:
            print('  SKIPPED: could not get ' + name + ' from any source')
            return None, tag, name
    return path, tag, name


def verify(url, path, size):
    with open(path, 'rb') as f:
        head = f.read(1 << 20)
        f.seek(max(0, size - (1 << 20)))
        tail = f.read()
    ok = get_range(url, 0, len(head) - 1) == head and get_range(url, max(0, size - (1 << 20)), size - 1) == tail
    print('  check', url, 'ok' if ok else 'MISMATCH')
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--namespace', help='ModelScope / Hugging Face account (or organization) name')
    ap.add_argument('--prepare', action='store_true', help='only download and check the zips (no account needed)')
    ap.add_argument('--only', choices=['modelscope', 'hf'])
    ap.add_argument('--dir', default=os.path.join('H:\\', 'MeguLit-Work', 'runtime-packs'))
    a = ap.parse_args()
    os.makedirs(a.dir, exist_ok=True)
    manifest = json.load(open(os.path.join(ROOT, 'setup', 'runtime.json'), encoding='utf-8-sig'))
    packs = [(k, p) for k, p in manifest['packs'].items() if p['urls'][0].startswith(OWN)]
    if a.prepare:
        for key, pack in packs:
            print(key, local_zip(pack, a.dir)[0] or 'missing')
        return
    if not a.namespace:
        sys.exit('--namespace is required')
    repo = a.namespace + '/' + REPO
    targets = [t for t in ('modelscope', 'hf') if a.only in (None, t)]

    ms = hf = None
    if 'modelscope' in targets:
        from modelscope.hub.api import HubApi
        token = os.environ.get('MODELSCOPE_TOKEN') or sys.exit('set MODELSCOPE_TOKEN')
        ms = HubApi()
        ms.login(token)
        try:
            ms.create_repo(repo, visibility='public', repo_type='model', exist_ok=True)
        except TypeError:  # older SDK
            ms.create_repo(repo, visibility='public')
    if 'hf' in targets:
        from huggingface_hub import HfApi
        token = os.environ.get('HF_TOKEN') or sys.exit('set HF_TOKEN')
        hf = HfApi(token=token)
        hf.create_repo(repo, repo_type='model', private=False, exist_ok=True)

    ok = True
    for key, pack in packs:
        print(key)
        path, tag, name = local_zip(pack, a.dir)
        if not path:
            continue
        rel = tag + '/' + name
        if ms:
            ms.upload_file(path_or_fileobj=path, path_in_repo=rel, repo_id=repo, commit_message='runtime ' + rel)
            ok &= verify('https://modelscope.cn/models/%s/resolve/master/%s' % (repo, rel), path, pack['size'])
        if hf:
            hf.upload_file(path_or_fileobj=path, path_in_repo=rel, repo_id=repo, commit_message='runtime ' + rel)
            ok &= verify('https://huggingface.co/%s/resolve/main/%s' % (repo, rel), path, pack['size'])
            ok &= verify('https://hf-mirror.com/%s/resolve/main/%s' % (repo, rel), path, pack['size'])
    print()
    print('setup/runtime.json "mirrors": in these entries put %s in place of <ns> and drop "off": true' % a.namespace)
    for m in manifest.get('mirrors', []):
        if isinstance(m, dict) and m.get('off'):
            print('  ', m['url'].replace('<ns>', a.namespace))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
