// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections;
using System.IO;
using System.Reflection;
using System.Text;
using System.Threading;
/* Calls the real compiled HookBridge output handler; it never injects or starts a game. */
public static class DanganronpaBridgeReplay {
 static Type Bridge;const BindingFlags Flags=BindingFlags.Static|BindingFlags.Public|BindingFlags.NonPublic;
 static void Set(string key,object value){Bridge.GetField(key,Flags).SetValue(null,value);}
 static object Call(string key,params object[] args){return Bridge.GetMethod(key,Flags).Invoke(null,args);}
 public static int Main(string[] args){
  if(args.Length!=2)return 2;Bridge=Assembly.LoadFrom(Path.GetFullPath(args[0])).GetType("HookBridge");
  uint pid=(uint)System.Diagnostics.Process.GetCurrentProcess().Id;Set("Pid",pid);Set("Enabled",true);Set("Connected",true);Set("ReplacementRequested",false);
  var writer=new StringWriter();Set("OutTarget",writer);
  Type param=Bridge.GetNestedType("ThreadParam",BindingFlags.Public);object tp=Activator.CreateInstance(param);param.GetField("processId").SetValue(tp,pid);param.GetField("addr").SetValue(tp,(ulong)0x450c00);
  string key=(string)param.GetMethod("Key").Invoke(tp,null),code="HWN0@50C00:DR1_us.exe";Set("Selected",key);
  Type candidate=Bridge.GetNestedType("Candidate",BindingFlags.NonPublic);object c=Activator.CreateInstance(candidate);foreach(var pair in new[]{new object[]{"tp",tp},new object[]{"name","DanganronpaPcText"},new object[]{"code",code},new object[]{"created",true}})candidate.GetField((string)pair[0],BindingFlags.Instance|BindingFlags.Public|BindingFlags.NonPublic).SetValue(c,pair[1]);
  ((IDictionary)Bridge.GetField("Candidates",Flags).GetValue(null)).Add(key,c);
  int count=0;foreach(string line in File.ReadAllLines(args[1])){if(!line.StartsWith("SOURCE ",StringComparison.Ordinal))continue;string hex=line.Substring(7).Trim();byte[] bytes=new byte[hex.Length/2];for(int i=0;i<bytes.Length;i++)bytes[i]=Convert.ToByte(hex.Substring(i*2,2),16);
   string text=new UnicodeEncoding(false,false,true).GetString(bytes);Call("OnOutput",code,"DanganronpaPcText",tp,text);Call("DrainOutput");count++;Thread.Sleep(400);
  }
  Call("DrainOutput");Console.OutputEncoding=new UTF8Encoding(false);Console.Write(writer.ToString());return count>0?0:3;
 }
}
