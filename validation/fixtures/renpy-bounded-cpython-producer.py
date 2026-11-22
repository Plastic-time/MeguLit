# SPDX-License-Identifier: GPL-3.0-or-later
"""Optional neutral fixture producer, never imports a real game or Ren'Py SDK."""
import base64
import collections
import hashlib
import json
import pickle
import pickletools
import sys
import types

if sys.argv[1:] == ["--defaultdict"]:
    fixtures = []
    for protocol in (2, 4, 5):
        for factory in (None, list):
            value = collections.defaultdict(factory, {"alpha": [1, 2], "empty": []})
            data = pickle.dumps(value, protocol=protocol)
            fixtures.append({"protocol": protocol, "factory": None if factory is None else "list",
                             "bytes": len(data), "base64": base64.b64encode(data).decode("ascii"),
                             "opcodes": sorted({op.name for op, _, _ in pickletools.genops(data)})})
    print(json.dumps({"python": sys.version,
                      "scope": "ordinary CPython defaultdict serializer with fixed neutral data, not RenPy compiler or game bytes",
                      "fixtures": fixtures}, indent=2))
    raise SystemExit(0)
if sys.argv[1:] == ["--revertable-dict"]:
    neutral_package = types.ModuleType("renpy")
    neutral_package.__path__ = []
    neutral_module = types.ModuleType("renpy.revertable")
    neutral_package.revertable = neutral_module
    sys.modules["renpy"] = neutral_package
    sys.modules["renpy.revertable"] = neutral_module

    class RevertableDict(dict):
        __module__ = "renpy.revertable"

    neutral_module.RevertableDict = RevertableDict
    fixtures = []
    for protocol in (2, 4, 5):
        for shape in ("empty", "items", "attributes", "cycle"):
            value = RevertableDict()
            if shape == "items":
                value.update({"alpha": [1, 2], 7: None, "empty": []})
            elif shape == "attributes":
                value["kind"] = "entry_only"
                for key in ("kind", "className", "entries", "state", "stateShape", "_clean", "__proto__"):
                    setattr(value, key, "attribute_only")
            elif shape == "cycle":
                shared = [1, 2]
                value["self"] = value
                value["first"] = shared
                value["second"] = shared
                value.link = value
            data = pickle.dumps(value, protocol=protocol)
            fixtures.append({"protocol": protocol, "shape": shape, "bytes": len(data),
                             "sha256": hashlib.sha256(data).hexdigest(),
                             "base64": base64.b64encode(data).decode("ascii"),
                             "opcodes": sorted({op.name for op, _, _ in pickletools.genops(data)})})
    print(json.dumps({"python": sys.version,
                      "scope": "ordinary CPython neutral dict subclass, not an imported RenPy class, compiler or game bytes; dumps only, no loads",
                      "fixtures": fixtures}, indent=2))
    raise SystemExit(0)
if sys.argv[1:] and sys.argv[1:] not in (["--pycode"], ["--pyexpr"]):
    raise SystemExit("Only optional --defaultdict, --pycode, --pyexpr or --revertable-dict is supported")

package = types.ModuleType("renpy")
package.__path__ = []
ast = types.ModuleType("renpy.ast")
package.ast = ast
sys.modules["renpy"] = package
sys.modules["renpy.ast"] = ast
if sys.argv[1:] == ["--pyexpr"]:
    astsupport = types.ModuleType("renpy.astsupport")
    package.astsupport = astsupport
    sys.modules["renpy.astsupport"] = astsupport

    class PyExpr(str):
        __module__ = "renpy.astsupport"

        def __new__(cls, text, *metadata):
            value = str.__new__(cls, text)
            value._fixture_args = (text, *metadata)
            return value

        def __reduce__(self):
            return (PyExpr, self._fixture_args)

    astsupport.PyExpr = PyExpr
    fixtures = []
    for protocol in (2, 4, 5):
        for length in (3, 4, 5, 6):
            args = ("neutral_condition", "synthetic.rpy", 12, 3, 0xffffffff, 17)[:length]
            data = pickle.dumps(PyExpr(*args), protocol=protocol)
            fixtures.append({"protocol": protocol, "argsLength": length, "bytes": len(data),
                             "base64": base64.b64encode(data).decode("ascii"),
                             "opcodes": sorted({op.name for op, _, _ in pickletools.genops(data)})})
    print(json.dumps({"python": sys.version,
                      "scope": "ordinary CPython fake str-subclass reductions, not RenPy compiler or game bytes",
                      "fixtures": fixtures}, indent=2))
    raise SystemExit(0)
if sys.argv[1:] == ["--pycode"]:
    PyCode = type("PyCode", (), {"__module__": "renpy.ast", "__getstate__": lambda self: self._fixture_state})
    ast.PyCode = PyCode
    fixtures = []
    for protocol in (2, 4, 5):
        for length in (4, 5, 6, 7):
            state = (1, "neutral_value = 1", ("synthetic.rpy", 12), ("exec", "eval", "single", "exec")[length - 4], 3, 0xffffffff, 17)[:length]
            value = PyCode()
            value._fixture_state = state
            data = pickle.dumps(value, protocol=protocol)
            fixtures.append({"protocol": protocol, "stateLength": length, "bytes": len(data),
                             "base64": base64.b64encode(data).decode("ascii"),
                             "opcodes": sorted({op.name for op, _, _ in pickletools.genops(data)})})
    print(json.dumps({"python": sys.version,
                      "scope": "ordinary CPython serializer with neutral fake PyCode __getstate__ tuples, not RenPy compiler or game bytes",
                      "fixtures": fixtures}, indent=2))
    raise SystemExit(0)
Say = type("Say", (), {"__module__": "renpy.ast", "__slots__": ("who", "what")})
Translate = type("Translate", (), {"__module__": "renpy.ast", "__slots__": ("identifier", "language", "block")})
ast.Say = Say
ast.Translate = Translate
say = Say()
say.who = None
say.what = "Synthetic oracle text"
translation = Translate()
translation.identifier = "intro_abcdef"
translation.language = None
translation.block = [say]
fixtures = []
for protocol in (2, 4, 5):
    data = pickle.dumps(({"version": 1}, [translation]), protocol=protocol)
    fixtures.append({"protocol": protocol, "bytes": len(data),
                     "base64": base64.b64encode(data).decode("ascii"),
                     "opcodes": sorted({op.name for op, _, _ in pickletools.genops(data)})})
print(json.dumps({"python": sys.version,
                  "scope": "ordinary CPython serializer with synthetic inert fake classes, not RenPy compiler",
                  "fixtures": fixtures}, indent=2))
