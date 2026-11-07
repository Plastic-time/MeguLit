// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';
const fs=require('node:fs'),path=require('node:path');const file=path.resolve(__dirname,'../native/GalWindowBridge.cs');let source=fs.readFileSync(file).toString('latin1');
if(!source.includes('PreferredOverlay')){
 source=source.replace('static void FindOverlay(){','static IntPtr PreferredOverlay=IntPtr.Zero;\r\n    static void FindOverlay(){\r\n        if(PreferredOverlay!=IntPtr.Zero&&IsWindow(PreferredOverlay)){uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);if(owner==OverlayPid){Overlay=PreferredOverlay;return;}}');
 const old='if(args.Length!=1||!Int32.TryParse(args[0],out OverlayPid))return 2;';if(!source.includes(old))throw Error('NATIVE_ENTRY_CHANGED');source=source.replace(old,'if((args.Length!=1&&args.Length!=2)||!Int32.TryParse(args[0],out OverlayPid))return 2;\r\n        if(args.Length==2){long handle;if(!Int64.TryParse(args[1],out handle))return 2;PreferredOverlay=new IntPtr(handle);uint owner;GetWindowThreadProcessId(PreferredOverlay,out owner);if(owner!=OverlayPid)return 2;}');fs.writeFileSync(file,Buffer.from(source,'latin1'));
}
console.log('Explicit reader HWND selection prepared; original byte encoding retained');
