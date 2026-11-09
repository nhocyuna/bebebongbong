const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sharp=require('sharp');
const root=__dirname,data=path.join(root,'Data'),backup=path.join(root,'originals-backup'),htmlFile=path.join(root,'index.html');
let html=fs.readFileSync(htmlFile,'utf8');
const keyMatch=html.match(/imageKey='([^']+)'/);
const namesMatch=html.match(/const names=(\[[^;]+?\]),encryptedAssets=/);
const assetsMatch=html.match(/encryptedAssets=(\[[^;]+?\]),imageKey=/);
if(!keyMatch||!namesMatch||!assetsMatch)throw new Error('Không tìm thấy cấu hình mã hóa trong index.html');
const key=Buffer.from(keyMatch[1],'base64'),names=JSON.parse(namesMatch[1]),assets=JSON.parse(assetsMatch[1]);
fs.mkdirSync(backup,{recursive:true});
const newFiles=fs.readdirSync(data).filter(name=>/\.(jpe?g|png|webp)$/i.test(name));
async function main(){for(const name of newFiles){
  const source=path.join(data,name),plain=fs.readFileSync(source),iv=crypto.randomBytes(12);
  const optimized=await sharp(plain,{failOn:'none'}).rotate().resize({width:960,height:960,fit:'inside',withoutEnlargement:true}).webp({quality:80,effort:5}).toBuffer();
  const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(optimized),cipher.final()]);
  const payload=Buffer.concat([iv,cipher.getAuthTag(),ciphertext]);
  const index=names.length,asset=`image-${String(index+1).padStart(3,'0')}.enc.js`;
  fs.writeFileSync(path.join(data,asset),`window.memoryEncryptedImages=window.memoryEncryptedImages||{};window.memoryEncryptedImages[${index}]=${JSON.stringify(payload.toString('base64'))};\n`);
  fs.copyFileSync(source,path.join(backup,name));
  names.push(name);assets.push(asset);fs.unlinkSync(source);
  console.log('Đã mã hóa:',name);
}
html=html.replace(/const names=\[[^;]+?\],encryptedAssets=\[[^;]+?\],imageKey=/,
  `const names=${JSON.stringify(names)},encryptedAssets=${JSON.stringify(assets)},imageKey=`);
html=html.replace("new Blob([plain],{type:'image/jpeg'})","new Blob([plain],{type:/\\.png$/i.test(names[i])?'image/png':/\\.webp$/i.test(names[i])?'image/webp':'image/jpeg'})");
fs.writeFileSync(htmlFile,html);
console.log(`Tổng: ${names.length} ảnh mã hóa.`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
