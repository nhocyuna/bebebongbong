const c=document.getElementById('scene'),ctx=c.getContext('2d');
const images=[],cards=[];
let W=innerWidth,H=innerHeight,D=1,nextPulse=0,nextMove=0,lastFrame=0;
const rand=(a,b)=>a+Math.random()*(b-a);
const choose=a=>a[Math.floor(Math.random()*a.length)];
const effectNames=['glow','spark','mist','prism','shimmer','rain'];

function makeSoft(im){
  const max=innerWidth<600?240:360;
  const scale=Math.min(max/im.width,max/im.height);
  const out=document.createElement('canvas');out.width=Math.max(1,Math.round(im.width*scale));out.height=Math.max(1,Math.round(im.height*scale));
  const g=out.getContext('2d');
  g.filter='blur(4px) sepia(.38) saturate(.75)';g.drawImage(im,0,0,out.width,out.height);g.filter='none';
  g.fillStyle='rgba(218,191,143,.13)';g.fillRect(0,0,out.width,out.height);
  for(let i=0;i<10;i++){
    const x=Math.random()*out.width,y=Math.random()*out.height,r=Math.min(out.width,out.height)*rand(.08,.27);
    const stain=g.createRadialGradient(x,y,0,x,y,r);
    stain.addColorStop(0,'rgba(126,92,53,.16)');stain.addColorStop(1,'rgba(126,92,53,0)');
    g.fillStyle=stain;g.beginPath();g.ellipse(x,y,r,r*rand(.5,1.4),rand(-.6,.6),0,Math.PI*2);g.fill();
  }
  for(let i=0;i<80;i++){g.fillStyle=`rgba(83,67,47,${rand(.015,.055)})`;g.fillRect(Math.random()*out.width,Math.random()*out.height,rand(.5,1.6),rand(.5,1.6))}
  return out;
}
function sizeFor(im){
  const maxW=W<600?Math.min(175,W*.48):Math.min(295,W*.24);
  const maxH=H<650?Math.min(165,H*.32):W<600?215:245;
  const scale=Math.min(maxW/im.width,maxH/im.height);
  return {w:im.width*scale,h:im.height*scale};
}
function targetFor(w,h){const margin=18;return{x:rand(w/2+margin,Math.max(w/2+margin+1,W-w/2-margin)),y:rand(h/2+margin,Math.max(h/2+margin+1,H-h/2-margin))}}
function newCard(im){
  const {w,h}=sizeFor(im),p=targetFor(w,h);
  return {im,w,h,x:p.x,y:p.y,tx:p.x,ty:p.y,a:rand(-.4,.4),ta:rand(-.4,.4),phase:rand(0,9),dx:rand(4,19),dy:rand(3,13),focusStart:0,focusEnd:0,clickEnd:0,effect:choose(effectNames),hue:rand(0,360),drawX:p.x,drawY:p.y,drawScale:1};
}
function arrange(){
  if(!images.length)return;
  cards.length=0;
  const shuffled=[...images].sort(()=>Math.random()-.5);
  // Render every loaded image exactly once. Movement only changes positions;
  // it never swaps the image content on a card.
  for(const image of shuffled)cards.push(newCard(image));
}
function resize(){
  W=innerWidth;H=innerHeight;D=Math.min(devicePixelRatio||1,W<600?1:1.5);
  c.width=Math.round(W*D);c.height=Math.round(H*D);ctx.setTransform(D,0,0,D,0,0);
  arrange();
}
function glowEffect(card,w,h,strength,now){
  if(strength<.08)return;
  ctx.save();ctx.globalAlpha=strength*.55;
  if(card.effect==='spark'||card.effect==='shimmer'){
    ctx.fillStyle='#fff';for(let k=0;k<8;k++){const px=Math.sin(now*.004+k*11+card.phase)*w*.48,py=Math.cos(now*.003+k*7+card.phase)*h*.48;ctx.beginPath();ctx.arc(px,py,1.2+(k%3),0,Math.PI*2);ctx.fill()}
  }else if(card.effect==='rain'){
    ctx.strokeStyle='#c8ecff';ctx.lineWidth=1;for(let k=0;k<6;k++){const px=-w/2+(k+.4)*w/6;ctx.beginPath();ctx.moveTo(px,-h/2);ctx.lineTo(px-8,h/2);ctx.stroke()}
  }else if(card.effect==='mist'){
    const g=ctx.createRadialGradient(0,0,4,0,0,Math.max(w,h)*.7);g.addColorStop(0,'rgba(255,255,255,.2)');g.addColorStop(1,'rgba(190,220,255,.52)');ctx.fillStyle=g;ctx.fillRect(-w/2,-h/2,w,h);
  }else if(card.effect==='prism'){
    ctx.fillStyle='hsla('+((card.hue+now/40)%360)+',90%,70%,.22)';ctx.fillRect(-w/2,-h/2,w,h);
  }
  ctx.restore();
}
function drawFold(card,now){
  const fold=9+7*(.5+.5*Math.sin(now*.002+card.phase));
  const x=card.w/2,y=card.h/2;
  ctx.save();
  ctx.shadowColor='rgba(26,34,67,.22)';ctx.shadowBlur=5;
  ctx.fillStyle='rgba(230,218,196,.88)';
  ctx.beginPath();ctx.moveTo(x-fold,y);ctx.lineTo(x,y-fold);ctx.lineTo(x-fold,y-fold);ctx.closePath();ctx.fill();
  ctx.shadowBlur=0;ctx.strokeStyle='rgba(125,130,166,.28)';ctx.lineWidth=1;ctx.stroke();
  ctx.restore();
}
function drawCard(card,now){
  const ease=.024;
  card.x+=(card.tx-card.x)*ease;card.y+=(card.ty-card.y)*ease;card.a+=(card.ta-card.a)*.018;
  const gust=Math.sin(now*.00035+card.phase*.2);
  const movingX=Math.sin(now*.00024+card.phase)*card.dx+gust*(9+card.dx*.7);
  const movingY=Math.cos(now*.00019+card.phase)*card.dy;
  const x=card.x+movingX,y=card.y+movingY;
  const active=now<card.focusEnd;
  const progress=active?(now-card.focusStart)/(card.focusEnd-card.focusStart):0;
  const clarity=active?Math.pow(Math.sin(Math.PI*Math.min(1,Math.max(0,progress))),.65):0;
  const clicked=now<card.clickEnd;
  // A selected photo should take its time becoming clear, then fade back out
  // immediately after reaching full clarity. Keep both phases smooth so the
  // change does not feel like a sudden flash.
  const clickProgress=clicked?1-(card.clickEnd-now)/5200:0;
  const clickClarity=clicked
    ? clickProgress<.56
      ? (clickProgress/.56)*(clickProgress/.56)*(3-2*(clickProgress/.56))
      : (()=>{const t=Math.min(1,Math.max(0,(clickProgress-.56)/.44));return 1-(t*t*(3-2*t));})()
    : 0;
  const clickZoom=clicked
    ? (()=>{
        const p=Math.max(0,Math.min(1,clickProgress));
        const wave=Math.sin(Math.PI*p);
        // Scale the selected card until it covers the viewport, regardless
        // of the card's original aspect ratio, then return it smoothly.
        const coverScale=Math.max(1.05,W/card.w,H/card.h)*1.08;
        return 1+(coverScale-1)*wave*wave;
      })()
    : 1;
  const scale=(1+clarity*.13)*clickZoom;
  const angle=card.a+Math.sin(now*.00028+card.phase)*.055+gust*.045;
  card.drawX=x;card.drawY=y;card.drawScale=scale;
  ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);
  ctx.shadowColor=clicked?'rgba(108,70,118,.28)':'rgba(39,36,33,.22)';ctx.shadowBlur=(W<600?6:14)+clarity*12;ctx.shadowOffsetY=(W<600?3:7)+clarity*6;
  ctx.fillStyle='#d9ccb4';ctx.fillRect(-card.w/2-2,-card.h/2-2,card.w+4,card.h+4);
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  const source=card.im.soft||card.im;
  ctx.globalAlpha=.94;ctx.drawImage(source,-card.w/2,-card.h/2,card.w,card.h);
  const clearAmount=clicked?clickClarity:clarity;
  if(clearAmount>.01){ctx.globalAlpha=clearAmount;ctx.drawImage(card.im,-card.w/2,-card.h/2,card.w,card.h)}
  if(clicked){ctx.globalAlpha=.18*(1-clickClarity);ctx.fillStyle='hsl('+((card.hue+now/22)%360)+' 80% 65%)';ctx.fillRect(-card.w/2,-card.h/2,card.w,card.h)}
  ctx.globalAlpha=1;
  ctx.strokeStyle=active?'rgba(245,224,182,.8)':'rgba(76,65,49,.2)';ctx.lineWidth=1;ctx.strokeRect(-card.w/2-2,-card.h/2-2,card.w+4,card.h+4);
  drawFold(card,now);
  glowEffect(card,card.w,card.h,clicked?.7:clarity,now);
  ctx.restore();
}
function pulse(now){
  if(!cards.length)return;
  for(let k=0;k<(W<600?1:2+Math.floor(Math.random()*2));k++){
    const card=choose(cards);card.focusStart=now;card.focusEnd=now+rand(1400,2300);card.effect=choose(effectNames);card.hue=rand(0,360);
    const index=cards.indexOf(card);cards.splice(index,1);cards.push(card);
  }
}
function move(now){
  if(cards.length<2)return;
  const first=choose(cards),second=choose(cards.filter(card=>card!==first));
  const x=first.tx,y=first.ty;first.tx=second.tx;first.ty=second.ty;second.tx=x;second.ty=y;
  for(const card of [first,second]){
    card.ta=rand(-.52,.52);
    const i=cards.indexOf(card);cards.splice(i,1);
    if(card===first)cards.push(card);else cards.unshift(card);
  }
}
function frame(now){
  requestAnimationFrame(frame);
  if(now-lastFrame<(W<600?50:33))return;
  lastFrame=now;ctx.clearRect(0,0,W,H);
  if(now>nextPulse){pulse(now);nextPulse=now+rand(650,1150)}
  if(now>nextMove){move(now);nextMove=now+rand(1500,2600)}
  // Keep the selected photo above every other card for the whole effect.
  const orderedCards=[...cards].sort((a,b)=>(now<a.clickEnd?1:0)-(now<b.clickEnd?1:0));
  for(const card of orderedCards)drawCard(card,now);
}
async function decodePayload(base64,key){
  const bytes=Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
  const body=bytes.slice(28),combined=new Uint8Array(body.length+16);
  combined.set(body);combined.set(bytes.slice(12,28),body.length);
  return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},key,combined);
}
async function loadAssets(){
  const key=await crypto.subtle.importKey('raw',Uint8Array.from(atob(imageKey),ch=>ch.charCodeAt(0)),'AES-GCM',false,['decrypt']);
  try{
    const plain=await decodePayload(window.memoryBackgroundCipher,key);
    const url=URL.createObjectURL(new Blob([plain],{type:'image/webp'}));
    c.style.background=`url("${url}") center / cover no-repeat`;
  }catch(e){console.warn('Không tải được nền ảnh',e)}
  let next=0,loaded=0,replaceIndex=0;
  async function worker(){while(next<encryptedAssets.length){const i=next++;
    try{
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='Data/'+encryptedAssets[i];script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
      const plain=await decodePayload(window.memoryEncryptedImages[i],key);delete window.memoryEncryptedImages[i];
      const url=URL.createObjectURL(new Blob([plain],{type:'image/webp'}));const im=new Image();
      await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=url});URL.revokeObjectURL(url);
      im.soft=makeSoft(im);images.push(im);loaded++;
      if(loaded===5)arrange();else if(loaded>5&&cards.length){const card=cards[replaceIndex++%cards.length];card.im=im;const size=sizeFor(im);card.w=size.w;card.h=size.h}
    }catch(e){console.warn('Ảnh lỗi',i,e)}
  }}
  await Promise.all(Array.from({length:Math.min(8,encryptedAssets.length)},worker));
  // Rebuild once more after all files are loaded so the final gallery contains
  // every Data image exactly once, including images loaded after the first five.
  if(images.length)arrange();
}

c.addEventListener('click',event=>{
  const x=event.clientX,y=event.clientY;
  for(let i=cards.length-1;i>=0;i--){const card=cards[i];if(Math.abs(x-card.drawX)<card.w*card.drawScale/2+8&&Math.abs(y-card.drawY)<card.h*card.drawScale/2+8){
    card.clickEnd=performance.now()+5200;card.focusEnd=0;card.effect=choose(effectNames);cards.splice(i,1);cards.push(card);break;
  }}
});
document.addEventListener('contextmenu',event=>event.preventDefault());
document.addEventListener('dragstart',event=>event.preventDefault());
addEventListener('resize',resize);resize();requestAnimationFrame(frame);loadAssets();
