/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Wheel deltas only change the goal; frame-time damping finishes the motion after scrolling stops */
export function createTorchZoom({reduced=false}={}){
 let value=1,target=1;
 return {wheel(delta,mode=0){if(!Number.isFinite(delta))return;const pixels=delta*(mode===1?16:mode===2?480:1);target=Math.max(.24,Math.min(1.5,target*Math.exp(Math.max(-240,Math.min(240,pixels))*.0015)));if(reduced)value=target;},
  step(dt){value+=(target-value)*(reduced?1:1-Math.exp(-Math.max(0,Math.min(.1,dt))*10));return value;},reset(){value=target=1;},get value(){return value;},get target(){return target;}};
}

export function keepTorchCameraAboveFloor(position){
 position.y=Math.max(1.2,position.y);
}
