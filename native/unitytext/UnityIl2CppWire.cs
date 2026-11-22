// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Text;
public static class UnityIl2CppWire {
 public const int MaxCharacters = 4000;
 public static bool ValidScope(string value) {
  if (value == null || value.Length != 32) return false;
  foreach (char c in value) if (!(c >= '0' && c <= '9') && !(c >= 'a' && c <= 'f')) return false;
  return true;
 }
 public static bool TryControl(string line, string scope, out bool on) {
  on = false;
  if (!ValidScope(scope)) return false;
  if (line == "SOURCE " + scope + " 1") { on = true; return true; }
  return line == "SOURCE " + scope + " 0";
 }
 public static string Packet(string scope, long seq, int pid, string birth, string stream, string kind, string text) {
  if (!ValidScope(scope) || seq < 1 || seq > 9007199254740991L || pid < 1 || text == null || text.Length > MaxCharacters || !Digits(birth, false) || !Digits(stream, true) || (kind != "hello" && kind != "full" && kind != "clear") || (kind != "full" && text.Length != 0)) throw new ArgumentException("invalid source packet");
  return "ToMe_UNITY il2cpp1 " + scope + "\t" + seq.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\t" + pid.ToString(System.Globalization.CultureInfo.InvariantCulture) + "\t" + birth + "\t" + stream + "\t" + kind + "\t" + Convert.ToBase64String(new UTF8Encoding(false, true).GetBytes(text));
 }
 static bool Digits(string value, bool hex) {
  if (String.IsNullOrEmpty(value) || value.Length > (hex ? 16 : 19)) return false;
  foreach (char c in value) if (!(c >= '0' && c <= '9') && !(hex && c >= 'a' && c <= 'f')) return false;
  return true;
 }
}
