// @vitest-environment node
import {it,expect,vi} from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {get} from 'node:http';
import {connectGoogle} from '../src/main/google-oauth';
const read=(url:string)=>new Promise<number>((resolve,reject)=>{get(url,response=>{response.resume();response.on('end',()=>resolve(response.statusCode!));}).on('error',reject);});
it('rejects web clients and unsupported scopes before opening Google',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-google-')),file=path.join(root,'client.json'),open=vi.fn();
 await fs.writeFile(file,JSON.stringify({web:{client_id:'test.apps.googleusercontent.com'}}));
 await expect(connectGoogle(file,['gmail'],open)).rejects.toThrow(/Desktop/);
 await expect(connectGoogle(file,['full-drive'],open)).rejects.toThrow(/permission/);expect(open).not.toHaveBeenCalled();
});
it('binds sign-in to state and PKCE, exchanges only at Google and retains only selected read scopes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'wayfinder-google-flow-')),file=path.join(root,'client.json');
 await fs.writeFile(file,JSON.stringify({installed:{client_id:'test.apps.googleusercontent.com',client_secret:'synthetic-client',auth_uri:'https://accounts.google.com/o/oauth2/auth',token_uri:'https://oauth2.googleapis.com/token'}}));
 const exchange=vi.fn(async(url:string,options:any)=>{
  expect(url).toBe('https://oauth2.googleapis.com/token');expect(options.body.get('code')).toBe('synthetic-code');expect(options.body.get('code_verifier').length).toBeGreaterThan(43);
  return {ok:true,json:async()=>({refresh_token:'synthetic-refresh',access_token:'synthetic-access',scope:'https://www.googleapis.com/auth/gmail.readonly',expires_in:3600})};
 });vi.stubGlobal('fetch',exchange);
 try{const result=await connectGoogle(file,['gmail'],async value=>{
  const url=new URL(value);expect(url.origin).toBe('https://accounts.google.com');expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
  const callback=new URL(url.searchParams.get('redirect_uri')!);expect(callback.hostname).toBe('127.0.0.1');callback.search=new URLSearchParams({state:'wrong',code:'injected'}).toString();expect(await read(callback.href)).toBe(400);
  callback.search=new URLSearchParams({state:url.searchParams.get('state')!,code:'synthetic-code'}).toString();expect(await read(callback.href)).toBe(200);
 });expect(JSON.parse(result).scopes).toEqual(['https://www.googleapis.com/auth/gmail.readonly']);expect(exchange).toHaveBeenCalledTimes(1);}finally{vi.unstubAllGlobals();}
});
