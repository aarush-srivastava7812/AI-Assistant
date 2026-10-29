import {createServer} from 'node:http';
import {randomBytes,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
export const GOOGLE_SCOPES:Record<string,string>={calendar:'calendar.readonly',tasks:'tasks.readonly',gmail:'gmail.readonly',drive:'drive.readonly',docs:'documents.readonly',sheets:'spreadsheets.readonly',contacts:'contacts.readonly'};
/** Main-owned loopback OAuth. No token/code/client secret is returned to a renderer. */
export async function connectGoogle(clientFile:string,services:unknown,open:(url:string)=>Promise<void>){
 if(!Array.isArray(services)||!services.length||services.length>7||services.some(s=>typeof s!=='string'||!GOOGLE_SCOPES[s]))throw new Error('Choose at least one supported Google read permission.');
 const stat=await fs.lstat(clientFile);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768)throw new Error('Choose a Google Desktop OAuth client JSON.');
 let client:any;try{client=JSON.parse(await fs.readFile(clientFile,'utf8')).installed;}catch{throw new Error('Choose a valid Google Desktop OAuth client JSON.');}
 if(!client||typeof client.client_id!=='string'||!client.client_id.endsWith('.apps.googleusercontent.com')||typeof client.client_secret!=='string'||client.client_secret.length>2000||!['https://accounts.google.com/o/oauth2/auth','https://accounts.google.com/o/oauth2/v2/auth'].includes(client.auth_uri)||client.token_uri!=='https://oauth2.googleapis.com/token')throw new Error('A valid Google Desktop OAuth client is required.');
 const scopes=[...new Set(services.map(s=>'https://www.googleapis.com/auth/'+GOOGLE_SCOPES[s]))];
 const state=randomBytes(32).toString('hex'),verifier=randomBytes(48).toString('base64url');let resolve!:(code:string)=>void,reject!:(error:Error)=>void;
 const code=new Promise<string>((ok,fail)=>{resolve=ok;reject=fail;});void code.catch(()=>{});
 const server=createServer((request,response)=>{const url=new URL(request.url||'','http://127.0.0.1');if(request.method!=='GET'||url.pathname!=='/callback'||url.searchParams.get('state')!==state){response.writeHead(400).end('Invalid sign-in response.');return;}if(url.searchParams.has('error')){response.end('Sign-in cancelled. Return to Wayfinder.');reject(new Error('Google sign-in was cancelled.'));return;}const value=url.searchParams.get('code');if(!value||value.length>4096){response.writeHead(400).end('Invalid sign-in response.');return;}response.setHeader('Content-Type','text/plain; charset=utf-8');response.end('Google sign-in received. You can close this tab and return to Wayfinder.');resolve(value);});
 await new Promise<void>((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});
 const address=server.address();if(!address||typeof address==='string')throw new Error('Local sign-in could not start.');
 const redirect='http://127.0.0.1:'+address.port+'/callback';const timer=setTimeout(()=>reject(new Error('Google sign-in timed out. Try again.')),180000);
 try{
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');url.search=new URLSearchParams({client_id:client.client_id,redirect_uri:redirect,response_type:'code',scope:scopes.join(' '),state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256',access_type:'offline',prompt:'consent',include_granted_scopes:'false'}).toString();
  await open(url.href);const authorization=await code;
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:authorization,client_id:client.client_id,client_secret:client.client_secret,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:verifier}),signal:AbortSignal.timeout(30000),redirect:'error'});
  if(!response.ok)throw new Error('Google could not complete sign-in. Check your Desktop OAuth client and try again.');const token=await response.json() as any;
  if(typeof token.refresh_token!=='string'||typeof token.access_token!=='string')throw new Error('Google did not grant offline access. Try consent again.');
  const granted=typeof token.scope==='string'?token.scope.split(' '):scopes;if(granted.some((s:string)=>!scopes.includes(s)))throw new Error('Google returned permissions beyond your selected scope. Nothing was saved.');
  return JSON.stringify({token:token.access_token,refresh_token:token.refresh_token,token_uri:'https://oauth2.googleapis.com/token',client_id:client.client_id,client_secret:client.client_secret,scopes:granted,expiry:new Date(Date.now()+Number(token.expires_in||3600)*1000).toISOString()});
 }finally{clearTimeout(timer);server.close();server.closeAllConnections();}
}
