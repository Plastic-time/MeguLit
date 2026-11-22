// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

// GUI fixtures can create a window long after the test process starts. Give the
// whole process tree a private desktop before any of its code runs.
internal static class RunOnTestDesktop {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    struct StartupInfo {
        public int Size;
        public string Reserved, Desktop, Title;
        public int X, Y, Width, Height, Columns, Rows, Fill, Flags;
        public short Show, ReservedSize;
        public IntPtr ReservedData, Input, Output, Error;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr Process, Thread; public uint Pid, Tid; }
    [StructLayout(LayoutKind.Sequential)]
    struct JobLimits {
        public long PerProcessTime, PerJobTime;
        public uint Flags;
        public UIntPtr MinWorkingSet, MaxWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
        public ulong ReadOps, WriteOps, OtherOps, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }

    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateDesktop(string name, IntPtr device, IntPtr mode, uint flags, uint access, IntPtr security);
    [DllImport("user32.dll")] static extern bool CloseDesktop(IntPtr desktop);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool CreateProcess(string file, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity,
        bool inherit, uint flags, IntPtr env, string cwd, ref StartupInfo startup, out ProcessInfo process);
    [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int kind);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,uint pid);
    [DllImport("kernel32.dll", SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr security, IntPtr name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int kind, ref JobLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll", SetLastError=true)] static extern uint WaitForMultipleObjects(uint count,IntPtr[] handles,bool all,uint ms);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static Win32Exception Error(string operation) {
        int code=Marshal.GetLastWin32Error();
        return new Win32Exception(code, operation+": "+new Win32Exception(code).Message);
    }

    // Quote argv for the Windows C runtime, including trailing slashes and embedded quotes.
    static string Quote(string value) {
        var result=new StringBuilder("\"");
        int slashes=0;
        foreach(char ch in value) {
            if(ch=='\\') { slashes++; continue; }
            result.Append('\\', ch=='"'?2*slashes+1:slashes).Append(ch);
            slashes=0;
        }
        return result.Append('\\',2*slashes).Append('"').ToString();
    }

    static int Main(string[] args) {
        uint parentPid;
        if(args.Length<2 || !uint.TryParse(args[0],out parentPid) || !Path.IsPathRooted(args[1])) {
            Console.Error.WriteLine("Usage: RunOnTestDesktop <parent pid> <absolute executable path> [arguments]");
            return 2;
        }
        string desktopName="MeguLitTest-"+Guid.NewGuid().ToString("N");
        IntPtr desktop=IntPtr.Zero, job=IntPtr.Zero, parent=IntPtr.Zero;
        var child=new ProcessInfo();
        bool completed=false;
        try {
            parent=OpenProcess(0x00100000,false,parentPid); // SYNCHRONIZE
            if(parent==IntPtr.Zero)throw Error("Open parent process");
            desktop=CreateDesktop(desktopName,IntPtr.Zero,IntPtr.Zero,0,0x10000000,IntPtr.Zero);
            if(desktop==IntPtr.Zero)throw Error("CreateDesktop");
            job=CreateJobObject(IntPtr.Zero,IntPtr.Zero);
            if(job==IntPtr.Zero)throw Error("CreateJobObject");
            var limits=new JobLimits { Flags=0x2000 }; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
            if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(typeof(JobLimits))))
                throw Error("SetInformationJobObject");
            var startup=new StartupInfo {
                Size=Marshal.SizeOf(typeof(StartupInfo)), Desktop=desktopName, Flags=0x100, // STARTF_USESTDHANDLES
                Input=GetStdHandle(-10), Output=GetStdHandle(-11), Error=GetStdHandle(-12)
            };
            const uint CREATE_SUSPENDED=4, CREATE_NO_WINDOW=0x08000000;
            string[] commandArgs=Array.ConvertAll(args,Quote);
            var command=new StringBuilder(string.Join(" ",commandArgs,1,commandArgs.Length-1));
            if(!CreateProcess(args[1],command,IntPtr.Zero,IntPtr.Zero,true,CREATE_SUSPENDED|CREATE_NO_WINDOW,
                IntPtr.Zero,null,ref startup,out child))throw Error("CreateProcess");
            if(!AssignProcessToJobObject(job,child.Process))throw Error("AssignProcessToJobObject");
            if(ResumeThread(child.Thread)==uint.MaxValue)throw Error("ResumeThread");
            uint signaled=WaitForMultipleObjects(2,new[]{child.Process,parent},false,uint.MaxValue);
            if(signaled==1)return 2; // parent was cancelled
            uint code;
            if(signaled!=0||!GetExitCodeProcess(child.Process,out code))
                throw Error("Wait for test process");
            completed=true;
            return unchecked((int)code);
        } catch (Win32Exception e) {
            Console.Error.WriteLine(e.Message);
            return 2;
        } finally {
            if(child.Process!=IntPtr.Zero&&!completed)TerminateProcess(child.Process,2);
            if(job!=IntPtr.Zero)CloseHandle(job);
            if(child.Thread!=IntPtr.Zero)CloseHandle(child.Thread);
            if(child.Process!=IntPtr.Zero)CloseHandle(child.Process);
            if(desktop!=IntPtr.Zero)CloseDesktop(desktop);
            if(parent!=IntPtr.Zero)CloseHandle(parent);
        }
    }
}
