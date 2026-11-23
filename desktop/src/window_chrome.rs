// SPDX-License-Identifier: GPL-3.0-or-later
// MeguLit's overlay windows never show anything Windows draws around a window (user, 2026-11-19: 「这蓝框咋又跑出来了
// 能不能根治一下 也是搞了三十多次的问题了」).
//
// What drew the blue strip: tao gives every window WS_CAPTION | WS_SYSMENU, "undecorated" or not, and hides the frame only
// by answering WM_NCCALCSIZE with 0. WM_NCACTIVATE still goes to DefWindowProc, which paints the classic caption (light
// blue, COLOR_GRADIENTACTIVECAPTION) straight into the window whenever it gains or loses the foreground; under a
// transparent WebView that paint shows through and stays. GalWindowBridge took WS_CAPTION off afterwards from another
// process, tao wrote its own style back on its next flag change (show, hide, topmost, minimise), and every earlier fix
// repaired one of the moments in between: the accent border, the ghost window, the first activation, the menu drag.
//
// The rule now lives in the process that owns the window, at the three places every such change has to pass:
//  - WM_STYLECHANGING: whoever calls SetWindowLong, in whichever process, the frame bits never reach the window
//  - WM_NCCALCSIZE / WM_NCPAINT / WM_NCACTIVATE (+ the two undocumented theme paints): no non-client area and nothing
//    painted into one; the activation still reaches tao (focus events), DefWindowProc is told not to repaint (lParam -1)
//  - the DWM attributes (accent border, rounded corners, backdrop) are set when the guard goes on
// violations() reports what does not hold; the bridge logs it as chromeState when it ever sees a frame again.
// No dependency on tauri or tao: `rustc --test desktop/src/window_chrome.rs` builds the self-test on its own; it works on
// hidden windows only and shows nothing.
#![allow(non_snake_case, dead_code, clippy::upper_case_acronyms)]
use std::ffi::c_void;

type HWND = *mut c_void;
type WNDPROC = unsafe extern "system" fn(HWND, u32, usize, isize) -> isize;

pub const WS_POPUP: u32 = 0x8000_0000;
pub const WS_CAPTION: u32 = 0x00C0_0000;
pub const WS_THICKFRAME: u32 = 0x0004_0000;
pub const WS_EX_DLGMODALFRAME: u32 = 0x0000_0001;
pub const WS_EX_TOOLWINDOW: u32 = 0x0000_0080;
pub const WS_EX_WINDOWEDGE: u32 = 0x0000_0100;
pub const WS_EX_CLIENTEDGE: u32 = 0x0000_0200;
pub const WS_EX_STATICEDGE: u32 = 0x0002_0000;
pub const WS_EX_APPWINDOW: u32 = 0x0004_0000;
const GWL_STYLE: i32 = -16;
const GWL_EXSTYLE: i32 = -20;
const GWLP_WNDPROC: i32 = -4;
const WM_NCDESTROY: u32 = 0x0082;
const WM_STYLECHANGING: u32 = 0x007C;
const WM_NCCALCSIZE: u32 = 0x0083;
const WM_NCPAINT: u32 = 0x0085;
const WM_NCACTIVATE: u32 = 0x0086;
const WM_NCUAHDRAWCAPTION: u32 = 0x00AE;
const WM_NCUAHDRAWFRAME: u32 = 0x00AF;

/// The window style an overlay may have: no caption, no sizing frame, a popup. Everything else is left as asked.
/// The same value GalWindowBridge.HostedStyle computes, so the two never disagree.
pub fn chromeless_style(style: u32) -> u32 { (style & !(WS_CAPTION | WS_THICKFRAME)) | WS_POPUP }
/// The extended style an overlay may have: no edge of any kind, a tool window (no taskbar button, no Alt+Tab entry).
pub fn chromeless_ex_style(ex: u32) -> u32 {
  (ex & !(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE | WS_EX_APPWINDOW)) | WS_EX_TOOLWINDOW
}

#[repr(C)] struct STYLESTRUCT { old: u32, new: u32 }
#[repr(C)] #[derive(Clone, Copy, Default, PartialEq, Debug)] struct RECT { left: i32, top: i32, right: i32, bottom: i32 }
#[repr(C)] #[derive(Clone, Copy, Default)] struct POINT { x: i32, y: i32 }

#[cfg(windows)]
#[link(name = "user32")]
extern "system" {
  fn GetWindowLongW(hwnd: HWND, index: i32) -> i32;
  fn SetWindowLongW(hwnd: HWND, index: i32, value: i32) -> i32;
  #[cfg(target_pointer_width = "64")] fn GetWindowLongPtrW(hwnd: HWND, index: i32) -> isize;
  #[cfg(target_pointer_width = "64")] fn SetWindowLongPtrW(hwnd: HWND, index: i32, value: isize) -> isize;
  fn CallWindowProcW(previous: isize, hwnd: HWND, message: u32, wparam: usize, lparam: isize) -> isize;
  fn SetPropW(hwnd: HWND, name: *const u16, value: *mut c_void) -> i32;
  fn GetPropW(hwnd: HWND, name: *const u16) -> *mut c_void;
  fn RemovePropW(hwnd: HWND, name: *const u16) -> *mut c_void;
  fn SetWindowPos(hwnd: HWND, after: HWND, x: i32, y: i32, width: i32, height: i32, flags: u32) -> i32;
  fn GetWindowRect(hwnd: HWND, rect: *mut RECT) -> i32;
  fn GetClientRect(hwnd: HWND, rect: *mut RECT) -> i32;
  fn ClientToScreen(hwnd: HWND, point: *mut POINT) -> i32;
  fn IsWindow(hwnd: HWND) -> i32;
  fn RedrawWindow(hwnd: HWND, rect: *const RECT, region: *mut c_void, flags: u32) -> i32;
}
#[cfg(windows)]
#[link(name = "dwmapi")]
extern "system" { fn DwmSetWindowAttribute(hwnd: HWND, attribute: u32, value: *const u32, size: u32) -> i32; }

#[cfg(all(windows, target_pointer_width = "64"))]
unsafe fn get_proc(hwnd: HWND) -> isize { GetWindowLongPtrW(hwnd, GWLP_WNDPROC) }
#[cfg(all(windows, target_pointer_width = "64"))]
unsafe fn set_proc(hwnd: HWND, value: isize) -> isize { SetWindowLongPtrW(hwnd, GWLP_WNDPROC, value) }
#[cfg(all(windows, target_pointer_width = "32"))]
unsafe fn get_proc(hwnd: HWND) -> isize { GetWindowLongW(hwnd, GWLP_WNDPROC) as isize }
#[cfg(all(windows, target_pointer_width = "32"))]
unsafe fn set_proc(hwnd: HWND, value: isize) -> isize { SetWindowLongW(hwnd, GWLP_WNDPROC, value as i32) as isize }

#[cfg(windows)]
const PROP: [u16; 21] = {
  let text = b"MeguLitChromeGuardV1\0"; let mut out = [0u16; 21]; let mut i = 0;
  while i < 21 { out[i] = text[i] as u16; i += 1; } out
};

#[cfg(windows)]
unsafe extern "system" fn guard_proc(hwnd: HWND, message: u32, wparam: usize, lparam: isize) -> isize {
  let previous = GetPropW(hwnd, PROP.as_ptr()) as isize;
  match message {
    WM_STYLECHANGING if lparam != 0 => {
      let change = &mut *(lparam as *mut STYLESTRUCT);
      if wparam as i32 == GWL_STYLE { change.new = chromeless_style(change.new); }
      else if wparam as i32 == GWL_EXSTYLE { change.new = chromeless_ex_style(change.new); }
      CallWindowProcW(previous, hwnd, message, wparam, lparam)
    }
    /* the client area is the whole window, whatever the style says at this moment */
    WM_NCCALCSIZE if wparam != 0 => 0,
    WM_NCPAINT | WM_NCUAHDRAWCAPTION | WM_NCUAHDRAWFRAME => 0,
    /* tao still hears the activation; -1 tells DefWindowProc not to repaint a caption */
    WM_NCACTIVATE => { CallWindowProcW(previous, hwnd, message, wparam, -1); 1 }
    WM_NCDESTROY => {
      if get_proc(hwnd) == guard_proc as *const () as usize as isize { set_proc(hwnd, previous); }
      RemovePropW(hwnd, PROP.as_ptr());
      CallWindowProcW(previous, hwnd, message, wparam, lparam)
    }
    _ => CallWindowProcW(previous, hwnd, message, wparam, lparam),
  }
}

/// Puts the guard on a window (once) and brings the window to the chromeless state now. Call it right after the window
/// is created, on the thread that owns it. Returns false when the window is gone.
#[cfg(windows)]
pub unsafe fn install(hwnd: HWND) -> bool {
  if hwnd.is_null() || IsWindow(hwnd) == 0 { return false; }
  if GetPropW(hwnd, PROP.as_ptr()).is_null() {
    let previous = get_proc(hwnd);
    if previous == 0 || SetPropW(hwnd, PROP.as_ptr(), previous as *mut c_void) == 0 { return false; }
    set_proc(hwnd, guard_proc as *const () as usize as isize);
  }
  /* through the guard itself: WM_STYLECHANGING filters these writes like anyone else's */
  SetWindowLongW(hwnd, GWL_STYLE, GetWindowLongW(hwnd, GWL_STYLE));
  SetWindowLongW(hwnd, GWL_EXSTYLE, GetWindowLongW(hwnd, GWL_EXSTYLE));
  /* DWMWA_BORDER_COLOR = DWMWA_COLOR_NONE, DWMWA_WINDOW_CORNER_PREFERENCE = DWMWCP_DONOTROUND, DWMWA_SYSTEMBACKDROP_TYPE = none
     (each fails harmlessly before Windows 11) */
  for (attribute, value) in [(34u32, 0xffff_fffeu32), (33, 1), (38, 1)] { DwmSetWindowAttribute(hwnd, attribute, &value, 4); }
  /* SWP_NOSIZE NOMOVE NOZORDER NOACTIVATE FRAMECHANGED: the frame is recalculated; then whatever was painted before goes */
  SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020);
  RedrawWindow(hwnd, std::ptr::null(), std::ptr::null_mut(), 0x0001 | 0x0004 | 0x0400 | 0x0080);
  true
}

/// What is wrong with a window that should be chromeless, as words for a log; empty when all holds.
#[cfg(windows)]
pub unsafe fn violations(hwnd: HWND) -> Vec<String> {
  let mut out = Vec::new();
  if hwnd.is_null() || IsWindow(hwnd) == 0 { return out; }
  let style = GetWindowLongW(hwnd, GWL_STYLE) as u32; let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
  if style != chromeless_style(style) { out.push(format!("style {:#010x}", style)); }
  if ex != chromeless_ex_style(ex) { out.push(format!("exstyle {:#010x}", ex)); }
  let (mut window, mut client, mut origin) = (RECT::default(), RECT::default(), POINT::default());
  if GetWindowRect(hwnd, &mut window) != 0 && GetClientRect(hwnd, &mut client) != 0 && ClientToScreen(hwnd, &mut origin) != 0 {
    let nc = [origin.x - window.left, origin.y - window.top, window.right - (origin.x + client.right), window.bottom - (origin.y + client.bottom)];
    if nc != [0, 0, 0, 0] { out.push(format!("non-client area {:?}", nc)); }
  }
  if GetPropW(hwnd, PROP.as_ptr()).is_null() || get_proc(hwnd) != guard_proc as *const () as usize as isize { out.push("guard not installed".into()); }
  out
}

#[cfg(all(test, windows))]
mod tests {
  use super::*;
  use std::sync::atomic::{AtomicIsize, AtomicUsize, Ordering};
  #[repr(C)] struct WNDCLASSW { style: u32, proc: WNDPROC, class_extra: i32, window_extra: i32, instance: *mut c_void, icon: *mut c_void, cursor: *mut c_void, background: *mut c_void, menu: *const u16, name: *const u16 }
  #[link(name = "user32")]
  extern "system" {
    fn RegisterClassW(class: *const WNDCLASSW) -> u16;
    fn CreateWindowExW(ex: u32, class: *const u16, title: *const u16, style: u32, x: i32, y: i32, w: i32, h: i32, parent: HWND, menu: *mut c_void, instance: *mut c_void, param: *mut c_void) -> HWND;
    fn DefWindowProcW(hwnd: HWND, message: u32, wparam: usize, lparam: isize) -> isize;
    fn DestroyWindow(hwnd: HWND) -> i32;
    fn SendMessageW(hwnd: HWND, message: u32, wparam: usize, lparam: isize) -> isize;
    fn IsWindowVisible(hwnd: HWND) -> i32;
    fn SetWindowRgn(hwnd: HWND, region: *mut c_void, redraw: i32) -> i32;
    fn SetWindowTextW(hwnd: HWND, text: *const u16) -> i32;
  }
  #[link(name = "gdi32")] extern "system" { fn CreateRectRgn(l: i32, t: i32, r: i32, b: i32) -> *mut c_void; }
  #[link(name = "kernel32")] extern "system" { fn GetModuleHandleW(name: *const u16) -> *mut c_void; }

  /* what reaches the window's own procedure (tao's, then DefWindowProc, in the app): a caption paint is counted here */
  static PAINTS: AtomicUsize = AtomicUsize::new(0);
  static ACTIVATIONS: AtomicUsize = AtomicUsize::new(0);
  static LAST_ACTIVATE_LPARAM: AtomicIsize = AtomicIsize::new(0);
  unsafe extern "system" fn base_proc(hwnd: HWND, message: u32, wparam: usize, lparam: isize) -> isize {
    match message {
      WM_NCPAINT | WM_NCUAHDRAWCAPTION | WM_NCUAHDRAWFRAME => { PAINTS.fetch_add(1, Ordering::SeqCst); }
      WM_NCACTIVATE => { ACTIVATIONS.fetch_add(1, Ordering::SeqCst); LAST_ACTIVATE_LPARAM.store(lparam, Ordering::SeqCst); if lparam != -1 { PAINTS.fetch_add(1, Ordering::SeqCst); } }
      _ => {}
    }
    DefWindowProcW(hwnd, message, wparam, lparam)
  }
  /* the unguarded window counts on its own (the tests run side by side) */
  static BARE_PAINTS: AtomicUsize = AtomicUsize::new(0);
  unsafe extern "system" fn bare_proc(hwnd: HWND, message: u32, wparam: usize, lparam: isize) -> isize {
    if matches!(message, WM_NCPAINT | WM_NCUAHDRAWCAPTION | WM_NCUAHDRAWFRAME) || message == WM_NCACTIVATE && lparam != -1 { BARE_PAINTS.fetch_add(1, Ordering::SeqCst); }
    DefWindowProcW(hwnd, message, wparam, lparam)
  }
  fn wide(text: &str) -> Vec<u16> { text.encode_utf16().chain(std::iter::once(0)).collect() }
  /* a window as tao makes an "undecorated" one: caption, system menu, boxes, window edge; never shown, off screen */
  unsafe fn tao_like(name: &str, proc: WNDPROC) -> HWND {
    let class = wide(name);
    let definition = WNDCLASSW { style: 0, proc, class_extra: 0, window_extra: 0, instance: GetModuleHandleW(std::ptr::null()), icon: std::ptr::null_mut(), cursor: std::ptr::null_mut(), background: std::ptr::null_mut(), menu: std::ptr::null(), name: class.as_ptr() };
    RegisterClassW(&definition);
    CreateWindowExW(0x0000_0100 | 0x0000_0010 | 0x0004_0000, class.as_ptr(), wide("MeguLit chrome guard test").as_ptr(), 0x00C0_0000 | 0x0400_0000 | 0x0008_0000 | 0x0002_0000 | 0x0001_0000, -32000, -32000, 640, 480, std::ptr::null_mut(), std::ptr::null_mut(), GetModuleHandleW(std::ptr::null()), std::ptr::null_mut())
  }
  struct Rng(u64);
  impl Rng { fn next(&mut self, n: u32) -> u32 { self.0 ^= self.0 << 13; self.0 ^= self.0 >> 7; self.0 ^= self.0 << 17; ((self.0 >> 20) % n as u64) as u32 } }
  /* everything that happens to the reading layer in the app, in any order: tao rewriting its style (show / hide /
     topmost / minimise flags), the bridge and the page moving, resizing, raising and sinking it, activation coming
     and going, a DPI change, regions, the title. The window itself stays hidden: none of this needs it on screen. */
  unsafe fn step(hwnd: HWND, rng: &mut Rng) -> &'static str {
    const TAO: u32 = 0x00C0_0000 | 0x0400_0000 | 0x0008_0000;
    match rng.next(14) {
      0 => { SetWindowLongW(hwnd, GWL_STYLE, (TAO | 0x0002_0000 | 0x0001_0000) as i32); "tao rewrites its style" }
      1 => { SetWindowLongW(hwnd, GWL_STYLE, (TAO | WS_THICKFRAME | 0x0001_0000) as i32); "tao style with a sizing frame" }
      2 => { SetWindowLongW(hwnd, GWL_EXSTYLE, (0x0000_0100u32 | 0x0000_0010 | 0x0004_0000) as i32); "tao rewrites its extended style" }
      3 => { SetWindowLongW(hwnd, GWL_EXSTYLE, (0x0000_0100u32 | 0x0000_0200 | 0x0000_0008 | 0x0800_0000 | 0x0008_0000) as i32); "edges, topmost, no-activate, layered" }
      4 => { SendMessageW(hwnd, WM_NCACTIVATE, 1, 0); "activated" }
      5 => { SendMessageW(hwnd, WM_NCACTIVATE, 0, 0); "deactivated" }
      6 => { SetWindowPos(hwnd, -1isize as HWND, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010); "topmost" }
      7 => { SetWindowPos(hwnd, 1isize as HWND, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010); "sunk" }
      8 => { let (w, h) = (200 + rng.next(3000) as i32, 100 + rng.next(2000) as i32); SetWindowPos(hwnd, std::ptr::null_mut(), -32000, -32000, w, h, 0x0004 | 0x0010); "resized" }
      9 => { SetWindowPos(hwnd, std::ptr::null_mut(), 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0004 | 0x0010 | 0x0020); "frame changed" }
      10 => { let rect = RECT { left: -32000, top: -32000, right: -31000, bottom: -31200 }; SendMessageW(hwnd, 0x02E0, (144usize << 16) | 144, &rect as *const RECT as isize); "DPI changed" }
      11 => { SetWindowRgn(hwnd, CreateRectRgn(10, 12, 590, 744), 1); "menu region" }
      12 => { SetWindowTextW(hwnd, wide("MeguLit").as_ptr()); SendMessageW(hwnd, WM_NCPAINT, 1, 0); "title set, frame paint asked" }
      _ => { SetWindowLongW(hwnd, GWL_STYLE, (GetWindowLongW(hwnd, GWL_STYLE) as u32 | WS_CAPTION) as i32); SendMessageW(hwnd, WM_NCACTIVATE, 1, 0); "caption added, then activated" }
    }
  }

  #[test]
  fn policy() {
    assert_eq!(chromeless_style(0x04CB_0000), 0x840B_0000, "the reader window as tao makes it");
    assert_eq!(chromeless_style(0x840B_0000), 0x840B_0000);
    assert_eq!(chromeless_ex_style(0x0004_0110), 0x0000_0090);
    assert_eq!(chromeless_ex_style(0x0808_0098), 0x0808_0098, "topmost, layered and no-activate are the bridge's and stay");
  }

  #[test]
  fn guarded_window_never_has_a_frame_and_never_paints_one() {
    unsafe {
      let hwnd = tao_like("MeguLitChromeGuardTestGuarded", base_proc);
      assert!(!hwnd.is_null());
      assert!(install(hwnd));
      assert!(install(hwnd), "installing twice is harmless");
      assert_eq!(violations(hwnd), Vec::<String>::new(), "right after install");
      PAINTS.store(0, Ordering::SeqCst); ACTIVATIONS.store(0, Ordering::SeqCst);
      let mut activations = 0;
      for seed in 1..=40u64 {
        let mut rng = Rng(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15));
        for index in 0..250 {
          let before = ACTIVATIONS.load(Ordering::SeqCst);
          let what = step(hwnd, &mut rng);
          assert_eq!(violations(hwnd), Vec::<String>::new(), "seed {seed} step {index}: {what}");
          assert_eq!(PAINTS.load(Ordering::SeqCst), 0, "seed {seed} step {index}: {what}: a frame paint reached the window");
          assert_eq!(IsWindowVisible(hwnd), 0, "the test window is never shown");
          if ACTIVATIONS.load(Ordering::SeqCst) > before { activations += 1; assert_eq!(LAST_ACTIVATE_LPARAM.load(Ordering::SeqCst), -1); }
        }
      }
      assert!(activations > 500, "activations still reach the window's own procedure (tao needs them for focus events)");
      assert_eq!(SendMessageW(hwnd, WM_NCACTIVATE, 0, 0), 1, "deactivation is always allowed");
      DestroyWindow(hwnd);
    }
  }

  /* the code before: no guard; the bridge strips the caption from outside now and then. Some sequence leaves a frame. */
  #[test]
  fn without_the_guard_the_same_sequences_leave_a_frame() {
    unsafe {
      let hwnd = tao_like("MeguLitChromeGuardTestBare", bare_proc);
      assert!(!hwnd.is_null());
      let before = BARE_PAINTS.load(Ordering::SeqCst);
      let mut framed = 0;
      let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
      for index in 0..250 {
        if index % 5 == 0 { SetWindowLongW(hwnd, GWL_STYLE, chromeless_style(GetWindowLongW(hwnd, GWL_STYLE) as u32) as i32); }
        step(hwnd, &mut rng);
        let style = GetWindowLongW(hwnd, GWL_STYLE) as u32;
        if style != chromeless_style(style) { framed += 1; }
      }
      assert!(framed > 0, "the unguarded window had frame styles at some step");
      assert!(BARE_PAINTS.load(Ordering::SeqCst) > before, "and an activation was painted by DefWindowProc");
      DestroyWindow(hwnd);
    }
  }
}
