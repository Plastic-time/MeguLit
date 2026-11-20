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
 #[cfg(windows)] let flag=std::env::temp_dir().join(format!("megulit-splash-{}.flag",std::process::id()));
 #[cfg(windows)] let stage=std::path::PathBuf::from(format!("{}.stage",flag.display()));
 #[cfg(windows)] let _=std::fs::remove_file(&flag);
 #[cfg(windows)] let _=std::fs::remove_file(&stage);
 #[cfg(windows)] let shown=splash::show(&root.join("setup/logo.png"),&stage);
 #[cfg(windows)] if shown.is_some(){splash::log(&format!("exe-splash-up after {} ms in ensure()",t_enter.elapsed().as_millis()));}
 let mut command=std::process::Command::new("powershell.exe");
 command.args(["-NoProfile","-ExecutionPolicy","Bypass","-STA","-File"]).arg(&script).arg("-Root").arg(root).current_dir(root);
 #[cfg(windows)] command.creation_flags(0x08000000);
 /* the calm native loading screen (logo, a thin bar, one status line) stays up until the skin has its first video frame: the setup script writes real stages into <flag>.stage and drops <flag> when it is ready */
 #[cfg(windows)] if shown.is_some(){command.env("MEGULIT_NATIVE_SPLASH","1").env("MEGULIT_SPLASH_FLAG",&flag);}
 let mut child=match command.spawn(){
  Ok(c)=>c,
  Err(e)=>{
   #[cfg(windows)] { if let Some(s)=shown{s.close();} splash::error(&format!("MeguLit 无法启动安装程序（PowerShell）：{e}\nMeguLit could not start its setup (PowerShell): {e}")); }
   return false;
  }
 };
 #[cfg(windows)] if let Some(s)=shown{
  let pid=child.id(); let t0=std::time::Instant::now(); let animated=true;
  loop{
   if animated&&flag.is_file(){splash::log(&format!("exe-splash-closed reason=skin-first-frame after {} ms, bar {}",s.elapsed_ms(),s.frame()));splash::allow_foreground();break;}
   if !animated&&splash::process_has_window(pid){splash::log("exe-splash-closed reason=setup-window");break;}
   if let Ok(Some(_))=child.try_wait(){splash::log("exe-splash-closed reason=setup-exited");break;}
   if t0.elapsed().as_secs()>=90{splash::log("exe-splash-closed reason=timeout-90s-no-setup-window");break;}
   std::thread::sleep(std::time::Duration::from_millis(50));
  }
  s.close(); let _=std::fs::remove_file(&flag); let _=std::fs::remove_file(&stage);
 }
 let ok=child.wait().map(|s|s.success()).unwrap_or(false);
 ok&&ready(root)
}

#[cfg(windows)]
mod splash{
 use std::ffi::c_void;use std::path::Path;use std::os::windows::ffi::OsStrExt;
 use std::sync::atomic::{AtomicBool,AtomicIsize,AtomicU32,AtomicU64,Ordering};use std::sync::{Arc,Mutex};
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
  fn InvalidateRect(h:Hwnd,r:*const Rect,erase:i32)->i32;fn SetLayeredWindowAttributes(h:Hwnd,key:u32,alpha:u8,flags:u32)->i32;fn AllowSetForegroundWindow(pid:u32)->i32;
  fn GetDC(h:Hwnd)->isize;fn ReleaseDC(h:Hwnd,dc:isize)->i32;fn FillRect(dc:isize,r:*const Rect,b:isize)->i32;fn DrawTextW(dc:isize,s:*const u16,n:i32,r:*mut Rect,f:u32)->i32;
 }
 #[link(name="gdi32")] extern "system"{
  fn CreateSolidBrush(c:u32)->isize;fn DeleteObject(o:isize)->i32;fn CreateCompatibleDC(dc:isize)->isize;fn CreateCompatibleBitmap(dc:isize,w:i32,h:i32)->isize;
  fn SelectObject(dc:isize,o:isize)->isize;fn DeleteDC(dc:isize)->i32;fn BitBlt(d:isize,x:i32,y:i32,w:i32,h:i32,s:isize,sx:i32,sy:i32,rop:u32)->i32;
  fn CreateFontW(h:i32,w:i32,e:i32,o:i32,wt:i32,i:u32,u:u32,s:u32,cs:u32,op:u32,cp:u32,q:u32,pf:u32,face:*const u16)->isize;fn SetBkMode(dc:isize,m:i32)->i32;fn SetTextColor(dc:isize,c:u32)->u32;
 }
 #[link(name="gdiplus")] extern "system"{
  fn GdiplusStartup(tok:*mut usize,i:*const GdipInput,o:*mut c_void)->i32;fn GdipCreateBitmapFromFile(f:*const u16,img:*mut isize)->i32;
  fn GdipCreateFromHDC(hdc:isize,g:*mut isize)->i32;fn GdipSetInterpolationMode(g:isize,m:i32)->i32;fn GdipDrawImageRectI(g:isize,img:isize,x:i32,y:i32,w:i32,h:i32)->i32;fn GdipDeleteGraphics(g:isize)->i32;
  fn GdipGetImageWidth(img:isize,w:*mut u32)->i32;fn GdipGetImageHeight(img:isize,h:*mut u32)->i32;
 }
 static LOGO:AtomicIsize=AtomicIsize::new(0);
 static PROG:AtomicU32=AtomicU32::new(0);   /* the bar, 0..1000 */
 static SCALE_X100:AtomicU32=AtomicU32::new(100);
 static STATUS:Mutex<String>=Mutex::new(String::new());
 fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(std::iter::once(0)).collect()}
 fn rgb(r:u32,g:u32,b:u32)->u32{r|(g<<8)|(b<<16)}
 /* the loading screen: the installer's light paper colour, the logo, a thin crimson bar and one status line, painted double-buffered */
 unsafe fn paint(hdc:isize,w:i32,h:i32){
  let sc=SCALE_X100.load(Ordering::SeqCst) as f64/100.0;
  let mem=CreateCompatibleDC(hdc);let bmp=CreateCompatibleBitmap(hdc,w,h);let old=SelectObject(mem,bmp);
  let bg=CreateSolidBrush(rgb(236,241,249));let full=Rect{l:0,t:0,r:w,b:h};FillRect(mem,&full,bg);DeleteObject(bg);
  let cx=w/2;let logo=LOGO.load(Ordering::SeqCst);
  let (mut lw,mut lh)=(0u32,0u32);
  if logo!=0{GdipGetImageWidth(logo,&mut lw);GdipGetImageHeight(logo,&mut lh);}
  let box_h=(72.0*sc) as i32;let (dw,dh)=if lw>0&&lh>0{let r=(lw as f64/lh as f64).min(3.0);let hh=box_h;((hh as f64*r) as i32,hh)}else{(0,0)};
  let top=h/2-(70.0*sc) as i32;
  if logo!=0&&dw>0{let mut g:isize=0;if GdipCreateFromHDC(mem,&mut g)==0{GdipSetInterpolationMode(g,7);GdipDrawImageRectI(g,logo,cx-dw/2,top,dw,dh);GdipDeleteGraphics(g);}}
  /* status line */
  let font=CreateFontW(-((14.0*sc) as i32),0,0,0,400,0,0,0,1,0,0,5,0,wide("Microsoft YaHei UI").as_ptr());let of=SelectObject(mem,font);SetBkMode(mem,1);SetTextColor(mem,rgb(86,98,118));
  let text=STATUS.lock().map(|s|s.clone()).unwrap_or_default();let tw=wide(&text);
  let mut tr=Rect{l:0,t:top+dh+(26.0*sc) as i32,r:w,b:top+dh+(54.0*sc) as i32};DrawTextW(mem,tw.as_ptr(),-1,&mut tr,0x1|0x4|0x20|0x800/*center, vcenter, single line, no prefix*/);
  SelectObject(mem,of);DeleteObject(font);
  /* thin bar */
  let bw=(240.0*sc) as i32;let bh=((3.0*sc) as i32).max(2);let bx=cx-bw/2;let by=top+dh+(66.0*sc) as i32;
  let track=CreateSolidBrush(rgb(214,223,236));let tr2=Rect{l:bx,t:by,r:bx+bw,b:by+bh};FillRect(mem,&tr2,track);DeleteObject(track);
  let p=PROG.load(Ordering::SeqCst).min(1000) as i32;let fill=CreateSolidBrush(rgb(200,32,60));let fr=Rect{l:bx,t:by,r:bx+bw*p/1000,b:by+bh};FillRect(mem,&fr,fill);DeleteObject(fill);
  BitBlt(hdc,0,0,w,h,mem,0,0,0x00CC0020);SelectObject(mem,old);DeleteObject(bmp);DeleteDC(mem);
 }
 unsafe extern "system" fn proc_(h:Hwnd,m:u32,w:usize,l:isize)->isize{
  match m{
   0x0014=>1,   /* WM_ERASEBKGND: painted whole */
   0x000F=>{let mut ps:PaintStruct=std::mem::zeroed();let hdc=BeginPaint(h,&mut ps);let mut rc:Rect=std::mem::zeroed();GetClientRect(h,&mut rc);paint(hdc,rc.r-rc.l,rc.b-rc.t);EndPaint(h,&ps);0}
   _=>DefWindowProcW(h,m,w,l)
  }
 }
 pub struct Shown{close:Arc<AtomicBool>,thread:Option<std::thread::JoinHandle<()>>,t0:Arc<AtomicU64>}
 impl Shown{
  /* fades out (~280 ms) and goes */
  pub fn close(mut self){self.close.store(true,Ordering::SeqCst);if let Some(t)=self.thread.take(){let _=t.join();}}
  pub fn elapsed_ms(&self)->u64{let n=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(0);n.saturating_sub(self.t0.load(Ordering::SeqCst))}
  pub fn frame(&self)->u64{PROG.load(Ordering::SeqCst) as u64}
 }
 /* the setup script may let this process put its window in front (the skin window gets the focus when this screen fades) */
 pub fn allow_foreground(){unsafe{AllowSetForegroundWindow(u32::MAX);}}
 /* same "step=... at=<epoch ms>" form as the setup's own boot timing in setup-ui.log, so one tool reads both */
 pub fn log(step:&str){
  let file=std::env::var_os("MEGULIT_SETUP_UILOG").map(std::path::PathBuf::from).or_else(||std::env::var_os("LOCALAPPDATA").map(|d|Path::new(&d).join("MeguLit").join("setup-ui.log")));
  let Some(file)=file else{return};if let Some(d)=file.parent(){let _=std::fs::create_dir_all(d);}
  let at=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis()).unwrap_or(0);
  use std::io::Write;if let Ok(mut f)=std::fs::OpenOptions::new().create(true).append(true).open(file){let _=write!(f,"exe boot step={step} since_proc=0 at={at}\r\n");}
 }
 /* stage file written by setup-runtime.ps1: "<0..1>|<status text>" */
 fn read_stage(p:&Path)->Option<(f64,String)>{let s=std::fs::read_to_string(p).ok()?;let (a,b)=s.trim_start_matches('\u{feff}').split_once('|')?;Some((a.trim().parse::<f64>().ok()?.clamp(0.0,1.0),b.trim().to_string()))}
 pub fn show(logo:&Path,stage:&Path)->Option<Shown>{
  if std::env::var("MEGULIT_EXE_SPLASH").map(|v|v=="0").unwrap_or(false){return None;}
  let logo_path:Vec<u16>=logo.as_os_str().encode_wide().chain(std::iter::once(0)).collect();let have_logo=logo.is_file();
  let stage=stage.to_path_buf();
  let close=Arc::new(AtomicBool::new(false));let c2=close.clone();let (tx,rx)=std::sync::mpsc::channel();
  let t0=Arc::new(AtomicU64::new(0));let t02=t0.clone();
  let thread=std::thread::spawn(move||unsafe{
   let mut tok=0usize;let input=GdipInput{ver:1,cb:std::ptr::null(),no_bg:0,no_ext:0};
   if GdiplusStartup(&mut tok,&input,std::ptr::null_mut())!=0{let _=tx.send(false);return;}
   if have_logo{let mut img:isize=0;if GdipCreateBitmapFromFile(logo_path.as_ptr(),&mut img)==0{LOGO.store(img,Ordering::SeqCst);}}
   if let Ok(mut s)=STATUS.lock(){*s="正在启动…".to_string();}PROG.store(60,Ordering::SeqCst);
   let cls=wide("MeguLitSetupSplash");let wc=WndClassW{style:0,proc_:proc_,cls:0,wnd:0,inst:0,icon:0,cursor:0,bg:0,menu:std::ptr::null(),name:cls.as_ptr()};RegisterClassW(&wc);
   /* same box as the setup window: 794x508 (79 % of the 1000x640 design box) at the system scale, never larger than the work area, centred on it */
   let mut wa:Rect=std::mem::zeroed();SystemParametersInfoW(0x0030,0,&mut wa as *mut Rect as *mut c_void,0);
   let (ww,wh)=((wa.r-wa.l) as f64,(wa.b-wa.t) as f64);let scale=(GetDpiForSystem() as f64/96.0).min(ww/794.0).min(wh/508.0).max(0.5);SCALE_X100.store((scale*100.0) as u32,Ordering::SeqCst);
   let (w,h)=((794.0*scale) as i32,(508.0*scale) as i32);let (x,y)=(wa.l+((ww as i32-w)/2).max(0),wa.t+((wh as i32-h)/2).max(0));
   let title=wide("MeguLit");
   /* WS_EX_TOOLWINDOW|TOPMOST|NOACTIVATE|LAYERED: above the skin window (which loads underneath, same rectangle) without taking the focus, and able to fade; WS_POPUP|WS_VISIBLE */
   let hwnd=CreateWindowExW(0x80|0x8|0x0800_0000|0x0008_0000,cls.as_ptr(),title.as_ptr(),0x8000_0000|0x1000_0000,x,y,w,h,0,0,0,std::ptr::null());
   if hwnd==0{let _=tx.send(false);return;}
   SetLayeredWindowAttributes(hwnd,0,255,0x2);UpdateWindow(hwnd);log("exe-splash-shown");
   t02.store(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(1).max(1),Ordering::SeqCst);
   let _=tx.send(true);
   let mut msg:Msg=std::mem::zeroed();let mut shown_p=60.0f64;let mut target=60.0f64;let mut last_read=std::time::Instant::now();let mut last_paint=-1i32;
   while !c2.load(Ordering::SeqCst){
    MsgWaitForMultipleObjects(0,std::ptr::null(),0,16,0x04FF);
    while PeekMessageW(&mut msg,0,0,0,1)!=0{TranslateMessage(&msg);DispatchMessageW(&msg);}
    if last_read.elapsed().as_millis()>=100{last_read=std::time::Instant::now();
     if let Some((f,t))=read_stage(&stage){target=(f*1000.0).max(60.0);if let Ok(mut s)=STATUS.lock(){if *s!=t{*s=t;last_paint=-1;}}}
     else{target=(target+3.0).min(150.0);}   /* before the script says anything: a slow creep */
    }
    shown_p+=(target-shown_p)*0.12+0.4;if shown_p>target{shown_p=target;}
    let pi=shown_p as i32;if pi!=last_paint{last_paint=pi;PROG.store(pi as u32,Ordering::SeqCst);InvalidateRect(hwnd,std::ptr::null(),0);UpdateWindow(hwnd);}
   }
   /* the bar fills, then the whole screen fades out over ~280 ms while the skin window (already in front of the desktop, behind this one) shows through */
   PROG.store(1000,Ordering::SeqCst);InvalidateRect(hwnd,std::ptr::null(),0);UpdateWindow(hwnd);std::thread::sleep(std::time::Duration::from_millis(90));
   let steps=14;for k in 1..=steps{let a=(255.0*(1.0-k as f64/steps as f64)) as u8;SetLayeredWindowAttributes(hwnd,0,a,0x2);std::thread::sleep(std::time::Duration::from_millis(20));}
   log("exe-splash-faded");DestroyWindow(hwnd);
  });
  match rx.recv_timeout(std::time::Duration::from_secs(3)){Ok(true)=>Some(Shown{close,thread:Some(thread),t0}),_=>{close.store(true,Ordering::SeqCst);None}}
 }
 struct Find{pid:u32,found:bool}
 unsafe extern "system" fn each(h:Hwnd,l:isize)->i32{let f=&mut *(l as *mut Find);let mut p=0u32;GetWindowThreadProcessId(h,&mut p);if p==f.pid&&IsWindowVisible(h)!=0{f.found=true;return 0;}1}
 pub fn process_has_window(pid:u32)->bool{let mut f=Find{pid,found:false};unsafe{EnumWindows(each,&mut f as *mut Find as isize);}f.found}
 pub fn error(text:&str){let t=wide(text);let c=wide("MeguLit");unsafe{MessageBoxW(0,t.as_ptr(),c.as_ptr(),0x10);}}
}
