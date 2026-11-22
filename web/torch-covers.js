/* SPDX-License-Identifier: GPL-3.0-or-later */
import * as THREE from './vendor/three/three.module.min.js';
import {resolveSeedCover} from './seed-catalog.js';

const MAX_COVERS=12,MAX_CANDIDATES=30,MAX_EDGE=256,PAGE=300;

export async function publicTorchWorks(api,live){
 const works=new Set();
 const collect=result=>{
  for(const item of result?.items||[])if(item.game&&/^v[1-9]\d{0,6}$/.test(item.gameVndb))works.add(item.gameVndb);
 };
 const get=cursor=>api('torch_page',{month:'',cursor,limit:PAGE});
 const first=await get('');
 if(!live()||!first?.ok)return [];
 collect(first);
 const latest=Math.max(0,first.total-PAGE);
 const sample=PAGE+Math.floor(Math.random()*Math.max(0,latest-PAGE));
 for(const offset of new Set([latest,sample])){
  if(!live()||!first.next||offset<=0||offset>latest)break;
  const page=await get(String(offset));
  if(live()&&page?.ok)collect(page);
 }
 return [...works];
}

export function createTorchCovers(parent,{east,west,reduced}){
 const group=new THREE.Group();group.name='Public torch covers';parent.add(group);
 let generation=0;
 function clear(){
  generation++;
  for(const mesh of [...group.children]){
   group.remove(mesh);mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();
  }
 }
 async function load(api){
  clear();
  const visit=generation,live=()=>visit===generation;
  const works=await publicTorchWorks(api,live);
  for(let i=works.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [works[i],works[j]]=[works[j],works[i]];
  }
  const fetchCover=(action,params)=>api(action,{...params,resolveMissing:true});
  for(const id of works.slice(0,MAX_CANDIDATES)){
   if(!live()||group.children.length>=MAX_COVERS)break;
   const url=await resolveSeedCover(fetchCover,id);
   if(!url||!live())continue;
   const image=new Image();image.src=url;
   try{await image.decode();}catch{continue;}
   if(!live())break;
   if(!image.naturalWidth||!image.naturalHeight)continue;
   const ratio=Math.min(1,MAX_EDGE/Math.max(image.naturalWidth,image.naturalHeight));
   const thumb=document.createElement('canvas');
   thumb.width=Math.max(1,Math.round(image.naturalWidth*ratio));
   thumb.height=Math.max(1,Math.round(image.naturalHeight*ratio));
   thumb.getContext('2d').drawImage(image,0,0,thumb.width,thumb.height);
   const map=new THREE.CanvasTexture(thumb);map.colorSpace=THREE.SRGBColorSpace;
   const size=1.18+Math.random()*.62,aspect=thumb.width/thumb.height;
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size*Math.min(1,aspect),size*Math.min(1,1/aspect)),
    new THREE.MeshBasicMaterial({map,side:THREE.DoubleSide,color:0xe6e5ed,transparent:true,opacity:0.65,depthWrite:false}));
   const slot=group.children.length,side=slot%2===0?-1:1;
   mesh.name=id;
   const offset=10+Math.floor(slot/3)*12+Math.random()*8;
   const behindStele=slot%3===2;
   mesh.position.set(side*(6+(slot%3)*6+Math.random()*4),1.7+Math.random()*2.3,behindStele?east-offset:west+offset);
   mesh.rotation.y=Math.PI+(Math.random()-.5)*1.1;
   mesh.userData={height:mesh.position.y,yaw:mesh.rotation.y,phase:Math.random()*Math.PI*2};
   group.add(mesh);
  }
 }
 function update(time){
  if(reduced)return;
  for(const mesh of group.children){
   const {height,yaw,phase}=mesh.userData;
   mesh.position.y=height+Math.sin(time*.48+phase)*.22;
   mesh.rotation.y=yaw+Math.sin(time*.3+phase)*.10;
  }
 }
 return {group,load,clear,update};
}
