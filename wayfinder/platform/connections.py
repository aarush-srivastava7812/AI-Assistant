"""Trusted read connections; reuse GoogleRead, NotionAdapter and Hermes Tavily.

Credential configuration is an owned-stdio bootstrap operation, never an API or
worker capability. This service adds scope, expiry, rotation and result budgets.
"""
from dataclasses import asdict
import hashlib,json,re,secrets,time
from threading import RLock,Semaphore,Event
import requests
from wayfinder.atlas.harness.notion_adapter import NotionAdapter
from wayfinder.workers.hermes import HermesBridge
from wayfinder.platform.google_read import GoogleRead

SCHEMAS={'platform_connections_status':set(),'platform_connections_check':{'provider'},'platform_external_grant':{'provider','intent','query','item'},'platform_external_read':{'grant'},'platform_external_revoke':{'grant'}}
PROVIDERS={'google','tavily','notion'}

class ConnectionRefusal(ValueError):
    """Fixed local policy messages, safe to display without provider details."""
def encode(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False)
def text(v,limit):
    if not isinstance(v,str) or not v.strip() or len(v)>limit or '\0' in v:raise ValueError('Choose a nonblank value within the connection limit.')
    return v.strip()
def uuid(v):
    if not isinstance(v,str) or not re.fullmatch(r'[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}',v):raise ValueError('Choose a valid Notion page from the search results.')
    return v

class BoundedNotion(NotionAdapter):
    """Retain the existing adapter's normalization; constrain its HTTP effects."""
    def __init__(self,key):super().__init__(api_key=key);self.possibly_truncated=False
    def _request(self,endpoint,method='GET',data=None):
        permitted=(method=='POST' and endpoint=='search') or (method=='GET' and (endpoint=='users/me' or re.fullmatch(r'(pages|blocks)/[0-9a-fA-F-]{32,36}(/children)?',endpoint)))
        if not permitted:raise ValueError('This connection supports bounded reads only.')
        params={'page_size':20} if endpoint.endswith('/children') else None
        with requests.Session() as session:
            session.trust_env=False
            with session.request(method,'https://api.notion.com/v1/'+endpoint,headers={'Authorization':'Bearer '+self.api_key,'Notion-Version':'2022-06-28'},json=data,params=params,timeout=(5,5),stream=True,allow_redirects=False) as response:
                if response.status_code!=200:raise ValueError('Notion read unavailable. Check the integration token and shared-page permissions.')
                raw=bytearray();deadline=time.monotonic()+12
                for chunk in response.iter_content(8192):
                    raw.extend(chunk)
                    if len(raw)>128000 or time.monotonic()>deadline:raise ValueError('Notion response exceeded its read budget.')
                result=json.loads(raw)
                if not isinstance(result,dict):raise ValueError('Invalid Notion response.')
                self.possibly_truncated|=bool(result.get('has_more'));return result

class Connections:
    def __init__(self,app,clock=time.time,notion_factory=BoundedNotion,bridge=None):
        self.app,self.clock,self.notion_factory=app,clock,notion_factory
        self.lock,self.slots,self.stop=RLock(),Semaphore(2),Event()
        self.values={'schema':1,'google':None,'tavily':None,'notion':None};self.revision=secrets.token_hex(16);self.digest=None
        self.grants={};self.checks={};self.closed=False
        self.bridge=bridge or HermesBridge(timeout=35)
        if bridge is None and '--timeout' in self.bridge.command:self.bridge.command[self.bridge.command.index('--timeout')+1]='30'
        with app.db() as db:db.execute('CREATE TABLE IF NOT EXISTS integration_reads(id TEXT PRIMARY KEY,scope TEXT,provider TEXT,intent_digest TEXT,status TEXT,records INTEGER,created REAL,finished REAL)')
    def google_blob(self):
        with self.lock:return self.values['google']
    def configure(self,bundle):
        if not isinstance(bundle,dict) or set(bundle)!={'schema','google','tavily','notion'} or type(bundle['schema']) is not int or bundle['schema']!=1:raise ValueError('Invalid private connection bootstrap.')
        for name in PROVIDERS:
            value=bundle[name]
            if value is not None and (not isinstance(value,str) or not value.strip() or len(value.encode())>(24000 if name=='google' else 2048) or '\0' in value):raise ValueError('Invalid private credential.')
        if bundle['google']:
            value=json.loads(bundle['google'])
            if value.get('token_uri')!='https://oauth2.googleapis.com/token' or not isinstance(value.get('scopes'),list) or not value.get('refresh_token'):raise ValueError('Google requires an existing read-only OAuth connection.')
        digest=hashlib.sha256(encode(bundle).encode()).hexdigest()
        with self.lock:
            if self.closed:raise ValueError('Connections are stopped.')
            if self.digest==digest:return self.status()
            self.digest=digest;self.values=dict(bundle);self.revision=secrets.token_hex(16);self.grants.clear();self.checks.clear()
            old=self.app.platform.google
        old.close()
        self.app.platform.google=GoogleRead(self.app,clock=self.clock,credential_loader=self.google_blob)
        return self.status()
    def status(self):
        with self.lock:return {'configured':{p:bool(self.values[p]) for p in sorted(PROVIDERS)},'checks':{p:v for p,v in self.checks.items() if v['expires']>self.clock()},'read_only':True,'automatic_memory':False,'automatic_model_disclosure':False}
    def qualified(self,provider):return bool(self.status()['checks'].get(provider,{}).get('passed'))
    def call(self,who,scope,operation,body):
        self.app.authorize(who);self.app.space(who,scope.space)
        if who.owner!=self.app.owner or who.owner!=scope.owner:raise ValueError('Connection owner does not match this space.')
        if operation not in SCHEMAS or set(body)-(SCHEMAS[operation]|{'space','task'}):raise ValueError('Unknown connection fields.')
        if self.closed or self.app.closed:raise ValueError('Connections are stopped.')
        if operation=='platform_connections_status':return self.status()
        if operation=='platform_connections_check':return self.check(scope,body.get('provider'))
        if operation=='platform_external_grant':return self.grant(scope,body)
        gid=body.get('grant')
        with self.lock:
            grant=self.grants.get(gid) if isinstance(gid,str) else None
            if not grant or grant['scope']!=scope:raise ValueError('Read grant is unavailable in this task.')
            if operation=='platform_external_revoke':self.grants.pop(gid,None);return {'revoked':True}
        return self.read(grant)
    def grant(self,scope,body):
        provider,intent=body.get('provider'),body.get('intent')
        if provider not in {'tavily','notion'} or intent not in {'search','read'} or (provider=='tavily' and intent!='search'):raise ValueError('Choose a supported read operation.')
        if intent=='search':
            query=body.get('query','')
            if not isinstance(query,str):raise ValueError('Search query must be text.')
            params={'query':text(query,400) if provider=='tavily' else text(query,200) if query.strip() else ''}
        else:params={'item':uuid(body.get('item'))}
        if ('item' in body and intent!='read') or ('query' in body and intent!='search'):raise ValueError('Read parameters differ from the selected operation.')
        with self.lock:
            if not self.values[provider]:raise ValueError('Import this connection before using it.')
            self.grants={k:g for k,g in self.grants.items() if g['expires']>self.clock()}
            if len(self.grants)>=32:raise ValueError('Connection grant budget reached.')
            gid=secrets.token_urlsafe(24);expires=self.clock()+120
            self.grants[gid]={'id':gid,'scope':scope,'provider':provider,'intent':intent,'params':params,'revision':self.revision,'expires':expires}
            return {'id':gid,'provider':provider,'intent':intent,'expires':expires,'limit':3,'external_writes':False}
    def live(self,grant):
        with self.lock:
            if self.closed or self.app.closed or grant['expires']<=self.clock() or self.grants.get(grant['id']) is not grant or grant['revision']!=self.revision:raise ConnectionRefusal('Read grant expired, was revoked, or the connection changed.')
    def read(self,grant):
        attempt=secrets.token_hex(16);status='failed';count=0
        with self.app.db() as db:db.execute('INSERT INTO integration_reads VALUES (?,?,?,?,?,0,?,NULL)',(attempt,encode(grant['scope'].model_dump()),grant['provider'],hashlib.sha256(encode([grant['intent'],grant['params']]).encode()).hexdigest(),'running',self.clock()))
        acquired=self.slots.acquire(blocking=False)
        try:
            self.live(grant)
            if not acquired:raise ConnectionRefusal('Two connection reads are already active. Wait for completion.')
            with self.lock:key=self.values[grant['provider']]
            if grant['provider']=='tavily':
                raw=self.bridge.run({'role':'TAVILY','question':grant['params']['query'],'limit':3,'api_key':key},self.stop)
                rows=raw.get('data',{}).get('web',[])
                records=[{'id':str(i),'title':str(r.get('title',''))[:300],'url':str(r.get('url',''))[:1500],'content':str(r.get('description',''))[:3000]} for i,r in enumerate(rows[:3]) if isinstance(r,dict)]
                truncated=len(rows)>3
            else:
                adapter=self.notion_factory(key)
                values=adapter.search(grant['params']['query'],limit=3) if grant['intent']=='search' else [adapter.read(grant['params']['item'])]
                records=[]
                for item in values[:3]:
                    data=asdict(item);records.append({k:str(data.get(k,''))[:(6000 if k=='content' else 1500)] for k in ['id','title','content','url']})
                truncated=adapter.possibly_truncated or any(len(str(asdict(item).get('content','')))>6000 for item in values[:3])
            if len(encode(records).encode())>40000:raise ConnectionRefusal('Connection results exceeded their display budget.')
            self.live(grant);count=len(records);status='completed'
            return {'provider':grant['provider'],'records':records,'possibly_truncated':truncated,'attempt':attempt,'external_writes':False,'automatic_memory':False,'model_invocations':0,'observed_at':self.clock()}
        except ConnectionRefusal as error:raise ValueError(str(error)) from None
        except Exception:raise ValueError('Connection read could not be verified. No write or automatic model request was made.') from None
        finally:
            if acquired:self.slots.release()
            with self.app.db() as db:db.execute('UPDATE integration_reads SET status=?,records=?,finished=? WHERE id=?',(status,count,self.clock(),attempt))
    def check(self,scope,provider):
        if provider not in PROVIDERS:raise ValueError('Choose a supported connection.')
        with self.lock:
            if not self.values[provider]:raise ValueError('Import this connection first.')
            revision=self.revision;key=self.values[provider]
        count=0;passed=False
        try:
            if provider=='google':
                start=datetime_now();google=self.app.platform.google
                for service,resource in [('calendar','primary'),('tasks','@default'),('gmail','INBOX')]:
                    args={'service':service,'resource':resource,'limit':1}
                    if service=='calendar':args.update(time_min=start,time_max=datetime_after_day())
                    grant=google.grant(scope,args)
                    try:count+=len(google.read(google.grants[grant['id']])['records'])
                    finally:
                        with google.lock:google.grants.pop(grant['id'],None)
                label='Calendar, Tasks and Gmail reads verified'
            elif provider=='notion':self.notion_factory(key)._request('users/me');label='Notion authentication verified'
            else:
                grant=self.grant(scope,{'provider':'tavily','intent':'search','query':'Python official documentation'})
                try:count=len(self.read(self.grants[grant['id']])['records'])
                finally:
                    with self.lock:self.grants.pop(grant['id'],None)
                label='Tavily search verified'
            passed=True
        except Exception:label='Connection check failed. Check the key, token scopes and provider access.'
        with self.lock:
            if revision!=self.revision:raise ValueError('Connection changed during its check. Run a fresh check.')
            self.checks[provider]={'passed':passed,'label':label,'expires':self.clock()+300,'records':count}
        return self.status()
    def close(self):
        with self.lock:self.closed=True;self.stop.set();self.grants.clear();self.values={'schema':1,'google':None,'tavily':None,'notion':None};self.checks.clear()

def datetime_now():
    from datetime import datetime,timezone
    return datetime.now(timezone.utc).isoformat()
def datetime_after_day():
    from datetime import datetime,timezone,timedelta
    return (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()
