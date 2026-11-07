// SPDX-License-Identifier: GPL-3.0-or-later
#[cfg(windows)]
pub fn read()->Result<String,String>{
 use std::ffi::c_void;
 #[link(name="user32")] extern "system"{fn OpenClipboard(window:*mut c_void)->i32;fn CloseClipboard()->i32;fn GetClipboardData(format:u32)->*mut c_void;}
 #[link(name="kernel32")] extern "system"{fn GlobalLock(memory:*mut c_void)->*mut c_void;fn GlobalUnlock(memory:*mut c_void)->i32;fn GlobalSize(memory:*mut c_void)->usize;}
 unsafe{
  if OpenClipboard(std::ptr::null_mut())==0{return Err("CLIPBOARD_BUSY".into());}
  let result=(||{let handle=GetClipboardData(13);if handle.is_null(){return Ok(String::new());}let size=GlobalSize(handle);if size>8*1024*1024{return Err("CLIPBOARD_TOO_LARGE".into());}let pointer=GlobalLock(handle);if pointer.is_null(){return Err("CLIPBOARD_UNAVAILABLE".into());}let words=std::slice::from_raw_parts(pointer as *const u16,size/2);let end=words.iter().position(|c|*c==0).unwrap_or(words.len());let text=String::from_utf16_lossy(&words[..end]);GlobalUnlock(handle);Ok(text)})();CloseClipboard();result
 }
}
#[cfg(not(windows))]
pub fn read()->Result<String,String>{Err("CLIPBOARD_UNAVAILABLE".into())}
