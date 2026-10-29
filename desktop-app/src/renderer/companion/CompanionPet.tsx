import React, { useState,useEffect } from 'react';
import { MessageCircle, AppWindow, Settings2, EyeOff, ChevronRight, Sparkles, Circle, Clock3, ShieldCheck, AlertTriangle, Plus } from 'lucide-react';
import type { CompanionPetProps, CompanionShortcut } from './contracts';
import './companion.css';

const statusLabel: Record<CompanionShortcut['status'], string> = {
  ready: 'Ready', running: 'Running', approval: 'Awaiting approval',
  'missing-inputs': 'Needs input', unavailable: 'Unavailable', failed: 'Failed'
};
const StatusIcon = ({ status }: { status: CompanionShortcut['status'] }) => {
  if (status === 'running') return <Clock3 size={13} />;
  if (status === 'approval') return <ShieldCheck size={13} />;
  if (status === 'failed' || status === 'unavailable' || status === 'missing-inputs') return <AlertTriangle size={13} />;
  return <Circle size={10} />;
};

function PetGlyph() {
  return <svg className="wf-pet-glyph" viewBox="0 0 100 100" role="img" aria-label="Wayfinder companion">
    <defs>
      <linearGradient id="wfPetShell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3DE3F1"/><stop offset="1" stopColor="#4D78FF"/></linearGradient>
    </defs>
    <path d="M22 32 L17 12 L39 24 Q50 19 61 24 L83 12 L78 34 Q86 45 82 62 Q76 82 50 84 Q24 82 18 62 Q14 45 22 32Z" fill="url(#wfPetShell)" stroke="#9AF4FA" strokeWidth="2"/>
    <path d="M27 43 Q50 33 73 43 L70 62 Q50 76 30 62Z" fill="#0B1424" stroke="#1B3652" strokeWidth="2"/>
    <ellipse cx="39" cy="52" rx="4.5" ry="6" fill="#BDFBFF"/><ellipse cx="61" cy="52" rx="4.5" ry="6" fill="#BDFBFF"/>
    <path d="M43 64 Q50 69 57 64" fill="none" stroke="#65E8ED" strokeWidth="2.5" strokeLinecap="round"/>
    <circle cx="50" cy="12" r="4" fill="#DDFDFF"/><path d="M50 2V6 M40 9L44 11 M60 9L56 11" stroke="#DDFDFF" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}

export function CompanionPet({ shortcuts, onOpenChat, onRunShortcut, onOpenApp, onOpenSettings, onHidePet }: CompanionPetProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(()=>{void window.companionAPI?.resizePet?.(menuOpen);},[menuOpen]);
  const run = (shortcut: CompanionShortcut | null) => {
    if (!shortcut || shortcut.status !== 'ready') return;
    setMenuOpen(false);
    onRunShortcut(shortcut);
  };

  return <div className="wf-pet-root" aria-label="Wayfinder desktop companion">
    {menuOpen && <>
      <button className="wf-menu-scrim" aria-label="Close companion menu" onClick={() => setMenuOpen(false)} />
      <section className="wf-pet-menu" aria-label="Companion quick menu">
        <header className="wf-pet-menu-head"><div><span className="wf-eyebrow">WAYFINDER // QUICK ACTIONS</span><strong>What should we do?</strong></div><span className="wf-live-dot" title="Companion active" /></header>
        <div className="wf-shortcut-list">
          {shortcuts.map((shortcut, index) => <button key={shortcut?.id ?? `empty-${index}`} className={`wf-shortcut ${shortcut ? `is-${shortcut.status}` : 'is-empty'}`} disabled={!shortcut || shortcut.status !== 'ready'} onClick={() => run(shortcut)}>
            <span className="wf-slot-number">0{index + 1}</span>
            <span className="wf-shortcut-copy"><strong>{shortcut?.label ?? 'Empty shortcut slot'}</strong><small>{shortcut ? (shortcut.detail || statusLabel[shortcut.status]) : 'Pin an available workflow from Wayfinder'}</small></span>
            {shortcut ? <StatusIcon status={shortcut.status} /> : <Plus size={15} />}
          </button>)}
        </div>
        <div className="wf-pet-menu-actions">
          <button className="wf-action-primary" onClick={() => { setMenuOpen(false); onOpenChat(); }}><MessageCircle size={16} />Ask Wayfinder</button>
          <button onClick={() => { setMenuOpen(false); onOpenApp(); }}><AppWindow size={15} />Open Wayfinder</button>
          <button onClick={() => { setMenuOpen(false); onOpenSettings(); }}><Settings2 size={15} />Widget settings</button>
          <button onClick={() => { setMenuOpen(false); onHidePet(); }}><EyeOff size={15} />Hide pet</button>
        </div>
      </section>
    </>}
    <button className={`wf-pet-button ${menuOpen ? 'is-active' : ''}`} aria-label={menuOpen ? 'Close Wayfinder companion menu' : 'Open Wayfinder companion menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
      <span className="wf-pet-aura" /><PetGlyph /><span className="wf-pet-status"><Sparkles size={10} /></span>
    </button>
    <button className="wf-pet-edge-hint" aria-label="Ask Wayfinder" title="Ask Wayfinder" onClick={onOpenChat}><MessageCircle size={14} /><ChevronRight size={12} /></button>
  </div>;
}
