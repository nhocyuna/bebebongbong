"""Seal all game media. Run once; --remove-plaintext removes source only after verification."""
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image, ImageFilter, ImageOps, ImageDraw
import hashlib, json, os, secrets, sys
import stat

ROOT = Path(__file__).resolve().parent
DATA = Path(r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all')
VAULT = DATA / '_sealed'
PREVIEWS = ROOT / 'previews'
KEY_FILE = ROOT / 'vault-key.bin'
CATALOG = ROOT / 'secure-catalog.json'
VAULT.mkdir(exist_ok=True)
PREVIEWS.mkdir(exist_ok=True)
if not KEY_FILE.exists(): KEY_FILE.write_bytes(AESGCM.generate_key(bit_length=256))
key = KEY_FILE.read_bytes()
if len(key) != 32: raise RuntimeError('Invalid vault key')
aes = AESGCM(key)
old = {x['source']: x for x in json.loads(CATALOG.read_text(encoding='utf-8'))} if CATALOG.exists() else {}
items = []
sources = sorted(p for group in ('5','10','20','50','70','Hh') for p in (DATA/group).rglob('*')
                 if p.is_file() and p.suffix.lower() in {'.jpg','.jpeg','.png','.webp','.mp4'})
for path in sources:
    rel = str(path.relative_to(DATA)).replace('\\','/')
    ident = 's' + hashlib.sha256(rel.encode('utf-8')).hexdigest()[:16]
    sealed = VAULT / (ident + '.enc')
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if not sealed.exists() or old.get(rel, {}).get('sha256') != digest:
        nonce = os.urandom(12)
        sealed.write_bytes(nonce + aes.encrypt(nonce, raw, ident.encode()))
    payload = sealed.read_bytes()
    if hashlib.sha256(aes.decrypt(payload[:12], payload[12:], ident.encode())).hexdigest() != digest:
        raise RuntimeError(f'Verification failed: {rel}')
    preview = PREVIEWS / (ident + '.webp')
    is_video = path.suffix.lower() == '.mp4'
    if not preview.exists():
        if is_video:
            im = Image.new('RGB', (240, 320), '#a9adb0')
            draw = ImageDraw.Draw(im)
            draw.ellipse((70,110,170,210), fill='#737d83')
            draw.polygon([(112,135),(112,185),(153,160)], fill='#d7dde0')
        else:
            with Image.open(path) as source:
                im = ImageOps.fit(source.convert('RGB'), (240,320))
            im = im.resize((24,32)).resize((240,320), Image.Resampling.BILINEAR)
            im = im.filter(ImageFilter.GaussianBlur(12))
        im.save(preview, 'WEBP', quality=72)
    items.append({'id':ident,'source':rel,'rate':int(path.parts[len(DATA.parts)]) if path.parts[len(DATA.parts)].isdigit() else 70,
                  'kind':'video' if is_video else 'image','mime':'video/mp4' if is_video else ('image/png' if path.suffix.lower()=='.png' else 'image/webp' if path.suffix.lower()=='.webp' else 'image/jpeg'),
                  'sha256':digest,'preview':preview.name})
present = {x['source'] for x in items}
for rel,entry in old.items():
    if rel in present: continue
    payload = (VAULT/(entry['id']+'.enc')).read_bytes()
    raw = aes.decrypt(payload[:12],payload[12:],entry['id'].encode())
    if hashlib.sha256(raw).hexdigest() != entry['sha256']:
        raise RuntimeError(f'Verification failed: {rel}')
    items.append(entry)
CATALOG.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Sealed and verified {len(items)} files. Key: {KEY_FILE}')
if '--remove-plaintext' in sys.argv:
    for path in sources:
        path.chmod(stat.S_IWRITE)
        path.unlink()
    print('Plaintext sources removed after verification')
