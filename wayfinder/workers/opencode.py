"""Bounded chat through the pinned official OpenCode server and import command.

Wayfinder owns conversation records; each turn gets a fresh OpenCode profile and
only its recent completed history. No credentials are written to OpenCode auth files.
"""
import base64
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import threading
import time
from urllib.request import Request, build_opener, ProxyHandler
import uuid

from .model_routes import validate_route, provider_spec
PROVIDER='wayfinder-model'
AGENT='wayfinder-chat'
SYSTEM='You are Wayfinder, a helpful conversational assistant. Answer clearly and honestly. You have no tools, account access or automatic persistent memory. Never claim to have performed an external action or permanently saved a fact. For persistent facts, direct the user to the explicit Memory review. State uncertainty.'

def configuration(route):
    spec=provider_spec(route)
    model=route['model']
    return {'$schema':'https://opencode.ai/config.json','model':PROVIDER+'/'+model,'small_model':PROVIDER+'/'+model,'enabled_providers':[PROVIDER],
        'provider':{PROVIDER:{'npm':spec['npm'],'name':spec['name'],'options':{'baseURL':route['base_url'],'apiKey':'{env:WAYFINDER_MODEL_API_KEY}'},'models':{model:{'name':model,'limit':{'context':32000,'output':2200}}}}},
        'default_agent':AGENT,'permission':{'*':'deny'},'tools':{'*':False},'plugin':[],'mcp':{},'instructions':[],'share':'disabled','autoupdate':False,
        'agent':{**{name:{'disable':True} for name in ('build','plan','general','explore','title','summary','compaction')},AGENT:{'description':'Wayfinder tools-closed conversation','mode':'primary','prompt':SYSTEM,'permission':{'*':'deny'},'steps':2}}}

def isolated_environment(root,route,password):
    env={k:v for k,v in os.environ.items() if k.upper() in {'SYSTEMROOT','WINDIR','PATH','PATHEXT','COMSPEC','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','SSL_CERT_FILE','SSL_CERT_DIR'}}
    for name,sub in {'HOME':'home','USERPROFILE':'home','APPDATA':'config','LOCALAPPDATA':'data','XDG_DATA_HOME':'data','XDG_CACHE_HOME':'cache','XDG_CONFIG_HOME':'config','XDG_STATE_HOME':'state','TMP':'tmp','TEMP':'tmp','ProgramData':'managed','OPENCODE_TEST_HOME':'home','OPENCODE_TEST_MANAGED_CONFIG_DIR':'managed'}.items():
        value=root/sub;value.mkdir(exist_ok=True);env[name]=str(value)
    env.update(OPENCODE_SERVER_PASSWORD=password,OPENCODE_SERVER_USERNAME='wayfinder',OPENCODE_AUTH_CONTENT='{}',OPENCODE_CONFIG_CONTENT=json.dumps(configuration(route)),WAYFINDER_MODEL_API_KEY=route['api_key'],
        OPENCODE_DISABLE_PROJECT_CONFIG='1',OPENCODE_DISABLE_DEFAULT_PLUGINS='1',OPENCODE_DISABLE_EXTERNAL_SKILLS='1',OPENCODE_DISABLE_CLAUDE_CODE='1',OPENCODE_DISABLE_MODELS_FETCH='1',OPENCODE_DISABLE_AUTOUPDATE='1',OPENCODE_DISABLE_AUTOCOMPACT='1',OPENCODE_PERMISSION='{"*":"deny"}')
    return env

def seed_history(session,history,model,directory):
    messages=[];parent=None;now=int(time.time()*1000)-len(history)
    for index,item in enumerate(history):
        mid='msg_'+f'{index:04x}'+uuid.uuid4().hex
        info=dict(id=mid,sessionID=session['id'],role=item['role'],time={'created':now+index},agent=AGENT)
        if item['role']=='user':info.update(model={'providerID':PROVIDER,'modelID':model},system=SYSTEM,tools={'*':False});parent=mid
        else:info.update(parentID=parent,modelID=model,providerID=PROVIDER,mode=AGENT,path={'cwd':directory,'root':directory},cost=0,tokens={'input':0,'output':0,'reasoning':0,'cache':{'read':0,'write':0}},finish='stop');info['time']['completed']=now+index
        messages.append({'info':info,'parts':[dict(id='prt_'+uuid.uuid4().hex,sessionID=session['id'],messageID=mid,type='text',text=item['content'])]})
    return {'info':session,'messages':messages}

class OpenCodeBridge:
    def __init__(self,*,executable=None,route=None,timeout=100):
        self.executable=executable or os.environ.get('WAYFINDER_OPENCODE_EXE')
        raw=os.environ.get('WAYFINDER_PRIVATE_MODEL_ROUTE')
        self.route=route if route is not None else json.loads(raw) if raw else None
        self.timeout=timeout

    def run(self,payload,cancelled=None):
        cancelled=cancelled or threading.Event();pin=validate_route(self.route)
        if payload.get('role')!='CHAT' or payload.get('model_pin')!=pin:raise ValueError('Review the OpenCode model connection before chatting.')
        history=payload.get('history');question=payload.get('question')
        if not isinstance(history,list) or len(history)>12 or len(json.dumps(history).encode())>20000 or any(not isinstance(m,dict) or set(m)!={'role','content'} or m['role']!=('user' if i%2==0 else 'assistant') or not isinstance(m['content'],str) for i,m in enumerate(history)) or len(history)%2 or not isinstance(question,str) or not 1<=len(question)<=4000:raise ValueError('Invalid bounded conversation input.')
        if not self.executable or not Path(self.executable).is_file():raise ValueError('Install / repair required software to prepare OpenCode chat.')
        if cancelled.is_set():raise ValueError('Chat stopped.')
        with tempfile.TemporaryDirectory(prefix='wayfinder-opencode-') as temporary:
            root=Path(temporary);work=root/'work';work.mkdir();password=secrets.token_urlsafe(32);env=isolated_environment(root,self.route,password)
            with socket.socket() as listener:listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
            flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
            process=subprocess.Popen([self.executable,'serve','--hostname','127.0.0.1','--port',str(port)],cwd=work,env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=flags,start_new_session=os.name!='nt')
            finished=threading.Event();lock=threading.Lock();deadline=time.monotonic()+self.timeout
            def stop():
                with lock:
                    if process.poll() is not None:return
                    if os.name=='nt':subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],creationflags=flags,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=8)
                    else:__import__('signal');os.killpg(process.pid,15)
                    process.wait(timeout=8)
            def monitor():
                while not finished.wait(.1):
                    if cancelled.is_set() or time.monotonic()>deadline:
                        try:stop()
                        except Exception:pass
                        return
            watcher=threading.Thread(target=monitor,daemon=True);watcher.start()
            opener=build_opener(ProxyHandler({}));auth='Basic '+base64.b64encode(('wayfinder:'+password).encode()).decode()
            def request(method,path,body=None,timeout=85):
                data=None if body is None else json.dumps(body,allow_nan=False).encode()
                req=Request('http://127.0.0.1:'+str(port)+path,data=data,method=method,headers={'Authorization':auth,'Content-Type':'application/json'})
                with opener.open(req,timeout=timeout) as response:
                    raw=response.read(400001)
                    if len(raw)>400000:raise ValueError('OpenCode response exceeded its limit.')
                    return json.loads(raw) if raw else None
            try:
                stage='startup';ready=False;startup_deadline=min(deadline,time.monotonic()+25)
                while time.monotonic()<startup_deadline and process.poll() is None:
                    try:
                        ready=request('GET','/global/health',timeout=.5).get('healthy') is True
                        if ready:break
                    except Exception:time.sleep(.15)
                    if cancelled.is_set():break
                if not ready:raise ValueError('OpenCode could not start its private chat service.')
                stage='permission verification'
                agents=request('GET','/agent',timeout=10);agent=next((a for a in agents if a.get('name')==AGENT),None)
                wildcards=[r for r in (agent or {}).get('permission',[]) if r.get('permission')=='*' and r.get('pattern')=='*']
                if not wildcards or wildcards[-1].get('action')!='deny':raise ValueError('OpenCode chat permission isolation was not verified.')
                session=request('POST','/session',{'title':'Wayfinder isolated turn','permission':[{'permission':'*','pattern':'*','action':'deny'}]})
                if session.get('permission')!=[{'permission':'*','pattern':'*','action':'deny'}]:raise ValueError('OpenCode session permission isolation was not verified.')
                if history:
                    stage='history restoration'
                    source=root/'recent-history.json';source.write_text(json.dumps(seed_history(session,history,pin['model'],str(work))),encoding='utf-8')
                    result=subprocess.run([self.executable,'import',str(source)],cwd=work,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20,creationflags=flags)
                    source.unlink()
                    if result.returncode:raise ValueError('OpenCode could not restore the bounded conversation history.')
                    restored=request('GET','/session/'+session['id']+'/message')
                    if len(restored)!=len(history) or any(m.get('info',{}).get('role')!=h['role'] or ''.join(p.get('text','') for p in m.get('parts',[]) if p.get('type')=='text')!=h['content'] for m,h in zip(restored,history)):raise ValueError('OpenCode did not confirm the exact canonical history.')
                stage='model reply'
                result=request('POST','/session/'+session['id']+'/message',{'agent':AGENT,'model':{'providerID':PROVIDER,'modelID':pin['model']},'system':SYSTEM,'tools':{'*':False},'parts':[{'type':'text','text':question}]})
                info=result.get('info',{});parts=result.get('parts',[])
                if cancelled.is_set() or info.get('error') or info.get('role')!='assistant' or not info.get('time',{}).get('completed') or any(p.get('type') in {'tool','subtask'} for p in parts):raise ValueError('OpenCode did not confirm a completed tools-closed reply.')
                answer=''.join(p.get('text','') for p in parts if p.get('type')=='text')
                if not answer.strip():raise ValueError('OpenCode returned no completed reply.')
                return {'ok':True,'runtime':'OpenCode','model':pin['model'],'effective_tools':[],'memory':False,'text':answer[:26000]}
            except Exception:
                raise ValueError('OpenCode chat did not complete during '+stage+'. Check your provider key, model access and connection; no automatic retry was made.') from None
            finally:
                finished.set()
                stop();watcher.join(timeout=1)
