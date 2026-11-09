const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const dataDir = path.join(root, 'Data');
const backupDir = path.join(root, 'originals-backup');
const htmlPath = path.join(root, 'index.html');
const files = fs.readdirSync(dataDir).filter(name => /\.(jpe?g|png|webp)$/i.test(name)).sort();
if (!files.length) throw new Error('Không tìm thấy ảnh gốc trong Data.');
fs.mkdirSync(backupDir, { recursive: true });
const key = crypto.randomBytes(32);
const records = [];

for (const [index, name] of files.entries()) {
  const source = path.join(dataDir, name);
  const original = fs.readFileSync(source);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(original), cipher.final()]);
  const payload = Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  const asset = `image-${String(index + 1).padStart(3, '0')}.enc.js`;
  fs.writeFileSync(path.join(dataDir, asset),
    `window.memoryEncryptedImages=window.memoryEncryptedImages||{};window.memoryEncryptedImages[${index}]=${JSON.stringify(payload.toString('base64'))};\n`);
  fs.writeFileSync(path.join(backupDir, name), original);
  records.push({ name, asset, index, digest: crypto.createHash('sha256').update(original).digest('hex') });
}

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/const names=\[[^;]+;/,
  `const names=${JSON.stringify(records.map(r => r.name))},encryptedAssets=${JSON.stringify(records.map(r => r.asset))},imageKey='${key.toString('base64')}',c=document.getElementById('c'),ctx=c.getContext('2d'),bg=new Image();`);
html = html.replace(/let loaded=0;names\.forEach\(n=>\{.*?\}\);function resize\(/s,
  `async function loadEncryptedImages(){
    const raw=Uint8Array.from(atob(imageKey),ch=>ch.charCodeAt(0));
    const cryptoKey=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
    let loaded=0;
    for(let i=0;i<encryptedAssets.length;i++){
      try{
        await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='Data/'+encryptedAssets[i];script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
        const bytes=Uint8Array.from(atob(window.memoryEncryptedImages[i]),ch=>ch.charCodeAt(0));
        delete window.memoryEncryptedImages[i];
        const iv=bytes.slice(0,12),tag=bytes.slice(12,28),body=bytes.slice(28);
        const combined=new Uint8Array(body.length+tag.length);combined.set(body);combined.set(tag,body.length);
        const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv},cryptoKey,combined);
        const url=URL.createObjectURL(new Blob([plain],{type:'image/jpeg'}));
        const im=new Image();
        await new Promise((resolve,reject)=>{im.onload=resolve;im.onerror=reject;im.src=url});
        URL.revokeObjectURL(url);imgs.push(im);loaded++;
      }catch(error){console.error('Không tải được ảnh',i,error)}
    }
    if(loaded)setup();
  }
  loadEncryptedImages();function resize(`);
if (!html.includes('loadEncryptedImages();function resize(')) throw new Error('Không tìm thấy đoạn tải ảnh trong index.html');
fs.writeFileSync(htmlPath, html);
for (const { name } of records) fs.unlinkSync(path.join(dataDir, name));
console.log(`Đã mã hóa ${records.length} ảnh. Bản gốc ở originals-backup; chỉ tải index.html và Data lên host.`);
