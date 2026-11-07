// SPDX-License-Identifier: GPL-3.0-or-later
// Loaded before module imports so initialization failures cannot disappear silently.
(()=>{const report=(phase,error='')=>{try{const request=window.__TAURI_INTERNALS__?.invoke('service',{request:{action:'reader_health',phase,error:String(error).slice(0,2000)}});request?.catch(()=>{});}catch{}};
report('document-created');
addEventListener('error',event=>{if(window.__TOME_READER_READY__)return;const message=event.message||('Failed to load '+(event.target?.src||'reader resource'));report('bootstrap-error',message);},true);
addEventListener('unhandledrejection',event=>{if(!window.__TOME_READER_READY__)report('bootstrap-rejection',event.reason?.message||event.reason);});})();
