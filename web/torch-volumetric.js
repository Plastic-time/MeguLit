// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑: light in the air (the Tyndall effect) done the physical way. For every pixel, at reduced resolution, the view ray
   is marched from the eye to the first surface (scene depth) inside the church, and each step asks the sun's (or moon's) shadow map
   whether that bit of air is lit. Lit air scatters light toward the eye (Henyey-Greenstein, mostly forward), with a slowly drifting
   density like dust. So the shafts have exactly the shape of the windows the light comes through, line up with the patches on the
   floor, and move with the sun; at night the same pass gives faint moonbeams. The result is blurred and added onto the image. */
import * as THREE from './vendor/three/three.module.min.js';
import {Pass,FullScreenQuad} from './vendor/three/addons/postprocessing/Pass.js';

const VS=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const MARCH=`#include <packing>
uniform sampler2D tDepth;uniform sampler2D tShadow;uniform mat4 shadowMatrix;uniform mat4 projInv;uniform mat4 camWorld;uniform vec3 camPos;
uniform vec3 lightDir;uniform vec3 color;uniform float density;uniform float time;uniform vec3 boxMin;uniform vec3 boxMax;uniform float maxDist;
uniform float hasSun;uniform float hasVol;uniform highp sampler3D tTorch;uniform highp sampler3D tStele;uniform vec3 volMin;uniform vec3 volSize;uniform vec3 torchCol;uniform vec3 steleCol;uniform vec4 steleLv;uniform float volDensity;
varying vec2 vUv;
float ign(vec2 p){return fract(52.9829189*fract(dot(p,vec2(.06711056,.00583715))));}
float h3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){float d=texture2D(tDepth,vUv).x;vec4 v=projInv*vec4(vUv*2.-1.,d*2.-1.,1.);v/=v.w;vec3 wp=(camWorld*v).xyz;
 vec3 ro=camPos,rd=normalize(wp-ro);float tEnd=min(length(wp-ro),maxDist);
 vec3 inv=1./rd,t0=(boxMin-ro)*inv,t1=(boxMax-ro)*inv,tmn=min(t0,t1),tmx=max(t0,t1);
 float ta=max(max(tmn.x,tmn.y),max(tmn.z,0.)),tb=min(min(tmx.x,tmx.y),tmx.z);tEnd=min(tEnd,tb);
 if(tEnd<=ta){gl_FragColor=vec4(0.);return;}
 float stepL=(tEnd-ta)/float(STEPS),t=ta+stepL*ign(gl_FragCoord.xy+fract(time*7.)*61.);
 float c=dot(rd,lightDir),g=.6,hg=(1.-g*g)/(12.566*pow(1.+g*g-2.*g*c,1.5)),phase=mix(.0796,hg,.75);
 float acc=0.;vec3 glow=vec3(0.);
 for(int i=0;i<STEPS;i++){vec3 p=ro+rd*t;vec4 sc=shadowMatrix*vec4(p,1.);
  vec3 edge=min(p-boxMin,boxMax-p);
  float envelope=smoothstep(0.,3.5,min(edge.y,min(edge.x,edge.z)));
  if(hasSun>.5&&sc.x>0.&&sc.x<1.&&sc.y>0.&&sc.y<1.&&sc.z<1.){float sd=unpackRGBAToDepth(texture2D(tShadow,sc.xy));
   if(hasSun>.5&&sc.z-.0012<sd){float dens=.45+.9*n3(p*.32+vec3(time*.05,time*.02,-time*.03));acc+=dens*stepL*envelope;}}
  if(hasVol>.5){vec3 q=clamp((p-volMin)/volSize,0.,1.);float tq=texture(tTorch,q).r;vec4 sv=texture(tStele,q);float dn=.5+.8*n3(p*.45+vec3(-time*.04,time*.05,time*.02));
   glow+=(torchCol*tq*tq*.5+steleCol*dot(sv*sv*2.,steleLv))*dn*stepL*envelope;}
  t+=stepL;}
 gl_FragColor=vec4(color*acc*phase*density+glow*volDensity*.0796,1.);}`;
const BLUR=`uniform sampler2D tInput;uniform vec2 dir;varying vec2 vUv;
void main(){vec3 s=texture2D(tInput,vUv).rgb*.2270;s+=(texture2D(tInput,vUv+dir*1.3846).rgb+texture2D(tInput,vUv-dir*1.3846).rgb)*.3162;
 s+=(texture2D(tInput,vUv+dir*3.2308).rgb+texture2D(tInput,vUv-dir*3.2308).rgb)*.0703;gl_FragColor=vec4(s,1.);}`;
const COMP=`uniform sampler2D tInput;uniform sampler2D tDepth;varying vec2 vUv;
 void main(){
  float depth=texture2D(tDepth,vUv).r;
  float surface=1.-smoothstep(.9975,.99999,depth);
  gl_FragColor=vec4(texture2D(tInput,vUv).rgb*surface,1.);
 }`;

export class VolumetricPass extends Pass{
 constructor({camera,light,box,scale=.5,steps=48}){super();this.needsSwap=false;this.camera=camera;this.light=light;this.scale=scale;this.strength=1;
  const rt=()=>new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});this.rtA=rt();this.rtB=rt();
  this.marchMat=new THREE.ShaderMaterial({defines:{STEPS:steps},vertexShader:VS,fragmentShader:MARCH,depthTest:false,depthWrite:false,uniforms:{
   tDepth:{value:null},tShadow:{value:null},shadowMatrix:{value:new THREE.Matrix4()},projInv:{value:new THREE.Matrix4()},camWorld:{value:new THREE.Matrix4()},camPos:{value:new THREE.Vector3()},
   lightDir:{value:new THREE.Vector3()},color:{value:new THREE.Color()},density:{value:.05},hasSun:{value:0},hasVol:{value:0},tTorch:{value:null},tStele:{value:null},volMin:{value:new THREE.Vector3()},volSize:{value:new THREE.Vector3(1,1,1)},torchCol:{value:new THREE.Color()},steleCol:{value:new THREE.Color()},steleLv:{value:new THREE.Vector4()},volDensity:{value:.03},time:{value:0},boxMin:{value:new THREE.Vector3(...box.min)},boxMax:{value:new THREE.Vector3(...box.max)},maxDist:{value:70}}});
  this.blurMat=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:BLUR,depthTest:false,depthWrite:false,uniforms:{tInput:{value:null},dir:{value:new THREE.Vector2()}}});
  this.compMat=new THREE.ShaderMaterial({vertexShader:VS,fragmentShader:COMP,depthTest:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending,uniforms:{tInput:{value:null},tDepth:{value:null}}});
  this.march=new FullScreenQuad(this.marchMat);this.blur=new FullScreenQuad(this.blurMat);this.comp=new FullScreenQuad(this.compMat);}
 setSize(w,h){const W=Math.max(1,Math.round(w*this.scale)),H=Math.max(1,Math.round(h*this.scale));this.rtA.setSize(W,H);this.rtB.setSize(W,H);this.px=[1/W,1/H];}
 /* baked light volumes (torch-bake.js): the air near the torches and the stele scatters their light too */
 setVolumes(u){const m=this.marchMat.uniforms;m.tTorch.value=u.uTorchVol.value;m.tStele.value=u.uSteleVol.value;m.volMin.value.copy(u.uAoMin.value);m.volSize.value.copy(u.uAoSize.value);this.volU=u;}
 render(renderer,writeBuffer,readBuffer){const L=this.light;if(!readBuffer.depthTexture)return;
  const u=this.marchMat.uniforms,cam=this.camera,sun=!!(L.castShadow&&L.shadow.map&&this.strength*L.intensity>.002),V=this.volU;
  if(V){u.torchCol.value.copy(V.uTorchColor.value).multiplyScalar(V.uTorchLevel.value*16*.6);u.steleCol.value.copy(V.uSteleColor.value).multiplyScalar(7);u.steleLv.value.copy(V.uSteleLevels.value);}
  const vol=!!(V&&u.tTorch.value&&(V.uTorchLevel.value>.01||V.uSteleLevels.value.lengthSq()>1e-4));
  if(!sun&&!vol)return;u.hasSun.value=sun?1:0;u.hasVol.value=vol?1:0;
  u.tDepth.value=readBuffer.depthTexture;if(sun){u.tShadow.value=L.shadow.map.texture;u.shadowMatrix.value.copy(L.shadow.matrix);}
  u.projInv.value.copy(cam.projectionMatrixInverse);u.camWorld.value.copy(cam.matrixWorld);u.camPos.value.setFromMatrixPosition(cam.matrixWorld);
  u.lightDir.value.copy(L.position).sub(L.target.position).normalize();u.color.value.copy(L.color).multiplyScalar(L.intensity*this.strength);u.time.value=performance.now()/1000;
  const auto=renderer.autoClear;renderer.autoClear=false;
  renderer.setRenderTarget(this.rtA);renderer.clear();this.march.render(renderer);
  this.blurMat.uniforms.tInput.value=this.rtA.texture;this.blurMat.uniforms.dir.value.set(this.px[0],0);renderer.setRenderTarget(this.rtB);this.blur.render(renderer);
  this.blurMat.uniforms.tInput.value=this.rtB.texture;this.blurMat.uniforms.dir.value.set(0,this.px[1]);renderer.setRenderTarget(this.rtA);this.blur.render(renderer);
  this.compMat.uniforms.tInput.value=this.rtA.texture;this.compMat.uniforms.tDepth.value=readBuffer.depthTexture;renderer.setRenderTarget(readBuffer);this.comp.render(renderer);
  renderer.autoClear=auto;}
 dispose(){this.rtA.dispose();this.rtB.dispose();this.marchMat.dispose();this.blurMat.dispose();this.compMat.dispose();this.march.dispose();this.blur.dispose();this.comp.dispose();}}
