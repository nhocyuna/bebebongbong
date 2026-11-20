"""Exercise a separate test server on port 9877 without touching live game state."""
from pathlib import Path
import json, urllib.request, urllib.error

BASE='http://127.0.0.1:9877'
root=Path(__file__).resolve().parent
view=(root/'viewer-key.txt').read_text().strip()
admin=(root/'admin-key.txt').read_text().strip()
def request(path, body=None, headers=None):
    data=None if body is None else json.dumps(body).encode()
    req=urllib.request.Request(BASE+path,data=data,headers=headers or {})
    try:
        with urllib.request.urlopen(req) as response: return response.status,dict(response.headers),response.read()
    except urllib.error.HTTPError as error: return error.code,dict(error.headers),error.read()

status=json.loads(request('/api/status')[2])
assert status['total']==149
for path in ('/media.js','/vault/m001.enc.js','/vault-key.bin','/secure-catalog.json'):
    assert request(path)[0]==404
item=next(x for x in status['cards'] if x['rate']==70)
assert request('/api/open',{'id':item['id'],'password':'wrong'})[0]==403
opened=False
for _ in range(12):
    code,headers,content=request('/api/open',{'id':item['id'],'password':view})
    assert code==200
    if headers.get('X-Memory-Opened')=='yes':
        assert content[:2]==b'\xff\xd8' or content[:4] in (b'\x89PNG',b'RIFF')
        opened=True;break
assert opened
assert request('/api/open',{'id':item['id'],'password':view})[0]==410
assert request('/api/admin/log',headers={'X-Admin-Key':admin})[0]==200
assert request('/api/admin/reset',{},headers={'X-Admin-Key':admin})[0]==200
assert not next(x for x in json.loads(request('/api/status')[2])['cards'] if x['id']==item['id'])['locked']
print('PASS: sealed routes, password, one-time opening, log, admin reset')
