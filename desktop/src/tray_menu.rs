// SPDX-License-Identifier: GPL-3.0-or-later
use tauri::{Manager,WindowEvent};
use serde_json::{Value,json};
use crate::{DesktopState,TrayItems};
const WIDTH:f64=150.0;
const HEIGHT:f64=82.0;
pub fn create(app:&tauri::AppHandle)->tauri::Result<()>{
 let menu=tauri::WebviewWindowBuilder::new(app,"tray-menu",tauri::WebviewUrl::App("tray-menu.html".into()))
  .title("MeguLit tray menu").inner_size(WIDTH,HEIGHT).decorations(false).resizable(false)
  .transparent(true).shadow(false).skip_taskbar(true).always_on_top(true).visible(false).focused(false)
  .build()?;
 menu.on_window_event({let app=app.clone();move|event|{if matches!(event,WindowEvent::Focused(false)){if let Some(menu)=app.get_webview_window("tray-menu"){let _=menu.hide();}}}});
 Ok(())
}
pub fn show(app:&tauri::AppHandle,point:tauri::PhysicalPosition<f64>)->Result<(),String>{
 let menu=app.get_webview_window("tray-menu").ok_or("TRAY_MENU_MISSING")?;
 let monitors=menu.available_monitors().map_err(|e|e.to_string())?;
 let monitor=monitors.iter().find(|m|{let p=m.position();let s=m.size();point.x>=p.x as f64&&point.x<(p.x as f64+s.width as f64)&&point.y>=p.y as f64&&point.y<(p.y as f64+s.height as f64)});
 let (mut x,mut y)=(point.x,point.y);
 if let Some(m)=monitor{let area=m.work_area();let scale=m.scale_factor();let w=WIDTH*scale;let h=HEIGHT*scale;let left=area.position.x as f64;let top=area.position.y as f64;x=(point.x-w/2.0).clamp(left,(left+area.size.width as f64-w).max(left));y=(point.y-h-6.0*scale).clamp(top,(top+area.size.height as f64-h).max(top));menu.set_size(tauri::LogicalSize::new(WIDTH,HEIGHT)).map_err(|e|e.to_string())?;}
 menu.set_position(tauri::PhysicalPosition::new(x.round() as i32,y.round() as i32)).map_err(|e|e.to_string())?;
 let language=app.state::<TrayItems>().language.lock().map_err(|e|e.to_string())?.clone();
 let _=menu.eval(format!("window.setTrayLanguage?.({});window.menuEnter?.();",json!(language)));
 menu.show().map_err(|e|e.to_string())?;menu.set_focus().map_err(|e|e.to_string())?;
 Ok(())
}
#[tauri::command]
pub fn tray_menu_action(action:String,window:tauri::WebviewWindow)->Result<Value,String>{
 if window.label()!="tray-menu"{return Err("INVALID_TRAY_WINDOW".into());}
 let app=window.app_handle();
 if action=="language"{return Ok(json!(app.state::<TrayItems>().language.lock().map_err(|e|e.to_string())?.clone()));}
 match action.as_str(){
  "dismiss"=>window.hide().map_err(|e|e.to_string())?,
  "show"=>{window.hide().map_err(|e|e.to_string())?;crate::reveal(app);},
  "exit"=>{app.state::<DesktopState>().exiting.store(true,std::sync::atomic::Ordering::SeqCst);app.exit(0);},
  _=>return Err("INVALID_TRAY_ACTION".into())
 }
 Ok(Value::Null)
}
