// Reserve the real, already laid-out headings and statistics before sizing covers.
export function coverHeight({width,height,gap=14,columns=5,caption=30,padding=10}){
 const byWidth=Math.max(0,((width-gap*(columns-1))/columns-padding)*4/3);
 return Math.max(0,Math.floor(Math.min(byWidth,height-caption-padding,320)));
}
export function fitHome(grid,{Observer=globalThis.ResizeObserver}={}){
 if(!grid)return ()=>{};
 [...grid.children].forEach((card,index)=>card.hidden=index>=5);
 const overview=grid.closest('.home-overview'),main=grid.closest('.home-page');
 let last=-1;const update=()=>{const style=main?getComputedStyle(main):null,padding=style?(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0):0;
  // Measure only the fixed content. The library row uses its natural height,
  // rather than expanding to push the footprint to the bottom of the viewport.
  const available=overview&&main?main.clientHeight-padding-(overview.offsetHeight-grid.offsetHeight):grid.clientHeight;
  const next=coverHeight({width:grid.clientWidth,height:available,gap:parseFloat(getComputedStyle(grid).columnGap)||14});if(next!==last){grid.style.setProperty('--fitted-cover-height',next+'px');last=next;}};
 const observer=new Observer(update);if(main)observer.observe(main);else observer.observe(grid);
 if(overview)for(const node of overview.querySelectorAll('.greeting,.hero,.home-footprint,.home-library-section>.section-header'))observer.observe(node);
 update();return ()=>observer.disconnect();
}
