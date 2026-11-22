/* SPDX-License-Identifier: GPL-3.0-or-later */
export function createTorchWalk({reduced=false}={}){
 let remaining=0;
 return {
  wheel(delta,mode=0){
   if(!Number.isFinite(delta))return;
   const pixels=delta*(mode===1?16:mode===2?480:1);
   remaining-=Math.max(-480,Math.min(480,pixels))*.036;
  },
  step(dt){
   const distance=reduced||Math.abs(remaining)<.001?remaining:remaining*(1-Math.exp(-Math.max(0,dt)*10));
   remaining-=distance;
   return distance;
  },
  reset(){remaining=0;}
 };
}

export function keepTorchCameraAboveFloor(position,ground=0){
 position.y=Math.max(ground+1.2,position.y);
}
