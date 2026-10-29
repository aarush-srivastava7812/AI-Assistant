import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ArrowDown,ArrowUp,ChevronDown,History,Info,Plus,RefreshCw,Search,Square,Trash2,Workflow,X} from 'lucide-react';
import type {DesktopAPI,Row} from '../shared/types';
import {Markdown} from './Markdown';

export interface ConversationSession{
  selection:string;
  drafts:Map<string,string>;
  scroll:Map<string,{top:number;following:boolean}>;
}
export const createConversationSession=():ConversationSession=>({selection:'',drafts:new Map(),scroll:new Map()});
const generating=(value:Row)=>value.turns?.some((turn:Row)=>['reserved','running'].includes(turn.status));
const errorText=(error:unknown)=>error instanceof Error?error.message:'The operation was not confirmed.';
const slot=(id:string)=>id||'__new__';
function remember<T>(map:Map<string,T>,key:string,value:T){map.delete(key);map.set(key,value);if(map.size>40)map.delete(map.keys().next().value!);}

export function ChatPanel({api,space,qualified,session,onTask}:{api:DesktopAPI;space:string;qualified:boolean;session?:ConversationSession;onTask?:(goal:string)=>void}){
  const localSessions=useRef(new Map<string,ConversationSession>());
  if(!localSessions.current.has(space))localSessions.current.set(space,createConversationSession());
  const cache=session||localSessions.current.get(space)!;
  const [list,setList]=useState<Row[]>([]),[id,setId]=useState(''),[data,setData]=useState<Row>({turns:[]}),[draft,setDraft]=useState('');
  const [busy,setBusy]=useState(false),[sending,setSending]=useState(false),[listLoading,setListLoading]=useState(true);
  const [historyState,setHistoryState]=useState<'idle'|'loading'|'loaded'|'error'>('idle');
  const [error,setError]=useState(''),[historyError,setHistoryError]=useState(''),[listError,setListError]=useState(''),[notice,setNotice]=useState('');
  const [historyOpen,setHistoryOpen]=useState(false),[filter,setFilter]=useState(''),[deleting,setDeleting]=useState(false),[about,setAbout]=useState(false),[unread,setUnread]=useState(false);
  const epoch=useRef(0),selection=useRef(''),draftValue=useRef(''),lock=useRef(false),active=useRef(false),revision=useRef(0),composing=useRef(false);
  const transcript=useRef<HTMLDivElement>(null),input=useRef<HTMLTextAreaElement>(null),historySearch=useRef<HTMLInputElement>(null),historyToggle=useRef<HTMLButtonElement>(null);
  const following=useRef(true),restore=useRef<{top:number;following:boolean}|null>(null),prepend=useRef<{height:number;top:number}|null>(null),focusAfterLoad=useRef(false);
  const pendingKey='wayfinder-pending-chat:'+space;
  const loading=listLoading||historyState==='loading';
  active.current=!!generating(data);
  const canCompose=!loading&&!(historyError&&!data.turns?.length);

  function savePosition(){const node=transcript.current;if(node&&selection.current)remember(cache.scroll,selection.current,{top:node.scrollTop,following:following.current});}
  function changeDraft(value:string){draftValue.current=value;remember(cache.drafts,slot(selection.current),value);setDraft(value);}
  function choose(value:string,{save=true,draft:replacement}:{save?:boolean;draft?:string}={}){
    if(save){remember(cache.drafts,slot(selection.current),draftValue.current);savePosition();}
    revision.current++;selection.current=value;cache.selection=value;
    const text=replacement??cache.drafts.get(slot(value))??'';draftValue.current=text;setDraft(text);remember(cache.drafts,slot(value),text);
    setId(value);setData({turns:[]});setHistoryState(value?'loading':'idle');setHistoryError('');setError('');setNotice('');setDeleting(false);setHistoryOpen(false);setUnread(false);
    restore.current=value?cache.scroll.get(value)||null:null;following.current=restore.current?.following??true;prepend.current=null;
  }

  useEffect(()=>{
    const current=++epoch.current;lock.current=false;setBusy(false);setSending(false);setList([]);setListError('');setListLoading(true);
    choose(cache.selection,{save:false});
    void api.chats(space).then(rows=>{if(current!==epoch.current)return;setList(rows);if(!selection.current&&rows.length)choose(rows[0].id,{save:false});})
      .catch(error=>{if(current===epoch.current)setListError(errorText(error));}).finally(()=>{if(current===epoch.current)setListLoading(false);});
    return()=>{epoch.current++;remember(cache.drafts,slot(selection.current),draftValue.current);savePosition();};
  },[api,space,cache]);

  useEffect(()=>{
    if(!id)return;let alive=true,polling=false;setHistoryState('loading');
    async function read(){
      if(polling)return;polling=true;const version=revision.current;
      const valid=()=>alive&&selection.current===id&&version===revision.current;
      try{const result=await api.chat(space,id);if(valid()){setData(result);setHistoryState('loaded');setHistoryError('');if(!following.current)setUnread(true);}}
      catch(error){if(valid()){setHistoryError(errorText(error));setHistoryState('error');}}
      finally{polling=false;}
    }
    void read();const timer=setInterval(()=>{if(active.current)void read();},1800);
    return()=>{alive=false;clearInterval(timer);};
  },[api,space,id]);

  useLayoutEffect(()=>{
    const node=transcript.current;if(!node||historyState!=='loaded')return;
    if(prepend.current){node.scrollTop=prepend.current.top+node.scrollHeight-prepend.current.height;prepend.current=null;}
    else if(restore.current){following.current=restore.current.following;node.scrollTop=restore.current.following?node.scrollHeight:restore.current.top;restore.current=null;setUnread(false);}
    else if(following.current)node.scrollTop=node.scrollHeight;
    savePosition();if(focusAfterLoad.current){focusAfterLoad.current=false;input.current?.focus({preventScroll:true});}
  },[data,historyState]);
  useLayoutEffect(()=>{const node=input.current;if(node){node.style.height='auto';node.style.height=Math.min(180,Math.max(54,node.scrollHeight))+'px';}if(following.current&&transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight;},[draft,id]);
  useEffect(()=>{if(historyOpen)historySearch.current?.focus({preventScroll:true});},[historyOpen]);

  async function perform(job:(valid:()=>boolean,adopt:(id:string,options?:{save?:boolean;draft?:string})=>boolean)=>Promise<void>){
    if(lock.current)return;const current=epoch.current;let expected=selection.current;
    const valid=()=>current===epoch.current&&expected===selection.current;
    const adopt=(next:string,options?:{save?:boolean;draft?:string})=>{if(!valid())return false;choose(next,options);expected=next;return true;};
    lock.current=true;setBusy(true);setError('');setNotice('');
    try{await job(valid,adopt);}catch(error){if(valid())setError(errorText(error));}
    finally{if(current===epoch.current){lock.current=false;setBusy(false);setSending(false);}}
  }
  function create(){void perform(async(valid,adopt)=>{const row=await api.newChat(space);if(valid()){setList(old=>[row,...old]);focusAfterLoad.current=true;adopt(row.id);}});}
  async function updateRecent(valid:()=>boolean,accepted=false){try{const rows=await api.chats(space);if(valid()){setList(rows);setListError('');}}catch(error){if(valid()){setListError(errorText(error));if(accepted)setNotice('Message accepted. Recent conversation titles could not be refreshed.');}}}
  function send(){
    if(!canCompose||!draft.trim()||generating(data))return;const text=draft;
    void perform(async(valid,adopt)=>{
      const pending=localStorage.getItem(pendingKey);
      if(pending){
        let previous:Row;try{previous=JSON.parse(pending);if(typeof previous.conversation!=='string'||typeof previous.request!=='string')throw new Error();}
        catch{localStorage.removeItem(pendingKey);throw new Error('The previous send hint was invalid. Nothing was sent. Review the conversation before sending again.');}
        const known=await api.lookupChat(space,previous.conversation,previous.request);if(!valid())return;localStorage.removeItem(pendingKey);
        if(known.accepted){
          if(previous.conversation===selection.current){const observed=await api.chat(space,previous.conversation);if(!valid())return;revision.current++;setData(observed);setHistoryState('loaded');}
          else adopt(previous.conversation);
          setNotice('The previous send was accepted. Its conversation is open; no new message was sent.');
        }else setNotice('The previous send was not acknowledged. Nothing was replayed. Review the conversation, then explicitly send a new message.');
        return;
      }
      setSending(true);let cid=selection.current,newRow:Row|null=null;
      if(!cid){newRow=await api.newChat(space);if(!valid())return;cid=newRow.id;}
      revision.current++;following.current=true;setUnread(false);
      const request=crypto.randomUUID();localStorage.setItem(pendingKey,JSON.stringify({conversation:cid,request}));
      let result:Row;
      try{result=await api.sendChat(space,cid,request,text);localStorage.removeItem(pendingKey);}
      catch(error){throw new Error(errorText(error)+' No automatic retry was made. Check the conversation before sending again.');}
      if(!valid())return;
      const remaining=draftValue.current===text?'':draftValue.current;
      if(newRow){cache.drafts.delete('__new__');adopt(cid,{save:false,draft:remaining});setList(old=>[newRow!,...old]);}
      else changeDraft(remaining);
      setData(result);setHistoryState('loaded');setHistoryError('');setSending(false);
      await updateRecent(valid,true);
    });
  }
  function stop(){const turn=data.turns?.find((t:Row)=>['reserved','running'].includes(t.status));if(!turn)return;void perform(async valid=>{revision.current++;const result=await api.cancelChat(space,id,turn.id);if(valid()){setData(result);setHistoryState('loaded');}});}
  function refresh(){void perform(async valid=>{
    revision.current++;const results=await Promise.allSettled([api.chats(space),id?api.chat(space,id):Promise.resolve({turns:[]})]);if(!valid())return;
    if(results[0].status==='fulfilled'){setList(results[0].value);setListError('');}else setListError(errorText(results[0].reason));
    if(results[1].status==='fulfilled'){setData(results[1].value);setHistoryError('');setHistoryState(id?'loaded':'idle');setNotice('Conversation refreshed. Nothing was replayed.');}
    else{setHistoryError(errorText(results[1].reason));setHistoryState('error');}
  });}
  function remove(){void perform(async(valid,adopt)=>{revision.current++;await api.deleteChat(space,id);if(!valid())return;cache.drafts.delete(id);cache.scroll.delete(id);const rows=await api.chats(space);if(valid()){setList(rows);adopt(rows[0]?.id||'',{save:false});}});}
  function earlier(){void perform(async valid=>{
    revision.current++;const node=transcript.current,anchor=node?{height:node.scrollHeight,top:node.scrollTop}:null;
    const older=await api.chat(space,id,data.before);if(valid()){following.current=false;prepend.current=anchor;setData(current=>({...current,turns:[...older.turns,...current.turns],before:older.before,has_more:older.has_more}));}
  });}
  function latest(){following.current=true;restore.current=null;setUnread(false);if(transcript.current)transcript.current.scrollTop=transcript.current.scrollHeight;savePosition();}
  const title=list.find(row=>row.id===id)?.title||(id?'Conversation':'New conversation');
  const filtered=list.filter(row=>String(row.title).toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const blank=!loading&&!historyError&&!data.turns?.length;

  return <div className="chat-panel conversation-workspace" data-conversation-id={id||undefined}>
    <header className="conversation-header"><div className="conversation-heading"><button ref={historyToggle} className="icon-button" aria-label="Recent conversations" aria-expanded={historyOpen} aria-controls="recent-conversations" title="Recent conversations" onClick={()=>setHistoryOpen(value=>!value)}><History size={18}/></button><h1 title={title}>{title}</h1></div><div className="conversation-actions"><button className="icon-button" disabled={busy} onClick={refresh} aria-label="Refresh conversation" title="Refresh conversation"><RefreshCw size={16}/></button><button className="icon-button" disabled={busy||generating(data)} onClick={create} aria-label="New conversation" title="New conversation"><Plus size={20}/></button><button className="icon-button" aria-label="Delete conversation" title="Delete conversation" disabled={busy||!id||loading||generating(data)} onClick={()=>setDeleting(true)}><Trash2 size={16}/></button></div></header>
    {historyOpen&&<aside id="recent-conversations" className="conversation-history" aria-label="Recent conversations" onKeyDown={e=>{if(e.key==='Escape'){setHistoryOpen(false);historyToggle.current?.focus();}}}><div className="conversation-history-heading"><strong>Recent conversations</strong><button className="icon-button" aria-label="Close recent conversations" onClick={()=>{setHistoryOpen(false);historyToggle.current?.focus();}}><X size={16}/></button></div><label className="conversation-search"><Search size={15}/><span className="sr-only">Search recent conversations</span><input ref={historySearch} value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Find a recent conversation"/></label>{listError&&<p role="alert">{listError} <button disabled={busy} onClick={refresh}>Retry list</button></p>}<div className="conversation-history-list">{filtered.map(row=><button className="conversation-history-row" aria-current={id===row.id?'true':undefined} key={row.id} disabled={busy} onClick={()=>choose(row.id)}><span>{row.title}</span>{id===row.id&&<ChevronDown size={13}/>}</button>)}{!filtered.length&&<p>{listLoading?'Loading recent conversations…':filter?'No matching recent conversation.':'No recent conversations in this space.'}</p>}</div><small>Search covers the returned recent titles in this space.</small></aside>}
    {(error||notice||historyError||deleting)&&<div className="conversation-notices">
      {error&&<p className="message error" role="alert">{error}</p>}{notice&&<p className="message" role="status">{notice}</p>}
      {historyError&&<div className="message error" role="alert"><span>Conversation history could not be loaded: {historyError}</span><button disabled={busy} onClick={refresh}>Retry history</button></div>}
      {deleting&&<section className="delete-review" aria-label="Delete conversation review"><strong>Delete this local conversation?</strong><p>This removes its chat and worker artifacts. Memory, backups and provider records remain.</p><div className="inline-actions"><button disabled={busy} onClick={()=>setDeleting(false)}>Keep conversation</button><button className="danger" disabled={busy} onClick={remove}>Delete this conversation</button></div></section>}
    </div>}
    <div className="chat-history" ref={transcript} role="log" aria-label="Conversation messages" aria-live="polite" aria-busy={loading} onScroll={()=>{const node=transcript.current;if(node){following.current=node.scrollHeight-node.scrollTop-node.clientHeight<80;if(following.current)setUnread(false);savePosition();}}}>
      <div className="conversation-reading-column">
        {loading&&!data.turns?.length?<p className="chat-loading" role="status">Loading your conversation…</p>:blank?<div className="chat-welcome"><h2>What would you like to work on?</h2><p>Think through an idea, ask a question, or start a draft.</p><div className="chat-starters">{['Help me think through a decision','Explain a concept step by step','Help me draft something clear'].map(prompt=><button key={prompt} onClick={()=>{changeDraft(prompt);input.current?.focus({preventScroll:true});}}>{prompt}</button>)}</div></div>:null}
        {!!data.turns?.length&&<>{data.has_more&&<button className="load-earlier" disabled={busy||generating(data)} onClick={earlier}>Load earlier messages</button>}{data.turns.map((turn:Row)=><article className="chat-turn" key={turn.id} aria-label="Conversation turn"><div className="chat-user"><span className="sr-only">You</span><p>{turn.user_text}</p></div><div className="chat-assistant"><span className="sr-only">Wayfinder</span>{turn.assistant_text?<Markdown text={turn.assistant_text}/>:<p className="generation-state" role={['reserved','running'].includes(turn.status)?'status':undefined}>{['reserved','running'].includes(turn.status)?<><span className="activity-pulse"/>{turn.status==='reserved'?'Request accepted · waiting for worker':'Generating a reply…'}</>:turn.warning||turn.status}</p>}{turn.assistant_text&&turn.warning&&<p className="turn-status">{turn.warning}</p>}{turn.status!=='completed'&&!['reserved','running'].includes(turn.status)&&<small className={`turn-status ${turn.status}`}>{turn.status}</small>}</div></article>)}</>}
      </div>
    </div>
    {unread&&<button className="conversation-latest" onClick={latest}><ArrowDown size={14}/>Latest messages</button>}
    <footer className="conversation-compose-region"><form className="chat-compose" aria-label="Message composer" onSubmit={e=>{e.preventDefault();send();}}><label className="sr-only" htmlFor="chat-message">Message</label><textarea ref={input} id="chat-message" rows={2} maxLength={4000} value={draft} disabled={!canCompose} onChange={e=>changeDraft(e.target.value)} onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&!composing.current&&e.keyCode!==229){e.preventDefault();send();}}} placeholder="Ask Wayfinder anything…"/><div className="composer-actions"><button type="button" className="icon-button" aria-label="About this chat" aria-expanded={about} onClick={()=>setAbout(value=>!value)}><Info size={16}/></button>{onTask&&<button type="button" className="icon-button" aria-label="Plan a source task" title="Open a source workflow draft" disabled={!draft.trim()||busy||generating(data)} onClick={()=>onTask(draft)}><Workflow size={16}/></button>}<span>{sending?'Sending…':generating(data)?'You can draft a follow-up while the reply finishes.':'Enter to send · Shift+Enter for a new line'}</span>{generating(data)?<button type="button" disabled={busy} onClick={stop}><Square size={14}/>Stop generating</button>:<button className="primary send-message" aria-label="Send message" disabled={busy||!canCompose||!draft.trim()}><ArrowUp size={18}/></button>}</div></form>{about?<p className="chat-footnote">Chat uses your approved OpenCode model{!qualified?' and rechecks its connection before sending':''}. It has no tools and does not save facts to memory automatically. Up to six completed pairs are sent as context. Stopping locally does not confirm provider abort or billing.</p>:<p className="chat-footnote">Wayfinder can make mistakes. Review important information.</p>}</footer>
  </div>;
}
