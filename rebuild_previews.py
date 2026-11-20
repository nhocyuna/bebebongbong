"""Rebuild public, deliberately soft previews from encrypted originals."""
from pathlib import Path
from io import BytesIO
from PIL import Image, ImageFilter, ImageOps
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import json

ROOT=Path(__file__).resolve().parent
DATA=Path(r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all')
catalog=json.loads((ROOT/'secure-catalog.json').read_text(encoding='utf-8'))
aes=AESGCM((ROOT/'vault-key.bin').read_bytes())
count=0
for item in catalog:
    if item['kind']=='video': continue
    payload=(DATA/'_sealed'/(item['id']+'.enc')).read_bytes()
    raw=aes.decrypt(payload[:12],payload[12:],item['id'].encode())
    with Image.open(BytesIO(raw)) as source:
        image=ImageOps.fit(source.convert('RGB'),(240,320),method=Image.Resampling.LANCZOS)
    image=image.resize((48,64),Image.Resampling.BILINEAR).resize((240,320),Image.Resampling.BICUBIC)
    image=image.filter(ImageFilter.GaussianBlur(4))
    image.save(ROOT/'previews'/item['preview'],'WEBP',quality=76)
    count+=1
print(f'Rebuilt {count} softly blurred previews')
