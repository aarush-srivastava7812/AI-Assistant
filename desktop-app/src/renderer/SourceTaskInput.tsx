import React from 'react';
import type {Row} from '../shared/types';

export const googleSources:Record<string,string>={calendar:'Calendar events',tasks:'Tasks',gmail_headers:'Gmail headers and snippets',gmail_message:'Selected Gmail plain text',drive:'Drive metadata',docs:'Docs metadata',docs_text:'Docs first-tab paragraphs',sheets:'Sheets metadata',sheets_values:'Selected sheet cells'};
export const resourceDefaults:Record<string,string>={calendar:'primary',tasks:'@default',gmail_headers:'INBOX',drive:'root'};
export interface SourceInput {kind:'file'|'google'|'external';operation:string;resource:string;range:string;query:string;start:string;end:string}
export function sourceRequest(input:SourceInput):Row {
  if(input.kind==='google'&&input.operation==='calendar'){
    const offset=/(Z|[+-]\d{2}:\d{2})$/;
    const duration=Date.parse(input.end)-Date.parse(input.start);
    if(!offset.test(input.start)||!offset.test(input.end)||!Number.isFinite(duration)||duration<=0||duration>31*86400000)throw new Error('Use an ISO start and end with timezone offsets, at most 31 days apart.');
  }
  if(input.kind==='external')return input.operation==='notion'?{provider:'notion',intent:'read',item:input.resource}:{provider:'tavily',intent:'search',query:input.query};
  return {service:input.operation,resource:input.resource,limit:['gmail_message','docs_text','sheets_values'].includes(input.operation)?1:3,
    ...(input.operation==='sheets_values'?{range:input.range}:{}),
    ...(input.operation==='calendar'?{time_min:new Date(input.start).toISOString(),time_max:new Date(input.end).toISOString()}:{} )};
}
export function SourceTaskInput({value,onChange,operations}:{value:SourceInput;onChange:(value:SourceInput)=>void;operations?:string[]}){
  const patch=(fields:Partial<SourceInput>)=>onChange({...value,...fields});
  const choices=value.kind==='google'?googleSources:{notion:'Selected shared Notion page',tavily:'Public Tavily search'};
  return <>
    <label>Selected source operation<select value={value.operation} onChange={event=>patch({operation:event.target.value,resource:resourceDefaults[event.target.value]||''})}>{Object.entries(choices).filter(([id])=>!operations||operations.includes(id)).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    {value.operation==='tavily'?<label>Public search query<input value={value.query} maxLength={400} onChange={event=>patch({query:event.target.value})}/></label>:<label>Exact source resource<input value={value.resource} maxLength={200} placeholder={value.operation==='notion'?'Shared page ID':value.operation==='gmail_message'?'Selected message ID':'Calendar, task list, folder or document ID'} onChange={event=>patch({resource:event.target.value})}/></label>}
    {value.operation==='sheets_values'&&<label>Exact cells<input value={value.range} maxLength={100} onChange={event=>patch({range:event.target.value})}/></label>}
    {value.operation==='calendar'&&<><label>Window start (ISO with timezone)<input value={value.start} onChange={event=>patch({start:event.target.value})}/></label><label>Window end (ISO with timezone)<input value={value.end} onChange={event=>patch({end:event.target.value})}/></label></>}
    <p className="hint">Only this bounded read is disclosed after trusted review. Metadata, snippets and partial excerpts remain partial. Account permission is checked for this operation. No send or write is available.</p>
  </>;
}
