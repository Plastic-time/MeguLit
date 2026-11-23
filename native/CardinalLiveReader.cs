// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

internal static partial class CardinalCollector {

    // The signing supervisor owns both child pipes. It receives only measurements
    // from these workers. It never accepts a report from its caller.
    static int LiveHost(int port) {
        var tools=AppDomain.CurrentDomain.BaseDirectory;
        var start=new ProcessStartInfo(Path.Combine(tools,"node.exe"),
            "\""+Path.Combine(tools,"cardinal-live-host.cjs")+"\" "+port) {
            UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=tools,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
        };
        using(var child=Process.Start(start)){
            var forward=new System.Threading.Thread(delegate(){
                try {
                    string line;
                    while((line=ReadBoundedLine())!=null){
                        child.StandardInput.WriteLine(line);child.StandardInput.Flush();
                    }
                } catch(IOException) {} catch(ObjectDisposedException) {}
                finally {try{child.StandardInput.Close();}catch(InvalidOperationException){}}
            });
            forward.IsBackground=true;forward.Start();
            var errors=child.StandardError.BaseStream.CopyToAsync(Console.OpenStandardError());
            child.StandardOutput.BaseStream.CopyTo(Console.OpenStandardOutput());
            child.WaitForExit();errors.GetAwaiter().GetResult();return child.ExitCode;
        }
    }

    static string ReadBoundedLine(){
        var buffer=new StringBuilder();
        int ch;
        while((ch=Console.Read())>=0 && ch!=10){
            if(buffer.Length>=270000)throw new IOException("LIVE_REQUEST_LIMIT");
            buffer.Append((char)ch);
        }
        return ch<0 && buffer.Length==0 ? null : buffer.ToString();
    }

    static async Task ReadFrames(PipeStream pipe,BlockingCollection<string> frames,string ended){
        var server=pipe as NamedPipeServerStream;
        if(server!=null)await Task.Factory.FromAsync(server.BeginWaitForConnection,server.EndWaitForConnection,null);
        var bytes=new byte[8192];
        using(var record=new MemoryStream()){
            for(;;){
                int n=await pipe.ReadAsync(bytes,0,bytes.Length);
                if(n==0)throw new EndOfStreamException(ended);
                int from=0;
                for(int i=0;i<n;i++){
                    if(bytes[i]!=10)continue;
                    if(record.Length+i-from>65536)throw new IOException("NATIVE_RECORD_LIMIT");
                    record.Write(bytes,from,i-from);
                    if(!frames.TryAdd(new UTF8Encoding(false,true).GetString(record.ToArray())))throw new IOException("NATIVE_STREAM_OVERRUN");
                    record.SetLength(0);from=i+1;
                }
                record.Write(bytes,from,n-from);
                if(record.Length>65536)throw new IOException("NATIVE_RECORD_LIMIT");
            }
        }
    }

    [System.Runtime.InteropServices.DllImport("kernel32.dll",SetLastError=true)]
    static extern bool GetNamedPipeServerProcessId(Microsoft.Win32.SafeHandles.SafePipeHandle pipe,out uint pid);

    [System.Runtime.InteropServices.DllImport("kernelbase.dll",CharSet=System.Runtime.InteropServices.CharSet.Unicode,SetLastError=true)]
    static extern bool GetAppContainerNamedObjectPath(IntPtr token,byte[] sid,uint length,StringBuilder path,out uint required);

    static NamedPipeClientStream GameDialoguePipe(string challenge,string sid,int pid){
        var package=new System.Security.Principal.SecurityIdentifier(sid);
        var sidBytes=new byte[package.BinaryLength];
        package.GetBinaryForm(sidBytes,0);
        var scope=new StringBuilder(1024);uint required;
        if(!GetAppContainerNamedObjectPath(IntPtr.Zero,sidBytes,(uint)scope.Capacity,scope,out required))
            throw new System.ComponentModel.Win32Exception();
        string localScope=scope.ToString().Trim('\\');
        using(var current=Process.GetCurrentProcess()){
            if(localScope.StartsWith(@"AppContainerNamedObjects\",StringComparison.OrdinalIgnoreCase))
                localScope=@"Sessions\"+current.SessionId+@"\"+localScope;
        }
        var client=new NamedPipeClientStream(".",localScope+@"\megulit-dialogue-"+challenge,
            PipeDirection.In,PipeOptions.Asynchronous,System.Security.Principal.TokenImpersonationLevel.Anonymous);
        try{
            client.Connect(5000);
            uint sender;
            if(!GetNamedPipeServerProcessId(client.SafePipeHandle,out sender)||sender!=pid)
                throw new IOException("LIVE_DIALOGUE_OWNER");
            return client;
        }catch{client.Dispose();throw;}
    }

    static int LiveReader(string root,int port) {
        root=Path.GetFullPath(root);
        var ctx=Json.Deserialize<Dictionary<string,object>>(ReadBoundedLine());
        string challenge=(string)ctx["challenge"],desktop=(string)ctx["desktop"],hwnd=(string)ctx["hwnd"];
        string exe=Path.GetFullPath((string)ctx["exe"]),birth=(string)ctx["birth"];
        int pid=(int)ctx["pid"];
        if(port<1 || !Regex.IsMatch(challenge,@"\A[a-f0-9]{64}\z") ||
            !Regex.IsMatch(desktop,@"\ACardinal[a-f0-9]{32}\z") ||
            !Regex.IsMatch(exe,@"\A(?:F:|D:\\MeguLit-Work)\\MeguLit\.Probe\.[a-f0-9]{32}\\game\\[^\\]+\.exe\z",RegexOptions.IgnoreCase) ||
            (!root.StartsWith(@"F:\",StringComparison.OrdinalIgnoreCase) && !root.StartsWith(@"D:\MeguLit-Work\",StringComparison.OrdinalIgnoreCase)) ||
            !File.Exists(Path.Combine(root,"services","server.cjs")))throw new IOException("LIVE_TARGET");
        if(!Regex.IsMatch(hwnd,@"\A[1-9][0-9]{0,18}\z"))throw new IOException("LIVE_HWND");
        bool plugin=ctx.ContainsKey("pluginHash") && ctx["pluginHash"]!=null;
        using(var dialogue=plugin?GameDialoguePipe(challenge,(string)ctx["packageSid"],pid):null)
        using(var sources=new BlockingCollection<string>(16))
        using(var game=Process.GetProcessById(pid))
        using(var pipe=new NamedPipeServerStream("megulit-cardinal-"+challenge,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))
        using(var frames=new BlockingCollection<string>(512)){
            Action verifyGame=delegate{
                if(game.HasExited)throw new IOException("LIVE_GAME_EXITED");
                if(game.StartTime.ToUniversalTime().Ticks.ToString()!=birth)throw new IOException("LIVE_GAME_BIRTH");
                if(!String.Equals(game.MainModule.FileName,exe,StringComparison.OrdinalIgnoreCase))throw new IOException("LIVE_GAME_IMAGE");
                // The worker's monitoring thread stays on its original desktop. The native
                // window list comes from the GalWindowBridge running on the game desktop.

            };
            verifyGame();
            var pending=ReadFrames(pipe,frames,"LIVE_SERVICE_PIPE_ENDED");
            var dialoguePending=plugin?ReadFrames(dialogue,sources,"LIVE_GAME_PIPE_ENDED"):null;
            int sequence=0;
            bool serviceVerified=false;
            if(plugin)Environment.SetEnvironmentVariable("MEGULIT_DIALOGUE_TARGET",pid+"|"+birth);
            string tools=AppDomain.CurrentDomain.BaseDirectory;
            Environment.SetEnvironmentVariable("MEGULIT_ROOT",root);
            Environment.SetEnvironmentVariable("MEGULIT_RELAY_BASE","off");
            Environment.SetEnvironmentVariable("MEGULIT_OFFLINE","1");
            Environment.SetEnvironmentVariable("MEGULIT_SIDE_BY_SIDE","1");
            Environment.SetEnvironmentVariable("MEGULIT_NO_HOTKEYS","1");
            Environment.SetEnvironmentVariable("MEGULIT_COLLECTOR_SESSION",challenge);
            Environment.SetEnvironmentVariable("NODE_OPTIONS","--require \""+Path.Combine(tools,"cardinal-native-tap.cjs").Replace('\\','/')+"\"");
            Environment.SetEnvironmentVariable("MEGULIT_WEBVIEW_ARGS","--remote-debugging-port="+port+" --remote-debugging-address=127.0.0.1 --mute-audio");
            string probe=File.ReadAllText(Path.Combine(tools,"cardinal-dom-probe.js"));
            var output=Console.Out;Console.SetOut(Console.Error);
            Action<object> emit=v=>{output.WriteLine(Json.Serialize(new {challenge,value=v}));output.Flush();};
            bool opened=false,bindRequested=false,available=false;
            var windowClock=Stopwatch.StartNew();
            long nextWindowRequestMs=0;
            string pageId=null;
            try {
                return ColdDesk.Run(new[]{"run",Path.Combine(root,"MeguLit.exe"),"--seconds",Convert.ToString(ctx["seconds"])},
                    desktop,"--headless-ui-check",delegate(IntPtr job,int rootPid){
                        verifyGame();
                        if(pending.IsCompleted)pending.GetAwaiter().GetResult();
                        string line;
                        while(frames.TryTake(out line)){
                            var f=Json.Deserialize<Dictionary<string,object>>(line);
                            uint client;
                            if(!Equals(f["challenge"],challenge)||!GetNamedPipeClientProcessId(pipe.SafePipeHandle,out client) ||
                                !Equals(f["servicePid"],(int)client))throw new IOException("LIVE_PIPE_OWNER");
                            using(var svc=Process.GetProcessById((int)client))VerifyImage(job,svc,Path.Combine(root,"runtime","node.exe"));
                            serviceVerified=true;
                            if(Equals(f["kind"],"native")){
                                string name=(string)f["name"];
                                if(name!="HookBridge.exe" && name!="GalWindowBridge.exe")throw new IOException("LIVE_BRIDGE_NAME");
                                var m=(Dictionary<string,object>)f["m"];
                                try{
                                    using(var bridge=Process.GetProcessById((int)f["bridgePid"]))
                                        VerifyImage(job,bridge,Path.Combine(root,"native",name));
                                } catch(Exception error){
                                    if(!(error is ArgumentException || error is InvalidOperationException || error is System.ComponentModel.Win32Exception))throw;
                                    // A buffered terminal status from a retired bridge is diagnostic only.
                                    if(name!="HookBridge.exe" || !new[]{"hookError","hookStatus","hookHeartbeat","hookProcess"}.Contains((string)m["type"]))throw;
                                    emit(new {kind="retiredBridgeStatus",pid=f["bridgePid"],status=m});
                                    continue;
                                }
                                if(name=="HookBridge.exe"){
                                    var args=(System.Collections.IList)f["args"];
                                    if(args.Count<4 || !Equals(args[0],pid.ToString()) || !Equals(args[1],hwnd) || !Equals(args[3],birth))throw new IOException("LIVE_HOOK_OWNER");
                                }
                                if(Equals(m["type"],"windows")){
                                    foreach(Dictionary<string,object> w in (System.Collections.IList)m["windows"])
                                        if(Equals(w["hwnd"],hwnd)&&Equals(w["pid"],pid))available=true;
                                    emit(new {kind="windowList",targetPresent=available});
                                    continue;
                                }
                            }
                            emit(f);
                        }
                        if(plugin && serviceVerified){
                            if(dialoguePending.IsCompleted)dialoguePending.GetAwaiter().GetResult();
                            while(sources.TryTake(out line)){
                                uint sender;
                                if(!GetNamedPipeServerProcessId(dialogue.SafePipeHandle,out sender)||sender!=pid)
                                    throw new IOException("LIVE_DIALOGUE_OWNER");
                                verifyGame();
                                var record=Json.Deserialize<Dictionary<string,object>>(line);
                                if(!Equals(record["challenge"],challenge)||!Equals(record["sequence"],++sequence)
                                    || !(record["text"] is string) || String.IsNullOrWhiteSpace((string)record["text"]))
                                    throw new IOException("LIVE_DIALOGUE_FRAME");
                                if(pageId==null || !bindRequested)throw new IOException("LIVE_DIALOGUE_BEFORE_READER");
                                byte[] data=Encoding.UTF8.GetBytes(Json.Serialize(new {challenge,sequence,text=record["text"]})+"\n");
                                pipe.Write(data,0,data.Length);
                            }
                        }
                        int browserPid=Listener(port);if(browserPid==0)return false;
                        using(var browser=Process.GetProcessById(browserPid)){
                            long ticks=browser.StartTime.ToUniversalTime().Ticks;
                            Verify(browser,job,ticks,port);
                            var pages=Targets(port);
                            var reader=pages.SingleOrDefault(p=>Equals(p["url"],"http://tauri.localhost/reader/index.html"));
                            if(reader==null){
                                var main=pages.SingleOrDefault(p=>Equals(p["url"],"http://tauri.localhost/")||Equals(p["url"],"http://tauri.localhost/index.html"));
                                if(!opened && main!=null)opened=Evaluate(PageUrl(main,port),"window.__TAURI_INTERNALS__?.invoke('reader_open',{background:false}).then(()=> 'opened')")=="opened";
                                return false;
                            }
                            var url=PageUrl(reader,port);
                            if(pageId!=null && !Equals(reader["id"],pageId))throw new IOException("LIVE_PAGE_CHANGED");
                            if(pageId==null){
                                if(Evaluate(url,"String(window.__TOME_READER_READY__ === true)")!="true")return false;
                                pageId=(string)reader["id"]; Evaluate(url,probe);
                                emit(new {kind="page",pageId});
                            }
                            if(!available && windowClock.ElapsedMilliseconds>=nextWindowRequestMs){
                                Evaluate(url,"window.__TAURI_INTERNALS__.invoke('service',{request:{action:'reader_message',message:{type:'galWindows'}}}).then(()=> 'sent')");
                                nextWindowRequestMs=windowClock.ElapsedMilliseconds+2000;
                            }
                            if(available && !bindRequested){
                                verifyGame();
                                var message=Json.Serialize(new {type="galBind",hwnd,processName=Path.GetFileNameWithoutExtension(exe)});
                                Evaluate(url,"window.__TAURI_INTERNALS__.invoke('service',{request:{action:'reader_message',message:"+message+"}}).then(()=> 'sent')");
                                bindRequested=true;
                            }
                            string dom=Evaluate(url,"JSON.stringify({sample:window.__replayProbe(),pid:String(window.__tomoyoChinese.tomeHookStatus().gameProcessId),birth:String(window.__tomoyoChinese.tomeHookStatus().gameStarted),translation:("+TranslationExpression+")})");
                            Verify(browser,job,ticks,port);verifyGame();
                            emit(new {kind="dom",pageId,dom=Json.DeserializeObject(dom)});
                        }
                        return false;
                    },null,true);
            } catch(Exception error){output.WriteLine(Json.Serialize(new {challenge,reason=error.GetBaseException().Message}));output.Flush();throw;} finally {Console.SetOut(output);}
        }
    }
}
