# SPDX-License-Identifier: GPL-3.0-or-later
# Executes the production script with an inert render host, never a game or COM.
import sys, os, json, runpy
host = runpy.run_path(os.path.join(os.path.dirname(__file__), 'host.py'), run_name='control_host')
fakes = host['install_fakes']()
renpy, store, Render, Text, Matrix, nvl_show, say_show, state = fakes
out = []
sys._megulit_renpy_sink = out.append
sys._megulit_renpy_hide = lambda: False
sys._megulit_renpy_ctl = sys.argv[2]
runpy.run_path(sys.argv[1], run_name='control_script')
core = sys._megulit_renpy
results = []
def check(name, fn):
    try:
        fn()
        results.append({'name': name, 'pass': True})
    except Exception as error:
        results.append({'name': name, 'pass': False, 'error': type(error).__name__ + ': ' + str(error)})
def control(data):
    if data is None:
        if os.path.isfile(sys.argv[2]): os.unlink(sys.argv[2])
    else:
        with open(sys.argv[2], 'wb') as stream: stream.write(data)
    core.ctl_at = 0
    core.ctl()
def permission(data, roles, embed):
    control(data)
    assert core.cfg['roles'] == roles, repr(core.cfg)
    assert core.cfg['embed'] == embed, repr(core.cfg)
for codec in ['utf-8', 'utf-8-sig', 'utf-16', 'utf-16le']:
    check('complete real transport '+codec, lambda codec=codec: permission('#cfg roles=1 embed=1 zh=1\r\n'.encode(codec),1,1))
bad = [
    ('roles numeric prefix', b'#cfg roles=10 embed=0 zh=1\n'),
    ('embed numeric prefix', b'#cfg roles=0 embed=10 zh=1\n'),
    ('duplicate roles', b'#cfg roles=0 roles=1 embed=0\n'),
    ('duplicate embed', b'#cfg roles=0 embed=0 embed=1\n'),
    ('duplicate identical flag', b'#cfg roles=1 roles=1 embed=1\n'),
    ('cfg inside body', b'body\n#cfg roles=1 embed=1\n'),
    ('cfg prefix', b'#cfgx roles=1 embed=1\n'),
    ('incomplete header', b'#cfg roles=1 embed=1'),
    ('nonascii header', '#cfg roles=1 embed=1 \u0100\n'.encode('utf-16')),
    ('NUL header', b'#cfg roles=1\x00 embed=1\n'),
    ('invalid utf8', b'#cfg roles=1 embed=1\xff\n'),
    ('second cfg cannot grant', b'#cfg roles=0 embed=0\n#cfg roles=1 embed=1\n'),
    ('missing/read failure', None),
]
for name,data in bad:
    check(name,lambda data=data: permission(data,0,0))
def embed_line(text):
    state['tree'] = Render(text)
    original = text.text_parameter
    key = original.replace(' ','')
    control(('#cfg roles=0 embed=1 zh=1\n'+key+'\t\tneutral target\n').encode('utf-16'))
    renpy.character.display_say(None,original,say_show)
    assert core.cur['emb'] == 2
    assert text.text_parameter != original
    return original
def revoke():
    text=Text('neutral literal',24,['neutral literal'])
    original=embed_line(text)
    control(b'#cfg roles=0 embed=0 zh=0\n')
    assert text.text_parameter == original
    assert core.cur['emb'] == 0 and core.cur['jp_n'] == 0
    control(b'#cfg roles=0 embed=1 zh=1\n')
    renpy.display.render.render_screen(state['tree'],1280,720)
    assert text.text_parameter == original
check('embed revoke restores and regrant cannot revive table',revoke)
def newer():
    text=Text('neutral literal',24,['neutral literal'])
    embed_line(text)
    text.set_text('engine newer')
    control(b'#cfg roles=0 embed=0 zh=0\n')
    assert text.text_parameter == 'engine newer'
check('revoke preserves newer engine text',newer)
def retry_restore():
    text=Text('retry literal',24,['retry literal'])
    original=embed_line(text)
    setter=text.set_text
    def failure(value): raise RuntimeError('controlled')
    text.set_text=failure
    control(b'#cfg roles=0 embed=0 zh=0\n')
    assert core.embedded and not core.cfg['embed']
    text.set_text=setter
    control(b'#cfg roles=0 embed=0 zh=0\n')
    assert text.text_parameter == original and not core.embedded
check('failed restoration retains ownership and retries',retry_restore)
def name_identity():
    name=Text('PeerName',20,['PeerName'])
    decoy=Text('PeerName',20,['PeerName'])
    what=Text('literal',24,['literal'])
    root=Render()
    root.blit(Render(decoy),(900,20))
    root.blit(Render(name),(50,450))
    root.blit(Render(what),(50,500))
    state['who']=name
    state['tree']=root
    control(b'#cfg roles=1 embed=0 zh=0\n')
    before=len(out)
    renpy.character.display_say('PeerName','literal',say_show)
    names=[x for x in out[before:] if ' role=name ' in x]
    assert len(names)==1 and 'box=50,450,' in names[0], names
    before=len(out)
    control(b'#cfg roles=0 embed=0 zh=0\n')
    assert any(' role=name ' in x and x.endswith('text=') for x in out[before:])
    assert any(' role=choice ' in x and x.endswith('text=') for x in out[before:])
    before=len(out)
    renpy.display.render.render_screen(root,1280,720)
    assert not any(' role=' in x and not x.endswith('text=') for x in out[before:])
    control(b'#cfg roles=1 embed=0 zh=0\n')
    renpy.display.render.render_screen(root,1280,720)
    assert any(' role=name ' in x and x.endswith('text=PeerName') for x in out[before:])
check('name widget identity, decoy, revoke and fresh grant',name_identity)
def menu_alias():
    root=Render()
    window=root.blit(Render(),(0,0))
    a,b=Text('same',24,['same']),Text('same',24,['same'])
    window.blit(Render(a),(100,200))
    window.blit(Render(b),(100,280))
    state['tree']=root
    control(b'#cfg roles=1 embed=0 zh=0\n')
    before=len(out)
    assert store.menu([('same',1),('same',2),('heading',None)]) == 1
    choices=[x for x in out[before:] if ' role=choice ' in x and not x.endswith('text=')]
    assert len(choices)==2, choices
    assert 'id=C:0 box=100,200,' in choices[0] and 'id=C:1 box=100,280,' in choices[1]
check('preinjection store alias and duplicate captions retain action identity',menu_alias)
sys.stdout.write(json.dumps({'scope':'actual script with inert host, not game','checks':len(results),'results':results}))
sys.exit(1 if any(not item['pass'] for item in results) else 0)
