import React from 'react';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ChatPanel,createConversationSession} from '../src/renderer/Chat';

beforeEach(()=>localStorage.clear());
afterEach(()=>vi.useRealTimers());
const completed={turns:[{id:'turn',status:'completed',user_text:'Synthetic question',assistant_text:'## Synthetic answer\n\nA useful reply.'}]};
function client(){return {chats:vi.fn(async(space:string)=>[{id:space,title:'Synthetic conversation'}]),chat:vi.fn(async()=>({turns:[]})),sendChat:vi.fn(async()=>completed),newChat:vi.fn(async()=>({id:'new',title:'New conversation'})),cancelChat:vi.fn(async()=>({turns:[]})),lookupChat:vi.fn(async()=>({accepted:true})),deleteChat:vi.fn(async()=>({deleted:true}))} as any;}
async function ready(api:any,space='a'){const view=render(<ChatPanel api={api} space={space} qualified/>);await waitFor(()=>expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).disabled).toBe(false));return view;}

it('sends once on Enter and preserves Shift+Enter and IME composition',async()=>{
  const api=client();await ready(api);const input=screen.getByRole('textbox',{name:'Message'});
  fireEvent.change(input,{target:{value:'Synthetic question'}});
  fireEvent.keyDown(input,{key:'Enter',shiftKey:true});fireEvent.compositionStart(input);fireEvent.keyDown(input,{key:'Enter'});
  expect(api.sendChat).not.toHaveBeenCalled();fireEvent.compositionEnd(input);
  fireEvent.keyDown(input,{key:'Enter'});fireEvent.keyDown(input,{key:'Enter'});
  await screen.findByRole('heading',{name:'Synthetic answer'});
  expect(api.sendChat).toHaveBeenCalledTimes(1);expect(api.sendChat.mock.calls[0]).toEqual(['a','a',expect.any(String),'Synthetic question']);
});

it('does not display a late response or error in another space',async()=>{
  const api=client();let finish!:(value:any)=>void;api.sendChat.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const view=await ready(api);fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'PRIVATE_A'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await waitFor(()=>expect(api.sendChat).toHaveBeenCalledTimes(1));
  await act(async()=>{view.rerender(<ChatPanel api={api} space="b" qualified/>);});
  await act(async()=>{finish({turns:[{id:'old',user_text:'PRIVATE_A',assistant_text:'PRIVATE_A_REPLY',status:'completed'}]});});
  expect(screen.queryByText('PRIVATE_A_REPLY')).toBeNull();expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).value).toBe('');
});

it('observes an uncertain send before allowing another explicit request',async()=>{
  const api=client();api.sendChat.mockRejectedValueOnce(new Error('Acknowledgement lost'));const view=await ready(api);
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'PROMPT_NOT_STORED'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByRole('alert');const hint=localStorage.getItem('wayfinder-pending-chat:a')!;
  expect(hint).not.toContain('PROMPT_NOT_STORED');expect(JSON.parse(hint).request).toBeTruthy();
  api.chat.mockResolvedValue(completed);fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByText(/previous send was accepted/);expect(api.lookupChat).toHaveBeenCalledTimes(1);expect(api.sendChat).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading',{name:'Synthetic answer'})).toBeTruthy();view.unmount();
});

it('stops the known turn and requires a review before deletion',async()=>{
  const api=client();api.chat.mockResolvedValue({turns:[{id:'running',status:'running',user_text:'Question'}]});
  render(<ChatPanel api={api} space="a" qualified/>);await screen.findByText('Generating a reply…');
  fireEvent.click(screen.getByRole('button',{name:'Stop generating'}));await waitFor(()=>expect(api.cancelChat).toHaveBeenCalledWith('a','a','running'));
  await waitFor(()=>expect((screen.getByRole('button',{name:'Delete conversation'}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button',{name:'Delete conversation'}));expect(api.deleteChat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Keep conversation'}));expect(screen.queryByLabelText('Delete conversation review')).toBeNull();
});

it('keeps the composer disabled until the selected conversation history arrives',async()=>{
  const api=client();let finish!:(value:any)=>void;api.chat.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<ChatPanel api={api} space="a" qualified/>);
  await waitFor(()=>expect(api.chat).toHaveBeenCalledWith('a','a'));
  expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).disabled).toBe(true);
  await act(async()=>{finish({turns:[]});});
  expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).disabled).toBe(false);
});

it('does not let an older poll undo a confirmed local cancellation',async()=>{
  vi.useFakeTimers();const api=client();let finish!:(value:any)=>void;
  const running={turns:[{id:'running',status:'running',user_text:'Question'}]};
  api.chat.mockResolvedValueOnce(running).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  await act(async()=>{render(<ChatPanel api={api} space="a" qualified/>);});
  await act(async()=>{vi.advanceTimersByTime(1801);});expect(api.chat).toHaveBeenCalledTimes(2);
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Stop generating'}));});
  expect(screen.queryByRole('button',{name:'Stop generating'})).toBeNull();
  await act(async()=>{finish(running);});
  expect(screen.queryByRole('button',{name:'Stop generating'})).toBeNull();
});

it('preserves a draft across route unmount without storing prompt text',async()=>{
  const api=client(),session=createConversationSession();let view=render(<ChatPanel api={api} space="a" qualified session={session}/>);
  await waitFor(()=>expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).disabled).toBe(false));
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'PRIVATE_DRAFT'}});view.unmount();
  view=render(<ChatPanel api={api} space="a" qualified session={session}/>);
  await waitFor(()=>expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).value).toBe('PRIVATE_DRAFT'));
  expect(JSON.stringify(localStorage)).not.toContain('PRIVATE_DRAFT');expect(api.sendChat).not.toHaveBeenCalled();
});
it('allows editing during generation without silently queueing the draft',async()=>{
  const api=client();api.chat.mockResolvedValue({turns:[{id:'running',status:'running',user_text:'Question'}]});await ready(api);
  const input=screen.getByRole('textbox',{name:'Message'});fireEvent.change(input,{target:{value:'Follow up'}});fireEvent.keyDown(input,{key:'Enter'});
  expect((input as HTMLTextAreaElement).value).toBe('Follow up');expect(api.sendChat).not.toHaveBeenCalled();
});
it('shows a failed history read instead of a false empty welcome',async()=>{
  const api=client();api.chat.mockRejectedValue(new Error('History unavailable'));render(<ChatPanel api={api} space="a" qualified/>);
  await screen.findByText(/Conversation history could not be loaded/);expect(screen.queryByText('What would you like to work on?')).toBeNull();
  expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).disabled).toBe(true);
});
it('keeps an accepted send distinct from a failed recent-title refresh',async()=>{
  const api=client();await ready(api);api.chats.mockRejectedValue(new Error('List unavailable'));
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Synthetic question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByRole('heading',{name:'Synthetic answer'});await screen.findByText(/Message accepted/);expect(api.sendChat).toHaveBeenCalledTimes(1);
});

it('creates the first conversation when explicitly sending from an empty space',async()=>{
  const api=client();api.chats.mockResolvedValue([]);await ready(api);
  fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'First question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await screen.findByRole('heading',{name:'Synthetic answer'});expect(api.newChat).toHaveBeenCalledTimes(1);expect(api.sendChat.mock.calls[0][1]).toBe('new');
});
it('preserves a newer draft typed while an earlier send awaits acknowledgement',async()=>{
  const api=client();let finish!:(value:any)=>void;api.sendChat.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await ready(api);
  const input=screen.getByRole('textbox',{name:'Message'});fireEvent.change(input,{target:{value:'First question'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));
  await waitFor(()=>expect(api.sendChat).toHaveBeenCalledTimes(1));expect((input as HTMLTextAreaElement).disabled).toBe(false);fireEvent.change(input,{target:{value:'Newer draft'}});
  await act(async()=>finish(completed));expect((input as HTMLTextAreaElement).value).toBe('Newer draft');expect(api.sendChat).toHaveBeenCalledTimes(1);
});

it('source task mode opens a draft without sending or executing it',async()=>{
 const api=client(),onTask=vi.fn();render(<ChatPanel api={api} space="a" qualified onTask={onTask}/>);await waitFor(()=>expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).disabled).toBe(false));
 fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Plan from my source'}});fireEvent.click(screen.getByRole('button',{name:'Plan a source task'}));expect(onTask).toHaveBeenCalledWith('Plan from my source');expect(api.sendChat).not.toHaveBeenCalled();
});
