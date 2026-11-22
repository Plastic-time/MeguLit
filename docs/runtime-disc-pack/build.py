"""Repack pinned upstream inputs without executing or installing any WinCDEmu code."""
import argparse, hashlib, io, json, lzma, pathlib, struct, tarfile, zipfile
SHA = {
 'PortableWinCDEmu-4.0.exe': 'c11fd7daa78fb946512f0f7c9ad26247192a6d556819bc73fc22f09007321d6d',
 'WinCDEmu-4.1.exe': 'c47763631d20120057766f2f71f781bf958e22712da4ac933b21db0d615dc93c',
 'source.zip': 'db3a68d7b89b7cdf26540d9d0f4e8287e40b0bc2039ea8b338f83b7c1d39337a',
}
BATCH = {'batchmnt.exe': (810496,105984,'c694d42d19daa784687b9146d19b7797b937e151a8aa7155904f54a1a6fd7a84'),
 'batchmnt64.exe': (916480,130048,'4a363e27b849a994250e6f2e4c9b4dd56f70f7cf9ff78375b3ee23244f1f9b6e')}

def digest(b): return hashlib.sha256(b).hexdigest()

def extract(installer):
 if digest(installer)!=SHA['WinCDEmu-4.1.exe']: raise ValueError('INSTALLER_HASH')
 base=164271
 if installer[base:base+8]!=b'BZSARC\0\0': raise ValueError('ARCHIVE_MAGIC')
 sections=[]
 # Exact known installer only, not a general BZSARC parser or an executable SFX launcher
 for at,prefix,offset,expanded,packed in [(31,12,191,3072,795),(71,0,998,2032,457),(111,16,1455,4066614,1277200)]:
  if installer[base+at:base+at+4]!=b'LZMA': raise ValueError('SECTION_MAGIC')
  if struct.unpack_from('<I',installer,base+at+12)[0]!=prefix: raise ValueError('PREFIX')
  if struct.unpack_from('<QQQ',installer,base+at+16)!=(offset,expanded,packed): raise ValueError('SECTION_BOUNDS')
  start=base+offset+prefix
  if installer[start:start+5]!=b'\x5d\0\0\x80\0': raise ValueError('LZMA_PROPERTIES')
  decoder=lzma.LZMADecompressor(format=lzma.FORMAT_RAW,filters=[{'id':lzma.FILTER_LZMA1,'dict_size':8388608,'lc':3,'lp':0,'pb':2}])
  raw=decoder.decompress(installer[start+5:start+packed],max_length=expanded+1)
  # This upstream raw stream is length-delimited, without an EOS marker
  if len(raw)!=expanded: raise ValueError('SECTION_SIZE')
  sections.append(raw)
 meta,names,data=sections
 if len(meta)!=64*48: raise ValueError('DIRECTORY_COUNT')
 offset=0; entries=[];result={}
 for i in range(64):
  name,parent,*rest=struct.unpack_from('<IIQQQIIQ',meta,i*48)
  pos=name*2; end=pos
  while end+1<len(names) and names[end:end+2]!=b'\0\0': end+=2
  if end+1>=len(names): raise ValueError('NAME_BOUNDS')
  name=names[pos:end].decode('utf-16le');size=rest[-1]
  if parent!=0xffffffff and parent>=i: raise ValueError('PARENT')
  if offset+size>len(data): raise ValueError('FILE_BOUNDS')
  entries.append({'name':name,'parent':parent,'offset':offset,'size':size})
  if name in BATCH:
   want_offset,want_size,want_sha=BATCH[name]; raw=data[offset:offset+size]
   if parent!=0xffffffff or (offset,size)!=(want_offset,want_size) or digest(raw)!=want_sha: raise ValueError('BATCH_IDENTITY')
   result[name]=raw
  offset+=size
 if offset!=len(data) or set(result)!=set(BATCH): raise ValueError('DIRECTORY_TOTAL')
 return result,entries

def main():
 a=argparse.ArgumentParser();a.add_argument('inputs',type=pathlib.Path);a.add_argument('output',type=pathlib.Path);args=a.parse_args()
 files={name:(args.inputs/name).read_bytes() for name in SHA}
 for name,want in SHA.items():
  if digest(files[name])!=want: raise ValueError('INPUT_HASH '+name)
 batches,entries=extract(files['WinCDEmu-4.1.exe']);files.update(batches)
 source_receipts=json.loads((args.inputs/'sources-receipt.json').read_text())
 for src in source_receipts:
  b=(args.inputs/src['name']).read_bytes()
  if digest(b)!=src['sha256']: raise ValueError('SOURCE_HASH')
  files['sources/'+src['name']]=b
 files['sources/WinCDEmu-v4.1.zip']=files.pop('source.zip')
 cdr=json.loads((args.inputs/'cdrtools-receipt.json').read_text());b=(args.inputs/'cdrtools-3.01a25.tar.bz2').read_bytes()
 if digest(b)!=cdr['sha256']: raise ValueError('CDRTOOLS_HASH')
 files['sources/cdrtools-3.01a25.tar.bz2']=b
 with tarfile.open(fileobj=io.BytesIO(b),mode='r:bz2') as t:
  for name in ['COPYING','mkisofs/COPYING','GPL-2.0.txt','CDDL.Schily.txt','LGPL-2.1.txt']:
   files['LICENSES/cdrtools-'+name.replace('/','-')]=t.extractfile('cdrtools-3.01/'+name).read(32768)
 source=zipfile.ZipFile(io.BytesIO(files['sources/WinCDEmu-v4.1.zip']))
 files['LICENSES/WinCDEmu-LGPL-3.0.txt']=source.read('WinCDEmu-07e0924d51f6e7fdfb316143de810be085123c6d/LICENSE')
 files['LICENSES/GPL-3.0.txt']=(pathlib.Path(__file__).resolve().parents[2]/'LICENSE').read_bytes()
 for src in source_receipts:
  z=zipfile.ZipFile(io.BytesIO(files['sources/'+src['name']]));name=next(n for n in z.namelist() if n.endswith('/LICENSE'));files['LICENSES/'+src['repo']+'.txt']=z.read(name)
 files['README.md']=pathlib.Path(__file__).with_name('README.md').read_bytes()
 evidence={'binarySources':'official sysprogs/WinCDEmu v4.1 assets; Portable 4.0 has its own source snapshot','sources':source_receipts,'cdrtools':cdr,'installerDirectory':entries,'inputs':SHA,'files':{k:{'size':len(v),'sha256':digest(v)} for k,v in files.items()},'driverTested':False,'mountTested':False}
 files['provenance.json']=json.dumps(evidence,ensure_ascii=True,indent=2).encode()
 files['pack.json']=json.dumps({'pack':'disc-mount','contract':1,'version':'4.1-1','driversInstalled':False}).encode()
 args.output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(args.output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for name,b in sorted(files.items()):
   info=zipfile.ZipInfo(name,(2026,11,22,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;z.writestr(info,b)
 result={'path':str(args.output),'size':args.output.stat().st_size,'unpacked':sum(map(len,files.values())),'sha256':digest(args.output.read_bytes()),'files':list(files),'directoryCount':len(entries)}
 args.output.with_suffix('.receipt.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
if __name__=='__main__': main()
