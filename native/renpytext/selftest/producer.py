# SPDX-License-Identifier: GPL-3.0-or-later
# Inert glyph evidence for the production producer, no Ren'Py engine process.
import sys, os, json, runpy, types

host = runpy.run_path(os.path.join(os.path.dirname(__file__), 'host.py'), run_name='producer_host')
renpy, store, Render, Text, Matrix, nvl_show, say_show, state = host['install_fakes']()
out = []
sys._megulit_renpy_sink = out.append
sys._megulit_renpy_hide = lambda: False
sys._megulit_renpy_ctl = os.path.join(os.path.dirname(__file__), 'no-producer-control.txt')
runpy.run_path(sys.argv[1], run_name='producer_script')
core = sys._megulit_renpy

def run(name, rows, missing=(), version=None, vertical=False, rtl=False, paragraphs=True):
    renpy.version_tuple = version or (8, 4, 0, 25071206)
    renpy.config.rtl = rtl
    text = Text(name, 24, [name])
    text.style.vertical = vertical
    lines, source = [], []
    for row_index, row in enumerate(rows):
        glyphs = []
        for index, (ch, kind) in enumerate(row):
            # The reading is deliberately larger than its base. Height must not decide ruby roles.
            glyphs.append(types.SimpleNamespace(character=ord(ch), ruby=kind, x=index*48, y=0,
                                                advance=48, width=48, ascent=96 if kind in (2,3) else 8, rtl=False))
        source.append(glyphs)
        lines.append(types.SimpleNamespace(y=row_index*68, height=68,
                                           glyphs=[g for i,g in enumerate(glyphs) if (row_index,i) not in missing]))
    text._layout = types.SimpleNamespace(lines=lines, xoffset=0, yoffset=0, unscale_pair=lambda x,y:(x/2,y/2))
    if paragraphs:
        text._layout.paragraph_glyphs=source
    state['tree']=Render(text)
    before=len(out)
    renpy.character.display_say(None,name,say_show)
    records=[x for x in out[before:] if x.startswith('ToMe_CHARS ')]
    assert len(records)==1, records
    return {'name':name, 'wire':records[0]}

cases = [
    run('explicit rb rt', [[('漢',1),('字',1),('か',2),('ん',2),('じ',2),('。',0)]]),
    run('implicit rt and art', [[('漢',0),('か',2),('ん',2),('字',0),('じ',3)]]),
    run('only alt and base', [[('漢',1),('字',1),('か',3),('ん',3),('じ',3)]]),
    run('repeated base', [[('漢',0),('字',0),(' ',0),('漢',1),('字',1),('べ',2),('つ',2)]]),
    run('supplementary and newline', [[('😀',0),(' ',0),('漢',0)], [('漢',1),('字',1),('よ',2),('み',2)]]),
    run('supplementary reading', [[('漢',1),('𠮷',2)]]),
    run('consecutive ruby spans', [[('漢',1),('か',2),('ん',2),('字',1),('じ',2)]]),
    run('orphan top', [[('か',2),('ん',2),('本',0)]]),
    run('hidden base no guessing', [[('漢',1),('字',1),('か',2),('ん',2),('じ',2)]], missing=((0,1),)),
    run('omitted separating space', [[('漢',1),(' ',0),('字',1),('じ',2)]], missing=((0,1),)),
    run('same base two readings', [[('漢',1),('か',2),('ん',2),('べ',3),('つ',3)]]),
    run('reading control', [[('漢',1),('\x1f',2)]]),
    run('reading surrogate', [[('漢',1),('\ud800',2)]]),
    run('reading too long', [[('漢',1)]+[('あ',2)]*161]),
    run('base too long', [[('漢',1)]*81+[('あ',2)]]),
    run('unknown version', [[('漢',1),('か',2)]], version=(8,5,0,1)),
    run('no paragraph identities', [[('漢',1),('か',2)]], paragraphs=False),
    run('vertical unverified', [[('漢',1),('か',2)]], vertical=True),
    run('rtl unverified', [[('漢',1),('か',2)]], rtl=True),
    run('ordinary byte format', [[('本',0),('文',0)]]),
]

limits = {
    '64 accepted':bool(core.ruby_wire([(i,1,'あ') for i in range(64)],64)),
    '65 omitted':core.ruby_wire([(i,1,'あ') for i in range(65)],65)=='',
    '8192 token bounded':core.ruby_wire([(i,1,'あ'*160) for i in range(64)],64)=='',
    'negative omitted':core.ruby_wire([(-1,1,'あ')],2)=='',
    'overlap omitted':core.ruby_wire([(0,2,'あ'),(1,1,'い')],2)=='',
    'out of bounds omitted':core.ruby_wire([(1,2,'あ')],2)=='',
    'zero length omitted':core.ruby_wire([(0,0,'あ')],2)=='',
    '160 accepted':bool(core.ruby_wire([(0,1,'あ'*160)],1)),
    '80 base accepted':bool(core.ruby_wire([(0,80,'あ')],80)),
}

# Native readings survive whitespace removal during opt-in embedding; injected readings are not relabelled as game data.
text=Text('embed source',24,['dummy'])
text._layout=types.SimpleNamespace(lines=[], paragraph_glyphs=[])
core.say('embed source',say_show)
c=core.cur
c.update(d=text,text=' 漢 字',native_text=' 漢 字',native_ruby=[(1,3,'かんじ')])
core.cfg={'roles':0,'embed':1,'zh':0}
core.emb={'漢字': ([(0,2,'べつ')], '')}
core.draw_embed(c)
embed={'native':c.get('embedded_native_ruby'), 'text':text.text_parameter}
assert core.report(text,c,0,0,None)
embed['wire']=out[-1]
sys.stdout.write(json.dumps({'scope':'inert producer, no game', 'cases':cases,'limits':limits,'embed':embed}, ensure_ascii=True))
