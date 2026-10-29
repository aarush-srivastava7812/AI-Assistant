"""Exercise bundled OpenCode SDKs against local synthetic streaming APIs.

No vendor accounts or real credentials. The production route is validated first;
only this test-owned OpenCode config is pointed at a loopback fixture.
"""
import json,os,subprocess,tempfile,threading,time,base64,socket,sys
from pathlib import Path
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT))
from wayfinder.workers.model_routes import PROVIDERS
from wayfinder.workers.opencode import configuration,isolated_environment,PROVIDER,AGENT
TEXT='Synthetic provider transport verified.'

class Fixture(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_POST(self):
  data=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  self.server.calls.append((self.path,dict(self.headers),data))
  self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
  def emit(value,event=None):
   if event:self.wfile.write(('event: '+event+'\n').encode())
   self.wfile.write(('data: '+(value if isinstance(value,str) else json.dumps(value))+'\n\n').encode());self.wfile.flush()
  mode=self.server.mode
  if mode=='chat_completions':
   for delta,finish in [({'role':'assistant','content':TEXT},None),({},'stop')]:emit(dict(id='chatcmpl_test',object='chat.completion.chunk',created=1,model='fixture-model',choices=[dict(index=0,delta=delta,finish_reason=finish)]))
   emit('[DONE]')
  elif mode=='anthropic_messages':
   events=[('message_start',dict(message=dict(id='msg_test',type='message',role='assistant',model='fixture-model',content=[],stop_reason=None,stop_sequence=None,usage=dict(input_tokens=1,output_tokens=0)))),('content_block_start',dict(index=0,content_block=dict(type='text',text=''))),('content_block_delta',dict(index=0,delta=dict(type='text_delta',text=TEXT))),('content_block_stop',dict(index=0)),('message_delta',dict(delta=dict(stop_reason='end_turn',stop_sequence=None),usage=dict(output_tokens=6))),('message_stop',{})]
   for event,body in events:emit(dict(type=event,**body),event)
  elif mode=='google_native':
   emit(dict(candidates=[dict(content=dict(role='model',parts=[dict(text=TEXT)]),finishReason='STOP',index=0)],usageMetadata=dict(promptTokenCount=1,candidatesTokenCount=6,totalTokenCount=7),modelVersion='fixture-model'))
  else:
   item=dict(id='msg_test',type='message',status='completed',role='assistant',content=[dict(type='output_text',text=TEXT,annotations=[])])
   response=dict(id='resp_test',object='response',created_at=1,status='completed',model='fixture-model',output=[item],usage=dict(input_tokens=1,output_tokens=6,total_tokens=7,input_tokens_details=dict(cached_tokens=0),output_tokens_details=dict(reasoning_tokens=0)))
   events=[('response.created',dict(response=dict(response,status='in_progress',output=[]))),('response.output_item.added',dict(output_index=0,item=dict(item,status='in_progress',content=[]))),('response.content_part.added',dict(item_id='msg_test',output_index=0,content_index=0,part=dict(type='output_text',text='',annotations=[]))),('response.output_text.delta',dict(item_id='msg_test',output_index=0,content_index=0,delta=TEXT)),('response.output_text.done',dict(item_id='msg_test',output_index=0,content_index=0,text=TEXT)),('response.output_item.done',dict(output_index=0,item=item)),('response.completed',dict(response=response))]
   for n,(event,body) in enumerate(events):emit(dict(type=event,sequence_number=n,**body),event)

def run(provider_id):
 spec=PROVIDERS[provider_id];route=dict(provider=provider_id,model='fixture-model',api_key='SYNTHETIC-fixture-key',api_mode=spec['api_mode'],base_url=spec['base_url'])
 server=ThreadingHTTPServer(('127.0.0.1',0),Fixture);server.calls=[];server.mode=route['api_mode'];thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 with tempfile.TemporaryDirectory(prefix='wayfinder-provider-fixture-') as temporary:
  root=Path(temporary);work=root/'work';work.mkdir();env=isolated_environment(root,route,'synthetic-service-password')
  config=configuration(route);config['provider'][PROVIDER]['options']['baseURL']='http://127.0.0.1:'+str(server.server_port)+'/v1';env['OPENCODE_CONFIG_CONTENT']=json.dumps(config)
  with socket.socket() as listener:listener.bind(('127.0.0.1',0));port=listener.getsockname()[1]
  flags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0
  child=subprocess.Popen([str(ROOT/'desktop-app/resources/setup/opencode.exe'),'serve','--hostname','127.0.0.1','--port',str(port)],cwd=work,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,creationflags=flags)
  auth=base64.b64encode(b'wayfinder:synthetic-service-password').decode()
  def request(method,path,body=None):
   request=Request(f'http://127.0.0.1:{port}'+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Authorization':'Basic '+auth,'Content-Type':'application/json'})
   with urlopen(request,timeout=35) as response:return json.load(response)
  try:
   for _ in range(100):
    try:
     if request('GET','/global/health')['healthy']:break
    except Exception:time.sleep(.1)
   session=request('POST','/session',{'permission':[{'permission':'*','pattern':'*','action':'deny'}]})
   result=request('POST','/session/'+session['id']+'/message',dict(agent=AGENT,model=dict(providerID=PROVIDER,modelID=route['model']),tools={'*':False},parts=[dict(type='text',text='Synthetic transport check.')]))
   text=''.join(p.get('text','') for p in result.get('parts',[]) if p['type']=='text')
   assert not result['info'].get('error') and text==TEXT,(provider_id,result['info'].get('error'),text)
   assert server.calls and all('SYNTHETIC-fixture-key' in str(headers) for _,headers,_ in server.calls)
   path=server.calls[-1][0]
   assert {'chat_completions':'/chat/completions','responses':'/responses','anthropic_messages':'/messages','google_native':':streamGenerateContent'}[route['api_mode']] in path
   return dict(provider=provider_id,protocol=route['api_mode'],passed=True,synthetic_only=True,requests=len(server.calls))
  finally:
   if child.poll() is None:
    subprocess.run(['taskkill','/PID',str(child.pid),'/T','/F'],creationflags=flags,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10);child.wait(timeout=10)
   server.shutdown();server.server_close();thread.join(timeout=2)

if __name__=='__main__':
 rows=[]
 for provider in ['nvidia','openai','anthropic','google','minimax']:
  row=run(provider);rows.append(row);print(json.dumps(row),flush=True)
 (ROOT/'desktop-app/test-results/provider-protocols.json').write_text(json.dumps(dict(engine='OpenCode 1.19.5',checks=rows,passed=len(rows),live_vendors=False),indent=2)+'\n')
