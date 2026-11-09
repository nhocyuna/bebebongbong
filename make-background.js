const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');

const root=__dirname,source=path.join(root,'originals-backup'),data=path.join(root,'Data');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const key=Buffer.from(html.match(/imageKey='([^']+)'/)[1],'base64');
const files=fs.readdirSync(source).filter(name=>/\.(jpe?g|png|webp)$/i.test(name));
const W=1600,H=1000;
let seed=4197;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}

(async()=>{
  const base=Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#f6f4f6"/><stop offset="1" stop-color="#e9edf5"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const layers=[];
  for(let n=0;n<55;n++){
    const f=files[Math.floor(random()*files.length)];
    const portrait=random()<.5;
    const w=portrait?230+Math.floor(random()*140):340+Math.floor(random()*180);
    const h=portrait?360+Math.floor(random()*190):230+Math.floor(random()*140);
    const angle=(n%2?-1:1)*(8+random()*26);
    const photo=await sharp(path.join(source,f)).rotate().resize(w,h,{fit:'cover',position:'centre'}).webp({quality:78}).toBuffer();
    const card=await sharp({create:{width:w+20,height:h+20,channels:4,background:'#fff'}})
      .composite([{input:photo,left:10,top:10}]).rotate(angle,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer();
    const meta=await sharp(card).metadata();
    const left=Math.round(random()*(W+160)-180),top=Math.round(random()*(H+160)-180);
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
  let collage=await sharp(assembled).blur(2.2).composite([{input:Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#ffffff" fill-opacity=".54"/></svg>`),left:0,top:0}]).webp({quality:74,effort:5}).toBuffer();
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const encrypted=Buffer.concat([cipher.update(collage),cipher.final()]);
  const payload=Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
  fs.writeFileSync(path.join(data,'background.enc.js'),`window.memoryBackgroundCipher=${JSON.stringify(payload.toString('base64'))};\n`);
  console.log(`Nền collage: ${(collage.length/1024).toFixed(0)} KB trước mã hóa.`);
})().catch(e=>{console.error(e);process.exitCode=1});

