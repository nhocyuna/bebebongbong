"""Build encrypted, browser-readable copies of the local media."""
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import json
import mimetypes
import os
import re

ROOT = Path(__file__).resolve().parent
VAULT = ROOT / 'vault'
VAULT.mkdir(exist_ok=True)
CLASSIFIED_ROOT = Path(r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all')
chance_by_name = {}
for folder in CLASSIFIED_ROOT.iterdir():
    if folder.is_dir() and folder.name in {'5', '10', '20', '50', '70'}:
        for path in folder.rglob('*'):
            if path.is_file():
                chance_by_name[path.name] = int(folder.name)

sources = []
for path in sorted((ROOT / 'Encoded Data').glob('*')):
    if path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.mp4'}:
        sources.append((path, 'personal'))
for path in sorted((ROOT / 'Special Cards 100').glob('*')):
    if path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.webp'}:
        sources.append((path, 'anime'))
sources.append((ROOT / 'Joker_Card.png', 'joker'))

existing_js = ROOT / 'media.js'
if existing_js.exists():
    match = re.search(r'window\.MEDIA_KEY="([^"]+)"', existing_js.read_text(encoding='utf-8'))
    key = base64.b64decode(match.group(1)) if match else AESGCM.generate_key(bit_length=256)
else:
    key = AESGCM.generate_key(bit_length=256)
cipher = AESGCM(key)
manifest = []
for number, (source, group) in enumerate(sources, 1):
    raw = source.read_bytes()
    nonce = os.urandom(12)
    payload = base64.b64encode(nonce + cipher.encrypt(nonce, raw, None)).decode('ascii')
    identifier = f'm{number:03d}'
    encrypted = VAULT / f'{identifier}.enc.js'
    encrypted.write_text(f'window.__mediaCipher=window.__mediaCipher||{{}};window.__mediaCipher["{identifier}"]="{payload}";', encoding='utf-8')
    entry = {
        'id': identifier,
        'name': source.stem,
        'group': group,
        'type': 'video' if source.suffix.lower() == '.mp4' else 'image',
        'mime': mimetypes.guess_type(source.name)[0] or 'application/octet-stream',
        'enc': f'vault/{identifier}.enc.js',
    }
    if group == 'personal':
        original_name = re.sub(r'^\d{3}_', '', source.name)
        entry['chance'] = chance_by_name.get(original_name)
    manifest.append(entry)
    if number % 25 == 0 or number == len(sources):
        print(f'Encrypted {number}/{len(sources)}', flush=True)

existing_manifest = ROOT / 'media-manifest.json'
if existing_manifest.exists():
    manifest.extend(item for item in json.loads(existing_manifest.read_text(encoding='utf-8'))
                    if item.get('adminAdded'))
media_js = 'window.MEDIA_KEY=' + json.dumps(base64.b64encode(key).decode('ascii')) + ';window.MEDIA=' + json.dumps(manifest, ensure_ascii=False, separators=(',', ':')) + ';'
(ROOT / 'media.js').write_text(media_js, encoding='utf-8')
(ROOT / 'media-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
