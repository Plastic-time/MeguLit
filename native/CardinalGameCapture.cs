// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;

internal static class CardinalGameCapture {
    static void PlainPath(string path) {
        for(string current=path;current!=null;current=Path.GetDirectoryName(current))
            if((File.GetAttributes(current)&FileAttributes.ReparsePoint)!=0)throw new IOException("SAMPLE_REPARSE_POINT");
    }
    static void CopyAssets(string source,string target,bool top) {
        foreach(var entry in new DirectoryInfo(source).GetFileSystemInfos()) {
            if((entry.Attributes&FileAttributes.ReparsePoint)!=0)throw new IOException("SAMPLE_REPARSE_POINT");
            string dest=Path.Combine(target,entry.Name);
            if(entry is DirectoryInfo) {
                if(top && entry.Name.Equals("savedata",StringComparison.OrdinalIgnoreCase))continue;
                Directory.CreateDirectory(dest);
                CopyAssets(entry.FullName,dest,false);
            } else File.Copy(entry.FullName,dest);
        }
    }
    static string Digest(string file) {
        using(var input=File.OpenRead(file))
        using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(input)).Replace("-","").ToLowerInvariant();
    }
    internal static string Run(Dictionary<string,object> req,string hostExe,string hostHash,string address) {
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
        try {
            Console.SetOut(Console.Error);
            string probe=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"CardinalIsolationProbe.exe");
            CardinalIsolationProbe.WithIsolation(address,probe,delegate(string root,IntPtr sid) {
                string game=Directory.CreateDirectory(Path.Combine(root,"game")).FullName;
                CopyAssets(baseDir,game,true);
                string exe=Path.Combine(game,Path.GetFileName(source));
                if(Digest(exe)!=hostHash)throw new IOException("GAME_COPY_CHANGED");
                var package=new SecurityIdentifier(sid);
                CardinalIsolationProbe.Grant(game,package,FileSystemRights.ReadAndExecute);
                var save=Directory.CreateDirectory(Path.Combine(game,"savedata"));
                CardinalIsolationProbe.Grant(save.FullName,package,FileSystemRights.Modify);
                int seconds=Math.Max(10,Math.Min(360,Convert.ToInt32(req["budgetMs"])/1000));
                int code=ColdDesk.Run(new[]{"run",exe,"--seconds",seconds.ToString()},"Cardinal"+Guid.NewGuid().ToString("N"),null,
                    delegate(IntPtr job,int pid) { return false; },
                    delegate(string image,string desk,out IntPtr process,out IntPtr thread,out int pid) {
                        CardinalIsolationProbe.Child child;
                        try { child=CardinalIsolationProbe.Launch(image,"",sid,desk,true); }
                        catch(Win32Exception error) {
                            Console.Error.WriteLine("GAME_CREATEPROCESS_WIN32_"+error.NativeErrorCode+": "+error.Message);
                            throw;
                        }
                        process=child.process;thread=child.thread;pid=child.pid;
                    });
                if(code!=0)why="GAME_JOB_FAILED";
                else if(!ColdDesk.AudioReadback)why="GAME_AUDIO_READBACK_MISSING";
            });
        } catch(Win32Exception error) { why="ISOLATED_WIN32_"+error.NativeErrorCode; }
        finally {Console.SetOut(output);}
        return why;
    }
}
