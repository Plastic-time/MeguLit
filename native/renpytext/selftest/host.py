# SPDX-License-Identifier: GPL-3.0-or-later
# Stand-in Ren'Py for native\MeguLitRenpy.py and MeguLitRenpy64.dll (E301); no game is involved.
# It builds the few renpy modules the script touches (render tree with render_of / children / reverse, Text with a
# drawable-resolution Layout of Lines and Glyphs, display_say, nvl_list, config) and plays one scenario:
#   1 NVL page start, two rows, dialogue tags ({w}) in what
#   2 same page, inside a zoomed (reverse 0.5) branch, ruby, the Text rebuilt from another string (drawn-text match)
#   3 ADV line (nvl=0)
#   4 NVL new page (nvl_clear: nvl_list holds only it)
# Modes:  host.py --sink <MeguLitRenpy.py>  run the script directly, print the reported lines as JSON (node test)
#         host.py --dll <MeguLitRenpy64.dll> load the DLL into this Python, read \\.\pipe\MeguLitRenpy-<pid>, PASS/FAIL
import sys, os, re, types, json, time, threading

EXPECTED = [
    'ToMe_RENPY begin line=1 same=0 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1280 sh=720 n=14',
    'ToMe_RENPY end line=1 same=0 nvl=1 x0=120 y0=80 x1=316 y1=118 size=28 sw=1280 sh=720 n=14 text=\u6625\u306e\u98a8\u304c\u5439\u3044\u305f\u3002\x1f\u4e8c\u884c\u76ee\u3067\u3059\u3002',
    'ToMe_RENPY begin line=2 same=1 nvl=1 x0=220 y0=250 x1=290 y1=250 size=14 sw=1280 sh=720 n=6',
    'ToMe_RENPY end line=2 same=1 nvl=1 x0=220 y0=250 x1=290 y1=250 size=14 sw=1280 sh=720 n=6 text=\u6f22\u5b57\u3092\u8aad\u3080\u3002',
    'ToMe_RENPY begin line=3 same=0 nvl=0 x0=0 y0=0 x1=0 y1=0 size=0 sw=0 sh=0 n=0',
    'ToMe_RENPY begin line=4 same=0 nvl=1 x0=120 y0=80 x1=232 y1=80 size=28 sw=1280 sh=720 n=5',
    'ToMe_RENPY end line=4 same=0 nvl=1 x0=120 y0=80 x1=232 y1=80 size=28 sw=1280 sh=720 n=5 text=\u65b0\u3057\u3044\u9801\u3002',
]


def install_fakes():
    def mod(name):
        m = types.ModuleType(name)
        sys.modules[name] = m
        return m
    renpy = mod('renpy')
    for n in ('display', 'text'):
        setattr(renpy, n, mod('renpy.' + n))
    render, textmod, extras = mod('renpy.display.render'), mod('renpy.text.text'), mod('renpy.text.extras')
    character, exports, config, store = mod('renpy.character'), mod('renpy.exports'), mod('renpy.config'), mod('store')
    renpy.display.render, renpy.text.text, renpy.text.extras = render, textmod, extras
    renpy.character, renpy.exports, renpy.config = character, exports, config
    config.screen_width, config.screen_height = 1280, 720
    store.nvl_list = []

    class Matrix(object):
        def __init__(self, k):
            self.k = k

        def transform(self, x, y):
            return x * self.k, y * self.k

        def __mul__(self, other):
            return Matrix(self.k * other.k)
    render.IDENTITY = Matrix(1.0)

    class Render(object):
        def __init__(self, *of):
            self.children, self.render_of, self.reverse, self.forward = [], list(of), render.IDENTITY, None

        def blit(self, child, pos):
            self.children.append((child, pos[0], pos[1], True, True))
            return child

        # gl2 (Ren'Py 7.4+ / 8): alpha goes through the renpy.alpha shader and its uniforms
        def add_shader(self, name):
            self.shaders = getattr(self, 'shaders', ()) + (name,)

        def add_uniform(self, name, value):
            if getattr(self, 'uniforms', None) is None:
                self.uniforms = {}
            self.uniforms[name] = value
    render.Render = Render
    render.models = True

    def render_screen(root, w, h):
        # Ren'Py renders each displayable into its own Render: the Text's (possibly wrapped) render() sets its alpha
        stack = [root]
        while stack:
            node = stack.pop()
            for d in node.render_of:
                r = d.render(w, h, 0, 0)
                node.alpha = r.alpha if (getattr(r, 'uniforms', None) or {}).get('u_renpy_alpha', 1.0) == 0.0 or r.alpha == 1.0 else 1.0
            stack.extend(e[0] for e in node.children)
        return root
    render.render_screen = render_screen

    class Glyph(object):
        def __init__(self, ch, x, ascent, ruby=0):
            self.character, self.x, self.y, self.ascent, self.ruby, self.width = ord(ch), x, 0, ascent, ruby, 0

    class Line(object):
        def __init__(self, y, height, glyphs):
            self.y, self.height, self.glyphs = y, height, glyphs

    class Layout(object):
        # Drawable resolution twice the virtual one, as on a 2x window: the script must unscale.
        oversample, xoffset, yoffset = 2.0, 0, 0

        def __init__(self, lines):
            self.lines = lines

        def unscale_pair(self, x, y):
            return x / self.oversample, y / self.oversample

    class Style(object):
        def __init__(self, size):
            self.size = size

    class Text(object):
        def __init__(self, what, size, rows, ruby=None):
            self.text_parameter, self.text, self.style = what, [what], Style(size)
            lines = []
            for r, row in enumerate(rows):
                glyphs = []
                for i, ch in enumerate(row):
                    glyphs.append(Glyph(ch, i * size * 2, size * 2, 1 if ruby else 0))
                if ruby and r == 0:
                    for i, ch in enumerate(ruby):
                        glyphs.append(Glyph(ch, i * size, size // 2, 2))
                glyphs.append(Glyph('\ufffc', len(row) * size * 2, size * 2))  # the click-to-continue mark
                lines.append(Line(r * (size + 10) * 2, (size + 10) * 2, glyphs))
            self._layout = Layout(lines)

        def get_layout(self):
            return self._layout

        def set_text(self, text):
            # engine-draw: Ren'Py lays the new text out again; here a row per paragraph, ruby readings and tags left out
            self.text_parameter, self.text = text, [text]
            plain = re.sub(r'\{rt\}.*?\{/rt\}', '', text)
            plain = re.sub(r'\{[^{}]*\}', '', plain.replace('{{', '\x00').replace('[[', '[')).replace('\x00', '{')
            size = self.style.size
            self._layout = Layout([Line(r * (size + 10) * 2, (size + 10) * 2, [Glyph(ch, i * size * 2, size * 2) for i, ch in enumerate(row)])
                                   for r, row in enumerate(plain.split('\n'))])
            self.set_calls = getattr(self, 'set_calls', []) + [text]

        def render(self, width, height, st, at):
            rv = Render()
            rv.alpha = 1.0
            return rv
    textmod.Text = Text

    def filter_text_tags(s, allow=None):
        return re.sub(r'\{[^}]*\}', '', s)
    extras.filter_text_tags = filter_text_tags

    class DialogueTextTags(object):
        def __init__(self, what):
            self.text = re.sub(r'\{(w|p|nw|fast)[^}]*\}', '', what)
    character.DialogueTextTags = DialogueTextTags

    def nvl_show_core(who, what):
        return None

    def say_show(who, what):
        return None
    state = {'tree': None}
    screenmod = mod('renpy.display.screen')
    screenmod.get_widget = lambda screen, ident: state.get('who') if (screen, ident) == ('say', 'who') else None
    screenmod.get_screen = lambda screen: state.get('choice_screen') if screen == 'choice' else None
    behaviormod = mod('renpy.display.behavior')
    class Button(object):
        def __init__(self, action):
            self.action = action
        def render(self, *args):
            result = Render()
            result.alpha = 1.0
            return result
    behaviormod.Button = Button

    def display_say(who, what, show_function, interact=True, *rest, **kw):
        show_function(who, what)
        # What Ren'Py's interaction does each frame: the interface lays out the screen, then draws it.
        for _ in range(2):
            renpy.display.render.render_screen(state['tree'], 1280, 720)
    character.display_say = display_say
    exports.display_say = display_say
    state['restarts'] = 0

    def restart_interaction():
        state['restarts'] += 1
    exports.restart_interaction = restart_interaction

    def display_menu(items, interact=True):
        entries = [types.SimpleNamespace(caption=caption, action=object()) for caption, value in items if value is not None]
        state['choice_screen'] = types.SimpleNamespace(scope={'items': entries})
        leaves = state['tree'].children[0][0].children
        for entry, leaf in zip(entries, leaves):
            leaf[0].render_of.insert(0, Button(entry.action))
        for _ in range(2):
            renpy.display.render.render_screen(state['tree'], 1280, 720)
        state['choice_screen'] = None
        return items[0][1]
    exports.display_menu = display_menu
    renpy.display_menu = display_menu
    store.menu = display_menu
    renpy.display_say = display_say
    return renpy, store, Render, Text, Matrix, nvl_show_core, say_show, state


def scenario(fakes):
    renpy, store, Render, Text, Matrix, nvl_show_core, say_show, state = fakes

    def screen(*texts):
        root = Render()
        window = root.blit(Render(), (100, 50))
        for t, pos, zoom in texts:
            node = window
            if zoom:
                node = window.blit(Render(), (100, 200))
                node.reverse = Matrix(zoom)
            node.blit(Render(t), pos)
        return root
    t1 = Text('\u6625\u306e\u98a8\u304c\u5439\u3044\u305f\u3002\u4e8c\u884c\u76ee\u3067\u3059\u3002', 28,
              ['\u6625\u306e\u98a8\u304c\u5439\u3044\u305f\u3002', '\u4e8c\u884c\u76ee\u3067\u3059\u3002'])
    store.nvl_list = [('a', 'x', {})]
    state['tree'] = screen((t1, (20, 30), None))
    renpy.character.display_say(None, '\u6625\u306e\u98a8\u304c\u5439\u3044\u305f\u3002{w}\u4e8c\u884c\u76ee\u3067\u3059\u3002', nvl_show_core)
    what2 = '{rb}\u6f22\u5b57{/rb}{rt}\u304b\u3093\u3058{/rt}\u3092\u8aad\u3080\u3002'
    t2 = Text('rebuilt by the screen', 28, ['\u6f22\u5b57\u3092\u8aad\u3080\u3002'], ruby='\u304b\u3093\u3058')
    store.nvl_list.append(('b', 'y', {}))
    state['tree'] = screen((t1, (20, 30), None), (t2, (40, 0), 0.5))
    renpy.exports.display_say(None, what2, nvl_show_core)
    # ADV line, MeguLit asks for the game's own text to be drawn invisible (text architecture 3)
    t3 = Text('\u666e\u901a\u306e\u53f0\u8a5e\u3002', 24, ['\u666e\u901a\u306e\u53f0\u8a5e\u3002'])
    state['tree'] = screen((t3, (60, 500), None))
    sys._megulit_renpy_hide = lambda: True
    renpy.character.display_say('Eileen', '\u666e\u901a\u306e\u53f0\u8a5e\u3002', say_show)
    nodes, stack = [], [state['tree']]
    while stack:
        nodes.append(stack.pop())
        stack.extend(e[0] for e in nodes[-1].children)
    state['alpha3'] = [n.alpha for n in nodes if t3 in n.render_of]
    sys._megulit_renpy_hide = lambda: False
    renpy.display.render.render_screen(state['tree'], 1280, 720)  # MeguLit stops asking: drawn again at once
    state['alpha3'] += [n.alpha for n in nodes if t3 in n.render_of]
    t4 = Text('\u65b0\u3057\u3044\u9801\u3002', 28, ['\u65b0\u3057\u3044\u9801\u3002'])
    store.nvl_list = [('c', 'z', {})]
    state['tree'] = screen((t4, (20, 30), None))
    renpy.display_say(None, '\u65b0\u3057\u3044\u9801\u3002', nvl_show_core)


def scenario_draw(fakes, ctl):
    renpy, store, Render, Text, Matrix, nvl_show_core, say_show, state = fakes
    with open(ctl, 'wb') as f:
        f.write(u'#cfg roles=1 embed=1 zh=1\r\n\u4eca\u65e5\u306f\u6674\u308c\t0:2:\u304d\u3087\u3046\t\u4eca\u5929\u6674\u6717\r\n'.encode('utf-16'))
    sys._megulit_renpy_ctl = ctl

    def screen(*texts):
        root = Render()
        window = root.blit(Render(), (100, 50))
        for t, pos in texts:
            window.blit(Render(t), pos)
        return root
    name = Text('Eileen', 20, ['Eileen'])
    state['who'] = name
    what = Text('\u4eca\u65e5\u306f\u6674\u308c', 24, ['\u4eca\u65e5\u306f\u6674\u308c'])
    state['tree'] = screen((name, (60, 440)), (what, (60, 500)))
    sys._megulit_renpy_hide = lambda: True
    renpy.character.display_say('Eileen', '\u4eca\u65e5\u306f\u6674\u308c', say_show)
    for _ in range(3):
        renpy.display.render.render_screen(state['tree'], 1280, 720)
    state['set_calls'] = getattr(what, 'set_calls', [])
    a, b = Text('\u306f\u3044', 24, ['\u306f\u3044']), Text('\u3044\u3044\u3048', 24, ['\u3044\u3044\u3048'])
    state['tree'] = screen((a, (400, 200)), (b, (400, 280)))
    renpy.exports.display_menu([('\u306f\u3044', 1), ('\u3044\u3044\u3048', 2), ('\u898b\u51fa\u3057', None)])


def run_sink_draw(script, ctl):
    fakes = install_fakes()
    out = []
    sys._megulit_renpy_sink = out.append
    src = open(script, 'rb').read().decode('utf-8')
    exec(compile(src, script, 'exec'), {'__name__': '__main__'})
    scenario_draw(fakes, ctl)
    out.append('HOST set_calls=%s restarts=%d' % (json.dumps(fakes[7].get('set_calls')), fakes[7].get('restarts')))
    sys.stdout.buffer.write(json.dumps(out).encode('utf-8'))
    return 0


def run_sink(script):
    fakes = install_fakes()
    out = []
    sys._megulit_renpy_sink = out.append
    src = open(script, 'rb').read().decode('utf-8')
    for _ in range(2):  # the DLL runs it again every two seconds: the second run must not wrap twice
        exec(compile(src, script, 'exec'), {'__name__': '__main__'})
    scenario(fakes)
    out.append('HOST alpha3=%s' % (fakes[7].get('alpha3'),))
    sys.stdout.buffer.write(json.dumps(out).encode('utf-8'))
    return 0


def run_dll(dll):
    import ctypes
    from ctypes import wintypes
    k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    k32.CreateNamedPipeW.restype = wintypes.HANDLE
    k32.CreateNamedPipeW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID]
    k32.ConnectNamedPipe.argtypes = [wintypes.HANDLE, wintypes.LPVOID]
    k32.ReadFile.argtypes = [wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID]
    pipe = k32.CreateNamedPipeW('\\\\.\\pipe\\MeguLitRenpy-%d' % os.getpid(), 1, 0, 1, 65536, 65536, 0, None)
    if pipe in (None, wintypes.HANDLE(-1).value):
        print('FAIL cannot create pipe')
        return 2
    got = []

    def reader():
        k32.ConnectNamedPipe(pipe, None)
        buf, n, rest = ctypes.create_string_buffer(65536), wintypes.DWORD(), b''
        while k32.ReadFile(pipe, buf, 65536, ctypes.byref(n), None) and n.value:
            rest += buf.raw[:n.value]
            while b'\n' in rest:
                line, rest = rest.split(b'\n', 1)
                got.append(line.decode('utf-8'))
    threading.Thread(target=reader, daemon=True).start()
    fakes = install_fakes()
    ctypes.WinDLL(os.path.abspath(dll))
    for _ in range(100):  # the DLL's worker finds this interpreter and runs the script on its own thread
        if getattr(sys, '_megulit_renpy', None) is not None:
            break
        time.sleep(0.1)
    else:
        print('FAIL the DLL never ran MeguLitRenpy.py')
        return 3
    scenario(fakes)
    time.sleep(3.5)  # a later run of the script (2 s period) must leave the wrappers as they are
    chars = [l for l in got if l.startswith('ToMe_CHARS ')]
    scenario_lines = [l for l in got if not l.startswith('ToMe_RENPY status ') and not l.startswith('ToMe_CHARS ')]
    if sorted(set(re.search(r' line=(\d+) ', l).group(1) for l in chars)) != ['1', '2', '3', '4']:
        print('FAIL char records %r' % chars)
        return 6
    status = [l for l in got if l.startswith('ToMe_RENPY status ')]
    if scenario_lines != EXPECTED:
        print('FAIL lines differ')
        for l in scenario_lines:
            print('  got ' + l.encode('unicode_escape').decode())
        return 4
    if not status or status[-1] != 'ToMe_RENPY status ok':
        print('FAIL status %r' % status)
        return 5
    print('PASS MeguLitRenpy DLL: found this Python, ran MeguLitRenpy.py under the GIL, wrapped display_say/render_screen once; '
          'NVL page lines with screen boxes, 2x drawable unscaled, zoom branch, ruby left out, ADV nvl=0, new page same=0; pipe protocol; no game attached')
    return 0


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--sink':
        sys.exit(run_sink(sys.argv[2]))
    if len(sys.argv) == 4 and sys.argv[1] == '--sink-draw':
        sys.exit(run_sink_draw(sys.argv[2], sys.argv[3]))
    if len(sys.argv) == 3 and sys.argv[1] == '--dll':
        sys.exit(run_dll(sys.argv[2]))
    print('usage: host.py --sink MeguLitRenpy.py | --dll MeguLitRenpy64.dll')
    sys.exit(1)
