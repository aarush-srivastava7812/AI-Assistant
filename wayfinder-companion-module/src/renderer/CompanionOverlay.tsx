import React, { useEffect } from 'react';
import { X, Command, Sparkles, ShieldCheck } from 'lucide-react';
import type { CompanionOverlayProps } from './contracts';
import './companion.css';

function EntrancePet() {
  return <div className="wf-entrance-pet" aria-hidden="true">
    <svg viewBox="0 0 100 100" className="wf-entrance-glyph">
      <defs><linearGradient id="wfEntranceShell" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3DE3F1"/><stop offset="1" stopColor="#4D78FF"/></linearGradient></defs>
      <path d="M22 32 L17 12 L39 24 Q50 19 61 24 L83 12 L78 34 Q86 45 82 62 Q76 82 50 84 Q24 82 18 62 Q14 45 22 32Z" fill="url(#wfEntranceShell)" stroke="#9AF4FA" strokeWidth="2"/>
      <path d="M27 43 Q50 33 73 43 L70 62 Q50 76 30 62Z" fill="#0B1424" stroke="#1B3652" strokeWidth="2"/>
      <ellipse cx="39" cy="52" rx="4.5" ry="6" fill="#BDFBFF"/><ellipse cx="61" cy="52" rx="4.5" ry="6" fill="#BDFBFF"/>
      <path d="M43 64 Q50 69 57 64" fill="none" stroke="#65E8ED" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
    <span className="wf-entrance-spark"><Sparkles size={16} /></span>
    <div className="wf-greeting-bubble">Hey, I'm here.</div>
  </div>;
}

export function CompanionOverlay({ onClose, chatContent, greeting = 'Ready when you are.' }: CompanionOverlayProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="wf-overlay-root" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="wf-overlay-backdrop" />
    <div className="wf-overlay-entrance"><EntrancePet /><div className="wf-entrance-caption"><span className="wf-eyebrow">WAYFINDER // COMPANION</span><strong>{greeting}</strong><small>Local workspace · existing assistant</small></div></div>
    <aside className="wf-chat-dock" role="dialog" aria-modal="true" aria-label="Wayfinder chat">
      <header className="wf-chat-dock-head">
        <div className="wf-chat-brand"><span className="wf-chat-brand-mark"><Sparkles size={18} /></span><div><strong>WAYFINDER</strong><span>DESKTOP COMPANION</span></div></div>
        <div className="wf-chat-head-right"><span className="wf-local-pill"><ShieldCheck size={12} />Existing workspace</span><button className="wf-close-button" onClick={onClose} aria-label="Close chat overlay"><X size={18} /></button></div>
      </header>
      <div className="wf-chat-context"><span><Command size={13} /> Global shortcut</span><span>Press Esc to close</span></div>
      <div className="wf-chat-content">{chatContent}</div>
      <footer className="wf-chat-dock-foot"><span>Uses your existing Wayfinder conversation and permissions.</span><button onClick={onClose}>Close overlay</button></footer>
    </aside>
  </div>;
}
