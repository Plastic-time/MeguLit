// Keep simple-library rows exactly as wide as their scroll viewport.
export function libraryColumns(width,gap=28,target=180){return Math.max(1,Math.floor((Math.max(0,width)+gap)/(target+gap)));}
export function fitLibraryGrid(grid){
 let frame=0;
 const fit=()=>{frame=0;if(!grid.isConnected)return;const css=getComputedStyle(grid),padding=(parseFloat(css.paddingLeft)||0)+(parseFloat(css.paddingRight)||0),width=grid.clientWidth-padding,gap=parseFloat(css.columnGap)||0,target=grid.clientWidth<=760?140:180;const columns=libraryColumns(width,gap,target),template=`repeat(${columns},minmax(0,1fr))`;if(grid.style.gridTemplateColumns!==template)grid.style.setProperty('grid-template-columns',template,'important');};
 const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};
 grid.style.setProperty('width','100%');grid.style.setProperty('max-width','none');
 const observer=new ResizeObserver(schedule);observer.observe(grid);schedule();
 return ()=>{observer.disconnect();cancelAnimationFrame(frame);};
}
