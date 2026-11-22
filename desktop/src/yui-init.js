if (window === window.top) {
  window.megulitYuiStage = stage => window.__TAURI_INTERNALS__?.invoke('yui_stage', {stage}).catch(() => {})
  window.addEventListener('error', () => window.megulitYuiStage('frontend-error'))
  window.addEventListener('unhandledrejection', () => window.megulitYuiStage('frontend-rejection'))
  window.addEventListener('DOMContentLoaded', () => window.megulitYuiStage('document'), {once:true})
}
