using System;using System.IO;using System.Diagnostics;using System.Security.Cryptography;using System.Text;using System.Windows.Forms;
[assembly:System.Reflection.AssemblyTitle("ToMe")]
[assembly:System.Reflection.AssemblyProduct("ToMe")]
[assembly:System.Reflection.AssemblyVersion("4.0.0.0")]
static class Launcher{
 [STAThread]static int Main(string[] args){try{
  if(args.Length==2&&args[0]=="--vault"){string input=Console.In.ReadToEnd();if(args[1]=="seal")Console.Write(Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(input),null,DataProtectionScope.CurrentUser)));else if(args[1]=="open")Console.Write(Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(input),null,DataProtectionScope.CurrentUser)));else return 2;return 0;}
  string root=AppDomain.CurrentDomain.BaseDirectory,node=Path.Combine(root,"runtime","node.exe");if(!File.Exists(node))throw new Exception("缺少 runtime/node.exe，请完整解压程序包");
  var start=new ProcessStartInfo(node,"\""+Path.Combine(root,"app","bootstrap.cjs")+"\""+(args.Length==1&&args[0]=="--check"?" --check":"")){WorkingDirectory=root,UseShellExecute=false,CreateNoWindow=true,WindowStyle=ProcessWindowStyle.Hidden};
  using(var child=Process.Start(start)){child.WaitForExit();return child.ExitCode;}
 }catch(Exception e){if(args.Length>0&&args[0]=="--vault"){Console.Error.Write(e.Message);return 1;}MessageBox.Show(e.Message,"ToMe",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}}
}
