import catalog from '../../../wayfinder/model-providers.json';
export const providers=catalog;
export function providerFor(id:unknown){return providers.find(p=>p.id===id);}
export const validModelID=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:/@+\-]{0,199}$/.test(value);
export function customEndpoint(value:unknown):string{
  if(typeof value!=='string'||value.length>500||/[\s{}\\]/.test(value))throw new Error('Enter an HTTPS API base URL.');
  let url:URL;try{url=new URL(value);}catch{throw new Error('Enter an HTTPS API base URL.');}
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.search||url.hash)throw new Error('Use an HTTPS base URL without credentials, query parameters or fragments.');
  return url.href.replace(/\/$/,'');
}
export function validModelPin(value:any){
  if(!value||Object.keys(value).sort().join(',')!=='endpoint,model,provider'||!validModelID(value.model))return false;
  if(value.provider==='custom')return value.endpoint==='integrate.api.nvidia.com'&&providerFor('nvidia')!.models.includes(value.model);
  const provider=providerFor(value.provider);if(!provider)return false;
  if(provider.id==='openai-compatible'){try{return customEndpoint(value.endpoint)===value.endpoint;}catch{return false;}}
  return value.endpoint===new URL(provider.base_url).hostname;
}
