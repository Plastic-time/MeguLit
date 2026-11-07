// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Security.Cryptography;
using System.Text;
static class KeyVault {
 [STAThread] static int Main(string[] args) {
  if(args.Length!=2 || args[0]!="--vault")return 2;
  try {
   string input=Console.In.ReadToEnd();
   if(args[1]=="seal")Console.Write(Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(input),null,DataProtectionScope.CurrentUser)));
   else if(args[1]=="open")Console.Write(Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(input),null,DataProtectionScope.CurrentUser)));
   else return 2;
   return 0;
  }catch {Console.Error.Write("VAULT_OPERATION_FAILED");return 1;}
 }
}
