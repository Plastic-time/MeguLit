// SPDX-License-Identifier: GPL-3.0-or-later
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};

pub fn dispatch(app: &AppHandle, event: &Value) {
    let Some(window) = app.get_webview_window("reader") else { return };
    let Some(kind @ ("mousePressed" | "mouseReleased" | "mouseMoved")) = event["kind"].as_str() else { return };
    let Some(x) = event["x"].as_i64() else { return };
    let Some(y) = event["y"].as_i64() else { return };
    let button = match event["button"].as_i64() {
        Some(0) => "left",
        Some(1) => "right",
        Some(2) => "middle",
        _ => "none",
    };
    let buttons = event["buttons"].as_u64().unwrap_or_default() & 7;
    let modifiers = event["modifiers"].as_u64().unwrap_or_default() & 15;
    let scale = window.scale_factor().unwrap_or(1.0);
    let mut packet = json!({
        "type": kind, "button": button, "buttons": buttons, "modifiers": modifiers,
        "clickCount": if kind == "mouseMoved" { 0 } else { 1 }
    });
    let root = app.state::<crate::DesktopState>().root.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let controller = webview.controller();
        let result = (|| {
            let view = controller.CoreWebView2()?;
            let mut zoom = 1.0;
            controller.ZoomFactor(&mut zoom)?;
            packet["x"] = json!(x as f64 / (scale * zoom));
            packet["y"] = json!(y as f64 / (scale * zoom));
            let method = CoTaskMemPWSTR::from("Input.dispatchMouseEvent");
            let params = packet.to_string();
            let params = CoTaskMemPWSTR::from(params.as_str());
            let callback_root = root.clone();
            let done = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(move |status, _| {
                if let Err(error) = status {
                    crate::reader_log(&callback_root, "pointer-dispatch-failed", &error.to_string());
                }
                Ok(())
            }));
            view.CallDevToolsProtocolMethod(*method.as_ref().as_pcwstr(), *params.as_ref().as_pcwstr(), &done)
        })();
        if let Err(error) = result {
            crate::reader_log(&root, "pointer-dispatch-failed", &error.to_string());
        }
    });
}
