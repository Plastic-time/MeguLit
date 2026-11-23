using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;

sealed class OrdinaryScanService : ServiceBase {
    private Process host;
    private volatile bool stopping;
#if ENHANCED_SEED
    const string Name = "MeguLitEnhancedSeed";
    const string Script = @"app\tools\enhanced-seed-queue-host.cjs";
    const string Config = @"private\enhanced-host.json";
    const string Mode = " --service";
#else
    const string Name = "MeguLitOrdinaryScan";
    const string Script = @"app\relay\scan-service\windows-host.cjs";
    const string Config = @"private\host.json";
    const string Mode = "";
#endif
    private OrdinaryScanService() { ServiceName = Name; }
    protected override void OnStart(string[] args) {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var script = Path.Combine(root, Script);
        var config = Path.Combine(root, Config);
        host = new Process();
        host.StartInfo = new ProcessStartInfo(Path.Combine(root, @"runtime\node.exe"), "\"" + script + "\" \"" + config + "\"" + Mode) {
            RedirectStandardInput = Mode.Length != 0, WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
        };
        host.EnableRaisingEvents = true;
        host.Exited += (sender, ev) => { if (!stopping) Environment.Exit(1); };
        host.Start();
    }
    protected override void OnStop() {
        stopping = true;
#if ENHANCED_SEED
        if (host != null && !host.HasExited) {
            RequestAdditionalTime(30000);
            host.StandardInput.Close();
            host.WaitForExit(25000);
        }
#endif
        if (host != null && !host.HasExited) { host.Kill(); host.WaitForExit(5000); }
        if (host != null) host.Dispose();
    }
    static void Main() { ServiceBase.Run(new OrdinaryScanService()); }
}
