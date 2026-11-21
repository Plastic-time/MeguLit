// SPDX-License-Identifier: GPL-3.0-or-later
// Source-only capture; original game rendering is retained.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using BepInEx;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;
using Il2CppInterop.Runtime.InteropTypes;

[BepInPlugin("com.megulit.unitytext.il2cpp", "MeguLit Unity Text (IL2CPP)", "1.0.0")]
public class MeguLitUnityTextIl2Cpp : BasePlugin {
 static MeguLitUnityTextIl2Cpp Instance;
 readonly object gate = new object();
 readonly Queue<string> outbox = new Queue<string>();
 readonly Dictionary<string,string> seen = new Dictionary<string,string>();
 Harmony harmony;
 Thread network;
 TcpClient client;
 volatile bool capture, stopped;
 string scope, birth;
 int pid;
 long sequence;
 [ThreadStatic] static bool reading;

 public override void Load() {
  string dir = Path.GetDirectoryName(GetType().Assembly.Location);
  int port;
  string portFile = Path.Combine(dir, "MeguLitUnityText.port"), authFile = Path.Combine(dir, "MeguLitUnityText.auth");
  if (!File.Exists(portFile) || !int.TryParse(File.ReadAllText(portFile).Trim(), out port) || port < 1 || port > 65535 || !File.Exists(authFile)) { Log.LogInfo("no private MeguLit session: idle"); return; }
  scope = File.ReadAllText(authFile).Trim();
  if (!UnityIl2CppWire.ValidScope(scope)) { Log.LogWarning("invalid private session: idle"); return; }
  using (var process = Process.GetCurrentProcess()) { pid = process.Id; birth = process.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture); }
  Instance = this;
  harmony = new Harmony("com.megulit.unitytext.il2cpp.capture");
  int count = Install("Unity.TextMeshPro", "TMPro.TMP_Text", true) + Install("UnityEngine.UI", "UnityEngine.UI.Text", false);
  Log.LogInfo("IL2CPP source setters installed: " + count + "; original rendering retained");
  if (count == 0) { Stop(); return; }
  network = new Thread(() => Net(port)) { IsBackground = true, Name = "MeguLitUnityText" };
  network.Start();
 }
 int Install(string assembly, string name, bool tmp) {
  int count = 0;
  try {
   Type type = Assembly.Load(assembly).GetType(name, false);
   if (type == null) return 0;
   var postfix = new HarmonyMethod(typeof(MeguLitUnityTextIl2Cpp).GetMethod(nameof(TextChanged), BindingFlags.Static | BindingFlags.NonPublic));
   MethodInfo setter = type.GetProperty("text")?.GetSetMethod();
   if (setter != null) { harmony.Patch(setter, postfix: postfix); count++; }
   MethodInfo setText = tmp ? type.GetMethod("SetText", new Type[] { typeof(string), typeof(bool) }) : null;
   if (setText != null) { harmony.Patch(setText, postfix: postfix); count++; }
   return count;
  } catch (Exception e) { Log.LogWarning("setter unavailable: " + name + " (" + e.GetType().Name + ")"); return count; }
 }
 static void TextChanged(object __instance, MethodBase __originalMethod) {
  var self = Instance;
  if (self == null || self.stopped || !self.capture || reading || __instance == null) return;
  try {
   reading = true;
   var native = __instance as Il2CppObjectBase;
   if (native == null || native.Pointer == IntPtr.Zero) return;
   string text = __originalMethod.DeclaringType.GetProperty("text")?.GetValue(__instance) as string;
   if (text == null || text.Length > UnityIl2CppWire.MaxCharacters) return;
   self.Record(native.Pointer.ToInt64().ToString("x"), text);
  } catch { /* Unsupported game getters must never interrupt their setters. */ }
  finally { reading = false; }
 }
 void Record(string stream, string text) {
  lock (gate) {
   if (!capture || stopped) return;
   if (seen.TryGetValue(stream, out string before) && before == text) return;
   if (seen.Count >= 256 && !seen.ContainsKey(stream)) seen.Clear();
   seen[stream] = text;
   if (outbox.Count >= 256) outbox.Dequeue();
   outbox.Enqueue(UnityIl2CppWire.Packet(scope, ++sequence, pid, birth, stream, text.Length == 0 ? "clear" : "full", text));
  }
 }
 void Command(string line) {
  if (!UnityIl2CppWire.TryControl(line, scope, out bool on)) return;
  lock (gate) { capture = on && !stopped; seen.Clear(); outbox.Clear(); }
 }
 void Net(int port) {
  try {
   using (client = new TcpClient()) {
    client.Connect("127.0.0.1", port); client.NoDelay = true;
    using (var stream = client.GetStream()) {
     byte[] hello = Encoding.UTF8.GetBytes(UnityIl2CppWire.Packet(scope, Interlocked.Increment(ref sequence), pid, birth, "0", "hello", "") + "\n");
     stream.Write(hello, 0, hello.Length);
     var input = new StringBuilder(); var bytes = new byte[8192]; var chars = new char[8192]; var decoder = new UTF8Encoding(false, true).GetDecoder();
     while (!stopped) {
      if (stream.DataAvailable) {
       int n = stream.Read(bytes, 0, bytes.Length); if (n == 0) return;
       int used = decoder.GetChars(bytes, 0, n, chars, 0, false); input.Append(chars, 0, used);
       if (input.Length > 32768) return;
       int at; string pending = input.ToString();
       while ((at = pending.IndexOf('\n')) >= 0) { Command(pending.Substring(0, at).TrimEnd('\r')); pending = pending.Substring(at + 1); }
       input.Clear(); input.Append(pending);
      }
      string[] lines; lock (gate) { lines = outbox.ToArray(); outbox.Clear(); }
      foreach (string line in lines) { byte[] data = Encoding.UTF8.GetBytes(line + "\n"); stream.Write(data, 0, data.Length); }
      if (client.Client.Poll(0, SelectMode.SelectRead) && client.Client.Available == 0) return;
      Thread.Sleep(15);
     }
    }
   }
  } catch (Exception e) { Log.LogInfo("source session closed: " + e.GetType().Name); }
  finally { Stop(); }
 }
 void Stop() {
  lock (gate) { if (stopped) return; stopped = true; capture = false; outbox.Clear(); seen.Clear(); }
  try { harmony?.UnpatchSelf(); } catch (Exception e) { Log.LogWarning("unpatch: " + e.GetType().Name); }
  try { client?.Close(); } catch { }
  if (Instance == this) Instance = null;
 }
 public override bool Unload() { Stop(); if (network != null && Thread.CurrentThread != network) network.Join(1000); return true; }
}
