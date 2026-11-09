// SPDX-License-Identifier: GPL-3.0-or-later
// First launch of the slim package: runtime/ (Node, Python, dictionaries, hooks) is not bundled.
// setup/setup-runtime.ps1 downloads, verifies and unpacks it, showing its own progress window.
use std::path::Path;
#[cfg(windows)] use std::os::windows::process::CommandExt;

// User report (2026-11-09): an install interrupted by "file in use" left runtime/python without parts of its standard
// library (No module named 'zipfile'), and node.exe alone said everything was fine. The base pack counts as ready only
// when Python and its core library are there too; otherwise the setup window reinstalls it.
pub fn ready(root:&Path)->bool{
 ["runtime/node.exe","runtime/python/python.exe","runtime/python/Lib/zipfile/__init__.py","runtime/python/Lib/encodings/__init__.py"].iter().all(|p|root.join(p).is_file())
}

pub fn ensure(root:&Path)->bool{
 if ready(root){return true;}
 let script=root.join("setup/setup-runtime.ps1");
 if !script.is_file(){return false;}
 let mut command=std::process::Command::new("powershell.exe");
 command.args(["-NoProfile","-ExecutionPolicy","Bypass","-STA","-File"]).arg(&script).arg("-Root").arg(root).current_dir(root);
 #[cfg(windows)] command.creation_flags(0x08000000);
 let ok=command.status().map(|s|s.success()).unwrap_or(false);
 ok&&ready(root)
}
