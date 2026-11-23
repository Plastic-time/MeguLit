// SPDX-License-Identifier: GPL-3.0-or-later
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use webview2_com::{CallDevToolsProtocolMethodCompletedHandler, CoTaskMemPWSTR};

pub fn dispatch(app: &AppHandle, event: &Value) {
    let Some(window) = app.get_webview_window("reader") else { return };
    let Some(kind @ ("mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel" | "wheelHitTest")) = event["kind"].as_str() else { return };
    let wheel_id = event["id"].as_i64().filter(|_| kind == "wheelHitTest");
    if kind == "wheelHitTest" && wheel_id.is_none() { return; }
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
        "clickCount": if matches!(kind, "mousePressed" | "mouseReleased") { 1 } else { 0 }
    });
    if kind == "mouseWheel" {
        packet["deltaX"] = json!(event["deltaX"].as_i64().unwrap_or_default());
        packet["deltaY"] = json!(event["deltaY"].as_i64().unwrap_or_default());
    }
    let root = app.state::<crate::DesktopState>().root.clone();
    let _ = window.with_webview(move |webview| unsafe {
        let controller = webview.controller();
        let result = (|| {
            let view = controller.CoreWebView2()?;
            let mut zoom = 1.0;
            controller.ZoomFactor(&mut zoom)?;
            let x = x as f64 / (scale * zoom);
            let y = y as f64 / (scale * zoom);
            let method = if let Some(id) = wheel_id {
                packet = json!({"expression": format!("window.__megulitResolveWheel?.({id},{x},{y})")});
                "Runtime.evaluate"
            } else {
                packet["x"] = json!(x);
                packet["y"] = json!(y);
                "Input.dispatchMouseEvent"
            };
            let method = CoTaskMemPWSTR::from(method);
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
