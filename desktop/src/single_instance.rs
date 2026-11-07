// SPDX-License-Identifier: GPL-3.0-or-later
//! One independent desktop host per installation, with local reopen/exit requests.
use std::{path::{Path,PathBuf},time::{SystemTime,UNIX_EPOCH,Duration},sync::atomic::Ordering};
use serde_json::json;
use tauri::Manager;
fn fingerprint(root:&Path)->u64{let mut h=14695981039346656037u64;for b in root.to_string_lossy().to_lowercase().bytes(){h^=b as u64;h=h.wrapping_mul(1099511628211);}h}
#[cfg(windows)]
pub struct Lease(*mut std::ffi::c_void);
#[cfg(windows)]
impl Drop for Lease{fn drop(&mut self){#[link(name="kernel32")]extern "system"{fn CloseHandle(h:*mut std::ffi::c_void)->i32;}unsafe{CloseHandle(self.0);}}}
#[cfg(not(windows))]
pub struct Lease;
pub enum Acquisition{Owner(Lease),Forwarded,NotRunning}
fn command_file(root:&Path)->PathBuf{root.join("cache/desktop-command.json")}
fn send(root:&Path,command:&str)->Result<(),String>{std::fs::create_dir_all(root.join("cache")).map_err(|e|e.to_string())?;let value=json!({"command":command,"nonce":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos().to_string()});let tmp=root.join(format!("cache/desktop-command-{}.tmp",std::process::id()));std::fs::write(&tmp,serde_json::to_vec(&value).unwrap()).map_err(|e|e.to_string())?;if command_file(root).exists(){let _=std::fs::remove_file(command_file(root));}std::fs::rename(tmp,command_file(root)).map_err(|e|e.to_string())}
pub fn acquire(root:&Path,command:Option<&str>)->Result<Acquisition,String>{
 #[cfg(windows)]unsafe{
  use std::os::windows::ffi::OsStrExt;
  #[link(name="kernel32")]extern "system"{fn CreateMutexW(attrs:*const std::ffi::c_void,owner:i32,name:*const u16)->*mut std::ffi::c_void;fn GetLastError()->u32;fn CloseHandle(h:*mut std::ffi::c_void)->i32;}
  let name:Vec<u16>=std::ffi::OsStr::new(&format!("Local\\MeguLit-{:016x}",fingerprint(root))).encode_wide().chain(Some(0)).collect();let handle=CreateMutexW(std::ptr::null(),0,name.as_ptr());if handle.is_null(){return Err(std::io::Error::last_os_error().to_string());}
  let exists=GetLastError()==183;if exists{CloseHandle(handle);send(root,command.unwrap_or("show"))?;return Ok(Acquisition::Forwarded);}
  if command.is_some(){CloseHandle(handle);return Ok(Acquisition::NotRunning);}let _=std::fs::remove_file(command_file(root));Ok(Acquisition::Owner(Lease(handle)))
 }
 #[cfg(not(windows))]{let _=(root,command);Ok(Acquisition::Owner(Lease))}
}
pub fn watch(app:tauri::AppHandle,root:PathBuf){
 let _=std::fs::create_dir_all(root.join("cache"));let _=std::fs::write(root.join("cache/desktop-instance.json"),serde_json::to_vec(&json!({"pid":std::process::id(),"root":root})).unwrap());
 std::thread::spawn(move||{let mut last=String::new();loop{std::thread::sleep(Duration::from_millis(200));if app.state::<crate::DesktopState>().exiting.load(Ordering::SeqCst){break;}let Ok(bytes)=std::fs::read(command_file(&root))else{continue};let Ok(value)=serde_json::from_slice::<serde_json::Value>(&bytes)else{continue};let nonce=value["nonce"].as_str().unwrap_or("");if nonce.is_empty()||nonce==last{continue;}last=nonce.to_string();match value["command"].as_str(){Some("show")=>crate::reveal(&app),Some("exit")=>{app.state::<crate::DesktopState>().exiting.store(true,Ordering::SeqCst);app.exit(0);break;},_=>{}}}});
}
#[cfg(test)]mod tests{use super::*;#[test]fn installation_fingerprint_is_stable_and_case_insensitive(){assert_eq!(fingerprint(Path::new("E:/Apps/ToMe_Final")),fingerprint(Path::new("e:/apps/tome_final")));assert_ne!(fingerprint(Path::new("E:/Apps/ToMe_Final")),fingerprint(Path::new("E:/Apps/MeguLit")));}
#[cfg(windows)]#[test]fn duplicate_instance_forwards_to_existing_owner_and_releases_after_drop(){let root=std::env::temp_dir().join(format!("tome-instance-{}",std::process::id()));std::fs::create_dir_all(&root).unwrap();let first=match acquire(&root,None).unwrap(){Acquisition::Owner(lease)=>lease,_=>panic!("expected owner")};assert!(matches!(acquire(&root,None).unwrap(),Acquisition::Forwarded));let value:serde_json::Value=serde_json::from_slice(&std::fs::read(command_file(&root)).unwrap()).unwrap();assert_eq!(value["command"],"show");assert!(matches!(acquire(&root,Some("exit")).unwrap(),Acquisition::Forwarded));drop(first);assert!(matches!(acquire(&root,Some("exit")).unwrap(),Acquisition::NotRunning));std::fs::remove_dir_all(root).unwrap();}}
