import urllib.request,json,pathlib,hashlib,zipfile,io
root=pathlib.Path(r'E:/Apps/work/megulithook/atl')
channel=json.load(urllib.request.urlopen('https://aka.ms/vs/17/release/channel'))
item=next(i for i in channel['channelItems'] if i['id']=='Microsoft.VisualStudio.Manifests.VisualStudio')
manifest=json.load(urllib.request.urlopen(item['payloads'][0]['url']))
selected=[p for p in manifest['packages'] if p['id'].lower().startswith('microsoft.vc.14.44.') and '.atl.' in p['id'].lower() and ('headers' in p['id'].lower() or '.x64.' in p['id'].lower())]
for p in selected:
 if p.get('language') not in (None,'en-US'):continue
 print(p['id'])
 for payload in p.get('payloads',[]):
  data=urllib.request.urlopen(payload['url']).read()
  assert hashlib.sha256(data).hexdigest()==payload['sha256'].lower()
  with zipfile.ZipFile(io.BytesIO(data)) as z:
   for name in z.namelist():
    if name.startswith('Contents/') and not name.endswith('/'):
     out=root/pathlib.PurePosixPath(name).relative_to('Contents');assert out.resolve().is_relative_to(root.resolve())
     out.parent.mkdir(parents=True,exist_ok=True);out.write_bytes(z.read(name))
print('ATL downloaded and SHA-256 verified')
