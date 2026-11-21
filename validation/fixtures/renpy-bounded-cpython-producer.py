# SPDX-License-Identifier: GPL-3.0-or-later
"""Optional neutral fixture producer, never imports a real game or Ren'Py SDK."""
import base64
import collections
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
if sys.argv[1:]:
    raise SystemExit("Only optional --defaultdict is supported")

package = types.ModuleType("renpy")
package.__path__ = []
ast = types.ModuleType("renpy.ast")
package.ast = ast
sys.modules["renpy"] = package
sys.modules["renpy.ast"] = ast
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
