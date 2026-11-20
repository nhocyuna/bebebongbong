"""Download 100 distinct, official-style chibi emoji images into the avt folder."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from io import BytesIO
from pathlib import Path
from PIL import Image
import json
import random
import urllib.parse
import urllib.request

DEST = Path(r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all\avt')
DEST.mkdir(parents=True, exist_ok=True)
API = 'https://genshin-impact.fandom.com/api.php'
HEADERS = {'User-Agent': 'Mozilla/5.0'}

def get_json(params):
    url = API + '?' + urllib.parse.urlencode(params)
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=40) as response:
        return json.load(response)

members = []
continuation = {}
while True:
    result = get_json({'action':'query','list':'categorymembers','cmtitle':"Category:Paimon's Paintings",'cmlimit':500,'format':'json',**continuation})
    members.extend(entry['title'] for entry in result['query']['categorymembers'] if entry['title'].startswith("File:Icon Emoji Paimon's Paintings") and entry['title'].endswith('.png'))
    continuation = result.get('continue')
    if not continuation: break

random.Random(20261112).shuffle(members)
metadata = []
for start in range(0, min(len(members), 180), 30):
    result = get_json({'action':'query','prop':'imageinfo','iiprop':'url|size','titles':'|'.join(members[start:start+30]),'format':'json'})
    for page in result['query']['pages'].values():
        info = page.get('imageinfo', [{}])[0]
        if info.get('url') and info.get('width',0) >= 300 and info.get('height',0) >= 300:
            metadata.append({'title':page['title'],'url':info['url'],'source':info['descriptionurl']})

random.Random(20261113).shuffle(metadata)

def download(entry):
    request = urllib.request.Request(entry['url'], headers=HEADERS)
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read()
    with Image.open(BytesIO(raw)) as image:
        image.verify()
    return entry, raw

success = []
with ThreadPoolExecutor(max_workers=6) as executor:
    jobs = [executor.submit(download, entry) for entry in metadata[:130]]
    for job in as_completed(jobs):
        try:
            success.append(job.result())
        except Exception:
            pass
        if len(success) >= 100: break

if len(success) < 100:
    raise RuntimeError(f'Only {len(success)} images could be downloaded')

records = []
for number, (entry, raw) in enumerate(success[:100], 1):
    with Image.open(BytesIO(raw)) as image:
        extension = '.webp' if image.format == 'WEBP' else ('.png' if image.format == 'PNG' else '.jpg')
        size = image.size
    path = DEST / f'{number:03d}{extension}'
    path.write_bytes(raw)
    records.append({'file':path.name,'title':entry['title'],'source':entry['source'],'width':size[0],'height':size[1]})

(DEST / 'sources.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Saved {len(records)} chibi images', flush=True)
