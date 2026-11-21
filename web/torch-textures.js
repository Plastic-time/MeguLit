// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-21 传火碑: every texture of the hall is drawn here, procedurally (no image files, nothing taken from anywhere).
   Stone is cream limestone in ashlar courses, carvings are height maps turned into normal maps (the relief reads by light,
   not by paint), the vault is coffered, the windows are stained glass, the floor is polished marble with an inlaid runner.
   Each maker returns canvases; the scene wraps them in textures. `q` (1 or .5) scales the sizes for the light tier. */

export function rng(seed){let s=seed>>>0||1;return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;};}
/* tileable value noise + fbm on a period-p lattice */
export function makeNoise(seed){const r=rng(seed),P=256,v=new Float32Array(P*P);for(let i=0;i<v.length;i++)v[i]=r();
 const at=(x,y,p)=>v[((y%p+p)%p)*P+((x%p+p)%p)];
 const n=(x,y,p)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),w=yf*yf*(3-2*yf);
  const a=at(xi,yi,p),b=at(xi+1,yi,p),c=at(xi,yi+1,p),d=at(xi+1,yi+1,p);return a+(b-a)*u+(c-a)*w+(a-b-c+d)*u*w;};
 return (x,y,base=4,oct=5)=>{let s=0,amp=.5,f=base;for(let o=0;o<oct;o++){s+=amp*n(x*f,y*f,f);amp*=.5;f*=2;}return s;};}
export function canvas2d(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c;}
export function pixels(w,h,fn){const c=canvas2d(w,h),g=c.getContext('2d'),img=g.createImageData(c.width,c.height),d=img.data;
 for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const o=(y*c.width+x)*4,px=fn(x/c.width,y/c.height,x,y);d[o]=px[0];d[o+1]=px[1];d[o+2]=px[2];d[o+3]=px[3]??255;}g.putImageData(img,0,0);return c;}
/* height (Float32Array w×h, 0…1) → tangent-space normal map; wraps at the edges */
export function heightToNormal(h,w,hh,strength=4){return pixels(w,hh,(u,v,x,y)=>{const at=(i,j)=>h[((j+hh)%hh)*w+((i+w)%w)];
 const dx=(at(x+1,y)-at(x-1,y))*strength,dy=(at(x,y+1)-at(x,y-1))*strength,l=Math.hypot(dx,dy,1);return [(-dx/l*.5+.5)*255,(dy/l*.5+.5)*255,(1/l*.5+.5)*255];});}
/* read a grayscale canvas back as a height field */
function heightOf(c){const g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data,h=new Float32Array(c.width*c.height);for(let i=0;i<h.length;i++)h[i]=d[i*4]/255;return h;}
const mix=(a,b,t)=>a+(b-a)*t,clamp01=x=>x<0?0:x>1?1:x;

/* ---- ashlar: limestone blocks in courses, chipped arrises, a little weathering ---- */
export function ashlar(size,seed,{base=[196,184,164],courses=6,mortar=[120,110,98]}={}){
 const r=rng(seed),fbm=makeNoise(seed),ch=size/courses,rows=[];
 for(let c=0;c<courses;c++){const cuts=[];let x=r()*ch*2;while(x<size+ch*3){cuts.push(x);x+=ch*(1.3+r()*1.2);}rows.push({cuts,tone:[]});rows[c].tone=cuts.map(()=>.9+r()*.16);}
 const H=new Float32Array(size*size),A=new Float32Array(size*size*3);
 for(let y=0;y<size;y++){const c=Math.floor(y/ch),row=rows[c],ly=y-c*ch;
  for(let x=0;x<size;x++){const cuts=row.cuts;
   /* block index and distance to its edges (wrapping horizontally) */
   let xa=x,k=0;if(xa<cuts[0])xa+=size;while(k<cuts.length-1&&cuts[k+1]<=xa)k++;const left=cuts[k],right=cuts[k+1]??left+ch*2;
   const dEdge=Math.min(xa-left,right-xa,ly,ch-ly),gap=2.2,bev=7;
   const n=fbm(x/size,y/size,6,5),n2=fbm(x/size+.3,y/size+.7,24,3);
   let h;if(dEdge<gap)h=0;else{const t=clamp01((dEdge-gap)/bev);h=.55+.45*Math.sqrt(t)+(n-.5)*.12+(n2-.5)*.05;
    /* chipped arrises: random dents near the edges */
    if(dEdge<gap+bev*1.6&&fbm(x/size*3+k,y/size*3,10,2)>.62)h-=.25*(1-t);}
   H[y*size+x]=clamp01(h);
   const tone=row.tone[k%row.tone.length]*(.9+n*.18),o=(y*size+x)*3;
   if(dEdge<gap){A[o]=mortar[0];A[o+1]=mortar[1];A[o+2]=mortar[2];}
   else{const weather=.92+.08*fbm(x/size,y/size,2,3);A[o]=base[0]*tone*weather;A[o+1]=base[1]*tone*weather;A[o+2]=base[2]*tone*weather*.99;}}}
 const map=pixels(size,size,(u,v,x,y)=>{const o=(y*size+x)*3,ao=.78+.22*H[y*size+x];return [A[o]*ao,A[o+1]*ao,A[o+2]*ao];});
 const rough=pixels(size>>1,size>>1,(u,v,x,y)=>{const hh=H[(y*2)*size+x*2];const g=hh<.1?240:170+(1-hh)*60;return [g,g,g];});
 return {map,normal:heightToNormal(H,size,size,5),rough};}

/* ---- carved frieze: egg-and-dart over an acanthus scroll over bead-and-reel (height drawn, then lit by its normal) ---- */
export function relief(w,h,seed,{base=[204,192,172]}={}){
 const c=canvas2d(w,h),g=c.getContext('2d');g.fillStyle='#3a3a3a';g.fillRect(0,0,w,h);
 const fillDome=(cx,cy,rx,ry,top=255)=>{const gr=g.createRadialGradient(cx,cy-ry*.2,0,cx,cy,Math.max(rx,ry));gr.addColorStop(0,`rgb(${top},${top},${top})`);gr.addColorStop(.75,'rgb(150,150,150)');gr.addColorStop(1,'rgb(70,70,70)');
  g.fillStyle=gr;g.beginPath();g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);g.fill();};
 /* fillets between the bands */
 const band=(y0,y1,v)=>{g.fillStyle=`rgb(${v},${v},${v})`;g.fillRect(0,y0,w,y1-y0);};
 band(0,h*.05,230);band(h*.05,h*.07,120);
 /* egg-and-dart */
 const eggY=h*.17,eggH=h*.085,n=Math.round(w/(h*.2));const step=w/n;
 band(h*.07,h*.28,95);
 for(let i=0;i<n;i++){const x=(i+.5)*step;g.fillStyle='rgb(60,60,60)';g.beginPath();g.ellipse(x,eggY,step*.36,eggH*1.15,0,0,Math.PI*2);g.fill();fillDome(x,eggY,step*.3,eggH,250);
  const dx=x+step/2;g.fillStyle='rgb(200,200,200)';g.beginPath();g.moveTo(dx,eggY+eggH*1.1);g.lineTo(dx-step*.05,eggY-eggH*.6);g.lineTo(dx,eggY-eggH*.9);g.lineTo(dx+step*.05,eggY-eggH*.6);g.closePath();g.fill();}
 band(h*.28,h*.31,225);band(h*.31,h*.33,110);
 /* acanthus rinceau: a wavy stem with spiral tendrils and curling leaves */
 const y0=h*.33,y1=h*.82,mid=(y0+y1)/2,amp=(y1-y0)*.26,waves=Math.round(w/(h*.9))||1,ws=w/waves;
 band(y0,y1,80);
 g.lineCap='round';g.lineJoin='round';
 const stem=x=>mid+Math.sin(x/ws*Math.PI*2)*amp;
 for(let pass=0;pass<2;pass++){g.strokeStyle=pass?'rgb(235,235,235)':'rgb(150,150,150)';g.lineWidth=pass?h*.022:h*.04;g.beginPath();for(let x=-4;x<=w+4;x+=2){const y=stem(x);x>-4?g.lineTo(x,y):g.moveTo(x,y);}g.stroke();}
 for(let i=0;i<waves*2;i++){const x=(i+.25)*ws/2,up=i%2===0,sy=stem(x),dir=up?1:-1;
  /* spiral tendril */
  g.strokeStyle='rgb(220,220,220)';g.lineWidth=h*.014;g.beginPath();const cx=x+ws*.14,cy=sy+dir*amp*.9;
  for(let a=0;a<Math.PI*3.2;a+=.08){const rr=amp*.62*(1-a/(Math.PI*3.6));const px=cx+Math.cos(a*dir+Math.PI)*rr,py=cy+Math.sin(a*dir+Math.PI)*rr*.9;a?g.lineTo(px,py):g.moveTo(px,py);}g.stroke();
  fillDome(cx,cy,h*.03,h*.03,255);
  /* acanthus leaves along the stem: lobed, with a raised midrib */
  for(let L=0;L<3;L++){const lx=x-ws*.08+L*ws*.07,ly=stem(lx),ang=(up?-1:1)*(.9-L*.25),len=h*(.16-L*.025);
   g.save();g.translate(lx,ly);g.rotate(ang);const gr=g.createLinearGradient(0,-len*.3,0,len*.3);gr.addColorStop(0,'rgb(120,120,120)');gr.addColorStop(.5,'rgb(235,235,235)');gr.addColorStop(1,'rgb(120,120,120)');
   g.fillStyle=gr;g.beginPath();g.moveTo(0,0);for(let s=0;s<=1.001;s+=.125){const lob=1+.35*Math.abs(Math.sin(s*Math.PI*4));g.lineTo(s*len*1.6,-Math.sin(s*Math.PI)*len*.38*lob);}
   for(let s=1;s>=0;s-=.125){const lob=1+.35*Math.abs(Math.sin(s*Math.PI*4+.5));g.lineTo(s*len*1.6,Math.sin(s*Math.PI)*len*.3*lob);}g.closePath();g.fill();
   g.strokeStyle='rgb(255,255,255)';g.lineWidth=h*.007;g.beginPath();g.moveTo(0,0);g.quadraticCurveTo(len*.8,-len*.06,len*1.55,0);g.stroke();g.restore();}}
 band(y1,y1+h*.02,120);band(y1+h*.02,h*.86,225);
 /* bead and reel */
 const by=h*.92,bn=Math.round(w/(h*.12));const bs=w/bn;band(h*.86,h,90);
 for(let i=0;i<bn;i++){const x=(i+.5)*bs;fillDome(x-bs*.18,by,bs*.17,h*.035,250);fillDome(x+bs*.25,by,bs*.07,h*.028,220);fillDome(x+bs*.38,by,bs*.07,h*.028,220);}
 band(h*.975,h,200);
 /* soften, read back as height, light it */
 const soft=canvas2d(w,h),sg=soft.getContext('2d');sg.filter='blur('+Math.max(1,h/220)+'px)';sg.drawImage(c,0,0);
 const H=heightOf(soft),fbm=makeNoise(seed);
 const map=pixels(w,h,(u,v,x,y)=>{const hh=H[y*w+x],ao=.55+.45*Math.pow(hh,.7),n=.92+.12*fbm(u,v*h/w,8,4);return [base[0]*ao*n,base[1]*ao*n,base[2]*ao*n];});
 return {map,normal:heightToNormal(H,w,h,7)};}

/* ---- coffered vault: sunk panels with stepped frames and a gilt rosette; `cols` around, `rows` down ---- */
export function coffers(w,h,{cols=24,rows=6,v0=.1,v1=.92,field=[44,38,72],frame=[196,184,164],gold=[186,146,82]}={}){
 const H=new Float32Array(w*h),A=new Float32Array(w*h*3);
 for(let y=0;y<h;y++){const v=y/h;for(let x=0;x<w;x++){const u=x/w,o=y*w+x;let hh=1,col=frame,goldK=0;
  if(v>v0&&v<v1){const rv=(v-v0)/(v1-v0)*rows,cu=u*cols,fu=cu-Math.floor(cu),fv=rv-Math.floor(rv);
   const e=Math.min(fu,1-fu,fv*1.15,(1-fv)*1.15);
   if(e>.1){const step=e<.16?.72:e<.22?.5:.3;hh=step;col=e<.22?[frame[0]*.86,frame[1]*.86,frame[2]*.86]:field;
    /* rosette */
    const dx=(fu-.5)*1.1,dy=(fv-.5),rr=Math.hypot(dx,dy),ang=Math.atan2(dy,dx),petal=.12+.05*Math.cos(ang*8);
    if(rr<petal){hh=.3+.55*(1-rr/petal);col=gold;goldK=1;}else if(rr<petal+.02){hh=.25;col=[field[0]*.7,field[1]*.7,field[2]*.7];}}
   else if(e>.07){hh=.85;}}
  else if(v>=v1&&v<v1+.03){hh=.6;col=gold;goldK=1;}
  H[o]=hh;A[o*3]=col[0];A[o*3+1]=col[1];A[o*3+2]=col[2];}}
 const map=pixels(w,h,(u,v,x,y)=>{const o=y*w+x,ao=.7+.3*H[o];return [A[o*3]*ao,A[o*3+1]*ao,A[o*3+2]*ao];});
 return {map,normal:heightToNormal(H,w,h,6)};}

/* ---- stained glass: a rose window (radial tracery) and a lancet; muted jewel colours, dark leading ---- */
const GLASS=[[58,64,118],[96,58,112],[128,40,58],[176,128,70],[70,104,128],[88,70,128],[160,146,110]];
export function rose(size,seed,{petals=12}={}){const c=canvas2d(size,size),g=c.getContext('2d'),r=rng(seed),R=size/2;g.translate(R,R);
 g.fillStyle='#000';g.fillRect(-R,-R,size,size);
 const cell=(path,col)=>{const k=.82+r()*.3;g.fillStyle=`rgb(${col[0]*k|0},${col[1]*k|0},${col[2]*k|0})`;path();g.fill();};
 /* outer ring of small cells */
 for(let i=0;i<petals*2;i++){const a0=i/(petals*2)*Math.PI*2,a1=(i+1)/(petals*2)*Math.PI*2;cell(()=>{g.beginPath();g.arc(0,0,R*.96,a0,a1);g.arc(0,0,R*.8,a1,a0,true);g.closePath();},GLASS[i%2?0:5]);}
 /* petals */
 for(let i=0;i<petals;i++){const a=i/petals*Math.PI*2;g.save();g.rotate(a);cell(()=>{g.beginPath();g.moveTo(R*.22,0);g.quadraticCurveTo(R*.5,-R*.2,R*.78,-R*.08);g.arc(R*.78,0,R*.08,-Math.PI/2,Math.PI/2);g.quadraticCurveTo(R*.5,R*.2,R*.22,0);},GLASS[[2,3,1,4][i%4]]);
  cell(()=>{g.beginPath();g.arc(R*.62,0,R*.07,0,Math.PI*2);},GLASS[3]);g.restore();}
 cell(()=>{g.beginPath();g.arc(0,0,R*.22,0,Math.PI*2);},GLASS[2]);cell(()=>{g.beginPath();g.arc(0,0,R*.1,0,Math.PI*2);},GLASS[3]);
 /* leading */
 g.strokeStyle='#0c0a0e';g.lineWidth=size/70;
 for(const rr of [.96,.8,.22,.1]){g.beginPath();g.arc(0,0,R*rr,0,Math.PI*2);g.stroke();}
 for(let i=0;i<petals*2;i++){const a=i/(petals*2)*Math.PI*2;g.beginPath();g.moveTo(Math.cos(a)*R*.8,Math.sin(a)*R*.8);g.lineTo(Math.cos(a)*R*.96,Math.sin(a)*R*.96);g.stroke();}
 for(let i=0;i<petals;i++){const a=i/petals*Math.PI*2;g.save();g.rotate(a);g.beginPath();g.moveTo(R*.22,0);g.quadraticCurveTo(R*.5,-R*.2,R*.78,-R*.08);g.arc(R*.78,0,R*.08,-Math.PI/2,Math.PI/2);g.quadraticCurveTo(R*.5,R*.2,R*.22,0);g.stroke();
  g.beginPath();g.arc(R*.62,0,R*.07,0,Math.PI*2);g.stroke();g.restore();}
 /* glass grain */
 const img=g.getImageData(0,0,size,size),d=img.data,fb=makeNoise(seed+3);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const o=(y*size+x)*4,k=.8+.4*fb(x/size,y/size,12,3);d[o]*=k;d[o+1]*=k;d[o+2]*=k;}
 g.putImageData(img,0,0);return c;}
export function lancet(w,h,seed){const c=canvas2d(w,h),g=c.getContext('2d'),r=rng(seed);g.fillStyle='#000';g.fillRect(0,0,w,h);
 const cols=3,rowsN=9,cw=w/cols,rh=h/rowsN;
 for(let i=0;i<rowsN;i++)for(let j=0;j<cols;j++){const col=GLASS[(i*2+j*3+(r()*2|0))%GLASS.length],k=.75+r()*.35;g.fillStyle=`rgb(${col[0]*k|0},${col[1]*k|0},${col[2]*k|0})`;g.fillRect(j*cw,i*rh,cw,rh);}
 /* medallions */
 for(const cy of [h*.3,h*.62]){g.fillStyle='rgb(150,30,52)';g.beginPath();g.arc(w/2,cy,w*.34,0,Math.PI*2);g.fill();g.fillStyle='rgb(196,150,70)';g.beginPath();g.arc(w/2,cy,w*.2,0,Math.PI*2);g.fill();
  g.strokeStyle='#08060a';g.lineWidth=w/30;g.beginPath();g.arc(w/2,cy,w*.34,0,Math.PI*2);g.stroke();g.beginPath();g.arc(w/2,cy,w*.2,0,Math.PI*2);g.stroke();}
 g.strokeStyle='#08060a';g.lineWidth=w/40;for(let i=1;i<rowsN;i++){g.beginPath();g.moveTo(0,i*rh);g.lineTo(w,i*rh);g.stroke();}for(let j=1;j<cols;j++){g.beginPath();g.moveTo(j*cw,0);g.lineTo(j*cw,h);g.stroke();}
 g.lineWidth=w/14;g.strokeRect(0,0,w,h);return c;}

/* ---- marble ---- */
export function marble(size,seed,{base=[16,18,22],vein=[86,92,104],veinK=7,warp=2.6}={}){const fbm=makeNoise(seed);
 const map=pixels(size,size,(u,v)=>{const w=fbm(u,v,3,5),w2=fbm(u+.31,v+.77,5,4);const s=Math.abs(Math.sin((u*veinK+v*2.3+w*warp)*Math.PI));
  const veinA=Math.pow(1-s,22)*.9+Math.pow(1-Math.abs(Math.sin((v*veinK*1.7+u*.9+w2*warp*1.4)*Math.PI)),48)*.45;const m=.86+w2*.28;
  return [base[0]*m+(vein[0]-base[0])*veinA,base[1]*m+(vein[1]-base[1])*veinA,base[2]*m+(vein[2]-base[2])*veinA];});
 const rough=pixels(size>>1,size>>1,(u,v)=>{const n=fbm(u*2,v*2,6,3);const g=26+n*30;return [g,g,g];});return {map,rough};}
/* polished basalt for the stele: near-black with fine grain and faint mottling; normal from fbm height */
export function basalt(size,seed){const fbm=makeNoise(seed),h=new Float32Array(size*size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)h[y*size+x]=fbm(x/size,y/size,8,5);
 const r=rng(seed+7),mot=makeNoise(seed+11);
 const map=pixels(size,size,(u,v,x,y)=>{const n=h[y*size+x],m=mot(u,v,2,3);const s=r()<.004?22:0;const g=10+n*8+m*7+s;return [g,g*1.0,g*1.06+.6];});
 const rough=pixels(size,size,(u,v,x,y)=>{const n=h[y*size+x];const g=26+n*30+(r()<.01?50:0);return [g,g,g];});
 return {map,normal:heightToNormal(h,size,size,6),rough};}
/* floor: pale polished marble in staggered slabs (8 m per texture tile), faint violet-grey veins, fine joints */
export function floorMarble(size,seed){const m=marble(size,seed,{base:[156,152,160],vein:[124,118,136],veinK:5,warp:3.2});const g=m.map.getContext('2d'),r=m.rough.getContext('2d');
 const rnd=rng(seed+5),rows=8,rh=size/rows,k=m.rough.width/size,slabs=[];
 for(let y=0;y<rows;y++){let x=-rnd()*rh*1.6;while(x<size){const w=rh*(1.1+rnd()*1.5);slabs.push([x,y*rh,w,rh]);x+=w;}}
 for(const [x,y,w,h] of slabs){const t=rnd();g.fillStyle=t<.5?'rgba(20,16,30,'+(t*.1)+')':'rgba(255,250,244,'+((t-.5)*.08)+')';g.fillRect(x,y,w,h);if(x<0)g.fillRect(x+size,y,w,h);}
 g.strokeStyle='rgba(54,48,62,.7)';g.lineWidth=Math.max(1.2,size/1100);r.strokeStyle='#c8c8c8';r.lineWidth=Math.max(1.2,size/1400);
 for(const [x,y,w,h] of slabs){g.strokeRect(x,y,w,h);if(x<0)g.strokeRect(x+size,y,w,h);r.strokeRect(x*k,y*k,w*k,h*k);if(x<0)r.strokeRect((x+size)*k,y*k,w*k,h*k);}
 return m;}
/* inlaid runner (opus sectile): porphyry roundels in guilloche, black-violet and cream bands, a thin gilt line; one unit per `unit` px of height */
export function inlay(w,unit,count,seed){const h=unit*count,c=canvas2d(w,h),g=c.getContext('2d'),fb=makeNoise(seed);
 const stone=(col,k=.12)=>{const gr=g.createLinearGradient(0,0,w,h);gr.addColorStop(0,`rgb(${col[0]},${col[1]},${col[2]})`);gr.addColorStop(1,`rgb(${col[0]*(1-k)|0},${col[1]*(1-k)|0},${col[2]*(1-k)|0})`);return gr;};
 g.fillStyle=stone([150,146,154]);g.fillRect(0,0,w,h);
 /* borders */
 g.fillStyle=stone([30,20,40]);g.fillRect(0,0,w*.09,h);g.fillRect(w*.91,0,w*.09,h);g.fillStyle='rgb(176,140,80)';g.fillRect(w*.09,0,w*.012,h);g.fillRect(w*.898,0,w*.012,h);
 for(let i=0;i<count;i++){const cy=(i+.5)*unit,cx=w/2,R=w*.3;
  /* guilloche bands linking the roundels */
  g.strokeStyle='rgb(30,20,40)';g.lineWidth=w*.03;g.beginPath();g.arc(cx,cy,R*1.18,0,Math.PI*2);g.stroke();
  g.fillStyle=stone([110,22,40],.2);g.beginPath();g.arc(cx,cy,R,0,Math.PI*2);g.fill();
  g.strokeStyle='rgb(196,150,82)';g.lineWidth=w*.01;g.beginPath();g.arc(cx,cy,R*1.03,0,Math.PI*2);g.stroke();
  g.fillStyle=stone([34,24,46]);g.beginPath();g.arc(cx,cy,R*.42,0,Math.PI*2);g.fill();g.fillStyle=stone([196,184,164]);g.beginPath();g.arc(cx,cy,R*.28,0,Math.PI*2);g.fill();
  /* between roundels: small lozenges */
  const ly=(i+1)*unit;if(i<count-1){g.fillStyle=stone([110,22,40]);g.beginPath();g.moveTo(cx,ly-unit*.14);g.lineTo(cx+w*.12,ly);g.lineTo(cx,ly+unit*.14);g.lineTo(cx-w*.12,ly);g.closePath();g.fill();
   g.strokeStyle='rgb(196,150,82)';g.lineWidth=w*.008;g.stroke();}}
 /* veining over everything, then polish */
 const img=g.getImageData(0,0,w,h),d=img.data;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=(y*w+x)*4,n=fb(x/w,y/h*count*.5,4,4),k=.9+n*.2;d[o]*=k;d[o+1]*=k;d[o+2]*=k;}g.putImageData(img,0,0);
 return c;}
export function glowSprite(size,inner='rgba(210,232,255,1)',mid='rgba(190,180,240,.45)'){const c=canvas2d(size,size),g=c.getContext('2d'),gr=g.createRadialGradient(size/2,size/2,0,size/2,size/2,size/2);
 gr.addColorStop(0,inner);gr.addColorStop(.25,mid);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,size,size);return c;}
