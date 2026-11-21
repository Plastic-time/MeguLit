// SPDX-License-Identifier: GPL-3.0-or-later
// engine-draw, Unity IL2CPP (docs/engine-draw-native.md): who set a text decides its role. The rules (framework method names),
// the method ranges (each method from its start to the next method start of the image) and the frame classification. No
// Windows calls, so the self-test (selftest/il2cppdraw.cpp) runs it on the fixture; tools/engine-sigs/il2cpp-text.cjs is the
// same in JavaScript and its RULES must be these patterns, in this order (the static test compares them).
#pragma once
#include <algorithm>
#include <cstdint>
#include <regex>
#include <string>
#include <vector>
namespace Il2cppDrawRoles {
struct Rule { const char *pattern; const char *role; };
// "Namespace.Class$$Method" (nested and compiler-generated types: "Outer.<Name>d__N$$MoveNext")
static const Rule Rules[] = {
  {R"(^Naninovel\.UI\.RevealableText\$\$(SetTextValue|set_Text)$)", "line"},
  {R"(^Naninovel\.UI\.AuthorName\w*Panel\$\$set_Text$)", "name"},
  {R"(^Naninovel\.UI\.RevealableTextPrinterPanel\$\$SetAuthorNameText$)", "name"},
  {R"(^Naninovel\.UI\.ChoiceHandlerButton\$\$)", "choice"},
  {R"(^Naninovel\.UI\.(RevealableTextPrinterPanel|UITextPrinterPanel)\$\$(SetMessages|AddMessage|AppendText|RevealMessages)$)", "line"},
  {R"(^Fungus\.Writer(\$\$Write$|\.<Write>d__\d+\$\$MoveNext$))", "line"},
  {R"(^Fungus\.SayDialog\$\$SetCharacterName$)", "name"},
  {R"(^Fungus\.MenuDialog\$\$AddOption$)", "choice"},
};
static const int RuleCount = sizeof(Rules) / sizeof(Rules[0]);
inline const char *RoleOf(const std::string &name) {
  static std::vector<std::regex> re; if (re.empty()) for (const auto &r : Rules) re.emplace_back(r.pattern, std::regex::ECMAScript);
  for (int i = 0; i < RuleCount; i++) if (std::regex_search(name, re[i])) return Rules[i].role;
  return nullptr;
}
struct Method { std::uint64_t start; std::string name; };
struct Range { std::uint64_t from, to; const char *role; };
// methods (any order) -> rule ranges sorted by start
inline std::vector<Range> Ranges(const std::vector<Method> &methods) {
  std::vector<std::uint64_t> starts; starts.reserve(methods.size());
  for (const auto &m : methods) starts.push_back(m.start);
  std::sort(starts.begin(), starts.end()); starts.erase(std::unique(starts.begin(), starts.end()), starts.end());
  std::vector<Range> out; std::vector<std::uint64_t> seen;
  for (const auto &m : methods) {
    const char *role = RoleOf(m.name); if (!role || std::find(seen.begin(), seen.end(), m.start) != seen.end()) continue;
    seen.push_back(m.start);
    auto it = std::upper_bound(starts.begin(), starts.end(), m.start);
    out.push_back({m.start, it != starts.end() ? *it : m.start + 1, role});
  }
  std::sort(out.begin(), out.end(), [](const Range &a, const Range &b) { return a.from < b.from; });
  return out;
}
struct Verdict { const char *role; std::uint64_t site; };
// frames: return addresses, innermost first; the first inside a range (start excluded: a return address is never a start)
inline Verdict Classify(const std::vector<Range> &rs, const std::uint64_t *frames, int n) {
  for (int i = 0; i < n; i++) {
    std::uint64_t f = frames[i];
    auto it = std::upper_bound(rs.begin(), rs.end(), f, [](std::uint64_t v, const Range &r) { return v < r.from; });
    if (it == rs.begin()) continue; --it;
    if (f > it->from && f < it->to) return {it->role, it->from};
  }
  return {"system", 0};
}
}
