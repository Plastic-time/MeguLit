// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLitUnityText.dll: text architecture ③ for Unity (Mono) games (docs/text-architecture.md). A BepInEx 5 plugin
// (BepInEx: LGPL-2.1, loaded through UnityDoorstop from MeguLit's per-game shadow folder, never the game's own folder).
// It hooks nothing: twice a second it looks at the game's live text components (TextMeshPro TMP_Text and uGUI Text,
// found by type name, so no TextMeshPro version is compiled in) and picks the dialogue one, the visible component
// whose text is the line MeguLit's text hook read (sent over the control socket as WANT), or, without one, the visible
// component with the most kana/kanji that changed last. Then, every frame:
//   - while MeguLit asks for it (HIDE 1) that one component is drawn at alpha 0 (TMP_Text.alpha / Graphic.color.a);
//     its text, layout, wrapping, typewriter and click wait stay the game's own. Its own alpha is restored the moment
//     MeguLit stops asking, the socket drops, or the dialogue moves to another component;
//   - each character's box is read from the laid-out mesh (TMP textInfo.characterInfo / TextGenerator verts), mapped
//     to screen pixels through the component's canvas camera, and reported as one ToMe_CHARS record when it changes.
// hidden=1 only when the alpha is still 0 at the end of the frame (a game that animates the colour itself wins and the
// line stays the game's). Nothing in the game's saves, PlayerPrefs or files is written. Protocol: core/text-paths.cjs.
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using BepInEx;
using UnityEngine;

[BepInPlugin("com.megulit.unitytext", "MeguLit Unity Text", "1.0.0")]
public class MeguLitUnityText : BaseUnityPlugin {
 // ---- control socket (127.0.0.1, port from MeguLitUnityText.port next to this DLL) ----------------------------------
 readonly object gate = new object();
 readonly Queue<string> outbox = new Queue<string>();
 volatile string wanted = "";
 volatile bool hideAsked, connected;
 Thread net;

 void Awake() {
  string dir = Path.GetDirectoryName(Info.Location);
  int port;
  string file = Path.Combine(dir, "MeguLitUnityText.port");
  if (!File.Exists(file) || !int.TryParse(File.ReadAllText(file).Trim(), out port)) { Logger.LogInfo("no MeguLit control port: idle"); enabled = false; return; }
  net = new Thread(() => Net(port)) { IsBackground = true, Name = "MeguLitUnityText" };
  net.Start();
  StartCoroutine(EndOfFrame());
 }

 void Send(string line) { lock (gate) { if (outbox.Count > 256) outbox.Dequeue(); outbox.Enqueue(line.Replace("\r", " ").Replace("\n", "\u001f")); } }

 void Net(int port) {
  while (true) {
   try {
    using (var client = new TcpClient()) {
     client.Connect("127.0.0.1", port);
     client.NoDelay = true;
     var stream = client.GetStream();
     connected = true;
     Send("ToMe_UNITY status ok unity=" + Application.unityVersion);
     var inbuf = new StringBuilder();
     var buf = new byte[8192];
     while (true) {
      while (client.Available > 0) {
       int n = stream.Read(buf, 0, buf.Length);
       if (n <= 0) throw new IOException("closed");
       inbuf.Append(Encoding.UTF8.GetString(buf, 0, n));
       string all = inbuf.ToString();
       int at;
       while ((at = all.IndexOf('\n')) >= 0) { Command(all.Substring(0, at).TrimEnd('\r')); all = all.Substring(at + 1); }
       inbuf.Length = 0; inbuf.Append(all);
      }
      string[] items = null;
      lock (gate) { if (outbox.Count > 0) { items = outbox.ToArray(); outbox.Clear(); } }
      if (items != null) { var data = Encoding.UTF8.GetBytes(string.Join("\n", items) + "\n"); stream.Write(data, 0, data.Length); }
      if (client.Client.Poll(0, SelectMode.SelectRead) && client.Available == 0) throw new IOException("closed");
      Thread.Sleep(15);
     }
    }
   } catch (Exception) {
    connected = false; hideAsked = false; KemcoControl(false);
    Thread.Sleep(1000);
   }
  }
 }

 void Command(string line) {
  if (line.StartsWith("HIDE ")) hideAsked = line.EndsWith("1");
  else if (line.StartsWith("WANT ")) wanted = line.Substring(5).Replace("\u001f", "\n");
  else if (line.StartsWith("DRAW ") || line.StartsWith("EMB ")) DrawCommand(line);
 }

 // ---- engine-draw (docs/engine-draw-protocol.md): roles and the in-game replacement ------------------------------------
 // DRAW roles=0|1 embed=0|1 zh=0|1 and EMB <sentence> TAB <start:len:reading|...> TAB <Chinese> come over the control socket.
 // roles: other visible texts are reported as UI items with their screen boxes: a name plate (Utage's message window
 // nameText field, Naninovel's author name, or an object named name / speaker / author), a choice (Utage AdvUguiSelection,
 // Naninovel ChoiceHandlerButton, any *Choice* / *Selection* component above it), a button (UnityEngine.UI.Button / Toggle
 // or any *Button component above it). Never changed, never hidden: the game keeps drawing them and taking their clicks.
 // embed: the dialogue component gets the replacement as its own text: TextMeshPro draws the ruby (<voffset><size=50%>
 // over its base, centred with <space>) and the Chinese as a smaller second paragraph; uGUI Text only the Chinese (no
 // ruby in its rich text). The game's own tags and line breaks stay. The record then holds the Japanese only, emb=1|2.
 volatile bool drawRoles, drawEmbed, drawZh = true;
 readonly Dictionary<string, string[]> embeds = new Dictionary<string, string[]>();
 readonly List<string> embedOrder = new List<string>();
 readonly HashSet<string> asked = new HashSet<string>();
 Component embComp; string embSet = "", lastRaw = ""; int embJp, embLevel, ui; float lastRawAt;
 readonly Dictionary<string, string> roleSig = new Dictionary<string, string>();
 PropertyInfo tmpMaxVisible, tmpOverflow; MethodInfo tmpForce; PropertyInfo uFontSize;

 void DrawCommand(string line) {
  if (line.StartsWith("DRAW ")) { drawRoles = line.Contains("roles=1"); drawEmbed = line.Contains("embed=1"); drawZh = !line.Contains("zh=0"); KemcoControl(KemcoFlag(line),KemcoFlag(line,"roles")); return; }
  var p = line.Substring(4).Split('\t'); if (p.Length < 2 || p[0].Length == 0) return;
  lock (embeds) {
   if (!embeds.ContainsKey(p[0])) embedOrder.Add(p[0]);
   embeds[p[0]] = new[] { p[1], p.Length > 2 ? p[2].Replace('\u001f', '\n') : "" };
   while (embedOrder.Count > 64) { embeds.Remove(embedOrder[0]); embedOrder.RemoveAt(0); }
  }
 }

 static float[] ScreenBox(Component c) {
  var rt = c.transform as RectTransform; if (rt == null) return null;
  var corners = new Vector3[4]; rt.GetWorldCorners(corners); var cam = CameraOf(c);
  Vector2 a = Screen2(cam, corners[0]), b = Screen2(cam, corners[2]);
  float x = Math.Min(a.x, b.x), w = Math.Abs(b.x - a.x), h = Math.Abs(b.y - a.y), top = Screen.height - Math.Max(a.y, b.y);
  return w > 0 && h > 0 ? new[] { x, top, w, h } : null;
 }
 static string RoleOf(Component c, string t) {
  bool button = false, name = false; Transform tr = c.transform;
  for (int d = 0; tr != null && d < 6; d++, tr = tr.parent) {
   foreach (var comp in tr.GetComponents<Component>()) {
    if (comp == null) continue; string n = comp.GetType().Name;
    if (n == "AdvUguiSelection" || n == "ChoiceHandlerButton" || n.IndexOf("Choice", StringComparison.Ordinal) >= 0 || n.IndexOf("Selection", StringComparison.Ordinal) >= 0) return "choice";
    if (n == "AuthorNamePanel" || n == "AuthorNameText") return "name";
    if (n.IndexOf("MessageWindow", StringComparison.Ordinal) >= 0) {
     foreach (var f in comp.GetType().GetFields(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)) {
      if (f.Name.IndexOf("name", StringComparison.OrdinalIgnoreCase) < 0) continue;
      object v = null; try { v = f.GetValue(comp); } catch { }
      var vc = v as Component; if (vc != null && vc.gameObject == c.gameObject) return "name";
     }
    }
    if (n == "Button" || n == "Toggle" || n.EndsWith("Button", StringComparison.Ordinal)) button = true;
   }
   string go = tr.gameObject.name.ToLowerInvariant();
   if (d <= 2 && t.Length <= 16 && (go.Contains("name") || go.Contains("speaker") || go.Contains("author"))) name = true;
  }
  return name ? "name" : button ? "button" : null;
 }
 void RoleScan(List<Component> list) {
  var groups = new Dictionary<string, List<KeyValuePair<string, float[]>>> { { "name", new List<KeyValuePair<string, float[]>>() }, { "choice", new List<KeyValuePair<string, float[]>>() }, { "button", new List<KeyValuePair<string, float[]>>() } };
  foreach (var c in list) {
   if (c == current) continue; string t = Norm(TextOf(c)); if (t.Length == 0 || t.Length > 40) continue;
   string role = RoleOf(c, t); if (role == null) continue; var box = ScreenBox(c); if (box == null) continue;
   groups[role].Add(new KeyValuePair<string, float[]>(t, box));
  }
  foreach (var g in groups) {
   var sig = new StringBuilder(); foreach (var it in g.Value) sig.Append(it.Key).Append('|').Append(F(it.Value[0])).Append(',').Append(F(it.Value[1])).Append(';');
   string old; roleSig.TryGetValue(g.Key, out old); string now = sig.ToString();
   if (old == now || old == null && now.Length == 0) continue; roleSig[g.Key] = now; ui++;
   string head = "ToMe_CHARS engine=unity line=" + ui + " hidden=0 sw=" + Screen.width + " sh=" + Screen.height + " vx=0 vy=0 vw=" + Screen.width + " vh=" + Screen.height + " n=0 rects= role=" + g.Key;
   if (g.Value.Count == 0) { Send(head + " id=U" + g.Key + ": box=0,0,0,0 text="); continue; }
   for (int i = 0; i < g.Value.Count; i++) { var b = g.Value[i].Value; Send(head + " id=U" + g.Key + ":" + i + " box=" + F(b[0]) + "," + F(b[1]) + "," + F(b[2]) + "," + F(b[3]) + " text=" + g.Value[i].Key); }
  }
 }

 void SetText(Component c, string s) { try { var p = tmpType != null && tmpType.IsInstanceOfType(c) ? tmpText : uText; p.SetValue(c, s, null); } catch { } }
 bool Overflowing(Component c) {
  try {
   if (tmpForce == null) tmpForce = tmpType.GetMethod("ForceMeshUpdate", Type.EmptyTypes);
   if (tmpOverflow == null) tmpOverflow = tmpType.GetProperty("isTextOverflowing");
   if (tmpForce != null) tmpForce.Invoke(c, null);
   return tmpOverflow != null && (bool)tmpOverflow.GetValue(c, null);
  } catch { return false; }
 }
 // the game's text with the ruby after each base and the Chinese appended; the game's tags and breaks are copied as they are
 static string Build(string raw, string ruby, string zh, bool tmp, float zhScale, int uguiSize) {
  var spans = new Dictionary<int, KeyValuePair<int, string>>();
  foreach (var one in (ruby ?? "").Split('|')) { var q = one.Split(new[] { ':' }, 3); int s, n; if (q.Length == 3 && q[2].Length > 0 && int.TryParse(q[0], out s) && int.TryParse(q[1], out n) && n > 0) spans[s] = new KeyValuePair<int, string>(n, q[2]); }
  var sb = new StringBuilder(); bool tag = false; int k = 0, closeAt = -1; string reading = null; int baseLen = 0;
  foreach (char ch in raw) {
   if (ch == '<') tag = true;
   if (tag || char.IsWhiteSpace(ch) || ch == '　') { sb.Append(ch); if (ch == '>') tag = false; continue; }
   KeyValuePair<int, string> sp;
   if (tmp && closeAt < 0 && spans.TryGetValue(k, out sp)) { closeAt = k + sp.Key - 1; reading = sp.Value; baseLen = sp.Key; }
   sb.Append(ch);
   if (k == closeAt) {
    float n = baseLen, m = reading.Length * 0.5f;
    sb.Append("<space=-").Append(F((n + m) / 2)).Append("em><voffset=1em><size=50%>").Append(reading).Append("</size></voffset><space=").Append(F((n - m) / 2)).Append("em>");
    closeAt = -1;
   }
   k++;
  }
  if (!string.IsNullOrEmpty(zh)) sb.Append('\n').Append(tmp ? "<size=" + Math.Round(zhScale * 100) + "%><noparse>" + zh + "</noparse></size>" : (uguiSize > 0 ? "<size=" + uguiSize + ">" + zh + "</size>" : zh));
  return sb.ToString();
 }
 void EmbedTick() {
  if (!drawEmbed || current == null) return;
  string raw = TextOf(current) ?? "";
  if (embComp == current && raw == embSet) { RevealAll(); return; }
  if (raw != lastRaw) { lastRaw = raw; lastRawAt = Time.unscaledTime; return; }
  if (Time.unscaledTime - lastRawAt < 0.3f) return; // the game is still writing the line
  string key = Norm(raw); if (key.Length < 2) return;
  string[] e; lock (embeds) embeds.TryGetValue(key, out e);
  if (e == null) { if (asked.Add(key)) Send("ToMe_UNITY ask " + key); return; }
  bool tmp = tmpType != null && tmpType.IsInstanceOfType(current);
  string zh = drawZh ? e[1] : "";
  int size = 0; if (!tmp) { try { if (uFontSize == null) uFontSize = uguiText.GetProperty("fontSize"); size = (int)Math.Round((int)uFontSize.GetValue(current, null) * 0.8); } catch { } }
  if (!tmp && zh.Length == 0) return; // uGUI cannot show ruby: nothing to draw
  string text = Build(raw, e[0], zh, tmp, 0.8f, size); int level = zh.Length > 0 ? 2 : 1;
  SetText(current, text);
  if (tmp && level == 2 && Overflowing(current)) { text = Build(raw, e[0], zh, tmp, 0.7f, size); SetText(current, text); if (Overflowing(current)) { text = Build(raw, e[0], "", tmp, 0.8f, size); SetText(current, text); level = 1; } }
  embComp = current; embSet = text; embJp = key.Length; embLevel = level; lastKey = "";
 }
 // a typewriter that counts the game's own characters stops before the added ones: once it reached the game's length, all are shown
 void RevealAll() {
  if (tmpType == null || !tmpType.IsInstanceOfType(current)) return;
  try { if (tmpMaxVisible == null) tmpMaxVisible = tmpType.GetProperty("maxVisibleCharacters"); int v = (int)tmpMaxVisible.GetValue(current, null); if (v >= embJp && v < 99999) tmpMaxVisible.SetValue(current, 99999, null); } catch { }
 }


 // ---- components by type name ----------------------------------------------------------------------------------
 Type tmpType, uguiText, graphic;
 PropertyInfo uRich, tmpText, tmpAlpha, tmpInfo, uText, uColor, uGen, uPpu;
 FieldInfo ciPoint, ciIndex, infoCount, infoChars, ciChar, ciVisible, ciBL, ciTR;
 bool typesTried;

 void FindTypes() {
  if (typesTried) return; typesTried = true;
  foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) {
   if (tmpType == null) tmpType = a.GetType("TMPro.TMP_Text", false);
   if (uguiText == null) uguiText = a.GetType("UnityEngine.UI.Text", false);
   if (graphic == null) graphic = a.GetType("UnityEngine.UI.Graphic", false);
  }
  if (tmpType != null) {
   tmpText = tmpType.GetProperty("text"); tmpAlpha = tmpType.GetProperty("alpha"); tmpInfo = tmpType.GetProperty("textInfo");
   var ti = tmpInfo != null ? tmpInfo.PropertyType : null;
   if (ti != null) { infoCount = ti.GetField("characterCount"); infoChars = ti.GetField("characterInfo"); }
   var ci = infoChars != null ? infoChars.FieldType.GetElementType() : null;
   if (ci != null) { ciChar = ci.GetField("character"); ciIndex = ci.GetField("index"); ciPoint = ci.GetField("pointSize"); ciVisible = ci.GetField("isVisible"); ciBL = ci.GetField("bottomLeft"); ciTR = ci.GetField("topRight"); }
  }
  if (uguiText != null) { uText = uguiText.GetProperty("text"); uGen = uguiText.GetProperty("cachedTextGenerator"); uRich = uguiText.GetProperty("supportRichText"); uPpu = uguiText.GetProperty("pixelsPerUnit"); }
  if (graphic != null) uColor = graphic.GetProperty("color");
  Logger.LogInfo("text types: tmp=" + (tmpType != null) + " ugui=" + (uguiText != null));
 }

 // ---- the dialogue component ------------------------------------------------------------------------------------
 Component current; bool hidingCurrent, published; float nextScan; string lastKey = ""; int line; string lastText = "";
 readonly Dictionary<int, string> seen = new Dictionary<int, string>();
 readonly Dictionary<int, float> changedAt = new Dictionary<int, float>();

 static string Norm(string s) { var b = new StringBuilder(); bool tag = false; foreach (char c in s ?? "") { if (c == '<') tag = true; else if (c == '>') tag = false; else if (!tag && !char.IsWhiteSpace(c) && c != '　') b.Append(c); } return b.ToString(); }
 static int Cjk(string s) { int n = 0; foreach (char c in s) if (c >= 0x3040 && c <= 0x30ff || c >= 0x4e00 && c <= 0x9fff) n++; return n; }
 string TextOf(Component c) { try { var p = tmpType != null && tmpType.IsInstanceOfType(c) ? tmpText : uText; return p != null ? (string)p.GetValue(c, null) : ""; } catch { return ""; } }
 static bool Shown(Component c) { var b = c as Behaviour; return c != null && c.gameObject.activeInHierarchy && (b == null || b.enabled); }
 // A candidate must really be seen: not faded out by its own colour or a CanvasGroup, and on screen (a backlog or a
 // template kept active but transparent or parked outside the view is not the dialogue).
 bool Seen(Component c) {
  if (GetAlpha(c) < 0.02f) return false;
  foreach (var g in c.GetComponentsInParent<CanvasGroup>(true)) { if (g.alpha < 0.02f) return false; if (g.ignoreParentGroups) break; }
  var rt = c.transform as RectTransform; if (rt == null) return true;
  var corners = new Vector3[4]; rt.GetWorldCorners(corners); var cam = CameraOf(c);
  Vector2 a = Screen2(cam, corners[0]), b = Screen2(cam, corners[2]);
  return Math.Max(a.x, b.x) > 0 && Math.Min(a.x, b.x) < Screen.width && Math.Max(a.y, b.y) > 0 && Math.Min(a.y, b.y) < Screen.height;
 }

 void Scan() {
  FindTypes();
  var list = new List<Component>();
  foreach (var t in new[] { tmpType, uguiText }) if (t != null) foreach (var o in UnityEngine.Object.FindObjectsOfType(t)) { var c = o as Component; if (Shown(c) && Seen(c)) list.Add(c); }
  string want = Norm(wanted);
  Component best = null; float bestAt = -1; int bestLen = 0;
  foreach (var c in list) {
   string t = Norm(TextOf(c)); int id = c.GetInstanceID(); string old;
   if (!seen.TryGetValue(id, out old) || old != t) { seen[id] = t; changedAt[id] = Time.unscaledTime; }
   if (t.Length == 0) continue;
   if (want.Length >= 2) { if (want.StartsWith(t) && t.Length >= Math.Min(4, want.Length) || t.Contains(want)) { if (best == null || t.Length < bestLen || best != null && Norm(TextOf(best)).Length > t.Length) { best = c; bestLen = t.Length; } } continue; }
   int k = Cjk(t); float at; changedAt.TryGetValue(id, out at);
   if (k >= 2 && (at > bestAt || at == bestAt && k > bestLen)) { best = c; bestAt = at; bestLen = k; }
  }
  if (best != current) { ClearPublished(); Restore(); current = best; embComp = null; }
  if (drawRoles) try { RoleScan(list); } catch (Exception e) { Logger.LogWarning("roles " + e.Message); }
 }

 // ---- hide / restore --------------------------------------------------------------------------------------------
 float GetAlpha(Component c) { try { if (tmpType != null && tmpType.IsInstanceOfType(c)) return (float)tmpAlpha.GetValue(c, null); return ((Color)uColor.GetValue(c, null)).a; } catch { return 1f; } }
 void SetAlpha(Component c, float a) { try { if (tmpType != null && tmpType.IsInstanceOfType(c)) tmpAlpha.SetValue(c, a, null); else { var col = (Color)uColor.GetValue(c, null); col.a = a; uColor.SetValue(c, col, null); } } catch { } }
 // Hidden through the CanvasRenderers (the component's and its sub-meshes'): their alpha multiplies whatever colours the
 // game animates into the mesh (live 2026-11-14, IL2CPP 魔法少女ノ魔女裁判: a typewriter rewrote vertex colours, so the
 // component's own alpha was not enough). Text without a CanvasRenderer: its Renderers off, else the component alpha.
 readonly Dictionary<int, float> saved = new Dictionary<int, float>();
 void HideSet(Component c, bool on) {
  bool any = false;
  foreach (var cr in c.GetComponentsInChildren<CanvasRenderer>(true)) {
   any = true; int k = cr.GetInstanceID(); float a;
   if (on) { if (!saved.ContainsKey(k)) saved[k] = cr.GetAlpha(); if (cr.GetAlpha() != 0f) cr.SetAlpha(0f); }
   else if (saved.TryGetValue(k, out a)) { cr.SetAlpha(a <= 0f ? 1f : a); saved.Remove(k); }
  }
  if (!any) foreach (var r in c.GetComponentsInChildren<Renderer>(true)) {
   any = true; int k = r.GetInstanceID(); float a;
   if (on) { if (!saved.ContainsKey(k)) saved[k] = r.enabled ? 1f : 0f; if (r.enabled) r.enabled = false; }
   else if (saved.TryGetValue(k, out a)) { r.enabled = a > 0f; saved.Remove(k); }
  }
  if (!any) { int k = c.GetInstanceID(); float a; if (on) { if (!saved.ContainsKey(k)) saved[k] = GetAlpha(c); SetAlpha(c, 0f); } else if (saved.TryGetValue(k, out a)) { SetAlpha(c, a <= 0f ? 1f : a); saved.Remove(k); } }
 }
 bool AllHidden(Component c) {
  bool any = false;
  foreach (var cr in c.GetComponentsInChildren<CanvasRenderer>(true)) { any = true; if (cr.GetAlpha() > 0f) return false; }
  if (any) return true;
  foreach (var r in c.GetComponentsInChildren<Renderer>(true)) { any = true; if (r.enabled) return false; }
  return any || GetAlpha(c) <= 0f;
 }
 void Restore() { if (hidingCurrent && current != null) HideSet(current, false); hidingCurrent = false; saved.Clear(); }

 // An empty record retires the exact published line; clearing local state alone leaves its reader overlay on screen
 void ClearPublished() {
  if (!published) return;
  published = false; lastKey = ""; lastText = "";
  Send("ToMe_CHARS engine=unity line=" + line + " hidden=0 sw=" + Screen.width + " sh=" + Screen.height + " vx=0 vy=0 vw=" + Screen.width + " vh=" + Screen.height + " n=0 rects= text=");
 }

 void LateUpdate() {
  if (Time.unscaledTime >= nextScan) { nextScan = Time.unscaledTime + 0.5f; try { Scan(); } catch (Exception e) { Logger.LogWarning("scan " + e.Message); } }
  if (current == null || !Shown(current)) { ClearPublished(); Restore(); current = null; return; }
  try { EmbedTick(); } catch (Exception e) { Logger.LogWarning("embed " + e.Message); }
  bool want = hideAsked && connected && !drawEmbed; /* the game draws the replacement: never hidden */
  if (want && !hidingCurrent) hidingCurrent = true;
  if (!want) Restore();
  if (hidingCurrent) HideSet(current, true);
 }

 IEnumerator EndOfFrame() {
  var wait = new WaitForEndOfFrame();
  while (true) {
   yield return wait;
   try { KemcoTick(); } catch (Exception) { kemcoPages.Reset(Screen.width,Screen.height,Send); }
   try { if (current != null && connected) Report(); } catch (Exception e) { Logger.LogWarning("report " + e.Message); }
  }
 }

 // ---- character boxes -----------------------------------------------------------------------------------------------
 static Camera CameraOf(Component c) {
  var all = c.GetComponentsInParent<Canvas>(true);
  if (all == null || all.Length == 0) return Camera.main; // world-space TextMeshPro
  var canvas = all[all.Length - 1]; // the root canvas decides the render mode
  return canvas.renderMode == RenderMode.ScreenSpaceOverlay ? null : (canvas.worldCamera ?? Camera.main);
 }
 static Vector2 Screen2(Camera cam, Vector3 world) { return cam == null ? new Vector2(world.x, world.y) : (Vector2)cam.WorldToScreenPoint(world); }

 void Report() {
  var all = new List<KeyValuePair<char, float[]>>();
  var cam = CameraOf(current); var tr = current.transform; float sh = Screen.height;
  Action<char, Vector3, Vector3> add = (ch, bl, trc) => {
   Vector2 a = Screen2(cam, tr.TransformPoint(bl)), b = Screen2(cam, tr.TransformPoint(trc));
   float x = Math.Min(a.x, b.x), top = sh - Math.Max(a.y, b.y), w = Math.Abs(b.x - a.x), h = Math.Abs(b.y - a.y);
   if (w <= 0 || h <= 0 || char.IsWhiteSpace(ch) || ch == '　') return;
   all.Add(new KeyValuePair<char, float[]>(ch, new[] { x, top, w, h }));
  };
  if (tmpType != null && tmpType.IsInstanceOfType(current)) {
   object info = tmpInfo.GetValue(current, null); int n = (int)infoCount.GetValue(info); var arr = (Array)infoChars.GetValue(info);
   // ruby: characters set in a clearly smaller point size than the line's body are left out
   var sizes = new List<float>(); if (ciPoint != null) for (int i = 0; i < n && i < arr.Length; i++) { object e = arr.GetValue(i); if ((bool)ciVisible.GetValue(e)) sizes.Add(Convert.ToSingle(ciPoint.GetValue(e))); }
   sizes.Sort(); float body = sizes.Count > 0 ? sizes[sizes.Count / 2] : 0f;
   for (int i = 0; i < n && i < arr.Length; i++) {
    object ci = arr.GetValue(i);
    if (!(bool)ciVisible.GetValue(ci)) continue;
    if (body > 0 && Convert.ToSingle(ciPoint.GetValue(ci)) < body * 0.75f) continue;
    add((char)ciChar.GetValue(ci), (Vector3)ciBL.GetValue(ci), (Vector3)ciTR.GetValue(ci));
   }
  } else if (uGen != null) {
   var gen = (TextGenerator)uGen.GetValue(current, null); float ppu = uPpu != null ? (float)uPpu.GetValue(current, null) : 1f; if (ppu <= 0) ppu = 1f;
   // Which characters got a quad differs by Unity version: rich-text tags (empty quads before 2019, none after),
   // spaces and line breaks (none since 2019.1). The sequence whose length matches the quad count is the one drawn.
   string raw = TextOf(current) ?? ""; int quads = gen.verts.Count / 4; var verts = gen.verts;
   bool rich = uRich == null || (bool)uRich.GetValue(current, null);
   string plain = rich ? System.Text.RegularExpressions.Regex.Replace(raw, "</?(b|i|size|color|material|quad)(=[^>]*)?>", "") : raw;
   string s = null;
   foreach (var cand in new[] { Keep(plain, false), Keep(plain, true), plain, Keep(raw, false), Keep(raw, true), raw }) if (cand.Length == quads) { s = cand; break; }
   if (s == null) s = Keep(plain, false);
   for (int i = 0, ci = 0; i + 3 < verts.Count && ci < s.Length; i += 4, ci++) {
    Vector3 p0 = verts[i].position / ppu, p2 = verts[i + 2].position / ppu;
    add(s[ci], new Vector3(Math.Min(p0.x, p2.x), Math.Min(p0.y, p2.y), 0), new Vector3(Math.Max(p0.x, p2.x), Math.Max(p0.y, p2.y), 0));
   }
  }
  if (all.Count == 0) { ClearPublished(); return; }
  /* engine-draw: the component carries the replacement: the record keeps the Japanese (the first characters, ruby left out above) */
  bool embedded = embComp == current && (TextOf(current) ?? "") == embSet;
  if (embedded && all.Count > embJp) all.RemoveRange(embJp, all.Count - embJp);
  // Quads far smaller than the line's glyphs in both directions are not readable characters (markup some games leave as near-empty
  // glyphs, underline / cursor quads): left out, so the record holds what a reader sees.
  var hs = new List<float>(); foreach (var e in all) hs.Add(e.Value[3]); hs.Sort(); float median = hs[hs.Count / 2];
  var rects = new List<float[]>(); var text = new StringBuilder(); float prevTop = float.NaN;
  foreach (var e in all) {
   var r = e.Value; if (r[3] < median * 0.15f && r[2] < median * 0.15f) continue; // both sides tiny: a long dash (一 ー) is flat but wide
   float mid = r[1] + r[3] / 2; // row change by glyph centre: kana and punctuation sit lower than kanji
   if (!float.IsNaN(prevTop) && Math.Abs(mid - prevTop) > median * 0.9f) text.Append('\n');
   prevTop = mid; text.Append(e.Key); rects.Add(r);
  }
  if (rects.Count == 0) { ClearPublished(); return; }
  string flat = text.ToString().Replace("\n", "");
  if (!(lastText.Length > 0 && (flat.StartsWith(lastText) || lastText.StartsWith(flat)))) line++;
  bool hidden = hidingCurrent && AllHidden(current);
  var sb = new StringBuilder();
  foreach (var r in rects) { if (sb.Length > 0) sb.Append(';'); sb.Append(F(r[0])).Append(',').Append(F(r[1])).Append(',').Append(F(r[2])).Append(',').Append(F(r[3])); }
  string key = line + "|" + hidden + "|" + (embedded ? embLevel : 0) + "|" + sb;
  if (key == lastKey) return;
  lastKey = key; lastText = flat; published = true;
  Send("ToMe_CHARS engine=unity line=" + line + " hidden=" + (hidden ? 1 : 0) + " sw=" + Screen.width + " sh=" + Screen.height + " vx=0 vy=0 vw=" + Screen.width + " vh=" + Screen.height + " n=" + rects.Count + " rects=" + sb + (embedded ? " emb=" + embLevel : "") + " text=" + text);
 }
 static string Keep(string s, bool blanks) { var b = new StringBuilder(); foreach (char c in s) if (c != (char)10 && c != (char)13 && (blanks || !char.IsWhiteSpace(c))) b.Append(c); return b.ToString(); }
 static string F(float v) { return Math.Round(v, 1).ToString(System.Globalization.CultureInfo.InvariantCulture); }

 void OnDestroy() { kemcoPages.Reset(Screen.width,Screen.height,Send); ClearPublished(); Restore(); }

 // Exact original Raging Loop assembly only; this observer never writes renderers, text, roles or input
 volatile bool kemcoAsked, kemcoRoles;
 int kemcoEpoch, kemcoObservedEpoch=-1;
 bool kemcoTried, kemcoReady; float kemcoNext;
 Type kemcoMain, kemcoMessage, kemcoButton;
 FieldInfo kemcoBody, kemcoName, kemcoDialogs, kemcoRows, kemcoParent, kemcoButtonText, kemcoButtonEnabled;
 readonly KemcoSpriteSnapshot kemcoPages = new KemcoSpriteSnapshot();
 void KemcoControl(bool on,bool roles=false) { lock(gate) { kemcoAsked=on; kemcoRoles=roles; kemcoEpoch++; } }
 void KemcoSend(string wire) { lock(gate) { if (connected && kemcoAsked && kemcoObservedEpoch==kemcoEpoch) Send(wire); } }
 internal static bool KemcoFlag(string command,string name="kemcoSprites") {
  int count=0; bool on=false;
  foreach (string token in command.Split(' ')) if (token.StartsWith(name+"=",StringComparison.Ordinal)) { count++; on=token==name+"=1"; }
  return count==1 && on;
 }
 static FieldInfo KemcoField(Type t,string name,Type value) {
  if (t==null) return null;
  var f=t.GetField(name,BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance);
  return f!=null && f.FieldType==value ? f : null;
 }
 bool KemcoSchema() {
  if (kemcoTried) return kemcoReady; kemcoTried=true;
  foreach (var a in AppDomain.CurrentDomain.GetAssemblies()) {
   if (a.GetName().Name!="Assembly-CSharp") continue;
   var file=new FileInfo(a.Location); if (!file.Exists || file.Length!=361472) return false;
   string hash; var bytes=new byte[361472]; using (var s=File.OpenRead(a.Location)) {
    int at=0; while(at<bytes.Length) { int n=s.Read(bytes,at,bytes.Length-at); if(n<=0) return false; at+=n; }
    if(s.ReadByte()!=-1) return false;
   }
   using (var sha=SHA256.Create()) hash=BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();
   if (hash!="c4d74235dc06d19630d8b826e49bd3d047c09bc03e8d8badeb0d60dd71dd7314") return false;
   kemcoMain=a.GetType("MainScene",false); kemcoMessage=a.GetType("Message",false); kemcoButton=a.GetType("Button",false);
   if (kemcoMain==null || kemcoMessage==null || kemcoButton==null || !typeof(MonoBehaviour).IsAssignableFrom(kemcoMain) || !typeof(MonoBehaviour).IsAssignableFrom(kemcoMessage) || !typeof(Component).IsAssignableFrom(kemcoButton)) return false;
   kemcoBody=KemcoField(kemcoMain,"message",kemcoMessage); kemcoName=KemcoField(kemcoMain,"nameMessage",kemcoMessage);
   kemcoDialogs=KemcoField(kemcoMain,"dialogList",typeof(List<GameObject>));
   kemcoRows=KemcoField(kemcoMessage,"messageSprite",typeof(List<List<GameObject>>)); kemcoParent=KemcoField(kemcoMessage,"parentObject",typeof(GameObject));
   kemcoButtonText=KemcoField(kemcoButton,"Text",typeof(GameObject)); kemcoButtonEnabled=KemcoField(kemcoButton,"Enabled",typeof(bool));
   var mes=kemcoMessage.GetMethod("Mes",BindingFlags.Public|BindingFlags.NonPublic|BindingFlags.Instance,null,new[]{typeof(string),typeof(bool)},null);
   kemcoReady=kemcoBody!=null && kemcoName!=null && kemcoDialogs!=null && kemcoRows!=null && kemcoParent!=null && kemcoButtonText!=null && kemcoButtonEnabled!=null && mes!=null && mes.ReturnType==typeof(void);
   Send("ToMe_UNITY status kemco-sprites schema="+(kemcoReady?"original-readonly":"unsupported")); return kemcoReady;
  }
  return false;
 }
 static float[] KemcoBox(GameObject root,out bool shown) {
  shown=false; if (root==null || !root.activeInHierarchy) return null;
  var mesh=root.GetComponent<TextMesh>(); var renderer=root.GetComponent<Renderer>();
  if (mesh==null || renderer==null || !renderer.enabled) return null;
  float alpha=mesh.color.a; if (float.IsNaN(alpha) || float.IsInfinity(alpha)) { shown=true; return null; } if (alpha<=0) return null;
  // Reading sharedMaterial avoids the instantiating material getter and preserves the game's ownership
  var material=renderer.sharedMaterial;
  if (material==null || !material.HasProperty("_Color")) { shown=true; return null; }
  alpha=material.color.a; if (float.IsNaN(alpha) || float.IsInfinity(alpha)) { shown=true; return null; } if (alpha<=0) return null;
  var cameras=Camera.allCameras; if (cameras.Length>8) { shown=true; return null; }
  Camera camera=null;
  foreach (var c in cameras) if (c!=null && c.enabled && c.gameObject.activeInHierarchy && c.targetTexture==null && (c.cullingMask & (1<<root.layer))!=0) { if (camera!=null) { shown=true; return null; } camera=c; }
  if (camera==null) return null;
  shown=true; var bounds=renderer.bounds; var lo=bounds.min; var hi=bounds.max;
  float x=float.PositiveInfinity,y=x,r=float.NegativeInfinity,b=r;
  for (int i=0;i<8;i++) {
   var p=camera.WorldToScreenPoint(new Vector3((i&1)==0?lo.x:hi.x,(i&2)==0?lo.y:hi.y,(i&4)==0?lo.z:hi.z));
   if (p.z<=0 || float.IsNaN(p.z) || float.IsInfinity(p.z) || float.IsNaN(p.x) || float.IsNaN(p.y) || float.IsInfinity(p.x) || float.IsInfinity(p.y)) return null;
   x=Math.Min(x,p.x); r=Math.Max(r,p.x); y=Math.Min(y,Screen.height-p.y); b=Math.Max(b,Screen.height-p.y);
  }
  // Completely parked glyphs are a typewriter suffix; a partially clipped glyph is unsupported
  if (r<=0 || b<=0 || x>=Screen.width || y>=Screen.height) { shown=false; return null; }
  var box=new[]{x,y,r-x,b-y}; var viewport=camera.pixelRect;
  if (x<viewport.xMin || r>viewport.xMax || Screen.height-b<viewport.yMin || Screen.height-y>viewport.yMax) return null;
  return box;
 }
 KemcoSpriteSnapshot.Page KemcoRead(Component message,out int generation) {
  generation=0; if (message==null || !Shown(message)) return null;
  var parent=kemcoParent.GetValue(message) as GameObject; if (parent==null || !parent.activeInHierarchy) return null;
  generation=parent.GetInstanceID(); var source=kemcoRows.GetValue(message) as List<List<GameObject>>;
  if (source==null || source.Count>32) return null;
  var rows=new List<IList<KemcoSpriteSnapshot.Glyph>>(); int count=0;
  foreach (var row in source) {
   if (row==null || row.Count>256 || (count+=row.Count)>2048) return null;
   var glyphs=new List<KemcoSpriteSnapshot.Glyph>(); rows.Add(glyphs);
   foreach (var root in row) {
    if (root==null || root.transform.parent!=parent.transform) return null;
    var mesh=root.GetComponent<TextMesh>(); if (mesh==null) return null;
    bool shown; var box=KemcoBox(root,out shown);
    glyphs.Add(new KemcoSpriteSnapshot.Glyph { id=root.GetInstanceID(),text=mesh.text,shown=shown,box=box });
   }
  }
  return KemcoSpriteSnapshot.Read(rows,Screen.width,Screen.height);
 }
 static float[] KemcoUnion(KemcoSpriteSnapshot.Page p) {
  if (p==null || p.text.IndexOf('\n')>=0) return null;
  float x=float.PositiveInfinity,y=x,r=0,b=0;
  foreach(var q in p.rects) { x=Math.Min(x,q[0]); y=Math.Min(y,q[1]); r=Math.Max(r,q[0]+q[2]); b=Math.Max(b,q[1]+q[3]); }
  return new[]{x,y,r-x,b-y};
 }
 sealed class KemcoChoice { internal int generation; internal string text; internal float[] box; }
 void KemcoTick() {
  int epoch; lock(gate) epoch=kemcoEpoch;
  if (epoch!=kemcoObservedEpoch) { kemcoPages.Reset(Screen.width,Screen.height,Send); kemcoObservedEpoch=epoch; }
  if (!connected || !kemcoAsked) { kemcoPages.Reset(Screen.width,Screen.height,Send); return; }
  if (Time.unscaledTime<kemcoNext) return; kemcoNext=Time.unscaledTime+0.1f;
  if (!KemcoSchema()) { kemcoPages.Reset(Screen.width,Screen.height,Send); return; }
  var all=UnityEngine.Object.FindObjectsOfType(kemcoMain); Component main=null; int active=0;
  foreach (var obj in all) { var c=obj as Component; if (Shown(c)) { main=c; active++; } }
  if (active!=1) { kemcoPages.Reset(Screen.width,Screen.height,Send); return; }
  int generation; var body=KemcoRead(kemcoBody.GetValue(main) as Component,out generation);
  kemcoPages.Publish("body",generation,body,null,null,Screen.width,Screen.height,KemcoSend);
  var name=kemcoRoles?KemcoRead(kemcoName.GetValue(main) as Component,out generation):null;
  kemcoPages.Publish("name",generation,null,name==null?null:name.text,KemcoUnion(name),Screen.width,Screen.height,KemcoSend);
  var dialogs=kemcoDialogs.GetValue(main) as List<GameObject>;
  if (dialogs==null || dialogs.Count>32) { for (int i=0;i<16;i++) kemcoPages.Drop("choice"+i,Screen.width,Screen.height,Send); return; }
  var seenChoices=new HashSet<int>(); var choices=new List<KemcoChoice>();
  foreach (var go in dialogs) {
   if (!kemcoRoles || go==null || !go.activeInHierarchy) continue;
   var button=go.GetComponent(kemcoButton); if (button==null || !(bool)kemcoButtonEnabled.GetValue(button)) continue;
   if (!seenChoices.Add(go.GetInstanceID()) || choices.Count>=16) { for (int i=0;i<16;i++) kemcoPages.Drop("choice"+i,Screen.width,Screen.height,Send); return; }
   var text=kemcoButtonText.GetValue(button) as GameObject; var mesh=text==null?null:text.GetComponent<TextMesh>(); bool shown;
   var box=KemcoBox(text,out shown); if (!shown) box=null;
   choices.Add(new KemcoChoice { generation=go.GetInstanceID(),text=mesh==null?null:mesh.text,box=box });
  }
  int index=0;
  foreach(var choice in choices) kemcoPages.Publish("choice"+index++,choice.generation,null,choice.text,choice.box,Screen.width,Screen.height,KemcoSend);
  for (;index<16;index++) kemcoPages.Drop("choice"+index,Screen.width,Screen.height,Send);
 }
}
