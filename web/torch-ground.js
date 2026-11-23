/* SPDX-License-Identifier: GPL-3.0-or-later */
export const MIRROR_LEVEL=-4;
export const TERRACE={halfWidth:15,back:-8,front:42.6,run:23};

export function torchGroundHeight(x,z){
 const {halfWidth,back,front,run}=TERRACE;
 const dx=Math.max(0,Math.abs(x)-halfWidth);
 const dz=Math.max(0,back-z,z-front);
 const shore=run-2.3+1.35*Math.sin(x*.17+z*.084)+.85*Math.cos(z*.21-x*.14);
 const s=Math.min(1,Math.hypot(dx,dz)/shore);
 return MIRROR_LEVEL*s*s*(3-2*s);
}
