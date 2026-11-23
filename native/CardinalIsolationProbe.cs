using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;

// Shared zero-capability launcher and unsigned diagnostic entry point.
internal static class CardinalIsolationProbe {
    [StructLayout(LayoutKind.Sequential)]
    struct Startup {
        public int cb;
        public IntPtr reserved,desktop,title;
        public int x,y,width,height,cols,rows,fill,flags;
        public short show,reservedBytes;
        public IntPtr reservedPtr,stdin,stdout,stderr,attributes;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct Caps { public IntPtr sid, capabilities; public int count,reserved; }
    [StructLayout(LayoutKind.Sequential)]
    internal struct Child { public IntPtr process, thread; public int pid, tid; }

    [DllImport("userenv", CharSet=CharSet.Unicode)]
    static extern int CreateAppContainerProfile(string name,string display,string description,IntPtr caps,int count,out IntPtr sid);
    [DllImport("userenv", CharSet=CharSet.Unicode)]
    static extern int DeleteAppContainerProfile(string name);
    [DllImport("advapi32")] static extern IntPtr FreeSid(IntPtr sid);
    [DllImport("kernel32",SetLastError=true)]
    static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,int flags,ref IntPtr size);
    [DllImport("kernel32",SetLastError=true)]
    static extern bool UpdateProcThreadAttribute(IntPtr list,int flags,IntPtr key,ref Caps value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32",SetLastError=true,CharSet=CharSet.Unicode)]
    static extern bool CreateProcess(string image,StringBuilder args,IntPtr ps,IntPtr ts,bool inherit,int flags,
        IntPtr environment,string directory,ref Startup startup,out Child child);
    [DllImport("kernel32")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
    [DllImport("kernel32")] static extern bool GetExitCodeProcess(IntPtr handle,out int code);
    [DllImport("kernel32")] static extern bool TerminateProcess(IntPtr handle,int code);

    static void Check(bool ok) { if(!ok) throw new Win32Exception(); }
    internal static Child Launch(string exe,string args,IntPtr sid,string desktop,bool suspended) {
        IntPtr size=IntPtr.Zero;
        InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
        IntPtr list=Marshal.AllocHGlobal(size);
        var values=new System.Collections.Generic.SortedDictionary<string,string>(StringComparer.OrdinalIgnoreCase);
        values["APPDATA"]=Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        values["LOCALAPPDATA"]=Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        values["USERPROFILE"]=Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        values["SystemDrive"]=Path.GetPathRoot(Environment.SystemDirectory).TrimEnd(Path.DirectorySeparatorChar);
        var block=new StringBuilder();
        foreach(string key in new[]{"SystemRoot","TEMP","TMP","WINDIR"})
            values[key]=Environment.GetEnvironmentVariable(key);
        foreach(var pair in values)block.Append(pair.Key).Append("=").Append(pair.Value).Append((char)0);
        IntPtr env=Marshal.StringToHGlobalUni(block.ToString()+"\0");
        try {
            Check(InitializeProcThreadAttributeList(list,1,0,ref size));
            try {
                Caps caps=new Caps {sid=sid};
                Check(UpdateProcThreadAttribute(list,0,(IntPtr)0x20009,ref caps,(IntPtr)Marshal.SizeOf(caps),IntPtr.Zero,IntPtr.Zero));
                Startup startup=new Startup { cb=Marshal.SizeOf(typeof(Startup)),attributes=list,desktop=desktop==null ? IntPtr.Zero : Marshal.StringToHGlobalUni(desktop) };
                Child child;
                try { Check(CreateProcess(exe,new StringBuilder("\""+exe+"\" "+args),IntPtr.Zero,IntPtr.Zero,false,0x08080400 | (suspended ? 4 : 0),
                    env,Path.GetDirectoryName(exe),ref startup,out child)); } finally { Marshal.FreeHGlobal(startup.desktop); }
                return child;
            } finally { DeleteProcThreadAttributeList(list); }
        } finally { Marshal.FreeHGlobal(list);Marshal.FreeHGlobal(env); }
    }
    static int RunRestricted(string exe,string args,IntPtr sid) {
        Child child=Launch(exe,args,sid,null,false);
        try {
            if(WaitForSingleObject(child.process,15000)!=0) {
                Check(TerminateProcess(child.process,80));
                Check(WaitForSingleObject(child.process,5000)==0);
                throw new TimeoutException();
            }
            int code;
            Check(GetExitCodeProcess(child.process,out code));
            return code;
        } finally { CloseHandle(child.thread);CloseHandle(child.process); }
    }
    static void Connect(string address) {
        using(var client=new TcpClient(AddressFamily.InterNetwork)) {
            var pending=client.BeginConnect(IPAddress.Parse(address),443,null,null);
            if(!pending.AsyncWaitHandle.WaitOne(5000)) throw new TimeoutException("TCP control timeout");
            client.EndConnect(pending);
        }
    }
    [DllImport("advapi32",SetLastError=true)]
    static extern bool GetTokenInformation(IntPtr token,int infoClass,out int value,int size,out int returned);

    static int Measure(string root,string address) {
        Guid run;
        const string prefix=@"F:\MeguLit.Probe.";
        if(!root.StartsWith(prefix,StringComparison.Ordinal) || !Guid.TryParseExact(root.Substring(prefix.Length),"N",out run))return 17;
        using(var current=WindowsIdentity.GetCurrent()) {
            int restricted,length;
            Check(GetTokenInformation(current.Token,29,out restricted,sizeof(int),out length));
            if(restricted!=1)return 18;
        }
        string asset=Path.Combine(root,"bin","asset");
        if(File.ReadAllText(asset)!="asset")return 15;
        try {File.WriteAllText(asset,"unexpected");return 16;} catch(UnauthorizedAccessException){}
        string save=Path.Combine(root,"save","slot");
        File.WriteAllText(save,"isolated");
        if(File.ReadAllText(save)!="isolated")return 11;
        string canary=Path.Combine(root,"outside","slot");
        try {File.ReadAllText(canary);return 12;} catch(UnauthorizedAccessException){}
        try {File.WriteAllText(canary,"unexpected");return 13;} catch(UnauthorizedAccessException){}
        try {Connect(address);return 14;} catch(SocketException e) {
            if(e.SocketErrorCode!=SocketError.AccessDenied) return e.ErrorCode;
        }
        return 0;
    }
    internal static void Grant(string path,SecurityIdentifier sid,FileSystemRights rights) {
        var info=new DirectoryInfo(path);
        var acl=info.GetAccessControl();
        acl.AddAccessRule(new FileSystemAccessRule(sid,rights,InheritanceFlags.ObjectInherit|InheritanceFlags.ContainerInherit,
            PropagationFlags.None,AccessControlType.Allow));
        info.SetAccessControl(acl);
    }
    internal static void WithIsolation(string address,string probeFile,Action<string,IntPtr> run) {
        Connect(address);
        string name="MeguLit.Probe."+Guid.NewGuid().ToString("N");
        string root=Path.Combine(@"F:\",name);
        IntPtr sid;
        Marshal.ThrowExceptionForHR(CreateAppContainerProfile(name,name,name,IntPtr.Zero,0,out sid));
        try {
            Directory.CreateDirectory(root);
            string bin=Directory.CreateDirectory(Path.Combine(root,"bin")).FullName;
            string save=Directory.CreateDirectory(Path.Combine(root,"save")).FullName;
            string outside=Directory.CreateDirectory(Path.Combine(root,"outside")).FullName;
            string canary=Path.Combine(outside,"slot");
            File.WriteAllText(canary,"host");
            var identity=new SecurityIdentifier(sid);
            Grant(bin,identity,FileSystemRights.ReadAndExecute);
            Grant(save,identity,FileSystemRights.Modify);
            string exe=Path.Combine(bin,"probe.exe");
            File.WriteAllText(Path.Combine(bin,"asset"),"asset");
            File.Copy(probeFile,exe);
            int code=RunRestricted(exe,"child \""+root+"\" "+IPAddress.Parse(address),sid);
            if(code!=0)throw new IOException("Restricted child exit "+code);
            if(File.ReadAllText(canary)!="host" || File.ReadAllText(Path.Combine(save,"slot"))!="isolated")
                throw new IOException("Host readback failed");
            if(run!=null)run(root,sid);
        } finally {
            FreeSid(sid);
            Marshal.ThrowExceptionForHR(DeleteAppContainerProfile(name));
            if(Directory.Exists(root) && Path.GetDirectoryName(Path.GetFullPath(root))==@"F:\" && Path.GetFileName(root)==name)
                Directory.Delete(root,true);
        }
    }
    internal static void AuditRuntimeReads(string probeRoot,string readerRoot,IntPtr sid) {
        if(!Path.IsPathRooted(readerRoot) || !readerRoot.StartsWith(@"F:\",StringComparison.OrdinalIgnoreCase))
            throw new IOException("LIVE_READER_ROOT");
        foreach(string group in new[]{"hook","megulithook"}){
            string folder=Path.Combine(readerRoot,"runtime",group);
            if(!Directory.Exists(folder))continue;
            foreach(string file in Directory.GetFiles(folder,"*.dll")){
                int code=RunRestricted(Path.Combine(probeRoot,"bin","probe.exe"),"read-runtime \""+file+"\"",sid);
                Console.Error.WriteLine("runtime-read result="+code+" file="+file);
            }
        }
    }

    static int Main(string[] args) {
        try {
            if(args.Length==2 && args[0]=="read-runtime"){
                try{
                    using(var token=WindowsIdentity.GetCurrent()){
                        int restricted,length;
                        Check(GetTokenInformation(token.Token,29,out restricted,sizeof(int),out length));
                        if(restricted!=1)return 18;
                    }
                    using(var stream=File.OpenRead(args[1]))return stream.ReadByte()<0?38:0;
                } catch(IOException error){return error.HResult & 65535;}
                  catch(UnauthorizedAccessException error){return error.HResult & 65535;}
            }
            if(args.Length==3 && args[0]=="child") return Measure(args[1],args[2]);
            if(args.Length!=1)throw new ArgumentException("Supply a reachable public IPv4 TCP/443 control endpoint");
            WithIsolation(args[0],Assembly.GetExecutingAssembly().Location,null);
            Console.WriteLine("Neutral probe passed: host TCP/443 connected, restricted TCP access denied, disposable write verified, outside canary read/write denied");
            return 0;
        } catch(Exception e) { Console.Error.WriteLine(e); return 2; }
    }
}
