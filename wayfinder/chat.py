"""Canonical app conversation bookkeeping over isolated OpenCode chat jobs.

Legacy transcript-only tables are not imported into model history. Iron Web remains
the explicit memory system; this service neither reads nor publishes memory.
"""
import hashlib
import os
import json
from threading import RLock
import time
import uuid

SCHEMAS={'chat_list':{'space'},'chat_new':{'space'},'chat_get':{'space','conversation','before'},'chat_send':{'space','conversation','request_id','message'},'chat_cancel':{'space','conversation','turn'},'chat_lookup':{'space','conversation','request_id'},'chat_delete':{'space','conversation'}}
ACTIVE={'reserved','running'}
def packed(value):return json.dumps(value,ensure_ascii=True,separators=(',',':'),allow_nan=False)
def bounded(value,limit):
    if not isinstance(value,str) or not value.strip() or '\x00' in value or len(value.encode('utf-8'))>limit:raise ValueError('Enter nonblank text within the conversation limit.')
    return value

class ChatService:
    def __init__(self,app):
        self.app,self.lock=app,RLock()
        try:self.approved_model=json.loads(os.environ.get('WAYFINDER_CHAT_PROVIDER_PIN','null'))
        except ValueError:self.approved_model=None
        with app.db() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS chat_headers(id TEXT PRIMARY KEY,owner TEXT,space TEXT,title TEXT,created REAL);
            CREATE TABLE IF NOT EXISTS chat_turns(id TEXT PRIMARY KEY,conversation TEXT,request TEXT,digest TEXT,user_text TEXT,assistant_text TEXT,status TEXT,job TEXT,created REAL,history_count INTEGER,warning TEXT,UNIQUE(conversation,request));
            CREATE TABLE IF NOT EXISTS chat_execution_scopes(turn TEXT PRIMARY KEY,task TEXT NOT NULL);''')
            pending=db.execute("SELECT * FROM chat_turns WHERE status IN ('reserved','running')").fetchall()
        for row in pending:
            with app.db() as db:header=db.execute('SELECT * FROM chat_headers WHERE id=?',(row['conversation'],)).fetchone()
            if header and row['job']:
                self._advance(dict(header),dict(row))
            with app.db() as db:db.execute("UPDATE chat_turns SET status='interrupted',warning='Application restarted; the model outcome is unconfirmed. No request was replayed.' WHERE id=? AND status IN ('reserved','running')",(row['id'],))

    def header(self,who,space,cid):
        bounded(cid,100)
        with self.app.db() as db:row=db.execute('SELECT * FROM chat_headers WHERE id=? AND owner=? AND space=?',(cid,who.owner,space)).fetchone()
        if not row:raise ValueError('Conversation unavailable in this space.')
        return dict(row)

    def call(self,who,operation,body):
        self.app.authorize(who)
        if operation not in SCHEMAS or not isinstance(body,dict) or set(body)-SCHEMAS[operation]:raise ValueError('Unknown conversation operation or fields.')
        space=body.get('space');self.app.space(who,space)
        with self.lock:
            if self.app.closed:raise ValueError('Conversation service is stopped.')
            if operation=='chat_list':
                with self.app.db() as db:rows=db.execute('SELECT * FROM chat_headers WHERE owner=? AND space=? ORDER BY created DESC LIMIT 40',(who.owner,space)).fetchall()
                return [dict(r) for r in rows]
            if operation=='chat_new':
                cid=uuid.uuid4().hex
                with self.app.db() as db:db.execute("INSERT INTO chat_headers VALUES (?,?,?,'New conversation',?)",(cid,who.owner,space,time.time()))
                return self.header(who,space,cid)
            header=self.header(who,space,body.get('conversation'))
            if operation=='chat_send':return self.send(header,body)
            if operation=='chat_lookup':
                request=bounded(body.get('request_id'),100)
                with self.app.db() as db:row=db.execute('SELECT id FROM chat_turns WHERE conversation=? AND request=?',(header['id'],request)).fetchone()
                return dict(accepted=bool(row),turn=row['id'] if row else None,automatic_replay=False)
            if operation=='chat_cancel':
                tid=bounded(body.get('turn'),100)
                with self.app.db() as db:
                    row=db.execute('SELECT * FROM chat_turns WHERE id=? AND conversation=?',(tid,header['id'])).fetchone()
                    if not row:raise ValueError('Turn unavailable in this conversation.')
                    if row['status'] in ACTIVE:db.execute("UPDATE chat_turns SET status='cancelled',warning='Stopped locally. Upstream abort and billing are unconfirmed.' WHERE id=?",(tid,))
                if row['status'] in ACTIVE and row['job']:self.app.workers.cancel(self.scope(header,row['id']),row['job'])
                return self.page(header)
            if operation=='chat_delete':
                with self.app.db() as db:rows=db.execute('SELECT * FROM chat_turns WHERE conversation=?',(header['id'],)).fetchall()
                if any(r['status'] in ACTIVE for r in rows):raise ValueError('Stop active turns before deleting this conversation.')
                for row in rows:
                    if row['job']:
                        try:self.app.workers.forget(self.scope(header,row['id']),row['job'])
                        except ValueError:raise ValueError('The underlying worker is still stopping; deletion has not completed.') from None
                with self.app.db() as db:
                    db.execute('DELETE FROM chat_execution_scopes WHERE turn IN (SELECT id FROM chat_turns WHERE conversation=?)',(header['id'],))
                    db.execute('DELETE FROM chat_turns WHERE conversation=?',(header['id'],));db.execute('DELETE FROM chat_headers WHERE id=?',(header['id'],))
                return dict(deleted=True,memory_changed=False,backups_erased=False)
            return self.page(header,body.get('before'))

    def scope(self,header,turn):
        # The service issues a separate execution scope for every new turn.
        # Existing conversations retain their original job scope for observation
        # and cleanup; no resources or grants are copied into the new scope.
        with self.app.db() as db:
            row=db.execute('SELECT s.task FROM chat_turns t LEFT JOIN chat_execution_scopes s ON s.turn=t.id WHERE t.id=? AND t.conversation=?',(turn,header['id'])).fetchone()
        if row is None:raise ValueError('Turn unavailable in this conversation.')
        return (header['owner'],header['space'],row['task'] or 'chat:'+header['id'])

    def send(self,header,body):
        message=bounded(body.get('message'),4000);request=bounded(body.get('request_id'),100)
        digest=hashlib.sha256(message.encode()).hexdigest()
        with self.app.db() as db:
            old=db.execute('SELECT * FROM chat_turns WHERE conversation=? AND request=?',(header['id'],request)).fetchone()
            if old:
                if old['digest']!=digest:raise ValueError('This request ID belongs to different immutable chat input.')
                return self.page(header)
            if db.execute("SELECT 1 FROM chat_turns WHERE status IN ('reserved','running') LIMIT 1").fetchone():raise ValueError('One conversation is already generating. Stop it or wait for completion.')
            rows=db.execute("SELECT user_text,assistant_text FROM chat_turns WHERE conversation=? AND status='completed' ORDER BY created DESC,id DESC LIMIT 6",(header['id'],)).fetchall()
        if not self.app.platform.inspector.current().get('compatible'):
            self.app.platform.inspector.inspect()
        self.app.platform.inspector.require()
        if not self.approved_model or self.app.platform.inspector.current().get('isolation',{}).get('model_info')!=self.approved_model:raise ValueError('Review the model connection in setup before chatting.')
        history=[];budget=0
        for row in rows:
            pair=[dict(role='user',content=row['user_text']),dict(role='assistant',content=row['assistant_text'])]
            size=len(packed(pair).encode())
            if budget+size>18000:break
            history=pair+history;budget+=size
        tid=uuid.uuid4().hex
        with self.app.db() as db:
            db.execute("INSERT INTO chat_turns VALUES (?,?,?,?,?,NULL,'reserved',NULL,?,?,NULL)",(tid,header['id'],request,digest,message,time.time(),len(history)))
            db.execute('INSERT INTO chat_execution_scopes VALUES (?,?)',(tid,'chat-run:'+tid))
            db.execute("UPDATE chat_headers SET title=? WHERE id=? AND title='New conversation'",(message[:70],header['id']))
        try:
            job=self.app.workers.start_chat(self.scope(header,tid),message,history,self.approved_model)
            with self.app.db() as db:db.execute("UPDATE chat_turns SET status='running',job=? WHERE id=? AND status='reserved'",(job['id'],tid))
        except Exception:
            with self.app.db() as db:db.execute("UPDATE chat_turns SET status='failed',warning='The model could not start. No automatic retry was made.' WHERE id=?",(tid,))
        return self.page(header)

    def _advance(self,header,row):
        if row['status'] not in ACTIVE or not row['job']:return
        try:job=self.app.workers.get(self.scope(header,row['id']),row['job'])
        except ValueError:job=dict(status='interrupted')
        status,answer,warning=None,None,None
        if job['status']=='completed':
            answer=job.get('result',{}).get('text')
            if not isinstance(answer,str) or not answer.strip() or len(packed(answer).encode())>26000:
                status,answer,warning='failed',None,'The model reply was missing or exceeded the bounded display limit.'
            else:status='completed'
        elif job['status'] in {'failed','stopped','interrupted'}:
            status='cancelled' if job['status']=='stopped' else job['status'];warning='Model generation did not complete. No reply or external action is asserted.'
        if status:
            with self.app.db() as db:db.execute("UPDATE chat_turns SET status=?,assistant_text=?,warning=? WHERE id=? AND status IN ('reserved','running')",(status,answer,warning,row['id']))

    def page(self,header,before=None):
        with self.app.db() as db:
            active=db.execute("SELECT * FROM chat_turns WHERE conversation=? AND status IN ('reserved','running')",(header['id'],)).fetchall()
        for row in active:self._advance(header,dict(row))
        cursor=2**63-1
        with self.app.db() as db:
            if before:
                found=db.execute('SELECT rowid FROM chat_turns WHERE id=? AND conversation=?',(bounded(before,100),header['id'])).fetchone()
                if not found:raise ValueError('History cursor unavailable in this conversation.')
                cursor=found[0]
            rows=[dict(r) for r in db.execute('SELECT rowid,* FROM chat_turns WHERE conversation=? AND rowid<? ORDER BY rowid DESC LIMIT 7',(header['id'],cursor)).fetchall()]
        more=len(rows)>6;rows=rows[:6]
        visible=[{k:v for k,v in row.items() if k in {'id','user_text','assistant_text','status','created','history_count','warning'}} for row in reversed(rows)]
        while len(packed(visible).encode())>48000 and len(visible)>1:visible.pop(0);more=True
        return dict(conversation=header['id'],turns=visible,has_more=more,before=visible[0]['id'] if visible else None,history_policy='Up to six recent completed pairs within a bounded context. Cancelled/failed turns are excluded.',tools=[],memory_automatic=False,cost=None,tokens=None)
