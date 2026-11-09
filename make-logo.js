const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const source = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Playfair;src:url('assets/playfair-regular.woff2') format('woff2');font-weight:200 800}
*{box-sizing:border-box}html,body{margin:0;background:transparent}
.logo{position:relative;display:inline-flex;align-items:baseline;padding:12px 22px 27px 12px;white-space:nowrap}
.word{font:530 87px/1 Playfair,Georgia,serif;letter-spacing:-5px;color:#253255;text-shadow:0 2px 4px rgba(52,61,105,.12)}
.plus{position:relative;top:-.3em;margin-left:3px;font:450 57px/1 Playfair,Georgia,serif;letter-spacing:0;background:linear-gradient(135deg,#f382a8,#b25bd1 65%,#756ce6);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 5px rgba(183,91,190,.35))}
.stroke{display:none}
</style></head><body><div class="logo"><span class="word">Memory</span><span class="plus">+</span><i class="stroke"></i></div></body></html>`;

(async()=>{
  const root=__dirname, temp=path.join(root,'logo-source.html');
  fs.writeFileSync(temp,source);
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  const page=await browser.newPage({viewport:{width:800,height:220},deviceScaleFactor:3});
  await page.goto('file:///'+temp.replace(/\\/g,'/'));
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.logo').screenshot({path:path.join(root,'assets','memory-logo.png'),omitBackground:true});
  await browser.close();
  fs.unlinkSync(temp);
  console.log('Đã tạo assets/memory-logo.png');
})().catch(e=>{console.error(e);process.exitCode=1});

