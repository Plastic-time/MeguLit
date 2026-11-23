// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;

internal static class CardinalGameCapture {
    [StructLayout(LayoutKind.Sequential)]
    struct SecurityAttributes { internal int length; internal IntPtr descriptor; internal int inherit; }
    [DllImport("user32",SetLastError=true,CharSet=CharSet.Unicode)]
    static extern IntPtr CreateDesktop(string name,IntPtr device,IntPtr mode,int flags,uint access,ref SecurityAttributes security);
    [DllImport("user32",SetLastError=true)]
    static extern bool CloseDesktop(IntPtr desktop);

    static IntPtr CreateGameDesktop(string name,SecurityIdentifier package) {
        using(var owner=WindowsIdentity.GetCurrent()) {
            // Only the ephemeral package can use this private desktop alongside the collector.
            string acl="D:P(A;;GA;;;SY)(A;;GA;;;"+owner.User.Value+")(A;;0x200c7;;;"+package.Value+")S:(ML;;NW;;;LW)";
            var descriptor=new RawSecurityDescriptor(acl);
            byte[] data=new byte[descriptor.BinaryLength];
            descriptor.GetBinaryForm(data,0);
            var pin=GCHandle.Alloc(data,GCHandleType.Pinned);
            try {
                var security=new SecurityAttributes { length=Marshal.SizeOf(typeof(SecurityAttributes)),descriptor=pin.AddrOfPinnedObject() };
                var result=CreateDesktop(name,IntPtr.Zero,IntPtr.Zero,0,0x10000000,ref security);
                if(result==IntPtr.Zero)throw new Win32Exception();
                return result;
            } finally {pin.Free();}
        }
    }
    static void PlainPath(string path) {
        for(string current=path;current!=null;current=Path.GetDirectoryName(current))
            if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("SAMPLE_REPARSE_POINT");
    }
    static void CopyAssets(string source,string target,string skipDirectory) {
        foreach(var entry in new DirectoryInfo(source).GetFileSystemInfos()) {
            if((entry.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("SAMPLE_REPARSE_POINT");
            string dest=Path.Combine(target,entry.Name);
            if(entry is DirectoryInfo) {
                if(entry.Name.Equals(skipDirectory,StringComparison.OrdinalIgnoreCase))continue;
                Directory.CreateDirectory(dest);
                CopyAssets(entry.FullName,dest,null);
            } else File.Copy(entry.FullName,dest);
        }
    }
    static string Digest(string file) {
        using(var input=File.OpenRead(file))
        using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();
    }
    internal static string Run(Dictionary<string,object> req,string hostExe,string hostHash,string address,string saveDir,string template,string templateHash,bool worker=false) {
        var source=Path.GetFullPath(hostExe);
        if(!source.StartsWith(@"F:\",StringComparison.OrdinalIgnoreCase) ||
            !String.Equals(source,Path.GetFullPath((string)req["exe"]),StringComparison.OrdinalIgnoreCase))
            throw new IOException("GAME_ALLOWLIST_PATH");
        var identity=(Dictionary<string,object>)req["identity"];
        PlainPath(source);
        var baseDir=Path.GetDirectoryName(source);
        if(baseDir.Length<=3 || !Equals(identity["exe"],hostHash) || Digest(source)!=hostHash)throw new IOException("GAME_ALLOWLIST_IDENTITY");
        var output=Console.Out;
        string why="GAME_OBSERVATION_INCOMPLETE";
        string challenge=(string)req["challenge"];
        var json=new System.Web.Script.Serialization.JavaScriptSerializer();
        Action<object> send=value=>{if(worker){output.WriteLine(json.Serialize(new {challenge,value}));output.Flush();}};
        bool observedWindow=false;
        try {
            Console.SetOut(Console.Error);
            string probe=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"CardinalIsolationProbe.exe");
            CardinalIsolationProbe.WithIsolation(address,probe,delegate(string root,IntPtr sid) {
                if(worker)CardinalIsolationProbe.AuditRuntimeReads(root,(string)req["readerRoot"],sid);
                string game=Directory.CreateDirectory(Path.Combine(root,"game")).FullName;
                CopyAssets(baseDir,game,saveDir);
                string exe=Path.Combine(game,Path.GetFileName(source));
                if(Digest(exe)!=hostHash)throw new IOException("GAME_COPY_CHANGED");
                var package=new SecurityIdentifier(sid);
                CardinalIsolationProbe.Grant(game,package,FileSystemRights.ReadAndExecute);
                var save=Directory.CreateDirectory(Path.Combine(game,saveDir));
                if(template!=null) {
                    string original=Path.Combine(baseDir,saveDir,template);
                    PlainPath(original);
                    string copy=Path.Combine(save.FullName,template);
                    File.Copy(original,copy);
                    if(Digest(copy)!=templateHash)throw new IOException("GAME_SAVE_TEMPLATE_CHANGED");
                }
                CardinalIsolationProbe.Grant(save.FullName,package,FileSystemRights.Modify);
                int seconds=Math.Max(10,Math.Min(360,Convert.ToInt32(req["budgetMs"])/1000));
                string desktop="Cardinal"+Guid.NewGuid().ToString("N");
                IntPtr handle=CreateGameDesktop(desktop,package);
                Console.Error.WriteLine("Game desktop "+desktop);
                int code;
                try { code=ColdDesk.Run(new[]{"run",exe,"--seconds",seconds.ToString()},desktop,null,
                    delegate(IntPtr job,int pid) {
                        using(var gameProcess=System.Diagnostics.Process.GetProcessById(pid)) {
                            if(gameProcess.HasExited)return true;
                            if(!observedWindow){
                                var hwnd=ColdDesk.RootWindow(pid);
                                if(hwnd!=IntPtr.Zero){
                                    CardinalCollector.VerifyImage(job,gameProcess,exe);
                                    observedWindow=true;
                                    send(new {type="game",pid,birth=gameProcess.StartTime.ToUniversalTime().Ticks.ToString(),
                                        hwnd=hwnd.ToInt64().ToString(),desktop,exe,jobAssigned=true,hiddenDesktop=true,
                                        savesIsolated=true,networkBlocked=true,privateCopy=true,owned=true,parentWatchdog=true});
                                }
                            }
                            return false;
                        }
                    },
                    delegate(string image,string desk,out IntPtr process,out IntPtr thread,out int pid) {
                        CardinalIsolationProbe.Child child;
                        try { child=CardinalIsolationProbe.Launch(image,"",sid,desk,true); }
                        catch(Win32Exception error) {
                            Console.Error.WriteLine("GAME_CREATEPROCESS_WIN32_"+error.NativeErrorCode+": "+error.Message);
                            throw;
                        }
                        process=child.process;thread=child.thread;pid=child.pid;
                    }); } finally { if(!CloseDesktop(handle))throw new Win32Exception(); }
                if(code!=0)why="GAME_JOB_FAILED";
                else if(!ColdDesk.AudioReadback)why="GAME_AUDIO_READBACK_MISSING";
                else if(observedWindow && worker)why=null;
            });
        } catch(Win32Exception error) { why="ISOLATED_WIN32_"+error.NativeErrorCode; }
        finally {Console.SetOut(output);}
        if(why==null)send(new {type="cleanup",treeExited=true,audioRestored=true,ownershipReleased=true});
        return why;
    }
}
