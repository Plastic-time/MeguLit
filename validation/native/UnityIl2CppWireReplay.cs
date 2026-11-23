// SPDX-License-Identifier: GPL-3.0-or-later
// Neutral wire replay, not a Unity/IL2CPP game or a generated-interop substitute.
using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Text;
public static class UnityIl2CppWireReplay {
 public static int Main(string[] args) {
  if (args.Length != 2) return 2;
  string scope = args[1], birth; int pid;
  using (var p = Process.GetCurrentProcess()) { pid = p.Id; birth = p.StartTime.ToUniversalTime().Ticks.ToString(System.Globalization.CultureInfo.InvariantCulture); }
  if (UnityIl2CppWire.TryControl("SOURCE " + scope + " 1 extra", scope, out _) || UnityIl2CppWire.TryControl("SOURCE " + new string('b',32) + " 1", scope, out _)) return 3;
  Console.WriteLine("IDENTITY\t" + pid + "\t" + birth); Console.Out.Flush();
  using (var socket = new TcpClient("127.0.0.1", int.Parse(args[0]))) {
   socket.NoDelay = true; socket.ReceiveTimeout = 5000;
   var stream = socket.GetStream();
   Action<string> send = line => { byte[] bytes = Encoding.UTF8.GetBytes(line + "\n"); for (int at=0; at<bytes.Length; at+=3) stream.Write(bytes,at,Math.Min(3,bytes.Length-at)); };
   send(UnityIl2CppWire.Packet(scope,1,pid,birth,"0","hello",""));
   using (var reader = new StreamReader(stream,new UTF8Encoding(false,true))) {
    bool sent = false;
    for (string line; (line=reader.ReadLine()) != null;) {
     if (!UnityIl2CppWire.TryControl(line,scope,out bool on)) continue;
     if (on && !sent) { sent = true; send(UnityIl2CppWire.Packet(scope,2,pid,birth,"abc","full","これは中性の試験です😀。")); Console.WriteLine("SENT"); Console.Out.Flush(); }
     if (!on && sent) { Console.WriteLine("STOPPED"); return 0; }
    }
   }
  }
  return 4;
 }
}
