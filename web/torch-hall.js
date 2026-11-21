// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑 hall: an old European church in stone, all original geometry.
   A square bay under a coffered sail vault, four great arches; the east arch (behind the stele, -z) opens into a coffered half dome
   with a ring of small rose windows, the side arches hold big rose windows, the west arch leads down a coffered nave to a west rose.
   Fluted black-violet marble columns with Attic bases and Corinthian capitals carry arcades; piers with engaged columns; full
   entablatures (architrave, carved frieze, dentil cornice). Iron torches on the piers and columns, two braziers by the stair.

   Light follows the PC's clock: the sun (or the moon) moves east → south → west and only gets in through the windows (shadows on
   the full tier), the sky light, glass, fog and exposure go through dawn / day / noon / afternoon / dusk / night / small hours,
   and the torches are lit from dusk to morning. Everything is interpolated, so the room changes as slowly as the day. */
import * as THREE from './vendor/three/three.module.min.js';
import {mergeGeometries} from './vendor/three/addons/utils/BufferGeometryUtils.js';
import {ashlar,relief,coffers,rose,lancet,marble,floorMarble,inlay,glowSprite,basalt} from './torch-textures.js';
import {maps} from './torch-bake.js';

export const HALL={HX:10,BACK:-6.5,FRONT:14.5,SPRING:9.3,NZ1:40,AX:13.2};

/* uv from local position, projected along the dominant normal axis (so stone blocks keep their size on any box or wall) */
function worldUV(g,scale,ox=0,oy=0){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;if(!uv||!n)return g;
 for(let i=0;i<p.count;i++){const ax=Math.abs(n.getX(i)),ay=Math.abs(n.getY(i)),az=Math.abs(n.getZ(i));let u,v;
  if(ax>=ay&&ax>=az){u=p.getZ(i);v=p.getY(i);}else if(ay>=az){u=p.getX(i);v=p.getZ(i);}else{u=p.getX(i);v=p.getY(i);}uv.setXY(i,(u+ox)/scale,(v+oy)/scale);}
 uv.needsUpdate=true;return g;}
const scaleUV=(g,su,sv)=>{const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*su,uv.getY(i)*sv);uv.needsUpdate=true;return g;};

/* ---------- column parts (built once, instanced) ---------- */
function flutedShaft(r,h,flutes=20){const g=new THREE.CylinderGeometry(r,r,h,flutes*5,10,true),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),y=p.getY(i),a=Math.atan2(x,z),t=(y+h/2)/h;
  const fl=Math.pow(.5+.5*Math.cos(a*flutes),.55),k=(1-.05*fl)*(1+.022*Math.sin(Math.PI*t)-.06*t);p.setX(i,x*k);p.setZ(i,z*k);}
 g.computeVertexNormals();return g;}
function lathe(points,scale,seg=48){return new THREE.LatheGeometry(points.map(([x,y])=>new THREE.Vector2(x*scale,y*scale)),seg);}
const arcPts=(cx,cy,r,a0,a1,n=10)=>{const o=[];for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n;o.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}return o;};
/* Attic base: torus, scotia, torus (radius 1 = the shaft radius) */
function atticBase(r){const pts=[[0,0],[1.36,0],...arcPts(1.28,.1,.1,-Math.PI/2,Math.PI/2,8),[1.18,.21],...arcPts(1.18,.29,.07,-Math.PI/2,-Math.PI*1.5,8).map(([x,y])=>[x+.0,y]),
 [1.13,.37],...arcPts(1.1,.43,.06,-Math.PI/2,Math.PI/2,8),[1.03,.5],[0,.5]];return lathe(pts,r);}
/* Corinthian capital: bell, astragal, two rows of acanthus leaves, corner volutes, abacus */
function acanthus(w,h,out){const g=new THREE.PlaneGeometry(1,1,6,10),p=g.attributes.position;
 for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i)+.5;const width=Math.pow(Math.sin(Math.PI*Math.min(1,v*.92+.04)),.7)*(1-.25*v)*(1+.18*Math.sin(v*Math.PI*6)*v);
  let x=u*width*w,y=v*h,z=out*v*v+Math.abs(u)*-.04*w;if(v>.72){const c=(v-.72)/.28;z+=c*c*out*1.4;y-=c*c*h*.18;}
  z+=(1-Math.abs(u*2))*.05*w*Math.sin(v*Math.PI);p.setXYZ(i,x,y,z);}g.computeVertexNormals();return g;}
class Spiral extends THREE.Curve{constructor(r,turns){super();this.r=r;this.turns=turns;}getPoint(t,o=new THREE.Vector3()){const a=t*Math.PI*2*this.turns,rr=this.r*(1-t*.8);return o.set(0,Math.sin(a)*rr,Math.cos(a)*rr+this.r);}}
function corinthian(r){const parts=[];const bellH=r*2.1;
 parts.push(lathe([[0,0],[1.02,0],[1.02,.08],[1.0,.1],[1.05,.5],[1.18,1.2],[1.32,2.0],[1.35,2.1],[0,2.1]],r,40));
 parts.push(new THREE.TorusGeometry(r*1.04,r*.07,8,40).rotateX(Math.PI/2));
 for(let row=0;row<2;row++)for(let i=0;i<8;i++){const a=(i+row*.5)/8*Math.PI*2,lh=bellH*(row?.78:.5),lw=r*(row?.95:.85),L=acanthus(lw,lh,r*.42);
  L.translate(0,bellH*(row?.12:.04),r*(1.02+row*.06));L.rotateY(a);parts.push(L);}
 for(let i=0;i<4;i++){const v=new THREE.TubeGeometry(new Spiral(r*.26,1.6),40,r*.07,6,false);v.rotateY(Math.PI/4+i*Math.PI/2);v.translate(Math.sin(Math.PI/4+i*Math.PI/2)*r*1.25,bellH*.86,Math.cos(Math.PI/4+i*Math.PI/2)*r*1.25);parts.push(v);}
 const ab=new THREE.BoxGeometry(r*3.0,r*.32,r*3.0);ab.translate(0,bellH+r*.16,0);parts.push(ab);
 const ab2=new THREE.BoxGeometry(r*2.7,r*.12,r*2.7);ab2.translate(0,bellH-r*.02,0);parts.push(ab2);
 const flat=parts.map(p=>p.index?p.toNonIndexed():p),m=mergeGeometries(flat,false);parts.forEach(p=>p.dispose());flat.forEach(p=>p.dispose());return m;}

/* moulding profiles (x = out from the wall, y = up), extruded along a straight run */
function profileShape(pts){const s=new THREE.Shape();s.moveTo(pts[0][0],pts[0][1]);for(const q of pts.slice(1))if(q.length===4)s.quadraticCurveTo(q[0],q[1],q[2],q[3]);else s.lineTo(q[0],q[1]);s.closePath();return s;}
const CORNICE=[[0,0],[.1,0],[.1,.05],[.14,.05,.2,.16],[.24,.16],[.24,.2],[.46,.2],[.46,.36],[.5,.36],[.5,.4,.66,.54],[.68,.54],[.68,.6],[0,.6]];
const ARCHITRAVE=[[0,0],[.08,0],[.08,.22],[.12,.22],[.12,.46],[.16,.46],[.16,.62],[.2,.64],[.22,.7],[0,.7]];
const BASEMOLD=[[0,0],[.3,0],[.3,.3],[.26,.3,.24,.44],[.18,.46],[.16,.52],[0,.52]];
function run(profile,len){const g=new THREE.ExtrudeGeometry(profileShape(profile),{depth:len,bevelEnabled:false,curveSegments:8});return g;}

/* textures: one GPU upload per image (repeats get clones of the same source); a drawn canvas is emptied once it is on the GPU,
   unless it is marked keep (the stele face reuses the basalt as a pattern) */
function textureMaker(keep,maxAniso=8){const seen=new Map();
 return (c,srgb=true,rep=1,keepImage=false)=>{let base=seen.get(c);let x;
  if(base){x=keep(base.clone());}else{x=keep(new THREE.Texture(c));x.needsUpdate=true;seen.set(c,x);
   if(!keepImage&&!window.__TORCH_BAKE&&c instanceof HTMLCanvasElement)x.onUpdate=()=>{c.width=c.height=1;};}
  x.colorSpace=srgb?THREE.SRGBColorSpace:THREE.NoColorSpace;x.wrapS=x.wrapT=THREE.RepeatWrapping;x.anisotropy=maxAniso;x.repeat.set(rep,rep);return x;};}

/* ---------- the stele: a long black slab on two square posts, a wide low stair in front ---------- */
export function buildStele({scene,keep,tier}){const low=tier==='low',Q=low?.5:1,T=textureMaker(keep);
 const bas=maps('basalt',()=>basalt(512,37)),stoneW=maps('steleMarble',()=>marble(512*Q,62,{base:[220,210,194],vein:[180,168,152],veinK:4,warp:2}));
 const basaltBody=keep(new THREE.MeshPhysicalMaterial({map:T(bas.map,true,2,true),normalMap:T(bas.normal,false,2),normalScale:new THREE.Vector2(.12,.12),roughnessMap:T(bas.rough,false,2,true),
  roughness:1,metalness:0,clearcoat:low?0:1,clearcoatRoughness:.05,envMapIntensity:1}));
 const stepMat=keep(new THREE.MeshPhysicalMaterial({map:T(stoneW.map,true,1.5),roughnessMap:T(stoneW.rough,false,1.5),roughness:1,metalness:0,clearcoat:low?0:.5,clearcoatRoughness:.12,envMapIntensity:.5}));
 const inlayRed=keep(new THREE.MeshStandardMaterial({color:0x6e1222,roughness:.35,metalness:.05}));
 const gilt=keep(new THREE.MeshStandardMaterial({color:0xb48a4a,roughness:.3,metalness:.9,envMapIntensity:1.2}));
 const stele=new THREE.Group();scene.add(stele);
 const STEP_N=7,STEP_H=.085,SW=12.6,SH=3.2,SD=.44,POST_Y=STEP_N*STEP_H,BASE_Y=1.75;
 const mesh=(g,m,x,y,z,cast=true)=>{const o=new THREE.Mesh(keep(g),m);o.position.set(x,y,z);o.castShadow=cast;o.receiveShadow=true;stele.add(o);return o;};
 for(let i=0;i<STEP_N;i++){const w=15.6-i*.12,front=3.6-i*.36,back=-.9,d=front-back;mesh(new THREE.BoxGeometry(w,STEP_H,d),stepMat,0,STEP_H*i+STEP_H/2,back+d/2,i===STEP_N-1);}
 mesh(new THREE.BoxGeometry(15.62,.02,.04),gilt,0,STEP_H-.01,3.62,false);
 for(const sx of [-1,1]){mesh(new THREE.BoxGeometry(1.35,BASE_Y-POST_Y,.78),stepMat,sx*3.7,POST_Y+(BASE_Y-POST_Y)/2,0);mesh(new THREE.BoxGeometry(1.39,.06,.82),inlayRed,sx*3.7,BASE_Y-.14,0,false);}
 const s=new THREE.Shape(),w=SW,h=SH,b=.04;s.moveTo(-w/2+b,-h/2);s.lineTo(w/2-b,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+b);s.lineTo(w/2,h/2-b);s.quadraticCurveTo(w/2,h/2,w/2-b,h/2);
 s.lineTo(-w/2+b,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-b);s.lineTo(-w/2,-h/2+b);s.quadraticCurveTo(-w/2,-h/2,-w/2+b,-h/2);
 const g=new THREE.ExtrudeGeometry(s,{depth:SD-.06,bevelEnabled:true,bevelThickness:.03,bevelSize:.03,bevelSegments:3,curveSegments:6});g.translate(0,0,-(SD-.06)/2);
 const slab=mesh(g,basaltBody,0,BASE_Y+SH/2,0);
 return {stele,slab,SW,SH,SD,basaltBody,bas};}

/* ---------- the hall ---------- */
export function buildHall({scene,keep,tex,tier,maxAniso=8}){
 const {HX,BACK,FRONT,SPRING,NZ1,AX}=HALL,R=HX,low=tier==='low',Q=low?.5:1,BAYZ=(BACK+FRONT)/2;
 const hall=new THREE.Group();scene.add(hall);
 const skipInMirror=[],noAO=[],castAll=[];
 const T=textureMaker(keep,maxAniso);

 /* ---- textures ---- */
 /* baked images when web/assets/torch matches this source (torch-bake.js), else drawn here */
 const ash=maps('ashlar',()=>ashlar(1024*Q,31)),ashDark=maps('ashlarDark',()=>ashlar(512*Q,47,{base:[120,110,104]})),rel=maps('relief',()=>relief(2048*Q,256*Q,5)),
  vault=maps('vault',()=>coffers(2048*Q,1024*Q,{cols:32,rows:7,v0:.06,v1:.86})),half=maps('halfDome',()=>coffers(1024*Q,512*Q,{cols:16,rows:4,v0:.04,v1:.8})),
  nave=maps('naveVault',()=>coffers(1024*Q,1024*Q,{cols:6,rows:6,v0:0,v1:1})),
  col=maps('violetMarble',()=>marble(512*Q,23,{base:[34,22,46],vein:[112,82,132],veinK:3,warp:2.4})),pale=maps('paleMarble',()=>marble(512*Q,61,{base:[214,204,188],vein:[176,164,150],veinK:4,warp:2})),
  fl=maps('floor',()=>floorMarble(2048*Q,11)),roseTex=T(maps('rose',()=>({map:rose(1024*Q,3)})).map),roseSmall=T(maps('roseSmall',()=>({map:rose(512*Q,9,{petals:8})})).map),
  lanTex=T(maps('lancet',()=>({map:lancet(256*Q,640*Q,13)})).map);
 const stone=keep(new THREE.MeshStandardMaterial({map:T(ash.map),normalMap:T(ash.normal,false),roughnessMap:T(ash.rough,false),roughness:1,metalness:0,envMapIntensity:.35}));
 const stoneDark=keep(new THREE.MeshStandardMaterial({map:T(ashDark.map),normalMap:T(ashDark.normal,false),roughnessMap:T(ashDark.rough,false),roughness:1,metalness:0,envMapIntensity:.25}));
 const carved=keep(new THREE.MeshStandardMaterial({map:T(rel.map),normalMap:T(rel.normal,false),roughness:.82,metalness:0,envMapIntensity:.3}));
 const smooth=keep(new THREE.MeshStandardMaterial({map:T(pale.map),roughnessMap:T(pale.rough,false),color:0xf2ebe0,roughness:.9,metalness:0,envMapIntensity:.45}));
 const violet=keep(new THREE.MeshPhysicalMaterial({map:T(col.map),roughnessMap:T(col.rough,false),roughness:.9,metalness:0,clearcoat:low?0:.7,clearcoatRoughness:.12,envMapIntensity:.9}));
 const capMat=keep(new THREE.MeshStandardMaterial({map:T(pale.map),color:0xefe6d6,roughness:.75,metalness:0,side:THREE.DoubleSide,envMapIntensity:.4}));
 const gilt=keep(new THREE.MeshStandardMaterial({color:0xb48a4a,roughness:.32,metalness:.9,envMapIntensity:1.2}));
 const iron=keep(new THREE.MeshStandardMaterial({color:0x1c1a1e,roughness:.55,metalness:.85,envMapIntensity:.6}));
 const vaultMat=keep(new THREE.MeshStandardMaterial({map:T(vault.map),normalMap:T(vault.normal,false),roughness:.85,metalness:0,side:THREE.BackSide,envMapIntensity:.3,
  clippingPlanes:[new THREE.Plane(new THREE.Vector3(1,0,0),HX+.6),new THREE.Plane(new THREE.Vector3(-1,0,0),HX+.6),new THREE.Plane(new THREE.Vector3(0,0,1),-BACK+.7),new THREE.Plane(new THREE.Vector3(0,0,-1),FRONT+.7)]}));
 vaultMat.clipShadows=true;
 const halfMat=keep(new THREE.MeshStandardMaterial({map:T(half.map),normalMap:T(half.normal,false),roughness:.85,metalness:0,side:THREE.BackSide,envMapIntensity:.3}));
 const naveTex={map:T(nave.map),normal:T(nave.normal,false)};naveTex.map.repeat.set(5,4);naveTex.normal.repeat.set(5,4);
 const naveMat=keep(new THREE.MeshStandardMaterial({map:naveTex.map,normalMap:naveTex.normal,roughness:.85,side:THREE.BackSide,envMapIntensity:.3}));
 /* glass: unlit, tinted by the time of day (glassTint below) */
 const glass=[roseTex,roseSmall,lanTex].map(t=>keep(new THREE.MeshBasicMaterial({map:t,side:THREE.DoubleSide,fog:false,toneMapped:true})));
 const [roseMat,roseSmallMat,lanMat]=glass;

 const add=(geo,mat,pos,rot,{cast=true,recv=true}={})=>{const m=new THREE.Mesh(keep(geo),mat);if(pos)m.position.set(...pos);if(rot)m.rotation.set(...rot);m.castShadow=cast;m.receiveShadow=recv;hall.add(m);return m;};
 const inst=(geo,mat,list,{cast=true}={})=>{const m=new THREE.InstancedMesh(keep(geo),mat,list.length),o=new THREE.Object3D();
  list.forEach((p,i)=>{o.position.set(p[0],p[1],p[2]);o.rotation.set(p[4]||0,p[3]||0,p[5]||0);const s=p[6]||1;o.scale.set(s,s,s);o.updateMatrix();m.setMatrixAt(i,o.matrix);});
  m.instanceMatrix.needsUpdate=true;m.castShadow=cast;m.receiveShadow=true;hall.add(m);return m;};
 const box=(w,h,d)=>worldUV(new THREE.BoxGeometry(w,h,d),4);
 /* a run of moulding along a wall: side 'back' (faces +z at z), 'left' (faces +x at x), 'right' (faces -x at x) */
 const molding=(profile,len,side,at,y,mat=smooth,start=0)=>{const g=worldUV(run(profile,len),4);
  if(side==='back')return add(g,mat,[start+len,y,at],[0,-Math.PI/2,0]);
  if(side==='left')return add(g,mat,[at,y,start],[0,0,0]);return add(g,mat,[at,y,start+len],[0,Math.PI,0]);};
 const friezePlane=(len,h,mat=carved)=>scaleUV(new THREE.PlaneGeometry(len,h),len/(h*8),1);

 /* ---- column kit ---- */
 const COL_R=.27,COL_H=5.0;
 const shaftG=flutedShaft(COL_R,COL_H),baseG=atticBase(COL_R),capG=corinthian(COL_R),plinthG=box(COL_R*2.9,.3,COL_R*2.9);
 const colZ=[];for(let z=BACK+2.6;z<NZ1-2;z+=1.7)if(Math.abs(z-(FRONT-.4))>1.6)colZ.push(z);
 const colP=[];for(const z of colZ)for(const sx of [-1,1])colP.push([sx*HX,0,z]);
 inst(plinthG,smooth,colP.map(p=>[p[0],.15,p[2]]));inst(baseG,smooth,colP.map(p=>[p[0],.3,p[2]]));
 inst(shaftG,violet,colP.map(p=>[p[0],.3+COL_R*.5+COL_H/2,p[2]]));inst(capG,capMat,colP.map(p=>[p[0],.3+COL_R*.5+COL_H,p[2]]));
 const CAP_TOP=.3+COL_R*.5+COL_H+COL_R*2.1+COL_R*.32;

 /* ---- the four piers, each with an engaged column on its two faces toward the bay ---- */
 const piers=[];for(const sx of [-1,1])for(const z of [BACK+.9,FRONT-.4])piers.push([sx*(HX+.2),z]);
 for(const [px,pz] of piers){add(box(2.4,SPRING-.9,2.4),stone,[px,(SPRING-.9)/2+.5,pz]);
  add(box(2.9,.5,2.9),smooth,[px,.25,pz]);add(box(2.7,.18,2.7),smooth,[px,.59,pz]);add(box(2.9,.5,2.9),smooth,[px,SPRING-.15,pz]);add(box(3.1,.3,3.1),smooth,[px,SPRING+.25,pz]);}
 const engaged=[];for(const [px,pz] of piers){const sx=Math.sign(px),inZ=pz<BAYZ?1:-1;engaged.push([px-sx*1.2,pz,0],[px,pz+inZ*1.2,0]);}
 const EC=.4,ECH=SPRING-1.9-EC*2.4;
 inst(flutedShaft(EC,ECH,24),violet,engaged.map(e=>[e[0],.68+EC*.5+ECH/2,e[1]]));inst(atticBase(EC),smooth,engaged.map(e=>[e[0],.68,e[1]]));
 inst(corinthian(EC),capMat,engaged.map(e=>[e[0],.68+EC*.5+ECH,e[1]]));

 /* ---- back (east) wall: ashlar, a blind arcade of niches, two stained lancets, full entablature ---- */
 { const w=2*HX,s=new THREE.Shape();s.moveTo(-HX,0);s.lineTo(HX,0);s.lineTo(HX,7.4);s.lineTo(-HX,7.4);s.closePath();
   const holes=[{x:-8.1,w:1.7,y:1.4,h:4.6},{x:6.4,w:1.7,y:1.4,h:4.6}];
   for(const o of holes){const p=new THREE.Path();p.moveTo(o.x,o.y);p.lineTo(o.x+o.w,o.y);p.lineTo(o.x+o.w,o.y+o.h-o.w/2);p.absarc(o.x+o.w/2,o.y+o.h-o.w/2,o.w/2,0,Math.PI,false);p.closePath();s.holes.push(p);}
   add(worldUV(new THREE.ExtrudeGeometry(s,{depth:.9,bevelEnabled:false,curveSegments:16}),4),stone,[0,0,BACK-.9]);
   for(const o of holes){const cx=o.x+o.w/2;add(scaleUV(new THREE.PlaneGeometry(o.w,o.h),1,1),lanMat,[cx,o.y+o.h/2,BACK-.5],null,{cast:false,recv:false});
    add(new THREE.TorusGeometry(o.w/2+.08,.09,8,24,Math.PI),smooth,[cx,o.y+o.h-o.w/2,BACK+.02]);for(const dx of [-1,1])add(box(.18,o.h-o.w/2,.18),smooth,[cx+dx*(o.w/2+.08),o.y+(o.h-o.w/2)/2,BACK+.02]);
    add(box(o.w+.5,.16,.4),smooth,[cx,o.y-.08,BACK+.1]);}
   /* blind niches between the windows and the stele ends, and pilasters */
   for(const x of [-4.6,-1.55,1.55,4.6]){add(box(.62,6.0,.22),stone,[x,3.2,BACK+.11]);add(box(.8,.24,.36),smooth,[x,6.3,BACK+.16]);add(box(.8,.3,.36),smooth,[x,.15,BACK+.16]);}
   molding(BASEMOLD,w,'back',BACK,0,smooth,-HX);
   molding(ARCHITRAVE,w,'back',BACK,6.5,smooth,-HX);add(friezePlane(w,1.0),carved,[0,7.7,BACK+.02],null,{cast:false});
   molding(CORNICE,w+1,'back',BACK,8.2,smooth,-HX-.5);
   const dent=[];for(let x=-HX;x<=HX;x+=.3)dent.push([x,8.48,BACK+.31]);inst(new THREE.BoxGeometry(.15,.16,.14),smooth,dent);}
 /* attic course closing the gap between the cornice and the half dome's drum (set once the drum height is known, below) */

 /* ---- side arcades over the colonnades: ashlar spandrels with moulded archivolts, then the entablature ---- */
 const A0=CAP_TOP,ENT=A0+1.25;
 for(const sx of [-1,1])for(const [z0,z1] of [[BACK+1.8,FRONT-1.6],[FRONT+.8,NZ1-1]]){const cz=colZ.filter(z=>z>z0-.01&&z<z1+.01);if(cz.length<2)continue;
  const s=new THREE.Shape(),r=(1.7-.62)/2;s.moveTo(cz[0]-.85,ENT);s.lineTo(cz[0]-.85,A0);
  for(let i=0;i<cz.length;i++){s.lineTo(cz[i]+.31,A0);if(i<cz.length-1)s.absarc(cz[i]+.85,A0,r,Math.PI,0,true);}
  s.lineTo(cz[cz.length-1]+.85,A0);s.lineTo(cz[cz.length-1]+.85,ENT);s.closePath();
  add(worldUV(new THREE.ExtrudeGeometry(s,{depth:.66,bevelEnabled:false,curveSegments:18}),4),stone,[sx*HX+.33,0,0],[0,-Math.PI/2,0]);
  const arcs=[];for(let i=0;i<cz.length-1;i++)arcs.push([sx*(HX-.34),A0,cz[i]+.85,Math.PI/2]);inst(new THREE.TorusGeometry(r+.06,.07,8,24,Math.PI),smooth,arcs);
  const side=sx<0?'left':'right',at=sx*(HX-.33),L=z1-z0+1.7;
  molding(ARCHITRAVE,L,side,at,ENT,smooth,z0-.85);add(friezePlane(L,1.0),carved,[sx*(HX-.36),ENT+1.2,(z0+z1)/2],[0,sx<0?Math.PI/2:-Math.PI/2,0],{cast:false});
  molding(CORNICE,L,side,at,ENT+1.7,smooth,z0-.85);
  const dent=[];for(let z=z0-.8;z<=z1+.8;z+=.3)dent.push([sx*(HX-.33-.31),ENT+1.98,z]);inst(new THREE.BoxGeometry(.14,.16,.15),smooth,dent);}
 const ENT_TOP=ENT+2.3;
 /* aisle walls behind the colonnades: darker stone, niches, low ceilings */
 const nicheMat=keep(new THREE.MeshStandardMaterial({color:0x120e16,roughness:.95}));
 for(const sx of [-1,1]){const L=NZ1-BACK,s=new THREE.Shape();s.moveTo(0,0);s.lineTo(L,0);s.lineTo(L,ENT_TOP);s.lineTo(0,ENT_TOP);s.closePath();
  const nz=[];for(let z=1.2;z<L-2;z+=3.4){nz.push(z);const p=new THREE.Path();p.moveTo(z,.9);p.lineTo(z+1.5,.9);p.lineTo(z+1.5,4.35);p.absarc(z+.75,4.35,.75,0,Math.PI,false);p.closePath();s.holes.push(p);}
  add(worldUV(new THREE.ExtrudeGeometry(s,{depth:.5,bevelEnabled:false,curveSegments:12}),4),stoneDark,[sx*AX+(sx>0?.5:0),0,BACK],[0,-Math.PI/2,0]);
  for(const z of nz)add(new THREE.PlaneGeometry(1.5,4.2),nicheMat,[sx*(AX+.3),3.0,BACK+z+.75],[0,-sx*Math.PI/2,0],{cast:false});
  add(box(AX-HX+.8,.4,NZ1-BACK),stoneDark,[sx*(HX+AX)/2,ENT-.1,(BACK+NZ1)/2]);}

 /* ---- four great arches with stepped archivolts; lunettes with rose windows on the sides ---- */
 const archBand=(r0,r1,d)=>{const s=new THREE.Shape();s.moveTo(r1,0);s.absarc(0,0,r1,0,Math.PI,false);s.lineTo(-r0,0);s.absarc(0,0,r0,Math.PI,0,true);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:false,curveSegments:64});g.translate(0,0,-d/2);return worldUV(g,4);};
 const SP=ENT_TOP;
 const bigArch=(pos,rot)=>{add(archBand(R-.05,R+.55,1.5),stone,pos,rot);add(archBand(R+.55,R+.75,1.2),smooth,pos,rot);add(archBand(R+.75,R+.9,.9),smooth,pos,rot);
  add(new THREE.TorusGeometry(R-.05,.1,8,64,Math.PI),smooth,pos,rot);};
 bigArch([0,SP,BACK]);bigArch([0,SP,FRONT]);
 const windows={};
 for(const sx of [-1,1]){bigArch([sx*HX,SP,BAYZ],[0,Math.PI/2,0]);
  const s=new THREE.Shape();s.moveTo(-R,0);s.absarc(0,0,R,Math.PI,0,true);s.closePath();const ry=4.6,rr=2.7;const h=new THREE.Path();h.absarc(0,ry,rr,0,Math.PI*2,true);s.holes.push(h);
  add(worldUV(new THREE.ExtrudeGeometry(s,{depth:.5,bevelEnabled:false,curveSegments:48}),4),stone,[sx<0?-(HX+1.1):HX+.6,SP,BAYZ],[0,Math.PI/2,0]);
  add(new THREE.CircleGeometry(rr,48),roseMat,[sx*(HX+.85),SP+ry,BAYZ],[0,Math.PI/2,0],{cast:false,recv:false});
  add(new THREE.TorusGeometry(rr+.08,.16,10,64),smooth,[sx*(HX+.5),SP+ry,BAYZ],[0,Math.PI/2,0]);add(new THREE.TorusGeometry(rr*.22,.08,8,32),smooth,[sx*(HX+.55),SP+ry,BAYZ],[0,Math.PI/2,0]);
  const spokes=[];for(let i=0;i<12;i++)spokes.push([sx*(HX+.55),SP+ry,BAYZ,Math.PI/2,i/12*Math.PI*2,0]);
  inst(new THREE.BoxGeometry(.07,rr*.78,.07).translate(0,rr*.61,0),smooth,spokes.map(p=>[p[0],p[1],p[2],0,0,0]).map((p,i)=>{const a=i/12*Math.PI*2;return [p[0],p[1],p[2],Math.PI/2,a,0];}),{cast:false});
  windows[sx<0?'north':'south']={pos:new THREE.Vector3(sx*(HX+.85),SP+ry,BAYZ),normal:new THREE.Vector3(sx,0,0),r:rr};}
 /* half dome (east) over a short drum, coffered, with a ring of small rose windows */
 const HDY=SP+1.4;
 add(box(2*HX,SP+.2-8.6,.9),stone,[0,8.6+(SP+.2-8.6)/2,BACK-.45]);
 add(new THREE.CylinderGeometry(R,R,1.4,64,1,true,Math.PI/2,Math.PI),stone,[0,SP+.7,BACK],null);
 add(new THREE.SphereGeometry(R,64,24,Math.PI,Math.PI,0,Math.PI/2),halfMat,[0,HDY,BACK]);
 { const N=7,el=.4,rr=(R-.1)*Math.cos(el),yy=HDY+(R-.1)*Math.sin(el);const east=[];
   for(let i=0;i<N;i++){const a=Math.PI/2+(i+.5)/N*Math.PI,x=Math.sin(a)*rr,z=BACK+Math.cos(a)*rr;
    const c=add(new THREE.CircleGeometry(.82,32),roseSmallMat,[x,yy,z],null,{cast:false,recv:false});c.lookAt(0,HDY,BACK);
    const f=add(new THREE.TorusGeometry(.88,.09,8,32),smooth,[x,yy,z]);f.lookAt(0,HDY,BACK);east.push(new THREE.Vector3(x,yy,z));}
   windows.east={list:east,normal:new THREE.Vector3(0,0,-1)};}
 /* coffered sail vault over the bay (one sphere through the four arch crowns, clipped to the square) and a gilt ring at its crown */
 const VR=Math.hypot(HX,(FRONT-BACK)/2);
 add(new THREE.SphereGeometry(VR,96,40,0,Math.PI*2,0,Math.PI/2),vaultMat,[0,SP,BAYZ],null,{cast:true,recv:true});
 add(new THREE.TorusGeometry(1.6,.12,8,48).rotateX(Math.PI/2),gilt,[0,SP+VR-.12,BAYZ],null,{cast:false});
 /* coffered barrel vault down the nave, transverse ribs, west wall with a rose */
 { const len=NZ1-FRONT;const g=new THREE.CylinderGeometry(R+.6,R+.6,len,64,1,true,-Math.PI/2,Math.PI).rotateX(-Math.PI/2);add(g,naveMat,[0,SP,(FRONT+NZ1)/2]);
   const ribs=[];for(let z=FRONT+3.4;z<NZ1;z+=3.4)ribs.push([0,SP,z]);inst(new THREE.TorusGeometry(R+.5,.16,8,48,Math.PI),smooth,ribs);
   add(box(2*AX+1,30,.8),stone,[0,15,NZ1]);const wr=3.2,wy=SP+3.6;add(new THREE.CircleGeometry(wr,48),roseMat,[0,wy,NZ1-.45],[0,Math.PI,0],{cast:false,recv:false});
   add(new THREE.TorusGeometry(wr+.1,.18,10,64),smooth,[0,wy,NZ1-.5]);windows.west={pos:new THREE.Vector3(0,wy,NZ1-.5),normal:new THREE.Vector3(0,0,1),r:wr};}

 /* ---- floor: mirror under polished marble; an inlaid runner up the nave and a porphyry rota before the stair ---- */
 const FL_W=2*AX+1,FL_Z0=BACK-1,FL_L=NZ1-FL_Z0,FL_Z=(FL_Z0+NZ1)/2;
 const floorMat=keep(new THREE.MeshPhysicalMaterial({map:T(fl.map),roughnessMap:T(fl.rough,false),roughness:.8,metalness:0,clearcoat:low?0:.5,clearcoatRoughness:.08,envMapIntensity:.5}));
 floorMat.map.repeat.set(FL_W/8,FL_L/8);floorMat.roughnessMap.repeat.set(FL_W/8,FL_L/8);
 const floor=add(new THREE.PlaneGeometry(FL_W,FL_L),floorMat,[0,0,FL_Z],[-Math.PI/2,0,0],{cast:false});floor.renderOrder=-2;skipInMirror.push(floor);
 const RUN_Z0=4.6,RUN_L=NZ1-1-RUN_Z0,units=Math.round(RUN_L/3.4);
 const inl=T(maps('inlay',()=>({map:inlay(256*Q,512*Q,units,17)})).map);
 const inlayMat=keep(new THREE.MeshPhysicalMaterial({map:inl,roughness:.25,metalness:0,clearcoat:low?0:.6,clearcoatRoughness:.06,envMapIntensity:.5,transparent:!low,opacity:low?1:.86,
  polygonOffset:true,polygonOffsetFactor:-2}));
 const runner=add(new THREE.PlaneGeometry(3.4,RUN_L),inlayMat,[0,.003,RUN_Z0+RUN_L/2],[-Math.PI/2,0,0],{cast:false});runner.renderOrder=-1;skipInMirror.push(runner);

 /* ---- torches: iron brackets on the piers and on every third column, two tall braziers by the stair ---- */
 const torchSpots=[];
 for(const [px,pz] of piers){const sx=Math.sign(px),inZ=pz<BAYZ?1:-1;torchSpots.push({pos:new THREE.Vector3(px-sx*1.34,4.6,pz+inZ*1.34),dir:new THREE.Vector3(-sx,0,inZ).normalize(),big:false,key:true});}
 colZ.forEach((z,i)=>{if(z>FRONT+1&&i%3===1)for(const sx of [-1,1])torchSpots.push({pos:new THREE.Vector3(sx*(HX-.36),3.9,z),dir:new THREE.Vector3(-sx,0,0),big:false,key:z<FRONT+12});});
 const braziers=[[-8.2,0,4.4],[8.2,0,4.4]];
 const bracketG=mergeGeometries([new THREE.BoxGeometry(.06,.06,.5).translate(0,0,.25),new THREE.BoxGeometry(.05,.34,.05).translate(0,-.16,.08).rotateX(-.6),
  new THREE.TorusGeometry(.1,.02,6,16).rotateX(Math.PI/2).translate(0,.02,.5),new THREE.LatheGeometry([[0,0],[.04,0],[.07,.12],[.13,.24],[.14,.28],[0,.28]].map(([x,y])=>new THREE.Vector2(x,y)),16).translate(0,-.1,.5)].map(g=>g.index?g.toNonIndexed():g));
 inst(bracketG,iron,torchSpots.map(t=>[t.pos.x-t.dir.x*.5,t.pos.y-.18,t.pos.z-t.dir.z*.5,Math.atan2(t.dir.x,t.dir.z)]));
 const standG=mergeGeometries([new THREE.LatheGeometry([[0,0],[.42,0],[.42,.06],[.16,.14],[.1,.3],[.08,1.6],[.1,1.65],[.06,1.75],[.1,2.0],[.3,2.08],[.5,2.3],[.52,2.36],[0,2.36]].map(([x,y])=>new THREE.Vector2(x,y)),32)].map(g=>g.toNonIndexed()));
 inst(standG,iron,braziers.map(b=>[b[0],b[1],b[2]]));
 const flameMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,uniforms:{uTime:{value:0},uOn:{value:1}},
  vertexShader:`attribute float aSeed;varying vec2 vUv;varying float vSeed;void main(){vUv=uv;vSeed=aSeed;
   vec4 c=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);vec2 s=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));
   c.xy+=position.xy*s;gl_Position=projectionMatrix*c;}`,
  fragmentShader:`uniform float uTime;uniform float uOn;varying vec2 vUv;varying float vSeed;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
   float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
   void main(){vec2 p=vUv;float t=uTime*1.6+vSeed*20.;float y=p.y;
    float wob=(fbm(vec2(p.x*3.+vSeed*7.,y*3.2-t*1.9))-.5)*.55*y;float x=(p.x-.5)+wob;
    float width=.3*pow(1.-y,.65)*smoothstep(0.,.18,y)+.02;float body=smoothstep(width,width*.25,abs(x));
    float lick=fbm(vec2(p.x*5.,y*5.-t*3.));body*=smoothstep(1.,.25,y+lick*.35);
    float core=pow(body,2.6)*smoothstep(.65,.1,y);
    vec3 col=mix(vec3(.7,.12,.02),vec3(1.,.48,.1),body)+core*vec3(1.,.82,.45);
    float a=body*uOn;gl_FragColor=vec4(col*a*2.2,a);}`}));
 const flames=[...torchSpots.map(t=>({p:t.pos.clone().add(new THREE.Vector3(0,.34,0)),s:[.34,.62]})),...braziers.map(b=>({p:new THREE.Vector3(b[0],b[1]+2.56,b[2]),s:[.7,1.25]}))];
 const flameMesh=new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(1,1).translate(0,.5,0)),flameMat,flames.length);flameMesh.frustumCulled=false;
 { const o=new THREE.Object3D(),seed=new Float32Array(flames.length);flames.forEach((f,i)=>{o.position.copy(f.p);o.scale.set(f.s[0],f.s[1],1);o.updateMatrix();flameMesh.setMatrixAt(i,o.matrix);seed[i]=Math.random();});
   flameMesh.geometry.setAttribute('aSeed',new THREE.InstancedBufferAttribute(seed,1));}
 flameMesh.renderOrder=6;scene.add(flameMesh);noAO.push(flameMesh);
 /* soft halo around each flame */
 const haloMat=keep(new THREE.SpriteMaterial({map:T(glowSprite(128,'rgba(255,170,90,.9)','rgba(255,120,50,.25)')),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false}));
 const halos=flames.map(f=>{const s=new THREE.Sprite(haloMat);s.position.copy(f.p).add(new THREE.Vector3(0,f.s[1]*.35,0));const k=f.s[1]*2.6;s.scale.set(k,k,1);s.renderOrder=6;scene.add(s);noAO.push(s);return s;});
 /* the wall torches' light is baked (torch-bake.js); the two braziers by the stair stay real lights */
 const torchPoints=torchSpots.map(t=>t.pos.clone().add(t.dir.clone().multiplyScalar(.25)).add(new THREE.Vector3(0,.5,0)));
 const lightSpots=braziers.map(b=>({p:new THREE.Vector3(b[0],b[1]+2.9,b[2]),k:1.4}));
 const torchLights=lightSpots.map((s,i)=>{const l=new THREE.PointLight(0xff9445,0,low?11:14,2);l.position.copy(s.p);l.userData={k:s.k,seed:i*1.7};scene.add(l);return l;});

 /* ---- sky, sun and moon ---- */
 const hemi=new THREE.HemisphereLight(0xb8b0e8,0x3a3238,.4);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xffffff,1);sun.target.position.set(0,0,10);scene.add(sun);scene.add(sun.target);
 { const sc=sun.shadow.camera;sc.left=-34;sc.right=34;sc.top=34;sc.bottom=-34;sc.near=1;sc.far=140;sun.shadow.bias=-.0003;sun.shadow.normalBias=.03;}
 /* shafts: one bundle per window side; they turn with the sun and fade with how squarely the sun faces that side */
 const beamMat=keep(new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false,
  uniforms:{uTime:{value:0},uColor:{value:new THREE.Color(0xd2caf8)},uStrength:{value:0}},
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vW;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uTime;uniform vec3 uColor;uniform float uStrength;varying vec2 vUv;varying vec3 vN;varying vec3 vV;varying vec3 vW;
   float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
   float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
   void main(){float edge=pow(abs(dot(normalize(vN),normalize(vV))),2.2);float along=vUv.y;float fade=smoothstep(0.,.28,along)*smoothstep(1.,.72,along);
    float streak=.84+.16*n(vec2(vUv.x*14.,along*1.2-uTime*.02))+.05*n(vec2(vUv.x*48.,along*4.+uTime*.04));float floorFade=smoothstep(-.4,2.6,vW.y);
    float a=edge*fade*streak*floorFade*1.25*uStrength;gl_FragColor=vec4(uColor*a,a);}`}));
 const beams=new THREE.Group();scene.add(beams);noAO.push(beams);
 const poolTex=T(glowSprite(256,'rgba(255,250,240,.85)','rgba(220,210,255,.3)'));
 const beamGeo=keep(new THREE.CylinderGeometry(1,1.2,1,32,1,true).translate(0,-.5,0));
 const bundle=(points,r,str)=>points.map(p=>{const m=new THREE.Mesh(beamGeo,beamMat.clone());keep(m.material);m.position.copy(p);m.renderOrder=3;m.userData={r,str};beams.add(m);
  const pool=new THREE.Mesh(keep(new THREE.PlaneGeometry(1,1)),keep(new THREE.MeshBasicMaterial({map:poolTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0,fog:false})));
  pool.rotation.x=-Math.PI/2;pool.renderOrder=2;scene.add(pool);skipInMirror.push(pool);noAO.push(pool);m.userData.pool=pool;return m;});
 const sets={east:{n:windows.east.normal,beams:bundle(windows.east.list.slice(1,6),.7,.7)},south:{n:windows.south.normal,beams:bundle([windows.south.pos],windows.south.r*.62,1)},
  north:{n:windows.north.normal,beams:bundle([windows.north.pos],windows.north.r*.62,1)},west:{n:windows.west.normal,beams:bundle([windows.west.pos],windows.west.r*.62,1)}};

 /* ---- real sun ----
    The sun's place is computed from today's date and the PC's clock (solar declination + hour angle), at a latitude guessed from the
    time zone, so sunrise and sunset move with the seasons. The church is oriented the old way: the apse behind the stele faces east
    (-z), south is +x, west (the nave, behind the camera) is +z. There is one sun: all its light comes from one direction and gets in
    only through the windows that face it. Sky colour, glass, fog, exposure and the torches follow the sun's height, not the hour.
    After dark the moon (opposite the sun) gives a faint cold light and no shafts. */
 const C=h=>new THREE.Color(h);
 /* by solar elevation in degrees */
 const EKEYS=[
  [-90,{sky:C(0x1a1c3a),skyI:.13,gnd:C(0x0b0a10),lc:C(0x7d8cc8),li:.2,glass:C(0x464e9c),gi:.3,fog:C(0x07060c),fd:.019,exp:.92,beam:0}],
  [-12,{sky:C(0x1c1e40),skyI:.14,gnd:C(0x0b0a10),lc:C(0x7d8cc8),li:.2,glass:C(0x4a52a0),gi:.32,fog:C(0x08070e),fd:.019,exp:.92,beam:0}],
  [-6, {sky:C(0x312a5c),skyI:.2,gnd:C(0x100d16),lc:C(0x8a90cc),li:.08,glass:C(0x6a62b0),gi:.45,fog:C(0x100c18),fd:.018,exp:.93,beam:0}],
  [-2.5,{sky:C(0x5e4a7e),skyI:.3,gnd:C(0x18131a),lc:C(0xff9a7a),li:0,glass:C(0xc89aa8),gi:.75,fog:C(0x221a26),fd:.016,exp:.96,beam:0}],
  [2,  {sky:C(0x8a6a98),skyI:.46,gnd:C(0x221a1e),lc:C(0xff9460),li:1.3,glass:C(0xffb890),gi:1.2,fog:C(0x34242e),fd:.014,exp:.99,beam:.9}],
  [8,  {sky:C(0xa896c8),skyI:.75,gnd:C(0x2a2228),lc:C(0xffc89c),li:2.0,glass:C(0xf6dcd0),gi:1.6,fog:C(0x3a3040),fd:.013,exp:1.03,beam:1}],
  [20, {sky:C(0xb8bcec),skyI:1.05,gnd:C(0x302a30),lc:C(0xfff0e2),li:2.8,glass:C(0xeceaff),gi:2.1,fog:C(0x3c3a4c),fd:.011,exp:1.08,beam:1}],
  [45, {sky:C(0xc4c8f0),skyI:1.25,gnd:C(0x343036),lc:C(0xffffff),li:3.2,glass:C(0xf4f2ff),gi:2.4,fog:C(0x403e50),fd:.010,exp:1.1,beam:.9}],
  [90, null]];
 EKEYS[EKEYS.length-1][1]=EKEYS[EKEYS.length-2][1];
 const cur={sky:new THREE.Color(),gnd:new THREE.Color(),lc:new THREE.Color(),glass:new THREE.Color(),fog:new THREE.Color()};let first=true;
 function sample(e){let i=0;while(i<EKEYS.length-2&&EKEYS[i+1][0]<=e)i++;const [e0,a]=EKEYS[i],[e1,b]=EKEYS[i+1];let t=Math.min(1,Math.max(0,(e-e0)/(e1-e0)));t=t*t*(3-2*t);
  const o={};for(const k in a)o[k]=a[k].isColor?a[k].clone().lerp(b[k],t):a[k]+(b[k]-a[k])*t;return o;}
 /* latitude from the time zone (the page cannot know where the PC is; this is close enough for the light) */
 const LAT=(()=>{let tz='';try{tz=Intl.DateTimeFormat().resolvedOptions().timeZone||'';}catch{}
  const map=[[/Shanghai|Chongqing|Harbin|Urumqi/,31],[/Hong_Kong|Macau/,22.3],[/Taipei/,25],[/Tokyo/,35.7],[/Seoul/,37.5],[/Singapore|Kuala_Lumpur/,2],[/Sydney|Melbourne/,-34],[/Los_Angeles/,34],[/New_York/,40.7],[/London/,51.5],[/Paris|Berlin/,50]];
  for(const [re,v] of map)if(re.test(tz))return v;return 35;})();
 const D2R=Math.PI/180;
 /* time used: the PC clock, or window.__TORCH_HOUR (a test hook) on today's date */
 const nowDate=()=>{const d=new Date();if(typeof window.__TORCH_HOUR==='number'){const h=window.__TORCH_HOUR;d.setHours(Math.floor(h),Math.round((h%1)*60),0,0);}return d;};
 /* -> {el: elevation in degrees, az: azimuth from north, clockwise, in degrees}; solar time taken as the zone's clock time */
 function solar(d){const start=new Date(d.getFullYear(),0,0),n=Math.floor((d-start)/864e5),phi=LAT*D2R;
  const decl=23.44*D2R*Math.sin(2*Math.PI*(284+n)/365),lst=d.getHours()+d.getMinutes()/60+d.getSeconds()/3600,H=15*(lst-12)*D2R;
  const sinE=Math.sin(phi)*Math.sin(decl)+Math.cos(phi)*Math.cos(decl)*Math.cos(H),el=Math.asin(Math.max(-1,Math.min(1,sinE)));
  const az=Math.atan2(-Math.sin(H),Math.tan(decl)*Math.cos(phi)-Math.sin(phi)*Math.cos(H));return {el:el/D2R,az:((az/D2R)+360)%360};}
 /* sky direction (unit vector toward the body) in hall space: north -x, east -z, south +x, west +z */
 const skyDir=(az,el)=>{const a=az*D2R,e=el*D2R;return new THREE.Vector3(-Math.cos(a)*Math.cos(e),Math.sin(e),-Math.sin(a)*Math.cos(e)).normalize();};
 function sunAt(){const {el,az}=solar(nowDate());
  if(el>-2.5)return {pos:skyDir(az,Math.max(el,1.5)),moon:false,up:1,el};
  /* the moon, roughly opposite the sun, never lower than 25° so its faint light still reaches in */
  return {pos:skyDir((az+180)%360,Math.max(25,Math.min(70,-el))),moon:true,up:1,el};}
 const hoursNow=()=>{const d=nowDate();return d.getHours()+d.getMinutes()/60;};
 const hallState={torch:0,beam:0,sunPos:new THREE.Vector3(0,1,0),exposure:1,el:0};
 function applyTime(dt,renderer){const s=sunAt(),k=sample(s.el),a=first?1:1-Math.exp(-dt*1.5);first=false;
  /* torches: lit as the sun goes down (from 10° above the horizon, fully by 1°), out again in the morning */
  k.torch=1-THREE.MathUtils.smoothstep(s.el,1,10);hallState.el=s.el;
  cur.sky.lerp(k.sky,a);cur.gnd.lerp(k.gnd,a);cur.lc.lerp(k.lc,a);cur.glass.lerp(k.glass,a);cur.fog.lerp(k.fog,a);
  for(const key of ['skyI','li','gi','fd','exp','torch','beam'])hallState[key]=hallState[key]===undefined?k[key]:hallState[key]+(k[key]-hallState[key])*a;
  /* sun ↔ moon swap happens while the direct light is ~0 (elevation -2.5°), so the jump is invisible */
  if(s.moon!==hallState.moon){hallState.moon=s.moon;hallState.sunPos.copy(s.pos);}
  hallState.sunPos.lerp(s.pos,a).normalize();
  hemi.color.copy(cur.sky);hemi.groundColor.copy(cur.gnd);hemi.intensity=hallState.skyI;
  /* the light tier has no shadows, so the sun would come through the roof: keep it to a soft key there */
  sun.color.copy(cur.lc);sun.intensity=hallState.li;sun.position.copy(sun.target.position).addScaledVector(hallState.sunPos,90);
  for(const m of glass)m.color.copy(cur.glass).multiplyScalar(hallState.gi);
  scene.fog.color.copy(cur.fog);scene.fog.density=hallState.fd;scene.background.copy(cur.fog);
  renderer.toneMappingExposure=hallState.exp;
  /* shafts: travel along -sunPos; a window side gets them when it faces the sun */
  const dir=hallState.sunPos.clone().negate();
  for(const set of Object.values(sets)){const steep=THREE.MathUtils.smoothstep(-dir.y,.28,.55),face=Math.max(0,set.n.dot(hallState.sunPos)),w=s.moon?0:Math.pow(face,.8)*hallState.beam*steep;
   for(const m of set.beams){const len=dir.y<-.05?Math.min(30,m.position.y/-dir.y):0;m.visible=w>.01&&len>0;m.userData.pool.visible=m.visible;if(!m.visible)continue;
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),dir);m.scale.set(m.userData.r,len,m.userData.r);
    m.material.uniforms.uStrength.value=w*m.userData.str;m.material.uniforms.uColor.value.copy(cur.lc).lerp(new THREE.Color(0xd8d0ff),.35);
    const hit=m.position.clone().addScaledVector(dir,len),pool=m.userData.pool;pool.position.set(hit.x,.014,hit.z);
    const stretch=1/Math.max(.35,-dir.y);pool.scale.set(m.userData.r*2.6,m.userData.r*2.6*stretch,1);pool.rotation.z=-Math.atan2(dir.x,dir.z);pool.material.opacity=.18*w*m.userData.str;}}
  /* torches */
  flameMat.uniforms.uOn.value=hallState.torch;haloMat.opacity=hallState.torch*.8;flameMesh.visible=hallState.torch>.01;halos.forEach(x=>x.visible=flameMesh.visible);}
 function update(time,dt,renderer){applyTime(dt,renderer);flameMat.uniforms.uTime.value=time;beams.children.forEach(b=>b.material.uniforms.uTime.value=time);
  for(const l of torchLights){const f=.82+.12*Math.sin(time*7.3+l.userData.seed)+.06*Math.sin(time*17.1+l.userData.seed*3);l.intensity=hallState.torch*16*l.userData.k*f;}
  hallState.flicker=.88+.07*Math.sin(time*6.1)+.05*Math.sin(time*13.7+1.3);}
 /* the sun moves about 0.25° a minute: its shadow map is drawn again only after it has moved ~0.1° (or the moon took over) */
 const shadowAt=new THREE.Vector3(),shadowState={dirty:true};
 function setShadows(on,size=2048){sun.castShadow=on;if(on){sun.shadow.mapSize.set(size,size);sun.shadow.map?.dispose();sun.shadow.map=null;}shadowState.dirty=true;}
 function shadowDirty(){if(shadowState.dirty||shadowAt.angleTo(hallState.sunPos)>.0018){shadowAt.copy(hallState.sunPos);shadowState.dirty=false;return true;}return false;}
 /* the glass and the flames must not throw shadows: daylight comes in through the windows */
 hall.traverse(o=>{if(o.isMesh&&glass.includes(o.material)){o.castShadow=false;}});
 return {hall,skipInMirror,noAO,floorMat,inlayMat,FL_W,FL_L,FL_Z,update,setShadows,shadowDirty,sun,state:hallState,torchPoints,
  shafts:Object.values(sets).flatMap(s=>s.beams),windows,colZ,hours:hoursNow};
}
