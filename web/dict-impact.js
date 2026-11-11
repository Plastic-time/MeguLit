// SPDX-License-Identifier: GPL-3.0-or-later
/* 2026-11-12 (user: no cracks; a 3D camera move and a spring impact, like a drawer kicked open — only when the search
   starts from the centre — slamming into the top bar and bouncing back to its place, different every time).
   When a search starts from the empty, centred dictionary, the box is kicked upward: the camera tilts and pulls back,
   the box flies up tilting in 3D, hits the top bar (the bar jolts, a line of light flares where it was struck, shards of
   kana burst out), rebounds and settles on a spring into its normal place at the top while the camera springs back.
   Mass, stiffness, damping, launch speed, bounce and the point of impact are random each time. Presentation only:
   the layout is the app's; this only animates the box from where it was to where the layout puts it. */
const calm=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const KANA='あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコサシスセソ';
try{localStorage.removeItem('megulit.dict.cracks.v1');}catch{}
const rand=(a,b)=>a+Math.random()*(b-a);
const f1=n=>n.toFixed(2);
let busy=false;

function scatterCloud(ix,iy){
 const cloud=document.querySelector('.dict-cloud');if(!cloud||getComputedStyle(cloud).opacity==='0')return;
 cloud.classList.add('is-burst');
 for(const g of cloud.querySelectorAll('i')){
  const b=g.getBoundingClientRect(),cx=b.left+b.width/2,cy=b.top+b.height/2;let dx=cx-ix,dy=cy-iy;const m=Math.hypot(dx,dy)||1;dx/=m;dy/=m;
  const far=rand(380,1000)+Math.max(0,600-m),spin=rand(-300,300),z=rand(-400,300),dur=rand(650,1300);
  g.animate([{transform:'translate3d(0,0,0) rotate(0) scale(1)',opacity:1},{transform:`translate3d(${f1(dx*far)}px,${f1(dy*far+rand(0,240))}px,${f1(z)}px) rotate(${f1(spin)}deg) scale(${f1(rand(.4,1.3))})`,opacity:0}],{duration:dur,delay:rand(0,120),easing:'cubic-bezier(.12,.75,.3,1)',fill:'forwards'});
 }
}
function shards(x,y,power){
 const words=[...document.querySelectorAll('.g-dict-chips button')].map(b=>b.textContent.replace(/\d+/g,'').trim()).filter(Boolean);
 const fx=document.createElement('div');fx.className='dict-shards';fx.setAttribute('aria-hidden','true');
 const n=Math.round(10+power*14);let html='';
 for(let i=0;i<n;i++){const t=Math.random()<.25&&words.length?words[Math.floor(Math.random()*words.length)]:KANA[Math.floor(Math.random()*KANA.length)];html+=`<i style="left:${x}px;top:${y}px;font-size:${Math.round(rand(11,30))}px">${t}</i>`;}
 fx.innerHTML=html+`<b style="left:${x}px;top:${y}px"></b>`;document.body.append(fx);
 for(const g of fx.querySelectorAll('i')){
  const a=rand(.05,.95)*Math.PI,v=rand(140,460)*(.6+power*.6),tx=Math.cos(a)*v*(Math.random()<.5?-1:1),ty=Math.sin(a)*v*.5,spin=rand(-540,540);
  g.animate([{transform:'translate(-50%,-50%) scale(.3)',opacity:0},{transform:`translate(calc(-50% + ${f1(tx*.3)}px),calc(-50% + ${f1(ty*.3)}px)) rotate(${f1(spin*.3)}deg) scale(1)`,opacity:1,offset:.15},{transform:`translate(calc(-50% + ${f1(tx)}px),calc(-50% + ${f1(ty+rand(160,280))}px)) rotate(${f1(spin)}deg) scale(.6)`,opacity:0}],{duration:rand(700,1400),easing:'cubic-bezier(.1,.7,.35,1)',fill:'forwards'});
 }
 fx.querySelector('b').animate([{transform:'translate(-50%,-50%) scale(.2)',opacity:.9},{transform:`translate(-50%,-50%) scale(${f1(2.2+power*2)})`,opacity:0}],{duration:520,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
 setTimeout(()=>fx.remove(),1600);
}
function barHit(bar,x,power){
 if(!bar)return;const r=bar.getBoundingClientRect();
 const glow=document.createElement('i');glow.className='dict-bar-hit';glow.setAttribute('aria-hidden','true');glow.style.cssText=`left:${x}px;top:${r.bottom-1}px`;document.body.append(glow);
 glow.animate([{transform:'translateX(-50%) scaleX(.1)',opacity:1},{transform:`translateX(-50%) scaleX(${f1(1+power*1.5)})`,opacity:0}],{duration:700,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});setTimeout(()=>glow.remove(),760);
 const k=power*7,side=(x-r.left)/r.width-.5;
 bar.animate([{transform:'none'},{transform:`translateY(${f1(-k)}px) rotate(${f1(side*k*.12)}deg)`},{transform:`translateY(${f1(k*.45)}px) rotate(${f1(-side*k*.06)}deg)`},{transform:`translateY(${f1(-k*.15)}px)`},{transform:'none'}],{duration:460,easing:'cubic-bezier(.3,.7,.2,1)'});
}

function launch(form){
 const host=form.closest('#learning-content'),bar=document.querySelector('header.titlebar');if(!host)return;
 const start=form.getBoundingClientRect();
 host.classList.add('dict-launch');
 const end=form.getBoundingClientRect(),delta=start.top-end.top;
 if(delta<40){host.classList.remove('dict-launch');return;}
 busy=true;
 const gap=Math.max(6,end.top-(bar?bar.getBoundingClientRect().bottom:0)-2);
 /* the random temperament of this kick */
 const m=rand(.8,1.4),k=rand(110,190),c=rand(7,13),e=rand(.35,.6),hitX=rand(.12,.88),side=hitX<.5?-1:1;
 let y=delta,v=-rand(1500,2200)/Math.sqrt(m),rz=rand(-1.5,1.5),vz=rand(-20,20),hit=false;
 /* the camera: tilt, side swing and dolly, each on its own spring */
 const cam={rx:0,vrx:rand(55,90),ry:0,vry:rand(-30,30),s:1,vs:-rand(.5,.8)},CK=170,CC=16;
 scatterCloud(end.left+end.width*hitX,start.top);
 form.style.transformOrigin=`${f1(hitX*100)}% 0%`;host.style.transformOrigin='50% 30%';
 let prev=performance.now(),quiet=0;
 const frame=now=>{
  const dt=Math.min(.05,(now-prev)/1000);prev=now;
  for(let s=0;s<6;s++){const h=dt/6;
   const a=(-k*y-c*v)/m;v+=a*h;y+=v*h;
   if(y<-gap){y=-gap;const speed=Math.abs(v);v=speed*e;
    if(!hit){hit=true;const power=Math.min(1.4,speed/2400),ix=end.left+end.width*hitX;
     vz+=side*speed*rand(.012,.02);
     cam.vrx-=rand(70,120)*power;cam.vry+=side*rand(40,80)*power;cam.vs+=rand(.6,1)*power;
     barHit(bar,ix,power);shards(ix,end.top-gap+2,power);}}
   const az=(-260*rz-14*vz);vz+=az*h;rz+=vz*h;
   for(const [p,vp,target] of [['rx','vrx',0],['ry','vry',0],['s','vs',1]]){const ac=-CK*(cam[p]-target)-CC*cam[vp];cam[vp]+=ac*h;cam[p]+=cam[vp]*h;}
  }
  const pitch=Math.max(-28,Math.min(28,v*.008));
  form.style.transform=`translate3d(0,${f1(y)}px,${f1(Math.min(0,v)*-.02)}px) rotateX(${f1(pitch)}deg) rotateZ(${f1(rz)}deg)`;
  host.style.transform=`perspective(1400px) rotateX(${f1(cam.rx)}deg) rotateY(${f1(cam.ry)}deg) scale(${cam.s.toFixed(4)})`;
  const still=Math.abs(y)<.4&&Math.abs(v)<6&&Math.abs(rz)<.05&&Math.abs(cam.rx)<.05&&Math.abs(cam.ry)<.05&&Math.abs(cam.s-1)<.001;
  quiet=still?quiet+1:0;
  if(quiet>4||!form.isConnected){form.style.transform='';form.style.transformOrigin='';host.style.transform='';host.style.transformOrigin='';busy=false;
   const done=()=>{const r=document.querySelector('#lookup-results');if(!r||r.children.length||r.textContent.trim()||!host.isConnected)host.classList.remove('dict-launch');else setTimeout(done,200);};done();return;}
  requestAnimationFrame(frame);
 };
 form.style.transform=`translate3d(0,${f1(y)}px,0)`;
 requestAnimationFrame(frame);
}
document.addEventListener('submit',e=>{
 const form=e.target;if(calm||busy||form?.id!=='lookup-form')return;
 const results=document.querySelector('#lookup-results');
 /* only from the empty, centred state */
 if(!results||results.children.length||results.textContent.trim())return;
 launch(form);
},true);
