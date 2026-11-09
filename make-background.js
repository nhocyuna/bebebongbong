const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');

const root=__dirname,source=path.join(root,'originals-backup'),data=path.join(root,'Data');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const key=Buffer.from(html.match(/imageKey='([^']+)'/)[1],'base64');
const hasOriginals=fs.existsSync(source);
const files=hasOriginals
  ?fs.readdirSync(source).filter(name=>/\.(jpe?g|png|webp)$/i.test(name))
  :fs.readdirSync(data).filter(name=>/^image-\d+\.enc\.js$/i.test(name));
function readPhoto(name){
  if(hasOriginals)return fs.readFileSync(path.join(source,name));
  const script=fs.readFileSync(path.join(data,name),'utf8');
  const encoded=JSON.parse(script.match(/=("[^"]+");?\s*$/)[1]);
  const payload=Buffer.from(encoded,'base64');
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,payload.subarray(0,12));
  decipher.setAuthTag(payload.subarray(12,28));
  return Buffer.concat([decipher.update(payload.subarray(28)),decipher.final()]);
}
const W=1600,H=1000;
let seed=4197;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}

(async()=>{
  const speckles=Array.from({length:450},()=>`<circle cx="${Math.floor(random()*W)}" cy="${Math.floor(random()*H)}" r="${(random()*1.4+.2).toFixed(1)}" fill="#7e664b" opacity="${(random()*.09).toFixed(3)}"/>`).join('');
  const fibers=Array.from({length:40},()=>{const x=Math.floor(random()*W),y=Math.floor(random()*H);return `<path d="M${x} ${y}l${Math.floor(random()*35+8)} ${Math.floor(random()*8-4)}" stroke="#8e7859" stroke-width=".6" opacity=".08"/>`}).join('');
  const base=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="paper"><stop stop-color="#f5eddd"/><stop offset=".72" stop-color="#e7dbc6"/><stop offset="1" stop-color="#d6c3a7"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#paper)"/>${speckles}${fibers}</svg>`);
  const layers=[];
  for(let n=0;n<30;n++){
    const f=files[Math.floor(random()*files.length)];
    const portrait=random()<.5;
    const w=portrait?230+Math.floor(random()*100):330+Math.floor(random()*140);
    const h=portrait?340+Math.floor(random()*150):220+Math.floor(random()*100);
    const angle=(n%2?-1:1)*(7+random()*23);
    const photo=await sharp(readPhoto(f)).rotate().resize(w,h,{fit:'cover',position:'centre'}).modulate({saturation:.5,brightness:.96}).webp({quality:75}).toBuffer();
    const card=await sharp({create:{width:w+16,height:h+28,channels:4,background:'#efe6d5'}})
      .composite([{input:photo,left:8,top:8}]).rotate(angle,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    const meta=await sharp(card).metadata();
    const left=n<20?Math.round((n%5)*310-90+(random()-.5)*180):Math.round(random()*(W+180)-180);
    const top=n<20?Math.round(Math.floor(n/5)*230-90+(random()-.5)*140):Math.round(random()*(H+180)-180);
    layers.push({input:card,left,top,width:meta.width,height:meta.height});
  }
  const placed=[];
  for(const layer of layers){
    const left=Math.max(0,layer.left),top=Math.max(0,layer.top);
    const width=Math.min(W,layer.left+layer.width)-left;
    const height=Math.min(H,layer.top+layer.height)-top;
    if(width<=0||height<=0)continue;
    const input=await sharp(layer.input).extract({left:left-layer.left,top:top-layer.top,width,height}).png().toBuffer();
    placed.push({input,left,top});
  }
  const assembled=await sharp(base).composite(placed).png().toBuffer();
  const patina=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="wash"><stop stop-color="#fff9eb" stop-opacity=".58"/><stop offset=".72" stop-color="#e4d4bb" stop-opacity=".43"/><stop offset="1" stop-color="#937454" stop-opacity=".18"/></radialGradient></defs><rect width="100%" height="100%" fill="url(#wash)"/></svg>`);
  const collage=await sharp(assembled).blur(1.4).composite([{input:patina,left:0,top:0}]).webp({quality:72,effort:5}).toBuffer();
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(collage),cipher.final()]);
  const payload=Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  fs.writeFileSync(path.join(data,'background.enc.js'),`window.memoryBackgroundCipher=${JSON.stringify(payload.toString('base64'))};\n`);
  console.log(`Nền collage: ${(collage.length/1024).toFixed(0)} KB trước mã hóa.`);
})().catch(e=>{console.error(e);process.exitCode=1});

