using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;

sealed class OrdinaryScanService : ServiceBase {
    private Process host;
    private volatile bool stopping;
    private OrdinaryScanService() { ServiceName = "MeguLitOrdinaryScan"; }
    protected override void OnStart(string[] args) {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var script = Path.Combine(root, @"app\relay\scan-service\windows-host.cjs");
        var config = Path.Combine(root, @"private\host.json");
        host = new Process();
        host.StartInfo = new ProcessStartInfo(Path.Combine(root, @"runtime\node.exe"), "\"" + script + "\" \"" + config + "\"") {
            WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true
        };
        host.EnableRaisingEvents = true;
        host.Exited += (sender, ev) => { if (!stopping) Environment.Exit(1); };
        host.Start();
    }
    protected override void OnStop() {
        stopping = true;
        if (host != null && !host.HasExited) { host.Kill(); host.WaitForExit(5000); }
        if (host != null) host.Dispose();
    }
    static void Main() { ServiceBase.Run(new OrdinaryScanService()); }
}
