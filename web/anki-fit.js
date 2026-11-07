// Shared with the isolated card document and the layout regression tests.
(function(root){
 function fitScale(width,height,contentWidth,contentHeight,fit=true){
  if(!fit||![width,height,contentWidth,contentHeight].every(n=>Number.isFinite(n)&&n>0))return 1;
  return Math.max(.6,Math.min(1,width/contentWidth,height/contentHeight));
 }
 const api={fitScale};if(typeof module==='object'&&module.exports)module.exports=api;else root.TomeAnkiFit=api;
})(globalThis);
