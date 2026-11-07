// SPDX-License-Identifier: GPL-3.0-or-later
// 32-bit helper for the wait-marker draw hook. It creates throwaway Direct3D9 devices and vertex buffers in its own
// process and prints where their interface tables live inside d3d9.dll. System DLLs share one base address across
// processes of a boot, so the game's tables are found without running any code inside the game; the hook still
// compares every address and entry against the game's own memory before it patches anything.
// C# 5 only (the .NET Framework csc that ships with Windows).
using System;using System.Collections.Generic;using System.Diagnostics;using System.Runtime.InteropServices;using System.Text;using System.Windows.Forms;
static class D3D9Probe{
 [DllImport("d3d9.dll")]static extern IntPtr Direct3DCreate9(uint version);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate uint Release(IntPtr self);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int CreateDevice(IntPtr self,uint adapter,int type,IntPtr focus,uint flags,ref Present present,out IntPtr device);
 [UnmanagedFunctionPointer(CallingConvention.StdCall)]delegate int CreateVertexBuffer(IntPtr self,uint length,uint usage,uint fvf,int pool,out IntPtr buffer,IntPtr shared);
 [StructLayout(LayoutKind.Sequential)]struct Present{public uint Width,Height,Format,Count,MultiSample,Quality,Swap;public IntPtr Window;public int Windowed,AutoDepth;public uint DepthFormat,Flags,Refresh,Interval;}
 static IntPtr Slot(IntPtr self,int index){return Marshal.ReadIntPtr(Marshal.ReadIntPtr(self),index*IntPtr.Size);}
 static T Method<T>(IntPtr self,int index){return (T)(object)Marshal.GetDelegateForFunctionPointer(Slot(self,index),typeof(T));}
 static void Drop(IntPtr self){if(self!=IntPtr.Zero)Method<Release>(self,2)(self);}
 static string Table(IntPtr self,int[] slots){var b=new StringBuilder();b.Append("{\"table\":").Append((uint)Marshal.ReadIntPtr(self).ToInt32()).Append(",\"slots\":{");for(int i=0;i<slots.Length;i++){if(i>0)b.Append(',');IntPtr f=Slot(self,slots[i]);var code=new byte[10];Marshal.Copy(IntPtr.Add(f,-5),code,0,10);b.Append('"').Append(slots[i]).Append("\":[").Append((uint)f.ToInt32()).Append(",\"").Append(BitConverter.ToString(code).Replace("-","")).Append("\"]");}return b.Append("}}").ToString();}
 [STAThread]static int Main(){
  try{
   if(IntPtr.Size!=4)throw new Exception("D3D9Probe must run as a 32-bit process");
   var module=Array.Find(new List<ProcessModule>(Iterate()).ToArray(),m=>String.Equals(m.ModuleName,"d3d9.dll",StringComparison.OrdinalIgnoreCase));
   using(var form=new Form{ShowInTaskbar=false,FormBorderStyle=FormBorderStyle.None,Width=64,Height=64,Opacity=0}){
    IntPtr window=form.Handle;IntPtr d3d=Direct3DCreate9(32);if(d3d==IntPtr.Zero)throw new Exception("Direct3DCreate9 failed");
    var devices=new List<string>();var buffers=new List<string>();var seen=new HashSet<string>();
    try{
     // Software, hardware and pure-device vertex processing can each use their own device class.
     foreach(uint flags in new uint[]{0x20,0x40,0x50}){
      var present=new Present{Width=64,Height=64,Swap=1,Window=window,Windowed=1};IntPtr device;
      if(Method<CreateDevice>(d3d,16)(d3d,0,1,window,flags|0x4,ref present,out device)<0||device==IntPtr.Zero)continue;
      try{
       string text=Table(device,new[]{48,65,81,83});if(seen.Add(text))devices.Add(text);
       // Dynamic, write-only default and managed buffers.
       foreach(var kind in new[]{new uint[]{0x208,0},new uint[]{8,0},new uint[]{0,1}}){IntPtr buffer;
        if(Method<CreateVertexBuffer>(device,26)(device,112,kind[0],0x144,(int)kind[1],out buffer,IntPtr.Zero)<0||buffer==IntPtr.Zero)continue;
        try{text=Table(buffer,new[]{11,12,13});if(seen.Add(text))buffers.Add(text);}finally{Drop(buffer);}}
      }finally{Drop(device);}
     }
    }finally{Drop(d3d);}
    if(devices.Count==0)throw new Exception("no Direct3D9 device could be created");
    module=Array.Find(new List<ProcessModule>(Iterate()).ToArray(),m=>String.Equals(m.ModuleName,"d3d9.dll",StringComparison.OrdinalIgnoreCase));
    Console.WriteLine("{\"ok\":true,\"base\":"+(uint)module.BaseAddress.ToInt32()+",\"size\":"+module.ModuleMemorySize+",\"path\":"+Quote(module.FileName)+",\"devices\":["+String.Join(",",devices)+"],\"buffers\":["+String.Join(",",buffers)+"]}");
   }
   return 0;
  }catch(Exception e){Console.WriteLine("{\"ok\":false,\"error\":"+Quote(e.Message)+"}");return 1;}
 }
 static IEnumerable<ProcessModule> Iterate(){foreach(ProcessModule m in Process.GetCurrentProcess().Modules)yield return m;}
 static string Quote(string s){var b=new StringBuilder("\"");foreach(char c in s??""){if(c=='"'||c=='\\')b.Append('\\').Append(c);else if(c<32)b.Append("\\u").Append(((int)c).ToString("x4"));else b.Append(c);}return b.Append('"').ToString();}
}
