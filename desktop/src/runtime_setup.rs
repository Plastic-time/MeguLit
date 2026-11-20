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

// PowerShell 5.1 needs 1.3-3.7 s (measured 2026-11-20) before the setup script can show anything, more on a busy machine.
// So the exe shows the installer's first picture itself (the opening clip's frame 0, same size and place as the setup
// window) before it starts PowerShell, and closes it when a window of the setup process is visible (it shows the same
// picture), when the setup ends, or after 90 s (logged). Only this first-run path; the normal start of MeguLit is untouched.
pub fn ensure(root:&Path)->bool{
 if ready(root){return true;}
 let script=root.join("setup/setup-runtime.ps1");
 if !script.is_file(){return false;}
 let t_enter=std::time::Instant::now();
 #[cfg(windows)] let shown=splash::show(&root.join("setup/ui-web/video/light/intro.jpg"),&root.join("setup/ui-web/video/splash-frames.bin"));
 #[cfg(windows)] let flag=std::env::temp_dir().join(format!("megulit-splash-{}.flag",std::process::id()));
 #[cfg(windows)] let _=std::fs::remove_file(&flag);
 #[cfg(windows)] if shown.is_some(){splash::log(&format!("exe-splash-up after {} ms in ensure() animated={}",t_enter.elapsed().as_millis(),shown.as_ref().map(|s|s.animated()).unwrap_or(false)));}
 let mut command=std::process::Command::new("powershell.exe");
 command.args(["-NoProfile","-ExecutionPolicy","Bypass","-STA","-File"]).arg(&script).arg("-Root").arg(root).current_dir(root);
 #[cfg(windows)] command.creation_flags(0x08000000);
 /* the animated native splash stays up until the skin has its first video frame (the setup script drops the flag file), and hands over the clock: epoch ms of its first frame */
 #[cfg(windows)] if let Some(s)=shown.as_ref(){ if s.animated(){command.env("MEGULIT_NATIVE_SPLASH","1").env("MEGULIT_SPLASH_T0",s.t0().to_string()).env("MEGULIT_SPLASH_FLAG",&flag);} }
 let mut child=match command.spawn(){
  Ok(c)=>c,
  Err(e)=>{
   #[cfg(windows)] { if let Some(s)=shown{s.close();} splash::error(&format!("MeguLit 无法启动安装程序（PowerShell）：{e}\nMeguLit could not start its setup (PowerShell): {e}")); }
   return false;
  }
 };
 #[cfg(windows)] if let Some(s)=shown{
  let pid=child.id(); let t0=std::time::Instant::now(); let animated=s.animated();
  loop{
   if animated&&flag.is_file(){splash::log(&format!("exe-splash-closed reason=skin-first-frame after {} ms, frame {}",s.elapsed_ms(),s.frame()));break;}
   if !animated&&splash::process_has_window(pid){splash::log("exe-splash-closed reason=setup-window");break;}
   if let Ok(Some(_))=child.try_wait(){splash::log("exe-splash-closed reason=setup-exited");break;}
   if t0.elapsed().as_secs()>=90{splash::log("exe-splash-closed reason=timeout-90s-no-setup-window");break;}
   std::thread::sleep(std::time::Duration::from_millis(50));
  }
  s.close(); let _=std::fs::remove_file(&flag);
 }
 let ok=child.wait().map(|s|s.success()).unwrap_or(false);
 ok&&ready(root)
}

#[cfg(windows)]
mod splash{
 use std::ffi::c_void;use std::path::Path;use std::os::windows::ffi::OsStrExt;
 use std::sync::atomic::{AtomicBool,AtomicIsize,AtomicU64,Ordering};use std::sync::Arc;
 type Hwnd=isize;
 #[repr(C)] struct WndClassW{style:u32,proc_:unsafe extern "system" fn(Hwnd,u32,usize,isize)->isize,cls:i32,wnd:i32,inst:isize,icon:isize,cursor:isize,bg:isize,menu:*const u16,name:*const u16}
 #[repr(C)] struct PaintStruct{hdc:isize,erase:i32,rc:[i32;4],restore:i32,inc:i32,rgb:[u8;32]}
 #[repr(C)] struct Rect{l:i32,t:i32,r:i32,b:i32}
 #[repr(C)] struct Msg{h:Hwnd,m:u32,w:usize,l:isize,t:u32,x:i32,y:i32,priv_:u32}
 #[repr(C)] struct GdipInput{ver:u32,cb:*const c_void,no_bg:i32,no_ext:i32}
 #[link(name="user32")] extern "system"{
  fn RegisterClassW(c:*const WndClassW)->u16;
  fn CreateWindowExW(ex:u32,cls:*const u16,name:*const u16,style:u32,x:i32,y:i32,w:i32,h:i32,parent:Hwnd,menu:isize,inst:isize,p:*const c_void)->Hwnd;
  fn DefWindowProcW(h:Hwnd,m:u32,w:usize,l:isize)->isize;
  fn BeginPaint(h:Hwnd,p:*mut PaintStruct)->isize;fn EndPaint(h:Hwnd,p:*const PaintStruct)->i32;fn GetClientRect(h:Hwnd,r:*mut Rect)->i32;
  fn PeekMessageW(m:*mut Msg,h:Hwnd,a:u32,b:u32,r:u32)->i32;fn TranslateMessage(m:*const Msg)->i32;fn DispatchMessageW(m:*const Msg)->isize;
  fn DestroyWindow(h:Hwnd)->i32;fn UpdateWindow(h:Hwnd)->i32;fn SystemParametersInfoW(a:u32,b:u32,p:*mut c_void,f:u32)->i32;fn GetDpiForSystem()->u32;
  fn EnumWindows(cb:unsafe extern "system" fn(Hwnd,isize)->i32,l:isize)->i32;fn GetWindowThreadProcessId(h:Hwnd,pid:*mut u32)->u32;fn IsWindowVisible(h:Hwnd)->i32;
  fn MessageBoxW(h:Hwnd,t:*const u16,c:*const u16,f:u32)->i32;fn MsgWaitForMultipleObjects(n:u32,h:*const isize,all:i32,ms:u32,mask:u32)->u32;
 }
 #[link(name="shlwapi")] extern "system"{fn SHCreateMemStream(p:*const u8,cb:u32)->*mut c_void;}
 #[link(name="user32")] extern "system"{fn InvalidateRect(h:Hwnd,r:*const Rect,erase:i32)->i32;}
 #[link(name="gdiplus")] extern "system"{
  fn GdiplusStartup(tok:*mut usize,i:*const GdipInput,o:*mut c_void)->i32;fn GdipCreateBitmapFromFile(f:*const u16,img:*mut isize)->i32;
  fn GdipCreateBitmapFromStream(s:*mut c_void,img:*mut isize)->i32;fn GdipDisposeImage(img:isize)->i32;
  fn GdipCreateFromHDC(hdc:isize,g:*mut isize)->i32;fn GdipSetInterpolationMode(g:isize,m:i32)->i32;fn GdipDrawImageRectI(g:isize,img:isize,x:i32,y:i32,w:i32,h:i32)->i32;fn GdipDeleteGraphics(g:isize)->i32;
 }
 static IMAGE:AtomicIsize=AtomicIsize::new(0);
 fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(std::iter::once(0)).collect()}
 unsafe extern "system" fn proc_(h:Hwnd,m:u32,w:usize,l:isize)->isize{
  match m{
   0x0014=>1,   /* WM_ERASEBKGND: the picture covers everything */
   0x000F=>{    /* WM_PAINT */
    let mut ps:PaintStruct=std::mem::zeroed();let hdc=BeginPaint(h,&mut ps);let mut rc:Rect=std::mem::zeroed();GetClientRect(h,&mut rc);
    let img=IMAGE.load(Ordering::SeqCst);let mut g:isize=0;
    if img!=0&&GdipCreateFromHDC(hdc,&mut g)==0{GdipSetInterpolationMode(g,7);GdipDrawImageRectI(g,img,0,0,rc.r-rc.l,rc.b-rc.t);GdipDeleteGraphics(g);}
    EndPaint(h,&ps);0
   }
   _=>DefWindowProcW(h,m,w,l)
  }
 }
 pub struct Shown{close:Arc<AtomicBool>,thread:Option<std::thread::JoinHandle<()>>,t0:Arc<AtomicU64>,frame:Arc<AtomicU64>}
 impl Shown{
  pub fn close(mut self){self.close.store(true,Ordering::SeqCst);if let Some(t)=self.thread.take(){let _=t.join();}}
  pub fn animated(&self)->bool{self.t0.load(Ordering::SeqCst)!=0}
  pub fn t0(&self)->u64{self.t0.load(Ordering::SeqCst)}
  pub fn frame(&self)->u64{self.frame.load(Ordering::SeqCst)}
  pub fn elapsed_ms(&self)->u64{let n=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(0);n.saturating_sub(self.t0())}
 }
 /* the bundle of small JPEG frames (tools/setup-splash-frames.cjs): intro once, then the welcome loop cycle repeated */
 struct Anim{data:Vec<u8>,count:usize,fps:u32,intro:usize,looped:usize}
 fn u32at(d:&[u8],o:usize)->usize{u32::from_le_bytes([d[o],d[o+1],d[o+2],d[o+3]]) as usize}
 fn load_anim(p:&Path)->Option<Anim>{
  let d=std::fs::read(p).ok()?;if d.len()<24||&d[0..4]!=b"MLSF"{return None;}
  let (count,fps,intro,looped)=(u32at(&d,4),u32at(&d,8) as u32,u32at(&d,12),u32at(&d,16));
  if count==0||fps==0||intro+looped!=count||d.len()<20+4*(count+1){return None;}
  Some(Anim{data:d,count,fps,intro,looped})
 }
 impl Anim{
  fn frame_index(&self,ms:u64)->usize{let f=(ms*self.fps as u64/1000) as usize;if f<self.intro{f}else if self.looped>0{self.intro+(f-self.intro)%self.looped}else{self.count-1}}
  /* (image, stream): the stream must outlive the GDI+ bitmap */
  unsafe fn decode(&self,i:usize)->Option<(isize,*mut c_void)>{
   let base=20+4*(self.count+1);let (a,b)=(base+u32at(&self.data,20+4*i),base+u32at(&self.data,20+4*(i+1)));if b>self.data.len()||a>=b{return None;}
   let s=SHCreateMemStream(self.data[a..b].as_ptr(),(b-a) as u32);if s.is_null(){return None;}
   let mut img:isize=0;if GdipCreateBitmapFromStream(s,&mut img)!=0||img==0{release(s);return None;}Some((img,s))
  }
 }
 unsafe fn release(s:*mut c_void){let vt=*(s as *const *const usize);let rel:extern "system" fn(*mut c_void)->u32=std::mem::transmute(*vt.add(2));rel(s);}
 /* same "step=... at=<epoch ms>" form as the setup's own boot timing in setup-ui.log, so one tool reads both */
 pub fn log(step:&str){
  let file=std::env::var_os("MEGULIT_SETUP_UILOG").map(std::path::PathBuf::from).or_else(||std::env::var_os("LOCALAPPDATA").map(|d|Path::new(&d).join("MeguLit").join("setup-ui.log")));
  let Some(file)=file else{return};if let Some(d)=file.parent(){let _=std::fs::create_dir_all(d);}
  let at=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis()).unwrap_or(0);
  use std::io::Write;if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(file){let _=write!(f,"exe boot step={step} since_proc=0 at={at}\r\n");}
 }
 pub fn show(image:&Path,frames:&Path)->Option<Shown>{
  if !image.is_file()||std::env::var("MEGULIT_EXE_SPLASH").map(|v|v=="0").unwrap_or(false){return None;}
  let path:Vec<u16>=image.as_os_str().encode_wide().chain(std::iter::once(0)).collect();
  let anim=if std::env::var("MEGULIT_EXE_SPLASH_ANIM").map(|v|v=="0").unwrap_or(false){None}else{load_anim(frames)};
  let close=Arc::new(AtomicBool::new(false));let c2=close.clone();let (tx,rx)=std::sync::mpsc::channel();
  let t0=Arc::new(AtomicU64::new(0));let t02=t0.clone();let frame=Arc::new(AtomicU64::new(0));let fr2=frame.clone();
  let thread=std::thread::spawn(move||unsafe{
   let mut tok=0usize;let input=GdipInput{ver:1,cb:std::ptr::null(),no_bg:0,no_ext:0};
   if GdiplusStartup(&mut tok,&input,std::ptr::null_mut())!=0{let _=tx.send(false);return;}
   let mut img:isize=0;if GdipCreateBitmapFromFile(path.as_ptr(),&mut img)!=0||img==0{let _=tx.send(false);return;}
   IMAGE.store(img,Ordering::SeqCst);
   let cls=wide("MeguLitSetupSplash");let wc=WndClassW{style:0,proc_:proc_,cls:0,wnd:0,inst:0,icon:0,cursor:0,bg:0,menu:std::ptr::null(),name:cls.as_ptr()};RegisterClassW(&wc);
   /* same box as the setup window: 794x508 (79 % of the 1000x640 design box) at the system scale, never larger than the work area, centred on it */
   let mut wa:Rect=std::mem::zeroed();SystemParametersInfoW(0x0030,0,&mut wa as *mut Rect as *mut c_void,0);
   let (ww,wh)=((wa.r-wa.l) as f64,(wa.b-wa.t) as f64);let scale=(GetDpiForSystem() as f64/96.0).min(ww/794.0).min(wh/508.0).max(0.5);
   let (w,h)=((794.0*scale) as i32,(508.0*scale) as i32);let (x,y)=(wa.l+((ww as i32-w)/2).max(0),wa.t+((wh as i32-h)/2).max(0));
   let title=wide("MeguLit");
   /* WS_EX_TOOLWINDOW (+ TOPMOST and NOACTIVATE while it animates: it stays above the skin window, which loads underneath, until the skin has its first video frame); WS_POPUP|WS_VISIBLE */
   let ex=if anim.is_some(){0x80|0x8|0x0800_0000}else{0x80};
   let hwnd=CreateWindowExW(ex,cls.as_ptr(),title.as_ptr(),0x8000_0000|0x1000_0000,x,y,w,h,0,0,0,std::ptr::null());
   if hwnd==0{let _=tx.send(false);return;}
   UpdateWindow(hwnd);log("exe-splash-shown");
   let start=std::time::Instant::now();let start_epoch=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(1).max(1);
   if anim.is_some(){t02.store(start_epoch,Ordering::SeqCst);}
   let _=tx.send(true);
   let mut msg:Msg=std::mem::zeroed();let mut last=usize::MAX;let mut cur:Option<(isize,*mut c_void)>=None;let (mut worst,mut shown_n)=(0u128,0u32);
   while !c2.load(Ordering::SeqCst){
    MsgWaitForMultipleObjects(0,std::ptr::null(),0,10,0x04FF);
    while PeekMessageW(&mut msg,0,0,0,1)!=0{TranslateMessage(&msg);DispatchMessageW(&msg);}
    if let Some(a)=&anim{
     let i=a.frame_index(start.elapsed().as_millis() as u64);
     if i!=last{let td=std::time::Instant::now();
      if let Some((ni,ns))=a.decode(i){
       let old=cur.replace((ni,ns));IMAGE.store(ni,Ordering::SeqCst);InvalidateRect(hwnd,std::ptr::null(),0);UpdateWindow(hwnd);
       if let Some((oi,os))=old{GdipDisposeImage(oi);release(os);}
       let ms=td.elapsed().as_millis();worst=worst.max(ms);shown_n+=1;if shown_n==1{log(&format!("exe-splash-first-frame decode+paint {} ms",ms));}
      }
      last=i;fr2.store(i as u64,Ordering::SeqCst);
     }
    }
   }
   if anim.is_some(){log(&format!("exe-splash-anim frames-drawn={} worst-frame-ms={} last-index={}",shown_n,worst,last));}
   DestroyWindow(hwnd);
  });
  match rx.recv_timeout(std::time::Duration::from_secs(3)){Ok(true)=>Some(Shown{close,thread:Some(thread),t0,frame}),_=>{close.store(true,Ordering::SeqCst);None}}
 }
 struct Find{pid:u32,found:bool}
 unsafe extern "system" fn each(h:Hwnd,l:isize)->i32{let f=&mut *(l as *mut Find);let mut p=0u32;GetWindowThreadProcessId(h,&mut p);if p==f.pid&&IsWindowVisible(h)!=0{f.found=true;return 0;}1}
 pub fn process_has_window(pid:u32)->bool{let mut f=Find{pid,found:false};unsafe{EnumWindows(each,&mut f as *mut Find as isize);}f.found}
 pub fn error(text:&str){let t=wide(text);let c=wide("MeguLit");unsafe{MessageBoxW(0,t.as_ptr(),c.as_ptr(),0x10);}}
}
