import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {AnimatedChatOverlay} from './AnimatedChatOverlay';
import {ChatPanel} from '../Chat';
import type {BackendState} from '../../shared/types';
import './pet-api';
import '../app.css';
import './companion.css';
function OverlayApp(){
 const [backend,setBackend]=useState<BackendState>({state:'starting'}),[space,setSpace]=useState('');
 useEffect(()=>{let live=true,pending=false;const refresh=async()=>{if(pending)return;pending=true;try{const context=await window.companionAPI.getContext();const state=await window.wayfinder.connect();if(live){setSpace(context.space);setBackend(state);}}catch{if(live){setBackend({state:'offline'});setSpace('');}}finally{pending=false;}};void refresh();const timer=setInterval(()=>void refresh(),1000);return()=>{live=false;clearInterval(timer);};},[]);
 const close=()=>void window.companionAPI.hideOverlay();
 return <AnimatedChatOverlay onClose={close} chatContent={backend.state==='ready'&&space?<ChatPanel key={`${backend.owner}:${backend.instance_generation}:${space}`} api={window.wayfinder} space={space} qualified={!!backend.capabilities?.general_chat}/>:<div className="wf-no-space"><strong>{backend.state==='ready'?'Select a space in Wayfinder':backend.state==='setup'?'Complete setup in Wayfinder':'Waiting for Wayfinder'}</strong><p>The companion uses the main window’s selected space and existing conversation service.</p><button onClick={()=>void window.companionAPI.focusMain()}>Open Wayfinder</button></div>}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><OverlayApp/></React.StrictMode>);
