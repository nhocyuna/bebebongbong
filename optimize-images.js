const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const sharp = require('sharp');

const root = __dirname;
const data = path.join(root, 'Data');
const originals = path.join(root, 'originals-backup');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const names = JSON.parse(html.match(/const names=(\[[^;]+?\]),encryptedAssets=/)[1]);
const assets = JSON.parse(html.match(/encryptedAssets=(\[[^;]+?\]),imageKey=/)[1]);
const key = Buffer.from(html.match(/imageKey='([^']+)'/)[1], 'base64');

(async () => {
  let before = 0, after = 0;
  for (let i = 0; i < names.length; i++) {
    const original = fs.readFileSync(path.join(originals, names[i]));
    before += original.length;
    const optimized = await sharp(original, { failOn: 'none' })
      .rotate().resize({ width: 960, height: 960, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 }).toBuffer();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(optimized), cipher.final()]);
    const payload = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    fs.writeFileSync(path.join(data, assets[i]),
      `window.memoryEncryptedImages=window.memoryEncryptedImages||{};window.memoryEncryptedImages[${i}]=${JSON.stringify(payload.toString('base64'))};\n`);
    after += payload.length;
  }
  console.log(`Đã tối ưu ${names.length} ảnh: ${(before/1048576).toFixed(1)} MB → ${(after/1048576).toFixed(1)} MB trước Base64.`);
})().catch(error => { console.error(error); process.exitCode = 1 });
