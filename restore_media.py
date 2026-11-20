"""Admin-only local recovery: restore original files from the sealed vault."""
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import hashlib, json

ROOT=Path(__file__).resolve().parent
DATA=Path(r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all')
items=json.loads((ROOT/'secure-catalog.json').read_text(encoding='utf-8'))
aes=AESGCM((ROOT/'vault-key.bin').read_bytes())
restored=0
for item in items:
    target=DATA/item['source']
    if target.exists(): continue
    payload=(DATA/'_sealed'/(item['id']+'.enc')).read_bytes()
    raw=aes.decrypt(payload[:12],payload[12:],item['id'].encode())
    if hashlib.sha256(raw).hexdigest()!=item['sha256']: raise RuntimeError('Integrity check failed: '+item['id'])
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(raw)
    restored+=1
print(f'Restored {restored} original files')
