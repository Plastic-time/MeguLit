// SPDX-License-Identifier: GPL-3.0-or-later
// Updates without a restart (user 2026-11-13: 不重启装更新). The page files are built into MeguLit.exe, so a hot update
// (services/hot-update.cjs) writes the new ones into the web folder next to it and records the exe it was applied to in
// data/hot-update.json. While that record names this exe, pages read the web folder first and fall back to the built-in
// copy for anything missing there (fonts are not shipped as files). A full update replaces MeguLit.exe, its size and
// time no longer match, and the built-in copy is used again. HTML stays built in: its CSP hashes are made at build time.
use std::{borrow::Cow,path::{Path,PathBuf},sync::{OnceLock,atomic::{AtomicBool,Ordering}},time::UNIX_EPOCH};
use tauri::{Assets,Runtime,utils::assets::{AssetKey,AssetsIter,CspHash}};

static ROOT:OnceLock<PathBuf>=OnceLock::new();
static ON:AtomicBool=AtomicBool::new(false);

/// Size and write time of MeguLit.exe, written the same way by services/hot-update.cjs (exeStamp).
pub fn stamp(root:&Path)->Option<String>{
 let meta=std::fs::metadata(root.join("MeguLit.exe")).ok()?;
 let ms=meta.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis();
 Some(format!("{}-{}",meta.len(),ms))
}
/// Reads data/hot-update.json again; called at start and after a hot update was applied.
pub fn refresh(root:&Path)->bool{
 let _=ROOT.set(root.to_path_buf());
 let on=(||{let v:serde_json::Value=serde_json::from_slice(&std::fs::read(root.join("data/hot-update.json")).ok()?).ok()?;Some(v["exe"].as_str()?==stamp(root)?)})().unwrap_or(false);
 ON.store(on,Ordering::SeqCst);on
}
fn from_disk(key:&AssetKey)->Option<Vec<u8>>{
 if !ON.load(Ordering::SeqCst){return None;}
 let root=ROOT.get()?;let k=key.as_ref().trim_start_matches('/');
 if k.is_empty()||k.ends_with(".html")||k.split('/').any(|p|p.is_empty()||p==".."||p=="."||p.contains(':')||p.contains('\\')){return None;}
 std::fs::read(root.join("web").join(k)).ok()
}

struct Empty;
impl<R:Runtime> Assets<R> for Empty{
 fn get(&self,_:&AssetKey)->Option<Cow<'_,[u8]>>{None}
 fn iter(&self)->Box<AssetsIter<'_>>{Box::new(std::iter::empty())}
 fn csp_hashes(&self,_:&AssetKey)->Box<dyn Iterator<Item=CspHash<'_>>+'_>{Box::new(std::iter::empty())}
}
struct HotAssets<R:Runtime>{inner:Box<dyn Assets<R>>}
impl<R:Runtime> Assets<R> for HotAssets<R>{
 fn setup(&self,app:&tauri::App<R>){self.inner.setup(app)}
 fn get(&self,key:&AssetKey)->Option<Cow<'_,[u8]>>{if let Some(bytes)=from_disk(key){return Some(Cow::Owned(bytes));}self.inner.get(key)}
 fn iter(&self)->Box<AssetsIter<'_>>{self.inner.iter()}
 fn csp_hashes(&self,html:&AssetKey)->Box<dyn Iterator<Item=CspHash<'_>>+'_>{self.inner.csp_hashes(html)}
}
pub fn wrap<R:Runtime>(context:&mut tauri::Context<R>,root:&Path){
 refresh(root);
 let inner=context.set_assets(Box::new(Empty));
 context.set_assets(Box::new(HotAssets{inner}));
}
