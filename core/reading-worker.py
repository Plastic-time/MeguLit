import sys, json, os
from pathlib import Path
sys.path.insert(0, os.environ.get('TOMOYO_READING_RUNTIME',str(Path(__file__).resolve().parent.parent / 'runtime' / 'reading')))
sys.stdin.reconfigure(encoding='utf-8')
sys.stdout.reconfigure(encoding='utf-8')
from sudachipy import dictionary, tokenizer
engine = dictionary.Dictionary(dict='full').create()
import fugashi, unidic_lite
unidic = fugashi.Tagger('-d "'+Path(unidic_lite.DICDIR).as_posix()+'"')

def normalized(s):
    return ''.join(chr(ord(c)-96) if 'ァ' <= c <= 'ヶ' else c for c in str(s or ''))

def pitches(text):
    result=[]; cursor=0
    for node in unidic(text):
        start=text.find(node.surface,cursor)
        if start<0: continue
        cursor=start+len(node.surface)
        feat=node.feature
        accents=[]
        for part in str(getattr(feat,'aType','')).split(','):
            if part.isdigit(): accents.append(int(part))
        result.append((start,cursor,normalized(getattr(feat,'kana','')),sorted(set(accents)),getattr(feat,'orthBase',''),getattr(feat,'kanaBase','')))
    return result
from importlib.metadata import version
print(json.dumps({'type':'ready','dictionary':'SudachiDict Full','dictionaryVersion':version('sudachidict-full'),'engineVersion':version('sudachipy')},ensure_ascii=False),flush=True)
def convert(m):
    return {'surface':m.surface(),'reading':m.reading_form(),'base_form':m.dictionary_form(),
            'normalized':m.normalized_form(),'pos':m.part_of_speech()[0],
            'grammar':list(m.part_of_speech()),'start':m.begin(),'end':m.end(),
            'source':'SudachiDict Full'}
for line in sys.stdin:
    request={}
    try:
        request=json.loads(line)
        text=request.get('text','')
        if not isinstance(text,str) or len(text)>4000: raise ValueError('Invalid sentence')
        result=[]
        pitch_tokens=pitches(text)
        for m in engine.tokenize(text,tokenizer.Tokenizer.SplitMode.C):
            token=convert(m)
            match=next((p for p in pitch_tokens if p[0]==token['start'] and p[1]==token['end'] and p[2]==normalized(token['reading'])),None)
            token['pitch']=match[3] if match else []
            token['lexeme']={'base':match[4],'reading':match[5]} if match else None
            token['pitch_source']='UniDic lite 2.1.2 / aType' if match else 'UniDic 无对应音调'
            token['reading_ambiguous']=m.is_oov()
            parts=list(m.split(tokenizer.Tokenizer.SplitMode.A))
            if len(parts)>1: token['subtokens']=[convert(p) for p in parts]
            result.append(token)
        print(json.dumps({'id':request['id'],'tokens':result},ensure_ascii=False),flush=True)
    except Exception:
        print(json.dumps({'id':request.get('id',0),'error':'Sudachi 本地分词失败，请检查 Full 组件安装状态'},ensure_ascii=False),flush=True)
