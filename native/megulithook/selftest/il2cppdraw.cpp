/* engine-draw Unity IL2CPP roles (Il2cppDrawRoles.h) on the owner's two IL2CPP galgames (魔法少女ノ魔女裁判: Naninovel,
   海沙风云: Fungus; selftest/il2cppdraw-fixture.h, the same data as validation/fixtures/engine-sigs/il2cpp-text.json): the rule
   methods become the same ranges as in JavaScript, and the frame cases give the same role and site. Exit code = failures. */
#include "../Il2cppDrawRoles.h"
#include "il2cppdraw-fixture.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
static int Failures = 0;
static void Check(bool ok, const std::string &what) { printf("%s %s\n", ok ? "PASS" : "FAIL", what.c_str()); if (!ok) Failures++; }
int main() {
  for (const char *game : {"mahou-shoujo-no-majo-saiban", "haisha-fengyun"}) {
    std::vector<Il2cppDrawRoles::Method> ms; int rules = 0;
    for (const auto &m : Il2cppFixMethods) if (!strcmp(m.game, game)) { ms.push_back({m.start, m.name}); if (Il2cppDrawRoles::RoleOf(m.name)) rules++; }
    auto rs = Il2cppDrawRoles::Ranges(ms);
    Check((int)rs.size() == rules && rules > 0, std::string(game) + ": one range per rule method (" + std::to_string(rs.size()) + ")");
    bool ends = true; for (const auto &r : rs) if (r.to <= r.from) ends = false;
    Check(ends, std::string(game) + ": every range ends at the next method");
    for (const auto &c : Il2cppFixCases) {
      if (strcmp(c.game, game)) continue;
      auto v = Il2cppDrawRoles::Classify(rs, c.frames, c.n);
      char what[160]; snprintf(what, sizeof what, "%s: frames %llx.. -> %s", game, (unsigned long long)c.frames[0], c.role);
      Check(!strcmp(v.role, c.role) && v.site == c.site, what);
    }
  }
  Check(!strcmp(Il2cppDrawRoles::RoleOf("Fungus.Writer.<Write>d__81$$MoveNext"), "line") && !Il2cppDrawRoles::RoleOf("Fungus.Writer$$SetTextColor") && !strcmp(Il2cppDrawRoles::RoleOf("Naninovel.UI.AuthorNameTMProPanel$$set_Text"), "name"), "rule names");
  printf("il2cpp draw roles: %d failure(s)\n", Failures);
  return Failures;
}
