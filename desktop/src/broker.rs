// SPDX-License-Identifier: GPL-3.0-or-later
use serde_json::{json,Value};
use std::{collections::HashMap,io::{BufRead,BufReader,Write},path::PathBuf,process::{Child,ChildStdin,Command,Stdio},sync::{Arc,Mutex,OnceLock,atomic::{AtomicU64,Ordering},mpsc},time::{Duration,Instant}};
#[cfg(windows)] use std::os::windows::process::CommandExt;
use tauri::Emitter;
type Reply=Result<Value,String>;
struct Process { child:Child,input:ChildStdin }
pub struct Broker { root:PathBuf,process:Mutex<Option<Process>>,pending:Arc<Mutex<HashMap<u64,mpsc::Sender<Reply>>>>,serial:AtomicU64,generation:Arc<AtomicU64> }
static BROKER:OnceLock<Broker>=OnceLock::new();
static APP:OnceLock<tauri::AppHandle>=OnceLock::new();
pub fn attach(app:tauri::AppHandle){let _=APP.set(app);}
pub fn request(root:PathBuf,request:Value)->Reply{BROKER.get_or_init(||Broker{root,process:Mutex::new(None),pending:Arc::new(Mutex::new(HashMap::new())),serial:AtomicU64::new(1),generation:Arc::new(AtomicU64::new(0))}).request(request)}
impl Broker {
 fn start(&self,slot:&mut Option<Process>)->Result<(),String>{
  if let Some(process)=slot {if process.child.try_wait().map_err(|_|"SERVICE_STATUS_FAILED")?.is_none(){return Ok(());}}
  let mut command=Command::new(self.root.join("runtime/node.exe"));
  command.arg(self.root.join("services/server.cjs")).current_dir(&self.root).env("MEGULIT_ROOT",&self.root).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
  #[cfg(windows)] command.creation_flags(0x08000000);
  let mut child=command.spawn().map_err(|_|"SERVICE_START_FAILED")?;
  let input=child.stdin.take().ok_or("SERVICE_PIPE_FAILED")?;let output=child.stdout.take().ok_or("SERVICE_PIPE_FAILED")?;
  for(_,sender)in self.pending.lock().unwrap().drain(){let _=sender.send(Err("SERVICE_DISCONNECTED".into()));}
  let generation=self.generation.clone();let epoch=generation.fetch_add(1,Ordering::SeqCst)+1;let pending=self.pending.clone();
  std::thread::spawn(move||{
   for line in BufReader::new(output).lines(){let Ok(line)=line else{break};let Ok(value)=serde_json::from_str::<Value>(&line)else{continue};
    if let Some(event)=value["event"].as_str(){
     if let Some(app)=APP.get(){
      if event=="home-toggle"{let ui=app.clone();let _=app.run_on_main_thread(move||crate::toggle_home(&ui));continue;}
      #[cfg(windows)]
      if event=="reader-pointer-input"{crate::reader_pointer::dispatch(app,&value["data"]);continue;}
      let _=app.emit(event,value["data"].clone());
     }
     continue;
    }
    if let Some(id)=value["id"].as_u64(){if let Some(sender)=pending.lock().unwrap().remove(&id){let result=if value["ok"]==true{Ok(value["data"].clone())}else{Err(value["error"].as_str().unwrap_or("SERVICE_FAILED").to_string())};let _=sender.send(result);}}
   }
   if generation.load(Ordering::SeqCst)==epoch{for(_,sender)in pending.lock().unwrap().drain(){let _=sender.send(Err("SERVICE_DISCONNECTED".into()));}}
  });
  *slot=Some(Process{child,input});Ok(())
 }
 fn request(&self,request:Value)->Reply{
  let id=self.serial.fetch_add(1,Ordering::Relaxed);let(tx,rx)=mpsc::channel();
  {let mut process=self.process.lock().map_err(|_|"SERVICE_LOCK_FAILED")?;self.start(&mut process)?;
   self.pending.lock().unwrap().insert(id,tx);let encoded=json!({"id":id,"request":request}).to_string()+"\n";
   if process.as_mut().unwrap().input.write_all(encoded.as_bytes()).is_err(){self.pending.lock().unwrap().remove(&id);return Err("SERVICE_DISCONNECTED".into());}
  }
  match rx.recv_timeout(Duration::from_secs(240)){Ok(result)=>result,Err(_)=>{self.pending.lock().unwrap().remove(&id);Err("SERVICE_TIMEOUT".into())}}
 }
}
pub fn shutdown(){if let Some(broker)=BROKER.get(){
 if let Ok(mut slot)=broker.process.lock(){if let Some(mut process)=slot.take(){let _=process.input.write_all(b"{\"id\":0,\"request\":{\"action\":\"__shutdown\"}}\n");drop(process.input);let deadline=Instant::now()+Duration::from_secs(8);loop{if process.child.try_wait().ok().flatten().is_some(){break;}if Instant::now()>=deadline{let _=process.child.kill();let _=process.child.wait();break;}std::thread::sleep(Duration::from_millis(50));}}}
}}
