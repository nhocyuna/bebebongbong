"""One-view memory game. Run: python server.py"""
from datetime import datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import hashlib, hmac, json, mimetypes, os, secrets, sqlite3
import re

ROOT = Path(__file__).resolve().parent
DATA = Path(r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all')
VAULT = DATA / '_sealed'
CATALOG = ROOT / 'secure-catalog.json'
KEY_FILE = ROOT / 'vault-key.bin'
ADMIN_FILE = ROOT / 'admin-key.txt'
VIEW_FILE = ROOT / 'viewer-key.txt'
SPECIAL_VIEW_PASSWORD = 'h'
DB = Path(os.environ.get('MEMORY_DB', str(ROOT / 'secure-game.sqlite3')))
TZ = ZoneInfo('Asia/Ho_Chi_Minh')
LIMIT = 300
HOST = os.environ.get('MEMORY_HOST', '127.0.0.1')
PORT = int(os.environ.get('MEMORY_PORT', '8765'))

def db_open():
    db = sqlite3.connect(DB, timeout=20, isolation_level=None)
    db.execute('PRAGMA busy_timeout=20000')
    return db

def initialize():
    if not VIEW_FILE.exists(): VIEW_FILE.write_text(secrets.token_urlsafe(18), encoding='utf-8')
    with db_open() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS spent(id TEXT PRIMARY KEY, opened_at TEXT NOT NULL, ip TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS attempts(day TEXT PRIMARY KEY, count INTEGER NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS access_log(id INTEGER PRIMARY KEY, at TEXT NOT NULL, ip TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, agent TEXT NOT NULL, outcome TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS failures(ip TEXT NOT NULL, at TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, ip TEXT NOT NULL, expires TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS viewers(name TEXT PRIMARY KEY, salt BLOB NOT NULL, password_hash BLOB NOT NULL, created_at TEXT NOT NULL)')

def catalog(): return json.loads(CATALOG.read_text(encoding='utf-8'))
def now(): return datetime.now(TZ)
def day_key(): return (now()-timedelta(hours=7)).date().isoformat()
def open_hours(): return not 3 <= now().hour < 7
def check_password(supplied, file):
    expected = file.read_text(encoding='utf-8').strip() if file.exists() else ''
    return bool(supplied and expected and hmac.compare_digest(supplied, expected))

def password_hash(password, salt):
    return hashlib.scrypt(password.encode('utf-8'), salt=salt, n=16384, r=8, p=1)

def issue_session(db, ip):
    token=secrets.token_urlsafe(32)
    expires=(now()+timedelta(days=30)).isoformat()
    db.execute('INSERT INTO sessions(token_hash,ip,expires) VALUES (?,?,?)',
               (hashlib.sha256(token.encode()).hexdigest(),ip,expires))
    return {'ok':True,'token':token,'expires':expires}

def valid_session(db, token):
    if not token: return False
    row=db.execute('SELECT expires FROM sessions WHERE token_hash=?',
                   (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
    return bool(row and row[0]>now().isoformat())

def snapshot(db):
    spent = {row[0] for row in db.execute('SELECT id FROM spent')}
    used_row = db.execute('SELECT count FROM attempts WHERE day=?', (day_key(),)).fetchone()
    used = used_row[0] if used_row else 0
    cards = [{'id':x['id'],'rate':x['rate'],'kind':x['kind'],'preview':'/previews/'+x['preview'],
              'locked':x['id'] in spent} for x in catalog()]
    return {'cards':cards,'usedToday':used,'remainingToday':max(0,LIMIT-used),'open':open_hours(),
            'spentCount':len(spent),'total':len(cards)}

def log(ip, method, path, agent, outcome):
    try:
        with db_open() as db:
            db.execute('INSERT INTO access_log(at,ip,method,path,agent,outcome) VALUES (?,?,?,?,?,?)',
                       (now().isoformat(),ip,method,path[:200],agent[:300],outcome[:80]))
    except sqlite3.Error: pass

class Handler(BaseHTTPRequestHandler):
    def ip(self): return self.client_address[0]
    def send_bytes(self, code, data, mime='application/octet-stream', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; media-src blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'")
        for key,value in (extra or {}).items(): self.send_header(key,value)
        self.end_headers()
        try: self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError): pass
    def json(self, code, data):
        self.send_bytes(code, json.dumps(data, ensure_ascii=False).encode(), 'application/json; charset=utf-8')
    def get_body(self):
        length = int(self.headers.get('Content-Length','0'))
        if length < 0 or length > 4096: raise ValueError('Invalid request')
        return json.loads(self.rfile.read(length) or b'{}')
    def do_GET(self):
        path = urlsplit(self.path).path; ip = self.ip(); agent = self.headers.get('User-Agent','')
        if path == '/api/status':
            with db_open() as db:
                response = snapshot(db)
                response['authenticated'] = valid_session(db,self.headers.get('X-Viewer-Token',''))
            self.json(200,response); log(ip,'GET',path,agent,'status'); return
        if path == '/api/admin/log':
            if not check_password(self.headers.get('X-Admin-Key',''),ADMIN_FILE):
                self.json(403,{'error':'admin'}); log(ip,'GET',path,agent,'denied'); return
            with db_open() as db:
                rows = db.execute('SELECT at,ip,method,path,agent,outcome FROM access_log ORDER BY id DESC LIMIT 500').fetchall()
            self.json(200,{'entries':[dict(zip(('at','ip','method','path','agent','outcome'),r)) for r in rows]}); log(ip,'GET',path,agent,'admin'); return
        if path.startswith('/previews/') and path.endswith('.webp'):
            name = path.rsplit('/',1)[-1]
            if name in {x['preview'] for x in catalog()} and (ROOT/'previews'/name).is_file():
                self.send_bytes(200,(ROOT/'previews'/name).read_bytes(),'image/webp'); log(ip,'GET',path,agent,'preview'); return
        files = {'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js',
                 '/admin.html':'admin.html','/admin.js':'admin.js'}
        if path in files:
            file = ROOT/files[path]; mime = mimetypes.guess_type(file.name)[0] or 'text/plain'
            self.send_bytes(200,file.read_bytes(),mime+'; charset=utf-8'); log(ip,'GET',path,agent,'page'); return
        self.json(404,{'error':'not_found'}); log(ip,'GET',path,agent,'404')
    def do_POST(self):
        path = urlsplit(self.path).path; ip = self.ip(); agent = self.headers.get('User-Agent','')
        try: body = self.get_body()
        except (ValueError,json.JSONDecodeError): self.json(400,{'error':'request'}); return
        if path == '/api/logout':
            token=self.headers.get('X-Viewer-Token','')
            if token:
                with db_open() as db:
                    db.execute('DELETE FROM sessions WHERE token_hash=?',(hashlib.sha256(token.encode()).hexdigest(),))
            self.json(200,{'ok':True}); log(ip,'POST',path,agent,'logout'); return
        if path in ('/api/login','/api/register'):
            password = str(body.get('password',''))
            name = str(body.get('name','')).strip().casefold()
            with db_open() as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute('DELETE FROM failures WHERE at<?',((now()-timedelta(hours=1)).isoformat(),))
                failures = db.execute('SELECT count(*) FROM failures WHERE ip=?',(ip,)).fetchone()[0]
                if failures >= 5:
                    db.commit(); self.json(429,{'error':'too_many_password_attempts'}); log(ip,'POST',path,agent,'blocked'); return
                if path == '/api/register':
                    if not re.fullmatch(r'[\w.-]{3,32}',name,flags=re.UNICODE) or len(password)<8 or len(password)>128 or password=='h':
                        db.commit(); self.json(400,{'error':'invalid_credentials'}); return
                    if db.execute('SELECT 1 FROM viewers WHERE name=?',(name,)).fetchone():
                        db.commit(); self.json(409,{'error':'name_taken'}); return
                    salt=os.urandom(16)
                    db.execute('INSERT INTO viewers(name,salt,password_hash,created_at) VALUES (?,?,?,?)',
                               (name,salt,password_hash(password,salt),now().isoformat()))
                elif not (hmac.compare_digest(password,SPECIAL_VIEW_PASSWORD) and not name):
                    row=db.execute('SELECT salt,password_hash FROM viewers WHERE name=?',(name,)).fetchone()
                    dummy=b'\0'*16
                    actual=password_hash(password,row[0] if row else dummy)
                    if not row or not hmac.compare_digest(actual,row[1]):
                        db.execute('INSERT INTO failures(ip,at) VALUES (?,?)',(ip,now().isoformat()))
                        db.commit(); self.json(403,{'error':'password'}); log(ip,'POST',path,agent,'bad_password'); return
                result=issue_session(db,ip)
                db.commit()
            self.json(200,result); log(ip,'POST',path,agent,'register' if path=='/api/register' else 'login'); return
        if path == '/api/open':
            ident = str(body.get('id','')); token = self.headers.get('X-Viewer-Token','')
            with db_open() as db:
                db.execute('BEGIN IMMEDIATE')
                if not valid_session(db,token):
                    db.commit(); self.json(401,{'error':'login_required'}); log(ip,'POST',path,agent,'login_required'); return
                item = next((x for x in catalog() if x['id']==ident),None)
                if not item:
                    db.commit(); self.json(404,{'error':'missing'}); return
                if db.execute('SELECT 1 FROM spent WHERE id=?',(ident,)).fetchone():
                    db.commit(); self.json(410,{'error':'spent'}); log(ip,'POST',path,agent,'spent'); return
                day = day_key(); used = db.execute('SELECT count FROM attempts WHERE day=?',(day,)).fetchone()
                if not open_hours() or (used and used[0]>=LIMIT):
                    db.commit(); self.json(423,{'error':'closed'}); log(ip,'POST',path,agent,'closed'); return
                db.execute('INSERT INTO attempts(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1',(day,))
                if secrets.randbelow(100) >= item['rate']:
                    db.commit(); self.json(200,{'opened':False,'rate':item['rate']}); log(ip,'POST',path,agent,'miss'); return
                payload = (VAULT/(ident+'.enc')).read_bytes()
                plain = AESGCM(KEY_FILE.read_bytes()).decrypt(payload[:12],payload[12:],ident.encode())
                if hashlib.sha256(plain).hexdigest()!=item['sha256']: raise ValueError('Integrity check failed')
                db.execute('INSERT INTO spent(id,opened_at,ip) VALUES (?,?,?)',(ident,now().isoformat(),ip))
                db.commit()
            self.send_bytes(200,plain,item['mime'],{'X-Memory-Opened':'yes','X-Memory-Rate':str(item['rate'])})
            log(ip,'POST',path,agent,'opened'); return
        if path == '/api/admin/reset':
            if not check_password(self.headers.get('X-Admin-Key',''),ADMIN_FILE):
                self.json(403,{'error':'admin'}); log(ip,'POST',path,agent,'denied'); return
            with db_open() as db:
                db.execute('BEGIN IMMEDIATE'); db.execute('DELETE FROM spent'); db.execute('DELETE FROM attempts'); db.execute('DELETE FROM failures'); db.commit()
            self.json(200,{'ok':True}); log(ip,'POST',path,agent,'reset'); return
        self.json(404,{'error':'not_found'}); log(ip,'POST',path,agent,'404')

if __name__=='__main__':
    initialize(); print(f'Memory game: http://{HOST}:{PORT}/',flush=True)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
