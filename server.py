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
DATA = Path(os.environ.get('MEMORY_DATA_DIR', r'C:\Users\nhocy\OneDrive\Desktop\Bằng\HH\all'))
VAULT = DATA / '_sealed'
CATALOG = Path(os.environ.get('MEMORY_CATALOG_FILE', str(ROOT / 'secure-catalog.json')))
KEY_FILE = Path(os.environ.get('MEMORY_KEY_FILE', str(ROOT / 'vault-key.bin')))
ADMIN_FILE = Path(os.environ.get('MEMORY_ADMIN_FILE', str(ROOT / 'admin-key.txt')))
STATE_DIR = Path(os.environ.get('MEMORY_STATE_DIR', str(ROOT)))
DB = Path(os.environ.get('MEMORY_DB', str(STATE_DIR / 'secure-game.sqlite3')))
TZ = ZoneInfo('Asia/Ho_Chi_Minh')
LIMIT = 300
VISITOR_LIMIT = 189
HOST = os.environ.get('MEMORY_HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', os.environ.get('MEMORY_PORT', '8765')))

def db_open():
    db = sqlite3.connect(DB, timeout=20, isolation_level=None)
    db.execute('PRAGMA busy_timeout=20000')
    return db

def initialize():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not CATALOG.is_file() or not KEY_FILE.is_file() or not VAULT.is_dir():
        raise RuntimeError('Missing encrypted media package or decryption key')
    with db_open() as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS spent(id TEXT PRIMARY KEY, opened_at TEXT NOT NULL, ip TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS attempts(day TEXT PRIMARY KEY, count INTEGER NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS visitor_attempts(day TEXT NOT NULL, ip TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,ip))')
        db.execute('CREATE TABLE IF NOT EXISTS access_log(id INTEGER PRIMARY KEY, at TEXT NOT NULL, ip TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, agent TEXT NOT NULL, outcome TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        current_day=day_key()
        if not db.execute("SELECT 1 FROM settings WHERE key='visitor_limit_migrated'").fetchone():
            counts={}
            for at,ip in db.execute("SELECT at,ip FROM access_log WHERE path='/api/open' AND outcome IN ('miss','opened')"):
                if (datetime.fromisoformat(at)-timedelta(hours=7)).date().isoformat()==current_day:
                    counts[ip]=counts.get(ip,0)+1
            for ip,count in counts.items():
                db.execute('INSERT INTO visitor_attempts(day,ip,count) VALUES (?,?,?)',(current_day,ip,count))
            db.execute("INSERT INTO settings(key,value) VALUES ('visitor_limit_migrated','1')")

def catalog(): return json.loads(CATALOG.read_text(encoding='utf-8'))
def now(): return datetime.now(TZ)
def day_key(): return (now()-timedelta(hours=7)).date().isoformat()
def open_hours(): return not 3 <= now().hour < 7
def check_password(supplied, file):
    expected = file.read_text(encoding='utf-8').strip() if file.exists() else ''
    return bool(supplied and expected and hmac.compare_digest(supplied, expected))

def snapshot(db, ip):
    spent = {row[0] for row in db.execute('SELECT id FROM spent')}
    used_row = db.execute('SELECT count FROM attempts WHERE day=?', (day_key(),)).fetchone()
    used = used_row[0] if used_row else 0
    visitor_row=db.execute('SELECT count FROM visitor_attempts WHERE day=? AND ip=?',(day_key(),ip)).fetchone()
    visitor_used=visitor_row[0] if visitor_row else 0
    cards = [{'id':x['id'],'rate':x['rate'],'kind':x['kind'],'preview':'/previews/'+x['preview'],
              'locked':x['id'] in spent} for x in catalog()]
    return {'cards':cards,'usedToday':used,'remainingToday':max(0,LIMIT-used),
            'usedVisitor':visitor_used,'remainingVisitor':max(0,VISITOR_LIMIT-visitor_used),'open':open_hours(),
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
        self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'")
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
        if path == '/music.mp3':
            source=ROOT/'Data'/'Music.mp3'
            if not source.is_file(): self.json(404,{'error':'missing_music'}); return
            raw=source.read_bytes(); size=len(raw)
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',self.headers.get('Range','')) if self.headers.get('Range') else None
            if match:
                start=int(match.group(1)) if match.group(1) else max(0,size-int(match.group(2)))
                end=int(match.group(2)) if match.group(2) and match.group(1) else size-1
                if start>=size or end<start: self.json(416,{'error':'range'}); return
                end=min(end,size-1)
                self.send_bytes(206,raw[start:end+1],'audio/mpeg',{'Accept-Ranges':'bytes','Content-Range':f'bytes {start}-{end}/{size}'})
            else: self.send_bytes(200,raw,'audio/mpeg',{'Accept-Ranges':'bytes'})
            log(ip,'GET',path,agent,'music'); return
        if path == '/api/status':
            with db_open() as db:
                response = snapshot(db,ip)
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
        if path == '/api/open':
            ident = str(body.get('id',''))
            with db_open() as db:
                db.execute('BEGIN IMMEDIATE')
                item = next((x for x in catalog() if x['id']==ident),None)
                if not item:
                    db.commit(); self.json(404,{'error':'missing'}); return
                if db.execute('SELECT 1 FROM spent WHERE id=?',(ident,)).fetchone():
                    db.commit(); self.json(410,{'error':'spent'}); log(ip,'POST',path,agent,'spent'); return
                day = day_key(); used = db.execute('SELECT count FROM attempts WHERE day=?',(day,)).fetchone()
                visitor_used=db.execute('SELECT count FROM visitor_attempts WHERE day=? AND ip=?',(day,ip)).fetchone()
                if not open_hours() or (used and used[0]>=LIMIT) or (visitor_used and visitor_used[0]>=VISITOR_LIMIT):
                    db.commit(); self.json(423,{'error':'limit'}); log(ip,'POST',path,agent,'limit'); return
                db.execute('INSERT INTO attempts(day,count) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1',(day,))
                db.execute('INSERT INTO visitor_attempts(day,ip,count) VALUES (?,?,1) ON CONFLICT(day,ip) DO UPDATE SET count=count+1',(day,ip))
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
                db.execute('BEGIN IMMEDIATE'); db.execute('DELETE FROM spent'); db.execute('DELETE FROM attempts'); db.execute('DELETE FROM visitor_attempts'); db.commit()
            self.json(200,{'ok':True}); log(ip,'POST',path,agent,'reset'); return
        self.json(404,{'error':'not_found'}); log(ip,'POST',path,agent,'404')

if __name__=='__main__':
    initialize(); print(f'Memory game: http://{HOST}:{PORT}/',flush=True)
    ThreadingHTTPServer((HOST,PORT),Handler).serve_forever()
