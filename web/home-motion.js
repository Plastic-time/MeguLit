// Presentation only. The native host commits hide/taskbar state on its own clock.
export function createHomeMotion({frame,reduced=()=>false}){
 let animation=null;
 return action=>{
  animation?.cancel();animation=null;
  if(action==='hidden'||reduced()||!frame())return;
  const enter=action==='return';
  animation=frame().animate(enter?[{opacity:0},{opacity:1}]:[{opacity:1},{offset:.6,opacity:1},{opacity:0}],{duration:enter?280:240,easing:'ease-out',fill:enter?'none':'forwards'});
  animation.finished.catch(()=>{});
 };
}
