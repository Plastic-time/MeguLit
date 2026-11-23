// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using Microsoft.Win32.SafeHandles;
using System.Threading.Tasks;
using System.Linq;
using System.Net;
using System.Net.WebSockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static partial class CardinalCollector {
    static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 300000 };
    [DllImport("iphlpapi.dll")]
    static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool sort, int family, int tableClass, uint reserved);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool member);

    // MIB_TCPTABLE_OWNER_PID for IPv4 listeners. Require a unique, loopback-only row.
    static int Listener(int port) {
        int size = 0;
        if (GetExtendedTcpTable(IntPtr.Zero, ref size, false, 2, 3, 0) != 122 || size < 4 || size > 16777216)
            throw new IOException("TCP_TABLE_UNAVAILABLE");
        var table = Marshal.AllocHGlobal(size);
        try {
            if (GetExtendedTcpTable(table, ref size, false, 2, 3, 0) != 0) throw new IOException("TCP_TABLE_CHANGED");
            int count = Marshal.ReadInt32(table), owner = 0;
            if (count < 0 || count > (size-4)/24) throw new IOException("TCP_TABLE_INVALID");
            for (int i=0; i<count; ++i) {
                var row = IntPtr.Add(table, 4+i*24);
                if ((ushort)IPAddress.NetworkToHostOrder(Marshal.ReadInt16(row,8)) != port) continue;
                if (Marshal.ReadInt32(row,4) != 0x0100007f || owner != 0) throw new IOException("CDP_AMBIGUOUS_LISTENER");
                owner = Marshal.ReadInt32(row,20);
            }
            return owner;
        } finally { Marshal.FreeHGlobal(table); }
    }

    static void Verify(Process browser, IntPtr job, long birth, int port) {
        bool member;
        if (!IsProcessInJob(browser.Handle, job, out member) || !member || browser.HasExited ||
            browser.StartTime.ToUniversalTime().Ticks != birth || Listener(port) != browser.Id ||
            !browser.ProcessName.Equals("msedgewebview2",StringComparison.OrdinalIgnoreCase))
            throw new IOException("CDP_PROCESS_BINDING");
    }

    const string TranslationExpression = @"(()=>{const row=document.querySelector('.tomoyo-cn-output[data-state=ready]');
                if(!row || !row.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))return null;
                const box=row.getBoundingClientRect();return box.width && box.height ? row.innerText : null})()";

    static string Evaluate(Uri target,string expression) {
        using (var cancel = new CancellationTokenSource(3000))
        using (var ws = new ClientWebSocket()) {
            ws.Options.Proxy = null;
            ws.ConnectAsync(target,cancel.Token).GetAwaiter().GetResult();
            var command = Json.Serialize(new {id=1,method="Runtime.evaluate",@params=new {expression=expression,awaitPromise=true,returnByValue=true}});
            ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(command)),WebSocketMessageType.Text,true,cancel.Token).Wait();
            var buffer=new byte[4096];
            using(var body=new MemoryStream()) {
                WebSocketReceiveResult part;
                do {
                    part=ws.ReceiveAsync(new ArraySegment<byte>(buffer),cancel.Token).Result;
                    if(part.MessageType!=WebSocketMessageType.Text || body.Length+part.Count>65536)throw new IOException("CDP_RESPONSE");
                    body.Write(buffer,0,part.Count);
                } while(!part.EndOfMessage);
                var reply=Json.DeserializeObject(Encoding.UTF8.GetString(body.ToArray())) as Dictionary<string,object>;
                if (!Equals(reply["id"],1)) throw new IOException("CDP_COMMAND_ID");
                var result=(Dictionary<string,object>)reply["result"];
                if(result.ContainsKey("exceptionDetails"))throw new IOException("CDP_EVALUATION_FAILED");
                var value=(Dictionary<string,object>)result["result"];
                return value.ContainsKey("value") ? value["value"] as string : null;
            }
        }
    }

    // A neutral WebView2 child for testing the actual private desktop, browser job,
    // PID reuse checks and CDP transport without touching any game or user profile.
    static int ProbeChild(string dir) {
        Application.EnableVisualStyles();
        using(var form=new Form())
        using(var view=new WebView2()) {
            view.Dock=DockStyle.Fill; form.Controls.Add(view);
            form.Shown+=async delegate {
                try {
                    var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(dir,"webview"),
                        new CoreWebView2EnvironmentOptions("--remote-debugging-port=0 --remote-debugging-address=127.0.0.1"));
                    await view.EnsureCoreWebView2Async(env);
                    view.NavigationCompleted+=delegate {
                        using(var browser=Process.GetProcessById((int)view.CoreWebView2.BrowserProcessId)) {
                            File.WriteAllText(Path.Combine(dir,"identity.tmp"),browser.Id+"\n"+browser.StartTime.ToUniversalTime().Ticks);
                            File.Move(Path.Combine(dir,"identity.tmp"),Path.Combine(dir,"identity"));
                        }
                    };
                    view.NavigateToString("<title>Cardinal diagnostic</title><span class='tomoyo-cn-output' data-state='ready'>"+Path.GetFileName(dir)+"</span>");
                } catch(Exception e) { Console.Error.WriteLine(e.Message); form.Close(); }
            };
            Application.Run(form); return 0;
        }
    }

    static Dictionary<string,object>[] Targets(int port) {
        var http=(HttpWebRequest)WebRequest.Create("http://127.0.0.1:"+port+"/json/list");
        http.Proxy=null; http.Timeout=2000; http.ReadWriteTimeout=2000; http.AllowAutoRedirect=false;
        using(var res=http.GetResponse())
        using(var reader=new StreamReader(res.GetResponseStream())) {
            var bounded=new char[65537]; int length=reader.ReadBlock(bounded,0,bounded.Length);
            if(length==bounded.Length)throw new IOException("CDP_TARGET_LIMIT");
            return Json.Deserialize<Dictionary<string,object>[]>(new string(bounded,0,length));
        }
    }

    static Uri PageUrl(Dictionary<string,object> page,int port) {
        var url=new Uri((string)page["webSocketDebuggerUrl"]);
        if(url.Scheme!="ws" || url.Host!="127.0.0.1" || url.Port!=port || !url.AbsolutePath.StartsWith("/devtools/page/"))throw new IOException("CDP_TARGET");
        string id=page["id"] as string;
        if(String.IsNullOrEmpty(id) || url.AbsolutePath!="/devtools/page/"+id)throw new IOException("CDP_TARGET_ID");
        return url;
    }

    [DllImport("kernel32.dll",SetLastError=true)]
    static extern bool GetNamedPipeClientProcessId(SafePipeHandle pipe,out uint pid);

    internal static void VerifyImage(IntPtr job,Process process,string expected) {
        bool member;
        if(!IsProcessInJob(process.Handle,job,out member) || !member || process.HasExited ||
           !String.Equals(process.MainModule.FileName,expected,StringComparison.OrdinalIgnoreCase))
            throw new IOException("NATIVE_PROCESS_BINDING");
    }

    // A bounded single-record read. The diagnostic only accepts the real
    // bridge ready event. A ready event cannot certify a dialogue episode.
    static async Task<string> ReadRecord(NamedPipeServerStream pipe) {
        await Task.Factory.FromAsync(pipe.BeginWaitForConnection,pipe.EndWaitForConnection,null);
        var bytes=new byte[4096];
        using(var data=new MemoryStream()) {
            for(;;) {
                int n=await pipe.ReadAsync(bytes,0,bytes.Length);
                if(n==0 || data.Length+n>65536)throw new IOException("NATIVE_RECORD_INCOMPLETE");
                int end=Array.IndexOf(bytes,(byte)10,0,n);
                data.Write(bytes,0,end<0?n:end);
                if(end>=0)return new UTF8Encoding(false,true).GetString(data.ToArray());
            }
        }
    }

    // The root is a disposable diagnostic installation with no player data.
    // Use the desktop host's real reader_open and reader_connect, without adding
    // messages, translations or a mock invoke transport to the running Reader.
    static int ReaderProbe(string root,int configuredPort,string desktop=null) {
        root=Path.GetFullPath(root);
        if(!Path.GetPathRoot(root).Equals(@"F:\",StringComparison.OrdinalIgnoreCase) ||
           !File.Exists(Path.Combine(root,"services","server.cjs")) ||
           Directory.Exists(Path.Combine(root,"cache")) || Directory.Exists(Path.Combine(root,"data")))
            throw new IOException("FRESH_F_DRIVE_APP_REQUIRED");
        Environment.SetEnvironmentVariable("MEGULIT_ROOT",root);
        Environment.SetEnvironmentVariable("MEGULIT_OFFLINE","1");
        Environment.SetEnvironmentVariable("MEGULIT_COLLECTOR_WINDOWS",desktop==null?null:"1");
        Environment.SetEnvironmentVariable("MEGULIT_SIDE_BY_SIDE","1");
        Environment.SetEnvironmentVariable("MEGULIT_RELAY_BASE","off");
        Environment.SetEnvironmentVariable("MEGULIT_WEBVIEW_ARGS","--remote-debugging-port="+configuredPort+" --remote-debugging-address=127.0.0.1");
        string session=Guid.NewGuid().ToString("N");
        string tap=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"cardinal-native-tap.cjs");
        if(!File.Exists(tap))throw new IOException("NATIVE_TAP_MISSING");
        Environment.SetEnvironmentVariable("NODE_OPTIONS","--require \""+tap.Replace(Path.DirectorySeparatorChar,'/')+"\"");
        Environment.SetEnvironmentVariable("MEGULIT_COLLECTOR_SESSION",session);
        using(var pipe=new NamedPipeServerStream("megulit-cardinal-"+session,PipeDirection.InOut,1,
                PipeTransmissionMode.Byte,PipeOptions.Asynchronous)) {
        var record=ReadRecord(pipe);
        bool opened=false,requestedWindows=false; string observation=null;
        var output=Console.Out; Console.SetOut(Console.Error);
        int code;
        try {
            code=ColdDesk.Run(new[]{"run",Path.Combine(root,"MeguLit.exe"),"--seconds","50"},
                desktop ?? ("Cardinal"+Guid.NewGuid().ToString("N")),"--headless-ui-check",delegate(IntPtr job,int rootPid) {
                    string cache=Path.Combine(root,"cache");
                    if(!Directory.Exists(cache))return false;
                    var ports=configuredPort>0 ? new[]{configuredPort} :
                        Directory.GetFiles(cache,"DevToolsActivePort",SearchOption.AllDirectories)
                            .Select(f=>int.Parse(File.ReadLines(f).First())).ToArray();
                    foreach(int port in ports) {
                        if(configuredPort>0 && Listener(port)==0)continue;
                        using(var browser=Process.GetProcessById(Listener(port))) {
                            long birth=browser.StartTime.ToUniversalTime().Ticks;
                            Verify(browser,job,birth,port);
                            var pages=Targets(port).Where(p=>Equals(p["type"],"page")).ToList();
                            var reader=pages.SingleOrDefault(p=>Equals(p["url"],"http://tauri.localhost/reader/index.html"));
                            if(reader!=null) {
                                var target=PageUrl(reader,port);
                                if(Evaluate(target,"String(window.__TOME_READER_READY__ === true)")!="true")continue;
                                var sample=Evaluate(target,TranslationExpression);
                                Verify(browser,job,birth,port);
                                if(desktop!=null && !requestedWindows){
                                    Evaluate(target,"window.__TAURI_INTERNALS__.invoke('service',{request:{action:'reader_message',message:{type:'galWindows'}}}).then(()=> 'sent')");
                                    requestedWindows=true;
                                }
                                if(!record.IsCompleted)continue;
                                uint servicePid;
                                if(!GetNamedPipeClientProcessId(pipe.SafePipeHandle,out servicePid))throw new IOException("NATIVE_PIPE_IDENTITY");
                                var frame=Json.Deserialize<Dictionary<string,object>>(record.GetAwaiter().GetResult());
                                if(!Equals(frame["challenge"],session) || !Equals(frame["servicePid"],(int)servicePid) ||
                                   !Equals(frame["name"],"GalWindowBridge.exe") ||
                                   !Equals(((Dictionary<string,object>)frame["m"])["type"],desktop==null?"ready":"windows"))throw new IOException("NATIVE_BRIDGE_READY");
                                using(var service=Process.GetProcessById((int)servicePid))
                                using(var bridge=Process.GetProcessById((int)frame["bridgePid"])) {
                                    VerifyImage(job,service,Path.Combine(root,"runtime","node.exe"));
                                    VerifyImage(job,bridge,Path.Combine(root,"native","GalWindowBridge.exe"));
                                    observation=Json.Serialize(new {schema="megulit.reader-diagnostic",readerTargetId=reader["id"],session,bridgePid=bridge.Id,bridgeBirth=bridge.StartTime.ToUniversalTime().Ticks.ToString(),nativeEvent=desktop==null?"ready":"windows",windows=desktop==null?null:((Dictionary<string,object>)frame["m"])["windows"],signed=false,rootPid,browserPid=browser.Id,birth=birth.ToString(),port,translation=sample});
                                }
                                return true;
                            }
                            if(!opened) {
                                var main=pages.SingleOrDefault(p=>Equals(p["url"],"http://tauri.localhost/")||Equals(p["url"],"http://tauri.localhost/index.html"));
                                if(main==null)continue;
                                var result=Evaluate(PageUrl(main,port),"window.__TAURI_INTERNALS__.invoke('reader_open',{background:false}).then(()=> 'opened')");
                                Verify(browser,job,birth,port);
                                opened=result=="opened";
                            }
                        }
                    }
                    return false;
                });
        } finally {Console.SetOut(output);}
        if(code!=0 || observation==null)throw new IOException("READER_PROBE_INCOMPLETE");
        Console.WriteLine(observation); return 0;
        }
    }

    static int Probe(string dir) {
        var file=Path.Combine(dir,"identity");
        string observation=null;
        var diagnostics=Console.Out;
        Console.SetOut(Console.Error);
        int code;
        try {
            code=ColdDesk.Run(new[]{"run",Application.ExecutablePath,"--seconds","35"},"Cardinal"+Guid.NewGuid().ToString("N"),
                "--webview-probe "+Path.GetFileName(dir),delegate(IntPtr job,int rootPid) {
                    if(!File.Exists(file)) return false;
                    string[] id=File.ReadAllLines(file);
                    using(var browser=Process.GetProcessById(int.Parse(id[0]))) {
                        var hint=Directory.GetFiles(Path.Combine(dir,"webview"),"DevToolsActivePort",SearchOption.AllDirectories).Single();
                        int port=int.Parse(File.ReadAllLines(hint)[0]);
                        long birth=long.Parse(id[1]);
                        Verify(browser,job,birth,port);
                        var page=Targets(port).Single(p=>Equals(p["type"],"page")&&Equals(p["title"],"Cardinal diagnostic"));
                        var url=PageUrl(page,port);
                        {
                            Verify(browser,job,birth,port);
                            var sample=Evaluate(url,TranslationExpression);
                            Verify(browser,job,birth,port);
                            if(sample!=Path.GetFileName(dir))throw new IOException("CDP_DOM_BINDING");
                            observation=Json.Serialize(new {schema="megulit.collector-diagnostic",signed=false,rootPid,browserPid=browser.Id,birth=birth.ToString(),port,sample});
                        }
                    }
                    return true;
                });
        } finally { Console.SetOut(diagnostics); }
        if(code!=0 || observation==null)throw new IOException("PROBE_INCOMPLETE");
        Console.WriteLine(observation); return 0;
    }

    static void StripCredentials() {
        // The runner already launches capture with a reduced environment. Apply
        // the same boundary when an operator starts a diagnostic directly.
        var allowed=new HashSet<string>(new[]{"SystemRoot","WINDIR","PATH","TEMP","TMP","ProgramFiles",
            "ProgramFiles(x86)","ProgramW6432","ProgramData","LOCALAPPDATA","APPDATA","USERPROFILE",
            "SystemDrive","COMSPEC","PROCESSOR_ARCHITECTURE","NUMBER_OF_PROCESSORS"},StringComparer.OrdinalIgnoreCase);
        foreach(string key in Environment.GetEnvironmentVariables().Keys)
            if(!allowed.Contains(key))Environment.SetEnvironmentVariable(key,null);
    }

    static void VerifyLiveBundle() {
        var root=AppDomain.CurrentDomain.BaseDirectory;
        using(var manifest=typeof(CardinalCollector).Assembly.GetManifestResourceStream("cardinal-bundle.txt"))
        using(var reader=new StreamReader(manifest))
        using(var sha=System.Security.Cryptography.SHA256.Create()){
            string line;
            while((line=reader.ReadLine())!=null){
                string file=Path.Combine(root,line.Substring(65));
                using(var input=File.OpenRead(file)){
                    string actual=BitConverter.ToString(sha.ComputeHash(input)).Replace("-","");
                    if(actual!=line.Substring(0,64))throw new IOException("LIVE_BUNDLE_CHANGED");
                }
            }
        }
    }

    [STAThread] public static int Main(string[] args) {
        try {
            if(args.Length==2 && args[0]=="--webview-probe" && Regex.IsMatch(args[1],"^cardinal-[a-f0-9]{32}$"))
                return ProbeChild(Path.Combine(@"F:\",args[1]));
            StripCredentials();
            Console.InputEncoding=new UTF8Encoding(false);
            Console.OutputEncoding=new UTF8Encoding(false);
            int port=0;
            if(args.Length>=2 && args[args.Length-2]=="--cdp-port") {
                if(!int.TryParse(args.Last(),out port) || port<1 || port>65535)throw new IOException("CDP_PORT_INVALID");
                args=args.Take(args.Length-2).ToArray();
                // Bind exclusively before launch. Job + birth checks remain mandatory
                // after WebView2 opens the port because this preflight is not a lease.
                var socket=new System.Net.Sockets.TcpListener(IPAddress.Loopback,port);
                socket.ExclusiveAddressUse=true;
                try { socket.Start(); } finally { socket.Stop(); }
            }
            if(args.Length==2 && args[0]=="--live-reader")return LiveReader(args[1],port);
            if((args.Length==1 && args[0]=="--live") || (args.Length==0 && File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"cardinal-live-host.json")))){
                VerifyLiveBundle();
                if(port==0){var listener=new System.Net.Sockets.TcpListener(IPAddress.Loopback,0);listener.Start();
                    try{port=((IPEndPoint)listener.LocalEndpoint).Port;}finally{listener.Stop();}}
                return LiveHost(port);
            }
            if(args.Length==3 && args[0]=="--reader-windows" && Regex.IsMatch(args[2],@"\ACardinal[a-f0-9]{32}\z"))return ReaderProbe(args[1],port,args[2]);
            if(args.Length==2 && args[0]=="--reader-probe")return ReaderProbe(args[1],port);
            if(args.SequenceEqual(new[]{"--probe"})) {
                var dir=Path.Combine(@"F:\","cardinal-"+Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(dir);
                return Probe(dir);
            }
            bool worker=args.Length>1 && args[0]=="--game-worker";
            if(worker)args=args.Skip(1).ToArray();
            string saveDir="savedata";
            string template=null,templateHash=null;
            if(args.Length==9 && args[0]=="--isolated-game" && args[6]=="--save-template") {
                if(!Regex.IsMatch(args[7],@"\A[A-Za-z0-9_-]{1,64}\.org\z") ||
                    !Regex.IsMatch(args[8],@"\A[a-f0-9]{64}\z"))throw new IOException("GAME_SAVE_TEMPLATE");
                template=args[7]; templateHash=args[8]; args=args.Take(6).ToArray();
            }
            if(args.Length==6 && args[0]=="--isolated-game" && args[4]=="--save-dir") {
                if(!new[]{"sav","savedata","savedata_zh","UserData"}.Contains(args[5],StringComparer.OrdinalIgnoreCase))throw new IOException("GAME_SAVE_DIR");
                saveDir=args[5];
                args=args.Take(4).ToArray();
            }
            bool isolated=args.Length==4 && args[0]=="--isolated-game" && Regex.IsMatch(args[2],@"\A[a-f0-9]{64}\z");
            if(args.Length!=0 && !isolated)throw new ArgumentException("COLLECTOR_ARGUMENTS");
            var line=new StringBuilder(); int next;
            while((next=Console.Read())>=0 && next!=10) {
                if(line.Length>=270000)throw new IOException("CAPTURE_REQUEST_LIMIT"); line.Append((char)next);
            }
            var req=Json.Deserialize<Dictionary<string,object>>(line.ToString());
            if(!Equals(req["schema"],"megulit.trusted-capture-request") || !Equals(req["version"],1) ||
                !Regex.IsMatch((string)req["challenge"],"\\A[a-f0-9]{64}\\z") ||
                !Regex.IsMatch((string)req["reporter"],"\\A[a-zA-Z0-9_-]{1,80}\\z"))throw new IOException("CAPTURE_REQUEST");
            string failure=isolated ? CardinalGameCapture.Run(req,args[1],args[2],args[3],saveDir,template,templateHash,worker) : "OS_SAVE_NETWORK_ISOLATION_UNAVAILABLE";
            if(worker && failure==null)return 0;
            Console.WriteLine(Json.Serialize(new {schema="megulit.capture-failure",challenge=req["challenge"],reporter=req["reporter"],
                reason=failure,signed=false}));
            return 2;
        } catch(Exception e) { Console.Error.WriteLine(e.GetBaseException().Message); return 2; }
    }
}
