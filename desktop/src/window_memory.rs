// SPDX-License-Identifier: GPL-3.0-or-later
use serde::{Deserialize,Serialize};
use std::{path::{Path,PathBuf},sync::{Arc,Mutex,atomic::{AtomicBool,Ordering},mpsc},time::Duration};

#[derive(Clone,Debug,Serialize,Deserialize,PartialEq)]
#[serde(default)]
pub struct Snapshot { pub width:f64,pub height:f64,pub maximized:bool }
impl Default for Snapshot {fn default()->Self{Self{width:1280.0,height:820.0,maximized:false}}}
impl Snapshot {
 pub fn valid(self)->Self{if !self.width.is_finite()||!self.height.is_finite()||self.width<620.0||self.height<560.0||self.width>16000.0||self.height>16000.0{Self::default()}else{self}}
 pub fn fit(&mut self,width:f64,height:f64){self.width=self.width.min(width.max(620.0));self.height=self.height.min(height.max(560.0));}
 pub fn record(&mut self,width:f64,height:f64,maximized:bool,minimized:bool){
  // A maximized/minimized rectangle must never replace the restored window size.
  if minimized{return;}self.maximized=maximized;
  if !maximized&&width>=620.0&&height>=560.0&&width.is_finite()&&height.is_finite(){self.width=width;self.height=height;}
 }
}
fn read(path:&Path)->Snapshot{std::fs::read(path).ok().and_then(|bytes|serde_json::from_slice::<Snapshot>(&bytes).ok()).unwrap_or_default().valid()}
fn write(path:&Path,snapshot:&Snapshot)->std::io::Result<()>{
 if let Some(parent)=path.parent(){std::fs::create_dir_all(parent)?;}
 let temporary=path.with_extension("json.tmp");std::fs::write(&temporary,serde_json::to_vec_pretty(snapshot)?)?;
 #[cfg(windows)]{
  use std::os::windows::ffi::OsStrExt;
  #[link(name="kernel32")] extern "system"{fn MoveFileExW(from:*const u16,to:*const u16,flags:u32)->i32;}
  let from:Vec<u16>=temporary.as_os_str().encode_wide().chain(Some(0)).collect();let to:Vec<u16>=path.as_os_str().encode_wide().chain(Some(0)).collect();
  if unsafe{MoveFileExW(from.as_ptr(),to.as_ptr(),0x9)}==0{return Err(std::io::Error::last_os_error());}Ok(())
 }
 #[cfg(not(windows))]{std::fs::rename(temporary,path)}
}
pub struct WindowMemory {path:PathBuf,current:Arc<Mutex<Snapshot>>,signal:mpsc::Sender<()>,capture_signal:mpsc::Sender<tauri::Window>,enabled:AtomicBool}
impl WindowMemory {
 pub fn new(root:&Path)->Self{
  let path=root.join("data/window-state.json");let current=Arc::new(Mutex::new(read(&path)));let(signal,receiver)=mpsc::channel();
  let worker_path=path.clone();let worker_current=current.clone();
  std::thread::spawn(move||while receiver.recv().is_ok(){while receiver.recv_timeout(Duration::from_millis(250)).is_ok(){}if let Ok(value)=worker_current.lock(){let _=write(&worker_path,&value);}});
  let(capture_signal,capture_receiver)=mpsc::channel::<tauri::Window>();let capture_current=current.clone();let capture_write=signal.clone();
  std::thread::spawn(move||while let Ok(mut window)=capture_receiver.recv(){while let Ok(latest)=capture_receiver.recv_timeout(Duration::from_millis(60)){window=latest;}if let Some((width,height,maximized,minimized))=window_dimensions(&window){if let Ok(mut value)=capture_current.lock(){let before=value.clone();value.record(width,height,maximized,minimized);if *value!=before{let _=capture_write.send(());}}}});
  Self{path,current,signal,capture_signal,enabled:AtomicBool::new(false)}
 }
 pub fn snapshot(&self)->Snapshot{self.current.lock().unwrap().clone()}
 pub fn prepare(&self,value:Snapshot){*self.current.lock().unwrap()=value;}
 pub fn enable(&self){self.enabled.store(true,Ordering::SeqCst);}
 pub fn queue_capture(&self,window:tauri::Window){if self.enabled.load(Ordering::SeqCst)&&window.label()=="main"{let _=self.capture_signal.send(window);}}
 pub fn capture(&self,window:&tauri::Window){
  if !self.enabled.load(Ordering::SeqCst)||window.label()!="main"{return;}
  if let(Ok(size),Ok(scale),Ok(maximized),Ok(minimized))=(window.inner_size(),window.scale_factor(),window.is_maximized(),window.is_minimized()){
   let logical=size.to_logical::<f64>(scale);let mut value=self.current.lock().unwrap();let before=value.clone();value.record(logical.width,logical.height,maximized,minimized);
   if *value!=before{let _=self.signal.send(());}
  }
 }
 pub fn flush(&self){if self.enabled.load(Ordering::SeqCst){if let Ok(value)=self.current.lock(){let _=write(&self.path,&value);}}}
}
// This function is called from workers/async commands, never from a native event callback.
fn window_dimensions(window:&tauri::Window)->Option<(f64,f64,bool,bool)>{let size=window.inner_size().ok()?;let scale=window.scale_factor().ok()?;let logical=size.to_logical::<f64>(scale);Some((logical.width,logical.height,window.is_maximized().ok()?,window.is_minimized().ok()?))}
#[cfg(test)]mod tests{
 use super::*;
 #[test]fn first_start_is_landscape(){let s=Snapshot::default();assert!(s.width>s.height);assert!(!s.maximized);}
 #[test]fn maximize_and_minimize_preserve_normal_dimensions(){let mut s=Snapshot::default();s.record(1170.0,730.0,false,false);s.record(1920.0,1080.0,true,false);assert_eq!((s.width,s.height),(1170.0,730.0));assert!(s.maximized);s.record(0.0,0.0,false,true);assert!(s.maximized);s.record(1170.0,730.0,false,false);assert!(!s.maximized);}
 #[test]fn persisted_size_and_maximized_state_round_trip(){let dir=std::env::temp_dir().join(format!("tome-window-memory-{}",std::process::id()));let path=dir.join("window-state.json");let s=Snapshot{width:1360.0,height:780.0,maximized:true};write(&path,&s).unwrap();assert_eq!(read(&path),s);write(&path,&Snapshot::default()).unwrap();assert_eq!(read(&path),Snapshot::default());std::fs::write(&path,b"broken").unwrap();assert_eq!(read(&path),Snapshot::default());std::fs::remove_dir_all(dir).unwrap();}
 #[test]fn screen_change_fits_saved_size_and_invalid_values_fall_back(){let mut s=Snapshot{width:1600.0,height:1000.0,maximized:false};s.fit(1280.0,720.0);assert_eq!((s.width,s.height),(1280.0,720.0));assert_eq!(Snapshot{width:-1.0,height:600.0,maximized:true}.valid(),Snapshot::default());}
}
