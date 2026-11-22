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

#[cfg(windows)]
pub fn check_webview(root: &Path, interactive: bool) -> bool {
 if let Err(error) = tauri::webview_version() {
  let _ = std::fs::create_dir_all(root.join("logs"));
  let _ = std::fs::write(root.join("logs/native-startup-stage.log"), format!("WebView2 Runtime unavailable: {error}"));
  crate::yui::mark("webview-failed");
  if interactive {
   splash::error("无法启动 Microsoft Edge WebView2 Runtime。请安装或修复 Evergreen Runtime，然后重新打开 MeguLit。\n\nInstall or repair Microsoft Edge WebView2 Evergreen Runtime, then reopen MeguLit.\nhttps://developer.microsoft.com/microsoft-edge/webview2/");
  }
  return false;
 }
 true
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
 /* the calm native loading screen (one thin bar, one small status line, nothing else) stays up until the skin has its first video frame: the setup script writes real stages into <flag>.stage and drops <flag> when it is ready */
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
 use std::sync::atomic::{AtomicBool,AtomicU64,Ordering};use std::sync::Arc;
 type Hwnd=isize;
 #[repr(C)] struct WndClassW{style:u32,proc_:unsafe extern "system" fn(Hwnd,u32,usize,isize)->isize,cls:i32,wnd:i32,inst:isize,icon:isize,cursor:isize,bg:isize,menu:*const u16,name:*const u16}
 #[repr(C)] struct Rect{l:i32,t:i32,r:i32,b:i32}
 #[repr(C)] struct RectF{x:f32,y:f32,w:f32,h:f32}
 #[repr(C)] struct Msg{h:Hwnd,m:u32,w:usize,l:isize,t:u32,x:i32,y:i32,priv_:u32}
 #[repr(C)] struct Point{x:i32,y:i32}
 #[repr(C)] struct Size{cx:i32,cy:i32}
 #[repr(C)] struct Blend{op:u8,flags:u8,alpha:u8,fmt:u8}
 #[repr(C)] struct BitmapInfoHeader{size:u32,w:i32,h:i32,planes:u16,bpp:u16,compression:u32,size_image:u32,xppm:i32,yppm:i32,used:u32,important:u32}
 #[repr(C)] struct GdipInput{ver:u32,cb:*const c_void,no_bg:i32,no_ext:i32}
 #[link(name="user32")] extern "system"{
  fn RegisterClassW(c:*const WndClassW)->u16;
  fn CreateWindowExW(ex:u32,cls:*const u16,name:*const u16,style:u32,x:i32,y:i32,w:i32,h:i32,parent:Hwnd,menu:isize,inst:isize,p:*const c_void)->Hwnd;
  fn DefWindowProcW(h:Hwnd,m:u32,w:usize,l:isize)->isize;
  fn PeekMessageW(m:*mut Msg,h:Hwnd,a:u32,b:u32,r:u32)->i32;fn TranslateMessage(m:*const Msg)->i32;fn DispatchMessageW(m:*const Msg)->isize;
  fn DestroyWindow(h:Hwnd)->i32;fn SystemParametersInfoW(a:u32,b:u32,p:*mut c_void,f:u32)->i32;fn GetDpiForSystem()->u32;
  fn EnumWindows(cb:unsafe extern "system" fn(Hwnd,isize)->i32,l:isize)->i32;fn GetWindowThreadProcessId(h:Hwnd,pid:*mut u32)->u32;fn IsWindowVisible(h:Hwnd)->i32;
  fn MessageBoxW(h:Hwnd,t:*const u16,c:*const u16,f:u32)->i32;fn MsgWaitForMultipleObjects(n:u32,h:*const isize,all:i32,ms:u32,mask:u32)->u32;
  fn AllowSetForegroundWindow(pid:u32)->i32;fn GetDC(h:Hwnd)->isize;fn ReleaseDC(h:Hwnd,dc:isize)->i32;
  fn UpdateLayeredWindow(h:Hwnd,dst:isize,pdst:*const Point,sz:*const Size,src:isize,psrc:*const Point,key:u32,blend:*const Blend,flags:u32)->i32;
 }
 #[link(name="gdi32")] extern "system"{
  fn CreateCompatibleDC(dc:isize)->isize;fn CreateDIBSection(dc:isize,bi:*const BitmapInfoHeader,usage:u32,bits:*mut *mut u8,section:isize,off:u32)->isize;
  fn SelectObject(dc:isize,o:isize)->isize;
 }
 #[link(name="gdiplus")] extern "system"{
  fn GdiplusStartup(tok:*mut usize,i:*const GdipInput,o:*mut c_void)->i32;fn GdipCreateBitmapFromFile(f:*const u16,img:*mut isize)->i32;
  fn GdipCreateBitmapFromScan0(w:i32,h:i32,stride:i32,fmt:i32,scan0:*mut u8,bmp:*mut isize)->i32;fn GdipGetImageGraphicsContext(img:isize,g:*mut isize)->i32;
  fn GdipGraphicsClear(g:isize,argb:u32)->i32;fn GdipSetSmoothingMode(g:isize,m:i32)->i32;fn GdipSetTextRenderingHint(g:isize,m:i32)->i32;fn GdipSetInterpolationMode(g:isize,m:i32)->i32;
  fn GdipDrawImageRectI(g:isize,img:isize,x:i32,y:i32,w:i32,h:i32)->i32;fn GdipGetImageWidth(img:isize,w:*mut u32)->i32;fn GdipGetImageHeight(img:isize,h:*mut u32)->i32;
  fn GdipCreateFontFamilyFromName(name:*const u16,coll:isize,fam:*mut isize)->i32;fn GdipCreateFont(fam:isize,size:f32,style:i32,unit:i32,font:*mut isize)->i32;
  fn GdipCreateStringFormat(flags:i32,lang:u16,fmt:*mut isize)->i32;fn GdipSetStringFormatAlign(fmt:isize,a:i32)->i32;fn GdipSetStringFormatLineAlign(fmt:isize,a:i32)->i32;
  fn GdipCreateSolidFill(argb:u32,b:*mut isize)->i32;fn GdipDeleteBrush(b:isize)->i32;fn GdipDrawString(g:isize,s:*const u16,n:i32,font:isize,r:*const RectF,fmt:isize,b:isize)->i32;fn GdipFillRectangleI(g:isize,b:isize,x:i32,y:i32,w:i32,h:i32)->i32;
 }
 fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(std::iter::once(0)).collect()}
 pub struct Shown{close:Arc<AtomicBool>,thread:Option<std::thread::JoinHandle<()>>,t0:Arc<AtomicU64>,bar:Arc<AtomicU64>}
 impl Shown{
  /* the bar fills, then the whole screen fades out (~280 ms) and goes */
  pub fn close(mut self){self.close.store(true,Ordering::SeqCst);if let Some(t)=self.thread.take(){let _=t.join();}}
  pub fn elapsed_ms(&self)->u64{let n=std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(0);n.saturating_sub(self.t0.load(Ordering::SeqCst))}
  pub fn frame(&self)->u64{self.bar.load(Ordering::SeqCst)}
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
 unsafe extern "system" fn proc_(h:Hwnd,m:u32,w:usize,l:isize)->isize{DefWindowProcW(h,m,w,l)}
 /* everything the loading screen draws, on a transparent 32-bit premultiplied surface: a thin bar and a small soft-shadowed status line */
 struct Surface{g:isize,bits:*mut u8,w:i32,h:i32,logo:isize,lw:i32,lh:i32,font:isize,fmt:isize,sc:f64}
 unsafe fn draw(s:&Surface,status:&str,bar:f64,t:f64){
  GdipGraphicsClear(s.g,0);
  let cx=s.w/2;
  let (lh,top)=(0i32,s.h/2-(14.0*s.sc) as i32);
  /* status line: a soft dark shadow, then near-white text */
  let ty=(top+lh) as f32+(14.0*s.sc) as f32+((3.0*s.sc).max(2.0)) as f32;let tw=s.w as f32;
  for (dx,dy,col) in [(0.0f32,1.0f32,0x22000000u32),(1.0,1.0,0x14000000),(-1.0,1.0,0x14000000)]{
   let mut b:isize=0;GdipCreateSolidFill(col,&mut b);let r=RectF{x:dx,y:ty+dy,w:tw,h:(30.0*s.sc) as f32};let ws=wide(status);GdipDrawString(s.g,ws.as_ptr(),-1,s.font,&r,s.fmt,b);GdipDeleteBrush(b);}
  {let mut b:isize=0;GdipCreateSolidFill(0xB8FFFFFF,&mut b);let r=RectF{x:0.0,y:ty,w:tw,h:(30.0*s.sc) as f32};let ws=wide(status);GdipDrawString(s.g,ws.as_ptr(),-1,s.font,&r,s.fmt,b);GdipDeleteBrush(b);}
  /* thin bar: shadow, glass track, bright fill */
  let bw=(320.0*s.sc) as i32;let bh=((3.0*s.sc) as i32).max(2);let bx=cx-bw/2;let by=top;
  let mut b:isize=0;GdipCreateSolidFill(0x1C000000,&mut b);GdipFillRectangleI(s.g,b,bx-1,by+1,bw+2,bh+2);GdipDeleteBrush(b);
  GdipCreateSolidFill(0x55FFFFFF,&mut b);GdipFillRectangleI(s.g,b,bx,by,bw,bh);GdipDeleteBrush(b);
  GdipCreateSolidFill(0xF2FFFFFF,&mut b);GdipFillRectangleI(s.g,b,bx,by,((bw as f64)*bar.clamp(0.0,1.0)) as i32,bh);GdipDeleteBrush(b);
 }
 pub fn show(logo:&Path,stage:&Path)->Option<Shown>{
  if std::env::var("MEGULIT_EXE_SPLASH").map(|v|v=="0").unwrap_or(false){return None;}
  let _=logo;
  let stage=stage.to_path_buf();
  let close=Arc::new(AtomicBool::new(false));let c2=close.clone();let (tx,rx)=std::sync::mpsc::channel();
  let t0=Arc::new(AtomicU64::new(0));let t02=t0.clone();let bar=Arc::new(AtomicU64::new(0));let bar2=bar.clone();
  let thread=std::thread::spawn(move||unsafe{
   let mut tok=0usize;let input=GdipInput{ver:1,cb:std::ptr::null(),no_bg:0,no_ext:0};
   if GdiplusStartup(&mut tok,&input,std::ptr::null_mut())!=0{let _=tx.send(false);return;}
   let cls=wide("MeguLitSetupSplash");let wc=WndClassW{style:0,proc_:proc_,cls:0,wnd:0,inst:0,icon:0,cursor:0,bg:0,menu:std::ptr::null(),name:cls.as_ptr()};RegisterClassW(&wc);
   /* same box as the setup window: 913x584 (91 % of the 1000x640 design box) at the system scale, never larger than the work area, centred on it */
   let mut wa:Rect=std::mem::zeroed();SystemParametersInfoW(0x0030,0,&mut wa as *mut Rect as *mut c_void,0);
   let (ww,wh)=((wa.r-wa.l) as f64,(wa.b-wa.t) as f64);let scale=(GetDpiForSystem() as f64/96.0).min(ww/913.0).min(wh/584.0).max(0.5);
   let (w,h)=((913.0*scale) as i32,(584.0*scale) as i32);let (x,y)=(wa.l+((ww as i32-w)/2).max(0),wa.t+((wh as i32-h)/2).max(0));
   let title=wide("MeguLit");
   /* WS_EX_TOOLWINDOW|TOPMOST|NOACTIVATE|LAYERED|TRANSPARENT: no background at all (per-pixel alpha), click-through, above the skin window without taking the focus; WS_POPUP|WS_VISIBLE */
   let hwnd=CreateWindowExW(0x80|0x8|0x0800_0000|0x0008_0000|0x20,cls.as_ptr(),title.as_ptr(),0x9000_0000,x,y,w,h,0,0,0,std::ptr::null());
   if hwnd==0{let _=tx.send(false);return;}
   /* the 32-bit ARGB surface: a DIB section wrapped by a GDI+ bitmap, so GDI+ draws real alpha into it */
   let screen=GetDC(0);let mem=CreateCompatibleDC(screen);
   let bi=BitmapInfoHeader{size:40,w,h:-h,planes:1,bpp:32,compression:0,size_image:0,xppm:0,yppm:0,used:0,important:0};
   let mut bits:*mut u8=std::ptr::null_mut();let dib=CreateDIBSection(screen,&bi,0,&mut bits,0,0);
   if dib==0||bits.is_null(){let _=tx.send(false);return;}SelectObject(mem,dib);
   let mut bmp:isize=0;let mut g:isize=0;
   if GdipCreateBitmapFromScan0(w,h,w*4,0x000E200B,bits,&mut bmp)!=0||GdipGetImageGraphicsContext(bmp,&mut g)!=0||g==0{let _=tx.send(false);return;}   /* PixelFormat32bppPARGB */
   GdipSetSmoothingMode(g,4);GdipSetTextRenderingHint(g,4);GdipSetInterpolationMode(g,7);
   let (lw,lh,limg)=(0i32,0i32,0isize);
   let mut fam:isize=0;if GdipCreateFontFamilyFromName(wide("Microsoft YaHei UI").as_ptr(),0,&mut fam)!=0{GdipCreateFontFamilyFromName(wide("Segoe UI").as_ptr(),0,&mut fam);}
   let mut font:isize=0;GdipCreateFont(fam,(12.0*scale) as f32,0,2,&mut font);
   let mut fmt:isize=0;GdipCreateStringFormat(0,0,&mut fmt);GdipSetStringFormatAlign(fmt,1);GdipSetStringFormatLineAlign(fmt,0);
   let surf=Surface{g,bits,w,h,logo:limg,lw,lh,font,fmt,sc:scale};
   let present=|alpha:u8|{let pt=Point{x,y};let sz=Size{cx:w,cy:h};let ps=Point{x:0,y:0};let bl=Blend{op:0,flags:0,alpha,fmt:1};UpdateLayeredWindow(hwnd,screen,&pt,&sz,mem,&ps,0,&bl,2);};
   let start=std::time::Instant::now();
   let mut status="正在启动…".to_string();draw(&surf,&status,0.06,0.0);present(255);log("exe-splash-shown");
   t02.store(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d|d.as_millis() as u64).unwrap_or(1).max(1),Ordering::SeqCst);
   let _=tx.send(true);
   let mut msg:Msg=std::mem::zeroed();let mut shown_p=60.0f64;let mut target=60.0f64;let mut last_read=std::time::Instant::now();let mut frames=0u32;let mut worst=0u128;
   while !c2.load(Ordering::SeqCst){
    MsgWaitForMultipleObjects(0,std::ptr::null(),0,16,0x04FF);
    while PeekMessageW(&mut msg,0,0,0,1)!=0{TranslateMessage(&msg);DispatchMessageW(&msg);}
    if last_read.elapsed().as_millis()>=100{last_read=std::time::Instant::now();
     if let Some((f,t))=read_stage(&stage){target=(f*1000.0).max(60.0);status=t;}
     else{target=(target+3.0).min(150.0);}   /* before the script says anything: a slow creep */
    }
    shown_p+=(target-shown_p)*0.12+0.4;if shown_p>target{shown_p=target;}
    bar2.store(shown_p as u64,Ordering::SeqCst);
    let td=std::time::Instant::now();draw(&surf,&status,shown_p/1000.0,start.elapsed().as_secs_f64());present(255);frames+=1;worst=worst.max(td.elapsed().as_millis());
   }
   log(&format!("exe-splash-anim frames={} worst-frame-ms={}",frames,worst));
   /* the bar fills, then the whole screen fades out over ~280 ms while the skin window (already in front of the desktop, fading in) shows through */
   draw(&surf,&status,1.0,start.elapsed().as_secs_f64());present(255);std::thread::sleep(std::time::Duration::from_millis(90));
   let steps=14;for k in 1..=steps{let a=(255.0*(1.0-k as f64/steps as f64)) as u8;draw(&surf,&status,1.0,start.elapsed().as_secs_f64());present(a);std::thread::sleep(std::time::Duration::from_millis(20));}
   log("exe-splash-faded");DestroyWindow(hwnd);ReleaseDC(0,screen);
  });
  match rx.recv_timeout(std::time::Duration::from_secs(3)){Ok(true)=>Some(Shown{close,thread:Some(thread),t0,bar}),_=>{close.store(true,Ordering::SeqCst);None}}
 }
 struct Find{pid:u32,found:bool}
 unsafe extern "system" fn each(h:Hwnd,l:isize)->i32{let f=&mut *(l as *mut Find);let mut p=0u32;GetWindowThreadProcessId(h,&mut p);if p==f.pid&&IsWindowVisible(h)!=0{f.found=true;return 0;}1}
 pub fn process_has_window(pid:u32)->bool{let mut f=Find{pid,found:false};unsafe{EnumWindows(each,&mut f as *mut Find as isize);}f.found}
 pub fn error(text:&str){let t=wide(text);let c=wide("MeguLit");unsafe{MessageBoxW(0,t.as_ptr(),c.as_ptr(),0x10);}}
}
